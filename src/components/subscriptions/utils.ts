import intl from "react-intl-universal"
import { SourceGroup } from "../../schema-types"
import { RSSSource } from "../../scripts/models/source"

export interface ManagerRow {
    source: RSSSource
    group: SourceGroup | null
}

export type SourceStatus = "ok" | "stale" | "hidden"

export const STALE_MINUTES = 30 * 24 * 60

export function statusOf(source: RSSSource): SourceStatus {
    if (source.hidden) return "hidden"
    const time = source.lastFetched ? new Date(source.lastFetched).getTime() : 0
    if (!time || time <= 0) return "stale"
    if (Date.now() - time > STALE_MINUTES * 60000) return "stale"
    return "ok"
}

export function statusLabel(status: SourceStatus) {
    switch (status) {
        case "hidden":
            return intl.get("subs.statusHidden")
        case "stale":
            return intl.get("subs.statusStale")
        default:
            return intl.get("subs.statusOk")
    }
}

export function relativeTime(date?: Date) {
    const time = date ? new Date(date).getTime() : 0
    if (!time || time <= 0) return "—"
    const minutes = Math.floor((Date.now() - time) / 60000)
    if (minutes < 1) return intl.get("time.now")
    if (minutes < 60) return intl.get("time.minute", { m: minutes })
    const hours = Math.round(minutes / 60)
    if (hours < 24) return intl.get("time.hour", { h: hours })
    return intl.get("time.day", { d: Math.round(hours / 24) })
}

const AVATAR_COLORS = [
    "#0f6cbd",
    "#c94f4f",
    "#6b5bd2",
    "#2f8f6b",
    "#b8791f",
    "#4a6fa5",
    "#a3528f",
    "#3d7d8c",
]

export function avatarColor(key: string) {
    let hash = 0
    for (let i = 0; i < key.length; i += 1) {
        hash = (hash + key.charCodeAt(i)) % AVATAR_COLORS.length
    }
    return AVATAR_COLORS[hash]
}
