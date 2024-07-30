////////////////////////////////////////////////// IMPORTS //////////////////////////////////////////////////

import { app, BrowserWindow, screen, Tray, shell, Menu, session, dialog, clipboard } from 'electron';
import { exit } from 'process';
import * as fs from "fs";
import * as path from 'path';
import type * as contextMenuType from 'electron-context-menu';
import type { UpdateHandler } from './updater';
import "./process"
import { spawn } from 'child_process';
import { logArray } from './process';
const packageJson = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'));
const isDev = process.argv.includes('--dev') ? true : false;
const isStartup = process.argv.includes('--startup') ? true : false;
var isHidden: boolean = isStartup ? true : false;
let inAppContextDispose: CallableFunction = void 0;
let assetPath: string;


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
        const updateHandler: UpdateHandler = new (require("./updater")).UpdateHandler();
        const window = new BrowserWindow({
            x: 0,
            y: 0,
            width: size.width,
            height: size.height,
            title: `Omocha Kiki RCW v${packageJson.version}`,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: true,
                preload: path.resolve(assetPath + '/preload.js')
            },
            show: isStartup ? false : true
        });

        if (isDev) window.webContents.openDevTools()

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
            // flick switch and destroy in-app context event listeners
            isHidden = true;
            inAppContextDispose()
        })

        // destroy object when closed
        window.on('closed', () => { mainWindow = null });

        // initialize update handler
        updateHandler!.initialize(mainWindow);

        // check for update function
        function updateCheck() {
            updateHandler.checkForUpdate()
                .then(r => {
                    if (!r) dialog.showMessageBox(mainWindow, { message: "No update available" })
                })
        }

        // open window function
        function openWindow() {
            // ignore if not hidden
            if (!isHidden) return;
            isHidden = false

            // Get all open windows
            const windows = BrowserWindow.getAllWindows()

            // if there's no window, or main window has become null / destroyed
            if (!windows.length || mainWindow?.isDestroyed()) {
                try {
                    // relaunch app
                    app.relaunch();
                    app.exit(0);
                }
                catch (err) {
                    // restart from process
                    process.on('exit', function () {
                        spawn(process.argv[0], process.argv.slice(1), {
                            cwd: process.cwd(),
                            detached: true,
                            stdio: 'inherit'
                        });
                    });
                    app.exit(0)
                }
                finally {
                    // will reach here if app.exit fails
                    // force exit from process
                    process.exit(0)
                }
            }

            // Show each window
            windows.forEach(window => window.show())

            // reset in-app context menu
            setContextMenu()
        }

        // copy console log to clipboard
        function copyLog() {
            clipboard.writeText(logArray.join("\n"))
        }

        // tray
        trayInstance = new Tray(path.resolve(assetPath + "/icon.ico"));
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'v' + packageJson.version, type: 'normal', enabled: false
            },
            {
                type: 'separator', enabled: false
            },
            {
                label: 'Open', type: 'normal', click: openWindow
            },
            {
                label: 'Check for update', type: 'normal', click: updateCheck
            },
            {
                label: 'Copy console log', type: 'normal', click: copyLog
            },
            {
                label: 'Exit', type: 'normal', click: <any>exit
            }
        ])
        trayInstance.setContextMenu(contextMenu);

        // open all window on tray click
        // or focus on main window if not in tray
        trayInstance.on('click', openWindow)

        var notification_icon = false
        window.on('page-title-updated', async (e, title) => {
            if (title.startsWith("(")) {
                // new message
                if (notification_icon) return;
                notification_icon = true;
                trayInstance.setImage(path.resolve(assetPath + "/icon_notify.ico"))
                trayInstance.setToolTip("New message")
            }
            else {
                // no new message
                if (!notification_icon) return;
                notification_icon = false;
                window.setOverlayIcon(null, "No new message")
                trayInstance.setImage(path.resolve(assetPath + "/icon.ico"))
                trayInstance.setToolTip("No new message")
            }
        });

        // open RC
        window.loadURL(`https://rocket.omocha-kiki.com/home`);

        console.log("Main window created and showing")
        resolve(window);
    })

};

////////////////////////////////////////////////// ON READY //////////////////////////////////////////////////

async function appReady() {
    // determine asset path
    // startup working directory is in system32
    if (isStartup) assetPath = path.dirname(app.getPath("exe")) + "\\assets\\"
    else assetPath = path.resolve("./assets/");

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
        name: "RCW Omocha-Kiki",
        openAtLogin: true,
        args: ['--startup']
    });
}

////////////////////////////////////////////////// IN-APP CONTEXT MENU //////////////////////////////////////////////////

async function setContextMenu() {
    const contextMenu = (await Function('return import("electron-context-menu")')()).default;

    inAppContextDispose = await contextMenu(<contextMenuType.Options>{
        showSaveImageAs: true,
        showCopyImageAddress: true,
        showCopyVideoAddress: true,
        showInspectElement: false,
        showSearchWithGoogle: false,
        showSelectAll: false,
        showSaveVideoAs: true
    });
}

////////////////////////////////////////////////// RUN //////////////////////////////////////////////////

(async () => {

    setContextMenu(); // do not wait

    // create main BrowserWindow when electron is ready
    if (app.isReady()) appReady();
    else app.once("ready", appReady)
})();
