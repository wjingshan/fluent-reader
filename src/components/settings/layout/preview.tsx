import * as React from "react"
import { useEffect, useState } from "react"
import intl from "react-intl-universal"
import { makeStyles, mergeClasses } from "@griffel/react"
import { LayoutConfig, ViewType } from "../../../schema-types"
import { cardFontStack } from "../../../scripts/layout"

// The settings sheet covers the whole window, so adjusting a slider would
// otherwise be blind: this draws the same geometry the feeds use (cell sizes,
// gutters, type size, family) and scales the whole stage down only when it would
// not fit. Each stage is built to fill the frame: the views whose rows are
// shorter than the frame stack enough rows to run past the bottom edge, so the
// frame reads as a window onto the real feed instead of one lonely row.
const FRAME_WIDTH = 620
// Tall enough for a few rows of every view; at 174px only one row of any view
// fitted, which made the per-view sliders impossible to judge.
const FRAME_HEIGHT = 340
const STAGE_WIDTH = FRAME_WIDTH - 16
const STAGE_HEIGHT = FRAME_HEIGHT - 16

const useStyles = makeStyles({
    // Centring the stage is the point for the magazine view: its cards are
    // centred in the window, so a narrower stage reads as the real thing.
    frame: {
        position: "relative",
        height: `${FRAME_HEIGHT}px`,
        overflow: "hidden",
        backgroundColor: "var(--neutralLighter)",
        border: "1px solid var(--neutralQuaternaryAlt)",
        borderRadius: "4px",
        boxSizing: "border-box",
        padding: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
    },
    stage: { flexShrink: 0, transformOrigin: "top left" },
    card: {
        boxSizing: "border-box",
        backgroundColor: "var(--white)",
        boxShadow: "#0000001f 0 2px 8px",
        borderRadius: "4px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
    },
    rowCard: {
        boxSizing: "border-box",
        backgroundColor: "var(--white)",
        display: "flex",
        alignItems: "flex-start",
        overflow: "hidden",
        borderBottom: "1px solid var(--neutralQuaternaryAlt)",
    },
    // Fallback for a cover with no picture: a soft gradient plus a glyph reads
    // as an image placeholder instead of a flat grey box. Real thumbnails are
    // drawn on top of it by `coverImg`.
    cover: {
        position: "relative",
        backgroundColor: "var(--neutralLight)",
        backgroundImage:
            "linear-gradient(135deg, var(--neutralQuaternaryAlt) 0%, var(--neutralLight) 55%, var(--neutralLighter) 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--neutralTertiary)",
        flexShrink: 0,
        overflow: "hidden",
    },
    coverImg: {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
    },
    scrim: {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundImage:
            "linear-gradient(180deg, #00000000 40%, #000000b3 100%)",
    },
    title: {
        "fontWeight": 600,
        "color": "var(--neutralDarker)",
        "display": "-webkit-box",
        "-webkit-box-orient": "vertical",
        "overflow": "hidden",
    },
    snippet: {
        "color": "var(--neutralSecondary)",
        "display": "-webkit-box",
        "-webkit-box-orient": "vertical",
        "overflow": "hidden",
    },
    meta: { color: "var(--neutralTertiary)", whiteSpace: "nowrap" },
})

type Stage = {
    width: number
    height: number
    content: React.ReactNode
}

/** Picture glyph so an empty cover reads as an image slot, not an error. */
function CoverGlyph({ size }: { size: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 20 20"
            aria-hidden="true"
            focusable="false">
            <path
                d="M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v11A1.5 1.5 0 0 1 15.5 17h-11A1.5 1.5 0 0 1 3 15.5v-11Zm1.5 7.34 2.6-2.6a1 1 0 0 1 1.41 0L11 11.6l1.1-1.1a1 1 0 0 1 1.41 0l2-2V4.5h-11v7.34Zm11 2.16v-.79l-2-2-1.1 1.1 2.6 2.6h.5v-.91ZM6.75 8.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z"
                fill="currentColor"
            />
        </svg>
    )
}

