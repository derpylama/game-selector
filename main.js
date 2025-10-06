const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('fs');
const database = require("sqlite3");
const os = require("os");
const { execSync } = require('child_process');
const fileTools = require('./js/filetools');

var steamLibraryFile; 


var steamToken = null;
const dbPath = path.join(__dirname, 'games.sqlite');

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

function getDefualtSteamLibraryFile(){
    if (process.platform === "win32"){
        steamLibraryFile = path.join(
            process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
            "Steam",
            "steamapps",
            "libraryfolders.vdf"
        )
    }
    else if(process.platform === "linux"){
        steamLibraryFile = path.join(os.homedir(), "./.steam/steam/steamapps/libraryfolders.vdf")
    }
    else {
        throw new Error("Unsupported platform: " + process.platform);
    }
}

function parseVDF() {
    getDefualtSteamLibraryFile()

    var text = fs.readFileSync(steamLibraryFile, "utf-8")
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
        is_installed INTEGER NOT NULL DEFAULT 0
    )`)
    
}

ipcMain.on("save-steam-games", (event, games) => {
    SaveSteamGamesToDb(games)
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

function SaveSteamGamesToDb(games){
  if (!games || !Array.isArray(games["games"])) {
    console.warn("No games to save or invalid response:", data);
    return;
  }
    var installedGames = parseVDF();

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO steamGames (name, steam_id, img_icon_url)
        VALUES (?, ?, ?)
    `);

    const installedAppIds = new Set();

    for (const [key, value] of Object.entries(installedGames["libraryfolders"])) {
        if (!/^\d+$/.test(key)) continue; // only real library folders
        const apps = value["apps"] || {};
        for (const appId of Object.keys(apps)) {
            installedAppIds.add(appId);
        }
    }

    // Now check owned games
    games["games"].forEach((game) => {
        if (installedAppIds.has(String(game["appid"]))) {
            console.log(`${game["name"]}: is installed`);
        } else {
            console.log(`${game["name"]}: not installed`);
        }

        stmt.run(game["name"], game["appid"], game["img_icon_url"])
    });
    

    stmt.finalize();
}

ipcMain.handle('import-game', async (event, { gameFolders }) => {
    if (!gameFolders || gameFolders.length === 0) {
      return { success: false, message: 'No folders provided' };
    }
    
    const output = execSync('legendary list-games --json', { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    
    // Parse the JSON string into a JS object
    const games = JSON.parse(output);


    var addInstalledGamesToDb = db.prepare(`
        UPDATE epicGames SET is_installed = 1 WHERE app_name = ?
        `)

    // read the gameFolders content and iterate over them an log them
    gameFolders.forEach(folder => {
        if (!fs.existsSync(folder)) {
            console.error("Folder does not exist:", folder);
            return;
        }
        const files = fs.readdirSync(folder);
    
        console.log("Files in selected folder:", files);
    
        var matchedGames = matchFoldersToAppName(folder, files, games);
        console.log(fileTools.getDirectorySize(folder) + " bytes")
        console.log("Matched games:", matchedGames);
    
        if (matchedGames.length > 0){
            matchedGames.forEach(matchedGame => {
                
                try {  
                    if(fileTools.getDirectorySize(matchedGame.fullPath) > 20000000){ // only import if the folder is larger than 20MB
                        const importedGames = execSync("legendary import --with-dlcs " + matchedGame.app_name + "  " + matchedGame.fullPath);
                        addInstalledGamesToDb.run(matchedGame.app_name);
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

function matchFoldersToAppName(parentFolder, folders, ownedGames) {
  const matches = [];
  

  folders.forEach(folder => {
    const name = path.basename(folder).toLowerCase().replace(/[^a-z0-9]/g, '');
    const game = ownedGames.find(g => {
      const gameTitle = (g["app_title"] || g["title"] || "").toLowerCase().replace(/[^a-z0-9]/g, '');
      // Check if folder name is contained in game title or vice versa
      return gameTitle.includes(name) || name.includes(gameTitle);
    });
    console.log(`Matching folder "${folder}" with name "${name}"`);
    var fullPath = path.join(parentFolder, folder);
    if (game) {
      matches.push({ fullPath, app_name: game["app_name"], title: game["app_title"] });
    }
  });

  return matches;
}