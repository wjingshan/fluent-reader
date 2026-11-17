import { TranslationError } from "../schema-types"

// The article body lives in a <webview>, so it cannot be re-rendered by React.
// Translation therefore works on the guest's own HTML: read it out, replace the
// text nodes while keeping every tag, then write it back into the guest.
// Nothing here changes the guest's URL, so the page never reloads and the
// scroll position survives.

export type ArticleVariant = "content" | "full"

export interface ArticleBodyRecord {
    status: "loading" | "translated" | "error"
    // Captured from the guest when the request started; used to switch back.
    original?: string
    translated?: string
    // True while the body shows the original again. The translation stays
    // cached, so switching back re-injects it without another request.
    showOriginal?: boolean
    code?: string
    message?: string
}

// One body translation per article (content / full are separate bodies) costs
// two requests, so the ceiling stays lower than the card cache's.
const MAX_RECORDS = 24
// Text per request. ~1800 characters keeps a batch well inside the 45s budget.
const BATCH_CHARS = 1800
// Chunks per request, so one batch stays a manageable prompt.
const BATCH_UNITS = 12
// A single chunk longer than this is split at sentence boundaries.
const PIECE_CHARS = 3000
// Bodies longer than this many characters are translated in parallel.
const BATCH_CONCURRENCY = 3

const records = new Map<string, ArticleBodyRecord>()
const listeners = new Set<() => void>()
const pending = new Set<string>()

const OPEN = "⟦"
const CLOSE = "⟧"

// Elements that carry text worth translating. A block owns its whole subtree;
// nested blocks inside it are kept as markers rather than separate units.
const BLOCK_TAGS = new Set([
    "ADDRESS",
    "BLOCKQUOTE",
    "CAPTION",
    "DD",
    "DT",
    "FIGCAPTION",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "LEGEND",
    "LI",
    "P",
    "SUMMARY",
    "TD",
    "TH",
])

// Tags kept verbatim: they are copied wholesale into the rebuilt subtree, so
// code blocks, embeds and scripts keep their exact contents.
const ATOM_TAGS = new Set([
    "AREA",
    "AUDIO",
    "BASE",
    "BR",
    "CANVAS",
    "CODE",
    "COL",
    "EMBED",
    "HR",
    "IFRAME",
    "IMG",
    "INPUT",
    "KBD",
    "LINK",
    "MATH",
    "META",
    "NOSCRIPT",
    "OBJECT",
    "PARAM",
    "PRE",
    "SAMP",
    "SCRIPT",
    "SOURCE",
    "STYLE",
    "SVG",
    "TEMPLATE",
    "TEXTAREA",
    "TRACK",
    "VAR",
    "VIDEO",
    "WBR",
])

type TextUnit = {
    kind: "text"
    nodes: Text[]
    payload: string
}

type BlockUnit = {
    kind: "block"
    element: Element
    // Every element inside the block, in marker order.
    elements: Element[]
    // Atom entries are copied with `cloneNode(true)` and never reopened.
    atoms: boolean[]
    payload: string
}

type Unit = TextUnit | BlockUnit

type Token = {
    kind: "text" | "open" | "close"
    index?: number
    text?: string
}

class BodyTranslationError extends Error {
    code: TranslationError["code"]

    constructor(code: TranslationError["code"], message?: string) {
        super(message || "")
        this.code = code
    }
}

function markerRegex(): RegExp {
    return new RegExp(OPEN + "\\s*(\\/?)\\s*(\\d+)\\s*" + CLOSE, "g")
}

function cacheKey(itemId: number, variant: ArticleVariant): string {
    return itemId + ":" + variant
}

function notify() {
    for (const listener of Array.from(listeners)) listener()
}

function evict() {
    if (records.size <= MAX_RECORDS) return
    for (const key of Array.from(records.keys())) {
        if (records.size <= MAX_RECORDS) break
        if (pending.has(key)) continue
        records.delete(key)
    }
}

function setRecord(key: string, record: ArticleBodyRecord) {
    records.set(key, record)
    evict()
    notify()
}

