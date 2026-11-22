import { db } from './firebase-client.js';
import { doc, getDocFromServer, collection, query, where, orderBy, limit, getDocsFromServer } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';
import { normalizeLegacyNews, sortNews, publicNewsMode } from './noticias-core.js';

export async function loadPublicNews() {
  const settings = await getDocFromServer(doc(db, 'site_settings', 'noticias'));
  if (publicNewsMode(settings.exists(), settings.data()) === 'json') {
    const response = await fetch('/assets/data/noticias.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo cargar el archivo inicial de noticias.');
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error('El archivo inicial de noticias no es válido.');
    return sortNews(items.map(normalizeLegacyNews));
  }
  const request = query(collection(db, 'noticias'), where('estado', '==', 'publicado'), orderBy('fechaISO', 'desc'), limit(60));
  try {
    const result = await getDocsFromServer(request);
    return result.docs.map(snapshot => ({ ...snapshot.data(), id: snapshot.id }));
  } catch (error) {
    // Mientras se crea el índice compuesto, el filtro simple sigue respetando
    // las reglas públicas. Ordenar antes de recortar conserva las más recientes.
    if (error?.code !== 'failed-precondition' || !/index/i.test(String(error.message))) throw error;
    const published = query(collection(db, 'noticias'), where('estado', '==', 'publicado'));
    const result = await getDocsFromServer(published);
    return sortNews(result.docs.map(snapshot => ({ ...snapshot.data(), id: snapshot.id }))).slice(0, 60);
  }
}
