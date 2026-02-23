/**
 * Miami Asteroids
 * HTML5 Canvas game — no external game libraries, no copyrighted assets.
 * All graphics: procedural Canvas 2D.
 * All audio:    Web Audio API synthesis.
 * Font:         Orbitron (Google Fonts, OFL licence).
 */
(function () {
  'use strict';

  // ── Canvas Setup ────────────────────────────────────────────────────────────
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ── Colour Palette ──────────────────────────────────────────────────────────
  const C = {
    bg:      '#0d0021',
    pink:    '#ff2d78',
    cyan:    '#00f5ff',
    purple:  '#b400ff',
    yellow:  '#ffe44d',
    white:   '#ffffff',
    gridPurple: '#1a0040',
  };

  // ── Game Constants ──────────────────────────────────────────────────────────
  const SHIP_R          = 14;   // ship collision radius (px)
  const BULLET_SPEED    = 520;  // px / s
  const BULLET_LIFE     = 1.1;  // seconds
  const ROTATE_SPEED    = 3.6;  // rad / s
  const THRUST_FORCE    = 290;  // px / s²
  const DRAG            = 0.985;// per-frame drag (applied as Math.pow(DRAG, 60*dt))
  const MAX_SPEED       = 420;  // px / s
  const SHOOT_COOLDOWN  = 0.22; // s
  const INVINCIBLE_TIME = 3.0;  // s after respawn
  const EXTRA_LIFE_PTS  = 10000;

  const ASTEROID_DEF = {
    large:  { r: 50, score: 20,  next: 'medium', baseSpeed: 65  },
    medium: { r: 26, score: 50,  next: 'small',  baseSpeed: 105 },
    small:  { r: 13, score: 100, next: null,      baseSpeed: 165 },
  };

  // ── State ───────────────────────────────────────────────────────────────────
  let gameState   = 'MENU'; // MENU | PLAYING | PAUSED | GAME_OVER
  let score       = 0;
  let hiScore     = parseInt(localStorage.getItem('miami_hi') || '0', 10);
  let lives       = 3;
  let level       = 1;
  let ship        = null;
  let bullets     = [];
  let asteroids   = [];
  let particles   = [];
  let keys        = {};
  let lastTime    = 0;
  let shootTimer  = 0;
  let invTimer    = 0;   // invincibility countdown
  let blinkTimer  = 0;
  let nextExtraLife = EXTRA_LIFE_PTS;
  let bannerTimer = 0;   // "LEVEL X" banner countdown
  let gridOffset  = 0;   // synthwave grid scroll

  // Stars — fixed positions, generated once
  const STARS = Array.from({ length: 130 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.5 + Math.random() * 1.5,
    phase: Math.random() * Math.PI * 2,
    col: [C.cyan, C.pink, C.white][Math.floor(Math.random() * 3)],
  }));

  // ── Audio ───────────────────────────────────────────────────────────────────
  let audioCtx = null;

  function ac() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function tone(freq, type, dur, vol = 0.25) {
    try {
      const a = ac();
      const o = a.createOscillator();
      const g = a.createGain();
      o.connect(g); g.connect(a.destination);
      o.type = type;
      o.frequency.setValueAtTime(freq, a.currentTime);
      g.gain.setValueAtTime(vol, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.start(a.currentTime);
      o.stop(a.currentTime + dur);
    } catch (_) {}
  }

  function noise(dur, vol = 0.12, filterFreq = 300) {
    try {
      const a = ac();
      const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = a.createBufferSource();
      const flt = a.createBiquadFilter();
      const g   = a.createGain();
      flt.type = 'bandpass'; flt.frequency.value = filterFreq;
      src.buffer = buf;
      src.connect(flt); flt.connect(g); g.connect(a.destination);
      g.gain.setValueAtTime(vol, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      src.start();
    } catch (_) {}
  }

  const sfx = {
    shoot:     () => { tone(820, 'square', 0.12, 0.18); },
    thrust:    () => { noise(0.08, 0.07, 180); },
    boomLarge: () => { tone(75,  'sawtooth', 0.5, 0.3); noise(0.45, 0.22, 120); },
    boomMed:   () => { tone(150, 'sawtooth', 0.35, 0.25); noise(0.3, 0.15, 250); },
    boomSmall: () => { tone(300, 'square', 0.2, 0.2); noise(0.18, 0.1, 500); },
    die:       () => { [400,300,200,100].forEach((f,i)=>setTimeout(()=>tone(f,'sawtooth',0.25,0.28),i*130)); },
    extraLife: () => { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,'sine',0.18,0.22),i*90)); },
    gameOver:  () => { [350,260,190,100].forEach((f,i)=>setTimeout(()=>tone(f,'sawtooth',0.4,0.3),i*160)); },
  };

  function boomSound(size) {
    if (size === 'large')  sfx.boomLarge();
    else if (size === 'medium') sfx.boomMed();
    else sfx.boomSmall();
  }

  // ── Input ───────────────────────────────────────────────────────────────────
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    if (gameState === 'MENU' && (e.code === 'Space' || e.code === 'Enter')) {
      startGame();
    } else if (gameState === 'PLAYING' && (e.code === 'KeyP' || e.code === 'Escape')) {
      gameState = 'PAUSED';
    } else if (gameState === 'PAUSED' && (e.code === 'KeyP' || e.code === 'Escape')) {
      gameState = 'PLAYING';
    } else if (gameState === 'GAME_OVER' && (e.code === 'Space' || e.code === 'Enter')) {
      gameState = 'MENU';
    }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  // Touch zones
  function bindTouch(id, code) {
    const el = document.getElementById(id);
    if (!el) return;
    const down = e => { e.preventDefault(); keys[code] = true; };
    const up   = e => { e.preventDefault(); keys[code] = false; };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend',   up,   { passive: false });
    el.addEventListener('touchcancel',up,   { passive: false });
  }
  bindTouch('touchLeft',   'ArrowLeft');
  bindTouch('touchRight',  'ArrowRight');
  bindTouch('touchThrust', 'ArrowUp');
  bindTouch('touchFire',   'Space');

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function dist2(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  }

  function wrap(obj, margin = 80) {
    const W = canvas.width, H = canvas.height;
    if (obj.x < -margin)    obj.x = W + margin;
    if (obj.x > W + margin) obj.x = -margin;
    if (obj.y < -margin)    obj.y = H + margin;
    if (obj.y > H + margin) obj.y = -margin;
  }

  function rnd(min, max) { return min + Math.random() * (max - min); }

  // ── Factory: Ship ───────────────────────────────────────────────────────────
  function makeShip() {
    return { x: canvas.width / 2, y: canvas.height / 2,
             vx: 0, vy: 0, angle: -Math.PI / 2 };
  }

  // ── Factory: Asteroid ────────────────────────────────────────────────────────
  function makeAsteroid(x, y, size, vx, vy) {
    const def   = ASTEROID_DEF[size];
    const nv    = 8 + Math.floor(Math.random() * 5);
    const verts = [];
    for (let i = 0; i < nv; i++) {
      const a = (i / nv) * Math.PI * 2;
      const r = def.r * rnd(0.72, 1.28);
      verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    const spd = def.baseSpeed * rnd(0.6, 1.4);
    const dir = Math.random() * Math.PI * 2;
    return {
      x:        x  ?? rnd(0, canvas.width),
      y:        y  ?? rnd(0, canvas.height),
      vx:       vx ?? Math.cos(dir) * spd,
      vy:       vy ?? Math.sin(dir) * spd,
      size, r: def.r, score: def.score, next: def.next,
      verts,
      rot:      Math.random() * Math.PI * 2,
      rotSpd:   rnd(-1.2, 1.2),
    };
  }

  function spawnWave(lvl) {
    const count = 2 + lvl;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const result = [];
    for (let i = 0; i < count; i++) {
      let x, y;
      // Keep asteroids away from the centre at spawn
      do {
        x = Math.random() * canvas.width;
        y = Math.random() * canvas.height;
      } while (dist2(x, y, cx, cy) < 160 * 160);
      result.push(makeAsteroid(x, y, 'large'));
    }
    return result;
  }

  // ── Factory: Particle ────────────────────────────────────────────────────────
  function spawnParticles(x, y, count, colour, speedScale = 1) {
    for (let i = 0; i < count; i++) {
      const a   = Math.random() * Math.PI * 2;
      const spd = rnd(40, 180) * speedScale;
      const life = rnd(0.4, 0.9);
      particles.push({ x, y,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        life, maxLife: life,
        colour,
        sz: rnd(1.2, 3),
      });
    }
  }

  // ── Game Init / Restart ─────────────────────────────────────────────────────
  function startGame() {
    score = 0; lives = 3; level = 1;
    nextExtraLife = EXTRA_LIFE_PTS;
    ship      = makeShip();
    bullets   = [];
    particles = [];
    asteroids = spawnWave(level);
    invTimer  = INVINCIBLE_TIME;
    blinkTimer = 0; shootTimer = 0; bannerTimer = 2.5;
    gameState = 'PLAYING';
  }

  function advanceLevel() {
    level++;
    ship      = makeShip();
    bullets   = [];
    asteroids = spawnWave(level);
    invTimer  = INVINCIBLE_TIME;
    blinkTimer = 0; shootTimer = 0; bannerTimer = 2.5;
  }

  // ── Update ───────────────────────────────────────────────────────────────────
  function update(dt) {
    if (gameState !== 'PLAYING') return;

    // Banner countdown
    if (bannerTimer > 0) bannerTimer -= dt;

    // Rotate
    const rot = (keys['ArrowLeft'] || keys['KeyA'] ? -1 : 0)
              + (keys['ArrowRight'] || keys['KeyD'] ? 1 : 0);
    ship.angle += rot * ROTATE_SPEED * dt;

    // Thrust
    const thrusting = !!(keys['ArrowUp'] || keys['KeyW']);
    if (thrusting) {
      ship.vx += Math.cos(ship.angle) * THRUST_FORCE * dt;
      ship.vy += Math.sin(ship.angle) * THRUST_FORCE * dt;
      sfx.thrust();
      if (Math.random() < 0.35) {
        const ex = ship.x - Math.cos(ship.angle) * SHIP_R * 0.9;
        const ey = ship.y - Math.sin(ship.angle) * SHIP_R * 0.9;
        spawnParticles(ex, ey, 1,
          Math.random() < 0.5 ? C.pink : C.cyan, 0.45);
      }
    }

    // Clamp + drag
    const spd = Math.hypot(ship.vx, ship.vy);
    if (spd > MAX_SPEED) { ship.vx = ship.vx / spd * MAX_SPEED; ship.vy = ship.vy / spd * MAX_SPEED; }
    const d = Math.pow(DRAG, dt * 60);
    ship.vx *= d; ship.vy *= d;
    ship.x += ship.vx * dt; ship.y += ship.vy * dt;
    wrap(ship);

    // Shoot
    shootTimer -= dt;
    if ((keys['Space'] || keys['KeyZ']) && shootTimer <= 0) {
      shootTimer = SHOOT_COOLDOWN;
      bullets.push({
        x: ship.x + Math.cos(ship.angle) * (SHIP_R + 4),
        y: ship.y + Math.sin(ship.angle) * (SHIP_R + 4),
        vx: ship.vx + Math.cos(ship.angle) * BULLET_SPEED,
        vy: ship.vy + Math.sin(ship.angle) * BULLET_SPEED,
        life: BULLET_LIFE,
      });
      sfx.shoot();
    }

    // Move bullets
    bullets = bullets.filter(b => {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      wrap(b); return b.life > 0;
    });

    // Move asteroids
    asteroids.forEach(a => {
      a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.rotSpd * dt;
      wrap(a);
    });

    // Invincibility
    invTimer  = Math.max(0, invTimer - dt);
    blinkTimer += dt;

    // Move particles
    particles = particles.filter(p => {
      p.x  += p.vx * dt; p.y += p.vy * dt;
      const drag = Math.pow(0.91, dt * 60);
      p.vx *= drag; p.vy *= drag;
      p.life -= dt; return p.life > 0;
    });

    // ── Collisions: bullets vs asteroids ─────────────────────────────────────
    const deadBullets   = new Set();
    const deadAsteroids = new Set();
    const newAsteroids  = [];

    for (let bi = 0; bi < bullets.length; bi++) {
      for (let ai = 0; ai < asteroids.length; ai++) {
        if (deadAsteroids.has(ai)) continue;
        const b = bullets[bi], a = asteroids[ai];
        const hitR = (a.r + 4);
        if (dist2(b.x, b.y, a.x, a.y) < hitR * hitR) {
          deadBullets.add(bi);
          deadAsteroids.add(ai);
          score += a.score;
          if (score > hiScore) hiScore = score;

          // Extra life milestone
          while (score >= nextExtraLife) {
            lives++;
            nextExtraLife += EXTRA_LIFE_PTS;
            sfx.extraLife();
          }

          // Explosion particles
          const palettes = { large: [C.pink, C.purple, C.yellow],
                             medium: [C.cyan, C.pink],
                             small:  [C.cyan, C.white] };
          const pal = palettes[a.size];
          const cnt = a.size === 'large' ? 22 : a.size === 'medium' ? 13 : 7;
          spawnParticles(a.x, a.y, cnt, pal[Math.floor(Math.random() * pal.length)]);
          boomSound(a.size);

          // Split
          if (a.next) {
            for (let s = 0; s < 2; s++) {
              const ang = Math.random() * Math.PI * 2;
              const spd = ASTEROID_DEF[a.next].baseSpeed * rnd(0.7, 1.3);
              newAsteroids.push(makeAsteroid(
                a.x, a.y, a.next,
                a.vx * 0.4 + Math.cos(ang) * spd,
                a.vy * 0.4 + Math.sin(ang) * spd,
              ));
            }
          }
        }
      }
    }

    bullets   = bullets.filter((_, i) => !deadBullets.has(i));
    asteroids = asteroids.filter((_, i) => !deadAsteroids.has(i));
    asteroids.push(...newAsteroids);

    // ── Collision: ship vs asteroids ──────────────────────────────────────────
    if (invTimer <= 0) {
      for (const a of asteroids) {
        const hitR = a.r + SHIP_R - 5;
        if (dist2(ship.x, ship.y, a.x, a.y) < hitR * hitR) {
          spawnParticles(ship.x, ship.y, 28, C.cyan);
          spawnParticles(ship.x, ship.y, 14, C.pink);
          lives--;
          if (lives <= 0) {
            gameState = 'GAME_OVER';
            localStorage.setItem('miami_hi', String(hiScore));
            sfx.gameOver();
          } else {
            sfx.die();
            ship     = makeShip();
            invTimer = INVINCIBLE_TIME;
            bullets  = [];
          }
          break;
        }
      }
    }

    // ── Level clear ───────────────────────────────────────────────────────────
    if (asteroids.length === 0 && newAsteroids.length === 0 && bannerTimer <= 0) {
      advanceLevel();
    }
  }

  // ── Draw ─────────────────────────────────────────────────────────────────────

  function drawBackground(scrollGrid) {
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Stars
    const now = performance.now() * 0.001;
    STARS.forEach(s => {
      const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * 1.2 + s.phase));
      ctx.globalAlpha = pulse * 0.8;
      ctx.fillStyle   = s.col;
      ctx.shadowBlur  = s.r > 1.2 ? 6 : 0;
      ctx.shadowColor = s.col;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;

    // Grid only on menu / game-over
    if (scrollGrid) drawSynthwaveGrid();
  }

  function drawSynthwaveGrid() {
    const W = canvas.width, H = canvas.height;
    const gy  = H * 0.52;   // horizon Y
    const bot = H;
    const gridH = bot - gy;

    ctx.save();

    // Sun glow halo
    const sunX = W / 2, sunY = gy;
    const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, gridH * 0.55);
    halo.addColorStop(0,   'rgba(255,45,120,0.35)');
    halo.addColorStop(0.4, 'rgba(180,0,255,0.15)');
    halo.addColorStop(1,   'transparent');
    ctx.fillStyle = halo;
    ctx.fillRect(0, gy - gridH * 0.5, W, gridH * 1.5);

    // Sun disc
    const sunR = Math.min(W * 0.09, gridH * 0.32);
    ctx.fillStyle = '#ff6ec7';
    ctx.shadowColor = '#ff2d78'; ctx.shadowBlur = 40;
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();

    // Horizontal stripes on sun
    ctx.shadowBlur = 0;
    for (let i = 0; i < 7; i++) {
      const ly = sunY - sunR + (i / 7) * sunR * 2 + sunR * 0.08;
      const hw = Math.sqrt(Math.max(0, sunR * sunR - (ly - sunY) ** 2));
      ctx.fillStyle = C.bg;
      ctx.fillRect(sunX - hw, ly, hw * 2, sunR * 0.075);
    }

    ctx.shadowBlur = 0;

    // Horizontal grid lines (perspective)
    const numH = 14;
    for (let i = 0; i <= numH; i++) {
      const t  = ((i + gridOffset / 60) / numH) % 1;
      const et = t * t;
      const y  = gy + et * gridH;
      if (y < gy) continue;
      const alpha = 0.12 + et * 0.75;
      const r = Math.floor(120 + et * 135);
      const g = 0;
      const b = Math.floor(255 - et * 130);
      ctx.globalAlpha   = alpha;
      ctx.strokeStyle   = `rgb(${r},${g},${b})`;
      ctx.lineWidth     = 1 + et;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Vertical lines converging to horizon
    const numV = 16;
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = C.pink;
    ctx.lineWidth   = 1;
    for (let i = 0; i <= numV; i++) {
      const bx = (i / numV) * W;
      ctx.beginPath(); ctx.moveTo(W / 2, gy); ctx.lineTo(bx, bot); ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawShip() {
    // Blink while invincible
    if (invTimer > 0 && Math.floor(blinkTimer * 9) % 2 === 0) return;

    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    const R = SHIP_R;

    // Outer glow
    ctx.shadowBlur  = 22;
    ctx.shadowColor = C.cyan;
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth   = 2;

    // Hull triangle
    ctx.beginPath();
    ctx.moveTo( R,        0);
    ctx.lineTo(-R * 0.75, -R * 0.62);
    ctx.lineTo(-R * 0.35,  0);
    ctx.lineTo(-R * 0.75,  R * 0.62);
    ctx.closePath();
    ctx.stroke();

    // Inner accent
    ctx.shadowBlur  = 8;
    ctx.shadowColor = C.pink;
    ctx.strokeStyle = C.pink;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.moveTo( R * 0.55,  0);
    ctx.lineTo(-R * 0.3,  -R * 0.32);
    ctx.lineTo(-R * 0.3,   R * 0.32);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }

  function drawBullet(b) {
    const alpha = Math.min(1, b.life / 0.3);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur  = 14;
    ctx.shadowColor = C.cyan;
    ctx.fillStyle   = C.cyan;
    ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();

    // Laser trail
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = alpha * 0.3;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.028, b.y - b.vy * 0.028);
    ctx.stroke();
    ctx.restore();
  }

  function drawAsteroid(a) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rot);

    ctx.shadowBlur  = 18;
    ctx.shadowColor = C.pink;
    ctx.strokeStyle = C.pink;
    ctx.lineWidth   = 2;

    ctx.beginPath();
    ctx.moveTo(a.verts[0].x, a.verts[0].y);
    for (let i = 1; i < a.verts.length; i++) ctx.lineTo(a.verts[i].x, a.verts[i].y);
    ctx.closePath();
    ctx.stroke();

    ctx.globalAlpha = 0.07;
    ctx.fillStyle   = C.pink;
    ctx.fill();

    ctx.restore();
  }

  function drawParticle(p) {
    const t = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = t * t;
    ctx.shadowBlur  = 8;
    ctx.shadowColor = p.colour;
    ctx.fillStyle   = p.colour;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.sz * (0.5 + 0.5 * t), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── HUD ──────────────────────────────────────────────────────────────────────
  function drawHUD() {
    const W = canvas.width;
    ctx.save();
    ctx.textBaseline = 'top';

    // Score (left)
    ctx.font         = '18px Orbitron, monospace';
    ctx.shadowBlur   = 12; ctx.shadowColor = C.cyan;
    ctx.fillStyle    = C.cyan;
    ctx.textAlign    = 'left';
    ctx.fillText(`SCORE  ${String(score).padStart(6,'0')}`, 18, 18);

    // Hi-score (centre)
    ctx.textAlign  = 'center';
    ctx.fillStyle  = C.pink; ctx.shadowColor = C.pink;
    ctx.fillText(`HI  ${String(hiScore).padStart(6,'0')}`, W / 2, 18);

    // Level (right)
    ctx.textAlign  = 'right';
    ctx.fillStyle  = C.purple; ctx.shadowColor = C.purple;
    ctx.fillText(`LEVEL  ${level}`, W - 18, 18);

    // Lives icons
    for (let i = 0; i < Math.min(lives, 8); i++) {
      const lx = 20 + i * 26, ly = 50;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(-Math.PI / 2);
      ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.5;
      ctx.shadowBlur = 7; ctx.shadowColor = C.cyan;
      const r = 8;
      ctx.beginPath();
      ctx.moveTo( r,       0);
      ctx.lineTo(-r * 0.75, -r * 0.62);
      ctx.lineTo(-r * 0.35,  0);
      ctx.lineTo(-r * 0.75,  r * 0.62);
      ctx.closePath(); ctx.stroke();
      ctx.restore();
    }

    // Level banner
    if (bannerTimer > 0) {
      const a = Math.min(1, bannerTimer * 1.5);
      ctx.globalAlpha  = a;
      ctx.textAlign    = 'center';
      ctx.font         = `bold ${Math.min(54, W * 0.08)}px Orbitron, monospace`;
      ctx.fillStyle    = C.yellow; ctx.shadowColor = C.yellow; ctx.shadowBlur = 35;
      ctx.fillText(`LEVEL  ${level}`, W / 2, canvas.height / 2 - 40);
      ctx.font         = `${Math.min(26, W * 0.038)}px Orbitron, monospace`;
      ctx.fillStyle    = C.pink;   ctx.shadowColor = C.pink;  ctx.shadowBlur = 16;
      ctx.fillText('GET READY', W / 2, canvas.height / 2 + 20);
    }

    // Paused overlay
    if (gameState === 'PAUSED') {
      ctx.globalAlpha = 1;
      ctx.textAlign   = 'center';
      ctx.font        = `bold ${Math.min(60, W * 0.09)}px Orbitron, monospace`;
      ctx.fillStyle   = C.cyan; ctx.shadowColor = C.cyan; ctx.shadowBlur = 45;
      ctx.fillText('PAUSED', W / 2, canvas.height / 2 - 35);
      ctx.font        = `${Math.min(22, W * 0.033)}px Orbitron, monospace`;
      ctx.fillStyle   = C.pink; ctx.shadowColor = C.pink; ctx.shadowBlur = 10;
      ctx.fillText('PRESS  P  TO  RESUME', W / 2, canvas.height / 2 + 28);
    }

    ctx.restore();
  }

  // ── Menu / Game Over screens ──────────────────────────────────────────────────
  function drawMenu() {
    const W = canvas.width, H = canvas.height;
    const t = performance.now() * 0.001;

    ctx.save();
    ctx.textAlign = 'center';

    // Title
    const ts = Math.min(82, W * 0.125);
    ctx.font        = `900 ${ts}px Orbitron, monospace`;
    ctx.shadowBlur  = 50; ctx.shadowColor = C.pink;
    ctx.fillStyle   = C.pink;
    ctx.fillText('MIAMI', W / 2, H * 0.23);

    ctx.fillStyle   = C.cyan; ctx.shadowColor = C.cyan;
    ctx.fillText('ASTEROIDS', W / 2, H * 0.23 + ts * 1.15);

    // Hi-score
    ctx.font        = `${Math.min(22, W * 0.033)}px Orbitron, monospace`;
    ctx.fillStyle   = C.pink; ctx.shadowColor = C.pink; ctx.shadowBlur = 14;
    ctx.fillText(`HI-SCORE  ${String(hiScore).padStart(6,'0')}`, W / 2, H * 0.61);

    // Pulsing start prompt
    const p = 0.5 + 0.5 * Math.sin(t * 2.8);
    ctx.globalAlpha = 0.45 + 0.55 * p;
    ctx.font        = `${Math.min(22, W * 0.033)}px Orbitron, monospace`;
    ctx.fillStyle   = C.yellow; ctx.shadowColor = C.yellow; ctx.shadowBlur = 20;
    ctx.fillText('PRESS  SPACE  OR  ENTER', W / 2, H * 0.72);
    ctx.globalAlpha = 1;

    // Controls
    ctx.font       = `${Math.min(13, W * 0.021)}px Orbitron, monospace`;
    ctx.fillStyle  = 'rgba(255,255,255,0.5)';
    ctx.shadowBlur = 0;
    const ctrl = ['← →  /  A D   ROTATE', '↑  /  W   THRUST',
                  'SPACE   FIRE', 'P   PAUSE'];
    ctrl.forEach((c, i) => ctx.fillText(c, W / 2, H * 0.81 + i * Math.min(21, H * 0.033)));

    ctx.restore();
  }

  function drawGameOver() {
    const W = canvas.width, H = canvas.height;
    const t = performance.now() * 0.001;

    ctx.save();
    ctx.textAlign = 'center';

    ctx.font        = `900 ${Math.min(70, W * 0.105)}px Orbitron, monospace`;
    ctx.shadowBlur  = 55; ctx.shadowColor = C.pink;
    ctx.fillStyle   = C.pink;
    ctx.fillText('GAME OVER', W / 2, H * 0.34);

    ctx.font        = `${Math.min(28, W * 0.042)}px Orbitron, monospace`;
    ctx.fillStyle   = C.cyan; ctx.shadowColor = C.cyan; ctx.shadowBlur = 16;
    ctx.fillText(`SCORE  ${String(score).padStart(6,'0')}`, W / 2, H * 0.50);

    ctx.fillStyle   = C.purple; ctx.shadowColor = C.purple;
    ctx.fillText(`HI-SCORE  ${String(hiScore).padStart(6,'0')}`, W / 2, H * 0.59);

    const p = 0.5 + 0.5 * Math.sin(t * 2.8);
    ctx.globalAlpha = 0.45 + 0.55 * p;
    ctx.font        = `${Math.min(20, W * 0.03)}px Orbitron, monospace`;
    ctx.fillStyle   = C.yellow; ctx.shadowColor = C.yellow; ctx.shadowBlur = 18;
    ctx.fillText('PRESS  SPACE  TO  PLAY  AGAIN', W / 2, H * 0.70);

    ctx.restore();
  }

  // ── Main Loop ─────────────────────────────────────────────────────────────────
  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;

    const scrollGrid = (gameState === 'MENU' || gameState === 'GAME_OVER');
    if (scrollGrid) gridOffset = (gridOffset + dt * 55) % 60;

    update(dt);
    drawBackground(scrollGrid);

    if (gameState === 'PLAYING' || gameState === 'PAUSED') {
      asteroids.forEach(drawAsteroid);
      bullets.forEach(drawBullet);
      particles.forEach(drawParticle);
      if (ship) drawShip();
      drawHUD();
    }

    if (gameState === 'MENU') {
      drawMenu();
    }

    if (gameState === 'GAME_OVER') {
      asteroids.forEach(drawAsteroid);
      particles.forEach(drawParticle);
      drawGameOver();
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(ts => { lastTime = ts; requestAnimationFrame(loop); });
})();
