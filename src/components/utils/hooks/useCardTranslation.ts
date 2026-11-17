import { FeedFilter } from "../../../scripts/models/feed"
import { RSSItem } from "../../../scripts/models/item"
import { useTranslation } from "./useTranslation"

// Every card view shows the same title and snippet for an article, so they all
// read the one cache entry keyed by `item._id`. Switching views therefore reuses
// the translation instead of requesting it again.
export function useCardTranslation(item: RSSItem, filter: FeedFilter) {
    const record = useTranslation(item)
    const translated = record?.status === "translated" && record.showTranslation
    return {
        translated,
        title: translated ? record.title || item.title : item.title,
        snippet: translated ? record.snippet || item.snippet : item.snippet,
        // The search runs over the feed's own language; highlight spans are
        // skipped while the translation is shown.
        filter: translated ? ({ ...filter, search: "" } as FeedFilter) : filter,
    }
}
