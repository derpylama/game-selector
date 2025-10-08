window.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('test');

  button.addEventListener('click', () => {
    window.electronAPI.openSteamLogin();
  });

  window.electronAPI.onSteamToken((token) => {
    console.log('Received token in renderer:', token); // This will now log
  });

  window.electronAPI.onOwnedGamesResponse((games) =>{
    console.log(games["games"]);
    console.log('Number of items:', Object.keys(games["games"]).length);
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
        console.log(games);
    });
});
