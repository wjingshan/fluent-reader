import { useSyncExternalStore } from "react"
import { getSummary, subscribeSummaries } from "../../../scripts/article-summary"

// Reads the per-article summary from the shared renderer cache, so a summary
// survives closing and reopening the article.
export function useArticleSummary(itemId: number) {
    return useSyncExternalStore(subscribeSummaries, () => getSummary(itemId))
}
