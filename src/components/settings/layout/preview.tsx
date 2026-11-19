import * as React from "react"
import { useEffect, useState } from "react"
import intl from "react-intl-universal"
import { makeStyles, mergeClasses } from "@griffel/react"
import { LayoutConfig, ViewType } from "../../../schema-types"
import { cardFontStack } from "../../../scripts/layout"

// The settings sheet covers the whole window, so adjusting a slider would
// otherwise be blind: this draws the same geometry the feeds use (cell sizes,
// gutters, type size, family) at 1:1 and scales the whole stage down only when
// it would not fit.
const FRAME_WIDTH = 620
const FRAME_HEIGHT = 190
const STAGE_WIDTH = FRAME_WIDTH - 16
const STAGE_HEIGHT = FRAME_HEIGHT - 16

const useStyles = makeStyles({
    frame: {
        position: "relative",
        height: `${FRAME_HEIGHT}px`,
        overflow: "hidden",
        backgroundColor: "var(--neutralLighter)",
        border: "1px solid var(--neutralQuaternaryAlt)",
        borderRadius: "4px",
        boxSizing: "border-box",
        padding: "8px",
        userSelect: "none",
    },
    stage: { transformOrigin: "top left" },
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

function cardsStage(config: LayoutConfig, classes: any, thumb: string): Stage {
    const gap = config.cardGap
    const rowGap = Math.round(gap * 1.5)
    const cellWidth = config.cardsColumnWidth
    const cellHeight = config.cardsRowHeight
    const cardWidth = cellWidth - gap * 2
    // 4px of the cell stays free, exactly like the original 304 / 264 + 2×18.
    const cardHeight = cellHeight - rowGap * 2 - 4
    // The real cover band is a fixed 144px regardless of card height.
    const coverHeight = Math.min(144, Math.max(40, cardHeight * 0.55))
    const columns = Math.max(
        1,
        Math.min(3, Math.floor(STAGE_WIDTH / cellWidth))
    )
    const text = previewText()
    const family = cardFontStack(config.cardFont)
    const cards = Array.from({ length: columns }, (_, index) => (
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
                    <Cover src={thumb} size={Math.max(16, coverHeight * 0.3)} />
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
                        }}>
                        {text.snippet}
                    </div>
                </div>
            </div>
        </div>
    ))
    return {
        width: columns * cellWidth,
        height: cellHeight,
        content: (
            <div style={{ display: "flex", alignItems: "flex-start" }}>
                {cards}
            </div>
        ),
    }
}

