export class SourceGroup {
    gid: number // persistent identity independent of display order
    isMultiple: boolean
    sids: number[]
    name?: string
    expanded?: boolean

    constructor(gid: number, sids: number[], name: string = null) {
        this.gid = gid
        name = (name && name.trim()) || "Source group"
        if (sids.length == 1) {
            this.isMultiple = false
        } else {
            this.isMultiple = true
            this.name = name
            this.expanded = true
        }
        this.sids = sids
    }
}

export const enum ViewType {
    Cards,
    List,
    Magazine,
    Compact,
    Customized,
}

export const ARTICLE_OVERLAY_MIN_WIDTH = 860
export const LIST_VIEW_MIN_WIDTH = 350
// Preserve the article space at the existing 992px minimum window width.
export const LIST_ARTICLE_MIN_WIDTH = 992 - LIST_VIEW_MIN_WIDTH

export const enum ViewConfigs {
    ShowCover = 1 << 0,
    ShowSnippet = 1 << 1,
    FadeRead = 1 << 2,
}

// Display metrics per view. These are the card-list look, not the article
// reading area: `fontSize` / `fontFamily` above belong to the article body.
export interface LayoutConfig {
    cardTitleSize: number
    cardSnippetSize: number
    // Empty means "follow the app font". A value is one family name, unquoted.
    cardFont: string
    cardGap: number
    cardsColumnWidth: number
    cardsRowHeight: number
    listCoverHeight: number
    listTitleSize: number
    magazineCoverHeight: number
    compactRowHeight: number
    waterfallMinColumnWidth: number
    waterfallGap: number
    waterfallMaxTiles: number
}

export type LayoutNumberKey = Exclude<keyof LayoutConfig, "cardFont">

export const LAYOUT_RANGES: Record<
    LayoutNumberKey,
    { min: number; max: number; step: number }
> = {
    cardTitleSize: { min: 12, max: 24, step: 1 },
    cardSnippetSize: { min: 10, max: 20, step: 1 },
    cardGap: { min: 4, max: 28, step: 2 },
    cardsColumnWidth: { min: 220, max: 420, step: 10 },
    cardsRowHeight: { min: 260, max: 420, step: 10 },
    listCoverHeight: { min: 48, max: 140, step: 4 },
    listTitleSize: { min: 12, max: 22, step: 1 },
    magazineCoverHeight: { min: 100, max: 280, step: 10 },
    compactRowHeight: { min: 24, max: 56, step: 2 },
    waterfallMinColumnWidth: { min: 140, max: 320, step: 10 },
    waterfallGap: { min: 4, max: 32, step: 2 },
    waterfallMaxTiles: { min: 2, max: 24, step: 1 },
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
    cardTitleSize: 16,
    cardSnippetSize: 14,
    cardFont: "",
    cardGap: 12,
    cardsColumnWidth: 280,
    cardsRowHeight: 304,
    listCoverHeight: 80,
    listTitleSize: 14,
    magazineCoverHeight: 160,
    compactRowHeight: 31,
    waterfallMinColumnWidth: 200,
    waterfallGap: 12,
    waterfallMaxTiles: 12,
}

export const LAYOUT_NUMBER_KEYS = Object.keys(
    LAYOUT_RANGES
) as LayoutNumberKey[]

// A family name travels into a CSS custom property, so anything that could
// break out of the declaration (quotes, commas, braces, semicolons) is dropped:
// only letters, digits, spaces, hyphens and CJK ideographs survive.
export function sanitizeFontFamily(font: unknown): string {
    if (typeof font !== "string") return ""
    return font
        .replace(/[^A-Za-z0-9 \-\u3400-\u9fff]/g, "")
        .trim()
        .slice(0, 64)
}

export function normalizeLayoutConfig(
    config: Partial<LayoutConfig> = null
): LayoutConfig {
    const result: LayoutConfig = { ...DEFAULT_LAYOUT_CONFIG }
    if (!config || typeof config !== "object") return result
    for (const key of LAYOUT_NUMBER_KEYS) {
        const raw = Number(config[key])
        if (!Number.isFinite(raw)) continue
        const { min, max, step } = LAYOUT_RANGES[key]
        const snapped = Math.round(raw / step) * step
        result[key] = Math.min(max, Math.max(min, snapped))
    }
    result.cardFont = sanitizeFontFamily(config.cardFont)
    return result
}