/**
 * A real thumbnail from the user's own feeds, falling back to the gradient and
 * glyph when there is none (fresh install, empty database) or the picture fails
 * to load, so the preview never shows a broken-image box.
 */
function Cover({
    src,
    size,
    position,
}: {
    src?: string
    size: number
    position?: string
}) {
    const classes = useStyles()
    const [failed, setFailed] = useState(false)
    // A new picture deserves a new attempt; the failure is per-src, not global.
    useEffect(() => setFailed(false), [src])
    if (src && !failed) {
        return (
            <img
                className={classes.coverImg}
                src={src}
                alt=""
                draggable={false}
                style={position ? { objectPosition: position } : undefined}
                onError={() => setFailed(true)}
            />
        )
    }
    return <CoverGlyph size={size} />
}

export type LayoutPreviewProps = {
    view: ViewType
    config: LayoutConfig
    /** Cover picture taken from the newest article that has one. */
    thumb?: string
}

const previewText = () => ({
    title: intl.get("layout.sampleTitle"),
    snippet: intl.get("layout.sampleSnippet"),
    meta: intl.get("layout.sampleMeta"),
})

// Crops so a repeated picture does not look like the same photo pasted twice.
const COVER_OFFSETS = ["50% 50%", "20% 30%", "80% 20%", "35% 70%", "65% 45%"]

/**
 * Column count whose grid has the closest aspect ratio to the frame.
 *
 * A card grid has to shrink to fit, and a grid whose aspect ratio differs from
 * the frame's leaves a strip of empty background on one side. Choosing the count
 * that matches the frame is what keeps the preview filled in both directions
 * while the cards themselves stay at their real, configured proportions.
 */
function fitColumns(cellWidth: number, cellHeight: number, rows: number) {
    const frameAspect = STAGE_WIDTH / STAGE_HEIGHT
    let best = 1
    let bestError = Number.POSITIVE_INFINITY
    for (let columns = 1; columns <= 8; columns += 1) {
        const aspect = (columns * cellWidth) / (rows * cellHeight)
        const error = Math.abs(aspect - frameAspect)
        if (error < bestError) {
            bestError = error
            best = columns
        }
    }
    return best
}

function cardsStage(config: LayoutConfig, classes: any, thumb: string): Stage {
    const gap = config.cardGap
    const rowGap = Math.round(gap * 1.5)
    const cardWidth = config.cardsColumnWidth
    // The cell also holds the card's two gutters, exactly like the feed.
    const cellWidth = cardWidth + gap * 2
    const cellHeight = config.cardsRowHeight
    // 4px of the cell stays free, exactly like the original 304 / 264 + 2×18.
    const cardHeight = cellHeight - rowGap * 2 - 4
    // The real cover band is a fixed 144px regardless of card height.
    const coverHeight = Math.min(144, Math.max(40, cardHeight * 0.55))
    const rows = 2
    const columns = fitColumns(cellWidth, cellHeight, rows)
    const text = previewText()
    const family = cardFontStack(config.cardFont)

    const cell = (index: number) => {
        const column = index % columns
        const row = Math.floor(index / columns)
        return (
            <div
                key={index}
                style={{
                    width: `${cellWidth}px`,
                    height: `${cellHeight}px`,
                    boxSizing: "border-box",
                    padding: `${rowGap}px ${gap}px`,
                    flexShrink: 0,
                }}>
                <div
                    className={classes.card}
                    style={{
                        width: `${cardWidth}px`,
                        height: `${cardHeight}px`,
                        fontFamily: family,
                    }}>
                    <div
                        className={classes.cover}
                        style={{ height: `${coverHeight}px` }}>
                        <Cover
                            src={thumb}
                            size={Math.max(16, coverHeight * 0.3)}
                            position={COVER_OFFSETS[(column + row) % 5]}
                        />
                    </div>
                    <div style={{ padding: "6px 10px", overflow: "hidden" }}>
                        <div
                            className={classes.title}
                            style={{
                                fontSize: `${config.cardTitleSize}px`,
                                lineHeight: `calc(${config.cardTitleSize}px + 6px)`,
                            }}>
                            {text.title}
                        </div>
                        <div
                            className={classes.snippet}
                            style={{
                                fontSize: `${config.cardSnippetSize}px`,
                                lineHeight: `calc(${config.cardSnippetSize}px + 6px)`,
                                marginTop: "4px",
                                WebkitLineClamp: "3",
                            }}>
                            {text.snippet}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return {
        width: columns * cellWidth,
        height: rows * cellHeight,
        content: (
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                    width: `${columns * cellWidth}px`,
                    height: `${rows * cellHeight}px`,
                }}>
                {Array.from({ length: columns * rows }, (_, index) =>
                    cell(index)
                )}
            </div>
        ),
    }
}

