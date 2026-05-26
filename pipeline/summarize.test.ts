import { describe, it, expect, vi } from 'vitest';
import { cacheKey, fallbackSummary, hallucinatedNames, summarizeClusters, type Summarizer } from './summarize';
import type { Article, Cluster, CachedSummary, Summary } from '../src/lib/types';

function article(url: string, source: string, title = 'Título', description = 'Descrição longa do artigo.'): Article {
  return {
    id: url,
    url,
    source,
    title,
    description,
    publishedAt: '2026-05-20T11:00:00.000Z',
    fetchedAt: '2026-05-20T12:00:00.000Z',
  };
}

function cluster(id: string, articles: Article[]): Cluster {
  return { id, articles, latestAt: '2026-05-20T11:00:00.000Z', sourceCount: new Set(articles.map((a) => a.source)).size };
}

// titulo sem entidades nomeadas (palavras minúsculas após a 1ª) — o validador do
// Bug #3 trataria "IA" como sigla e flaggaria como alucinação se o artigo de
// teste não contivesse "ia". Mantém os testes de cache/orçamento sem ruído.
const SUMMARY: Summary = { titulo: 'Resumo neutro da história', resumo: 'Frase um. Frase dois.', porQueImporta: 'Importa porque sim.', categoria: 'Acidente' };
const NOW = new Date('2026-05-20T12:00:00.000Z');

describe('cacheKey', () => {
  it('independe de ordem e de rastreamento na URL', () => {
    const a = cacheKey(cluster('x', [article('https://a.com/1?utm_source=rss', 'G1'), article('https://b.com/2', 'CNN Brasil')]));
    const b = cacheKey(cluster('y', [article('https://www.b.com/2#x', 'CNN Brasil'), article('https://a.com/1', 'G1')]));
    expect(a).toBe(b);
  });

  it('mantém a chave quando um novo membro entra na mesma história', () => {
    const seed = article('https://a.com/1', 'G1'); // o mais antigo = âncora
    const newer = { ...article('https://c.com/3', 'Veja'), publishedAt: '2026-05-20T13:00:00.000Z' };
    const a = cacheKey(cluster('x', [seed]));
    const b = cacheKey(cluster('x', [seed, newer]));
    expect(a).toBe(b);
  });

  it('muda quando a história-âncora é outra', () => {
    const a = cacheKey(cluster('x', [article('https://a.com/1', 'G1')]));
    const b = cacheKey(cluster('y', [article('https://z.com/9', 'CNN Brasil')]));
    expect(a).not.toBe(b);
  });
});

