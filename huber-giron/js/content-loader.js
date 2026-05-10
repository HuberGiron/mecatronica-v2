const DOCENTE_INFO = {
  nombre: "Dr. Huber Girón Nieto",
  subtitulo: "Departamento de Estudios en Ingeniería para la Innovación",
  foto: "/assets/img/team/huber.jpg",
  page: "https://mecatronica-ibero.mx/huber-giron/"
};

const CONTENT_CONFIG = {
  cursos: {
    archivo: "data/cursos.json",
    titulo: "Cursos",
    masTexto: "Más cursos"
  },
  proyectos: {
    archivo: "data/proyectos.json",
    titulo: "Proyectos",
    masTexto: "Más proyectos"
  },
  publicaciones: {
    archivo: "data/publicaciones.json",
    titulo: "Publicaciones",
    masTexto: "Más publicaciones"
  },
  recursos: {
    archivo: "data/recursos.json",
    titulo: "Lecciones y recursos",
    masTexto: "Más recursos"
  }
};

function escapeHtml(texto = "") {
  return String(texto)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildBadges(categorias = []) {
  return categorias
    .map(cat => `<span class="badge bg-primary bg-gradient rounded-pill mb-1">${escapeHtml(cat)}</span>`)
    .join("\n");
}

function buildActionButton(item) {
  if (item.habilitado && item.url) {
    return `<a class="btn btn-danger" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.botonTexto || "Leer más")}</a>`;
  }
  return `<button class="btn btn-danger" type="button" disabled>${escapeHtml(item.botonTexto || "Próximamente")}</button>`;
}

function buildCard(item) {
  return `
    <div class="col-lg-4 mb-5">
      <div class="card dynamic-content-card shadow border-0">
        <div class="dynamic-card-media">
          <img class="card-img-top" src="${escapeHtml(item.imagen)}" alt="${escapeHtml(item.alt || item.titulo)}">
        </div>
        <div class="card-body px-4">
          <div class="dynamic-card-badges">
            ${buildBadges(item.categorias)}
          </div>
          <h5 class="card-title dynamic-card-title mb-0">${escapeHtml(item.titulo)}</h5>
          <p class="card-text dynamic-card-text">${escapeHtml(item.descripcion)}</p>
        </div>
        <div class="d-grid px-4 dynamic-card-actions">
          ${buildActionButton(item)}
        </div>
        <div class="card-footer p-4 pt-0 bg-transparent border-top-0">
          <div class="d-flex align-items-center">
            <a href="https://mecatronica-ibero.mx/huber-giron/"><img class="rounded-circle me-3" src="${escapeHtml(item.avatar || DOCENTE_INFO.foto)}" alt="${escapeHtml(item.autor || DOCENTE_INFO.nombre)}" width="40"></a>
            <div class="small">
              <div class="fw-bold">${escapeHtml(item.autor || DOCENTE_INFO.nombre)}</div>
              <div class="text-muted">${escapeHtml(item.fechaTexto || "")}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function sortByDateDesc(items = []) {
  return [...items].sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO));
}

async function fetchSectionItems(tipo) {
  const config = CONTENT_CONFIG[tipo];
  if (!config) return [];
  const response = await fetch(config.archivo, { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo cargar ${config.archivo}`);
  const items = await response.json();
  return sortByDateDesc(items);
}

async function renderHomeSection(tipo) {
  const mount = document.querySelector(`[data-dynamic-section="${tipo}"]`);
  if (!mount) return;

  try {
    const items = await fetchSectionItems(tipo);
    const top3 = items.slice(0, 3);

    mount.innerHTML = `
      <div class="row gx-5">
        ${top3.map(buildCard).join("\n")}
      </div>
      <div class="text-end mb-5 mb-xl-0">
        <a class="text-decoration-none" href="mas-contenido.html?tipo=${encodeURIComponent(tipo)}">
          ${escapeHtml(CONTENT_CONFIG[tipo].masTexto)}
          <i class="bi bi-arrow-right"></i>
        </a>
      </div>
    `;
  } catch (error) {
    console.error(error);
    mount.innerHTML = `
      <div class="alert alert-warning" role="alert">
        No fue posible cargar esta sección automáticamente.
      </div>
    `;
  }
}

async function renderListingPage() {
  const page = document.querySelector("[data-listing-page]");
  if (!page) return;

  const params = new URLSearchParams(window.location.search);
  const tipo = params.get("tipo");
  const config = CONTENT_CONFIG[tipo];

  if (!config) {
    page.innerHTML = `
      <div class="container px-5 my-5">
        <div class="alert alert-warning">La categoría solicitada no existe.</div>
        <a class="btn btn-outline-danger mt-3" href="index.html">Regresar</a>
      </div>
    `;
    return;
  }

  document.title = `Mecatrónica IBERO | ${DOCENTE_INFO.nombre} | ${config.titulo}`;

  const titleNode = document.querySelector("[data-docente-nombre]");
  const subtitleNode = document.querySelector("[data-docente-subtitulo]");
  if (titleNode) titleNode.textContent = DOCENTE_INFO.nombre;
  if (subtitleNode) subtitleNode.textContent = DOCENTE_INFO.subtitulo;

  try {
    const items = await fetchSectionItems(tipo);

    page.innerHTML = `
      <div class="container px-5 my-5">
        <h2 class="fw-bolder fs-4 mb-4">${escapeHtml(config.titulo)}</h2>
        <div class="row gx-5">
          ${items.map(buildCard).join("\n")}
        </div>
        <div class="text-center mt-3">
          <a class="btn btn-outline-danger px-4" href="index.html">Regresar al perfil del académico</a>
        </div>
      </div>
    `;
  } catch (error) {
    console.error(error);
    page.innerHTML = `
      <div class="container px-5 my-5">
        <div class="alert alert-warning">No fue posible cargar el contenido de esta categoría.</div>
        <a class="btn btn-outline-danger mt-3" href="index.html">Regresar</a>
      </div>
    `;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  ["cursos", "proyectos", "publicaciones", "recursos"].forEach(renderHomeSection);
  renderListingPage();
});