export function subscribeArticleTranslations(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function getArticleTranslation(
    itemId: number,
    variant: ArticleVariant
): ArticleBodyRecord | undefined {
    return records.get(cacheKey(itemId, variant))
}

// Drop a failed attempt so the toolbar button can go back to its idle look.
export function clearArticleTranslationError(
    itemId: number,
    variant: ArticleVariant
) {
    const key = cacheKey(itemId, variant)
    if (records.get(key)?.status === "error") {
        records.delete(key)
        notify()
    }
}

export function failArticleTranslation(
    itemId: number,
    variant: ArticleVariant,
    error: TranslationError
) {
    setRecord(cacheKey(itemId, variant), {
        status: "error",
        code: error.code,
        message: error.message,
    })
}

// Switch between the cached translation and the original. No request is made.
export function toggleArticleTranslationView(
    itemId: number,
    variant: ArticleVariant
) {
    const key = cacheKey(itemId, variant)
    const record = records.get(key)
    if (!record || record.status !== "translated") return
    setRecord(key, { ...record, showOriginal: !record.showOriginal })
}

export async function requestArticleTranslation(
    itemId: number,
    variant: ArticleVariant,
    html: string
): Promise<void> {
    const key = cacheKey(itemId, variant)
    if (pending.has(key)) return
    pending.add(key)
    setRecord(key, { status: "loading", showOriginal: false })
    try {
        const translated = await translateHtml(html)
        setRecord(key, {
            status: "translated",
            showOriginal: false,
            original: html,
            translated,
        })
    } catch (error) {
        const code: TranslationError["code"] =
            error instanceof BodyTranslationError ? error.code : "api-error"
        setRecord(key, {
            status: "error",
            showOriginal: false,
            code,
            message: error instanceof Error ? error.message : String(error),
        })
    } finally {
        pending.delete(key)
    }
}

// ---------------------------------------------------------------- guest access

// `article.html` fills #main asynchronously: for full content Mercury parses
// first. Poll instead of assuming `did-stop-loading` means the text is there.
const READ_SCRIPT = `new Promise(function (resolve) {
    var deadline = Date.now() + 10000
    var check = function () {
        var main = document.getElementById("main")
        if (main && main.innerHTML.trim() !== "") resolve(main.innerHTML)
        else if (Date.now() > deadline) resolve(null)
        else setTimeout(check, 100)
    }
    check()
})`

export async function readArticleHtml(
    webview: Electron.WebviewTag
): Promise<string | undefined> {
    try {
        const html = await webview.executeJavaScript(READ_SCRIPT)
        return typeof html === "string" && html.trim() !== "" ? html : undefined
    } catch {
        return undefined
    }
}

export async function writeArticleHtml(
    webview: Electron.WebviewTag,
    html: string
): Promise<boolean> {
    // Swapping #main keeps the guest document, its <base> and its styles; the
    // scroll offset is restored after the new content has been laid out.
    const script = `(function () {
    var html = ${JSON.stringify(html)}
    return new Promise(function (resolve) {
        var deadline = Date.now() + 20000
        var apply = function (main) {
            var se = document.scrollingElement || document.documentElement
            var left = se ? se.scrollLeft : 0
            var top = se ? se.scrollTop : 0
            main.innerHTML = html
            main.classList.add("show")
            if (se) {
                se.scrollLeft = left
                se.scrollTop = top
                requestAnimationFrame(function () {
                    se.scrollLeft = left
                    se.scrollTop = top
                })
            }
            resolve(true)
        }
        var check = function () {
            var main = document.getElementById("main")
            if (!main) {
                if (Date.now() > deadline) resolve(false)
                else setTimeout(check, 100)
                return
            }
            if (main.innerHTML.trim() !== "" || Date.now() > deadline) apply(main)
            else setTimeout(check, 100)
        }
        check()
    })
})()`
    try {
        return (await webview.executeJavaScript(script)) === true
    } catch {
        return false
    }
}

// ------------------------------------------------------------- HTML translation

function collapse(text: string): string {
    return text.replace(/\s+/g, " ")
}

function stripMarkers(text: string): string {
    return text.replace(markerRegex(), "")
}

function hasLetters(text: string): boolean {
    return /\p{L}/u.test(text)
}

function serializeNode(
    node: Node,
    elements: Element[],
    atoms: boolean[]
): string {
    if (node.nodeType === Node.TEXT_NODE) return collapse((node as Text).data)
    if (node.nodeType !== Node.ELEMENT_NODE) return ""
    const element = node as Element
    const index = elements.push(element) - 1
    const atom = ATOM_TAGS.has(element.tagName.toUpperCase())
    atoms.push(atom)
    if (atom) return OPEN + index + CLOSE
    let inner = ""
    for (const child of Array.from(element.childNodes)) {
        inner += serializeNode(child, elements, atoms)
    }
    return OPEN + index + CLOSE + inner + OPEN + "/" + index + CLOSE
}

function serializeBlock(element: Element): BlockUnit {
    const elements: Element[] = []
    const atoms: boolean[] = []
    const payload = collapse(serializeNode(element, elements, atoms))
    return { kind: "block", element, elements, atoms, payload }
}

function collectUnits(parent: ParentNode, units: Unit[]) {
    let run: Text[] = []
    const flush = () => {
        if (run.length === 0) return
        const payload = collapse(run.map(node => node.data).join(""))
        if (hasLetters(payload))
            units.push({ kind: "text", nodes: run, payload })
        run = []
    }
    for (const child of Array.from(parent.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
            run.push(child as Text)
            continue
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue
        const element = child as Element
        flush()
        const tag = element.tagName.toUpperCase()
        if (ATOM_TAGS.has(tag)) continue
        if (BLOCK_TAGS.has(tag)) {
            const unit = serializeBlock(element)
            if (hasLetters(stripMarkers(unit.payload))) units.push(unit)
            continue
        }
        collectUnits(element, units)
    }
    flush()
}

function markerSpans(text: string): [number, number][] {
    const spans: [number, number][] = []
    const regex = markerRegex()
    let match: RegExpExecArray
    while ((match = regex.exec(text)) !== null) {
        spans.push([match.index, match.index + match[0].length])
    }
    return spans
}

function insideMarker(position: number, spans: [number, number][]): boolean {
    for (const [start, end] of spans) {
        if (position > start && position < end) return true
    }
    return false
}

// One request carries a bounded amount of text; a long paragraph is cut at a
// sentence or word boundary and the pieces are joined back in order.
function splitPayload(payload: string, limit: number): string[] {
    if (payload.length <= limit) return [payload]
    const spans = markerSpans(payload)
    const pieces: string[] = []
    let start = 0
    while (start < payload.length) {
        let end = Math.min(start + limit, payload.length)
        if (end < payload.length) {
            const floor = start + Math.floor(limit / 2)
            for (let position = end; position > floor; position--) {
                const char = payload[position]
                if (
                    " \n\u3002\uFF01\uFF1F.!?\uFF1B;,\uFF0C".indexOf(char) >=
                        0 &&
                    !insideMarker(position, spans)
                ) {
                    end = position
                    break
                }
            }
        }
        pieces.push(payload.slice(start, end))
        start = end
    }
    return pieces
}

function tokenize(text: string): Token[] {
    const tokens: Token[] = []
    const regex = markerRegex()
    let last = 0
    let match: RegExpExecArray
    while ((match = regex.exec(text)) !== null) {
        if (match.index > last) {
            tokens.push({ kind: "text", text: text.slice(last, match.index) })
        }
        tokens.push({
            kind: match[1] === "/" ? "close" : "open",
            index: Number(match[2]),
        })
        last = match.index + match[0].length
    }
    if (last < text.length) {
        tokens.push({ kind: "text", text: text.slice(last) })
    }
    return tokens
}

// Rebuilds the block's original tag tree around the translated text. Returns
// false when the model dropped, duplicated or rearranged a marker.
function rebuildBlock(unit: BlockUnit, translated: string): boolean {
    const tokens = tokenize(translated)
    const stack: number[] = []
    const seen = new Set<number>()
    for (const token of tokens) {
        if (token.kind === "text") continue
        const index = token.index
        if (!(index >= 0 && index < unit.elements.length)) return false
        if (unit.atoms[index]) {
            // Atoms are written as a single marker and never closed.
            if (token.kind !== "open" || seen.has(index)) return false
            seen.add(index)
            continue
        }
        if (token.kind === "open") {
            if (seen.has(index)) return false
            seen.add(index)
            stack.push(index)
        } else if (stack.pop() !== index) {
            return false
        }
    }
    if (stack.length > 0 || seen.size !== unit.elements.length) return false

    const root = unit.element
    while (root.firstChild) root.removeChild(root.firstChild)
    const parents: Element[] = [root]
    for (const token of tokens) {
        const parent = parents[parents.length - 1]
        if (token.kind === "text") {
            if (token.text)
                parent.appendChild(document.createTextNode(token.text))
        } else if (token.kind === "open") {
            const element = unit.elements[token.index]
            if (unit.atoms[token.index]) {
                parent.appendChild(element.cloneNode(true))
            } else {
                const clone = element.cloneNode(false) as Element
                parent.appendChild(clone)
                parents.push(clone)
            }
        } else {
            parents.pop()
        }
    }
    return true
}

function applyUnit(unit: Unit, translated: string) {
    if (unit.kind === "text") {
        if (unit.nodes.length === 0) return
        unit.nodes[0].data = translated
        for (let index = 1; index < unit.nodes.length; index++) {
            unit.nodes[index].data = ""
        }
        return
    }
    if (!rebuildBlock(unit, translated)) {
        // The markers did not survive: keep the translation and drop the
        // inline markup rather than showing two languages mixed together.
        unit.element.textContent = stripMarkers(translated).trim()
    }
}

type Piece = {
    unit: number
    text: string
}

async function mapLimit<T, R>(
    items: T[],
    limit: number,
    run: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length)
    let next = 0
    const workers = Array.from(
        { length: Math.min(limit, items.length) },
        async () => {
            while (true) {
                const index = next++
                if (index >= items.length) return
                results[index] = await run(items[index])
            }
        }
    )
    await Promise.all(workers)
    return results
}

async function translateHtml(html: string): Promise<string> {
    const dom = new DOMParser().parseFromString(html, "text/html")
    const units: Unit[] = []
    collectUnits(dom.body, units)
    if (units.length === 0) {
        throw new BodyTranslationError("bad-response", "Nothing to translate")
    }

    const pieces: Piece[] = []
    units.forEach((unit, index) => {
        for (const text of splitPayload(unit.payload, PIECE_CHARS)) {
            pieces.push({ unit: index, text })
        }
    })

    const batches: Piece[][] = []
    let batch: Piece[] = []
    let chars = 0
    for (const piece of pieces) {
        if (
            batch.length > 0 &&
            (chars + piece.text.length > BATCH_CHARS ||
                batch.length >= BATCH_UNITS)
        ) {
            batches.push(batch)
            batch = []
            chars = 0
        }
        batch.push(piece)
        chars += piece.text.length
    }
    if (batch.length > 0) batches.push(batch)

    const translations = await mapLimit(
        batches,
        BATCH_CONCURRENCY,
        async entries => {
            const result = await window.translation.translateBlocks(
                entries.map(entry => entry.text)
            )
            if (result.error) {
                throw new BodyTranslationError(
                    result.error.code,
                    result.error.message
                )
            }
            if (result.blocks.length !== entries.length) {
                throw new BodyTranslationError(
                    "bad-response",
                    "Chunk count mismatch"
                )
            }
            return result.blocks
        }
    )

    // Pieces of one unit may sit in different batches; they are appended in
    // batch order, which is the order they were cut in.
    const perUnit: string[][] = units.map(() => [])
    batches.forEach((entries, batchIndex) => {
        entries.forEach((entry, offset) => {
            perUnit[entry.unit].push(translations[batchIndex][offset])
        })
    })

    units.forEach((unit, index) => {
        const translated = perUnit[index].join("")
        if (translated.trim() === "") return
        applyUnit(unit, translated)
    })
    return dom.body.innerHTML
}
