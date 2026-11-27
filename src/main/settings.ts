import Store from "electron-store"
import {
    SchemaTypes,
    SourceGroup,
    ViewType,
    ThemeSettings,
    AppIcon,
    SearchEngines,
    SyncService,
    ServiceConfigs,
    ViewConfigs,
    RuleTarget,
    StoredRule,
    getRuleTargetKey,
    ARTICLE_OVERLAY_MIN_WIDTH,
    LIST_VIEW_MIN_WIDTH,
    LayoutConfig,
    DEFAULT_LAYOUT_CONFIG,
    normalizeLayoutConfig,
} from "../schema-types"
import { ipcMain, session, nativeTheme, app, nativeImage, shell } from "electron"
import * as path from "node:path"
import * as fs from "node:fs"
import { spawn } from "node:child_process"
import { WindowManager } from "./window"
import { rememberSourceBrowser, transformLovefieldRules } from "./utils"
export const store = new Store<SchemaTypes>({ cache: true })

const GROUPS_STORE_KEY = "sourceGroups"
function nextGroupId(): number {
    const ids = store.get(GROUPS_STORE_KEY, []).map(group => group.gid)
    for (const key of Object.keys(store.get("sourceRules", {}))) {
        if (key.startsWith("group:")) ids.push(Number(key.slice(6)))
    }
    return Math.max(
        store.get("nextGroupId", 0),
        ...ids
            .filter(id => Number.isSafeInteger(id) && id >= 0)
            .map(id => id + 1)
    )
}

function allocateGroupId(): number {
    const gid = nextGroupId()
    store.set("nextGroupId", gid + 1)
    return gid
}

ipcMain.on("allocate-group-id", event => {
    event.returnValue = allocateGroupId()
})
ipcMain.handle("set-groups", (_, groups: SourceGroup[]) => {
    store.set(GROUPS_STORE_KEY, groups)
})
ipcMain.on("get-groups", event => {
    const nextId = nextGroupId()
    if (store.get("nextGroupId", 0) < nextId) store.set("nextGroupId", nextId)
    const groups = store.get(GROUPS_STORE_KEY, []).map(group => ({ ...group }))
    const ids = new Set<number>()
    let changed = false
    for (const group of groups) {
        if (
            !Number.isSafeInteger(group.gid) ||
            group.gid < 0 ||
            ids.has(group.gid)
        ) {
            group.gid = allocateGroupId()
            changed = true
        }
        // Older renderers persisted the transient display index on some groups.
        if ("index" in group) {
            delete group.index
            changed = true
        }
        ids.add(group.gid)
    }
    if (changed) store.set(GROUPS_STORE_KEY, groups)
    event.returnValue = groups
})

const MENU_STORE_KEY = "menuOn"
ipcMain.on("get-menu", event => {
    event.returnValue = store.get(MENU_STORE_KEY, false)
})
ipcMain.handle("set-menu", (_, state: boolean) => {
    store.set(MENU_STORE_KEY, state)
})

const PAC_STORE_KEY = "pac"
const PAC_STATUS_KEY = "pacOn"
function getProxyStatus() {
    return store.get(PAC_STATUS_KEY, false)
}
function toggleProxyStatus() {
    store.set(PAC_STATUS_KEY, !getProxyStatus())
    setProxy()
}
function getProxy() {
    return store.get(PAC_STORE_KEY, "")
}
function setProxy(address = null) {
    if (!address) {
        address = getProxy()
    } else {
        store.set(PAC_STORE_KEY, address)
    }
    if (getProxyStatus()) {
        let rules = { pacScript: address }
        session.defaultSession.setProxy(rules)
        session.fromPartition("sandbox").setProxy(rules)
    }
}
ipcMain.on("get-proxy-status", event => {
    event.returnValue = getProxyStatus()
})
ipcMain.on("toggle-proxy-status", () => {
    toggleProxyStatus()
})
ipcMain.on("get-proxy", event => {
    event.returnValue = getProxy()
})
ipcMain.handle("set-proxy", (_, address = null) => {
    setProxy(address)
})

const VIEW_STORE_KEY = "view"
ipcMain.on("get-view", event => {
    event.returnValue = store.get(VIEW_STORE_KEY, ViewType.Cards)
})
ipcMain.handle("set-view", (_, viewType: ViewType) => {
    store.set(VIEW_STORE_KEY, viewType)
})

