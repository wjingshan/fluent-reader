import { ipcMain, net } from "electron"
import { store } from "./settings"
import {
    TranslationBlocksResult,
    TranslationError,
    TranslationKeyState,
    TranslationResult,
} from "../schema-types"

const ENDPOINT = "https://api.deepseek.com/chat/completions"
// deepseek-chat / deepseek-reasoner are retired; thinking mode stays off below.
const MODEL = "deepseek-flash"
const KEY_STORE_KEY = "translateApiKey"
const ENV_KEY = "DEEPSEEK_API_KEY"
const TIMEOUT_MS = 45000
// A marker the model is told to keep verbatim, so the title and the snippet
// travel in one request and can be split back apart. Deliberately unusual so
// it cannot collide with article text.
const SEPARATOR = "<<<FR_TRANSLATE_SPLIT>>>"

const SYSTEM_PROMPT = [
    "把用户给的标题和摘要翻译成简体中文。只输出译文，保留原格式，不要解释。",
    "标题与摘要之间有一行分隔符 " +
        SEPARATOR +
        "，分隔符之前是标题，之后是摘要。",
    "必须原样保留这一行分隔符，不要翻译、删除或改写它。",
].join("\n")

// Article bodies arrive as many chunks, because a whole page would blow past
// the request budget. Each chunk is one line of the payload.
const CHUNK_SEPARATOR = "<<<FR_TRANSLATE_CHUNK>>>"

// The renderer marks every inline element boundary with a numbered placeholder
// (`⟦3⟧` opens, `⟦/3⟧` closes), so the model translates running text while the
// original tag structure is rebuilt around the translation afterwards.
const BLOCK_PROMPT = [
    "把下面这段网页正文翻译成简体中文。只输出译文，保留原有标点和换行，不要解释。",
    "每段文字之间有一行分隔符 " +
        CHUNK_SEPARATOR +
        "，分隔符之前是第一段，之后是下一段。必须原样保留每一行分隔符，不要翻译、删除或改写它，输出的段数必须与输入相同。",
    "文字中可能出现形如 ⟦3⟧ 与 ⟦/3⟧ 的标记，它们是网页标签的占位符。把标记原样留在原来的位置，只翻译标记之外的文字；不要新增、删除、合并或调换任何标记。",
].join("\n")

type ChatResponse = {
    choices?: { message?: { content?: string } }[]
    error?: { message?: string }
}

type RawText = {
    text?: string
    error?: TranslationError
}

function storedKey(): string {
    const key = store.get(KEY_STORE_KEY, "")
    return typeof key === "string" ? key.trim() : ""
}

function environmentKey(): string {
    const key = process.env[ENV_KEY]
    return typeof key === "string" ? key.trim() : ""
}

// electron-store wins: a key the user typed in the settings panel should not be
// silently ignored because an environment variable happens to exist too.
function resolveKey(): string {
    return storedKey() || environmentKey()
}

function errorText(error: unknown): string {
    if (error instanceof Error) {
        if (error.name === "TimeoutError") return "Request timed out"
        return error.message
    }
    return String(error)
}

function failed(code: "api-error" | "bad-response", message: string): RawText {
    return { error: { code: code, message: message.slice(0, 300) } }
}

// Electron's net.fetch runs on Chromium's network stack, so the system proxy and
// the PAC address set in Preferences both apply. Node's global fetch ignores
// them and simply hangs behind a proxy, so it is only a last-resort fallback.
function post(url: string, init: RequestInit): Promise<Response> {
    if (net && typeof net.fetch === "function") return net.fetch(url, init)
    return fetch(url, init)
}

// Holds the request to a fixed budget even if the transport ignores the signal.
async function withDeadline<T>(
    request: Promise<T>,
    timeoutMessage: string
): Promise<T> {
    let timer: ReturnType<typeof setTimeout>
    const deadline = new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), TIMEOUT_MS)
    })
    try {
        return await Promise.race([request, deadline])
    } finally {
        clearTimeout(timer)
    }
}

async function requestTranslation(
    key: string,
    content: string,
    systemPrompt: string = SYSTEM_PROMPT
): Promise<RawText> {
    const body = {
        model: MODEL,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: content },
        ],
        // Thinking mode rejects sampling parameters, so none are sent.
        thinking: { type: "disabled" },
        stream: false,
    }
    let response: Response
    try {
        response = await withDeadline(
            post(ENDPOINT, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + key,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(TIMEOUT_MS),
            }),
            "Request timed out"
        )
    } catch (error) {
        return failed("api-error", errorText(error))
    }
    if (!response.ok) {
        const detail = await response.text().catch(() => "")
        // The API answers errors with JSON; its message ("Authentication
        // Fails, ...") is far more readable than the raw body.
        let message: string = detail
        try {
            const parsed = JSON.parse(detail) as ChatResponse
            if (parsed?.error?.message) message = parsed.error.message
        } catch {
            // Keep the raw body.
        }
        return failed(
            "api-error",
            ("HTTP " + response.status + ": " + message).trim()
        )
    }
    let data: ChatResponse
    try {
        data = (await response.json()) as ChatResponse
    } catch (error) {
        return failed("bad-response", errorText(error))
    }
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== "string" || text.trim() === "") {
        return failed("bad-response", data?.error?.message || "Empty response")
    }
    return { text: text.trim() }
}

