// Divulgação automática nas redes (Bluesky e Mastodon) a cada edição. Roda DEPOIS
// do deploy (links já no ar). Cada rede só dispara se os secrets dela existirem —
// sem secret, é no-op. Nada aqui é crítico: falha vira warning e segue.
//
// SEM TELEGRAM no Radar (decisão do dono).
//
// Anti-spam: posta a história nova de maior destaque ainda não publicada (dedup em
// data/social.json). Se não há novidade, não posta nada.
//
// Secrets (GitHub → Settings → Secrets and variables → Actions):
//   BLUESKY_HANDLE + BLUESKY_APP_PASSWORD   (app password em bsky.app → Settings → App Passwords)
//   MASTODON_INSTANCE + MASTODON_TOKEN      (instância ex.: https://mastodon.social; token em Preferences → Development)

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SITE = (process.env.SITE_URL ?? 'https://radar.globalnote.com.br').replace(/\/$/, '');
const STATE_PATH = resolve(process.cwd(), 'data/social.json');

type Story = { clusterId: string; slug?: string; titulo: string; resumo: string; categoriaSlug?: string };
type Edition = { home: Story[] };
type SocialState = { updatedAt: string; posted: string[] };

const slugOf = (s: Story): string => s.slug ?? s.clusterId;
const urlOf = (s: Story): string => `${SITE}/noticia/${slugOf(s)}/`;
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Hashtags p/ alcançar quem NÃO segue (feeds de hashtag). Tag do tipo de ocorrência
// (1ª palavra do slug da categoria, ex.: "acidente", "enchente") + "brasil".
function hashtagsFor(story: Story): string[] {
  const tags = ['brasil'];
  const first = (story.categoriaSlug ?? '').split('-')[0];
  if (first && first.length >= 3 && !tags.includes(first)) tags.unshift(first);
  return tags;
}

// Facets do Bluesky: marca cada #tag com offset em BYTES (UTF-8) p/ virar hashtag
// clicável/indexada — sem facet o "#" fica só como texto morto.
function tagFacets(text: string, tags: string[]): Record<string, unknown>[] {
  const enc = new TextEncoder();
  const facets: Record<string, unknown>[] = [];
  let from = 0;
  for (const tag of tags) {
    const needle = `#${tag}`;
    const idx = text.indexOf(needle, from);
    if (idx < 0) continue;
    facets.push({
      index: {
        byteStart: enc.encode(text.slice(0, idx)).length,
        byteEnd: enc.encode(text.slice(0, idx + needle.length)).length,
      },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag }],
    });
    from = idx + needle.length;
  }
  return facets;
}

async function readState(): Promise<SocialState> {
  try {
    return JSON.parse(await readFile(STATE_PATH, 'utf-8')) as SocialState;
  } catch {
    return { updatedAt: '', posted: [] };
  }
}

// --- Bluesky (AT Protocol): post com card ------------------------------------
async function postBluesky(story: Story): Promise<boolean> {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) return false;
  const base = 'https://bsky.social/xrpc';
  const session = await fetch(`${base}/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password }),
  });
  if (!session.ok) {
    console.warn(`Bluesky login falhou: HTTP ${session.status}`);
    return false;
  }
  const { accessJwt, did } = (await session.json()) as { accessJwt: string; did: string };
  const tags = hashtagsFor(story);
  const tagLine = tags.map((t) => `#${t}`).join(' ');
  const text = `${clip(story.titulo, 295 - tagLine.length)}\n\n${tagLine}`; // limite 300 graphemes
  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    langs: ['pt-BR'],
    facets: tagFacets(text, tags),
    embed: {
      $type: 'app.bsky.embed.external',
      external: { uri: urlOf(story), title: clip(story.titulo, 200), description: clip(story.resumo, 280) },
    },
  };
  const res = await fetch(`${base}/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessJwt}` },
    body: JSON.stringify({ repo: did, collection: 'app.bsky.feed.post', record }),
  });
  console.log(`Bluesky: HTTP ${res.status}`);
  return res.ok;
}

// --- Mastodon: status simples ------------------------------------------------
async function postMastodon(story: Story): Promise<boolean> {
  const instance = process.env.MASTODON_INSTANCE?.replace(/\/$/, '');
  const token = process.env.MASTODON_TOKEN;
  if (!instance || !token) return false;
  const tagLine = hashtagsFor(story).map((t) => `#${t}`).join(' ');
  const status = `${clip(story.titulo, 380)}\n\n${urlOf(story)}\n\n${tagLine}`; // limite 500
  const res = await fetch(`${instance}/api/v1/statuses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status, language: 'pt', visibility: 'public' }),
  });
  console.log(`Mastodon: HTTP ${res.status}`);
  return res.ok;
}

async function safe(label: string, fn: () => Promise<boolean>): Promise<boolean> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`${label} falhou (não crítico):`, String(err).slice(0, 140));
    return false;
  }
}

async function main(): Promise<void> {
  const edition = JSON.parse(await readFile(resolve(process.cwd(), 'data/current.json'), 'utf-8')) as Edition;
  const state = await readState();
  const already = new Set(state.posted);

  const top = edition.home.find((s) => !already.has(slugOf(s)));
  if (!top) {
    console.log('Social: nada novo p/ postar.');
    return;
  }

  const anyConfigured =
    !!(process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD) ||
    !!(process.env.MASTODON_INSTANCE && process.env.MASTODON_TOKEN);
  if (!anyConfigured) {
    console.log('Social: nenhuma rede configurada (sem secrets) — pulando.');
    return;
  }

  const results = await Promise.all([
    safe('Bluesky', () => postBluesky(top)),
    safe('Mastodon', () => postMastodon(top)),
  ]);

  if (!results.some(Boolean)) {
    console.log('Social: nada postado (nenhuma rede aceitou) — estado preservado.');
    return;
  }

  const posted = [...state.posted, slugOf(top)].slice(-500);
  await writeFile(STATE_PATH, `${JSON.stringify({ updatedAt: new Date().toISOString(), posted }, null, 2)}\n`);
  console.log('Social: 1 história marcada como postada.');
}

main().catch((err) => {
  console.warn('Social falhou (não crítico):', String(err).slice(0, 140));
});
