/**
 * sakura-petals.js — Pétalos de cerezo cayendo detrás del contenido.
 *
 * Rendimiento: cada pétalo se dibuja UNA vez en su propio canvas (textura, volumen,
 * brillo, borde, sombra y saturación ya incluidos). En cada fotograma solo se
 * transforma y se copia esa imagen, sin filtros, sombras ni degradados.
 *
 * - Canvas fijo, sin capturar clics (pointer-events: none)
 * - Se desactiva con prefers-reduced-motion
 * - Arranca cuando la página ya cargó y el navegador está libre
 * - Se pausa cuando la pestaña no está visible
 * - Menos pétalos en pantallas pequeñas y densidad de píxeles limitada a 1.5
 */
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduceMotion) {
  const iniciarCuandoLibre = () => {
    if ("requestIdleCallback" in window) requestIdleCallback(iniciarPetalos, { timeout: 2000 });
    else setTimeout(iniciarPetalos, 300);
  };
  if (document.readyState === "complete") iniciarCuandoLibre();
  else window.addEventListener("load", iniciarCuandoLibre, { once: true });
}

function iniciarPetalos() {
  const canvas = document.createElement("canvas");
  canvas.className = "sakura-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  const ctx = canvas.getContext("2d");
  const petals = [];
  const TOTAL = window.innerWidth < 700 ? 10 : 18;
  const TEX_SIZE = 128;
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  let time = 0;
  let frameId = null;

  // Tonos reales de flor de cerezo: blanco rosado, rosa pálido y rosa intenso en las venas
  const PALETTE = [
    { light: "#fff5f8", fill: "#ffd3de", vein: "#f2a6b9", dot: "#e7889f" },
    { light: "#fff0f4", fill: "#ffc2d1", vein: "#ec93a9", dot: "#dd7290" },
    { light: "#ffffff", fill: "#ffdbe5", vein: "#f5b3c4", dot: "#e99cae" },
    { light: "#fff8fa", fill: "#fbc9d6", vein: "#e98ea5", dot: "#d9688a" },
  ];

  function resize() {
    canvas.width = Math.round(window.innerWidth * DPR);
    canvas.height = Math.round(window.innerHeight * DPR);
  }

  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  // Textura: degradado, manchas suaves, venas desde la base y puntos finos
  function makeTexture(c0) {
    const c = document.createElement("canvas");
    c.width = c.height = TEX_SIZE;
    const g = c.getContext("2d");
    const B = TEX_SIZE;

    const base = g.createLinearGradient(B / 2, 0, B / 2 + random(-8, 8), B);
    base.addColorStop(0, c0.light);
    base.addColorStop(0.5, c0.fill);
    base.addColorStop(1, c0.vein);
    g.fillStyle = base;
    g.fillRect(0, 0, B, B);

    for (let i = 0, n = Math.floor(random(4, 8)); i < n; i++) {
      const x = random(0, B), y = random(0, B), r = random(10, 35);
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, Math.random() > 0.5 ? c0.vein : "#ffffff");
      rg.addColorStop(1, "rgba(255,255,255,0)");
      g.globalAlpha = random(0.06, 0.18);
      g.fillStyle = rg;
      g.fillRect(0, 0, B, B);
    }

    g.strokeStyle = c0.vein;
    for (let i = 0, n = Math.floor(random(5, 9)); i < n; i++) {
      g.globalAlpha = random(0.15, 0.4);
      g.lineWidth = random(0.5, 1.4);
      g.beginPath();
      g.moveTo(B / 2 + random(-3, 3), B * 0.92);
      g.quadraticCurveTo(B * random(0.2, 0.8), B * random(0.4, 0.65), B * random(0.1, 0.9), B * random(0.05, 0.35));
      g.stroke();
    }

    g.fillStyle = c0.dot;
    for (let i = 0, n = Math.floor(random(50, 90)); i < n; i++) {
      g.globalAlpha = random(0.06, 0.2);
      g.fillRect(random(0, B), random(0, B), random(0.6, 1.4), random(0.6, 1.4));
    }

    g.globalAlpha = 1;
    return c;
  }

  // Forma de lágrima: parte superior redondeada y base en punta; asym varía cada lado
  function petalPath(g, s, asym = 1) {
    const R = asym;
    const L = 2 - asym;
    g.beginPath();
    g.moveTo(0, -0.9 * s);
    g.bezierCurveTo(0.6 * s * R, -0.95 * s, 0.95 * s * R, -0.5 * s, 0.9 * s * R, -0.2 * s);
    g.bezierCurveTo(0.85 * s * R, 0.35 * s, 0.4 * s * R, 0.85 * s, 0, 1.0 * s);
    g.bezierCurveTo(-0.4 * s * L, 0.85 * s, -0.85 * s * L, 0.35 * s, -0.9 * s * L, -0.2 * s);
    g.bezierCurveTo(-0.95 * s * L, -0.5 * s, -0.6 * s * L, -0.95 * s, 0, -0.9 * s);
    g.closePath();
  }

  /** Dibuja el pétalo terminado (una sola vez) en su propio canvas. */
  function makeSprite(p) {
    const s = p.size * DPR;
    const pad = Math.ceil(s * 0.25 + 6 * DPR);
    const lado = Math.ceil(s * 2 + pad * 2);
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = lado;
    const g = sprite.getContext("2d");
    g.translate(lado / 2, lado / 2);

    // Sombra suave debajo, más marcada en los cercanos
    g.save();
    g.shadowColor = "rgba(180, 90, 110, 0.14)";
    g.shadowBlur = (4 + p.depth * 8) * DPR;
    g.shadowOffsetY = (2 + p.depth * 4) * DPR;
    // Relleno opaco (la textura lo cubrirá con la misma forma): así la sombra sale completa
    g.fillStyle = p.colors.fill;
    petalPath(g, s, p.asym);
    g.fill();
    g.restore();

    g.save();
    petalPath(g, s, p.asym);
    g.clip();
    // Los cercanos tienen colores más intensos; los lejanos se ven más pálidos
    if ("filter" in g) g.filter = `saturate(${(0.8 + p.depth * 0.6).toFixed(2)})`;
    g.drawImage(makeTexture(p.colors), -s, -s, s * 2, s * 2);
    g.filter = "none";

    // Volumen: sombra en un lado y luz en el otro, como un pétalo ahuecado
    const side = p.asym > 1 ? 1 : -1;
    const shadow = g.createLinearGradient(-s * side, 0, s * side, 0);
    shadow.addColorStop(0, "rgba(170, 95, 115, 0.28)");
    shadow.addColorStop(0.6, "rgba(255, 255, 255, 0)");
    g.globalCompositeOperation = "multiply";
    g.fillStyle = shadow;
    g.fillRect(-s, -s, s * 2, s * 2);

    const glow = g.createRadialGradient(-s * 0.25 * side, -s * 0.4, 0, -s * 0.25 * side, -s * 0.4, s * 0.9);
    glow.addColorStop(0, "rgba(255, 255, 255, 0.45)");
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    g.globalCompositeOperation = "source-over";
    g.fillStyle = glow;
    g.fillRect(-s, -s, s * 2, s * 2);
    g.restore();

    // Borde más claro: simula el filo translúcido del pétalo
    g.globalAlpha = 0.25;
    g.strokeStyle = "#ffffff";
    g.lineWidth = Math.max(0.6, s * 0.04);
    petalPath(g, s, p.asym);
    g.stroke();

    p.sprite = sprite;
    p.spriteHalf = lado / 2;
  }

  function resetMotion(p, startAbove) {
    // Nacen hacia la esquina superior izquierda y caen en diagonal
    p.x = startAbove ? random(-150, window.innerWidth * 0.3) : random(-100, window.innerWidth * 0.6);
    p.y = startAbove ? random(-150, -10) : random(-100, window.innerHeight * 0.6);
    const z = p.depth;
    p.speedY = 0.1 + z * 0.6 + random(0, 0.08);
    p.drift = random(0.15, 0.35) + z * 0.2;
    p.swayAmp = random(0.3, 0.9);
    p.swayPhase = random(0, Math.PI * 2);
    p.swaySpeed = random(0.002, 0.007);
    p.angle = random(0, Math.PI * 2);
    p.spin = random(-0.0015, 0.0015) * (0.5 + z);
    p.flip = random(0, Math.PI * 2);
    p.flipSpeed = random(0.002, 0.007);
    p.tumble = random(0, Math.PI * 2);
    p.tumbleSpeed = random(0.002, 0.005);
  }

  function createPetal() {
    // La profundidad (tamaño, intensidad, velocidad) se fija al crear el pétalo
    const depth = random(0, 1);
    const p = {
      depth,
      colors: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      asym: random(0.9, 1.1),
      size: Math.max(3, 3 + Math.pow(depth, 1.2) * 75 + random(-2, 2)),
    };
    makeSprite(p);
    resetMotion(p, false);
    return p;
  }

  // Viento global: ráfagas suaves que empujan a todos los pétalos
  function windAt(t) {
    return Math.sin(t * 0.002) * 0.25 + Math.sin(t * 0.0057) * 0.12 + 0.1;
  }

  function drawPetal(p) {
    // Voltea sobre el eje vertical y se inclina sobre el horizontal
    const flipX = Math.cos(p.flip);
    const tiltY = 0.3 + 0.7 * Math.abs(Math.cos(p.tumble));
    const skew = Math.sin(p.tumble) * 0.3;
    // La cara de atrás es un poco más oscura; el pétalo se oscurece al inclinarse
    ctx.globalAlpha = (flipX < 0 ? 0.82 : 1) * (0.78 + 0.22 * Math.abs(flipX));

    const cos = Math.cos(p.angle), sin = Math.sin(p.angle);
    // translate(x,y) · rotate(angle) · transform(flipX, 0, skew, tiltY) en una sola matriz
    ctx.setTransform(
      cos * flipX, sin * flipX,
      cos * skew - sin * tiltY, sin * skew + cos * tiltY,
      p.x * DPR, p.y * DPR,
    );
    ctx.drawImage(p.sprite, -p.spriteHalf, -p.spriteHalf);
  }

  function update() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    time++;
    const wind = windAt(time);

    for (const p of petals) {
      const gust = wind * (0.4 + p.depth * 0.8);
      p.y += p.speedY;
      p.swayPhase += p.swaySpeed;
      p.x += p.drift + gust + Math.sin(p.swayPhase) * p.swayAmp * (0.4 + p.depth * 0.6);
      p.angle += p.spin + Math.sin(p.swayPhase) * 0.0005;
      p.flip += p.flipSpeed;
      p.tumble += p.tumbleSpeed;

      // Al salir por la derecha o por abajo, reaparece arriba a la izquierda
      if (p.y > window.innerHeight + 80 || p.x > window.innerWidth + 80) resetMotion(p, true);
      drawPetal(p);
    }

    frameId = requestAnimationFrame(update);
  }

  function iniciar() {
    if (frameId === null) frameId = requestAnimationFrame(update);
  }

  function detener() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
  }

  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) detener();
    else iniciar();
  });

  resize();
  for (let i = 0; i < TOTAL; i++) petals.push(createPetal());
  // Lejanos primero y cercanos al final (la profundidad ya no cambia)
  petals.sort((a, b) => a.depth - b.depth);
  iniciar();
}
