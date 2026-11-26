import { SummaryResult } from "../schema-types"

// The article body lives in a <webview>, so the text to summarize has to come
// out of the guest: the page's own readable column, not the surrounding UI.
// Same entry point the translator uses (#main), with <body> as a fallback for
// pages that keep their text elsewhere.
const READ_TEXT_SCRIPT = `(function () {
    var main = document.getElementById("main")
    var node = main || document.body
    if (!node) return ""
    var text = node.innerText || node.textContent || ""
    return String(text).replace(/\\r\\n?/g, "\\n").replace(/\\n{3,}/g, "\\n\\n").trim()
})()`

export interface SummaryRecord {
    status: "loading" | "ready" | "error"
    tldr?: string
    points?: string[]
    details?: string[]
    // Whatever the model wrote when it did not answer in the expected layout.
    text?: string
    code?: string
    message?: string
}

// Summaries are expensive and per-article, so they are cached for the session
// and evicted like translations: reopening an article costs nothing.
const MAX_RECORDS = 40
const records = new Map<number, SummaryRecord>()
const listeners = new Set<() => void>()
const pending = new Set<number>()

function notify() {
    for (const listener of Array.from(listeners)) listener()
}

function evict() {
    if (records.size <= MAX_RECORDS) return
    for (const id of Array.from(records.keys())) {
        if (records.size <= MAX_RECORDS) break
        if (pending.has(id)) continue
        records.delete(id)
    }
}

export function subscribeSummaries(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function getSummary(id: number): SummaryRecord | undefined {
    return records.get(id)
}

export function dismissSummary(id: number) {
    records.delete(id)
    notify()
}

// Nothing readable came out of the page (a canvas, a login wall, a video): the
// panel still opens and explains why instead of spinning forever.
export function failSummary(id: number, code: string) {
    records.set(id, { status: "error", code })
    evict()
    notify()
}

function apply(id: number, result: SummaryResult) {
    if (result?.error) {
        records.set(id, {
            status: "error",
            code: result.error.code,
            message: result.error.message,
        })
    } else {
        records.set(id, {
            status: "ready",
            tldr: result.tldr || "",
            points: result.points || [],
            details: result.details || [],
            text: result.text,
        })
    }
    evict()
    notify()
}

export async function readArticleText(
    webview: Electron.WebviewTag
): Promise<string | undefined> {
    try {
        const text = await webview.executeJavaScript(READ_TEXT_SCRIPT)
        return typeof text === "string" && text.trim() !== "" ? text : undefined
    } catch {
        return undefined
    }
}

export async function requestSummary(
    id: number,
    title: string,
    text: string
): Promise<void> {
    if (pending.has(id)) return
    pending.add(id)
    records.set(id, { status: "loading" })
    notify()
    let result: SummaryResult = {
        tldr: "",
        points: [],
        details: [],
        error: { code: "unavailable" },
    }
    try {
        if (window.translation) {
            result = await window.translation.summarize(title, text)
        }
    } catch (error) {
        result = {
            tldr: "",
            points: [],
            details: [],
            error: { code: "api-error", message: String(error) },
        }
    } finally {
        pending.delete(id)
    }
    apply(id, result)
}

// Re-running drops the cached answer first, so the panel shows the spinner
// instead of the previous summary while the new one is on its way.
export async function regenerateSummary(
    id: number,
    title: string,
    text: string
): Promise<void> {
    records.delete(id)
    notify()
    await requestSummary(id, title, text)
}
