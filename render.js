window.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('test');

  button.addEventListener('click', () => {
    window.electronAPI.openSteamLogin();
  });

  window.electronAPI.onSteamToken((token) => {
    console.log('Received token in renderer:', token); // This will now log
  });

  document.getElementById("getOwnedGames").addEventListener("click", () => {
    window.electronAPI.getOwnedGames();
  })
});
