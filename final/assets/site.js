/* Especialista em Shopee — поведение страницы (исполнитель A). Без библиотек.
   Карусели · вкладки · таймер · окно видео · баннер cookies. */
(() => {
  'use strict';
  const d = document;
  const $$ = (s, c = d) => Array.from(c.querySelectorAll(s));
  const reduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* Ссылок ещё нет (кассы Hotmart, документы) — кнопки с href="#" никуда не уводят */
  d.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href="#"]');
    if (a) e.preventDefault();
  });

  /* ---------- Карусели: [data-carousel] > .carousel > .carousel__card ----------
     Внутри [data-carousel]: [data-carousel-counter] («1 / N»), [data-carousel-goto="i"], [data-carousel-dots] */
  $$('[data-carousel]').forEach(root => {
    const track = root.classList.contains('carousel') ? root : root.querySelector('.carousel');
    if (!track) return;
    const scope = track === root ? (root.parentElement || root) : root;
    const cards = $$('.carousel__card', track);
    const n = cards.length;
    if (!n) return;
    const counter = scope.querySelector('[data-carousel-counter]');
    const gotos = $$('[data-carousel-goto]', scope);
    const dotsBox = scope.querySelector('[data-carousel-dots]');
    const dots = [];
    let cur = -1;
    const set = i => {
      if (i === cur) return;
      cur = i;
      if (counter) counter.textContent = (i + 1) + ' / ' + n;
      gotos.forEach(b => {
        const on = Number(b.getAttribute('data-carousel-goto')) === i;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-current', on ? 'true' : 'false');
      });
      dots.forEach((b, k) => {
        b.classList.toggle('is-active', k === i);
        b.setAttribute('aria-current', k === i ? 'true' : 'false');
      });
    };
    const go = i => {
      i = Math.max(0, Math.min(n - 1, i));
      track.scrollTo({ left: cards[i].offsetLeft - cards[0].offsetLeft, behavior: reduce() ? 'auto' : 'smooth' });
      set(i);
    };
    if (dotsBox) {
      dotsBox.textContent = '';
      cards.forEach((c, i) => {
        const b = d.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', 'Карточка ' + (i + 1) + ' из ' + n);
        b.addEventListener('click', () => go(i));
        dotsBox.appendChild(b);
        dots.push(b);
      });
    }
    gotos.forEach(b => b.addEventListener('click', () => go(Number(b.getAttribute('data-carousel-goto')))));
    const step = () => (n > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : track.clientWidth) || 1;
    let raf = 0;
    track.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const max = track.scrollWidth - track.clientWidth;
        const i = track.scrollLeft >= max - 4 ? n - 1 : Math.round(track.scrollLeft / step());
        set(Math.max(0, Math.min(n - 1, i)));
      });
    }, { passive: true });
    set(0);
  });

  /* ---------- Вкладки: [data-tabs] → [data-tab-btn="k"] + [data-tab-panel="k"], активной — .is-active ---------- */
  $$('[data-tabs]').forEach(box => {
    const own = el => el.closest('[data-tabs]') === box;
    const btns = $$('[data-tab-btn]', box).filter(own);
    const panels = $$('[data-tab-panel]', box).filter(own);
    if (!btns.length) return;
    const show = key => {
      btns.forEach(b => {
        const on = b.getAttribute('data-tab-btn') === key;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.classList.toggle('is-active', on);
        if (b.getAttribute('role') === 'tab') b.tabIndex = on ? 0 : -1;
      });
      panels.forEach(p => p.classList.toggle('is-active', p.getAttribute('data-tab-panel') === key));
    };
    btns.forEach((b, i) => {
      b.addEventListener('click', () => show(b.getAttribute('data-tab-btn')));
      b.addEventListener('keydown', e => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length;
        btns[j].focus();
        show(btns[j].getAttribute('data-tab-btn'));
      });
    });
    const def = btns.find(b => b.getAttribute('aria-selected') === 'true') || btns[0];
    show(def.getAttribute('data-tab-btn'));
  });

  /* ---------- Таймер: [data-countdown="ISO-дата"] → [data-cd="d|h|m|s"]; одинаковый для всех ---------- */
  const timers = $$('[data-countdown]').map(el => ({
    el,
    end: Date.parse(el.getAttribute('data-countdown')),
    u: { d: el.querySelector('[data-cd="d"]'), h: el.querySelector('[data-cd="h"]'),
         m: el.querySelector('[data-cd="m"]'), s: el.querySelector('[data-cd="s"]') },
  })).filter(t => !isNaN(t.end));
  const pad = v => String(v).padStart(2, '0');
  const tick = () => {
    const now = Date.now();
    timers.forEach(t => {
      const left = Math.max(0, Math.floor((t.end - now) / 1000));
      const v = { d: Math.floor(left / 86400), h: Math.floor(left % 86400 / 3600), m: Math.floor(left % 3600 / 60), s: left % 60 };
      Object.keys(v).forEach(k => { if (t.u[k]) t.u[k].textContent = pad(v[k]); });
      t.el.classList.toggle('is-over', left === 0);
    });
  };
  if (timers.length) { tick(); setInterval(tick, 1000); }

  /* ---------- Окно видео: [data-video-open] → #video-modal ---------- */
  const modal = d.getElementById('video-modal');
  let opener = null;
  const closeModal = () => {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    d.documentElement.classList.remove('is-locked');
    if (opener && opener.focus) opener.focus();
  };
  const openModal = btn => {
    if (!modal) return;
    opener = btn;
    modal.hidden = false;
    d.documentElement.classList.add('is-locked');
    const x = modal.querySelector('[data-video-close]');
    if (x) x.focus();
  };
  d.addEventListener('click', e => {
    const t = e.target;
    const o = t.closest && t.closest('[data-video-open]');
    if (o) { e.preventDefault(); openModal(o); return; }
    if (modal && !modal.hidden && (t === modal || (t.closest && t.closest('[data-video-close]')))) closeModal();
  });
  d.addEventListener('keydown', e => {
    if (!modal || modal.hidden) return;
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key === 'Tab') {            /* фокус не уходит из окна */
      e.preventDefault();
      const x = modal.querySelector('[data-video-close]');
      if (x) x.focus();
    }
  });

  /* ---------- Cookies: выбор в localStorage; пиксель Meta — только после согласия (трекеров пока нет) ---------- */
  const KEY = 'es_cookies_v1';
  const readCk = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const saveCk = v => { try { localStorage.setItem(KEY, JSON.stringify({ v, at: new Date().toISOString() })); } catch (e) { /* приватный режим */ } };
  window.esConsent = () => { const r = readCk(); return !!r && r.v === 'all'; };
  const ck = d.getElementById('cookie');
  if (ck) {
    const setBox = ck.querySelector('.cookie__set');
    const cfg = ck.querySelector('[data-ck="config"]');
    const cfgLabel = cfg ? cfg.textContent : '';
    const openCfg = () => { if (setBox) setBox.hidden = false; if (cfg) cfg.textContent = 'Сохранить'; };
    const close = () => { ck.hidden = true; if (setBox) setBox.hidden = true; if (cfg) cfg.textContent = cfgLabel; };
    if (!readCk()) ck.hidden = false;
    ck.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-ck]');
      if (!b) return;
      const act = b.getAttribute('data-ck');
      if (act === 'accept') { saveCk('all'); close(); }
      else if (act === 'reject') { saveCk('necessary'); close(); }
      else if (setBox && setBox.hidden) openCfg();
      else { const ads = ck.querySelector('#ck-ads'); saveCk(ads && ads.checked ? 'all' : 'necessary'); close(); }
    });
    /* «Настройки cookies» в подвале: [data-cookie-open] или href="#cookies" */
    d.addEventListener('click', e => {
      const o = e.target.closest && e.target.closest('[data-cookie-open], a[href="#cookies"]');
      if (!o) return;
      e.preventDefault();
      const r = readCk();
      const ads = ck.querySelector('#ck-ads');
      if (ads) ads.checked = !!r && r.v === 'all';
      ck.hidden = false;
      openCfg();
    });
  }
})();
