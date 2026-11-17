(() => {
  "use strict";

  const { fetchOffers, subjectKey, periodLabel, element, groupCard } = window.ManresaHorarios;
  const SOURCE_URL = "https://enlinea.uia.mx/Consulta_Horarios/horarios.cfm";
  const ACTIVE_TYPES = new Set(["obligatoria", "optativa_catalogo"]);
  const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const DAY_INDEX = new Map(DAYS.map((day, index) => [day, index]));
  const COLLATOR = new Intl.Collator("es-MX", { numeric: true, sensitivity: "base" });
  const DATE_FORMAT = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City"
  });

  const byId = (id) => document.getElementById(id);
  const ui = {
    title: byId("ofertaTitulo"),
    status: byId("estadoConsulta"),
    dot: byId("estadoDot"),
    time: byId("fechaConsulta"),
    refresh: byId("actualizarHorarios"),
    export: byId("exportarHorarios"),
    sources: byId("fuentesHorarios"),
    sourcesSummary: byId("resumenFuentes"),
    sourceList: byId("listaFuentes"),
    form: byId("filtrosHorarios"),
    search: byId("buscarHorario"),
    semester: byId("semestreHorario"),
    coordination: byId("coordinacionHorario"),
    day: byId("diaHorario"),
    mode: byId("modalidadHorario"),
    clear: byId("limpiarHorarios"),
    count: byId("conteoHorarios"),
    results: byId("resultadosHorarios")
  };

  const plan = window.PLAN_DATA;
  const simulator = window.startManresaSimulator();
  const catalogue = new Map();
  const expectedSources = new Map();
  const openCards = new Set();
  let courses = [];
  let sources = [];
  let checkedAt = "";
  let activeRequest = null;
  let consultationFailed = false;

  const compare = (a, b) => COLLATOR.compare(a, b);
  const unique = (items) => [...new Set(items)];

  function normalize(input) {
    return String(input ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  }

  function countLabel(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function semesterLabel(semester) {
    return `Semestre ${semester}`;
  }

  function getPrerequisites(subject, byId, byCode) {
    const prerequisites = new Map();
    const add = (code, name) => {
      const key = String(code ?? "").trim();
      if (!key || key === String(subject.clave) || prerequisites.has(key)) return;
      const label = name && /^\d+$/.test(key) ? `${key} · ${name}` : name || key;
      prerequisites.set(key, { code: key, label });
    };

    for (const item of subject.prereqInfo || []) {
      add(item.clave, item.nombre || byId.get(item.id || item.visibleId)?.nombre);
    }
    for (const code of subject.prerequisitos || []) {
      add(code, byCode.get(String(code))?.nombre);
    }
    if (!prerequisites.size) {
      for (const id of subject.resolvedPrereqIds || []) {
        const requirement = byId.get(id);
        if (requirement) add(requirement.clave || requirement.nombre, requirement.nombre);
      }
    }
    return [...prerequisites.values()];
  }

  function loadCatalogue() {
    if (plan?.meta?.plan !== "MANRESA" || !Array.isArray(plan?.subjects)) return;

    const bySubjectId = new Map(plan.subjects.map((subject) => [subject.id, subject]));
    const bySubjectCode = new Map(plan.subjects.filter(({ clave }) => clave).map((subject) => [String(subject.clave), subject]));
    const electiveGroups = new Map((plan.electiveGroups || []).map((group) => [group.id, group]));
    for (const subject of plan.subjects) {
      const { cveCoordinacion: coordination, clave: code } = subject;
      if (!ACTIVE_TYPES.has(subject.tipo) || subject.isPhantom || !/^\d+$/.test(code) || !/^\d+$/.test(coordination)) {
        continue;
      }

      const elective = electiveGroups.get(subject.optativaGrupo);
      const semesters = elective
        ? elective.phantomIds.map((id) => bySubjectId.get(id)?.semestre)
        : [subject.semestre];
      catalogue.set(subjectKey(coordination, code), {
        name: subject.nombre,
        sigla: subject.sigla,
        credits: Number(subject.creditos) || 0,
        prerequisites: getPrerequisites(subject, bySubjectId, bySubjectCode),
        independentHours: Number(String(subject.horas).split(",")[1]) || 0,
        labKey: subject.labClave ? subjectKey(coordination, subject.labClave) : "",
        elective: elective?.name || "",
        semesters: unique(semesters.map(Number).filter((number) => number > 0)).sort((a, b) => a - b)
      });

      expectedSources.set(coordination, {
        id: coordination,
        nombre: subject.coordinacion,
        url: `${SOURCE_URL}?cve_coordinacion=${coordination}`
      });
    }
  }

  function matchCourses() {
    const matched = new Map();
    for (const source of sources) {
      if (source.error) continue;
      for (const group of source.grupos) {
        const key = subjectKey(source.id, group.materia);
        const subject = catalogue.get(key);
        if (!subject) continue;

        if (!matched.has(key)) matched.set(key, { ...subject, key, code: group.materia, source, groups: [] });
        const text = normalize([
          subject.name, subject.sigla, subject.elective, group.nombre, group.materia,
          group.sigla, `grupo ${group.grupo}`, group.modalidad, source.nombre,
          ...group.profesores, ...group.notas,
          ...group.sesiones.flatMap(({ dia, horario, salon }) => [dia, horario, salon])
        ].join(" "));
        matched.get(key).groups.push({ ...group, searchText: text });
      }
    }

    for (const course of matched.values()) {
      course.groups.sort((a, b) => compare(a.grupo, b.grupo));
    }
    return [...matched.values()].sort((a, b) =>
      (a.semesters[0] ?? Infinity) - (b.semesters[0] ?? Infinity)
      || compare(a.name, b.name) || compare(a.code, b.code)
    );
  }

  function setStatus(state, message) {
    ui.dot.dataset.state = state;
    ui.status.textContent = message;
  }

  function displaySources() {
    const failed = sources.filter((source) => source.error).length;
    ui.sources.hidden = !sources.length;
    ui.sources.open = false;
    ui.sourcesSummary.textContent = failed ? `Fuentes oficiales · ${failed} sin respuesta válida` : "Fuentes oficiales";
    ui.sourceList.replaceChildren(...sources.map((source) => {
      const item = element("li");
      const link = element("a", source.nombre, "horarios-source-link");
      link.href = expectedSources.get(source.id).url;
      link.target = "_blank";
      link.rel = "noopener";
      const status = source.error
        ? element("p", source.error, "horarios-source-period horarios-source-error")
        : element("p", periodLabel(source.periodo), "horarios-source-period");
      item.append(link, status);
      return item;
    }));
  }

  function setOptions(select, options) {
    const selected = select.value;
    select.replaceChildren(select.options[0]);
    for (const [value, label] of options) select.add(new Option(label, value));
    if (options.some(([value]) => String(value) === selected)) select.value = selected;
  }

  function updateFilters() {
    const groups = courses.flatMap((course) => course.groups);
    const semesters = unique(courses.flatMap((course) => course.semesters)).sort((a, b) => a - b);
    const coordinations = [...new Map(courses.map(({ source }) => [source.id, source.nombre]))]
      .sort((a, b) => compare(a[1], b[1]));
    const days = new Set(groups.flatMap(({ sesiones }) => sesiones.map(({ dia }) => dia)).filter(Boolean));
    const modes = unique(groups.map(({ modalidad }) => modalidad).filter(Boolean)).sort(compare);

    setOptions(ui.semester, semesters.map((semester) => [semester, semesterLabel(semester)]));
    setOptions(ui.coordination, coordinations);
    setOptions(ui.day, [...days].sort((a, b) =>
      (DAY_INDEX.get(a) ?? DAYS.length) - (DAY_INDEX.get(b) ?? DAYS.length) || compare(a, b)
    ).map((day) => [day, day]));
    setOptions(ui.mode, modes.map((mode) => [mode, mode]));
  }

  function matchesFilters(course) {
    return (!ui.semester.value || course.semesters.includes(Number(ui.semester.value)))
      && (!ui.coordination.value || course.source.id === ui.coordination.value);
  }

  function matchingGroups(groups, terms) {
    return groups.filter((group) =>
      (!ui.mode.value || group.modalidad === ui.mode.value)
      && (!ui.day.value || group.sesiones.some(({ dia }) => dia === ui.day.value))
      && terms.every((term) => group.searchText.includes(term))
    );
  }

  function courseCard(course, groups, showPeriod) {
    const card = element("article", "", "horarios-card");
    const sigla = groups.find((group) => group.sigla)?.sigla || course.sigla;
    const meta = [course.source.nombre, countLabel(course.credits, "crédito", "créditos")];
    if (course.elective) meta.push(course.elective);
    if (course.semesters.length) {
      meta.push(course.semesters.length === 1
        ? semesterLabel(course.semesters[0])
        : `Semestres ${course.semesters.join(", ")}`);
    }
    if (showPeriod) meta.push(periodLabel(course.source.periodo));

    const details = element("details", "", "horarios-groups");
    details.open = openCards.has(course.key) || groups.length === 1;
    details.append(element("summary", countLabel(groups.length, "grupo", "grupos")));
    // Los grupos de una materia se crean al abrirla para mantener ágil el filtro.
    function showGroups() {
      if (details.childElementCount > 1) return;
      for (const group of groups) {
        const card = groupCard(group);
        card.append(simulator.createGroupButton(course, group));
        details.append(card);
      }
    }
    if (details.open) showGroups();
    details.addEventListener("toggle", () => {
      if (!details.isConnected) return;
      if (details.open) {
        showGroups();
        if (groups.length > 1) openCards.add(course.key);
      } else {
        openCards.delete(course.key);
      }
    });

    card.append(
      element("p", [course.code, sigla].filter(Boolean).join(" · "), "horarios-key"),
      element("h3", course.name),
      element("p", meta.join(" · "), "horarios-meta")
    );
    if (course.prerequisites.length) {
      card.append(element("p", `Seriada · Requiere ${course.prerequisites.map(({ label }) => label).join(" / ")}`, "horarios-prerrequisitos"));
    }
    card.append(details);
    return card;
  }

  function showEmpty(message, linkToSource = false) {
    const empty = element("p", message, "horarios-empty");
    if (linkToSource) {
      const link = element("a", "Abrir la fuente oficial de Mecatrónica", "horarios-source-link");
      link.href = `${SOURCE_URL}?cve_coordinacion=2320`;
      link.target = "_blank";
      link.rel = "noopener";
      empty.append(" ", link);
    }
    ui.results.replaceChildren(empty);
  }

  function render() {
    if (activeRequest || consultationFailed) return;
    const terms = normalize(ui.search.value).split(/\s+/).filter(Boolean);
    const cards = [];
    let groupCount = 0;
    const showPeriod = new Set(sources.filter((source) => !source.error).map((source) => source.periodo)).size > 1;
    for (const course of courses) {
      if (!matchesFilters(course)) continue;
      const groups = matchingGroups(course.groups, terms);
      if (!groups.length) continue;
      groupCount += groups.length;
      cards.push(courseCard(course, groups, showPeriod));
    }

    ui.count.textContent = `${countLabel(cards.length, "materia", "materias")} · ${countLabel(groupCount, "grupo", "grupos")}`;
    if (cards.length) ui.results.replaceChildren(...cards);
    else if (courses.length) showEmpty("No se encontraron grupos con estos filtros.");
    else showEmpty("Las fuentes consultadas no publicaron grupos que coincidan con el plan MANRESA.");
  }

  async function refresh() {
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    consultationFailed = false;
    courses = [];
    sources = [];
    checkedAt = "";
    ui.refresh.disabled = true;
    ui.export.disabled = true;
    ui.sources.hidden = true;
    ui.count.textContent = "";
    ui.title.textContent = "Oferta de horarios";
    ui.time.hidden = true;
    ui.results.setAttribute("aria-busy", "true");
    ui.results.replaceChildren();
    setStatus("loading", "Consultando las fuentes oficiales…");
    simulator.setOffers([], [], true);

    try {
      const result = await fetchOffers(controller);
      if (activeRequest !== controller) return;

      const bySource = new Map(result.fuentes.map((source) => [source.id, source]));
      sources = [...expectedSources.values()].map((expected) => bySource.get(expected.id) || {
        ...expected, error: "Esta coordinación aún no está disponible en la consulta."
      });
      const available = sources.filter((source) => !source.error);
      const periods = unique(available.map((source) => source.periodo));
      consultationFailed = !result.ok || !available.length;
      checkedAt = result.consultadoEn;
      displaySources();

      if (consultationFailed) {
        setStatus("error", "No se pudieron consultar las fuentes oficiales.");
        showEmpty("Vuelve a intentar con Actualizar consulta.", true);
        return;
      }

      ui.title.textContent = periods.length === 1 ? periodLabel(periods[0]) : "Periodos publicados";
      const warnings = [];
      const failed = sources.length - available.length;
      if (failed) warnings.push(`Sin respuesta válida de ${countLabel(failed, "fuente", "fuentes")}`);
      if (periods.length > 1) warnings.push("Las fuentes publican periodos distintos");
      const message = warnings.length ? warnings.join(". ") + "." : `${available.length} fuentes oficiales consultadas.`;
      setStatus(warnings.length ? "warning" : "ok", message);
      ui.time.dateTime = checkedAt;
      ui.time.textContent = `Consulta del ${DATE_FORMAT.format(new Date(checkedAt))} (CDMX)`;
      ui.time.hidden = false;
      courses = matchCourses();
      updateFilters();
      ui.export.disabled = !courses.length;
    } catch {
      if (activeRequest !== controller) return;
      consultationFailed = true;
      setStatus("error", "El servicio de consulta está temporalmente indisponible.");
      showEmpty("Vuelve a intentar con Actualizar consulta.", true);
    } finally {
      if (activeRequest === controller) {
        activeRequest = null;
        ui.refresh.disabled = false;
        ui.results.setAttribute("aria-busy", "false");
        simulator.setOffers(courses, unique(sources.filter((source) => !source.error).map((source) => source.periodo)), false);
        render();
      }
    }
  }

  function exportJson() {
    const payload = {
      consultadoEn: checkedAt,
      plan: "MANRESA",
      fuentes: sources.map(({ grupos, ...source }) => source),
      materias: courses.map(({ source, groups, key, labKey, ...course }) => ({
        ...course,
        coordinacion: source.id,
        periodo: source.periodo,
        grupos: groups.map(({ searchText, ...group }) => group)
      }))
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = element("a");
    link.href = url;
    link.download = `horarios-manresa-${checkedAt.slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  loadCatalogue();
  if (!catalogue.size) {
    setStatus("error", "No se pudo leer el catálogo del plan MANRESA.");
    showEmpty("Recarga la página para volver a cargar el plan de estudios.", true);
    ui.refresh.disabled = true;
    simulator.setOffers([], [], false);
    ui.results.setAttribute("aria-busy", "false");
    return;
  }

  ui.refresh.addEventListener("click", refresh);
  ui.export.addEventListener("click", exportJson);
  ui.form.addEventListener("submit", (event) => event.preventDefault());
  ui.search.addEventListener("input", render);
  for (const select of [ui.semester, ui.coordination, ui.day, ui.mode]) select.addEventListener("change", render);
  ui.clear.addEventListener("click", () => {
    ui.form.reset();
    render();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) refresh();
  });

  refresh();
})();
