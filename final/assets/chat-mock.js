/* Демо-режим веб-чата (?chat=mock): без бэкенда, для превью на GitHub Pages.
   Подменяет fetch для /api/chat/* и /api/lead и сам играет тот же сценарий, что chat-mock/server.py
   (контракт API v1): ответ по ключевым словам (PT и RU): «comprar|quero|хочу купить|купить|оплат» → кнопки тарифов → после выбора cta со ссылкой
   оплаты (только после явного выбора тарифа); «preço|valor|цена|сколько» → цены 299/399/599; «garantia|гарантия» → 7 дней; «iphone» → правила подарка;
   «oi|olá|привет|здравствуйте» → приветствие; «humano» → handoff; всё остальное → одна нейтральная фраза (не ссылка и не форма).
   Просьб оставить контакт демо не шлёт.
   Состояние — в localStorage (em_chat_mock_v1), поэтому перезагрузка восстанавливает историю.
   Отладка из консоли: emChatMock.paid() — событие paid; emChatMock.disable(true|false[, 502]) — 503 chat_disabled (или 502);
   emChatMock.reset() — стереть демо-переписку; emChatMock.force('form'|'form_only') — следующий ответ «text + contact_form» (проверка флага CONTACT_FORM).
   Приветствие — ТОЛЬКО тестовое. */
