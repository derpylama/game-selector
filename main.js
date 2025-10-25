const { app, BrowserWindow, dialog, ipcMain, shell} = require('electron');
const path = require('node:path');
const fs = require('fs');
const database = require("sqlite3");
const os = require("os");
const { exec, execSync , spawn } = require('child_process');
const fileTools = require('./js/filetools');
const steam = require('./js/steam');
const EpicGames = require('./js/epic');
const settings = require('./js/settings');
const lobbyClient = require('./js/websockethandler');


var steamLibraryFile; 
var Steam;
var epicGames;
var Settings;
var LobbyClient;
var authToken = null;
var win;
var legendaryPath;
var db;

const baseDir = app.isPackaged
  ? app.getPath('userData')               // packaged app
  : path.join(__dirname);                 // dev mode

const dbPath = path.join(baseDir, 'games.sqlite');
exports.dbPath = dbPath;

function fixEnvironment() {
    // Always point HOME to the real user home
    process.env.HOME = os.homedir();

    if(process.platform === "linux"){
        // Ensure user PATHs are available
        const userLocalBin = `${os.homedir()}/.local/bin`;
        if (!process.env.PATH.includes(userLocalBin)) {
            process.env.PATH += `:${userLocalBin}`;
        }
    
        // Debug logging (optional)
        console.log("Adjusted environment:");
        console.log("HOME:", process.env.HOME);
        console.log("PATH:", process.env.PATH);
    
        // Optional: verify legendary is found
        try {
            const legendaryPath = execSync('which legendary', { encoding: 'utf8' }).trim();
            console.log("Legendary found at:", legendaryPath);
        } catch {
            console.warn("Legendary not found in PATH");
        }

    }
}

fixEnvironment()
function createWindow() {
    win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('main.html');
}

function getLegendaryPath() {
  const platform = process.platform;
  let legendaryPath;

  if (platform === 'win32') {

    const basePath = app.isPackaged
      ? path.join(process.resourcesPath, 'resources') // in packaged app
      : path.join(__dirname, 'resources');            // in dev
    // Windows: path to precompiled exe inside resources
    legendaryPath = path.join(basePath, 'legendary.exe');
    // check existence
    if (!fs.existsSync(legendaryPath)) {
      throw new Error(`Legendary binary not found at ${legendaryPath}`);
    }
  } else if (platform === 'linux' || platform === 'darwin') {
    // Linux/macOS: assume it's in PATH or optionally bundle a binary
    legendaryPath = 'legendary'; // user must have installed CLI
  }


  return legendaryPath;
}

function checkLegendaryCommand(){
  try {
    execSync(legendaryPath + " --version", { stdio: 'pipe' });
    return true; // Legendary is available
  } catch (error) {
    dialog.showMessageBoxSync({
      type: 'error',
      buttons: ['Open Installation Guide', 'Close'],
      defaultId: 0,
      cancelId: 1,
      title: 'Legendary CLI Not Found',
      message: 'Legendary CLI is required to import and manage Epic Games.',
      detail: 'You can install it with:\n\npip install legendary-gl\n\nor follow the setup guide.',
    });

    return false; // Legendary is not installed
  }
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
  var ip = Settings.getSetting("backendIP");
  var port = Settings.getSetting("backendPort");

  steamWin.loadURL(`http://${ip}:${port}/auth/steam`);
  // Listen for navigation to success page with token
  steamWin.webContents.on('did-navigate', (event, url) => {
    if (url.startsWith(`http://${ip}:${port}/auth/steam/success`)) {
      const token = new URL(url).searchParams.get('token');
      console.log('Token received in main process:', token);
      authToken = token;
      mainWindow.webContents.send('steam-token', token);
      steamWin.close();
    }
  });
}   
app.whenReady().then(async () => {
   try {
        await InitDb(); // Wait for database to initialize
        createWindow();
        legendaryPath = getLegendaryPath();

        epicGames = new EpicGames(dbPath, legendaryPath, db);
        Settings = new settings();
        Steam = new steam(db);
        
        steamLibraryFile = Steam.steamLibraryFile;
        
        await epicGames.checkEpicGameInstallationStatus(); // Wait for completion
        
        
        console.log("All initialization complete");
        
        win.webContents.on('did-finish-load', () => {
            win.webContents.send("loaded-settings", {
                epicGamesLibraryFolders: Settings.getSetting("epicGamesLibraryFolders"),
                backendIP: Settings.getSetting("backendIP"),
                backendPort: Settings.getSetting("backendPort")
            });
        })
    } catch (err) {
        console.error("Error during initialization:", err);
    }
    
    
})

ipcMain.on('open-steam-login', (event) => {
  openSteamLogin(BrowserWindow.fromWebContents(event.sender));
});


ipcMain.on("get-owned-games", async (event) => {
if (!authToken) {
    event.reply("owned-games-response", { error: "Not logged in" });
    return;
  }

  try {
    var ip = Settings.getSetting("backendIP");
    var port = Settings.getSetting("backendPort");
    console.log(ip, port)

    const res = await fetch(`http://${ip}:${port}/api/owned-games`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (res.status === 401) throw new Error("Token expired, please log in again.");
    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    const data = await res.json();

    // Reply to renderer
    event.reply("owned-games-response", data);
  } catch (err) {
    console.error("Failed to fetch owned games:", err.message);
    event.reply("owned-games-response", { error: err.message });
  }

});


async function InitDb(){
    db = new database.Database(dbPath, (err) =>{
        if (err) {
            console.error('Error opening database:', err.message);
            return;
        }
        console.log('Database opened or created at', dbPath);
    })

    db.run(`CREATE TABLE IF NOT EXISTS steamGames (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    steam_id TEXT UNIQUE,
    img_icon_url TEXT,
    is_installed INTEGER NOT NULL DEFAULT 0)`)


    db.run(`CREATE TABLE IF NOT EXISTS epicGames (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        app_name TEXT UNIQUE,
        thumbnail_url TEXT,
        is_installed INTEGER NOT NULL DEFAULT 0,
        install_location TEXT NOT NULL
    )`)
    return;
}

ipcMain.on("save-steam-games", (event, games) => {
    Steam.saveSteamGamesToDb(games)
})

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (result.canceled) {
      return null;
    } else {
      return result.filePaths[0];
    }
});

