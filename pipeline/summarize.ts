// Resumo dos clusters do topo via Groq (Llama), atrás de uma interface trocável
// (Summarizer). Cache pela IDENTIDADE da história (URL do artigo-âncora, o mais
// antigo): a história mantém a chave mesmo ganhando novos membros, então um resumo
// já feito é reaproveitado entre runs e a cobertura de IA acumula. Resiliente: IA
// fora/cota esgotada → reusa o resumo antigo do cache; sem cache → descrição do
// RSS. O build nunca quebra por causa da IA.

import { createHash } from 'node:crypto';
import type { Article, Cluster, Summary, CachedSummary } from '../src/lib/types';
import { FALLBACK_CATEGORIA } from '../src/lib/categories';
import { namedEntities } from './cluster';
import { normalizeUrl } from './url';

// ── Interface trocável (plano B: Gemini, Claude Haiku, etc.) ──────────────────
export type SummarizeInput = {
  artigos: { source: string; title: string; description: string }[];
};

export interface Summarizer {
  summarize(input: SummarizeInput): Promise<Summary>;
}

// Artigo-âncora de um cluster: o MAIS ANTIGO (origem da história), com empate de
// data resolvido pela menor URL normalizada. Determinístico e estável enquanto o
// cluster se desenvolve. Display do site usa essa âncora pra ficar alinhado com o
// resumo cacheado (Bug #1: sources/imagem/link da semente NÃO batiam com o
// resumo, que é cacheado pela URL âncora).
export function clusterAnchor<T extends { articles: { url: string; publishedAt: string }[] }>(
  cluster: T,
): T['articles'][number] | undefined {
  return [...cluster.articles].sort((a, b) => {
    const ta = Date.parse(a.publishedAt) || Number.POSITIVE_INFINITY;
    const tb = Date.parse(b.publishedAt) || Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return normalizeUrl(a.url).localeCompare(normalizeUrl(b.url));
  })[0];
}

// Chave de cache = identidade da história: a URL normalizada do artigo-âncora.
// Estável enquanto a história ganha novos membros — o resumo já feito é
// reaproveitado entre runs em vez de re-resumir a cada coleta.
export function cacheKey(cluster: Pick<Cluster, 'articles'>): string {
  const anchor = clusterAnchor(cluster);
  const anchorUrl = anchor ? normalizeUrl(anchor.url) : '';
  return createHash('sha1').update(anchorUrl).digest('hex').slice(0, 16);
}

function toInput(cluster: Cluster): SummarizeInput {
  return {
    artigos: cluster.articles.map((a) => ({
      source: a.source,
      title: a.title,
      description: a.description,
    })),
  };
}

// Resumo provisório sem IA: pega o artigo com a descrição mais rica.
export function fallbackSummary(cluster: Cluster): Summary {
  const rep = [...cluster.articles].sort(
    (a, b) => (b.description?.length ?? 0) - (a.description?.length ?? 0),
  )[0];
  return {
    titulo: rep?.title ?? 'Sem título',
    resumo: rep?.description || rep?.title || '',
    porQueImporta: '',
    categoria: FALLBACK_CATEGORIA,
  };
}

function sanitize(s: Summary): Summary {
  const titulo = (s.titulo ?? '').trim();
  const resumo = (s.resumo ?? '').trim();
  if (!titulo || !resumo) throw new Error('resumo da IA incompleto');
  return {
    titulo,
    resumo,
    porQueImporta: (s.porQueImporta ?? '').trim(),
    categoria: (s.categoria ?? '').trim() || FALLBACK_CATEGORIA,
  };
}

// Bug #5: a IA às vezes cita datas literais incoerentes (ex: resumo diz
// "24 de março" enquanto a fonte é de 25 de maio). Detecta menções de mês em
// PT-BR no título/resumo/porQueImporta e compara com o mês de cluster.latestAt.
// Permite: mesmo mês, mês anterior (recent past), 1-2 meses no futuro (forecast).
// Flagga: 2+ meses no passado (datas históricas/erros de cópia).
const MONTHS_PT_NORM = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const;
const MONTH_TOKEN_RE = new RegExp(`\\b(${MONTHS_PT_NORM.join('|')})\\b`, 'g');
// diff = (pubMonth - mentionedMonth + 12) % 12. Allowed window:
//   0 = mesmo mês; 1 = mês anterior; 10–11 = 1–2 meses no futuro.
const ALLOWED_MONTH_DIFFS = new Set([0, 1, 10, 11]);

