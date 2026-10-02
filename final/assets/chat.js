/* Веб-чат менеджера Эрики (план Б, 01.10). Чистый JS без библиотек.
   Контракт API v1 — «Курс Эрики/Веб-чат — контракт API.md» (эндпоинты /api/chat/*).
   Грузится только инлайн-загрузчиком parts/tail.html; сам тоже проверяет хост: isChatHost() (ericamarques.com, www., oferta.; превью github.io/localhost —
   только с ?chat=1|mock или window.__EMC_PREVIEW = true от загрузчика; для тестов ?chathost=1). Не хост чата — скрипт ничего не делает.
   Адрес API: <meta name="em-chat-api"> (по умолчанию /api/chat); для тестов ?chatapi=http://localhost:PORT/api/chat
   (только localhost/127.0.0.1 — чтобы ссылкой нельзя было увести переписку и контакты на чужой сервер).
   Чат недоступен (session 502/503, chat_disabled, 403, 404, нет сети) — «запасной режим»: все ссылки на WhatsApp (кроме подвала #b12) становятся
   mailto:suporte@ericamarques.com, иконка — конверт, тексты «в WhatsApp/в чате» → «на почту», пузыри не показываются. WhatsApp на сайте больше не используется.
   html.emc-pre (ставит head до первого кадра, прячет #sticky-cta-wa, #wa-pop, #pb-wa) снимается, как только решение принято и chat.css применён.
   Кнопка чата, пузырь-приглашение и .wa-pop скрыты до блока тарифов (html.emc-late, sessionStorage em_chat_late). Класс ставится при старте этого скрипта;
   чтобы не было ни одного кадра с кнопкой ДО его загрузки, можно продублировать в <head> (только на хостах чата), с запасным снятием, если chat.js не загрузится:
   if (sessionStorage.em_chat_late !== '1') { html.classList.add('emc-late'); style 'html.emc-late .sticky-cta__wa,html.emc-late .wa-pop{opacity:0!important;visibility:hidden!important;transition:none!important}';
   setTimeout(function () { if (!window.__emChat) html.classList.remove('emc-late'); }, 4000); } */
