const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openSteamLogin: () => ipcRenderer.send('open-steam-login'),
  onSteamToken: (callback) => ipcRenderer.on('steam-token', (event, token) => callback(token)),
  getOwnedGames: () =>  ipcRenderer.send("get-owned-games")
});
