import { UpdateInfo, autoUpdater } from "electron-updater";
import { dialog } from 'electron';
import type { BrowserWindow } from "electron"
import { mainWindow } from "./main";

export class UpdateHandler {

    update_prompt_declined = false;
    rendererWindow: BrowserWindow

    initialize(rendererWindow: BrowserWindow) {
        this.rendererWindow = rendererWindow;

        autoUpdater.autoDownload = false;
        autoUpdater.checkForUpdates();

        autoUpdater.on('update-available', (info) => {

            if (this.update_prompt_declined) return;
            else this.promptNewUpdate(info);


        })
    }

    promptNewUpdate(info: UpdateInfo) {
        var releaseNotes = `${info.releaseNotes}`;

        if (releaseNotes.length)
            releaseNotes = releaseNotes.replace(/(<([^>]+)>)/gi, "");

        dialog.showMessageBox(this.rendererWindow, {
            title: "Update available",
            message: `New update available\nUpdate now?\n\n\nNew version: v.${info.version}\nRelease notes: ${releaseNotes}`,
            type: "question",
            buttons: ["Download and Update now", "Download and Update on exit", "Not now"]
        }).then((v) => {
            if (v.response === 2) return; // index 2 === "Not now";

            if (v.response === 0) mainWindow?.hide();

            console.log("Downloading update...");

            const ProgressBar = require('electron-progressbar');
            var progressBar = new ProgressBar({
                indeterminate: false,
                text: 'Downloading update',
                detail: 'Waiting for connection...'
            });

            autoUpdater.downloadUpdate();

            autoUpdater.on('download-progress', (progressObj) => {
                progressBar.value = Math.round(progressObj.percent)
                progressBar.detail = `Update downloaded ${Math.round(progressObj.percent)}%`;
            })

            autoUpdater.on('update-downloaded', (info) => {
                console.log("Update downloaded");

                autoUpdater.autoInstallOnAppQuit = v.response === 1;
                if (v.response === 0) {
                    console.log("Installing update...");

                    autoUpdater.quitAndInstall();
                }
            })
        })
    }

    checkForUpdate() {
        return new Promise((resolve, reject) => {
            this.update_prompt_declined = false;
            autoUpdater.checkForUpdates()
                .then(a => {
                    if (a) resolve(true)
                    else resolve(false)
                })
        })

    }
}