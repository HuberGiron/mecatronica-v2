/* =============================================================
 * scripts.js ─ Funciones globales del sitio Mecatrónica IBERO
 * -------------------------------------------------------------
 * ▸ Navbar móvil (cierra al hacer clic en enlace)
 * ▸ Navbar hover-desktop con retardo
 * ▸ Vista “Plan de estudios”
 *      - Informativa (por defecto)
 *      - Seriaciones y prerrequisitos
 *      - Calculadora de créditos / horas
 * -------------------------------------------------------------
 */

window.addEventListener('DOMContentLoaded', () => {

  /* ==========================================================
   * 1. NAVBAR COMPORTAMIENTO
   * ==========================================================*/
  const navbarToggler = document.querySelector('.navbar-toggler');

  // ── 1.a Cerrar menú colapsable al seleccionar un enlace
  document.querySelectorAll('#navbarResponsive .nav-link')
    .forEach(link => link.addEventListener('click', () => {
      const isMobile = window.getComputedStyle(navbarToggler).display !== 'none';
      const isDropdown = link.classList.contains('dropdown-toggle');
      if (isMobile && !isDropdown) navbarToggler.click();
    }));

  // ── 1.b Dropdown on‑hover para ≥ lg
  document.querySelectorAll('.navbar .dropdown').forEach(drop => {
    const trigger  = drop.querySelector('.dropdown-toggle');
    const bsDrop   = new bootstrap.Dropdown(trigger, { autoClose: 'outside' });
    let hideTimer;

    drop.addEventListener('mouseenter', () => {
      if (window.innerWidth >= 992) { clearTimeout(hideTimer); bsDrop.show(); }
    });
    drop.addEventListener('mouseleave', () => {
      if (window.innerWidth >= 992) {
        hideTimer = setTimeout(() => bsDrop.hide(), 100);
      }
    });
  });


  /* ==========================================================
   * 2. PLAN DE ESTUDIOS (solo si #planGrid existe)
   * ==========================================================*/
  const grid = document.getElementById('planGrid');
  if (!grid) return;  // estamos en otra página


/* ===== Modal introductorio (se muestra SIEMPRE) ========== */
(() => {
  const introModalEl = document.getElementById('introModal');
  if (!introModalEl) return;         // por si faltara en otra página

  /* instancias */
  const introModal    = new bootstrap.Modal(introModalEl);
  const introCarousel = new bootstrap.Carousel(
        document.getElementById('introCarousel'), { interval: false });


  const playActive = () => {
    // pausa todos
    introModalEl.querySelectorAll('video').forEach(v => v.pause());
    // reproduce el activo (ya viene muted)
    introCarousel._element
                .querySelector('.carousel-item.active video')
                ?.play();
  };

  /* arranca el primero cuando se muestre el modal */
  introModal.show();
  playActive();

  /* cada vez que cambia de slide: pausa y reproduce el nuevo */
  introCarousel._element.addEventListener('slid.bs.carousel', playActive);

  /* si se cierra el modal, pausa el clip */
  introModalEl.addEventListener('hidden.bs.modal',
    () => introModalEl.querySelectorAll('video').forEach(v => v.pause()));


  /* ── subtítulo dinámico ─────────────────────── */
  const subtitle   = document.getElementById('introSubtitle');
  const viewNames  = ['Informativa',
                      'Seriaciones y prerequisitos',
                      'Calculadora de créditos · horas'];

  introCarousel._element.addEventListener('slid.bs.carousel', e => {
    subtitle.textContent = 'Vista: ' + viewNames[e.to];
  });

  /* botones “Siguiente” */
  document.getElementById('introNext1').onclick = () => introCarousel.next();
  document.getElementById('introNext2').onclick = () => introCarousel.next();

  /* “Cerrar” y X → pausa vídeo */
  const pauseActive = () => introCarousel
      ._element.querySelector('.carousel-item.active video')?.pause();

  document.getElementById('introClose').onclick = pauseActive;
  introModalEl.addEventListener('hidden.bs.modal', pauseActive);

  introModal.show();                 // ¡se muestra siempre!
})();






  // ----- Referencias DOM comunes -----
  const viewSel     = document.getElementById('planView');
  const noteLabel   = document.getElementById('planNote');
  const controlsBox = document.getElementById('calcControls');
  const summaryBox  = document.getElementById('calcSummary');
  const btnDone     = document.getElementById('brushDone');
  const btnTodo     = document.getElementById('brushTodo');
  const btnClear    = document.getElementById('brushClear');

  // ----- Modal -----
  const mTitle = document.getElementById('courseModalTitle');
  const mInfo  = document.getElementById('courseInfo');
  const mSyl   = document.getElementById('courseSyllabus');
  const mDesc  = document.getElementById('courseDesc');
  const modal  = new bootstrap.Modal(document.getElementById('courseModal'));

  // Estado de calculadora
  const calcState = { mode: 'cursado', map: new Map() };
  const courseDict = {};

  /* ====== Seriaciones: helpers ================================= */
    function collectChain(key, set = new Set()){
    if(!key || set.has(key)) return;
    set.add(key);

    const prereq = courseDict[key]?.prereq || [];
    prereq.forEach(k => collectChain(k, set));
    return set;
    }

    function clearChainHighlight(){
    document
        .querySelectorAll('.course-card.chain')
        .forEach(c => c.classList.remove('chain'));
    }


  /* ---------------- Helpers ---------------- */
  function createCard(course){
    const d = document.createElement('div');
    d.className = 'course-card';
    d.innerHTML = `${course.name}<br><small>${course.clave}</small>`;
    d.dataset.bsToggle = 'tooltip';
    d.title            = `${course.clave} · ${course.credits} cr`;
    d.dataset.key      = course.clave;
    d.dataset.credits  = course.credits;
    d.addEventListener('click', handleCardClick);
    courseDict[course.clave] = course;
    return d;
  }

    function showModal(c){
    mTitle.textContent = `${c.name} (${c.clave})`;

    /* fila laboratorio */
    const labRow = c.lab
        ? `<li class="list-group-item d-flex justify-content-between align-items-center">
            <span>
            <strong>Laboratorio:</strong> Sí (<span class="fw-semibold">${c.lab_clave}</span>)
            </span>
            <button class="btn btn-outline-secondary btn-copy btn-sm"
                    onclick="navigator.clipboard.writeText('${c.lab_clave}')">
            <i class="bi bi-clipboard"></i>
            </button>
        </li>`
        : '<li class="list-group-item"><strong>Laboratorio:</strong> No</li>';

    /* cuerpo del listado */
    mInfo.innerHTML = `
        <li class="list-group-item d-flex justify-content-between align-items-center">
        <span><strong>Clave:</strong> <span class="fw-semibold">${c.clave}</span></span>
        <button class="btn btn-outline-secondary btn-copy btn-sm"
                onclick="navigator.clipboard.writeText('${c.clave}')">
            <i class="bi bi-clipboard"></i>
        </button>
        </li>
        <li class="list-group-item"><strong>Sigla:</strong> ${c.sigla}</li>
        <li class="list-group-item"><strong>Créditos:</strong> ${c.credits ?? '—'}</li>
        <li class="list-group-item"><strong>Horas con académico:</strong> ${c.hours.with_prof}</li>
        <li class="list-group-item"><strong>Horas independientes:</strong> ${c.hours.independent}</li>
        ${labRow}
        <li class="list-group-item"><strong>Área:</strong> ${c.area}</li>
        <li class="list-group-item"><strong>Prerrequisitos:</strong> ${c.prereq.length ? c.prereq.join(', ') : 'Ninguno'}</li>`;

    mSyl.textContent  = c.syllabus    || 'En construcción';
    mDesc.textContent = c.description || 'Próximamente';
    modal.show();
    }


  /* ----------- Cargar plan ----------- */
  axios.get('/assets/data/plan_de_estudios2.json')
    .then(res => {
      res.data.semesters.forEach(sem => {
        const col = document.createElement('div'); col.className = 'sem-col';

        const hdr = document.createElement('div');
        hdr.className = 'sem-header';
        hdr.textContent = `Semestre ${sem.number}`;
        hdr.addEventListener('click', () => {
          if(viewSel.value === 'calc') col.querySelectorAll('.course-card').forEach(c => c.click());
        });
        col.appendChild(hdr);

        sem.courses.forEach(c => col.appendChild(createCard(c)) );
        grid.appendChild(col);
      });
      document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => new bootstrap.Tooltip(el));
    })
    .catch(err => { console.error(err); grid.innerHTML = '<div class="alert alert-danger">No se pudo cargar el plan de estudios</div>'; });

  // Navegación horizontal (solo escritorio)
  const btnPrev = document.getElementById('planPrev');
  const btnNext = document.getElementById('planNext');
  btnPrev.disabled = true;   // al principio estás al inicio
  btnNext.disabled = false;  // permite avanzar desde YA
  if (btnPrev && btnNext && grid) {
    const STEP = Math.round(grid.clientWidth * 0.8); // ~una “página” menos un margen

    const go = (delta) => grid.scrollBy({ left: delta, behavior: 'smooth' });

    btnPrev.addEventListener('click', () => go(-STEP));
    btnNext.addEventListener('click', () => go(+STEP));

    // (Opcional) deshabilitar cuando estés en los extremos:
    const updateArrows = () => {
      const atStart = grid.scrollLeft <= 0;
      const atEnd   = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 1;
      btnPrev.disabled = atStart;
      btnNext.disabled = atEnd;
    };
    grid.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    // Llamada inicial (tras poblar el grid)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => updateArrows());
    });

  }

 /* ---------------- Brochas ---------------- */
  if(btnDone && btnTodo){
    btnDone.addEventListener('click', () => { calcState.mode='cursado';  toggleBrush(btnDone,btnTodo); });
    btnTodo.addEventListener('click', () => { calcState.mode='porcursar'; toggleBrush(btnTodo,btnDone); });
  }
  if(btnClear){
    btnClear.addEventListener('click', () => {
      calcState.map.clear();
      document.querySelectorAll('.course-card').forEach(c => c.classList.remove('cursado','porcursar'));
      updateSummary();
    });
  }

  function toggleBrush(active,inactive){
    active.classList.add('active');
    inactive.classList.remove('active');
  }

  /* ------------- Clic tarjeta ------------- */
    function handleCardClick(e){
        const card = e.currentTarget;
        const key  = card.dataset.key;

        /* 1. Vista SERIACIONES ------------------------------------------------ */
        if(viewSel.value === 'chain'){
            clearChainHighlight();
            const chain = collectChain(key);          // reúne prerequisitos
            chain.forEach(k=>{
            const c = document.querySelector(`[data-key="${CSS.escape(k)}"]`);
            c?.classList.add('chain');
            });
            return;                                   // NO modal
        }

        /* 2. Vista CALCULADORA ------------------------------------------------- */
        if(viewSel.value === 'calc'){
            calcState.map.set(key, calcState.mode);
            card.classList.remove('cursado','porcursar');
            card.classList.add(calcState.mode === 'cursado' ? 'cursado' : 'porcursar');
            updateSummary();
            return;                                   // NO modal
        }

        /* 3. Vista INFORMATIVA (default) -------------------------------------- */
        showModal(courseDict[key]);
    }




  /* ------------- Resumen ------------- */
  function updateSummary(){
    let doneCnt=0, doneCr=0, todoCnt=0, todoCr=0;
    calcState.map.forEach((v,k) => {
      const cr = Number(document.querySelector(`[data-key="${CSS.escape(k)}"]`)?.dataset.credits || 0);
      if(v==='cursado'){ doneCnt++; doneCr+=cr; } else { todoCnt++; todoCr+=cr; }
    });
    summaryBox.innerHTML = `
      <hr class="my-2"><span class="text-danger">Has cursado:</span> <strong>${doneCnt}/51</strong> materias · ${doneCr}/423 créditos<br>
      <span class="text-success">Piensas cursar:</span> <strong>+${todoCnt}</strong> materias · +${todoCr} créditos<br>
      <hr class="my-2"><span>Total:</span> <strong>${doneCnt+todoCnt}/51</strong> materias · ${doneCr+todoCr}/423 créditos`;
  }



  /* ------------- Cambiar vista ------------- */
  function switchView(){
    clearChainHighlight();
    const v = viewSel.value;

    /* --- RESET visual y de datos -------------------------------- */
    // a) quita cualquier borde morado o de calculadora
    document.querySelectorAll('.course-card')
            .forEach(c => c.classList.remove('cursado','porcursar','chain'));

    // b) vacía el estado de la calculadora y borra texto del resumen
    calcState.map.clear();
    if(summaryBox) summaryBox.textContent = '';

    if(v==='info'){
      grid.style.display      = '';
      noteLabel.style.display = '';
      controlsBox.classList.add('d-none');
    }
    else if(v==='calc'){
      grid.style.display      = '';
      noteLabel.style.display = 'none';
      controlsBox.classList.remove('d-none');
      updateSummary();
    }
    else if(v === 'chain'){
    grid.style.display='';
    noteLabel.style.display='none';
    controlsBox.classList.add('d-none');  // sin brochas
    }
    else{ // vista 'peer' o futura
      grid.style.display      = 'none';
      noteLabel.style.display = 'none';
      controlsBox.classList.add('d-none');
    }
    /* --- desplazar a la sección Plan -------------------------- */
    const planSection = document.getElementById('plan');          // <section id="plan">
    const navBar      = document.getElementById('mainNav');       // navbar fijo

    if (planSection && navBar){
    const offset   = navBar.offsetHeight + 16;                  // +16 px de aire
    const targetY  = planSection.getBoundingClientRect().top
                    + window.pageYOffset - offset;

    window.scrollTo({ top: targetY, behavior: 'smooth' });
    }
  }

  viewSel.addEventListener('change', switchView);
  switchView(); // inicial
});

