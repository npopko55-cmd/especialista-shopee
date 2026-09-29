/* Especialista em Shopee — поведение блоков 6А–12 (исполнитель B), раунд 4. Без библиотек.
   Тарифы больше не карусель (три карточки друг под другом) — скрипт для них не нужен.
   Блок 7: восемь карточек модулей одной высоты в закрытом виде. Высоту берём по самой высокой
   закрытой карточке и ставим всем как min-height; открытая карточка просто растёт вниз. */
(() => {
  'use strict';
  const cards = Array.from(document.querySelectorAll('#b7 .b7-card'));
  if (cards.length < 2) return;
  const fit = () => {
    cards.forEach(c => { c.style.minHeight = ''; });
    const closed = cards.filter(c => !c.querySelector('details[open]'));
    const h = Math.max(0, ...closed.map(c => c.getBoundingClientRect().height));
    if (h > 0) cards.forEach(c => { c.style.minHeight = Math.ceil(h) + 'px'; });
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
