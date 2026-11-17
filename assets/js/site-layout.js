(() => {
  "use strict";

  function pathKey(path) {
    return path.replace(/\/index\.html$/i, "/").replace(/\/+$/, "") || "/";
  }

  async function mountLayout() {
    const navigation = document.querySelector("[data-site-nav]");
    const footer = document.querySelector("[data-site-footer]");
    try {
      // Revalida la plantilla aunque los JavaScript del sitio tengan una caché larga.
      const response = await fetch("/assets/partials/site-layout.html", { cache: "no-cache" });
      if (!response.ok) throw new Error(`Plantilla del sitio: HTTP ${response.status}`);
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      const navTemplate = doc.querySelector("#ibero-navigation");
      const footerTemplate = doc.querySelector("#ibero-footer");
      if (!navTemplate?.content.firstElementChild || !footerTemplate?.content.firstElementChild) {
        throw new Error("Plantilla de navegación o pie incompleta");
      }

      navigation?.replaceWith(navTemplate.content.cloneNode(true));
      footer?.replaceWith(footerTemplate.content.cloneNode(true));

      const activePath = pathKey(window.location.pathname);
      for (const link of document.querySelectorAll("#mainNav a[href^='/']")) {
        if (pathKey(link.pathname) === activePath) link.setAttribute("aria-current", "page");
      }
      return true;
    } catch (error) {
      console.error("No se pudo cargar el menú y el pie del sitio.", error);
      if (navigation) {
        const link = document.createElement("a");
        link.href = "/";
        link.textContent = "Inicio IBERO Mecatrónica";
        navigation.append(link);
      }
      return false;
    }
  }

  window.IBERO_LAYOUT_READY = mountLayout();
})();
