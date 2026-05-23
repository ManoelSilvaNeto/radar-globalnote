// Lista curada de feeds RSS/Atom. Aqui NÃO há categoria: a categoria de cada
// notícia é definida pela IA (categorias dinâmicas). O recorte do nicho (desastres
// e acidentes) é feito pelo filtro de palavras-chave em pipeline/niche.ts.
//
// Backbone = veículos nacionais de alto volume (mesmos feeds provados do molde,
// verificados em 2026-05-20) + editorias do G1 que concentram ocorrências. O filtro
// de nicho extrai delas o que interessa ao Radar. Feed que morrer é só logado e
// ignorado (não derruba o run) → dá pra acrescentar fontes regionais à vontade.

import type { Source } from '../src/lib/types';

export const SOURCES: Source[] = [
  // ── G1 (Globo) — geral + editorias que concentram desastres/acidentes ──────
  { name: 'G1', url: 'https://g1.globo.com/rss/g1/' },
  { name: 'G1', url: 'https://g1.globo.com/rss/g1/ciencia-e-saude/' },
  { name: 'G1', url: 'https://g1.globo.com/rss/g1/brasil/' },
  { name: 'G1', url: 'https://g1.globo.com/rss/g1/mundo/' },

  // ── Agências e portais nacionais (multi-editoria, muito volume) ────────────
  { name: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss.xml' },
  { name: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/' },
  { name: 'Metrópoles', url: 'https://www.metropoles.com/feed' },
  { name: 'Poder360', url: 'https://www.poder360.com.br/feed/' },
  { name: 'Veja', url: 'https://veja.abril.com.br/feed/' },

  // ── Internacional (desastres mundo afora) ──────────────────────────────────
  { name: 'BBC Brasil', url: 'https://feeds.bbci.co.uk/portuguese/rss.xml' },
  { name: 'DW Brasil', url: 'https://rss.dw.com/rdf/rss-br-all' },
];
