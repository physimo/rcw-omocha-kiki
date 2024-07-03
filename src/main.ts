////////////////////////////////////////////////// IMPORT //////////////////////////////////////////////////

import { app, BrowserWindow, screen, Tray, shell, Menu, session } from 'electron';
import { exit } from 'process';
import * as fs from "fs";
import type * as contextMenuType from 'electron-context-menu';
const isDev = process.argv.includes('--dev') ? true : false;

////////////////////////////////////////////////// EXPORTS //////////////////////////////////////////////////

/**
 * Electron main window instance
 */
export var mainWindow: BrowserWindow | null = null;

/**
 * Electron tray instance
 */
export var trayInstance: Tray | null = null;

/**
 * System local app data path
 */
export const APPDATA = (process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share")) + '\\Omocha-kiki';

/**
 * Cookies file path
 */
export const cookiesFilePath = APPDATA + "\\cookies.json";

////////////////////////////////////////////////// FORCE ONLY ONE INSTANCE AT A TIME //////////////////////////////////////////////////

const instanceLock = app.requestSingleInstanceLock();

if (!instanceLock) {
    // If the app is already running, quit this instance
    app.quit();
} else {
    // If this is the first instance, register a listener for subsequent attempts
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Bring the existing instance to the foreground
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            else if (!mainWindow.isVisible()) {
                // Get all open windows
                const windows = BrowserWindow.getAllWindows()

                // Show each window
                windows.forEach(window => window.show())
            }
            mainWindow.focus();
        }
    });
}

////////////////////////////////////////////////// SAVE COOKIES TO FILE FUNCTION //////////////////////////////////////////////////

function saveCookiesToFile() {
    return session.defaultSession.cookies.get({})
        .then((cookies) => {
            fs.writeFileSync(cookiesFilePath, JSON.stringify(cookies, null, 2));
        })
        .catch((error) => {
            console.error('Failed to get and save cookies:', error);
        });
}

////////////////////////////////////////////////// CREATE WINDOW FUNCTION //////////////////////////////////////////////////

function createMainWindow() {
    // set app id
    app.setAppUserModelId('RC Omocha-kiki');

    return new Promise<BrowserWindow>(async (resolve, reject) => {
        console.log("Creating main window...");
        const size = screen.getPrimaryDisplay().workAreaSize;

        const window = new BrowserWindow({
            x: 0,
            y: 0,
            width: size.width,
            height: size.height,
            title: `Omocha Kiki`,
            show: process.argv.includes('--startup') ? false : true
        });

        // remove menu as it is useless on production
        window.removeMenu();

        // Load initial cookies from file if exists
        if (fs.existsSync(cookiesFilePath)) {
            const cookies = JSON.parse(<any>fs.readFileSync(cookiesFilePath));
            await cookies.forEach(async (cookie) => {
                await session.defaultSession.cookies.set({ url: 'https://rocket.omocha-kiki.com', ...cookie })
                    .then(() => {
                        console.log('Cookie restored');
                    })
                    .catch((error) => {
                        console.error('Failed to restore cookie:', error);
                    });
            });
        }

        // handle clicking url to open it on default browser
        // instead of opening new electron window to view the url
        window.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url);
            return { action: 'deny' };
        });

        // on close button, hide to tray
        window.on("close", async (e) => {
            e.preventDefault();
            // Get all open windows
            const windows = BrowserWindow.getAllWindows()
            // Hide each window
            windows.forEach(window => window.hide())
        })

        // destroy object when closed
        window.on('closed', () => { mainWindow = null });

        // tray
        trayInstance = new Tray(require("path").resolve("./assets/icon.ico"));
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Exit', type: 'normal', click: <any>exit
            }
        ])
        trayInstance.setContextMenu(contextMenu);

        // open all window on tray click
        // or focus on main window if not in tray
        trayInstance.on('click', () => {
            // Get all open windows
            const windows = BrowserWindow.getAllWindows()

            // Show each window
            windows.forEach(window => window.show())
        })

        var notification_icon = false
        window.on('page-title-updated', async (e, title) => {
            if (title.startsWith("(")) {
                // new message
                if (notification_icon) return;
                notification_icon = true;
                window.setOverlayIcon(require("path").resolve("./assets/overlay_notify.ico"), "New message")
                trayInstance.setImage(require("path").resolve("./assets/icon_notify.ico"))
                trayInstance.setToolTip("New message")
            }
            else {
                // no new message
                if (!notification_icon) return;
                notification_icon = false;
                window.setOverlayIcon(null, "No new message")
                trayInstance.setImage(require("path").resolve("./assets/icon.ico"))
                trayInstance.setToolTip("No new message")
            }
        });

        // open RC
        window.loadURL(`https://rocket.omocha-kiki.com/home`);

        // call update handler
        const updateHandler = new (require("./updater")).UpdateHandler();
        await updateHandler!.initialize(mainWindow);

        console.log("Main window created and showing")
        resolve(window);
    })

};

////////////////////////////////////////////////// ON READY //////////////////////////////////////////////////

async function appReady() {
    // force appdata folder existence
    if (!fs.existsSync(APPDATA)) fs.mkdirSync(APPDATA, { recursive: true })

    // check if first launch
    if (!fs.existsSync(APPDATA + '\\.unchaste')) await firstLaunch();

    // create and wait for main window
    await createMainWindow()

    // Listen for cookies-changed event
    session.defaultSession.cookies.on('changed', (event, cookie, cause, removed) => {
        saveCookiesToFile();
    });

    // quit application when all windows are closed
    app.on('window-all-closed', () => {
        // on macOS it is common for applications to stay open until the user explicitly quits
        if (process.platform !== 'darwin') {
            app.quit();
            console.log("All window has been closed. The app will now exiting process...");
        }
    });

    app.on('activate', async () => {
        // on macOS it is common to re-create a window even after all windows have been closed
        if (mainWindow === null) mainWindow = await createMainWindow();
    });
}

////////////////////////////////////////////////// ON FIRST LAUNCH //////////////////////////////////////////////////

async function firstLaunch() {
    if (isDev) return; // ignore if dev

    // create marker
    fs.writeFileSync(APPDATA + '\\.unchaste', "De-flowered");

    // register on startup
    app.setLoginItemSettings({
        openAtLogin: true,
        args: ['--startup']
    });
}

////////////////////////////////////////////////// RUN //////////////////////////////////////////////////

(async () => {
    const contextMenu = (await Function('return import("electron-context-menu")')()).default;

    contextMenu(<contextMenuType.Options>{
        showSaveImageAs: true,
        showCopyImageAddress: true,
        showCopyVideoAddress: true,
        showInspectElement: false,
        showSearchWithGoogle: false,
        showSelectAll: false,
        showSaveVideoAs: true
    });

    // create main BrowserWindow when electron is ready
    if (app.isReady()) appReady();
    else app.once("ready", appReady)
})();
