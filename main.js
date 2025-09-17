const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('fs');
const database = require('better-sqlite3');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('main.html');
  win.webContents.openDevTools();
}

function openSteamLogin(mainWindow) {
  const steamWin = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  steamWin.loadURL('http://localhost:3000/auth/steam');

  // Listen for navigation to success page with token
  steamWin.webContents.on('did-navigate', (event, url) => {
    if (url.startsWith('http://localhost:3000/auth/steam/success')) {
      const token = new URL(url).searchParams.get('token');
      console.log('Token received in main process:', token);
      mainWindow.webContents.send('steam-token', token);
      steamWin.close();
    }
  });
}
app.whenReady().then(() => {
    createWindow()
  //console.log(parseVDF(fs.readFileSync("/home/emil/.steam/steam/steamapps/libraryfolders.vdf", 'utf-8')))
})

ipcMain.on('open-steam-login', (event) => {
  openSteamLogin(BrowserWindow.fromWebContents(event.sender));
});

ipcMain.on("get-owned-games", (event) => {
    fetch('http://localhost:3000/api/owned-games', {
    headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => console.log(data));
})

function parseVDF(text) {
  const tokens = text.match(/"[^"]*"|{|}/g) || [];
  let i = 0;

  function parseObject() {
    const obj = {};
    while (i < tokens.length) {
      const token = tokens[i++];

      if (token === "}") return obj;
      if (token === "{") continue;

      const key = token.replace(/"/g, "");
      const next = tokens[i++];

      if (next === "{") {
        obj[key] = parseObject();
      } else {
        obj[key] = next.replace(/"/g, "");
      }
    }
    return obj;
  }

  return parseObject();
}