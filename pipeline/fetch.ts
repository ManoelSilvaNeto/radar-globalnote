// Coleta os feeds RSS/Atom, normaliza cada item pro tipo Article e deduplica
// por URL. Cada feed tem timeout próprio e é isolado em try/catch: um feed fora
// do ar é logado e ignorado, nunca derruba o run.

import Parser from 'rss-parser';
import type { Article, Source } from '../src/lib/types';
import { SOURCES } from './sources';
import { articleId } from './url';

export { articleId, normalizeUrl } from './url';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_DESCRIPTION = 600;
const USER_AGENT =
  'Mozilla/5.0 (compatible; GlobalRadar/1.0; +https://radar.globalnote.com.br)';

// Itens de feed só têm os campos que a gente usa (tipagem frouxa de propósito).
type FeedItem = {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  summary?: string;
  enclosure?: { url?: string; type?: string };
  mediaContent?: Array<{ $?: { url?: string; medium?: string; type?: string } }>;
  mediaThumbnail?: { $?: { url?: string } };
};

const parser: Parser<unknown, FeedItem> = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
    ],
  },
});

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

export function stripHtml(input: string): string {
  return input
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;|&#39;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

// Bug #4: descriptions de RSS BR muitas vezes começam com legenda de foto +
// crédito coladas ao corpo (ex: "Base alvo dos criminosos PRF Dois homens foram
// detidos..."). A IA acaba usando esse lixo como início do resumo. Aqui detecta
// um conjunto de padrões de crédito de foto no PREFIXO da description e remove
// tudo até o crédito, deixando o corpo limpo. Conservador: só corta se a parte
// removida é curta E o corpo restante é o dominante (>caption, ≥40 chars).
const CAPTION_END_PATTERNS: RegExp[] = [
  // "Arquivo pessoal", "Divulgação", "Reprodução" (com ou sem /outlet)
  /\s+(?:Arquivo pessoal|Divulgação|Reprodução(?:\/[A-Za-zÀ-ÿ\s]{1,30})?)\s+(?=[A-ZÀ-Ý][a-zà-ÿ])/u,
  // "Foto: <pessoa/outlet>" ou "Crédito: ..."
  /\s+(?:Foto|Crédito|Credito|Imagem):\s+[A-Za-zÀ-ÿ\s\/]{2,40}?\s+(?=[A-ZÀ-Ý][a-zà-ÿ])/u,
  // Siglas institucionais conhecidas (PRF, PMERJ, CBM…)
  /\s+(?:PRF|PMERJ|PRE|PMSP|PCSP|PMRJ|PCMG|PCBA|PCDF|GCM|PF|CBMERJ|CBM|INMET|CENIPA|SAMU|Defesa Civil)\s+(?=[A-ZÀ-Ý][a-zà-ÿ])/u,
  // Nome próprio (1-3 palavras) / Outlet — "Kelvin Ramirez/Só Notícias"
  /\s+[A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ]+){0,2}\/[A-ZÀ-Ý][A-Za-zÀ-ÿ]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ]+){0,3}\s+(?=[A-ZÀ-Ý][a-zà-ÿ])/u,
];

export function stripCaption(text: string): string {
  if (!text || text.length < 50) return text;
  for (const re of CAPTION_END_PATTERNS) {
    const m = text.match(re);
    if (!m || m.index === undefined) continue;
    const matchStart = m.index;
    const matchEnd = matchStart + m[0].length;
    // Legenda fica no início; se o marcador apareceu depois de 120 chars, é
    // provável que seja parte do corpo, não uma legenda.
    if (matchStart > 120) continue;
    const caption = text.slice(0, matchStart);
    const body = text.slice(matchEnd).trim();
    if (caption.length < 5) continue; // pouco antes do marcador: provavelmente corpo
    if (body.length < 40) continue; // sobrou pouco: marcador no fim, não no início
    if (caption.length >= body.length) continue; // corpo deve dominar
    return body;
  }
  return text;
}

function looksLikeImage(url: string | undefined): boolean {
  return !!url && /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url);
}

function extractImage(item: FeedItem): string | undefined {
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;
  for (const m of item.mediaContent ?? []) {
    const url = m.$?.url;
    if (url && (m.$?.medium === 'image' || m.$?.type?.startsWith('image/') || looksLikeImage(url))) {
      return url;
    }
  }
  if (item.enclosure?.url && (item.enclosure.type?.startsWith('image/') || looksLikeImage(item.enclosure.url))) {
    return item.enclosure.url;
  }
  const html = item.content ?? item.summary ?? '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1];
}

function toIso(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

// Converte um item de feed num Article normalizado. Retorna null se faltar o
// essencial (link ou título).
export function toArticle(item: FeedItem, source: Source, fetchedAt = new Date().toISOString()): Article | null {
  const url = item.link?.trim();
  const title = item.title ? stripHtml(item.title) : '';
  if (!url || !title) return null;

  const rawDesc = item.contentSnippet ?? item.summary ?? item.content ?? item.title ?? '';
  const description = truncate(stripCaption(stripHtml(rawDesc)), MAX_DESCRIPTION);

  return {
    id: articleId(url),
    url,
    source: source.name,
    title,
    description,
    imageUrl: extractImage(item),
    publishedAt: toIso(item.isoDate ?? item.pubDate, fetchedAt),
    fetchedAt,
  };
}

// Remove duplicatas mantendo o primeiro Article visto por id (URL normalizada).
export function dedupeByUrl(articles: Article[]): Article[] {
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const a of articles) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

// Decodifica o corpo do feed respeitando o charset declarado no XML (alguns
// portais BR ainda usam ISO-8859-1).
function decodeBody(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 300));
  const declared = head.match(/encoding=["']([^"']+)["']/i)?.[1]?.toLowerCase();
  let label = declared ?? 'utf-8';
  if (label === 'iso-8859-1' || label === 'latin1') label = 'windows-1252';
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

// Busca e parseia um feed. Lança em erro/timeout (o chamador trata).
async function fetchSource(source: Source): Promise<Article[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(source.url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = decodeBody(await res.arrayBuffer());
    const feed = await parser.parseString(xml);
    const fetchedAt = new Date().toISOString();
    const articles: Article[] = [];
    for (const item of feed.items ?? []) {
      const article = toArticle(item, source, fetchedAt);
      if (article) articles.push(article);
    }
    return articles;
  } finally {
    clearTimeout(timer);
  }
}

// Coleta todas as fontes em paralelo; feeds que falham são logados e pulados.
export async function fetchAllSources(sources: Source[] = SOURCES): Promise<Article[]> {
  const results = await Promise.allSettled(sources.map(fetchSource));
  const all: Article[] = [];
  results.forEach((result, i) => {
    const source = sources[i]!;
    if (result.status === 'fulfilled') {
      all.push(...result.value);
      console.log(`  ✓ ${source.name} — ${result.value.length} artigos`);
    } else {
      console.warn(`  ✗ ${source.name} — ${String(result.reason).slice(0, 120)}`);
    }
  });
  const deduped = dedupeByUrl(all);
  console.log(`coleta: ${all.length} artigos brutos → ${deduped.length} após dedup`);
  return deduped;
}
