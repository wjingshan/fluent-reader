import * as React from "react"
import intl from "react-intl-universal"
import { makeStyles } from "@griffel/react"
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
    cover: {
        backgroundColor: "var(--neutralLight)",
        flexShrink: 0,
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

export type LayoutPreviewProps = {
    view: ViewType
    config: LayoutConfig
}

const previewText = () => ({
    title: intl.get("layout.sampleTitle"),
    snippet: intl.get("layout.sampleSnippet"),
    meta: intl.get("layout.sampleMeta"),
})

function cardsStage(config: LayoutConfig, classes: any): Stage {
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
                    style={{ height: `${coverHeight}px` }}
                />
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

function listStage(config: LayoutConfig, classes: any): Stage {
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
                    }}
                />
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

function magazineStage(config: LayoutConfig, classes: any): Stage {
    const cover = config.magazineCoverHeight
    // The row is as tall as the taller of the cover and the text block.
    const textHeight =
        2 * (config.cardTitleSize + 11) +
        6 +
        2 * (config.cardSnippetSize + 7) +
        16
    const height = Math.max(cover, textHeight)
    const text = previewText()
    return {
        width: STAGE_WIDTH,
        height,
        content: (
            <div
                className={classes.rowCard}
                style={{
                    width: `${STAGE_WIDTH}px`,
                    height: `${height}px`,
                    padding: "24px",
                    fontFamily: cardFontStack(config.cardFont),
                }}>
                <div
                    className={classes.cover}
                    style={{
                        width: `${Math.round(cover * 1.25)}px`,
                        height: `${cover}px`,
                        marginRight: "25px",
                    }}
                />
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

function waterfallStage(config: LayoutConfig, classes: any): Stage {
    const gap = config.waterfallGap
    const minWidth = config.waterfallMinColumnWidth
    const columns = Math.max(
        1,
        Math.min(3, Math.floor((STAGE_WIDTH + gap) / (minWidth + gap)))
    )
    const columnWidth = (columns * minWidth + gap * (columns - 1)) / columns
    const heights = [minWidth * 1.1, minWidth * 0.72, minWidth * 1.35].slice(
        0,
        columns
    )
    const blocks = heights.map((height, index) => (
        <div
            key={index}
            className={classes.card}
            style={{
                width: `${columnWidth}px`,
                height: `${height}px`,
                marginRight: index === columns - 1 ? 0 : `${gap}px`,
                flexShrink: 0,
                flexGrow: 1,
                backgroundColor: "var(--neutralLight)",
            }}
        />
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

export function LayoutPreview({ view, config }: LayoutPreviewProps) {
    const classes = useStyles()
    let stage: Stage
    switch (view) {
        case ViewType.List:
            stage = listStage(config, classes)
            break
        case ViewType.Magazine:
            stage = magazineStage(config, classes)
            break
        case ViewType.Compact:
            stage = compactStage(config, classes)
            break
        case ViewType.Customized:
            stage = waterfallStage(config, classes)
            break
        default:
            stage = cardsStage(config, classes)
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
