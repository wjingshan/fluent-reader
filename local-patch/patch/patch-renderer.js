// patch-renderer.js — renderer-side shim, loaded after the untouched app bundle.
//
// What it does: Fluent Reader's card view only knows a single `thumb` URL and
// renders it as <img>. For feeds that publish "GIF as video" (reactor.cc,
// joyreactor, ...) that thumb is a still JPEG, so the card never moves.
// This shim reads each item's stored HTML through the app's own window.db
// bridge, finds the real <video>/<source> URL, and hovers it into life.
;(() => {
    "use strict"
    if (window.__frMediaPatch) return
    window.__frMediaPatch = true
    window.__frMediaPatchLog = []

    const log = (...args) => {
        window.__frMediaPatchLog.push(args.map(String).join(" "))
        if (window.__frMediaPatchLog.length > 200)
            window.__frMediaPatchLog.shift()
        console.log("[fr-media-patch]", ...args)
    }

    const VIDEO_RE = /\.(webm|mp4|m4v|ogv|mov)(?:[?#]|$)/i
    const GIF_RE = /\.gif(?:[?#]|$)/i
    const IMAGE_RE = /\.(jpe?g|png|webp|bmp|avif)(?:[?#]|$)/i

    /** iid -> {kind, url, poster} | null */
    const mediaByIid = new Map()
    /** iid -> {url, title, link} — the article body's own first picture */
    const pictureByIid = new Map()
    /** iids currently in the DOM and waiting for a DB lookup */
    const queued = new Set()
    const looked = new Set()
    let flushTimer = null

    const absUrl = raw => {
        if (!raw) return null
        const value = raw.trim()
        if (value.startsWith("//")) return "https:" + value
        if (/^https?:\/\//i.test(value)) return value
        return null
    }

    function readMedia(html) {
        if (!html) return null
        let doc
        try {
            doc = new DOMParser().parseFromString(html, "text/html")
        } catch (e) {
            return null
        }
        for (const video of doc.querySelectorAll("video")) {
            const candidates = []
            const own = video.getAttribute("src")
            if (own) candidates.push(own)
            for (const source of video.querySelectorAll("source")) {
                const src = source.getAttribute("src")
                if (src) candidates.push(src)
            }
            if (!candidates.length) continue
            const picked =
                candidates.find(c => VIDEO_RE.test(c)) || candidates[0]
            const url = absUrl(picked)
            if (url) {
                return {
                    kind: "video",
                    url,
                    poster: absUrl(video.getAttribute("poster")),
                }
            }
        }
        for (const anchor of doc.querySelectorAll("a[href]")) {
            const href = anchor.getAttribute("href")
            if (!href || !VIDEO_RE.test(href)) continue
            const url = absUrl(href)
            if (url) return { kind: "video", url, poster: null }
        }
        for (const img of doc.querySelectorAll("img[src]")) {
            const src = img.getAttribute("src")
            if (!src || !GIF_RE.test(src)) continue
            const url = absUrl(src)
            if (url) return { kind: "gif", url, poster: null }
        }
        return null
    }

    // The picture an article actually shows at full size, as opposed to the
    // feed's `thumb`. reactor.cc renders each picture as a link to the full file
    // wrapping a downscaled <img> (`/pics/post/…` inside, `/pics/post/full/…`
    // behind the link), and the thumbnail is that same downscaled file — so the
    // link is the only place the original lives.
    function readFirstPicture(html, baseUrl) {
        if (!html) return null
        let doc
        try {
            doc = new DOMParser().parseFromString(html, "text/html")
        } catch (e) {
            return null
        }
        const resolve = raw => {
            if (!raw) return null
            const value = raw.trim()
            if (/^data:/i.test(value)) return null
            let url = absUrl(value)
            if (!url && baseUrl) {
                try {
                    url = new URL(value, baseUrl).href
                } catch (e) {
                    url = null
                }
            }
            return url
        }
        // a link to a picture file that wraps a picture is the full-size version
        for (const anchor of doc.querySelectorAll("a[href]")) {
            const href = anchor.getAttribute("href")
            if (!href || !IMAGE_RE.test(href)) continue
            if (!anchor.querySelector("img")) continue
            const url = resolve(href)
            if (url) return url
        }
        // otherwise fall back to the picture the body shows inline
        for (const img of doc.querySelectorAll("img")) {
            const url = resolve(
                img.getAttribute("src") ||
                    img.getAttribute("data-src") ||
                    img.getAttribute("data-original") ||
                    img.getAttribute("data-lazy-src")
            )
            if (url) return url
        }
        return null
    }

    async function loadMedia(iids) {
        if (!window.db || !window.db.execute) {
            log("window.db not available — give up")
            return
        }
        const rows = await window.db.execute(
            `select _id, content, title, link from items where _id in (${iids
                .map(() => "?")
                .join(",")})`,
            iids,
            "all"
        )
        const found = iids.length
        const withMedia = []
        for (const row of Array.isArray(rows) ? rows : []) {
            // the app's db bridge returns column tuples, not records
            const iid = Array.isArray(row) ? row[0] : row && row._id
            const content = Array.isArray(row) ? row[1] : row && row.content
            const title = Array.isArray(row) ? row[2] : row && row.title
            const link = Array.isArray(row) ? row[3] : row && row.link
            if (iid === undefined || iid === null) continue
            const media = readMedia(content)
            if (media) {
                media.title = title || ""
                media.link = link || ""
            }
            mediaByIid.set(Number(iid), media)
            if (media) withMedia.push(Number(iid))
            const picture = readFirstPicture(content, link)
            if (picture) {
                pictureByIid.set(Number(iid), {
                    url: picture,
                    title: title || "",
                    link: link || "",
                })
            }
        }
        for (const iid of iids) {
            if (!mediaByIid.has(iid)) mediaByIid.set(iid, null)
        }
        log(`looked up ${found} item(s), ${withMedia.length} with media`)
        // Decorate every looked-up id, not only the ones with media: a picture
        // tile can still offer the Eagle button, and decorate() is what adds it.
        for (const iid of iids) decoratePending(iid)
    }

    function queue(iid) {
        if (looked.has(iid)) return
        queued.add(iid)
        if (flushTimer) return
        flushTimer = setTimeout(() => {
            flushTimer = null
            const batch = [...queued]
            queued.clear()
            batch.forEach(iid => looked.add(iid))
            loadMedia(batch).catch(err => log("lookup failed", err))
        }, 40)
    }

    // ---------------------------------------------------------------- decorate

    function decoratePending(iid) {
        for (const card of document.querySelectorAll(
            `div[data-iid="${iid}"]`
        )) {
            decorate(card)
        }
    }

    function decorate(card) {
        const iid = Number(card.dataset.iid)
        if (!Number.isFinite(iid)) return
        const media = mediaByIid.get(iid)
        const already = card.dataset.frMedia
        if (!media) {
            if (already) {
                card.dataset.frMedia = ""
                card.classList.remove("fr-media")
                card.classList.remove("fr-has-eagle")
                card.querySelector(":scope > .fr-media-badge")?.remove()
                card.querySelector(":scope > .fr-zoom")?.remove()
                card.querySelector(":scope > .fr-eagle-btn")?.remove()
            }
            // A waterfall tile that only holds a picture still has something
            // worth sending to Eagle: the article's own full-size picture.
            if (card.hasAttribute("data-fr-wf")) offerPictureToEagle(card, iid)
            return
        }
        // The overlay needs a picture area to cover. The card views reserve a
        // 144px header (img.head); a waterfall tile is a single picture filling
        // the whole tile and marks itself with data-fr-wf.
        const waterfall = card.hasAttribute("data-fr-wf")
        if (!waterfall && !card.querySelector(":scope > img.head")) return
        if (already === media.kind) return

        card.dataset.frMedia = media.kind
        card.classList.add("fr-media")

        if (!card.querySelector(":scope > .fr-media-badge")) {
            const badge = document.createElement("span")
            badge.className = "fr-media-badge"
            badge.textContent = media.kind === "gif" ? "GIF" : "▶"
            card.appendChild(badge)
        }
        addEagleButton(card, media)
        if (media.kind !== "video") return

        let video = card.querySelector(":scope > video.fr-zoom")
        if (!video) {
            video = document.createElement("video")
            video.className = "fr-zoom"
            video.muted = true
            video.loop = true
            video.playsInline = true
            video.setAttribute("muted", "")
            video.setAttribute("playsinline", "")
            video.preload = "none"
            if (media.poster) video.poster = media.poster
            video.addEventListener("error", () => {
                log("video error", media.url)
                card.classList.remove("fr-hover")
                card.classList.add("fr-video-broken")
            })
            card.appendChild(video)
        }
        video.dataset.src = media.url
    }

    // ------------------------------------------------------- import to Eagle

    // The main process exposes a loopback endpoint (window.__frEagle) that
    // forwards the request to Eagle's own API. CORS stops the renderer from
    // talking to 127.0.0.1:41595 directly, so we go through the main process.
    function eagleEndpoint(timeoutMs = 4000) {
        const started = Date.now()
        return new Promise((resolve, reject) => {
            const tick = () => {
                if (window.__frEagle && window.__frEagle.port) {
                    resolve(window.__frEagle)
                    return
                }
                if (Date.now() - started > timeoutMs) {
                    reject(new Error("Eagle bridge not available"))
                    return
                }
                setTimeout(tick, 100)
            }
            tick()
        })
    }

    // Icon for the import button (an outlined circle with a cut-out glyph).
    // The path is used verbatim so the cut-out keeps its original shape;
    // only the colour follows the button's text colour.
    const EAGLE_ICON_SVG = `<svg class="fr-eagle-svg" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M512 0C229.248 0 0 229.248 0 512s229.248 512 512 512 512-229.248 512-512S794.752 0 512 0z m1.706667 164.608c56.32 0.810667 112.384 14.293333 161.28 42.197333 23.424 13.226667 40.832 27.392 52.821333 38.186667a294.912 294.912 0 0 0-96 129.706667c-2.56 7.04-5.248 15.104-7.808 23.296a292.522667 292.522667 0 0 0-10.752 68.48c-0.128 6.912 0.085333 15.957333 0.128 24.661333 0.512 10.325333 2.133333 22.144 3.413333 33.664a299.221333 299.221333 0 0 0 74.794667 153.002667 293.930667 293.930667 0 0 0 79.786667 60.586666 332.458667 332.458667 0 0 1-112.170667 92.416 329.258667 329.258667 0 0 1-164.096 34.474667 390.826667 390.826667 0 0 1-9.386667-0.554667 328.32 328.32 0 0 1-64.170666-10.538666 349.909333 349.909333 0 0 1-120.746667-57.770667 301.056 301.056 0 0 1-80.810667-89.6c-9.386667-16.213333-63.573333-112.810667-32.810666-232.618667A309.802667 309.802667 0 0 1 253.013333 349.013333a235.221333 235.221333 0 0 0-89.813333 46.165334C175.786667 365.781333 226.389333 256 350.592 198.826667a381.610667 381.610667 0 0 1 163.114667-34.133334z m243.285333 107.008c8.618667 5.376 19.797333 13.184 31.402667 24.405333 4.608 4.394667 20.394667 19.968 34.986666 44.970667 17.621333 29.994667 23.424 56.618667 26.453334 70.4a235.52 235.52 0 0 1 0.554666 98.218667 304.341333 304.341333 0 0 0-87.210666-72.021334 309.034667 309.034667 0 0 0-66.176 12.8 291.584 291.584 0 0 0-44.8 18.005334 258.474667 258.474667 0 0 1 11.392-66.688 252.714667 252.714667 0 0 1 34.389333-70.101334 266.88 266.88 0 0 1 59.008-59.989333z"></path></svg>`

    function setButtonFace(button, face) {
        const slot = button.querySelector(":scope > .fr-eagle-face")
        if (!slot) return
        if (face === "icon") {
            slot.innerHTML = EAGLE_ICON_SVG
            slot.classList.remove("text")
        } else {
            slot.textContent = face
            slot.classList.add("text")
        }
    }

    function addEagleButton(card, media) {
        card.classList.add("fr-has-eagle")
        if (card.querySelector(":scope > .fr-eagle-btn")) return
        const button = document.createElement("button")
        button.className = "fr-eagle-btn"
        button.type = "button"
        button.title = "导入到 Eagle"
        button.setAttribute("aria-label", "导入到 Eagle")
        const face = document.createElement("span")
        face.className = "fr-eagle-face"
        button.appendChild(face)
        setButtonFace(button, "icon")
        button.addEventListener("click", event => {
            // keep the card itself from opening the article
            event.preventDefault()
            event.stopPropagation()
            importToEagle(button, media)
        })
        card.appendChild(button)
    }

    // A waterfall tile whose article has no video/GIF in its body can still be
    // imported. The target is the article's own picture, not the downscaled
    // `thumb` the tile renders; the tile picture is only a last resort for feeds
    // that put nothing usable in the body. Only picture tiles qualify — a 12px
    // source favicon on a text tile does not.
    function offerPictureToEagle(card, iid) {
        const img = card.querySelector("img")
        if (!img || !img.src) return
        if (img.clientWidth < 60) return
        const picture = pictureByIid.get(iid)
        const title =
            (picture && picture.title) ||
            (card.querySelector("h3")?.textContent || "").trim()
        addEagleButton(card, {
            kind: "image",
            url: (picture && picture.url) || img.src,
            title,
            link: (picture && picture.link) || "",
        })
    }

    async function importToEagle(button, media) {
        if (button.dataset.frBusy === "1") return
        button.dataset.frBusy = "1"
        setButtonFace(button, "…")
        button.classList.add("busy")
        let ok = false
        let message = ""
        try {
            const bridge = await eagleEndpoint()
            const response = await fetch(
                `http://127.0.0.1:${bridge.port}/eagle/import`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Fr-Token": bridge.token,
                    },
                    body: JSON.stringify({
                        url: media.url,
                        name: media.title || media.url.split("/").pop(),
                        website: media.link || "",
                    }),
                }
            )
            const data = await response.json()
            ok = Boolean(data && data.ok)
            message = (data && (data.error || data.detail)) || ""
        } catch (err) {
            message = String((err && err.message) || err)
        }
        button.dataset.frBusy = "0"
        button.classList.remove("busy")
        setButtonFace(button, ok ? "✓" : "✕")
        button.title = ok ? "已导入 Eagle" : "导入失败：" + message
        setTimeout(() => {
            setButtonFace(button, "icon")
            button.title = "导入到 Eagle"
        }, 2200)
        log("eagle import", ok ? "ok" : "failed", message)
    }

    // -------------------------------------------------------------- hover play

    function cardOf(target) {
        if (!(target instanceof Element)) return null
        const card = target.closest("div[data-iid]")
        return card && card.dataset.frMedia === "video" ? card : null
    }

    function play(card) {
        const video = card.querySelector(":scope > video.fr-zoom")
        if (!video) return
        if (!video.getAttribute("src")) video.src = video.dataset.src
        card.classList.add("fr-hover")
        const started = video.play()
        if (started && typeof started.catch === "function") {
            started.catch(err => {
                // play() interrupted by our own pause() — expected, not a problem
                if (err && err.name === "AbortError") return
                log("play rejected", err && err.name, err && err.message)
            })
        }
    }

    function stop(card) {
        const video = card.querySelector(":scope > video.fr-zoom")
        card.classList.remove("fr-hover")
        if (video) {
            video.pause()
            video.currentTime = 0
        }
    }

    document.addEventListener(
        "mouseover",
        event => {
            const card = cardOf(event.target)
            if (!card) return
            const from = event.relatedTarget
            if (from instanceof Node && card.contains(from)) return
            play(card)
        },
        true
    )

    document.addEventListener(
        "mouseout",
        event => {
            const card = cardOf(event.target)
            if (!card) return
            const to = event.relatedTarget
            if (to instanceof Node && card.contains(to)) return
            stop(card)
        },
        true
    )

    // ------------------------------------------------------- refresh feedback
    //
    // The app refreshes silently: when the fetch succeeds but every article is
    // already known, nothing changes on screen and there is no hint at all.
    // This watches a user-initiated refresh and says what actually happened.

    const REFRESH_POLL_MS = 500
    const REFRESH_TIMEOUT_MS = 60000

    function showToast(text, kind) {
        let host = document.querySelector(".fr-toast-host")
        if (!host) {
            host = document.createElement("div")
            host.className = "fr-toast-host"
            document.body.appendChild(host)
        }
        const toast = document.createElement("div")
        toast.className = "fr-toast" + (kind ? " " + kind : "")
        toast.textContent = text
        host.appendChild(toast)
        setTimeout(() => {
            toast.classList.add("out")
            setTimeout(() => toast.remove(), 320)
        }, 3200)
    }

    async function dbRows(sql) {
        const rows = await window.db.execute(sql, [], "all")
        return Array.isArray(rows) ? rows : []
    }

    async function refreshBaseline() {
        const [counts, sources] = await Promise.all([
            dbRows("select count(*) from items"),
            dbRows("select sid, lastFetched from sources"),
        ])
        return {
            count: counts.length ? Number(counts[0][0]) : 0,
            sources: new Map(sources.map(r => [r[0], r[1]])),
            at: Date.now(),
            changed: new Set(),
            lastChangeAt: 0,
        }
    }

    // A refresh can target one source (the context-menu item) or all of them
    // (the nav button). So we cannot wait for every source to change; instead
    // we wait until nothing has changed for a moment after at least one did.
    async function refreshFinished(baseline) {
        const quietMs = Date.now() - (baseline.lastChangeAt || baseline.at)
        try {
            const sources = await dbRows("select sid, lastFetched from sources")
            for (const row of sources) {
                const sid = row[0]
                if (baseline.sources.get(sid) === row[1]) continue
                if (!baseline.changed.has(sid)) {
                    baseline.changed.add(sid)
                    baseline.lastChangeAt = Date.now()
                }
            }
        } catch (err) {
            log("refresh poll failed", err && err.message)
        }

        const settled =
            baseline.changed.size > 0 &&
            Date.now() - (baseline.lastChangeAt || baseline.at) > 1500

        if (!settled) {
            if (Date.now() - baseline.at > REFRESH_TIMEOUT_MS) {
                if (baseline.changed.size === 0) {
                    // The fetch failed; the app shows its own error dialog.
                    log("refresh timed out (likely a failed fetch)")
                } else {
                    log("refresh timed out while finishing")
                }
                return
            }
            setTimeout(() => refreshFinished(baseline), REFRESH_POLL_MS)
            return
        }

        // Give the insert a moment to land before counting.
        setTimeout(async () => {
            try {
                const counts = await dbRows("select count(*) from items")
                const total = counts.length ? Number(counts[0][0]) : 0
                const added = total - baseline.count
                if (added > 0) {
                    showToast(`刷新完成，新增 ${added} 篇文章`, "ok")
                } else {
                    showToast("刷新完成，没有新文章", "empty")
                }
                log(
                    "refresh done, added",
                    added,
                    "sources changed",
                    baseline.changed.size
                )
            } catch (err) {
                log("refresh count failed", err && err.message)
            }
        }, 500)
    }

    function watchRefresh() {
        if (!window.db || !window.db.execute) return
        refreshBaseline()
            .then(baseline => {
                log("refresh watch started, baseline", baseline.count)
                setTimeout(() => refreshFinished(baseline), REFRESH_POLL_MS)
            })
            .catch(err => log("refresh baseline failed", err && err.message))
    }

    // There are three ways to refresh: the nav button, the per-source context
    // menu entry, and F5. They use different icons, so match on all of them.
    // Menu labels can carry zero-width characters, so match by "contains"
    // instead of anchoring the whole string.
    const REFRESH_LABEL = /刷新|refresh/i

    function labelOf(el) {
        const raw = (el && el.textContent) || ""
        // strip zero-width and BOM-ish characters that trim() keeps
        return raw.replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, "").trim()
    }

    function isRefreshButton(target) {
        if (!(target instanceof Element)) return false

        // 1) nav bar button (icon "Refresh")
        const refreshIcon = target.closest('[data-icon-name="Refresh"]')
        if (refreshIcon) {
            const button = refreshIcon.closest("button")
            return Boolean(button) && !button.disabled
        }

        // 2) context menu entry "刷新" (icon "Sync"); it refreshes only the
        //    sources that were right-clicked
        const syncIcon = target.closest('[data-icon-name="Sync"]')
        if (syncIcon) {
            const item = syncIcon.closest(
                'button, [role="menuitem"], .ms-ContextualMenu-link, li'
            )
            if (item && REFRESH_LABEL.test(labelOf(item))) return true
        }

        // 3) fallbacks: any control whose visible text or title says 刷新
        const control = target.closest('button, [role="menuitem"]')
        if (!control) return false
        if (control.disabled) return false
        const title = (control.getAttribute("title") || "").trim()
        return REFRESH_LABEL.test(title) || REFRESH_LABEL.test(labelOf(control))
    }

    document.addEventListener(
        "click",
        event => {
            if (!isRefreshButton(event.target)) return
            watchRefresh()
        },
        true
    )

    document.addEventListener(
        "keydown",
        event => {
            if (event.key !== "F5") return
            setTimeout(watchRefresh, 120)
        },
        true
    )

    // --------------------------------------------------------------- discovery

    function scan(root) {
        if (!(root instanceof Element)) return
        if (root.matches("div[data-iid]")) {
            const iid = Number(root.dataset.iid)
            if (Number.isFinite(iid)) {
                if (mediaByIid.has(iid)) decorate(root)
                else queue(iid)
            }
        }
        for (const card of root.querySelectorAll("div[data-iid]")) {
            const iid = Number(card.dataset.iid)
            if (!Number.isFinite(iid)) continue
            if (mediaByIid.has(iid)) decorate(card)
            else queue(iid)
        }
    }

    const observer = new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType === 1) scan(node)
            }
        }
    })

    function boot() {
        if (!document.body) {
            requestAnimationFrame(boot)
            return
        }
        observer.observe(document.body, { childList: true, subtree: true })
        scan(document.body)
        log("ready")
    }

    boot()
})()
