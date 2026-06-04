// "Panorama do dia": peça editorial ORIGINAL gerada automaticamente pela IA a
// partir das notícias JÁ resumidas e validadas da edição. Não republica fonte —
// sintetiza os padrões do dia (tipos de ocorrência predominantes, recorrências) em
// uma análise sóbria e factual. 1 por dia (dedup pela data da edição + janela
// horária), gravada em data/editorial/<date>.json e arquivada.
//
// Roda DENTRO do pipeline principal (antes do build, pois a página é estática),
// como passo best-effort: se a IA falhar, nada é gravado e a próxima run re-tenta.
// Reusa a infra de IA do summarize.ts (Groq → Cerebras), com as MESMAS salvaguardas
// anti-alucinação: a análise só pode citar entidades presentes no material da edição.
//
// Envs (variables do repo, não secrets):
//   EDITORIAL_GEN_HOUR_UTC  janela mínima de geração (default 11 ≈ 08h BRT)
//   EDITORIAL_MAX_STORIES   nº de histórias da edição alimentadas à IA (default 10)
//   EDITORIAL_DESTAQUES     nº de links internos exibidos na peça (default 6)
//   EDITORIAL_FORCE=1       ignora janela + dedup (geração manual)
//   EDITORIAL_DRY_RUN=1     compõe e loga, NÃO grava (teste; dispensa chave de IA)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Edition, Editorial, EditorialRef, Story } from '../src/lib/types';
import { GENERIC } from '../src/lib/generic-terms';
import { namedEntities } from './cluster';
import {
  dateInconsistency,
  isQuotaError,
  providersFromEnv,
  type OpenAICompatSummarizer,
} from './summarize';

// ── Saída crua da IA (antes da validação/montagem) ────────────────────────────
type RawEditorial = {
  titulo?: string;
  linhaFina?: string;
  paragrafos?: unknown;
};

// Schema enxuto (sem min/max — o modo estrito do gpt-oss não aceita esses
// keywords; as contagens são validadas em código).
export const EDITORIAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    titulo: { type: 'string' },
    linhaFina: { type: 'string' },
    paragrafos: { type: 'array', items: { type: 'string' } },
  },
  required: ['titulo', 'linhaFina', 'paragrafos'],
} as const;

const slugOf = (s: Story): string => s.slug ?? s.clusterId;

// ── Prompt ─────────────────────────────────────────────────────────────────────
const SYSTEM_INSTRUCTION = [
  'Você é o editor-chefe de um portal de DESASTRES E ACIDENTES (desastres naturais e',
  'causados pelo homem; acidentes de trânsito, aéreos, domésticos, industriais, etc.).',
  'Sua tarefa é escrever o PANORAMA DO DIA: uma análise curta e original que conecta as',
  'principais ocorrências da edição, em português do Brasil.',
  'Regras invioláveis:',
  '1. Use APENAS o material fornecido. NÃO introduza nenhum nome próprio, número,',
  '   estatística, local ou data que não esteja explicitamente nas notícias dadas.',
  '2. Fale em termos AGREGADOS e de PADRÃO ("os acidentes de trânsito concentraram a',
  '   maior parte dos registros", "duas ocorrências de enchente"). NÃO repita cada',
  '   notícia uma a uma — sintetize o conjunto.',
  '3. Tom analítico, sóbrio e estritamente factual: sem alarmismo, sem opinião',
  '   política, sem juízo de valor, sem conselhos médicos/jurídicos.',
  '4. Escreva com SUAS palavras; nunca copie frases das fontes.',
  '5. Se quiser citar nomes próprios, use SOMENTE os que aparecem no material; na',
  '   dúvida, prefira descrições funcionais ("as autoridades", "a região afetada").',
  '6. NÃO invente datas nem dias da semana. Prefira referências relativas ("nesta',
  '   edição", "hoje", "ao longo do dia").',
].join('\n');

// Distribuição de categorias da edição (rótulo + volume), texto p/ ancorar o
// "quem dominou o dia" sem o modelo precisar contar nada.
export function categoriaDistribution(edition: Edition): string {
  return edition.categorias
    .map((c) => `${c.label} (${c.stories.length})`)
    .join(', ');
}

