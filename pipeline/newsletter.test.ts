import { describe, it, expect } from 'vitest';
import { composeEmail, decideSend, formatDateLabel, type Edition, type NewsletterState } from './newsletter';

const edition: Edition = {
  date: '2026-06-03',
  home: [
    { clusterId: 'c1', slug: 's1', titulo: 'Enchente em Santa Catarina', resumo: 'Resumo da enchente.', porQueImporta: 'Milhares de desalojados.', categoria: 'Enchentes' },
    { clusterId: 'c2', titulo: 'Acidente na BR-101', resumo: 'Resumo do acidente.', categoria: 'Acidente de trânsito' },
  ],
};
const emptyState: NewsletterState = { updatedAt: '', lastSentDate: '', sent: [] };

describe('formatDateLabel', () => {
  it('formata data ISO em pt-BR', () => {
    expect(formatDateLabel('2026-06-03')).toBe('3 de junho de 2026');
    expect(formatDateLabel('2026-01-09')).toBe('9 de janeiro de 2026');
  });
  it('devolve a entrada quando não é data ISO', () => {
    expect(formatDateLabel('xpto')).toBe('xpto');
  });
});

describe('composeEmail', () => {
  it('monta assunto com nome do site + data', () => {
    const email = composeEmail(edition, 8)!;
    expect(email.subject).toBe('GlobalNote Radar · 3 de junho de 2026');
  });
  it('inclui título, URL canônica e prioriza porQueImporta', () => {
    const email = composeEmail(edition, 8)!;
    expect(email.body).toContain('## Enchente em Santa Catarina');
    expect(email.body).toContain('https://radar.globalnote.com.br/noticia/s1/');
    expect(email.body).toContain('Milhares de desalojados.'); // porQueImporta
    expect(email.body).toContain('**Enchentes** ·');
  });
  it('cai no resumo quando não há porQueImporta, e usa clusterId sem slug', () => {
    const email = composeEmail(edition, 8)!;
    expect(email.body).toContain('Resumo do acidente.');
    expect(email.body).toContain('https://radar.globalnote.com.br/noticia/c2/');
  });
  it('respeita maxStories', () => {
    const email = composeEmail(edition, 1)!;
    expect(email.body).toContain('Enchente em Santa Catarina');
    expect(email.body).not.toContain('Acidente na BR-101');
  });
  it('devolve null para edição vazia', () => {
    expect(composeEmail({ date: '2026-06-03', home: [] }, 8)).toBeNull();
  });
});

describe('decideSend', () => {
  const base = { state: emptyState, editionDate: '2026-06-03', hourUtc: 12, sendHour: 12, force: false };
  it('envia quando a edição é nova e está na janela', () => {
    expect(decideSend(base).send).toBe(true);
  });
  it('não reenvia a mesma edição', () => {
    const state: NewsletterState = { updatedAt: '', lastSentDate: '2026-06-03', sent: ['2026-06-03'] };
    expect(decideSend({ ...base, state }).send).toBe(false);
  });
  it('não envia fora da janela horária', () => {
    expect(decideSend({ ...base, hourUtc: 4 }).send).toBe(false);
  });
  it('force ignora janela e dedup', () => {
    const state: NewsletterState = { updatedAt: '', lastSentDate: '2026-06-03', sent: ['2026-06-03'] };
    expect(decideSend({ ...base, state, hourUtc: 0, force: true }).send).toBe(true);
  });
});