export function dateInconsistency(s: Summary, latestAt: string): boolean {
  const pubDate = new Date(latestAt);
  if (Number.isNaN(pubDate.getTime())) return false;
  const pubMonth = pubDate.getUTCMonth();
  const text = `${s.titulo} ${s.resumo} ${s.porQueImporta}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  for (const match of text.matchAll(MONTH_TOKEN_RE)) {
    const idx = MONTHS_PT_NORM.indexOf(match[1] as (typeof MONTHS_PT_NORM)[number]);
    if (idx === -1) continue;
    const diff = (pubMonth - idx + 12) % 12;
    if (!ALLOWED_MONTH_DIFFS.has(diff)) return true;
  }
  return false;
}

// Bug #3: detecta nomes próprios no título gerado que NÃO aparecem em nenhuma das
// fontes. A IA tem tendência a completar/inventar entidades (ex: "Flávio Marqueteiro"
// quando a fonte diz só "Flávio Bolsonaro"). A validação extrai entidades do título
// e exige que cada uma exista literalmente (após normalização) em pelo menos uma
// fonte. Retorna as alucinadas (ou [] se OK).
export function hallucinatedNames(title: string, articles: Article[]): string[] {
  const corpus = articles
    .map((a) => `${a.title} ${a.description}`)
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const out: string[] = [];
  for (const ent of namedEntities(title)) {
    // entidades já vêm normalizadas (lowercase, sem acento) do namedEntities.
    if (!corpus.includes(ent)) out.push(ent);
  }
  return out;
}

// ── Cliente Groq (API compatível com OpenAI) ─────────────────────────────────
const SYSTEM_INSTRUCTION = [
  'Você é um editor de um portal de DESASTRES E ACIDENTES (desastres naturais e causados',
  'pelo homem; acidentes de trânsito, aéreos, domésticos, industriais, etc.) que escreve',
  'resumos factuais e neutros em português do Brasil.',
  'Regras invioláveis:',
  '1. Escreva com SUAS palavras; nunca copie frases das fontes.',
  '2. Tom estritamente factual: sem opinião, juízo de valor ou adjetivação editorial.',
  '3. Não invente fatos, nomes ou números — use apenas o que está nas fontes.',
  '4. NOMES PRÓPRIOS são caso especial: use APENAS nomes que aparecem LITERALMENTE',
  '   em alguma fonte. NÃO complete sobrenomes (ex: se a fonte diz só "Flávio", não',
  '   escreva "Flávio Bolsonaro"). NÃO "corrija" grafias. NÃO invente apelidos nem',
  '   profissões ao lado do nome ("Flávio Marqueteiro"). Em dúvida, use pronome ou',
  '   descrição funcional: "o réu", "o suspeito", "o motorista", "o assessor", "a',
  '   vítima", "a empresa", "as autoridades".',
  '5. DATAS: cite datas APENAS se aparecerem EXPLICITAMENTE em alguma fonte E',
  '   forem coerentes com a data atual da matéria. Prefira referências relativas',
  '   ("hoje", "ontem", "esta semana", "no último final de semana"). NÃO invente',
  '   dia da semana. Se a data parecer antiga (>30 dias atrás) ou inconsistente,',
  '   OMITA — provavelmente é contexto histórico ou erro da fonte.',
  '6. Se houver incerteza ou divergência entre as fontes, sinalize isso.',
  '7. Português do Brasil, claro e direto.',
].join('\n');

function buildPrompt(input: SummarizeInput): string {
  const fontes = input.artigos
    .map((a, i) => `[${i + 1}] (${a.source}) ${a.title}\n${a.description}`)
    .join('\n\n');
  return [
    'A mesma notícia foi coberta pelas fontes abaixo. Produza UM resumo consolidado.',
    '',
    fontes,
    '',
    'Responda em JSON com:',
    '- "titulo": manchete limpa e neutra (sem ponto final);',
    '- "resumo": 2 a 4 frases originais sintetizando o fato;',
    '- "porQueImporta": 1 frase curta explicando a relevância;',
    '- "categoria": rótulo CURTO e específico do tipo de ocorrência, no singular e com',
    '  Inicial Maiúscula (ex.: "Enchente", "Deslizamento", "Incêndio florestal",',
    '  "Acidente de trânsito", "Acidente aéreo", "Naufrágio", "Explosão", "Seca",',
    '  "Tempestade"). Reaproveite rótulos comuns em vez de inventar variações. Se não',
    '  se encaixar em desastre/acidente, use "Geral".',
    '',
    'Responda APENAS com um único objeto JSON válido (as 4 chaves acima), sem nenhum',
    'texto antes ou depois e sem blocos de código markdown.',
  ].join('\n');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Extrai o status HTTP de um erro (a resposta da API traz .status; senão lê do texto).
export function errorStatus(err: unknown): number | null {
  const e = err as { status?: number; code?: number; message?: string };
  if (typeof e?.status === 'number') return e.status;
  if (typeof e?.code === 'number') return e.code;
  const m = String(e?.message ?? err);
  const match = m.match(/"code":\s*(\d+)/) ?? m.match(/\b(429|500|503)\b/);
  return match ? Number(match[1]) : null;
}

export function isQuotaError(err: unknown): boolean {
  return errorStatus(err) === 429;
}

// Transientes que vale a pena re-tentar (rate-limit momentâneo / sobrecarga).
const TRANSIENT = new Set([429, 500, 503]);
const RETRY_BACKOFF_MS = [5_000, 12_000];

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// Modelos da Groq com structured outputs ESTRITOS: o JSON é garantido pelo schema
// (constrained decoding) → o modelo não consegue devolver JSON inválido. Os demais
// caem no json_object (best-effort) + parse tolerante.
const STRICT_SCHEMA_MODELS = new Set(['openai/gpt-oss-20b', 'openai/gpt-oss-120b']);

const RESUMO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    titulo: { type: 'string' },
    resumo: { type: 'string' },
    porQueImporta: { type: 'string' },
    categoria: { type: 'string' },
  },
  required: ['titulo', 'resumo', 'porQueImporta', 'categoria'],
} as const;

// Parse tolerante: tira cercas markdown e recorta do 1º "{" ao último "}" antes do
// JSON.parse (cobre o caso de o modelo embrulhar o objeto em texto/```json).
export function parseJsonObject(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice);
}