export function buildEditorialPrompt(stories: Story[], edition: Edition): string {
  const fontes = stories
    .map((s, i) => {
      const cat = s.categoria?.trim() || 'Geral';
      const pq = s.porQueImporta?.trim() ? ` Por que importa: ${s.porQueImporta.trim()}` : '';
      return `[${i + 1}] (${cat}) ${s.titulo}\n${s.resumo}${pq}`;
    })
    .join('\n\n');
  return [
    `Edição de ${edition.date}. Distribuição por categoria: ${categoriaDistribution(edition)}.`,
    '',
    'Notícias da edição (já resumidas):',
    '',
    fontes,
    '',
    'Escreva o panorama do dia. Responda em JSON com:',
    '- "titulo": manchete analítica e neutra do conjunto (sem ponto final, sem aspas);',
    '- "linhaFina": 1 frase-resumo (o "dek") do que a análise mostra;',
    '- "paragrafos": array de 3 a 4 parágrafos originais (cada um com 2 a 4 frases)',
    '  conectando os padrões do dia. NÃO use markdown nem listas dentro dos parágrafos.',
    '',
    'Responda APENAS com um único objeto JSON válido (as 3 chaves acima), sem texto',
    'antes ou depois e sem blocos de código markdown.',
  ].join('\n');
}

// ── Validação ────────────────────────────────────────────────────────────────
const TITULO_MIN = 12;
const LINHA_FINA_MIN = 15;
const PARAGRAFO_MIN = 40;
const PARAGRAFOS_MIN = 2;
const PARAGRAFOS_MAX = 6;

