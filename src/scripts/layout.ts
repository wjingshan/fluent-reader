import intl from "react-intl-universal"
import { LayoutConfig, sanitizeHexColor } from "../schema-types"
import { RSSItem } from "./models/item"

// Every adjustable card metric is published as a custom property on :root, so
// card styles (Griffel) only reference a variable and no component has to
// thread numbers down as props. Values are re-applied whenever the Redux state
// changes, which is what makes the change visible without a restart.
export function applyLayoutVariables(config: LayoutConfig) {
    const style = document.documentElement.style
    const px = (value: number) => `${Math.round(value)}px`
    // Rows keep the historical 1.5 ratio between the horizontal and vertical
    // gutter (12 / 18 in the original cards.css).
    style.setProperty("--fr-card-gap", px(config.cardGap))
    style.setProperty("--fr-card-row-gap", px(config.cardGap * 1.5))
    // The setting is the card's own width; the feed cuts the page into cells, and
    // a cell is the card plus its two gutters. Everything downstream (card size,
    // filler width, rows per page) keeps working on the cell.
    style.setProperty(
        "--fr-cards-column-width",
        px(config.cardsColumnWidth + config.cardGap * 2)
    )
    style.setProperty("--fr-cards-row-height", px(config.cardsRowHeight))
    style.setProperty("--fr-card-title-size", px(config.cardTitleSize))
    style.setProperty("--fr-card-snippet-size", px(config.cardSnippetSize))
    style.setProperty("--fr-card-font-family", cardFontStack(config.cardFont))
    style.setProperty("--fr-list-cover-height", px(config.listCoverHeight))
    style.setProperty("--fr-list-title-size", px(config.listTitleSize))
    style.setProperty(
        "--fr-list-snippet-lines",
        String(config.listSnippetLines)
    )
    style.setProperty(
        "--fr-magazine-cover-height",
        px(config.magazineCoverHeight)
    )
    style.setProperty("--fr-magazine-inset", px(config.magazineInset))
    // "Follow the theme" keeps the historical pair: transparent at rest, white
    // on hover. A chosen colour is used for both, and the hover shadow alone
    // provides the feedback, so the card never flashes the wrong colour.
    const magazineBg = sanitizeHexColor(config.magazineBackground)
    style.setProperty("--fr-magazine-bg", magazineBg || "transparent")
    style.setProperty("--fr-magazine-bg-hover", magazineBg || "var(--white)")
    style.setProperty("--fr-compact-row-height", px(config.compactRowHeight))
    // A compact row is one line of title plus its snippet lines; the padding and
    // borders around them take the remaining 13px of the 31px row.
    const compactLine = Math.max(12, config.compactRowHeight - 13)
    style.setProperty("--fr-compact-line-height", px(compactLine))
    const snippetLines = config.compactSnippetLines
    style.setProperty("--fr-compact-snippet-lines", String(snippetLines))
    // One line keeps the original nowrap / block / ellipsis row untouched; more
    // lines need a wrapping, clamped box instead.
    style.setProperty(
        "--fr-compact-snippet-wrap",
        snippetLines > 1 ? "normal" : "nowrap"
    )
    style.setProperty(
        "--fr-compact-snippet-display",
        snippetLines > 1 ? "-webkit-box" : "block"
    )
    // The row grows with the extra lines so nothing is clipped; at one line this
    // is the configured row height again, i.e. exactly the old floor.
    style.setProperty(
        "--fr-compact-min-height",
        px(
            snippetLines > 1
                ? 8 + compactLine + snippetLines * (compactLine - 2)
                : config.compactRowHeight
        )
    )
    style.setProperty(
        "--fr-waterfall-min-column",
        px(config.waterfallMinColumnWidth)
    )
    style.setProperty("--fr-waterfall-gap", px(config.waterfallGap))
}

// "inherit" keeps the app font the theme already sets on the root element.
export function cardFontStack(font: string): string {
    return font ? `"${font}", sans-serif` : "inherit"
}

// One real cover for the settings preview. Item ids grow with time, so walking
// them backwards yields the newest article that has a loadable thumbnail: the
// item parser drops anything that is not http(s), which covers both plain URLs
// and the loopback image proxy some feeds rewrite theirs to.
export function findPreviewThumb(
    items: Record<number, RSSItem> | undefined
): string {
    if (!items) return ""
    const ids = Object.keys(items)
        .map(Number)
        .sort((a, b) => b - a)
    for (const id of ids) {
        const thumb = items[id]?.thumb
        if (thumb) return thumb
    }
    return ""
}

type FontChoice = {
    key: string
    families: string[]
    // Used when none of the families above is installed; a CSS generic always
    // resolves, so this option never has to be hidden.
    generic?: string
}

// Candidate families only become options when the machine actually has them:
// a missing font silently falls back to the system one, which would look like
// a control that does nothing.
const FONT_CHOICES: FontChoice[] = [
    {
        key: "layout.fontYahei",
        families: ["Microsoft YaHei", "Microsoft YaHei UI", "微软雅黑"],
    },
    {
        key: "layout.fontSourceHan",
        families: [
            "Source Han Sans SC",
            "Source Han Sans CN",
            "Noto Sans CJK SC",
            "Source Han Sans",
        ],
    },
    {
        key: "layout.fontPingFang",
        families: ["PingFang SC", "PingFang HK", "苹方-简"],
    },
    {
        key: "layout.fontSimSun",
        families: ["SimSun", "Songti SC", "宋体"],
    },
    {
        key: "layout.fontSimHei",
        families: ["SimHei", "Heiti SC", "黑体"],
    },
    {
        key: "layout.fontMonospace",
        families: [
            "Consolas",
            "Cascadia Mono",
            "Cascadia Code",
            "JetBrains Mono",
            "Sarasa Mono SC",
            "Menlo",
            "DejaVu Sans Mono",
        ],
        generic: "monospace",
    },
]

export type CardFontOption = {
    family: string
    label: string
}

export function availableCardFonts(): CardFontOption[] {
    const installed = new Set(
        (globalThis.fontList || [])
            .map(name => name.trim().toLowerCase())
            .filter(Boolean)
    )
    const options: CardFontOption[] = []
    const used = new Set<string>()
    for (const choice of FONT_CHOICES) {
        const match =
            choice.families.find(family =>
                installed.has(family.toLowerCase())
            ) || choice.generic
        if (!match || used.has(match.toLowerCase())) continue
        used.add(match.toLowerCase())
        options.push({ family: match, label: intl.get(choice.key) })
    }
    return options
}