export class GroqSummarizer implements Summarizer {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = process.env.GROQ_MODEL ?? 'openai/gpt-oss-20b') {
    this.apiKey = apiKey;
    this.model = model;
  }

  // Structured outputs estritos quando o modelo suporta; senão json_object.
  private responseFormat(): Record<string, unknown> {
    if (STRICT_SCHEMA_MODELS.has(this.model)) {
      return {
        type: 'json_schema',
        json_schema: { name: 'resumo', strict: true, schema: RESUMO_SCHEMA },
      };
    }
    return { type: 'json_object' };
  }

  async summarize(input: SummarizeInput): Promise<Summary> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.callOnce(input);
      } catch (err) {
        const status = errorStatus(err);
        if (status !== null && TRANSIENT.has(status) && attempt < RETRY_BACKOFF_MS.length) {
          await sleep(RETRY_BACKOFF_MS[attempt]!);
          continue;
        }
        throw err;
      }
    }
  }

  private async callOnce(input: SummarizeInput): Promise<Summary> {
    const body: Record<string, unknown> = {
      model: this.model,
      temperature: 0.3,
      // Folga p/ o JSON. Em modelos de reasoning (gpt-oss) os tokens de raciocínio
      // contam aqui; com max baixo o JSON era truncado → 400 "Failed to generate JSON".
      max_completion_tokens: 4096,
      response_format: this.responseFormat(),
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: buildPrompt(input) },
      ],
    };
    // Resumir não exige raciocínio pesado: 'low' reduz tokens de reasoning (mais
    // rápido e deixa espaço pro JSON). Só os gpt-oss aceitam este parâmetro.
    if (STRICT_SCHEMA_MODELS.has(this.model)) body.reasoning_effort = 'low';

    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // Propaga o status HTTP p/ a lógica de retry/disjuntor (429/500/503).
      throw Object.assign(new Error(`Groq ${res.status}: ${body.slice(0, 200)}`), {
        status: res.status,
      });
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('resposta vazia da IA');
    return parseJsonObject(text) as Summary;
  }
}

