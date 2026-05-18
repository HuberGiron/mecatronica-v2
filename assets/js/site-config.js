/* =============================================================
 * site-config.js
 * -------------------------------------------------------------
 * Configuración editable del sitio Mecatrónica IBERO.
 * Para cambiar redes sociales, edita SOLO este archivo.
 * No necesitas modificar cada página HTML.
 * ============================================================= */

(function () {
  "use strict";

  const ALLOWED_SOCIAL_HOSTS = new Set([
    "www.facebook.com",
    "facebook.com",
    "www.instagram.com",
    "instagram.com",
    "www.youtube.com",
    "youtube.com",
    "www.tiktok.com",
    "tiktok.com"
  ]);

  window.IBERO_SITE_CONFIG = {
    socialLinks: {
      facebook: "https://www.facebook.com/laibero",
      instagram: "https://www.instagram.com/ibero_cdmx/",
      youtube: "https://www.youtube.com/@UIberoamericana",
      tiktok: "https://www.tiktok.com/@ibero.cdmx"
    }
  };

  function getSafeSocialUrl(value) {
    if (typeof value !== "string") {
      return null;
    }

    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return null;
    }

    try {
      const url = new URL(trimmedValue, window.location.origin);
      const hostname = url.hostname.toLowerCase();

      if (url.protocol !== "https:") {
        return null;
      }

      if (!ALLOWED_SOCIAL_HOSTS.has(hostname)) {
        return null;
      }

      return url.href;
    } catch (error) {
      return null;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    const config = window.IBERO_SITE_CONFIG || {};
    const socialLinks = config.socialLinks || {};

    document.querySelectorAll("a[data-social]").forEach(function (link) {
      const key = link.getAttribute("data-social");
      const safeHref = getSafeSocialUrl(socialLinks[key]);

      if (!safeHref) {
        link.removeAttribute("href");
        link.removeAttribute("target");
        link.removeAttribute("rel");
        return;
      }

      link.setAttribute("href", safeHref);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    });
  });
})();