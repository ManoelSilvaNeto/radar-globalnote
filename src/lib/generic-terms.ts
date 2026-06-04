// Termos genéricos (normalizados: lowercase, sem acento) que NÃO são nomes próprios
// distintivos: estado/governo, conectores, datas, tipos de evento, pessoas/veículos/
// lugares genéricos, marcadores editoriais e gentílicos. Fonte única compartilhada —
// usado pelas páginas-tema (topics.ts, p/ bloquear hubs rasos) e pela validação do
// editorial (editorial.ts, p/ a trava anti-alucinação não confundir palavra comum
// capitalizada — "País", "Região", "Governo" — com nome próprio inventado).
//
// Módulo SEM dependências (nada de import.meta.glob): pode ser importado tanto pelo
// site (Astro/Vite) quanto pelo pipeline (tsx/node).

export const GENERIC = new Set([
  // Estado / governo
  'brasil', 'governo', 'pais', 'presidente', 'ministro', 'ministra', 'ministerio',
  'policia', 'justica', 'congresso', 'camara', 'senado', 'estado', 'cidade',
  'governador', 'governadora', 'prefeito', 'prefeita', 'autoridades',
  // Conectores / marcadores discursivos
  'para', 'pela', 'pelo', 'pelos', 'pelas', 'ante', 'entre', 'desde', 'sem', 'sob',
  'apos', 'veja', 'entenda', 'saiba', 'como', 'onde', 'quando', 'porque', 'isso', 'isto',
  'este', 'esta', 'esse', 'essa', 'novo', 'nova', 'novos', 'novas', 'hoje', 'ontem', 'amanha',
  'mais', 'menos', 'agora', 'ainda', 'tudo', 'nada', 'sobre', 'contra', 'durante',
  // Datas
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro',
  'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo',
  // Tipos genéricos de evento (cobertos pelas próprias categorias do site)
  'acidente', 'acidentes', 'colisao', 'capotamento', 'atropelamento',
  'engavetamento', 'incidente', 'ocorrencia', 'caso', 'casos',
  'enchente', 'enchentes', 'alagamento', 'alagamentos',
  'deslizamento', 'deslizamentos', 'desabamento', 'desmoronamento',
  'terremoto', 'tsunami', 'tempestade', 'temporal', 'granizo', 'vendaval',
  'incendio', 'incendios', 'queimada', 'queimadas',
  'explosao', 'vazamento', 'contaminacao',
  'naufragio', 'descarrilamento',
  'desastre', 'desastres', 'tragedia', 'tragedias',
  // Pessoas genéricas
  'motorista', 'motoristas', 'condutor', 'condutora',
  'vitima', 'vitimas', 'morto', 'mortos', 'morta', 'mortas',
  'ferido', 'feridos', 'ferida', 'feridas',
  'homem', 'homens', 'mulher', 'mulheres', 'crianca', 'criancas',
  'idoso', 'idosos', 'jovem', 'jovens', 'pessoa', 'pessoas',
  'trabalhador', 'trabalhadores', 'familia', 'familias',
  'morador', 'moradores', 'morre', 'morreu', 'morrer',
  // Veículos genéricos
  'veiculo', 'veiculos', 'carro', 'carros', 'caminhao', 'caminhoes',
  'onibus', 'moto', 'motos', 'motocicleta', 'motocicletas',
  'aviao', 'avioes', 'helicoptero', 'aeronave', 'navio', 'barco',
  'trem', 'metro',
  // Lugares genéricos (não-distintivos — quando aparecem com nome próprio viram multi-word, OK)
  'rodovia', 'rua', 'avenida', 'estrada', 'bairro', 'regiao',
  'area', 'local', 'centro', 'periferia', 'capital', 'interior',
  // Marcadores editoriais (VÍDEO, FOTO, AO VIVO etc → ruído quando picked up como tema)
  'video', 'videos', 'foto', 'fotos', 'imagem', 'imagens',
  'audio', 'audios', 'exclusivo', 'urgente', 'ultima',
  // Serviços de emergência (sem especificador — "PRF" sozinho seria útil; "bombeiros" sozinho é genérico)
  'bombeiros', 'samu',
  // Outros genéricos amplos demais pra virar hub útil
  'onda', // "Onda" sozinho — multi-word "Onda de calor" passa por phenomena detection
  'europa', 'asia', 'africa', 'oceania', 'america', 'mundo', 'globo',
  // Pessoas no trânsito (genéricas — quase toda matéria do nicho)
  'motociclista', 'motociclistas', 'ciclista', 'ciclistas',
  'pedestre', 'pedestres', 'passageiro', 'passageiros',
  // Gentílicos (adjetivo de origem — quase sempre genérico em manchetes)
  'brasileiro', 'brasileira', 'brasileiros', 'brasileiras',
  'paulista', 'paulistano', 'carioca', 'mineiro', 'gaucho', 'baiano',
  'cearense', 'pernambucano', 'paranaense', 'catarinense',
  'sergipano', 'alagoano', 'maranhense', 'piauiense', 'paraibano',
  'capixaba', 'goiano', 'amazonense', 'paraense', 'brasiliense',
  'fluminense', 'rondoniense', 'roraimense', 'tocantinense', 'acreano',
]);