// Cria o resumidor a partir do ambiente. Sem GROQ_API_KEY → null (usa fallback).
export function summarizerFromEnv(): Summarizer | null {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    console.warn('GROQ_API_KEY ausente — resumos via fallback (descrição do RSS).');
    return null;
  }
  return new GroqSummarizer(apiKey);
}

// ── Orquestração: cache + IA + fallback ───────────────────────────────────────
export type SummarizeStats = {
  fromCache: number; // resumo de IA fresco reaproveitado (dentro do TTL)
  generated: number; // resumo novo gerado pela IA neste run
  staleCache: number; // IA fora → reusou resumo de IA antigo (TTL vencido) em vez de RSS
  fallback: number; // sem IA e sem cache → descrição crua do RSS
};

export type SummarizeResult = {
  summaries: Map<string, Summary>; // clusterId → resumo
  cache: Record<string, CachedSummary>; // cache atualizado (p/ state.json)
  stats: SummarizeStats;
};

// Espaçamento entre chamadas à IA p/ respeitar o RPM do free tier da Groq
// (~30 req/min → 2500ms ≈ 24/min, com margem).
const THROTTLE_MS = Number(process.env.GROQ_THROTTLE_MS ?? 2500);
// Após N falhas de quota (429) seguidas, desiste da IA no resto do run (fallback
// rápido) — evita um run eterno quando a cota do dia acabou.
const QUOTA_BREAKER = 4;
// Quantos resumos NOVOS de IA por run (cache hits não contam). Acima disso, os
// clusters restantes caem em fallback/reuso. Protege o TPD (tokens-per-day) do free
// tier da Groq: com cache pequeno, sem teto o run consumia ~12 chamadas e estourava
// o orçamento diário no meio do dia. Como `pool` já vem ranqueado por score, o
// orçamento gasta a IA nas histórias mais importantes. Conforme o cache amadurece,
// o teto vira inerte (a maioria das histórias resolve por cache).
const IA_BUDGET_PER_RUN = Number(process.env.GROQ_BUDGET_PER_RUN ?? 8);
// Idade máxima de um resumo cacheado p/ servir SEM re-chamar a IA. Dentro do TTL,
// a história é um cache hit; vencido, tenta refrescar (cota permitindo) e, se a IA
// estiver fora, reusa o resumo antigo mesmo assim (melhor que RSS cru).
const TTL_HOURS = Number(process.env.SUMMARY_TTL_HOURS ?? 24);
const hoursSince = (iso: string, now: Date) => (now.getTime() - Date.parse(iso)) / 3_600_000;

