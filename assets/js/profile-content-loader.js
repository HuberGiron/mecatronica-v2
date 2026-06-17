(function () {
  'use strict';

  const DEFAULT_CONFIG = {
    personaId: '',
    dataBaseUrl: '/data',
    homeLimit: 3,
    listingPage: 'mas-contenido.html',
    detalleBaseUrl: '/academia/detalle.html'
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
      .profile-content-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.25rem;margin-top:1rem}
      .profile-content-card{display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(0,0,0,.08);border-radius:1rem;background:#fff;box-shadow:0 12px 32px rgba(0,0,0,.06);height:100%}
      .profile-content-card img{width:100%;height:170px;object-fit:cover;background:#f6f6f6}
      .profile-content-card-body{display:flex;flex-direction:column;gap:.7rem;padding:1rem;flex:1}
      .profile-content-meta{display:flex;flex-wrap:wrap;gap:.35rem;align-items:center}
      .profile-content-badge{display:inline-flex;align-items:center;border:1px solid rgba(0,0,0,.12);border-radius:999px;padding:.22rem .55rem;font-size:.75rem;background:#fafafa;color:#333}
      .profile-content-type{background:#8c1d40;color:#fff;border-color:#8c1d40}
      .profile-content-card h3{font-size:1.05rem;margin:0;line-height:1.25}
      .profile-content-card p{margin:0;color:#4b4b4b;font-size:.93rem;line-height:1.45}
      .profile-content-footer{display:flex;justify-content:space-between;gap:.8rem;align-items:center;margin-top:auto;padding-top:.5rem;border-top:1px solid rgba(0,0,0,.07)}
      .profile-content-date{font-size:.82rem;color:#666}
      .profile-content-link{font-weight:700;color:#8c1d40;text-decoration:none;white-space:nowrap}
      .profile-content-link:hover{text-decoration:underline}
      .profile-content-more{display:inline-flex;margin-top:1rem;color:#8c1d40;font-weight:700;text-decoration:none}
      .profile-content-empty,.profile-content-error{padding:1rem;border-radius:.75rem;background:#f8f8f8;color:#555}
      .profile-participants{display:flex;flex-wrap:wrap;gap:.45rem}
      .profile-participant{display:inline-flex;align-items:center;gap:.4rem;max-width:100%;padding:.25rem .48rem;border:1px solid rgba(0,0,0,.1);border-radius:999px;text-decoration:none;color:inherit;background:#fff}
      .profile-participant:hover{color:#8c1d40;border-color:rgba(140,29,64,.35)}
      .profile-participant img,.profile-participant-initial{width:24px;height:24px;border-radius:50%;object-fit:cover;flex:0 0 24px}
      .profile-participant-initial{display:inline-flex;align-items:center;justify-content:center;background:#8c1d40;color:#fff;font-size:.75rem;font-weight:700}
      .profile-participant strong{display:block;font-size:.78rem;line-height:1.05}
      .profile-participant small{display:block;font-size:.68rem;color:#666;line-height:1.1}
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
    return tags.map((tag, index) => `<span class="profile-content-badge ${index === 0 ? 'profile-content-type' : ''}">${escapeHtml(tag)}</span>`).join('');
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

  function detailUrl(tipo, item) {
    const config = CONTENT_CONFIG[tipo];
    if (item.url && item.habilitado !== false) return item.url;
    return `${PROFILE.detalleBaseUrl}?coleccion=${encodeURIComponent(config.coleccion)}&id=${encodeURIComponent(item.id)}`;
  }

  function buildCard(tipo, item, personasMap) {
    const image = item.imagen || item.image || FALLBACK_IMAGE;
    const href = detailUrl(tipo, item);
    const external = item.url && item.habilitado !== false;
    return `
      <article class="profile-content-card">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(item.alt || item.titulo || 'Contenido')}" loading="lazy" onerror="this.src='${FALLBACK_IMAGE}'">
        <div class="profile-content-card-body">
          <div class="profile-content-meta">${buildBadges(item)}</div>
          <h3>${escapeHtml(item.titulo || 'Sin título')}</h3>
          <p>${escapeHtml(item.descripcion || '')}</p>
          ${buildParticipants(item, personasMap)}
          <div class="profile-content-footer">
            <span class="profile-content-date">${escapeHtml(item.fechaTexto || '')}</span>
            <a class="profile-content-link" href="${escapeHtml(href)}" ${external ? 'target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(item.botonTexto || 'Más información')} →</a>
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
      <div class="profile-content-grid">
        ${visible.map(item => buildCard(tipo, item, map)).join('')}
      </div>
      <a class="profile-content-more" href="${escapeHtml(moreUrl(tipo))}">${escapeHtml(config.masTexto)} →</a>
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
      <h2>${escapeHtml(config.titulo)}</h2>
      <div class="profile-content-grid">
        ${filtered.map(item => buildCard(tipo, item, map)).join('')}
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

  document.addEventListener('DOMContentLoaded', safeRender);
})();
