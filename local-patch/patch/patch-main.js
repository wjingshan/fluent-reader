// patch-main.js — main-process shim.
// Loaded instead of ./electron.js via package.json "main".
// It does two things and then hands over to the untouched original entry point:
//   1) point userData somewhere else (so a patched copy cannot fight the
//      installed build over the single-instance lock / database)
//   2) give <video> requests the Referer header that hotlink-protected CDNs
//      require (reactor.cc and friends 404 without it)
const path = require("path")
const fs = require("fs")
const http = require("http")
const crypto = require("crypto")
const { app, session } = require("electron")

// Evidence channel: everything this shim observes lands in a file we can read,
// because a packaged Electron app prints nothing when it dies early.
// Defaults to the app's own userData dir; override with FR_LOG.
const LOG_PATH =
    process.env.FR_LOG || path.join(app.getPath("userData"), "media-patch.log")
function trace(...args) {
    if (!LOG_PATH) return
    const line = `${new Date().toISOString()} ${args.join(" ")}\n`
    try {
        try {
            const st = fs.statSync(LOG_PATH)
            if (st.size > 256 * 1024) fs.writeFileSync(LOG_PATH, "")
        } catch (e) {
            /* first run */
        }
        fs.appendFileSync(LOG_PATH, line)
    } catch (e) {
        /* nothing else we can do */
    }
}
trace(
    "=== patch-main start, pid",
    process.pid,
    "argv:",
    process.argv.slice(1).join(" ")
)
process.on("uncaughtException", err => {
    trace("UNCAUGHT", err && err.stack ? err.stack : String(err))
})

// 1) isolated profile (only when the launcher asks for it)
if (process.env.FR_USERDATA) {
    try {
        app.setPath("userData", process.env.FR_USERDATA)
        trace("userData ->", app.getPath("userData"))
    } catch (e) {
        trace("setPath failed", e && e.message)
        console.error("[fr-media-patch] setPath failed", e)
    }
}

const MULTI_LABEL = new Set([
    "co.uk",
    "org.uk",
    "ac.uk",
    "com.cn",
    "net.cn",
    "org.cn",
    "com.au",
    "net.au",
    "co.jp",
    "ne.jp",
    "com.br",
    "com.tw",
    "com.hk",
    "co.kr",
    "co.in",
    "com.ru",
])

function registrableDomain(host) {
    const parts = String(host || "").split(".")
    if (parts.length <= 2) return parts.join(".")
    const last2 = parts.slice(-2).join(".")
    if (MULTI_LABEL.has(last2)) return parts.slice(-3).join(".")
    return last2
}

const VIDEO_URL = /\.(webm|mp4|m4v|ogv|mov)(\?|#|$)/i

// Requests that need a Referer to get past a hotlink check.
//
// `image` is here because the page is loaded from file://, and Chromium sends
// no Referer for a file:// origin — so every thumbnail from reactor.cc's CDN
// came back 403 (the videos were covered by `media`, the pictures were not).
// A page served over http(s) would have sent the same-origin Referer we now
// add, so this restores normal browser behaviour rather than inventing it.
function injectReferer(details, callback) {
    const { requestHeaders, url, resourceType } = details
    const needsReferer =
        resourceType === "media" ||
        resourceType === "image" ||
        VIDEO_URL.test(url || "")
    if (needsReferer) {
        const has =
            requestHeaders.Referer ||
            requestHeaders.referer ||
            requestHeaders.REFERER
        if (!has) {
            try {
                const host = new URL(url).hostname
                requestHeaders.Referer = `https://${registrableDomain(host)}/`
            } catch (e) {
                // non-http schemes: leave untouched
            }
        }
    }
    callback({ requestHeaders })
}

function installWebRequest(ses) {
    if (!ses || ses.__frRefererPatch) return
    try {
        ses.__frRefererPatch = true
        ses.webRequest.onBeforeSendHeaders(
            { urls: ["<all_urls>"] },
            injectReferer
        )
        console.log("[fr-media-patch] referer injector installed")
    } catch (e) {
        console.error("[fr-media-patch] install failed", e)
    }
}

app.on("session-created", installWebRequest)

// ------------------------------------------------------- Eagle import bridge
//
// The renderer cannot call Eagle's API directly: Eagle serves it without CORS
// headers, so a fetch() from the page would be blocked. We therefore run a
// tiny loopback HTTP endpoint in the main process and let the renderer talk to
// that instead. The endpoint only listens on 127.0.0.1 and requires a random
// per-run token, so no other program on the machine can drive it.

const EAGLE_API = "http://127.0.0.1:41595"
let eagleBridge = null

function refererFor(url) {
    try {
        const host = new URL(url).hostname
        return `https://${registrableDomain(host)}/`
    } catch (e) {
        return ""
    }
}

function eagleImport(payload) {
    return new Promise(resolve => {
        const body = JSON.stringify({
            url: payload.url,
            name: payload.name || "untitled",
            website: payload.website || "",
            tags: ["Fluent Reader"],
            headers: { referer: refererFor(payload.url) },
        })
        const req = http.request(
            `${EAGLE_API}/api/item/addFromURL`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(body),
                },
            },
            res => {
                let out = ""
                res.on("data", c => (out += c))
                res.on("end", () => {
                    trace("eagle api ->", res.statusCode, out.slice(0, 200))
                    let parsed = null
                    try {
                        parsed = JSON.parse(out)
                    } catch (e) {
                        /* keep null */
                    }
                    resolve({
                        ok: Boolean(parsed && parsed.status === "success"),
                        status: res.statusCode,
                        detail: parsed ? parsed.status : out.slice(0, 200),
                    })
                })
            }
        )
        req.on("error", err => {
            trace("eagle api error:", err.message)
            resolve({ ok: false, error: err.message })
        })
        req.write(body)
        req.end()
    })
}

