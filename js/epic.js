const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

class EpicGames{
    constructor(){
        
    }

    async checkEpicGameInstallationStatus(){
        try {
            const dbPath = path.join(process.cwd(), 'games.sqlite');
            if (!fs.existsSync(dbPath)) return;

            // Wrap the all() method in a promise to use async/await
            const rows = await new Promise((resolve, reject) => {
                db.all(`SELECT app_name, install_location FROM epicGames WHERE is_installed = 1`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);

                });
            });
            
            for (const row of rows) {
                if (!fs.existsSync(row.install_location)) {
                    //console.log(`Game at ${row.install_location} not found. Updating database.`);

                    await new Promise((resolve, reject) => {
                        db.run(
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
}

module.exports = EpicGames;