# Radar — decisões (1ª réplica da fábrica globalnote)

> Clone do **noticias.globalnote.com.br**. Só o **conteúdo** muda; infra, SEO, redes e **ícone** são os mesmos.
> Marque/edite suas respostas em **"→ resposta:"**. O que estiver com **(REC)** é minha recomendação — se concordar, escreva "ok".

---

## A. Marca

**A1. Nome do site (aparece pro leitor)**
- (REC) **Radar** — curto, forte, combina com "alerta/monitoramento".
- alternativas: "Radar Brasil", "GlobalNote Radar"
→ resposta: GlobalNote Radar

**A2. Tagline (frase abaixo do nome)**
- (REC) "Desastres, acidentes e alertas — resumido, com link pra fonte."
→ resposta: ok

**A3. Ícone**
- (REC) **mesmo "G" azul** do globalnote (família visual única, como você pediu).
→ resposta: ok  *(se um dia quiser um ícone próprio do Radar, a gente troca depois)*

---

## B. Conteúdo (o que muda de verdade)

**B1. Categorias** (no noticias são 8: política, economia, etc. No Radar troco por:)
- (REC) **Desastres naturais** · **Clima e alertas** · **Trânsito** · **Aéreo** · **Incêndios** · **Indústria e trabalho**
- (pensar: cobrem enchente/deslizamento/seca, tempestade/onda de calor, acidente rodoviário, aviação, incêndio florestal/urbano/doméstico, acidente industrial/vazamento)
→ resposta (confirmar/editar/somar “Marítimo/Náutico”, “Saúde pública/surtos”, etc.): acredito que as categorias devao existir a partir dos anuncios apresentados ao invez de chumba-los
**B2. De onde vêm as notícias do nicho** (decisão técnica importante)
- (REC) **Feeds gerais + regionais FILTRADOS por palavras-chave** do nicho (enchente, deslizamento, acidente, colisão, capotamento, incêndio, explosão, queda de avião, naufrágio, soterramento, vazamento…) **+ fontes especializadas** (Defesa Civil, INMET, CENIPA/aviação, Corpo de Bombeiros, PRF). É o jeito mais robusto pra um nicho — o noticias hoje não filtra, então vou **adicionar um estágio de filtro** no pipeline.
→ resposta: ok; interessante se as noticias que aparecerem para o usuario venham as que estiverem mais proximas da regiao dele.

---

## C. Inteligência (IA) — ATENÇÃO à cota

> **⚠️ ATUALIZADO 2026-05-24 — TROCAMOS GEMINI → GROQ.** A conta Google bateu o limite de
> projetos e não dava pra criar chave Gemini nova. Migramos para **Groq (free tier, sem
> cartão)**: 1 chave free aguenta ~14,4k req/dia (Llama 3.1 8B) / ~1k/dia (Llama 3.3 70B) —
> folga pro Radar (~22/dia) e pra **fábrica inteira na mesma chave**, sem depender do Google.
> Secret = `GROQ_API_KEY`; modelo padrão `llama-3.3-70b-versatile`. O texto abaixo é o
> histórico do brainstorm original (Gemini) e fica como registro.

A chave do noticias tem **~20–25 resumos grátis/dia, por PROJETO Google**. Se o Radar usar a **mesma chave**, os dois sites **dividem** essa cota e **pioram juntos**.
- (REC) você cria uma **nova chave Gemini em outro projeto Google** (grátis) só pro Radar → cota independente.
- alternativa: compartilhar a chave (mais barato de configurar, mas os dois rendem menos).
→ resposta:  ok *(se topar a nova chave, depois eu te mostro onde gerar em 1 min)*

---

## D. Infraestrutura (reusa a conta, produto novo)

**D1. Repositório GitHub** (público, igual ao noticias)
- (REC) novo repo `radar-globalnote` (na sua conta ManoelSilvaNeto)
→ resposta: ok

**D2. Cloudflare Pages** — mesma conta, **novo projeto** (reusa o token/account id que já temos)
- (REC) nome do projeto Pages: `radar`
→ resposta: ok

**D3. Pasta local** (isolamento dos produtos, como você pediu)
- (REC) `~/Projetos/Radar/`  *(esta pasta)*
→ resposta: ok, mas coloca o nome de GlobalRadar

**D4. Domínio** `radar.globalnote.com.br`
- depois do 1º deploy, **você adiciona o CNAME** no registro.br → `radar.pages.dev` (igual fez no noticias). Eu te aviso a hora.
→ ok? ok

---

## E. Propagação (depois do site no ar) — mesmo do noticias, MENOS Telegram

- Buscadores: sitemap, **IndexNow (chave nova)**, robots, RSS, Search Console, Bing, Google News ✅
- Redes: **Bluesky + Mastodon NOVOS** (contas próprias do Radar) + **Newsletter** (Buttondown novo) ✅
- **Telegram: NÃO** ❌ (sua decisão)
→ algo a mudar aqui? nao, vamos seguir com sua sugestao

---

## Ordem que vou seguir depois das suas respostas
1. Criar `~/Projetos/Radar/` clonando o molde do noticias.
2. Trocar conteúdo: categorias (B1), fontes + filtro de palavras-chave (B2), nome/tagline (A1/A2), ícone (A3).
3. Repo + 1º deploy no Cloudflare (D1/D2) → te dou o `radar.pages.dev` pra você apontar o domínio (D4).
4. Secrets (`GROQ_API_KEY` novo, Cloudflare reusado) → cron começa a rodar.
5. Propagação (E) conforme você for criando as contas.

---

## RESOLVIDO (2026-05-23)
- **Nome:** GlobalNote Radar · **Tagline:** (REC) · **Ícone:** o G.
- **B1 — categorias DINÂMICAS pela IA** (saem do conteúdo, sem lista chumbada). ✅ confirmado.
- **B2 — regional/proximidade: ADIADO** → **melhoria futura** (não entra agora).
- **IA:** ~~Gemini (chave nova)~~ → **Groq (free tier)** — trocado em 2026-05-24 (Google bateu limite de projetos). `GROQ_API_KEY`, modelo `llama-3.3-70b-versatile`.
- **Infra:** repo `radar-globalnote`, Pages `radar`, pasta **`~/Projetos/GlobalRadar/`**, domínio `radar.globalnote.com.br`.
- **Propagação:** igual ao noticias, SEM Telegram.

## Melhorias futuras
- **Regional (B2):** IA marca UF/local de cada notícia + seletor de estado (fase 1) e auto-detecção via Cloudflare na borda (fase 2).
