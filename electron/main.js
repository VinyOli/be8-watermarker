'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

// Formatos de entrada aceitos (fotos de iPhone e comuns)
const RASTER_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
const HEIC_EXT = ['.heic', '.heif'];
const SUPPORTED_EXT = [...RASTER_EXT, ...HEIC_EXT];

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#111111',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    title: 'Be8 WaterMarker',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenu(null);
  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    setupAutoUpdater();
  });
}

/* ----------------------------- Auto-update ----------------------------- */
function sendToWindow(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function setupAutoUpdater() {
  // Só roda no app empacotado/instalado (não em desenvolvimento).
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    sendToWindow('update:available', { version: info.version });
  });
  autoUpdater.on('download-progress', (p) => {
    sendToWindow('update:progress', { percent: Math.round(p.percent) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    sendToWindow('update:downloaded', { version: info.version });
  });
  autoUpdater.on('error', (err) => {
    sendToWindow('update:error', { message: String(err && err.message ? err.message : err) });
  });

  autoUpdater.checkForUpdates().catch(() => {
    /* sem internet / sem release — ignora silenciosamente */
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ----------------------------- Helpers ----------------------------- */

function mimeFromExt(ext) {
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}

/* ----------------------------- IPC ----------------------------- */

ipcMain.handle('dialog:selectPhotoFolder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecione a pasta com as fotos',
    properties: ['openDirectory']
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

ipcMain.handle('dialog:selectWatermark', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: "Selecione a imagem da marca d'água",
    properties: ['openFile'],
    filters: [
      { name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }
    ]
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

ipcMain.handle('fs:listImages', async (_e, folder) => {
  const entries = await fsp.readdir(folder, { withFileTypes: true });
  const files = entries
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((name) => SUPPORTED_EXT.includes(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
    .map((name) => ({ name, path: path.join(folder, name) }));
  return files;
});

// Carrega uma imagem como data URL.
// HEIC/HEIF é convertido: PNG (sem perda) quando lossless=true (processamento),
// ou JPEG rápido para a pré-visualização. Demais formatos vão sem recompressão.
ipcMain.handle('img:load', async (_e, filePath, lossless = false) => {
  const ext = path.extname(filePath).toLowerCase();
  const buf = await fsp.readFile(filePath);

  if (HEIC_EXT.includes(ext)) {
    const convert = require('heic-convert');
    if (lossless) {
      const out = await convert({ buffer: buf, format: 'PNG' });
      const b64 = Buffer.from(out).toString('base64');
      return { dataUrl: `data:image/png;base64,${b64}` };
    }
    const out = await convert({ buffer: buf, format: 'JPEG', quality: 0.92 });
    const b64 = Buffer.from(out).toString('base64');
    return { dataUrl: `data:image/jpeg;base64,${b64}` };
  }

  // Formatos nativos: devolve os bytes originais, sem recomprimir.
  const b64 = buf.toString('base64');
  return { dataUrl: `data:${mimeFromExt(ext)};base64,${b64}` };
});

// Cria a pasta de saída ao lado da original.
ipcMain.handle('fs:prepareOutputDir', async (_e, sourceFolder) => {
  const parent = path.dirname(sourceFolder);
  const base = path.basename(sourceFolder);
  const outDir = path.join(parent, `${base} - com marca d'agua`);
  await fsp.mkdir(outDir, { recursive: true });
  return outDir;
});

// Salva um arquivo processado (bytes vindos do renderer).
ipcMain.handle('img:save', async (_e, outDir, filename, arrayBuffer) => {
  const buffer = Buffer.from(arrayBuffer);
  const outPath = path.join(outDir, filename);
  await fsp.writeFile(outPath, buffer);
  return true;
});

ipcMain.handle('shell:openPath', async (_e, p) => {
  await shell.openPath(p);
  return true;
});

ipcMain.handle('app:getVersion', async () => app.getVersion());

// Reinicia e instala a atualização já baixada.
ipcMain.handle('update:install', async () => {
  autoUpdater.quitAndInstall();
  return true;
});
