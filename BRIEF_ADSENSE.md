# BRIEF — Habilitar revisão do Google AdSense no Radar

> **Como usar:** quando abrir o Claude Code aqui, mande:
>
> `Leia BRIEF_ADSENSE.md e execute. Use plan mode antes de tocar em código.`
>
> O trabalho é a replicação fiel do que foi feito no portal-molde `GlobalNotícias`
> (commits `0ff8b9f`, `982c29a`, `15c4eca` no repo `ManoelSilvaNeto/globalnoticias`)
> adaptado ao Radar. Tempo estimado: 30-40 min de execução + CI/deploy.

---

## Contexto

O Radar está **100% operacional** (cron, Bluesky, Mastodon, Buttondown, GSC, Bing,
Google News, IndexNow, Cloudflare Web Analytics — ver `CLAUDE.md`). Falta apenas
a camada que habilita **monetização via Google AdSense**: páginas legais,
banner LGPD, `ads.txt` e meta tag de verificação. Sem isso, a conta AdSense
não pode entrar em revisão.

**Email já está resolvido** — em 2026-05-28 configuramos ImprovMX (free) com
catch-all `*@globalnote.com.br → mvsilvaneto.cel@gmail.com` no DNS do
`globalnote.com.br`. Logo, `radar@globalnote.com.br` **já funciona** sem nenhum
trabalho adicional de DNS.

---

## Decisões já tomadas (não rediscutir)

| Decisão | Valor | Justificativa |
|---|---|---|
| **Publisher ID do AdSense** | `pub-7077758294476082` | Reutilizar a mesma conta do GlobalNotícias. AdSense aceita múltiplos sites por conta; consolida payout (atinge mínimo de R$100 mais rápido) e dá painel central. Quando submeter ao AdSense, **adicionar `radar.globalnote.com.br` como site secundário** à conta existente, não criar conta nova. |
| **Email institucional do Radar** | `radar@globalnote.com.br` | Já funciona via catch-all do ImprovMX. Aparece nas páginas legais e no footer. |
| **AdSlot.astro permanece desabilitado** | `enabled = false` | Igual ao Notícias. Exibir `<ins class="adsbygoogle">` antes da aprovação é violação de política. Só ligar **depois** que a conta AdSense aprovar o `radar.globalnote.com.br`. |
| **Banner LGPD e privacidade** | Mesma estrutura do molde | Política redigida em 12 seções, citando AdSense expressamente mas com nota "atualmente o site não exibe anúncios" — proteção contra reviewer interpretar inconsistência. |
| **NÃO submeter ao AdSense imediatamente** | Aguardar ~30-60 dias | O Radar tem ~14 dias (1º commit 2026-05-20 no GlobalNoticias / 2026-05-24 no Radar). Site novo + agregador + IA = risco real de rejeição por "scraped/low-value content". Esperar engorda tráfego, indexação Search Console, e dá tempo de adicionar conteúdo editorial original (`/editorial/` no futuro). |

---

## Estado atual (auditoria de 2026-05-28)

✅ Já existe no Radar (não tocar):
- `src/layouts/Layout.astro`
- `src/components/AdSlot.astro` (`enabled = false`)
- `src/components/Footer.astro` (com categorias dinâmicas — atenção, diferente do Notícias)
- `src/components/Analytics.astro` (Cloudflare Web Analytics ativo, token `3ac33991998f4920b842976be335da09`)
- Suite 80/80 verde
- Newsletter Buttondown (`radarbr`)

❌ Falta (este BRIEF cobre):
- `public/ads.txt`
- `src/components/CookieBanner.astro`
- `src/pages/sobre.astro`
- `src/pages/contato.astro`
- `src/pages/privacidade.astro`
- Edição em `src/layouts/Layout.astro` (adicionar meta + `<CookieBanner />`)
- Edição em `src/components/Footer.astro` (adicionar links institucionais + email)

---

## Arquivos a criar

### 1. `public/ads.txt`

Arquivo de 1 linha (sem newline extra no fim é tolerável; melhor manter consistente):

```
google.com, pub-7077758294476082, DIRECT, f08c47fec0942fa0
```

Mesmo `pub-ID` do Notícias.

---

### 2. `src/components/CookieBanner.astro`

**Copiar fiel** de `~/Projetos/GlobalNoticias/src/components/CookieBanner.astro`.
Zero adaptação necessária — o componente já é portável (não menciona o nome do site
nem categorias). Localstorage key `gn-consent` e evento `gn:consent` ficam iguais,
pra coerência entre portais.

```bash
cp ~/Projetos/GlobalNoticias/src/components/CookieBanner.astro src/components/CookieBanner.astro
```

---

### 3. `src/pages/sobre.astro`

Estrutura idêntica ao molde, mas com **texto adaptado ao nicho de desastres/acidentes**.
Use a `SITE.tagline` e `SITE.description` do `src/lib/site.ts` (já presentes:
"Desastres, acidentes e alertas — resumido, com link pra fonte.").

