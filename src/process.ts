import { dialog } from "electron";
import { hostname } from "os";
export const logArray = [];
const consoleChannels = ["log", "warn", "error", "info"];

// log console to array
consoleChannels.forEach((method) => {
    const originalMethod = console[method];
    console[method] = function (...args) {
        const logMessage = `[${new Date().toLocaleString()}] [${method.toUpperCase()}] ${args.join(' ')}`;

        // keep it to a limit to avoid large mem. usage on long-run
        if (logArray.length >= 500) { 
            logArray.splice(1, logArray.length - 1, logMessage);
        } else {
            logArray.push(logMessage);
        }
        
        originalMethod.apply(console, args);
    };
});

async function showErrMessage(detail: string, title?: string) {
    return dialog.showErrorBox(title || detail, !title ? '' : detail)
};

process.on('unhandledRejection', async (reason, promise) => {
    await promise.catch((e: Error) => { showErrMessage(e.stack || (String(e) || "No detail provided")) })
});

process.on('uncaughtException', (err, origin) => {

    var detail = "No detail provided";
    if (err && err.stack && origin)
        detail = err.stack + "(Error Origin = " + `${origin}` + ")";

    showErrMessage(detail, "A critical error has occured. The app will now exit after this.")
        .then(() => { process.exit(0) }) // graceful exit


});

process.on("exit", async (code) => { // graceful exit
});

if (!process.env.USERNAME) process.env.USERNAME = hostname();