// Corpus normalizado (lowercase, sem acento) do material da edição alimentado à IA.
// Base da guarda anti-alucinação: toda entidade citada na peça precisa existir aqui.
export function editorialCorpus(stories: Story[]): string {
  return stories
    .map((s) => `${s.titulo} ${s.resumo} ${s.porQueImporta} ${s.categoria} ${s.sources.map((x) => x.name).join(' ')}`)
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Qualificadores administrativos/institucionais comuns na prosa do nicho ("Defesa
// Civil", "Polícia Federal", "Corpo de Bombeiros", "Guarda Municipal"…). NÃO entram
// na GENERIC compartilhada de propósito: lá eles bloqueariam páginas-tema legítimas
// (ex.: /tema/prf). Aqui servem só pra trava do editorial não confundir referência
// institucional genérica com nome próprio inventado.
const EDITORIAL_GENERIC = new Set([
  'civil', 'militar', 'federal', 'estadual', 'municipal', 'nacional', 'regional',
  'defesa', 'corpo', 'guarda', 'rodoviaria', 'rodoviario', 'marinha', 'aeronautica',
  'exercito', 'forcas', 'seguranca', 'publica', 'publico', 'saude', 'transito',
  'transportes', 'infraestrutura', 'meteorologia', 'meteorologico', 'protecao',
]);

// Entidades nomeadas citadas na peça que NÃO aparecem no corpus da edição (mesma
// heurística do Bug #3 do resumo, aplicada ao título + cada parágrafo). [] = OK.
// Termos GENÉRICOS (palavras comuns capitalizadas — "País", "Região", "Governo",
// gentílicos, dias/meses…) e qualificadores institucionais são ignorados: num texto
// analítico mais longo eles aparecem naturalmente e NÃO são invenção de fato. Sem
// esse filtro a trava rejeitava quase toda peça (o resumo, por ser curto, não
// esbarrava nisso). O que sobra são nomes próprios de fato ausentes do material.
export function editorialHallucinations(titulo: string, paragrafos: string[], corpus: string): string[] {
  const out = new Set<string>();
  for (const text of [titulo, ...paragrafos]) {
    for (const ent of namedEntities(text)) {
      if (!corpus.includes(ent) && !GENERIC.has(ent) && !EDITORIAL_GENERIC.has(ent)) out.add(ent);
    }
  }
  return [...out];
}

export type EditorialValidation =
  | { ok: true; titulo: string; linhaFina: string; paragrafos: string[] }
  | { ok: false; reason: string };

// Valida o output cru da IA: campos presentes/com tamanho mínimo, contagem de
// parágrafos, sem entidades alucinadas e sem datas incoerentes.
export function validateEditorial(raw: RawEditorial, stories: Story[], now: Date): EditorialValidation {
  const titulo = (raw.titulo ?? '').trim();
  const linhaFina = (raw.linhaFina ?? '').trim();
  const paragrafos = Array.isArray(raw.paragrafos)
    ? raw.paragrafos.map((p) => String(p ?? '').trim()).filter((p) => p.length >= PARAGRAFO_MIN)
    : [];

  if (titulo.length < TITULO_MIN) return { ok: false, reason: `título curto/ausente (${titulo.length})` };
  if (linhaFina.length < LINHA_FINA_MIN) return { ok: false, reason: `linha-fina curta/ausente (${linhaFina.length})` };
  if (paragrafos.length < PARAGRAFOS_MIN) return { ok: false, reason: `poucos parágrafos (${paragrafos.length})` };
  const trimmed = paragrafos.slice(0, PARAGRAFOS_MAX);

  const corpus = editorialCorpus(stories);
  const halls = editorialHallucinations(titulo, trimmed, corpus);
  if (halls.length > 0) return { ok: false, reason: `entidades fora do material: ${halls.join(', ')}` };

  // Reusa a guarda de datas do resumo: junta o texto e compara meses citados com
  // "agora" (a edição é do dia). Pega cópia de datas históricas/inventadas.
  if (dateInconsistency({ titulo, resumo: trimmed.join(' '), porQueImporta: linhaFina, categoria: '' }, now.toISOString())) {
    return { ok: false, reason: 'data inconsistente na análise' };
  }

  return { ok: true, titulo, linhaFina, paragrafos: trimmed };
}

// Notícias citadas (links internos): os primeiros N destaques da edição.
export function composeDestaques(stories: Story[], limit: number): EditorialRef[] {
  return stories.slice(0, limit).map((s) => ({
    slug: slugOf(s),
    titulo: s.titulo,
    categoria: s.categoria?.trim() || 'Geral',
  }));
}

// ── Geração (chamada à IA com fallback de provedor) ───────────────────────────
const MAX_TOKENS = 6000; // folga p/ ~4 parágrafos + tokens de reasoning (gpt-oss)
const TEMPERATURE = 0.4; // um pouco acima do resumo: prosa menos robótica, ainda sóbria

// Gera (e valida) a peça a partir da edição. `providers` na ordem de preferência;
// em 429/erro, cai pro próximo. Retorna null se a IA falhar ou a validação reprovar
// (nesse caso nada é gravado — melhor não ter editorial do que ter um ruim).
// `diag` (opcional) recebe uma linha por provedor com o resultado, p/ o status file.
export async function generateEditorial(
  edition: Edition,
  providers: OpenAICompatSummarizer[],
  now: Date,
  maxStories: number,
  destaquesLimit: number,
  diag: string[] = [],
): Promise<Editorial | null> {
  const stories = edition.home.slice(0, Math.max(1, maxStories));
  if (stories.length === 0) {
    diag.push('edição sem histórias');
    return null;
  }

  const prompt = buildEditorialPrompt(stories, edition);
  for (const p of providers) {
    try {
      const raw = await p.completeJson<RawEditorial>(SYSTEM_INSTRUCTION, prompt, {
        schema: EDITORIAL_SCHEMA,
        schemaName: 'editorial',
        maxTokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      });
      const v = validateEditorial(raw, stories, now);
      if (!v.ok) {
        console.warn(`  ⚠ editorial reprovado (${p.label}): ${v.reason}`);
        diag.push(`${p.label}: reprovado — ${v.reason}`);
        continue; // tenta o próximo provedor (pode ser um lapso do modelo)
      }
      diag.push(`${p.label}: ok`);
      return {
        date: edition.date,
        generatedAt: now.toISOString(),
        titulo: v.titulo,
        linhaFina: v.linhaFina,
        paragrafos: v.paragrafos,
        destaques: composeDestaques(stories, destaquesLimit),
      };
    } catch (err) {
      const tag = isQuotaError(err) ? 'sem cota (429)' : String(err).slice(0, 120);
      console.warn(`  editorial: provedor ${p.label} falhou (${tag}) — próximo.`);
      diag.push(`${p.label}: erro — ${tag}`);
    }
  }
  return null;
}

// ── Gate (1/dia + janela) ──────────────────────────────────────────────────────
export function decideGenerate(opts: {
  exists: boolean;
  hourUtc: number;
  genHour: number;
  force: boolean;
}): { generate: boolean; reason: string } {
  const { exists, hourUtc, genHour, force } = opts;
  if (force) return { generate: true, reason: 'forçado (EDITORIAL_FORCE/DRY_RUN)' };
  if (exists) return { generate: false, reason: 'editorial do dia já existe' };
  if (hourUtc < genHour) return { generate: false, reason: `fora da janela (${hourUtc}h < ${genHour}h UTC)` };
  return { generate: true, reason: 'janela ok + sem editorial hoje' };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

// Status da última tentativa (observabilidade): gravado SEMPRE, fora do dir
// data/editorial/ (p/ o glob *.json do site não tratá-lo como peça). Diz por que
// um dia teve ou não teve editorial — diagnóstico sem precisar do log do Actions.
type EditorialStatus = {
  ranAt: string;
  editionDate: string;
  hourUtc: number;
  outcome: 'generated' | 'skipped' | 'no-providers' | 'not-generated';
  reason: string;
  providers: string[];
  attempts: string[];
};

async function writeStatus(dataDir: string, status: EditorialStatus): Promise<void> {
  await writeFile(join(dataDir, 'editorial-status.json'), JSON.stringify(status, null, 2) + '\n');
}

// Ponto de entrada chamado pelo pipeline (best-effort, nunca derruba a run).
export async function maybeWriteEditorial(edition: Edition, dataDir: string, now: Date): Promise<void> {
  const dir = join(dataDir, 'editorial');
  const path = join(dir, `${edition.date}.json`);
  const dryRun = !!process.env.EDITORIAL_DRY_RUN;
  const force = !!process.env.EDITORIAL_FORCE || dryRun;
  const genHour = Number(process.env.EDITORIAL_GEN_HOUR_UTC ?? 11);
  const maxStories = Number(process.env.EDITORIAL_MAX_STORIES ?? 10);
  const destaques = Number(process.env.EDITORIAL_DESTAQUES ?? 6);
  const hourUtc = now.getUTCHours();
  const base = { ranAt: now.toISOString(), editionDate: edition.date, hourUtc };

  const decision = decideGenerate({ exists: await fileExists(path), hourUtc, genHour, force });
  if (!decision.generate) {
    console.log(`[editorial] ${decision.reason} — pulando.`);
    // Não sobrescreve o status quando o editorial do dia JÁ existe (preserva o
    // "generated" da run que o criou); só registra skips por janela/força.
    if (!decision.reason.includes('já existe')) {
      await writeStatus(dataDir, { ...base, outcome: 'skipped', reason: decision.reason, providers: [], attempts: [] });
    }
    return;
  }

  const providers = providersFromEnv();
  if (providers.length === 0) {
    console.log('[editorial] sem chave de IA — pulando.');
    await writeStatus(dataDir, { ...base, outcome: 'no-providers', reason: 'sem GROQ/CEREBRAS', providers: [], attempts: [] });
    return;
  }
  const providerLabels = providers.map((p) => p.label);

  const attempts: string[] = [];
  const editorial = await generateEditorial(edition, providers, now, maxStories, destaques, attempts);
  if (!editorial) {
    console.warn('[editorial] não gerado (IA fora ou validação reprovou) — re-tenta no próximo run.');
    await writeStatus(dataDir, {
      ...base,
      outcome: 'not-generated',
      reason: 'IA fora ou validação reprovou',
      providers: providerLabels,
      attempts,
    });
    return;
  }

  if (dryRun) {
    console.log(`[editorial DRY RUN] ${editorial.titulo}\n${editorial.linhaFina}\n\n${editorial.paragrafos.join('\n\n')}`);
    return;
  }

  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(editorial, null, 2) + '\n');
  await writeStatus(dataDir, {
    ...base,
    outcome: 'generated',
    reason: `"${editorial.titulo}" (${editorial.paragrafos.length} parágrafos)`,
    providers: providerLabels,
    attempts,
  });
  console.log(`[editorial] gravado: ${edition.date} — "${editorial.titulo}" (${editorial.paragrafos.length} parágrafos)`);
}