ipcMain.handle('get-all-games', async () => {
    return new Promise((resolve, reject) => {
        if (db) {
            db.all("SELECT * FROM steamGames", (err, steamRows) => {
            if (err) {
                console.error("Database error (steam):", err);
                reject(err);
                return;
            }
            db.all("SELECT * FROM epicGames", (err, epicRows) => {
                if (err) {
                    console.error("Database error (epic):", err);
                    reject(err);
                    return;
                }
                resolve({
                    steamGames: steamRows,
                    epicGames: epicRows
                });
            });
            });
            
        }
    });
});

ipcMain.handle('import-game', async (event, { gameFolders }) => {
    if (!checkLegendaryCommand()) {
    return { success: false, message: 'Legendary CLI not found' };
    }

    // MARK: add auth for when tryFetchGames returns AUTH REQUIRED
    const authStatus = await tryFetchGames()

    if(authStatus === "AUTH_REQUIRED"){
        console.log("auth needed")
        authLegendary();

    }
    else{
        epicGames.importGames(gameFolders)

    }
});

ipcMain.handle('save-settings', (event, settings) => {
    console.log(settings)
    
    if(!settings.backendIP == ""){
        Settings.setSetting("backendIP", settings.backendIP);
    }

    if(!settings.backendPort == ""){
        Settings.setSetting("backendPort", settings.backendPort);
    }
    //dont save if the array is empty
    if(settings.epicGamesLibraries && settings.epicGamesLibraries.length > 0){
        Settings.setSetting("epicGamesLibraryFolders", JSON.stringify(settings.epicGamesLibraries));
    }
});

async function getAllGamesFromDb() {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM steamGames", (err, steamRows) => {
            if (err) {
                console.error("Database error (steam):", err);
                reject(err);
                return;
            }
            db.all("SELECT title,app_name,thumbnail_url,is_installed FROM epicGames", (err, epicRows) => {
                if (err) {
                    console.error("Database error (epic):", err);
                    reject(err);
                    return;
                }
                resolve({
                    steamGames: steamRows,
                    epicGames: epicRows
                });
            });
        });
    });
}

ipcMain.on('connect-to-server', async (event, username) => {

    var ip = Settings.getSetting("backendIP");
    var port = Settings.getSetting("backendPort");
    
    console.log("ws://" + ip + ":" + port++ + "?token=" + authToken, username)
    await getAllGamesFromDb().then(async games => {
        
        if(username.trim() === ""){
            showAlert(["Ok"], "Please enter a username before connecting to server", 'info');
            
        }
        else{
            LobbyClient = new lobbyClient("ws://" + ip + ":" + port + "?token=" + authToken, username);
        
            if (authToken) {
                LobbyClient.connect(games);
                
            } else {
                console.error("Cannot connect to server: No auth token available.");
            }
            
        }

    }).catch(err => {
        console.error("Failed to retrieve games from database:", err);
    });
});

ipcMain.on("create-lobby", async (event, lobbyName) => {
    console.log("Creating lobby...", lobbyName);

    if (LobbyClient) {
        LobbyClient.sendAction("create_lobby", { lobbyName: lobbyName });
    } else {
        console.error("LobbyClient is not initialized.");
    }

});

ipcMain.on("join-lobby", (event, lobbyId) => {
    console.log("Joining lobby:", lobbyId);
    if (LobbyClient) {
        LobbyClient.sendAction("join_lobby", { lobbyId: lobbyId });

    } else {
        console.error("LobbyClient is not initialized.");
    }
});

ipcMain.on("leave-lobby", (event) => {
    var lobbyInfo = LobbyClient.getLobbyInfo();
    if (LobbyClient) {
        LobbyClient.sendAction("leave_lobby",{ lobbyId: lobbyInfo.lobbyId, lobbyName: lobbyInfo.lobbyName });
    } else {
        console.error("LobbyClient is not initialized.");
    }
});


async function showAlert(buttons, message, type){
    const result = await dialog.showMessageBox({
        type: type,
        buttons: buttons,
        message: message,
        defaultId: 0,
        cancelId: 1,
    })

    return result.response;
}

//tries and check if the user is logged in on legendary
async function tryFetchGames() {
return new Promise((resolve, reject) => {
        exec(`${legendaryPath} list --json`, {maxBuffer: 10 * 1024 * 1024}, (error, stdout, stderr) => {
            if (error) {
                // check if the error is authentication-related
                if (stderr.toLowerCase().includes("no saved credentials") || stderr.toLowerCase().includes("not logged in")) {
                    return resolve("AUTH_REQUIRED");
                }
                return reject(error);
            }

            try {
                const games = JSON.parse(stdout);
                resolve(games);
            } catch (parseError) {
                reject(parseError);
            }
        });
    });
}

async function authLegendary(){
    
    if(process.platform === "win32"){
        exec(legendaryPath + " auth");
    }
}