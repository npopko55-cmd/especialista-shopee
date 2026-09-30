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
