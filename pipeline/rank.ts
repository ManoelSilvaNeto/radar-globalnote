// Pontua e seleciona os clusters mais importantes.
// score = W_SOURCES * nº de fontes distintas + W_RECENCY * recência (0..1).
// Multi-fonte domina, mas notícia muito fresca ainda compete.

import type { Cluster } from '../src/lib/types';

export const W_SOURCES = 1.0;
export const W_RECENCY = 1.5;
const RECENCY_HALFLIFE_HOURS = 10; // recência cai pela metade a cada ~10h

export const HOME_SIZE = 10;
// Quantos clusters do topo entram na edição (viram histórias resumidas). A home é
// um corte dos primeiros; as categorias dinâmicas saem do agrupamento de todo o pool.
export const POOL_SIZE = 60;

// Recência em (0..1] por decaimento exponencial sobre a idade do artigo mais novo.
export function recencyScore(cluster: Cluster, now: Date = new Date()): number {
  const ageHours = (now.getTime() - new Date(cluster.latestAt).getTime()) / 3600_000;
  if (!Number.isFinite(ageHours)) return 0;
  return Math.pow(2, -Math.max(0, ageHours) / RECENCY_HALFLIFE_HOURS);
}

export function scoreCluster(cluster: Cluster, now: Date = new Date()): number {
  return W_SOURCES * cluster.sourceCount + W_RECENCY * recencyScore(cluster, now);
}

function byScoreDesc(now: Date) {
  return (a: Cluster, b: Cluster) => scoreCluster(b, now) - scoreCluster(a, now);
}

// Top clusters por score (a home pega os primeiros; a edição inteira pega o pool).
export function topForHome(clusters: Cluster[], now: Date = new Date(), limit = HOME_SIZE): Cluster[] {
  return [...clusters].sort(byScoreDesc(now)).slice(0, limit);
}
