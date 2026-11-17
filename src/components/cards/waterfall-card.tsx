import * as React from "react"
import { useRef } from "react"
import { makeStyles, mergeClasses } from "@griffel/react"
import { Card } from "./card"
import Highlights from "./highlights"
import Time from "../utils/time"
import { RSSItem } from "../../scripts/models/item"
import { RSSSource } from "../../scripts/models/source"
import { FeedFilter } from "../../scripts/models/feed"

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
        "transition": "box-shadow 0.15s",
        ":hover": {
            boxShadow: "#00000029 0 6px 20px",
        },
    },
    itemRead: {
        opacity: 0.75,
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
    // ---------- folded (multi-picture article, collapsed into a stack) --------
    stack: {
        position: "relative",
        width: "100%",
        height: "100%",
    },
    // Sheets peeking out under the picture: this is what reads as "a stack".
    // The tile reserves STACK_PEEK (10px) below the picture for them.
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
    // The deeper sheet is narrower, so the stack reads as nested sheets rather
    // than one wide card behind the picture.
    sheetInner: {
        left: "10px",
        right: "10px",
        backgroundColor: "var(--neutralLighter)",
    },
    // Left/right flip buttons, vertically centred on the picture.
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
        opacity: 0,
        transition: "opacity 0.15s",
        zIndex: 2,
    },
    navVisible: {
        opacity: 1,
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
        "zIndex": 2,
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
        "zIndex": 2,
        ":hover": { backgroundColor: "#000000cc" },
    },
    // Later pictures of an expanded article: quiet position marker.
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
    // Expanded: this tile shows one specific picture.
    imageUrl?: string | null
    imageIndex?: number
    imageCount?: number
    // Folded: the article is a stack; this tile shows one picture at a time.
    folded?: boolean
    urls?: string[]
    currentIndex?: number
    onFlip?: (delta: number) => void
    onExpand?: () => void
    onCollapse?: () => void
    onRatio: (ratio: number, key: string) => void
    ratioKey: string
    style?: React.CSSProperties
}

const WaterfallCard: React.FunctionComponent<WaterfallCardProps> = props => {
    const styles = useStyles()
    const { item, source } = props
    const folded = Boolean(props.folded)
    const urls = props.urls || []
    const currentIndex = props.currentIndex || 0
    const imageUrl = folded
        ? urls[currentIndex] || item.thumb
        : props.imageUrl || item.thumb
    const imageCount = folded ? urls.length : props.imageCount || 1
    const firstOfArticle = folded || (props.imageIndex || 0) === 0

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
                item.hasRead && styles.itemRead
            )}
            {...Card.bindEventsToProps(props)}
            data-iid={item._id}
            data-fr-wf=""
            data-is-focusable
            style={props.style}>
            {imageUrl ? (
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
                                src={imageUrl}
                                loading="lazy"
                                onLoad={handleLoad}
                            />
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
                                            styles.navLeft,
                                            styles.navVisible
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
                                            styles.navRight,
                                            styles.navVisible
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
                                    title={"展开全部 " + imageCount + " 张"}
                                    aria-label={
                                        "展开全部 " + imageCount + " 张"
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
                            src={imageUrl}
                            loading="lazy"
                            onLoad={handleLoad}
                        />
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
                                {imageCount} 张 ▾
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
