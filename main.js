import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate env vars
if (!process.env.TWITCH_ID || !process.env.TWITCH_SECRET) {
  app.whenReady().then(() => {
    dialog.showErrorBox(
      'Missing Configuration',
      'TWITCH_ID or TWITCH_SECRET is missing from the .env file.\n\nPlease create a .env file with both values.'
    );
    app.exit(1); // <-- This works better than process.exit() inside Electron
  });
} else {
  function createWindow() {
    const win = new BrowserWindow({
      width: 1000,
      height: 700,
      webPreferences: {
        contextIsolation: true,
      },
    });

    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
