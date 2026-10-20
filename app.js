const $ = id => document.getElementById(id);
const cv = $('studioCanvas'), ctx = cv.getContext('2d');
const FORMATS = { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [1000, 1000], '4:5': [864, 1080] };
const FONTS = { 'Anton': 400, 'Bebas Neue': 400, 'Montserrat': 800, 'Pacifico': 400, 'Roboto Mono': 700 };
const ICON = { text: '🔤', image: '🖼', video: '🎞', cam: '📷', screen: '🖥' };
const PX = 60; // pixels por segundo na timeline

let W = 1280, H = 720, layers = [], sel = null, t = 0, playing = false, recording = false;
let last = performance.now(), uid = 1, drag = null;
let ac, dest, mr, chunks = [], micStream;
const wired = new WeakSet();
const STYLES = { std: { color: '#ffffff', stroke: 0, box: null }, meme: { color: '#ffffff', stroke: 1, box: null }, headline: { color: '#000000', stroke: 0, box: '#ffee65' }, caption: { color: '#ffffff', stroke: 0, box: 'rgba(0,0,0,.7)' } };
let hist = [], hi = -1, bgMode = 'black', counting = false;
const bgc = document.createElement('canvas');
function snap() { hist = hist.slice(0, hi + 1); hist.push(layers.map(l => ({ ...l }))); if (hist.length > 60) hist.shift(); hi = hist.length - 1; }
function restore(i) {
  if (i < 0 || i >= hist.length) return;
  hi = i; const id = sel && sel.id;
  layers = hist[i].map(l => ({ ...l })).filter(l => !l.stream || l.stream.active);
  renderTL(); select(layers.find(l => l.id === id) || null);
}

Object.keys(FONTS).forEach(f => document.fonts.load(`${FONTS[f]} 40px "${f}"`));

const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const len = () => Math.max(15, ...layers.filter(l => l.dur < 1e8).map(l => l.start + l.dur)) + 3;
const visible = l => t >= l.start && t < l.start + l.dur;
const fontStr = l => `${FONTS[l.font]} ${l.size}px "${l.font}"`;
const fitSize = (nw, nh, f = 0.6) => { const s = Math.min(W * f / nw, H * f / nh); return { w: nw * s, h: nh * s }; };

/* ---------- Formato ---------- */
function fit() {
  const r = $('canvasWrap').getBoundingClientRect();
  const s = Math.min((r.width - 24) / W, (r.height - 24) / H);
  cv.style.width = W * s + 'px';
  cv.style.height = H * s + 'px';
}
new ResizeObserver(fit).observe($('canvasWrap'));

$('formatSel').onchange = e => {
  const [w, h] = FORMATS[e.target.value], s = Math.min(w / W, h / H);
  layers.forEach(l => {
    l.x *= w / W; l.y *= h / H;
    if (l.kind === 'text') l.size *= s; else { l.w *= s; l.h *= s; }
  });
  W = w; H = h; cv.width = W; cv.height = H; fit();
};

/* ---------- Camadas ---------- */
function addLayer(o) {
  const l = { id: uid++, x: W / 2, y: H / 2, w: 300, h: 200, start: t, dur: 8, ...o };
  layers.push(l); renderTL(); select(l); snap(); return l;
}

function removeLayer(l) {
  l.stream?.getTracks().forEach(x => x.stop());
  l.node?.pause?.();
  layers = layers.filter(x => x !== l);
  renderTL(); select(null); snap();
}

$('mediaInput').onchange = e => {
  [...e.target.files].forEach(f => {
    const url = URL.createObjectURL(f);
    if (f.type.startsWith('image/')) {
      const n = new Image();
      n.onload = () => addLayer({ kind: 'image', name: f.name, node: n, ...fitSize(n.width, n.height) });
      n.src = url;
    } else {
      const v = document.createElement('video');
      v.playsInline = true;
      v.onloadedmetadata = () => addLayer({ kind: 'video', name: f.name, node: v, dur: v.duration || 8, ...fitSize(v.videoWidth, v.videoHeight) });
      v.src = url;
    }
  });
  e.target.value = '';
};

