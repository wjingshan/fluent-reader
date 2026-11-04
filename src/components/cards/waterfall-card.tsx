import * as React from "react"
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
        height: "100%",
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
    onRatio: (ratio: number) => void
    style?: React.CSSProperties
}

const WaterfallCard: React.FunctionComponent<WaterfallCardProps> = props => {
    const styles = useStyles()
    const { item, source } = props

    // The tile height already follows the picture's own aspect ratio, so the
    // picture just fills the tile; only the ratio itself has to be reported.
    const handleLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
        const img = event.currentTarget
        if (!img.naturalWidth || !img.naturalHeight) return
        props.onRatio(img.naturalHeight / img.naturalWidth)
    }

    const unread = !item.hasRead
    const starred = item.starred

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
            {item.thumb ? (
                <div className={styles.thumb}>
                    <img
                        className={styles.image}
                        src={item.thumb}
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
                        <div className={styles.sub}>
                            {source.iconurl ? (
                                <img
                                    className={styles.favicon}
                                    src={source.iconurl}
                                />
                            ) : null}
                            <span className={styles.subName}>
                                {source.name}
                            </span>
                            {unread ? <span className={styles.unread} /> : null}
                            {starred ? (
                                <span className={styles.starred}>★</span>
                            ) : null}
                            <Time date={item.date} />
                        </div>
                    </div>
                </div>
            ) : (
                <div className={styles.textCard}>
                    <h3 className={styles.textTitle}>
                        <Highlights
                            text={item.title}
                            filter={props.filter}
                            title
                        />
                    </h3>
                    <div className={styles.textSub}>
                        {source.iconurl ? (
                            <img
                                className={styles.favicon}
                                src={source.iconurl}
                            />
                        ) : null}
                        <span className={styles.subName}>{source.name}</span>
                        {unread ? <span className={styles.unread} /> : null}
                        {starred ? (
                            <span className={styles.starred}>★</span>
                        ) : null}
                        <Time date={item.date} />
                    </div>
                </div>
            )}
        </div>
    )
}

export default WaterfallCard
