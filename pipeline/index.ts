// Orquestra o pipeline inteiro: coleta → filtro do nicho → cluster → rank →
// resume (IA classifica a categoria) → grava JSON. Rodado pelo GitHub Actions
// (e local via `pnpm pipeline`).

import { resolve } from 'node:path';
import { fetchAllSources } from './fetch';
import { clusterHasDamageSignal, filterNiche } from './niche';
import { clusterArticles, normalizePt } from './cluster';
import { topForHome, POOL_SIZE } from './rank';
import { summarizeClusters, summarizerFromEnv } from './summarize';
import { buildEdition, pruneCache, readState, writeData } from './build-data';
import { FALLBACK_CATEGORIA } from '../src/lib/categories';

const DATA_DIR = resolve(process.cwd(), 'data');

async function main(): Promise<void> {
  const now = new Date();
  console.log(`[pipeline] início ${now.toISOString()}`);

  // 1. coleta
  const raw = await fetchAllSources();

  // 2. filtro do nicho (desastres/acidentes) — só o que interessa ao Radar
  const articles = filterNiche(raw);
  console.log(`filtro do nicho: ${raw.length} → ${articles.length} artigos`);

  // 3. clustering
  const clusters = clusterArticles(articles, { now });
  console.log(`clusters: ${clusters.length}`);

  // 4. ranking → pool da edição (home = corte do topo; categorias = agrupamento)
  const pool = topForHome(clusters, now, POOL_SIZE);
  console.log(`pool p/ resumo: ${pool.length}`);

  // 5. resumo (cache + IA + fallback). A IA também classifica a categoria.
  const state = await readState(DATA_DIR);
  const summarizer = summarizerFromEnv();
  const { summaries, cache, stats } = await summarizeClusters(pool, summarizer, state.summaries, now);
  console.log(
    `resumos: cache=${stats.fromCache} IA=${stats.generated} reuso=${stats.staleCache} fallback=${stats.fallback}`,
  );

  // 5.5. gate de escopo (Bug #2): "Geral" é o catch-all que a IA usa quando não
  // sabe classificar. Mas o filtro do nicho pode deixar passar matéria que só
  // MENCIONA "acidente"/"tragédia" no sentido figurado (corrupção, política
  // metaforicamente "trágica", etc). Descartamos clusters cujo summary é "Geral"
  // E cujo conteúdo não tem nenhum sinal concreto de dano. Isso afeta também os
  // clusters de fallback (sem IA), que sempre vêm como "Geral".
  const scopedPool = pool.filter((c) => {
    const s = summaries.get(c.id);
    if (!s || s.categoria !== FALLBACK_CATEGORIA) return true;
    if (clusterHasDamageSignal(c.articles)) return true;
    console.warn(
      `  ⚠ fora-do-nicho descartado (categoria=Geral, sem sinal de dano): "${c.articles[0]?.title.slice(0, 80) ?? c.id}"`,
    );
    return false;
  });
  if (scopedPool.length !== pool.length) {
    console.log(`gate de escopo: ${pool.length} → ${scopedPool.length} clusters`);
  }

  // 6. montagem
  const edition = buildEdition(scopedPool, summaries, now);
  if (edition.home.length === 0) {
    console.warn('edição vazia (nada após o filtro do nicho?) — mantendo a última edição. Nada gravado.');
    return;
  }

  // 6.5. sanity check pós-build (Bug #1): o título consolidado deve falar do
  // MESMO evento que pelo menos um artigo do cluster. Se nenhum artigo do
  // cluster compartilha termo significativo com o título, é sinal de cluster
  // espúrio (resumo cacheado de outra história ficou desalinhado das fontes).
  // Não filtra — só loga. Se o log ficar vazio em produção, o fix está OK.
  for (const story of edition.home) {
    const cluster = scopedPool.find((c) => c.id === story.clusterId);
    if (!cluster) continue;
    const titleTerms = new Set(normalizePt(story.titulo));
    if (titleTerms.size === 0) continue;
    const aligned = cluster.articles.some((a) => {
      const at = normalizePt(a.title);
      return at.some((t) => titleTerms.has(t));
    });
    if (!aligned) {
      console.warn(`  ⚠ desalinho: "${story.titulo}" — nenhum artigo do cluster compartilha termo`);
    }
  }

  // 7. gravação (current + snapshot do dia + state com cache podado)
  await writeData(edition, { updatedAt: now.toISOString(), summaries: pruneCache(cache, now) }, DATA_DIR);
  console.log(
    `[pipeline] fim — edição ${edition.date}, home: ${edition.home.length}, categorias: ${edition.categorias.length}`,
  );
}

main().catch((err) => {
  console.error('[pipeline] erro fatal:', err);
  process.exit(1);
});
