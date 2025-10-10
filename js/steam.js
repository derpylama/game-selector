const database = require("sqlite3");
const os = require("os");
const path = require("node:path");
const fs = require("fs");

class Steam {
    constructor(){
        this.steamLibraryFile = this.getDefualtSteamLibraryFile()
    }

    saveSteamGamesToDb(games){
        if (!games || !Array.isArray(games["games"])) {
            console.warn("No games to save or invalid response:", data);
            return;
        }
        var installedGames = this.parseVDF();

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
        let pending = games["games"].length;

        games["games"].forEach((game) => {
            db.get("SELECT 1 FROM steamGames WHERE steam_id = ?", [game["appid"]], (err, row) => {
                if (err) {
                    console.error("Database error:", err);
                    pending--;
                    if (pending === 0) stmt.finalize();
                    return;
                }
                if (!row) {
                    stmt.run(game["name"], game["appid"], game["img_icon_url"], (err) => {
                        if (err) {
                            console.error("Error inserting game:", err);
                        } else {
                            console.log(`Inserted game: ${game["name"]}`);
                        }
                        pending--;
                        if (pending === 0) stmt.finalize();
                    });
                } else {
                    pending--;
                    if (pending === 0) stmt.finalize();
                }
            });
        });

        this.checkSteamGameInstallationStatus();

    }
        



    getDefualtSteamLibraryFile(){
        if (process.platform === "win32"){
            var steamLibraryFile = path.join(
                process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
                "Steam",
                "steamapps",
                "libraryfolders.vdf"
            )

            return steamLibraryFile;
        }
        else if(process.platform === "linux"){
            var steamLibraryFile = path.join(os.homedir(), "./.steam/steam/steamapps/libraryfolders.vdf")
            return steamLibraryFile;
        }
        else {
            throw new Error("Unsupported platform: " + process.platform);
        }
    }

    parseVDF() {
    
        var text = fs.readFileSync(this.steamLibraryFile, "utf-8")
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

    checkSteamGameInstallationStatus(){
        var getInstalledGames = db.prepare(`SELECT name, steam_id FROM steamGames`);
        getInstalledGames.all((err, rows) => {
            if (err) {
                console.error("Database error:", err);
                return;
            }
            var installedGames = this.parseVDF();
            const installedAppIds = new Set();

            for (const [key, value] of Object.entries(installedGames["libraryfolders"])) {
                if (!/^\d+$/.test(key)) continue; // only real library folders
                const apps = value["apps"] || {};
                for (const appId of Object.keys(apps)) {
                    installedAppIds.add(appId);
                }
            }

            rows.forEach(row => {
                if (!installedAppIds.has(String(row.steam_id))) {
                    // Mark as uninstalled
                    var markAsUninstalled = db.prepare(`UPDATE steamGames SET is_installed = 0 WHERE steam_id = ?`);
                    markAsUninstalled.run(row.steam_id, (err) => {
                        if (err) {
                            console.error("Error updating game status:", err);
                        } else {
                            console.log(`Marked ${row.name} as uninstalled in database.`);
                        }
                    });
                    markAsUninstalled.finalize();
                } else {
                    // Mark as installed
                    var markAsInstalled = db.prepare(`UPDATE steamGames SET is_installed = 1 WHERE steam_id = ?`);
                    markAsInstalled.run(row.steam_id, (err) => {
                        if (err) {
                            console.error("Error updating game status:", err);
                        }
                    });
                    markAsInstalled.finalize();
                }
            });
        });
        getInstalledGames.finalize();
    }
}

module.exports = Steam;