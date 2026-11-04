import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import intl from "react-intl-universal"
import { makeStyles, mergeClasses } from "@griffel/react"
import { FocusZone } from "@fluentui/react"
import { FeedProps } from "./feed"
import WaterfallCard from "../cards/waterfall-card"
import { RSSItem } from "../../scripts/models/item"
import { useFeedTabStop } from "../utils/hooks/useFeedTabStop"
import { FeedEnd } from "./feed-end"

const GAP = 12
const MIN_COLUMN_WIDTH = 200
// Height / width used until the picture reports its own size.
const DEFAULT_RATIO = 0.75
const TEXT_CARD_HEIGHT = 108

const useStyles = makeStyles({
    container: {
        position: "relative",
        height: "calc(100% - 32px)",
        marginTop: "var(--navHeight)",
        padding: "12px 0",
        overflow: "hidden scroll",
        boxSizing: "border-box",
        width: "100%",
    },
    empty: {
        width: "100%",
        height: "calc(100vh - 64px)",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        color: "var(--neutralSecondary)",
        fontSize: "14px",
        userSelect: "none",
    },
})

type Placement = {
    key: number
    left: number
    top: number
    width: number
    height: number
}

const WaterfallFeed: React.FC<FeedProps> = props => {
    const styles = useStyles()
    const { elementRef, onPagesUpdated } = useFeedTabStop()
    const [width, setWidth] = useState(0)
    // Measured height/width per item; pictures report theirs when they load.
    const [ratios, setRatios] = useState<Map<number, number>>(new Map())
    const pendingRatios = useRef<Map<number, number>>(new Map())
    const frame = useRef(0)

    useEffect(() => {
        const main = document.querySelector(".main")
        if (!main) return
        const update = () => setWidth(main.clientWidth - 40)
        update()
        const observer = new ResizeObserver(update)
        observer.observe(main)
        return () => observer.disconnect()
    }, [])

    // Collect picture sizes without re-laying out for every single image.
    const handleRatio = useCallback((id: number, ratio: number) => {
        pendingRatios.current.set(id, ratio)
        if (frame.current) return
        frame.current = requestAnimationFrame(() => {
            frame.current = 0
            const updates = pendingRatios.current
            pendingRatios.current = new Map()
            setRatios(prev => {
                const next = new Map(prev)
                updates.forEach((value, key) => next.set(key, value))
                return next
            })
        })
    }, [])

    const columnCount = Math.max(
        1,
        Math.floor((width + GAP) / (MIN_COLUMN_WIDTH + GAP))
    )
    const columnWidth =
        columnCount > 0
            ? (width - GAP * (columnCount - 1)) / columnCount
            : width

    const placements = useMemo(() => {
        const result: Placement[] = []
        if (!props.items.length || columnWidth <= 0) return result
        const heights = new Array<number>(columnCount).fill(0)
        props.items.forEach((item, index) => {
            let target = 0
            for (let c = 1; c < columnCount; c++) {
                if (heights[c] < heights[target]) target = c
            }
            const ratio = item.thumb
                ? ratios.get(item._id) || DEFAULT_RATIO
                : null
            const height = item.thumb ? columnWidth * ratio : TEXT_CARD_HEIGHT
            result.push({
                key: index,
                left: target * (columnWidth + GAP),
                top: heights[target],
                width: columnWidth,
                height,
            })
            heights[target] += height + GAP
        })
        return result
    }, [props.items, columnCount, columnWidth, ratios])

    const containerHeight = useMemo(() => {
        let max = 0
        for (const p of placements) {
            const bottom = p.top + p.height
            if (bottom > max) max = bottom
        }
        return max
    }, [placements])

    const onRenderItem = useCallback(
        (item: RSSItem, index: number) => {
            const placement = placements[index]
            if (!placement) return null
            return (
                <WaterfallCard
                    feedId={props.feed._id}
                    key={item._id}
                    item={item}
                    source={props.sourceMap[item.source]}
                    filter={props.filter}
                    shortcuts={props.shortcuts}
                    markRead={props.markRead}
                    contextMenu={props.contextMenu}
                    showItem={props.showItem}
                    onRatio={(ratio: number) => handleRatio(item._id, ratio)}
                    style={{
                        left: `${placement.left}px`,
                        top: `${placement.top}px`,
                        width: `${placement.width}px`,
                        height: `${placement.height}px`,
                    }}
                />
            )
        },
        [placements, ratios, props, handleRatio]
    )

    return (
        props.feed.loaded && (
            <FocusZone
                elementRef={elementRef}
                as="div"
                id="refocus"
                className={mergeClasses(styles.container)}
                data-is-scrollable>
                <div
                    style={{
                        height: `${containerHeight}px`,
                        position: "relative",
                    }}>
                    {props.items.map(onRenderItem)}
                </div>
                <FeedEnd feed={props.feed} loadMore={props.loadMore} />
                {props.items.length === 0 && (
                    <div className={styles.empty}>
                        {intl.get("article.empty")}
                    </div>
                )}
            </FocusZone>
        )
    )
}

export default WaterfallFeed
