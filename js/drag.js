// Pointer-based dragging and the flight animations.
// Draggable elements carry data-drag="card" or data-drag="packed", plus data-id.
// Cards can be dropped on any zone the app reports at the pointer: the suitcase,
// or a day in the itinerary. Packed boxes only leave or return to the suitcase.
// Holding a drag near the top or bottom of the window scrolls the page, so on a
// phone, where the suitcase sits far above the cards, items can still reach it.
var Drag = (function () {
  var THRESHOLD = 5;
  var EDGE = 70;
  var MAX_SCROLL = 18;
  var opts = null;
  var session = null;

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function init(options) {
    opts = options;
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('dragstart', function (e) {
      if (e.target.closest && e.target.closest('[data-drag]')) e.preventDefault();
    });
  }

  function onDown(e) {
    if (e.button !== 0 || !e.isPrimary || session) return;
    var el = e.target.closest('[data-drag]');
    if (!el || e.target.closest('button, a, input, select')) return;
    session = {
      el: el,
      kind: el.dataset.drag,
      id: el.dataset.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      x: e.clientX,
      y: e.clientY,
      scrolling: false,
      ghost: null,
      rect: null,
      zone: null
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
  }

  function makeGhost(el, rect) {
    var ghost = el.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('data-drag');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    document.body.appendChild(ghost);
    return ghost;
  }

  function insideSuitcase(x, y) {
    var r = opts.packZone().getBoundingClientRect();
    return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function highlight(zone) {
    if (zone === session.zone) return;
    clearZone();
    session.zone = zone;
    if (zone) zone.classList.add(opts.isBlocked(session.id, zone) ? 'drop-denied' : 'drop-target');
  }

  function clearZone() {
    if (session && session.zone) session.zone.classList.remove('drop-target', 'drop-denied');
  }

  function onMove(e) {
    if (!session || e.pointerId !== session.pointerId) return;
    session.dx = e.clientX - session.startX;
    session.dy = e.clientY - session.startY;
    if (!session.ghost) {
      if (Math.hypot(session.dx, session.dy) < THRESHOLD) return;
      session.rect = session.el.getBoundingClientRect();
      session.ghost = makeGhost(session.el, session.rect);
      session.el.classList.add('drag-source');
      document.body.classList.add('is-dragging');
    }
    session.ghost.style.transform = dragTransform(session.dx, session.dy);
    session.x = e.clientX;
    session.y = e.clientY;
    updateZone();
    autoScroll();
  }

  function updateZone() {
    if (session.kind === 'card') highlight(opts.zoneAt(session.x, session.y));
    else opts.packZone().classList.toggle('drop-out', !insideSuitcase(session.x, session.y));
  }

  function scrollSpeed(y) {
    var height = window.innerHeight;
    if (y < EDGE) return -Math.ceil(MAX_SCROLL * Math.min(1, (EDGE - y) / EDGE));
    if (y > height - EDGE) return Math.ceil(MAX_SCROLL * Math.min(1, (y - height + EDGE) / EDGE));
    return 0;
  }

  // Keeps scrolling while the pointer rests near an edge, since no moves arrive then.
  function autoScroll() {
    if (session.scrolling || !scrollSpeed(session.y)) return;
    var s = session;
    s.scrolling = true;
    (function step() {
      var speed = session === s ? scrollSpeed(s.y) : 0;
      if (!speed) {
        s.scrolling = false;
        return;
      }
      var before = window.scrollY;
      window.scrollBy(0, speed);
      if (window.scrollY !== before) updateZone();
      requestAnimationFrame(step);
    })();
  }

  function dragTransform(dx, dy) {
    return 'translate(' + dx + 'px,' + dy + 'px) rotate(2deg) scale(1.03)';
  }

  function onUp(e) {
    if (!session || e.pointerId !== session.pointerId) return;
    var zone = session.kind === 'card' ? opts.zoneAt(e.clientX, e.clientY) : null;
    var inside = insideSuitcase(e.clientX, e.clientY);
    var s = finishSession();
    if (!s.ghost) return;
    if (s.kind === 'card') {
      if (zone && opts.isBlocked(s.id, zone)) {
        flyBack(s);
        opts.onBlocked(s.id, zone);
      } else if (zone) {
        s.el.classList.remove('drag-source');
        flyIn(s.ghost, s.rect, s.dx, s.dy, opts.flyTarget(s.id, zone), function () { opts.onPack(s.id, zone); });
      } else {
        flyBack(s);
      }
    } else if (inside) {
      flyBack(s);
    } else {
      poof(s, function () { opts.onUnpack(s.id); });
    }
  }

  function onCancel(e) {
    if (!session || e.pointerId !== session.pointerId) return;
    cancel();
  }

  function onKey(e) {
    if (e.key === 'Escape') cancel();
  }

  function cancel() {
    var s = finishSession();
    if (s.ghost) flyBack(s);
  }

  function finishSession() {
    clearZone();
    var s = session;
    session = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey);
    document.body.classList.remove('is-dragging');
    opts.packZone().classList.remove('drop-out');
    return s;
  }

  function run(ghost, keyframes, duration, easing, done) {
    if (reducedMotion()) {
      ghost.remove();
      done();
      return;
    }
    var animation = ghost.animate(keyframes, { duration: duration, easing: easing, fill: 'forwards' });
    animation.onfinish = function () {
      ghost.remove();
      done();
    };
    animation.oncancel = animation.onfinish;
  }

  function flyIn(ghost, rect, dx, dy, targetEl, done) {
    var target = targetEl.getBoundingClientRect();
    var endX = target.left + target.width / 2 - (rect.left + rect.width / 2);
    var endY = target.top + target.height / 2 - (rect.top + rect.height / 2);
    var midX = dx + (endX - dx) * 0.6;
    var midY = dy + (endY - dy) * 0.6 - 40;
    var endScale = Math.min(0.9, 56 / rect.width);
    run(ghost, [
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1)', opacity: 1 },
      { transform: 'translate(' + midX + 'px,' + midY + 'px) scale(0.6) rotate(-6deg)', opacity: 1, offset: 0.6 },
      { transform: 'translate(' + endX + 'px,' + endY + 'px) scale(' + endScale + ')', opacity: 0.25 }
    ], 420, 'cubic-bezier(.3,.7,.3,1)', done);
  }

  // Back to wherever the source sits now, which moves if the page scrolled.
  function flyBack(s) {
    var now = s.el.getBoundingClientRect();
    var back = 'translate(' + (now.left - s.rect.left) + 'px,' + (now.top - s.rect.top) + 'px)';
    run(s.ghost, [
      { transform: dragTransform(s.dx, s.dy), opacity: 1 },
      { transform: back, opacity: 0.6 }
    ], 260, 'cubic-bezier(.2,.8,.2,1)', function () {
      s.el.classList.remove('drag-source');
    });
  }

  function poof(s, done) {
    run(s.ghost, [
      { transform: dragTransform(s.dx, s.dy), opacity: 1 },
      { transform: 'translate(' + s.dx + 'px,' + s.dy + 'px) scale(0.3)', opacity: 0 }
    ], 200, 'ease-in', function () {
      s.el.classList.remove('drag-source');
      done();
    });
  }

  // The Add button's route to a target, with no dragging involved.
  function flyFrom(el, targetEl, done) {
    var rect = el.getBoundingClientRect();
    flyIn(makeGhost(el, rect), rect, 0, 0, targetEl, done);
  }

  return { init: init, flyFrom: flyFrom, reducedMotion: reducedMotion };
})();
