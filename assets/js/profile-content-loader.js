(function () {
  'use strict';

  const DEFAULT_CONFIG = {
    personaId: '',
    dataBaseUrl: '/data',
    homeLimit: 3,
    listingPage: 'mas-contenido.html'
  };

  const PROFILE = Object.assign({}, DEFAULT_CONFIG, window.PROFILE_CONFIG || {});

  const CONTENT_CONFIG = {
    cursos: {
      archivo: 'cursos.json',
      coleccion: 'cursos',
      titulo: 'Cursos',
      masTexto: 'Más cursos',
      empty: 'No hay cursos registrados para este perfil.'
    },
    proyectos: {
      archivo: 'proyectos_investigacion.json',
      coleccion: 'proyectos_investigacion',
      titulo: 'Proyectos',
      masTexto: 'Más proyectos',
      empty: 'No hay proyectos registrados para este perfil.'
    },
    publicaciones: {
      archivo: 'publicaciones.json',
      coleccion: 'publicaciones',
      titulo: 'Publicaciones',
      masTexto: 'Más publicaciones',
      empty: 'No hay publicaciones registradas para este perfil.'
    },
    recursos: {
      archivo: 'recursos.json',
      coleccion: 'recursos',
      titulo: 'Lecciones y recursos',
      masTexto: 'Más recursos',
      empty: 'No hay recursos registrados para este perfil.'
    }
  };

  const FALLBACK_IMAGE = '/assets/img/home/video-preview.png';

  function injectBaseStyles() {
    if (document.getElementById('profile-content-loader-styles')) return;
    const style = document.createElement('style');
    style.id = 'profile-content-loader-styles';
    style.textContent = `
      .profile-content-empty,.profile-content-error{padding:1rem;border-radius:.75rem;background:#f8f8f8;color:#555}
      .profile-participants{display:flex;flex-wrap:wrap;gap:.45rem}
      .profile-participant{display:inline-flex;align-items:center;gap:.4rem;max-width:100%;padding:.25rem .48rem;border:1px solid rgba(0,0,0,.1);border-radius:999px;text-decoration:none;color:inherit;background:#fff}
      .profile-participant:hover{color:#8c1d40;border-color:rgba(140,29,64,.35)}
      .profile-participant img,.profile-participant-initial{width:24px;height:24px;border-radius:50%;object-fit:cover;flex:0 0 24px}
      .profile-participant-initial{display:inline-flex;align-items:center;justify-content:center;background:#8c1d40;color:#fff;font-size:.75rem;font-weight:700}
      .profile-participant strong{display:block;font-size:.78rem;line-height:1.05}
      .profile-participant small{display:block;font-size:.68rem;color:#666;line-height:1.1}
      .profile-content-link-disabled{pointer-events:none;opacity:.6}
    `;
    document.head.appendChild(style);
  }

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

  function normalizeBase(base) {
    return String(base || '/data').replace(/\/$/, '');
  }

  function dataUrl(file) {
    return `${normalizeBase(PROFILE.dataBaseUrl)}/${file}`;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`No se pudo cargar ${url}`);
    return response.json();
  }

  async function loadAll(tipo) {
    const config = CONTENT_CONFIG[tipo];
    if (!config) return { items: [], personas: [] };
    const [items, personas] = await Promise.all([
      fetchJson(dataUrl(config.archivo)),
      fetchJson(dataUrl('personas.json'))
    ]);
    return { items: asArray(items), personas: asArray(personas), config };
  }

  function sortByDateDesc(items) {
    return [...items].sort((a, b) => new Date(b.fechaISO || 0) - new Date(a.fechaISO || 0));
  }

  function getParticipantes(item) {
    if (Array.isArray(item.participantes) && item.participantes.length) return item.participantes;
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

  function belongsToProfile(item, personaId) {
    if (!personaId) return true;
    return getParticipantes(item).some(p => p.personaId === personaId);
  }

  function personaMap(personas) {
    return new Map(personas.map(persona => [persona.id, persona]));
  }

  function hydrateParticipantes(item, map) {
    return getParticipantes(item)
      .map((p, index) => ({
        ...p,
        orden: p.orden || index + 1,
        persona: map.get(p.personaId)
      }))
      .filter(p => p.persona || p.nombre)
      .sort((a, b) => (a.orden || 9999) - (b.orden || 9999));
  }

  function buildBadges(item) {
    const tags = [item.tipoEtiqueta || 'Contenido', ...asArray(item.categorias).slice(0, 2)];
    return tags.map((tag, index) => `<span class="badge ${index === 0 ? 'bg-primary bg-gradient' : 'bg-primary'}">${escapeHtml(tag)}</span>`).join('');
  }

  function buildParticipants(item, personasMap) {
    const participantes = hydrateParticipantes(item, personasMap);
    if (!participantes.length && item.autor) return `<div class="profile-content-date">${escapeHtml(item.autor)}</div>`;
    if (!participantes.length) return '';
    return `<div class="profile-participants">
      ${participantes.map(p => {
        const persona = p.persona || {};
        const nombre = persona.nombre || p.nombre || p.personaId;
        const foto = persona.foto || persona.imagen || p.foto || '';
        const url = persona.urlPerfil || p.urlPerfil || '';
        const rol = p.rolTexto || p.rol || '';
        const inner = `
          ${foto ? `<img src="${escapeHtml(foto)}" alt="${escapeHtml(nombre)}" loading="lazy">` : `<span class="profile-participant-initial">${escapeHtml(nombre.charAt(0))}</span>`}
          <span><strong>${escapeHtml(nombre)}</strong>${rol ? `<small>${escapeHtml(rol)}</small>` : ''}</span>
        `;
        return url
          ? `<a class="profile-participant" href="${escapeHtml(url)}">${inner}</a>`
          : `<span class="profile-participant">${inner}</span>`;
      }).join('')}
    </div>`;
  }

  function itemUrl(item) {
    if (item.habilitado === false || !item.url) return '';
    return item.url;
  }

  function isExternalUrl(url) {
    return /^https?:\/\//i.test(url);
  }

  function buildCard(tipo, item, personasMap) {
    const image = item.imagen || item.image || FALLBACK_IMAGE;
    const href = itemUrl(item);
    const external = isExternalUrl(href);
    const footerText = item.fechaTexto || item.autor || '';
    const action = href
      ? `<a class="btn btn-primary" href="${escapeHtml(href)}" ${external ? 'target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(item.botonTexto || 'Más información')}</a>`
      : '<span class="btn btn-primary profile-content-link-disabled" aria-disabled="true">Próximamente</span>';
    return `
      <article class="card dynamic-content-card">
        <div class="dynamic-card-media">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(item.alt || item.titulo || 'Contenido')}" loading="lazy" onerror="this.src='${FALLBACK_IMAGE}'">
        </div>
        <div class="card-body">
          <div class="dynamic-card-badges">${buildBadges(item)}</div>
          <h3 class="card-title dynamic-card-title">${escapeHtml(item.titulo || 'Sin título')}</h3>
          <p class="card-text dynamic-card-text">${escapeHtml(item.descripcion || '')}</p>
          <div class="dynamic-card-actions">
            ${action}
          </div>
        </div>
        <div class="card-footer">
          <div class="small w-100">
            ${footerText ? `<div class="mb-2">${escapeHtml(footerText)}</div>` : ''}
            ${buildParticipants(item, personasMap)}
          </div>
        </div>
      </article>`;
  }

  function findHomeMount(tipo) {
    return document.querySelector(`[data-dynamic-section="${tipo}"]`) ||
      document.getElementById(`${tipo}-container`) ||
      document.querySelector(`[data-profile-section="${tipo}"]`);
  }

  function moreUrl(tipo) {
    return `${PROFILE.listingPage}?tipo=${encodeURIComponent(tipo)}`;
  }

  async function renderHomeSection(tipo) {
    const mount = findHomeMount(tipo);
    if (!mount) return;
    injectBaseStyles();
    const { config, items, personas } = await loadAll(tipo);
    const map = personaMap(personas);
    const filtered = sortByDateDesc(items)
      .filter(item => item.visible !== false && item.habilitado !== false)
      .filter(item => belongsToProfile(item, PROFILE.personaId));
    const visible = filtered.slice(0, PROFILE.homeLimit || 3);

    if (!visible.length) {
      mount.innerHTML = `<div class="profile-content-empty">${escapeHtml(config.empty)}</div>`;
      return;
    }

    mount.innerHTML = `
      <div class="row g-4">
        ${visible.map(item => `<div class="col-md-6 col-xl-4">${buildCard(tipo, item, map)}</div>`).join('')}
      </div>
      <a class="btn btn-ibero btn-ibero-outline mt-4" href="${escapeHtml(moreUrl(tipo))}">${escapeHtml(config.masTexto)}</a>
    `;
  }

  async function renderListingPage() {
    const page = document.querySelector('[data-listing-page]');
    if (!page) return;
    injectBaseStyles();
    const params = new URLSearchParams(window.location.search);
    const tipo = params.get('tipo') || page.getAttribute('data-listing-page');
    const { config, items, personas } = await loadAll(tipo);
    const map = personaMap(personas);
    const filtered = sortByDateDesc(items)
      .filter(item => item.visible !== false && item.habilitado !== false)
      .filter(item => belongsToProfile(item, PROFILE.personaId));

    document.title = `Mecatrónica IBERO | ${config.titulo}`;
    const titleNode = document.querySelector('[data-docente-nombre]');
    const subtitleNode = document.querySelector('[data-docente-subtitulo]');
    const persona = personas.find(p => p.id === PROFILE.personaId);
    if (titleNode && persona) titleNode.textContent = persona.nombre;
    if (subtitleNode && persona) subtitleNode.textContent = persona.rol || persona.rolInstitucional || '';

    if (!filtered.length) {
      page.innerHTML = `<div class="profile-content-empty">${escapeHtml(config.empty)}</div><p><a href="index.html">Regresar al perfil</a></p>`;
      return;
    }

    page.innerHTML = `
      <div class="ibero-profile-listing-head">
        <div>
          <div class="ibero-section-kicker">Contenido académico</div>
          <h2 class="ibero-section-title">${escapeHtml(config.titulo)}</h2>
        </div>
        <p>Listado completo del perfil académico, cargado desde el catálogo institucional.</p>
      </div>
      <div class="row g-4">
        ${filtered.map(item => `<div class="col-md-6 col-xl-4">${buildCard(tipo, item, map)}</div>`).join('')}
      </div>
      <p class="mt-4"><a href="index.html">Regresar al perfil del académico</a></p>
    `;
  }

  async function safeRender() {
    try {
      await Promise.all(Object.keys(CONTENT_CONFIG).map(renderHomeSection));
      await renderListingPage();
    } catch (error) {
      console.error(error);
      document.querySelectorAll('[data-dynamic-section], [data-profile-section], [data-listing-page]').forEach(mount => {
        if (!mount.innerHTML.trim() || mount.textContent.includes('Cargando')) {
          mount.innerHTML = '<div class="profile-content-error">No fue posible cargar el contenido del perfil. Revisa /data y personaId.</div>';
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeRender);
  } else {
    safeRender();
  }
})();
