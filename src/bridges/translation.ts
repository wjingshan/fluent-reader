import { ipcRenderer } from "electron"
import { TranslationKeyState, TranslationResult } from "../schema-types"

const translationBridge = {
    translate: (title: string, snippet: string): Promise<TranslationResult> => {
        return ipcRenderer.invoke("translate-text", title, snippet)
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
