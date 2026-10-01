/* Веб-чат с ИИ-менеджером Эрики (план Б, 01.10). Чистый JS без библиотек.
   Контракт API v1 — «Курс Эрики/Веб-чат — контракт API.md» (эндпоинты /api/chat/*).
   Грузится только инлайн-загрузчиком parts/tail.html: хост oferta.* или ?chat=1 / ?chat=mock.
   Адрес API: <meta name="em-chat-api"> (по умолчанию /api/chat); для тестов ?chatapi=http://localhost:PORT/api/chat
   (только localhost/127.0.0.1 — чтобы ссылкой нельзя было увести переписку и контакты на чужой сервер).
   Чат недоступен (503 chat_disabled, 403, 404, сеть) — круглая кнопка и ссылки снова ведут на wa.me, как раньше. */
(function () {
  'use strict';
  if (window.__emChat) return;
  window.__emChat = 1;

  /* ---------- Тексты интерфейса (pt-BR). Для русского — добавить T.ru и выбрать по lang ---------- */
  var T = { pt: {
    open: 'Abrir chat com a Erika', close: 'Fechar chat', name: 'Erika Marques', online: 'online',
    erika: 'Erika', team: 'Equipe', you: 'Você', log: 'Conversa com a Erika',
    ph: 'Escreva sua mensagem…', phWait: 'Aguarde a resposta…', send: 'Enviar mensagem',
    connecting: 'Conectando…', offline: 'Sem conexão. Tentando de novo…',
    busy: 'Espere a resposta da mensagem anterior.', tooLong: 'Mensagem longa demais: até {n} caracteres.',
    rate: 'Calma, muitas mensagens. Tente de novo em {n} s.', restarted: 'A conversa foi reiniciada.',
    unavail: 'O chat está indisponível agora. Fale com a gente no WhatsApp.', waBtn: 'Escrever no WhatsApp',
    err: 'Não foi possível enviar. Tente de novo.', handoff: 'Passei para a equipe, já já respondem aqui',
    typing: 'Erika está digitando…', unread: 'mensagens novas', peekClose: 'Fechar aviso',
    fName: 'Nome', fWa: 'WhatsApp', fEmail: 'E-mail', fConsent: 'Aceito receber mensagens no WhatsApp e concordo com a ',
    policy: 'Política de Privacidade', submit: 'Enviar', sending: 'Enviando…', thanks: 'Obrigada!',
    required: 'Preencha este campo', too_short: 'Muito curto', too_long: 'Muito longo', invalid: 'Confira, por favor',
    consentErr: 'Marque a caixa para continuar', sendErr: 'Não deu para enviar. Tente de novo.',
    instr: 'Ver instruções de acesso'
  } };
  var L = T.pt;

  var d = document, html = d.documentElement, t0 = Date.now();
  var q = new URLSearchParams(location.search);
  var mq = window.matchMedia ? matchMedia('(max-width: 767px)') : { matches: false };
  var PAY = ['btn-pay-start', 'btn-pay-specialist', 'btn-pay-vip'];
  var MARKS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
  var CONSENT_VERSION = 'pt-2026-10-01';
  var WA_DEFAULT = 'https://wa.me/557187627227?text=Ol%C3%A1%21%20Vim%20do%20site%20do%20curso%20e%20tenho%20uma%20d%C3%BAvida.';

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
    open: false, unread: 0, greeting: null, greetDelay: 4000, gt: 0, greeted: false, greetEl: null,
    wrote: false, hasHistory: false, pend: null, lastFrom: '', opener: null, starting: null
  };

  /* ---------- Круглая кнопка (бывшая WhatsApp панели) ---------- */
  var btn = d.getElementById('sticky-cta-wa');
  if (!btn) {
    btn = el('a', 'sticky-cta__wa emc-solo');
    btn.href = WA_DEFAULT; btn.id = 'emc-fab';
    d.body.appendChild(btn);
  }
  var btnLabel = btn.getAttribute('aria-label') || '';
  var dot = el('span', 'emc-dot'), badge = el('span', 'emc-badge');
  dot.setAttribute('aria-hidden', 'true'); badge.setAttribute('aria-hidden', 'true'); badge.hidden = true;
  btn.appendChild(dot); btn.appendChild(badge);

  /* ---------- Подмена текстов на странице (в HTML ничего не меняем; при отказе чата — возвращаем) ---------- */
  var swaps = [];
  function swap(id, htmlText) {
    var e = d.getElementById(id);
    if (e) { swaps.push([e, e.innerHTML]); e.innerHTML = htmlText; }
  }
  function onMode(on) {
    html.classList.toggle('emc-on', on);
    btn.setAttribute('aria-label', on ? L.open : btnLabel);
    if (on) {
      btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-controls', 'emc'); btn.setAttribute('aria-expanded', S.open ? 'true' : 'false');
      if (!swaps.length) {
        swap('wa-pop-link', 'Есть вопрос? Напиши <b>Эрике</b>');
        swap('pb-wa-t', 'Напиши Эрике в&nbsp;чате');
        swap('pb-wa-btn', 'Открыть чат');
      }
    } else {
      ['aria-haspopup', 'aria-controls', 'aria-expanded'].forEach(function (a) { btn.removeAttribute(a); });
      swaps.forEach(function (s) { s[0].innerHTML = s[1]; });
      swaps = [];
    }
  }
  onMode(true);

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
  peek.innerHTML = '<button class="emc-peek__msg" type="button"><b></b><span></span></button>' +
    '<button class="emc-peek__x" type="button">' + SVG + '<path d="M18 6 6 18M6 6l12 12"/></svg></button>';
  peek.querySelector('b').textContent = L.erika;
  peek.querySelector('.emc-peek__x').setAttribute('aria-label', L.peekClose);
  d.body.appendChild(peek);

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
  function waBtn() {
    var a = linkBtn(btn.getAttribute('href') || WA_DEFAULT, L.waBtn);
    a.className = 'emc-cta emc-cta--wa';
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
    // эхо своей отправки уже нарисовано — привязываем, не дублируем
    if (ev.type === 'user' && S.pend && !S.pend.id &&
        ((S.pend.button_id && S.pend.button_id === ev.button_id) || (S.pend.text && S.pend.text === ev.text))) {
      S.pend.id = ev.id; return;
    }
    // приветствие уже показано виджетом — событие от greeting_shown не дублируем
    if (S.greetEl && !S.greetBound && ev.from === 'bot' && ev.type === 'text' && ev.text === S.greeting) {
      S.greetBound = 1; return;
    }
    render(ev);
    if (ev.from !== 'user' && ev.type !== 'user' && ev.type !== 'typing') {
      if (S.busy && (S.busyId == null || ev.id > S.busyId)) setBusy(false);
      if (!S.open && !hist && ev.type !== 'system') { S.unread++; badgeUp(); if (ev.text) peekShow(ev.text, ev.from); }
    }
    if (ev.type === 'handoff') setBusy(false);
  }

  var Q = [], qRun = false;
  function drain() {
    if (qRun) return;
    qRun = true;
    (function step() {
      var ev = Q.shift();
      if (!ev) { qRun = false; if (!S.busy) typing(false); return; }
      if (ev.type === 'typing') { if (!S.handoff) typing(true); step(); return; }
      var wait = ev.from === 'user' ? 0 : Math.min(Math.max(+ev.delay_ms || 0, 0), 5000);
      if (wait && typingEl.parentNode == null && ev.from === 'bot') typing(true);
      setTimeout(function () {
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
  function api(path, body, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var tm = ctl ? setTimeout(function () { ctl.abort(); }, ms || 15000) : 0;
    var opt = { method: body ? 'POST' : 'GET', signal: ctl ? ctl.signal : undefined };
    if (body) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
    return fetch(path === LEAD ? LEAD : API + path, opt).then(function (r) {
      clearTimeout(tm);
      return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j || {} }; });
    }, function () { clearTimeout(tm); return { s: 0, j: {} }; });
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
      if (r.s === 200 && r.j.session_id) { netOk(); applySession(r.j); return true; }
      if (r.s === 401 && body.session_id) { store('localStorage', 'em_chat_sid', null); return startSession(true); }
      if (r.s === 0 || r.s === 502 || r.s === 504 || (r.s === 503 && r.j.error !== 'chat_disabled') || r.s === 429) {
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
    S.greeted = false; S.greetEl = null; S.greetBound = 0; S.hasHistory = false;
    Q = []; feed.textContent = ''; setBusy(false);
  }
  function restart() {
    reset();
    S.ok = false; S.sid = null; store('localStorage', 'em_chat_sid', null); sync();
    return startSession(true).then(function (ok) { if (ok) note('emc-sys', L.restarted); return ok; });
  }

  function applySession(j) {
    if (S.sid && S.sid !== j.session_id) reset();
    S.sid = j.session_id; S.ok = true;
    store('localStorage', 'em_chat_sid', S.sid);
    if (j.chat_enabled === false) { fallback(); return; }
    var lim = j.limits || {};
    ta.maxLength = lim.max_chars > 0 ? lim.max_chars : 500;
    S.handoff = !!j.handoff;
    var evs = j.events || [], last = null;
    evs.forEach(function (ev) { if (accept(ev)) { show(ev, true); if (ev.type !== 'typing') last = ev; } });
    if (evs.length) S.hasHistory = true;
    if (j.last_event_id > S.lastId) S.lastId = j.last_event_id;
    // последний — непрочитанный ответом вопрос человека: ждём ответ
    if (last && last.type === 'user' && !S.handoff) { setBusy(true, last.id); typing(true); }
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
    S.gt = setTimeout(greetShow, Math.max(0, S.greetDelay - (Date.now() - t0)));
  }
  function greetShow() {
    clearTimeout(S.gt);
    if (!S.greeting || S.hasHistory || S.wrote || S.greeted || S.off || !S.ok) return;
    S.greeted = true; S.hasHistory = true;
    show({ from: 'bot', type: 'text', text: S.greeting });
    S.greetEl = true;   // ставим ПОСЛЕ show: событие с тем же текстом из ленты дальше не дублируется
    var g = S.gen;
    api('/greeting_shown', { session_id: S.sid }).then(function (r) {
      if (g === S.gen && r.j.event && r.j.event.id != null) { S.seen[r.j.event.id] = 1; S.greetBound = 1; }
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
  d.addEventListener('visibilitychange', function () { if (!d.hidden) poll(); });

  /* ---------- Отправка ---------- */
  function send(payload, echo) {
    if (!S.ok || S.off || S.busy || S.sending) return false;
    if (Date.now() < S.rateUntil) return false;
    S.wrote = true; clearTimeout(S.gt);
    say('');
    var body = { session_id: S.sid, client_msg_id: uuid(), page_url: location.href };
    if (payload.button_id) body.button_id = payload.button_id; else body.text = payload.text;
    var b = bubble('user', echo);
    if (payload.button_id) closeButtons();
    S.pend = { el: b, text: payload.text, button_id: payload.button_id, id: null };
    S.hasHistory = true;
    S.sending = true; sync();
    var tries = 0, g = S.gen;
    function undo(msg) {
      if (b.parentNode) b.parentNode.removeChild(b);
      S.lastFrom = ''; S.pend = null;
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
          if (id != null) { S.seen[id] = 1; if (S.pend) S.pend.id = id; }
          S.pend = null;
          if (!S.handoff) setBusy(true, id); else sync();
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
        if (r.s === 503) { undo(L.unavail); waBtn(); sync(); return; }
        undo(L.err); sync();
      });
    })();
    return true;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = ta.value.replace(/\s+$/, '').replace(/^\s+/, '');
    if (!text || sendB.disabled) return;
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
    var cs = getComputedStyle(btn), r = btn.getBoundingClientRect();
    return cs.visibility === 'visible' && +cs.opacity > 0.5 && r.width > 0 && r.bottom <= innerHeight + 1;
  }
  function peekPlace() {
    if (peek.hidden) return;
    var r = btn.getBoundingClientRect();
    peek.style.right = Math.max(12, innerWidth - r.right) + 'px';
    peek.style.bottom = (innerHeight - r.top + 12) + 'px';
  }
  var peekText = '';
  function peekShow(text, from) {
    if (store('sessionStorage', 'em_chat_peek_off') || S.open) return;
    peekText = text;
    peek.querySelector('span').textContent = text;
    if (from) peek.querySelector('b').textContent = from === 'manager' ? L.team : L.erika;
    if (!btnVisible()) return;   // кнопка ещё спрятана (самый верх страницы) — покажем после прокрутки
    peek.hidden = false;
    html.classList.add('emc-peek-on');
    peekPlace();
  }
  function peekHide() { peek.hidden = true; peekText = ''; html.classList.remove('emc-peek-on'); }
  window.addEventListener('scroll', function () {
    if (peekText && peek.hidden && !S.open && btnVisible()) peekShow(peekText);
  }, { passive: true });
  window.addEventListener('resize', peekPlace);
  peek.querySelector('.emc-peek__msg').addEventListener('click', function () { openChat(btn); });
  peek.querySelector('.emc-peek__x').addEventListener('click', function () {
    store('sessionStorage', 'em_chat_peek_off', '1'); peekHide();
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
    S.open = true;
    store('sessionStorage', 'em_chat_open', '1');
    panel.hidden = false;
    var m = mq.matches;
    if (m) panel.setAttribute('aria-modal', 'true'); else panel.removeAttribute('aria-modal');
    html.classList.add('emc-open');
    html.classList.toggle('emc-lock', m);
    btn.setAttribute('aria-expanded', 'true');
    S.unread = 0; badgeUp(); peekHide();
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

  // Все ссылки wa.me (кроме подвала #b12 и запасной кнопки в самом чате) открывают чат
  d.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href*="wa.me"]') : null;
    if (!a || a.closest('#b12') || a.closest('#emc')) return;
    if (S.off || (!S.ok && S.net >= 2)) return;   // чат недоступен — пусть открывается WhatsApp
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    if (a === btn && S.open) closeChat(); else openChat(a);
  }, true);

  /* ---------- Отказ чата: всё как раньше (wa.me) ---------- */
  function fallback() {
    if (S.off) return;
    S.off = true; S.ok = false; S.gen++;
    clearTimeout(S.gt); typing(false); peekHide(); banner(false);
    onMode(false);
    badge.hidden = true;
    if (S.open) { say(''); note('emc-sys', L.unavail); waBtn(); }
    sync();
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
