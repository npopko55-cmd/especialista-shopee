/* Especialista em Shopee — поведение блоков 6А–12 (исполнитель B). Без библиотек.
   Тарифы: лента [data-carousel] в #tariffs. Прокрутку по сегменту ([data-carousel-goto]) и подсветку
   активной кнопки (aria-current) делает общий код карусели в site.js; здесь — только старт на
   центральной карточке «Специалист по Shopee» и удержание выбранной карточки при повороте экрана. */
(() => {
  'use strict';
  const track = document.querySelector('#tariffs .t8-track');
  if (!track) return;
  const cards = track.querySelectorAll('.carousel__card');
  if (cards.length < 2) return;
  const START = 1;
  const offset = i => cards[i].offsetLeft - cards[0].offsetLeft;
  const current = () => {
    const b = document.querySelector('#tariffs [data-carousel-goto][aria-current="true"]');
    return b ? Number(b.getAttribute('data-carousel-goto')) : START;
  };
  let touched = false;
  const jump = i => { track.scrollLeft = offset(Math.max(0, Math.min(cards.length - 1, i))); };

  jump(START);
  ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(ev =>
    track.addEventListener(ev, () => { touched = true; }, { passive: true, once: true }));
  document.querySelectorAll('#tariffs [data-carousel-goto]').forEach(b =>
    b.addEventListener('click', () => { touched = true; }));
  window.addEventListener('load', () => { if (!touched) jump(START); }, { once: true });

  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    const i = current();
    rt = setTimeout(() => jump(i), 120);
  });
})();
