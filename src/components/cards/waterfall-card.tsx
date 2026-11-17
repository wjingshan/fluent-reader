import * as React from "react"
import { useRef } from "react"
import { makeStyles, mergeClasses } from "@griffel/react"
import { Card } from "./card"
import Highlights from "./highlights"
import Time from "../utils/time"
import { RSSItem } from "../../scripts/models/item"
import { RSSSource } from "../../scripts/models/source"
import { FeedFilter } from "../../scripts/models/feed"

/** One thing a tile can show: a picture, or a clip (shown as its poster). */
export type WaterfallMedia = {
    kind: "image" | "video"
    url: string
    poster?: string | null
}

// The card is a picture with an overlay; the height follows the picture's own
// aspect ratio, which is what makes the column layout a waterfall.
const useStyles = makeStyles({
    item: {
        "position": "absolute",
        "borderRadius": "4px",
        "overflow": "hidden",
        "backgroundColor": "var(--white)",
        "boxShadow": "#00000014 0 2px 8px",
        "cursor": "pointer",
        "transition": "box-shadow 0.15s, opacity 0.2s",
        ":hover": {
            boxShadow: "#00000029 0 6px 20px",
        },
    },
    itemRead: {
        opacity: 0.75,
    },
    // While one article is expanded, everything else recedes so the group of
    // tiles that belong together stands out.
    dimmed: {
        opacity: 0.3,
    },
    thumb: {
        position: "relative",
        width: "100%",
        overflow: "hidden",
        backgroundColor: "var(--neutralLighter)",
    },
    image: {
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "cover",
    },
    // A clip tile shows its poster with this marker; hovering plays the clip
    // through the media patch, which lays a video over the tile.
    videoBadge: {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "34px",
        height: "34px",
        borderRadius: "50%",
        backgroundColor: "#000000b3",
        color: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "13px",
        lineHeight: 1,
        pointerEvents: "none",
        zIndex: 15,
    },
    overlay: {
        "position": "absolute",
        "inset": 0,
        "display": "flex",
        "flexDirection": "column",
        "justifyContent": "flex-end",
        "padding": "10px 12px",
        "backgroundImage":
            "linear-gradient(180deg, #00000000 40%, #000000b3 100%)",
        "opacity": 0,
        "transition": "opacity 0.15s",
        ":hover": {
            opacity: 1,
        },
    },
    title: {
        "margin": 0,
        "color": "#ffffff",
        "fontSize": "13px",
        "fontWeight": 600,
        "lineHeight": "18px",
        "display": "-webkit-box",
        "-webkit-line-clamp": "3",
        "-webkit-box-orient": "vertical",
        "overflow": "hidden",
        "textShadow": "0 1px 3px #00000099",
    },
    sub: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "4px",
        color: "#ffffffe6",
        fontSize: "11px",
        lineHeight: "16px",
        textShadow: "0 1px 3px #00000099",
    },
    subName: {
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    favicon: {
        width: "12px",
        height: "12px",
        borderRadius: "2px",
        flexShrink: 0,
    },
    unread: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        backgroundColor: "#ffaa44",
        flexShrink: 0,
    },
    starred: {
        color: "#ffaa44",
        flexShrink: 0,
    },
    // ---------- folded (multi-item article, collapsed into a stack) ----------
    stack: {
        position: "relative",
        width: "100%",
        height: "100%",
    },
    // Sheets peeking out under the picture: this is what reads as "a stack".
    // The tile reserves a 10px band below the picture for them.
    sheet: {
        position: "absolute",
        left: "5px",
        right: "5px",
        top: 0,
        height: "calc(100% - 10px)",
        borderRadius: "4px",
        backgroundColor: "var(--neutralLight)",
        border: "1px solid var(--neutralQuaternaryAlt)",
    },
    // The deeper sheet is narrower, so the stack reads as nested sheets.
    sheetInner: {
        left: "10px",
        right: "10px",
        backgroundColor: "var(--neutralLighter)",
    },
    // Controls sit above the hover-preview video (the media patch gives it
    // z-index 4) and the Eagle button (7), or a clip tile would hide them.
    nav: {
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        width: "22px",
        height: "22px",
        padding: 0,
        border: "none",
        borderRadius: "50%",
        backgroundColor: "#0000008c",
        color: "#ffffff",
        fontSize: "14px",
        lineHeight: "22px",
        textAlign: "center",
        cursor: "pointer",
        zIndex: 20,
    },
    navLeft: { left: "6px" },
    navRight: { right: "6px" },
    // "2/5 ⤢" pill: shows the position and expands the article into tiles.
    expand: {
        "position": "absolute",
        "right": "6px",
        "bottom": "6px",
        "padding": "1px 7px",
        "border": "none",
        "borderRadius": "9px",
        "backgroundColor": "#000000a6",
        "color": "#ffffff",
        "fontSize": "11px",
        "lineHeight": "18px",
        "fontFamily": "inherit",
        "cursor": "pointer",
        "zIndex": 20,
        ":hover": { backgroundColor: "#000000cc" },
    },
    // Collapse control on the first tile of an expanded article.
    collapse: {
        "position": "absolute",
        "left": "6px",
        "bottom": "6px",
        "padding": "1px 7px",
        "border": "none",
        "borderRadius": "9px",
        "backgroundColor": "#000000a6",
        "color": "#ffffff",
        "fontSize": "11px",
        "lineHeight": "18px",
        "fontFamily": "inherit",
        "cursor": "pointer",
        "zIndex": 20,
        ":hover": { backgroundColor: "#000000cc" },
    },
    // Later items of an expanded article: quiet position marker.
    pageBadge: {
        position: "absolute",
        top: "6px",
        right: "6px",
        padding: "1px 6px",
        borderRadius: "8px",
        backgroundColor: "#000000a6",
        color: "#ffffff",
        fontSize: "11px",
        lineHeight: "16px",
        pointerEvents: "none",
        zIndex: 20,
    },
    textCard: {
        padding: "12px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "var(--white)",
    },
    textTitle: {
        "margin": 0,
        "fontSize": "13px",
        "fontWeight": 600,
        "lineHeight": "18px",
        "display": "-webkit-box",
        "-webkit-line-clamp": "4",
        "-webkit-box-orient": "vertical",
        "overflow": "hidden",
    },
    textSub: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        color: "var(--neutralSecondary)",
        fontSize: "11px",
        lineHeight: "16px",
    },
})

