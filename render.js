window.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('test');

  button.addEventListener('click', () => {
    window.electronAPI.openSteamLogin();
  });

  window.electronAPI.onSteamToken((token) => {
    //console.log('Received token in renderer:', token); // This will now log
  });

  window.electronAPI.onOwnedGamesResponse((games) =>{
    //console.log(games["games"]);
    //console.log('Number of items:', Object.keys(games["games"]).length);
    window.electronAPI.saveSteamGamesToDb(games)
  })

  document.getElementById("get-owned-games").addEventListener("click", () => {
    window.electronAPI.getOwnedGames();
  })

    document.getElementById("select-folder").addEventListener("click", async () => {
    const folderPath = await window.electronAPI.selectFolder();
    if(folderPath != null){
        if (folderPath) {
        console.log('Selected folder:', folderPath);
        } else {
        console.log('Folder selection was canceled.');
        }

        document.getElementById("epic-games-list").innerHTML += `<li>${folderPath}</li>`;
        
    }
  });

    document.getElementById("import").addEventListener("click", async () => {

        var gameFolders = [];

        document.getElementById("epic-games-list").childNodes.forEach(folder => {
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
        generateGameCards(games);
    });

    document.getElementById("menu-games").addEventListener("click",(e) => {
        window.electronAPI.getAllGames().then(games => {
            generateGameCards(games);
        })
    })

    function generateGameCards(games){
        var gamesList = document.getElementById("games-list");
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
    }
        
    document.getElementById("save-settings-button").addEventListener("click", () => {

        var gameFolders = [];

        document.getElementById("epic-games-list").childNodes.forEach(folder => {
            gameFolders.push(folder.innerText);
        });


        window.electronAPI.saveSettings(
            { "backendIP": document.getElementById("server-address").value, 
                "backendPort": document.getElementById("server-port").value,
                "epicGamesLibraries": gameFolders

            }
        );
        console.log("Settings saved");
    })

    document.getElementById("connect-button").addEventListener("click", () => {
        const Username = document.getElementById("username")
        
        window.electronAPI.connectToServer(Username.value);
    })

    
});

window.electronAPI.loadedSettings((settings) => {
    console.log(settings);
    if (settings.backendIP) {
        document.getElementById("server-address").value = settings.backendIP;
    }
    if (settings.backendPort) {
        document.getElementById("server-port").value = settings.backendPort;
    }
    if (settings.epicGamesLibraryFolders) {
        var folders = JSON.parse(settings.epicGamesLibraryFolders);
        var epicGamesList = document.getElementById("epic-games-list");
        folders.forEach(folder => {
            epicGamesList.innerHTML += `<li>${folder}</li>`;
        });
    }
});

window.electronAPI.lobbyUpdate((lobbyInfo) => {
    console.log("Lobby Info Updated:", lobbyInfo);

    var lobbyInfoCon = document.getElementById("lobby-info");

    while(lobbyInfoCon.firstChild){
        lobbyInfoCon.removeChild(lobbyInfoCon.firstChild);
    }

    var lobbyName = document.createElement("h2");
    lobbyName.innerText = lobbyInfo.lobbyName;

    var lobbyID = document.createElement("h4");
    lobbyID.innerText = "Lobby id: " + lobbyInfo.lobbyId;

    var lobbyClients = document.createElement("p");
    lobbyClients.innerText = "Lobby members: \n";

    lobbyInfo.members.forEach((member) => {
        lobbyClients.innerText += member.userName + ", ";
    })

    lobbyInfoCon.appendChild(lobbyName);
    lobbyInfoCon.appendChild(lobbyID);

    lobbyInfoCon.appendChild(lobbyClients)
});

window.electronAPI.connectedToServer((username) => {
    document.getElementById("connection-status").innerText = "Connected with username: " + username
})

document.getElementById("create-lobby-button").addEventListener("click", () => {
    console.log("Create Lobby button clicked");

    window.electronAPI.createLobby(document.getElementById("lobby-name-input").value);

});

document.getElementById("join-lobby-button").addEventListener("click", () => {
    console.log("Join Lobby button clicked");

    window.electronAPI.joinLobby(document.getElementById("lobby-id-input").value);

});

document.getElementById("leave-lobby-button").addEventListener("click", () => {
    console.log("Leave Lobby button clicked");

    window.electronAPI.leaveLobby();
});