// A view per sidebar entry, so one group can be a waterfall while another stays
// a card grid. Missing entries deliberately return undefined: the caller then
// uses the global `view` instead of freezing everyone onto one layout.
const GROUP_VIEWS_STORE_KEY = "groupViews"
ipcMain.on("get-group-view", (event, key: string) => {
    if (!key) {
        event.returnValue = undefined
        return
    }
    const views = store.get(GROUP_VIEWS_STORE_KEY, {})
    event.returnValue = views[key]
})
ipcMain.handle("set-group-view", (_, key: string, viewType: ViewType) => {
    if (!key) return
    const views = { ...store.get(GROUP_VIEWS_STORE_KEY, {}) }
    views[key] = viewType
    store.set(GROUP_VIEWS_STORE_KEY, views)
})
ipcMain.on("get-group-views", event => {
    event.returnValue = store.get(GROUP_VIEWS_STORE_KEY, {})
})
ipcMain.handle("clear-group-view", (_, key: string) => {
    if (!key) return
    const views = { ...store.get(GROUP_VIEWS_STORE_KEY, {}) }
    delete views[key]
    store.set(GROUP_VIEWS_STORE_KEY, views)
})

const THEME_STORE_KEY = "theme"
ipcMain.on("get-theme", event => {
    event.returnValue = store.get(THEME_STORE_KEY, ThemeSettings.Default)
})
ipcMain.handle("set-theme", (_, theme: ThemeSettings) => {
    store.set(THEME_STORE_KEY, theme)
    nativeTheme.themeSource = theme
})
ipcMain.on("get-theme-dark-color", event => {
    event.returnValue = nativeTheme.shouldUseDarkColors
})
export function setThemeListener(manager: WindowManager) {
    nativeTheme.removeAllListeners()
    nativeTheme.on("updated", () => {
        if (manager.hasWindow()) {
            let contents = manager.mainWindow.webContents
            if (!contents.isDestroyed()) {
                contents.send("theme-updated", nativeTheme.shouldUseDarkColors)
            }
        }
    })
}

// Windows/Linux 的任务栏图标来自 exe 内置图标，只有设到窗口上才能换掉；
// mac 走 dock。两版图标都是 dist/icons 下的 png（随包一起分发）。
const APP_ICON_STORE_KEY = "appIcon"
const APP_ICON_FILES: Record<AppIcon, string> = {
    [AppIcon.Default]: "app-icon.png",
    [AppIcon.Orange]: "app-icon-orange.png",
}
const APP_ICON_ICO_FILES: Record<AppIcon, string> = {
    [AppIcon.Default]: "app-icon.ico",
    [AppIcon.Orange]: "app-icon-orange.ico",
}
let iconManager: WindowManager = null

export function getAppIconSettings(): AppIcon {
    const stored = store.get(APP_ICON_STORE_KEY, AppIcon.Default)
    return APP_ICON_FILES[stored] ? stored : AppIcon.Default
}

export function applyAppIcon(manager: WindowManager, icon: AppIcon) {
    if (!manager || !manager.hasWindow()) return
    const file = APP_ICON_FILES[icon] ?? APP_ICON_FILES[AppIcon.Default]
    const image = nativeImage.createFromPath(
        path.join(app.getAppPath(), "dist", "icons", file)
    )
    if (image.isEmpty()) return
    if (process.platform === "darwin") {
        app.dock?.setIcon(image)
    } else {
        manager.mainWindow.setIcon(image)
    }
}

// Windows 的任务栏按钮（尤其是固定到任务栏的那种）取的是快捷方式里的图标，
// 光给窗口 setIcon 是换不掉的，所以还要同步改写固定项。
function pinnedTaskBarFolder() {
    return path.join(
        app.getPath("appData"),
        "Microsoft",
        "Internet Explorer",
        "Quick Launch",
        "User Pinned",
        "TaskBar"
    )
}

