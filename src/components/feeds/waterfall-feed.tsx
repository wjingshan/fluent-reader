import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import intl from "react-intl-universal"
import { makeStyles, mergeClasses } from "@griffel/react"
import { FocusZone } from "@fluentui/react"
import { FeedProps } from "./feed"
import WaterfallCard, { WaterfallMedia } from "../cards/waterfall-card"
import { RSSItem } from "../../scripts/models/item"
import { useFeedTabStop } from "../utils/hooks/useFeedTabStop"
import { useAppSelector } from "../../scripts/reducer"
import { FeedEnd } from "./feed-end"

// An article with several pictures is folded into one stack by default; after
// expanding, the layout setting caps how many tiles it may occupy.
const STACK_PEEK = 10
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

/** One tile: one media item, or a folded stack of them. */
type Tile = {
    key: string
    item: RSSItem
    media: WaterfallMedia | null
    index: number
    count: number
    folded: boolean
    all?: WaterfallMedia[]
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

const MEDIA_EXT = /\.(webm|mp4|m4v|mov)(\?|#|$)/i

/** Name without an extension: webm and mp4 of one clip share a key. */
function mediaKey(url: string): string {
    const name = (url.split(/[?#]/)[0].split("/").pop() || url).toLowerCase()
    return name.replace(/\.[a-z0-9]+$/i, "")
}

/**
 * Every media item the article body carries, in document order.
 * Videos count as items too: a clip-only post used to report a single picture,
 * which hid the expand control even though the post clearly holds more.
 */
function mediaOf(item: RSSItem, maxTiles: number): WaterfallMedia[] {
    const content = item.content || ""
    const base = baseFor(item.link || "")
    const out: WaterfallMedia[] = []
    const seenImage = new Set<string>()
    if (content.indexOf("<img") < 0 && content.indexOf("<video") < 0) {
        return item.thumb ? [{ kind: "image", url: item.thumb }] : []
    }

    const doc = new DOMParser().parseFromString(content, "text/html")

    // Clips first: a post that shows a clip usually also carries its poster as
    // a plain <img> under the same basename ("static/x.jpg" next to "webm/x.webm").
    // Counting both would make one clip look like two identical items, so the
    // still is dropped whenever a clip of the same name exists. webm and mp4 of
    // one clip still collapse into a single entry.
    const clips: WaterfallMedia[] = []
    const clipKeys = new Set<string>()
    for (const node of Array.from(
        doc.querySelectorAll("video, video > source")
    )) {
        const resolved = absoluteUrl(
            node.getAttribute("src") || node.getAttribute("data-src"),
            base
        )
        if (!resolved || !MEDIA_EXT.test(resolved)) continue
        const key = mediaKey(resolved)
        if (clipKeys.has(key)) continue
        clipKeys.add(key)
        clips.push({
            kind: "video",
            url: resolved,
            poster: absoluteUrl(
                (node.closest("video") || node).getAttribute("poster"),
                base
            ),
        })
    }

    for (const img of Array.from(doc.querySelectorAll("img"))) {
        const resolved = absoluteUrl(img.getAttribute("src"), base)
        if (!resolved) continue
        const key = mediaKey(resolved)
        if (clipKeys.has(key)) continue // this is the clip's poster
        if (seenImage.has(key)) continue
        seenImage.add(key)
        out.push({ kind: "image", url: resolved })
    }

    out.push(...clips)
    if (out.length === 0 && item.thumb)
        out.push({ kind: "image", url: item.thumb })
    return out.slice(0, maxTiles)
}

function buildTiles(
    items: RSSItem[],
    expanded: Set<number>,
    flipIndex: Map<number, number>,
    maxTiles: number
): Tile[] {
    const tiles: Tile[] = []
    for (const item of items) {
        const media = mediaOf(item, maxTiles)
        if (media.length === 0) {
            tiles.push({
                key: item._id + ":0",
                item,
                media: null,
                index: 0,
                count: 1,
                folded: false,
            })
            continue
        }
        if (media.length === 1 || expanded.has(item._id)) {
            for (let index = 0; index < media.length; index++) {
                tiles.push({
                    key: item._id + ":" + index,
                    item,
                    media: media[index],
                    index,
                    count: media.length,
                    folded: false,
                })
            }
            continue
        }
        // Several media items but not expanded: a single stack, one at a time.
        const current = Math.min(flipIndex.get(item._id) || 0, media.length - 1)
        tiles.push({
            key: item._id + ":folded",
            item,
            media: media[current],
            index: current,
            count: media.length,
            folded: true,
            all: media,
        })
    }
    return tiles
}

const WaterfallFeed: React.FC<FeedProps> = props => {
    const styles = useStyles()
    const { elementRef, onPagesUpdated } = useFeedTabStop()
    const layout = useAppSelector(s => s.app.layout)
    const gap = layout.waterfallGap
    const minColumnWidth = layout.waterfallMinColumnWidth
    const maxTiles = layout.waterfallMaxTiles
    const maxColumns = layout.waterfallMaxColumns
    const [width, setWidth] = useState(0)
    // Measured height/width per tile; pictures report theirs when they load.
    const [ratios, setRatios] = useState<Map<string, number>>(new Map())
    const pendingRatios = useRef<Map<string, number>>(new Map())
    const frame = useRef(0)
    // Articles the user expanded into one tile per media item.
    const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
    // Which item a folded stack currently shows, per article.
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
        () => buildTiles(props.items, expanded, flipIndex, maxTiles),
        [props.items, expanded, flipIndex, maxTiles]
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

    // Derived from the container as it always was, then capped. The slider's
    // floor is 2, so a wide window cannot end up with dozens of narrow columns;
    // the cap only ever makes columns wider than the minimum, never leaves the
    // row short of space.
    const columnCount = Math.min(
        Math.max(1, Math.floor((width + gap) / (minColumnWidth + gap))),
        Math.max(2, maxColumns)
    )
    const columnWidth =
        columnCount > 0
            ? (width - gap * (columnCount - 1)) / columnCount
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
            const ratio = tile.media
                ? ratios.get(tile.key) || DEFAULT_RATIO
                : null
            const height = tile.media
                ? columnWidth * ratio + (tile.folded ? STACK_PEEK : 0)
                : TEXT_CARD_HEIGHT
            result.push({
                key: index,
                left: target * (columnWidth + gap),
                top: heights[target],
                width: columnWidth,
                height,
            })
            heights[target] += height + gap
        })
        return result
    }, [tiles, columnCount, columnWidth, ratios, gap])

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
                    media={tile.media}
                    imageIndex={tile.index}
                    imageCount={tile.count}
                    folded={tile.folded}
                    allMedia={tile.all}
                    currentIndex={tile.index}
                    onFlip={(delta: number) =>
                        flip(tile.item._id, delta, tile.count)
                    }
                    onExpand={() => expand(tile.item._id)}
                    onCollapse={() => collapse(tile.item._id)}
                    // While an article is expanded, every tile that does not
                    // belong to it recedes, so its own items stand out.
                    dimmed={expanded.size > 0 && !expanded.has(tile.item._id)}
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
        [
            placements,
            ratios,
            props,
            handleRatio,
            flip,
            expand,
            collapse,
            expanded,
        ]
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
