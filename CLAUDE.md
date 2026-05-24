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

**⭐ RETOMAR AQUI — só falta a PROPAGAÇÃO (etapa 5), tudo dependente de o dono criar contas novas do Radar:**
1. ~~Secrets~~ ✅ feito (GROQ + Cloudflare token/account, validados).
2. ~~Deploy~~ ✅ feito — Pages `radar` criado, site no ar em `radar-wly.pages.dev`.
3. ~~Custom domain no Pages~~ ✅ feito via API — `radar.globalnote.com.br` adicionado ao projeto `radar`.
4. ~~CNAME no registro.br~~ ✅ **feito pelo dono — domínio no ar com SSL** (ver acima).
5. **⏳ Propagação** (depende de o dono criar contas):
   - **a. Google Search Console** ✅ **feito (2026-05-24)** — propriedade `https://radar.globalnote.com.br` (tipo "prefixo do URL") verificada por **Arquivo HTML** (`public/google82243445ca744e73.html`, NÃO remover) + **sitemap `sitemap-index.xml` enviado**. ⚠️ **Aprendizado p/ a fábrica:** o Cloudflare Pages faz clean-URL e redireciona `/arquivo.html` → `/arquivo` (308), mas o verificador do Google **segue o redirect** e valida normal (o corpo no destino é 200 e correto). Não precisa workaround.
   - **b. Bing Webmaster** ✅ **feito (2026-05-24)** — `radar.globalnote.com.br` importado do GSC (já verificado + sitemap herdado). IndexNow já pinga o Bing a cada deploy.
   - **c. Google News / Publisher Center** ⏳ — criar publicação e adicionar o site.
   - **d. Bluesky + Mastodon** ⏳ — contas NOVAS do Radar; dono passa handle/app-password → cadastrar secrets; `social.ts` posta sozinho.
   - **e. Newsletter (Buttondown)** ⏳ — conta nova; dono passa o usuário → setar `NEWSLETTER.buttondownUser` em `src/lib/site.ts`.
   - **SEM Telegram.**

**Contexto da fábrica (2026-05-24):** o **GlobalNotícias também foi migrado pro Groq** (mesmo padrão, schema de 3 campos, em produção). Os dois portais usam a **MESMA chave Groq** (rate limit é por conta, não por chave) → crons **defasados**: Notícias `0 */4`, Radar `30 */4`. Pendência do dono não-bloqueante: estava com instabilidade no e-mail/login do Claude; chave Groq foi colada no chat → pode rotacionar em console.groq.com se quiser (é só me passar a nova que eu atualizo os 2 secrets).

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