describe('summarizeClusters', () => {
  it('usa o cache fresco (dentro do TTL) e não chama a IA', async () => {
    const c = cluster('c1', [article('https://a.com/1', 'G1')]);
    // 6h antes de NOW → dentro do TTL de 24h.
    const cached: Record<string, CachedSummary> = { [cacheKey(c)]: { ...SUMMARY, cachedAt: '2026-05-20T06:00:00.000Z' } };
    const summarizer: Summarizer = { summarize: vi.fn() };

    const { summaries, stats } = await summarizeClusters([c], summarizer, cached, NOW);

    expect(summarizer.summarize).not.toHaveBeenCalled();
    expect(stats.fromCache).toBe(1);
    expect(summaries.get('c1')).toEqual(SUMMARY);
  });

  it('reusa o resumo antigo (TTL vencido) em vez de RSS quando a IA está fora', async () => {
    const c = cluster('c1', [article('https://a.com/1', 'G1', 'T', 'Descrição do RSS.')]);
    // cachedAt bem antigo → TTL vencido; a IA falha → deve cair no resumo antigo, não no RSS.
    const stale: Record<string, CachedSummary> = { [cacheKey(c)]: { ...SUMMARY, cachedAt: '2026-05-18T00:00:00.000Z' } };
    const summarizer: Summarizer = { summarize: vi.fn().mockRejectedValue(new Error('quota')) };

    const { summaries, stats } = await summarizeClusters([c], summarizer, stale, NOW);

    expect(summarizer.summarize).toHaveBeenCalledOnce();
    expect(stats.staleCache).toBe(1);
    expect(stats.fallback).toBe(0);
    expect(summaries.get('c1')).toEqual(SUMMARY);
  });

  it('gera e cacheia quando não está no cache', async () => {
    const c = cluster('c1', [article('https://a.com/1', 'G1')]);
    const summarizer: Summarizer = { summarize: vi.fn().mockResolvedValue(SUMMARY) };

    const { summaries, cache, stats } = await summarizeClusters([c], summarizer, {}, NOW);

    expect(summarizer.summarize).toHaveBeenCalledOnce();
    expect(stats.generated).toBe(1);
    expect(summaries.get('c1')).toEqual(SUMMARY);
    expect(cache[cacheKey(c)]).toEqual({ ...SUMMARY, cachedAt: NOW.toISOString() });
  });

  it('cai no fallback quando a IA falha e NÃO cacheia', async () => {
    const c = cluster('c1', [article('https://a.com/1', 'G1', 'T', 'Descrição do RSS.')]);
    const summarizer: Summarizer = { summarize: vi.fn().mockRejectedValue(new Error('quota')) };

    const { summaries, cache, stats } = await summarizeClusters([c], summarizer, {}, NOW);

    expect(stats.fallback).toBe(1);
    expect(summaries.get('c1')).toEqual(fallbackSummary(c));
    expect(cache).toEqual({});
  });

  it('usa fallback quando não há summarizer (sem API key)', async () => {
    const c = cluster('c1', [article('https://a.com/1', 'G1')]);
    const { stats } = await summarizeClusters([c], null, {}, NOW);
    expect(stats.fallback).toBe(1);
  });

  it('abre o disjuntor após 429 seguidos e para de chamar a IA', async () => {
    const clusters = Array.from({ length: 6 }, (_, i) => cluster(`c${i}`, [article(`https://a.com/${i}`, 'G1')]));
    const quota = Object.assign(new Error('quota'), { status: 429 });
    const summarizer: Summarizer = { summarize: vi.fn().mockRejectedValue(quota) };

    const { stats } = await summarizeClusters(clusters, summarizer, {}, NOW, 0);

    expect(summarizer.summarize).toHaveBeenCalledTimes(4); // QUOTA_BREAKER
    expect(stats.fallback).toBe(6);
    expect(stats.generated).toBe(0);
  });

  it('respeita o orçamento de IA por run (GROQ_BUDGET_PER_RUN)', async () => {
    // 12 clusters, orçamento 3 → 3 sucessos da IA + 9 fallbacks, sem 429.
    process.env.GROQ_BUDGET_PER_RUN = '3';
    try {
      vi.resetModules();
      const { summarizeClusters: freshSummarize } = await import('./summarize');
      const clusters = Array.from({ length: 12 }, (_, i) =>
        cluster(`c${i}`, [article(`https://a.com/${i}`, 'G1')]),
      );
      const summarizer: Summarizer = { summarize: vi.fn().mockResolvedValue(SUMMARY) };

      const { stats } = await freshSummarize(clusters, summarizer, {}, NOW, 0);

      expect(summarizer.summarize).toHaveBeenCalledTimes(3);
      expect(stats.generated).toBe(3);
      expect(stats.fallback).toBe(9);
    } finally {
      delete process.env.GROQ_BUDGET_PER_RUN;
      vi.resetModules();
    }
  });

  // Bug #3: alucinação de nomes próprios.
  it('rejeita output fresco da IA com nome inventado e cai no fallback', async () => {
    const c = cluster('c1', [
      article('https://a.com/1', 'G1', 'Áudio mostra Flávio Bolsonaro falando com Vorcaro'),
    ]);
    const halu: Summary = { ...SUMMARY, titulo: 'Áudio de Flávio Marqueteiro chama Vorcaro' };
    const summarizer: Summarizer = { summarize: vi.fn().mockResolvedValue(halu) };

    const { summaries, cache, stats } = await summarizeClusters([c], summarizer, {}, NOW, 0);

    // Rejeitado → cai em fallback (título do artigo). NÃO é cacheado.
    expect(stats.generated).toBe(0);
    expect(stats.fallback).toBe(1);
    expect(cache).toEqual({});
    expect(summaries.get('c1')?.titulo).not.toBe(halu.titulo);
  });

  it('invalida cache antigo com alucinação e chama a IA de novo', async () => {
    const c = cluster('c1', [
      article('https://a.com/1', 'G1', 'Áudio mostra Flávio Bolsonaro falando com Vorcaro'),
    ]);
    // Cache fresco mas com nome inventado ("Marqueteiro" não está no artigo).
    const badCache: Record<string, CachedSummary> = {
      [cacheKey(c)]: { ...SUMMARY, titulo: 'Áudio de Flávio Marqueteiro', cachedAt: '2026-05-20T06:00:00.000Z' },
    };
    const goodSummary: Summary = { ...SUMMARY, titulo: 'Áudio mostra conversa entre os assessores' };
    const summarizer: Summarizer = { summarize: vi.fn().mockResolvedValue(goodSummary) };

    const { summaries, stats } = await summarizeClusters([c], summarizer, badCache, NOW, 0);

    expect(summarizer.summarize).toHaveBeenCalledTimes(1); // cache inválido → IA chamada
    expect(stats.fromCache).toBe(0);
    expect(stats.generated).toBe(1);
    expect(summaries.get('c1')?.titulo).toBe(goodSummary.titulo);
  });

  it('aceita o cache quando os nomes do título estão nas fontes', async () => {
    const c = cluster('c1', [
      article('https://a.com/1', 'G1', 'Enchente atinge Petrópolis com chuvas fortes', 'Cidade de Petrópolis amanheceu alagada'),
    ]);
    const cached: Record<string, CachedSummary> = {
      [cacheKey(c)]: { ...SUMMARY, titulo: 'Chuvas em Petrópolis deixam moradores desabrigados', cachedAt: '2026-05-20T06:00:00.000Z' },
    };
    const summarizer: Summarizer = { summarize: vi.fn() };

    const { stats } = await summarizeClusters([c], summarizer, cached, NOW, 0);

    expect(summarizer.summarize).not.toHaveBeenCalled();
    expect(stats.fromCache).toBe(1);
  });
});

