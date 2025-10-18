const database = require("sqlite3");
const os = require("os");
const path = require("node:path");
const fs = require("fs");
const { BrowserWindow } = require("electron");

class Steam {
    constructor(){
        this.steamLibraryFile = this.getDefualtSteamLibraryFile()
        this.win = BrowserWindow.getAllWindows()[0];
    }

    saveSteamGamesToDb(games){
        
        if (!games || !Array.isArray(games.games)) {
            console.warn("No games to save or invalid response:", games);
            return;
        }
        const total = games.games.length;
        var processed = 0;

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO steamGames (name, steam_id, img_icon_url)
            VALUES (?, ?, ?)
        `);

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            for (const game of games.games) {
                stmt.run(game.name, game.appid, game.img_icon_url);
                processed++;
                this.win.webContents.send("progress-overlay", { processed, total , message: "Importing Steam games"} );
                //if (err) console.error(`Error inserting ${game.name}:`, err);
            }

            db.run("COMMIT", (err) => {
                if (err) console.error("Transaction commit error:", err);
                else console.log("All Steam games inserted/updated successfully ✅");

                stmt.finalize();

                this.win.webContents.send("progress-overlay-complete", {message: "finished importing Steam games"});
            });
        });

        // Update installation status after inserting
        this.checkSteamGameInstallationStatus();

    }
    
    //Gets steam library.vdf file path based on what os is running
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
        var installedGames = this.parseVDF();
        
        const installedAppIds = new Set();

        for (const [key, value] of Object.entries(installedGames["libraryfolders"])) {
            if (!/^\d+$/.test(key)) continue; // only real library folders
            const apps = value["apps"] || {};
            for (const appId of Object.keys(apps)) {
                installedAppIds.add(appId);
            }
        }

                // Bulk update using a single transaction
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            // Mark installed
            db.run(
                `UPDATE steamGames SET is_installed = 1 WHERE steam_id IN (${[...installedAppIds].map(() => "?").join(",")})`,
                [...installedAppIds],
                (err) => { if (err) console.error("Error marking installed games:", err); }
            );

            // Mark uninstalled
            db.run(
                `UPDATE steamGames SET is_installed = 0 WHERE steam_id NOT IN (${[...installedAppIds].map(() => "?").join(",")})`,
                [...installedAppIds],
                (err) => { if (err) console.error("Error marking uninstalled games:", err); }
            );

            db.run("COMMIT", (err) => {
                if (err) console.error("Transaction commit error:", err);
                else console.log("Steam installation status updated ✅");
            });
        });
        
    }
}

module.exports = Steam;