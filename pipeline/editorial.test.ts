import { describe, it, expect, vi } from 'vitest';
import {
  buildEditorialPrompt,
  categoriaDistribution,
  composeDestaques,
  decideGenerate,
  editorialCorpus,
  editorialHallucinations,
  generateEditorial,
  validateEditorial,
} from './editorial';
import type { Edition, Story } from '../src/lib/types';
import type { OpenAICompatSummarizer } from './summarize';

const NOW = new Date('2026-06-04T12:00:00.000Z');

function story(over: Partial<Story> = {}): Story {
  return {
    clusterId: 'cl',
    slug: 's1',
    titulo: 'Enchente atinge Petrópolis após chuvas',
    resumo: 'Fortes chuvas alagaram ruas de Petrópolis e deixaram famílias desabrigadas.',
    porQueImporta: 'A região é historicamente vulnerável a deslizamentos.',
    categoria: 'Enchente',
    categoriaSlug: 'enchente',
    sources: [{ name: 'G1', url: 'https://g1.globo.com/n/1' }],
    updatedAt: '2026-06-04T10:00:00.000Z',
    ...over,
  };
}

function edition(stories: Story[]): Edition {
  return {
    date: '2026-06-04',
    generatedAt: NOW.toISOString(),
    home: stories,
    categorias: [
      { slug: 'enchente', label: 'Enchente', stories },
      { slug: 'incendio', label: 'Incêndio', stories: stories.slice(0, 1) },
    ],
  };
}

// Provedor falso: o gerador só usa .label e .completeJson.
function provider(label: string, completeJson: (s: string, u: string, o: unknown) => Promise<unknown>) {
  return { label, completeJson: vi.fn(completeJson) } as unknown as OpenAICompatSummarizer;
}

const GOOD_RAW = {
  titulo: 'Chuvas e acidentes marcam o dia no país',
  linhaFina: 'As enchentes concentraram a maior parte das ocorrências da edição.',
  paragrafos: [
    'Ao longo do dia, as ocorrências ligadas a chuvas predominaram entre os registros, com destaque para alagamentos em Petrópolis e o risco recorrente de deslizamentos na região.',
    'O conjunto reforça um padrão sazonal já conhecido, em que áreas vulneráveis voltam a sofrer com a infraestrutura insuficiente diante de volumes elevados de chuva.',
  ],
};

describe('decideGenerate', () => {
  it('força ignora janela e dedup', () => {
    expect(decideGenerate({ exists: true, hourUtc: 0, genHour: 11, force: true }).generate).toBe(true);
  });
  it('não gera se já existe o editorial do dia', () => {
    expect(decideGenerate({ exists: true, hourUtc: 15, genHour: 11, force: false }).generate).toBe(false);
  });
  it('não gera fora da janela horária', () => {
    expect(decideGenerate({ exists: false, hourUtc: 8, genHour: 11, force: false }).generate).toBe(false);
  });
  it('gera na janela quando ainda não há editorial', () => {
    expect(decideGenerate({ exists: false, hourUtc: 12, genHour: 11, force: false }).generate).toBe(true);
  });
});

describe('editorialCorpus / editorialHallucinations', () => {
  it('aceita entidades presentes no material', () => {
    const corpus = editorialCorpus([story()]);
    const halls = editorialHallucinations(
      'Panorama do dia',
      ['As chuvas em Petrópolis dominaram os registros.'],
      corpus,
    );
    expect(halls).toEqual([]);
  });

  it('flagga entidade ausente do material', () => {
    const corpus = editorialCorpus([story()]);
    const halls = editorialHallucinations(
      'Panorama do dia',
      ['As enchentes em Macapá foram as mais graves.'],
      corpus,
    );
    expect(halls).toContain('macapa');
  });

  it('ignora palavras genéricas capitalizadas (País, Região, Governo) ausentes do corpus', () => {
    const corpus = editorialCorpus([story()]);
    const halls = editorialHallucinations(
      'Panorama do dia',
      ['No País, o Governo e a Defesa Civil acompanham a Região afetada pelas chuvas.'],
      corpus,
    );
    expect(halls).toEqual([]);
  });
});

