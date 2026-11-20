(() => {
  const base = new URL('vendor/ocr/', document.baseURI).href;
  let workerP = null;
  let scriptP = null;

  function loadScript() {
    if (window.Tesseract) return Promise.resolve();
    if (!scriptP) {
      scriptP = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `${base}tesseract.min.js`;
        s.onload = resolve;
        s.onerror = () => { scriptP = null; reject(new Error('ocr_load')); };
        document.head.append(s);
      });
    }
    return scriptP;
  }

  async function worker() {
    if (!workerP) {
      workerP = (async () => {
        await loadScript();
        const w = await window.Tesseract.createWorker('eng', 1, {
          workerPath: `${base}worker.min.js`,
          corePath: `${base}tesseract-core-lstm.wasm.js`,
          langPath: base,
          gzip: true,
          workerBlobURL: false,
          cacheMethod: 'none'
        });
        await w.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '7', classify_bln_numeric_mode: '1' });
        return w;
      })().catch((e) => { workerP = null; throw e; });
    }
    return workerP;
  }

  function gray(ctx, w, h) {
    const d = ctx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return g;
  }

  function stretch(g) {
    const hist = new Uint32Array(256);
    for (const v of g) hist[Math.max(0, Math.min(255, v | 0))]++;
    const n = g.length;
    let lo = 0; let hi = 255; let acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.02) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= n * 0.02) { hi = i; break; } }
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < n; i++) g[i] = Math.max(0, Math.min(255, ((g[i] - lo) / span) * 255));
    return g;
  }

  function otsu(g) {
    const hist = new Uint32Array(256);
    for (const v of g) hist[v | 0]++;
    const n = g.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0; let wB = 0; let best = 0; let th = 127;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      const wF = n - wB;
      if (!wF) break;
      sumB += i * hist[i];
      const mB = sumB / wB; const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) ** 2;
      if (between > best) { best = between; th = i; }
    }
    return th;
  }

  function adaptive(g, w, h, r, c) {
    const ii = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) { row += g[y * w + x]; ii[(y + 1) * (w + 1) + x + 1] = ii[y * (w + 1) + x + 1] + row; }
    }
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r); const y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r); const x1 = Math.min(w, x + r + 1);
        const s = ii[y1 * (w + 1) + x1] - ii[y0 * (w + 1) + x1] - ii[y1 * (w + 1) + x0] + ii[y0 * (w + 1) + x0];
        out[y * w + x] = g[y * w + x] > s / ((y1 - y0) * (x1 - x0)) - c ? 255 : 0;
      }
    }
    return out;
  }

  function darkText(bin, w, h) {
    let edge = 0; let dark = 0;
    for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) { edge++; if (!bin[y * w + x]) dark++; }
    for (let y = 0; y < h; y++) for (const x of [0, 1, w - 2, w - 1]) { edge++; if (!bin[y * w + x]) dark++; }
    return dark / edge < 0.5;
  }

  function toCanvas(bin, w, h, invert) {
    const pad = Math.round(h * 0.25);
    const c = document.createElement('canvas');
    c.width = w + pad * 2; c.height = h + pad * 2;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = invert ? 255 - bin[i] : bin[i];
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, pad, pad);
    return c;
  }

  function binarize(src, H) {
    const w = Math.max(32, Math.round((src.width / src.height) * H));
    const c = document.createElement('canvas');
    c.width = w; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, H);
    const g = stretch(gray(ctx, w, H));
    const th = otsu(g);
    const global = new Uint8Array(w * H);
    for (let i = 0; i < g.length; i++) global[i] = g[i] > th ? 1 : 0;
    const loc = adaptive(g, w, H, Math.round(H * 0.5), 10);
    const local = new Uint8Array(w * H);
    for (let i = 0; i < loc.length; i++) local[i] = loc[i] ? 1 : 0;
    return { w, h: H, bins: [global, local] };
  }

  function close(bin, w, h, r) {
    const dil = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!bin[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; dil[yy * w + x] = 1; }
    }
    return dil;
  }

  function components(bin, w, h) {
    const lab = new Int32Array(w * h);
    const out = [];
    const stack = [];
    let id = 0;
    for (let i = 0; i < w * h; i++) {
      if (!bin[i] || lab[i]) continue;
      id++;
      let x0 = w; let x1 = 0; let y0 = h; let y1 = 0; let n = 0;
      stack.push(i); lab[i] = id;
      while (stack.length) {
        const j = stack.pop();
        const x = j % w; const y = (j / w) | 0;
        n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && bin[j - 1] && !lab[j - 1]) { lab[j - 1] = id; stack.push(j - 1); }
        if (x < w - 1 && bin[j + 1] && !lab[j + 1]) { lab[j + 1] = id; stack.push(j + 1); }
        if (y > 0 && bin[j - w] && !lab[j - w]) { lab[j - w] = id; stack.push(j - w); }
        if (y < h - 1 && bin[j + w] && !lab[j + w]) { lab[j + w] = id; stack.push(j + w); }
      }
      out.push({ id, x0, x1, y0, y1, n, cw: x1 - x0 + 1, ch: y1 - y0 + 1 });
    }
    return { lab, list: out };
  }

  function digitRow(bin, w, h) {
    const { lab, list } = components(bin, w, h);
    const cand = list.filter((c) => c.ch >= h * 0.15 && c.ch <= h * 0.92 && c.cw >= h * 0.03 && c.cw <= c.ch * 1.05
      && c.y0 > 0 && c.y1 < h - 1 && c.x0 > 0 && c.x1 < w - 1 && c.n / (c.cw * c.ch) > 0.08 && c.n / (c.cw * c.ch) < 0.92);
    if (cand.length < 2) return null;
    let best = null;
    for (const ref of cand) {
      const cy = (ref.y0 + ref.y1) / 2;
      const row = cand.filter((c) => Math.abs(c.ch - ref.ch) <= ref.ch * 0.22 && Math.abs((c.y0 + c.y1) / 2 - cy) <= ref.ch * 0.25);
      if (!best || row.length > best.length || (row.length === best.length && ref.ch > best[0].ch)) best = row;
    }
    if (!best || best.length < 2) return null;
    best.sort((a, b) => a.x0 - b.x0);
    const avgW = best.reduce((a, c) => a + c.cw, 0) / best.length;
    const kept = [best[0]];
    for (let i = 1; i < best.length; i++) {
      const prev = kept[kept.length - 1];
      if (best[i].x0 - prev.x1 > Math.max(avgW, best[i].ch * 0.7) * 2.2) { if (kept.length >= best.length - i) { kept.length = 0; } else break; }
      kept.push(best[i]);
    }
    return { lab, row: kept.length >= 2 ? kept : best };
  }

  function render(lab, w, row, invertSeg) {
    const H = 64; const pad = 24;
    const sc = H / Math.max(...row.map((c) => c.ch));
    const gapPx = 14;
    const widths = row.map((c) => Math.max(6, Math.round(c.cw * sc)));
    const W = widths.reduce((a, x) => a + x, 0) + gapPx * (row.length - 1) + pad * 2;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H + pad * 2;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    let x = pad;
    row.forEach((c, k) => {
      const ch = Math.round(c.ch * sc);
      const yOff = pad + (H - ch);
      const img = ctx.getImageData(x, yOff, widths[k], ch);
      for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < widths[k]; xx++) {
        const sx = c.x0 + Math.min(c.cw - 1, Math.floor(xx / sc)); const sy = c.y0 + Math.min(c.ch - 1, Math.floor(yy / sc));
        const on = invertSeg ? invertSeg(sx, sy, c) : lab[sy * w + sx] === c.id;
        if (on) { const o = (yy * widths[k] + xx) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 0; }
      }
      ctx.putImageData(img, x, yOff);
      x += widths[k] + gapPx;
    });
    return cv;
  }

  const SEGS = { 119: 0, 36: 1, 93: 2, 109: 3, 46: 4, 107: 5, 123: 6, 37: 7, 39: 7, 127: 8, 111: 9, 47: 9 };
  function sevenSeg(bin, w, c) {
    if (c.cw < c.ch * 0.3) return 1;
    const on = (fx0, fy0, fx1, fy1) => {
      let n = 0; let t = 0;
      const xa = c.x0 + Math.round(fx0 * c.cw); const xb = c.x0 + Math.round(fx1 * c.cw);
      const ya = c.y0 + Math.round(fy0 * c.ch); const yb = c.y0 + Math.round(fy1 * c.ch);
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { t++; n += bin[y * w + x]; }
      return t && n / t > 0.35;
    };
    const bits = [on(0.3, 0, 0.7, 0.1), on(0, 0.15, 0.2, 0.4), on(0.8, 0.15, 1, 0.4), on(0.3, 0.45, 0.7, 0.55), on(0, 0.6, 0.2, 0.85), on(0.8, 0.6, 1, 0.85), on(0.3, 0.9, 0.7, 1)];
    const code = bits.reduce((a, b, i) => a | (b ? 1 << i : 0), 0);
    return SEGS[code];
  }

  function rows(src) {
    const out = [];
    const { w, h, bins } = binarize(src, 160);
    for (const base of bins) {
      for (const pol of [0, 1]) {
        const b0 = pol ? base.map((v) => 1 - v) : base;
        for (const joined of [false, true]) {
          const bin = joined ? close(b0, w, h, 3) : b0;
          const r = digitRow(bin, w, h);
          if (!r) continue;
          const seg = r.row.map((c) => sevenSeg(bin, w, c));
          out.push({ canvas: render(r.lab, w, r.row), n: r.row.length, seg: seg.every((d) => d !== undefined) ? seg.join('') : null, key: `${r.row.length}:${r.row.map((c) => c.x0).join(',')}` });
        }
      }
    }
    const seen = new Set();
    return out.filter((x) => { if (seen.has(x.key)) return false; seen.add(x.key); return true; }).sort((a, b) => b.n - a.n).slice(0, 4);
  }

  function plausible(v, hint) {
    if (!hint || !(hint.prev >= 0)) return true;
    const up = v - hint.prev;
    if (up < 0) return false;
    const usual = hint.use > 0 ? hint.use : 0;
    return up <= Math.max(usual * 5, 3000);
  }

  function score(c, hint) {
    let s = c.conf;
    if (hint && hint.prev >= 0) {
      if (plausible(c.value, hint)) s += 40;
      const len = String(Math.floor(hint.prev)).length;
      if (String(Math.floor(c.value)).length === len) s += 10;
      if (hint.use > 0) s += Math.max(0, 20 - Math.abs(c.value - hint.prev - hint.use) / Math.max(hint.use, 1) * 10);
    }
    return s;
  }

  async function read(src, hint) {
    const w = await worker();
    const found = [];
    const add = (text, conf, n) => {
      if (!text || text.length < 2) return;
      const raw = Number(text);
      const lenBonus = n && text.length === n ? 8 : 0;
      found.push({ value: raw, conf: conf + lenBonus, text });
      if (hint && hint.prev >= 0 && !plausible(raw, hint) && plausible(raw / 10, hint)) found.push({ value: raw / 10, conf: conf + lenBonus - 3, text });
    };
    for (const r of rows(src)) {
      const res = await w.recognize(r.canvas);
      add(String(res.data.text || '').replace(/\D/g, ''), Number(res.data.confidence) || 0, r.n);
      if (r.seg) add(r.seg, 70, r.n);
    }
    if (!found.length) return null;
    found.sort((a, b) => score(b, hint) - score(a, hint));
    const best = found[0];
    return { value: best.value, confidence: best.conf, plausible: plausible(best.value, hint) };
  }

  window.MeterOCR = { read, warm: () => worker().then(() => true).catch(() => false) };
})();
