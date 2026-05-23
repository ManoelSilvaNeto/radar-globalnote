// Categorias DINÂMICAS: o rótulo vem da IA (do conteúdo de cada notícia), não de
// uma lista fixa. Aqui ficam só o rótulo-padrão e o gerador de slug da URL.

export const FALLBACK_CATEGORIA = 'Geral';

// Slug estável p/ a URL da categoria (/<slug>): sem acento, minúsculo, hifenizado.
export const categoriaSlug = (label: string): string =>
  label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'geral';
