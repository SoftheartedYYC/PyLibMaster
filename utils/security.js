const path = require('path');

function isAllowedOpenPath(targetPath, allowedDirs) {
  if (typeof targetPath !== 'string' || !targetPath) return false;
  if (!Array.isArray(allowedDirs) || allowedDirs.length === 0) return false;

  const resolved = path.resolve(targetPath);
  return allowedDirs.some((dir) => {
    const resolvedDir = path.resolve(dir);
    return resolved === resolvedDir || resolved.startsWith(resolvedDir + path.sep);
  });
}

module.exports = { isAllowedOpenPath };