Adaptações em relação ao `~/Projetos/GlobalNoticias/src/pages/sobre.astro`:

- **Fontes citadas no parágrafo "O que é":** trocar a lista do Notícias por uma lista de
  fontes que o Radar realmente coleta (ler `pipeline/sources.ts` antes de redigir — não
  inventar). Pelo nicho, esperar: Defesa Civil, ANTT, agências regionais, portais de
  trânsito, BBC/G1 quando há cobertura de desastre. Validar.
- **Princípios editoriais (seção "Como funciona"):** mencionar que a curadoria usa
  filtro de **nicho em 2 camadas** (palavras STANDALONE + AMBIGUOUS+DAMAGE_SIGNAL,
  `pipeline/niche.ts`) — assim o reviewer vê que há método editorial além de "RSS in,
  RSS out".
- **Transparência sobre IA:** igual ao molde (resumo neutro por IA, validador
  anti-alucinação — o Radar **NÃO tem** o validador, então omitir essa frase ou
  apontar como roadmap honestamente).
- **Email** no rodapé do `/sobre`: `radar@globalnote.com.br` (2 ocorrências hardcoded
  no molde — vai mostrar no grep).

---

### 4. `src/pages/contato.astro`

Copiar do molde e trocar a constante:

```ts
const EMAIL = 'radar@globalnote.com.br';
```

Os blocos por assunto (Sugestão / Veículo de imprensa / LGPD / Imprensa-assessoria)
podem ser mantidos como no molde — são genéricos e válidos pra um portal de
desastres/acidentes.

---

### 5. `src/pages/privacidade.astro`

Copiar do molde **com 2 ajustes**:

1. Trocar constante:
   ```ts
   const EMAIL = 'radar@globalnote.com.br';
   ```
2. Atualizar `LAST_UPDATE` pro dia da execução (ex.: `'29 de maio de 2026'`).

**NÃO mexer no resto da política.** As 3 marcações defensivas que o molde já tem
(seções 2, 5 e 6 dizendo "*atualmente o site não exibe anúncios*",
"*atualmente nenhum cookie publicitário é definido*", "*o Google AdSense ainda não
está ativo neste site*") são essenciais e devem ser preservadas. Foram adicionadas
exatamente pra evitar que o reviewer interprete inconsistência entre "política
fala em AdSense" e "site não tem script AdSense carregado".

---

## Arquivos a editar

### 6. `src/layouts/Layout.astro`

Diff esperado (igual ao commit `0ff8b9f` do GlobalNotícias). Adicionar:

a) No topo do frontmatter, perto dos outros imports:
```ts
import CookieBanner from '../components/CookieBanner.astro';
```

b) No `<head>`, depois da linha do `google-site-verification`:
```html
<meta name="google-adsense-account" content="ca-pub-7077758294476082" />
```

c) Antes de `</body>`, depois do `<Footer />`:
```astro
<CookieBanner />
```

**Não mexer em mais nada do Layout.** Em particular, NÃO importar/carregar o
script `adsbygoogle.js` ainda. Só a meta tag (que é o que o crawler do AdSense
usa pra verificar a conta).

---

### 7. `src/components/Footer.astro`

Diferença importante em relação ao Notícias: o Footer do Radar **usa categorias
dinâmicas** (`currentEdition.categorias.slice(0, 12)`), não estáticas. Preservar
isso.

Adicionar **2 coisas novas** sem remover o que existe:

a) No frontmatter, perto da constante `year`:
```ts
const EMAIL = 'radar@globalnote.com.br';
```

b) Depois do `<nav aria-label="Categorias">` (e ANTES do `<p class="mt-6 ...">` do
copyright), inserir:
```astro
<nav aria-label="Institucional" class="mt-3 flex flex-wrap gap-x-4 gap-y-1">
  <a href="/sobre" class="hover:text-sky-600 hover:underline">Sobre</a>
  <a href="/contato" class="hover:text-sky-600 hover:underline">Contato</a>
  <a href="/privacidade" class="hover:text-sky-600 hover:underline">Política de Privacidade</a>
  <a href="/rss.xml" class="hover:text-sky-600 hover:underline">RSS</a>
</nav>

<p class="mt-4 text-xs text-neutral-500">
  Contato: <a href={`mailto:${EMAIL}`} class="hover:text-sky-600 hover:underline">{EMAIL}</a>
</p>
```

---

## Plano de execução

Faça em UM commit lógico, na ordem:

1. Confirma estado: `git status` limpo, `pnpm test` verde (80/80).
2. **Cria** `public/ads.txt`, `src/components/CookieBanner.astro`,
   `src/pages/sobre.astro`, `src/pages/contato.astro`, `src/pages/privacidade.astro`.
