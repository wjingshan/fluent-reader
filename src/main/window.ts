import { BrowserWindow, nativeTheme, app } from "electron"
import * as path from "node:path"
import { setThemeListener, setAppIconListener, applyStoredAppIcon } from "./settings"
import { setUtilsListeners } from "./utils"

export class WindowManager {
    mainWindow: BrowserWindow = null

    constructor() {
        this.init()
    }

    private init = () => {
        app.on("ready", () => {
            this.setListeners()
            this.createWindow()
        })
    }

    private setListeners = () => {
        setThemeListener(this)
        setAppIconListener(this)
        setUtilsListeners(this)

        app.on("second-instance", () => {
            if (this.mainWindow !== null) {
                this.mainWindow.focus()
            }
        })

        app.on("activate", () => {
            if (this.mainWindow === null) {
                this.createWindow()
            }
        })
    }

    createWindow = () => {
        if (!this.hasWindow()) {
            this.mainWindow = new BrowserWindow({
                name: "main",
                windowStatePersistence: true,
                title: "Fluent Reader",
                backgroundColor:
                    process.platform === "darwin"
                        ? "#00000000"
                        : nativeTheme.shouldUseDarkColors
                        ? "#282828"
                        : "#faf9f8",
                vibrancy: "sidebar",
                width: 1200,
                height: 700,
                minWidth: 992,
                minHeight: 600,
                frame: process.platform === "darwin",
                titleBarStyle: "hiddenInset",
                fullscreenable: process.platform === "darwin",
                show: false,
                webPreferences: {
                    webviewTag: true,
                    contextIsolation: true,
                    spellcheck: false,
                    preload: path.join(
                        app.getAppPath(),
                        (app.isPackaged ? "dist/" : "") + "preload.js"
                    ),
                },
            })
            applyStoredAppIcon(this)
            this.mainWindow.on("ready-to-show", () => {
                this.mainWindow.show()
                this.mainWindow.focus()
                if (!app.isPackaged) this.mainWindow.webContents.openDevTools()
            })
            this.mainWindow.loadFile(
                (app.isPackaged ? "dist/" : "") + "index.html"
            )

            this.mainWindow.on("maximize", () => {
                this.mainWindow.webContents.send("maximized")
            })
            this.mainWindow.on("unmaximize", () => {
                this.mainWindow.webContents.send("unmaximized")
            })
            this.mainWindow.on("enter-full-screen", () => {
                this.mainWindow.webContents.send("enter-fullscreen")
            })
            this.mainWindow.on("leave-full-screen", () => {
                this.mainWindow.webContents.send("leave-fullscreen")
            })
            this.mainWindow.on("focus", () => {
                this.mainWindow.webContents.send("window-focus")
            })
            this.mainWindow.on("blur", () => {
                this.mainWindow.webContents.send("window-blur")
            })
            this.mainWindow.webContents.on("context-menu", (_, params) => {
                if (params.selectionText) {
                    this.mainWindow.webContents.send(
                        "window-context-menu",
                        [params.x, params.y],
                        params.selectionText
                    )
                }
            })
        }
    }

    zoom = () => {
        if (this.hasWindow()) {
            if (this.mainWindow.isMaximized()) {
                this.mainWindow.unmaximize()
            } else {
                this.mainWindow.maximize()
            }
        }
    }

    hasWindow = () => {
        return this.mainWindow !== null && !this.mainWindow.isDestroyed()
    }

    isAlwaysOnTop = () => {
        return this.hasWindow() && this.mainWindow.isAlwaysOnTop()
    }

    // The main process owns the "always on top" state: the renderer never keeps
    // its own copy, it re-reads this value and follows the pushed event.
    setAlwaysOnTop = (on: boolean) => {
        if (!this.hasWindow()) return false
        this.mainWindow.setAlwaysOnTop(on, "floating")
        const state = this.mainWindow.isAlwaysOnTop()
        if (!this.mainWindow.webContents.isDestroyed()) {
            this.mainWindow.webContents.send("always-on-top", state)
        }
        return state
    }

    toggleAlwaysOnTop = () => {
        return this.setAlwaysOnTop(!this.isAlwaysOnTop())
    }
}
