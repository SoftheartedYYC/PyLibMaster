// Mock Electron APIs for Node test runner
module.exports = {
  app: {
    isReady: () => false,
    getPath: (name) => {
      const os = require('os');
      const path = require('path');
      if (name === 'userData') return path.join(os.tmpdir(), 'pylibmaster-test-userdata');
      if (name === 'documents') return path.join(os.homedir(), 'Documents');
      if (name === 'downloads') return path.join(os.homedir(), 'Downloads');
      return os.tmpdir();
    },
    getVersion: () => '1.5.13',
    getName: () => 'PyLibMaster'
  },
  BrowserWindow: {},
  ipcMain: { handle: () => {} },
  dialog: {},
  shell: {}
};
