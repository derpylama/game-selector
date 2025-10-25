const fs = require('fs');
const path = require('path');

class Settings{
    constructor(baseDir){
        this.settingsFile = path.join(baseDir, "settings.json");
        this.settings = {
            "epicGamesLibraryFolders": [],
            "backendIP": null,
            "backendPort": null
        };

        this.loadSettings();
    }

    loadSettings(){
        if (fs.existsSync(this.settingsFile)){
            var data = fs.readFileSync(this.settingsFile, "utf-8");
            try {
                this.settings = JSON.parse(data);
            } catch (e) {
                console.error("Error parsing settings file:", e);
            }
        } else {
            this.saveSettings();
        }
    }

    saveSettings(){
        fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 4), "utf-8");
    }

    getSetting(key){
        return this.settings[key];
    }

    setSetting(key, value){
        this.settings[key] = value;
        this.saveSettings();
    }

}

module.exports = Settings;