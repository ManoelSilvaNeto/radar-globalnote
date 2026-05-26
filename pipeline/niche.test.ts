import { describe, it, expect } from 'vitest';
import { matchesNiche, filterNiche, clusterHasDamageSignal, clusterIsStandaloneNiche } from './niche';
import type { Article } from '../src/lib/types';

function art(title: string, description = ''): Article {
  return {
    id: title,
    url: `https://exemplo.com/${title.slice(0, 10).replace(/\s+/g, '-')}`,
    source: 'G1',
    title,
    description,
    publishedAt: '2026-05-20T11:00:00.000Z',
    fetchedAt: '2026-05-20T12:00:00.000Z',
  };
}

describe('matchesNiche', () => {
  it('aceita evento standalone do nicho sem precisar de damage signal', () => {
    expect(matchesNiche(art('Enchente atinge cidades do Sul'))).toBe(true);
    expect(matchesNiche(art('Deslizamento bloqueia rodovia'))).toBe(true);
    expect(matchesNiche(art('Tsunami chega à costa do Japão'))).toBe(true);
    expect(matchesNiche(art('Avião cai em rodovia federal'))).toBe(true);
    expect(matchesNiche(art('Granizo destrói plantações'))).toBe(true);
  });

  it('exige damage signal pra termos ambíguos (Bug #2)', () => {
    // "acidente" sozinho não basta — pode ser metáfora ou incidental.
    expect(matchesNiche(art('Acidente de percurso no plano econômico do governo'))).toBe(false);
    // Com damage signal: passa.
    expect(matchesNiche(art('Acidente em rodovia deixa 3 mortos'))).toBe(true);
    expect(matchesNiche(art('Capotamento na BR-251', 'Motorista ficou ferido após o veículo capotar'))).toBe(true);
  });

  it('rejeita matéria política/judicial que usa "acidente" em sentido figurado', () => {
    // Caso real do brief — OAB-PR + desembargador + acidente de quadriciclo
    // (incidental, sem damage signal direto).
    expect(
      matchesNiche(
        art(
          'OAB-PR pede afastamento cautelar de desembargador suspeito de vender decisão judicial',
          'Caso envolve negociação durante reunião que terminou em acidente de quadriciclo',
        ),
      ),
    ).toBe(false);
  });

  it('rejeita política eleitoral mesmo com "tragédia" metafórica', () => {
    expect(
      matchesNiche(
        art(
          'Áudio de Flávio Bolsonaro gera debate sobre impacto na disputa eleitoral',
          'Episódio é visto como tragédia para a estratégia do partido',
        ),
      ),
    ).toBe(false);
  });

  it('rejeita matéria sem nenhuma palavra-chave do nicho', () => {
    expect(matchesNiche(art('Festival de cinema premia diretor brasileiro'))).toBe(false);
    expect(matchesNiche(art('Bolsa fecha em alta após decisão do BC'))).toBe(false);
  });

  it('aceita "incêndio" só com corroboração de dano', () => {
    expect(matchesNiche(art('Incêndio na economia preocupa investidores'))).toBe(false);
    expect(matchesNiche(art('Incêndio destrói galpão de empresa em SP'))).toBe(true);
    expect(matchesNiche(art('Incêndio em casa deixa 6 mortos'))).toBe(true);
  });
});

describe('filterNiche', () => {
  it('filtra a lista de artigos preservando os do nicho', () => {
    const articles = [
      art('Enchente em Petrópolis deixa cidades isoladas'),
      art('OAB pede afastamento de juiz por suspeita de corrupção'),
      art('Acidente fatal em rodovia mata 4'),
      art('Festival de música atrai 100 mil pessoas'),
    ];
    const out = filterNiche(articles);
    expect(out).toHaveLength(2);
    expect(out.map((a) => a.title)).toEqual([
      'Enchente em Petrópolis deixa cidades isoladas',
      'Acidente fatal em rodovia mata 4',
    ]);
  });
});

describe('clusterHasDamageSignal', () => {
  it('reconhece dano em qualquer artigo do cluster', () => {
    expect(
      clusterHasDamageSignal([
        art('Evento na cidade', 'Sem informações concretas'),
        art('Outro evento', 'Há feridos sendo atendidos'),
      ]),
    ).toBe(true);
  });

  it('retorna false quando nenhum artigo tem sinal de dano', () => {
    expect(
      clusterHasDamageSignal([
        art('Festival cultural', 'Atrações musicais e gastronomia'),
        art('Cobertura do evento', 'Programação estende-se até domingo'),
      ]),
    ).toBe(false);
  });
});

describe('clusterIsStandaloneNiche', () => {
  it('reconhece termo standalone em qualquer artigo do cluster', () => {
    expect(
      clusterIsStandaloneNiche([
        art('Municípios recebem verba pós-evento', 'Ações emergenciais após enchente'),
      ]),
    ).toBe(true);
    expect(clusterIsStandaloneNiche([art('Deslizamento em estrada')])).toBe(true);
  });

  it('retorna false quando não há termo standalone', () => {
    expect(clusterIsStandaloneNiche([art('Acidente sem feridos', 'Carro tombou na BR')])).toBe(false);
  });
});