window.electronAPI.updateLobbyGames((games) => {
    console.log("Lobby Games Updated:", games);
    var gamesList = document.getElementById("lobby-games");

    if(Array.isArray(games.info.epic)){

        games.info.epic.forEach((gameInfo) => {
            let anyInstalled = false;
    
            var gameCard = document.createElement("div");
    
            gameCard.classList = "gameCard";
            
            gameCard.innerHTML = `
                <img src="${gameInfo.game.thumbnail_url}" alt="${gameInfo.game.title} Thumbnail" class="gameThumbnail">
                <div class="gameInfo">
                    <h3>${gameInfo.game.title}</h3>
    
                </div>
            `;
    
            var installDiv = document.createElement("div");
            installDiv.classList = "installationStatus";
    
            gameInfo.owners.forEach((owner) => {
    
                if(owner.installed){
                        anyInstalled = true;
    
                    if(!document.getElementById("installMessage")){
                        var installMsg = document.createElement("h5");
                        
                        installMsg.innerText = "Have it installed:";
    
                        installDiv.appendChild(installMsg);
                    }
    
                    var user = document.createElement("p");
                    user.innerText = owner.username;
    
                    installDiv.appendChild(user);
                }
                else {
                    // Mark card visually if not installed
                    gameCard.classList.add("notInstalled");
                }
            })
        
            // After checking all owners
            if (!anyInstalled) {
                gameCard.classList.add("notInstalled");
            }
        
            gameCard.appendChild(installDiv);
            gamesList.appendChild(gameCard);
            
        });
    }

    if(Array.isArray(games.info.steam)){

        games.info.steam.forEach((gameInfo) => {
            let anyInstalled = false;
            var gameCard = document.createElement("div");

            gameCard.classList = "gameCard";
                    
            gameCard.innerHTML = `
                <img src="https://media.steampowered.com/steamcommunity/public/images/apps/${gameInfo.game.steam_id}/${gameInfo.game.img_icon_url}.jpg" alt="${gameInfo.game.name} Thumbnail" class="gameThumbnail">
                <div class="gameInfo">
                    <h3>${gameInfo.game.name}</h3>
                </div>
            `;

            var installDiv = document.createElement("div");
            installDiv.classList = "installationStatus";

            gameInfo.owners.forEach((owner) => {

                if(owner.installed){
                        anyInstalled = true;

                    if(!document.getElementById("installMessage")){
                        var installMsg = document.createElement("h5");
                        
                        installMsg.innerText = "Have it installed:";

                        installDiv.appendChild(installMsg);
                    }

                    var user = document.createElement("p");
                    user.innerText = owner.username;

                    installDiv.appendChild(user);
                }
                else {
                    // Mark card visually if not installed
                    gameCard.classList.add("notInstalled");
                }
            })
        
            // After checking all owners
            if (!anyInstalled) {
                gameCard.classList.add("notInstalled");
            }

            gameCard.appendChild(installDiv);
            gamesList.appendChild(gameCard)
        })
    }

    document.querySelectorAll('.gameCard img').forEach(img => {
        img.onload = function() {
        if (img.naturalWidth > img.naturalHeight) {
            img.classList.add('landscape-img');
            img.classList.remove('portrait-img');
        } else {
            img.classList.add('portrait-img');
            img.classList.remove('landscape-img');
        }
    }});


})
const loadingOverlay = document.getElementById("loading-overlay");

window.electronAPI.progressOverlay((status) => {
    const progressBar = document.getElementById("progress-bar");
    const statusText = document.getElementById("status-text");
    
    loadingOverlay.style.display = "flex";
    progressBar.style.transition = 'width 0.1s linear'; 

    var precent = Math.round((status.processed / status.total) * 100);
    progressBar.value = precent;

    console.log(precent)
    statusText.innerText = status.message;

})

window.electronAPI.progressOverlayComplete(() => {
    loadingOverlay.style.display = "none"
})

document.getElementById("epic-games-list").addEventListener("click", (e) => {
    if(e.target.tagName == "LI"){
        document.querySelectorAll(".li-selected").forEach((listItem) => {
            listItem.classList.remove("li-selected");
        })

        e.target.classList.add("li-selected");
    }
})

document.getElementById("delete-folder").addEventListener("click", (e) => {
    const listItemToBeDeleted = document.getElementsByClassName("li-selected")[0];

    console.log(listItemToBeDeleted.innerHTML)
    listItemToBeDeleted.remove();
})