(function () {
  'use strict';
  if (window.__emChat) return;
  window.__emChat = 1;

  /* ---------- Хост чата ---------- */
  function isChatHost() {
    var h = String(location.hostname || '').toLowerCase(), qs = location.search || '';
    if (/[?&]chathost=1(&|$)/.test(qs)) return true;                                   // только для тестов: имитация боевого хоста
    if (/^(www\.|oferta\.)?ericamarques\.com$/.test(h)) return true;                    // боевые хосты (b.ericamarques.com — форма, чата там нет)
    if (/\.github\.io$/.test(h) || h === 'localhost' || h === '127.0.0.1') {            // превью: только по явному признаку
      return window.__EMC_PREVIEW === true || /[?&]chat=(1|mock)(&|$)/.test(qs);
    }
    return false;
  }
  if (!isChatHost()) {   // страница не чата: ничего не трогаем (и не оставляем спрятанные head'ом кнопки)
    try { document.documentElement.classList.remove('emc-pre'); } catch (e) { /* нет документа */ }
    return;
  }

  /* ---------- Настройки ---------- */
  // Форма контакта «Seu contato» (событие contact_form → форма → /api/lead и /api/chat/contact). С 01.10 выключена по просьбе Лёши:
  // событие молча пропускается (ни текста, ни формы). Вернуть форму — поставить true (код формы ниже сохранён).
  var CONTACT_FORM = false;
  // «Человеческая» пауза перед репликами бота (from: bot, type: text|buttons|cta). Для автотестов — ?chatfast=1 (все паузы = 0).
  // Первый пузырь ответа: «печатает…» не меньше min(HUMAN_MIN_MS + HUMAN_PER_CHAR_MS × длина_текста, HUMAN_MAX_MS) ± HUMAN_JITTER_MS,
  // отсчёт — от момента отправки сообщения человеком (если ответ пришёл позже — показываем сразу), и не меньше delay_ms события.
  // Следующие пузыри того же ответа: HUMAN_NEXT_MIN_MS … HUMAN_NEXT_MIN_MS + HUMAN_NEXT_RND_MS, а на длинных — по HUMAN_PER_CHAR_MS на символ, потолок HUMAN_NEXT_MAX_MS.
  var HUMAN_MIN_MS = 1800, HUMAN_PER_CHAR_MS = 55, HUMAN_MAX_MS = 7000, HUMAN_JITTER_MS = 400;
  var HUMAN_NEXT_MIN_MS = 1200, HUMAN_NEXT_RND_MS = 1000, HUMAN_NEXT_MAX_MS = 4500;
  // Круглая кнопка чата и пузырь-приглашение появляются только когда человек долистал до тарифов (#tariffs): html.emc-late прячет их.
  // Пузырь-приглашение (приветствие / непрочитанное) — через PEEK_AFTER_MS после появления кнопки.
  var LATE_TARGET = 'tariffs', PEEK_AFTER_MS = 2500;

  /* ---------- Тексты интерфейса (pt-BR). Для русского — добавить T.ru и выбрать по lang ---------- */
  var T = { pt: {
    open: 'Abrir chat com a assistente da Erika', close: 'Fechar chat', name: 'Assistente da Erika', online: 'online',
    erika: 'Assistente', team: 'Equipe', you: 'Você', log: 'Conversa com a assistente da Erika',
    ph: 'Escreva sua mensagem…', phWait: 'Aguarde a resposta…', send: 'Enviar mensagem',
    connecting: 'Conectando…', offline: 'Sem conexão. Tentando de novo…',
    busy: 'Espere a resposta da mensagem anterior.', tooLong: 'Mensagem longa demais: até {n} caracteres.',
    rate: 'Calma, muitas mensagens. Tente de novo em {n} s.', restarted: 'A conversa foi reiniciada.',
    unavail: 'O chat está indisponível agora. Escreva para a gente por e-mail.', mailBtn: 'Escrever por e-mail',
    err: 'Não foi possível enviar. Tente de novo.', handoff: 'Passei para a equipe, já já respondem aqui',
    typing: 'Erika está digitando…', unread: 'mensagens novas', peekClose: 'Fechar aviso',
    fName: 'Nome', fWa: 'WhatsApp', fEmail: 'E-mail', fConsent: 'Aceito receber mensagens no WhatsApp e concordo com a ',
    policy: 'Política de Privacidade', submit: 'Enviar', sending: 'Enviando…', thanks: 'Obrigada!',
    required: 'Preencha este campo', too_short: 'Muito curto', too_long: 'Muito longo', invalid: 'Confira, por favor',
    consentErr: 'Marque a caixa para continuar', sendErr: 'Não deu para enviar. Tente de novo.',
    instr: 'Ver instruções de acesso'
  } };
  var L = T.pt;   // L — тексты самого окна чата (всегда pt-BR)

  /* ---------- Тексты страницы: подмена слов про WhatsApp на чат / почту. Язык страницы: window.EM_LANG === 'pt' (index-pt.html) или русский ----------
     PL — язык страницы, X = TX[PL]. В PT-версии HTML уже про чат — подмены в режиме чата нет (text: null), меняется только запасной режим (почта). */
  var PL = window.EM_LANG === 'pt' ? 'pt' : 'ru';
  var TX = {
    ru: {
      pre: /WhatsApp/,   // быстрый отсев текстовых узлов, где есть что менять
      chat: { pop: 'Есть вопрос? Напиши <b>ассистенту</b>', plaque: 'Есть вопросы? Задай их ассистенту Эрики в&nbsp;чате', btn: 'Открыть чат',
        words: [[/Задать вопрос в WhatsApp/g, 'Задать вопрос в чате'], [/напиши нам в WhatsApp/g, 'напиши нам в чат'], [/Напиши в WhatsApp/g, 'Напиши в чат'], [/ответит в WhatsApp/g, 'ответит в чате']] },
      mail: { aria: 'Написать на почту', pop: 'Есть вопрос? Напиши нам на&nbsp;<b>почту</b>', plaque: 'Есть вопросы? Напиши нам на&nbsp;почту', btn: 'Написать на почту',
        words: [[/Ассистент Эрики ответит в WhatsApp/g, 'Ответим на почте'], [/Задать вопрос в WhatsApp/g, 'Написать на почту'], [/напиши нам в WhatsApp/g, 'напиши нам на почту'], [/Напиши в WhatsApp/g, 'Напиши на почту']] }
    },
    pt: {
      pre: /chat|assistente/,
      chat: { pop: null, plaque: null, btn: null, words: [], aria: 'Abrir o chat' },
      mail: { aria: 'Escrever por e-mail', pop: 'Dúvidas? Escreva pra gente por e-mail', plaque: 'Dúvidas? Escreva pra gente por e-mail', btn: 'Escrever por e-mail',
        words: [[/Não sabe qual plano escolher\? Pergunte aqui no chat — a assistente da Erika te ajuda\./g, 'Não sabe qual plano escolher? Escreva por e-mail — a gente te ajuda.'],
          [/Pergunte no chat — a assistente da Erika responde por aqui\./g, 'Escreva por e-mail — a gente responde.'],
          [/A assistente da Erika responde suas dúvidas e te ajuda a escolher o plano\./g, 'Respondemos por e-mail e te ajudamos a escolher o plano.'],
          [/A assistente da Erika responde por aqui/g, 'Respondemos por e-mail'],
          [/Falar com a assistente no chat/g, 'Escrever por e-mail'], [/Pedir ajuda no chat/g, 'Escrever por e-mail']] }
    }
  };
  var X = TX[PL];
  if (X.chat.aria) L.open = X.chat.aria;   // aria-label круглой кнопки в PT: «Abrir o chat»

  var d = document, html = d.documentElement, t0 = Date.now();
  var q = new URLSearchParams(location.search);
  var mq = window.matchMedia ? matchMedia('(max-width: 767px)') : { matches: false };
  var PAY = ['btn-pay-start', 'btn-pay-specialist', 'btn-pay-vip'];
  var MARKS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
  var CONSENT_VERSION = 'pt-2026-10-01';
  var MAIL = 'suporte@ericamarques.com', MAIL_HREF = 'mailto:' + MAIL + '?subject=Duvida%20sobre%20o%20curso';
  var START_TRIES = 3;   // сессия не стартует (502/503/нет сети) столько раз подряд (≈ 3 с) — запасной режим

  function meta(n) { var m = d.querySelector('meta[name="' + n + '"]'); return m ? (m.getAttribute('content') || '').trim() : ''; }
  var API = meta('em-chat-api') || '/api/chat';
  var qa = q.get('chatapi');
  if (qa && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(qa)) API = qa;
  API = API.replace(/\/+$/, '');
  var LEAD = API.replace(/\/chat$/, '') + '/lead';

  function store(kind, k, v) {
    try {
      var s = window[kind];
      if (v === undefined) return s.getItem(k);
      if (v === null) s.removeItem(k); else s.setItem(k, v);
    } catch (e) { /* приватный режим */ }
    return null;
  }
  function fmt(s, n) { return s.replace('{n}', n); }
  var FAST = q.get('chatfast') === '1';   // автотесты: человеческих пауз нет

  /* ---------- Кнопка чата прячется до тарифов: html.emc-late ставим сразу при старте скрипта, до первого кадра ---------- */
  var lateOn = store('sessionStorage', 'em_chat_late') !== '1';
  if (lateOn) {
    html.classList.add('emc-late');
    try {   // страховка от мигания: то же правило есть в chat.css, но стили могут догрузиться позже скрипта
      var cs0 = d.createElement('style');
      cs0.textContent = 'html.emc-late .sticky-cta__wa,html.emc-late .wa-pop,html.emc-late .emc-peek{opacity:0!important;visibility:hidden!important;pointer-events:none!important;transition:none!important}';
      d.head.appendChild(cs0);
    } catch (e) { /* нет head */ }
  }
  var shownAt = 0, shownCbs = [], ringT = 0;
  function isLate() { return html.classList.contains('emc-late'); }
  function afterShown(fn) { if (isLate()) shownCbs.push(fn); else fn(); }
  function ringOnce() {   // кольцо-пульс вокруг кнопки: 2 цикла по 2 с, потом статично (CSS: html.emc-ring)
    html.classList.add('emc-ring');
    clearTimeout(ringT);
    ringT = setTimeout(function () { html.classList.remove('emc-ring'); }, 4200);
  }
  function lateShow() {
    if (!isLate()) return;
    html.classList.remove('emc-late');
    shownAt = Date.now();
    store('sessionStorage', 'em_chat_late', '1');
    ringOnce();
    var cbs = shownCbs; shownCbs = [];
    cbs.forEach(function (f) { f(); });
    greetPlan();
  }
  // Кнопка появляется, когда верхняя граница #tariffs вошла в окно (с запасом 12 % снизу) или секция уже выше экрана (пролистали / якорь)
  function watchTarget() {
    if (!lateOn) { ringOnce(); return; }
    var tg = d.getElementById(LATE_TARGET);
    if (!tg || !('IntersectionObserver' in window)) { lateShow(); return; }   // нет блока тарифов / старый браузер — как раньше
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting || e.boundingClientRect.top < 0) { io.disconnect(); lateShow(); }
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    io.observe(tg);
  }
  // последнее прочитанное событие (чат был открыт): по нему при заходе понимаем, что есть непрочитанный ответ Эрики
  function seenGet() {
    var v = store('localStorage', 'em_chat_seen');
    if (!v || !S.sid) return 0;
    var i = v.lastIndexOf(':');
    return v.slice(0, i) === S.sid ? (+v.slice(i + 1) || 0) : 0;
  }
  function markSeen(id) {
    if (!S.sid || !(id > 0) || id <= seenGet()) return;
    store('localStorage', 'em_chat_seen', S.sid + ':' + id);
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function el(tag, cls, text) {
    var e = d.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function utm() { var o = {}; MARKS.forEach(function (k) { o[k] = q.get(k) || ''; }); return o; }

  // Антибот (Turnstile) решает Никита: пока токена нет — null. Сюда подключить получение токена.
  function getTurnstileToken() { return null; }

  // Короткая метка для оплаты: первые 16 hex uuid-части session_id (v1.<uuid>.<hmac>) без дефисов.
  // ПОДТВЕРДИТЬ У БЭКЕНДА: должна совпадать с sid, который бэкенд кладёт в sck=web-<sid> в cta.url.
  function webSid(id) {
    var p = String(id || '').split('.');
    if (p.length < 3) return '';
    var h = p[1].replace(/-/g, '').toLowerCase();
    return /^[0-9a-f]{16}/.test(h) ? h.slice(0, 16) : '';
  }

  /* ---------- Состояние ---------- */
  var S = {
    sid: null, ok: false, off: false, net: 0, bo: 0, gen: 0, polling: false,
    lastId: 0, seen: {}, handoff: false, busy: false, busyT: 0, sending: false, rateUntil: 0,
    open: false, unread: 0, greeting: null, greetDelay: 4000, gt: 0, greeted: false, greetEl: null, greetId: null, echoes: [],
    wrote: false, hasHistory: false, pend: null, lastFrom: '', opener: null, starting: null,
    fails: 0, rep: 0, sentAt: 0, lastReply: 0   // rep — сколько пузырей бота уже показано в текущем ответе; sentAt — когда человек отправил сообщение
  };

  /* ---------- Круглая кнопка (бывшая WhatsApp панели) ---------- */
  var btn = d.getElementById('sticky-cta-wa');
  if (!btn) {
    btn = el('a', 'sticky-cta__wa emc-solo');
    btn.href = MAIL_HREF; btn.id = 'emc-fab';
    d.body.appendChild(btn);
  }
  // Все ссылки на WhatsApp (кроме подвала #b12 и самого окна) сразу становятся mailto: даже Ctrl/Cmd-клик не уведёт в WhatsApp.
  // Обычный клик (пока чат работает) открывает окно чата — их ловит делегат ниже по метке data-emc-link.
  Array.prototype.forEach.call(d.querySelectorAll('a[href*="wa.me"]'), function (a) {
    if (a.closest('#b12, #emc')) return;
    a.setAttribute('href', MAIL_HREF); a.removeAttribute('target'); a.removeAttribute('rel'); a.setAttribute('data-emc-link', '1');
  });
  btn.setAttribute('data-emc-link', '1'); btn.removeAttribute('target'); btn.removeAttribute('rel');
  var btnLabel = btn.getAttribute('aria-label') || '';
  var dot = el('span', 'emc-dot'), badge = el('span', 'emc-badge');
  dot.setAttribute('aria-hidden', 'true'); badge.setAttribute('aria-hidden', 'true'); badge.hidden = true;
  // Признак «это чат»: пузырь с тремя точками в левом нижнем углу круга (SVG, синий #2B6F9E, белые точки)
  var chatIc = el('span', 'emc-chat');
  chatIc.setAttribute('aria-hidden', 'true');
  chatIc.innerHTML = '<svg viewBox="0 0 28 28" focusable="false" aria-hidden="true">' +
    '<path d="M9 3h10a6 6 0 0 1 6 6v5a6 6 0 0 1-6 6h-6L8 25.5V20h1a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6z" fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>' +
    '<path d="M9 3h10a6 6 0 0 1 6 6v5a6 6 0 0 1-6 6h-6L8 25.5V20h1a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6z" fill="#2B6F9E"/>' +
    '<circle cx="9.5" cy="11.5" r="1.8" fill="#fff"/><circle cx="14" cy="11.5" r="1.8" fill="#fff"/><circle cx="18.5" cy="11.5" r="1.8" fill="#fff"/></svg>';
  btn.appendChild(chatIc); btn.appendChild(dot); btn.appendChild(badge);

  /* ---------- Подмена текстов на странице (в HTML ничего не меняем; при отказе чата — возвращаем) ---------- */
  var swaps = [];
  function swap(id, htmlText) {
    var e = d.getElementById(id);
    if (e) { swaps.push([e, e.innerHTML]); e.innerHTML = htmlText; }
  }
  // Чат вместо WhatsApp: тексты про WhatsApp на странице (кроме футера Лёши #b12 и поля «WhatsApp» кассы) говорят про чат,
  // зелёные WhatsApp-кнопки получают иконку чата. Запасной режим (чат недоступен) — «на почту» / «por e-mail» и иконка-конверт.
  // Списки слов (TX) нужны, пока в HTML исходно стоит «WhatsApp» (RU). При отказе чата сначала всё возвращается как было, потом ставится почта.
  var wordSwaps = [], iconSwaps = [];
  function symbols() {
    if (d.getElementById('emc-ic')) return;
    var sp = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sp.setAttribute('width', '0'); sp.setAttribute('height', '0'); sp.setAttribute('aria-hidden', 'true'); sp.style.position = 'absolute';
    sp.innerHTML = '<symbol id="emc-ic" viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.5-.7L3 21l1.8-5.3A8.4 8.4 0 1 1 21 11.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></symbol>' +
      '<symbol id="emc-mail-ic" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m4 8 8 5.5L20 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>';
    d.body.appendChild(sp);
  }
  function wordsPass(list) {
    var w = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) {
      var pe = n.parentElement;
      if (!pe || pe.closest('#emc, #b12, script, style') || !X.pre.test(n.nodeValue)) continue;
      var v = n.nodeValue, o = v;
      list.forEach(function (x) { v = v.replace(x[0], x[1]); });
      if (v !== o) { wordSwaps.push([n, o]); n.nodeValue = v; }
    }
  }
  function iconsPass(sel, sym) {
    Array.prototype.forEach.call(d.querySelectorAll(sel), function (u) {
      if (u.closest('#emc, #b12')) return;
      var h = u.getAttribute('href') || u.getAttribute('xlink:href');
      if (h && /#(bi|i)-wa$/.test(h)) { iconSwaps.push([u, h]); u.setAttribute('href', sym); }
    });
  }
  function chatWords(on) {
    if (!on) {
      wordSwaps.forEach(function (w) { w[0].nodeValue = w[1]; });
      iconSwaps.forEach(function (i) { i[0].setAttribute('href', i[1]); });
      wordSwaps = []; iconSwaps = [];
      return;
    }
    symbols();
    if (X.chat.words.length) wordsPass(X.chat.words);
    iconsPass('.btn--wa use', '#emc-ic');
  }
  // Запасной режим: чата нет — почта suporte@ericamarques.com (ссылки уже mailto, см. выше)
  function mailMode() {
    html.classList.add('emc-mail');
    btn.setAttribute('aria-label', X.mail.aria);
    symbols();
    swap('wa-pop-link', X.mail.pop);   // пузырь в этом режиме скрыт, но слов про чат/WhatsApp в нём быть не должно
    swap('pb-wa-t', X.mail.plaque);
    swap('pb-wa-btn', '<svg class="i" aria-hidden="true"><use href="#emc-mail-ic"/></svg>' + X.mail.btn);
    wordsPass(X.mail.words);
    iconsPass('use', '#emc-mail-ic');
  }
  function onMode(on) {
    html.classList.toggle('emc-on', on);
    btn.setAttribute('aria-label', on ? L.open : btnLabel);
    if (on) {
      btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-controls', 'emc'); btn.setAttribute('aria-expanded', S.open ? 'true' : 'false');
      if (!swaps.length) {
        if (X.chat.pop) swap('wa-pop-link', X.chat.pop);   // в PT-версии HTML уже про чат — текст остаётся как есть
        if (X.chat.plaque) swap('pb-wa-t', X.chat.plaque);
        if (X.chat.btn) swap('pb-wa-btn', X.chat.btn);
        chatWords(true);
      }
    } else {
      ['aria-haspopup', 'aria-controls', 'aria-expanded'].forEach(function (a) { btn.removeAttribute(a); });
      swaps.forEach(function (s) { s[0].innerHTML = s[1]; });
      swaps = [];
      chatWords(false);
    }
  }
  onMode(true);
  // html.emc-pre (head прячет #sticky-cta-wa, #wa-pop, #pb-wa до первого кадра) снимаем, когда решение принято и chat.css применён
  function releasePre() {
    var n = 0;
    (function chk() {
      var ready = true;
      try { ready = getComputedStyle(html).getPropertyValue('--emc-css').trim() === '1'; } catch (e) { /* без проверки */ }
      if (ready || ++n > 30) html.classList.remove('emc-pre'); else setTimeout(chk, 100);
    })();
  }
  releasePre();

  /* ---------- Окно чата ---------- */
  var SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">';
  var panel = el('div', 'emc');
  panel.id = 'emc'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'emc-name');
  panel.innerHTML =
    '<div class="emc__head"><span class="emc-ava" aria-hidden="true"></span>' +
    '<div class="emc__who"><b class="emc__name" id="emc-name"></b><span class="emc__st"></span></div>' +
    '<button class="emc__x" type="button">' + SVG + '<path d="M18 6 6 18M6 6l12 12"/></svg></button></div>' +
    '<div class="emc__bar" role="status" hidden></div>' +
    '<div class="emc__feed" role="log" aria-live="polite" tabindex="-1"></div>' +
    '<p class="emc__hint" role="alert"></p>' +
    '<form class="emc__in" novalidate><label class="sr-only" for="emc-ta"></label>' +
    '<textarea id="emc-ta" rows="1" enterkeyhint="send" autocomplete="off"></textarea>' +
    '<span class="emc__cnt" aria-hidden="true"></span>' +
    '<button class="emc__send" type="submit" disabled>' + SVG + '<path d="M4 12 20 4l-4 16-4-6.5L4 12Zm8 1.5L20 4"/></svg></button></form>';
  d.body.appendChild(panel);
  var $ = function (s) { return panel.querySelector(s); };
  var feed = $('.emc__feed'), ta = $('textarea'), sendB = $('.emc__send'), hint = $('.emc__hint');
  var bar = $('.emc__bar'), cnt = $('.emc__cnt'), xB = $('.emc__x'), form = $('form');
  $('.emc__name').textContent = L.name;
  $('.emc__st').textContent = L.online;
  $('label').textContent = L.ph;
  feed.setAttribute('aria-label', L.log);
  xB.setAttribute('aria-label', L.close);
  sendB.setAttribute('aria-label', L.send);
  ta.placeholder = L.ph;
  ta.maxLength = 500;

  var typingEl = el('div', 'emc-typing');
  typingEl.innerHTML = '<span></span><span></span><span></span>';
  typingEl.setAttribute('role', 'status');
  typingEl.setAttribute('aria-label', L.typing);

  // Пузырь-подсказка с приветствием у закрытой кнопки
  var peek = el('div', 'emc-peek');
  peek.hidden = true;
  peek.innerHTML = '<button class="emc-peek__msg" type="button"><b></b><span></span><i class="emc-dots" aria-hidden="true"><i></i><i></i><i></i></i></button>' +
    '<button class="emc-peek__x" type="button">' + SVG + '<path d="M18 6 6 18M6 6l12 12"/></svg></button>';
  peek.querySelector('b').textContent = L.erika;
  peek.querySelector('.emc-peek__x').setAttribute('aria-label', L.peekClose);
  d.body.appendChild(peek);

  /* ---------- Дожим после закрытия окна (контракт v2.2) ----------
     Включён, только если /session вернул followup.enabled === true (боевой бэкенд без поля — виджет ничего не делает и не шлёт /followup).
     Человек написал ≥ 1 сообщение → закрыл окно → ждём followup.delay_s с → если он на странице, окно не открыто и в этой сессии ещё не спрашивали —
     один раз POST /followup {reason:'closed'} (флаг в localStorage erika_followup_asked_<sid>). Ответ {followup:null} — молчим; иначе текст
     показывается облачком над круглой кнопкой (peekShow, kind 'followup'), событие из ответа кладётся в ленту; клик → открыть чат + POST /event followup_click. */
  var F = { on: false, delay: 20, userMsg: false, t: 0, busy: false, wait: false };
  function kindOf(ev) { var m = ev && ev.meta; return m && m.followup ? 'followup' : m && m.welcome_back ? 'welcome_back' : ''; }
  function fuKey() { return 'erika_followup_asked_' + S.sid; }
  function fuSetup(j) {
    var f = j && j.followup;
    F.on = !!(f && f.enabled === true);
    F.delay = f && +f.delay_s > 0 ? +f.delay_s : 20;
    if (!F.on) fuStop();
  }
  function fuStop() { clearTimeout(F.t); F.t = 0; F.wait = false; }
  function fuArm() {
    if (!F.on || S.off || !S.ok || !F.userMsg || F.t || F.busy || store('localStorage', fuKey())) return;
    F.t = setTimeout(fuRun, F.delay * 1000);
  }
  function fuEvent(kind) { if (S.sid) api('/event', { session_id: S.sid, kind: kind }); }
  function fuRun() {
    F.t = 0;
    if (!F.on || S.off || !S.ok || S.open) return;
    if (d.hidden) { F.wait = true; return; }   // вкладка в фоне — дождёмся возвращения на страницу
    if (store('localStorage', fuKey())) return;
    store('localStorage', fuKey(), '1');       // максимум один раз за сессию: флаг ставим до запроса
    F.busy = true;
    var g = S.gen;
    api('/followup', { session_id: S.sid, reason: 'closed' }, 15000).then(function (r) {
      F.busy = false;
      if (g !== S.gen || S.off) return;
      var fu = r.s === 200 ? r.j.followup : null;
      if (!fu || !fu.text) return;   // null, ошибка, таймаут, не 200 — молча
      var ev = fu.event;
      if (ev && typeof ev === 'object' && ev.id != null) {
        ev.meta = ev.meta || {}; ev.meta.followup = true;
        if (!S.seen[ev.id]) { S.seen[ev.id] = 1; show(ev); }   // если long-poll уже принёс это событие — оно покажется из очереди тем же облачком
      } else {
        show({ from: 'bot', type: 'text', text: fu.text, meta: { followup: true } });
      }
    });
  }

  /* ---------- Лента ---------- */
  function scrollEnd() { feed.scrollTop = feed.scrollHeight; }
  function add(node) {
    if (typingEl.parentNode) feed.insertBefore(node, typingEl); else feed.appendChild(node);
    scrollEnd();
    return node;
  }
  function bubble(from, text) {
    var who = from === 'bot' ? L.erika : from === 'manager' ? L.team : '';
    if (who && S.lastFrom !== from) add(el('p', 'emc-who', who));
    S.lastFrom = from;
    return add(el('div', 'emc-b emc-b--' + (from === 'user' ? 'user' : from === 'manager' ? 'mgr' : 'bot'), text || ''));
  }
  function note(cls, text) { S.lastFrom = ''; return add(el('p', cls, text)); }
  function linkBtn(url, title) {
    var a = el('a', 'emc-cta', title);
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    S.lastFrom = '';
    return add(a);
  }
  function mailBtn() {   // запасная кнопка в окне чата: письмо на suporte@ericamarques.com
    var a = linkBtn(MAIL_HREF, L.mailBtn);
    a.className = 'emc-cta emc-cta--mail';
    a.removeAttribute('target'); a.removeAttribute('rel');
    return a;
  }
  function closeButtons() {
    Array.prototype.forEach.call(feed.querySelectorAll('.emc-btns button'), function (b) { b.disabled = true; });
  }
  function typing(on) {
    if (on && !typingEl.parentNode) { feed.appendChild(typingEl); scrollEnd(); }
    if (!on && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
  }

  function render(ev) {
    var from = ev.from || 'bot', t = ev.type;
    if (t === 'typing') return;
    if (t === 'contact_form' && !CONTACT_FORM) return;   // форма выключена: ни текста, ни формы
    if (t === 'user' || from === 'user') { bubble('user', ev.text || ev.title || ''); closeButtons(); return; }
    if (t === 'system') { note('emc-sys', ev.text || ''); return; }
    if (t === 'handoff') { S.handoff = true; note('emc-ho', ev.text || L.handoff); return; }
    if (t === 'paid') {
      var p = bubble(from, '');
      p.classList.add('emc-b--paid');
      if (ev.title) p.appendChild(el('b', '', ev.title));
      if (ev.text) p.appendChild(d.createTextNode(ev.text));
      if (ev.instruction_url) linkBtn(ev.instruction_url, L.instr);
      return;
    }
    if (ev.text) bubble(from, ev.text);
    if (t === 'buttons' && ev.buttons && ev.buttons.length) {
      closeButtons();
      var row = el('div', 'emc-btns');
      ev.buttons.forEach(function (b) {
        var x = el('button', '', b.title);
        x.type = 'button';
        x.addEventListener('click', function () { send({ button_id: b.id }, b.title); });
        row.appendChild(x);
      });
      S.lastFrom = '';
      add(row);
    } else if (t === 'cta' && ev.url) {
      linkBtn(ev.url, ev.title || ev.text || '');
    } else if (t === 'contact_form') {
      add(contactForm(ev));
      S.lastFrom = '';
    }
  }

  function accept(ev) {
    if (!ev || ev.id == null || S.seen[ev.id]) return false;
    S.seen[ev.id] = 1;
    if (ev.id > S.lastId) S.lastId = ev.id;
    return true;
  }

  // Показ одного события (история — сразу; живые — через очередь с паузами delay_ms)
  function show(ev, hist) {
    // форма контакта выключена: событие молча пропускаем (его id уже учтён в accept — long-poll не зациклится),
    // но если это был единственный ответ на сообщение — поле ввода разблокируем
    if (ev.type === 'contact_form' && !CONTACT_FORM) {
      if (S.busy && (S.busyId == null || ev.id > S.busyId)) setBusy(false);
      return;
    }
    // эхо своей отправки уже нарисовано — привязываем, не дублируем
    // (ответ долгого опроса может прийти РАНЬШЕ ответа на отправку, поэтому записи об эхо не стираем сразу)
    if (ev.type === 'user') {
      for (var ei = S.echoes.length - 1; ei >= 0; ei--) {
        var pe = S.echoes[ei];
        if (pe.id === ev.id) return;
        if (pe.id == null && ((pe.button_id && pe.button_id === ev.button_id) || (pe.text && pe.text === ev.text))) { pe.id = ev.id; return; }
      }
    }
    // приветствие уже показано виджетом — событие от greeting_shown не дублируем
    if (S.greetEl && ev.from === 'bot' && ev.type === 'text') {
      if (S.greetId != null && ev.id === S.greetId) return;
      if (!S.greetBound && ev.text === S.greeting) { S.greetBound = 1; S.greetId = ev.id; return; }
    }
    render(ev);
    if (ev.from === 'user' || ev.type === 'user') { S.rep = 0; F.userMsg = true; }
    else if (isReply(ev)) S.rep++;
    if (ev.from !== 'user' && ev.type !== 'user' && ev.type !== 'typing') {
      if (ev.id != null && ev.id > S.lastReply) S.lastReply = ev.id;
      if (S.busy && (S.busyId == null || ev.id > S.busyId)) setBusy(false);
      if (!S.open && !hist && ev.type !== 'system') { S.unread++; badgeUp(); if (ev.text) peekShow(ev.text, ev.from, ev.id, kindOf(ev)); }
      if (S.open && ev.id != null) markSeen(ev.id);
    }
    if (ev.type === 'handoff') setBusy(false);
  }

  var Q = [], qRun = false, drainT = 0;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function isReply(ev) { return ev.from === 'bot' && (ev.type === 'text' || ev.type === 'buttons' || ev.type === 'cta'); }
  // Сколько ждать перед показом живого события (мс): delay_ms бэкенда и «человеческая» пауза печати (константы HUMAN_* вверху файла)
  function pause(ev) {
    if (ev.from === 'user' || ev.type === 'user') return 0;
    if (ev.type === 'contact_form' && !CONTACT_FORM) return 0;
    if (ev.from === 'bot' && ev.type === 'text' && S.greetEl &&
        ((S.greetId != null && ev.id === S.greetId) || (!S.greetBound && ev.text === S.greeting))) return 0;   // дубль приветствия: show() его отбросит
    var wait = Math.min(Math.max(+ev.delay_ms || 0, 0), 5000);
    if (FAST || !isReply(ev) || kindOf(ev)) return wait;   // дожим и «с возвращением» — облачко без «печатает»
    var len = String(ev.text || '').length, now = Date.now(), human;
    if (S.rep === 0) {   // первый пузырь ответа: отсчёт от отправки сообщения; если ответ пришёл позже — показываем сразу
      var t1 = (S.busy || S.sending) && S.sentAt ? S.sentAt : now;
      human = t1 + Math.min(HUMAN_MIN_MS + HUMAN_PER_CHAR_MS * len, HUMAN_MAX_MS) + rnd(-HUMAN_JITTER_MS, HUMAN_JITTER_MS) - now;
    } else {             // следующие пузыри того же ответа
      human = Math.min(Math.max(HUMAN_NEXT_MIN_MS + Math.random() * HUMAN_NEXT_RND_MS, HUMAN_PER_CHAR_MS * len + 400), HUMAN_NEXT_MAX_MS);
    }
    return Math.max(wait, human);
  }
  function drain() {
    if (qRun) return;
    qRun = true;
    var g = S.gen;
    (function step() {
      if (g !== S.gen) { qRun = false; return; }   // сессию сбросили / чат отключили, пока ждали
      var ev = Q.shift();
      if (!ev) { qRun = false; if (!S.busy) typing(false); return; }
      if (ev.type === 'typing') { if (!S.handoff) typing(true); step(); return; }
      var wait = pause(ev);
      if (wait && typingEl.parentNode == null && ev.from === 'bot') typing(true);
      drainT = setTimeout(function () {
        if (g !== S.gen) { qRun = false; return; }
        show(ev);
        if (!(Q.length && Q[0].from === 'bot') && !S.busy) typing(false);   // между пузырями одного ответа «печатает» не мигает
        step();
      }, wait);
    })();
  }

  /* ---------- Состояние поля ---------- */
  function setBusy(on, id) {
    S.busy = on; S.busyId = id;
    clearTimeout(S.busyT);
    if (on) S.busyT = setTimeout(function () { setBusy(false); }, 90000);   // страховка, если ответ потерялся
    if (!on && !qRun) typing(false);
    sync();
  }
  function sync() {
    var lock = S.busy || S.sending || !S.ok || S.off;
    ta.readOnly = lock;
    ta.placeholder = S.busy ? L.phWait : !S.ok && !S.off ? L.connecting : L.ph;
    var len = ta.value.length;
    sendB.disabled = lock || Date.now() < S.rateUntil || !ta.value.trim();
    cnt.textContent = len ? len + '/' + ta.maxLength : '';
    cnt.classList.toggle('is-max', len >= ta.maxLength);
  }
  function say(text) { hint.textContent = text || ''; }
  function banner(on) { bar.hidden = !on; bar.textContent = on ? L.offline : ''; }
  function badgeUp() {
    badge.hidden = !S.unread;
    badge.textContent = S.unread > 9 ? '9+' : S.unread;
    btn.setAttribute('aria-label', L.open + (S.unread ? ' (' + S.unread + ' ' + L.unread + ')' : ''));
  }
  function grow() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 132) + 'px'; }

  /* ---------- Сеть ---------- */
  var inflight = [];   // запросы в полёте (long-poll, followup…): команда /clear обрывает их все
  function api(path, body, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var tm = ctl ? setTimeout(function () { ctl.abort(); }, ms || 15000) : 0;
    var opt = { method: body ? 'POST' : 'GET', signal: ctl ? ctl.signal : undefined };
    if (ctl) inflight.push(ctl);
    function done() { clearTimeout(tm); var i = inflight.indexOf(ctl); if (i >= 0) inflight.splice(i, 1); }
    if (body) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
    return fetch(path === LEAD ? LEAD : API + path, opt).then(function (r) {
      done();
      return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j || {} }; });
    }, function () { done(); return { s: 0, j: {} }; });
  }
  function backoff() { S.bo = S.bo ? Math.min(S.bo * 2, 8000) : 1000; return S.bo; }
  function netFail() { S.net++; if (S.net >= 2) banner(true); return backoff(); }
  function netOk() { S.net = 0; S.bo = 0; banner(false); }

  /* ---------- Сессия ---------- */
  function startSession(fresh) {
    if (S.starting) return S.starting;
    var body = {
      session_id: fresh ? null : store('localStorage', 'em_chat_sid'),
      turnstile_token: getTurnstileToken(), page_url: location.href, referrer: d.referrer || '',
      utm: utm(), lang: 'pt-BR'
    };
    S.starting = api('/session', body).then(function (r) {
      S.starting = null;
      if (r.s === 200 && r.j.session_id) { S.fails = 0; netOk(); applySession(r.j); return true; }
      if (r.s === 401 && body.session_id) { store('localStorage', 'em_chat_sid', null); return startSession(true); }
      if (r.s === 0 || r.s === 502 || r.s === 504 || (r.s === 503 && r.j.error !== 'chat_disabled') || r.s === 429) {
        if (r.s !== 429 && ++S.fails >= START_TRIES) { fallback(); return false; }   // 502/503/нет сети несколько раз подряд — почта
        setTimeout(function () { if (!S.ok && !S.off) startSession(fresh); }, netFail());
        return false;
      }
      fallback();   // 503 chat_disabled, 403 forbidden/antibot, 404 (нет бэкенда) и прочее
      return false;
    });
    return S.starting;
  }

  function reset() {
    S.gen++; S.lastId = 0; S.seen = {}; S.lastFrom = ''; S.pend = null; S.handoff = false;
    S.greeted = false; S.greetEl = null; S.greetBound = 0; S.greetId = null; S.echoes = []; S.hasHistory = false;
    clearTimeout(drainT); qRun = false; S.rep = 0; S.sentAt = 0; S.lastReply = 0; S.clearedAt = 0;
    F.userMsg = false; fuStop();
    Q = []; feed.textContent = ''; setBusy(false);
  }
  function restart() {
    reset();
    S.ok = false; S.sid = null; store('localStorage', 'em_chat_sid', null); sync();
    return startSession(true).then(function (ok) { if (ok) note('emc-sys', L.restarted); return ok; });
  }

  /* ---------- Служебная команда для тестировщиков: «/clear», «/reset», «/novo» (после trim и без учёта регистра) ----------
     Сообщение не уходит на бэкенд и не рисуется в ленте. Виджет забывает сессию (session_id и все свои метки в localStorage/sessionStorage,
     кроме общесайтовых: es_cookies_v1, es_price_until, em_src, em_chat_late), обрывает запросы, чистит ленту и поле и создаёт новую сессию
     (POST /session с session_id = null): новый sid, ссылки оплаты получают новый sck, приветствие — как при первом заходе. Окно остаётся открытым.
     Старая сессия на сервере остаётся. В интерфейсе о команде нигде не сказано. */
  var CMDS = { '/clear': 1, '/reset': 1, '/novo': 1 };
  var KEEP = { es_cookies_v1: 1, es_price_until: 1, em_src: 1, em_chat_late: 1, em_chat_mock_v1: 1, em_lead_pending: 1 };
  function wipeKeys(sid) {
    ['localStorage', 'sessionStorage'].forEach(function (kind) {
      try {
        var st = window[kind], ks = [], i;
        for (i = 0; i < st.length; i++) ks.push(st.key(i));
        ks.forEach(function (k) {
          if (KEEP[k] || (kind === 'sessionStorage' && k === 'em_chat_open')) return;   // окно остаётся открытым
          if (/^(em_chat_|erika_)/.test(k) || (sid && k.indexOf(sid) >= 0)) st.removeItem(k);
        });
      } catch (e) { /* приватный режим */ }
    });
  }
  function clearSession() {
    var old = S.sid;
    inflight.slice().forEach(function (c) { try { c.abort(); } catch (e) { /* уже завершён */ } });
    inflight = [];
    wipeKeys(old);
    reset();
    clearTimeout(S.gt); clearTimeout(S.busyT);
    S.polling = false; S.ok = false; S.sid = null; S.greeting = null; S.wrote = false; S.fails = 0; S.net = 0; S.bo = 0; S.starting = null;
    S.unread = 0; S.afterClear = true; F.on = false; F.busy = false;
    peekHide(); badgeUp(); banner(false); say('');
    ta.value = ''; grow(); sync();
    startSession(true);   // обычная логика: ответ /session → applySession → приветствие через greeting_delay_ms; при отказе — запасной режим
  }

  function applySession(j) {
    if (S.sid && S.sid !== j.session_id) reset();
    if (S.afterClear) { S.afterClear = false; S.clearedAt = Date.now(); }   // приветствие отсчитываем от ответа новой сессии
    S.sid = j.session_id; S.ok = true;
    store('localStorage', 'em_chat_sid', S.sid);
    if (j.chat_enabled === false) { fallback(); return; }
    var lim = j.limits || {};
    ta.maxLength = lim.max_chars > 0 ? lim.max_chars : 500;
    S.handoff = !!j.handoff;
    var evs = j.events || [], last = null, seenId = seenGet(), unreadEvs = [];
    evs.forEach(function (ev) {
      if (!accept(ev)) return;
      show(ev, true);
      if (ev.type !== 'typing') last = ev;
      if (ev.id > seenId && ev.from !== 'user' && ev.type !== 'user' && ev.type !== 'typing' && ev.type !== 'system' && ev.text &&
          !(ev.type === 'contact_form' && !CONTACT_FORM)) unreadEvs.push(ev);
    });
    if (evs.length) S.hasHistory = true;
    if (S.open) markSeen(j.last_event_id || S.lastId);
    else if (unreadEvs.length) {
      var ue = unreadEvs[unreadEvs.length - 1];
      S.unread = unreadEvs.length; badgeUp();
      afterShown(function () { setTimeout(function () { peekShow(ue.text, ue.from, ue.id, kindOf(ue)); }, PEEK_AFTER_MS); });   // через 2,5 с после появления кнопки
    }
    if (j.last_event_id > S.lastId) S.lastId = j.last_event_id;
    fuSetup(j);
    // последний — непрочитанный ответом вопрос человека: ждём ответ
    if (last && last.type === 'user' && !S.handoff) { S.sentAt = Date.now(); setBusy(true, last.id); typing(true); }
    S.greeting = j.greeting || null;
    S.greetDelay = j.greeting_delay_ms != null ? +j.greeting_delay_ms : 4000;
    greetPlan();
    updateSck();
    sync();
    poll();
  }

  /* ---------- Приветствие: текст только из ответа session ---------- */
  function greetPlan() {
    clearTimeout(S.gt);
    if (!S.greeting || S.hasHistory || S.wrote || S.greeted) return;
    if (isLate()) return;   // кнопки ещё нет — запланируем, когда она появится (lateShow)
    // кнопка появилась после тарифов — приветствие через PEEK_AFTER_MS после неё; иначе, как раньше, от загрузки страницы
    var wait = S.clearedAt ? S.greetDelay - (Date.now() - S.clearedAt)   // после /clear — greeting_delay_ms от ответа новой сессии
      : shownAt ? Math.min(S.greetDelay, PEEK_AFTER_MS) - (Date.now() - shownAt) : S.greetDelay - (Date.now() - t0);
    S.gt = setTimeout(greetShow, Math.max(0, wait));
  }
  function greetShow() {
    clearTimeout(S.gt);
    if (!S.greeting || S.hasHistory || S.wrote || S.greeted || S.off || !S.ok) return;
    S.greeted = true; S.hasHistory = true;
    show({ from: 'bot', type: 'text', text: S.greeting });
    S.greetEl = true;   // ставим ПОСЛЕ show: событие с тем же текстом из ленты дальше не дублируется
    var g = S.gen;
    api('/greeting_shown', { session_id: S.sid }).then(function (r) {
      if (g === S.gen && r.j.event && r.j.event.id != null) { S.seen[r.j.event.id] = 1; S.greetBound = 1; if (S.greetId == null) S.greetId = r.j.event.id; }
    });
  }

  /* ---------- Long-poll ---------- */
  function poll() {
    if (S.polling || !S.ok || S.off) return;
    if (d.hidden) return;   // продолжим на visibilitychange
    S.polling = true;
    var g = S.gen;
    api('/events?session_id=' + encodeURIComponent(S.sid) + '&after=' + S.lastId + '&wait=25', null, 35000).then(function (r) {
      S.polling = false;
      if (g !== S.gen || S.off) return;
      if (r.s === 200) {
        netOk();
        (r.j.events || []).forEach(function (ev) { if (accept(ev)) Q.push(ev); });
        if (r.j.last_id > S.lastId) S.lastId = r.j.last_id;
        if (r.j.handoff) S.handoff = true;
        if (Q.length) { S.hasHistory = true; drain(); }
        if (r.j.chat_enabled === false) { fallback(); return; }
        poll();
        return;
      }
      if (r.s === 401) { restart(); return; }
      if (r.s === 403 || (r.s === 503 && r.j.error === 'chat_disabled')) { fallback(); return; }
      setTimeout(poll, r.s === 0 ? netFail() : backoff());
    });
  }
  d.addEventListener('visibilitychange', function () { if (!d.hidden) { poll(); if (F.wait) { F.wait = false; fuRun(); } } });

  /* ---------- Отправка ---------- */
  function send(payload, echo) {
    if (!S.ok || S.off || S.busy || S.sending) return false;
    if (Date.now() < S.rateUntil) return false;
    S.wrote = true; F.userMsg = true; clearTimeout(S.gt);
    S.sentAt = Date.now(); S.rep = 0;
    say('');
    var body = { session_id: S.sid, client_msg_id: uuid(), page_url: location.href };
    if (payload.button_id) body.button_id = payload.button_id; else body.text = payload.text;
    var b = bubble('user', echo);
    if (payload.button_id) closeButtons();
    var pe0 = { el: b, text: payload.text, button_id: payload.button_id, id: null };
    S.pend = pe0; S.echoes.push(pe0); if (S.echoes.length > 20) S.echoes.shift();
    S.hasHistory = true;
    S.sending = true; sync();
    var tries = 0, g = S.gen;
    function undo(msg) {
      if (b.parentNode) b.parentNode.removeChild(b);
      S.lastFrom = ''; S.pend = null; var ix = S.echoes.indexOf(pe0); if (ix >= 0) S.echoes.splice(ix, 1);
      if (payload.text && !ta.value) ta.value = payload.text;
      grow();
      if (msg) say(msg);
    }
    (function go() {
      api('/message', body).then(function (r) {
        if (g !== S.gen) return;
        if (r.s === 0 || r.s === 502 || r.s === 504) {
          tries++;
          if (tries >= 2) banner(true);
          setTimeout(go, Math.min(1000 * Math.pow(2, tries - 1), 8000));   // тот же client_msg_id: повтор безопасен
          return;
        }
        netOk();
        S.sending = false;
        var e = r.j.error;
        if (r.s === 200 || r.s === 202) {
          var id = r.j.event_id;
          if (id != null) { S.seen[id] = 1; if (pe0.id == null) pe0.id = id; }
          S.pend = null;
          if (!S.handoff && !(id != null && S.lastReply > id)) { setBusy(true, id); typing(true); } else sync();
          return;
        }
        if (r.s === 409) { undo(L.busy); setBusy(true, S.lastId); return; }
        if (r.s === 413) { undo(fmt(L.tooLong, ta.maxLength)); sync(); return; }
        if (r.s === 429) {
          var sec = Math.max(1, Math.ceil(+r.j.retry_after || 10));
          S.rateUntil = Date.now() + sec * 1000;
          undo(fmt(L.rate, sec));
          setTimeout(function () { say(''); sync(); }, sec * 1000);
          sync(); return;
        }
        if (r.s === 401) {
          undo('');
          restart().then(function (ok) { if (ok) send(payload, echo); });
          return;
        }
        if ((r.s === 503 && e === 'chat_disabled') || r.s === 403) { undo(''); fallback(); return; }
        if (r.s === 503) { undo(L.unavail); mailBtn(); sync(); return; }
        undo(L.err); sync();
      });
    })();
    return true;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = ta.value.replace(/\s+$/, '').replace(/^\s+/, '');
    if (!text) return;
    if (!S.off && Object.prototype.hasOwnProperty.call(CMDS, text.toLowerCase())) { clearSession(); return; }   // служебная команда: не отправляем и не показываем
    if (sendB.disabled) return;
    if (text.length > ta.maxLength) { say(fmt(L.tooLong, ta.maxLength)); return; }
    if (send({ text: text }, text)) { ta.value = ''; grow(); sync(); }
  });
  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });
  ta.addEventListener('input', function () { grow(); sync(); if (hint.textContent && !S.busy) say(''); });

  /* ---------- Форма контакта ---------- */
  var fid = 0;
  function digitsOf(s) { return String(s || '').replace(/\D/g, ''); }
  function normalize(raw) {   // как в assets/cadastro.js: убрать 0 перед DDD и код страны 55
    raw = raw.replace(/^0+/, '');
    if (raw.length > 11 && raw.slice(0, 2) === '55') raw = raw.slice(2);
    return raw.slice(0, 11);
  }
  function telFmt(x) {
    if (x.length <= 2) return x;
    var r = x.slice(2);
    if (r.length <= 4) return x.slice(0, 2) + ' ' + r;
    var c = r.length > 8 ? 5 : 4;
    return x.slice(0, 2) + ' ' + r.slice(0, c) + '-' + r.slice(c);
  }
  function contactForm(ev) {
    var f = el('form', 'emc-form');
    f.noValidate = true;
    if (store('localStorage', 'em_chat_contact') === S.sid) { f.appendChild(el('p', 'emc-form__ok', L.thanks)); return f; }
    var n = ++fid, pre = 'emc-f' + n + '-';
    function field(key, label, type, ac, extra) {
      return '<div class="emc-f"><label for="' + pre + key + '">' + label + '</label>' + (extra || '') +
        '<input id="' + pre + key + '" name="' + key + '" type="' + type + '" autocomplete="' + ac + '" aria-describedby="' + pre + key + '-e"' +
        (key === 'wa' ? ' inputmode="tel" placeholder="11 91234-5678"' : key === 'email' ? ' inputmode="email"' : ' maxlength="100"') + '>' +
        (extra ? '</span>' : '') + '<small class="emc-err" id="' + pre + key + '-e"></small></div>';
    }
    f.innerHTML = (ev.title ? '<p class="emc-form__t"></p>' : '') +
      field('name', L.fName, 'text', 'name') +
      field('wa', L.fWa, 'tel', 'tel-national', '<span class="emc-tel"><span class="emc-tel__cc" aria-hidden="true">+55</span>') +
      field('email', L.fEmail, 'email', 'email') +
      '<div class="emc-f"><label class="emc-ck"><input type="checkbox" name="ok" aria-describedby="' + pre + 'ok-e"><span></span></label>' +
      '<small class="emc-err" id="' + pre + 'ok-e"></small></div>' +
      '<button class="emc-cta" type="submit"></button>';
    if (ev.title) f.querySelector('.emc-form__t').textContent = ev.title;
    var ck = f.querySelector('.emc-ck span');
    ck.appendChild(d.createTextNode(L.fConsent));
    var pl = el('a', '', L.policy); pl.href = 'privacidade/'; pl.target = '_blank'; pl.rel = 'noopener';
    ck.appendChild(pl);
    var sb = f.querySelector('button'); sb.textContent = L.submit;
    var I = {};
    ['name', 'wa', 'email', 'ok'].forEach(function (k) { I[k] = f.querySelector('[name="' + k + '"]'); });
    var tel = I.wa;
    tel.addEventListener('input', function () {
      var pos = tel.selectionStart || tel.value.length, before = digitsOf(tel.value.slice(0, pos)).length;
      var x = normalize(digitsOf(tel.value)), out = telFmt(x);
      if (out === tel.value) return;
      tel.value = out;
      var seen = 0, at = out.length;
      for (var i = 0; i < out.length && before; i++) if (/\d/.test(out[i]) && ++seen === before) { at = i + 1; break; }
      try { tel.setSelectionRange(at, at); } catch (e) { /* без выделения */ }
    });
    function err(key, msg) {
      var box = f.querySelector('#' + pre + key + '-e');
      box.textContent = msg || '';
      if (msg) I[key].setAttribute('aria-invalid', 'true'); else I[key].removeAttribute('aria-invalid');
    }
    ['name', 'wa', 'email'].forEach(function (k) { I[k].addEventListener('input', function () { err(k, ''); }); });
    I.ok.addEventListener('change', function () { if (I.ok.checked) err('ok', ''); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sb.disabled) return;
      var v = { name: I.name.value.trim(), wa: I.wa.value.trim(), email: I.email.value.trim() };
      var dg = normalize(digitsOf(v.wa)), bad = {};
      if (!v.name) bad.name = 'required'; else if (v.name.length < 2) bad.name = 'too_short'; else if (v.name.length > 100) bad.name = 'too_long';
      if (!dg) bad.wa = 'required'; else if (dg.length < 10) bad.wa = 'too_short';
      if (!v.email) bad.email = 'required'; else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) bad.email = 'invalid';
      if (!I.ok.checked) bad.ok = 'consent';
      var first = null;
      ['name', 'wa', 'email', 'ok'].forEach(function (k) {
        err(k, bad[k] ? (k === 'ok' ? L.consentErr : L[bad[k]]) : '');
        if (bad[k] && !first) first = I[k];
      });
      if (first) { first.focus(); return; }
      sb.disabled = true; sb.textContent = L.sending;
      var lead = { name: v.name, whatsapp: v.wa, email: v.email, terms: true, whatsapp_optin: !!I.ok.checked,
        consent_version: CONSENT_VERSION, lang: 'pt', page: 'planb-chat', referrer: d.referrer || '', website: '' };
      MARKS.forEach(function (k) { lead[k] = q.get(k) || ''; });
      var chat = { session_id: S.sid, name: v.name, whatsapp: '+55' + dg, email: v.email, consent: true, consent_version: CONSENT_VERSION };
      Promise.all([api(LEAD, lead), api('/contact', chat)]).then(function (rs) {
        var l = rs[0], c = rs[1];
        if (!(l.s === 200 && l.j.ok !== false)) {   // как cadastro.js: заявка не потерялась — лежит в em_lead_pending
          lead.saved_at = new Date().toISOString(); lead.reason = 'chat-http-' + l.s;
          store('localStorage', 'em_lead_pending', JSON.stringify(lead));
        }
        if (c.s === 200 || l.s === 200) {
          store('localStorage', 'em_chat_contact', S.sid);
          f.textContent = '';
          f.appendChild(el('p', 'emc-form__ok', L.thanks));
          scrollEnd();
          return;
        }
        sb.disabled = false; sb.textContent = L.submit;
        if (c.s === 422) { err('ok', L.consentErr); I.ok.focus(); return; }
        err('ok', L.sendErr);
      });
    });
    return f;
  }

  /* ---------- Пузырь с приветствием у закрытой кнопки ---------- */
  function btnVisible() {
    if (isLate()) return false;
    var cs = getComputedStyle(btn), r = btn.getBoundingClientRect();
    return cs.visibility === 'visible' && +cs.opacity > 0.5 && r.width > 0 && r.bottom <= innerHeight + 1;
  }
  function peekPlace() {
    if (peek.hidden) return;
    var r = btn.getBoundingClientRect();
    peek.style.right = Math.max(12, innerWidth - r.right) + 'px';
    peek.style.bottom = (innerHeight - r.top + 12) + 'px';
  }
  var peekText = '', peekFrom = '', peekId = 0, peekT = 0, peekKind = '';
  // крестик гасит только это сообщение: новое сообщение Эрики снова всплывает
  function peekDismissed(id) { var v = store('sessionStorage', 'em_chat_peek_dis'); return v != null && id <= +v; }
  function peekShow(text, from, id, kind) {
    id = id != null ? +id : 0;
    if (S.open || peekDismissed(id)) return;
    var fresh = peekText !== text || peekId !== id;
    peekText = text; peekFrom = from || peekFrom; peekId = id; peekKind = kind || '';
    peek.classList.toggle('emc-peek--long', !!peekKind);   // дожим / «с возвращением»: до ~300 знаков, без «печатает…»
    peek.querySelector('span').textContent = text;
    peek.querySelector('b').textContent = peekFrom === 'manager' ? L.team : L.erika;
    if (!btnVisible()) return;   // кнопка ещё спрятана (самый верх страницы) — покажем после прокрутки
    var was = !peek.hidden;
    peek.hidden = false;
    html.classList.add('emc-peek-on');
    peekPlace();
    if (fresh && !was && !peekKind && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      // как живое сообщение: сначала «печатает…», потом текст
      peek.classList.add('is-typing'); clearTimeout(peekT);
      peekT = setTimeout(function () { peek.classList.remove('is-typing'); peekPlace(); }, 1100);
    }
  }
  function peekHide() { clearTimeout(peekT); peek.classList.remove('is-typing'); peek.hidden = true; peekText = ''; peekKind = ''; html.classList.remove('emc-peek-on'); }
  window.addEventListener('scroll', function () {
    if (peekText && peek.hidden && !S.open && btnVisible()) peekShow(peekText, peekFrom, peekId, peekKind);
  }, { passive: true });
  window.addEventListener('resize', peekPlace);
  // Облачко прячется там же, где круглая кнопка: когда её закрыла бы кнопка оплаты (site.js ставит #sticky-cta-wa.is-over-cta); в emc-late и запасном режиме — CSS
  if (window.MutationObserver) {
    var away = function () { peek.classList.toggle('is-away', btn.classList.contains('is-over-cta')); };
    new MutationObserver(away).observe(btn, { attributes: true, attributeFilter: ['class'] });
    away();
  }
  peek.querySelector('.emc-peek__msg').addEventListener('click', function () { openChat(btn); });
  peek.querySelector('.emc-peek__x').addEventListener('click', function () {
    store('sessionStorage', 'em_chat_peek_dis', String(peekId)); peekHide();
  });

  /* ---------- Открыть / закрыть ---------- */
  function vv() {   // телефон: окно по видимой области (клавиатура iOS, браузер Instagram)
    var v = window.visualViewport;
    if (!S.open || !mq.matches || !v) { panel.style.height = ''; panel.style.top = ''; return; }
    panel.style.height = v.height + 'px';
    panel.style.top = v.offsetTop + 'px';
    scrollEnd();
  }
  if (window.visualViewport) { visualViewport.addEventListener('resize', vv); visualViewport.addEventListener('scroll', vv); }

  function openChat(from) {
    if (S.off) return;
    S.opener = from && from.focus ? from : btn;
    lateShow();   // человек сам открыл чат (ссылкой на странице) — кнопка нужна, чтобы вернуться к переписке и увидеть ответ
    S.open = true;
    store('sessionStorage', 'em_chat_open', '1');
    panel.hidden = false;
    var m = mq.matches;
    if (m) panel.setAttribute('aria-modal', 'true'); else panel.removeAttribute('aria-modal');
    html.classList.add('emc-open');
    html.classList.toggle('emc-lock', m);
    btn.setAttribute('aria-expanded', 'true');
    fuStop();
    if (from === btn && peekKind && F.on) fuEvent(peekKind + '_click');   // клик по облачку/кнопке после дожима или «с возвращением»
    S.unread = 0; badgeUp(); peekHide(); markSeen(S.lastId);
    if (!S.ok) startSession();
    sync(); vv(); scrollEnd();
    setTimeout(function () { try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); } }, 30);
  }
  function closeChat() {
    if (!S.open) return;
    S.open = false;
    store('sessionStorage', 'em_chat_open', null);
    panel.hidden = true;
    html.classList.remove('emc-open', 'emc-lock');
    btn.setAttribute('aria-expanded', 'false');
    vv();
    var o = S.opener || btn;
    try { o.focus({ preventScroll: true }); } catch (e) { /* элемент исчез */ }
    fuArm();
  }
  xB.addEventListener('click', closeChat);
  d.addEventListener('keydown', function (e) {
    if (!S.open) return;
    if (e.key === 'Escape') { e.preventDefault(); closeChat(); return; }
    if (e.key === 'Tab' && mq.matches) {   // телефон: окно модальное — фокус не уходит за него
      var f = Array.prototype.filter.call(panel.querySelectorAll('button,a[href],input,textarea'), function (x) { return !x.disabled && x.offsetParent; });
      if (!f.length) return;
      if (e.shiftKey && d.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && d.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  // Ссылки, которые раньше вели в WhatsApp (метка data-emc-link; подвал #b12 не трогаем), открывают чат. В запасном режиме это обычные mailto-ссылки.
  d.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[data-emc-link]') : null;
    if (!a || a.closest('#emc')) return;
    if (S.off) return;   // чат недоступен — mailto сработает сам
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    if (a === btn && S.open) closeChat(); else openChat(a);
  }, true);

  /* ---------- Отказ чата: запасной режим — почта (WhatsApp на сайте не используется) ---------- */
  function fallback() {
    if (S.off) return;
    S.off = true; S.ok = false; S.gen++;
    clearTimeout(S.gt); typing(false); peekHide(); banner(false);
    F.on = false; fuStop();   // запасной (почтовый) режим: дожима нет
    onMode(false); mailMode();
    badge.hidden = true;
    if (S.open) { say(''); note('emc-sys', L.unavail); mailBtn(); }
    sync(); releasePre();
  }

  /* ---------- Оплата на странице: sck=web-<sid> ---------- */
  function updateSck() {
    var s = webSid(S.sid);
    if (!s) return;
    PAY.forEach(function (id) {
      var a = d.getElementById(id);
      if (!a) return;
      try {
        var u = new URL(a.getAttribute('href'), location.href);
        u.searchParams.set('sck', 'web-' + s);
        a.setAttribute('href', u.href);
      } catch (e) { /* ссылку не трогаем */ }
    });
  }

  /* ---------- Старт: после первого взаимодействия или через 1 с ---------- */
  sync();
  watchTarget();
  var started = false;
  function kick() {
    if (started) return;
    started = true;
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (t) { window.removeEventListener(t, kick, true); });
    startSession().then(function () {
      if (store('sessionStorage', 'em_chat_open') === '1' && !S.off && !S.open) openChat(btn);
    });
  }
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (t) { window.addEventListener(t, kick, { capture: true, passive: true }); });
  setTimeout(kick, 1000);
})();
