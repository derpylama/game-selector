const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const fileTools = require('./filetools');
const { execSync } = require('child_process');
const { BrowserWindow } = require('electron');

class EpicGames{
    constructor(dbPath, legendaryPath, db){
        this.dbPath = dbPath;
        this.legendaryPath = legendaryPath;
        this.db = db;
        this.win = BrowserWindow.getAllWindows()[0];
    }

    async checkEpicGameInstallationStatus(){
        try {
            if (!fs.existsSync(this.dbPath)) return;

            // Wrap the all() method in a promise to use async/await
            const rows = await new Promise((resolve, reject) => {
                this.db.all(`SELECT app_name, install_location FROM epicGames WHERE is_installed = 1`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);

                });
            });
            
            for (const row of rows) {
                if (!fs.existsSync(row.install_location)) {
                    //console.log(`Game at ${row.install_location} not found. Updating database.`);

                    await new Promise((resolve, reject) => {
                        this.db.run(
                            `UPDATE epicGames SET is_installed = 0, install_location = '' WHERE app_name = ?`,
                            [row.app_name],
                            (err) => {
                                if (err) reject(err);
                                else {
                                    //console.log(`Marked ${row.app_name} as uninstalled.`);
                                    resolve();
                                }
                            }
                        );
                    });
                }
            }

            
        } catch (error) {
            console.error("Error checking Epic game installation status:", error);
        }
    }

    // --- 1️⃣ Bulk insert owned games ---
    async saveOwnedEpicGamesToDb(games) {
        return new Promise((resolve, reject) => {
            if (!games || games.length === 0) {
                console.warn("No games to save.");
                return resolve();
            }

            console.log(`Saving ${games.length} Epic games to database...`);
            
            const total = games.length;
            var processed = 0;
            
            this.db.serialize(() => {
                this.db.run("BEGIN TRANSACTION");
                const stmt = this.db.prepare(`
                    INSERT OR IGNORE INTO epicGames (title, app_name, install_location, thumbnail_url)
                    VALUES (?, ?, ?, ?)
                `);

                for (const game of games) {
                    const imageUrl = game?.metadata?.keyImages?.[1]?.url || "";
                    processed++;
                    this.win.webContents.send("progress-overlay", { processed, total , message: "Importing Epic games"} );
                    stmt.run(game.app_title, game.app_name, "", imageUrl);
                }

                stmt.finalize();
                this.db.run("COMMIT", (err) => {
                    this.win.webContents.send("progress-overlay-complete", {message: "finished importing Steam games"});
                    if (err) {
                        console.error("Transaction commit failed:", err);
                        reject(err);
                    } else {
                        console.log("✅ All Epic games inserted successfully.");
                        resolve();
                    }
                });
            });
        });
    }

    // --- 2️⃣ Bulk mark installed games ---
    async markInstalledGames(installedGames) {
        return new Promise((resolve, reject) => {
            if (!installedGames || installedGames.length === 0) {
                console.log("No installed games detected.");
                return resolve();
            }

            console.log(`Updating installation status for ${installedGames.length} games...`);

            
            this.db.serialize(() => {
                this.db.run("BEGIN TRANSACTION");
                const stmt = this.db.prepare(`
                    UPDATE epicGames
                    SET is_installed = 1, install_location = ?
                    WHERE app_name = ?
                `);

                for (const g of installedGames) {
                    stmt.run(g.install_location, g.app_name);
                }

                stmt.finalize();

                // Mark all others as uninstalled
                const appNames = installedGames.map(g => g.app_name);
                if (appNames.length > 0) {
                    const placeholders = appNames.map(() => "?").join(",");
                    this.db.run(
                        `UPDATE epicGames SET is_installed = 0 WHERE app_name NOT IN (${placeholders})`,
                        appNames,
                        (err) => {
                            if (err) {
                                console.error("Error marking uninstalled games:", err);
                            }
                        }
                    );
                }

                this.db.run("COMMIT", (err) => {
                    if (err) {
                        console.error("Transaction commit error:", err);
                        reject(err);
                    } else {
                        console.log("✅ Installation statuses updated.");
                        resolve();
                    }
                });
            });
        });
    }

    // --- 3️⃣ Import games & orchestrate everything ---
    async importGames(gameFolders) {

        // Fetch game list via Legendary CLI
        const output = execSync(this.legendaryPath + " list-games --json", {
            encoding: "utf-8",
            maxBuffer: 10 * 1024 * 1024
        });
        const games = JSON.parse(output);

        // Step 1: Save owned games
        await this.saveOwnedEpicGamesToDb(games);

        if(gameFolders || gameFolders.length > 0){
            // Step 2: Detect installed games from selected folders
            const installedGames = [];

            for (const folder of gameFolders) {
                if (!fs.existsSync(folder)) {
                    console.error("Folder does not exist:", folder);
                    continue;
                }

                const files = fs.readdirSync(folder);
                const matchedGames = fileTools.matchFoldersToAppName(folder, files, games);

                for (const matchedGame of matchedGames) {
                    try {
                        const size = fileTools.getDirectorySize(matchedGame.fullPath);
                        if (size > 20_000_000) { // >20MB
                            console.log(`Importing ${matchedGame.app_name}...`);
                            execSync(this.legendaryPath + ` import --with-dlcs ${matchedGame.app_name} "${matchedGame.fullPath}"`);
                            installedGames.push({
                                app_name: matchedGame.app_name,
                                install_location: matchedGame.fullPath
                            });
                        } else {
                            console.warn(`Game "${matchedGame.app_name}" folder too small, skipping import.`);
                        }
                    } catch (error) {
                        if (error.message.includes("already imported")) {
                            console.warn(`Game "${matchedGame.app_name}" is already imported.`);
                        } else {
                            console.error("Error importing game:", error.message);
                        }
                    }
                }
            }

            // Step 3: Bulk mark installed games
            await this.markInstalledGames(installedGames);
            
        }
        else{
            console.log("user did not provide epic games install folders can't save installed games")
        }


        

        return { success: true, message: "Epic Games import completed" };
    }
}

module.exports = EpicGames;