import { NEWS_STATES, PLACEHOLDER_IMAGE, formatNewsDate, safeNewsUrl, filterNews } from './noticias-core.js';

export function mountAdmin({ session, repositoryForUser, observeProfile, root = document }) {
  const $ = id => root.getElementById(id);
  const win = root.defaultView;
  let user = null, repository = null, stopProfile = null, generation = 0;
  let authorized = false, busy = false, dirty = false, migrated = false, items = [], selected = null, pageSize = 15, importRows = null;

  function message(id, text = '', type = '') {
    $(id).textContent = text;
    $(id).className = `admin-message ${type}`;
  }
  function setBusy(value) {
    busy = value;
    $('admin-view').setAttribute('aria-busy', String(value));
    $('admin-view').querySelectorAll('button,input,select,textarea').forEach(control => { control.disabled = value || !authorized; });
    $('confirm-import').disabled = value || !authorized;
    $('close-import').disabled = value;
  }
  function inputData() {
    return Object.fromEntries(['titulo', 'resumen', 'fechaISO', 'estado', 'url', 'imagen'].map(name => [name, $('news-form').elements.namedItem(name).value]));
  }
  function renderPreview() {
    const data = inputData();
    $('preview-title').textContent = data.titulo.trim() || 'Título de la noticia';
    $('preview-summary').textContent = data.resumen.trim() || 'El resumen aparecerá aquí.';
    $('preview-image').src = safeNewsUrl(data.imagen, true) || PLACEHOLDER_IMAGE;
    $('preview-image').alt = data.titulo.trim();
    try { $('preview-date').textContent = formatNewsDate(data.fechaISO); } catch { $('preview-date').textContent = ''; }
    const href = safeNewsUrl(data.url);
    $('preview-link').hidden = !href;
    if (href) $('preview-link').href = href; else $('preview-link').removeAttribute('href');
    $('preview-visibility').textContent = data.estado === 'publicado' ? 'Visible en el sitio al guardar' : 'Solo visible para administración';
    $('editor-state').textContent = NEWS_STATES[data.estado] || 'Borrador';
    $('editor-state').className = `admin-badge ${data.estado}`;
  }
  function openEditor(item = null, force = false) {
    if (!authorized || busy) return;
    if (!force && dirty && !win.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?')) return;
    selected = item;
    $('news-form').reset();
    const local = new Date();
    const today = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2,'0')}-${String(local.getDate()).padStart(2,'0')}`;
    for (const [name, value] of Object.entries(item || { fechaISO: today, estado: 'borrador' })) {
      const control = $('news-form').elements.namedItem(name);
      if (control) control.value = value || '';
    }
    $('editor-title').textContent = item ? 'Editar noticia' : 'Nueva noticia';
    $('save-news').textContent = item ? 'Guardar cambios' : 'Guardar noticia';
    dirty = false;
    message('editor-message');
    renderPreview();
    renderList();
  }
  function renderList() {
    $('count-total').textContent = String(items.length);
    $('count-published').textContent = String(items.filter(item => item.estado === 'publicado').length);
    $('count-draft').textContent = String(items.filter(item => item.estado === 'borrador').length);
    $('count-hidden').textContent = String(items.filter(item => item.estado === 'oculto').length);
    const filtered = filterNews(items, $('news-search').value, $('news-filter').value);
    $('list-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'noticia' : 'noticias'}`;
    const list = $('news-list');
    list.replaceChildren();
    if (!filtered.length) {
      const empty = root.createElement('p');
      empty.className = 'admin-muted';
      empty.textContent = items.length ? 'No hay noticias con estos filtros.' : 'Crea una noticia o importa el archivo actual para comenzar.';
      list.append(empty);
    }
    for (const item of filtered.slice(0, pageSize)) {
      const row = root.createElement('article');
      row.className = 'admin-news-row';
      row.setAttribute('aria-current', String(item.id === selected?.id));
      const title = root.createElement('h3'); title.textContent = item.titulo;
      const meta = root.createElement('div'); meta.className = 'admin-row-meta';
      const badge = root.createElement('span'); badge.className = `admin-badge ${item.estado}`; badge.textContent = NEWS_STATES[item.estado] || item.estado;
      const date = root.createElement('time'); date.dateTime = item.fechaISO; date.textContent = formatNewsDate(item.fechaISO);
      meta.append(badge, date);
      const edit = root.createElement('button'); edit.type = 'button'; edit.className = 'admin-text-button'; edit.textContent = 'Editar'; edit.disabled = busy;
      edit.setAttribute('aria-label', `Editar: ${item.titulo}`);
      edit.addEventListener('click', () => { openEditor(item); if (selected?.id === item.id) $('editor-title').scrollIntoView({ behavior:'smooth', block:'start' }); });
      row.append(meta, title, edit); list.append(row);
    }
    $('load-more').hidden = filtered.length <= pageSize;
  }
  async function refresh() {
    const token = generation;
    const [list, migrationComplete] = await Promise.all([repository.list(), repository.migrationStatus()]);
    if (!authorized || token !== generation) return;
    items = list;
    migrated = migrationComplete;
    $('migration-panel').hidden = migrated;
    renderList();
    return list;
  }
  function revoke(text) {
    authorized = false; repository = null; items = []; selected = null; dirty = false; importRows = null;
    $('admin-view').hidden = true; $('login-view').hidden = false;
    if ($('import-dialog').open) $('import-dialog').close();
    $('news-list').replaceChildren(); $('news-form').reset(); $('login-password').value = '';
    $('unauthorized-signout').hidden = !user;
    $('login-form').hidden = !!user; $('reset-password').hidden = !!user;
    setBusy(false);
    message('login-message', text, user ? 'error' : '');
  }
  const stopAuth = session.listen(current => {
    const token = ++generation;
    stopProfile?.(); stopProfile = null; user = current;
    revoke(current ? 'Comprobando tu acceso…' : 'Ingresa con tu cuenta autorizada.');
    if (!current) return;
    stopProfile = observeProfile(current.uid, async profile => {
      if (token !== generation) return;
      if (!profile || profile.activo !== true || profile.role !== 'superadmin') {
        revoke('Tu cuenta no tiene acceso a este administrador. Solicita su habilitación.'); return;
      }
      if (authorized) return;
      authorized = true; repository = repositoryForUser(current.uid);
      $('account-name').textContent = profile.nombre || current.email || 'Mi cuenta';
      $('login-view').hidden = true; $('admin-view').hidden = false;
      message('admin-message'); openEditor(null, true); setBusy(true);
      try { await refresh(); }
      catch (error) { if (token === generation) message('admin-message', friendlyError(error, 'No se pudieron cargar las noticias. Revisa la configuración de Firebase y pulsa Actualizar.'), 'error'); }
      finally { if (token === generation && authorized) setBusy(false); }
    }, () => { if (token === generation) revoke('No se pudo comprobar tu acceso. Revisa la conexión y recarga la página.'); });
  });

  $('login-submit').disabled = false; $('reset-password').disabled = false;
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); $('login-submit').disabled = true; message('login-message', 'Iniciando sesión…');
    try { await session.login($('login-email').value.trim(), $('login-password').value); $('login-password').value = ''; }
    catch (error) { message('login-message', friendlyError(error, 'No se pudo iniciar sesión. Revisa el correo y la contraseña.'), 'error'); }
    finally { $('login-submit').disabled = false; }
  });
  $('reset-password').addEventListener('click', async () => {
    if (!$('login-email').value.trim() || !$('login-email').reportValidity()) { message('login-message', 'Escribe primero tu correo electrónico.', 'error'); return; }
    $('reset-password').disabled = true;
    try { await session.reset($('login-email').value.trim()); message('login-message', 'Si el correo tiene una cuenta, recibirás las instrucciones para restablecer tu contraseña.', 'success'); }
    catch (error) { message('login-message', friendlyError(error, 'No se pudo solicitar el restablecimiento. Inténtalo de nuevo.'), 'error'); }
    finally { $('reset-password').disabled = false; }
  });
  async function logout() {
    if (busy) return;
    if (dirty && !win.confirm('Tienes cambios sin guardar. ¿Quieres cerrar sesión y descartarlos?')) return;
    try { await session.logout(); }
    catch { message(authorized ? 'admin-message' : 'login-message', 'No se pudo cerrar la sesión. Inténtalo de nuevo.', 'error'); }
  }
  $('signout').addEventListener('click', logout); $('unauthorized-signout').addEventListener('click', logout);
  $('new-news').addEventListener('click', () => { openEditor(); $('news-title-input').focus(); });
  $('clear-editor').addEventListener('click', () => openEditor());
  $('nav-news').addEventListener('click', () => $('news-title').scrollIntoView({ behavior:'smooth' }));
  $('news-form').addEventListener('input', () => { dirty = true; renderPreview(); });
  $('news-form').addEventListener('change', () => { dirty = true; renderPreview(); });
  $('preview-image').addEventListener('error', () => { if (!$('preview-image').src.endsWith(PLACEHOLDER_IMAGE)) $('preview-image').src = PLACEHOLDER_IMAGE; });
  for (const id of ['news-search', 'news-filter']) $(id).addEventListener(id === 'news-search' ? 'input' : 'change', () => { pageSize = 15; renderList(); });
  $('load-more').addEventListener('click', () => { pageSize += 15; renderList(); });
  $('reload-news').addEventListener('click', async () => {
    if (!authorized || busy) return;
    if (dirty && !win.confirm('Al actualizar se descartarán los cambios del formulario. ¿Quieres continuar?')) return;
    const id = selected?.id, token = generation; setBusy(true); message('admin-message', 'Actualizando…');
    try { await refresh(); if (authorized && token === generation) { setBusy(false); openEditor(items.find(item => item.id === id) || null, true); message('admin-message', 'Lista actualizada.', 'success'); } }
    catch (error) { if (token === generation) message('admin-message', friendlyError(error, 'No se pudo actualizar la lista.'), 'error'); }
    finally { if (token === generation && authorized) setBusy(false); }
  });
  $('news-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!authorized || busy) return;
    const data = inputData(), token = generation, previous = selected;
    setBusy(true); message('editor-message', 'Guardando…');
    try {
      const id = await repository.save(data, previous);
      if (!authorized || token !== generation) return;
      dirty = false;
      // La escritura ya concluyó; un error posterior de lectura no se presenta como un fallo al guardar.
      try {
        await refresh();
        if (authorized && token === generation) {
          setBusy(false); openEditor(items.find(item => item.id === id), true);
          const resultMessage = data.estado !== 'publicado' ? 'Noticia guardada. Solo administración puede verla.'
            : migrated ? 'Noticia publicada. Ya puede aparecer en el sitio.' : 'Noticia guardada. Completa la importación inicial para activar las noticias en el sitio.';
          message('editor-message', resultMessage, 'success');
        }
      } catch { message('editor-message', 'La noticia se guardó, pero no se pudo actualizar la lista. Pulsa Actualizar antes de volver a editarla.', 'success'); selected = null; }
    } catch (error) { if (token === generation) message('editor-message', friendlyError(error, 'No se pudo guardar la noticia. Conservamos tus cambios en el formulario.'), 'error'); }
    finally { if (token === generation && authorized) setBusy(false); }
  });
  $('review-import').addEventListener('click', async () => {
    if (!authorized || busy) return;
    const token = generation; setBusy(true); message('admin-message', 'Revisando el archivo de noticias…');
    try {
      const rows = await repository.prepareImport();
      if (!authorized || token !== generation) return;
      importRows = rows;
      $('import-summary').textContent = `${rows.length} noticias, del ${formatNewsDate(rows.at(-1).fechaISO)} al ${formatNewsDate(rows[0].fechaISO)}.`;
      $('import-list').replaceChildren();
      for (const item of rows) { const li = root.createElement('li'); li.textContent = `${formatNewsDate(item.fechaISO)} — ${item.titulo}`; $('import-list').append(li); }
      $('confirm-import').textContent = `Importar ${rows.length} noticias`;
      message('import-message'); message('admin-message'); $('import-dialog').showModal();
    } catch (error) { if (token === generation) message('admin-message', friendlyError(error, 'No se pudo preparar la importación.'), 'error'); }
    finally { if (token === generation && authorized) setBusy(false); }
  });
  $('import-dialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  $('confirm-import').addEventListener('click', async () => {
    if (!authorized || busy || !importRows) return;
    const token = generation; setBusy(true); message('import-message', 'Importando noticias. Espera a que termine…');
    try {
      const result = await repository.importLegacy(importRows);
      if (!authorized || token !== generation) return;
      $('import-dialog').close(); $('migration-panel').hidden = true;
      message('admin-message', result.alreadyImported ? 'La importación ya estaba terminada. Se conservaron las noticias existentes.' : `Importación terminada: ${result.created} noticias agregadas y ${result.existing} existentes conservadas. El inicio ya lee la base de datos.`, 'success');
      importRows = null;
      try { await refresh(); } catch { message('admin-message', 'La importación terminó. No se pudo actualizar la lista; pulsa Actualizar.', 'success'); }
    } catch (error) { if (token === generation) message('import-message', friendlyError(error, 'No se pudo completar la importación. Puedes reintentar; los registros existentes se conservarán.'), 'error'); }
    finally { if (token === generation && authorized) setBusy(false); }
  });
  const beforeUnload = event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } };
  win.addEventListener('beforeunload', beforeUnload);
  return () => { stopAuth?.(); stopProfile?.(); win.removeEventListener('beforeunload', beforeUnload); };
}

function friendlyError(error, fallback) {
  const code = String(error?.code || '');
  if (/permission-denied|unauthorized/.test(code)) return 'Tu cuenta no tiene permiso para esta operación. Revisa el perfil y las reglas de acceso.';
  if (/failed-precondition/.test(code)) return 'La base de datos necesita completar su configuración. Revisa el índice indicado en las instrucciones de instalación.';
  if (/unavailable|network-request-failed|deadline-exceeded/.test(code)) return 'No se pudo conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.';
  if (/too-many-requests/.test(code)) return 'Hubo demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
  if (/auth\//.test(code)) return fallback;
  return error instanceof Error && !code ? error.message : fallback;
}