document.addEventListener('DOMContentLoaded', async () => {
  const dataUrl   = '/assets/data/logros.json';
  const thumbsBox = document.getElementById('thumbs');
  const inner     = document.querySelector('#carouselLogros .carousel-inner');
  const response  = await fetch(dataUrl);
  const logros    = await response.json();

  // Construir slides y miniaturas
  logros.forEach((l, i) => {
    /* --- Slide --- */
    const item = document.createElement('div');
    item.className = `carousel-item${i === 0 ? ' active' : ''}`;
    item.innerHTML = `
      <img src="${l.img}" class="d-block w-100 object-fit-cover" alt="${l.title}">
      <div class="carousel-caption text-start">
      </div>`;
    // item.innerHTML = `
    //   <img src="${l.img}" class="d-block w-100 object-fit-cover" alt="${l.title}">
    //   <div class="carousel-caption text-start">
    //     <h5 class="fw-semibold">${l.title}</h5>
    //     <p>${l.desc}</p>
    //   </div>`;
    inner.appendChild(item);

    /* --- Miniatura --- */
    const thumb = document.createElement('img');
    thumb.src = l.img;
    thumb.dataset.index = i;
    thumb.className = `img-fluid rounded${i === 0 ? ' active' : ''}`;
    thumbsBox.appendChild(thumb);
  });

  // Iniciar carrusel a 6 s
  const carouselEl = document.getElementById('carouselLogros');
  const carousel   = new bootstrap.Carousel(carouselEl, {
    interval: 6000,
    ride: 'carousel',
    touch: true
  });

  // Clic en miniatura → ir al slide correspondiente
  thumbsBox.addEventListener('click', e => {
    if (e.target.tagName !== 'IMG') return;
    carousel.to(+e.target.dataset.index);
  });

  // Cambiar borde activo cuando se mueve el carrusel
  carouselEl.addEventListener('slid.bs.carousel', e => {
    thumbsBox.querySelector('img.active')?.classList.remove('active');
    thumbsBox
      .querySelector(`img[data-index="${e.to}"]`)
      .classList.add('active');
  });
});


