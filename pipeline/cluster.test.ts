import { describe, it, expect } from 'vitest';
import { namedEntities, normalizePt, clusterArticles } from './cluster';
import type { Article } from '../src/lib/types';

const NOW = new Date('2026-05-20T12:00:00.000Z');

function mk(id: string, title: string, source: string, hoursAgo = 1): Article {
  return {
    id,
    url: `https://exemplo.com/${id}`,
    source,
    title,
    description: title,
    publishedAt: new Date(NOW.getTime() - hoursAgo * 3600_000).toISOString(),
    fetchedAt: NOW.toISOString(),
  };
}

describe('normalizePt', () => {
  it('remove acentos, pontuação e stopwords', () => {
    expect(normalizePt('A inflação não cai, segundo o Governo!')).toEqual(['inflacao', 'cai', 'governo']);
  });
});

describe('clusterArticles', () => {
  it('agrupa títulos parecidos e separa os diferentes', () => {
    const articles = [
      mk('a', 'Enchente atinge bairros e deixa famílias desabrigadas na cidade', 'G1'),
      mk('b', 'Cidade tem famílias desabrigadas após enchente atingir bairros', 'CNN Brasil'),
      mk('c', 'Avião faz pouso forçado em rodovia sem feridos', 'Metrópoles'),
    ];
    const clusters = clusterArticles(articles, { now: NOW });
    expect(clusters).toHaveLength(2);

    const big = clusters.find((cl) => cl.articles.length === 2)!;
    expect(big.sourceCount).toBe(2);

    const solo = clusters.find((cl) => cl.articles.length === 1)!;
    expect(solo.articles[0]!.id).toBe('c');
  });

  it('ignora artigos fora da janela', () => {
    const articles = [
      mk('a', 'Mesmo assunto importante hoje agora', 'G1', 1),
      mk('b', 'Mesmo assunto importante porém antigo', 'CNN Brasil', 200),
    ];
    const clusters = clusterArticles(articles, { now: NOW, windowHours: 48 });
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.articles[0]!.id).toBe('a');
  });

  // Bug #1: cluster espúrio agrupava histórias de eventos diferentes que só
  // compartilhavam vocabulário genérico. A guarda de entidades nomeadas separa.
  it('rejeita agrupamento quando entidades nomeadas são disjuntas (Bug #1)', () => {
    const articles = [
      mk('a', 'Trem colide com ônibus escolar deixa mortos na Bélgica', 'G1'),
      mk('b', 'Acidente com ônibus deixa mortos em Minas Gerais BR-251', 'CNN Brasil'),
    ];
    // Cosseno calculado entre estes 2 títulos > 0.30, então sem a guarda eles
    // seriam agrupados. Com a guarda, entidades {belgica} vs {minas,gerais,br-251}
    // são disjuntas → bloqueia.
    const clusters = clusterArticles(articles, { now: NOW });
    expect(clusters).toHaveLength(2);
  });

  it('agrupa quando entidades nomeadas coincidem', () => {
    const articles = [
      mk('a', 'Enchente atinge bairros e deixa famílias desabrigadas em Petrópolis', 'G1'),
      mk('b', 'Famílias desabrigadas em Petrópolis após chuvas atingirem a cidade', 'CNN Brasil'),
    ];
    const clusters = clusterArticles(articles, { now: NOW });
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.articles).toHaveLength(2);
  });

  it('agrupa por cosseno alto mesmo sem entidades nomeadas no título', () => {
    // Títulos sem proper nouns (depois de pular a 1ª palavra). A guarda não dispara;
    // cosseno alto sozinho decide.
    const articles = [
      mk('a', 'Avião faz pouso forçado em rodovia sem feridos', 'G1'),
      mk('b', 'Aeronave faz pouso forçado em rodovia ninguém ferido', 'CNN Brasil'),
    ];
    const clusters = clusterArticles(articles, { now: NOW });
    expect(clusters).toHaveLength(1);
  });
});

describe('namedEntities', () => {
  it('pula a 1ª palavra (capitalização ambígua) e captura entidades capitalizadas', () => {
    expect(namedEntities('Trem colide com ônibus escolar na Bélgica')).toEqual(new Set(['belgica']));
  });

  it('captura siglas e abreviações com hífen/dígito', () => {
    const ents = namedEntities('Acidente com ônibus deixa mortos em Minas Gerais BR-251');
    expect(ents.has('minas')).toBe(true);
    expect(ents.has('gerais')).toBe(true);
    expect(ents.has('br-251')).toBe(true);
  });

  it('ignora palavras curtas capitalizadas (Em, Na, Um)', () => {
    const ents = namedEntities('Avião cai Em rodovia');
    expect(ents.size).toBe(0);
  });

  it('retorna conjunto vazio quando só a 1ª palavra é capitalizada', () => {
    expect(namedEntities('Avião faz pouso forçado em rodovia sem feridos')).toEqual(new Set());
  });
});