export async function summarizeClusters(
  clusters: Cluster[],
  summarizer: Summarizer | null,
  cache: Record<string, CachedSummary>,
  now: Date = new Date(),
  throttleMs: number = THROTTLE_MS,
): Promise<SummarizeResult> {
  const summaries = new Map<string, Summary>();
  const nextCache: Record<string, CachedSummary> = { ...cache };
  const stats: SummarizeStats = { fromCache: 0, generated: 0, staleCache: 0, fallback: 0 };

  let iaCalls = 0;
  let quotaFails = 0;
  let breakerOpen = false;
  let budgetLogged = false;

  for (const cluster of clusters) {
    const key = cacheKey(cluster);
    const rawCached = nextCache[key];
    // Bug #3: aceita o cache só se o título não contém entidades alucinadas
    // (nomes que não estão em nenhuma fonte do cluster atual). Cache de runs
    // anteriores ao fix do prompt pode trazer títulos ruins (ex: "Flávio
    // Marqueteiro" quando o original diz "Flávio Bolsonaro") — invalida e
    // tenta a IA de novo. Como cacheKey é estável pela URL âncora, a âncora
    // está sempre no cluster atual, então a validação é segura.
    let cached: CachedSummary | undefined = rawCached;
    if (rawCached) {
      const halls = hallucinatedNames(rawCached.titulo, cluster.articles);
      if (halls.length > 0) {
        console.warn(`  ⚠ cache invalidado por alucinação (${cluster.id}): ${halls.join(', ')}`);
        cached = undefined;
      } else if (dateInconsistency(rawCached, cluster.latestAt)) {
        console.warn(`  ⚠ cache invalidado por data inconsistente (${cluster.id})`);
        cached = undefined;
      }
    }

    // Cache hit fresco (dentro do TTL): reusa sem chamar a IA.
    if (cached && hoursSince(cached.cachedAt, now) <= TTL_HOURS) {
      const { cachedAt: _cachedAt, ...summary } = cached;
      summaries.set(cluster.id, summary);
      stats.fromCache++;
      continue;
    }

    // Sem cache fresco: tenta a IA (refresca o resumo vencido ou cria um novo).
    if (summarizer && !breakerOpen) {
      if (iaCalls >= IA_BUDGET_PER_RUN) {
        if (!budgetLogged) {
          console.warn(
            `  orçamento de IA do run esgotado (${IA_BUDGET_PER_RUN} chamadas) — fallback/reuso no restante.`,
          );
          budgetLogged = true;
        }
      } else {
        if (iaCalls > 0 && throttleMs > 0) await sleep(throttleMs);
        iaCalls++;
        try {
          const summary = sanitize(await summarizer.summarize(toInput(cluster)));
          // Bug #3 + #5: rejeita o output fresco se introduziu nome inventado
          // ou citou data fora da janela coerente. Cai pro caminho de
          // fallback/stale-cache abaixo, sem cachear.
          const halls = hallucinatedNames(summary.titulo, cluster.articles);
          if (halls.length > 0) {
            console.warn(
              `  ⚠ título com alucinação rejeitado (${cluster.id}): ${halls.join(', ')} — fallback`,
            );
          } else if (dateInconsistency(summary, cluster.latestAt)) {
            console.warn(`  ⚠ data inconsistente no resumo rejeitada (${cluster.id}) — fallback`);
          } else {
            summaries.set(cluster.id, summary);
            nextCache[key] = { ...summary, cachedAt: now.toISOString() };
            stats.generated++;
            quotaFails = 0;
            continue;
          }
        } catch (err) {
          if (isQuotaError(err)) {
            quotaFails++;
            if (quotaFails >= QUOTA_BREAKER) {
              breakerOpen = true;
              console.warn('  quota da IA esgotada — usando fallback no restante deste run.');
            }
          }
          console.warn(`  resumo IA falhou (${cluster.id}): ${String(err).slice(0, 100)} — fallback`);
        }
      }
    }

    // IA fora e existe um resumo antigo VÁLIDO (TTL vencido, sem alucinação):
    // reusa em vez de regredir pra descrição crua do RSS. cachedAt fica como
    // está, então o próximo run tenta refrescá-lo de novo. Cache com alucinação
    // já foi limpo acima (cached === undefined nesse caso).
    if (cached) {
      const { cachedAt: _cachedAt, ...summary } = cached;
      summaries.set(cluster.id, summary);
      stats.staleCache++;
      continue;
    }

    // Nada em cache (ou cache invalidado): fallback. NÃO é cacheado — o próximo
    // run tenta a IA de novo.
    summaries.set(cluster.id, fallbackSummary(cluster));
    stats.fallback++;
  }

  return { summaries, cache: nextCache, stats };
}
