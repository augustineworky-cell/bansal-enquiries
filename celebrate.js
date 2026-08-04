// ============================================================
// COIN ANIMATION
//
// Two distinct effects share one canvas and one render loop:
//
//   1. Ambient rain  — fires automatically every AUTO_INTERVAL_MS.
//                      Coins fall from the top across the full width.
//   2. Conversion burst — fires when a lead converts. Explodes
//                      outward from the centre, more coins, bigger.
//
// They're deliberately different shapes of motion so a conversion
// still reads as an event rather than more of the same.
//
// The render loop stops completely whenever no coins are alive,
// so nothing spins in the background between bursts.
// ============================================================
(function () {
  'use strict';

  var CONFIG = {
    AUTO_INTERVAL_MS: 60000,  // how often the ambient rain fires
    autoEnabled: true,        // set false to stop the automatic rain
    rainCount: 22,            // coins per ambient fall
    burstCount: 46,           // coins per conversion burst
    gravity: 0.34,
    fade: 0.0075,
    faceColor: '#FBBF24',
    edgeColor: '#B45309'
  };

  var canvas = null, ctx = null, coins = [], running = false, timer = null;

  function reducedMotion() {
    return window.matchMedia &&
           window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'celebrate-canvas';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(tick);
  }

  function tick() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var alive = 0;
    for (var i = 0; i < coins.length; i++) {
      var c = coins[i];
      if (c.life <= 0) continue;

      c.vy += CONFIG.gravity * c.grav;
      c.x += c.vx;
      c.y += c.vy;
      c.phase += c.spin;
      c.life -= CONFIG.fade * c.fadeRate;

      if (c.y - c.r > canvas.height) { c.life = 0; continue; }
      alive++;

      var w = Math.abs(Math.cos(c.phase));

      ctx.globalAlpha = Math.max(0, Math.min(1, c.life));
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.r * w + 0.8, c.r, 0, 0, Math.PI * 2);
      ctx.fillStyle = w > 0.45 ? CONFIG.faceColor : CONFIG.edgeColor;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (alive > 0) {
      requestAnimationFrame(tick);
    } else {
      running = false;
      coins = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // Ambient: coins fall from above, across the whole width
  function rain() {
    if (reducedMotion()) return;
    ensureCanvas();

    for (var i = 0; i < CONFIG.rainCount; i++) {
      coins.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 220,
        vx: (Math.random() - 0.5) * 0.9,
        vy: 1 + Math.random() * 2,
        r: 3.5 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2,
        spin: 0.10 + Math.random() * 0.22,
        grav: 0.35,
        fadeRate: 0.35,
        life: 1
      });
    }
    start();
  }

  // Conversion: explodes outward from the centre
  function celebrate(originX, originY) {
    if (reducedMotion()) return;
    ensureCanvas();

    var ox = (typeof originX === 'number') ? originX : canvas.width / 2;
    var oy = (typeof originY === 'number') ? originY : canvas.height * 0.42;

    for (var i = 0; i < CONFIG.burstCount; i++) {
      coins.push({
        x: ox,
        y: oy,
        vx: (Math.random() - 0.5) * 11,
        vy: -Math.random() * 13 - 2,
        r: 4 + Math.random() * 4,
        phase: Math.random() * Math.PI * 2,
        spin: 0.12 + Math.random() * 0.28,
        grav: 1,
        fadeRate: 1,
        life: 1
      });
    }
    start();
  }

  function schedule() {
    if (timer) { clearInterval(timer); timer = null; }
    if (!CONFIG.autoEnabled) return;
    timer = setInterval(function () {
      // Don't animate into a tab nobody is looking at.
      if (document.hidden) return;
      rain();
    }, CONFIG.AUTO_INTERVAL_MS);
  }

  function setCoinInterval(ms) {
    CONFIG.AUTO_INTERVAL_MS = ms;
    schedule();
  }

  function setCoinAuto(on) {
    CONFIG.autoEnabled = !!on;
    schedule();
  }

  if (!reducedMotion()) schedule();

  window.celebrateConversion = celebrate;
  window.coinRain = rain;
  window.setCoinInterval = setCoinInterval;
  window.setCoinAuto = setCoinAuto;
  window.COIN_CONFIG = CONFIG;
})();
