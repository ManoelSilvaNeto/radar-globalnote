import { describe, it, expect } from 'vitest';
import { normalizeUrl, articleId, stripCaption, stripHtml, toArticle, dedupeByUrl } from './fetch';
import type { Article, Source } from '../src/lib/types';

const source: Source = { name: 'G1', url: 'https://g1.globo.com/rss/g1/' };

describe('normalizeUrl', () => {
  it('remove parâmetros de rastreamento, www, fragmento e barra final', () => {
    const a = normalizeUrl('http://www.g1.globo.com/noticia/?utm_source=x&fbclid=y#topo');
    expect(a).toBe('https://g1.globo.com/noticia');
  });

  it('preserva query relevante', () => {
    expect(normalizeUrl('https://site.com/n?id=42&utm_medium=rss')).toBe('https://site.com/n?id=42');
  });

  it('é idempotente e devolve a entrada quando não é URL', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});

describe('articleId', () => {
  it('mesma matéria com rastreamento diferente → mesmo id', () => {
    const a = articleId('https://g1.globo.com/noticia/?utm_source=rss');
    const b = articleId('https://www.g1.globo.com/noticia#x');
    expect(a).toBe(b);
  });

  it('URLs diferentes → ids diferentes', () => {
    expect(articleId('https://a.com/1')).not.toBe(articleId('https://a.com/2'));
  });
});

describe('stripHtml', () => {
  it('remove tags, scripts e decodifica entidades', () => {
    const out = stripHtml('<p>Caf&eacute; &amp; <b>p&atilde;o</b></p><script>x()</script>');
    expect(out).not.toMatch(/[<>]/);
    expect(out).toContain('&');
    expect(out).not.toContain('x()');
  });
});

// Bug #4: descriptions de RSS BR vinham com legenda de foto + crédito coladas
// ao corpo. As 3 fixtures abaixo são casos REAIS do brief.
describe('stripCaption', () => {
  it('remove legenda + sigla institucional (PRF)', () => {
    const txt = 'Base alvo dos criminosos PRF Dois homens foram detidos em operação realizada nesta segunda-feira em uma rodovia federal no Mato Grosso. A ação durou cerca de 3 horas.';
    expect(stripCaption(txt)).toBe(
      'Dois homens foram detidos em operação realizada nesta segunda-feira em uma rodovia federal no Mato Grosso. A ação durou cerca de 3 horas.',
    );
  });

  it('remove legenda + crédito "Arquivo pessoal"', () => {
    const txt = 'Homem precisou ser socorrido Arquivo pessoal Um trabalhador da construção civil sofreu queda de altura considerável nesta manhã na zona leste da cidade.';
    expect(stripCaption(txt)).toBe(
      'Um trabalhador da construção civil sofreu queda de altura considerável nesta manhã na zona leste da cidade.',
    );
  });

  it('remove legenda longa + crédito "Nome Sobrenome/Outlet"', () => {
    const txt = 'O veículo foi encontrado às margens da rodovia após sair da pista e capotar Kelvin Ramirez/Só Notícias Um motorista identificado como João Pereira foi achado morto dentro do carro carbonizado.';
    expect(stripCaption(txt)).toBe(
      'Um motorista identificado como João Pereira foi achado morto dentro do carro carbonizado.',
    );
  });

  it('preserva text que NÃO tem padrão de legenda', () => {
    const txt = 'A defesa civil informou que três famílias foram desabrigadas após o deslizamento de terra ocorrido na manhã desta segunda-feira no bairro Petrópolis em Belém.';
    expect(stripCaption(txt)).toBe(txt);
  });

  it('não remove quando o "crédito" aparece no meio do corpo, não no prefixo', () => {
    // "PRF" aparece em contexto natural — não há legenda ANTES com texto curto.
    const txt = 'PRF prende suspeitos em ação coordenada com a polícia federal nesta manhã em rodovia federal em Mato Grosso. A operação durou três horas.';
    expect(stripCaption(txt)).toBe(txt);
  });

  it('não remove se a "legenda" for mais longa que o corpo', () => {
    const txt = 'Texto que parece legenda mas continua por muito tempo descrevendo coisas Arquivo pessoal corpo curto.';
    expect(stripCaption(txt)).toBe(txt);
  });

  it('passa por texto curto sem mexer', () => {
    expect(stripCaption('Texto curto')).toBe('Texto curto');
    expect(stripCaption('')).toBe('');
  });
});

describe('toArticle', () => {
  const fetchedAt = '2026-05-20T12:00:00.000Z';

  it('mapeia os campos e gera id pela URL', () => {
    const article = toArticle(
      { title: 'Título <b>X</b>', link: 'https://g1.globo.com/n/1', isoDate: '2026-05-20T10:00:00.000Z', contentSnippet: 'Resumo do feed.' },
      source,
      fetchedAt,
    );
    expect(article).not.toBeNull();
    expect(article!.title).toBe('Título X');
    expect(article!.description).toBe('Resumo do feed.');
    expect(article!.source).toBe('G1');
    expect(article!.publishedAt).toBe('2026-05-20T10:00:00.000Z');
    expect(article!.id).toBe(articleId('https://g1.globo.com/n/1'));
  });

  it('retorna null sem link ou sem título', () => {
    expect(toArticle({ title: 'Só título' }, source, fetchedAt)).toBeNull();
    expect(toArticle({ link: 'https://x.com/só-link' }, source, fetchedAt)).toBeNull();
  });

  it('cai pro fetchedAt quando a data é inválida/ausente', () => {
    const article = toArticle({ title: 'T', link: 'https://x.com/a', pubDate: 'data-zoada' }, source, fetchedAt);
    expect(article!.publishedAt).toBe(fetchedAt);
  });

  it('extrai imagem de media:content', () => {
    const article = toArticle(
      { title: 'T', link: 'https://x.com/b', mediaContent: [{ $: { url: 'https://img/x.jpg', medium: 'image' } }] },
      source,
      fetchedAt,
    );
    expect(article!.imageUrl).toBe('https://img/x.jpg');
  });
});

describe('dedupeByUrl', () => {
  it('mantém o primeiro artigo por id', () => {
    const mk = (url: string, source: string): Article => ({
      id: articleId(url),
      url,
      source,
      title: 't',
      description: 'd',
      publishedAt: '2026-05-20T10:00:00.000Z',
      fetchedAt: '2026-05-20T12:00:00.000Z',
    });
    const out = dedupeByUrl([
      mk('https://a.com/1?utm_source=rss', 'G1'),
      mk('https://www.a.com/1', 'CNN Brasil'),
      mk('https://a.com/2', 'G1'),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.source).toBe('G1');
  });
});
