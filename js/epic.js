const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

class EpicGames{
    constructor(){

    }

    checkEpicGameInstallationStatus(){
        var getInstalledGames = db.prepare(`SELECT app_name, install_location FROM epicGames WHERE is_installed = 1`);
        getInstalledGames.all((err, rows) => {
            if (err) {
                console.error("Database error:", err);
                return;
            }
            rows.forEach(row => {
                if (!fs.existsSync(row.install_location)) {
                    console.log(`Game at ${row.install_location} not found. Updating database.`);
                    var markAsUninstalled = db.prepare(`UPDATE epicGames SET is_installed = 0, install_location = '' WHERE app_name = ?`);
                    markAsUninstalled.run(row.app_name, (err) => {
                        if (err) {
                            console.error("Error updating game status:", err);
                        } else {
                            console.log(`Marked ${row.app_name} as uninstalled.`);
                        }
                    });
                    markAsUninstalled.finalize();
                }
            });
        });
        getInstalledGames.finalize();
    }
}

module.exports = EpicGames;