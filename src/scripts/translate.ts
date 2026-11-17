import intl from "react-intl-universal"
import { RSSItem } from "./models/item"
import { TranslationResult } from "../schema-types"

export interface TranslationRecord {
    status: "loading" | "translated" | "error"
    // Which text the card currently shows. Kept apart from `status` so a cached
    // translation survives toggling back and forth without another request.
    showTranslation: boolean
    title?: string
    snippet?: string
    code?: string
    message?: string
}

// The card clamps the snippet to the same amount, so nothing longer is needed.
const SNIPPET_LIMIT = 325
// Enough for a long scroll through a feed, while keeping a session bounded.
const MAX_RECORDS = 300

// Per-article cache, in renderer memory only. Translations are a view-time
// convenience: losing them on restart costs one request per card the user
// re-opens, which is cheaper than keeping API output on disk forever.
const records = new Map<number, TranslationRecord>()
const listeners = new Set<() => void>()
// One request in flight per article, however often the button is clicked.
const pending = new Set<number>()

function notify() {
    for (const listener of Array.from(listeners)) listener()
}

export function subscribeTranslations(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function getTranslation(id: number): TranslationRecord | undefined {
    return records.get(id)
}

function setRecord(id: number, record: TranslationRecord) {
    records.set(id, record)
    evict()
    notify()
}

function evict() {
    if (records.size <= MAX_RECORDS) return
    // Insertion order: the oldest article gives up its translation first.
    for (const id of Array.from(records.keys())) {
        if (records.size <= MAX_RECORDS) break
        if (pending.has(id)) continue
        records.delete(id)
    }
}

function snippetForTranslation(item: RSSItem): string {
    const snippet = typeof item.snippet === "string" ? item.snippet : ""
    return snippet.trim().slice(0, SNIPPET_LIMIT)
}

export async function toggleTranslation(item: RSSItem): Promise<void> {
    const record = records.get(item._id)
    if (!record || record.status === "error") {
        // No cache yet, or the last attempt failed: (re)try this article only.
        await requestTranslation(item)
        return
    }
    if (record.status === "loading") return
    setRecord(item._id, {
        ...record,
        showTranslation: !record.showTranslation,
    })
}

async function requestTranslation(item: RSSItem): Promise<void> {
    if (pending.has(item._id)) return
    pending.add(item._id)
    setRecord(item._id, { status: "loading", showTranslation: false })
    let result: TranslationResult = {
        title: "",
        snippet: "",
        error: { code: "unavailable" },
    }
    try {
        if (window.translation) {
            result = await window.translation.translate(
                item.title,
                snippetForTranslation(item)
            )
        }
    } catch (error) {
        result = {
            title: "",
            snippet: "",
            error: { code: "api-error", message: String(error) },
        }
    } finally {
        pending.delete(item._id)
    }
    if (result.error) {
        setRecord(item._id, {
            status: "error",
            showTranslation: false,
            code: result.error.code,
            message: result.error.message,
        })
    } else {
        setRecord(item._id, {
            status: "translated",
            showTranslation: true,
            title: result.title,
            snippet: result.snippet,
        })
    }
}

// Drop a failed attempt so the button can return to its idle look. The card
// calls this once it has shown the reason.
export function clearTranslationError(id: number) {
    if (records.get(id)?.status === "error") {
        records.delete(id)
        notify()
    }
}

// Shared by the card buttons and the article toolbar, which cache their
// failures separately but speak the same vocabulary.
export function translationMessage(
    record: { code?: string; message?: string } | undefined
): string {
    switch (record?.code) {
        case "no-key":
            return intl.get("translate.noKey")
        case "unavailable":
            return intl.get("translate.unavailable")
        default:
            return intl.get("translate.failed", {
                error: record?.message || record?.code || "",
            })
    }
}