function listStage(config: LayoutConfig, classes: any, thumb: string): Stage {
    const cover = config.listCoverHeight
    const titleSize = config.listTitleSize
    const snippetSize = config.cardSnippetSize - 2
    const lines = config.listSnippetLines
    const text = previewText()
    // info row + its margin, two title lines and the snippet lines.
    const contentHeight = 24 + 2 * (titleSize + 4) + lines * (snippetSize + 2)
    const rowHeight = Math.max(cover + 16, contentHeight, 72)
    // Rows run past the bottom edge on purpose: the frame is a window on a
    // scrolling list, and 3-4 rows is what the user asked to see.
    const rows = Math.max(4, Math.ceil(STAGE_HEIGHT / rowHeight) + 1)

    const row = (index: number) => (
        <div
            key={index}
            className={classes.rowCard}
            style={{
                width: `${STAGE_WIDTH}px`,
                height: `${rowHeight}px`,
                fontFamily: cardFontStack(config.cardFont),
            }}>
            <div
                className={classes.cover}
                style={{
                    width: `${cover}px`,
                    height: `${cover}px`,
                    margin: "8px 0 8px 10px",
                }}>
                <Cover
                    src={thumb}
                    size={Math.max(14, cover * 0.28)}
                    position={COVER_OFFSETS[index % 5]}
                />
            </div>
            <div
                style={{
                    flexGrow: 1,
                    minWidth: 0,
                    margin: "8px 10px",
                    overflow: "hidden",
                }}>
                <div
                    className={classes.meta}
                    style={{ fontSize: "11px", marginBottom: "4px" }}>
                    {text.meta}
                </div>
                <div
                    className={classes.title}
                    style={{
                        fontSize: `${titleSize}px`,
                        lineHeight: `calc(${titleSize}px + 4px)`,
                        WebkitLineClamp: "2",
                    }}>
                    {text.title}
                </div>
                <div
                    className={classes.snippet}
                    style={{
                        fontSize: `${snippetSize}px`,
                        lineHeight: `calc(${snippetSize}px + 2px)`,
                        marginTop: "2px",
                        WebkitLineClamp: String(lines),
                    }}>
                    {text.snippet}
                </div>
            </div>
        </div>
    )

    return {
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        content: (
            <div style={{ display: "flex", flexDirection: "column" }}>
                {Array.from({ length: rows }, (_, index) => row(index))}
            </div>
        ),
    }
}

