'use strict';

/* ===================== Estado ===================== */
const state = {
  folder: null,
  files: [],
  index: 0,
  previewImg: null, // Image do preview atual
  wmNaturalW: 0,
  wmNaturalH: 0,
  wmReady: false,
  wmPath: null,
  wm: { xNorm: 0.5, yNorm: 0.85, wNorm: 0.25, opacity: 1 },
  format: 'jpg',
  quality: 1.0,
  renameBase: '',
  view: { left: 0, top: 0, width: 0, height: 0 } // retângulo exibido da imagem
};

/* ===================== Referências DOM ===================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const emptyState = $('emptyState');
const previewArea = $('previewArea');
const canvas = $('previewCanvas');
const ctx = canvas.getContext('2d');
const wmBox = $('wmBox');
const wmImg = $('wmImg');
const wmSource = $('wmSource');
const guideV = $('guideV');
const guideH = $('guideH');

// Limite de "atração" do snap (fração do tamanho da imagem)
const SNAP_THRESHOLD = 0.012;

const navBar = $('navBar');
const navLabel = $('navLabel');

const folderInfo = $('folderInfo');
const wmInfo = $('wmInfo');

const sizeSlider = $('sizeSlider');
const opacitySlider = $('opacitySlider');
const qualitySlider = $('qualitySlider');
const sizeVal = $('sizeVal');
const opacityVal = $('opacityVal');
const qualityVal = $('qualityVal');
const qualityField = $('qualityField');
const renameBase = $('renameBase');

const processBtn = $('processBtn');

const overlay = $('progressOverlay');
const barFill = $('barFill');
const progressTitle = $('progressTitle');
const progressText = $('progressText');
const progressDone = $('progressDone');

/* ===================== Utilidades ===================== */
function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao decodificar imagem'));
    img.src = src;
  });
}

function baseName(name) {
  return name.replace(/\.[^.]+$/, '');
}

function canvasToBlob(cnv, type, quality) {
  return new Promise((resolve) => cnv.toBlob(resolve, type, quality));
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/* ===================== Persistência ===================== */
function saveSettings() {
  try {
    localStorage.setItem(
      'be8wm',
      JSON.stringify({
        wm: state.wm,
        format: state.format,
        quality: state.quality,
        wmPath: state.wmPath,
        renameBase: state.renameBase
      })
    );
  } catch (e) {
    /* ignora */
  }
}

function restoreSettings() {
  try {
    const raw = localStorage.getItem('be8wm');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.wm) state.wm = { ...state.wm, ...s.wm };
    if (s.format) state.format = s.format;
    if (typeof s.quality === 'number') state.quality = s.quality;
    if (s.wmPath) state.wmPath = s.wmPath;
    if (typeof s.renameBase === 'string') state.renameBase = s.renameBase;
  } catch (e) {
    /* ignora */
  }
}

/* ===================== Preview ===================== */
function computeView() {
  const areaW = previewArea.clientWidth;
  const areaH = previewArea.clientHeight;
  const img = state.previewImg;
  if (!img || !areaW || !areaH) return;

  const imgAspect = img.naturalWidth / img.naturalHeight;
  let dispW, dispH;
  if (areaW / areaH > imgAspect) {
    dispH = areaH;
    dispW = dispH * imgAspect;
  } else {
    dispW = areaW;
    dispH = dispW / imgAspect;
  }
  state.view = {
    left: (areaW - dispW) / 2,
    top: (areaH - dispH) / 2,
    width: dispW,
    height: dispH
  };

  canvas.style.width = dispW + 'px';
  canvas.style.height = dispH + 'px';
}

function drawPreview() {
  const img = state.previewImg;
  if (!img) return;
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
}

function layoutWmBox() {
  if (!state.wmReady || !state.previewImg) {
    wmBox.classList.add('hidden');
    return;
  }
  wmBox.classList.remove('hidden');
  const v = state.view;
  const boxW = state.wm.wNorm * v.width;
  const boxH = boxW * (state.wmNaturalH / state.wmNaturalW);
  const cx = v.left + state.wm.xNorm * v.width;
  const cy = v.top + state.wm.yNorm * v.height;
  wmBox.style.width = boxW + 'px';
  wmBox.style.height = boxH + 'px';
  wmBox.style.left = cx - boxW / 2 + 'px';
  wmBox.style.top = cy - boxH / 2 + 'px';
  wmBox.style.opacity = state.wm.opacity;
}

