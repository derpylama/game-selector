const { app, BrowserWindow, dialog, ipcMain} = require('electron');
const path = require('node:path');
const fs = require('fs');
const database = require("sqlite3");
const os = require("os");
const { execSync } = require('child_process');
const fileTools = require('./js/filetools');
const steam = require('./js/steam');
const epicGames = require('./js/epic');
const settings = require('./js/settings');
const lobbyClient = require('./js/websockethandler');


var steamLibraryFile; 
var Steam;
var EpicGames;
var Settings;
var LobbyClient;
var authToken = null;
var win;
var legendaryPath;

const baseDir = app.isPackaged
  ? app.getPath('userData')               // packaged app
  : path.join(__dirname);                 // dev mode

const dbPath = path.join(baseDir, 'games.sqlite');
exports.dbPath = dbPath;

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

  steamWin.loadURL('http://localhost:3000/auth/steam');

  // Listen for navigation to success page with token
  steamWin.webContents.on('did-navigate', (event, url) => {
    if (url.startsWith('http://localhost:3000/auth/steam/success')) {
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

        EpicGames = new epicGames();
        Settings = new settings();
        Steam = new steam();
        
        steamLibraryFile = Steam.steamLibraryFile;
        
        await EpicGames.checkEpicGameInstallationStatus(); // Wait for completion
        
        
        console.log("All initialization complete ✅");
        
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
    const res = await fetch("http://localhost:3000/api/owned-games", {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (res.status === 401) throw new Error("Token expired, please log in again.");
    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    const data = await res.json();

    // Log full data for debugging
    //console.log("Full owned games response:", JSON.stringify(data, null, 2));

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
    if (!gameFolders || gameFolders.length === 0) {
        console.log("no folders provided");
      return { success: false, message: 'No folders provided' };
    }

    if (!checkLegendaryCommand()) {
    return { success: false, message: 'Legendary CLI not found' };
    }
    
    const output = execSync( legendaryPath + ' list-games --json', { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    
    // Parse the JSON string into a JS object
    const games = JSON.parse(output);

    // prepare the sql statement to add all owned games to the database
    var saveOwnedGamesToDb = db.prepare(`
        INSERT OR IGNORE INTO epicGames (title, app_name, install_location, thumbnail_url)
        VALUES (?, ?, ?, ?)
    `)

    let pending = games.length;
    
    // iterate over all games and add them to the database if they don't exist yet
    games.forEach(game => {
        db.get("SELECT 1 FROM epicGames WHERE app_name = ?", [game["app_name"]], (err, row) => {
            if (err) {
                console.error("Database error:", err);
            }
            if (!row) {
                var imageUrl = "";
                if (game["metadata"] && game["metadata"]["keyImages"] && game["metadata"]["keyImages"].length > 1) {
                    imageUrl = game["metadata"]["keyImages"][1]["url"];
                }
                saveOwnedGamesToDb.run(game["app_title"], game["app_name"], "", imageUrl, (err) => {
                    if (err) {
                        console.error("Error inserting game:", err);
                    } else {
                        console.log(`Inserted game: ${game["app_title"]}`);
                    }
                    pending--;
                    if (pending === 0) saveOwnedGamesToDb.finalize();
                });
            } else {
                pending--;
                if (pending === 0) saveOwnedGamesToDb.finalize();
            }
        });
    });

    var addInstalledGamesToDb = db.prepare(`
        UPDATE epicGames SET is_installed = 1, install_location = ? WHERE app_name = ?
    `)

    // read the gameFolders content and iterate over them an log them
    gameFolders.forEach(folder => {
        if (!fs.existsSync(folder)) {
            console.error("Folder does not exist:", folder);
            return;
        }
        const files = fs.readdirSync(folder);
    
        console.log("Files in selected folder:", files);
    
        var matchedGames = fileTools.matchFoldersToAppName(folder, files, games);
        console.log(fileTools.getDirectorySize(folder) + " bytes")
        console.log("Matched games:", matchedGames);
    
        if (matchedGames.length > 0){
            matchedGames.forEach(matchedGame => {
                
                try {  
                    if(fileTools.getDirectorySize(matchedGame.fullPath) > 20000000){ // only import if the folder is larger than 20MB
                        const importedGames = execSync("legendary import --with-dlcs " + matchedGame.app_name + "  " + matchedGame.fullPath);
                        addInstalledGamesToDb.run(matchedGame.fullPath ,matchedGame.app_name);
                    }
                    else {
                        console.warn(`Game "${matchedGame.app_name}" folder size is too small, skipping import.`);
                    }
                } catch (error) {
                    if (error.message && error.message.includes("already imported")) {
                        console.warn(`Game "${matchedGame.app_name}" is already imported.`);
                    } else {
                        console.error("Error importing game:", error.message);
                    }
                }
            })
        }
    });
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

ipcMain.on('connect-to-server', async (event) => {

    var ip = Settings.getSetting("backendIP");
    var port = Settings.getSetting("backendPort");
    
    await getAllGamesFromDb().then(games => {

        LobbyClient = new lobbyClient("ws://" + ip + ":" + port + "?token=" + authToken, "mupp");
    
        if (authToken) {
            LobbyClient.connect(games);
            
        } else {
            console.error("Cannot connect to server: No auth token available.");
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