/* === Admisiones: contador de años y donut =============================== */
document.addEventListener('DOMContentLoaded', () => {

  /* --- contador de +50 años ------------------------------------------- */
  /* --- contador de +50 años ------------------------------------------- */
  const counter = document.getElementById('counter-anos');
  if (counter) {
    const target   = +counter.dataset.target;   // 50 en tu caso
    const stepTime = 30;                        // ← 50 ms entre saltos  (cámbialo a 75-100 ms si lo quieres aún más lento)
    let   lastTime = 0;                         // marca del último update

    const animate = (ts) => {
      /* ts = timestamp de RAF; lo provee el browser */
      if (ts - lastTime >= stepTime) {          // ¿han pasado ≥ stepTime ms?
        const val = +counter.textContent;
        if (val < target) {
          counter.textContent = val + 1;
          lastTime = ts;
        }
      }
      if (+counter.textContent < target) {
        requestAnimationFrame(animate);
      }
    };

    /* dispara solo cuando el número entra en viewport */
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        requestAnimationFrame(animate);         // inicia con RAF
        io.disconnect();
      }
    });
    io.observe(counter);
  }


  /* --- donut de egresados --------------------------------------------- */
  const donut = document.getElementById('donutEgresados');
  if (donut){
    const chart = new Chart(donut, {
      type:'doughnut',
      data:{
        labels:['Industria','I+D','Emprendimiento'],
        datasets:[{ data:[55,30,15], backgroundColor:['#ef402c','#121212','#b1b1b1'] }]
      },
      options:{ plugins:{ legend:{ position:'bottom' } } }
    });
  }

  /* --- modal becas: cambia título dinámico ---------------------------- */
  const becaModal = document.getElementById('becaModal');
  becaModal?.addEventListener('show.bs.modal', e=>{
    const btn  = e.relatedTarget;
    document.getElementById('becaTitle').textContent =
      `Solicitud · ${btn.dataset.beca}`;
  });
});




