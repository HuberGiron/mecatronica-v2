(() => {
  "use strict";

  async function fetchOffers(controller = new AbortController()) {
    const timeout = window.setTimeout(() => controller.abort(), 28_000);
    try {
      const response = await fetch("/api/horarios/manresa", {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      const data = await response.json();
      if (!Array.isArray(data?.fuentes) || !Number.isFinite(Date.parse(data.consultadoEn))) {
        throw new Error("Respuesta de horarios inválida");
      }
      return { ...data, ok: response.ok };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function subjectKey(coordination, subject) {
    return `${coordination}:${subject}`;
  }

  function periodLabel(period) {
    const value = period.toLocaleLowerCase("es-MX");
    return value.charAt(0).toLocaleUpperCase("es-MX") + value.slice(1);
  }

  function element(tag, text, className = "") {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function groupCard(group) {
    const block = element("section", "", "horarios-group");
    block.append(
      element("h4", [`Grupo ${group.grupo}`, group.modalidad].filter(Boolean).join(" · ")),
      element("p", group.profesores.length ? group.profesores.join(" / ") : "Docente por confirmar")
    );

    if (group.sesiones.length) {
      const sessions = element("ul", "", "horarios-sessions");
      for (const session of group.sesiones) {
        const row = element("li");
        row.append(
          element("strong", session.dia || "Día por confirmar"),
          element("span", session.horario || "Hora por confirmar"),
          element("span", session.salon || "Salón por confirmar")
        );
        sessions.append(row);
      }
      block.append(sessions);
    } else {
      block.append(element("p", "Horario por confirmar"));
    }

    for (const note of group.notas) block.append(element("p", note, "horarios-note"));
    return block;
  }

  window.ManresaHorarios = { fetchOffers, subjectKey, periodLabel, element, groupCard };
})();