function eagleItemCount() {
    return new Promise(resolve => {
        const req = http.request(
            `${EAGLE_API}/api/item/list?limit=400&orderBy=-CREATEDATE`,
            { method: "GET" },
            res => {
                let out = ""
                res.on("data", c => (out += c))
                res.on("end", () => {
                    try {
                        const parsed = JSON.parse(out)
                        resolve(
                            Array.isArray(parsed.data) ? parsed.data.length : -1
                        )
                    } catch (e) {
                        resolve(-1)
                    }
                })
            }
        )
        req.on("error", () => resolve(-1))
        req.end()
    })
}

function startEagleBridge() {
    if (eagleBridge) return
    const token = crypto.randomBytes(16).toString("hex")
    // The page is loaded from file://, so its origin is "null" and every call to
    // this loopback endpoint is cross-origin. The request carries a custom
    // X-Fr-Token header and a JSON content type, which makes it non-simple, so
    // the browser sends an OPTIONS preflight first. Without an answer to that
    // preflight fetch() rejects with "Failed to fetch" before ever POSTing.
    const CORS = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Fr-Token",
        "Access-Control-Max-Age": "600",
    }
    const server = http.createServer((req, res) => {
        if (req.method === "OPTIONS") {
            res.writeHead(204, CORS)
            res.end()
            return
        }
        const reply = payload => {
            res.writeHead(200, {
                "Content-Type": "application/json",
                ...CORS,
            })
            res.end(JSON.stringify(payload))
        }
        if (req.method !== "POST" || req.url !== "/eagle/import") {
            res.writeHead(404, CORS)
            res.end("{}")
            return
        }
        if (req.headers["x-fr-token"] !== token) {
            trace("eagle bridge: bad token")
            res.writeHead(403, CORS)
            res.end("{}")
            return
        }
        let raw = ""
        req.on("data", chunk => {
            raw += chunk
            if (raw.length > 1e6) req.destroy()
        })
        req.on("end", () => {
            let payload = {}
            try {
                payload = JSON.parse(raw || "{}")
            } catch (e) {
                /* keep empty */
            }
            if (!payload.url || !/^https?:\/\//i.test(payload.url)) {
                reply({ ok: false, error: "bad url" })
                return
            }
            eagleImport(payload).then(reply)
        })
    })
    server.on("error", err => trace("eagle bridge error:", err.message))
    server.listen(0, "127.0.0.1", () => {
        eagleBridge = { port: server.address().port, token }
        trace("eagle bridge listening on 127.0.0.1:" + eagleBridge.port)
        for (const contents of knownContents) injectBridge(contents)
    })
}

