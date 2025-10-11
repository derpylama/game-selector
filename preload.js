const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openSteamLogin: () => ipcRenderer.send('open-steam-login'),
  onSteamToken: (callback) => ipcRenderer.on('steam-token', (event, token) => callback(token)),
  getOwnedGames: () =>  ipcRenderer.send("get-owned-games"),
  onOwnedGamesResponse: (callback) => ipcRenderer.on("owned-games-response", (event, games) => callback(games)),
  saveSteamGamesToDb: (games) => ipcRenderer.send("save-steam-games", games),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  importGame: (gameFolders) => ipcRenderer.invoke('import-game', { gameFolders }),
  getAllGames: () => ipcRenderer.invoke('get-all-games'),
  renderGames: (callback) => ipcRenderer.on('render-games', (event, allGames) => callback(allGames)),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  connectToServer: () => ipcRenderer.send('connect-to-server'),
  loadedSettings: (callback) => ipcRenderer.on('loaded-settings', (event, settings) => callback(settings)),
  createLobby: () => ipcRenderer.send('create-lobby'),
});
