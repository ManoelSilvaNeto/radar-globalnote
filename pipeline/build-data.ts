// Monta os JSON do site a partir dos clusters rankeados + resumos, e cuida da
// persistência: data/current.json (edição atual), data/edicoes/<data>.json
// (snapshot do dia) e data/state.json (cache de resumos da janela recente).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Cluster, Edition, CategoriaSecao, State, Story, Summary, CachedSummary } from '../src/lib/types';
import { categoriaSlug, FALLBACK_CATEGORIA } from '../src/lib/categories';
import { HOME_SIZE } from './rank';
import { cacheKey, clusterAnchor, fallbackSummary } from './summarize';

const CACHE_WINDOW_HOURS = 72;

// Data da edição no fuso de Brasília (en-CA formata como AAAA-MM-DD).
export function brDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// Fontes da história: uma entrada por fonte distinta. ÂNCORA primeiro (o artigo
// mais antigo do cluster — o mesmo que define `cacheKey` e portanto o resumo),
// depois o resto na ordem dos artigos. Isso garante que `sources[0]`, a imagem e
// o link no card batem com o resumo cacheado, evitando o desalinho do Bug #1.
function storySources(cluster: Cluster): { name: string; url: string }[] {
  const anchor = clusterAnchor(cluster);
  const ordered = anchor ? [anchor, ...cluster.articles.filter((a) => a !== anchor)] : cluster.articles;
  const seen = new Set<string>();
  const out: { name: string; url: string }[] = [];
  for (const a of ordered) {
    if (seen.has(a.source)) continue;
    seen.add(a.source);
    out.push({ name: a.source, url: a.url });
  }
  return out;
}

export function toStory(cluster: Cluster, summary: Summary): Story {
  const categoria = summary.categoria?.trim() || FALLBACK_CATEGORIA;
  const story: Story = {
    clusterId: cluster.id,
    slug: cacheKey(cluster), // estável entre runs (hash do artigo-âncora) → URL fixa
    titulo: summary.titulo,
    resumo: summary.resumo,
    porQueImporta: summary.porQueImporta,
    categoria,
    categoriaSlug: categoriaSlug(categoria),
    sources: storySources(cluster),
    updatedAt: cluster.latestAt,
  };
  // Imagem: prefere a da âncora (alinhamento com o resumo cacheado); se a âncora
  // não tem imagem, cai pra qualquer outro artigo que tenha.
  const anchor = clusterAnchor(cluster);
  const imageUrl = anchor?.imageUrl ?? cluster.articles.find((a) => a.imageUrl)?.imageUrl;
  if (imageUrl) story.imageUrl = imageUrl;
  return story;
}

// Agrupa as histórias do pool em seções de categoria DINÂMICAS (só as presentes),
// ordenadas por volume. A ordem de ranking é preservada dentro de cada seção.
export function groupByCategoria(stories: Story[]): CategoriaSecao[] {
  const bySlug = new Map<string, CategoriaSecao>();
  for (const s of stories) {
    const sec = bySlug.get(s.categoriaSlug);
    if (sec) sec.stories.push(s);
    else bySlug.set(s.categoriaSlug, { slug: s.categoriaSlug, label: s.categoria, stories: [s] });
  }
  return [...bySlug.values()].sort((a, b) => b.stories.length - a.stories.length);
}

// Se o destaque do home (stories[0]) não tem imagem mas algum dos próximos N
// tem, promove o primeiro com imagem para o topo. O destaque tem foto grande
// no card e fica visualmente fraco sem ela; perder 1 posição de ranking entre
// o top-10 é um trade-off pequeno comparado ao impacto visual da home.
export function promoteImagedToFeatured(stories: Story[]): Story[] {
  if (stories.length === 0 || stories[0]!.imageUrl) return stories;
  const idx = stories.findIndex((s) => s.imageUrl);
  if (idx <= 0) return stories;
  const out = [...stories];
  const [imaged] = out.splice(idx, 1);
  out.unshift(imaged!);
  return out;
}

// Monta a edição a partir do pool de clusters rankeados (já em ordem de score).
// home = os primeiros (com destaque promovido se necessário); categorias = todo o pool.
export function buildEdition(pool: Cluster[], summaries: Map<string, Summary>, now: Date): Edition {
  const stories = pool.map((c) => toStory(c, summaries.get(c.id) ?? fallbackSummary(c)));
  const home = promoteImagedToFeatured(stories.slice(0, HOME_SIZE));
  return {
    date: brDate(now),
    generatedAt: now.toISOString(),
    home,
    categorias: groupByCategoria(stories),
  };
}

// Remove do cache os resumos mais velhos que a janela (poda o state.json).
export function pruneCache(cache: Record<string, CachedSummary>, now: Date): Record<string, CachedSummary> {
  const cutoff = now.getTime() - CACHE_WINDOW_HOURS * 3600_000;
  const out: Record<string, CachedSummary> = {};
  for (const [key, summary] of Object.entries(cache)) {
    const t = new Date(summary.cachedAt).getTime();
    if (Number.isFinite(t) && t >= cutoff) out[key] = summary;
  }
  return out;
}

// ── Persistência ──────────────────────────────────────────────────────────────
const PRETTY = 2;

export async function readState(dataDir: string): Promise<State> {
  try {
    const raw = await readFile(join(dataDir, 'state.json'), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<State>;
    return { updatedAt: parsed.updatedAt ?? '', summaries: parsed.summaries ?? {} };
  } catch {
    return { updatedAt: '', summaries: {} };
  }
}

export async function writeData(edition: Edition, state: State, dataDir: string): Promise<void> {
  await mkdir(join(dataDir, 'edicoes'), { recursive: true });
  await writeFile(join(dataDir, 'current.json'), JSON.stringify(edition, null, PRETTY) + '\n');
  await writeFile(join(dataDir, 'edicoes', `${edition.date}.json`), JSON.stringify(edition, null, PRETTY) + '\n');
  await writeFile(join(dataDir, 'state.json'), JSON.stringify(state, null, PRETTY) + '\n');
}
