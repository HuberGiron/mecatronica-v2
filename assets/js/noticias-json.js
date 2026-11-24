import { parseNewsDate, validateNews, newsIdForUrl } from './noticias-core.js?v=cache-20261122';

export const MAX_JSON_NEWS = 200;
export const MAX_JSON_BYTES = 2 * 1024 * 1024;

export function parseNewsJson(text, estado = 'borrador') {
  if (!['borrador', 'publicado'].includes(estado)) throw new Error('Selecciona Borrador o Publicado para este lote.');
  if (typeof text !== 'string' || !text.trim()) throw new Error('Pega primero el JSON de tus noticias.');
  if (new TextEncoder().encode(text).length > MAX_JSON_BYTES) throw new Error('El JSON admite hasta 2 MB. Divídelo en lotes más pequeños.');
  // Permite copiar directamente un bloque de código de ChatGPT.
  const source = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
  let parsed;
  try { parsed = JSON.parse(source); }
  catch { throw new Error('El JSON no es válido. Revisa comas, comillas dobles y corchetes. Pega únicamente el objeto o la lista de noticias.'); }
  const input = Array.isArray(parsed) ? parsed : [parsed];
  if (!input.length || input.length > MAX_JSON_NEWS) throw new Error('Pega entre 1 y 200 noticias por lote.');
  return input.map((item, index) => {
    try {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Cada noticia debe ser un objeto JSON.');
      for (const key of ['titulo', 'fecha', 'fechaISO', 'resumen', 'url', 'imagen']) {
        if (Object.hasOwn(item, key) && typeof item[key] !== 'string') throw new Error(`El campo «${key}» debe ser texto entre comillas.`);
      }
      const fechaISO = parseNewsDate(item.fechaISO || item.fecha);
      if (item.fechaISO && item.fecha && parseNewsDate(item.fecha) !== fechaISO) throw new Error('Los campos fecha y fechaISO no coinciden.');
      // El estado lo elige quien importa; autores, permisos y fechas de sistema nunca se copian del JSON.
      return validateNews({ titulo: item.titulo, resumen: item.resumen, url: item.url, imagen: item.imagen, fechaISO, estado });
    } catch (error) { throw new Error(`Noticia ${index + 1}: ${error.message}`); }
  });
}

export async function buildJsonImportPlan(input, existing = []) {
  if (!Array.isArray(input) || !input.length || input.length > MAX_JSON_NEWS) throw new Error('Primero valida un lote de entre 1 y 200 noticias.');
  const known = new Set(existing.map(item => item.id));
  for (const item of existing) {
    // También detecta enlaces editados cuyo documento conserva su identificador anterior.
    try { known.add(await newsIdForUrl(item.url)); } catch { /* Un registro antiguo inválido no bloquea todo el lote. */ }
  }
  const seen = new Set(), rows = [];
  for (const [index, item] of input.entries()) {
    const data = validateNews(item);
    if (!['borrador', 'publicado'].includes(data.estado)) throw new Error('El lote solo puede crear borradores o noticias publicadas.');
    const id = await newsIdForUrl(data.url);
    const disposition = seen.has(id) ? 'repetida' : known.has(id) ? 'existente' : 'nueva';
    seen.add(id);
    rows.push({ ...data, id, sourceIndex: index + 1, disposition });
  }
  return {
    input: rows.map(({ id, sourceIndex, disposition, ...data }) => data), rows,
    total: rows.length, created: rows.filter(item => item.disposition === 'nueva').length,
    existing: rows.filter(item => item.disposition === 'existente').length,
    repeated: rows.filter(item => item.disposition === 'repetida').length
  };
}
