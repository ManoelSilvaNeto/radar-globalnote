// Filtro do nicho do Radar: desastres naturais e causados pelo homem + acidentes.
// Trocar esta lista = re-mirar o portal pra outro nicho (este é o ponto que muda
// quando o molde vira games/religião/viagens/etc.).
//
// Bug #2 (2026-05-26): a v1 era keyword-only, com palavras genéricas tipo
// "acidente"/"tragédia" deixando passar política/judicial. Agora separamos:
// - STANDALONE: eventos inequivocamente do nicho (enchente, deslizamento, tsunami).
//   Passa sozinho — qualquer ocorrência desses termos já é matéria nossa.
// - AMBIGUOUS: termos usados também em sentido figurado/incidental
//   ("acidente de percurso", "tragédia política", "explosão de protestos").
//   Exige corroboração via DAMAGE_SIGNALS (morto, ferido, vítima, etc).

import type { Article } from '../src/lib/types';

// Eventos inequívocos do nicho — passam sozinhos.
export const STANDALONE_NICHE: string[] = [
  // desastres naturais
  'enchente', 'enchentes', 'inundacao', 'inundacoes', 'alagamento', 'alagamentos',
  'deslizamento', 'deslizamentos', 'soterr', 'desabamento', 'desabou', 'desmoronamento',
  'estiagem', 'terremoto', 'tremor de terra', 'abalo sismico', 'tsunami',
  'ciclone', 'tornado', 'furacao', 'tempestade', 'temporal', 'granizo', 'vendaval',
  'ressaca do mar', 'onda de calor', 'onda de frio', 'geada forte', 'erosao',
  // incêndios (florestais e estruturais) — sempre literais quando ocorrem nessa forma
  'queimada', 'queimadas',
  // industriais / infraestrutura
  'rompimento de barragem',
  // transporte com modal específico
  'naufragio', 'naufragou', 'descarrilamento', 'descarrilou',
  'queda de aviao', 'queda de helicoptero', 'queda de aeronave',
  'aviao cai', 'aviao caiu', 'helicoptero cai', 'helicoptero caiu',
  'pouso forcado',
  // resposta institucional
  'defesa civil', 'desabrigados', 'desalojados',
];

// Termos do nicho com uso ambíguo — exigem corroboração de damage signal.
export const AMBIGUOUS_NICHE: string[] = [
  'acidente', 'acidentes', 'colisao', 'capotamento', 'capotou',
  'atropelamento', 'atropelou', 'engavetamento', 'afogamento', 'afogou',
  'incendio', 'incendios', 'em chamas', 'pega fogo', 'pegou fogo',
  'explosao', 'explodiu', 'vazamento', 'barragem', 'contaminacao',
  'intoxicacao em massa',
  'desastre', 'tragedia',
  'seca', // pode ser figurada ("seca de vitórias")
  'evacuacao',
];

// Indicadores concretos de dano/vítima/impacto — corroboram que o termo ambíguo
// está sendo usado no sentido literal de desastre.
export const DAMAGE_SIGNALS: string[] = [
  'morto', 'mortos', 'morte', 'mortes', 'morre', 'morreu', 'morrer', 'morrem', 'morta', 'mortas',
  'matou', 'mataram', 'fatal', 'fatais',
  'ferido', 'feridos', 'ferida', 'feridas', 'feriu', 'feriram', 'ferimento', 'ferimentos',
  'vitima', 'vitimas', 'lesao', 'lesoes', 'lesionado', 'lesionados',
  'desaparecido', 'desaparecidos', 'desaparecida', 'desaparecidas',
  'soterrado', 'soterrados', 'soterrada', 'soterradas',
  'destruido', 'destruidos', 'destruida', 'destruidas', 'destruiu', 'destroi', 'destruicao',
  'atingido', 'atingidos', 'atingida', 'atingidas',
  'evacuado', 'evacuados', 'resgatado', 'resgatados', 'resgate',
  'hospitalizado', 'hospitalizados', 'internado', 'internados',
  'socorrido', 'socorridos', 'socorrer',
  'sem feridos', // bate em "acidente sem feridos" — é literal mesmo sem vítima
];

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

export function matchesNiche(article: Article): boolean {
  const hay = norm(`${article.title} ${article.description}`);
  // Standalone niche match → passa direto.
  if (STANDALONE_NICHE.some((k) => hay.includes(k))) return true;
  // Ambiguous niche match → só passa com corroboração de dano.
  if (AMBIGUOUS_NICHE.some((k) => hay.includes(k))) {
    return DAMAGE_SIGNALS.some((s) => hay.includes(s));
  }
  return false;
}

export function filterNiche(articles: Article[]): Article[] {
  return articles.filter(matchesNiche);
}

// Helper exportado pra usar no gate pós-IA (pipeline/index.ts): verifica se o
// cluster como um todo tem sinal de dano. Usado pra descartar histórias que a
// IA classificou como "Geral" (catch-all) mas que não são realmente do nicho.
export function clusterHasDamageSignal(articles: Article[]): boolean {
  const hay = articles
    .map((a) => norm(`${a.title} ${a.description}`))
    .join(' ');
  return DAMAGE_SIGNALS.some((s) => hay.includes(s));
}

// Cluster bate em alguma palavra do nicho STANDALONE (evento inequívoco). Se sim,
// está em-escopo pela própria natureza do termo — não precisa de damage signal.
// Usado pelo gate pra evitar descartar histórias legítimas sobre enchente/
// deslizamento/etc. quando a IA não categorizou (caiu em "Geral") e o cluster
// não tem morto/ferido explícito (ex: notícia sobre AJUDA financeira pós-evento).
export function clusterIsStandaloneNiche(articles: Article[]): boolean {
  const hay = articles
    .map((a) => norm(`${a.title} ${a.description}`))
    .join(' ');
  return STANDALONE_NICHE.some((k) => hay.includes(k));
}