function injectBridge(contents) {
    if (!eagleBridge) return
    if (contents.isDestroyed()) return
    const payload = JSON.stringify({
        port: eagleBridge.port,
        token: eagleBridge.token,
    })
    contents
        .executeJavaScript(`window.__frEagle = ${payload}; true;`)
        .catch(err => trace("bridge inject failed:", err.message))
}

// Debug switch must be set before the app is ready, and the Electron build here
// rejects it on the real command line, so set it from inside.
if (process.env.FR_DEBUG_PORT) {
    try {
        app.commandLine.appendSwitch(
            "remote-debugging-port",
            process.env.FR_DEBUG_PORT
        )
        trace("remote debugging port", process.env.FR_DEBUG_PORT)
    } catch (e) {
        trace("appendSwitch failed", e && e.message)
    }
}

// Funnel renderer console output (our shim logs there) into the log file.
const knownContents = new Set()
app.on("web-contents-created", (event, contents) => {
    knownContents.add(contents)
    contents.on("console-message", (e, level, message) => {
        trace("[renderer]", message)
    })
    contents.on("did-finish-load", () => {
        trace("[renderer] did-finish-load", contents.getURL())
        injectBridge(contents)
    })
})

// The original entry point. It creates the window; our listener above is
// already in place, and the default session is covered again below.
trace("requiring electron.js")
require(path.join(__dirname, "electron.js"))
trace("electron.js loaded")

app.whenReady().then(() => {
    trace("app ready")
    installWebRequest(session.defaultSession)
    startEagleBridge()
})