export function countCustomLayout(config: LayoutConfig): number {
    const normalized = normalizeLayoutConfig(config)
    let count = 0
    for (const key of LAYOUT_NUMBER_KEYS) {
        if (normalized[key] !== DEFAULT_LAYOUT_CONFIG[key]) count += 1
    }
    if (normalized.cardFont !== DEFAULT_LAYOUT_CONFIG.cardFont) count += 1
    return count
}

export const enum ThemeSettings {
    Default = "system",
    Light = "light",
    Dark = "dark",
}

export const enum SearchEngines {
    Google,
    Bing,
    Baidu,
    DuckDuckGo,
}

export const enum ImageCallbackTypes {
    OpenExternal,
    OpenExternalBg,
    SaveAs,
    Copy,
    CopyLink,
}

export const enum SyncService {
    None,
    Fever,
    Feedbin,
    GReader,
    Inoreader,
    Miniflux,
    Nextcloud,
}
export interface ServiceConfigs {
    type: SyncService
    importGroups?: boolean
}

export const enum WindowStateListenerType {
    Maximized,
    Focused,
    Fullscreen,
    AlwaysOnTop,
}

export interface TouchBarTexts {
    menu: string
    search: string
    refresh: string
    markAll: string
    notifications: string
}

export type RuleTarget =
    | { type: "source"; sid: number }
    | { type: "group"; gid: number }
    | { type: "all" }

export interface StoredRule {
    filter: number
    search: string
    match: boolean
    actions: string[]
}

export type RuleTargetKey = "all" | `source:${number}` | `group:${number}`
export type StoredRules = Partial<Record<RuleTargetKey, StoredRule[]>>

export function getRuleTargetKey(target: RuleTarget): RuleTargetKey {
    switch (target.type) {
        case "source":
            return `source:${target.sid}`
        case "group":
            return `group:${target.gid}`
        case "all":
            return "all"
    }
}

export type TranslationErrorCode =
    | "no-key"
    | "api-error"
    | "bad-response"
    | "unavailable"

export interface TranslationError {
    code: TranslationErrorCode
    message?: string
}

// Translation arrives as two strings; `error` replaces both when the request
// could not be made at all. Deliberately not a discriminated union: the project
// compiles without strictNullChecks, where `ok: true | false` does not narrow.
export interface TranslationResult {
    title: string
    snippet: string
    error?: TranslationError
}

// Article bodies travel as ordered chunks. `error` replaces `blocks` when the
// request could not be made at all.
export interface TranslationBlocksResult {
    blocks: string[]
    error?: TranslationError
}

export interface TranslationKeyState {
    // Key saved by the user. Empty when only the environment variable is set.
    key: string
    fromEnvironment: boolean
}

export type SchemaTypes = {
    version: string
    theme: ThemeSettings
    pac: string
    pacOn: boolean
    view: ViewType
    locale: string
    sourceGroups: SourceGroup[]
    nextGroupId: number
    fontSize: number
    fontFamily: string
    articleOverlayWidth: number
    listViewWidth: number
    menuOn: boolean
    fetchInterval: number
    searchEngine: SearchEngines
    serviceConfigs: ServiceConfigs
    filterType: number
    listViewConfigs: ViewConfigs
    // Per-menu-entry view preference. Keys are menu keys ("all", "g-<gid>",
    // "s-<sid>"); a missing key falls back to the global `view`.
    groupViews: Record<string, ViewType>
    menuUnreadSourcesOnly: boolean
    sourceRules: StoredRules
    dbVersion: string
    // 0 = off, 1 = merge copies of the same canonical link (see duplicate.ts).
    duplicateFilter: number
    // DeepSeek key for on-demand article translation. Falls back to
    // DEEPSEEK_API_KEY when empty (see main/translate.ts).
    translateApiKey: string
    // Card-list display metrics (see layout.ts / components/settings/layout).
    layoutConfig: LayoutConfig
}