/* === animar barras de Perfil de ingreso ============================== */
/* === animar barras de Perfil de ingreso =============================== */
(function () {
  const tabBtn      = document.querySelector('button[data-bs-target="#ingreso"]');
  const ingresoPane = document.getElementById('ingreso');
  let  ioTriggered  = false;      // evita animación doble en mismo scroll

  function triggerBars() {
    ingresoPane.querySelectorAll('.progress-bar').forEach(bar => {
      const target = +bar.dataset.bar || 0;
      /* reset & animate */
      bar.style.width = '0';
      /* pequeño delay para que el reset se aplique */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => bar.style.width = target + '%');
      });
    });
  }

  /* 1) Al mostrar la pestaña ------------------------------------------------*/
  tabBtn?.addEventListener('shown.bs.tab', () => {
    ioTriggered = false;   // re-habilita el IO por si la pestaña vuelve a mostrarse
    triggerBars();
  });

  /* 2) Al hacer scroll y entrar al viewport --------------------------------*/
  const io = new IntersectionObserver(entries => {
    if (!ioTriggered && entries[0].isIntersecting) {
      triggerBars();
      ioTriggered = true;  // sólo una vez mientras permanezca visible
    }
  }, { threshold: 0.3 });
  io.observe(ingresoPane);
})();













