import { ipcRenderer } from "electron"
import {
    SummaryResult,
    TranslationBlocksResult,
    TranslationKeyState,
    TranslationResult,
} from "../schema-types"

const translationBridge = {
    translate: (title: string, snippet: string): Promise<TranslationResult> => {
        return ipcRenderer.invoke("translate-text", title, snippet)
    },

    // Whole-page summary: the reader sends the page's own text, the main
    // process calls the model and returns the parseable parts.
    summarize: (title: string, text: string): Promise<SummaryResult> => {
        return ipcRenderer.invoke("summarize-text", title, text)
    },

    // Article bodies: one request per batch of chunks, in order.
    translateBlocks: (blocks: string[]): Promise<TranslationBlocksResult> => {
        return ipcRenderer.invoke("translate-blocks", blocks)
    },

    getApiKey: (): Promise<TranslationKeyState> => {
        return ipcRenderer.invoke("get-translate-api-key")
    },

    setApiKey: (key: string): Promise<void> => {
        return ipcRenderer.invoke("set-translate-api-key", key)
    },
}

declare global {
    interface Window {
        translation: typeof translationBridge
    }
    var translation: typeof translationBridge
}

export default translationBridge
