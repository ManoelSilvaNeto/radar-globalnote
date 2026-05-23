// Filtro do nicho do Radar: desastres naturais e causados pelo homem + acidentes.
// Mantém só os artigos cujo título/descrição batem com alguma palavra-chave.
// Trocar esta lista = re-mirar o portal pra outro nicho (este é o ponto que muda
// quando o molde vira games/religião/viagens/etc.).

import type { Article } from '../src/lib/types';

// Termos NORMALIZADOS (minúsculo, sem acento). Específicos de propósito, pra
// evitar puxar crime/violência (homicídio, tiroteio…), que estão fora do escopo.
export const NICHE_KEYWORDS: string[] = [
  // desastres naturais
  'enchente', 'enchentes', 'inundacao', 'inundacoes', 'alagamento', 'alagamentos',
  'deslizamento', 'deslizamentos', 'soterr', 'desabamento', 'desabou', 'desmoronamento',
  'seca', 'estiagem', 'terremoto', 'tremor de terra', 'abalo sismico', 'tsunami',
  'ciclone', 'tornado', 'furacao', 'tempestade', 'temporal', 'granizo', 'vendaval',
  'ressaca do mar', 'onda de calor', 'onda de frio', 'geada forte', 'erosao',
  // incêndios
  'incendio', 'incendios', 'queimada', 'queimadas', 'em chamas', 'pega fogo', 'pegou fogo',
  // causados pelo homem / industriais
  'explosao', 'explodiu', 'vazamento', 'rompimento de barragem', 'barragem',
  'contaminacao', 'intoxicacao em massa',
  // acidentes (trânsito / aéreo / náutico / etc.)
  'acidente', 'acidentes', 'colisao', 'capotamento', 'capotou', 'atropelamento',
  'atropelou', 'engavetamento', 'descarrilamento', 'descarrilou', 'naufragio',
  'naufragou', 'afogamento', 'afogou', 'queda de aviao', 'queda de helicoptero',
  'aviao caiu', 'helicoptero caiu', 'pouso forcado', 'queda de aeronave',
  // resposta / impacto
  'desastre', 'tragedia', 'defesa civil', 'soterrados', 'desaparecidos apos',
  'evacuacao', 'desabrigados', 'desalojados',
];

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

export function matchesNiche(article: Article): boolean {
  const hay = norm(`${article.title} ${article.description}`);
  return NICHE_KEYWORDS.some((k) => hay.includes(k));
}

export function filterNiche(articles: Article[]): Article[] {
  return articles.filter(matchesNiche);
}