function addLive(kind, name, stream) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.srcObject = stream;
  v.onloadedmetadata = () => {
    v.play();
    const sz = fitSize(v.videoWidth, v.videoHeight, kind === 'cam' ? 0.3 : 0.9);
    if (kind === 'cam') sz.w = sz.h = Math.min(sz.w, sz.h);
    const l = addLayer({ kind, name, node: v, stream, start: 0, dur: 1e9, ...sz, ...(kind === 'cam' ? { shape: 'circle', mirror: true } : {}) });
    if (kind === 'cam') { l.x = W - l.w / 2 - 30; l.y = H - l.h / 2 - 30; }
    stream.getVideoTracks()[0].onended = () => layers.includes(l) && removeLayer(l);
  };
}

$('screenBtn').onclick = async () => {
  try { addLive('screen', 'Tela', await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })); } catch {}
};
$('camBtn').onclick = async () => {
  try { addLive('cam', 'Câmera', await navigator.mediaDevices.getUserMedia({ video: true })); }
  catch { alert('Câmera indisponível ou permissão negada.'); }
};

$('addTextBtn').onclick = () => {
  const s = $('textInput').value.trim() || 'Seu texto aqui';
  const l = addLayer({ kind: 'text', name: s, text: s, font: 'Anton', size: Math.round(H * 0.07), dur: 5, ...STYLES.meme });
  l.y = H * 0.12; // já nasce no topo
  $('textInput').value = '';
};

