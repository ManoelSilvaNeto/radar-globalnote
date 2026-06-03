# GlobalNote Radar — instruções do projeto

> Este arquivo é carregado automaticamente quando o Claude roda a partir desta pasta.
> Se você (Claude) está retomando daqui, **leia tudo abaixo antes de agir**.

## O que é

**GlobalNote Radar** (`radar.globalnote.com.br`) é a **1ª réplica** de uma **"fábrica" de portais verticais** sob `globalnote.com.br`. Todos são **clones do GlobalNotícias** (`noticias.globalnote.com.br`) — muda **só o conteúdo** (nicho/fontes/categorias/nome); infra, SEO, redes e **ícone** são os mesmos. Próximos da fábrica: games, religião, viagens…

**Nicho do Radar:** desastres naturais e causados pelo homem; acidentes em geral (trânsito, doméstico, aéreo, industrial, etc.).

**MOLDE de referência (copiar dele):** `~/Projetos/GlobalNoticias/` — projeto pronto, em produção. O Radar reusa toda a arquitetura dele.

## ⏳ Estado atual (2026-05-24)

**SCAFFOLD PRONTO, NO GITHUB E PUBLICADO.** O molde foi copiado e adaptado (categorias dinâmicas + filtro de nicho + rebrand). Repo público: **github.com/ManoelSilvaNeto/radar-globalnote**. CI (GitHub Actions) **verde** e **deploy ativo na Cloudflare Pages**. Pipeline validado: ~540→45 artigos do nicho, ~12 clusters/run.

**✅ IA MIGRADA DO GEMINI → GROQ (2026-05-24) E VALIDADA EM PRODUÇÃO.** Resolve o impasse da chave: a conta Google do dono atingiu o **limite de projetos** e não criava chave Gemini nova. Trocamos para **Groq (free tier, sem cartão)** — folga absurda pra ~22/dia do Radar e pra **fábrica inteira na MESMA chave**, sem depender do Google. `pipeline/summarize.ts` usa `GroqSummarizer` via `fetch` (API compatível com OpenAI); `@google/genai` removido. Secret = `GROQ_API_KEY` (já cadastrado no repo). **Modelo padrão `openai/gpt-oss-20b` com structured outputs ESTRITOS (`json_schema`) — JSON garantido por constrained decoding.** ⚠️ Aprendizado: começamos com `llama-3.3-70b-versatile` + `json_object`, mas a Groq retornava 400 "Failed to generate JSON" intermitente (1 de 12 passou). Modelos que suportam schema estrito: `openai/gpt-oss-20b` / `gpt-oss-120b`. Parsing tolerante (`parseJsonObject`) cobre o resto.

**🚀 SITE NO AR (2026-05-24): https://radar-wly.pages.dev** — deploy feito, HTTP 200, IA gerando resumos (cache=22 IA=2 fallback=0, 6 categorias dinâmicas). Os **3 secrets estão cadastrados** (`GROQ_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). ⚠️ O subdomínio ficou **`radar-wly.pages.dev`** (o `radar.pages.dev` já estava tomado por outra conta) — é esse o alvo do CNAME. Account ID Cloudflare: `e8cf1a217ad1957c7fd9ee29db14daaf`.

**🌐 DOMÍNIO PRÓPRIO NO AR (2026-05-24, 22:13 UTC): https://radar.globalnote.com.br** — CNAME `radar` → `radar-wly.pages.dev.` adicionado pelo dono no registro.br (zona DNS gerenciada pelo próprio registro.br, NS `*.sec.dns.br` — não usa NS da Cloudflare; mesmo padrão do `noticias`). Cloudflare validou e emitiu SSL sozinha (cert Google Trust Services, emitido 21:12 GMT). Verificado: HTTP 200, SSL ok, `<title>` correto. **Infra 100% concluída.**

