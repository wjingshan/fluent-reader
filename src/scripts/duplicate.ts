// Canonical link keys power the duplicate filter. Two rows share a key only
// when they point at the same article; the normalization below removes things
// that never change the target (scheme, tracking parameters, fragments) and
// deliberately leaves anything that might (path case, unknown parameters) alone.
// When a link cannot be trusted to identify an article the key is null, and the
// row is never merged with anything.

const TRACKING_PARAMS = new Set([
    "gclid",
    "dclid",
    "fbclid",
    "msclkid",
    "yclid",
    "twclid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "spm",
    "scm",
    "ref_src",
    "ref_url",
    "chksm",
    "scene",
    "subscene",
    "ascene",
    "sharer_sharetime",
    "sharer_shareid",
    "mpshare",
    "wx_header",
    "feature",
    "trk",
    "_hsenc",
    "_hsmi",
])

// A key shorter than this is too generic to identify an article.
const MIN_KEY_LENGTH = 8

function stripHostPrefix(host: string): string {
    let value = host.toLowerCase().trim()
    if (value.endsWith(".")) value = value.slice(0, -1)
    for (let prefix of ["www.", "m.", "amp."]) {
        if (value.startsWith(prefix) && value.length > prefix.length) {
            value = value.slice(prefix.length)
        }
    }
    return value
}

function normalizeQuery(query: string): string {
    const kept = query
        .split("&")
        .map(part => part.trim())
        .filter(part => part.length > 0)
        .filter(part => {
            const name = part.split("=", 1)[0].toLowerCase()
            return !TRACKING_PARAMS.has(name) && !name.startsWith("utm_")
        })
    // Reordering parameters does not change the resource they point at.
    kept.sort()
    return kept.join("&")
}

/**
 * Returns the canonical key for a link, or null when the link cannot be used
 * as an article identity (empty link, non-http scheme, or a bare site root).
 */
export function canonicalLinkKey(link: string): string | null {
    if (typeof link !== "string") return null
    let value = link.trim()
    if (!value) return null
    if (!/^https?:\/\//i.test(value)) return null

    value = value.slice(value.indexOf("://") + 3)
    const hashIndex = value.indexOf("#")
    if (hashIndex >= 0) value = value.slice(0, hashIndex)

    const slashIndex = value.indexOf("/")
    const hostPart = slashIndex >= 0 ? value.slice(0, slashIndex) : value
    let rest = slashIndex >= 0 ? value.slice(slashIndex) : ""
    // A query string can follow the host directly (example.com?a=1).
    if (hostPart.indexOf("?") >= 0) {
        rest = hostPart.slice(hostPart.indexOf("?")) + rest
        return buildKey(
            stripHostPrefix(hostPart.slice(0, hostPart.indexOf("?"))),
            rest
        )
    }
    return buildKey(stripHostPrefix(hostPart), rest)
}

function buildKey(host: string, rest: string): string | null {
    if (!host) return null
    // Default ports never change the target.
    host = host.replace(/:(80|443)$/, "")
    let path = rest
    let query = ""
    const queryIndex = path.indexOf("?")
    if (queryIndex >= 0) {
        query = normalizeQuery(path.slice(queryIndex + 1))
        path = path.slice(0, queryIndex)
    }
    path = path.replace(/\/+/g, "/")
    path = path.replace(/\/+$/, "")
    // WordPress-style AMP copies of the same article.
    path = path.replace(/\/amp$/i, "")
    if (!path && !query) return null
    const key = query ? `${host}${path}?${query}` : `${host}${path}`
    return key.length >= MIN_KEY_LENGTH ? key : null
}

/** The value stored in items.linkKey: a canonical key, or "" when unusable. */
export function storedLinkKey(link: string): string {
    return canonicalLinkKey(link) ?? ""
}

export const enum DuplicateFilterMode {
    Off = 0,
    Link = 1,
}

/** The user setting that decides whether duplicate copies are collapsed. */
let cachedMode: DuplicateFilterMode = null

function readDuplicateFilterMode(): DuplicateFilterMode {
    if (typeof window === "undefined") return DuplicateFilterMode.Off
    const settings = window.settings
    if (!settings || typeof settings.getDuplicateFilter !== "function") {
        return DuplicateFilterMode.Off
    }
    return Number(settings.getDuplicateFilter()) === DuplicateFilterMode.Link
        ? DuplicateFilterMode.Link
        : DuplicateFilterMode.Off
}

export function duplicateFilterMode(): DuplicateFilterMode {
    // Read on every feed query; the synchronous bridge call is only worth paying
    // once until the setting actually changes.
    if (cachedMode === null) cachedMode = readDuplicateFilterMode()
    return cachedMode
}

export function setDuplicateFilterMode(mode: number): void {
    cachedMode =
        Number(mode) === DuplicateFilterMode.Link
            ? DuplicateFilterMode.Link
            : DuplicateFilterMode.Off
    if (typeof window !== "undefined") {
        window.settings?.setDuplicateFilter?.(cachedMode)
    }
}

export function duplicateFilterEnabled(): boolean {
    return duplicateFilterMode() === DuplicateFilterMode.Link
}
