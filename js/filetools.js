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
module.exports = {
    getDirectorySize
};