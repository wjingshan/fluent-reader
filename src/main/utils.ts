import { ipcMain, shell, dialog, app, session, clipboard } from "electron"
import { WindowManager } from "./window"
import * as fs from "node:fs"
import { spawn } from "node:child_process"
import { ImageCallbackTypes, StoredRules, TouchBarTexts } from "../schema-types"
import { initMainTouchBar } from "./touchbar"
import * as fontList from "font-list"

// Which source each article webview is showing, and the browser the user
// picked for that source. An article's guest hands its links to the main
// process, which cannot tell which source it belongs to, so the renderer
// registers it here. The choice is kept separately from the sid so a settings
// change applies to the article already on screen, not only to the next one.
const webviewSources = new Map<number, number>()
const sourceBrowserPrefs = new Map<number, string>()

export function rememberSourceBrowser(sid: number, browser: string) {
    if (!Number.isSafeInteger(sid)) return
    if (browser && browser !== "default") sourceBrowserPrefs.set(sid, browser)
    else sourceBrowserPrefs.delete(sid)
}

function sourceBrowserFor(sid?: number): string {
    if (sid == null) return "default"
    return sourceBrowserPrefs.get(sid) || "default"
}

const webviewInputFocused = `(() => {
    let element = document.activeElement
    while (element?.shadowRoot?.activeElement) {
        element = element.shadowRoot.activeElement
    }
    return !!element && (
        element.matches("input, textarea, select, iframe, frame") || element.isContentEditable
    )
})()`