function refreshPreviewLayout() {
  computeView();
  layoutWmBox();
}

/* ----- Linhas-guia (snapping) ----- */
function showGuideV(lineNorm) {
  const v = state.view;
  guideV.style.left = v.left + lineNorm * v.width + 'px';
  guideV.style.top = v.top + 'px';
  guideV.style.height = v.height + 'px';
  guideV.classList.remove('hidden');
}
function showGuideH(lineNorm) {
  const v = state.view;
  guideH.style.top = v.top + lineNorm * v.height + 'px';
  guideH.style.left = v.left + 'px';
  guideH.style.width = v.width + 'px';
  guideH.classList.remove('hidden');
}
function hideGuides() {
  guideV.classList.add('hidden');
  guideH.classList.add('hidden');
}

// Retorna o melhor alvo de snap para um eixo, ou null.
// candidates: [{ center, line }] — center = posição do centro p/ encaixar; line = onde desenhar a guia.
function snapAxis(value, candidates) {
  let best = null;
  let bestDist = SNAP_THRESHOLD;
  for (const c of candidates) {
    const d = Math.abs(value - c.center);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

async function showPreview(index) {
  if (!state.files.length) return;
  state.index = clamp(index, 0, state.files.length - 1);
  const f = state.files[state.index];
  navLabel.textContent = `${state.index + 1} / ${state.files.length} — ${f.name}`;
  try {
    const { dataUrl } = await window.api.loadImage(f.path);
    const img = await loadImageEl(dataUrl);
    state.previewImg = img;
    emptyState.classList.add('hidden');
    previewArea.classList.remove('hidden');
    navBar.classList.remove('hidden');
    drawPreview();
    refreshPreviewLayout();
  } catch (e) {
    navLabel.textContent = `Não foi possível abrir: ${f.name}`;
  }
  updatePrevNext();
}

function updatePrevNext() {
  $('prevBtn').disabled = state.index <= 0;
  $('nextBtn').disabled = state.index >= state.files.length - 1;
}

/* ===================== Marca d'água ===================== */
async function applyWatermarkSrc(filePath) {
  const { dataUrl } = await window.api.loadImage(filePath);
  const img = await loadImageEl(dataUrl);
  state.wmNaturalW = img.naturalWidth;
  state.wmNaturalH = img.naturalHeight;
  wmSource.src = dataUrl;
  wmImg.src = dataUrl;
  state.wmReady = true;
  state.wmPath = filePath;
  const nm = filePath.split(/[\\/]/).pop();
  wmInfo.textContent = `✓ ${nm}`;
  wmInfo.classList.add('ok');
  layoutWmBox();
  updateProcessBtn();
  saveSettings();
}

/* ===================== Interação (arrastar/redimensionar) ===================== */
let drag = null;

wmBox.addEventListener('pointerdown', (e) => {
  if (e.target.classList.contains('wm-handle')) return; // tratado abaixo
  e.preventDefault();
  wmBox.setPointerCapture(e.pointerId);
  drag = {
    mode: 'move',
    startX: e.clientX,
    startY: e.clientY,
    origX: state.wm.xNorm,
    origY: state.wm.yNorm
  };
  wmBox.classList.add('selected');
});

wmBox.querySelectorAll('.wm-handle').forEach((h) => {
  h.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    wmBox.setPointerCapture(e.pointerId);
    const corner = h.dataset.corner;
    const v = state.view;
    const boxW = state.wm.wNorm * v.width;
    const boxH = boxW * (state.wmNaturalH / state.wmNaturalW);
    const cx = v.left + state.wm.xNorm * v.width;
    const cy = v.top + state.wm.yNorm * v.height;
    // ponto fixo = canto oposto (em px do previewArea)
    const fixed = {
      tl: { x: cx + boxW / 2, y: cy + boxH / 2 },
      tr: { x: cx - boxW / 2, y: cy + boxH / 2 },
      bl: { x: cx + boxW / 2, y: cy - boxH / 2 },
      br: { x: cx - boxW / 2, y: cy - boxH / 2 }
    }[corner];
    drag = { mode: 'resize', corner, fixed };
  });
});

