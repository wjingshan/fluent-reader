import * as React from "react"
import { useState, useEffect, useCallback, useRef } from "react"
import intl from "react-intl-universal"
import { makeStyles, mergeClasses } from "@griffel/react"
import { FeedProps } from "./feed"
import DefaultCard from "../cards/default-card"
import { RSSItem } from "../../scripts/models/item"
import { FocusZone, List, AnimationClassNames } from "@fluentui/react"
import { useFeedTabStop } from "../utils/hooks/useFeedTabStop"
import { useAppSelector } from "../../scripts/reducer"
import { FeedEnd } from "./feed-end"

const useStyles = makeStyles({
    // The filler that keeps the last row aligned has to be as wide as one
    // cell, which the layout settings own now.
    flexFix: { minWidth: "var(--fr-cards-column-width, 280px)" },
})

const CardsFeed: React.FC<FeedProps> = props => {
    const classes = useStyles()
    const { elementRef, onPagesUpdated } = useFeedTabStop()
    const layout = useAppSelector(s => s.app.layout)
    // The setting is the card's own width; the page is cut into cells that also
    // hold the two gutters around the card (see default-card.tsx).
    const cellWidth = layout.cardsColumnWidth + layout.cardGap * 2
    const cellHeight = layout.cardsRowHeight
    const [width, setWidth] = useState(window.innerWidth)
    const [height, setHeight] = useState(window.innerHeight)
    const observerRef = useRef<ResizeObserver>(null)

    useEffect(() => {
        setWidth(document.querySelector(".main").clientWidth - 40)
        observerRef.current = new ResizeObserver(
            (entries: ResizeObserverEntry[]) => {
                if (entries) {
                    setWidth(entries[0].contentRect.width - 40)
                    setHeight(window.innerHeight)
                }
            }
        )
        observerRef.current.observe(document.querySelector(".main"))
        return () => {
            observerRef.current.disconnect()
        }
    }, [])

    const getItemCountForPage = useCallback(() => {
        let elemPerRow = Math.floor(width / cellWidth)
        let rows = Math.ceil(height / cellHeight)
        return elemPerRow * rows
    }, [width, height, cellWidth, cellHeight])

    const getPageHeight = useCallback(() => {
        return height + (cellHeight - (height % cellHeight))
    }, [height, cellHeight])

    const flexFixItems = () => {
        let elemPerRow = Math.floor(width / cellWidth)
        let elemLastRow = props.items.length % elemPerRow
        let items = [...props.items]
        for (let i = 0; i < elemPerRow - elemLastRow; i += 1) items.push(null)
        return items
    }

    const onRenderItem = (item: RSSItem, index: number) =>
        item ? (
            <DefaultCard
                feedId={props.feed._id}
                key={item._id}
                item={item}
                source={props.sourceMap[item.source]}
                filter={props.filter}
                shortcuts={props.shortcuts}
                markRead={props.markRead}
                contextMenu={props.contextMenu}
                showItem={props.showItem}
            />
        ) : (
            <div
                className={mergeClasses("flex-fix", classes.flexFix)}
                key={"f-" + index}></div>
        )

    return (
        props.feed.loaded && (
            <FocusZone
                elementRef={elementRef}
                as="div"
                id="refocus"
                className="cards-feed-container"
                data-is-scrollable>
                <List
                    className={AnimationClassNames.slideUpIn10}
                    items={flexFixItems()}
                    onRenderCell={onRenderItem}
                    onPagesUpdated={onPagesUpdated}
                    getItemCountForPage={getItemCountForPage}
                    getPageHeight={getPageHeight}
                    ignoreScrollingState
                    usePageCache
                />
                <FeedEnd feed={props.feed} loadMore={props.loadMore} />
                {props.items.length === 0 && (
                    <div className="empty">{intl.get("article.empty")}</div>
                )}
            </FocusZone>
        )
    )
}

export default CardsFeed
