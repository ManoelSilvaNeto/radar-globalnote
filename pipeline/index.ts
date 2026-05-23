// Orquestra o pipeline inteiro: coleta → filtro do nicho → cluster → rank →
// resume (IA classifica a categoria) → grava JSON. Rodado pelo GitHub Actions
// (e local via `pnpm pipeline`).

import { resolve } from 'node:path';
import { fetchAllSources } from './fetch';
import { filterNiche } from './niche';
import { clusterArticles } from './cluster';
import { topForHome, POOL_SIZE } from './rank';
import { summarizeClusters, summarizerFromEnv } from './summarize';
import { buildEdition, pruneCache, readState, writeData } from './build-data';

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

  // 6. montagem
  const edition = buildEdition(pool, summaries, now);
  if (edition.home.length === 0) {
    console.warn('edição vazia (nada após o filtro do nicho?) — mantendo a última edição. Nada gravado.');
    return;
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