/* ---------- Painel de propriedades ---------- */
function select(l) {
  sel = l;
  document.querySelectorAll('.clip').forEach(c => c.classList.toggle('sel', !!l && +c.dataset.id === l.id));
  $('props').classList.toggle('hidden', !l);
  $('textProps').classList.toggle('hidden', !l || l.kind !== 'text');
  $('camProps').classList.toggle('hidden', !l || l.kind !== 'cam');
  $('volProps').classList.toggle('hidden', !l || l.kind !== 'video');
  $('chromaProps').classList.toggle('hidden', !l || !['cam', 'video'].includes(l.kind));
  syncProps();
}
function syncProps() {
  if (!sel) return;
  $('pOpacity').value = (sel.opacity ?? 1) * 100; $('pVol').value = (sel.vol ?? 1) * 100;
  $('pChroma').checked = !!sel.chroma; $('pChromaThr').value = 130 - (sel.chromaThr ?? 40);
  if (sel.kind === 'cam') { $('pShape').value = sel.shape; $('pMirror').checked = !!sel.mirror; }
  if (sel.kind !== 'text') return;
  $('pText').value = sel.text; $('pFont').value = sel.font;
  $('pSize').value = sel.size; $('pColor').value = sel.color;
}
$('pText').oninput = e => { if (sel) { sel.text = e.target.value || ' '; sel.name = sel.text; renderTL(); } };
$('pFont').onchange = e => { if (sel) sel.font = e.target.value; };
$('pSize').oninput = e => { if (sel) sel.size = +e.target.value; };
$('pColor').oninput = e => { if (sel) sel.color = e.target.value; };
$('pStyle').onchange = e => { const st = STYLES[e.target.value]; if (sel && st) { Object.assign(sel, st); syncProps(); snap(); } e.target.value = ''; };
$('pOpacity').oninput = e => { if (sel) sel.opacity = e.target.value / 100; };
$('pVol').oninput = e => { if (sel) sel.vol = e.target.value / 100; };
$('pShape').onchange = e => {
  if (!sel) return; sel.shape = e.target.value;
  if (sel.shape === 'circle') sel.w = sel.h = Math.min(sel.w, sel.h);
  else sel.h = sel.w * sel.node.videoHeight / sel.node.videoWidth;
  snap();
};
$('pMirror').onchange = e => { if (sel) { sel.mirror = e.target.checked; snap(); } };
['pText', 'pFont', 'pSize', 'pColor', 'pOpacity', 'pVol'].forEach(id => $(id).addEventListener('change', snap));
$('dupBtn').onclick = () => {
  if (sel && ['text', 'image'].includes(sel.kind)) addLayer({ ...sel, id: uid++, x: sel.x + 30, y: sel.y + 30 });
};
const order = d => { if (!sel) return; const i = layers.indexOf(sel); layers.splice(i, 1); layers.splice(Math.max(0, Math.min(layers.length, i + d)), 0, sel); renderTL(); snap(); };
$('frontBtn').onclick = () => order(1);
$('backBtn').onclick = () => order(-1);
$('undoBtn').onclick = () => restore(hi - 1);
$('redoBtn').onclick = () => restore(hi + 1);
$('bgSel').onchange = e => { bgMode = e.target.value; };
$('pChroma').onchange = e => {
  if (!sel) return; sel.chroma = e.target.checked;
  if (sel.chroma && sel.kind === 'cam') { sel.shape = 'rect'; sel.h = sel.w * sel.node.videoHeight / sel.node.videoWidth; syncProps(); }
  snap();
};
$('pChromaThr').oninput = e => { if (sel) sel.chromaThr = 130 - e.target.value; };
$('pChromaThr').addEventListener('change', snap);
$('greenLeft').onclick = () => applyGreen('greenLeft');
$('greenCenter').onclick = () => applyGreen('greenCenter');
$('greenRight').onclick = () => applyGreen('greenRight');
$('layoutStack').onclick = () => applyLayout('stack');
$('layoutCorner').onclick = () => applyLayout('corner');
$('delBtn').onclick = () => sel && removeLayer(sel);
addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === 'z') { e.preventDefault(); restore(e.shiftKey ? hi + 1 : hi - 1); }
  else if (mod && k === 'y') { e.preventDefault(); restore(hi + 1); }
  else if ((k === 'delete' || k === 'backspace') && sel) removeLayer(sel);
  else if (k === ' ') { e.preventDefault(); document.activeElement.blur?.(); setPlay(!playing); }
});

/* ---------- Arrastar e redimensionar no vídeo ---------- */
const pos = e => {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
};
cv.onpointerdown = e => {
  const p = pos(e); cv.setPointerCapture(e.pointerId);
  if (sel && visible(sel) && Math.abs(p.x - (sel.x + sel.w / 2)) < 22 && Math.abs(p.y - (sel.y + sel.h / 2)) < 22) {
    drag = { mode: 'size', l: sel, d0: Math.hypot(p.x - sel.x, p.y - sel.y), w0: sel.w, h0: sel.h, s0: sel.size };
    return;
  }
  const hit = [...layers].reverse().find(l => visible(l) && Math.abs(p.x - l.x) <= l.w / 2 && Math.abs(p.y - l.y) <= l.h / 2);
  select(hit || null);
  if (hit) drag = { mode: 'move', l: hit, dx: p.x - hit.x, dy: p.y - hit.y };
};
cv.onpointermove = e => {
  if (!drag) return;
  drag.moved = true;
  const p = pos(e), l = drag.l;
  if (drag.mode === 'move') { l.x = p.x - drag.dx; l.y = p.y - drag.dy; return; }
  const k = Math.max(0.1, Math.hypot(p.x - l.x, p.y - l.y) / drag.d0);
  if (l.kind === 'text') { l.size = Math.max(10, drag.s0 * k); $('pSize').value = l.size; }
  else { l.w = drag.w0 * k; l.h = drag.h0 * k; }
};
cv.onpointerup = () => { if (drag && drag.moved) snap(); drag = null; };

