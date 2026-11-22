import { SourceGroup } from "../../schema-types"

// A low-saturation "morandi" palette. Group chips only use translucent tints of
// these hues, so the same values read correctly on both the light and the dark
// theme without a second palette.
export interface GroupTone {
    key: string
    /** Solid accent, used for dots and accent bars. */
    dot: string
    /** Translucent fill for chips and cards. */
    soft: string
    /** Slightly stronger translucent stroke for chips. */
    line: string
}

const TONES: GroupTone[] = [
    {
        key: "slate",
        dot: "#5f7d95",
        soft: "rgba(95, 125, 149, 0.13)",
        line: "rgba(95, 125, 149, 0.34)",
    },
    {
        key: "sage",
        dot: "#6f8f78",
        soft: "rgba(111, 143, 120, 0.13)",
        line: "rgba(111, 143, 120, 0.34)",
    },
    {
        key: "clay",
        dot: "#a97f6a",
        soft: "rgba(169, 127, 106, 0.13)",
        line: "rgba(169, 127, 106, 0.34)",
    },
    {
        key: "indigo",
        dot: "#7286ad",
        soft: "rgba(114, 134, 173, 0.13)",
        line: "rgba(114, 134, 173, 0.34)",
    },
    {
        key: "plum",
        dot: "#94809e",
        soft: "rgba(148, 128, 158, 0.13)",
        line: "rgba(148, 128, 158, 0.34)",
    },
    {
        key: "moss",
        dot: "#84906b",
        soft: "rgba(132, 144, 107, 0.13)",
        line: "rgba(132, 144, 107, 0.34)",
    },
    {
        key: "rose",
        dot: "#a8838c",
        soft: "rgba(168, 131, 140, 0.13)",
        line: "rgba(168, 131, 140, 0.34)",
    },
    {
        key: "teal",
        dot: "#6b8f8c",
        soft: "rgba(107, 143, 140, 0.13)",
        line: "rgba(107, 143, 140, 0.34)",
    },
]

/** Neutral tone for ungrouped rows, "all" buckets and other non-group contexts.
 *  Mid-grey translucent values so it stays visible on light and dark surfaces. */
export const NEUTRAL_TONE: GroupTone = {
    key: "neutral",
    dot: "#8a8886",
    soft: "rgba(128, 128, 128, 0.14)",
    line: "rgba(128, 128, 128, 0.38)",
}

export const toneForIndex = (index: number): GroupTone =>
    TONES[Math.abs(index) % TONES.length]

/** Low-saturation red for fetch failures. */
export const ALERT_TONE: GroupTone = {
    key: "alert",
    dot: "#b2736f",
    soft: "rgba(178, 115, 111, 0.13)",
    line: "rgba(178, 115, 111, 0.34)",
}

/** Low-saturation amber for stale / never-fetched buckets. */
export const WARN_TONE: GroupTone = {
    key: "warn",
    dot: "#b39262",
    soft: "rgba(179, 146, 98, 0.13)",
    line: "rgba(179, 146, 98, 0.34)",
}

/**
 * Assigns tones by the order the group appears in the persisted list instead of
 * by gid, so two neighbouring groups never end up with the same colour (gid % 8
 * collides for the user's own group ids).
 */
export const buildToneMap = (groups: SourceGroup[]): Map<number, GroupTone> => {
    const map = new Map<number, GroupTone>()
    groups
        .filter(group => group.isMultiple)
        .forEach((group, index) => map.set(group.gid, toneForIndex(index)))
    return map
}

export const groupTone = (
    gid: number,
    tones?: Map<number, GroupTone>
): GroupTone => tones?.get(gid) ?? NEUTRAL_TONE
