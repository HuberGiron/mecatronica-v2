export const NEWS_STATES = Object.freeze({ borrador: 'Borrador', publicado: 'Publicado', oculto: 'Oculto' });
export const PLACEHOLDER_IMAGE = '/assets/img/home/video-preview.png';
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function parseNewsDate(value) {
  const raw = String(value || '').trim();
  let iso = raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const match = raw.toLowerCase().match(/(?:^|,\s*)(\d{1,2})\s+([a-záéíóú]+)\.?\s+(\d{4})$/);
    if (!match) throw new Error('La fecha de la noticia no es válida.');
    const month = MONTHS.indexOf(match[2].slice(0, 3));
    if (month < 0) throw new Error('El mes de la noticia no es válido.');
    iso = `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== iso) throw new Error('La fecha de la noticia no es válida.');
  return iso;
}

export function formatNewsDate(value) {
  if (!value) return '';
  const iso = parseNewsDate(value);
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T12:00:00Z`));
}

export function safeNewsUrl(value, image = false) {
  const raw = String(value || '').trim();
  if (!raw) return image ? PLACEHOLDER_IMAGE : '';
  if (/[\s<>"'\\]/.test(raw)) return '';
  if (image && /^\/[^/]/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function validateNews(input) {
  const titulo = String(input.titulo || '').trim();
  const resumen = String(input.resumen || '').trim();
  const url = safeNewsUrl(input.url);
  const imagen = safeNewsUrl(input.imagen, true);
  if (!titulo || titulo.length > 240) throw new Error('Escribe un título de entre 1 y 240 caracteres.');
  if (resumen.length > 3000) throw new Error('El resumen admite hasta 3000 caracteres.');
  if (!url || url.length > 2048) throw new Error('Escribe un enlace válido que comience con https://.');
  if (!imagen || imagen.length > 2048) throw new Error('Escribe una imagen con https:// o una ruta del sitio que empiece con /.');
  if (!Object.hasOwn(NEWS_STATES, input.estado)) throw new Error('Selecciona un estado válido.');
  return { titulo, resumen, url, imagen, fechaISO: parseNewsDate(input.fechaISO), estado: input.estado };
}

export function normalizeLegacyNews(item) {
  const news = validateNews({ ...item, fechaISO: parseNewsDate(item.fecha), estado: 'publicado' });
  return { ...news, fechaTexto: String(item.fecha || ''), legacyImported: true };
}

export function sortNews(items) {
  return [...items].sort((a, b) => String(b.fechaISO || '').localeCompare(String(a.fechaISO || '')) || String(a.id || a.url || '').localeCompare(String(b.id || b.url || '')));
}

export function filterNews(items, search, state) {
  const clean = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const term = clean(search).trim();
  return sortNews(items).filter(item => (!state || item.estado === state) && (!term || clean(`${item.titulo} ${item.resumen}`).includes(term)));
}

export async function newsIdForUrl(url) {
  const safe = safeNewsUrl(url);
  if (!safe) throw new Error('El enlace de la noticia no es válido.');
  const parsed = new URL(safe);
  parsed.hash = '';
  const canonical = parsed.href.replace(/\/$/, '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return 'noticia-' + [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function publicNewsMode(settingsExists, settings) {
  // El JSON se usa únicamente antes de la importación. Un error no revierte la migración.
  return settingsExists && settings?.migrated === true ? 'firestore' : 'json';
}