/* ---------- Timeline ---------- */
function renderTL() {
  const rows = $('rows'); rows.innerHTML = '';
  const L = len();
  layers.forEach(l => {
    const row = document.createElement('div'); row.className = 'row';
    const c = document.createElement('div');
    c.className = `clip ${l.kind}${l === sel ? ' sel' : ''}`; c.dataset.id = l.id;
    const label = document.createElement('span'); label.textContent = `${ICON[l.kind]} ${l.name}`;
    const h = document.createElement('i'); c.append(label, h);
    const place = () => { c.style.left = l.start * PX + 'px'; c.style.width = Math.min(l.dur, L - l.start) * PX + 'px'; };
    place();
    c.onpointerdown = e => {
      e.stopPropagation(); select(l); c.setPointerCapture(e.pointerId);
      const x0 = e.clientX, s0 = l.start, d0 = l.dur, resize = e.target === h;
      c.onpointermove = ev => {
        const dx = (ev.clientX - x0) / PX;
        if (resize) { if (l.dur < 1e8) l.dur = Math.max(0.5, d0 + dx); }
        else l.start = Math.max(0, s0 + dx);
        place();
      };
      c.onpointerup = () => { c.onpointermove = null; if (Math.abs(l.start - s0) + Math.abs(l.dur - d0) > 0.01) snap(); renderTL(); };
    };
    row.append(c); rows.append(row);
  });
}

const scrub = e => { t = Math.max(0, (e.clientX - $('tracks').getBoundingClientRect().left) / PX); seek(); };
$('ruler').onpointerdown = e => { $('ruler').setPointerCapture(e.pointerId); scrub(e); };
$('ruler').onpointermove = e => { if (e.buttons) scrub(e); };

function seek() {
  layers.forEach(l => { if (l.kind === 'video' && visible(l)) l.node.currentTime = Math.max(0, t - l.start); });
}
function setPlay(b) { playing = b; $('playBtn').textContent = b ? '⏸' : '▶'; }
$('playBtn').onclick = () => setPlay(!playing);
$('rewBtn').onclick = () => { t = 0; seek(); };

