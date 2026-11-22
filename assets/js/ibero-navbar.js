(async function () {
  if (window.IBERO_LAYOUT_READY) await window.IBERO_LAYOUT_READY;

  const nav = document.getElementById('mainNav');
  const collapse = document.getElementById('navbarResponsive');
  const videoTrigger = document.getElementById('videoTrigger');
  const videoCard = document.getElementById('videoCard');
  const newsInner = document.getElementById('iberoNewsInner');
  const threshold = 180;


  function blockHoverDropdowns() {
    if (!nav) return;
    nav.querySelectorAll('.dropdown').forEach((drop) => {
      ['mouseenter', 'mouseleave', 'mouseover', 'mouseout'].forEach((eventName) => {
        drop.addEventListener(eventName, function (event) {
          event.stopImmediatePropagation();
        }, true);
      });
    });
  }

  function closeNavbarCollapse() {
    if (!collapse || !window.bootstrap || !collapse.classList.contains('show')) return;
    bootstrap.Collapse.getOrCreateInstance(collapse, { toggle: false }).hide();
  }

  function closeOpenDropdowns() {
    if (!nav || !window.bootstrap) return;
    nav.querySelectorAll('[data-bs-toggle="dropdown"].show').forEach((toggle) => {
      bootstrap.Dropdown.getOrCreateInstance(toggle).hide();
    });
  }

  let lastScrollY = window.scrollY;

  function updateNavState() {
    if (!nav) return;
    const isScrolled = window.scrollY > threshold;
    const wasScrolled = nav.classList.contains('is-scrolled');
    const movedEnough = Math.abs(window.scrollY - lastScrollY) > 8;

    nav.classList.toggle('is-scrolled', isScrolled);

    // Si vuelve a la parte superior, cerramos el panel hamburguesa.
    if (!isScrolled) closeNavbarCollapse();

    // Si cambia de modo normal ↔ hamburguesa, cerramos submenús abiertos.
    if (wasScrolled !== isScrolled) closeOpenDropdowns();

    // Si el panel hamburguesa está abierto y el usuario se desplaza, se minimiza.
    if (movedEnough && collapse && collapse.classList.contains('show')) {
      closeOpenDropdowns();
      closeNavbarCollapse();
    }

    lastScrollY = window.scrollY;
  }

  function setupCloseOnOutsideClick() {
    if (!nav || !collapse) return;

    document.addEventListener('click', function (event) {
      const menuIsOpen = collapse.classList.contains('show');
      if (!menuIsOpen) return;

      const clickedInsideNav = nav.contains(event.target);
      if (clickedInsideNav) return;

      closeOpenDropdowns();
      closeNavbarCollapse();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      closeOpenDropdowns();
      closeNavbarCollapse();
    });
  }

  function setupDropdownClickOnly() {
    if (!nav || !window.bootstrap) return;
    nav.querySelectorAll('.dropdown-toggle').forEach((toggle) => {
      toggle.addEventListener('click', function () {
        nav.querySelectorAll('.dropdown-toggle.show').forEach((openToggle) => {
          if (openToggle !== toggle) bootstrap.Dropdown.getOrCreateInstance(openToggle).hide();
        });
      });
    });
  }

  function setupVideo() {
    if (!videoTrigger || !videoCard) return;
    videoTrigger.addEventListener('click', function () {
      videoCard.innerHTML = '<iframe src="https://www.youtube.com/embed/6om9bh6pz_s?autoplay=1&rel=0" title="Ingeniería en Mecatrónica y Sistemas Ciberfísicos IBERO" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe>';
    }, { once: true });
  }

  function normalizeNewsItem(item) {
    return {
      imagen: item.imagen || item.image || item.img || '/assets/img/home/video-preview.png',
      titulo: item.titulo || item.title || 'Noticia IBERO',
      fecha: item.fechaTexto || formatNewsDate(item.fechaISO || item.fecha || item.date || ''),
      resumen: item.resumen || item.summary || item.descripcion || '',
      url: item.url || item.link || '#'
    };
  }

  function formatNewsDate(raw) {
    if (!raw) return '';
    const clean = String(raw).trim();
    const match = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (!match) return clean;
    const months = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    return `${Number(match[3])} ${months[Number(match[2]) - 1] || ''}, ${match[1]}`;
  }

  function chunk(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderNews(items) {
    if (!newsInner) return;
    const normalized = items.map(normalizeNewsItem).filter(item => item.titulo && item.url);
    document.querySelectorAll('.ibero-news-arrow').forEach(button => { button.disabled = normalized.length <= 3; });
    if (!normalized.length) {
      newsInner.innerHTML = '<div class="carousel-item active"><div class="ibero-news-loading">Aún no hay noticias publicadas.</div></div>';
      return;
    }

    const slides = chunk(normalized, 3);
    newsInner.innerHTML = slides.map((group, slideIndex) => `
      <div class="carousel-item${slideIndex === 0 ? ' active' : ''}">
        <div class="ibero-news-grid">
          ${group.map(item => `
            <article class="ibero-news-card">
              <img class="ibero-news-img" src="${escapeHtml(item.imagen)}" alt="${escapeHtml(item.titulo)}" loading="lazy">
              <div class="ibero-news-body">
                ${item.fecha ? `<div class="ibero-news-date">${escapeHtml(item.fecha)}</div>` : ''}
                <h3 class="ibero-news-card-title">${escapeHtml(item.titulo)}</h3>
                ${item.resumen ? `<p class="ibero-news-summary">${escapeHtml(item.resumen)}</p>` : ''}
              </div>
              <div class="ibero-news-footer">
                <a class="ibero-news-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Leer más</a>
              </div>
            </article>
          `).join('')}
        </div>
      </div>
    `).join('');

    const carouselElement = document.getElementById('iberoNewsCarousel');
    if (carouselElement && window.bootstrap) {
      bootstrap.Carousel.getOrCreateInstance(carouselElement, {
        interval: 5600,
        ride: 'carousel',
        pause: 'hover',
        touch: true
      });
    }
  }

  async function setupNews() {
    if (!newsInner) return;
    let timer;
    try {
      const request = import('./noticias-public.js?v=noticias-2').then(module => module.loadPublicNews());
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Tiempo de espera agotado')), 12000); });
      renderNews(await Promise.race([request, timeout]));
    } catch (error) {
      console.error('No se pudieron cargar las noticias', error);
      newsInner.innerHTML = '<div class="carousel-item active"><div class="ibero-news-loading" role="status">Las noticias no están disponibles por el momento. <button type="button" class="btn btn-ibero btn-ibero-outline" data-retry-news>Reintentar</button></div></div>';
      newsInner.querySelector('[data-retry-news]').addEventListener('click', () => {
        newsInner.innerHTML = '<div class="carousel-item active"><div class="ibero-news-loading">Cargando noticias...</div></div>';
        setupNews();
      }, { once: true });
    } finally { clearTimeout(timer); }
  }

  blockHoverDropdowns();
  setupDropdownClickOnly();
  setupCloseOnOutsideClick();
  setupVideo();
  setupNews();
  updateNavState();
  window.addEventListener('scroll', updateNavState, { passive: true });
  window.addEventListener('resize', updateNavState);
})();
