import intl from "react-intl-universal"
import { SourceGroup } from "../../schema-types"
import { RSSSource } from "../../scripts/models/source"

export interface ManagerRow {
    source: RSSSource
    group: SourceGroup | null
}

export type SourceStatus = "ok" | "stale" | "hidden" | "error"

export const STALE_MINUTES = 30 * 24 * 60

// A recorded fetch failure outranks staleness: the source is reachable but
// broken, which needs a different fix than "has not updated in a while".
export function statusOf(source: RSSSource, error?: string): SourceStatus {
    if (source.hidden) return "hidden"
    if (error) return "error"
    const time = source.lastFetched ? new Date(source.lastFetched).getTime() : 0
    if (!time || time <= 0) return "stale"
    if (Date.now() - time > STALE_MINUTES * 60000) return "stale"
    return "ok"
}

export function statusLabel(status: SourceStatus) {
    switch (status) {
        case "hidden":
            return intl.get("subs.statusHidden")
        case "error":
            return intl.get("subs.statusError")
        case "stale":
            return intl.get("subs.statusStale")
        default:
            return intl.get("subs.statusOk")
    }
}

// Per-source fetch frequency, in minutes. 0 means no limit.
export const FREQUENCY_OPTIONS = [0, 15, 30, 60, 120, 180, 360, 720, 1440, 10080, 43200]

const MINUTES_PER_DAY = 1440
const MINUTES_PER_WEEK = 10080
const MINUTES_PER_MONTH = 43200

export function frequencyLabel(frequency: number) {
    if (!frequency || frequency <= 0) return intl.get("sources.unlimited")
    if (frequency >= MINUTES_PER_MONTH && frequency % MINUTES_PER_MONTH === 0)
        return intl.get("time.month", { n: frequency / MINUTES_PER_MONTH })
    if (frequency < 60) return intl.get("time.minute", { m: frequency })
    if (frequency < MINUTES_PER_DAY)
        return intl.get("time.hour", { h: Math.round(frequency / 60) })
    if (frequency % MINUTES_PER_WEEK === 0)
        return intl.get("time.week", { w: frequency / MINUTES_PER_WEEK })
    return intl.get("time.day", { d: Math.round(frequency / MINUTES_PER_DAY) })
}

export function relativeTime(date?: Date) {
    const time = date ? new Date(date).getTime() : 0
    if (!time || time <= 0) return "—"
    const minutes = Math.floor((Date.now() - time) / 60000)
    if (minutes < 1) return intl.get("subs.justNow")
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