export function setUtilsListeners(manager: WindowManager) {
    // A browser the app does not own gets started with the URL as its argument.
    // Probing is lazy and cached: the set does not change while the app runs.
    interface BrowserDef {
        id: string
        name: string
        win: string[]
        mac: string[]
    }
    const BROWSER_DEFS: BrowserDef[] = [
        {
            id: "edge",
            name: "Microsoft Edge",
            win: [
                "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe",
                "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe",
            ],
            mac: [
                "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            ],
        },
        {
            id: "chrome",
            name: "Google Chrome",
            win: [
                "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe",
                "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe",
                "%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe",
            ],
            mac: [
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            ],
        },
        {
            id: "firefox",
            name: "Mozilla Firefox",
            win: [
                "%ProgramFiles%\\Mozilla Firefox\\firefox.exe",
                "%ProgramFiles(x86)%\\Mozilla Firefox\\firefox.exe",
            ],
            mac: [
                "/Applications/Firefox.app/Contents/MacOS/firefox",
            ],
        },
    ]

    const expandEnv = (value: string) =>
        value.replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? "")

    let browserCache: Array<{ id: string; name: string; path: string }> | null =
        null

    function listBrowsers() {
        if (browserCache) return browserCache
        const found: Array<{ id: string; name: string; path: string }> = []
        for (const def of BROWSER_DEFS) {
            const candidates =
                process.platform === "darwin" ? def.mac : def.win
            const path = candidates
                .map(expandEnv)
                .find(candidate => candidate && fs.existsSync(candidate))
            if (path) found.push({ id: def.id, name: def.name, path })
        }
        browserCache = found
        return found
    }

    // Accepts a browser id from the list, or an absolute executable path so a
    // browser we do not probe can still be chosen by hand.
    function browserPath(idOrPath?: string): string | null {
        if (!idOrPath || idOrPath === "default") return null
        if (/[\\/]/.test(idOrPath))
            return fs.existsSync(idOrPath) ? idOrPath : null
        return listBrowsers().find(browser => browser.id === idOrPath)?.path ?? null
    }

    function launchBrowser(path: string, url: string) {
        try {
            const child = spawn(path, [url], { detached: true, stdio: "ignore" })
            child.on("error", () => {})
            child.unref()
            return true
        } catch (err) {
            return false
        }
    }

    // Which source an article's guest belongs to. The guest itself has no idea,
    // so the renderer registers it per webview.
    async function openExternal(
        url: string,
        background = false,
        browser?: string
    ) {
        const exe = browserPath(browser)
        if (exe && launchBrowser(exe, url)) return
        if (url.startsWith("https://") || url.startsWith("http://")) {
            if (background && process.platform === "darwin") {
                shell.openExternal(url, { activate: false })
            } else if (background && manager.hasWindow()) {
                // Raise the window above the browser for a moment, then put
                // the pin state back exactly as the user had it. These calls
                // bypass manager.setAlwaysOnTop so the toolbar state, which
                // follows the user's pin state, does not flicker.
                const win = manager.mainWindow
                const wasOnTop = win.isAlwaysOnTop()
                win.setAlwaysOnTop(true, "floating")
                await shell.openExternal(url)
                setTimeout(() => {
                    if (!wasOnTop && !win.isDestroyed()) {
                        win.setAlwaysOnTop(false, "floating")
                    }
                }, 1000)
            } else {
                shell.openExternal(url)
            }
        }
    }

    app.on("web-contents-created", (_, contents) => {
        contents.setWindowOpenHandler(details => {
            if (contents.getType() === "webview")
                openExternal(
                    details.url,
                    details.disposition === "background-tab",
                    sourceBrowserFor(webviewSources.get(contents.id))
                )
            return {
                action: manager.hasWindow() ? "deny" : "allow",
            }
        })
        contents.on("will-navigate", (event, url) => {
            event.preventDefault()
            if (contents.getType() === "webview")
                openExternal(
                    url,
                    false,
                    sourceBrowserFor(webviewSources.get(contents.id))
                )
        })
        contents.once("destroyed", () => {
            webviewSources.delete(contents.id)
        })
    })

    ipcMain.on("get-version", event => {
        event.returnValue = app.getVersion()
    })

    ipcMain.handle("get-browsers", () => listBrowsers())

    ipcMain.on("set-webview-source", (_, webContentsId: number, sid: number) => {
        if (!Number.isSafeInteger(webContentsId)) return
        if (Number.isSafeInteger(sid)) webviewSources.set(webContentsId, sid)
        else webviewSources.delete(webContentsId)
    })

    ipcMain.handle(
        "open-external",
        (_, url: string, background: boolean, browser?: string) => {
            openExternal(url, background, browser)
        }
    )

    ipcMain.handle(
        "show-error-box",
        async (_, title, content, copy?: string) => {
            if (manager.hasWindow() && copy != null) {
                const response = await dialog.showMessageBox(
                    manager.mainWindow,
                    {
                        type: "error",
                        title: title,
                        message: title,
                        detail: content,
                        buttons: ["OK", copy],
                        cancelId: 0,
                        defaultId: 0,
                    }
                )
                if (response.response === 1) {
                    clipboard.writeText(`${title}: ${content}`)
                }
            } else {
                dialog.showErrorBox(title, content)
            }
        }
    )

    ipcMain.handle(
        "show-message-box",
        async (_, title, message, confirm, cancel, defaultCancel, type) => {
            if (manager.hasWindow()) {
                let response = await dialog.showMessageBox(manager.mainWindow, {
                    type: type,
                    title: title,
                    message: title,
                    detail: message,
                    buttons:
                        process.platform === "win32"
                            ? ["Yes", "No"]
                            : [confirm, cancel],
                    cancelId: 1,
                    defaultId: defaultCancel ? 1 : 0,
                })
                return response.response === 0
            } else {
                return false
            }
        }
    )

    ipcMain.handle(
        "show-save-dialog",
        async (_, filters: Electron.FileFilter[], path: string) => {
            ipcMain.removeAllListeners("write-save-result")
            if (manager.hasWindow()) {
                let response = await dialog.showSaveDialog(manager.mainWindow, {
                    defaultPath: path,
                    filters: filters,
                })
                if (!response.canceled) {
                    ipcMain.handleOnce(
                        "write-save-result",
                        (_, result, errmsg) => {
                            fs.writeFile(response.filePath, result, err => {
                                if (err)
                                    dialog.showErrorBox(errmsg, String(err))
                            })
                        }
                    )
                    return true
                }
            }
            return false
        }
    )

    ipcMain.handle(
        "show-open-dialog",
        async (_, filters: Electron.FileFilter[]) => {
            if (manager.hasWindow()) {
                let response = await dialog.showOpenDialog(manager.mainWindow, {
                    filters: filters,
                    properties: ["openFile"],
                })
                if (!response.canceled) {
                    try {
                        return await fs.promises.readFile(
                            response.filePaths[0],
                            "utf-8"
                        )
                    } catch (err) {
                        console.log(err)
                    }
                }
            }
            return null
        }
    )

    ipcMain.handle("get-cache", async () => {
        return await session.defaultSession.getCacheSize()
    })

    ipcMain.handle("clear-cache", async () => {
        await session.defaultSession.clearCache()
    })

    app.on("web-contents-created", (_, contents) => {
        if (contents.getType() === "webview") {
            contents.on(
                "did-fail-load",
                (event, code, desc, validated, isMainFrame) => {
                    if (isMainFrame && manager.hasWindow()) {
                        manager.mainWindow.webContents.send(
                            "webview-error",
                            desc
                        )
                    }
                }
            )
            contents.on("context-menu", (_, params) => {
                if (
                    (params.hasImageContents ||
                        params.selectionText ||
                        params.linkURL) &&
                    manager.hasWindow()
                ) {
                    if (params.hasImageContents) {
                        ipcMain.removeHandler("image-callback")
                        ipcMain.handleOnce(
                            "image-callback",
                            (_, type: ImageCallbackTypes) => {
                                switch (type) {
                                    case ImageCallbackTypes.OpenExternal:
                                    case ImageCallbackTypes.OpenExternalBg:
                                        openExternal(
                                            params.srcURL,
                                            type ===
                                                ImageCallbackTypes.OpenExternalBg
                                        )
                                        break
                                    case ImageCallbackTypes.SaveAs:
                                        contents.session.downloadURL(
                                            params.srcURL
                                        )
                                        break
                                    case ImageCallbackTypes.Copy:
                                        contents.copyImageAt(params.x, params.y)
                                        break
                                    case ImageCallbackTypes.CopyLink:
                                        clipboard.writeText(params.srcURL)
                                        break
                                }
                            }
                        )
                        manager.mainWindow.webContents.send(
                            "webview-context-menu",
                            [params.x, params.y]
                        )
                    } else {
                        manager.mainWindow.webContents.send(
                            "webview-context-menu",
                            [params.x, params.y],
                            params.selectionText,
                            params.linkURL
                        )
                    }
                    contents
                        .executeJavaScript(
                            `new Promise(resolve => {
                        const dismiss = () => {
                            document.removeEventListener("mousedown", dismiss)
                            document.removeEventListener("scroll", dismiss)                            
                            resolve()
                        }
                        document.addEventListener("mousedown", dismiss)
                        document.addEventListener("scroll", dismiss)
                    })`
                        )
                        .then(() => {
                            if (manager.hasWindow()) {
                                manager.mainWindow.webContents.send(
                                    "webview-context-menu"
                                )
                            }
                        })
                }
            })
            contents.on("before-input-event", async (_, input) => {
                if (input.type !== "keyDown" || !manager.hasWindow()) return
                const mainWindow = manager.mainWindow
                const url = contents.getURL()
                if (url.startsWith("https://") || url.startsWith("http://")) {
                    // Inspect the guest's focused frame, including iframe editors.
                    // Leave the original key event alone so typing works normally.
                    // Electron can report no focused frame for a focused webview.
                    // An iframe host in the fallback document keeps its own keys.
                    const frame = contents.focusedFrame || contents.mainFrame
                    try {
                        const inputFocused = await frame.executeJavaScript(
                            webviewInputFocused
                        )
                        if (
                            inputFocused ||
                            contents.isDestroyed() ||
                            frame.isDestroyed() ||
                            contents.getURL() !== url
                        )
                            return
                    } catch {
                        // The frame may disappear while navigating or closing.
                        return
                    }
                }
                if (manager.hasWindow() && manager.mainWindow === mainWindow) {
                    mainWindow.webContents.send("webview-keydown", input)
                }
            })
        }
    })

    ipcMain.handle("write-clipboard", (_, text) => {
        clipboard.writeText(text)
    })

    ipcMain.handle("close-window", () => {
        if (manager.hasWindow()) manager.mainWindow.close()
    })

    ipcMain.handle("minimize-window", () => {
        if (manager.hasWindow()) manager.mainWindow.minimize()
    })

    ipcMain.handle("maximize-window", () => {
        manager.zoom()
    })

    ipcMain.handle("toggle-always-on-top", () => {
        return manager.toggleAlwaysOnTop()
    })

    ipcMain.on("is-always-on-top", event => {
        event.returnValue = manager.isAlwaysOnTop()
    })

    ipcMain.on("is-maximized", event => {
        event.returnValue =
            Boolean(manager.mainWindow) && manager.mainWindow.isMaximized()
    })

    ipcMain.on("is-focused", event => {
        event.returnValue =
            manager.hasWindow() && manager.mainWindow.isFocused()
    })

    ipcMain.on("is-fullscreen", event => {
        event.returnValue =
            manager.hasWindow() && manager.mainWindow.isFullScreen()
    })

    ipcMain.handle("request-focus", () => {
        if (manager.hasWindow()) {
            const win = manager.mainWindow
            if (win.isMinimized()) win.restore()
            if (process.platform === "win32") {
                // Bump the window to the top, then restore the pin state.
                const wasOnTop = win.isAlwaysOnTop()
                win.setAlwaysOnTop(true, "floating")
                win.setAlwaysOnTop(wasOnTop, "floating")
            }
            win.focus()
        }
    })

    ipcMain.handle("request-attention", () => {
        if (manager.hasWindow() && !manager.mainWindow.isFocused()) {
            if (process.platform === "win32") {
                manager.mainWindow.flashFrame(true)
                manager.mainWindow.once("focus", () => {
                    manager.mainWindow.flashFrame(false)
                })
            } else if (process.platform === "darwin") {
                app.dock.bounce()
            }
        }
    })

    ipcMain.handle("touchbar-init", (_, texts: TouchBarTexts) => {
        if (manager.hasWindow()) initMainTouchBar(texts, manager.mainWindow)
    })
    ipcMain.handle("touchbar-destroy", () => {
        if (manager.hasWindow()) manager.mainWindow.setTouchBar(null)
    })

    ipcMain.handle("init-font-list", () => {
        return fontList.getFonts({
            disableQuoting: true,
        })
    })
}

export function transformLovefieldRules(
    sources: Record<string, unknown>[]
): StoredRules {
    const storedRules: StoredRules = {}
    for (const source of sources) {
        const rules = source.rules as Record<string, unknown>[] | undefined
        if (!Array.isArray(rules) || rules.length === 0) continue
        storedRules[`source:${source.sid as number}`] = rules.map(rule => {
            const filter = rule.filter as Record<string, unknown>
            const actions = rule.actions as Record<string, boolean>
            return {
                filter: (filter?.type as number) ?? 0,
                search: (filter?.search as string) ?? "",
                match: rule.match as boolean,
                actions: Object.entries(actions || {}).map(
                    ([type, flag]) => `${type}-${flag}`
                ),
            }
        })
    }
    return storedRules
}