function fromError(error: TranslationError): TranslationResult {
    return { title: "", snippet: "", error: error }
}

async function translate(
    key: string,
    title: string,
    snippet: string
): Promise<TranslationResult> {
    if (title && snippet) {
        const combined = await requestTranslation(
            key,
            title + "\n" + SEPARATOR + "\n" + snippet
        )
        if (combined.error) return fromError(combined.error)
        const parts = (combined.text || "").split(SEPARATOR)
        if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
            return {
                title: parts[0].trim(),
                snippet: parts[1].trim(),
            }
        }
        // Rare: the model dropped or rewrote the marker. Two direct requests
        // are cheaper than showing a title glued to its snippet.
        const singleTitle = await requestTranslation(
            key,
            "以下是文章标题：\n" + title
        )
        if (singleTitle.error) return fromError(singleTitle.error)
        const singleSnippet = await requestTranslation(
            key,
            "以下是文章摘要：\n" + snippet
        )
        if (singleSnippet.error) return fromError(singleSnippet.error)
        return {
            title: singleTitle.text || "",
            snippet: singleSnippet.text || "",
        }
    }
    if (title) {
        const singleTitle = await requestTranslation(
            key,
            "以下是文章标题：\n" + title
        )
        if (singleTitle.error) return fromError(singleTitle.error)
        return { title: singleTitle.text || "", snippet: "" }
    }
    const singleSnippet = await requestTranslation(
        key,
        "以下是文章摘要：\n" + snippet
    )
    if (singleSnippet.error) return fromError(singleSnippet.error)
    return { title: "", snippet: singleSnippet.text || "" }
}

async function translateBlocks(
    key: string,
    blocks: string[]
): Promise<TranslationBlocksResult> {
    if (blocks.length === 1) {
        const single = await requestTranslation(key, blocks[0], BLOCK_PROMPT)
        if (single.error) return { blocks: [], error: single.error }
        return { blocks: [single.text || ""] }
    }
    const combined = await requestTranslation(
        key,
        blocks.join("\n" + CHUNK_SEPARATOR + "\n"),
        BLOCK_PROMPT
    )
    if (combined.error) return { blocks: [], error: combined.error }
    const parts = (combined.text || "").split(CHUNK_SEPARATOR)
    if (
        parts.length === blocks.length &&
        parts.every(part => part.trim() !== "")
    ) {
        return { blocks: parts.map(part => part.trim()) }
    }
    // Rare: the model dropped or duplicated the separator. Translating each
    // chunk on its own beats gluing two paragraphs onto the wrong one.
    const results: string[] = []
    for (const block of blocks) {
        const single = await requestTranslation(key, block, BLOCK_PROMPT)
        if (single.error) return { blocks: [], error: single.error }
        results.push(single.text || "")
    }
    return { blocks: results }
}

export function setTranslateListeners() {
    ipcMain.handle(
        "translate-text",
        async (
            _,
            title: unknown,
            snippet: unknown
        ): Promise<TranslationResult> => {
            const key = resolveKey()
            if (!key) return fromError({ code: "no-key" })
            const titleText = typeof title === "string" ? title.trim() : ""
            const snippetText =
                typeof snippet === "string" ? snippet.trim() : ""
            if (!titleText && !snippetText) {
                return fromError({
                    code: "bad-response",
                    message: "Nothing to translate",
                })
            }
            return translate(key, titleText, snippetText)
        }
    )

    ipcMain.handle(
        "translate-blocks",
        async (_, blocks: unknown): Promise<TranslationBlocksResult> => {
            const key = resolveKey()
            if (!key) return { blocks: [], error: { code: "no-key" } }
            const list = Array.isArray(blocks)
                ? blocks.filter(
                      (block): block is string =>
                          typeof block === "string" && block.trim() !== ""
                  )
                : []
            if (list.length === 0) {
                return {
                    blocks: [],
                    error: {
                        code: "bad-response",
                        message: "Nothing to translate",
                    },
                }
            }
            return translateBlocks(key, list)
        }
    )

    ipcMain.handle(
        "get-translate-api-key",
        (): TranslationKeyState => ({
            key: storedKey(),
            fromEnvironment: environmentKey() !== "",
        })
    )

    ipcMain.handle("set-translate-api-key", (_, key: unknown) => {
        store.set(KEY_STORE_KEY, typeof key === "string" ? key.trim() : "")
    })
}