**⭐ PROPAGAÇÃO (etapa 5) — CONCLUÍDA. Histórico dos 5 canais abaixo:**
1. ~~Secrets~~ ✅ feito (GROQ + Cloudflare token/account, validados).
2. ~~Deploy~~ ✅ feito — Pages `radar` criado, site no ar em `radar-wly.pages.dev`.
3. ~~Custom domain no Pages~~ ✅ feito via API — `radar.globalnote.com.br` adicionado ao projeto `radar`.
4. ~~CNAME no registro.br~~ ✅ **feito pelo dono — domínio no ar com SSL** (ver acima).
5. **⏳ Propagação** (depende de o dono criar contas):
   - **a. Google Search Console** ✅ **feito (2026-05-24)** — propriedade `https://radar.globalnote.com.br` (tipo "prefixo do URL") verificada por **Arquivo HTML** (`public/google82243445ca744e73.html`, NÃO remover) + **sitemap `sitemap-index.xml` enviado**. ⚠️ **Aprendizado p/ a fábrica:** o Cloudflare Pages faz clean-URL e redireciona `/arquivo.html` → `/arquivo` (308), mas o verificador do Google **segue o redirect** e valida normal (o corpo no destino é 200 e correto). Não precisa workaround.
   - **b. Bing Webmaster** ✅ **feito (2026-05-24)** — `radar.globalnote.com.br` importado do GSC (já verificado + sitemap herdado). IndexNow já pinga o Bing a cada deploy.
   - **c. Google News / Publisher Center** ✅ **feito (2026-05-24)** — publicação "GlobalNote Radar" criada/reivindicada (`https://radar.globalnote.com.br`), em revisão assíncrona do Google. ⚠️ Desde a **atualização de março/2025** o Google Notícias **gera as páginas de publicação automaticamente** assim que o site está indexado — o Publisher Center virou só controle de marca (logo etc.), não é bloqueante. (Logo quadrado opcional em `public/logo.png` 1000×1000.)
   - **d. Bluesky + Mastodon** ✅ **feito (2026-05-24)** — contas novas:
     - **Bluesky** `radarbr.bsky.social` (alias `ti+radarbr@…`) — secrets `BLUESKY_HANDLE` + `BLUESKY_APP_PASSWORD`.
     - **Mastodon** `@radarbr@mastodon.social` (alias `ti+radarmasto@…`, app "Globalnote Radar" scope `write`) — secrets `MASTODON_INSTANCE` (`https://mastodon.social`) + `MASTODON_TOKEN`.
     - Todos cadastrados via `gh secret set`. Testado em runs manuais: ambos `HTTP 200`, posts no ar com link + hashtags de nicho (`#acidente #brasil`). **As 2 redes postam sozinhas a cada edição** (mesma história nas duas; dedup em `data/social.json`).
   - **e. Newsletter (Buttondown)** ✅ inscrição feita (2026-05-25) + ✅ **ENVIO AUTOMÁTICO implementado (2026-06-03, PR #4)** — conta nova `radarbr` (e-mail `mvsilvaneto@hotmail.com`, display "Manoel Neto"). `NEWSLETTER.buttondownUser='radarbr'` em `src/lib/site.ts` → bloco "Receba as notícias por e-mail" no ar (`embed-subscribe/radarbr`). Plano free, sem cartão. ⚠️ **Aprendizado (2026-06-03):** o embed só CAPTAVA inscritos; **nada enviava edições** (cron parava no social) — inscritos não recebiam nada. Resolvido: `pipeline/newsletter.ts` (espelha `social.ts`) monta digest Markdown dos top destaques e dispara via API do Buttondown (`POST /v1/emails`, `status=about_to_send` + headers `X-API-Version: 2026-04-01` e `X-Buttondown-Live-Dangerously: true` — a API 2026-04-01 passou a exigir isso, senão 400 `sending_requires_confirmation`). **Cadência: 1 e-mail/dia** (dedup por data da edição em `data/newsletter.json` + janela `NEWSLETTER_SEND_HOUR_UTC` default 12h UTC ≈ 09h BRT). No-op sem `BUTTONDOWN_API_KEY`. Escapes: `NEWSLETTER_DRY_RUN=1`, `NEWSLETTER_FORCE=1`. **⏳ Pendência manual:** dono pegar a API key (Buttondown → Settings → Programming) + `gh secret set BUTTONDOWN_API_KEY`; e confirmar que o e-mail da conta Buttondown está confirmado e o inscrito está *confirmed* (double opt-in) — senão a confirmação foi pro spam.
   - **SEM Telegram.**

**✅✅✅ ETAPA 5 COMPLETA (2026-05-25) — PROJETO 100% NO AR.** Infra + indexação (GSC/Bing/Google News) + redes (Bluesky/Mastodon auto-post) + newsletter, tudo concluído. O Radar roda sozinho: cron a cada 4h (`30 */4`) gera edição, faz deploy, pinga IndexNow, posta nas redes e (a partir de 2026-06-03) **envia a newsletter diária**. Próximos passos só seriam melhorias futuras (ex.: B2 regional/proximidade, adiado) ou replicar o padrão pra próximos portais da fábrica (games, religião, viagens…).

**🟢 Estado vivo (2026-06-03):** desde o último registro grande — **Cerebras fallback MERGEADO (PR #1, 2026-06-01) e secret cadastrado**; em produção `IA encadeada: groq → cerebras`, fallback caiu pra 0 (Groq dá 429 de TPD e o Cerebras assume). Cap IA já sobe pra 14 com o secret. PRs #2 (sitemap de notícias/Google News) e #3 (layout em grade no desktop) também entraram. **PR #4 (2026-06-03): envio automático da newsletter** (ver item 5e). Única pendência de código→produção: dono cadastrar `BUTTONDOWN_API_KEY`.

**📊 Cloudflare Web Analytics ATIVO (2026-05-25)** — `TOKEN='3ac33991998f4920b842976be335da09'` em `src/components/Analytics.astro` (site `radar.globalnote.com.br` criado no painel CF Web Analytics). Beacon confirmado no HTML de produção. Token é público (vai no HTML). Painel: dash.cloudflare.com → Analytics & Logs → Web Analytics. (Mesmo padrão do molde, que usa snippet JS manual — não a auto-analytics do Pages.)

**Contexto da fábrica (2026-05-26):** o **GlobalNotícias também usa Groq** (mesmo padrão, schema de 3 campos, em produção). **Cada portal da fábrica tem sua PRÓPRIA conta Groq** (e-mails separados) → quota independente. Radar = `mvsilvaneto.cel@gmail.com`; Notícias = a conta original (e-mail anterior). Crons mesmo assim ficam **defasados** por hábito (Notícias `0 */4`, Radar `30 */4`) — não é mais necessário por causa do rate-limit, mas não atrapalha. ⚠️ **Histórico:** começou compartilhado (uma conta servia os 2 portais), e o CLAUDE.md descrevia esse estado. Em algum ponto o dono criou a conta dedicada do Radar; descobrimos isso em 2026-05-26 ao diagnosticar fallback alto (era TPD individual do Radar estourando, não competição entre portais — ver próximo bloco).

**🪫 Cap de IA por run (2026-05-26):** descoberto que o **Radar isolado estoura o TPD da conta dedicada** quando o cache ainda está pequeno (~22 clusters, ~18% cache hit no início = ~12 chamadas IA novas por run × 6 runs/dia ≈ 60+ chamadas de ~5k tokens = bem acima do TPD free tier). Adicionado `IA_BUDGET_PER_RUN` em `pipeline/summarize.ts`: limita resumos NOVOS a 8/run (cache hits não contam). Override por env `GROQ_BUDGET_PER_RUN` (variable do repo, não secret). Como `pool` já vem ranqueado por score, o orçamento gasta IA nas histórias mais importantes. Conforme o cache amadurece (~64% do Notícias após semanas), o teto vira inerte. Se ainda assim estourar, abaixar pra 6.

**🧹 Sprint de fixes do brief (2026-05-26, à tarde):** o dono mandou `BRIEF_RADAR_FIXES.md` na raiz com 8 bugs priorizados; todos foram corrigidos numa sessão. 13 commits, 80 testes (era 34). Sumário do que mudou:
- **Bug #1 (cluster.ts + build-data.ts + summarize.ts):** threshold cosine 0.22→0.30, guarda de entidades nomeadas (rejeita join se entidades disjuntas e cosseno < HIGH_COSINE), sources/imagem agora vêm da âncora (não da semente) → display sempre alinhado com o resumo cacheado.
- **Bug #2 (niche.ts + index.ts):** niche em 2 camadas (STANDALONE passa sozinho; AMBIGUOUS exige DAMAGE_SIGNAL) + gate pós-IA descarta clusters "Geral" sem dano nem palavra standalone.
- **Bug #3 (summarize.ts):** regra de prompt + `hallucinatedNames()` rejeita títulos com entidade que não está nas fontes; cache hit com alucinação é invalidado.
- **Bug #4 (fetch.ts):** `stripCaption()` remove "Arquivo pessoal / Divulgação / PRF / Nome/Outlet" coladas no início da description.
- **Bug #5 (summarize.ts):** `dateInconsistency()` rejeita resumos com menção de mês fora da janela {mesmo, anterior, 1-2 à frente} de `cluster.latestAt`.
- **Bug #6 (summarize.ts):** `porQueImporta` agora é obrigatório (mín 15 chars); fallbackSummary tem texto sintético honesto em vez de string vazia.
- **Bug #7 (topics.ts):** GENERIC expandido de ~50 pra ~160 termos (eventos genéricos, pessoas, veículos, gentílicos, marcadores editoriais); isProper aceita dígitos (BR-251); detecção de fenômenos por substring ("onda de calor", "El Niño"); MIN_STORIES 3→2.
- **Bug #8 (index.astro + format.ts):** selo "Atualizado há X min/h" com bolinha verde pulsante; SSR mostra "às HH:MM", JS substitui por relativo via Intl.RelativeTimeFormat.

**Padrão emergente — validações em `summarizeClusters`:** as 3 invariantes editoriais (#3, #5, #6) seguem o mesmo shape — cache hit validado→invalida+IA; fresh validado→rejeita+fallback; log estruturado. Reusar pra próximas regras.

**Pendência observada:** após todas as validações, runs ficam com `IA=0/8` recorrente — cap apertado + invalidações de cache estão sufocando a IA. **Quando o fallback LLM destravar, prioridade revisar o cap (provavelmente subir pra 12-14).**

**🔁 Fallback LLM dinâmico — IMPLEMENTADO (2026-06-01, PR #1 `feat/cerebras-fallback-llm`):** saiu do backlog. Em vez do Gemini (bloqueado por SMS), escolhido **Cerebras Cloud** (signup só e-mail, sem telefone). `summarize.ts` agora tem `OpenAICompatSummarizer` (provedor genérico: endpoint/modelo/schema/`reasoning_effort` configuráveis), `GroqSummarizer` + `CerebrasSummarizer` (subclasses finas) e o `ChainSummarizer`: tenta o **Groq primário**; em **429** cai pro **Cerebras** (`gpt-oss-120b`, `json_schema` estrito = mesma garantia de JSON) e marca o provedor esgotado pra pulá-lo no resto do run. `summarizerFromEnv` encadeia o que estiver configurado. **`IA_BUDGET_PER_RUN` sobe 8→14 quando `CEREBRAS_API_KEY` existe** (cobre quase os ~22 clusters); sem o secret roda Groq-only e cap volta a 8 (idêntico ao atual). 84 testes (era 80). Resolve o fallback alto observado (`fallback=14/22` por 429 de TPD da conta Groq). **⏳ Pendência manual:** dono criar conta Cerebras + `gh secret set CEREBRAS_API_KEY` e mergear o PR #1 (mergear é seguro mesmo sem o secret). Override de modelo: `CEREBRAS_MODEL`. Skill `factory-portal-onboarding` documenta o signup.

**💸 AdSense onboarding — em revisão (2026-05-28):** habilitada a camada de monetização replicando o trabalho do molde (commits `0ff8b9f` / `982c29a` / `15c4eca` do GlobalNotícias) — ver `BRIEF_ADSENSE.md` na raiz. Tudo entregue num único commit (`feat: páginas legais, banner LGPD e verificação AdSense`):
- **Publisher ID:** `pub-7077758294476082` — **mesma conta** do GlobalNotícias. AdSense aceita múltiplos sites; consolida payout (atinge mínimo de R$100 mais rápido) e dá painel central. Quando submeter ao AdSense Console, **adicionar `radar.globalnote.com.br` como site secundário**, não criar conta nova.
- **Email institucional:** `radar@globalnote.com.br` — já funciona via catch-all ImprovMX configurado no `globalnote.com.br` em 2026-05-28 (sem trabalho de DNS adicional aqui).
- **Arquivos novos:** `public/ads.txt` (1 linha `DIRECT`), `src/components/CookieBanner.astro` (consentimento LGPD, localStorage `gn-consent`, evento `gn:consent`), `src/pages/sobre.astro`, `src/pages/contato.astro`, `src/pages/privacidade.astro` (texto adaptado ao nicho de desastres + filtro de 2 camadas citado explicitamente em "Como funciona").
- **Edits:** `Layout.astro` (import CookieBanner, meta `google-adsense-account` no `<head>`, `<CookieBanner />` antes de `</body>`); `Footer.astro` (preserva categorias dinâmicas, adiciona nav institucional Sobre/Contato/Privacidade/RSS + linha mailto).
- **AdSlot.astro continua `enabled = false`** — exibir `<ins class="adsbygoogle">` antes da aprovação é policy violation. Só ligar quando a aprovação sair.
- **Política de privacidade tem 3 marcações defensivas** (seções 2, 5, 6) explicitando que AdSense ainda não está ativo — protege contra reviewer interpretar inconsistência entre "política fala em AdSense" e "site sem script AdSense carregado". **NÃO mexer nessas marcações** até o AdSense ser aprovado e ligado.
- **Quando submeter:** ⏳ **aguardar 30-60 dias.** Radar tem ~14 dias (1º deploy 2026-05-24); site novo + agregador + IA = risco real de rejeição imediata por "scraped/low-value content". Esperar engorda tráfego, deixa GSC indexar mais, e dá tempo de avaliar conteúdo editorial original (ex.: futura seção `/editorial/`). Próximo passo manual: `adsense.google.com` → Sites → Adicionar `radar.globalnote.com.br` → meta tag já no `<head>`, clicar Verificar; **NÃO clicar "Solicitar revisão" ainda.**

## Decisões fechadas

- **Nome (aparece pro leitor):** GlobalNote Radar
- **Tagline:** "Desastres, acidentes e alertas — resumido, com link pra fonte."
- **Ícone:** o MESMO "G" azul do globalnote (reusar `public/logo.png` do molde).
- **B1 — categorias DINÂMICAS:** NADA de lista fixa. A IA classifica cada notícia (no MESMO call do resumo, sem custo extra de cota) numa categoria tirada do conteúdo (ex: "Enchentes", "Acidente aéreo", "Incêndio florestal"). O site mostra **só as categorias presentes na edição**, ordenadas por volume. Os `/tema` (já existentes no molde) continuam emergentes.
- **Fontes:** feeds gerais/regionais **+ filtro por palavras-chave do nicho** (enchente, deslizamento, acidente, colisão, capotamento, incêndio, explosão, queda de avião, naufrágio, soterramento, vazamento…) + especializadas (Defesa Civil, INMET, CENIPA, Corpo de Bombeiros, PRF — as que tiverem RSS). **Adicionar um estágio de FILTRO no pipeline** (o molde não filtra).
- **B2 — regional/proximidade:** ADIADO (melhoria futura). NÃO implementar agora.
- **IA = Groq (free tier)** ✅ — decidido em 2026-05-24, substitui o Gemini (a conta Google bateu o limite de projetos). 1 chave free serve o Radar e **toda a fábrica na mesma chave**, sem depender do Google. **Modelo padrão `openai/gpt-oss-20b`** (structured outputs estritos = JSON garantido; o `llama-3.3-70b` só faz json_object best-effort e falhava). `GROQ_API_KEY` já cadastrado no repo. (O molde GlobalNotícias ainda usa Gemini — migrar quando conveniente.)
- **Infra:** repo GitHub `radar-globalnote` (público, conta ManoelSilvaNeto); Cloudflare Pages project `radar` (mesma conta — reusa `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`, valores que o dono precisa fornecer p/ o repo novo); domínio `radar.globalnote.com.br` (CNAME no registro.br → `radar.pages.dev`, o dono adiciona após o 1º deploy).
- **Propagação:** igual ao noticias — sitemap, **IndexNow (gerar CHAVE NOVA)**, robots, RSS, Search Console, Bing, Google News; Bluesky + Mastodon (contas NOVAS do Radar) + Newsletter (Buttondown novo). **SEM TELEGRAM** (decisão do dono — remover do social.ts/workflow).

## Plano de build (ordem)

1. **Copiar o molde** `~/Projetos/GlobalNoticias/` → aqui (sem `.git`, `node_modules`, `dist`, `.astro`, o `data/` de conteúdo do noticias, screenshots `*.png` da raiz, o arquivo de chave IndexNow antigo). Manter `public/logo.png` e `public/favicon.svg`.
2. **Rebrand:** `src/lib/site.ts` (nome/tagline), `astro.config.mjs` (`site: https://radar.globalnote.com.br`), nova chave IndexNow em `public/<key>.txt` + `pipeline/indexnow.ts`, zerar `NEWSLETTER.buttondownUser` e o token do Web Analytics (`src/components/Analytics.astro`).
3. **B1 — categorias dinâmicas:** reformular `categories.ts`, `sources.ts`, `pipeline/rank.ts`, `pipeline/summarize.ts` (IA retorna `categoria`), `pipeline/build-data.ts`, `src/lib/types.ts` e as páginas (`index.astro`, `[categoria].astro`, `CategorySection`). Modelo: Edition = home (ranqueado) + categorias derivadas (slug,label,stories) só das presentes.
4. **Filtro de nicho:** novo estágio (em `fetch.ts` ou no `index.ts`) que mantém só artigos cujo título+descrição batem com a lista de palavras-chave de desastres/acidentes. Trocar `sources.ts` por feeds gerais/regionais + especializados.
5. **Build + testes verdes** (adaptar/reescrever os testes de categoria do molde).
6. **Repo + 1º deploy:** `gh repo create radar-globalnote --public`; pedir ao dono os secrets (GEMINI novo, CLOUDFLARE token+account). Workflow cria o Pages `radar` no 1º deploy.
7. **Domínio:** dar o `radar.pages.dev` pro dono apontar o CNAME no registro.br.
8. **Propagação:** GSC, Bing, Google News, Bluesky/Mastodon, Newsletter — conforme o dono criar as contas. SEM Telegram.

## Modo de trabalho (do dono)

- **Só na nuvem:** escrevo código e dou `git push`; validação acontece no GitHub Actions (test→pipeline→build→deploy). Não rodar o site/pipeline localmente como fluxo.
- **Brainstorm em lote** via arquivo `.md` (não pergunta a pergunta no chat).
- **Commits:** terminar mensagem com `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Cada projeto da fábrica fica **isolado na sua pasta**.

## Aprendizados herdados do molde (valem aqui)

- **IA (Groq):** modelo padrão `openai/gpt-oss-20b` (override por `GROQ_MODEL`). Use sempre um modelo com **structured outputs estritos** (`openai/gpt-oss-20b` / `gpt-oss-120b`) — o código manda `response_format: json_schema` pra esses e `json_object` pros demais. API compatível com OpenAI via `fetch`. Throttle (`GROQ_THROTTLE_MS`, default 2500ms ≈ 24/min), retry (429/500/503) e disjuntor já existem no `summarize.ts`. Free tier: ~30 req/min — reseta à meia-noite UTC. **⚠️ Rate limit é por CONTA/organização, NÃO por chave** → toda a fábrica divide o mesmo limite na mesma conta Groq; por isso os crons são DEFASADOS (Notícias `0 */4`, Radar `30 */4`) e uma 2ª chave na mesma conta NÃO daria quota extra. Quota independente só com outra conta Groq (outro e-mail) ou dev tier pago (10x, barato). No 1º run de cache frio do Notícias (IA=50 de uma vez) batemos 429; em regime de cache quente cada run faz poucas chamadas. (Histórico: molde nasceu com Gemini `gemini-2.5-flash`; tentamos `llama-3.3-70b` mas o json_object dava 400 intermitente.)
- **Cache de resumos:** chave = URL do artigo-âncora (mais antigo do cluster), estável entre runs. O `slug` da página `/noticia/<slug>` reusa essa chave.
- **CI:** o **2º `git push` do job** não herda a credencial do checkout → usar `x-access-token:${GITHUB_TOKEN}` (ver workflow do molde, passo do estado social).
- **Deploy:** Cloudflare Pages via wrangler no workflow (cria o projeto no 1º run). IndexNow pinga Bing/Yandex pós-deploy.

## Ponteiros
- Decisões completas: `./DECISOES.md`
- Molde: `~/Projetos/GlobalNoticias/` (e a memória dele, copiada no dir de memória deste projeto).
- Memória deste diretório: `~/.claude/projects/-Users-mneto-Projetos-GlobalRadar/memory/`.
