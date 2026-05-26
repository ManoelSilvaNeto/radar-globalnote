import { describe, it, expect } from 'vitest';
import { toStory, buildEdition, groupByCategoria, pruneCache, brDate } from './build-data';
import type { Article, Cluster, CachedSummary, Summary } from '../src/lib/types';

function article(url: string, source: string, imageUrl?: string): Article {
  return {
    id: url,
    url,
    source,
    title: `Título de ${source}`,
    description: 'Descrição.',
    ...(imageUrl ? { imageUrl } : {}),
    publishedAt: '2026-05-20T11:00:00.000Z',
    fetchedAt: '2026-05-20T12:00:00.000Z',
  };
}

function cluster(id: string, articles: Article[]): Cluster {
  return { id, articles, latestAt: '2026-05-20T11:00:00.000Z', sourceCount: new Set(articles.map((a) => a.source)).size };
}

const SUMMARY: Summary = { titulo: 'T', resumo: 'R', porQueImporta: 'P', categoria: 'Enchente' };

describe('toStory', () => {
  it('mapeia o resumo, deduplica fontes, pega a 1ª imagem e gera o slug da categoria', () => {
    const c = cluster('c1', [
      article('https://a.com/1', 'G1', 'https://img/x.jpg'),
      article('https://b.com/2', 'G1'), // mesma fonte → não duplica
      article('https://c.com/3', 'CNN Brasil'),
    ]);
    const story = toStory(c, SUMMARY);
    expect(story.titulo).toBe('T');
    expect(story.categoria).toBe('Enchente');
    expect(story.categoriaSlug).toBe('enchente');
    expect(story.sources).toEqual([
      { name: 'G1', url: 'https://a.com/1' },
      { name: 'CNN Brasil', url: 'https://c.com/3' },
    ]);
    expect(story.imageUrl).toBe('https://img/x.jpg');
  });

  it('gera um slug estável que não muda quando entra um novo membro na história', () => {
    const seed = article('https://a.com/1', 'G1'); // o mais antigo = âncora
    const newer = { ...article('https://c.com/3', 'Veja'), publishedAt: '2026-05-20T13:00:00.000Z' };
    const so = toStory(cluster('c1', [seed]), SUMMARY);
    const sn = toStory(cluster('c1-grande', [seed, newer]), SUMMARY);
    expect(so.slug).toBeTruthy();
    expect(so.slug).toBe(sn.slug); // mesma âncora → mesmo slug → mesma URL /noticia/<slug>
  });

  // Bug #1: sources[0]/imagem vinham da semente (mais recente), mas o resumo
  // é cacheado pela URL âncora (mais antiga). Resultado: display desencontrado
  // do cache. Fix: sources e imagem vêm da âncora.
  it('alinha sources[0] e imagem com a âncora (artigo mais antigo) — Bug #1', () => {
    const seed = {
      ...article('https://recent.com/2', 'CNN Brasil', 'https://img/seed.jpg'),
      publishedAt: '2026-05-20T15:00:00.000Z',
    };
    const anchor = {
      ...article('https://anchor.com/1', 'G1', 'https://img/anchor.jpg'),
      publishedAt: '2026-05-20T10:00:00.000Z',
    };
    // Ordem dos articles no cluster: semente primeiro (como o pipeline real gera).
    const c = cluster('c1', [seed, anchor]);
    const story = toStory(c, SUMMARY);
    expect(story.sources[0]).toEqual({ name: 'G1', url: 'https://anchor.com/1' });
    expect(story.sources[1]).toEqual({ name: 'CNN Brasil', url: 'https://recent.com/2' });
    expect(story.imageUrl).toBe('https://img/anchor.jpg');
  });

  it('cai pra imagem de outro artigo quando a âncora não tem imagem', () => {
    const seed = {
      ...article('https://recent.com/2', 'CNN Brasil', 'https://img/seed.jpg'),
      publishedAt: '2026-05-20T15:00:00.000Z',
    };
    const anchorNoImg = {
      ...article('https://anchor.com/1', 'G1'), // sem imagem
      publishedAt: '2026-05-20T10:00:00.000Z',
    };
    const c = cluster('c1', [seed, anchorNoImg]);
    const story = toStory(c, SUMMARY);
    expect(story.imageUrl).toBe('https://img/seed.jpg'); // fallback
  });
});

describe('groupByCategoria', () => {
  it('agrupa por slug, rotula e ordena por volume', () => {
    const mk = (id: string, cat: string): ReturnType<typeof toStory> =>
      toStory(cluster(id, [article(`https://a.com/${id}`, 'G1')]), { ...SUMMARY, categoria: cat });
    const stories = [mk('a', 'Enchente'), mk('b', 'Acidente aéreo'), mk('c', 'Enchente')];
    const secs = groupByCategoria(stories);
    expect(secs).toHaveLength(2);
    expect(secs[0]!.slug).toBe('enchente'); // 2 histórias → vem primeiro
    expect(secs[0]!.label).toBe('Enchente');
    expect(secs[0]!.stories).toHaveLength(2);
    expect(secs[1]!.slug).toBe('acidente-aereo');
  });
});

describe('buildEdition', () => {
  it('monta home + categorias dinâmicas e usa fallback quando falta resumo', () => {
    const c1 = cluster('c1', [article('https://a.com/1', 'G1')]);
    const edition = buildEdition([c1], new Map<string, Summary>(), new Date('2026-05-20T15:00:00.000Z'));
    expect(edition.home).toHaveLength(1);
    expect(edition.home[0]!.titulo).toBe('Título de G1'); // fallback usa o título do artigo
    expect(edition.categorias).toHaveLength(1);
    expect(edition.categorias[0]!.label).toBe('Geral'); // fallback → categoria "Geral"
    expect(edition.categorias[0]!.stories).toHaveLength(1);
  });
});

describe('pruneCache', () => {
  it('remove resumos mais velhos que a janela', () => {
    const now = new Date('2026-05-20T12:00:00.000Z');
    const fresh: CachedSummary = { ...SUMMARY, cachedAt: '2026-05-20T06:00:00.000Z' };
    const old: CachedSummary = { ...SUMMARY, cachedAt: '2026-05-10T06:00:00.000Z' };
    const out = pruneCache({ a: fresh, b: old }, now);
    expect(out).toHaveProperty('a');
    expect(out).not.toHaveProperty('b');
  });
});

describe('brDate', () => {
  it('formata no fuso de Brasília (AAAA-MM-DD)', () => {
    // 2026-05-21T02:00Z = 2026-05-20 23:00 em Brasília (UTC-3)
    expect(brDate(new Date('2026-05-21T02:00:00.000Z'))).toBe('2026-05-20');
  });
});
