(() => {
  const data = window.PLAN_DATA;
  if (!data) {
    document.body.innerHTML = '<main><h1>No se encontró PLAN_DATA</h1></main>';
    return;
  }

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const state = {
    selectedId: '',
    query: '',
    activeArrowPairs: new Set(),
    studentProgress: null
  };

  const HISTORY_OBSERVATIONS = ['ORDINARIO', 'REVALIDADA'];
  const HISTORY_OBSERVATION_PATTERN = new RegExp(`\\b(?:${HISTORY_OBSERVATIONS.join('|')})\\b`, 'i');

  function isHistoryObservationLine(value) {
    return HISTORY_OBSERVATION_PATTERN.test(String(value || ''));
  }

  function matchHistoryObservation(value) {
    return String(value || '').match(HISTORY_OBSERVATION_PATTERN);
  }

  const subjects = data.subjects || [];
  const byId = new Map(subjects.map(s => [s.id, s]));

  function isHiddenZeroCreditLab(subject) {
    return !subject?.isPhantom
      && !subject?.visibleInPlan
      && subject?.tipo !== 'eliminada'
      && asNumber(subject?.creditos) === 0
      && /\bLAB(?:ORATORIO)?\b/i.test(String(subject?.nombre || ''));
  }

  function shouldShowLab(subject) {
    return isHiddenZeroCreditLab(subject)
      && subject?.tipo === 'obligatoria'
      && !subject?.optativaGrupo;
  }

  function shouldKeepLabInBlock(subject) {
    return isHiddenZeroCreditLab(subject)
      && (subject?.tipo === 'optativa_catalogo' || Boolean(subject?.optativaGrupo));
  }

  function shouldInheritLabState(subject) {
    return isHiddenZeroCreditLab(subject) && (shouldShowLab(subject) || shouldKeepLabInBlock(subject));
  }

  const visiblePlan = subjects.filter(s => s.visibleInPlan || shouldShowLab(s));
  const catalogVisible = subjects.filter(s => s.visibleInCatalog);
  const byClave = new Map();
  const ownByClave = new Map();
  const bySigla = new Map();

  subjects.forEach(s => {
    if (s.clave) {
      const key = String(s.clave).trim();
      ownByClave.set(key, preferVisibleSubject(ownByClave.get(key), s));
      byClave.set(key, preferVisibleSubject(byClave.get(key), s));
    }
    if (s.labClave) {
      byClave.set(String(s.labClave).trim(), preferVisibleSubject(byClave.get(String(s.labClave).trim()), s));
    }
    if (s.sigla) {
      const siglaKey = String(s.sigla).toUpperCase();
      bySigla.set(siglaKey, preferVisibleSubject(bySigla.get(siglaKey), s));
    }
  });

  Object.entries(data.visibleByClave || {}).forEach(([clave, id]) => {
    const subject = byId.get(id);
    if (subject) byClave.set(String(clave).trim(), subject);
  });

  const pairedTheoryById = new Map();
  subjects.forEach(subject => {
    if (!shouldInheritLabState(subject)) return;
    const ownKey = String(subject.clave || '').trim();
    let pair = null;
    if (subject.sigla) {
      pair = subjects.find(candidate => candidate.id !== subject.id && !candidate.isPhantom && asNumber(candidate.creditos) > 0 && String(candidate.sigla || '').toUpperCase() === String(subject.sigla || '').toUpperCase());
    }
    if (!pair && ownKey) {
      pair = subjects.find(candidate => candidate.id !== subject.id && !candidate.isPhantom && asNumber(candidate.creditos) > 0 && subjectKeys(candidate).includes(ownKey));
    }
    pairedTheoryById.set(subject.id, pair || null);
  });

  function preferVisibleSubject(current, candidate) {
    if (!current) return candidate;
    if (candidate.visibleInPlan && !current.visibleInPlan) return candidate;
    if (candidate.visibleInCatalog && !current.visibleInCatalog) return candidate;
    return current;
  }

  function norm(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[ch]));
  }

  function asNumber(value, fallback = 0) {
    const n = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }

  function displayKey(subject, fallback = '') {
    if (!subject) return fallback;
    if (subject.isPhantom) return '';
    return subject.displayClave || subject.clave || fallback;
  }

  function isARUBlock(subject) {
    const coord = norm(subject?.coordinacion || '');
    const sigla = norm(subject?.sigla || '');
    const name = norm(subject?.nombre || '');
    return coord === 'ARU' || coord.includes('REFLEXION UNIVERSITARIA') || sigla.startsWith('ARU') || name.startsWith('ARU');
  }

  function colorFor(subject) {
    const colorMap = data.colors || {};
    if (isARUBlock(subject)) return colorMap.ARU || colorMap['TALLER DE INTEGRACIÓN UNIVERSITARIA'] || '#dedbc8';
    if (subject.isPhantom) return colorMap.Optativas || '#cfe7b5';
    if (subject.tipo === 'optativa_catalogo' && !isARUBlock(subject) && (subject.optativaGrupo || subject.coordinacion === 'Optativas')) {
      return colorMap.Optativas || '#cfe7b5';
    }
    return colorMap[subject.coordinacion] || '#dfe5ee';
  }

  function getCourseStatus(subject) {
    if (!state.studentProgress || !subject) return null;
    return state.studentProgress.subjectStatus.get(subject.id) || null;
  }

  function statusClass(status, subject = null) {
    if (status?.status === 'approved') return 'progress-approved';

    if (state.studentProgress && subject && subject.isPhantom) {
      const availability = state.studentProgress.availabilityById?.get(subject.id);
      if (availability === 'available') return 'progress-available';
      if (availability === 'locked') return 'progress-locked';
    }

    if (status?.status === 'partial') return 'progress-partial';
    if (status?.status === 'attempted') return 'progress-attempted';

    if (state.studentProgress && subject && !subject.isPhantom) {
      const availability = state.studentProgress.availabilityById?.get(subject.id);
      if (availability === 'available') return 'progress-available';
      if (availability === 'locked') return 'progress-locked';
    }

    return '';
  }

  function periodLabel(period) {
    const key = String(period || '').toUpperCase();
    const labels = { P: 'Primavera', V: 'Verano', O: 'Otoño' };
    return labels[key] ? `${key} (${labels[key]})` : (key || '—');
  }

  function academicTermSortValue(period, year) {
    const cleanYear = Number(year);
    const cleanPeriod = String(period || '').toUpperCase();
    if (!Number.isFinite(cleanYear) || !['P', 'O'].includes(cleanPeriod)) return null;
    return cleanYear * 2 + (cleanPeriod === 'O' ? 1 : 0);
  }

  function academicTermLabel(term) {
    if (!term) return 'No detectado';
    return `${periodLabel(term.period)} ${term.year}`;
  }

  function computeAcademicSemester(history) {
    const termMap = new Map();
    (history?.rows || []).forEach(row => {
      const value = academicTermSortValue(row.period, row.year);
      if (value === null) return;
      const key = `${String(row.period || '').toUpperCase()}-${row.year}`;
      if (!termMap.has(key)) {
        termMap.set(key, {
          period: String(row.period || '').toUpperCase(),
          year: Number(row.year),
          value
        });
      }
    });

    const terms = Array.from(termMap.values()).sort((a, b) => a.value - b.value);
    if (!terms.length) {
      return {
        semester: null,
        first: null,
        last: null,
        countedTerms: 0,
        observedTerms: 0,
        label: 'No detectado',
        detail: 'No se encontraron periodos Primavera u Otoño en el histórico.'
      };
    }

    const first = terms[0];
    const last = terms[terms.length - 1];
    const semester = Math.max(1, last.value - first.value + 1);
    return {
      semester,
      first,
      last,
      countedTerms: semester,
      observedTerms: terms.length,
      label: `${semester}° semestre`,
      detail: `${academicTermLabel(first)} a ${academicTermLabel(last)}`
    };
  }

  function academicSemesterText(progress) {
    const info = progress?.academicSemester;
    if (!info?.semester) return 'No detectado';
    return `${info.semester}° semestre`;
  }

  function academicSemesterDetail(progress) {
    const info = progress?.academicSemester;
    if (!info?.semester) return info?.detail || 'No se detectaron periodos Primavera u Otoño.';
    return info.detail || '';
  }

  function attemptShort(row, subject) {
    if (!row) return 'sin periodo';
    const sem = subject?.semestre ? `sem. ${subject.semestre}°` : 'sem. —';
    const period = row.period ? String(row.period).toUpperCase() : '—';
    const year = row.year || '—';
    return `${row.grade || '—'} · ${period} ${year} · ${sem}`;
  }

  function attemptLong(row, subject) {
    if (!row) return 'Sin datos del intento';
    const sem = subject?.semestre ? `${subject.semestre}°` : '—';
    const year = row.year || '—';
    const group = row.group ? ` · Grupo ${row.group}` : '';
    return `Cal. ${row.grade || '—'} · Semestre ideal ${sem} · Periodo ${periodLabel(row.period)} · Año ${year}${group}`;
  }

  function attemptSummary(status, subject, maxItems = 2) {
    const attempts = (status?.failedAttempts?.length ? status.failedAttempts : (status?.row ? [status.row] : []));
    if (!attempts.length) return { short: status?.grade || '—', full: status?.grade || '—' };
    const shown = attempts.slice(0, maxItems).map(row => attemptShort(row, subject));
    const full = attempts.map(row => attemptLong(row, subject)).join(' | ');
    if (attempts.length > maxItems) shown.push(`+${attempts.length - maxItems} más`);
    return { short: shown.join(' / '), full };
  }

  function statusBadgeHTML(status, subject = null) {
    if (!status) return '';
    if (status.status === 'approved') {
      const title = status.electiveName ? `Acreditada con ${status.electiveName}` : 'Acreditada';
      return `<span class="progress-badge" title="${escapeHTML(title)}">${escapeHTML(status.grade || 'OK')}</span>`;
    }
    if (status.status === 'partial') {
      const title = status.electiveName ? `Elección parcialmente cubierta con ${status.electiveName}` : 'Elección parcialmente cubierta';
      return `<span class="progress-badge partial" title="${escapeHTML(title)}">${escapeHTML(status.creditsCovered)} cr.</span>`;
    }
    if (status.status === 'attempted') {
      const details = attemptSummary(status, subject, 3).full;
      return `<span class="progress-badge attempted" title="${escapeHTML(`Cursada, no acreditada · ${details}`)}">${escapeHTML(status.grade || '—')}</span>`;
    }
    return '';
  }

  function progressNoteHTML(subject, status) {
    if (!status || !state.studentProgress) return '';
    if (status.status === 'approved') {
      if (status.electiveName) {
        return `<span class="course-progress-note">Cal. ${escapeHTML(status.grade || 'AC')} · ${escapeHTML(status.electiveName)}</span>`;
      }
      return `<span class="course-progress-note">Cal. ${escapeHTML(status.grade || 'AC')}</span>`;
    }
    if (status.status === 'partial') {
      const txt = status.electiveName ? `${status.creditsCovered}/${status.creditsRequired} cr. · ${status.electiveName}` : `${status.creditsCovered}/${status.creditsRequired} cr.`;
      return `<span class="course-progress-note partial">${escapeHTML(txt)}</span>`;
    }
    if (status.status === 'attempted') {
      const summary = attemptSummary(status, subject, 2);
      return `<span class="course-progress-note attempted" title="${escapeHTML(summary.full)}">No acreditada · ${escapeHTML(summary.short)}</span>`;
    }
    return '';
  }

  function cardHTML(subject, options = {}) {
    const progress = getCourseStatus(subject);
    const classes = [
      'course-card',
      subject.isPhantom ? 'phantom' : '',
      options.catalog ? 'catalog' : '',
      options.mini ? 'mini' : '',
      statusClass(progress, subject)
    ].filter(Boolean).join(' ');

    return `
      <article class="${classes}" data-course-id="${escapeHTML(subject.id)}" data-clave="${escapeHTML(subject.clave)}" style="--accent:${escapeHTML(colorFor(subject))}">
        ${statusBadgeHTML(progress, subject)}
        <div class="course-title"><span class="course-title-main">${escapeHTML(subject.nombre || 'Sin nombre')}</span>${progressNoteHTML(subject, progress)}</div>
        <div class="course-side">
          <div class="course-hours">${escapeHTML(subject.horas || 'Hrs')}</div>
          <div class="course-sigla"><span class="course-sigla-text">${escapeHTML(subject.sigla || '—')}</span></div>
        </div>
        <div class="course-key" title="${escapeHTML(displayKey(subject))}">${escapeHTML(displayKey(subject))}</div>
        <div class="course-credits" title="Créditos">${escapeHTML(subject.creditos || 'Cr')}</div>
      </article>
    `;
  }

  function subjectMatchesQuery(subject, q) {
    if (!q) return true;
    const haystack = [
      subject.nombre,
      subject.nombreOriginal,
      subject.clave,
      subject.displayClave,
      subject.sigla,
      subject.coordinacion,
      subject.tipoLabel
    ].map(norm).join(' ');
    return haystack.includes(norm(q));
  }

  function renderHeader() {
    const programTitle = $('#programTitle');
    if (programTitle) programTitle.textContent = data.meta?.carrera || 'Plan de estudios';

    const programSubtitle = $('#programSubtitle');
    if (programSubtitle) programSubtitle.textContent = `Plan ${data.meta?.plan || ''}`.trim();

    const mapProgramTitle = $('#mapProgramTitle');
    if (mapProgramTitle) mapProgramTitle.textContent = data.meta?.carrera || 'Plan de estudios';

    const mapPlanBadge = $('#mapPlanBadge');
    if (mapPlanBadge) mapPlanBadge.textContent = data.meta?.plan || 'Plan';

    const statsGrid = $('#statsGrid');
    if (statsGrid) {
      const stats = [
        { n: data.stats?.creditosPlan ?? 0, label: 'créditos totales del programa' },
        { n: data.stats?.materiasPlan ?? visiblePlan.length, label: 'materias y espacios visibles' },
        { n: data.stats?.semestres ?? data.meta?.semestres ?? 10, label: 'semestres ideales' },
        { n: data.stats?.materiasCatalogoOptativas ?? catalogVisible.length, label: 'opciones de electivas y ARU' }
      ];

      if (state.studentProgress) {
        stats.splice(1, 0, {
          n: `${state.studentProgress.planCreditsApproved}/${data.stats?.creditosPlan ?? 0}`,
          label: 'créditos acreditados del alumno'
        });
      }

      statsGrid.innerHTML = stats.map(item => `
        <div class="stat">
          <strong>${escapeHTML(item.n)}</strong>
          <span>${escapeHTML(item.label)}</span>
        </div>
      `).join('');
    }

    const mapTotals = $('#mapTotals');
    if (mapTotals) {
      mapTotals.innerHTML = `
        <div>${escapeHTML(data.stats?.materiasPlan ?? visiblePlan.length)} materias en plan gráfico</div>
        <div>${escapeHTML(data.stats?.creditosPlan ?? 0)} créditos totales del programa</div>
      `;
    }
  }


  function renderPlan() {
    const container = $('#curriculumMap');
    if (!container) return;
    const totalSemesters = Number(data.meta?.semestres || 10);
    container.style.setProperty('--semesters', totalSemesters);
    const bySem = new Map();
    for (let i = 1; i <= totalSemesters; i++) bySem.set(i, []);

    visiblePlan
      .slice()
      .sort((a, b) => (a.semestre - b.semestre) || String(a.nombre).localeCompare(String(b.nombre), 'es'))
      .forEach(s => {
        const sem = Number(s.semestre || 0);
        if (!bySem.has(sem)) bySem.set(sem, []);
        bySem.get(sem).push(s);
      });

    container.innerHTML = Array.from(bySem.entries()).map(([sem, courses]) => `
      <section class="semester-column" data-semester="${sem}">
        <header class="semester-header">
          <span>${sem}° Semestre</span>
          <small>${courses.length} ${courses.length === 1 ? 'materia' : 'materias'}</small>
        </header>
        <div class="semester-body">
          ${courses.map(course => cardHTML(course)).join('') || '<div class="empty-state">—</div>'}
        </div>
      </section>
    `).join('');

    $$('.course-card', container).forEach(card => {
      card.addEventListener('click', () => openCourse(card.dataset.courseId, true));
    });

    applySearch();
  }

  function openCourse(id, scrollIntoView = false) {
    const subject = byId.get(id);
    if (!subject) return;

    state.selectedId = id;
    highlightSelection(subject);

    if (scrollIntoView) {
      const el = $(`.course-card[data-course-id="${CSS.escape(subject.id)}"]`);
      if (el && subject.visibleInPlan) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }

    $('#panelContent').innerHTML = detailHTML(subject);
    $('#coursePanel').classList.add('is-open');
    $('#coursePanel').setAttribute('aria-hidden', 'false');

    $$('[data-open-course]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-open-course');
        if (target) openCourse(target, true);
      });
    });
  }

  function detailHTML(subject) {
    const blankMissingContent = Boolean(data.meta?.blankMissingContent);
    const prereqChips = (subject.prereqInfo || []).length
      ? (subject.prereqInfo || []).map(pre => {
          const target = pre.visibleId || pre.id || '';
          const extra = target ? ` data-open-course="${escapeHTML(target)}"` : '';
          return `<button class="chip clickable" type="button"${extra}>${escapeHTML(pre.clave)} · ${escapeHTML(pre.nombre)}</button>`;
        }).join('')
      : (blankMissingContent ? '' : '<span class="chip">Sin prerrequisitos registrados</span>');

    const labRelation = relationHTML(subject);
    const studentStatus = studentStatusHTML(subject);
    const caratulaAction = subject.caratulaPdf
      ? `<div class="detail-download"><a class="btn ghost caratula-download" href="${escapeHTML(subject.caratulaPdf)}" target="_blank" rel="noopener noreferrer" download>Descargar carátula PDF</a></div>`
      : '';
    const description = subject.descripcion
      ? `<p class="description-text">${escapeHTML(subject.descripcion)}</p>`
      : (blankMissingContent ? '' : `<p class="description-text">Descripción pendiente de cargar.</p>`);

    const contentItems = splitSyllabus(subject.contenido);
    const content = contentItems.length
      ? `<ul class="bullet-list">${contentItems.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`
      : (blankMissingContent ? '' : `<p class="description-text">Contenido pendiente de cargar.</p>`);

    const prereqSection = prereqChips
      ? `<section class="detail-section"><h3>Prerrequisitos</h3><div class="panel-actions">${prereqChips}</div></section>`
      : '';
    const descriptionSection = description
      ? `<section class="detail-section"><h3>¿De qué trata?</h3>${description}</section>`
      : '';
    const contentSection = content
      ? `<section class="detail-section"><h3>Contenido del curso</h3>${content}</section>`
      : '';

    return `
      <div class="detail-hero">
        <div class="detail-mini">${cardHTML(subject, { mini: true })}</div>
        <div class="detail-title">
          <p class="eyebrow">${escapeHTML(subject.isPhantom ? 'Electiva / ARU' : (subject.tipoLabel || 'Materia'))}</p>
          <h2 id="panelTitle">${escapeHTML(subject.nombre)}</h2>
          <div class="detail-grid">
            <div class="detail-field"><span>Clave</span><strong>${escapeHTML(displayKey(subject))}</strong></div>
            <div class="detail-field"><span>Sigla</span><strong>${escapeHTML(subject.sigla || '—')}</strong></div>
            <div class="detail-field"><span>Créditos</span><strong>${escapeHTML(subject.creditos || 0)}</strong></div>
            <div class="detail-field"><span>Horas</span><strong>${escapeHTML(subject.horas || '—')}</strong></div>
            <div class="detail-field"><span>Semestre ideal</span><strong>${escapeHTML(subject.semestre || '—')}</strong></div>
            <div class="detail-field"><span>Coordinación</span><strong>${escapeHTML(subject.coordinacion || '—')}</strong></div>
          </div>
          ${labRelation}
          ${studentStatus}
          ${caratulaAction}
        </div>
      </div>

      ${prereqSection}
      ${descriptionSection}
      ${contentSection}

      ${electiveOptionsHTML(subject)}
    `;
  }

  function electiveOptionsHTML(subject) {
    if (!subject || !subject.optativaGrupo) return '';
    const group = (data.electiveGroups || []).find(g => g.id === subject.optativaGrupo);
    if (!group) return '';
    const options = (group.optionIds || []).map(id => byId.get(id)).filter(Boolean);
    if (!options.length) return '';
    const title = subject.isPhantom
      ? `Materias disponibles para ${group.name}`
      : `Materias de la misma elección: ${group.name}`;
    const intro = subject.isPhantom
      ? 'Se acredita eligiendo una materia del listado, según los créditos requeridos.'
      : 'Estas son las demás opciones de la misma elección.';

    return `
      <section class="detail-section elective-detail-section">
        <h3>${escapeHTML(title)}</h3>
        <p class="description-text compact">${escapeHTML(intro)}</p>
        <div class="elective-option-list">
          ${options.map(option => {
            const status = getCourseStatus(option);
            const statusText = status?.status === 'approved'
              ? `Acreditada · cal. ${status.grade || 'AC'}`
              : (status?.status === 'attempted' ? `No acreditada · ${attemptSummary(status, option, 1).short}` : `${option.creditos || 0} cr. · sem. ${option.semestre || '—'}`);
            const desc = option.descripcion || option.contenido || (data.meta?.blankMissingContent ? '' : 'Descripción pendiente de cargar.');
            return `
              <button type="button" class="elective-option-card ${statusClass(status, option)}" data-open-course="${escapeHTML(option.id)}">
                <strong>${escapeHTML(option.nombre)}</strong>
                <span>${escapeHTML(displayKey(option, 'Clave'))} · ${escapeHTML(option.sigla || '—')} · ${escapeHTML(statusText)}</span>
                <small>${escapeHTML(shortText(desc, 155))}</small>
              </button>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function shortText(value, max = 140) {
    const text = String(value || '').replace(/^[-•]\s*/gm, '').replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max).trim()}…`;
  }

  function studentStatusHTML(subject) {
    if (!state.studentProgress) return '';
    const status = getCourseStatus(subject);
    if (!status) {
      return `
        <div class="detail-field progress-detail pending">
          <span>Avance del alumno</span>
          <strong>Pendiente</strong>
        </div>
      `;
    }

    if (status.status === 'approved') {
      const row = status.row;
      const extra = row ? ` · ${escapeHTML(row.period || '')} ${escapeHTML(row.year || '')}` : '';
      const elective = status.electiveName ? ` · acreditada con ${escapeHTML(status.electiveName)}` : '';
      return `
        <div class="detail-field progress-detail approved">
          <span>Avance del alumno</span>
          <strong>Acreditada · calificación ${escapeHTML(status.grade || 'AC')}${extra}${elective}</strong>
        </div>
      `;
    }

    if (status.status === 'partial') {
      const elective = status.electiveName ? ` · avance con ${escapeHTML(status.electiveName)}` : '';
      return `
        <div class="detail-field progress-detail partial">
          <span>Avance del alumno</span>
          <strong>Elección parcialmente cubierta: ${escapeHTML(status.creditsCovered)} de ${escapeHTML(status.creditsRequired)} créditos${elective}</strong>
        </div>
      `;
    }

    if (status.status === 'pending') {
      return `
        <div class="detail-field progress-detail pending">
          <span>Avance del alumno</span>
          <strong>Pendiente</strong>
        </div>
      `;
    }

    const summary = attemptSummary(status, subject, 10);
    return `
      <div class="detail-field progress-detail attempted">
        <span>Avance del alumno</span>
        <strong>Cursada, no acreditada · ${escapeHTML(summary.short)}</strong>
      </div>
    `;
  }

  function relationHTML(subject) {
    if (subject.labClave) {
      return `
        <div class="detail-field">
          <span>Relación teoría / laboratorio</span>
          <strong>Incluye laboratorio: ${escapeHTML(subject.labNombre || 'Laboratorio asociado')} (${escapeHTML(subject.labClave)})</strong>
        </div>
      `;
    }

    if (subject.theoryClave) {
      return `
        <div class="detail-field">
          <span>Relación teoría / laboratorio</span>
          <strong>Laboratorio asociado a ${escapeHTML(subject.theoryNombre)} (${escapeHTML(subject.theoryClave)})</strong>
        </div>
      `;
    }

    if (subject.isPhantom) {
      const group = (data.electiveGroups || []).find(g => g.id === subject.optativaGrupo);
      return `
        <div class="detail-field">
          <span>Espacio de elección</span>
          <strong>${escapeHTML(group?.name || subject.nombre)} · opciones disponibles en la sección de electivas</strong>
        </div>
      `;
    }

    return `
      <div class="detail-field">
        <span>Relación teoría / laboratorio</span>
        <strong>${escapeHTML(subject.tipoLabel || 'Materia')}</strong>
      </div>
    `;
  }

  function splitSyllabus(text) {
    return String(text || '')
      .split(/\n+/)
      .map(line => line.replace(/^\s*[-•]\s*/, '').trim())
      .filter(Boolean);
  }

  function visibleCardIdFor(subject) {
    if (!subject) return '';
    if (visiblePlan.some(item => item.id === subject.id)) return subject.id;

    const hiddenAsLabOf = subject.hiddenAsLabOf ? byId.get(subject.hiddenAsLabOf) : null;
    if (hiddenAsLabOf && visiblePlan.some(item => item.id === hiddenAsLabOf.id)) return hiddenAsLabOf.id;

    const theory = subject.theorySubjectId ? byId.get(subject.theorySubjectId) : null;
    if (theory && visiblePlan.some(item => item.id === theory.id)) return theory.id;

    const byKey = subject.clave ? byClave.get(String(subject.clave).trim()) : null;
    if (byKey && visiblePlan.some(item => item.id === byKey.id)) return byKey.id;

    return subject.id;
  }

  function extractClaveTokens(value) {
    return String(value || '')
      .match(/\b\d{3,6}\b/g) || [];
  }

  function prereqSubjectsFor(subject) {
    const items = [];
    const seen = new Set();
    const addSubject = candidate => {
      if (!candidate || seen.has(candidate.id)) return;
      seen.add(candidate.id);
      items.push(candidate);
    };
    const addClave = value => {
      extractClaveTokens(value).forEach(clave => {
        addSubject(byClave.get(String(clave).trim()));
        addSubject(ownByClave.get(String(clave).trim()));
      });
    };

    (subject?.resolvedPrereqIds || []).forEach(id => addSubject(byId.get(id)));

    (subject?.prereqInfo || []).forEach(info => {
      if (info.id) addSubject(byId.get(info.id));
      if (info.visibleId) addSubject(byId.get(info.visibleId));
      if (info.clave) addClave(info.clave);
    });

    (subject?.prerequisitos || []).forEach(addClave);

    const ownVisibleId = visibleCardIdFor(subject);
    return items.filter(candidate => candidate.id !== subject?.id && visibleCardIdFor(candidate) !== ownVisibleId);
  }

  function prereqVisibleIdsFor(subject) {
    const ids = new Set();
    prereqSubjectsFor(subject).forEach(candidate => {
      const cardId = visibleCardIdFor(candidate);
      if (cardId) ids.add(cardId);
    });
    ids.delete(subject?.id);
    ids.delete(visibleCardIdFor(subject));
    return Array.from(ids);
  }

  function prereqKeysFor(subject) {
    const keys = new Set();
    prereqSubjectsFor(subject).forEach(candidate => {
      subjectKeys(candidate).forEach(key => {
        const clean = String(key || '').trim();
        if (clean) keys.add(clean);
      });
    });
    return Array.from(keys);
  }

  function isSubjectApprovedForPrereq(subject, subjectStatus = state.studentProgress?.subjectStatus, approvedClaves = state.studentProgress?.approvedClaves) {
    if (!subject || !subjectStatus) return false;

    const direct = subjectStatus.get(subject.id);
    if (direct?.status === 'approved') return true;

    const visibleId = visibleCardIdFor(subject);
    if (visibleId && visibleId !== subject.id) {
      const visibleStatus = subjectStatus.get(visibleId);
      if (visibleStatus?.status === 'approved') return true;
    }

    return subjectKeys(subject).some(key => approvedClaves?.has(String(key).trim()));
  }

  function pairedTheoryForAvailability(subject) {
    if (!subject || subject.isPhantom) return null;
    if (subject.hiddenAsLabOf && byId.has(subject.hiddenAsLabOf)) return byId.get(subject.hiddenAsLabOf);
    if (subject.theorySubjectId && byId.has(subject.theorySubjectId)) return byId.get(subject.theorySubjectId);
    if (shouldInheritLabState(subject)) return pairedTheoryById.get(subject.id) || null;
    return null;
  }

  function canTakeSubject(subject, subjectStatus = state.studentProgress?.subjectStatus, approvedClaves = state.studentProgress?.approvedClaves) {
    if (!subject || !subjectStatus) return false;
    const prereqSubjects = prereqSubjectsFor(subject);
    if (!prereqSubjects.length) return true;
    return prereqSubjects.every(candidate => isSubjectApprovedForPrereq(candidate, subjectStatus, approvedClaves));
  }

  function availabilityStateForCourse(subject, subjectStatus, approvedClaves = state.studentProgress?.approvedClaves) {
    if (!subject || !subjectStatus) return 'locked';
    const status = subjectStatus.get(subject.id);
    if (status && ['approved', 'partial', 'attempted'].includes(status.status)) return '';

    const delegate = pairedTheoryForAvailability(subject);
    const baseSubject = delegate && delegate.id !== subject.id ? delegate : subject;
    return canTakeSubject(baseSubject, subjectStatus, approvedClaves) ? 'available' : 'locked';
  }

  function isCourseStillPending(subject, subjectStatus) {
    if (!subject) return false;
    const status = subjectStatus.get(subject.id);
    if (status?.status === 'approved') return false;
    if (status?.status === 'attempted') return false;
    const required = asNumber(subject.creditos);
    const covered = coveredCreditsFromStatus(subject, status);
    return covered < required || (!required && !status);
  }

  function buildAvailabilityById(subjectStatus, pendingSubjects, approvedClaves = state.studentProgress?.approvedClaves) {
    const availabilityById = new Map();
    const availableSubjects = [];
    const lockedSubjects = [];
    const visiblePendingIds = new Set((pendingSubjects || []).map(subject => subject.id));

    const electiveOptions = (data.electiveGroups || [])
      .flatMap(group => group.optionIds || [])
      .map(id => byId.get(id))
      .filter(Boolean);

    const directCandidates = new Map();
    (pendingSubjects || []).filter(subject => !subject.isPhantom).forEach(subject => directCandidates.set(subject.id, subject));
    electiveOptions.forEach(subject => {
      if (isCourseStillPending(subject, subjectStatus)) directCandidates.set(subject.id, subject);
    });

    subjects
      .filter(subject => shouldInheritLabState(subject) && isCourseStillPending(subject, subjectStatus))
      .forEach(subject => directCandidates.set(subject.id, subject));

    directCandidates.forEach(subject => {
      const value = availabilityStateForCourse(subject, subjectStatus, approvedClaves);
      if (value) availabilityById.set(subject.id, value);
    });

    subjects.filter(shouldInheritLabState).forEach(lab => {
      const labStatus = subjectStatus.get(lab.id);
      if (labStatus && ['approved', 'partial', 'attempted'].includes(labStatus.status)) return;
      const value = availabilityStateForCourse(lab, subjectStatus, approvedClaves);
      if (value) availabilityById.set(lab.id, value);
    });

    (pendingSubjects || []).filter(subject => subject.isPhantom).forEach(phantom => {
      const group = (data.electiveGroups || []).find(item => item.id === phantom.optativaGrupo);
      const options = (group?.optionIds || []).map(id => byId.get(id)).filter(Boolean);
      const hasAvailableOption = options.some(option => availabilityById.get(option.id) === 'available');
      availabilityById.set(phantom.id, hasAvailableOption ? 'available' : 'locked');
    });

    (pendingSubjects || []).forEach(subject => {
      const value = availabilityById.get(subject.id);
      if (value === 'available') availableSubjects.push(subject);
      else if (value === 'locked' && visiblePendingIds.has(subject.id)) lockedSubjects.push(subject);
    });

    return { availabilityById, availableSubjects, lockedSubjects };
  }

  function highlightCardById(id, className) {
    if (!id || !window.CSS?.escape) return;
    $$(`.course-card[data-course-id="${CSS.escape(id)}"]`).forEach(el => el.classList.add(className));
  }

  function highlightSelection(subject) {
    $$('.course-card').forEach(card => {
      card.classList.remove('is-selected', 'is-prereq', 'is-dependent');
    });
    state.activeArrowPairs.clear();

    const selectedCardId = visibleCardIdFor(subject);
    highlightCardById(selectedCardId, 'is-selected');

    const prereqIds = prereqVisibleIdsFor(subject);
    prereqIds.forEach(preId => highlightCardById(preId, 'is-prereq'));

    visiblePlan.forEach(candidate => {
      const candidatePrereqs = prereqVisibleIdsFor(candidate);
      const dependsOnSelected = candidatePrereqs.includes(selectedCardId) || candidatePrereqs.includes(subject.id);
      if (dependsOnSelected) highlightCardById(candidate.id, 'is-dependent');
    });
  }

  function labsForBlockOption(subject) {
    const labs = [];
    const add = lab => {
      if (!lab || labs.some(item => item.id === lab.id)) return;
      labs.push(lab);
    };
    if (subject?.labSubjectId) add(byId.get(subject.labSubjectId));
    if (subject?.labClave) add(subjects.find(item => String(item.clave || '').trim() === String(subject.labClave || '').trim()));
    if (subject?.sigla) {
      subjects
        .filter(item => item.id !== subject.id && shouldKeepLabInBlock(item) && String(item.sigla || '').toUpperCase() === String(subject.sigla || '').toUpperCase())
        .forEach(add);
    }
    if (subject?.clave) {
      subjects
        .filter(item => item.id !== subject.id && shouldKeepLabInBlock(item) && String(item.theoryClave || '').trim() === String(subject.clave || '').trim())
        .forEach(add);
    }
    return labs.filter(shouldKeepLabInBlock);
  }

  function blockOptionHTML(subject) {
    const labs = labsForBlockOption(subject);
    const labChips = labs.length
      ? `<div class="block-lab-list">${labs.map(lab => {
          const labStatus = getCourseStatus(lab);
          const labClasses = ['lab-chip', statusClass(labStatus, lab)].filter(Boolean).join(' ');
          return `<button class="${escapeHTML(labClasses)}" type="button" data-open-course="${escapeHTML(lab.id)}">Lab: ${escapeHTML(lab.nombre)} · ${escapeHTML(lab.clave)} · ${escapeHTML(lab.horas || 'Hrs')}</button>`;
        }).join('')}</div>`
      : '';
    return `<div class="option-card-wrap">${cardHTML(subject, { catalog: true })}${labChips}</div>`;
  }

  function renderBlocks() {
    const root = $('#electiveBlocks');
    if (!root) return;
    const groups = data.electiveGroups || [];

    root.innerHTML = groups.map(group => {
      const phantoms = (group.phantomIds || []).map(id => byId.get(id)).filter(Boolean);
      const options = (group.optionIds || []).map(id => byId.get(id)).filter(Boolean);
      const progress = state.studentProgress?.groupProgress.get(group.id);
      const phantomList = phantoms.length
        ? phantoms.map(s => `<button class="chip clickable" type="button" data-open-course="${escapeHTML(s.id)}">${escapeHTML(s.nombre)} · ${escapeHTML(s.creditos)} cr. · sem. ${escapeHTML(s.semestre)}</button>`).join('')
        : '<span class="chip">Sin representación en el plan</span>';

      const optionCards = options.length
        ? options.map(s => blockOptionHTML(s)).join('')
        : '<div class="empty-state">No hay materias disponibles registradas.</div>';

      const labRows = options.flatMap(option => labsForBlockOption(option).map(lab => ({ option, lab })));
      const labTable = labRows.length
        ? `
          <h4>Laboratorios asociados</h4>
          ${tableHTML([
            {label:'Electiva'},
            {label:'Lab.', className:'center'},
            {label:'Clave lab.', className:'center'},
            {label:'Horas', className:'center'}
          ], labRows.map(({ option, lab }) => ({
            className: 'table-row-clickable',
            attrs: `data-open-course="${escapeHTML(lab.id)}"`,
            cells: [
              escapeHTML(option.nombre),
              escapeHTML(lab.nombre),
              escapeHTML(displayKey(lab, lab.clave || '')),
              escapeHTML(lab.horas || '—')
            ]
          })), { className: 'block-lab-table' })}
        `
        : '';

      const pill = progress
        ? `<strong>${escapeHTML(progress.coveredCredits)} / ${escapeHTML(progress.requiredCredits)}</strong> créditos cubiertos`
        : `<strong>${escapeHTML(group.requiredCredits)}</strong> créditos requeridos`;

      const statusChips = progress
        ? `<span class="chip ok">${escapeHTML(progress.approvedOptions.length)} opciones acreditadas</span><span class="chip">${escapeHTML(progress.pendingCredits)} créditos pendientes</span>`
        : `<span class="chip">${escapeHTML(options.length)} opciones registradas</span>`;

      return `
        <article class="block-card" id="block-${escapeHTML(group.id)}">
          <header class="block-header">
            <div class="block-title">
              <h3>${escapeHTML(group.name)}</h3>
            </div>
            <div class="credit-pill">${pill}</div>
          </header>
          <div class="block-meta">
            ${statusChips}
            <span class="chip extra-plan-credits">${escapeHTML(group.phantomCredits)} créditos representados en el plan</span>
          </div>
          <h4>En el mapa curricular</h4>
          <div class="block-meta">${phantomList}</div>
          <h4>Materias disponibles</h4>
          <div class="option-grid">${optionCards}</div>
          ${labTable}
        </article>
      `;
    }).join('');

    $$('.course-card', root).forEach(card => {
      card.addEventListener('click', () => openCourse(card.dataset.courseId, false));
    });

    $$('[data-open-course]', root).forEach(btn => {
      btn.addEventListener('click', () => openCourse(btn.dataset.openCourse, true));
    });
  }

  function renderSummary() {
    renderTotalCreditsSummary();

    const root = $('#coordSummary');
    if (!root) return;
    const rows = data.coordinationSummary || [];
    const hasProgress = Boolean(state.studentProgress);

    const tableRows = rows.map((row, index) => {
      const courses = (row.subjectIds || []).map(id => byId.get(id)).filter(Boolean).sort((a, b) => (a.semestre - b.semestre) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
      const approvedCredits = hasProgress
        ? courses.reduce((sum, s) => sum + coveredCreditsForSubject(s), 0)
        : null;
      const pendingCredits = hasProgress
        ? Math.max(0, asNumber(row.creditos) - approvedCredits)
        : null;

      const detailRows = courses.map(s => {
        const status = getCourseStatus(s);
        const covered = hasProgress ? coveredCreditsForSubject(s) : null;
        const displayName = status?.electiveName
          ? `${s.nombre} · ${status.electiveName} (${status.grade || 'AC'})`
          : s.nombre;
        const statusText = hasProgress
          ? (status?.status === 'approved'
              ? 'Acreditada'
              : (status?.status === 'partial' ? 'Parcial' : 'Pendiente'))
          : '';
        const creditsText = hasProgress
          ? `${covered}/${asNumber(s.creditos)}`
          : `${asNumber(s.creditos)}`;
        const statusClass = status?.status === 'approved' ? 'status-ok' : (status?.status === 'partial' ? 'status-muted' : '');
        return `
          <tr class="table-row-clickable" data-open-course="${escapeHTML(s.id)}">
            <td data-label="Sem." class="center">${escapeHTML(s.semestre)}°</td>
            <td data-label="Clave">${escapeHTML(displayKey(s))}</td>
            <td data-label="Materia / espacio">${escapeHTML(displayName)}</td>
            <td data-label="Créditos" class="num">${escapeHTML(creditsText)}</td>
            ${hasProgress ? `<td data-label="Estado" class="${statusClass}">${escapeHTML(statusText)}</td>` : ''}
          </tr>
        `;
      }).join('');

      return `
        <tr class="table-row-clickable" data-toggle-summary="${escapeHTML(index)}">
          <td data-label="Área / Coordinación"><button class="table-btn" type="button">${escapeHTML(row.coordinacion)}</button></td>
          ${hasProgress
            ? `<td data-label="Avance" class="num"><strong>${escapeHTML(approvedCredits)}</strong> / ${escapeHTML(row.creditos)} cr.</td><td data-label="Pendientes" class="num">${escapeHTML(pendingCredits)} cr.</td>`
            : `<td data-label="Créditos" class="num">${escapeHTML(row.creditos)} cr.</td>`}
          <td data-label="Materias / espacios" class="num">${escapeHTML(row.materias)}</td>
        </tr>
        <tr class="coord-detail-row" data-summary-detail="${escapeHTML(index)}" hidden>
          <td data-label="" colspan="${hasProgress ? 4 : 3}" class="detail-table-cell">
            <div class="table-scroll">
              <table class="data-table nested-table">
                <thead>
                  <tr>
                    <th class="center">Sem.</th>
                    <th>Clave</th>
                    <th>Materia / espacio</th>
                    <th class="num">Créditos</th>
                    ${hasProgress ? '<th>Estado</th>' : ''}
                  </tr>
                </thead>
                <tbody>
                  ${detailRows || `<tr><td colspan="${hasProgress ? 5 : 4}" class="empty-cell">Sin materias registradas.</td></tr>`}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    root.innerHTML = `
      <div class="table-card">
        <div class="table-scroll">
          <table class="data-table coord-summary-table">
            <thead>
              <tr>
                <th>Área / Coordinación</th>
                ${hasProgress ? '<th class="num">Avance</th><th class="num">Pendientes</th>' : '<th class="num">Créditos</th>'}
                <th class="num">Materias / espacios</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
    `;

    $$('[data-toggle-summary]', root).forEach(row => {
      row.addEventListener('click', event => {
        if (event.target.closest('[data-open-course]')) return;
        const detail = root.querySelector(`[data-summary-detail="${CSS.escape(row.dataset.toggleSummary)}"]`);
        if (detail) detail.hidden = !detail.hidden;
      });
    });

    $$('[data-open-course]', root).forEach(item => {
      item.addEventListener('click', () => openCourse(item.dataset.openCourse, true));
    });
  }

  function renderTotalCreditsSummary() {
    const root = $('#totalCreditsSummary');
    if (!root) return;
    const total = data.stats?.creditosPlan ?? visiblePlan.reduce((sum, s) => sum + asNumber(s.creditos), 0);
    const optativeRequired = data.stats?.creditosOptativosRequeridos ?? 0;

    if (!state.studentProgress) {
      root.innerHTML = `
        <div>
          <span class="eyebrow">Total del programa</span>
          <strong>${escapeHTML(total)} créditos</strong>
        </div>
        <p>${escapeHTML(optativeRequired)} créditos corresponden a electivas y ARU.</p>
      `;
      return;
    }

    const progress = state.studentProgress;
    const percent = total ? Math.round((progress.planCreditsApproved / total) * 100) : 0;
    root.innerHTML = `
      <div>
        <span class="eyebrow">Avance del alumno</span>
        <strong>${escapeHTML(progress.planCreditsApproved)} / ${escapeHTML(total)} créditos</strong>
      </div>
      <p>${escapeHTML(percent)}% de avance curricular estimado con base en el PDF cargado. Pendientes: ${escapeHTML(Math.max(0, total - progress.planCreditsApproved))} créditos.</p>
    `;
  }

  function coveredCreditsForSubject(subject) {
    if (!state.studentProgress) return 0;
    const status = getCourseStatus(subject);
    if (!status) return 0;
    if (status.status === 'approved') return asNumber(subject.creditos);
    if (status.status === 'partial') return asNumber(status.creditsCovered);
    return 0;
  }

  function renderRelatedBlocks(groupIds) {
    const ids = Array.from(new Set(groupIds.filter(Boolean)));
    if (!ids.length) return '';
    return ids.map(gid => {
      const group = (data.electiveGroups || []).find(g => g.id === gid);
      if (!group) return '';
      const options = (group.optionIds || []).map(id => byId.get(id)).filter(Boolean);
      return `
        <div class="detail-section">
          <h3>Opciones de ${escapeHTML(group.name)}</h3>
          <div class="requirement-list">
            ${options.map(s => `
              <div class="requirement-item ${getCourseStatus(s)?.status === 'approved' ? 'ok' : ''}" data-open-course="${escapeHTML(s.id)}">
                <strong>${escapeHTML(displayKey(s))}</strong>
                <span>${escapeHTML(s.nombre)}</span>
                <span>${escapeHTML(s.semestre)}° sem.</span>
                <span>${escapeHTML(s.creditos)} cr.</span>
              </div>
            `).join('') || '<div class="empty-state">Sin opciones registradas.</div>'}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderQualityBox() {
    const box = $('#missingContentBox');
    if (!box) return;
    box.innerHTML = '';
  }

  function applySearch() {
    const q = state.query;
    const statusEl = $('#searchStatus');
    const allCards = $$('.course-card');
    let matches = 0;

    allCards.forEach(card => {
      const subject = byId.get(card.dataset.courseId);
      const ok = subjectMatchesQuery(subject, q);
      card.classList.toggle('is-search-dim', Boolean(q && !ok));
      if (ok && q) matches += 1;
    });

    if (statusEl) {
      statusEl.textContent = q
        ? `${matches} coincidencia${matches === 1 ? '' : 's'} encontradas.`
        : '';
    }
  }

  function clearSelection() {
    state.selectedId = '';
    state.activeArrowPairs.clear();
    $$('.course-card').forEach(card => {
      card.classList.remove('is-selected', 'is-prereq', 'is-dependent', 'is-search-dim');
    });
    const searchInput = $('#searchInput');
    if (searchInput) searchInput.value = '';
    state.query = '';
    const searchStatus = $('#searchStatus');
    if (searchStatus) searchStatus.textContent = '';
    const panel = $('#coursePanel');
    if (panel) {
      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');
    }
  }

  async function handlePdfUpload(file) {
    if (!file) return;
    const status = $('#pdfStatus');
    if (!window.pdfjsLib) {
      status.textContent = 'No se pudo cargar PDF.js. Revisa tu conexión a internet o monta la página en un servidor con la librería disponible.';
      return;
    }

    try {
      status.textContent = 'Leyendo PDF...';
      const pdfData = await extractPdfData(file);
      const history = parseHistoryData(pdfData, file.name);
      const progress = buildStudentProgress(history);
      state.studentProgress = progress;
      logPdfDiagnostics(file, pdfData, history, progress);

      const missing = [];
      if (!progress.student.name) missing.push('nombre');
      if (!progress.student.account) missing.push('número de cuenta');
      const warning = missing.length ? ` No se detectó ${missing.join(' ni ')}; revisa la consola del navegador.` : ' Diagnóstico disponible en consola.';

      const semesterMsg = progress.academicSemester?.semester ? ` · Semestre estimado: ${progress.academicSemester.semester}°` : '';
      status.textContent = `Histórico cargado: ${progress.student.name || 'Alumno'} · ${progress.history.rows.length} registros leídos${semesterMsg}.${warning}`;
      renderAll();
      renderStudentReport();
      document.body.classList.add('has-progress');
    } catch (error) {
      console.error('[Plan MANRESA] Error al leer histórico PDF:', error);
      status.textContent = `No se pudo leer el PDF: ${error.message || error}`;
    }
  }

  async function extractPdfData(file) {
    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];
    const lines = [];
    const allItems = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items
        .map((item, itemIndex) => ({
          str: String(item.str || '').trim(),
          x: Number(item.transform?.[4] || 0),
          y: Number(item.transform?.[5] || 0),
          width: Number(item.width || 0),
          height: Number(item.height || 0),
          page: pageNumber,
          itemIndex
        }))
        .filter(item => item.str);

      const pageLines = groupTextItemsIntoLines(items);
      pageLines.forEach(line => lines.push(line.text));
      pages.push({ pageNumber, items, lines: pageLines });
      allItems.push(...items);
    }

    return {
      numPages: pdf.numPages,
      pages,
      items: allItems,
      lines,
      rawText: lines.join('\n')
    };
  }

  function groupTextItemsIntoLines(items, tolerance = 2.8) {
    const sorted = items.slice().sort((a, b) => (b.y - a.y) || (a.x - b.x));
    const groups = [];

    sorted.forEach(item => {
      const last = groups[groups.length - 1];
      if (last && Math.abs(last.y - item.y) <= tolerance) {
        last.items.push(item);
        last.y = (last.y * (last.items.length - 1) + item.y) / last.items.length;
      } else {
        groups.push({ y: item.y, items: [item] });
      }
    });

    return groups.map((group, lineIndex) => {
      const rowItems = group.items.slice().sort((a, b) => a.x - b.x);
      const text = rowItems
        .map(item => item.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        index: lineIndex,
        y: group.y,
        items: rowItems,
        text
      };
    }).filter(line => line.text);
  }

  function parseHistoryData(pdfData, fileName = '') {
    const accountInfo = detectAccount(pdfData);
    const nameInfo = detectStudentName(pdfData, accountInfo, fileName);
    const rowAttempts = pdfData.lines.map((line, index) => ({ index, line, parsed: parseHistoryRow(line) }));
    const rows = rowAttempts.map(item => item.parsed).filter(Boolean);
    const historyLines = rowAttempts.filter(item => isHistoryObservationLine(item.line));
    const failedHistoryLines = historyLines.filter(item => !item.parsed).map(item => ({ index: item.index, line: item.line }));

    return {
      fileName,
      lines: pdfData.lines,
      student: {
        account: accountInfo.account,
        name: nameInfo.name
      },
      rows,
      debug: {
        account: accountInfo,
        name: nameInfo,
        headerLines: pdfData.lines.slice(0, 45),
        historyLineCount: historyLines.length,
        ordinaryLineCount: historyLines.filter(item => /ORDINARIO\b/i.test(item.line)).length,
        revalidatedLineCount: historyLines.filter(item => /REVALIDADA\b/i.test(item.line)).length,
        failedHistoryLines,
        failedOrdinaryLines: failedHistoryLines
      }
    };
  }

  function detectAccount(pdfData) {
    const candidates = [];

    const pushCandidate = candidate => {
      if (!candidate || !candidate.prefix || !candidate.suffix) return;
      const prefix = String(candidate.prefix).replace(/\D/g, '');
      const suffix = String(candidate.suffix).replace(/\D/g, '');
      if (!/^\d{5,8}$/.test(prefix) || !/^\d$/.test(suffix)) return;
      candidates.push({
        source: candidate.source || 'unknown',
        index: Number.isFinite(candidate.index) ? candidate.index : -1,
        page: candidate.page || null,
        value: `${prefix} - ${suffix}`,
        line: candidate.line || '',
        x: Number.isFinite(candidate.x) ? candidate.x : null,
        y: Number.isFinite(candidate.y) ? candidate.y : null,
        scoreHint: candidate.scoreHint || 0
      });
    };

    const strictAccountRegex = /\b(\d{5,8})\s*[-–]\s*(\d)\b/g;
    const relaxedAccountRegex = /\b(\d{5,8})\s+(\d)\b/g;

    const rawHead = String(pdfData.rawText || pdfData.lines.join('\n')).slice(0, 2500);
    const nearLabel = rawHead.match(/No\.?\s*de\s*Cuenta[\s\S]{0,140}?(\d{5,8})\s*(?:[-–]\s*)?(\d)\b/i);
    if (nearLabel) {
      pushCandidate({
        source: 'raw-near-label',
        index: 0,
        page: 1,
        prefix: nearLabel[1],
        suffix: nearLabel[2],
        line: nearLabel[0].replace(/\s+/g, ' '),
        scoreHint: 95
      });
    }
    const beforeLabel = rawHead.match(/(\d{5,8})\s*(?:[-–]\s*)?(\d)\b[\s\S]{0,140}?No\.?\s*de\s*Cuenta/i);
    if (beforeLabel) {
      pushCandidate({
        source: 'raw-before-label',
        index: 0,
        page: 1,
        prefix: beforeLabel[1],
        suffix: beforeLabel[2],
        line: beforeLabel[0].replace(/\s+/g, ' '),
        scoreHint: 90
      });
    }

    pdfData.lines.forEach((line, index) => {
      const text = String(line || '');
      for (const match of text.matchAll(strictAccountRegex)) {
        pushCandidate({
          source: 'line-strict',
          index,
          page: linePageForIndex(pdfData, index),
          prefix: match[1],
          suffix: match[2],
          line: text,
          scoreHint: 20
        });
      }

      // Algunos PDF separan visualmente el guion y PDF.js reconstruye la línea como "233333 1".
      // Este modo relajado sólo acepta prefijos de 5 a 8 dígitos para no confundir años, fechas o calificaciones.
      for (const match of text.matchAll(relaxedAccountRegex)) {
        if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(text)) continue;
        pushCandidate({
          source: 'line-relaxed',
          index,
          page: linePageForIndex(pdfData, index),
          prefix: match[1],
          suffix: match[2],
          line: text,
          scoreHint: 8
        });
      }
    });

    pdfData.items.forEach(item => {
      const text = String(item.str || '');
      for (const match of text.matchAll(strictAccountRegex)) {
        pushCandidate({
          source: 'item-strict',
          index: item.itemIndex,
          page: item.page,
          prefix: match[1],
          suffix: match[2],
          line: text,
          x: item.x,
          y: item.y,
          scoreHint: 20
        });
      }
    });

    collectSequentialAccountCandidates(pdfData).forEach(pushCandidate);
    collectHeaderAccountCandidates(pdfData).forEach(pushCandidate);

    const unique = uniqueAccountCandidates(candidates);
    unique.forEach(candidate => {
      candidate.score = scoreAccountCandidate(candidate, pdfData);
    });
    unique.sort((a, b) => (b.score - a.score) || ((a.page || 99) - (b.page || 99)) || (a.index - b.index));

    const best = unique[0] || null;
    return {
      account: best ? best.value : '',
      lineIndex: best && String(best.source).startsWith('line') ? best.index : -1,
      line: best?.line || '',
      page: best?.page || null,
      candidates: unique
    };
  }

  function collectSequentialAccountCandidates(pdfData) {
    const found = [];
    (pdfData.pages || []).forEach(page => {
      const items = (page.items || [])
        .filter(item => item.str)
        .slice()
        .sort((a, b) => (b.y - a.y) || (a.x - b.x));

      items.forEach((item, index) => {
        const text = String(item.str || '').trim();
        const inline = text.match(/\b(\d{5,8})\s*[-–]\s*(\d)\b/);
        if (inline) {
          found.push({
            source: 'sequence-inline',
            index: item.itemIndex,
            page: page.pageNumber,
            prefix: inline[1],
            suffix: inline[2],
            line: text,
            x: item.x,
            y: item.y,
            scoreHint: 22
          });
          return;
        }

        const prefixMatch = text.match(/^\s*(\d{5,8})\s*[-–]?\s*$/);
        if (!prefixMatch) return;

        for (let lookAhead = 1; lookAhead <= 6 && index + lookAhead < items.length; lookAhead += 1) {
          const next = String(items[index + lookAhead].str || '').trim();
          const suffixMatch = next.match(/^\s*[-–]?\s*(\d)\s*$/) || next.match(/^\s*[-–]\s*(\d)\b/);
          if (suffixMatch) {
            found.push({
              source: 'sequence-split',
              index: item.itemIndex,
              page: page.pageNumber,
              prefix: prefixMatch[1],
              suffix: suffixMatch[1],
              line: `${text} ${next}`,
              x: item.x,
              y: item.y,
              scoreHint: 18
            });
            break;
          }
        }
      });
    });
    return found;
  }

  function collectHeaderAccountCandidates(pdfData) {
    const found = [];
    const pageOne = (pdfData.pages || [])[0];
    if (!pageOne) return found;

    const rows = groupTextItemsIntoLines(pageOne.items || [], 5.5);
    rows.forEach((row, rowIndex) => {
      if (!/No\.?\s*de\s*Cuenta/i.test(row.text)) return;
      rows.slice(rowIndex, rowIndex + 7).forEach((nearRow, nearOffset) => {
        const text = String(nearRow.text || '');
        const strict = text.match(/\b(\d{5,8})\s*[-–]\s*(\d)\b/);
        if (strict) {
          found.push({
            source: 'header-row-strict',
            index: nearRow.index ?? rowIndex + nearOffset,
            page: 1,
            prefix: strict[1],
            suffix: strict[2],
            line: text,
            scoreHint: 40
          });
        }
        const relaxed = text.match(/\b(\d{5,8})\s+(\d)\b/);
        if (relaxed && !strict) {
          found.push({
            source: 'header-row-relaxed',
            index: nearRow.index ?? rowIndex + nearOffset,
            page: 1,
            prefix: relaxed[1],
            suffix: relaxed[2],
            line: text,
            scoreHint: 30
          });
        }
      });
    });

    return found;
  }

  function scoreAccountCandidate(candidate, pdfData) {
    let score = candidate.scoreHint || 0;
    if (candidate.page === 1) score += 40;
    if (String(candidate.source || '').includes('header')) score += 60;
    if (String(candidate.source || '').includes('strict')) score += 15;
    if (String(candidate.source || '').includes('split')) score += 10;
    if (hasNearbyAccountLabel(candidate, pdfData)) score += 80;
    if (/Fecha|P[aá]gina/i.test(candidate.line || '')) score -= 10;
    return score;
  }

  function hasNearbyAccountLabel(candidate, pdfData) {
    if (String(candidate.source || '').startsWith('line') && candidate.index >= 0) {
      const start = Math.max(0, candidate.index - 5);
      const end = Math.min(pdfData.lines.length, candidate.index + 6);
      return pdfData.lines.slice(start, end).some(line => /No\.?\s*de\s*Cuenta/i.test(line));
    }

    const page = (pdfData.pages || []).find(item => item.pageNumber === candidate.page);
    if (!page || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return false;
    return (page.items || []).some(item => {
      const label = /No\.?\s*de\s*Cuenta/i.test(String(item.str || '')) || /Cuenta/i.test(String(item.str || ''));
      if (!label) return false;
      const dx = Math.abs(Number(item.x || 0) - candidate.x);
      const dy = Math.abs(Number(item.y || 0) - candidate.y);
      return dx < 140 && dy < 80;
    });
  }

  function uniqueAccountCandidates(candidates) {
    const seen = new Set();
    return candidates.filter(candidate => {
      const key = `${candidate.source}|${candidate.page}|${candidate.index}|${candidate.value}|${candidate.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function linePageForIndex(pdfData, lineIndex) {
    let count = 0;
    for (const page of pdfData.pages || []) {
      const next = count + (page.lines?.length || 0);
      if (lineIndex >= count && lineIndex < next) return page.pageNumber;
      count = next;
    }
    return null;
  }

  function detectStudentName(pdfData, accountInfo, fileName = '') {
    const debug = {
      method: '',
      candidates: [],
      sourceLines: []
    };

    const account = accountInfo.account || '';
    const accountLine = accountInfo.line || '';
    const sameLine = parseNameFromAccountLine(accountLine, account);
    if (sameLine.name) {
      return { name: sameLine.name, method: 'same-account-line', candidates: sameLine.candidates, sourceLines: [accountLine] };
    }

    const headerLines = headerWindowLines(pdfData, accountInfo);
    debug.sourceLines = headerLines.map(item => item.line);

    const rowAfterLabels = parseNameFromHeaderLabelRows(headerLines, account);
    if (rowAfterLabels.name) {
      return { name: rowAfterLabels.name, method: 'header-label-row', candidates: rowAfterLabels.candidates, sourceLines: rowAfterLabels.sourceLines };
    }

    const isolated = collectHeaderNameCandidates(headerLines, account);
    debug.candidates = isolated;
    const fromCandidates = buildNameFromHeaderCandidates(isolated);
    if (fromCandidates) {
      return { name: fromCandidates, method: 'header-candidates', candidates: isolated, sourceLines: debug.sourceLines };
    }

    const coordinateName = parseNameFromCoordinateRows(pdfData, account);
    if (coordinateName.name) {
      return coordinateName;
    }

    const fileFallback = parseNameFromFileName(fileName);
    if (fileFallback) {
      return { name: fileFallback, method: 'filename-fallback', candidates: [fileFallback], sourceLines: [] };
    }

    return { name: '', method: 'not-detected', candidates: debug.candidates, sourceLines: debug.sourceLines };
  }

  function headerWindowLines(pdfData, accountInfo) {
    const firstOrdinary = pdfData.lines.findIndex(line => isHistoryObservationLine(line));
    const maxEnd = firstOrdinary > 0 ? firstOrdinary : Math.min(pdfData.lines.length, 70);
    const preferredStart = accountInfo.lineIndex >= 0 ? Math.max(0, accountInfo.lineIndex - 10) : 0;
    const preferredEnd = Math.min(maxEnd, Math.max(preferredStart + 35, (accountInfo.lineIndex >= 0 ? accountInfo.lineIndex + 25 : 45)));
    return pdfData.lines.slice(preferredStart, preferredEnd).map((line, localIndex) => ({
      index: preferredStart + localIndex,
      line
    }));
  }

  function parseNameFromAccountLine(line, account) {
    if (!line || !account) return { name: '', candidates: [] };
    const after = cleanHeaderCandidateValue(String(line).replace(account, ' '));
    if (!after) return { name: '', candidates: [] };
    const words = nameWords(after);
    if (words.length >= 3) {
      return { name: formatStudentNameFromDocumentOrder(words), candidates: [after] };
    }
    return { name: '', candidates: after ? [after] : [] };
  }

  function parseNameFromHeaderLabelRows(headerLines, account) {
    const result = { name: '', candidates: [], sourceLines: [] };

    for (let i = 0; i < headerLines.length; i += 1) {
      const current = headerLines[i].line || '';
      const nextLines = headerLines.slice(i + 1, i + 5).map(item => item.line || '');
      const looksLikeLabelRow = /Apellido\s+Paterno/i.test(current) && /Apellido\s+Materno/i.test(current) && /Nombre/i.test(current);
      if (!looksLikeLabelRow) continue;

      for (const line of nextLines) {
        const cleaned = cleanHeaderCandidateValue(account ? line.replace(account, ' ') : line);
        const words = nameWords(cleaned);
        if (words.length >= 3) {
          result.name = formatStudentNameFromDocumentOrder(words);
          result.candidates.push(cleaned);
          result.sourceLines = [current, line];
          return result;
        }
      }
    }

    return result;
  }

  function collectHeaderNameCandidates(headerLines, account) {
    return headerLines
      .map(item => ({ index: item.index, raw: item.line, value: cleanHeaderCandidateValue(account ? item.line.replace(account, ' ') : item.line) }))
      .filter(item => item.value)
      .filter(item => isLikelyHeaderNameValue(item.value));
  }

  function buildNameFromHeaderCandidates(candidates) {
    for (const item of candidates) {
      const words = nameWords(item.value);
      if (words.length >= 3) return formatStudentNameFromDocumentOrder(words);
    }

    const isolatedWords = candidates
      .map(item => item.value)
      .filter(value => nameWords(value).length === 1)
      .map(value => nameWords(value)[0]);

    if (isolatedWords.length >= 3) {
      return formatStudentNameFromDocumentOrder(isolatedWords.slice(0, 3));
    }

    const allWords = candidates.flatMap(item => nameWords(item.value));
    if (allWords.length >= 3) return formatStudentNameFromDocumentOrder(allWords.slice(0, 3));

    return '';
  }

  function parseNameFromCoordinateRows(pdfData, account) {
    const pageOne = (pdfData.pages || [])[0];
    if (!pageOne) return { name: '', method: 'coordinate-rows', candidates: [], sourceLines: [] };
    const rows = groupTextItemsIntoLines(pageOne.items || [], 4.5);
    const labelIndex = rows.findIndex(row => /Apellido\s+Paterno/i.test(row.text) && /Apellido\s+Materno/i.test(row.text) && /Nombre/i.test(row.text));
    if (labelIndex >= 0) {
      const nearby = rows.slice(labelIndex + 1, labelIndex + 6);
      for (const row of nearby) {
        const cleaned = cleanHeaderCandidateValue(account ? row.text.replace(account, ' ') : row.text);
        const words = nameWords(cleaned);
        if (words.length >= 3) {
          return {
            name: formatStudentNameFromDocumentOrder(words),
            method: 'coordinate-rows',
            candidates: [cleaned],
            sourceLines: [rows[labelIndex].text, row.text]
          };
        }
      }
    }
    return { name: '', method: 'coordinate-rows', candidates: [], sourceLines: [] };
  }

  function cleanHeaderCandidateValue(value) {
    return String(value || '')
      .replace(/\bNo\.?\s*de\s*Cuenta\b/ig, ' ')
      .replace(/\bApellido\s+Paterno\b/ig, ' ')
      .replace(/\bApellido\s+Materno\b/ig, ' ')
      .replace(/\bNombre\b/ig, ' ')
      .replace(/\bHist[oó]rico\s+Alumno\b/ig, ' ')
      .replace(/\bFecha\b|\bP[aá]gina\b/ig, ' ')
      .replace(/\bCarrera\b|\bPlan\b|\bMANRESA\b/ig, ' ')
      .replace(/\bCve\.?\b|\bSigla\b|\bCal\.?\b|\bPer_?A[nñ]o\b|\bGpo\.?\b|\bObs\.?\b/ig, ' ')
      .replace(/\bEste\s+documento\s+no\s+es\s+oficial\b/ig, ' ')
      .replace(/INGENIER[ÍI]A\s+MECATR[ÓO]NICA\s+Y\s+SISTEMAS\s+CIBERF[ÍI]SICOS/ig, ' ')
      .replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, ' ')
      .replace(/\b\d{1,8}\b/g, ' ')
      .replace(/[-–]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isLikelyHeaderNameValue(value) {
    const v = String(value || '').trim();
    if (!v) return false;
    if (v.length < 2 || v.length > 80) return false;
    if (/ORDINARIO|REVALIDADA|CR[EÉ]DITOS|PROMEDIO|MATERIA|C[ÁA]LCULO|F[ÍI]SICA|LABORATORIO|TALLER|PROGRAMACI[ÓO]N|SISTEMAS|INGENIER[ÍI]A/i.test(v)) return false;
    if (/[^A-ZÁÉÍÓÚÜÑa-záéíóúüñ\s.'-]/.test(v)) return false;
    return nameWords(v).length >= 1;
  }

  function nameWords(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(/\s+/)
      .map(word => word.replace(/^[.'-]+|[.'-]+$/g, ''))
      .filter(Boolean)
      .filter(word => /^[A-ZÁÉÍÓÚÜÑa-záéíóúüñ.'-]+$/.test(word));
  }

  function formatStudentNameFromDocumentOrder(words) {
    const cleaned = words.map(w => String(w || '').trim()).filter(Boolean);
    if (cleaned.length < 3) return cleaned.join(' ');
    const paternal = cleaned[0];
    const maternal = cleaned[1];
    const given = cleaned.slice(2).join(' ');
    return `${given} ${paternal} ${maternal}`.replace(/\s+/g, ' ').trim();
  }

  function parseNameFromFileName(fileName) {
    const base = String(fileName || '')
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!base || /otro|hist[oó]rico|avance|kardex/i.test(base)) return '';
    const words = nameWords(base);
    return words.length >= 2 ? words.join(' ') : '';
  }

  function parseHistoryRow(rawLine) {
    const line = String(rawLine || '').replace(/\s+/g, ' ').trim();
    const observationMatch = matchHistoryObservation(line);
    if (!observationMatch) return null;

    const observation = observationMatch[0].toUpperCase();
    const main = line.match(new RegExp(`^\\s*(\\d{3,6})\\s+(.+?)\\s+${observation}\\b`, 'i'));
    if (!main) return null;

    const clave = main[1];
    const body = main[2].trim();
    const tokens = body.split(/\s+/).filter(Boolean);
    if (tokens.length < 5) return null;

    const group = tokens[tokens.length - 1];
    const a = tokens[tokens.length - 2];
    const b = tokens[tokens.length - 3];
    let period = '';
    let year = '';
    let gradeIndex = -1;

    if (isPeriodToken(a) && isYearToken(b)) {
      period = a.toUpperCase();
      year = b;
      gradeIndex = tokens.length - 4;
    } else if (isYearToken(a) && isPeriodToken(b)) {
      year = a;
      period = b.toUpperCase();
      gradeIndex = tokens.length - 4;
    } else {
      return null;
    }

    const grade = tokens[gradeIndex];
    if (!isGradeToken(grade)) return null;

    let creditIndex = -1;
    for (let i = gradeIndex - 1; i >= 0; i -= 1) {
      if (/^\d{1,2}$/.test(tokens[i])) {
        creditIndex = i;
        break;
      }
    }
    if (creditIndex < 0) return null;

    const credits = tokens[creditIndex];
    const prefixTokens = tokens.slice(0, creditIndex).concat(tokens.slice(creditIndex + 1, gradeIndex));
    let parsedName = cleanCourseNameFromPrefix(prefixTokens.join(' '));

    const known = ownByClave.get(clave) || byClave.get(clave) || null;
    if (known) {
      if (!parsedName.sigla && known.sigla) parsedName.sigla = known.sigla;
      if (!parsedName.nombre || norm(parsedName.nombre) === norm(parsedName.sigla) || norm(parsedName.nombre).length < 4) {
        parsedName.nombre = known.nombre;
      }
    }

    const cleanGrade = String(grade || '').toUpperCase().replace(',', '.');
    const numericGrade = Number(cleanGrade);
    const approved = observation === 'REVALIDADA' || cleanGrade === 'AC' || (Number.isFinite(numericGrade) && numericGrade >= 6);

    return {
      clave,
      sigla: parsedName.sigla,
      nombre: parsedName.nombre,
      credits: asNumber(credits),
      grade: cleanGrade,
      numericGrade: Number.isFinite(numericGrade) ? numericGrade : null,
      period,
      year: asNumber(year),
      group,
      approved,
      observation,
      raw: line
    };
  }

  function isPeriodToken(value) {
    return /^[OPV]$/i.test(String(value || ''));
  }

  function isYearToken(value) {
    return /^20\d{2}$/.test(String(value || ''));
  }

  function isGradeToken(value) {
    return /^(AC|BA|NA|NP|[0-9]+(?:[.,][0-9]+)?)$/i.test(String(value || ''));
  }

  function cleanCourseNameFromPrefix(prefix) {
    const text = String(prefix || '').trim();
    const leading = text.match(/^([A-Z]{1,5}\d{2,4})\s+(.+)$/i);
    if (leading) return { sigla: leading[1], nombre: leading[2].trim() };
    const trailing = text.match(/^(.+?)\s+([A-Z]{1,5}\d{2,4})$/i);
    if (trailing) return { sigla: trailing[2], nombre: trailing[1].trim() };
    return { sigla: '', nombre: text };
  }

  function logPdfDiagnostics(file, pdfData, history, progress) {
    const headerLines = (history.debug?.headerLines || []).map((line, index) => ({ index, line }));
    const parsedRowsPreview = history.rows.slice(0, 25).map(row => ({
      clave: row.clave,
      sigla: row.sigla,
      materia: row.nombre,
      creditos: row.credits,
      calificacion: row.grade,
      acreditada: row.approved,
      observacion: row.observation || '',
      periodo: row.period,
      anio: row.year,
      raw: row.raw
    }));
    const recognizedPreview = progress.rowsWithMatch.slice(0, 25).map(row => ({
      clave: row.clave,
      sigla: row.sigla,
      materiaPDF: row.nombre,
      calificacion: row.grade,
      acreditada: row.approved,
      observacion: row.observation || '',
      reconocida: row.recognized,
      materiaPlan: row.visibleSubject?.nombre || row.ownSubject?.nombre || ''
    }));

    window.__ultimoHistoricoDebug = {
      archivo: { name: file.name, size: file.size, type: file.type },
      pdfData,
      history,
      progress
    };

    console.groupCollapsed(`[Plan MANRESA] Diagnóstico lectura PDF: ${file.name}`);
    console.info('Objeto completo disponible en window.__ultimoHistoricoDebug');
    console.log('Archivo:', { name: file.name, size: file.size, type: file.type });
    console.log('PDF:', { paginas: pdfData.numPages, lineas: pdfData.lines.length, items: pdfData.items.length });
    console.log('Alumno detectado:', history.student);
    console.log('Cuenta - diagnóstico:', history.debug?.account);
    console.log('Nombre - diagnóstico:', history.debug?.name);
    console.groupCollapsed('Primeras líneas del PDF usadas para detectar cuenta/nombre');
    console.table(headerLines);
    console.groupEnd();
    console.groupCollapsed('Primeros registros de materias parseados');
    console.table(parsedRowsPreview);
    console.groupEnd();
    console.groupCollapsed('Primeros registros comparados contra el plan');
    console.table(recognizedPreview);
    console.groupEnd();
    if (history.debug?.failedHistoryLines?.length) {
      console.warn('Líneas con ORDINARIO o REVALIDADA que no se pudieron interpretar:', history.debug.failedHistoryLines);
    }
    if (!history.student.account || !history.student.name) {
      console.warn('No se detectó completamente el encabezado del alumno. Copia de consola history.debug para revisar:', history.debug);
    }
    console.groupEnd();
  }

  function buildStudentProgress(history) {
    const bestAttemptByClave = new Map();
    const bestAttemptBySigla = new Map();
    const attemptsByClave = new Map();
    const attemptsBySigla = new Map();
    history.rows.forEach(row => {
      addAttempt(attemptsByClave, row.clave, row);
      const previous = bestAttemptByClave.get(row.clave);
      bestAttemptByClave.set(row.clave, chooseBestAttempt(previous, row));
      if (row.sigla) {
        const siglaKey = String(row.sigla).toUpperCase();
        addAttempt(attemptsBySigla, siglaKey, row);
        bestAttemptBySigla.set(siglaKey, chooseBestAttempt(bestAttemptBySigla.get(siglaKey), row));
      }
    });

    const approvedClaves = new Set();
    bestAttemptByClave.forEach((row, clave) => {
      if (row.approved) approvedClaves.add(clave);
    });

    const subjectStatus = new Map();
    subjects.filter(s => !s.isPhantom).forEach(subject => {
      let attempt = bestAttemptForSubject(subject, bestAttemptByClave, bestAttemptBySigla);
      let attempts = attemptsForSubject(subject, attemptsByClave, attemptsBySigla);
      let inheritedFrom = null;
      if (!attempt && shouldInheritLabState(subject)) {
        inheritedFrom = pairedTheoryById.get(subject.id) || null;
        if (inheritedFrom) {
          attempt = bestAttemptForSubject(inheritedFrom, bestAttemptByClave, bestAttemptBySigla);
          attempts = attemptsForSubject(inheritedFrom, attemptsByClave, attemptsBySigla);
        }
      }
      const failedAttempts = attempts.filter(row => !row.approved);
      if (!attempt) return;
      if (attempt.approved) {
        subjectStatus.set(subject.id, {
          status: 'approved',
          label: 'Acreditada',
          grade: attempt.grade,
          row: attempt,
          attempts,
          failedAttempts,
          inheritedFrom,
          creditsCovered: asNumber(subject.creditos),
          creditsRequired: asNumber(subject.creditos)
        });
      } else {
        subjectStatus.set(subject.id, {
          status: 'attempted',
          label: 'No acreditada',
          grade: attempt.grade,
          row: attempt,
          attempts,
          failedAttempts,
          inheritedFrom,
          creditsCovered: 0,
          creditsRequired: asNumber(subject.creditos)
        });
      }
    });

    const groupProgress = new Map();
    (data.electiveGroups || []).forEach(group => {
      const options = (group.optionIds || []).map(id => byId.get(id)).filter(Boolean);
      const phantoms = (group.phantomIds || []).map(id => byId.get(id)).filter(Boolean)
        .sort((a, b) => (a.semestre - b.semestre) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
      const approvedOptionRows = options
        .map(option => ({ option, attempt: bestAttemptForSubject(option, bestAttemptByClave, bestAttemptBySigla) }))
        .filter(item => item.attempt?.approved)
        .sort((a, b) => (a.attempt.year - b.attempt.year) || String(a.option.nombre).localeCompare(String(b.option.nombre), 'es'));
      const approvedOptions = approvedOptionRows.map(item => item.option);
      const approvedCreditsRaw = approvedOptions.reduce((sum, option) => sum + asNumber(option.creditos), 0);
      const requiredCredits = asNumber(group.requiredCredits || group.phantomCredits || phantoms.reduce((sum, s) => sum + asNumber(s.creditos), 0));
      const optionAllocations = approvedOptionRows.map(item => ({
        option: item.option,
        attempt: item.attempt,
        remainingCredits: asNumber(item.option.creditos)
      }));
      let coveredCredits = 0;

      phantoms.forEach(phantom => {
        const required = asNumber(phantom.creditos);
        let needed = required;
        const assignedOptions = [];

        optionAllocations.forEach(allocation => {
          if (needed <= 0 || allocation.remainingCredits <= 0) return;
          const used = Math.min(needed, allocation.remainingCredits);
          allocation.remainingCredits -= used;
          needed -= used;
          assignedOptions.push({
            option: allocation.option,
            attempt: allocation.attempt,
            usedCredits: used
          });
        });

        const covered = Math.max(0, required - needed);
        coveredCredits += covered;
        const status = covered >= required && required > 0 ? 'approved' : (covered > 0 ? 'partial' : 'pending');
        const gradeText = assignedOptions.map(item => item.attempt.grade).filter(Boolean).join(' / ');
        const electiveName = assignedOptions.map(item => item.option.nombre).filter(Boolean).join(' + ');

        subjectStatus.set(phantom.id, {
          status,
          label: status === 'approved' ? 'Elección cubierta' : (status === 'partial' ? 'Elección parcial' : 'Pendiente'),
          grade: gradeText || (status === 'approved' ? 'AC' : ''),
          creditsCovered: covered,
          creditsRequired: required,
          groupId: group.id,
          approvedOptions,
          assignedOptions,
          electiveName,
          row: assignedOptions[0]?.attempt || null
        });
      });

      groupProgress.set(group.id, {
        group,
        approvedOptions,
        approvedOptionRows,
        approvedCreditsRaw,
        coveredCredits,
        requiredCredits,
        pendingCredits: Math.max(0, requiredCredits - coveredCredits)
      });
    });

    const planCreditsApproved = visiblePlan.reduce((sum, subject) => sum + coveredCreditsFromStatus(subject, subjectStatus.get(subject.id)), 0);
    const planSubjectsApproved = visiblePlan.filter(subject => {
      const status = subjectStatus.get(subject.id);
      return status && status.status === 'approved';
    }).length;
    const pendingSubjects = visiblePlan.filter(subject => {
      const required = asNumber(subject.creditos);
      const covered = coveredCreditsFromStatus(subject, subjectStatus.get(subject.id));
      return covered < required;
    });

    const availability = buildAvailabilityById(subjectStatus, pendingSubjects, approvedClaves);
    const academicSemester = computeAcademicSemester(history);

    const rowsWithMatch = history.rows.map(row => {
      const own = ownByClave.get(row.clave) || null;
      const visible = byClave.get(row.clave) || (row.sigla ? bySigla.get(String(row.sigla).toUpperCase()) : null) || null;
      return { ...row, ownSubject: own, visibleSubject: visible, recognized: Boolean(own || visible) };
    });

    return {
      history,
      student: history.student,
      subjectStatus,
      groupProgress,
      approvedClaves,
      bestAttemptByClave,
      bestAttemptBySigla,
      attemptsByClave,
      attemptsBySigla,
      rowsWithMatch,
      planCreditsApproved,
      planSubjectsApproved,
      pendingSubjects,
      availabilityById: availability.availabilityById,
      availableSubjects: availability.availableSubjects,
      lockedSubjects: availability.lockedSubjects,
      academicSemester,
      unrecognizedApprovedRows: rowsWithMatch.filter(row => row.approved && !row.recognized)
    };
  }

  function addAttempt(map, key, row) {
    const cleanKey = String(key || '').trim().toUpperCase();
    if (!cleanKey) return;
    if (!map.has(cleanKey)) map.set(cleanKey, []);
    map.get(cleanKey).push(row);
  }

  function attemptsForSubject(subject, attemptsByClave, attemptsBySigla = new Map()) {
    const collected = [];
    const seen = new Set();
    const addRows = rows => {
      (rows || []).forEach(row => {
        const key = row.raw || `${row.clave}-${row.grade}-${row.period}-${row.year}-${row.group}`;
        if (seen.has(key)) return;
        seen.add(key);
        collected.push(row);
      });
    };

    subjectKeys(subject).forEach(key => addRows(attemptsByClave.get(String(key).trim().toUpperCase()) || attemptsByClave.get(String(key).trim())));
    if (subject.sigla) addRows(attemptsBySigla.get(String(subject.sigla).toUpperCase()));
    return collected.sort(compareAttemptDate);
  }

  function compareAttemptDate(a, b) {
    const periodOrder = { P: 1, V: 2, O: 3 };
    const ay = Number(a?.year || 0);
    const by = Number(b?.year || 0);
    if (ay !== by) return ay - by;
    const ap = periodOrder[String(a?.period || '').toUpperCase()] || 0;
    const bp = periodOrder[String(b?.period || '').toUpperCase()] || 0;
    if (ap !== bp) return ap - bp;
    return String(a?.group || '').localeCompare(String(b?.group || ''), 'es');
  }

  function coveredCreditsFromStatus(subject, status) {
    if (!status) return 0;
    if (status.status === 'approved') return asNumber(subject.creditos);
    if (status.status === 'partial') return asNumber(status.creditsCovered);
    return 0;
  }

  function bestAttemptForSubject(subject, attemptsByClave, attemptsBySigla = new Map()) {
    const keys = subjectKeys(subject);
    let best = keys.reduce((current, key) => chooseBestAttempt(current, attemptsByClave.get(key)), null);
    if (subject.sigla) {
      best = chooseBestAttempt(best, attemptsBySigla.get(String(subject.sigla).toUpperCase()));
    }
    return best;
  }

  function subjectKeys(subject) {
    const keys = new Set();
    if (subject.clave) keys.add(String(subject.clave).trim());
    if (subject.labClave) keys.add(String(subject.labClave).trim());
    String(subject.displayClave || '')
      .split(/\s+y\s+|[,/;]/i)
      .map(k => k.trim())
      .filter(Boolean)
      .forEach(k => keys.add(k));
    return Array.from(keys);
  }

  function chooseBestAttempt(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return attemptScore(b) >= attemptScore(a) ? b : a;
  }

  function attemptScore(row) {
    const approvedBonus = row.approved ? 100000 : 0;
    const gradeScore = row.grade === 'AC' ? 100 : (row.numericGrade ?? -10);
    return approvedBonus + gradeScore * 100 + (row.year || 0);
  }

  function tableHTML(headers, rows, options = {}) {
    const colCount = headers.length;
    if (!rows || !rows.length) {
      return `<div class="table-card"><div class="empty-cell">${escapeHTML(options.empty || 'Sin registros.')}</div></div>`;
    }
    return `
      <div class="table-card">
        <div class="table-scroll">
          <table class="data-table ${escapeHTML(options.className || '')}">
            <thead>
              <tr>${headers.map(h => `<th class="${escapeHTML(h.className || '')}">${escapeHTML(h.label || h)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rows.map(row => `<tr class="${escapeHTML(row.className || '')}" ${row.attrs || ''}>${row.cells.map((cell, idx) => `<td data-label="${escapeHTML(headers[idx]?.label || headers[idx] || '')}" class="${escapeHTML(headers[idx]?.className || '')}">${cell}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderStudentReport() {
    const root = $('#studentReport');
    if (!root) return;
    const progress = state.studentProgress;
    if (!progress) {
      root.innerHTML = '';
      return;
    }

    const total = data.stats?.creditosPlan ?? 0;
    const percent = total ? Math.round((progress.planCreditsApproved / total) * 100) : 0;
    const approvedRows = progress.rowsWithMatch.filter(row => row.approved && row.recognized);
    const notApprovedRows = progress.rowsWithMatch.filter(row => !row.approved && row.recognized);
    const pending = progress.pendingSubjects.slice().sort((a, b) => (a.semestre - b.semestre) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
    const availableSubjects = (progress.availableSubjects || []).slice().sort((a, b) => (a.semestre - b.semestre) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
    const lockedSubjects = (progress.lockedSubjects || []).slice().sort((a, b) => (a.semestre - b.semestre) || String(a.nombre).localeCompare(String(b.nombre), 'es'));

    const coordRows = (data.coordinationSummary || []).map(row => {
      const courses = (row.subjectIds || []).map(id => byId.get(id)).filter(Boolean);
      const approved = courses.reduce((sum, subject) => sum + coveredCreditsForSubject(subject), 0);
      return {
        coordinacion: row.coordinacion,
        total: asNumber(row.creditos),
        approved,
        pending: Math.max(0, asNumber(row.creditos) - approved)
      };
    });

    const quickRows = [
      { cells: ['Semestre estimado', `<strong>${escapeHTML(academicSemesterText(progress))}</strong><br><span class="muted small-text">${escapeHTML(academicSemesterDetail(progress))}</span>`] },
      { cells: ['Materias/espacios cubiertos', `<strong>${escapeHTML(progress.planSubjectsApproved)}</strong>`] },
      { cells: ['Pendientes', `<strong>${escapeHTML(pending.length)}</strong>`] },
      { cells: ['Disponibles para cursar', `<strong>${escapeHTML(availableSubjects.length)}</strong>`] },
      { cells: ['Con prerrequisito pendiente', `<strong>${escapeHTML(lockedSubjects.length)}</strong>`] },
      { cells: ['Registros aprobados reconocidos', `<strong>${escapeHTML(approvedRows.length)}</strong>`] },
      { cells: ['Registros no acreditados', `<strong>${escapeHTML(notApprovedRows.length)}</strong>`] }
    ];

    const coordTableRows = coordRows.map(row => ({
      cells: [
        escapeHTML(row.coordinacion),
        `<strong>${escapeHTML(row.approved)}</strong> / ${escapeHTML(row.total)} cr.`,
        `${escapeHTML(row.pending)} cr.`
      ]
    }));

    const pendingRows = pending.map(subject => ({
      className: 'table-row-clickable',
      attrs: `data-open-course="${escapeHTML(subject.id)}"`,
      cells: [
        `${escapeHTML(subject.semestre)}°`,
        escapeHTML(displayKey(subject)),
        escapeHTML(subject.nombre),
        `${escapeHTML(Math.max(0, asNumber(subject.creditos) - coveredCreditsForSubject(subject)))} cr.`
      ]
    }));

    const notApprovedTableRows = notApprovedRows.map(row => ({
      cells: [
        escapeHTML(row.clave),
        escapeHTML(row.visibleSubject?.nombre || row.nombre),
        escapeHTML(row.grade || '—'),
        escapeHTML(row.visibleSubject?.semestre || row.ownSubject?.semestre || '—'),
        escapeHTML(periodLabel(row.period)),
        escapeHTML(row.year || '—'),
        escapeHTML(row.group || '—')
      ]
    }));

    const unrecognizedRows = progress.unrecognizedApprovedRows.map(row => ({
      cells: [escapeHTML(row.clave), escapeHTML(row.nombre), escapeHTML(row.grade || '—')]
    }));

    root.innerHTML = `
      <div class="student-overview">
        <div>
          <span class="eyebrow">Alumno</span>
          <h3>${escapeHTML(progress.student.name || 'Nombre no detectado')}</h3>
          <p class="muted">Cuenta: ${escapeHTML(progress.student.account || 'No detectada')} · Archivo: ${escapeHTML(progress.history.fileName || 'PDF')}</p>
        </div>
        <div class="student-metrics">
          <div class="student-score combined-score">
            <div class="student-score-side student-score-semester">
              <strong>${escapeHTML(progress.academicSemester?.semester ? `${progress.academicSemester.semester}°` : '—')}</strong>
              <span>${escapeHTML(progress.academicSemester?.semester ? 'semestres cursados' : 'semestre no detectado')}</span>
            </div>
            <div class="student-score-divider" aria-hidden="true"></div>
            <div class="student-score-side student-score-credits">
              <strong>${escapeHTML(progress.planCreditsApproved)} / ${escapeHTML(total)}</strong>
              <span>créditos del plan · ${escapeHTML(percent)}%</span>
            </div>
          </div>
        </div>
      </div>

      <div class="report-grid table-report-grid">
        <article class="report-card">
          <h4>Resumen rápido</h4>
          ${tableHTML([{label:'Concepto'}, {label:'Total', className:'num'}], quickRows)}
        </article>

        <article class="report-card wide">
          <h4>Avance por coordinación</h4>
          ${tableHTML([
            {label:'Área / Coordinación'},
            {label:'Avance', className:'num'},
            {label:'Pendiente', className:'num'}
          ], coordTableRows)}
        </article>

        <article class="report-card full">
          <h4>Materias pendientes del plan</h4>
          ${tableHTML([
            {label:'Sem.', className:'center'},
            {label:'Clave'},
            {label:'Materia / espacio'},
            {label:'Créditos', className:'num'}
          ], pendingRows, { empty: 'Sin pendientes detectados.' })}
        </article>

        <article class="report-card full bad">
          <h4>Cursadas no acreditadas / baja</h4>
          ${tableHTML([
            {label:'Clave'},
            {label:'Materia'},
            {label:'Cal.', className:'center'},
            {label:'Sem. ideal', className:'center'},
            {label:'Periodo'},
            {label:'Año', className:'center'},
            {label:'Grupo', className:'center'}
          ], notApprovedTableRows, { empty: 'No hay materias reprobadas o dadas de baja reconocidas.' })}
        </article>

        <article class="report-card full">
          <h4>Registros aprobados no reconocidos</h4>
          ${tableHTML([
            {label:'Clave'},
            {label:'Materia'},
            {label:'Cal.', className:'center'}
          ], unrecognizedRows, { empty: 'No hay registros aprobados fuera del plan.' })}
        </article>
      </div>
    `;

    $$('[data-open-course]', root).forEach(item => {
      item.addEventListener('click', () => openCourse(item.dataset.openCourse, true));
    });
  }

  function clearStudentProgress() {
    state.studentProgress = null;
    const pdfInput = $('#pdfInput');
    if (pdfInput) pdfInput.value = '';
    const pdfStatus = $('#pdfStatus');
    if (pdfStatus) pdfStatus.textContent = 'Sin histórico cargado.';
    const studentReport = $('#studentReport');
    if (studentReport) studentReport.innerHTML = '<div class="empty-state">Carga tu histórico en PDF para ver el avance, materias pendientes y el mapa con calificaciones.</div>';
    document.body.classList.remove('has-progress');
    renderAll();
  }

  function renderAll() {
    renderHeader();
    renderPlan();
    renderBlocks();
    renderSummary();
    renderQualityBox();
  }


  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-html2canvas-loader="1"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.html2canvas));
        existing.addEventListener('error', () => reject(new Error('No se pudo cargar html2canvas')));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.async = true;
      script.dataset.html2canvasLoader = '1';
      script.onload = () => resolve(window.html2canvas);
      script.onerror = () => reject(new Error('No se pudo cargar html2canvas'));
      document.head.appendChild(script);
    });
  }

  function exportSummaryRows(progress) {
    return (data.coordinationSummary || []).map(row => {
      const courses = (row.subjectIds || []).map(id => byId.get(id)).filter(Boolean);
      const approved = courses.reduce((sum, subject) => sum + coveredCreditsForSubject(subject), 0);
      const total = asNumber(row.creditos);
      return {
        coordinacion: row.coordinacion,
        approved,
        total,
        pending: Math.max(0, total - approved)
      };
    });
  }

  function buildAdvanceExportNode(progress) {
    const totalCredits = data.stats?.creditosPlan ?? 0;
    const approvedCredits = progress.planCreditsApproved || 0;
    const percent = totalCredits ? Math.round((approvedCredits / totalCredits) * 100) : 0;
    const pending = progress.pendingSubjects.slice().sort((a, b) => (a.semestre - b.semestre) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
    const availableSubjects = (progress.availableSubjects || []).slice().sort((a, b) => (a.semestre - b.semestre) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
    const lockedSubjects = (progress.lockedSubjects || []).slice().sort((a, b) => (a.semestre - b.semestre) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
    const coordRows = exportSummaryRows(progress);

    const wrapper = document.createElement('section');
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.style.cssText = 'position:fixed; left:-10000px; top:0; width:1800px; padding:28px; background:#ffffff; color:#111827; z-index:-1;';

    const title = document.createElement('div');
    title.style.cssText = 'display:flex; justify-content:space-between; gap:20px; align-items:flex-start; margin-bottom:18px;';
    title.innerHTML = `
      <div>
        <div style="font-size:12px; font-weight:900; letter-spacing:.14em; text-transform:uppercase; color:#c8102e; margin-bottom:8px;">Consulta de avance</div>
        <h1 style="margin:0 0 6px; font-size:44px; line-height:1;">Plan con avance curricular</h1>
        <p style="margin:0; color:#667085; font-size:18px;">${escapeHTML(data.meta?.carrera || 'Plan MANRESA')} · ${escapeHTML(data.meta?.plan || 'MANRESA')}</p>
      </div>
      <div style="text-align:right; font-size:15px; color:#667085;">
        <div><strong style="color:#111827; font-size:18px;">${escapeHTML(progress.student.name || 'Nombre no detectado')}</strong></div>
        <div>Cuenta: ${escapeHTML(progress.student.account || 'No detectada')}</div>
        <div>Archivo: ${escapeHTML(progress.history.fileName || 'PDF')}</div>
      </div>`;

    const summaryGrid = document.createElement('div');
    summaryGrid.style.cssText = 'display:grid; grid-template-columns: 1.1fr 1.35fr 1.55fr; gap:14px; margin-bottom:20px; align-items:start;';
    summaryGrid.innerHTML = `
      <article style="border:1px solid #d7dde7; border-radius:18px; padding:16px; background:#fff;">
        <h3 style="margin:0 0 10px; font-size:18px;">Avance general</h3>
        <div style="display:grid; gap:8px;">
          <div style="display:flex; justify-content:space-between; gap:10px; padding-bottom:6px; border-bottom:1px solid #eef1f6;"><span>Créditos aprobados</span><strong>${escapeHTML(approvedCredits)} / ${escapeHTML(totalCredits)}</strong></div>
          <div style="display:flex; justify-content:space-between; gap:10px; padding-bottom:6px; border-bottom:1px solid #eef1f6;"><span>Porcentaje</span><strong>${escapeHTML(percent)}%</strong></div>
          <div style="display:flex; justify-content:space-between; gap:10px; padding-bottom:6px; border-bottom:1px solid #eef1f6;"><span>Semestre estimado</span><strong>${escapeHTML(academicSemesterText(progress))}</strong></div>
          <div style="display:flex; justify-content:space-between; gap:10px; padding-bottom:6px; border-bottom:1px solid #eef1f6;"><span>Materias/espacios cubiertos</span><strong>${escapeHTML(progress.planSubjectsApproved)}</strong></div>
          <div style="display:flex; justify-content:space-between; gap:10px; padding-bottom:6px; border-bottom:1px solid #eef1f6;"><span>Materias pendientes</span><strong>${escapeHTML(pending.length)}</strong></div>
          <div style="display:flex; justify-content:space-between; gap:10px; padding-bottom:6px; border-bottom:1px solid #eef1f6;"><span>Disponibles para cursar</span><strong>${escapeHTML(availableSubjects.length)}</strong></div>
          <div style="display:flex; justify-content:space-between; gap:10px;"><span>Con prerrequisito pendiente</span><strong>${escapeHTML(lockedSubjects.length)}</strong></div>
        </div>
      </article>
      <article style="border:1px solid #d7dde7; border-radius:18px; padding:16px; background:#fff;">
        <h3 style="margin:0 0 10px; font-size:18px;">Avance por coordinación</h3>
        <div style="display:grid; gap:7px;">
          ${coordRows.map(row => `<div style="display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:10px; align-items:center; border:1px solid #edf0f5; border-radius:12px; padding:8px 10px; font-size:13px;"><span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(row.coordinacion)}</span><strong>${escapeHTML(row.approved)} / ${escapeHTML(row.total)} cr.</strong><em style="font-style:normal; color:#667085;">${escapeHTML(row.pending)} pendientes</em></div>`).join('')}
        </div>
      </article>
      <article style="border:1px solid #d7dde7; border-radius:18px; padding:16px; background:#fff;">
        <h3 style="margin:0 0 10px; font-size:18px;">Materias faltantes</h3>
        <div style="display:flex; flex-wrap:wrap; gap:8px; max-height:none;">
          ${pending.map(subject => `<span style="display:inline-flex; align-items:center; gap:6px; border:1px solid #d7dde7; border-radius:999px; padding:7px 10px; background:#fff; color:#344054; font-size:12px; font-weight:800;">${escapeHTML(subject.semestre)}° · ${escapeHTML(displayKey(subject))} · ${escapeHTML(subject.nombre)} · ${escapeHTML(Math.max(0, asNumber(subject.creditos) - coveredCreditsForSubject(subject)))} cr.</span>`).join('') || '<span style="display:inline-flex; border:1px solid rgba(21,115,71,.22); border-radius:999px; padding:7px 10px; background:#e8f5ee; color:#157347; font-size:12px; font-weight:800;">Sin pendientes detectados</span>'}
        </div>
      </article>`;

    const mapTitle = document.createElement('div');
    mapTitle.style.cssText = 'margin: 8px 0 10px; display:flex; justify-content:space-between; align-items:end; gap:16px;';
    mapTitle.innerHTML = `
      <div>
        <div style="font-size:12px; font-weight:900; letter-spacing:.14em; text-transform:uppercase; color:#c8102e; margin-bottom:6px;">Mapa curricular</div>
        <h2 style="margin:0; font-size:28px;">Plan con calificaciones</h2>
      </div>
      <div style="font-size:14px; color:#667085; text-align:right;">Verde: acreditada · Rojo: no acreditada · Amarillo: disponible para cursar · Gris: prerrequisito pendiente</div>`;

    const mapSection = document.createElement('div');
    mapSection.style.cssText = 'border:1px solid #d7dde7; border-radius:22px; padding:16px; background:#fff;';
    const planShell = document.querySelector('#plan .plan-shell');
    const planClone = planShell ? planShell.cloneNode(true) : document.createElement('div');
    planClone.style.boxShadow = 'none';
    planClone.style.border = '0';
    forceDesktopPlanLayout(planClone);
    const scroll = planClone.querySelector('.plan-scroll');
    if (scroll) {
      setImportantStyle(scroll, 'padding', '10px 0 0');
    }
    mapSection.appendChild(planClone);

    wrapper.appendChild(title);
    wrapper.appendChild(summaryGrid);
    wrapper.appendChild(mapTitle);
    wrapper.appendChild(mapSection);
    return wrapper;
  }

  function setImportantStyle(element, property, value) {
    if (!element) return;
    element.style.setProperty(property, value, 'important');
  }

  function forceDesktopPlanLayout(root) {
    if (!root) return;
    setImportantStyle(root, 'width', '100%');
    setImportantStyle(root, 'max-width', 'none');
    setImportantStyle(root, 'overflow', 'visible');

    const title = root.querySelector('.public-plan-title');
    if (title) {
      setImportantStyle(title, 'display', 'flex');
      setImportantStyle(title, 'justify-content', 'space-between');
      setImportantStyle(title, 'align-items', 'flex-start');
      setImportantStyle(title, 'gap', '16px');
      setImportantStyle(title, 'margin', '0');
    }

    const scroll = root.querySelector('.plan-scroll');
    if (scroll) {
      setImportantStyle(scroll, 'overflow', 'visible');
      setImportantStyle(scroll, 'overflow-x', 'visible');
      setImportantStyle(scroll, 'overflow-y', 'visible');
      setImportantStyle(scroll, 'max-height', 'none');
      setImportantStyle(scroll, 'max-width', 'none');
      setImportantStyle(scroll, 'padding', '10px 12px 18px');
      setImportantStyle(scroll, 'width', '100%');
    }

    const canvasWrap = root.querySelector('.map-canvas');
    if (canvasWrap) {
      setImportantStyle(canvasWrap, 'width', '100%');
      setImportantStyle(canvasWrap, 'min-width', '0');
      setImportantStyle(canvasWrap, 'max-width', 'none');
      setImportantStyle(canvasWrap, 'overflow', 'visible');
      setImportantStyle(canvasWrap, 'display', 'block');
    }

    const map = root.querySelector('.curriculum-map');
    if (map) {
      setImportantStyle(map, 'display', 'grid');
      setImportantStyle(map, 'width', '100%');
      setImportantStyle(map, 'grid-template-columns', `repeat(${Math.max(1, Number(data.meta?.semestres || 10))}, minmax(0, 1fr))`);
      setImportantStyle(map, 'gap', '8px');
      setImportantStyle(map, 'align-items', 'start');
    }

    root.querySelectorAll('.semester-column').forEach((column) => {
      setImportantStyle(column, 'width', 'auto');
      setImportantStyle(column, 'min-width', '0');
      setImportantStyle(column, 'max-width', 'none');
    });

    root.querySelectorAll('.semester-header').forEach((header) => {
      setImportantStyle(header, 'font-size', '1.11rem');
      setImportantStyle(header, 'padding', '6px 4px');
    });

    root.querySelectorAll('.semester-body').forEach((body) => {
      setImportantStyle(body, 'gap', '7px');
      setImportantStyle(body, 'padding', '7px 5px');
    });

    root.querySelectorAll('.course-card').forEach((card) => {
      setImportantStyle(card, 'width', '100%');
      setImportantStyle(card, 'min-width', '0');
      setImportantStyle(card, 'min-height', '0');
      setImportantStyle(card, 'height', 'auto');
      setImportantStyle(card, 'aspect-ratio', '1.18 / 1');
      setImportantStyle(card, 'grid-template-columns', 'minmax(0, 1fr) clamp(27px, 1.90vw, 36px)');
      setImportantStyle(card, 'grid-template-rows', 'minmax(0, 1fr) clamp(21px, 1.50vw, 26px)');
    });

    root.querySelectorAll('.course-card.catalog').forEach((card) => {
      setImportantStyle(card, 'width', '182px');
      setImportantStyle(card, 'min-height', '124px');
      setImportantStyle(card, 'aspect-ratio', 'auto');
      setImportantStyle(card, 'grid-template-columns', 'minmax(0, 1fr) var(--sigla-w)');
      setImportantStyle(card, 'grid-template-rows', 'minmax(94px, auto) 28px');
    });

    root.querySelectorAll('.course-title').forEach((titleNode) => {
      setImportantStyle(titleNode, 'font-size', '1.00rem');
      setImportantStyle(titleNode, 'padding', '7px 6px');
      setImportantStyle(titleNode, 'line-height', '1.05');
      setImportantStyle(titleNode, 'font-weight', '400');
      setImportantStyle(titleNode, 'letter-spacing', '-.012em');
    });

    root.querySelectorAll('.course-title-main').forEach((titleNode) => {
      setImportantStyle(titleNode, 'font-weight', '400');
    });

    root.querySelectorAll('.course-hours, .course-sigla, .course-key, .course-credits, .course-sigla-text').forEach((node) => {
      setImportantStyle(node, 'font-size', '.88rem');
      setImportantStyle(node, 'font-weight', '700');
      setImportantStyle(node, 'line-height', '1');
    });

    root.querySelectorAll('.course-key').forEach((node) => {
      setImportantStyle(node, 'display', 'flex');
      setImportantStyle(node, 'align-items', 'center');
      setImportantStyle(node, 'justify-content', 'center');
      setImportantStyle(node, 'text-align', 'center');
      setImportantStyle(node, 'padding', '3px 5px');
    });

    root.querySelectorAll('.progress-badge').forEach((badge) => {
      setImportantStyle(badge, 'min-width', '58px');
      setImportantStyle(badge, 'height', '44px');
      setImportantStyle(badge, 'padding', '0 12px');
      setImportantStyle(badge, 'font-size', '1.80rem');
      setImportantStyle(badge, 'line-height', '1');
      setImportantStyle(badge, 'font-weight', '900');
      setImportantStyle(badge, 'border-width', '2px');
      setImportantStyle(badge, 'top', '7px');
      setImportantStyle(badge, 'left', '8px');
      setImportantStyle(badge, 'z-index', '12');
    });
  }

  function buildPlanExportNode() {
    const planSection = document.querySelector('#plan .plan-shell');
    if (!planSection) return null;
    const exportNode = document.createElement('section');
    exportNode.className = 'manresa-app manresa-export-node';
    exportNode.setAttribute('aria-hidden', 'true');
    exportNode.style.cssText = 'position:fixed; left:-10000px; top:0; width:2400px; min-width:2400px; padding:28px; background:#ffffff; color:#111827; z-index:-1;';
    exportNode.innerHTML = `<div style="margin-bottom:14px; display:flex; justify-content:space-between; align-items:end; gap:16px;"><div><div style="font-size:12px; font-weight:900; letter-spacing:.14em; text-transform:uppercase; color:#c8102e; margin-bottom:6px;">Mapa curricular</div><h1 style="margin:0; font-size:40px; line-height:1;">${escapeHTML(document.body.dataset.page === 'avance' ? 'Plan con calificaciones' : 'Plan gráfico por semestre')}</h1><p style="margin:8px 0 0; color:#667085; font-size:18px;">${escapeHTML(data.meta?.carrera || 'Plan MANRESA')} · ${escapeHTML(data.meta?.plan || 'MANRESA')}</p></div><div style="text-align:right; color:#667085; font-size:14px;">${state.studentProgress ? `<div><strong style="color:#111827">${escapeHTML(state.studentProgress.student.name || 'Nombre no detectado')}</strong></div><div>Cuenta: ${escapeHTML(state.studentProgress.student.account || 'No detectada')}</div><div>${escapeHTML(academicSemesterText(state.studentProgress))}</div>` : ''}</div></div>`;
    const clonedPlan = planSection.cloneNode(true);
    clonedPlan.style.boxShadow = 'none';
    clonedPlan.style.border = '1px solid #d7dde7';
    forceDesktopPlanLayout(clonedPlan);
    exportNode.appendChild(clonedPlan);
    return exportNode;
  }

  async function capturePlanCanvas() {
    const html2canvas = await loadHtml2Canvas();
    const exportNode = buildPlanExportNode();
    if (!exportNode) throw new Error('No se encontró el plan para exportar.');
    document.body.appendChild(exportNode);
    const captureWidth = Math.max(2400, Math.ceil(exportNode.getBoundingClientRect().width || 0), exportNode.scrollWidth || 0, exportNode.offsetWidth || 0);
    const captureHeight = Math.max(Math.ceil(exportNode.scrollHeight || 0), Math.ceil(exportNode.getBoundingClientRect().height || 0));
    exportNode.style.width = `${captureWidth}px`;
    exportNode.style.minWidth = `${captureWidth}px`;
    const canvas = await html2canvas(exportNode, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth,
      windowHeight: captureHeight,
      scrollX: 0,
      scrollY: 0
    });
    exportNode.remove();
    return canvas;
  }

  async function exportPlanPNG() {
    const progress = state.studentProgress;
    const pdfStatus = $('#pdfStatus');
    try {
      if (pdfStatus) pdfStatus.textContent = 'Preparando imagen PNG del plan...';
      const canvas = await capturePlanCanvas();
      const link = document.createElement('a');
      const baseName = ((progress && (progress.student.account || progress.student.name)) || 'plan-manresa').toString().trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
      link.download = `${baseName || 'plan-manresa'}-plan.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      if (pdfStatus) pdfStatus.textContent = 'PNG del plan generado correctamente.';
    } catch (error) {
      console.error('[Plan MANRESA] Error al exportar PNG:', error);
      if (pdfStatus) pdfStatus.textContent = `No se pudo generar el PNG: ${error.message || error}`;
    }
  }

  async function exportReportPDF() {
    const pdfStatus = $('#pdfStatus');
    try {
      const JsPDF = (window.jspdf || {}).jsPDF;
      if (!JsPDF) throw new Error('No se pudo cargar jsPDF');
      if (document.body.dataset.page === 'avance' && !state.studentProgress) {
        if (pdfStatus) pdfStatus.textContent = 'Primero carga un PDF para poder exportar el resumen en PDF.';
        return;
      }
      if (pdfStatus) pdfStatus.textContent = 'Generando PDF del resumen...';

      const doc = new JsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 40;
      const contentW = pageW - margin * 2;
      let y = 44;

      const ensureSpace = needed => {
        if (y + (needed || 24) > pageH - margin) {
          doc.addPage();
          y = 44;
        }
      };

      const addTitle = (title, subtitle = '') => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(17,24,39);
        doc.text(String(title), margin, y);
        y += 22;
        if (subtitle) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(11);
          doc.setTextColor(102,112,133);
          const lines = doc.splitTextToSize(String(subtitle), contentW);
          doc.text(lines, margin, y);
          y += lines.length * 14 + 10;
        } else {
          y += 10;
        }
      };

      const addLine = (text, opts = {}) => {
        const size = opts.size || 10;
        const style = opts.style || 'normal';
        const color = opts.color || [17,24,39];
        const after = opts.after ?? 6;
        doc.setFont('helvetica', style);
        doc.setFontSize(size);
        doc.setTextColor(...color);
        const lines = doc.splitTextToSize(String(text), contentW);
        const needed = lines.length * (size + 3) + after;
        ensureSpace(needed);
        doc.text(lines, margin, y);
        y += lines.length * (size + 3) + after;
      };

      const addSection = title => {
        ensureSpace(34);
        doc.setDrawColor(215,221,231);
        doc.line(margin, y, pageW - margin, y);
        y += 16;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.setTextColor(200,16,46);
        doc.text(String(title), margin, y);
        y += 14;
      };

      const addTable = (headers, rows, widths, options = {}) => {
        if (!rows || !rows.length) {
          ensureSpace(24);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(102,112,133);
          doc.text(options.empty || 'Sin registros.', margin, y);
          y += 18;
          return;
        }

        const fontSize = options.fontSize || 8.5;
        const headerSize = options.headerSize || 8;
        const paddingX = 5;
        const paddingY = 5;
        const rowGap = fontSize + 2.5;
        const headerH = 23;
        const totalWidth = widths.reduce((sum, value) => sum + value, 0);
        const scale = contentW / totalWidth;
        const w = widths.map(value => value * scale);

        const drawHeader = () => {
          ensureSpace(headerH + 12);
          let x = margin;
          doc.setFillColor(245,247,251);
          doc.setDrawColor(215,221,231);
          doc.rect(margin, y, contentW, headerH, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(headerSize);
          doc.setTextColor(52,64,84);
          headers.forEach((header, idx) => {
            doc.text(String(header), x + paddingX, y + 15, { maxWidth: w[idx] - paddingX * 2 });
            x += w[idx];
          });
          y += headerH;
        };

        drawHeader();
        rows.forEach(row => {
          const cells = row.map(cell => String(cell ?? ''));
          const wrapped = cells.map((cell, idx) => doc.splitTextToSize(cell, Math.max(18, w[idx] - paddingX * 2)));
          const rowH = Math.max(22, Math.max(...wrapped.map(lines => lines.length)) * rowGap + paddingY * 2);
          if (y + rowH > pageH - margin) {
            doc.addPage();
            y = 44;
            drawHeader();
          }
          let x = margin;
          doc.setDrawColor(237,240,245);
          doc.line(margin, y, pageW - margin, y);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(fontSize);
          doc.setTextColor(17,24,39);
          wrapped.forEach((lines, idx) => {
            doc.text(lines, x + paddingX, y + paddingY + fontSize);
            x += w[idx];
          });
          y += rowH;
        });
        doc.setDrawColor(237,240,245);
        doc.line(margin, y, pageW - margin, y);
        y += 12;
      };

      const addPlanImagePage = async title => {
        const planCanvas = await capturePlanCanvas();
        doc.addPage('a4', 'landscape');
        const pw = doc.internal.pageSize.getWidth();
        const ph = doc.internal.pageSize.getHeight();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(17,24,39);
        doc.text(title, 24, 28);
        const availW = pw - 48;
        const availH = ph - 54;
        const ratio = Math.min(availW / planCanvas.width, availH / planCanvas.height);
        const imgW = planCanvas.width * ratio;
        const imgH = planCanvas.height * ratio;
        doc.addImage(planCanvas.toDataURL('image/png'), 'PNG', (pw - imgW) / 2, 36 + (availH - imgH) / 2, imgW, imgH, undefined, 'FAST');
      };

      if (document.body.dataset.page === 'avance') {
        const progress = state.studentProgress;
        const total = data.stats?.creditosPlan ?? 0;
        const approvedCredits = progress.planCreditsApproved || 0;
        const percent = total ? Math.round((approvedCredits / total) * 100) : 0;
        const pending = progress.pendingSubjects.slice().sort((a, b) => (a.semestre - b.semestre) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
        const availableSubjects = (progress.availableSubjects || []).slice().sort((a, b) => (a.semestre - b.semestre) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
        const lockedSubjects = (progress.lockedSubjects || []).slice().sort((a, b) => (a.semestre - b.semestre) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
        const notApprovedRows = progress.rowsWithMatch.filter(row => !row.approved && row.recognized);

        addTitle('Resumen de avance curricular', `${data.meta?.carrera || 'Plan MANRESA'} · ${data.meta?.plan || 'MANRESA'}`);
        addSection('Datos del alumno');
        addTable(['Alumno', 'Cuenta', 'Archivo'], [[progress.student.name || 'Nombre no detectado', progress.student.account || 'No detectada', progress.history.fileName || 'PDF']], [2.2, 1, 1.3]);

        addSection('Avance general');
        addTable(['Indicador', 'Valor'], [
          ['Créditos aprobados', `${approvedCredits} / ${total} (${percent}%)`],
          ['Semestre estimado', `${academicSemesterText(progress)} · ${academicSemesterDetail(progress)}`],
          ['Materias o espacios cubiertos', progress.planSubjectsApproved],
          ['Materias pendientes', pending.length],
          ['Disponibles para cursar', availableSubjects.length],
          ['Con prerrequisito pendiente', lockedSubjects.length]
        ], [2.5, 1]);

        addSection('Avance por coordinación');
        addTable(['Área / Coordinación', 'Aprobados', 'Totales', 'Pendientes'],
          exportSummaryRows(progress).map(row => [row.coordinacion, `${row.approved} cr.`, `${row.total} cr.`, `${row.pending} cr.`]),
          [3.2, .8, .8, .9]
        );

        addSection('Materias faltantes');
        addTable(['Sem.', 'Clave', 'Materia / espacio', 'Créditos'],
          pending.map(subject => [
            `${subject.semestre}°`,
            displayKey(subject),
            subject.nombre,
            `${Math.max(0, asNumber(subject.creditos) - coveredCreditsForSubject(subject))} cr.`
          ]),
          [.45, 1, 4.1, .8],
          { empty: 'Sin pendientes detectados.' }
        );

        addSection('Cursadas no acreditadas / baja');
        addTable(['Clave', 'Materia', 'Cal.', 'Sem. ideal', 'Periodo', 'Año', 'Grupo'],
          notApprovedRows.map(row => [
            row.clave,
            row.visibleSubject?.nombre || row.nombre,
            row.grade || '—',
            row.visibleSubject?.semestre || row.ownSubject?.semestre || '—',
            periodLabel(row.period),
            row.year || '—',
            row.group || '—'
          ]),
          [.7, 2.8, .45, .65, 1.05, .55, .55],
          { empty: 'No hay materias reprobadas o dadas de baja reconocidas.', fontSize: 8 }
        );

        await addPlanImagePage('Plan con calificaciones');
        const baseName = (progress.student.account || progress.student.name || 'avance-manresa').toString().trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
        doc.save(`${baseName || 'avance-manresa'}-resumen.pdf`);
      } else {
        const total = data.stats?.creditosPlan ?? visiblePlan.reduce((sum, s) => sum + asNumber(s.creditos), 0);
        const groups = data.electiveGroups || [];
        addTitle('Resumen del plan de estudios', `${data.meta?.carrera || 'Plan MANRESA'} · ${data.meta?.plan || 'MANRESA'}`);

        addSection('Datos generales');
        addTable(['Indicador', 'Valor'], [
          ['Créditos totales del programa', `${total} créditos`],
          ['Materias o espacios visibles en el mapa', visiblePlan.length],
          ['Electivas y ARU', groups.length]
        ], [2.4, 1]);

        addSection('Resumen por coordinación');
        addTable(['Área / Coordinación', 'Materias / espacios', 'Créditos'],
          (data.coordinationSummary || []).map(row => [row.coordinacion, row.materias, `${row.creditos} cr.`]),
          [3.6, .9, .9]
        );

        addSection('Materias del plan');
        const subjectRows = visiblePlan
          .slice()
          .sort((a, b) => (a.semestre - b.semestre) || String(a.nombre).localeCompare(String(b.nombre), 'es'))
          .map(subject => [
            `${subject.semestre}°`,
            displayKey(subject),
            subject.nombre,
            `${subject.creditos} cr.`,
            subject.coordinacion || '—'
          ]);
        addTable(['Sem.', 'Clave', 'Materia / espacio', 'Créditos', 'Área / Coordinación'], subjectRows, [.45, .9, 2.7, .65, 2.25], { fontSize: 7.7, headerSize: 7.4 });

        addSection('Electivas y ARU');
        groups.forEach(group => {
          const options = (group.optionIds || []).map(id => byId.get(id)).filter(Boolean)
            .sort((a, b) => (a.semestre - b.semestre) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
          const required = group.requiredCredits || group.phantomCredits || 0;
          addLine(`${group.name} · ${required} créditos requeridos`, { size: 10, style: 'bold', color: [17,24,39], after: 4 });
          const rows = options.map(subject => {
            const labs = labsForBlockOption(subject).map(lab => `${lab.nombre} (${displayKey(lab, lab.clave || '')}${lab.horas ? ` · ${lab.horas}` : ''})`).join('; ');
            return [
              subject.nombre,
              displayKey(subject),
              `${subject.creditos} cr.`,
              labs || '—'
            ];
          });
          addTable(['Electiva / ARU', 'Clave', 'Créditos', 'Laboratorio(s)'], rows, [2.6, .8, .55, 2.45], { fontSize: 7.5, headerSize: 7.2, empty: 'Sin opciones registradas.' });
        });

        await addPlanImagePage('Mapa curricular');
        const baseName = (data.meta?.plan || 'plan-manresa').toString().trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
        doc.save(`${baseName || 'plan-manresa'}-resumen.pdf`);
      }
      if (pdfStatus) pdfStatus.textContent = 'PDF generado correctamente.';
    } catch (error) {
      console.error('[Plan MANRESA] Error al exportar resumen PDF:', error);
      if (pdfStatus) pdfStatus.textContent = `No se pudo generar el PDF: ${error.message || error}`;
    }
  }

  function bindUI() {
    const searchInput = $('#searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', event => {
        state.query = event.target.value;
        applySearch();
      });
    }

    const clearBtn = $('#clearBtn');
    if (clearBtn) clearBtn.addEventListener('click', clearSelection);

    const exportPlanPngBtn = $('#exportPlanPngBtn');
    if (exportPlanPngBtn) exportPlanPngBtn.addEventListener('click', exportPlanPNG);

    const exportReportPdfBtn = $('#exportReportPdfBtn');
    if (exportReportPdfBtn) exportReportPdfBtn.addEventListener('click', exportReportPDF);

    const pdfInput = $('#pdfInput');
    if (pdfInput) {
      const onPdfSelected = event => {
        const file = event.target.files?.[0] || null;
        console.info('[Plan MANRESA] Archivo seleccionado en input PDF:', file ? { name: file.name, size: file.size, type: file.type } : 'sin archivo');
        const pdfStatus = $('#pdfStatus');
        if (pdfStatus && file) pdfStatus.textContent = `Archivo seleccionado: ${file.name}. Leyendo PDF...`;
        handlePdfUpload(file);
      };
      pdfInput.addEventListener('change', onPdfSelected);
      pdfInput.addEventListener('input', event => {
        const file = event.target.files?.[0] || null;
        console.debug('[Plan MANRESA] Evento input en PDF:', file ? file.name : 'sin archivo');
      });
    }

    const clearProgressBtn = $('#clearProgressBtn');
    if (clearProgressBtn) clearProgressBtn.addEventListener('click', clearStudentProgress);

    $$('[data-close-panel]').forEach(el => {
      el.addEventListener('click', () => {
        const panel = $('#coursePanel');
        if (panel) {
          panel.classList.remove('is-open');
          panel.setAttribute('aria-hidden', 'true');
        }
      });
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        const panel = $('#coursePanel');
        if (panel) {
          panel.classList.remove('is-open');
          panel.setAttribute('aria-hidden', 'true');
        }
      }
    });

    const tabs = $$('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('is-active'));
        tab.classList.add('is-active');
      });
    });
  }


  function init() {
    renderAll();
    bindUI();
  }

  init();
})();