window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const v = state.view;

  if (drag.mode === 'move') {
    const dx = (e.clientX - drag.startX) / v.width;
    const dy = (e.clientY - drag.startY) / v.height;
    let xN = clamp(drag.origX + dx, 0, 1);
    let yN = clamp(drag.origY + dy, 0, 1);

    if (e.altKey) {
      // Alt = movimento livre, sem snap
      hideGuides();
    } else {
      const aspect = state.wmNaturalH / state.wmNaturalW;
      const halfWn = state.wm.wNorm / 2;
      const halfHn = (state.wm.wNorm * v.width * aspect) / v.height / 2;

      // alvos no eixo X (centro da marca) e a guia a desenhar
      const xCands = [
        { center: 0.5, line: 0.5 },
        { center: halfWn, line: 0 },
        { center: 1 - halfWn, line: 1 },
        { center: 1 / 3, line: 1 / 3 },
        { center: 2 / 3, line: 2 / 3 }
      ];
      const yCands = [
        { center: 0.5, line: 0.5 },
        { center: halfHn, line: 0 },
        { center: 1 - halfHn, line: 1 },
        { center: 1 / 3, line: 1 / 3 },
        { center: 2 / 3, line: 2 / 3 }
      ];

      const sx = snapAxis(xN, xCands);
      const sy = snapAxis(yN, yCands);
      if (sx) {
        xN = sx.center;
        showGuideV(sx.line);
      } else {
        guideV.classList.add('hidden');
      }
      if (sy) {
        yN = sy.center;
        showGuideH(sy.line);
      } else {
        guideH.classList.add('hidden');
      }
    }

    state.wm.xNorm = xN;
    state.wm.yNorm = yN;
    layoutWmBox();
  } else if (drag.mode === 'resize') {
    const aspect = state.wmNaturalH / state.wmNaturalW;
    let newW = Math.abs(e.clientX - drag.fixed.x);
    newW = clamp(newW, 24, v.width);
    const newH = newW * aspect;
    const c = drag.corner;
    const signX = c === 'tr' || c === 'br' ? 1 : -1; // direção a partir do fixo
    const signY = c === 'bl' || c === 'br' ? 1 : -1;
    const centerX = drag.fixed.x + (signX * newW) / 2;
    const centerY = drag.fixed.y + (signY * newH) / 2;
    state.wm.wNorm = clamp(newW / v.width, 0.02, 1);
    state.wm.xNorm = clamp((centerX - v.left) / v.width, 0, 1);
    state.wm.yNorm = clamp((centerY - v.top) / v.height, 0, 1);
    sizeSlider.value = Math.round(state.wm.wNorm * 100);
    sizeVal.textContent = sizeSlider.value + '%';
    layoutWmBox();
  }
});

window.addEventListener('pointerup', () => {
  if (drag) {
    drag = null;
    wmBox.classList.remove('selected');
    hideGuides();
    saveSettings();
  }
});

/* ===================== Controles ===================== */
$('pickFolder').addEventListener('click', async () => {
  const folder = await window.api.selectPhotoFolder();
  if (!folder) return;
  const files = await window.api.listImages(folder);
  if (!files.length) {
    folderInfo.textContent = 'Nenhuma imagem compatível encontrada nesta pasta.';
    folderInfo.classList.remove('ok');
    return;
  }
  state.folder = folder;
  state.files = files;
  state.index = 0;
  folderInfo.textContent = `✓ ${files.length} foto(s) encontradas`;
  folderInfo.classList.add('ok');
  await showPreview(0);
  updateProcessBtn();
});

$('pickWatermark').addEventListener('click', async () => {
  const file = await window.api.selectWatermark();
  if (!file) return;
  await applyWatermarkSrc(file);
});