/*(function(){
  const section = document.getElementById('pilares');
  const balls   = section.querySelectorAll('.pillar, .sub-sphere');
  balls.forEach(el=>el.style.opacity='0');

  const io = new IntersectionObserver(entries=>{
    if(entries[0].isIntersecting){
      balls.forEach((el,i)=>{
        setTimeout(()=>{ el.style.opacity='1'; }, i*70);
      });
      io.disconnect();
    }
  },{threshold:.25});
  io.observe(section);
})();
*/

/* === pop-in de esferas al entrar al viewport ========================= */
/* === pop-in correcto, sin arrastre ==================================== */
(function () {
  const section = document.getElementById('pilares');
  const balls   = section.querySelectorAll('.pillar, .sub-sphere');

  /* estado inicial */
  balls.forEach(el => el.classList.add('pop-init'));

  const io = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      balls.forEach((el, i) => {
        setTimeout(() => {
          el.classList.remove('pop-init');       // cambia --scale:0 → 1 y opacity
        }, i * 60);
      });
      io.disconnect(); // corre solo la primera vez
    }
  }, { threshold: .25 });

  io.observe(section);
})();






document.addEventListener('DOMContentLoaded', () => {

  const el = document.getElementById('heroCarousel');
  if (!el) return;

  /* ---------------------------------------------
     slide.bs.carousel → ANTES del cambio
     • “leaving”  = diapositiva que sale
     • “incoming” = diapositiva que entrará
  ---------------------------------------------- */
  el.addEventListener('slide.bs.carousel',  e => {

    /* pausa y rebobina la diapositiva que se va */
    const leavingVideo = e.from !== undefined
      ? el.querySelectorAll('.carousel-item')[e.from].querySelector('video')
      : null;

    if (leavingVideo) {
      leavingVideo.pause();
      leavingVideo.currentTime = 0;
    }

    /* prepara (rebobina) la diapositiva que entrará */
    const incomingVideo = e.relatedTarget.querySelector('video');
    incomingVideo.pause();          // por si acaso
    incomingVideo.currentTime = 0;  // listo para reproducir
  });

  /* ---------------------------------------------
     slid.bs.carousel → DESPUÉS del cambio
     • ahora sí reproducimos el vídeo visible
  ---------------------------------------------- */
  el.addEventListener('slid.bs.carousel', e => {
    const activeVid = e.relatedTarget.querySelector('video');
    if (!activeVid) return;

    /* si aún no hay datos suficientes, espera al primer frame */
    if (activeVid.readyState < 2) {              // HAVE_CURRENT_DATA
      activeVid.addEventListener(
        'loadeddata',
        () => activeVid.play().catch(() => {}),
        { once: true }
      );
    } else {
      activeVid.play().catch(() => {});
    }
  });

});




















