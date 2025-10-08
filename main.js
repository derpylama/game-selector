const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('fs');
const database = require("sqlite3");
const os = require("os");
const { execSync } = require('child_process');
const fileTools = require('./js/filetools');
const steam = require('./js/steam');
const epicGames = require('./js/epic');
const settings = require('./js/settings');

var steamLibraryFile; 
var Steam;
var EpicGames;

var steamToken = null;
const dbPath = path.join(__dirname, 'games.sqlite');
exports.dbPath = dbPath;

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
      steamToken = token;
      mainWindow.webContents.send('steam-token', token);
      steamWin.close();
    }
  });
}
app.whenReady().then(async () => {
    InitDb();

    Steam = new steam();
    EpicGames = new epicGames();
    Settings = new settings();

    steamLibraryFile = Steam.steamLibraryFile;
    EpicGames.checkEpicGameInstallationStatus();

    createWindow();
})

ipcMain.on('open-steam-login', (event) => {
  openSteamLogin(BrowserWindow.fromWebContents(event.sender));
});


ipcMain.on("get-owned-games", async (event) => {
if (!steamToken) {
    event.reply("owned-games-response", { error: "Not logged in" });
    return;
  }

  try {
    const res = await fetch("http://localhost:3000/api/owned-games", {
      headers: { Authorization: `Bearer ${steamToken}` },
    });

    if (res.status === 401) throw new Error("Token expired, please log in again.");
    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    const data = await res.json();

    // Log full data for debugging
    console.log("Full owned games response:", JSON.stringify(data, null, 2));

    // Reply to renderer
    event.reply("owned-games-response", data);
  } catch (err) {
    console.error("Failed to fetch owned games:", err.message);
    event.reply("owned-games-response", { error: err.message });
  }

});


function InitDb(){
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
    });
});

ipcMain.handle('import-game', async (event, { gameFolders }) => {
    if (!gameFolders || gameFolders.length === 0) {
      return { success: false, message: 'No folders provided' };
    }
    
    const output = execSync('legendary list-games --json', { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    
    // Parse the JSON string into a JS object
    const games = JSON.parse(output);

    // prepare the sql statement to add all owned games to the database
    var saveOwnedGamesToDb = db.prepare(`
        INSERT OR IGNORE INTO epicGames (title, app_name, install_location, thumbnail_url)
        VALUES (?, ?, ?, ?)
    `)

    let pending = games.length;

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

