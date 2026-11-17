(() => {
  "use strict";

  const { fetchOffers, periodLabel, element, groupCard } = window.ManresaHorarios;
  const groupOrder = new Intl.Collator("es-MX", { numeric: true });
  let consultation;
  let current;

  function offerBlock(subject, source, isLab) {
    const block = element("div", "", "horarios-ficha-oferta");
    if (isLab) block.append(element("strong", `Laboratorio · ${subject.nombre}`));

    if (!source || source.error) {
      block.append(element("p", source?.error || "Esta coordinación aún no está disponible para consulta."));
      return block;
    }

    block.append(element("p", `Periodo de oferta · ${periodLabel(source.periodo)}`, "horarios-ficha-periodo"));
    const groups = source.grupos
      .filter((group) => group.materia === String(subject.clave))
      .sort((a, b) => groupOrder.compare(a.grupo, b.grupo));
    if (!groups.length) {
      block.append(element("p", "Sin grupos publicados para esta materia en el periodo indicado."));
      return block;
    }

    const list = element("details", "", "horarios-groups");
    list.open = !isLab;
    list.append(element("summary", groups.length === 1 ? "1 grupo" : `${groups.length} grupos`));
    list.append(...groups.map(groupCard));
    block.append(list);
    return block;
  }

  function retryButton() {
    const retry = element("button", "Volver a consultar", "btn ghost");
    retry.type = "button";
    retry.addEventListener("click", () => {
      consultation = undefined;
      render();
    });
    return retry;
  }

  async function render() {
    const { container, subject, lab } = current;
    const heading = element("h3", "Horarios de la materia");
    const body = element("div");
    body.setAttribute("aria-live", "polite");
    container.replaceChildren(heading, body);

    if (subject.isPhantom) {
      body.append(element("p", "Abre una materia de las opciones de este bloque para ver su periodo y sus grupos."));
      return;
    }
    if (!subject.clave || !subject.cveCoordinacion) {
      body.append(element("p", "Esta materia carece de una clave o coordinación de oferta."));
      return;
    }

    body.append(element("p", "Consultando la oferta oficial…"));
    const pending = consultation ??= fetchOffers();
    try {
      const { fuentes } = await pending;
      if (!body.isConnected) return;

      const byId = new Map(fuentes.map((source) => [source.id, source]));
      const source = byId.get(String(subject.cveCoordinacion));
      const labSource = lab && byId.get(String(lab.cveCoordinacion));
      body.replaceChildren(offerBlock(subject, source, false));
      if (lab) body.append(offerBlock(lab, labSource, true));
      if (!source || source.error || (lab && (!labSource || labSource.error))) body.append(retryButton());
    } catch {
      if (consultation === pending) consultation = undefined;
      if (body.isConnected) body.replaceChildren(element("p", "No se pudo consultar la oferta oficial."), retryButton());
    }
  }

  window.ManresaFichaHorarios = {
    show(container, subject, lab) {
      current = { container, subject, lab };
      render();
    }
  };

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    consultation = undefined;
    if (current?.container.isConnected && document.getElementById("coursePanel")?.classList.contains("is-open")) render();
  });
})();
