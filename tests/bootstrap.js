const path = require('path');

// Pre-load electron mock so Node test runner can load Electron-dependent modules
const electronMockPath = path.join(__dirname, 'mocks', 'electron.js');
require.cache[require.resolve('electron')] = {
  id: 'electron',
  filename: 'electron',
  loaded: true,
  exports: require(electronMockPath)
};
