// Formatação de datas em PT-BR, sempre no fuso de Brasília. O site é estático,
// então datas SSR são absolutas. O selo de freshness (Bug #8) é a exceção:
// emite valor absoluto no SSR e tem JS que substitui por relativo no client.

const TZ = 'America/Sao_Paulo';

// "às 14h30" — fallback SSR pro selo de freshness. JS substitui por "há X" no load.
export function formatTimeBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return 'às ' + new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
    .format(d)
    .replace(':', 'h');
}

// "20 de mai • 14h30"
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const data = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: 'short' }).format(d);
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
    .format(d)
    .replace(':', 'h');
  return `${data} • ${hora}`;
}

// "terça-feira, 20 de maio de 2026" a partir de uma data AAAA-MM-DD.
export function formatDateFull(date: string): string {
  const d = new Date(`${date}T12:00:00-03:00`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(d);
}
