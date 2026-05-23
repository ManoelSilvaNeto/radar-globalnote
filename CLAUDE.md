# GlobalNote Radar — instruções do projeto

> Este arquivo é carregado automaticamente quando o Claude roda a partir desta pasta.
> Se você (Claude) está retomando daqui, **leia tudo abaixo antes de agir**.

## O que é

**GlobalNote Radar** (`radar.globalnote.com.br`) é a **1ª réplica** de uma **"fábrica" de portais verticais** sob `globalnote.com.br`. Todos são **clones do GlobalNotícias** (`noticias.globalnote.com.br`) — muda **só o conteúdo** (nicho/fontes/categorias/nome); infra, SEO, redes e **ícone** são os mesmos. Próximos da fábrica: games, religião, viagens…

**Nicho do Radar:** desastres naturais e causados pelo homem; acidentes em geral (trânsito, doméstico, aéreo, industrial, etc.).

**MOLDE de referência (copiar dele):** `~/Projetos/GlobalNoticias/` — projeto pronto, em produção. O Radar reusa toda a arquitetura dele.

## ⏳ Estado atual (2026-05-23)

Decisões fechadas (ver `DECISOES.md` nesta pasta). **O código do Radar AINDA NÃO foi iniciado** — o próximo passo é **copiar o molde** do GlobalNoticias pra cá e adaptar. Esta pasta hoje só tem `DECISOES.md` e este `CLAUDE.md`.

## Decisões fechadas

- **Nome (aparece pro leitor):** GlobalNote Radar
- **Tagline:** "Desastres, acidentes e alertas — resumido, com link pra fonte."
- **Ícone:** o MESMO "G" azul do globalnote (reusar `public/logo.png` do molde).
- **B1 — categorias DINÂMICAS:** NADA de lista fixa. A IA classifica cada notícia (no MESMO call do resumo, sem custo extra de cota) numa categoria tirada do conteúdo (ex: "Enchentes", "Acidente aéreo", "Incêndio florestal"). O site mostra **só as categorias presentes na edição**, ordenadas por volume. Os `/tema` (já existentes no molde) continuam emergentes.
- **Fontes:** feeds gerais/regionais **+ filtro por palavras-chave do nicho** (enchente, deslizamento, acidente, colisão, capotamento, incêndio, explosão, queda de avião, naufrágio, soterramento, vazamento…) + especializadas (Defesa Civil, INMET, CENIPA, Corpo de Bombeiros, PRF — as que tiverem RSS). **Adicionar um estágio de FILTRO no pipeline** (o molde não filtra).
- **B2 — regional/proximidade:** ADIADO (melhoria futura). NÃO implementar agora.
- **Gemini:** chave NOVA em **projeto Google separado** (a cota free é ~20–25 resumos/dia POR PROJETO; compartilhar com o noticias degrada os dois). Pedir ao dono na hora dos secrets.
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

- **Gemini:** modelo `gemini-2.5-flash` (o 2.0-flash NÃO tem cota free). Throttle, retry e disjuntor já existem no `summarize.ts`. Cota ~20–25 resumos/dia por projeto, reseta ~07:00 UTC.
- **Cache de resumos:** chave = URL do artigo-âncora (mais antigo do cluster), estável entre runs. O `slug` da página `/noticia/<slug>` reusa essa chave.
- **CI:** o **2º `git push` do job** não herda a credencial do checkout → usar `x-access-token:${GITHUB_TOKEN}` (ver workflow do molde, passo do estado social).
- **Deploy:** Cloudflare Pages via wrangler no workflow (cria o projeto no 1º run). IndexNow pinga Bing/Yandex pós-deploy.

## Ponteiros
- Decisões completas: `./DECISOES.md`
- Molde: `~/Projetos/GlobalNoticias/` (e a memória dele, copiada no dir de memória deste projeto).
- Memória deste diretório: `~/.claude/projects/-Users-mneto-Projetos-GlobalRadar/memory/`.
