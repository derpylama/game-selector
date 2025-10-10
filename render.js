window.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('test');

  button.addEventListener('click', () => {
    window.electronAPI.openSteamLogin();
  });

  window.electronAPI.onSteamToken((token) => {
    console.log('Received token in renderer:', token); // This will now log
  });

  window.electronAPI.onOwnedGamesResponse((games) =>{
    //console.log(games["games"]);
    //console.log('Number of items:', Object.keys(games["games"]).length);
    window.electronAPI.saveSteamGamesToDb(games)
  })

  document.getElementById("getOwnedGames").addEventListener("click", () => {
    window.electronAPI.getOwnedGames();
  })

    document.getElementById("selectFolder").addEventListener("click", async () => {
    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) {
      console.log('Selected folder:', folderPath);
    } else {
      console.log('Folder selection was canceled.');
    }

    document.getElementById("epicGamesList").innerHTML += `<li>${folderPath}</li>`;
  });

    document.getElementById("import").addEventListener("click", async () => {

        var gameFolders = [];

        document.getElementById("epicGamesList").childNodes.forEach(folder => {
            gameFolders.push(folder.innerText);
        });

        window.electronAPI.importGame(gameFolders);
    })

    const sections = [
        "games",
        "lobbys",
        "settings",
        "about"
    ];

    sections.forEach(section => {
        document.getElementById(`menu-${section}`).addEventListener("click", () => {
            sections.forEach(sec => {
                document.getElementById(`content-${sec}`).style.display = "none";
            });
            document.getElementById(`content-${section}`).style.display = "block";
        });
    });

    // Show default section
    document.getElementById("content-games").style.display = "block";

    window.electronAPI.getAllGames().then(games => {
        console.log(games.epicGames);
        console.log(games.steamGames);
        var gamesList = document.getElementById("gamesList");
        games.epicGames.forEach(game => {
            var gameCard = document.createElement("div");
            gameCard.className = "gameCard";
            gameCard.innerHTML = `
                <img src="${game.thumbnail_url}" alt="${game.title} Thumbnail" class="gameThumbnail">
                <div class="gameInfo">
                    <h3>${game.title}</h3>
                    <p>Installed: ${game.is_installed ? "Yes" : "No"}</p>
                </div>
            `;

            if (!game.is_installed) {
                gameCard.classList.add("notInstalled");
            }
            gamesList.appendChild(gameCard);
        });
        games.steamGames.forEach(game => {
            var gameCard = document.createElement("div");
            gameCard.className = "gameCard";
            gameCard.innerHTML = `
                <img src="https://media.steampowered.com/steamcommunity/public/images/apps/${game.steam_id}/${game.img_icon_url}.jpg" alt="${game.name} Thumbnail" class="gameThumbnail">
                <div class="gameInfo">
                    <h3>${game.name}</h3>
                </div>
            `;

            if(!game.is_installed){
                gameCard.classList.add("notInstalled");
            }

            gamesList.appendChild(gameCard);
        });

        document.querySelectorAll('.gameCard img').forEach(img => {
        img.onload = function() {
        if (img.naturalWidth > img.naturalHeight) {
            img.classList.add('landscape-img');
            img.classList.remove('portrait-img');
        } else {
            img.classList.add('portrait-img');
            img.classList.remove('landscape-img');
        }
    };
});

    });
        
    document.getElementById("saveSettingsButton").addEventListener("click", () => {
        window.electronAPI.saveSettings(
            { "backendIP": document.getElementById("serverAddress").value, 
                "backendPort": document.getElementById("serverPort").value

            }
        );
        console.log("Settings saved");
    })

    document.getElementById("connectButton").addEventListener("click", () => {
        window.electronAPI.connectToServer();

    })

    
});
