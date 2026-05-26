# Brief para Claude Code — Correções no projeto `radar.globalnote`

> **Como usar este arquivo:** salve-o na raiz do repositório do projeto (ou em `/docs`) e, no Claude Code, rode algo como:
> `Leia o arquivo BRIEF_RADAR_FIXES.md, monte um plano de execução priorizado e me mostre antes de começar. Comece pelo Bug #1.`

---

## 1. Contexto do produto

- **URL em produção:** https://radar.globalnote.com.br
- **Propósito declarado** (meta tags + rodapé):
  > "Cobertura automática e neutra de desastres naturais, acidentes e ocorrências de risco no Brasil e no mundo, com resumo, contexto e link para as fontes originais."
- **Categorias do escopo:** Geral, Acidente de trânsito, Explosão, Enchente, Incêndio, Acidente de trabalho.
- **Pipeline (inferido):** ingestão de matérias de veículos de imprensa → extrator de conteúdo → resumidor por IA → classificador de categoria → publicação.
- **Disclaimer atual no rodapé:** "Resumos por IA — podem conter imprecisões; confira sempre na fonte." (manter)

## 2. Auditoria — o que está coerente

Manter como está:
- Identidade visual, tagline, edição datada do dia.
- Estrutura de card (manchete + resumo + "Por que importa" + fontes + WhatsApp).
- SEO (canonical, OG, Twitter card, viewport, robots).
- Newsletter opt-in.
- Disclaimer de IA no rodapé.

## 3. Bugs priorizados — atacar nesta ordem

### Bug #1 — CRÍTICO: manchete, link e imagem desencontrados
**Sintoma observado na home (26/05/2026):**
Card em destaque diz *"Trem colide com ônibus escolar na Bélgica"*, mas o link do título e as duas "fontes" (CNN Brasil e G1) apontam para matérias de **Minas Gerais (BR-251, vítima carbonizada)**. A imagem destacada/OG é da notícia da Bélgica.

**Hipótese:** algum passo do pipeline está reutilizando o `source_url` de outra matéria, ou o classificador agrupou duas notícias distintas no mesmo "item" e os campos `title`, `image`, `sources[]` ficaram fora de sincronia.

**Investigar:**
- Tabela/coleção que persiste a notícia agregada. Procurar registros onde `title` não combina semanticamente com `sources[].url` ou `og_image`.
- Função que monta o objeto final antes de salvar — verificar se há mistura entre o "item canônico" e os "itens similares" ao deduplicar.

**Aceite:**
- O texto da manchete, o `href` do `<h2><a>`, a imagem destacada e cada item de `Fontes:` precisam pertencer ao mesmo evento.
- Script de validação que percorre os últimos 200 itens e flagra qualquer mismatch (similaridade < limiar entre `title` e `og:title` de cada fonte).

---

### Bug #2 — Desvio de escopo na categoria "Geral"
**Sintoma:** "Geral" está absorvendo pauta política/eleitoral, fora do propósito do produto. Exemplos da home de hoje:
- *"OAB-PR pede afastamento cautelar de desembargador suspeito de vender decisão judicial"*
- *"Audio de Flávio Marqueteiro chama Vorcaro de 'meu irmão' gera debate sobre impacto na disputa eleitoral"*

**Hipótese:** o classificador trata "Geral" como fallback de qualquer notícia que não bateu nas outras 5 categorias, em vez de exigir que ela seja **um desastre/risco/alerta que não cabe nas 5 específicas**.

**Investigar:**
- Lógica do classificador. Adicionar gate: antes de cair em "Geral", checar se a matéria tem sinais de risco/dano/desastre (palavras-chave, NER de vítimas, números de feridos/mortos, eventos climáticos, etc.). Se não tiver, **descartar**, não publicar.
- Reclassificar/despublicar retroativamente os itens políticos já no ar.

**Aceite:**
- Nenhuma matéria de política eleitoral, judicial corrupcional ou similar entra em "Geral".
- A categoria "Geral" só recebe matérias que claramente são risco/dano/alerta e que não cabem nas categorias específicas.

---

### Bug #3 — Alucinação/distorção de nomes próprios pela IA
**Sintoma:** Título *"Audio de Flávio Marqueteiro chama Vorcaro de 'meu irmão'"* — "Marqueteiro" não é sobrenome. O arquivo da imagem é `flavio-bolsonaro.jpg`. A IA distorceu uma entidade real ao gerar o resumo/título.

**Investigar:**
- O prompt do resumidor. Adicionar regra explícita: **não inferir, completar ou substituir nomes próprios**. Se o nome não aparece literalmente no texto-fonte, usar pronome ou descrição.
- Pós-processo de validação: extrair os nomes próprios do título gerado e checar se aparecem literalmente em **pelo menos uma** das fontes. Se não, rejeitar e regenerar.

**Aceite:**
- 0 títulos com nomes inventados/distorcidos numa amostra de 100 publicações.

---

