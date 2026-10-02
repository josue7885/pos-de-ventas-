const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const DEFAULT_PORT = 3000;
const PORT_RANGE = 10;
let serverProcess = null;
let selectedPort = DEFAULT_PORT;

function pingPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, { timeout: 800 }, (res) => {
      res.resume();
      resolve(true);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function detectServerPort() {
  for (let i = 0; i < PORT_RANGE; i += 1) {
    const port = DEFAULT_PORT + i;
    if (await pingPort(port)) {
      selectedPort = port;
      return port;
    }
  }
  return DEFAULT_PORT;
}

function startServer() {
  const serverPath = path.join(__dirname, 'server', 'server.js');
  serverProcess = spawn(process.execPath, [serverPath], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(DEFAULT_PORT)
    }
  });

  serverProcess.on('close', (code) => {
    console.log('Server process exited with code', code);
  });
}

async function createWindow() {
  const port = await detectServerPort();
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: 'POS Control',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    }
  });

  win.loadURL(`http://localhost:${port}`);
  win.maximize();
}

app.whenReady().then(() => {
  startServer();
  const timer = setInterval(async () => {
    const port = await detectServerPort();
    if (port) {
      clearInterval(timer);
      createWindow();
    }
  }, 600);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});