// ico 不能放在 asar 里给资源管理器读，先复制一份到用户数据目录。
// 旧版本生成的 ico 只有 PNG 段，资源管理器读不出来会退回 exe 图标，这里按大小比对覆盖。
function ensureIcoFile(icon: AppIcon): { file: string; replaced: boolean } {
    const name = APP_ICON_ICO_FILES[icon]
    const dir = path.join(app.getPath("userData"), "icons")
    const dest = path.join(dir, name)
    const src = path.join(app.getAppPath(), "dist", "icons", name)
    let replaced = false
    try {
        const srcStat = fs.statSync(src)
        const stale =
            !fs.existsSync(dest) || fs.statSync(dest).size !== srcStat.size
        if (stale) {
            fs.mkdirSync(dir, { recursive: true })
            fs.copyFileSync(src, dest)
            replaced = true
        }
    } catch {}
    return { file: dest, replaced }
}

// 改完快捷方式资源管理器不会自己重画任务栏按钮：只发 UPDATEITEM 或只发
// ASSOCCHANGED 都不生效，必须两个一起发（实测）。用无窗口的 powershell 发一次。
function refreshShellIcons(lnks: string[]) {
    if (process.platform !== "win32" || lnks.length === 0) return
    const list = lnks.map(p => `'${p.replace(/'/g, "''")}'`).join(",")
    const script = [
        "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;" +
            'public class FrIconNotify{[DllImport("shell32.dll",CharSet=CharSet.Unicode)]' +
            "public static extern void SHChangeNotify(int e,uint f,IntPtr a,IntPtr b);}'",
        `foreach ($p in @(${list})) { $ptr = [System.Runtime.InteropServices.Marshal]::StringToHGlobalUni($p); ` +
            "[FrIconNotify]::SHChangeNotify(0x2000, 0x5, $ptr, [IntPtr]::Zero); " +
            "[System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr) }",
        "[FrIconNotify]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)",
    ].join("; ")
    try {
        const child = spawn(
            "powershell.exe",
            [
                "-NoProfile",
                "-NonInteractive",
                "-WindowStyle",
                "Hidden",
                "-EncodedCommand",
                Buffer.from(script, "utf16le").toString("base64"),
            ],
            { detached: true, stdio: "ignore", windowsHide: true }
        )
        child.unref()
    } catch {}
}

function samePath(a: string, b: string) {
    return !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
}

// 只动指向本程序 exe 的固定项，用户自己改过图标的也不覆盖。
function syncPinnedAppIcon(icon: AppIcon, explicit: boolean) {
    if (process.platform !== "win32") return
    const changed: string[] = []
    try {
        const folder = pinnedTaskBarFolder()
        if (!fs.existsSync(folder)) return
        const orangeIco = path.join(app.getPath("userData"), "icons", APP_ICON_ICO_FILES[AppIcon.Orange])
        for (const name of fs.readdirSync(folder)) {
            if (!name.toLowerCase().endsWith(".lnk")) continue
            const lnk = path.join(folder, name)
            let link: Electron.ShortcutDetails = null
            try {
                link = shell.readShortcutLink(lnk)
            } catch {
                continue
            }
            if (!samePath(link.target, process.execPath)) continue
            const managed = samePath(link.icon, orangeIco) || samePath(link.icon, process.execPath) || !link.icon
            if (!explicit && !managed) continue
            let want: { icon: string; iconIndex: number }
            if (icon === AppIcon.Orange) {
                const prepared = ensureIcoFile(AppIcon.Orange)
                want = { icon: prepared.file, iconIndex: 0 }
                // ico 文件本身刚被换成新格式时，快捷方式里的路径没变也要让资源管理器重读
                if (prepared.replaced) changed.push(lnk)
            } else {
                want = { icon: process.execPath, iconIndex: 0 }
            }
            if (samePath(link.icon, want.icon) && link.iconIndex === want.iconIndex) continue
            try {
                const details: Electron.ShortcutDetails = {
                    target: link.target,
                    cwd: link.cwd,
                    args: link.args,
                    description: link.description,
                    icon: want.icon,
                    iconIndex: want.iconIndex,
                }
                if (link.appUserModelId) details.appUserModelId = link.appUserModelId
                shell.writeShortcutLink(lnk, "update", details)
                changed.push(lnk)
            } catch {}
        }
    } catch {}
    refreshShellIcons(changed)
}

// 建窗时按已存设置套一次，否则默认永远是 exe 里那版。
export function applyStoredAppIcon(manager: WindowManager) {
    const icon = getAppIconSettings()
    applyAppIcon(manager, icon)
    syncPinnedAppIcon(icon, false)
}