function listStage(config: LayoutConfig, classes: any, thumb: string): Stage {
    const cover = config.listCoverHeight
    const text = previewText()
    return {
        width: STAGE_WIDTH,
        height: Math.max(cover + 16, 72),
        content: (
            <div
                className={classes.rowCard}
                style={{
                    width: `${STAGE_WIDTH}px`,
                    height: `${Math.max(cover + 16, 72)}px`,
                    fontFamily: cardFontStack(config.cardFont),
                }}>
                <div
                    className={classes.cover}
                    style={{
                        width: `${cover}px`,
                        height: `${cover}px`,
                        margin: "8px 0 8px 10px",
                    }}>
                    <Cover src={thumb} size={Math.max(14, cover * 0.28)} />
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
                            fontSize: `${config.listTitleSize}px`,
                            lineHeight: `calc(${config.listTitleSize}px + 4px)`,
                            WebkitLineClamp: "2",
                        }}>
                        {text.title}
                    </div>
                    <div
                        className={classes.snippet}
                        style={{
                            fontSize: `${config.cardSnippetSize - 2}px`,
                            lineHeight: `calc(${config.cardSnippetSize}px + 2px)`,
                            marginTop: "2px",
                            WebkitLineClamp: "1",
                        }}>
                        {text.snippet}
                    </div>
                </div>
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
    // The row is as tall as the taller of the cover and the text block.
    const textHeight =
        2 * (config.cardTitleSize + 11) +
        6 +
        2 * (config.cardSnippetSize + 7) +
        16
    const height = Math.max(cover, textHeight)
    // Drawn at its real configured width; the stage is scaled down to fit, so
    // the cover-to-text ratio stays truthful.
    const width = config.magazineWidth
    const text = previewText()
    return {
        width,
        height,
        content: (
            <div
                className={classes.rowCard}
                style={{
                    width: `${width}px`,
                    height: `${height}px`,
                    padding: "24px",
                    // "Follow the theme" reads as the white page the real view
                    // sits on; a chosen colour shows as-is.
                    backgroundColor:
                        config.magazineBackground || "var(--white)",
                    fontFamily: cardFontStack(config.cardFont),
                }}>
                <div
                    className={classes.cover}
                    style={{
                        width: `${Math.round(cover * 1.25)}px`,
                        height: `${cover}px`,
                        marginRight: "25px",
                    }}>
                    <Cover src={thumb} size={Math.max(14, cover * 0.3)} />
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
                                lineHeight: `calc(${
                                    config.cardTitleSize + 11
                                }px)`,
                                WebkitLineClamp: "2",
                            }}>
                            {text.title}
                        </div>
                        <div
                            className={classes.snippet}
                            style={{
                                fontSize: `${config.cardSnippetSize}px`,
                                lineHeight: `calc(${
                                    config.cardSnippetSize + 7
                                }px)`,
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
        ),
    }
}

function compactStage(config: LayoutConfig, classes: any): Stage {
    const rowHeight = config.compactRowHeight
    const line = Math.max(12, rowHeight - 13)
    const text = previewText()
    return {
        width: STAGE_WIDTH,
        height: rowHeight,
        content: (
            <div
                className={classes.rowCard}
                style={{
                    width: `${STAGE_WIDTH}px`,
                    height: `${rowHeight}px`,
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
                            whiteSpace: "nowrap",
                        }}>
                        {text.snippet}
                    </span>
                </div>
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
    // Same rule as the feed: fit as many minimum-width columns as possible, then
    // honour the cap (0 = no cap).
    const natural = Math.max(
        1,
        Math.floor((STAGE_WIDTH + gap) / (minWidth + gap))
    )
    const columns = Math.min(
        natural,
        config.waterfallMaxColumns > 0 ? config.waterfallMaxColumns : natural
    )
    const columnWidth = (columns * minWidth + gap * (columns - 1)) / columns
    const heights = [minWidth * 1.1, minWidth * 0.72, minWidth * 1.35].slice(
        0,
        columns
    )
    // Crop the single available picture to a different part per column, so three
    // side-by-side tiles do not read as one image duplicated.
    const offsets = ["20% 50%", "50% 50%", "80% 50%"]
    const text = previewText()
    const blocks = heights.map((height, index) => (
        <div
            key={index}
            className={mergeClasses(classes.card, classes.cover)}
            style={{
                width: `${columnWidth}px`,
                height: `${height}px`,
                marginRight: index === columns - 1 ? 0 : `${gap}px`,
                flexShrink: 0,
                flexGrow: 1,
                fontFamily: cardFontStack(config.cardFont),
            }}>
            <Cover
                src={thumb}
                size={Math.max(16, Math.round(columnWidth * 0.16))}
                position={offsets[index % offsets.length]}
            />
            {thumb ? <div className={classes.scrim} /> : null}
            <span
                style={{
                    position: "absolute",
                    left: "6px",
                    right: "6px",
                    bottom: "6px",
                    fontSize: `${Math.max(9, config.cardTitleSize - 3)}px`,
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
        </div>
    ))
    return {
        width: columns * columnWidth + gap * (columns - 1),
        height: Math.max(...heights),
        content: (
            <div style={{ display: "flex", alignItems: "flex-start" }}>
                {blocks}
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
