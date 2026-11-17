import { useSyncExternalStore } from "react"
import {
    ArticleVariant,
    getArticleTranslation,
    subscribeArticleTranslations,
} from "../../../scripts/article-translation"

// Reads the per-article body translation from the shared renderer cache, so a
// cached translation survives closing and reopening the article.
export function useArticleTranslation(itemId: number, variant: ArticleVariant) {
    return useSyncExternalStore(subscribeArticleTranslations, () =>
        getArticleTranslation(itemId, variant)
    )
}
