'use strict';
// Menüs, HUD und Start des Spiels.

const UI = (() => {
  const $ = (id) => document.getElementById(id);
  const SCREENS = ['title', 'levels', 'help', 'pause', 'clear', 'over', 'win'];
  const isTouch = IS_TOUCH;
  let current = null, backTo = 'title', hudOn = false;
  const icons = {};
  const cache = {};

  // ---- Symbole aus den Spielgrafiken erzeugen ----
  function iconCanvas(draw, size = 64) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.scale(size / 32, size / 32);
    draw(g);
    return c.toDataURL();
  }
  const fakePlayer = (power = 0) => ({
    x: 5, y: 0, w: 22, h: 40, vx: 0, vy: 0, face: 1, power, onGround: true, rolling: 0, star: 0, inv: 0,
    walkPhase: 0, squash: 0, blinkSeed: 1, dead: false, flagHold: false, hidden: false,
  });
  const fakeEnemy = (type, w, h, extra = {}) => ({ type, x: 16 - w / 2, y: 30 - h, w, h, dir: 1, vx: -1, vy: 0, onGround: true, alive: true, ...extra });

  function buildIcons() {
    icons.coin = iconCanvas((g) => Render.drawCoinShape(g, 16, 16, -0.2, 1.15));
    icons.heart = iconCanvas((g) => Render.drawItem(g, { type: 'heart', x: 2, y: 4, w: 28, h: 28 }, 0));
    icons.life = iconCanvas((g) => {
      g.translate(16, 17);
      g.fillStyle = '#e8203a';
      g.beginPath(); g.moveTo(0, 11); g.bezierCurveTo(-18, -2, -9, -16, 0, -6); g.bezierCurveTo(9, -16, 18, -2, 0, 11); g.fill();
      g.fillStyle = '#ff8a9c'; Render.ellipse(g, -6, -5, 3, 2, -0.6); g.fill();
    });
    for (let i = 0; i < 3; i++) icons['gem' + i] = iconCanvas((g) => Render.drawGemShape(g, 16, 15, i, 0));
    icons.fox = iconCanvas((g) => { g.translate(4, 1); g.scale(0.72, 0.72); Render.drawPlayer(g, fakePlayer(0), 0.5); });
    for (const t of ['mushroom', 'flower', 'star', 'feather', 'magnet', 'boots']) {
      icons[t] = iconCanvas((g) => Render.drawItem(g, { type: t, x: 2, y: 2, w: 28, h: 28 }, 0));
    }
    const en = {
      slime: fakeEnemy('slime', 28, 24), beetle: fakeEnemy('beetle', 28, 28), hedgehog: fakeEnemy('hedgehog', 30, 26),
      bat: fakeEnemy('bat', 30, 22, { y: 6 }), frog: fakeEnemy('frog', 28, 26), ball: fakeEnemy('ball', 26, 26, { y: 3 }),
      lavaball: fakeEnemy('lavaball', 24, 28, { baseY: 100, y: 1 }), stomper: fakeEnemy('stomper', 60, 56, { state: 'idle', x: 2, y: -26 }),
      boss: fakeEnemy('boss', 96, 84, { kind: 'slime', x: -32, y: -54, state: 'wait', hitFlash: 0 }),
    };
    for (const k in en) {
      icons['e_' + k] = iconCanvas((g) => {
        if (k === 'stomper') { g.translate(16, 16); g.scale(0.5, 0.5); g.translate(-16, -16); }
        if (k === 'boss') { g.translate(16, 16); g.scale(0.3, 0.3); g.translate(-16, -16); }
        Render.drawEnemy(g, en[k], 0.3);
      });
    }
    document.querySelectorAll('img[data-icon]').forEach((img) => { img.src = icons[img.dataset.icon]; });
  }

  function buildHelp() {
    const powers = [
      ['mushroom', 'Pilz', 'Du wirst groß und hältst einen Treffer aus.'],
      ['flower', 'Feuerblume', 'Feuerbälle werfen mit F oder E.'],
      ['star', 'Stern', '10 Sekunden unbesiegbar – alles umrennen!'],
      ['feather', 'Feder', 'Doppelsprung in der Luft (25 s).'],
      ['magnet', 'Magnet', 'Zieht Münzen an (20 s).'],
      ['boots', 'Turbo-Schuhe', 'Schneller laufen und rollen (15 s).'],
      ['heart', 'Herz', 'Ein Extraleben. 100 Münzen geben auch eins.'],
      ['gem0', 'Edelsteine', '3 pro Level, gut versteckt.'],
    ];
    $('help-powers').innerHTML = powers.map(([i, n, d]) => `<li><img src="${icons[i]}" alt=""><span><b>${n}:</b> ${d}</span></li>`).join('');
    const enemies = [
      ['slime', 'Schleimi', 'Draufspringen oder umrollen.'],
      ['beetle', 'Panzerkäfer', 'Draufspringen, dann den Panzer wegkicken.'],
      ['hedgehog', 'Igel', 'Stachelig! Nur Feuer, Stern oder Panzer helfen.'],
      ['bat', 'Fledermaus', 'Fliegt hin und her und stößt herab.'],
      ['frog', 'Frosch', 'Springt dir hinterher.'],
      ['ball', 'Kanonenkugel', 'Kommt aus Kanonen – drüber oder drauf.'],
      ['lavaball', 'Feuerspringer', 'Springt aus der Lava. Nicht berühren!'],
      ['stomper', 'Stampfer', 'Fällt herunter. Oben drauf kann man mitfahren.'],
      ['boss', 'Bosse', 'Am Ende jeder Welt. Drei Treffer, dann öffnet sich das Tor zur Flagge.'],
    ];
    $('help-enemies').innerHTML = enemies.map(([i, n, d]) => `<li><img src="${icons['e_' + i]}" alt=""><span><b>${n}:</b> ${d}</span></li>`).join('');
  }

  function buildLevelGrid() {
    const grid = $('level-grid');
    grid.innerHTML = '';
    LEVELS.forEach((def, i) => {
      const locked = i + 1 > G.save.unlocked;
      const btn = document.createElement('button');
      btn.className = 'level-card';
      btn.disabled = locked;
      const got = G.save.gems[def.id] || [];
      btn.innerHTML = `<canvas width="320" height="180"></canvas>${locked ? '<div class="lock">🔒 Gesperrt</div>' : ''}
        <div class="meta"><div><div class="num">Welt ${def.id}</div><div class="name">${def.name}</div></div>
        <div class="g">${[0, 1, 2].map((g) => `<img src="${icons['gem' + g]}" class="${got.includes(g) ? '' : 'off'}" alt="">`).join('')}</div></div>`;
      btn.addEventListener('click', () => { Sound.play('select'); startGame(i); });
      grid.appendChild(btn);
      drawThumb(btn.querySelector('canvas'), i);
    });
  }

  function drawThumb(c, index) {
    const key = 'thumb' + index;
    if (!cache[key]) {
      const L = buildLevel(index);
      L.bumps = {};
      cache[key] = L;
    }
    const L = cache[key];
    const g = c.getContext('2d');
    const cam = { x: 3 * T, y: L.h * T - 360, w: 640, h: 360 };
    const k = c.width / cam.w;
    g.setTransform(k, 0, 0, k, 0, 0);
    Render.drawBackground(g, L, cam, 0);
    g.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
    for (const d of L.decor) if (d.x * T > cam.x - 100 && d.x * T < cam.x + cam.w + 100) Render.drawDecor(g, d, L.theme, 0);
    Render.drawTiles(g, L, cam, k, 0, 0, 0);
    g.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
    for (const s of L.spawns) if (s.kind === 'coin' && s.x * T < cam.x + cam.w) Render.drawCoinShape(g, s.x * T + 16, s.y * T + 16, -0.2);
    const fp = fakePlayer(0);
    fp.x = L.start.x * T + 5; fp.y = (L.start.y + 1) * T - 40;
    Render.drawPlayer(g, fp, 0.5);
  }

  // ---- Bildschirme ----
  function show(name) {
    for (const s of SCREENS) $('screen-' + s).hidden = s !== name;
    current = name;
    if (name === 'levels') buildLevelGrid();
    if (name === 'title') {
      const cont = G.save.unlocked > 1;
      $('btn-continue').textContent = cont ? `Weiter: Welt ${G.save.unlocked}` : 'Spielen';
      $('title-best').textContent = G.save.best > 0 ? `Rekord: ${G.save.best.toLocaleString('de-DE')} Punkte` : '';
    }
    if (name && !isTouch) {
      const first = $('screen-' + name).querySelector('button:not(:disabled)');
      if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
    }
    updateTouch();
  }

  function clickPrimary() {
    if (!current) return;
    const b = $('screen-' + current).querySelector('button:not(:disabled)');
    if (b) b.click();
  }

  function hud(on) {
    hudOn = on;
    $('hud').hidden = !on;
    updateTouch();
  }

  function updateTouch() {
    $('touch').hidden = !(isTouch && hudOn && !current);
  }

  function banner(def, lives) {
    if (!def) { $('banner').hidden = true; return; }
    $('banner-world').textContent = `Welt ${def.id}`;
    $('banner-name').textContent = def.name;
    $('banner-lives').textContent = `× ${lives}`;
    $('banner').hidden = false;
  }

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function showClear(st) {
    G.state = 'cleared';
    const last = G.levelIndex + 1 >= LEVELS.length;
    $('clear-stats').innerHTML = `
      <span>Zeit</span><b>${fmtTime(st.time)}</b>
      <span>Zeitbonus</span><b>+${st.timeBonus.toLocaleString('de-DE')}</b>
      <span>Münzen</span><b>${st.coins}</b>
      <span>Edelsteine</span><b>${st.gems} / ${st.total}</b>
      <span class="total">Punkte</span><b class="total">${G.score.toLocaleString('de-DE')}</b>`;
    $('btn-next').textContent = last ? 'Zum Abschluss' : `Weiter zu Welt ${G.levelIndex + 2}`;
    show('clear');
  }

  function showOver() {
    $('over-text').textContent = `Du hast ${G.score.toLocaleString('de-DE')} Punkte in „${LEVELS[G.levelIndex].name}“ erreicht. Probier es gleich nochmal!`;
    hud(false);
    show('over');
  }

  function showWin() {
    const total = Object.values(G.save.gems).reduce((a, g) => a + g.length, 0);
    G.save.best = Math.max(G.save.best, G.score);
    store.set('sk_save', G.save);
    $('win-stats').innerHTML = `
      <span>Punkte</span><b>${G.score.toLocaleString('de-DE')}</b>
      <span>Edelsteine</span><b>${total} / ${LEVELS.length * 3}</b>
      <span>Rekord</span><b>${G.save.best.toLocaleString('de-DE')}</b>`;
    hud(false);
    show('win');
  }

  // ---- HUD jede Frame aktualisieren (nur bei Änderungen) ----
  function set(id, val) {
    if (cache[id] === val) return;
    cache[id] = val;
    $(id).textContent = val;
  }

  function update() {
    if (current === 'title') drawTitleFox();
    if (!hudOn || !G.lvl) return;
    const p = G.player;
    set('hud-lives', String(G.lives));
    set('hud-coins', String(G.coinCount));
    set('hud-score', String(G.score).padStart(6, '0'));
    set('hud-time', fmtTime(G.levelTime));
    set('hud-level', `${LEVELS[G.levelIndex].id} · ${LEVELS[G.levelIndex].name}`);
    const saved = G.save.gems[LEVELS[G.levelIndex].id] || [];
    const gemKey = [0, 1, 2].map((i) => (G.runGems.has(i) || saved.includes(i) ? 1 : 0)).join('') + G.levelIndex;
    if (cache.gems !== gemKey) {
      cache.gems = gemKey;
      $('hud-gems').innerHTML = [0, 1, 2].map((i) => `<img src="${icons['gem' + i]}" class="${gemKey[i] === '1' ? '' : 'off'}" alt="">`).join('');
    }
    // Power-ups
    const chips = [];
    if (p && p.power === 2) chips.push(['flower', 'Feuer', 1]);
    if (p) for (const k in TIMED_POWERS) if (p[k] > 0) chips.push([k, `${TIMED_POWERS[k].label} ${Math.ceil(p[k])}`, p[k] / TIMED_POWERS[k].time]);
    const chipKey = chips.map((c) => c[0] + c[1]).join('|');
    if (cache.chips !== chipKey) {
      cache.chips = chipKey;
      $('hud-powers').innerHTML = chips.map(([i, l]) => `<div class="power-chip" data-k="${i}"><img src="${icons[i]}" alt=""><span>${l}</span><i></i></div>`).join('');
    }
    chips.forEach(([k, , frac], idx) => {
      const el = $('hud-powers').children[idx];
      if (el) el.lastElementChild.style.width = `${Math.round(frac * 100)}%`;
    });
    // Boss
    const b = G.boss;
    const showBoss = !!(b && G.bossActive);
    if (cache.boss !== showBoss) { cache.boss = showBoss; $('hud-boss').hidden = !showBoss; }
    if (showBoss) {
      $('hud-boss-bar').style.width = `${(Math.max(0, b.hp) / b.maxHp) * 100}%`;
      set('hud-boss-name', b.name);
    }
    // Touch: Feuerknopf
    const fire = !!(p && p.power === 2);
    if (cache.fire !== fire) { cache.fire = fire; document.querySelector('.t-btn.fire').hidden = !fire; }
  }

  // Tanzender Fuchs auf dem Titelbild
  const titleFox = fakePlayer(0);
  function drawTitleFox() {
    const c = $('title-fox');
    const g = c.getContext('2d');
    const t = G.time;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    const hop = Math.abs(Math.sin(t * 2.6));
    titleFox.onGround = hop < 0.12;
    titleFox.vy = Math.cos(t * 2.6) > 0 ? -1 : 1;
    titleFox.squash = hop < 0.12 ? 0.3 : 0;
    g.setTransform(4.6, 0, 0, 4.6, 0, 0);
    g.translate(3, 6 - hop * 6);
    Render.drawPlayer(g, titleFox, t);
  }

  // ---- Knöpfe ----
  function onAction(a) {
    Sound.play('select');
    switch (a) {
      case 'continue': startGame(Math.min(LEVELS.length, G.save.unlocked) - 1); break;
      case 'levels': backTo = 'title'; show('levels'); break;
      case 'help': backTo = current === 'pause' ? 'pause' : 'title'; show('help'); break;
      case 'back': show(backTo); break;
      case 'resume': resumeGame(); break;
      case 'restart': UI.show(null); G.state = 'restart'; startLevel(G.levelIndex); break;
      case 'menu': startTitle(); break;
      case 'next': nextLevel(); break;
      case 'retry': startGame(G.levelIndex); break;
      case 'again': startGame(0); break;
    }
  }

  function init() {
    buildIcons();
    buildHelp();
    document.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (b) onAction(b.dataset.action);
    });
    const mute = $('btn-mute');
    const syncMute = () => mute.classList.toggle('muted', Sound.isMuted());
    syncMute();
    mute.addEventListener('click', () => { Sound.init(); Sound.toggleMute(); syncMute(); mute.blur(); });
    $('btn-pause').addEventListener('click', (e) => { pauseGame(); e.currentTarget.blur(); });
    for (const id of ['btn-mute', 'btn-pause']) $(id).addEventListener('mousedown', (e) => e.preventDefault());
    Input.onKey((e) => {
      if (e.code === 'KeyM' && !e.repeat) { Sound.init(); Sound.toggleMute(); syncMute(); }
      if (e.code === 'Escape' && current === 'help') show(backTo);
      if (e.code === 'Escape' && current === 'levels') show('title');
    });
    Input.bindTouch($('touch'));
    const unlock = () => Sound.init();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  return { init, show, hud, banner, update, showClear, showOver, showWin, clickPrimary, get current() { return current; } };
})();

// ---- Start ----
(function boot() {
  resize();
  UI.init();
  const params = new URLSearchParams(location.search);
  const lv = parseInt(params.get('level'), 10);
  if (lv >= 1 && lv <= LEVELS.length) startGame(lv - 1);
  else startTitle();
  requestAnimationFrame(frame);
  // Schrift nachladen → Kachel-Zwischenspeicher (Fragezeichen) neu zeichnen
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => Render.resetCache());
})();
