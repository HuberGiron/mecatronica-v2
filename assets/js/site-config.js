/* =============================================================
 * site-config.js
 * -------------------------------------------------------------
 * Configuración editable del sitio Mecatrónica IBERO.
 * Para cambiar redes sociales, edita SOLO este archivo.
 * No necesitas modificar cada página HTML.
 * ============================================================= */

window.IBERO_SITE_CONFIG = {
  socialLinks: {
    facebook: "https://www.facebook.com/laibero",
    instagram: "https://www.instagram.com/ibero_cdmx/",
    youtube: "https://www.youtube.com/@UIberoamericana",
    tiktok: "https://www.tiktok.com/@ibero.cdmx"
  }
};

document.addEventListener("DOMContentLoaded", function () {
  const config = window.IBERO_SITE_CONFIG || {};
  const socialLinks = config.socialLinks || {};

  document.querySelectorAll("a[data-social]").forEach(function (link) {
    const key = link.getAttribute("data-social");
    if (key && socialLinks[key]) {
      link.setAttribute("href", socialLinks[key]);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener");
    }
  });
});