3. **Edita** `src/layouts/Layout.astro` e `src/components/Footer.astro`.
4. Roda `pnpm test` — esperar **80/80 verde** (nenhuma mudança em código testado).
5. Roda `pnpm build` — esperar build limpo, **+3 páginas** vs. anterior
   (`/sobre`, `/contato`, `/privacidade`).
6. Commit único com mensagem (sugestão):
   ```
   feat: páginas legais, banner LGPD e verificação AdSense

   Habilita a conta pub-7077758294476082 (compartilhada com o GlobalNotícias)
   para revisão do radar.globalnote.com.br. AdSlot segue desabilitado:
   exibir adsbygoogle antes da aprovação é policy violation.

   - public/ads.txt: pub-ID DIRECT
   - Layout: meta google-adsense-account + <CookieBanner />
   - CookieBanner: consentimento LGPD com evento gn:consent
   - sobre/contato/privacidade: páginas obrigatórias do AdSense
   - Footer: links institucionais + email radar@globalnote.com.br

   Email já funciona via catch-all ImprovMX configurado no globalnote.com.br
   em 2026-05-28 (ver CLAUDE.md do GlobalNotícias).
   ```
7. `git push origin main` → CI roda em ~3 min, faz deploy.
8. Validar em produção:
   - `https://radar.globalnote.com.br/ads.txt` → 200, conteúdo correto
   - `https://radar.globalnote.com.br/sobre/`, `/contato/`, `/privacidade/` → 200
   - HTML da home contém `google-adsense-account` no `<head>` e id `cookie-banner` no `<body>`
9. **Atualizar `CLAUDE.md` do Radar** documentando o trabalho desta sessão:
   uma seção nova "AdSense onboarding (em revisão)" com publisher ID, email do
   projeto, e critério "esperar 30-60 dias antes de submeter".

---

## Critérios de aceite

- ✅ `pnpm test` 80/80 verde antes e depois.
- ✅ `pnpm build` gera 3 páginas a mais que antes (sobre, contato, privacidade).
- ✅ CI verde no push.
- ✅ `curl -sI https://radar.globalnote.com.br/ads.txt` retorna 200 com o conteúdo `google.com, pub-7077758294476082, DIRECT, f08c47fec0942fa0`.
- ✅ HTML da home tem `<meta name="google-adsense-account" content="ca-pub-7077758294476082"` e `id="cookie-banner"` no body.
- ✅ Banner LGPD aparece em janela anônima na 1ª visita (não persiste após "Aceitar"/"Apenas essenciais").
- ✅ CLAUDE.md atualizado com a sessão.

---

## Promover ao skill `factory-portal-onboarding` (próximo passo, opcional)

Depois de validar tudo, **converter este trabalho em references reutilizáveis** do
skill global `~/.claude/skills/factory-portal-onboarding/`:

- `references/adsense.md` — onboarding AdSense (pub-ID compartilhado, meta tag,
  ads.txt, quando submeter).
- `references/legal-pages.md` — template das 3 páginas legais (sobre/contato/privacidade)
  com adaptação de nicho.
- `references/improvmx-email.md` — setup de email forwarding (DNS no registro.br
  apex, catch-all, integração com stack de envio existente Resend/SES).

Atualizar a tabela no `SKILL.md` marcando esses 3 como ✅ pronto. Assim, o terceiro
portal (Games/Religião/Viagens) já tem AUTO via skill.

O skill já dá a estrutura esperada do reference (ver SKILL.md → "Como adicionar um
reference TODO").

---

## Próximo passo manual (depois do código pronto)

Quando este BRIEF estiver concluído e o site no ar:

1. Entrar em `adsense.google.com` com a mesma conta Google que criou o
   `pub-7077758294476082`.
2. **Sites → Adicionar site** → `radar.globalnote.com.br`.
3. O AdSense vai sugerir verificação por meta tag — como ela já está no `<head>`,
   clicar "Verificar".
4. **NÃO clicar "Solicitar revisão" ainda.** Aguardar 30-60 dias por motivos
   estratégicos (site novo + agregador = risco alto de rejeição imediata).
5. Em paralelo, considerar criar conteúdo editorial original em `/editorial/`
   (mesma estratégia recomendada pro GlobalNotícias).

---

## Referências cruzadas

- Repo molde: `https://github.com/ManoelSilvaNeto/globalnoticias`
- Commits do trabalho equivalente no molde:
  - `0ff8b9f feat: páginas legais, banner LGPD e verificação AdSense`
  - `982c29a chore(privacidade): explicita que AdSense ainda não está ativo`
  - `15c4eca chore(email): troca contato@ por noticias@globalnote.com.br`
- `CLAUDE.md` do molde tem seção "Email do projeto" e "Quando submeter ao AdSense"
  — vale ler antes de executar este BRIEF.
- Skill global: `~/.claude/skills/factory-portal-onboarding/SKILL.md` (escopo
  desta task NÃO está coberto ainda — vide seção "Promover ao skill" acima).
