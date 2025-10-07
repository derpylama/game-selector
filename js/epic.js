class EpicGames{
    constructor(){

    }

    checkEpicGameInstallationStatus(){
    var getInstalledGames = db.prepare(`SELECT app_name, install_location FROM epicGames WHERE is_installed = 1`);
    }
}

module.exports = EpicGames;