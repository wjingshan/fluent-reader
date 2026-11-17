import { useSyncExternalStore } from "react"
import { RSSItem } from "../../../scripts/models/item"
import {
    getTranslation,
    subscribeTranslations,
    TranslationRecord,
} from "../../../scripts/translate"

// Reads the per-article translation from the shared renderer cache. Virtualized
// cards are recycled, so the cache rather than component state owns the record.
export function useTranslation(item: RSSItem): TranslationRecord | undefined {
    return useSyncExternalStore(subscribeTranslations, () =>
        getTranslation(item._id)
    )
}
