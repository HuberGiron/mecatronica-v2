const studentProjects = [
  {
    semester: 'Primavera 2026',
    title: 'Luis Cortés Muñoz y Emanuel Iturbe Rebolledo',
    url: 'https://luiscortesmunoz.github.io/Practicas_Sistemas_Ciberfisicos/',
    buttonText: 'Abrir portafolio',
    enabled: true
  },
  {
    semester: 'Primavera 2026',
    title: 'Ana Camila Sánchez Guevara y Alexander Eduardo Moncada Rivas',
    url: 'https://camilasg25.github.io/Projects_page/',
    buttonText: 'Abrir portafolio',
    enabled: true
  },
  {
    semester: 'Primavera 2026',
    title: 'Renata Darany Badillo Cabrera y Martha Esther Valdes Cruz',
    url: 'https://marthavlds1.github.io/DocumentacionCiberfisicos/Practicas/',
    buttonText: 'Abrir portafolio',
    enabled: true
  },
  {
    semester: 'Otoño 2025',
    title: 'Sebastian Mendez Villegas, Daniela Renee Colin Tinoco y Haili Ailin Avila Ramirez',
    url: 'https://sebas30073007.github.io/Sistemas_Ciberfisicos_Proyecto/',
    buttonText: 'Abrir portafolio',
    enabled: true
  }
];

const DOCENTE_INFO = {
  nombre: 'Dr. Huber Girón Nieto',
  foto: '/assets/img/team/huber.jpg',
  page: 'https://mecatronica-ibero.mx/huber-giron/'
};

const LESSON_JSON_PATHS = [
  'recursos.json'
];

let scheduleWeeks = [];

function escapeHtml(texto = '') {
  return String(texto)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function sortByDateDesc(items = []) {
  return [...items].sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO));
}