/* ---------- Desenho ---------- */
function camPath(l) {
  ctx.beginPath();
  if (l.shape === 'circle') ctx.arc(l.x, l.y, Math.min(l.w, l.h) / 2, 0, 7);
  else ctx.roundRect(l.x - l.w / 2, l.y - l.h / 2, l.w, l.h, l.shape === 'round' ? 28 : 0);
}
function draw(l) {
  ctx.save(); ctx.globalAlpha = l.opacity ?? 1;
  if (l.kind === 'text') {
    ctx.font = fontStr(l);
    const pad = l.box ? l.size * 0.35 : 0;
    l.w = ctx.measureText(l.text).width + pad * 2; l.h = l.size * 1.2 + pad;
    if (l.box) { ctx.fillStyle = l.box; ctx.beginPath(); ctx.roundRect(l.x - l.w / 2, l.y - l.h / 2, l.w, l.h, 14); ctx.fill(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    if (l.stroke) { ctx.lineWidth = l.size * 0.14; ctx.strokeStyle = '#000'; ctx.strokeText(l.text, l.x, l.y); }
    else if (!l.box) { ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 8; }
    ctx.fillStyle = l.color; ctx.fillText(l.text, l.x, l.y);
  } else if (l.node.readyState >= 2 || l.node.readyState === undefined) {
    const x = l.x - l.w / 2, y = l.y - l.h / 2;
    const src = l.chroma ? keyed(l) : l.node;
    if (l.kind === 'cam') {
      const m = Math.min(l.w, l.h), vw = l.node.videoWidth, vh = l.node.videoHeight;
      camPath(l); ctx.clip();
      if (l.mirror) { ctx.translate(l.x * 2, 0); ctx.scale(-1, 1); }
      if (l.shape === 'circle') { const s = Math.max(m / vw, m / vh); ctx.drawImage(src, l.x - vw * s / 2, l.y - vh * s / 2, vw * s, vh * s); }
      else ctx.drawImage(src, x, y, l.w, l.h);
      ctx.restore(); ctx.save(); ctx.globalAlpha = l.opacity ?? 1;
      if (!l.chroma) { camPath(l); ctx.strokeStyle = '#ffee65'; ctx.lineWidth = 5; ctx.stroke(); }
    } else ctx.drawImage(src, x, y, l.w, l.h);
  }
  ctx.restore();
}

function frame(now) {
  const dt = (now - last) / 1000; last = now;
  if (playing) {
    t += dt;
    if (!recording && t >= len()) { t = len(); setPlay(false); }
  }
  ctx.fillStyle = '#0a0a0c'; ctx.fillRect(0, 0, W, H);
  if (bgMode === 'blur') {
    const src = layers.find(l => ['video', 'image', 'screen'].includes(l.kind) && visible(l) && !(l.node.readyState < 2));
    if (src) {
      const n = src.node, nw = n.videoWidth || n.width, nh = n.videoHeight || n.height;
      const sw = 40, sh = Math.max(1, Math.round(40 * H / W)), s = Math.max(sw / nw, sh / nh);
      bgc.width = sw; bgc.height = sh;
      bgc.getContext('2d').drawImage(n, (sw - nw * s) / 2, (sh - nh * s) / 2, nw * s, nh * s);
      ctx.drawImage(bgc, 0, 0, W, H); ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(0, 0, W, H);
    }
  }
  layers.forEach(l => {
    const vis = visible(l);
    if (l.kind === 'video') {
      const v = l.node, want = vis && playing; v.volume = l.vol ?? 1;
      if (want && v.paused && !v.ended) { v.currentTime = Math.max(0, t - l.start); v.play().catch(() => {}); }
      else if (!want && !v.paused) v.pause();
    }
    if (vis) draw(l);
  });
  if (sel && visible(sel) && !recording) {
    const x = sel.x - sel.w / 2, y = sel.y - sel.h / 2;
    ctx.strokeStyle = '#2962ff'; ctx.lineWidth = 3; ctx.strokeRect(x, y, sel.w, sel.h);
    ctx.fillStyle = '#2962ff'; ctx.fillRect(x + sel.w - 12, y + sel.h - 12, 24, 24);
  }
  $('head').style.left = t * PX + 'px';
  $('tracks').style.width = len() * PX + 'px';
  $('timeTxt').textContent = `${fmt(t)} / ${fmt(len())}`;
  requestAnimationFrame(frame);
}
fit(); renderTL(); requestAnimationFrame(frame);

/* ---------- Gravação ---------- */
$('recBtn').onclick = async () => {
  if (counting) return;
  if (recording) { mr.stop(); return; }
  ac = ac || new AudioContext(); await ac.resume();
  dest = dest || ac.createMediaStreamDestination();
  if ($('micToggle').checked) {
    try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); ac.createMediaStreamSource(micStream).connect(dest); }
    catch { console.warn('Microfone indisponível.'); }
  }
  layers.forEach(l => {
    if (l.kind === 'video' && !wired.has(l.node)) {
      wired.add(l.node);
      const s = ac.createMediaElementSource(l.node); s.connect(dest); s.connect(ac.destination);
    }
    if (l.kind === 'screen' && l.stream.getAudioTracks().length && !wired.has(l.stream)) {
      wired.add(l.stream); ac.createMediaStreamSource(l.stream).connect(dest);
    }
  });
  const stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
  chunks = [];
  mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
  mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  mr.onstop = () => {
    recording = false; setPlay(false);
    micStream?.getTracks().forEach(x => x.stop());
    $('recBtn').textContent = '🔴 Gravar';
    $('exportBtn').disabled = false;
  };
  counting = true;
  for (const n of [3, 2, 1]) { $('recBtn').textContent = `Começa em ${n}…`; await new Promise(r => setTimeout(r, 1000)); }
  counting = false;
  t = 0; seek(); mr.start(1000);
  recording = true; setPlay(true);
  $('recBtn').textContent = '⏹ Parar gravação';
};

