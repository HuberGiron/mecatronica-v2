(() => {
  "use strict";

  const { element, periodLabel } = window.ManresaHorarios;
  const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const STORAGE = "manresa:grupos-simulados:v1";
  const DECIMAL = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });
  const CURRENCY = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

  function parseInterval({ dia, horario }) {
    const match = horario.trim().match(
      /^(\d{1,2})(?::(\d{2}))?\s*(?:[-–—]|a)\s*(\d{1,2})(?::(\d{2}))?\s*(?:h(?:rs?|oras)?\.?)?$/i
    );
    if (!DAYS.includes(dia) || !match) return null;

    const fromMinute = Number(match[2] || 0);
    const toMinute = Number(match[4] || 0);
    const start = Number(match[1]) * 60 + fromMinute;
    const end = Number(match[3]) * 60 + toMinute;
    return fromMinute < 60 && toMinute < 60 && start < end && end <= 24 * 60 ? { start, end } : null;
  }

  function readChoices() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE) || "[]");
      if (!Array.isArray(saved)) return [];
      return saved.filter((row) => Array.isArray(row) && row.length === 3 && row.every((item) => typeof item === "string"));
    } catch {
      return [];
    }
  }

  function slotLabel(start, end) {
    const clock = (value) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
    return `${clock(start)}–${clock(end)}`;
  }

  function buildWeek(enrolled) {
    const week = new Map(DAYS.map((day) => [day, []]));
    let minutes = 0;
    let incomplete = 0;

    for (const enrollment of enrolled) {
      const { course, group } = enrollment;
      const blocks = new Set();
      let hasUnknownHours = !group.sesiones.length;
      for (const session of group.sesiones) {
        const interval = parseInterval(session);
        if (!interval) {
          hasUnknownHours = true;
          continue;
        }
        const { start, end } = interval;
        const slot = `${session.dia}:${start}:${end}`;
        if (blocks.has(slot)) continue;
        blocks.add(slot);
        minutes += end - start;
        week.get(session.dia).push({ ...interval, course, group, room: session.salon, conflict: false });
      }
      if (hasUnknownHours) incomplete++;
    }

    const conflicts = new Set();
    for (const [day, slots] of week) {
      slots.sort((a, b) => a.start - b.start || a.end - b.end);
      for (let i = 0; i < slots.length; i++) {
        const first = slots[i];
        for (let j = i + 1; j < slots.length && slots[j].start < first.end; j++) {
          const second = slots[j];
          if (first.course.key === second.course.key) continue;
          first.conflict = second.conflict = true;
          const range = slotLabel(second.start, Math.min(first.end, second.end));
          conflicts.add(`${day} ${range} · ${first.course.name} y ${second.course.name}`);
        }
      }
    }
    return { week, minutes, incomplete, conflicts };
  }

  function startSimulator() {
    const byId = (id) => document.getElementById(id);
    const ui = {
      root: byId("simuladorHorario"),
      open: byId("abrirSimulador"),
      amount: byId("simCantidad"),
      periodControl: byId("simPeriodoControl"),
      period: byId("simPeriodo"),
      credits: byId("simCreditos"),
      hours: byId("simHoras"),
      independent: byId("simIndependiente"),
      status: byId("simEstado"),
      conflicts: byId("simCruces"),
      agendaPanel: byId("simAgendaPanel"),
      agenda: byId("simAgenda"),
      selectionPanel: byId("simSeleccionPanel"),
      selections: byId("simSeleccion"),
      rate: byId("simTarifa"),
      price: byId("simCosto")
    };

    const selections = new Map();
    const rates = new Map();
    let liveCourses = new Map();
    let publishedPeriods = [];
    let loading = true;
    let activePeriod = "";
    let chargeHours = null;

    for (const [period, key, group] of readChoices()) selectionFor(period).set(key, group);

    function selectionFor(period) {
      if (!selections.has(period)) selections.set(period, new Map());
      return selections.get(period);
    }

    function saveChoices() {
      const data = [...selections].flatMap(([period, chosen]) =>
        [...chosen].map(([key, group]) => [period, key, group])
      );
      try {
        localStorage.setItem(STORAGE, JSON.stringify(data));
      } catch {
        // El simulador funciona en la página aun si se bloquea el almacenamiento.
      }
    }

    function renderPrice() {
      const rate = ui.rate.valueAsNumber;
      const estimate = chargeHours * rate;
      ui.price.value = chargeHours !== null && ui.rate.validity.valid && Number.isFinite(estimate)
        ? CURRENCY.format(estimate)
        : "—";
    }

    function updateGroupButton(button) {
      const { simPeriod, simCourse, simGroup } = button.dataset;
      const chosen = selections.get(simPeriod)?.get(simCourse);
      button.textContent = chosen === simGroup
        ? "Quitar del horario"
        : chosen ? "Cambiar a este grupo" : "Agregar al horario";
      button.classList.toggle("is-selected", chosen === simGroup);
    }

    function updateButtons() {
      for (const button of document.querySelectorAll("button[data-sim-group]")) updateGroupButton(button);
    }

    function updateChoice(period, key, group) {
      const chosen = selectionFor(period);
      if (group && chosen.get(key) !== group) chosen.set(key, group);
      else chosen.delete(key);
      activePeriod = period;
      saveChoices();
      render();
      updateButtons();
    }

    function createGroupButton(course, group) {
      const button = element("button", "", "btn horarios-secondary horarios-sim-add");
      button.type = "button";
      button.dataset.simPeriod = course.source.periodo;
      button.dataset.simCourse = course.key;
      button.dataset.simGroup = group.grupo;
      button.addEventListener("click", () => updateChoice(course.source.periodo, course.key, group.grupo));
      updateGroupButton(button);
      return button;
    }

    function renderDays(week) {
      ui.agendaPanel.hidden = ![...week.values()].some((slots) => slots.length);
      ui.agenda.replaceChildren();
      for (const [day, slots] of week) {
        if (!slots.length && DAYS.indexOf(day) > 4) continue;
        const column = element("section", "", "horarios-sim-day");
        column.append(element("h4", day));
        if (!slots.length) column.append(element("p", "Libre"));
        for (const { start, end, course, group, room, conflict } of slots) {
          const card = element("div", "", conflict ? "horarios-sim-slot has-conflict" : "horarios-sim-slot");
          card.append(
            element("strong", slotLabel(start, end)),
            element("span", course.name),
            element("small", [`Grupo ${group.grupo}`, room, conflict ? "Cruce" : ""].filter(Boolean).join(" · "))
          );
          column.append(card);
        }
        ui.agenda.append(column);
      }
    }

    function selectionRow(key, groupCode, course, group) {
      const row = element("li");
      const courseTitle = element("strong", course?.name || `Materia ${key.split(":").at(-1)}`);
      const detail = element("span", `Grupo ${groupCode}${group ? "" : " · Oferta sin verificar"}`);
      const remove = element("button", "Quitar", "btn horarios-secondary");
      remove.type = "button";
      remove.setAttribute("aria-label", `Quitar ${courseTitle.textContent}, grupo ${groupCode}`);
      remove.addEventListener("click", () => updateChoice(activePeriod, key));
      const text = element("div");
      text.append(courseTitle, detail);
      row.append(text, remove);
      return row;
    }

    function render() {
      const savedPeriods = [...selections].filter(([, chosen]) => chosen.size).map(([period]) => period);
      const periods = [...new Set([...publishedPeriods, ...savedPeriods])];
      if (!periods.includes(activePeriod)) activePeriod = periods[0] || "";
      ui.periodControl.hidden = !periods.length;
      ui.period.replaceChildren(...periods.map((period) => new Option(periodLabel(period), period)));
      ui.period.value = activePeriod;
      ui.rate.value = rates.get(activePeriod) || "";

      const chosen = selections.get(activePeriod) || new Map();
      const selected = [];
      const rows = [];
      for (const [key, groupCode] of chosen) {
        const course = liveCourses.get(key);
        const group = course?.source.periodo === activePeriod
          ? course.groups.find(({ grupo }) => grupo === groupCode)
          : null;
        if (group) selected.push({ course, group });
        rows.push(selectionRow(key, groupCode, course, group));
      }
      ui.selections.replaceChildren(...rows);
      ui.selectionPanel.hidden = !rows.length;
      ui.amount.textContent = chosen.size === 1 ? "1 grupo" : `${chosen.size} grupos`;

      const { week, minutes, incomplete, conflicts } = buildWeek(selected);
      const hours = minutes / 60;
      const unresolved = chosen.size - selected.length;
      ui.credits.textContent = DECIMAL.format(selected.reduce((total, { course }) => total + course.credits, 0));
      ui.hours.textContent = `${DECIMAL.format(hours)} h`;
      ui.independent.textContent = `${DECIMAL.format(selected.reduce((total, { course }) => total + course.independentHours, 0))} h`;
      ui.conflicts.hidden = !conflicts.size;
      ui.conflicts.replaceChildren(...[...conflicts].map((line) => element("li", `Cruce · ${line}`)));
      renderDays(week);

      const messages = [];
      if (loading) messages.push("Verificando grupos con la oferta oficial…");
      else {
        if (unresolved) messages.push(`Grupos sin verificar: ${unresolved}. Los totales usan los grupos confirmados.`);
        if (incomplete) messages.push(`Grupos con hora por confirmar: ${incomplete}. Se muestran las horas publicadas.`);
        if (!chosen.size) messages.push("Aún no has agregado grupos a este periodo.");
      }
      const labsToAdd = selected
        .map(({ course }) => course.labKey)
        .filter((key) => key && !chosen.has(key) && liveCourses.get(key)?.source.periodo === activePeriod);
      if (labsToAdd.length) messages.push(`Laboratorios por agregar: ${labsToAdd.map((key) => liveCourses.get(key).name).join("; ")}.`);
      if (conflicts.size) messages.push(conflicts.size === 1 ? "Hay 1 cruce de horario." : `Hay ${conflicts.size} cruces de horario.`);
      ui.status.textContent = messages.join(" ");
      chargeHours = selected.length && !incomplete && !unresolved ? hours : null;
      renderPrice();
    }

    ui.open.addEventListener("click", () => {
      ui.root.open = true;
      ui.root.querySelector("summary").focus({ preventScroll: true });
      ui.root.scrollIntoView({ block: "start" });
    });
    ui.period.addEventListener("change", () => {
      activePeriod = ui.period.value;
      render();
    });
    ui.rate.addEventListener("input", () => {
      rates.set(activePeriod, ui.rate.value);
      renderPrice();
    });
    render();

    return {
      createGroupButton,
      setOffers(courses, periods, isLoading) {
        liveCourses = new Map(courses.map((course) => [course.key, course]));
        publishedPeriods = periods;
        loading = isLoading;
        render();
      }
    };
  }

  window.startManresaSimulator = startSimulator;
})();