// Limpar seleção de fotos
$('clearFolder').addEventListener('click', () => {
  state.folder = null;
  state.files = [];
  state.index = 0;
  state.previewImg = null;
  previewArea.classList.add('hidden');
  navBar.classList.add('hidden');
  emptyState.classList.remove('hidden');
  folderInfo.textContent = 'Nenhuma pasta selecionada';
  folderInfo.classList.remove('ok');
  updateProcessBtn();
});

// Remover marca d'água
$('clearWatermark').addEventListener('click', () => {
  state.wmReady = false;
  state.wmPath = null;
  state.wmNaturalW = 0;
  state.wmNaturalH = 0;
  wmSource.removeAttribute('src');
  wmImg.removeAttribute('src');
  wmBox.classList.add('hidden');
  wmInfo.textContent = "Dica: use um PNG com fundo transparente";
  wmInfo.classList.remove('ok');
  updateProcessBtn();
  saveSettings();
});

// Nome base para renomear em lote
renameBase.addEventListener('input', () => {
  state.renameBase = renameBase.value;
});
renameBase.addEventListener('change', saveSettings);

$('prevBtn').addEventListener('click', () => showPreview(state.index - 1));
$('nextBtn').addEventListener('click', () => showPreview(state.index + 1));

sizeSlider.addEventListener('input', () => {
  state.wm.wNorm = clamp(parseInt(sizeSlider.value, 10) / 100, 0.02, 1);
  sizeVal.textContent = sizeSlider.value + '%';
  layoutWmBox();
});
sizeSlider.addEventListener('change', saveSettings);

opacitySlider.addEventListener('input', () => {
  state.wm.opacity = parseInt(opacitySlider.value, 10) / 100;
  opacityVal.textContent = opacitySlider.value + '%';
  layoutWmBox();
});
opacitySlider.addEventListener('change', saveSettings);

qualitySlider.addEventListener('input', () => {
  state.quality = parseInt(qualitySlider.value, 10) / 100;
  qualityVal.textContent = qualitySlider.value + '%';
});
qualitySlider.addEventListener('change', saveSettings);

// Posição rápida
document.querySelectorAll('.pos-btn').forEach((b) => {
  b.addEventListener('click', () => {
    const m = 0.5 * state.wm.wNorm + 0.02; // margem
    const mh = m * (state.wmNaturalH / state.wmNaturalW || 1);
    const pos = b.dataset.pos;
    const map = {
      tl: [m, mh], tc: [0.5, mh], tr: [1 - m, mh],
      ml: [m, 0.5], mc: [0.5, 0.5], mr: [1 - m, 0.5],
      bl: [m, 1 - mh], bc: [0.5, 1 - mh], br: [1 - m, 1 - mh]
    };
    const [x, y] = map[pos];
    state.wm.xNorm = clamp(x, 0, 1);
    state.wm.yNorm = clamp(y, 0, 1);
    layoutWmBox();
    saveSettings();
  });
});

// Formato de saída
document.querySelectorAll('.seg-btn').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.format = b.dataset.fmt;
    qualityField.style.display = state.format === 'jpg' ? 'block' : 'none';
    saveSettings();
  });
});

function updateProcessBtn() {
  processBtn.disabled = !(state.files.length && state.wmReady);
}

/* ===================== Processamento em lote ===================== */
processBtn.addEventListener('click', processAll);