async function fetchJsonWithFallback(paths = []) {
  let lastError = null;

  for (const path of paths) {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`No se pudo cargar ${path} (${response.status})`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No se pudo cargar el archivo JSON.');
}

function renderStudents() {
  const container = document.getElementById('studentsContainer');
  if (!container) return;

  container.innerHTML = studentProjects.map(project => `
    <div class="col-md-6 col-xl-4">
      <div class="student-card h-100">
        <div class="card-body d-flex flex-column">
          <span class="student-semester">${project.semester}</span>
          <p class="flex-grow-1">${project.title}</p>
          ${project.enabled
            ? `<a class="btn btn-danger mt-auto" href="${project.url}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right me-2"></i>${project.buttonText}</a>`
            : `<button class="btn btn-outline-secondary mt-auto" type="button" disabled><i class="bi bi-hourglass-split me-2"></i>${project.buttonText}</button>`}
        </div>
      </div>
    </div>
  `).join('');
}

function sessionMatches(week, session, filter) {
  if (!filter) return true;
  const haystack = `${week.title} ${week.range} ${session.date} ${session.block} ${session.topic} ${session.activity}`.toLowerCase();
  return haystack.includes(filter);
}

function renderSchedule(filterText = '') {
  const scheduleContainer = document.getElementById('scheduleContainer');
  const empty = document.getElementById('scheduleEmpty');
  if (!scheduleContainer || !empty) return;

  const filter = filterText.trim().toLowerCase();

  const filteredWeeks = scheduleWeeks
    .map(week => ({
      ...week,
      sessions: week.sessions.filter(session => sessionMatches(week, session, filter))
    }))
    .filter(week => week.sessions.length > 0);

  if (!filteredWeeks.length) {
    scheduleContainer.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  scheduleContainer.innerHTML = filteredWeeks.map(week => `
    <article class="week-card">
      <div class="week-header">
        <div class="week-title-wrap">
          <span class="week-index">${week.week}</span>
          <div>
            <h3 class="week-title">${week.title}</h3>
            <div class="week-range">${week.range}</div>
          </div>
        </div>
      </div>

      <div class="row g-3">
        ${week.sessions.map(session => `
          <div class="col-md-6 col-xl-4">
            <div class="session-item">
              <div class="session-date">${session.date}</div>
              <div class="session-title">${session.topic}</div>
              <div class="session-meta">
                <span class="badge bg-primary bg-gradient rounded-pill">${session.block}</span>
                <span class="badge bg-light text-dark border rounded-pill">Semana ${week.week}</span>
              </div>
              <p class="session-description">${session.activity}</p>
              ${session.enabled
                ? `<a class="btn btn-sm btn-danger" href="${session.lessonUrl}" target="_blank" rel="noopener"><i class="bi bi-journal-bookmark me-2"></i>${session.lessonText}</a>`
                : `<button class="btn btn-sm btn-outline-secondary" type="button" disabled><i class="bi bi-link-45deg me-2"></i>${session.lessonText}</button>`}
            </div>
          </div>
        `).join('')}
      </div>
    </article>
  `).join('');
}

async function loadSchedule() {
  const loading = document.getElementById('scheduleLoading');

  try {
    const response = await fetch('./cronograma.json');
    if (!response.ok) {
      throw new Error(`No se pudo cargar cronograma.json (${response.status})`);
    }

    scheduleWeeks = await response.json();
    if (loading) loading.style.display = 'none';
    renderSchedule();
  } catch (error) {
    console.error(error);
    if (loading) {
      loading.className = 'schedule-empty';
      loading.style.display = 'block';
      loading.textContent = 'No se pudo cargar el cronograma. Verifica que el archivo cronograma.json esté en la carpeta cps.';
    }
  }
}

function initScheduleSearch() {
  const searchInput = document.getElementById('scheduleSearch');
  if (!searchInput) return;

  searchInput.addEventListener('input', event => {
    renderSchedule(event.target.value);
  });
}

function buildLessonBadges(categorias = []) {
  return categorias
    .map(cat => `<span class="badge bg-primary bg-gradient rounded-pill mb-1">${escapeHtml(cat)}</span>`)
    .join('');
}

function buildLessonAction(item) {
  if (item.habilitado && item.url) {
    return `<a class="btn btn-danger" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.botonTexto || 'Leer más')}</a>`;
  }

  return `<button class="btn btn-danger" type="button" disabled>${escapeHtml(item.botonTexto || 'Próximamente')}</button>`;
}

function buildLessonCard(item) {
  return `
    <div class="col-md-6 col-xl-4">
      <div class="card dynamic-content-card shadow border-0">
        <div class="dynamic-card-media">
          <img class="card-img-top" src="${escapeHtml(item.imagen)}" alt="${escapeHtml(item.alt || item.titulo)}">
        </div>
        <div class="card-body px-4">
          <div class="dynamic-card-badges">
            ${buildLessonBadges(item.categorias)}
          </div>
          <h5 class="card-title dynamic-card-title mb-0">${escapeHtml(item.titulo)}</h5>
          <p class="card-text dynamic-card-text">${escapeHtml(item.descripcion)}</p>
        </div>
        <div class="d-grid px-4 dynamic-card-actions">
          ${buildLessonAction(item)}
        </div>
        <div class="card-footer p-4 pt-0 bg-transparent border-top-0">
          <div class="d-flex align-items-center">
            <a href="${escapeHtml(DOCENTE_INFO.page)}"><img class="rounded-circle me-3" src="${escapeHtml(item.avatar || DOCENTE_INFO.foto)}" alt="${escapeHtml(item.autor || DOCENTE_INFO.nombre)}" width="40"></a>
            <div class="small">
              <div class="fw-bold">${escapeHtml(item.autor || DOCENTE_INFO.nombre)}</div>
              <div class="text-muted">${escapeHtml(item.fechaTexto || '')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderLessons(items = []) {
  const container = document.getElementById('lessonsContainer');
  const empty = document.getElementById('lessonsEmpty');

  if (!container || !empty) return;

  if (!items.length) {
    container.innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = 'No hay lecciones disponibles en el archivo JSON.';
    return;
  }

  empty.style.display = 'none';
  container.innerHTML = sortByDateDesc(items).map(buildLessonCard).join('');
}

async function loadLessons() {
  const loading = document.getElementById('lessonsLoading');
  const empty = document.getElementById('lessonsEmpty');

  try {
    const items = await fetchJsonWithFallback(LESSON_JSON_PATHS);
    if (loading) loading.style.display = 'none';
    renderLessons(items);
  } catch (error) {
    console.error(error);
    if (loading) loading.style.display = 'none';
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = 'No se pudo cargar recursos.json. Revisa la ruta del archivo JSON dentro de tu sitio.';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderStudents();
  initScheduleSearch();
  loadSchedule();
  loadLessons();
});
