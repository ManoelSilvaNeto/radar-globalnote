import { describe, expect, it } from 'vitest';
import { buildTopics, candidatesFrom, midSentenceProperWords } from './topics-core';
import type { Story } from './types';

const story = (titulo: string, i: number): Story => ({
  clusterId: `c${i}`,
  slug: `s${i}`,
  titulo,
  resumo: '',
  porQueImporta: '',
  categoria: 'Geral',
  categoriaSlug: 'geral',
  sources: [{ name: 'X', url: `https://x/${i}` }],
  updatedAt: `2026-11-24T10:${String(i).padStart(2, '0')}:00Z`,
});

describe('temas — sentence case das manchetes', () => {
  it('palavra comum que só abre o título NÃO vira tema', () => {
    const topics = buildTopics([
      story('Dois carros batem e um capota em cruzamento de Manaus', 1),
      story('Dois mortos em colisão na Bahia', 2),
      story('Casal morre em acidente em Manaus', 3),
      story('Casal fica ferido em capotamento na Bahia', 4),
      story('Adolescente morre afogado em rio', 5),
      story('Adolescente é atropelado em avenida', 6),
    ]);
    const slugs = topics.map((t) => t.slug);
    expect(slugs).toEqual(expect.arrayContaining(['manaus', 'bahia']));
    expect(slugs).not.toContain('dois');
    expect(slugs).not.toContain('casal');
    expect(slugs).not.toContain('adolescente');
  });

  it('nome próprio que abre o título vale se aparece capitalizado no meio de outro', () => {
    const titles = ['Manaus registra temporal', 'Chuva derruba árvores em Manaus'];
    const proven = midSentenceProperWords(titles);
    expect(candidatesFrom(titles[0], proven)).toEqual(['Manaus']);
    const slugs = buildTopics(titles.map(story)).map((t) => t.slug);
    expect(slugs).toContain('manaus');
  });

  it('run multi-palavra no início continua valendo (Corpo de Bombeiros, Três Lagoas)', () => {
    const proven = new Set<string>();
    expect(candidatesFrom('Corpo de Bombeiros resgata família', proven)).toEqual(['Corpo de Bombeiros']);
    expect(candidatesFrom('Três Lagoas tem alagamentos', proven)).toEqual(['Três Lagoas']);
  });

  it('sem provenProper o extrator mantém o comportamento antigo', () => {
    expect(candidatesFrom('Dois carros batem em Manaus')).toEqual(['Dois', 'Manaus']);
  });
});
