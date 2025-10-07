const fs = require('fs');
const path = require('node:path');

// Get the total size of a directory (in bytes)
function getDirectorySize(dirPath) {
    let totalSize = 0;
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
        totalSize += stats.size;
    } else if (stats.isDirectory()) {
        totalSize += getDirectorySize(filePath);
    }
    });

    return totalSize;
}

function matchFoldersToAppName(parentFolder, folders, ownedGames) {
  const matches = [];
  

  folders.forEach(folder => {
    const name = path.basename(folder).toLowerCase().replace(/[^a-z0-9]/g, '');
    const game = ownedGames.find(g => {
      const gameTitle = (g["app_title"] || g["title"] || "").toLowerCase().replace(/[^a-z0-9]/g, '');
      // Check if folder name is contained in game title or vice versa
      return gameTitle.includes(name) || name.includes(gameTitle);
    });
    console.log(`Matching folder "${folder}" with name "${name}"`);
    var fullPath = path.join(parentFolder, folder);
    if (game) {
      matches.push({ fullPath, app_name: game["app_name"], title: game["app_title"] });
    }
  });

  return matches;
}
module.exports = {
    getDirectorySize,
    matchFoldersToAppName
};