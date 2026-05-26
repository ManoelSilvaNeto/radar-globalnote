// Agrupa artigos que contam a mesma história, por similaridade léxica:
// bag-of-words ponderado (título conta mais) + cosseno acima de um limiar.
// Sem API de embeddings: custo zero. Greedy de uma passada, com os artigos
// mais recentes virando sementes dos clusters.

import { createHash } from 'node:crypto';
import type { Article, Cluster } from '../src/lib/types';

export const DEFAULT_THRESHOLD = 0.30; // cosseno mínimo p/ juntar (subiu de 0.22 em 2026-05-26 — Bug #1)
export const DEFAULT_WINDOW_HOURS = 48;
const TITLE_WEIGHT = 3; // título conta mais que a descrição

// Cosseno acima deste valor é forte o bastante pra ignorar a guarda de entidades.
// Abaixo, e se ambos os lados tiverem entidades nomeadas, exigimos overlap.
// Solta a regra quando algum lado é genérico (sem entidades) — clustering só por
// texto é OK aí; o risco de mistura cross-event é menor.
const HIGH_COSINE = 0.50;

// Stopwords PT-BR (pronomes, preposições, artigos, verbos auxiliares comuns).
const STOPWORDS = new Set(
  ('a o e de da do das dos em no na nos nas um uma uns umas para por com sem sob ' +
    'que se ao aos as os como mais menos muito pouco ja nao sim ou mas porem entao ' +
    'sua seu suas seus meu minha nossa nosso este esta isso isto esse essa aquilo ' +
    'ele ela eles elas voce vocês nos eu tu teu apos ate entre desde sobre cada ' +
    'foi sao ser sera tem tinha havia estao esta estava pelo pela pelos pelas ' +
    'dia ano anos hoje ontem apos contra durante segundo ainda apenas tambem ' +
    'quando onde quem qual quais cujo cuja toda todo todos todas outro outra').split(
    /\s+/,
  ),
);

// Normaliza texto PT em tokens: minúsculas, sem acento, sem pontuação, sem stopword.
export function normalizePt(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

// Entidades nomeadas do título — usadas como guarda contra agrupamento espúrio
// (Bug #1: notícias de eventos diferentes acabavam no mesmo cluster por overlap
// léxico ralo, e o resumo cacheado pela URL âncora ficava desencontrado das fontes
// visíveis). A heurística: pula a primeira palavra (quase sempre capitalizada por
// estar no início), e mantém o resto se for sigla/abrev (`MG`, `BR-251`, `PRF`) ou
// capitalizada com 4+ caracteres (`Bélgica`, `Polícia`, `Civil`, `Pantanal`).
// Resultado é normalizado (lowercase, sem acento) pra comparação.
export function namedEntities(title: string): Set<string> {
  const out = new Set<string>();
  const tokens = title.replace(/[.,;:!?()"“”]+/g, '').split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    if (i === 0) continue; // 1ª palavra: capitalização ambígua (início de frase)
    const t = tokens[i];
    const isAbbrev = /^[A-ZÀ-Ý][A-Z0-9À-Ý\-]+$/.test(t);
    const isProperLong = /^[A-ZÀ-Ý]/.test(t) && t.length >= 4;
    if (!isAbbrev && !isProperLong) continue;
    out.add(t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
  }
  return out;
}

function intersects<T>(a: Set<T>, b: Set<T>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

type Vec = Map<string, number>;

function termFreq(article: Article): Vec {
  const tf: Vec = new Map();
  const add = (tokens: string[], weight: number) => {
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + weight);
  };
  add(normalizePt(article.title), TITLE_WEIGHT);
  add(normalizePt(article.description), 1);
  return tf;
}

function cosine(a: Vec, b: Vec): number {
  // itera o menor mapa
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, w] of small) {
    const o = large.get(term);
    if (o) dot += w * o;
  }
  if (dot === 0) return 0;
  let na = 0;
  for (const w of a.values()) na += w * w;
  let nb = 0;
  for (const w of b.values()) nb += w * w;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function addInto(target: Vec, src: Vec): void {
  for (const [term, w] of src) target.set(term, (target.get(term) ?? 0) + w);
}

function clusterId(articles: Article[]): string {
  const ids = articles.map((a) => a.id).sort();
  return createHash('sha1').update(ids.join('|')).digest('hex').slice(0, 16);
}

type Group = { sum: Vec; vecs: Vec[]; members: Article[] };

export type ClusterOptions = {
  threshold?: number;
  windowHours?: number;
  now?: Date;
};

// Agrupa os artigos. Considera só a janela recente; ordena por recência pra que
// o artigo mais novo seja a semente do cluster.
export function clusterArticles(articles: Article[], opts: ClusterOptions = {}): Cluster[] {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const windowHours = opts.windowHours ?? DEFAULT_WINDOW_HOURS;
  const now = opts.now ?? new Date();
  const cutoff = now.getTime() - windowHours * 3600_000;

  const recent = articles
    .filter((a) => {
      const t = new Date(a.publishedAt).getTime();
      return Number.isFinite(t) && t >= cutoff && t <= now.getTime() + 3600_000;
    })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const groups: Group[] = [];
  for (const article of recent) {
    const vec = termFreq(article);
    if (vec.size === 0) continue;
    let best: Group | null = null;
    let bestSim = threshold;
    for (const g of groups) {
      const sim = cosine(vec, g.sum);
      if (sim >= bestSim) {
        bestSim = sim;
        best = g;
      }
    }
    // Guarda contra agrupamento espúrio: se ambos os lados têm entidades nomeadas
    // e elas não se intersectam, exige cosseno alto (>= HIGH_COSINE) pra mesclar.
    // Justificativa: cosseno moderado + entidades disjuntas = histórias diferentes
    // que só compartilham vocabulário genérico ("acidente", "morre", "ônibus").
    if (best && bestSim < HIGH_COSINE) {
      const articleEnts = namedEntities(article.title);
      const groupEnts = new Set<string>();
      for (const m of best.members) for (const e of namedEntities(m.title)) groupEnts.add(e);
      if (articleEnts.size > 0 && groupEnts.size > 0 && !intersects(articleEnts, groupEnts)) {
        best = null;
      }
    }
    if (best) {
      best.members.push(article);
      best.vecs.push(vec);
      addInto(best.sum, vec);
    } else {
      groups.push({ sum: new Map(vec), vecs: [vec], members: [article] });
    }
  }

  return groups.map((g) => {
    const latestAt = g.members
      .map((a) => a.publishedAt)
      .reduce((max, d) => (d > max ? d : max), g.members[0]!.publishedAt);
    const sourceCount = new Set(g.members.map((a) => a.source)).size;
    return {
      id: clusterId(g.members),
      articles: g.members,
      latestAt,
      sourceCount,
    } satisfies Cluster;
  });
}