$('exportBtn').onclick = () => {
  if (!chunks.length) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
  a.download = `reaction-${$('formatSel').value.replace(':', 'x')}.webm`;
  a.click();
};

/* ---------- Layouts prontos ---------- */
function applyLayout(kind) {
  const m = layers.find(l => ['video', 'screen', 'image'].includes(l.kind)), cam = layers.find(l => l.kind === 'cam'), title = layers.find(l => l.kind === 'text');
  const stack = kind === 'stack';
  if (m) {
    const n = m.node, nw = n.videoWidth || n.width, nh = n.videoHeight || n.height;
    const s = Math.min((stack ? W * 0.96 : W) / nw, (stack ? H * 0.52 : H) / nh);
    m.w = nw * s; m.h = nh * s; m.x = W / 2; m.y = stack ? H * 0.47 : H / 2;
  }
  if (cam) {
    const d = Math.min(W, H) * (stack ? 0.3 : 0.28);
    cam.shape = 'circle'; cam.w = cam.h = d;
    cam.x = stack ? W / 2 : W - d / 2 - 30; cam.y = stack ? H * 0.84 : H - d / 2 - 30;
  }
  if (title) { title.x = W / 2; title.y = H * 0.1; }
  syncProps(); snap();
}
snap();

/* ---------- Fundo verde (chroma key) ---------- */
function keyed(l) {
  const n = l.node, k = l.kc || (l.kc = document.createElement('canvas'));
  const sc = Math.min(1, 960 / n.videoWidth), w = Math.round(n.videoWidth * sc), h = Math.round(n.videoHeight * sc);
  if (k.width !== w || k.height !== h) { k.width = w; k.height = h; }
  const c = k.getContext('2d', { willReadFrequently: true });
  c.drawImage(n, 0, 0, w, h);
  const im = c.getImageData(0, 0, w, h), d = im.data, thr = l.chromaThr ?? 40;
  for (let i = 0; i < d.length; i += 4) {
    const key = d[i + 1] - Math.max(d[i], d[i + 2]);
    if (key > thr) d[i + 3] = 0;
    else if (key > thr * 0.4) { d[i + 3] = 255 * (thr - key) / (thr * 0.6); d[i + 1] = Math.max(d[i], d[i + 2]); }
  }
  c.putImageData(im, 0, 0);
  return k;
}

function applyGreen(kind) {
  const m = layers.find(l => ['video', 'screen', 'image'].includes(l.kind)), cam = layers.find(l => l.kind === 'cam'), title = layers.find(l => l.kind === 'text');
  if (!cam) { alert('Ative a câmera primeiro (com o fundo verde atrás de você).'); return; }
  if (m) {
    const n = m.node, nw = n.videoWidth || n.width, nh = n.videoHeight || n.height, s = Math.min(W / nw, H / nh);
    m.w = nw * s; m.h = nh * s; m.x = W / 2; m.y = H / 2;
  }
  const ar = cam.node.videoWidth / cam.node.videoHeight;
  cam.chroma = true; cam.shape = 'rect';
  cam.h = Math.min(H * (W > H ? 0.8 : 0.5), W * 0.6 / ar); cam.w = cam.h * ar;
  cam.x = { greenRight: W - cam.w / 2 - 10, greenLeft: cam.w / 2 + 10, greenCenter: W / 2 }[kind]; cam.y = H - cam.h / 2;
  if (title) { title.x = W / 2; title.y = H * 0.1; }
  syncProps(); snap();
}

// Celulares não permitem compartilhar a tela pelo navegador: esconde o botão para não parecer quebrado.
if (!navigator.mediaDevices?.getDisplayMedia) $('screenBtn').style.display = 'none';