// Self-check: no devtools needed. Waits for the card list, then reports what
// the shim found and whether hovering a video card actually starts playback.
if (process.env.FR_SELFCHECK) {
    const delay = Number(process.env.FR_SELFCHECK) || 8000
    setTimeout(async () => {
        try {
            const all = require("electron").BrowserWindow.getAllWindows()
            trace("windows:", all.length)
            if (!all.length) return
            const wc = all[0].webContents
            const summary = await wc.executeJavaScript(`(() => {
                const cards = [...document.querySelectorAll('.card[data-iid]')]
                const media = cards.filter(c => c.dataset.frMedia)
                return JSON.stringify({
                    ready: !!window.__frMediaPatch,
                    dbBridge: !!(window.db && window.db.execute),
                    eagleBridge: !!window.__frEagle,
                    cards: cards.length,
                    mediaCards: media.length,
                    kinds: media.map(c => c.dataset.frMedia),
                    videos: document.querySelectorAll('video.fr-zoom').length,
                    badges: document.querySelectorAll('.fr-media-badge').length,
                    eagleButtons: document.querySelectorAll('button.fr-eagle-btn').length,
                    log: (window.__frMediaPatchLog || []).slice(-12)
                })
            })()`)
            trace("SELFCHECK dom:", summary)

            // Eagle import: drive the button with a real mouse event, then
            // confirm Eagle's library actually grew.
            const eagleBefore = await eagleItemCount()
            const geom = await wc.executeJavaScript(`(() => {
                const btn = document.querySelector('button.fr-eagle-btn')
                if (!btn) return 'no button'
                const r = btn.getBoundingClientRect()
                if (r.width === 0 || r.height === 0) return 'button has no box'
                return JSON.stringify({
                    x: Math.round(r.x + r.width / 2),
                    y: Math.round(r.y + r.height / 2),
                    visible: r.y > 0 && r.y < 1200
                })
            })()`)
            trace("SELFCHECK eagle button:", geom)
            if (typeof geom === "string" && geom.startsWith("{")) {
                const pos = JSON.parse(geom)
                wc.sendInputEvent({
                    type: "mouseMove",
                    x: pos.x,
                    y: pos.y,
                })
                wc.sendInputEvent({
                    type: "mouseDown",
                    x: pos.x,
                    y: pos.y,
                    button: "left",
                    clickCount: 1,
                })
                wc.sendInputEvent({
                    type: "mouseUp",
                    x: pos.x,
                    y: pos.y,
                    button: "left",
                    clickCount: 1,
                })
                await new Promise(r => setTimeout(r, 6000))
                const eagleAfter = await eagleItemCount()
                trace("SELFCHECK eagle items:", eagleBefore, "->", eagleAfter)
                const label = await wc.executeJavaScript(`(() => {
                    const btn = document.querySelector('button.fr-eagle-btn')
                    return btn ? btn.textContent + ' | ' + btn.title : 'no button'
                })()`)
                trace("SELFCHECK eagle button state:", label)
            }

            const hover = await wc.executeJavaScript(`(async () => {
                const card = [...document.querySelectorAll('.card[data-iid]')]
                    .find(c => c.dataset.frMedia === 'video')
                if (!card) return 'no video card'
                card.dispatchEvent(new MouseEvent('mouseover', {
                    bubbles: true, relatedTarget: document.body
                }))
                await new Promise(r => setTimeout(r, 3000))
                const v = card.querySelector('video.fr-zoom')
                return JSON.stringify({
                    hoverClass: card.className,
                    hasVideo: !!v,
                    src: v && v.dataset.src,
                    currentSrc: v && v.currentSrc,
                    paused: v && v.paused,
                    readyState: v && v.readyState,
                    currentTime: v && v.currentTime,
                    videoWidth: v && v.videoWidth,
                    videoHeight: v && v.videoHeight,
                    errorCode: v && v.error && v.error.code,
                    errorMsg: v && v.error && v.error.message
                })
            })()`)
            trace("SELFCHECK hover:", hover)

            // leaving the card must pause and rewind
            const after = await wc.executeJavaScript(`(async () => {
                const card = [...document.querySelectorAll('.card[data-iid]')]
                    .find(c => c.dataset.frMedia === 'video')
                if (!card) return 'no video card'
                card.dispatchEvent(new MouseEvent('mouseout', {
                    bubbles: true, relatedTarget: document.body
                }))
                await new Promise(r => setTimeout(r, 600))
                const v = card.querySelector('video.fr-zoom')
                return JSON.stringify({
                    classes: card.className,
                    paused: v && v.paused,
                    currentTime: v && v.currentTime
                })
            })()`)
            trace("SELFCHECK after-leave:", after)

            if (process.env.FR_SHOT) {
                try {
                    // re-hover so the screenshot shows the playing state
                    await wc.executeJavaScript(`(() => {
                        const card = [...document.querySelectorAll('.card[data-iid]')]
                            .find(c => c.dataset.frMedia === 'video')
                        card && card.dispatchEvent(new MouseEvent('mouseover', {
                            bubbles: true, relatedTarget: document.body
                        }))
                    })()`)
                    await new Promise(r => setTimeout(r, 1500))
                    const img = await wc.capturePage()
                    fs.writeFileSync(process.env.FR_SHOT, img.toPNG())
                    trace("screenshot written", process.env.FR_SHOT)
                } catch (e) {
                    trace("screenshot failed", e && e.message)
                }
            }

            // Refresh feedback: click the real refresh button, then read the
            // toast and capture it while it is still on screen.
            //
            // FR_SELFCHECK_DELETE=3 first drops that many stored articles so the
            // next fetch has something to re-insert; this exercises the
            // "added N" branch instead of the "nothing new" one. Test only.
            if (process.env.FR_SELFCHECK_DELETE) {
                const want = Number(process.env.FR_SELFCHECK_DELETE) || 3
                const removed = await wc.executeJavaScript(
                    `(async () => {
                        const rows = await window.db.execute(
                            'select _id from items order by date desc limit ${want}', [], 'all')
                        let n = 0
                        for (const row of rows) {
                            await window.db.execute(
                                'delete from items where _id = ?', [row[0]], 'run')
                            n++
                        }
                        return n
                    })()`
                )
                trace("SELFCHECK removed for test:", removed)
                await new Promise(r => setTimeout(r, 800))
            }

            const refreshGeom = await wc.executeJavaScript(`(() => {
                const icon = document.querySelector('[data-icon-name="Refresh"]')
                const btn = icon
                    ? icon.closest('button')
                    : document.querySelector('button[title*="刷新"], button[title*="Refresh"]')
                if (!btn) return 'no refresh button'
                const r = btn.getBoundingClientRect()
                return JSON.stringify({
                    x: Math.round(r.x + r.width / 2),
                    y: Math.round(r.y + r.height / 2),
                    disabled: !!btn.disabled
                })
            })()`)
            trace("SELFCHECK refresh button:", refreshGeom)
            if (
                typeof refreshGeom === "string" &&
                refreshGeom.startsWith("{")
            ) {
                const pos = JSON.parse(refreshGeom)
                if (pos.disabled) {
                    trace("SELFCHECK refresh: button disabled, skipped")
                } else {
                    wc.sendInputEvent({ type: "mouseMove", x: pos.x, y: pos.y })
                    wc.sendInputEvent({
                        type: "mouseDown",
                        x: pos.x,
                        y: pos.y,
                        button: "left",
                        clickCount: 1,
                    })
                    wc.sendInputEvent({
                        type: "mouseUp",
                        x: pos.x,
                        y: pos.y,
                        button: "left",
                        clickCount: 1,
                    })
                    // poll for the toast instead of guessing one delay
                    let toastText = "no toast"
                    let toastShot = false
                    for (let i = 0; i < 40; i++) {
                        await new Promise(r => setTimeout(r, 500))
                        toastText = await wc.executeJavaScript(`(() => {
                            const el = document.querySelector('.fr-toast')
                            return el ? el.textContent : 'no toast'
                        })()`)
                        if (toastText === "no toast") continue
                        // Measure it: text alone cannot prove it is visible.
                        const layout = await wc.executeJavaScript(`(() => {
                            const el = document.querySelector('.fr-toast')
                            if (!el) return 'gone'
                            const r = el.getBoundingClientRect()
                            const cs = getComputedStyle(el)
                            return JSON.stringify({
                                x: Math.round(r.x), y: Math.round(r.y),
                                w: Math.round(r.width), h: Math.round(r.height),
                                opacity: cs.opacity,
                                position: cs.position,
                                zIndex: cs.zIndex,
                                bg: cs.backgroundColor,
                                color: cs.color,
                                text: el.textContent
                            })
                        })()`)
                        trace("SELFCHECK toast layout:", layout)
                        if (process.env.FR_SHOT && !toastShot) {
                            try {
                                // let the fade-in finish before capturing
                                await new Promise(r => setTimeout(r, 600))
                                const img = await wc.capturePage()
                                fs.writeFileSync(
                                    process.env.FR_SHOT.replace(
                                        /\.png$/,
                                        ".toast.png"
                                    ),
                                    img.toPNG()
                                )
                                toastShot = true
                            } catch (e) {
                                /* keep the text result */
                            }
                        }
                        break
                    }
                    trace("SELFCHECK refresh toast:", toastText)
                    if (toastShot) trace("SELFCHECK toast screenshot saved")

                    // Second path: the per-source context menu entry 刷新.
                    // Wait for the first toast to clear, then drive the menu.
                    await new Promise(r => setTimeout(r, 3800))
                    const menuResult =
                        await wc.executeJavaScript(`(async () => {
                        const sleep = ms => new Promise(r => setTimeout(r, ms))
                        const items = [...document.querySelectorAll('[role="treeitem"], .fui-TreeItem')]
                        const src = items.find(el => /JoyReactor|GIF/i.test(el.textContent || ''))
                        if (!src) return 'no source item in sidebar'
                        src.dispatchEvent(new MouseEvent('contextmenu', {
                            bubbles: true, cancelable: true,
                            clientX: 120, clientY: 240
                        }))
                        await sleep(700)
                        const entries = [...document.querySelectorAll(
                            'button[role="menuitem"], .ms-ContextualMenu-link, [role="menuitem"]')]
                        const labels = entries.map(e => (e.textContent || '').trim()).filter(Boolean)
                        const ref = entries.find(e =>
                            /刷新|refresh/i.test((e.textContent || '')
                                .replace(/[\u200b-\u200f\ufeff]/g, '').trim()))
                        if (!ref) return 'menu entries: ' + labels.join(' | ')
                        ref.dispatchEvent(new MouseEvent('click', {bubbles: true}))
                        return 'clicked refresh'
                    })()`)
                    trace("SELFCHECK context-menu refresh:", menuResult)
                    if (menuResult === "clicked refresh") {
                        let menuToast = "no toast"
                        for (let i = 0; i < 40; i++) {
                            await new Promise(r => setTimeout(r, 500))
                            menuToast = await wc.executeJavaScript(`(() => {
                                const el = document.querySelector('.fr-toast')
                                return el ? el.textContent : 'no toast'
                            })()`)
                            if (menuToast !== "no toast") break
                        }
                        trace("SELFCHECK context-menu toast:", menuToast)
                    }
                }
            }
        } catch (e) {
            trace("SELFCHECK failed", e && (e.stack || e.message))
        }
    }, delay)
}