### Bug #4 — Lixo de parser no início do resumo
**Sintoma:** vários resumos começam com legenda de foto + crédito colados ao corpo da matéria:
- *"Base alvo dos criminosos PRF Dois homens foram detidos…"*
- *"Homem precisou ser socorrido Arquivo pessoal Um trabalhador…"*
- *"…o veículo foi encontrado às margens da rodovia após sair da pista e capotar Kelvin Ramirez/Só Notícias Um motorista identificado como…"*

**Investigar:**
- O extrator de texto (`readability`/`trafilatura`/`newspaper3k`/seletor próprio). Está concatenando `<figcaption>`/`figure > p` com o corpo.
- Antes de mandar para o resumidor: aplicar regex/heurística para remover blocos curtos terminados em crédito de foto (padrões: `/Arquivo pessoal`, `/Divulgação`, `/PRF`, `nome próprio / veículo`).

**Aceite:**
- Resumos não começam mais com legenda de foto.
- Adicionar teste automatizado com fixtures dos casos acima.

---

### Bug #5 — Inconsistência temporal nos resumos
**Sintoma:** Notícia da Petronas (Malásia) está datada de 25/05/2026 no card, mas o resumo diz *"no fim da tarde de domingo, 24 de março"*. A IA copiou a data da matéria-fonte sem checar se faz sentido.

**Investigar:**
- Prompt do resumidor. Adicionar instrução: ao mencionar data, usar **"em [dia da semana] (DD/MM)"** apenas se a data estiver explicitamente no texto-fonte E for posterior a `now() - 30 dias`. Caso contrário, omitir.
- Validador pós-geração: extrair menções de data do resumo e comparar com `published_at` da fonte.

**Aceite:**
- Datas no resumo são consistentes com a data de publicação da fonte (tolerância: a data do evento pode ser anterior à publicação, mas nunca incoerente com o calendário atual).

---

### Bug #6 — Inconsistência editorial: "Por que importa" falta em algumas notícias
**Sintoma:** alguns cards têm o bloco *"Por que importa"*, outros não. O template promete o bloco.

**Investigar:**
- Pipeline de geração. Se o resumidor não retorna o campo, regenerar até obter ou marcar a notícia como "rascunho" e não publicar.

**Aceite:**
- 100% dos cards publicados têm o bloco "Por que importa" (ou o produto decide remover do template — mas é tudo ou nada).

---

### Bug #7 — "Temas em alta" genéricos demais
**Sintoma:** as tags atuais são *"Acidente", "Motorista", "VÍDEO"*. Não ajudam navegação.

**Investigar:**
- Lógica de extração de tags. Trocar por entidades nomeadas relevantes ao nicho: rodovias (`BR-163`, `BR-251`), localidades (`Shanxi`, `Pantanal`, `Buggenhout`), fenômenos (`El Niño`, `onda de calor`).

**Aceite:**
- Top 10 de tags em alta contém ao menos 7 entidades específicas (lugar, evento, fenômeno climático), não termos genéricos.

---

### Bug #8 — Falta indicador de freshness no topo
**Sintoma:** o site é alimentado em tempo real mas isso só fica claro no rodapé.

**Sugestão:** adicionar selo "Atualizado há X minutos" abaixo da edição do dia. Reforça o diferencial e dá sinal de vida.

**Aceite:**
- Selo renderiza com o timestamp da última publicação bem-sucedida.

## 4. Critérios transversais

- **Sem regressão de SEO:** manter canonical, OG, Twitter card, sitemap.
- **Cobertura de teste:** cada bug corrigido vem com pelo menos um teste (unitário ou de integração) que reproduz o sintoma antes do fix.
- **Migração de dados existentes:** os bugs #1, #2 e #3 exigem **reprocessar/despublicar** os itens já no ar que se encaixam nos sintomas. Documentar o script de migração.
- **Logs e observabilidade:** logar quando o classificador descarta uma matéria (Bug #2), quando o validador rejeita um título por alucinação (Bug #3) e quando o validador rejeita por data inconsistente (Bug #5).

## 5. Onde começar a investigação (perguntas para o Claude Code mapear no repo)

1. Onde fica o orquestrador do pipeline (ingestão → resumo → classificação → publicação)?
2. Qual a estrutura do registro persistido por notícia (campos: `title`, `summary`, `why_matters`, `category`, `sources[]`, `og_image`, `published_at`, `source_published_at`)?
3. Qual modelo de IA é usado para resumo? Onde está o prompt?
4. Qual extrator de conteúdo está em uso? (readability, trafilatura, newspaper3k, seletores próprios?)
5. Existe etapa de deduplicação/agrupamento de matérias que cobrem o mesmo evento? Onde?

---

**Resumo de prioridade:** Bug #1 e Bug #3 mexem com credibilidade — atacar primeiro. Bug #2 mexe com posicionamento — atacar em seguida. Bugs #4, #5, #6 são qualidade editorial. #7 e #8 são melhorias.
