// Tipos canônicos do GlobalNote Radar — compartilhados entre o pipeline (ingestão)
// e o site (Astro). Tipos somem em runtime; só `import type` aqui.

// Uma fonte de RSS curada (pipeline/sources.ts). A categoria NÃO vem da fonte —
// é a IA que classifica cada notícia pelo conteúdo (categorias dinâmicas).
export type Source = {
  name: string; // rótulo exibido, ex.: "G1", "Agência Brasil"
  url: string; // URL do feed RSS/Atom
};

// Item de feed já normalizado (pipeline/fetch.ts).
export type Article = {
  id: string; // hash estável da URL
  url: string;
  source: string; // nome da fonte
  title: string;
  description: string; // texto do feed (NÃO republicado como conteúdo final)
  imageUrl?: string;
  publishedAt: string; // ISO 8601
  fetchedAt: string; // ISO 8601
};

// Um agrupamento de artigos que contam a mesma história (pipeline/cluster.ts).
export type Cluster = {
  id: string; // hash estável das URLs dos membros
  articles: Article[];
  latestAt: string; // publishedAt mais recente entre os membros (ISO)
  sourceCount: number; // nº de fontes distintas
};

// Resumo gerado pela IA (pipeline/summarize.ts). A `categoria` é DINÂMICA: sai do
// conteúdo da própria notícia, sem lista fixa.
export type Summary = {
  titulo: string; // título limpo/neutro
  resumo: string; // 2–4 frases originais, PT-BR
  porQueImporta: string; // 1 linha
  categoria: string; // rótulo curto vindo da IA (ex.: "Enchentes", "Acidente aéreo")
};

// História renderizável no site (pipeline/build-data.ts → data/*.json).
export type Story = {
  clusterId: string; // âncora interna (id do cluster; muda entre runs)
  slug?: string; // id ESTÁVEL p/ a URL /noticia/<slug> (hash da URL do artigo-âncora)
  titulo: string;
  resumo: string;
  porQueImporta: string;
  categoria: string; // rótulo exibido (vindo da IA)
  categoriaSlug: string; // slug estável p/ a URL da categoria (/<slug>)
  sources: { name: string; url: string }[];
  imageUrl?: string;
  updatedAt: string; // ISO 8601
};

// Seção de categoria dinâmica numa edição: só as categorias presentes, ordenadas
// por volume. Substitui o Record<Category, ...> fixo do molde original.
export type CategoriaSecao = {
  slug: string;
  label: string;
  stories: Story[];
};

// Edição = um snapshot do site (data/current.json e data/edicoes/<data>.json).
export type Edition = {
  date: string; // AAAA-MM-DD
  generatedAt: string; // ISO 8601
  home: Story[];
  categorias: CategoriaSecao[];
};

// Resumo em cache, com carimbo de quando entrou (pra poda da janela).
export type CachedSummary = Summary & { cachedAt: string };

// Estado persistido entre runs (data/state.json): cache de resumos da janela recente.
export type State = {
  updatedAt: string; // ISO 8601
  summaries: Record<string, CachedSummary>; // cacheKey (hash da URL do artigo-âncora) -> resumo
};
