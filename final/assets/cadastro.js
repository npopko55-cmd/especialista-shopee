/* Especialista em Shopee — страница сбора данных плана Б (cadastro.html). Чистый JS, без библиотек.
   Проверка полей (как в site-pt), маска телефона «11 91234-5678», отправка в POST /api/lead,
   после успеха — переход на продающий сайт (адрес из <meta name="em-next">, к нему — метки из ссылки и lead=1).
   API недоступен (сеть, 404, 429, 5xx…) или страница открыта не на боевом домене — человека не держим:
   заявка молча ложится в localStorage (em_lead_pending), переход всё равно происходит.
   Ошибки 400/422 по полям показываются у полей. */
(function () {
  'use strict';

  var form = document.getElementById('lead-form');
  if (!form) return;

  // Тексты — из site-pt (T.pt), плюс ошибка галочки и состояние отправки.
  var T = {
    required: 'Preencha este campo',
    too_short: 'Muito curto',
    too_long: 'Muito longo',
    invalid: 'Confira, por favor',
    consent: 'Marque a caixa para continuar',
    sending: 'Enviando…'
  };
  var PROD_HOSTS = ['curso.ericamarques.com', 'ericamarques.com', 'www.ericamarques.com'];
  var CONSENT_VERSION = 'pt-2026-09-30';
  var PENDING_KEY = 'em_lead_pending';
  var MARKS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];

  function meta(name) {
    var m = document.querySelector('meta[name="' + name + '"]');
    return m ? (m.getAttribute('content') || '').trim() : '';
  }
  var PAGE = meta('em-page') || 'planb-cadastro';
  var query = new URLSearchParams(location.search);

  var order = ['name', 'whatsapp', 'email', 'terms'];
  var fields = {
    name: document.getElementById('f-name'),
    whatsapp: document.getElementById('f-whatsapp'),
    email: document.getElementById('f-email'),
    terms: document.getElementById('f-consent')
  };
  var errBox = {
    name: document.getElementById('err-name'),
    whatsapp: document.getElementById('err-whatsapp'),
    email: document.getElementById('err-email'),
    terms: document.getElementById('err-consent')
  };
  var trap = document.getElementById('f-website');
  var button = form.querySelector('button[type="submit"]');
  var label = button.querySelector('.cad-submit__label') || button;
  var labelIdle = label.textContent;
  var busy = false;

  // Галочка обязательна, пока на форме не стоит data-optin-required="0" (читаем при каждой отправке).
  function optinRequired() { return form.getAttribute('data-optin-required') !== '0'; }

  /* ---------- Ошибки ---------- */
  function setError(key, message) {
    var input = fields[key];
    var box = errBox[key];
    if (box) box.textContent = message || '';
    var holder = input && input.closest('.cad-field, .cad-consent');
    if (holder) holder.classList.toggle('is-bad', !!message);
    if (!input) return;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function messageFor(key, code) {
    if (key === 'terms') return T.consent;
    return T[code] || T.invalid;
  }

  // Показать ошибки и поставить фокус на первое поле с ошибкой. Возвращает true, если было что показать.
  function showErrors(errors) {
    var first = null;
    order.forEach(function (key) {
      if (!errors || !errors[key]) return;
      setError(key, messageFor(key, errors[key]));
      if (!first) first = fields[key];
    });
    if (first) {
      try { first.focus({ preventScroll: false }); } catch (e) { first.focus(); }
    }
    return !!first;
  }

  ['name', 'whatsapp', 'email'].forEach(function (key) {
    fields[key].addEventListener('input', function () { if (errBox[key].textContent) setError(key, ''); });
  });
  fields.terms.addEventListener('change', function () { if (fields.terms.checked) setError('terms', ''); });

  /* ---------- Маска телефона: «11 91234-5678» (DDD + 8 или 9 цифр, всего до 11) ---------- */
  var tel = fields.whatsapp;
  var lastDigits = '';

  function digitsOf(s) { return String(s || '').replace(/\D/g, ''); }

  // Убираем то, что люди добавляют сами: 0 перед DDD и код страны 55 (при вставке «+55 11 …»).
  function normalize(raw) {
    var front = 0;
    var zeros = raw.match(/^0+/);
    if (zeros) { front += zeros[0].length; raw = raw.slice(zeros[0].length); }
    if (raw.length > 11 && raw.slice(0, 2) === '55') { front += 2; raw = raw.slice(2); }
    return { d: raw.slice(0, 11), front: front };
  }

  function format(d) {
    if (d.length <= 2) return d;
    var ddd = d.slice(0, 2);
    var rest = d.slice(2);
    if (rest.length <= 4) return ddd + ' ' + rest;
    var cut = rest.length > 8 ? 5 : 4;   // 9 цифр после DDD → 91234-5678, до 8 → 1234-5678
    return ddd + ' ' + rest.slice(0, cut) + '-' + rest.slice(cut);
  }

  function caretAfterDigits(str, n) {
    if (n <= 0) return 0;
    var seen = 0;
    for (var i = 0; i < str.length; i++) {
      if (str.charAt(i) >= '0' && str.charAt(i) <= '9') {
        seen++;
        if (seen === n) return i + 1;
      }
    }
    return str.length;
  }

  function applyMask(e) {
    var value = tel.value;
    var pos = typeof tel.selectionStart === 'number' ? tel.selectionStart : value.length;
    var before = digitsOf(value.slice(0, pos)).length;
    var raw = digitsOf(value);
    // Backspace по пробелу или дефису: цифры не изменились — стираем цифру перед курсором.
    if (e && e.inputType === 'deleteContentBackward' && raw === lastDigits && before > 0) {
      raw = raw.slice(0, before - 1) + raw.slice(before);
      before -= 1;
    }
    var n = normalize(raw);
    before = Math.min(Math.max(0, before - n.front), n.d.length);
    var out = format(n.d);
    lastDigits = n.d;
    if (out === value) return;
    tel.value = out;
    if (document.activeElement === tel) {
      var at = caretAfterDigits(out, before);
      try { tel.setSelectionRange(at, at); } catch (x) { /* поле без выделения */ }
    }
  }
  tel.addEventListener('input', applyMask);
  tel.addEventListener('change', function () { applyMask(null); });
  if (tel.value) applyMask(null);   // автозаполнение до загрузки скрипта

  /* ---------- Проверка ---------- */
  function validate(values) {
    var errors = {};
    var digits = normalize(digitsOf(values.whatsapp)).d;
    var allDigits = digitsOf(values.whatsapp);
    if (!values.name) errors.name = 'required';
    else if (values.name.length < 2) errors.name = 'too_short';
    else if (values.name.length > 100) errors.name = 'too_long';
    if (!allDigits) errors.whatsapp = 'required';
    else if (digits.length < 10) errors.whatsapp = 'too_short';
    else if (digits.length > 11) errors.whatsapp = 'too_long';
    if (!values.email) errors.email = 'required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) errors.email = 'invalid';
    if (optinRequired() && !fields.terms.checked) errors.terms = 'required';
    return errors;
  }

  /* ---------- Отправка: состояние, запасной путь, переход ---------- */
  function lock(on) {
    busy = on;
    button.disabled = on;
    button.setAttribute('aria-busy', on ? 'true' : 'false');
    label.textContent = on ? T.sending : labelIdle;
  }
  // Вернулись «Назад» из кэша браузера — кнопка снова доступна.
  window.addEventListener('pageshow', function (e) { if (e.persisted) lock(false); });

  function onProdHost() {
    return PROD_HOSTS.indexOf(String(location.hostname).toLowerCase()) !== -1;
  }

  function savePending(payload, reason) {
    try {
      var rec = {};
      Object.keys(payload).forEach(function (k) { rec[k] = payload[k]; });
      rec.saved_at = new Date().toISOString();
      rec.reason = reason;
      window.localStorage.setItem(PENDING_KEY, JSON.stringify(rec));
    } catch (e) { /* приватный режим или запрет хранилища — переходим без сохранения */ }
  }

  // Адрес продающего сайта: meta em-next (относительно этой страницы) + метки текущей ссылки + lead=1.
  function nextUrl() {
    var target = meta('em-next') || 'index.html';
    try {
      var url = new URL(target, location.href);
      query.forEach(function (value, key) {
        if (key !== 'lead' && !url.searchParams.has(key)) url.searchParams.append(key, value);
      });
      url.searchParams.set('lead', '1');
      return url.href;
    } catch (e) {
      return target + (target.indexOf('?') === -1 ? '?' : '&') + 'lead=1';
    }
  }

  function go() {
    location.replace(nextUrl());
  }

  function hasFieldErrors(errors) {
    return !!errors && order.some(function (key) { return !!errors[key]; });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (busy) return;

    order.forEach(function (key) { setError(key, ''); });
    applyMask(null);

    var values = {
      name: fields.name.value.trim(),
      whatsapp: fields.whatsapp.value.trim(),
      email: fields.email.value.trim()
    };
    var errors = validate(values);
    if (Object.keys(errors).length) { showErrors(errors); return; }

    // terms всегда true: отправка формы = принятие условий (как в site-pt); галочка — согласие на сообщения.
    var payload = {
      name: values.name,
      whatsapp: values.whatsapp,
      email: values.email,
      terms: true,
      whatsapp_optin: !!fields.terms.checked,
      consent_version: CONSENT_VERSION,
      lang: 'pt',
      page: PAGE,
      referrer: document.referrer || '',
      website: trap ? trap.value : ''
    };
    MARKS.forEach(function (key) { payload[key] = query.get(key) || ''; });

    lock(true);

    if (!onProdHost()) { savePending(payload, 'host'); go(); return; }

    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 15000) : null;

    fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        return response.json()
          .catch(function () { return {}; })
          .then(function (data) { return { status: response.status, data: data || {} }; });
      })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if (res.status === 200 && res.data.ok !== false) { go(); return; }
        if ((res.status === 400 || res.status === 422) && hasFieldErrors(res.data.errors)) {
          lock(false);
          showErrors(res.data.errors);
          return;
        }
        savePending(payload, 'http-' + res.status);
        go();
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        savePending(payload, 'network');
        go();
      });
  });
})();
