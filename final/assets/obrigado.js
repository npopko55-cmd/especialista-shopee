/* Страница «Спасибо»: лента слайдов-инструкции (стрелки, точки, текущий шаг). Без библиотек; без JS лента листается пальцем и колесом. */
(function () {
  'use strict';
  var g = document.querySelector('[data-ty-guide]');
  if (!g) return;
  var track = g.querySelector('.ty-guide__track');
  var slides = Array.prototype.slice.call(track.children);
  var dots = Array.prototype.slice.call(g.querySelectorAll('.ty-guide__dots button'));
  var prev = g.querySelector('[data-prev]'), next = g.querySelector('[data-next]');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var behavior = reduce ? 'auto' : 'smooth';

  function padLeft() { return parseFloat(getComputedStyle(track).paddingLeft) || 0; }
  function first() {   /* первый слайд, видимый в ленте (для точек и стрелок) */
    var x = track.scrollLeft + padLeft() + 8, n = 0;
    for (var i = 0; i < slides.length; i++) { if (slides[i].offsetLeft <= x) n = i; }
    return n;
  }
  function update() {
    var i = first(), atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    if (atEnd) i = slides.length - 1;   /* дошли до конца ленты — активна последняя точка */
    dots.forEach(function (d, k) { if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
    if (prev) prev.disabled = track.scrollLeft <= 2;
    if (next) next.disabled = atEnd;
  }
  function go(i) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    track.scrollTo({ left: slides[i].offsetLeft - padLeft(), behavior: behavior });
  }
  function step(dir) {
    var w = slides[0].offsetWidth + (parseFloat(getComputedStyle(track).columnGap) || 14);
    var per = Math.max(1, Math.round(track.clientWidth / w));
    go(first() + dir * per);
  }
  var raf = 0;
  track.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; update(); }); }, { passive: true });
  window.addEventListener('resize', update);
  if (prev) prev.addEventListener('click', function () { step(-1); });
  if (next) next.addEventListener('click', function () { step(1); });
  dots.forEach(function (d, k) { d.addEventListener('click', function () { go(k); }); });
  update();
})();