async function processAll() {
  if (!state.files.length || !state.wmReady) return;

  overlay.classList.remove('hidden');
  progressDone.classList.add('hidden');
  progressTitle.textContent = 'Processando fotos…';
  barFill.style.width = '0%';

  const outDir = await window.api.prepareOutputDir(state.folder);
  const total = state.files.length;
  const type = state.format === 'png' ? 'image/png' : 'image/jpeg';
  const ext = state.format === 'png' ? '.png' : '.jpg';
  const base = (state.renameBase || '').trim() || 'be8_watermarked';
  const skipped = [];

  for (let i = 0; i < total; i++) {
    const f = state.files[i];
    progressText.textContent = `${i + 1} de ${total} — ${f.name}`;
    try {
      // lossless=true: HEIC vira PNG (sem perda) para não comprimir duas vezes
      const { dataUrl } = await window.api.loadImage(f.path, true);
      const img = await loadImageEl(dataUrl);

      const cnv = document.createElement('canvas');
      cnv.width = img.naturalWidth;
      cnv.height = img.naturalHeight;
      const c = cnv.getContext('2d');
      c.drawImage(img, 0, 0);

      const wmW = state.wm.wNorm * img.naturalWidth;
      const wmH = wmW * (state.wmNaturalH / state.wmNaturalW);
      const cx = state.wm.xNorm * img.naturalWidth;
      const cy = state.wm.yNorm * img.naturalHeight;
      c.globalAlpha = state.wm.opacity;
      c.drawImage(wmSource, cx - wmW / 2, cy - wmH / 2, wmW, wmH);
      c.globalAlpha = 1;

      const blob = await canvasToBlob(cnv, type, state.quality);
      const buf = await blob.arrayBuffer();
      await window.api.saveImage(outDir, `${base} - ${i + 1}${ext}`, buf);
    } catch (e) {
      skipped.push(f.name);
    }
    barFill.style.width = Math.round(((i + 1) / total) * 100) + '%';
    await new Promise((r) => setTimeout(r, 0)); // mantém a UI fluida
  }

  progressTitle.textContent = 'Concluído! 🎉';
  progressText.textContent =
    `${total - skipped.length} de ${total} foto(s) salvas` +
    (skipped.length ? ` · ${skipped.length} ignorada(s)` : '');
  progressDone.classList.remove('hidden');

  $('openFolderBtn').onclick = () => window.api.openPath(outDir);
  $('closeProgressBtn').onclick = () => overlay.classList.add('hidden');
}

/* ===================== Atualizações (toast) ===================== */
const updateToast = $('updateToast');
const toastTitle = $('toastTitle');
const toastText = $('toastText');
const toastAction = $('toastAction');
const toastClose = $('toastClose');

function showToast(title, text, withAction) {
  toastTitle.textContent = title;
  toastText.textContent = text;
  toastAction.classList.toggle('hidden', !withAction);
  updateToast.classList.remove('hidden');
  requestAnimationFrame(() => updateToast.classList.add('show'));
}
function hideToast() {
  updateToast.classList.remove('show');
  setTimeout(() => updateToast.classList.add('hidden'), 350);
}

toastClose.addEventListener('click', hideToast);
toastAction.addEventListener('click', () => window.api.installUpdate());

if (window.api && window.api.onUpdateAvailable) {
  window.api.onUpdateAvailable((d) =>
    showToast('Atualização disponível', `Baixando a versão ${d.version}…`, false)
  );
  window.api.onUpdateProgress((d) => {
    toastText.textContent = `Baixando atualização… ${d.percent}%`;
  });
  window.api.onUpdateDownloaded((d) =>
    showToast(`Versão ${d.version} pronta!`, 'Reinicie o programa para atualizar.', true)
  );
}

/* ===================== Inicialização ===================== */
window.addEventListener('resize', refreshPreviewLayout);

(async function init() {
  restoreSettings();

  // aplica valores restaurados à UI
  sizeSlider.value = Math.round(state.wm.wNorm * 100);
  sizeVal.textContent = sizeSlider.value + '%';
  opacitySlider.value = Math.round(state.wm.opacity * 100);
  opacityVal.textContent = opacitySlider.value + '%';
  qualitySlider.value = Math.round(state.quality * 100);
  qualityVal.textContent = qualitySlider.value + '%';
  renameBase.value = state.renameBase || '';
  document.querySelectorAll('.seg-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.fmt === state.format);
  });
  qualityField.style.display = state.format === 'jpg' ? 'block' : 'none';

  try {
    const v = await window.api.getVersion();
    $('version').textContent = 'v' + v;
  } catch (e) {
    /* ignora */
  }

  // recarrega a última marca d'água, se existir
  if (state.wmPath) {
    try {
      await applyWatermarkSrc(state.wmPath);
    } catch (e) {
      state.wmPath = null;
    }
  }
})();