/* ======================================================================
   ▶ Vídeos de pestañas (ESTUDIANTE / INGENIERO)
   - El de ingreso arranca al cargar.
   - El de egreso se reproduce la 1.ª vez que se muestra y se congela.
   ====================================================================== */
(function(){

  /** Reproduce el vídeo si aún no ha sido reproducido con éxito */
  function playWhenReady(video){
    if (!video || video.dataset.played === 'true') return;

    const start = () => {
      // fuerza políticas de autoplay
      video.muted = true;
      video.playsInline = true;
      video.currentTime = 0;

      video.play().then(()=>{
        video.dataset.played = 'true';          // ¡ahora sí marcamos!
      }).catch(err=>{
        console.warn('play bloqueado, se reintentará', err);
      });
    };

    // espera a que exista al menos 1 frame en buffer
    if (video.readyState >= 2){
      start();
    }else{
      video.addEventListener('loadeddata', start, { once:true });
      video.load();                             // fuerza buffer (Safari)
    }

    // congela en el último fotograma
    video.addEventListener('ended', ()=> video.pause(), { once:true });
  }

  /* --- pestaña inicial (ingreso) ------------------------------------- */
  playWhenReady(document.querySelector('#ingreso .perfil-video'));

  /* --- cambio de pestaña (Bootstrap 5) ------------------------------- */
  document.getElementById('perfilTabs').addEventListener('shown.bs.tab', ev=>{
    const pane  = document.querySelector(ev.target.dataset.bsTarget);
    const video = pane?.querySelector('.perfil-video');
    playWhenReady(video);
  });

})();