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
        games["games"].forEach((game) => {
            if (installedAppIds.has(String(game["appid"]))) {
                console.log(`${game["name"]}: is installed`);
            } else {
                console.log(`${game["name"]}: not installed`);
            }

            db.get("SELECT 1 FROM steamGames WHERE steam_id = ?", [game["appid"]], (err, row) => {
                if (err) {
                    console.error("Database error:", err);
                    return;
                }
                if (row) {
                    // Game already exists, skip insertion
                    console.log(`Game with steam_id ${game["appid"]} already exists, skipping insertion.`);
                } else {
                    // Insert new game
                    stmt.run(game["name"], game["appid"], game["img_icon_url"], (err) => {
                        if (err) {
                            console.error("Error inserting game:", err);
                        } else {
                            console.log(`Inserted game: ${game["name"]}`);
                        }
                    });
                }
            });
        });

            
        stmt.finalize();
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
}


module.exports = Steam;