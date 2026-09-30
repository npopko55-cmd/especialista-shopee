/* Especialista em Shopee — поведение блоков 6А–12 (исполнитель B), раунды 4–6. Без библиотек.
   Тарифы больше не карусель (три карточки друг под другом) — скрипт для них не нужен.
   Блок 7: восемь карточек модулей одной высоты в закрытом виде. Высоту берём по самой высокой
   закрытой карточке и ставим всем как min-height; открытая карточка просто растёт вниз.
   Раунд 6: в карточке модуля 0 над строкой «Уроки» стоит подсказка-выноска — её высоту в общую
   высоту не считаем (иначе все 8 карточек выросли бы на её строку), а добавляем только своей карточке. */
(() => {
  'use strict';
  const cards = Array.from(document.querySelectorAll('#b7 .b7-card'));
  if (cards.length < 2) return;
  const extra = c => {
    const h = c.querySelector('.b7-hint');
    if (!h || !h.getClientRects().length) return 0;
    /* верхний отступ выноски — auto (забирает свободную высоту), его не считаем */
    return h.getBoundingClientRect().height + parseFloat(getComputedStyle(h).marginBottom);
  };
  const fit = () => {
    cards.forEach(c => { c.style.minHeight = ''; });
    const closed = cards.filter(c => !c.querySelector('details[open]'));
    const h = Math.max(0, ...closed.map(c => c.getBoundingClientRect().height - extra(c)));
    if (h > 0) cards.forEach(c => { c.style.minHeight = Math.ceil(h + extra(c)) + 'px'; });
  };
  fit();
  window.addEventListener('load', fit, { once: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit).catch(() => {});
  let t = 0;
  let w = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === w) return;
    w = window.innerWidth;
    clearTimeout(t);
    t = setTimeout(fit, 150);
  });
})();

/* Раунд 6 (Лиза 30.09): подсказка говорит «Нажми на модуль», и люди жмут на слово или на карточку, а не на кнопку «Уроки».
   Карточка модуля целиком раскрывает и сворачивает список уроков; кнопка «Уроки», ссылки и сам список работают как раньше. */
(() => {
  'use strict';
  document.querySelectorAll('#b7 .b7-card').forEach(card => {
    const d = card.querySelector('details');
    if (!d) return;
    card.addEventListener('click', e => {
      if (e.target.closest('summary, a, button, .b7-lessons')) return;   /* summary откроет себя сам */
      const sel = window.getSelection && window.getSelection();
      if (sel && String(sel).length > 0) return;                        /* выделяют текст — не трогаем */
      d.open = !d.open;
    });
  });
})();

/* Раунд 9 (планшет и десктоп). На телефоне ничего не делает: инлайн-стили ставятся только при нужной ширине.
   1) Блок 7 (≥ 768): карточки модулей «ёлочкой» в две колонки, кружки — на общем рельсе по центру.
      Рельс (.b7-map::before) — от центра первого кружка до центра последнего: --rail-top / --rail-h.
      Карточки «ёлочки» — все восемь одной высоты, включая модуль 0 с подсказкой (на телефоне модуль 0 выше на строку подсказки).
   2) Тарифы (≥ 1024): три карточки в ряд — название, подзаголовок и цена одной высоты, кнопки «Оплатить» на одной линии. */
(() => {
  'use strict';
  const mq768 = window.matchMedia('(min-width: 768px)');
  const mq1024 = window.matchMedia('(min-width: 1024px)');
  const map = document.querySelector('#b7 .b7-map');
  let railSet = false;
  const rail = () => {
    if (!map) return;
    if (!mq768.matches) {
      if (railSet) { map.style.removeProperty('--rail-top'); map.style.removeProperty('--rail-h'); railSet = false; }
      return;
    }
    const dots = map.querySelectorAll('.b7-dot');
    if (dots.length < 2) return;
    const m = map.getBoundingClientRect(), a = dots[0].getBoundingClientRect(), b = dots[dots.length - 1].getBoundingClientRect();
    map.style.setProperty('--rail-top', Math.round(a.top + a.height / 2 - m.top) + 'px');
    map.style.setProperty('--rail-h', Math.max(0, Math.round(b.top - a.top)) + 'px');
    railSet = true;
  };
  /* высота — по самой высокой ЗАКРЫТОЙ карточке (min-height уже поставил первый скрипт); открытая растёт вниз */
  const mods = Array.from(document.querySelectorAll('#b7 .b7-card'));
  const evenMods = () => {
    if (!mq768.matches || mods.length < 2) return;
    const closed = mods.filter(c => !c.querySelector('details[open]'));
    const h = Math.max(0, ...closed.map(c => c.getBoundingClientRect().height));
    if (h > 0) mods.forEach(c => { c.style.minHeight = Math.ceil(h) + 'px'; });
  };
  const cards = Array.from(document.querySelectorAll('#tariffs .t8-card'));
  const groups = ['.t8-name', '.t8-sub', '.t8-price'].map(s => cards.map(c => c.querySelector(s)).filter(Boolean));
  let evenSet = false;
  const even = () => {
    if (evenSet) { groups.flat().forEach(e => { e.style.minHeight = ''; }); evenSet = false; }
    if (!mq1024.matches || cards.length < 2) return;
    groups.forEach(g => {
      const h = Math.max(...g.map(e => e.getBoundingClientRect().height));
      g.forEach(e => { e.style.minHeight = Math.ceil(h) + 'px'; });
    });
    evenSet = true;
  };
  const all = () => { even(); evenMods(); rail(); };
  all();
  window.addEventListener('load', all, { once: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(all).catch(() => {});
  if (map) map.addEventListener('toggle', rail, true);   /* открыли/закрыли уроки — рельс заново */
  let t = 0;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(all, 220); });   /* после выравнивания карточек блока 7 (150 мс) */
})();
