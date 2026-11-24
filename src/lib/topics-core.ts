// Lógica PURA das páginas-tema (extração de candidatos, fenômenos, validação
// anti-spam, montagem dos hubs). Sem dependência de import.meta.glob / data.ts — por
// isso o PIPELINE (Node/tsx) pode importar daqui sem puxar o carregamento de edições
// do site. O src/lib/topics.ts re-exporta tudo isto + faz o binding com allStories.
//
// Cuidado anti-spam: páginas-tema rasas/genéricas PIORAM o SEO. Por isso:
//   - só viram tema assuntos que aparecem em >= MIN_STORIES histórias distintas;
//   - termos genéricos (Brasil, Governo, dias da semana, meses...) são bloqueados;
//   - temas ainda rasos saem como noindex (ver INDEX_MIN) até ganharem volume.

import type { Story } from './types';
import { storySlug } from './story';
import { GENERIC } from './generic-terms';

export const MIN_STORIES = 2; // mínimo p/ existir a página-tema (Bug #7: baixado de 3 → 2 pra surfacar entidades específicas mais cedo)
export const INDEX_MIN = 4; // mínimo p/ entrar no índice do Google (senão noindex,follow)

// Conectores: podem ligar partes de um nome próprio, mas não valem como tema sozinhos.
const CONNECTORS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'a', 'o', 'ao', 'aos']);

// Fenômenos meteorológicos e climáticos comuns — geralmente vêm em LOWERCASE
// no texto ("onda de calor", "el niño"), então o extrator de runs capitalizados
// não os pega. Detecção por substring direta no título.
const PHENOMENA_KEYWORDS: { match: string; label: string }[] = [
  { match: 'onda de calor', label: 'Onda de calor' },
  { match: 'onda de frio', label: 'Onda de frio' },
  { match: 'frente fria', label: 'Frente fria' },
  { match: 'el nino', label: 'El Niño' },
  { match: 'la nina', label: 'La Niña' },
  { match: 'ciclone bomba', label: 'Ciclone bomba' },
  { match: 'rio atmosferico', label: 'Rio atmosférico' },
  { match: 'super el nino', label: 'Super El Niño' },
];

export const slugifyTopic = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// isProper aceita dígitos depois da 1ª letra pra capturar siglas tipo BR-251,
// BR-163, MG-010. Não casa com tokens que começam com dígito ("2026" não vira tema).
const isProper = (tok: string): boolean => /^[A-ZÀ-Ý][A-Za-zÀ-ÿ0-9'’.-]*$/.test(tok);
const norm = (tok: string): string => slugifyTopic(tok);

const cleanTok = (t: string): string => t.replace(/[.,;:!?()"“”]+$/g, '').replace(/^["“”(]+/g, '');

// Palavras que aparecem capitalizadas FORA da 1ª posição do título — evidência de
// nome próprio (manchetes são sentence case: "Dois carros batem em Manaus" → só
// "Manaus" prova que é nome próprio; "Dois" está maiúsculo só por abrir a frase).
export function midSentenceProperWords(titles: string[]): Set<string> {
  const out = new Set<string>();
  for (const title of titles) {
    const tokens = title.split(/\s+/).filter(Boolean);
    for (let i = 1; i < tokens.length; i++) {
      const tok = cleanTok(tokens[i]);
      if (isProper(tok)) out.add(norm(tok));
    }
  }
  return out;
}

// Extrai frases-nome próprias do título (runs de palavras capitalizadas, permitindo
// conectores em minúsculas no meio). Ex.: "Supremo Tribunal Federal", "Copa do Mundo".
// Se `provenProper` vier, um run de UMA palavra que abre o título só vale se essa
// palavra aparece capitalizada no meio de algum título (senão é só sentence case:
// "Dois", "Três", "Casal", "Adolescente"…). Runs multi-palavra ("Corpo de Bombeiros",
// "Três Lagoas") continuam valendo — o 2º termo capitalizado já indica nome próprio.
export function candidatesFrom(title: string, provenProper?: Set<string>): string[] {
  const tokens = title.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let run: string[] = [];
  let runStart = 0;
  const flush = () => {
    while (run.length && CONNECTORS.has(norm(run[run.length - 1]))) run.pop(); // tira conector no fim
    const sentenceCaseOnly = provenProper && runStart === 0 && run.length === 1 && !provenProper.has(norm(run[0]));
    if (run.length && !sentenceCaseOnly) out.push(run.join(' '));
    run = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const tok = cleanTok(tokens[i]);
    if (isProper(tok)) {
      if (!run.length) runStart = i;
      run.push(tok);
    } else if (CONNECTORS.has(norm(tok)) && run.length && isProper(cleanTok(tokens[i + 1] ?? ''))) {
      run.push(tok.toLowerCase());
    } else {
      flush();
    }
  }
  flush();
  return out;
}

export function isValidTopic(phrase: string): boolean {
  const significant = phrase.split(/\s+/).filter((w) => !CONNECTORS.has(norm(w)));
  if (significant.length === 0) return false;
  const key = slugifyTopic(phrase);
  if (!key || GENERIC.has(key)) return false;
  if (significant.length === 1) {
    const w = norm(significant[0]);
    if (w.length < 4 || GENERIC.has(w)) return false; // 1 palavra: precisa ser distintiva
  }
  return true;
}

export type Topic = { slug: string; label: string; stories: Story[]; indexable: boolean };

// Detecta fenômenos meteorológicos no título por substring após normalizar
// (NFD + lowercase). Retorna pares { cand, label } pra incorporar como candidatos.
export function phenomenaIn(title: string): { cand: string; label: string }[] {
  const normd = title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const out: { cand: string; label: string }[] = [];
  for (const { match, label } of PHENOMENA_KEYWORDS) {
    if (normd.includes(match)) out.push({ cand: label, label });
  }
  return out;
}

export function buildTopics(stories: Story[]): Topic[] {
  const acc = new Map<string, { label: string; stories: Map<string, Story> }>();
  const provenProper = midSentenceProperWords(stories.map((s) => s.titulo));
  for (const story of stories) {
    const seenInStory = new Set<string>();
    // Candidatos por extração de runs capitalizados.
    const candidates = candidatesFrom(story.titulo, provenProper).map((cand) => ({ cand, label: cand }));
    // + fenômenos meteorológicos detectados por substring.
    candidates.push(...phenomenaIn(story.titulo));
    for (const { cand, label } of candidates) {
      if (!isValidTopic(cand)) continue;
      const key = slugifyTopic(cand);
      if (seenInStory.has(key)) continue;
      seenInStory.add(key);
      const entry = acc.get(key) ?? { label, stories: new Map<string, Story>() };
      // rótulo: prefere a forma de superfície mais longa (mais específica)
      if (label.length > entry.label.length) entry.label = label;
      entry.stories.set(storySlug(story), story);
      acc.set(key, entry);
    }
  }
  return [...acc.entries()]
    .map(([slug, e]) => ({
      slug,
      label: e.label,
      stories: [...e.stories.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      indexable: e.stories.size >= INDEX_MIN,
    }))
    .filter((t) => t.stories.length >= MIN_STORIES)
    .sort((a, b) => b.stories.length - a.stories.length);
}
