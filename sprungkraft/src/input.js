'use strict';
// Eingabe: Tastatur, Touch-Steuerung und Gamepad werden zu Aktionen zusammengeführt.

const Input = (() => {
  const ACTIONS = ['left', 'right', 'jump', 'run', 'roll', 'fire', 'pause', 'confirm'];
  const KEYS = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
    ShiftLeft: 'run', ShiftRight: 'run', KeyX: 'run',
    ArrowDown: 'roll', KeyS: 'roll', KeyC: 'roll',
    KeyF: 'fire', KeyE: 'fire',
    Escape: 'pause', KeyP: 'pause',
    Enter: 'confirm',
  };
  const kb = {}, touch = {}, pad = {}, latch = {};
  const cur = {}, prev = {}, padCur = {}, padPrev = {};
  let runToggle = false;
  const listeners = { key: [] };

  window.addEventListener('keydown', (e) => {
    const a = KEYS[e.code];
    if (a) {
      kb[a] = true;
      latch[a] = true; // kurzer Tipp zwischen zwei Frames zählt trotzdem
      const onButton = e.target && e.target.tagName === 'BUTTON';
      if ((e.code.startsWith('Arrow') || e.code === 'Space') && !onButton) e.preventDefault();
    }
    listeners.key.forEach((fn) => fn(e));
  });
  window.addEventListener('keyup', (e) => {
    const a = KEYS[e.code];
    if (a) kb[a] = false;
  });
  window.addEventListener('blur', () => {
    for (const k in kb) kb[k] = false;
    for (const k in touch) touch[k] = false;
  });

  // ---- Touch ----
  function bindTouch(root) {
    const dpad = root.querySelector('[data-dpad]');
    const dpadPointers = new Map();
    const updateDpad = () => {
      touch.left = touch.right = false;
      const r = dpad.getBoundingClientRect();
      for (const x of dpadPointers.values()) {
        if (x < r.left + r.width / 2) touch.left = true; else touch.right = true;
      }
      dpad.dataset.dir = touch.left ? 'left' : touch.right ? 'right' : '';
    };
    dpad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dpad.setPointerCapture(e.pointerId);
      dpadPointers.set(e.pointerId, e.clientX);
      updateDpad();
    });
    dpad.addEventListener('pointermove', (e) => {
      if (!dpadPointers.has(e.pointerId)) return;
      dpadPointers.set(e.pointerId, e.clientX);
      updateDpad();
    });
    const endDpad = (e) => { dpadPointers.delete(e.pointerId); updateDpad(); };
    dpad.addEventListener('pointerup', endDpad);
    dpad.addEventListener('pointercancel', endDpad);

    root.querySelectorAll('[data-act]').forEach((btn) => {
      const act = btn.dataset.act;
      if (act === 'run') {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          runToggle = !runToggle;
          btn.classList.toggle('on', runToggle);
        });
        return;
      }
      const down = (e) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); touch[act] = true; latch[act] = true; btn.classList.add('on'); };
      const up = () => { touch[act] = false; btn.classList.remove('on'); };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    });
  }

  // ---- Gamepad (Standard-Belegung) ----
  function readPad() {
    for (const a of ACTIONS) pad[a] = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      const ax = gp.axes[0] || 0;
      pad.left = pad.left || ax < -0.4 || b(14);
      pad.right = pad.right || ax > 0.4 || b(15);
      pad.jump = pad.jump || b(0) || b(12);
      pad.roll = pad.roll || b(1) || b(13) || (gp.axes[1] || 0) > 0.6;
      pad.run = pad.run || b(2) || b(6) || b(4);
      pad.fire = pad.fire || b(3) || b(7) || b(5);
      pad.pause = pad.pause || b(9);
      pad.confirm = pad.confirm || b(0);
    }
  }

  function update() {
    readPad();
    for (const a of ACTIONS) {
      padPrev[a] = padCur[a];
      padCur[a] = !!pad[a];
      prev[a] = cur[a];
      cur[a] = !!(kb[a] || latch[a] || touch[a] || pad[a] || (a === 'run' && runToggle));
      latch[a] = false;
    }
  }

  return {
    update,
    bindTouch,
    down: (a) => !!cur[a],
    pressed: (a) => !!cur[a] && !prev[a],
    padPressed: (a) => !!padCur[a] && !padPrev[a],
    onKey: (fn) => listeners.key.push(fn),
    clear() { for (const a of ACTIONS) { kb[a] = touch[a] = latch[a] = false; prev[a] = cur[a] = false; } },
  };
})();
