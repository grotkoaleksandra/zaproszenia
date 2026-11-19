// Halftone: turns any photo into ink dots (same idea as Karol on cotoaleksandra).
// Reusable for the template business: any host photo → on-brand card art.
window.Halftone = (() => {
  // Draw `src` (img/canvas) into `canvas` as a halftone, object-fit: cover.
  function render(canvas, src, { cell = 5, ink = "#2a2926", contrast = 1.25, angle = 45 } = {}) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // sample the source on a grid big enough to cover the rotated screen
    const diag = Math.ceil(Math.hypot(W, H));
    const cols = Math.ceil(diag / cell), rows = cols;
    const s = document.createElement("canvas");
    s.width = cols; s.height = rows;
    const sx = s.getContext("2d", { willReadFrequently: true });
    sx.fillStyle = "#fff"; sx.fillRect(0, 0, cols, rows);
    // cover-fit the source into the W×H window, then place that inside the diag square
    const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
    const scale = Math.max(W / sw, H / sh);
    const dw = sw * scale, dh = sh * scale;
    const k = cols / diag;
    sx.save();
    sx.translate(cols / 2, rows / 2);
    sx.rotate((-angle * Math.PI) / 180);
    sx.drawImage(src, (-dw / 2) * k, (-dh / 2) * k, dw * k, dh * k);
    sx.restore();
    const px = sx.getImageData(0, 0, cols, rows).data;

    ctx.fillStyle = ink;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.translate(-diag / 2, -diag / 2);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
        let d = Math.min(1, Math.max(0, (1 - lum - 0.5) * contrast + 0.5));
        if (d < 0.06) continue;
        const r = (cell / 2) * Math.sqrt(d) * 1.12;
        ctx.beginPath();
        ctx.arc(x * cell + cell / 2, y * cell + cell / 2, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Grainy black-and-white photo on cream paper (cover-fit), with film grain.
  function photo(canvas, src, { ink = [42, 41, 38], paper = [251, 247, 236], contrast = 1.5, grain = 0.22 } = {}) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
    const s = Math.max(canvas.width / sw, canvas.height / sh), dw = sw * s, dh = sh * s;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height), p = id.data;
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < p.length; i += 4) {
      let l = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) / 255;
      l = Math.min(1, Math.max(0, (l - 0.5) * contrast + 0.55));
      const v = Math.max(0, Math.min(1, Math.pow(l, 1.1) + (rnd() - 0.5) * grain));
      p[i] = ink[0] + v * (paper[0] - ink[0]); p[i + 1] = ink[1] + v * (paper[1] - ink[1]); p[i + 2] = ink[2] + v * (paper[2] - ink[2]);
    }
    ctx.putImageData(id, 0, 0);
  }

  // Stand-in when there's no photo: seven swords standing in a row,
  // points down, under a soft moon. No figure.
  function standIn() {
    const c = document.createElement("canvas");
    c.width = 360; c.height = 480;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 360, 480);
    const moon = g.createRadialGradient(180, 190, 10, 180, 190, 160);
    moon.addColorStop(0, "rgba(0,0,0,.4)"); moon.addColorStop(.55, "rgba(0,0,0,.15)"); moon.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = moon; g.beginPath(); g.arc(180, 190, 160, 0, 7); g.fill();
    const sword = (x, top, len, tone) => {
      const bl = g.createLinearGradient(x - 10, 0, x + 10, 0);
      bl.addColorStop(0, tone); bl.addColorStop(.5, "#a8a8a8"); bl.addColorStop(1, tone);
      g.fillStyle = bl;
      g.beginPath(); g.moveTo(x - 9, top + 54); g.lineTo(x + 9, top + 54); g.lineTo(x + 7, top + 54 + len); g.lineTo(x, top + 78 + len); g.lineTo(x - 7, top + 54 + len); g.closePath(); g.fill();
      g.fillStyle = "#111";
      g.fillRect(x - 24, top + 44, 48, 11);                  // cross-guard
      g.fillRect(x - 5, top + 12, 10, 32);                   // grip
      g.beginPath(); g.arc(x, top + 9, 10, 0, 7); g.fill(); // pommel
    };
    for (let i = 0; i < 7; i++) {
      const t = (i - 3) / 3;                                  // -1 … 1
      sword(54 + i * 42, 60 + t * t * 44, 250 - t * t * 30, i % 2 ? "#2a2a2a" : "#444");
    }
    g.fillStyle = "#222";
    [[40, 40, 3], [322, 52, 2.5], [300, 440, 2], [52, 450, 2]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
    return c;
  }

  return { render, photo, standIn };
})();