function magazineStage(
    config: LayoutConfig,
    classes: any,
    thumb: string
): Stage {
    const cover = config.magazineCoverHeight
    const inset = config.magazineInset
    // Same rule as the card: fill the window minus the inset on each side, never
    // past the historical 700px.
    const width = Math.max(160, Math.min(STAGE_WIDTH, 700) - inset * 2)
    const textHeight =
        2 * (config.cardTitleSize + 11) +
        6 +
        2 * (config.cardSnippetSize + 7) +
        16
    const contentHeight = Math.max(cover, textHeight)
    // 24px padding above and below, as the static sheet has it.
    const height = contentHeight + 48
    const text = previewText()
    const rows = 2

    const row = (index: number) => (
        <div
            key={index}
            className={classes.rowCard}
            style={{
                width: `${width}px`,
                height: `${height}px`,
                padding: "24px",
                // "Follow the theme" reads as the white page the real view
                // sits on; a chosen colour shows as-is.
                backgroundColor: config.magazineBackground || "var(--white)",
                fontFamily: cardFontStack(config.cardFont),
            }}>
            <div
                className={classes.cover}
                style={{
                    width: `${Math.round(cover * 1.25)}px`,
                    height: `${cover}px`,
                    marginRight: "25px",
                }}>
                <Cover
                    src={thumb}
                    size={Math.max(14, cover * 0.3)}
                    position={COVER_OFFSETS[index % 5]}
                />
            </div>
            <div
                style={{
                    flexGrow: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                }}>
                <div>
                    <div
                        className={classes.title}
                        style={{
                            fontSize: `${config.cardTitleSize + 2}px`,
                            lineHeight: `calc(${config.cardTitleSize + 11}px)`,
                            WebkitLineClamp: "2",
                        }}>
                        {text.title}
                    </div>
                    <div
                        className={classes.snippet}
                        style={{
                            fontSize: `${config.cardSnippetSize}px`,
                            lineHeight: `calc(${config.cardSnippetSize + 7}px)`,
                            marginTop: "6px",
                            WebkitLineClamp: "2",
                        }}>
                        {text.snippet}
                    </div>
                </div>
                <div className={classes.meta} style={{ fontSize: "11px" }}>
                    {text.meta}
                </div>
            </div>
        </div>
    )

    return {
        width,
        height: rows * height,
        content: (
            <div style={{ display: "flex", flexDirection: "column" }}>
                {Array.from({ length: rows }, (_, index) => row(index))}
            </div>
        ),
    }
}

function compactStage(config: LayoutConfig, classes: any): Stage {
    const line = Math.max(12, config.compactRowHeight - 13)
    const lines = config.compactSnippetLines
    // Mirrors --fr-compact-min-height: the row grows with the extra snippet
    // lines instead of clipping them.
    const rowHeight = Math.max(
        config.compactRowHeight,
        8 + line + lines * (line - 2)
    )
    const text = previewText()
    // Compact rows are short, so the frame holds many; the last one is cut off
    // like the bottom of a real scrolled list.
    const rows = Math.max(5, Math.ceil(STAGE_HEIGHT / rowHeight))

    const row = (index: number) => (
        <div
            key={index}
            className={classes.rowCard}
            style={{
                width: `${STAGE_WIDTH}px`,
                minHeight: `${rowHeight}px`,
                padding: "0 9px",
                alignItems: "center",
                fontFamily: cardFontStack(config.cardFont),
            }}>
            <div
                style={{
                    width: "140px",
                    flexShrink: 0,
                    fontSize: "12px",
                    color: "var(--neutralSecondary)",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                }}>
                {text.meta}
            </div>
            <div
                style={{
                    flexGrow: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    lineHeight: `${line}px`,
                    overflow: "hidden",
                }}>
                <span
                    style={{
                        fontSize: `${config.cardTitleSize - 2}px`,
                        fontWeight: 600,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                    }}>
                    {text.title}
                </span>
                <span
                    className={classes.snippet}
                    style={{
                        fontSize: `${config.cardSnippetSize - 2}px`,
                        lineHeight: `${Math.max(10, line - 2)}px`,
                        // One line is the original nowrap row; more lines wrap
                        // and clamp, exactly as the card does.
                        display: lines > 1 ? "-webkit-box" : "block",
                        WebkitLineClamp: String(lines),
                        whiteSpace: lines > 1 ? "normal" : "nowrap",
                        textOverflow: "ellipsis",
                    }}>
                    {text.snippet}
                </span>
            </div>
        </div>
    )

    return {
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        content: (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    height: `${STAGE_HEIGHT}px`,
                    overflow: "hidden",
                }}>
                {Array.from({ length: rows }, (_, index) => row(index))}
            </div>
        ),
    }
}