ipcMain.on("get-app-icon", event => {
    event.returnValue = getAppIconSettings()
})
ipcMain.handle("set-app-icon", (_, icon: AppIcon) => {
    const value = APP_ICON_FILES[icon] ? icon : AppIcon.Default
    store.set(APP_ICON_STORE_KEY, value)
    applyAppIcon(iconManager, value)
    syncPinnedAppIcon(value, true)
})
export function setAppIconListener(manager: WindowManager) {
    iconManager = manager
}

const LOCALE_STORE_KEY = "locale"
ipcMain.handle("set-locale", (_, option: string) => {
    store.set(LOCALE_STORE_KEY, option)
})
function getLocaleSettings() {
    return store.get(LOCALE_STORE_KEY, "default")
}
ipcMain.on("get-locale-settings", event => {
    event.returnValue = getLocaleSettings()
})
ipcMain.on("get-locale", event => {
    let setting = getLocaleSettings()
    let locale = setting === "default" ? app.getLocale() : setting
    event.returnValue = locale
})

const FONT_SIZE_STORE_KEY = "fontSize"
ipcMain.on("get-font-size", event => {
    event.returnValue = store.get(FONT_SIZE_STORE_KEY, 16)
})
ipcMain.handle("set-font-size", (_, size: number) => {
    store.set(FONT_SIZE_STORE_KEY, size)
})

const FONT_STORE_KEY = "fontFamily"
ipcMain.on("get-font", event => {
    event.returnValue = store.get(FONT_STORE_KEY, "")
})
ipcMain.handle("set-font", (_, font: string) => {
    store.set(FONT_STORE_KEY, font)
})

for (const [key, channel, minimum] of [
    ["articleOverlayWidth", "article-overlay-width", ARTICLE_OVERLAY_MIN_WIDTH],
    ["listViewWidth", "list-view-width", LIST_VIEW_MIN_WIDTH],
] as const) {
    ipcMain.on(`get-${channel}`, event => {
        const width = store.get(key, minimum)
        event.returnValue = Number.isFinite(width)
            ? Math.max(minimum, Math.round(width))
            : minimum
    })
    ipcMain.handle(`set-${channel}`, (_, width: number) => {
        if (Number.isFinite(width) && width >= minimum) {
            store.set(key, Math.round(width))
        }
    })
}

const FETCH_INTEVAL_STORE_KEY = "fetchInterval"
ipcMain.on("get-fetch-interval", event => {
    event.returnValue = store.get(FETCH_INTEVAL_STORE_KEY, 0)
})
ipcMain.handle("set-fetch-interval", (_, interval: number) => {
    store.set(FETCH_INTEVAL_STORE_KEY, interval)
})

const SEARCH_ENGINE_STORE_KEY = "searchEngine"
ipcMain.on("get-search-engine", event => {
    event.returnValue = store.get(SEARCH_ENGINE_STORE_KEY, SearchEngines.Google)
})
ipcMain.handle("set-search-engine", (_, engine: SearchEngines) => {
    store.set(SEARCH_ENGINE_STORE_KEY, engine)
})

const SERVICE_CONFIGS_STORE_KEY = "serviceConfigs"
ipcMain.on("get-service-configs", event => {
    event.returnValue = store.get(SERVICE_CONFIGS_STORE_KEY, {
        type: SyncService.None,
    })
})
ipcMain.handle("set-service-configs", (_, configs: ServiceConfigs) => {
    store.set(SERVICE_CONFIGS_STORE_KEY, configs)
})

const FILTER_TYPE_STORE_KEY = "filterType"
ipcMain.on("get-filter-type", event => {
    event.returnValue = store.get(FILTER_TYPE_STORE_KEY, null)
})
ipcMain.handle("set-filter-type", (_, filterType: number) => {
    store.set(FILTER_TYPE_STORE_KEY, filterType)
})

const LIST_CONFIGS_STORE_KEY = "listViewConfigs"
ipcMain.on("get-view-configs", (event, view: ViewType) => {
    switch (view) {
        case ViewType.List:
            event.returnValue = store.get(
                LIST_CONFIGS_STORE_KEY,
                ViewConfigs.ShowCover
            )
            break
        default:
            event.returnValue = undefined
            break
    }
})
ipcMain.handle(
    "set-view-configs",
    (_, view: ViewType, configs: ViewConfigs) => {
        switch (view) {
            case ViewType.List:
                store.set(LIST_CONFIGS_STORE_KEY, configs)
                break
        }
    }
)