describe('validateEditorial', () => {
  it('aprova um output completo e ancorado', () => {
    const v = validateEditorial(GOOD_RAW, [story()], NOW);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.paragrafos).toHaveLength(2);
  });

  it('reprova título curto', () => {
    const v = validateEditorial({ ...GOOD_RAW, titulo: 'Curto' }, [story()], NOW);
    expect(v.ok).toBe(false);
  });

  it('reprova quando sobram poucos parágrafos (descarta os curtos)', () => {
    const v = validateEditorial({ ...GOOD_RAW, paragrafos: ['curto', 'tb curto'] }, [story()], NOW);
    expect(v.ok).toBe(false);
  });

  it('reprova entidade inventada', () => {
    const raw = {
      ...GOOD_RAW,
      paragrafos: [
        ...GOOD_RAW.paragrafos,
        'O prefeito Joaquim Nogueira anunciou medidas emergenciais nesta tarde para conter os danos.',
      ],
    };
    const v = validateEditorial(raw, [story()], NOW);
    expect(v.ok).toBe(false);
  });

  it('reprova data incoerente (mês antigo)', () => {
    const raw = {
      ...GOOD_RAW,
      paragrafos: [
        'Em janeiro a região já havia registrado alagamentos semelhantes, segundo o material reunido na edição.',
        ...GOOD_RAW.paragrafos,
      ],
    };
    const v = validateEditorial(raw, [story()], NOW);
    expect(v.ok).toBe(false);
  });
});

describe('composeDestaques', () => {
  it('limita e mapeia para refs com slug/categoria', () => {
    const stories = [story({ slug: 'a' }), story({ slug: 'b' }), story({ slug: 'c' })];
    const refs = composeDestaques(stories, 2);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ slug: 'a', categoria: 'Enchente' });
  });
});

describe('buildEditorialPrompt / categoriaDistribution', () => {
  it('inclui a distribuição de categorias e as histórias', () => {
    const ed = edition([story()]);
    expect(categoriaDistribution(ed)).toContain('Enchente (1)');
    const prompt = buildEditorialPrompt(ed.home, ed);
    expect(prompt).toContain('Distribuição por categoria');
    expect(prompt).toContain('Petrópolis');
  });
});

describe('generateEditorial', () => {
  it('gera a peça com o primeiro provedor', async () => {
    const ed = edition([story()]);
    const p = provider('groq', async () => GOOD_RAW);
    const out = await generateEditorial(ed, [p], NOW, 10, 6);
    expect(out).not.toBeNull();
    expect(out!.titulo).toBe(GOOD_RAW.titulo);
    expect(out!.date).toBe('2026-06-04');
    expect(out!.destaques.length).toBeGreaterThan(0);
    expect(p.completeJson).toHaveBeenCalledOnce();
  });

  it('cai pro próximo provedor em 429', async () => {
    const ed = edition([story()]);
    const p1 = provider('groq', async () => {
      throw Object.assign(new Error('429'), { status: 429 });
    });
    const p2 = provider('cerebras', async () => GOOD_RAW);
    const out = await generateEditorial(ed, [p1, p2], NOW, 10, 6);
    expect(out).not.toBeNull();
    expect(p1.completeJson).toHaveBeenCalledOnce();
    expect(p2.completeJson).toHaveBeenCalledOnce();
  });

  it('retorna null quando a validação reprova em todos os provedores', async () => {
    const ed = edition([story()]);
    const bad = provider('groq', async () => ({ titulo: 'x', linhaFina: 'y', paragrafos: [] }));
    const out = await generateEditorial(ed, [bad], NOW, 10, 6);
    expect(out).toBeNull();
  });
});
