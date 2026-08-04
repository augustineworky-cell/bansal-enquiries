// ============================================================
// COIN BURST — fires once when a lead is converted.
//
// Deliberately event-driven, not ambient: conversion is the
// milestone worth celebrating, and a burst that fires and stops
// costs nothing in daily distraction. The canvas is created on
// first use and the animation loop stops completely once the
// last coin has faded, so there is no idle rAF loop running.
// ============================================================
(function () {
  'use strict';

  var CONFIG = {
    coinCount: 46,
    gravity: 0.34,
    spread: 11,
    lift: 13,
    fade: 0.0075,
    faceColor: '#FBBF24',
    edgeColor: '#B45309'
  };

  var canvas = null, ctx = null, coins = [], running = false;

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

  function tick() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var alive = 0;
    for (var i = 0; i < coins.length; i++) {
      var c = coins[i];
      if (c.life <= 0) continue;
      alive++;

      c.vy += CONFIG.gravity;
      c.x += c.vx;
      c.y += c.vy;
      c.phase += c.spin;
      c.life -= CONFIG.fade;

      // Squash the ellipse on its horizontal axis to fake a
      // spinning disc without needing a 3D transform.
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
      // Nothing left to draw — stop the loop entirely.
      running = false;
      coins = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function celebrate(originX, originY) {
    if (reducedMotion()) return;
    ensureCanvas();

    var ox = (typeof originX === 'number') ? originX : window.innerWidth / 2;
    var oy = (typeof originY === 'number') ? originY : window.innerHeight * 0.42;

    for (var i = 0; i < CONFIG.coinCount; i++) {
      coins.push({
        x: ox,
        y: oy,
        vx: (Math.random() - 0.5) * CONFIG.spread,
        vy: -Math.random() * CONFIG.lift - 2,
        r: 4 + Math.random() * 4,
        phase: Math.random() * Math.PI * 2,
        spin: 0.12 + Math.random() * 0.28,
        life: 1
      });
    }

    if (!running) {
      running = true;
      requestAnimationFrame(tick);
    }
  }

  window.celebrateConversion = celebrate;
})();
