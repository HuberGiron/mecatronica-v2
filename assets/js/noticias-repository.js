import { collection, doc, getDocsFromServer, getDocFromServer, query, orderBy, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';
import { validateNews, formatNewsDate, normalizeLegacyNews, newsIdForUrl, sortNews } from './noticias-core.js?v=cache-20261122';

export function createNewsRepository(db, uid) {
  const settingsRef = doc(db, 'site_settings', 'noticias');
  return {
    async list() {
      const result = await getDocsFromServer(query(collection(db, 'noticias'), orderBy('fechaISO', 'desc')));
      return sortNews(result.docs.map(snapshot => ({ ...snapshot.data(), id: snapshot.id })));
    },
    async migrationStatus() {
      const result = await getDocFromServer(settingsRef);
      return result.exists() && result.data().migrated === true;
    },
    async save(input, existing = null) {
      const data = validateNews(input);
      const id = existing?.id || await newsIdForUrl(data.url);
      const ref = doc(db, 'noticias', id);
      await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        if (!existing && snapshot.exists()) throw new Error('Ya existe una noticia con este enlace. Ábrela desde la lista para editarla.');
        if (existing && (!snapshot.exists() || snapshot.data().revision !== existing.revision)) {
          throw new Error('La noticia cambió en otra sesión. Recarga la lista antes de guardar para revisar la versión más reciente.');
        }
        const previous = snapshot.exists() ? snapshot.data() : null;
        const now = serverTimestamp();
        const saved = {
          ...data,
          fechaTexto: formatNewsDate(data.fechaISO),
          createdAt: previous?.createdAt || now,
          createdByUid: previous?.createdByUid || uid,
          updatedAt: now,
          updatedByUid: uid,
          publishedAt: data.estado === 'publicado' ? now : (previous?.publishedAt || null),
          publishedByUid: data.estado === 'publicado' ? uid : (previous?.publishedByUid || ''),
          revision: (previous?.revision || 0) + 1,
          legacyImported: previous?.legacyImported || false
        };
        transaction.set(ref, saved);
      });
      return id;
    },
    async prepareImport() {
      const response = await fetch('/assets/data/noticias.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudo leer el archivo actual de noticias.');
      const raw = await response.json();
      if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) throw new Error('La importación inicial debe contener entre 1 y 200 noticias.');
      const rows = await Promise.all(raw.map(async (item, index) => {
        try {
          const data = normalizeLegacyNews(item);
          return { ...data, id: await newsIdForUrl(data.url) };
        } catch (error) { throw new Error(`Noticia ${index + 1}: ${error.message}`); }
      }));
      if (new Set(rows.map(item => item.id)).size !== rows.length) throw new Error('Hay enlaces repetidos en el JSON. Corrígelos antes de importar.');
      return sortNews(rows);
    },
    async importLegacy(rows) {
      if (!Array.isArray(rows) || !rows.length || rows.length > 200) throw new Error('Primero revisa el archivo que vas a importar.');
      return runTransaction(db, async transaction => {
        const status = await transaction.get(settingsRef);
        if (status.exists()) return { alreadyImported: true, created: 0, existing: rows.length };
        // Todas las lecturas preceden a las escrituras. Los registros existentes se conservan.
        const references = rows.map(item => doc(db, 'noticias', item.id));
        const snapshots = await Promise.all(references.map(ref => transaction.get(ref)));
        let created = 0;
        for (let i = 0; i < rows.length; i++) {
          if (snapshots[i].exists()) continue;
          const { id, ...data } = rows[i];
          transaction.set(references[i], {
            ...data, createdAt: serverTimestamp(), createdByUid: uid,
            updatedAt: serverTimestamp(), updatedByUid: uid,
            publishedAt: serverTimestamp(), publishedByUid: uid, revision: 1
          });
          created++;
        }
        transaction.set(settingsRef, {
          migrated: true, importedAt: serverTimestamp(), importedByUid: uid,
          sourceCount: rows.length, createdCount: created, existingCount: rows.length - created, version: 1
        });
        return { alreadyImported: false, created, existing: rows.length - created };
      });
    }
  };
}
