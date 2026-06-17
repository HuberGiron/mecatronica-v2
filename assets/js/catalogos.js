(function () {
  'use strict';

  const CONFIG = {
    cursos: {
      archivo: '/data/cursos.json',
      titulo: 'Cursos'
    },
    proyectos_investigacion: {
      archivo: '/data/proyectos_investigacion.json',
      titulo: 'Proyectos · Investigación'
    },
    publicaciones: {
      archivo: '/data/publicaciones.json',
      titulo: 'Publicaciones'
    },
    recursos: {
      archivo: '/data/recursos.json',
      titulo: 'Lecciones y recursos'
    },
    alumnos_proyectos: {
      archivo: '/data/alumnos_proyectos.json',
      titulo: 'Proyectos de alumnos'
    }
  };

  const FALLBACK_IMAGE = '/assets/img/home/video-preview.png';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function imageSrc(item) {
    return item.imagen || item.image || FALLBACK_IMAGE;
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo cargar ' + path);
    return response.json();
  }

  async function loadCatalogData(collection) {
    const config = CONFIG[collection];
    if (!config) throw new Error('Colección inválida: ' + collection);
    const [items, lineas, personas] = await Promise.all([
      fetchJson(config.archivo),
      fetchJson('/data/lineas_investigacion.json'),
      fetchJson('/data/personas.json')
    ]);
    return { config, items: asArray(items), lineas: asArray(lineas), personas: asArray(personas) };
  }

  function sortByDateDesc(items) {
    return [...items].sort((a, b) => new Date(b.fechaISO || 0) - new Date(a.fechaISO || 0));
  }

  function getLineaMap(lineas) {
    return new Map(lineas.map(linea => [linea.id, linea]));
  }

  function getPersonaMap(personas) {
    return new Map(personas.map(persona => [persona.id, persona]));
  }

  function getParticipantes(item) {
    if (Array.isArray(item.participantes) && item.participantes.length) return item.participantes;
    // Compatibilidad temporal con datos anteriores.
    if (Array.isArray(item.responsables) && item.responsables.length) {
      return item.responsables.map((r, index) => ({
        personaId: r.personaId,
        rol: r.rol || 'responsable',
        rolTexto: r.rolTexto || 'Responsable',
        orden: r.orden || index + 1
      }));
    }
    if (Array.isArray(item.autores) && item.autores.length) {
      return item.autores.map((a, index) => ({
        personaId: a.personaId,
        rol: a.rol || 'autor',
        rolTexto: a.rolTexto || 'Autor',
        orden: a.orden || index + 1
      }));
    }
    return [];
  }

  function hydrateParticipantes(item, personaMap) {
    return getParticipantes(item)
      .map((participacion, index) => {
        const persona = personaMap.get(participacion.personaId);
        if (!persona && !participacion.nombre) return null;
        return {
          ...participacion,
          orden: participacion.orden || index + 1,
          persona
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.orden || 9999) - (b.orden || 9999));
  }

  function getParticipantesTexto(item, personaMap) {
    const participantes = hydrateParticipantes(item, personaMap);
    if (participantes.length) {
      return participantes
        .map(p => p.persona?.nombre || p.nombre || p.personaId)
        .filter(Boolean)
        .join(', ');
    }
    return item.autor || '';
  }

  function buildParticipantChips(item, personaMap, compact = true) {
    const participantes = hydrateParticipantes(item, personaMap);
    if (!participantes.length) return item.autor ? `<div class="catalog-author">${escapeHtml(item.autor)}</div>` : '';

    return `<div class="catalog-participants ${compact ? 'catalog-participants-compact' : ''}">
      ${participantes.map(p => {
        const persona = p.persona || {};
        const nombre = persona.nombre || p.nombre || p.personaId;
        const foto = persona.foto || persona.imagen || p.foto || '';
        const url = persona.urlPerfil || p.urlPerfil || '';
        const rol = p.rolTexto || p.rol || '';
        const inner = `
          ${foto ? `<img src="${escapeHtml(foto)}" alt="${escapeHtml(nombre)}" loading="lazy">` : `<span class="catalog-participant-initial">${escapeHtml(nombre.charAt(0))}</span>`}
          <span><strong>${escapeHtml(nombre)}</strong>${rol ? `<small>${escapeHtml(rol)}</small>` : ''}</span>
        `;
        return url
          ? `<a class="catalog-participant" href="${escapeHtml(url)}">${inner}</a>`
          : `<span class="catalog-participant">${inner}</span>`;
      }).join('')}
    </div>`;
  }

  function firstLineaId(item) {
    return asArray(item.lineas)[0] || 'sin-linea';
  }

  function itemUrl(item) {
    if (item.habilitado === false || !item.url) return '';
    return item.url;
  }

  function isExternalUrl(url) {
    return /^https?:\/\//i.test(url);
  }

  function buildBadges(item) {
    const tags = [item.tipoEtiqueta || 'Contenido', ...asArray(item.categorias).slice(0, 3)];
    return tags.map((tag, index) => `<span class="catalog-badge ${index === 0 ? 'catalog-type' : ''}">${escapeHtml(tag)}</span>`).join('');
  }

  function buildCard(collection, item, personaMap) {
    const href = itemUrl(item);
    const disabled = !href;
    const externalAttrs = isExternalUrl(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
    const fecha = item.fechaTexto ? escapeHtml(item.fechaTexto) : '';
    return `
      <article class="catalog-card">
        <img class="catalog-card-img" src="${escapeHtml(imageSrc(item))}" alt="${escapeHtml(item.alt || item.titulo)}" loading="lazy" onerror="this.src='${FALLBACK_IMAGE}'">
        <div class="catalog-card-body">
          <div class="catalog-card-meta">${buildBadges(item)}</div>
          <h3 class="catalog-card-title">${escapeHtml(item.titulo)}</h3>
          <p class="catalog-card-desc">${escapeHtml(item.descripcion)}</p>
          <div class="catalog-card-footer">
            ${fecha ? `<div class="catalog-date">${fecha}</div>` : ''}
            ${buildParticipantChips(item, personaMap, true)}
            ${disabled
              ? '<span class="catalog-link catalog-link-disabled" aria-disabled="true">Próximamente</span>'
              : `<a class="catalog-link" href="${escapeHtml(href)}"${externalAttrs}>Más información →</a>`}
          </div>
        </div>
      </article>`;
  }

  function itemMatches(item, filters, personaMap) {
    const participantesTexto = getParticipantesTexto(item, personaMap);
    const haystack = [
      item.titulo,
      item.descripcion,
      item.autor,
      participantesTexto,
      item.fechaTexto,
      item.tipoEtiqueta,
      ...asArray(item.categorias),
      ...asArray(item.lineas)
    ].join(' ').toLowerCase();
    const qOk = !filters.q || haystack.includes(filters.q.toLowerCase());
    return qOk;
  }

  async function renderListingPage() {
    const page = document.querySelector('[data-catalog-page]');
    if (!page) return;
    const collection = page.getAttribute('data-collection');
    const grid = page.querySelector('[data-catalog-grid]');
    const summary = page.querySelector('[data-catalog-summary]');
    const search = page.querySelector('[data-filter-search]');

    try {
      const { items, lineas, personas } = await loadCatalogData(collection);
      const personaMap = getPersonaMap(personas);
      const published = sortByDateDesc(items.filter(item => item.visible !== false && item.habilitado !== false));

      function render() {
        const filters = {
          q: search?.value.trim() || ''
        };
        const filtered = published.filter(item => itemMatches(item, filters, personaMap));
        if (summary) summary.textContent = `${filtered.length} elemento${filtered.length === 1 ? '' : 's'} encontrado${filtered.length === 1 ? '' : 's'}.`;
        if (!filtered.length) {
          grid.innerHTML = '<div class="catalog-empty">No hay elementos que coincidan con el filtro seleccionado.</div>';
          return;
        }
        grid.innerHTML = `
          <div class="catalog-grid">
            ${filtered.map(item => buildCard(collection, item, personaMap)).join('')}
          </div>`;
      }

      search?.addEventListener('input', render);
      render();
    } catch (error) {
      console.error(error);
      grid.innerHTML = '<div class="catalog-empty">No fue posible cargar el catálogo. Revisa que los archivos JSON estén publicados en /data.</div>';
    }
  }

  function definition(label, value) {
    if (!value) return '';
    return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
  }

  function buildDetail(item, collection, personaMap, lineaMap) {
    const lineas = asArray(item.lineas).map(id => lineaMap.get(id)?.nombre || id).join(', ');
    const categorias = asArray(item.categorias).join(', ');
    const external = item.url && item.habilitado !== false
      ? `<a class="btn btn-ibero btn-ibero-red mt-3" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Abrir recurso externo</a>`
      : `<span class="btn btn-ibero btn-ibero-outline mt-3 disabled" aria-disabled="true">Próximamente</span>`;
    return `
      <div class="row g-4 align-items-start">
        <div class="col-lg-7">
          <img class="catalog-detail-cover" src="${escapeHtml(imageSrc(item))}" alt="${escapeHtml(item.alt || item.titulo)}" onerror="this.src='${FALLBACK_IMAGE}'">
        </div>
        <div class="col-lg-5">
          <div class="catalog-detail-panel">
            <div class="catalog-card-meta">${buildBadges(item)}</div>
            <h1 class="ibero-section-title mb-3">${escapeHtml(item.titulo)}</h1>
            <p class="ibero-text-lg">${escapeHtml(item.descripcion)}</p>
            ${external}
            <hr class="my-4">
            <h2 class="h5 mb-3">Participantes</h2>
            ${buildParticipantChips(item, personaMap, false)}
            <hr class="my-4">
            <dl>
              ${definition('Fecha', item.fechaTexto)}
              ${definition('Líneas', lineas)}
              ${definition('Categorías', categorias)}
              ${definition('ID interno', item.id)}
            </dl>
          </div>
        </div>
      </div>`;
  }

  async function renderDetailPage() {
    const mount = document.querySelector('[data-catalog-detail]');
    if (!mount) return;
    const params = new URLSearchParams(window.location.search);
    const collection = mount.getAttribute('data-collection') || params.get('coleccion') || 'proyectos_investigacion';
    const id = params.get('id');
    if (!id) {
      mount.innerHTML = '<div class="catalog-empty">No se recibió el identificador del contenido.</div>';
      return;
    }
    try {
      const { items, lineas, personas } = await loadCatalogData(collection);
      const item = items.find(entry => entry.id === id);
      if (!item) {
        mount.innerHTML = '<div class="catalog-empty">No se encontró el contenido solicitado.</div>';
        return;
      }
      document.title = `${item.titulo} | Mecatrónica IBERO`;
      mount.innerHTML = buildDetail(item, collection, getPersonaMap(personas), getLineaMap(lineas));
    } catch (error) {
      console.error(error);
      mount.innerHTML = '<div class="catalog-empty">No fue posible cargar la ficha.</div>';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderListingPage();
    renderDetailPage();
  });
})();
