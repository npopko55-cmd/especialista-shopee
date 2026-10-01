/* Especialista em Shopee — поведение страницы (исполнитель A). Без библиотек.
   Вариант блока 2 · карусели · вкладки · таймер · окно видео · закреплённая панель · баннер cookies. */
(() => {
  'use strict';
  const d = document;
  const html = d.documentElement;
  const $$ = (s, c = d) => Array.from(c.querySelectorAll(s));
  const reduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- Вариант блока 2 (раунд 5, Лиза): по умолчанию фото — <html data-b2="faces">; ?b2=a → диорамы ---------- */
  try {
    const v = new URLSearchParams(location.search).get('b2');
    html.setAttribute('data-b2', v === 'a' ? 'a' : 'faces');
  } catch (e) { html.setAttribute('data-b2', 'faces'); }

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
    /* Раунд 5: .arrows — кнопки ‹ › по краям ленты (создаём, если их нет в разметке) */
    const arrowsBox = track.closest('.arrows') || scope.querySelector('.arrows');
    if (arrowsBox && n > 1 && !arrowsBox.querySelector('[data-carousel-prev]')) {
      [['prev', 'Предыдущая карточка', 'M15 5l-7 7 7 7'], ['next', 'Следующая карточка', 'M9 5l7 7-7 7']].forEach(([k, lab, p]) => {
        const b = d.createElement('button');
        b.type = 'button';
        b.className = 'arrows__btn arrows__btn--' + k;
        b.setAttribute('data-carousel-' + k, '');
        b.setAttribute('aria-label', lab);
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + p + '"/></svg>';
        arrowsBox.appendChild(b);
      });
    }
    const prevB = (arrowsBox || scope).querySelector('[data-carousel-prev]');
    const nextB = (arrowsBox || scope).querySelector('[data-carousel-next]');
    const hints = $$('.hint', scope);
    let cur = -1;
    const step = () => (n > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : track.clientWidth) || 1;
    /* Раунд 9: на планшете/десктопе в кадре 2–3 карточки. perView — сколько карточек видно целиком
       (на телефоне всегда 1 → поведение прежнее); last — последняя «стартовая» карточка (на телефоне n − 1). */
    const perView = () => {
      if (n < 2) return 1;
      const cs = getComputedStyle(track);
      const inner = track.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const gap = parseFloat(cs.columnGap) || 0;
      return Math.max(1, Math.min(n, Math.floor((inner + gap) / step() + 0.05)));
    };
    const last = () => n - perView();
    const set = i => {
      if (i === cur) return;
      cur = i;
      if (prevB) prevB.classList.toggle('is-off', i <= 0);
      if (nextB) nextB.classList.toggle('is-off', i >= last());
      if (i > 0) hints.forEach(h => h.classList.add('is-seen'));   /* уже листали — подсказка замирает */
      cards.forEach((c, k) => c.classList.toggle('is-cur', k === i));   /* 4w: покачивается только телефон активной карточки */
      /* раунд 10: в кадре 2–3 карточки — счётчик диапазоном «1–3 / 8», последний шаг — «6–8 / 8» */
      if (counter) counter.textContent = (pv > 1 ? (i + 1) + '–' + Math.min(n, i + pv) : (i + 1)) + ' / ' + n;
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
      i = Math.max(0, Math.min(last(), i));
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
    if (prevB) prevB.addEventListener('click', () => go(cur - 1));
    if (nextB) nextB.addEventListener('click', () => go(cur + 1));
    let raf = 0;
    track.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const max = track.scrollWidth - track.clientWidth;
        const L = last();
        const i = track.scrollLeft >= max - 4 ? L : Math.round(track.scrollLeft / step());
        set(Math.max(0, Math.min(L, i)));
      });
    }, { passive: true });
    /* Раунд 9: лишние точки (карточка не может стать первой в кадре) прячем; при смене ширины — пересчёт */
    let pv = 0;
    const layout = () => {
      const k = perView();
      if (k === pv) return;
      pv = k;
      dots.forEach((b, j) => { b.hidden = j > last(); });
      const c = cur; cur = -1;
      set(Math.max(0, Math.min(last(), c < 0 ? 0 : c)));
    };
    layout();
    window.addEventListener('resize', layout, { passive: true });
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

  /* ---------- Таймер цены: личные сутки посетителя (раунд 10, Лёша 01.10) ----------
     Человек зашёл — на этом устройстве идут ровно 24 часа до конца самой низкой цены; сутки вышли — стартуют новые.
     Общее окно продаж заканчивается 04.10.2026 23:59:59 по Бразилиа (UTC−3 = 05.10 02:59:59 UTC):
     показываем min(личный дедлайн, конец окна), после конца окна — нули.
     Дедлайн (мс) лежит в localStorage под ключом es_price_until; запасные места — sessionStorage, затем память страницы
     (доступ к хранилищу может бросить исключение: приватный режим, запрет cookies, iframe). Читаем на каждом тике:
     другая вкладка продлила срок или ключ поменяли — подхватим.
     Дедлайн один на все [data-price-timer] страницы (плашка над тарифами и блок 10); плитки [data-cd="h|m|s"],
     часы считаются от нуля и доходят до 24 (плитки «дней» нет). Стартовый HTML без JS уже показывает 24:00:00. */
  const PRICE_KEY = 'es_price_until';
  const PRICE_DAY = 24 * 3600 * 1000;
  const SALE_END = Date.parse('2026-10-05T02:59:59Z');
  let priceMem = 0;
  /* Читаем из первого хранилища, где ключ есть (localStorage → sessionStorage); нигде нет или оба закрыты — из памяти страницы */
  const priceRead = () => {
    for (const n of ['localStorage', 'sessionStorage']) {
      try {
        const raw = window[n].getItem(PRICE_KEY);
        if (raw !== null) { const x = Number(raw); return isFinite(x) ? x : 0; }
      } catch (e) { /* хранилища нет — пробуем следующее */ }
    }
    return priceMem;
  };
  /* Пишем в первое хранилище, которое приняло запись; память страницы — всегда */
  const priceWrite = v => {
    priceMem = v;
    ['localStorage', 'sessionStorage'].some(n => { try { window[n].setItem(PRICE_KEY, String(v)); return true; } catch (e) { return false; } });
  };
  /* Нет дедлайна, он вышел или «из будущего» (двигали часы) → новые 24 часа с этого момента */
  const priceUntil = now => {
    let v = priceRead();
    if (!(v > now) || v > now + PRICE_DAY) { v = now + PRICE_DAY; priceWrite(v); }
    return v;
  };
  const priceTimers = $$('[data-price-timer]').map(el => ({
    el, h: el.querySelector('[data-cd="h"]'), m: el.querySelector('[data-cd="m"]'), s: el.querySelector('[data-cd="s"]'),
  }));
  const pad = v => String(v).padStart(2, '0');
  let priceT = 0;
  const priceTick = () => {
    clearTimeout(priceT);
    const now = Date.now();
    const ms = now < SALE_END ? Math.min(priceUntil(now), SALE_END) - now : 0;
    const left = Math.max(0, Math.ceil(ms / 1000));
    const v = { h: Math.floor(left / 3600), m: Math.floor(left % 3600 / 60), s: left % 60 };
    priceTimers.forEach(t => {
      ['h', 'm', 's'].forEach(k => { if (t[k]) t[k].textContent = pad(v[k]); });
      t.el.classList.toggle('is-over', left === 0);
    });
    /* следующий тик — когда сменится секунда (без setInterval: цифры не пропускают значения) */
    if (left > 0) priceT = setTimeout(priceTick, (ms - 1) % 1000 + 1 + 15);
  };
  if (priceTimers.length) {
    priceTick();
    d.addEventListener('visibilitychange', () => { if (!d.hidden) priceTick(); });
    window.addEventListener('pageshow', priceTick);
  }

  /* ---------- Закреплённая панель #sticky-cta: full ↔ compact ----------
     compact (только круглая WhatsApp) — если в кадре хоть краем любая кнопка блока (.cta .btn, [data-cta]),
     открыт баннер cookies, открыто окно видео или на экране тарифы (#tariffs ≥ половины экрана). */
  const bar = d.getElementById('sticky-cta');
  const st = { cta: new Set(), cookie: false, modal: false, tariffs: false };
  let onBar = () => { /* раунд 6: блик кнопки подписывается ниже */ };
  const applyBar = () => {
    if (!bar) return;
    const compact = st.cta.size > 0 || st.cookie || st.modal || st.tariffs;
    bar.classList.toggle('is-compact', compact);
    bar.setAttribute('data-state', compact ? 'compact' : 'full');
    onBar();
  };
  if (bar && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        if (e.isIntersecting && e.intersectionRatio > 0) st.cta.add(e.target);
        else st.cta.delete(e.target);
      });
      applyBar();
    }, { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] });
    $$('.cta .btn, [data-cta]').filter(el => !bar.contains(el)).forEach(el => io.observe(el));
    const tar = d.getElementById('tariffs');
    if (tar) {
      const th = [];
      for (let i = 0; i <= 40; i++) th.push(i / 40);
      new IntersectionObserver(es => {
        es.forEach(e => {
          const vh = (e.rootBounds && e.rootBounds.height) || window.innerHeight;
          st.tariffs = e.isIntersecting && e.intersectionRect.height >= vh * 0.5;
        });
        applyBar();
      }, { threshold: th }).observe(tar);
    }
  }
  applyBar();
  /* На самом верху страницы круглая WhatsApp закрывала бы третий пункт под кнопкой первого экрана — появляется после небольшой прокрутки */
  if (bar) {
    const topBar = () => bar.classList.toggle('is-top', (window.scrollY || d.documentElement.scrollTop || 0) < 48);
    topBar(); window.addEventListener('scroll', topBar, { passive: true });
  }

  /* ---------- План Б: плашка «Напиши мне в WhatsApp» (#pb-wa) ----------
     Показываем тем, кто пришёл через форму сбора данных (cadastro.html добавляет ?lead=1); запоминаем на сессию.
     ?planb=1 — то же вручную, для просмотра. Для плана А (без формы) плашки нет. */
  (function () {
    const el = d.getElementById('pb-wa');
    if (!el) return;
    let on = false;
    try { const q = new URLSearchParams(location.search); on = q.get('lead') === '1' || q.get('planb') === '1'; } catch (e) { /* старый браузер */ }
    if (/^oferta\./i.test(location.hostname)) on = true;   /* поддомен оферты плана Б */
    try { if (on) sessionStorage.setItem('em_planb', '1'); else on = sessionStorage.getItem('em_planb') === '1'; } catch (e) { /* приватный режим */ }
    if (on) el.hidden = false;
  })();

  /* ---------- Окно видео: [data-video-open] → #video-modal ---------- */
  const modal = d.getElementById('video-modal');
  let opener = null;
  const vid = modal ? modal.querySelector('video') : null;
  const closeModal = byKey => {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    if (vid) { try { vid.pause(); } catch (e) { /* нет плеера */ } }
    html.classList.remove('is-locked');
    st.modal = false; applyBar();
    if (byKey && opener && opener.focus) opener.focus({ preventScroll: true });   /* мышью закрыли — рамку фокуса не рисуем */
  };
  const openModal = btn => {
    if (!modal) return;
    opener = btn;
    modal.hidden = false;
    html.classList.add('is-locked');
    st.modal = true; applyBar();
    if (vid) {
      if (!vid.getAttribute('poster') && vid.dataset.poster) vid.poster = vid.dataset.poster;   /* постер — тоже только при открытии */
      if (!vid.getAttribute('src') && vid.dataset.src) vid.src = vid.dataset.src;   /* 91 МБ грузим только по нажатию */
      const pr = vid.play(); if (pr && pr.catch) pr.catch(() => { /* iOS: пользователь нажмёт play сам */ });
    }
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
    if (e.key === 'Escape') { closeModal(true); return; }
    if (e.key === 'Tab') {            /* фокус не уходит из окна */
      e.preventDefault();
      const x = modal.querySelector('[data-video-close]');
      const order = vid ? [vid, x] : [x];
      const i = order.indexOf(d.activeElement);
      const nxt = order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length];
      if (nxt) nxt.focus();
    }
  });

  /* ---------- Cookies: нижний лист; выбор в localStorage; пиксель Meta — только после согласия ----------
     При первом заходе лист появляется после первой прокрутки (или через 10 с), чтобы не закрывать
     первый экран: Эрика, оффер и кнопка видны сразу. Пока лист открыт — панель compact. */
  const KEY = 'es_cookies_v1';
  const readCk = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const saveCk = v => { try { localStorage.setItem(KEY, JSON.stringify({ v, at: new Date().toISOString() })); } catch (e) { /* приватный режим */ } };
  window.esConsent = () => { const r = readCk(); return !!r && r.v === 'all'; };
  const ck = d.getElementById('cookie');
  if (ck) {
    const setBox = ck.querySelector('.cookie__set');
    const cfg = ck.querySelector('[data-ck="config"]');
    const cfgLabel = cfg ? cfg.textContent : '';
    const show = () => { ck.hidden = false; st.cookie = true; applyBar(); };
    const openCfg = () => { if (setBox) setBox.hidden = false; if (cfg) cfg.textContent = 'Сохранить'; };
    const close = () => {
      ck.hidden = true; if (setBox) setBox.hidden = true; if (cfg) cfg.textContent = cfgLabel;
      st.cookie = false; applyBar();
    };
    if (!readCk()) {
      let done = false;
      const first = () => {
        if (done || readCk()) return;
        done = true;
        window.removeEventListener('scroll', onScroll);
        show();
      };
      const onScroll = () => { if (window.scrollY > 80) first(); };
      window.addEventListener('scroll', onScroll, { passive: true });
      setTimeout(first, 10000);
    }
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
      show();
      openCfg();
    });
  }

  /* ---------- Раунд 5: .reveal — появление один раз при первом попадании в кадр ----------
     Класс html.js-rv ставит скрипт в <head> (чтобы не было вспышки). Нет IO / reduce → всё видно сразу. */
  const rv = $$('.reveal');
  if (!('IntersectionObserver' in window) || reduce()) {
    html.classList.remove('js-rv');
  } else if (rv.length) {
    html.classList.add('js-rv');
    const rio = new IntersectionObserver(es => {
      const ins = es.filter(e => e.isIntersecting).map(e => e.target);
      const pos = el => { const r = el.getBoundingClientRect(); return r.top * 4 + r.left; };
      ins.sort((a, b) => pos(a) - pos(b));
      ins.forEach((el, k) => {
        if (!el.style.getPropertyValue('--rd')) el.style.setProperty('--rd', Math.min(k, 6) * 90 + 'ms');
        el.classList.add('is-in');
        rio.unobserve(el);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
    rv.forEach(el => rio.observe(el));
  }

  /* ---------- Раунд 5: .wa-pop — пузырь «Есть вопрос? Напиши нам в WhatsApp» ----------
     Через 15 с после загрузки, потом каждые 60 с, не более 3 раз за сессию; держится 9 с.
     Только когда панель в полном виде: не открыто видео, нет листа cookies, нет кнопки блока в кадре, не тарифы.
     Крестик — больше не показываем в этой сессии (sessionStorage в try/catch). */
  const pop = d.getElementById('wa-pop');
  if (pop && bar) {
    const SK = 'es_wapop_v1';
    let ss = {};
    try { ss = JSON.parse(sessionStorage.getItem(SK) || '{}') || {}; } catch (e) { ss = {}; }
    ss.n = ss.n || 0;
    const save = () => { try { sessionStorage.setItem(SK, JSON.stringify(ss)); } catch (e) { /* приватный режим */ } };
    const free = () => !st.modal && !st.cookie && st.cta.size === 0 && !st.tariffs && !d.hidden && !html.classList.contains('emc-late');
    let nextAt = Date.now() + 15000, hideAt = 0, on = false, timer = 0;
    const hidePop = () => { on = false; pop.classList.remove('is-on'); };
    const showPop = () => {
      on = true; pop.classList.add('is-on');
      ss.n += 1; save();
      hideAt = Date.now() + 9000; nextAt = Date.now() + 60000;
    };
    const loop = () => {
      if (on) { if (Date.now() >= hideAt || !free() || ss.off) hidePop(); return; }
      if (ss.off || ss.n >= 3) { clearInterval(timer); return; }
      if (Date.now() >= nextAt && free()) showPop();
    };
    if (!ss.off && ss.n < 3) timer = setInterval(loop, 500);
    const x = pop.querySelector('[data-wa-pop-x]');
    if (x) x.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); ss.off = true; save(); hidePop(); });
    const link = pop.querySelector('a');
    if (link) link.addEventListener('click', () => hidePop());
  }

  /* ---------- Раунд 6: блик на главной кнопке — .is-shine ОДНОЙ кнопке за раз ----------
     Кандидаты: оранжевые .btn (не .btn--wa) и любые .shine вне панели. Блестит та, что в кадре (≥ 60 % видно
     или ≥ 40 % высоты окна); текущая держится, пока видна. Нет ни одной в кадре — кнопка панели, если панель полная. */
  const shineEls = $$('.btn:not(.btn--wa), .shine').filter(el => !(bar && bar.contains(el)));
  const barBtn = bar ? bar.querySelector('.btn') : null;
  const seen = new Map();
  let shineCur = null;
  const okShine = el => { const v = seen.get(el); return !!v && (v.r >= 0.6 || v.h >= window.innerHeight * 0.4); };
  const pickShine = () => {
    let best = null;
    if (!reduce()) {
      if (shineCur && shineCur !== barBtn && okShine(shineCur)) best = shineCur;
      else shineEls.forEach(el => { if (okShine(el) && (!best || seen.get(el).r > seen.get(best).r + 0.01)) best = el; });
      if (!best && barBtn && bar.getAttribute('data-state') === 'full') best = barBtn;
    }
    if (best === shineCur) return;
    if (shineCur) shineCur.classList.remove('is-shine');
    shineCur = best;
    if (best) best.classList.add('is-shine');
  };
  if ('IntersectionObserver' in window && shineEls.length) {
    const sio = new IntersectionObserver(es => {
      es.forEach(e => seen.set(e.target, { r: e.isIntersecting ? e.intersectionRatio : 0, h: e.isIntersecting ? e.intersectionRect.height : 0 }));
      pickShine();
    }, { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] });
    shineEls.forEach(el => sio.observe(el));
    onBar = pickShine;
    pickShine();
  }

  /* ---------- Раунд 6: счётчик [data-count] (блок 4) — число «набегает» с нуля за 1,2 с, один раз ----------
     В HTML — итоговый текст дословно (7&nbsp;000+ и т. п.); по окончании возвращается ровно он. Без JS / reduce — сразу итог. */
  const cnt = $$('[data-count]');
  if (cnt.length && 'IntersectionObserver' in window && !reduce()) {
    const fmt = (v, sep) => (sep ? String(v).replace(/\B(?=(\d{3})+(?!\d))/g, sep) : String(v));
    const cio = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting || e.intersectionRatio < 0.5) return;
      const el = e.target, p = el.__cnt;
      cio.unobserve(el);
      if (!p) return;
      const t0 = performance.now(), D = 1200;
      const step = now => {
        const k = Math.min(1, (now - t0) / D);
        el.textContent = k < 1 ? p.pre + fmt(Math.round(p.n * (1 - Math.pow(1 - k, 3))), p.sep) + p.post : p.full;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }), { threshold: [0, 0.5, 1] });
    cnt.forEach(el => {
      const full = el.textContent;
      const m = full.match(/\d[\d\u00a0\u202f ]*\d|\d/);
      if (!m) return;
      const sp = m[0].match(/[\u00a0\u202f ]/);
      el.__cnt = { full, pre: full.slice(0, m.index), post: full.slice(m.index + m[0].length), n: parseInt(m[0].replace(/\D/g, ''), 10), sep: sp ? sp[0] : '' };
      el.textContent = el.__cnt.pre + '0' + el.__cnt.post;
      cio.observe(el);
    });
  }

  /* ---------- Раунд 6: «выглядывание» каруселей блоков 2, 4w, 6 ----------
     Один раз, когда лента впервые попала в кадр: карточки мягко сдвигаются на 48 px влево и возвращаются (WAAPI, 1,3 с),
     показывая, что лента листается. Не срабатывает, если ленту уже трогали/листали или включён reduce-motion. */
  if ('IntersectionObserver' in window && !reduce() && Element.prototype.animate) {
    const pio = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      const track = e.target;
      pio.unobserve(track);
      setTimeout(() => {
        if (track.__touched || track.scrollLeft > 4 || reduce()) return;
        if (track.scrollWidth - track.clientWidth < 48) return;   /* раунд 9: все карточки уже в кадре (десктоп) — листать нечего */
        $$('.carousel__card', track).forEach(c => c.animate(
          [{ transform: 'translate3d(0, 0, 0)' }, { transform: 'translate3d(-48px, 0, 0)', offset: 0.45 }, { transform: 'translate3d(0, 0, 0)' }],
          { duration: 1300, easing: 'ease-in-out' }));
      }, 1100);
    }), { threshold: 0.6 });
    $$('#b2 [data-carousel] .carousel, #b4w [data-carousel] .carousel, #b6 [data-carousel] .carousel').forEach(track => {
      const mark = () => { track.__touched = true; };
      ['pointerdown', 'touchstart', 'wheel', 'scroll'].forEach(ev => track.addEventListener(ev, mark, { passive: true }));
      pio.observe(track);
    });
  }

  /* ---------- Меню в правом верхнем углу (#topnav): открыть/закрыть, переход по якорям ---------- */
  (function () {
    const box = d.getElementById('topnav'), btn = d.getElementById('topnav-btn'), panel = d.getElementById('topnav-panel');
    if (!box || !btn || !panel) return;
    let y0 = 0;
    const set = (open) => {
      if (open) y0 = window.scrollY || 0;
      panel.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false'); box.classList.toggle('is-open', open);
    };
    btn.addEventListener('click', () => set(panel.hidden));
    panel.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a')) set(false); });
    d.addEventListener('click', (e) => { if (!panel.hidden && !box.contains(e.target)) set(false); });
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { set(false); btn.focus(); } });
    /* лента листается пальцем — меню закрываем, чтобы не висело поверх блока */
    window.addEventListener('scroll', () => { if (!panel.hidden && Math.abs((window.scrollY || 0) - y0) > 160) set(false); }, { passive: true });
  })();
})();