const SOURCE_RULES_STORE_KEY = "sourceRules"

ipcMain.on("get-all-rules", event => {
    event.returnValue = store.get(SOURCE_RULES_STORE_KEY, {})
})
ipcMain.handle(
    "set-rules-for-target",
    (_, target: RuleTarget, rules: StoredRule[]) => {
        const key = getRuleTargetKey(target)
        // Keep the read and write together in main so independent targets cannot
        // overwrite each other using stale renderer snapshots.
        const allRules = { ...store.get(SOURCE_RULES_STORE_KEY, {}) }
        if (rules.length > 0) allRules[key] = rules
        else delete allRules[key]
        store.set(SOURCE_RULES_STORE_KEY, allRules)
    }
)
ipcMain.handle(
    "migrate-lovefield-rules",
    (_, sources: Record<string, unknown>[]) => {
        store.set(SOURCE_RULES_STORE_KEY, transformLovefieldRules(sources))
    }
)

const DB_VERSION_STORE_KEY = "dbVersion"
ipcMain.on("get-db-version", event => {
    event.returnValue = store.get(
        DB_VERSION_STORE_KEY as keyof SchemaTypes,
        null
    )
})
ipcMain.handle("set-db-version", (_, version: string) => {
    store.set(DB_VERSION_STORE_KEY as keyof SchemaTypes, version)
})

const UNREAD_SOURCES_ONLY_STORE_KEY = "menuUnreadSourcesOnly"
ipcMain.on("get-unread-sources-only", event => {
    event.returnValue = store.get(UNREAD_SOURCES_ONLY_STORE_KEY, false)
})
ipcMain.handle("set-unread-sources-only", (_, flag: boolean) => {
    store.set(UNREAD_SOURCES_ONLY_STORE_KEY, flag)
})

const DUPLICATE_FILTER_STORE_KEY = "duplicateFilter"
ipcMain.on("get-duplicate-filter", event => {
    event.returnValue = store.get(DUPLICATE_FILTER_STORE_KEY, 0)
})
ipcMain.handle("set-duplicate-filter", (_, mode: number) => {
    store.set(DUPLICATE_FILTER_STORE_KEY, Number(mode) === 1 ? 1 : 0)
})

// Card-list display metrics. A record saved by an older build (or edited by
// hand) may miss fields or carry out-of-range values, so it is normalized on
// both reads and writes: the renderer always receives a complete config.
const LAYOUT_CONFIG_STORE_KEY = "layoutConfig"
ipcMain.on("get-layout-config", event => {
    event.returnValue = normalizeLayoutConfig(
        store.get(LAYOUT_CONFIG_STORE_KEY, DEFAULT_LAYOUT_CONFIG)
    )
})
ipcMain.handle("set-layout-config", (_, config: LayoutConfig) => {
    store.set(LAYOUT_CONFIG_STORE_KEY, normalizeLayoutConfig(config))
})

// Which external browser opens a source's links. Keyed by sid so it lives
// outside the feed database and needs no migration; "default" (or a missing
// key) means the system browser.
const SOURCE_BROWSERS_STORE_KEY = "sourceBrowsers"
ipcMain.on("get-source-browsers", event => {
    const browsers = store.get(SOURCE_BROWSERS_STORE_KEY, {})
    // Keep the main process copy warm: an article webview resolves its browser
    // through this map when a link is opened, without asking the renderer.
    for (const [sid, browser] of Object.entries(browsers))
        rememberSourceBrowser(Number(sid), browser)
    event.returnValue = browsers
})
ipcMain.handle("set-source-browser", (_, sid: number, browser: string) => {
    const current = store.get(SOURCE_BROWSERS_STORE_KEY, {})
    const next: Record<string, string> = { ...current }
    const key = String(sid)
    if (browser && browser !== "default") next[key] = browser
    else delete next[key]
    store.set(SOURCE_BROWSERS_STORE_KEY, next)
    rememberSourceBrowser(sid, browser)
})
