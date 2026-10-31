// Pointer-based dragging and the flight animations.
// Draggable elements carry data-drag="card" or data-drag="packed", plus data-id.
var Drag = (function () {
  var THRESHOLD = 5;
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
      ghost: null,
      rect: null
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

  function overDropZone(x, y) {
    var r = opts.dropZone().getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function onMove(e) {
    if (!session || e.pointerId !== session.pointerId) return;
    session.dx = e.clientX - session.startX;
    session.dy = e.clientY - session.startY;
    if (!session.ghost) {
      if (Math.hypot(session.dx, session.dy) < THRESHOLD) return;
      session.rect = session.el.getBoundingClientRect();
      session.ghost = makeGhost(session.el, session.rect);
      session.blocked = session.kind === 'card' && opts.isBlocked(session.id);
      session.el.classList.add('drag-source');
      document.body.classList.add('is-dragging');
    }
    session.ghost.style.transform = dragTransform(session.dx, session.dy);
    opts.dropZone().classList.toggle('drop-target', session.kind === 'card' && !session.blocked && overDropZone(e.clientX, e.clientY));
    opts.dropZone().classList.toggle('drop-denied', session.blocked && overDropZone(e.clientX, e.clientY));
    opts.dropZone().classList.toggle('drop-out', session.kind === 'packed' && !overDropZone(e.clientX, e.clientY));
  }

  function dragTransform(dx, dy) {
    return 'translate(' + dx + 'px,' + dy + 'px) rotate(2deg) scale(1.03)';
  }

  function onUp(e) {
    if (!session || e.pointerId !== session.pointerId) return;
    var s = finishSession();
    if (!s.ghost) return;
    var inside = overDropZone(e.clientX, e.clientY);
    if (s.kind === 'card') {
      if (inside && s.blocked) {
        flyBack(s);
        opts.onBlocked(s.id);
      } else if (inside) {
        s.el.classList.remove('drag-source');
        flyIn(s.ghost, s.rect, s.dx, s.dy, s.id, function () { opts.onPack(s.id); });
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
    var s = session;
    session = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey);
    document.body.classList.remove('is-dragging');
    opts.dropZone().classList.remove('drop-target', 'drop-denied', 'drop-out');
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

  function flyIn(ghost, rect, dx, dy, id, done) {
    var target = opts.flyTarget(id).getBoundingClientRect();
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

  function flyBack(s) {
    run(s.ghost, [
      { transform: dragTransform(s.dx, s.dy), opacity: 1 },
      { transform: 'none', opacity: 0.6 }
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

  // The Add button's route into the bag, with no dragging involved.
  function flyFrom(el, id, done) {
    var rect = el.getBoundingClientRect();
    flyIn(makeGhost(el, rect), rect, 0, 0, id, done);
  }

  return { init: init, flyFrom: flyFrom, reducedMotion: reducedMotion };
})();
