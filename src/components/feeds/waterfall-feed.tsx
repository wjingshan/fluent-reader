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
// An article with several pictures is folded into one stack by default; after
// expanding, this caps how many tiles it may occupy.
const MAX_TILES_PER_ITEM = 12
// Room under the picture for the stacked sheets to peek out.
const STACK_PEEK = 10
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

/** One tile: either one picture of an expanded article, or a folded stack. */
type Tile = {
    key: string
    item: RSSItem
    url: string | null
    index: number
    count: number
    folded: boolean
    urls?: string[]
}

function absoluteUrl(src: string, base: string): string | null {
    const value = (src || "").trim()
    if (!value) return null
    if (value.startsWith("data:")) return null
    // Feeds commonly ship protocol-relative sources ("//host/pic.webp").
    if (value.startsWith("//")) return "https:" + value
    if (/^https?:\/\//i.test(value)) return value
    try {
        const resolved = new URL(value, base)
        return /^https?:$/.test(resolved.protocol) ? resolved.href : null
    } catch {
        return null
    }
}

function baseFor(link: string): string {
    try {
        return new URL(link).origin + "/"
    } catch {
        return "https://invalid.local/"
    }
}

/** Every picture the article body carries, de-duplicated, in document order. */
function imagesOf(item: RSSItem): string[] {
    const content = item.content || ""
    const base = baseFor(item.link || "")
    const urls: string[] = []
    if (content.indexOf("<img") >= 0) {
        const doc = new DOMParser().parseFromString(content, "text/html")
        for (const img of Array.from(doc.querySelectorAll("img"))) {
            const resolved = absoluteUrl(img.getAttribute("src"), base)
            if (resolved && urls.indexOf(resolved) < 0) urls.push(resolved)
        }
    }
    if (urls.length === 0 && item.thumb) urls.push(item.thumb)
    return urls.slice(0, MAX_TILES_PER_ITEM)
}

function buildTiles(
    items: RSSItem[],
    expanded: Set<number>,
    flipIndex: Map<number, number>
): Tile[] {
    const tiles: Tile[] = []
    for (const item of items) {
        const urls = imagesOf(item)
        if (urls.length === 0) {
            tiles.push({
                key: item._id + ":0",
                item,
                url: null,
                index: 0,
                count: 1,
                folded: false,
            })
            continue
        }
        if (urls.length === 1 || expanded.has(item._id)) {
            for (let index = 0; index < urls.length; index++) {
                tiles.push({
                    key: item._id + ":" + index,
                    item,
                    url: urls[index],
                    index,
                    count: urls.length,
                    folded: false,
                })
            }
            continue
        }
        // Several pictures but not expanded: a single stack showing one at a time.
        const current = Math.min(flipIndex.get(item._id) || 0, urls.length - 1)
        tiles.push({
            key: item._id + ":folded",
            item,
            url: urls[current],
            index: current,
            count: urls.length,
            folded: true,
            urls,
        })
    }
    return tiles
}

const WaterfallFeed: React.FC<FeedProps> = props => {
    const styles = useStyles()
    const { elementRef, onPagesUpdated } = useFeedTabStop()
    const [width, setWidth] = useState(0)
    // Measured height/width per tile; pictures report theirs when they load.
    const [ratios, setRatios] = useState<Map<string, number>>(new Map())
    const pendingRatios = useRef<Map<string, number>>(new Map())
    const frame = useRef(0)
    // Articles the user expanded into one tile per picture.
    const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
    // Which picture a folded stack currently shows, per article.
    const [flipIndex, setFlipIndex] = useState<Map<number, number>>(
        () => new Map()
    )

    useEffect(() => {
        const main = document.querySelector(".main")
        if (!main) return
        const update = () => setWidth(main.clientWidth - 40)
        update()
        const observer = new ResizeObserver(update)
        observer.observe(main)
        return () => observer.disconnect()
    }, [])

    // Parsing every article's HTML is only worth doing when the items change.
    const tiles = useMemo(
        () => buildTiles(props.items, expanded, flipIndex),
        [props.items, expanded, flipIndex]
    )

    // Collect picture sizes without re-laying out for every single image.
    const handleRatio = useCallback((key: string, ratio: number) => {
        pendingRatios.current.set(key, ratio)
        if (frame.current) return
        frame.current = requestAnimationFrame(() => {
            frame.current = 0
            const updates = pendingRatios.current
            pendingRatios.current = new Map()
            setRatios(prev => {
                const next = new Map(prev)
                updates.forEach((value, k) => next.set(k, value))
                return next
            })
        })
    }, [])

    const flip = useCallback((iid: number, delta: number, count: number) => {
        if (count <= 1) return
        setFlipIndex(prev => {
            const next = new Map(prev)
            const current = next.get(iid) || 0
            next.set(iid, (current + delta + count) % count)
            return next
        })
    }, [])

    const expand = useCallback((iid: number) => {
        setExpanded(prev => {
            const next = new Set(prev)
            next.add(iid)
            return next
        })
    }, [])

    const collapse = useCallback((iid: number) => {
        setExpanded(prev => {
            const next = new Set(prev)
            next.delete(iid)
            return next
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
        if (!tiles.length || columnWidth <= 0) return result
        const heights = new Array<number>(columnCount).fill(0)
        tiles.forEach((tile, index) => {
            let target = 0
            for (let c = 1; c < columnCount; c++) {
                if (heights[c] < heights[target]) target = c
            }
            const ratio = tile.url
                ? ratios.get(tile.key) || DEFAULT_RATIO
                : null
            const height = tile.url
                ? columnWidth * ratio + (tile.folded ? STACK_PEEK : 0)
                : TEXT_CARD_HEIGHT
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
    }, [tiles, columnCount, columnWidth, ratios])

    const containerHeight = useMemo(() => {
        let max = 0
        for (const p of placements) {
            const bottom = p.top + p.height
            if (bottom > max) max = bottom
        }
        return max
    }, [placements])

    const onRenderTile = useCallback(
        (tile: Tile, index: number) => {
            const placement = placements[index]
            if (!placement) return null
            return (
                <WaterfallCard
                    feedId={props.feed._id}
                    key={tile.key}
                    item={tile.item}
                    source={props.sourceMap[tile.item.source]}
                    filter={props.filter}
                    shortcuts={props.shortcuts}
                    markRead={props.markRead}
                    contextMenu={props.contextMenu}
                    showItem={props.showItem}
                    imageUrl={tile.url}
                    imageIndex={tile.index}
                    imageCount={tile.count}
                    folded={tile.folded}
                    urls={tile.urls}
                    currentIndex={tile.index}
                    onFlip={(delta: number) =>
                        flip(tile.item._id, delta, tile.count)
                    }
                    onExpand={() => expand(tile.item._id)}
                    onCollapse={() => collapse(tile.item._id)}
                    ratioKey={tile.key}
                    onRatio={(ratio: number, key: string) =>
                        handleRatio(key, ratio)
                    }
                    style={{
                        left: `${placement.left}px`,
                        top: `${placement.top}px`,
                        width: `${placement.width}px`,
                        height: `${placement.height}px`,
                    }}
                />
            )
        },
        [placements, ratios, props, handleRatio, flip, expand, collapse]
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
                    {tiles.map(onRenderTile)}
                </div>
                <FeedEnd feed={props.feed} loadMore={props.loadMore} />
                {tiles.length === 0 && (
                    <div className={styles.empty}>
                        {intl.get("article.empty")}
                    </div>
                )}
            </FocusZone>
        )
    )
}

export default WaterfallFeed
