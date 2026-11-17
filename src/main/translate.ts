import { ipcMain, net } from "electron"
import { store } from "./settings"
import {
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
    content: string
): Promise<RawText> {
    const body = {
        model: MODEL,
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
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