function waterfallStage(
    config: LayoutConfig,
    classes: any,
    thumb: string
): Stage {
    const gap = config.waterfallGap
    const minWidth = config.waterfallMinColumnWidth
    // Same rule as the feed: fit as many target-width columns as possible, then
    // let them share the whole stage so the preview fills its width instead of
    // leaving a strip of empty space on the right.
    const columns = Math.max(
        1,
        Math.floor((STAGE_WIDTH + gap) / (minWidth + gap))
    )
    const columnWidth = (STAGE_WIDTH - gap * (columns - 1)) / columns
    // Two stacked tiles per column, staggered so the grid reads as a waterfall
    // rather than a plain table.
    const topHeight = Math.round((STAGE_HEIGHT - gap) * 0.62)
    const bottomHeight = STAGE_HEIGHT - gap - topHeight
    const text = previewText()
    const tile = (height: number, index: number) => (
        <div
            key={index}
            className={mergeClasses(classes.card, classes.cover)}
            style={{
                width: `${columnWidth}px`,
                height: `${height}px`,
                flexShrink: 0,
                fontFamily: cardFontStack(config.cardFont),
            }}>
            <Cover
                src={thumb}
                size={Math.max(14, Math.round(columnWidth * 0.16))}
                position={COVER_OFFSETS[index % 5]}
            />
            {thumb ? <div className={classes.scrim} /> : null}
            {height > 60 ? (
                <span
                    style={{
                        position: "absolute",
                        left: "6px",
                        right: "6px",
                        bottom: "5px",
                        fontSize: `${Math.max(9, config.cardTitleSize - 4)}px`,
                        fontWeight: 600,
                        color: thumb ? "var(--white)" : "var(--neutralDark)",
                        textAlign: "center",
                        lineHeight: 1.25,
                        display: "-webkit-box",
                        WebkitLineClamp: "2",
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                    }}>
                    {text.title}
                </span>
            ) : null}
        </div>
    )
    return {
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        content: (
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: `${gap}px`,
                    width: `${STAGE_WIDTH}px`,
                    height: `${STAGE_HEIGHT}px`,
                }}>
                {Array.from({ length: columns }, (_, column) => (
                    <div
                        key={column}
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: `${gap}px`,
                            width: `${columnWidth}px`,
                        }}>
                        {tile(topHeight, column * 2)}
                        {tile(bottomHeight, column * 2 + 1)}
                    </div>
                ))}
            </div>
        ),
    }
}

export function LayoutPreview({
    view,
    config,
    thumb = "",
}: LayoutPreviewProps) {
    const classes = useStyles()
    let stage: Stage
    switch (view) {
        case ViewType.List:
            stage = listStage(config, classes, thumb)
            break
        case ViewType.Magazine:
            stage = magazineStage(config, classes, thumb)
            break
        case ViewType.Compact:
            stage = compactStage(config, classes)
            break
        case ViewType.Customized:
            stage = waterfallStage(config, classes, thumb)
            break
        default:
            stage = cardsStage(config, classes, thumb)
            break
    }
    const scale = Math.min(
        1,
        STAGE_WIDTH / stage.width,
        STAGE_HEIGHT / stage.height
    )
    return (
        <div className={classes.frame}>
            <div
                className={classes.stage}
                style={{
                    width: `${stage.width * scale}px`,
                    height: `${stage.height * scale}px`,
                    transform: `scale(${scale})`,
                }}>
                {stage.content}
            </div>
        </div>
    )
}

export default LayoutPreview