describe('hallucinatedNames', () => {
  function art(title: string, description = ''): Article {
    return {
      id: title,
      url: 'https://x',
      source: 'G1',
      title,
      description,
      publishedAt: '2026-05-20T00:00:00.000Z',
      fetchedAt: '2026-05-20T00:00:00.000Z',
    };
  }

  it('flagga nome próprio ausente das fontes', () => {
    const sources = [art('Áudio mostra Flávio Bolsonaro conversando com Vorcaro')];
    const bad = hallucinatedNames('Áudio de Flávio Marqueteiro chama Vorcaro de irmão', sources);
    expect(bad).toContain('marqueteiro');
    expect(bad).not.toContain('flavio');
    expect(bad).not.toContain('vorcaro');
  });

  it('aceita título cujos nomes aparecem nas fontes', () => {
    const sources = [art('Enchente atinge Petrópolis e deixa famílias desabrigadas')];
    expect(hallucinatedNames('Chuvas em Petrópolis causam estragos', sources)).toEqual([]);
  });

  it('aceita título sem entidades nomeadas', () => {
    const sources = [art('Caminhão tomba em rodovia federal')];
    expect(hallucinatedNames('Veículo capota em rodovia sem feridos', sources)).toEqual([]);
  });

  it('busca também na description (não só no title) das fontes', () => {
    const sources = [art('Acidente em rodovia', 'O motorista, identificado como João Silva, perdeu o controle')];
    expect(hallucinatedNames('Acidente envolve João Silva', sources)).toEqual([]);
  });
});