(function () {
  'use strict';
  var KEY = 'em_chat_mock_v1';
  var GREETING = 'Oi! Aqui é a Erika 🤍 Ficou com alguma dúvida? É só escrever aqui que eu respondo';
  var LIMITS = { max_chars: 500, daily_messages: 30 };
  var PLANS = {
    plan_start: ['start', 'Start', 'https://go.hotmart.com/U107829757Q?ap=25dd'],
    plan_especialista: ['especialista', 'Especialista', 'https://go.hotmart.com/U107829757Q?ap=227b'],
    plan_vip: ['vip', 'VIP', 'https://go.hotmart.com/U107829757Q?ap=51de']
  };
  var FU_TEXT = 'Oi! 🤍 Vi que você estava olhando os planos. Se ficou com alguma dúvida, é só me chamar aqui. Quem fechar nas próximas 3 horas ainda leva os presentes!';
  var WB_TEXT = 'Que bom que você voltou! 🤍 Ficou com alguma dúvida sobre os planos? É só me chamar aqui.';
  var DB = load(), waiters = [], realFetch = window.fetch.bind(window);

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { s: {}, off: false }; } catch (e) { return { s: {}, off: false }; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { /* приватный режим */ } }
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function sign(u) { return 'v1.' + u + '.mock' + u.replace(/-/g, '').slice(0, 12); }
  function sess(token) {
    var p = String(token || '').split('.');
    return p.length === 3 && sign(p[1]) === token ? DB.s[p[1]] || null : null;
  }
  function fold(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function rnd(a, b) { return a + Math.floor(Math.random() * (b - a)); }
  function wake() { var w = waiters; waiters = []; w.forEach(function (f) { f(); }); }
  function push(s, from, type, delay, extra) {
    var ev = { id: s.next++, ts: new Date().toISOString(), from: from, type: type, delay_ms: delay || 0 };
    for (var k in extra) ev[k] = extra[k];
    s.events.push(ev);
    if (type === 'buttons') extra.buttons.forEach(function (b) { s.buttons[b.id] = b.title; });
    save(); wake();
    return ev;
  }

  function words(t) { return fold(t).match(/[a-zа-я0-9]+/g) || []; }
  function K(a) { return a.map(fold); }
  function pre(ws, ps) { return ws.some(function (w) { return ps.some(function (p) { return w.indexOf(p) === 0; }); }); }
  function phrase(ws, list) { var j = ' ' + ws.join(' ') + ' '; return list.some(function (p) { return j.indexOf(' ' + fold(p) + ' ') >= 0; }); }
  var KW_HANDOFF = K(['human', 'atendente', 'менеджер', 'оператор']);
  var KW_BUY = K(['compr', 'pagar', 'pagament', 'assinar', 'matricul', 'inscrev', 'оплат', 'куп', 'покуп', 'приобр']);
  var KW_PRICE = K(['preco', 'valor', 'quanto', 'custa', 'цен', 'стоим', 'сколько', 'почем', 'прайс']);
  var KW_GUARANTEE = K(['garantia', 'гарант', 'reembolso', 'возврат']);
  var KW_IPHONE = K(['iphone', 'айфон', 'sorteio', 'розыгрыш']);
  var KW_HELLO = K(['oi', 'oii', 'ola', 'hey', 'hello', 'hi', 'привет', 'здравствуйте', 'здравствуй']);
  var PLAN_WORDS = { plan_start: K(['start', 'старт']), plan_especialista: K(['especialista', 'специалист']), plan_vip: K(['vip', 'вип']) };
  var QUERO_NOT_BUY = K(['saber', 'entender', 'conhecer', 'ver', 'perguntar', 'tirar', 'falar', 'mais', 'uma', 'um', 'duvida']);
  var NEUTRAL = 'Não entendi bem 🙈 Pode me contar com outras palavras? Posso te ajudar com preço, conteúdo do curso e pagamento.';
  var PLAN_BUTTONS = [{ id: 'plan_start', title: 'Start' }, { id: 'plan_especialista', title: 'Especialista' }, { id: 'plan_vip', title: 'VIP' }];

  function isBuy(ws) {
    if (pre(ws, KW_BUY)) return true;
    return ws.some(function (w, i) { return w === 'quero' && (i + 1 >= ws.length || QUERO_NOT_BUY.indexOf(ws[i + 1]) < 0); });
  }
  function planEvents(bid, u) {
    var p = PLANS[bid];
    return [['text', 0, { text: 'Ótima escolha! O plano ' + p[1] + ' é perfeito para começar com o pé direito.' }],
      ['cta', rnd(600, 1200), { text: 'É só tocar no botão para garantir sua vaga:', title: 'Quero o ' + p[1],
        url: p[2] + '&sck=web-' + u.replace(/-/g, '').slice(0, 16), plan: p[0] }]];
  }
  // Ответ «Эрики» по ключевым словам → [[type, delay_ms, поля]]. Ссылка оплаты — только после явного выбора тарифа (как в chat-mock/server.py)
  function script(text, bid, u) {
    if (bid && PLANS[bid]) return planEvents(bid, u);
    var ws = words(text);
    if (pre(ws, KW_HANDOFF)) return [['handoff', 0, { text: 'Passei para a equipe, já já respondem aqui' }]];
    var buy = isBuy(ws), named = Object.keys(PLAN_WORDS).filter(function (k) { return pre(ws, PLAN_WORDS[k]); });
    if (buy && named.length === 1) return planEvents(named[0], u);
    if (pre(ws, KW_PRICE)) {
      return [['text', 0, { text: 'Os planos são:\nStart — R$ 299\nEspecialista — R$ 399\nVIP — R$ 599\nÉ à vista ou em até 12x no cartão 🤍' }],
        ['buttons', rnd(600, 1200), { text: 'Qual deles combina mais com você?', buttons: PLAN_BUTTONS }]];
    }
    if (buy) return [['buttons', 0, { text: 'Que bom! 🤍 Qual plano você quer?', buttons: PLAN_BUTTONS }]];
    if (pre(ws, KW_GUARANTEE)) return [['text', 0, { text: 'Tem sim! 🤍 São 7 dias de garantia: se o curso não for para você, devolvo 100% do valor, sem precisar explicar o motivo.' }]];
    if (pre(ws, KW_IPHONE)) {
      return [['text', 0, { text: 'Tem sim! 🎁 Você ganha pontos pelas aulas e tarefas, e as três alunas com mais pontos no fim do curso ganham um iPhone.' }],
        ['text', rnd(600, 1200), { text: 'Isso vale para os planos Especialista e VIP.' }]];
    }
    if (pre(ws, KW_HELLO) || phrase(ws, ['bom dia', 'boa tarde', 'boa noite', 'добрый день', 'добрый вечер', 'доброе утро'])) {
      return [['text', 0, { text: 'Oi! 🤍 Que bom te ver por aqui. O que você quer saber sobre o curso?' }]];
    }
    return [['text', 0, { text: NEUTRAL }]];
  }

  function reply(u, ev) {
    setTimeout(function () {
      var s = DB.s[u];
      if (!s) return;
      if (s.handoff) {
        push(s, 'manager', 'text', 0, { text: 'Oi, aqui é a equipe da Erika. Já vi sua mensagem, me conta mais?' });
      } else {
        var force = DB.force; DB.force = null;
        var evs;
        if (force) {   // только для автотестов флага CONTACT_FORM
          var form = ['contact_form', rnd(600, 1200), { text: 'Me deixa seu contato? Assim eu te mando os detalhes e não perco você de vista.', title: 'Seu contato' }];
          evs = force === 'form_only' ? [form] : [['text', 0, { text: 'Adorei conversar com você!' }], form];
        } else evs = script(ev.text || '', ev.button_id, u);
        evs.forEach(function (e) {
          if (e[0] === 'handoff') s.handoff = true;
          push(s, 'bot', e[0], e[1], e[2]);
        });
      }
      s.busy = false; save(); wake();
    }, rnd(1500, 3000));
  }

  function route(method, url, b) {
    var path = url.pathname, qs = url.searchParams, s, t = Date.now();
    if (path.slice(-9) === '/api/lead') { (DB.leads = DB.leads || []).push(b); save(); return [200, { ok: true }]; }
    if (DB.off) return DB.offCode === 502 ? [502, { error: 'bad_gateway' }] : [503, { error: 'chat_disabled' }];
    var ep = path.replace(/^.*\/api\/chat/, '');
    if (method === 'GET' && ep === '/events') {
      s = sess(qs.get('session_id'));
      if (!s) return [401, { error: 'bad_session' }];
      var after = +qs.get('after') || 0, wait = Math.min(25, +(qs.get('wait') || 25)) * 1000, end = t + wait;
      return new Promise(function (res) {
        (function check() {
          s = sess(qs.get('session_id'));
          var evs = s ? s.events.filter(function (e) { return e.id > after; }).slice(0, 200) : [];
          if (evs.length || Date.now() >= end || DB.off || !s) {
            var last = s && s.events.length ? s.events[s.events.length - 1].id : 0;
            return res([200, { events: evs, last_id: Math.max(last, evs.length ? 0 : after), handoff: !!(s && s.handoff), chat_enabled: !DB.off }]);
          }
          waiters.push(check);
          setTimeout(function () { var i = waiters.indexOf(check); if (i >= 0) { waiters.splice(i, 1); check(); } }, end - Date.now());
        })();
      });
    }
    if (method !== 'POST' || !b) return [404, { error: 'not_found' }];
    if (ep === '/session') {
      s = b.session_id ? sess(b.session_id) : null;
      var existing = !!s;
      if (!s) {
        var u = uuid();
        s = DB.s[u] = { u: u, events: [], next: 1, busy: false, handoff: false, greeted: 0, msgs: {}, min: [], count: 0, name: null, buttons: {} };
        save();
      }
      var out = { session_id: sign(s.u), chat_enabled: true, greeting: GREETING, greeting_delay_ms: 4000, limits: LIMITS,
        events: [], last_event_id: 0, handoff: s.handoff };
      // дожим v2.2 (только для проверки виджета): ?followup=1 → enabled, delay_s 3; ?followup=0 → выключен; без параметра поля нет, как у старого бэкенда
      var pg = String(b.page_url || '');
      if (existing && /[?&]welcomeback=1(&|$)/.test(pg) && s.count > 0 && !s.handoff && !s.wb) {   // ?welcomeback=1: «с возвращением» при повторном заходе
        s.wb = true; push(s, 'bot', 'text', 0, { text: WB_TEXT, meta: { welcome_back: true } });
      }
      out.events = s.events.slice(-200); out.last_event_id = s.events.length ? s.events[s.events.length - 1].id : 0;
      if (/[?&]followup=1(&|$)/.test(pg)) out.followup = { enabled: true, delay_s: 3 };
      else if (/[?&]followup=0(&|$)/.test(pg)) out.followup = { enabled: false, delay_s: 20 };
      return [200, out];
    }
    s = sess(b.session_id);
    if (!s) return [401, { error: 'bad_session' }];
    if (ep === '/greeting_shown') {
      var g = s.events.filter(function (e) { return e.id === s.greeted; })[0];
      if (!g) {
        if (s.events.some(function (e) { return e.from === 'user'; })) return [200, { event: null }];
        g = push(s, 'bot', 'text', 0, { text: GREETING }); s.greeted = g.id; save();
      }
      return [200, { event: g }];
    }
    if (ep === '/followup') {
      if (s.count === 0 || s.handoff || s.fu || b.reason !== 'closed') return [200, { followup: null }];
      s.fu = true;
      var fev = push(s, 'bot', 'text', 0, { text: FU_TEXT, meta: { followup: true } });
      return [200, { followup: { text: FU_TEXT, event: fev } }];
    }
    if (ep === '/event') { (DB.analytics = DB.analytics || []).push({ kind: b.kind, session: s.u }); save(); return [200, { ok: true }]; }
    if (ep === '/contact') {
      if (b.consent !== true) return [422, { error: 'consent_required' }];
      s.name = String(b.name || '').split(' ')[0].slice(0, 40); save();
      return [200, { ok: true }];
    }
    if (ep === '/message') {
      if (!b.client_msg_id || (b.text == null) === (b.button_id == null)) return [400, { error: 'bad_request' }];
      if (s.msgs[b.client_msg_id]) return [200, { accepted: true, event_id: s.msgs[b.client_msg_id] }];
      if (b.text != null && String(b.text).length > LIMITS.max_chars) return [413, { error: 'too_long', max_chars: LIMITS.max_chars }];
      if (b.button_id != null && !s.buttons[b.button_id]) return [400, { error: 'bad_request' }];
      if (s.busy) return [409, { error: 'busy' }];
      s.min = s.min.filter(function (x) { return t - x < 60000; });
      if (s.min.length >= 4) return [429, { error: 'rate_limited', retry_after: Math.ceil((60000 - (t - s.min[0])) / 1000), scope: 'session' }];
      s.min.push(t); s.count++;
      var ev = push(s, 'user', 'user', 0, b.text != null ? { text: b.text } : { button_id: b.button_id, title: s.buttons[b.button_id] });
      s.msgs[b.client_msg_id] = ev.id;
      if (!s.handoff) { s.busy = true; push(s, 'bot', 'typing', 0, {}); }
      save();
      reply(s.u, ev);
      return [202, { accepted: true, event_id: ev.id }];
    }
    return [404, { error: 'not_found' }];
  }

  // Перезагрузили страницу, пока «бот думал»: досказываем ответ
  Object.keys(DB.s).forEach(function (u) {
    var s = DB.s[u], last = s.events.filter(function (e) { return e.type !== 'typing'; }).pop();
    if (s.busy || (last && last.from === 'user' && !s.handoff)) { s.busy = true; reply(u, last); }
  });

  window.fetch = function (input, init) {
    var url;
    try { url = new URL(typeof input === 'string' ? input : input.url, location.href); } catch (e) { return realFetch(input, init); }
    if (!/\/api\/(chat\/|lead$)/.test(url.pathname)) return realFetch(input, init);
    var method = (init && init.method) || 'GET', body = null;
    try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = undefined; }
    if (body === undefined) return Promise.resolve(new Response('{"error":"bad_request"}', { status: 400 }));
    return Promise.resolve(route(method, url, body)).then(function (r) {
      return new Response(JSON.stringify(r[1]), { status: r[0], headers: { 'Content-Type': 'application/json' } });
    });
  };

  window.emChatMock = {
    paid: function () {
      var ids = Object.keys(DB.s), s = DB.s[ids[ids.length - 1]];
      if (s) push(s, 'system', 'paid', 0, { text: 'Pagamento confirmado! Bem-vinda ao curso 🤍', title: 'Parabéns!', instruction_url: 'https://example.com/instrucao-de-acesso' });
    },
    disable: function (on, code) { DB.off = on !== false; DB.offCode = code === 502 ? 502 : 503; save(); wake(); },
    reset: function () { DB = { s: {}, off: false }; save(); },
    force: function (mode) { DB.force = mode === 'form' || mode === 'form_only' ? mode : null; save(); }
  };
})();