export type WaterfallCardProps = Card.Props & {
    // The item this tile shows.
    media?: WaterfallMedia | null
    // Expanded mode: this tile is one of several, at imageIndex.
    imageIndex?: number
    imageCount?: number
    // Folded mode: one tile showing one item at a time, with flipping.
    folded?: boolean
    allMedia?: WaterfallMedia[]
    currentIndex?: number
    onFlip?: (delta: number) => void
    onExpand?: () => void
    onCollapse?: () => void
    // Another article is expanded, so this tile steps back.
    dimmed?: boolean
    onRatio: (ratio: number, key: string) => void
    ratioKey: string
    style?: React.CSSProperties
}

const WaterfallCard: React.FunctionComponent<WaterfallCardProps> = props => {
    const styles = useStyles()
    const { item, source } = props
    const folded = Boolean(props.folded)
    const currentIndex = props.currentIndex || 0
    const allMedia = props.allMedia || []
    const current: WaterfallMedia | null = folded
        ? allMedia[currentIndex] || props.media || null
        : props.media || null
    const imageCount = folded ? allMedia.length : props.imageCount || 1
    const firstOfArticle = folded || (props.imageIndex || 0) === 0

    // A clip tile has no picture of its own: fall back to the poster, then to
    // the article thumbnail.
    const isVideo = current?.kind === "video"
    const displayUrl =
        (isVideo ? current?.poster : current?.url) || current?.url || item.thumb

    // A folded stack keeps the height of its first picture: flipping must not
    // re-flow the whole column.
    const reported = useRef(false)
    const handleLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
        const img = event.currentTarget
        if (!img.naturalWidth || !img.naturalHeight) return
        if (folded && reported.current) return
        reported.current = true
        props.onRatio(img.naturalHeight / img.naturalWidth, props.ratioKey)
    }

    const stop = (event: React.MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
    }

    const unread = !item.hasRead
    const starred = item.starred

    const meta = (
        <>
            {source.iconurl ? (
                <img className={styles.favicon} src={source.iconurl} />
            ) : null}
            <span className={styles.subName}>{source.name}</span>
            {unread ? <span className={styles.unread} /> : null}
            {starred ? <span className={styles.starred}>★</span> : null}
            <Time date={item.date} />
        </>
    )

    const canFlip = folded && imageCount > 1

    return (
        <div
            className={mergeClasses(
                styles.item,
                item.hasRead && styles.itemRead,
                props.dimmed && styles.dimmed
            )}
            {...Card.bindEventsToProps(props)}
            data-iid={item._id}
            data-fr-wf=""
            data-is-focusable
            style={props.style}>
            {displayUrl ? (
                folded ? (
                    <div className={styles.stack}>
                        {imageCount > 2 ? (
                            <span
                                className={mergeClasses(
                                    styles.sheet,
                                    styles.sheetInner
                                )}
                                style={{ top: "8px" }}
                            />
                        ) : null}
                        {imageCount > 1 ? (
                            <span
                                className={styles.sheet}
                                style={{ top: "4px" }}
                            />
                        ) : null}
                        <div
                            className={styles.thumb}
                            style={{ height: "calc(100% - 10px)" }}>
                            <img
                                className={styles.image}
                                src={displayUrl}
                                loading="lazy"
                                onLoad={handleLoad}
                            />
                            {isVideo ? (
                                <span className={styles.videoBadge}>▶</span>
                            ) : null}
                            <div className={styles.overlay}>
                                <h3 className={styles.title}>
                                    <Highlights
                                        text={item.title}
                                        filter={props.filter}
                                        title
                                    />
                                </h3>
                                <div className={styles.sub}>{meta}</div>
                            </div>
                            {canFlip ? (
                                <>
                                    <button
                                        type="button"
                                        title="上一张"
                                        aria-label="上一张"
                                        className={mergeClasses(
                                            styles.nav,
                                            styles.navLeft
                                        )}
                                        onClick={event => {
                                            stop(event)
                                            props.onFlip?.(-1)
                                        }}
                                        onMouseUp={event => {
                                            if (event.button !== 2) stop(event)
                                        }}
                                        onDoubleClick={stop}>
                                        ‹
                                    </button>
                                    <button
                                        type="button"
                                        title="下一张"
                                        aria-label="下一张"
                                        className={mergeClasses(
                                            styles.nav,
                                            styles.navRight
                                        )}
                                        onClick={event => {
                                            stop(event)
                                            props.onFlip?.(1)
                                        }}
                                        onMouseUp={event => {
                                            if (event.button !== 2) stop(event)
                                        }}
                                        onDoubleClick={stop}>
                                        ›
                                    </button>
                                </>
                            ) : null}
                            {imageCount > 1 ? (
                                <button
                                    type="button"
                                    title={"展开全部 " + imageCount + " 项"}
                                    aria-label={
                                        "展开全部 " + imageCount + " 项"
                                    }
                                    className={styles.expand}
                                    onClick={event => {
                                        stop(event)
                                        props.onExpand?.()
                                    }}
                                    onMouseUp={event => {
                                        if (event.button !== 2) stop(event)
                                    }}
                                    onDoubleClick={stop}>
                                    {currentIndex + 1}/{imageCount} ⤢
                                </button>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <div className={styles.thumb} style={{ height: "100%" }}>
                        <img
                            className={styles.image}
                            src={displayUrl}
                            loading="lazy"
                            onLoad={handleLoad}
                        />
                        {isVideo ? (
                            <span className={styles.videoBadge}>▶</span>
                        ) : null}
                        {firstOfArticle ? (
                            <div className={styles.overlay}>
                                <h3 className={styles.title}>
                                    <Highlights
                                        text={item.title}
                                        filter={props.filter}
                                        title
                                    />
                                </h3>
                                <div className={styles.sub}>{meta}</div>
                            </div>
                        ) : (
                            <span className={styles.pageBadge}>
                                {(props.imageIndex || 0) + 1}/{imageCount}
                            </span>
                        )}
                        {firstOfArticle && imageCount > 1 ? (
                            <button
                                type="button"
                                title="收起"
                                aria-label="收起"
                                className={styles.collapse}
                                onClick={event => {
                                    stop(event)
                                    props.onCollapse?.()
                                }}
                                onMouseUp={event => {
                                    if (event.button !== 2) stop(event)
                                }}
                                onDoubleClick={stop}>
                                {imageCount} 项 ▾
                            </button>
                        ) : null}
                    </div>
                )
            ) : (
                <div className={styles.textCard}>
                    <h3 className={styles.textTitle}>
                        <Highlights
                            text={item.title}
                            filter={props.filter}
                            title
                        />
                    </h3>
                    <div className={styles.textSub}>{meta}</div>
                </div>
            )}
        </div>
    )
}

export default WaterfallCard
