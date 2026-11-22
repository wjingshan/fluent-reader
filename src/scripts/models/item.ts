import { getRulesForTarget } from "./rule"
import { eq, and, lte, gte, inArray } from "drizzle-orm"
import { database, itemsTable, itemsInSources } from "../db"
import { getValidDate } from "../date"
import { duplicateFilterEnabled, storedLinkKey } from "../duplicate"
import intl from "react-intl-universal"
import type { MyParserItem } from "../utils"
import {
    domParser,
    htmlDecode,
    ActionStatus,
    AppThunk,
    platformCtrl,
} from "../utils"
import { RSSSource, updateSource, updateUnreadCounts } from "./source"
import { FeedActionTypes, INIT_FEED, LOAD_MORE, dismissItems } from "./feed"
import {
    pushNotification,
    setupAutoFetch,
    SettingsActionTypes,
    FREE_MEMORY,
    setLastMarkAll,
    clearLastMarkAll,
    setFetchError,
    clearFetchError,
} from "./app"
import {
    getServiceHooks,
    syncWithService,
    ServiceActionTypes,
    SYNC_LOCAL_ITEMS,
} from "./service"

export class RSSItem {
    _id: number
    source: number
    guid?: string
    title: string
    link: string
    date: Date
    fetchedDate: Date
    thumb?: string
    content: string
    snippet: string
    creator?: string
    hasRead: boolean
    starred: boolean
    hidden: boolean
    notify: boolean
    serviceRef?: string
    linkKey?: string

    static normalize(item: RSSItem) {
        item.title =
            typeof item.title === "string" && item.title
                ? item.title
                : intl.get("article.untitled")
        for (const field of ["link", "content", "snippet"] as const) {
            if (typeof item[field] !== "string") item[field] = ""
        }
        for (const field of ["thumb", "creator", "guid"] as const) {
            if (typeof item[field] !== "string") delete item[field]
        }
        item.fetchedDate = getValidDate(item.fetchedDate, item.date)
        item.date = getValidDate(item.date, item.fetchedDate)
    }

    constructor(item: MyParserItem, source: RSSSource) {
        for (let field of ["title", "link", "creator", "author"]) {
            const content = item[field]
            if (content && typeof content !== "string") delete item[field]
        }
        this.source = source.sid
        if (!source.serviceRef) {
            this.guid = [item.guid, item.id].find(
                value => typeof value === "string" && value.trim().length > 0
            )
        }
        this.title = item.title || intl.get("article.untitled")
        this.link = item.link || ""
        this.fetchedDate = new Date()
        this.date = getValidDate(item.isoDate, item.pubDate, this.fetchedDate)
        this.creator = item.creator || item.author
        this.hasRead = false
        this.starred = false
        this.hidden = false
        this.notify = false
        this.linkKey = storedLinkKey(this.link)
    }

    static parseContent(item: RSSItem, parsed: MyParserItem) {
        for (let field of ["thumb", "content", "fullContent"]) {
            const content = parsed[field]
            if (content && typeof content !== "string") delete parsed[field]
        }
        if (parsed.fullContent) {
            item.content = parsed.fullContent
            item.snippet = htmlDecode(parsed.fullContent)
        } else {
            item.content = parsed.content || ""
            item.snippet = htmlDecode(parsed.contentSnippet || "")
        }
        if (parsed.thumb) {
            item.thumb = parsed.thumb
        } else if (parsed.image?.$?.url) {
            item.thumb = parsed.image.$.url
        } else if (parsed.image && typeof parsed.image === "string") {
            item.thumb = parsed.image
        } else if (parsed.mediaContent) {
            let images = parsed.mediaContent.filter(
                c => c.$ && c.$.medium === "image" && c.$.url
            )
            if (images.length > 0) item.thumb = images[0].$.url
        }
        if (!item.thumb) {
            let dom = domParser.parseFromString(item.content, "text/html")
            let baseEl = dom.createElement("base")
            baseEl.setAttribute(
                "href",
                item.link.split("/").slice(0, 3).join("/")
            )
            dom.head.append(baseEl)
            let img = dom.querySelector("img")
            if (img && img.src) item.thumb = img.src
        }
        if (
            item.thumb &&
            !item.thumb.startsWith("https://") &&
            !item.thumb.startsWith("http://")
        ) {
            delete item.thumb
        }
    }
}

export type ItemState = {
    [_id: number]: RSSItem
}

export const FETCH_ITEMS = "FETCH_ITEMS"
export const MARK_READ = "MARK_READ"
export const MARK_ALL_READ = "MARK_ALL_READ"
export const UNDO_MARK_ALL_READ = "UNDO_MARK_ALL_READ"
export const MARK_UNREAD = "MARK_UNREAD"
export const TOGGLE_STARRED = "TOGGLE_STARRED"
export const TOGGLE_HIDDEN = "TOGGLE_HIDDEN"

interface FetchItemsAction {
    type: typeof FETCH_ITEMS
    status: ActionStatus
    fetchCount?: number
    items?: RSSItem[]
    itemState?: ItemState
    errSource?: RSSSource
    err?
}

interface MarkReadAction {
    type: typeof MARK_READ
    item: RSSItem
}

interface MarkAllReadAction {
    type: typeof MARK_ALL_READ
    sids: number[]
    time?: number
    before?: boolean
}

interface UndoMarkAllReadAction {
    type: typeof UNDO_MARK_ALL_READ
    iids: number[]
}

interface MarkUnreadAction {
    type: typeof MARK_UNREAD
    item: RSSItem
}

interface ToggleStarredAction {
    type: typeof TOGGLE_STARRED
    item: RSSItem
}

interface ToggleHiddenAction {
    type: typeof TOGGLE_HIDDEN
    item: RSSItem
}

export type ItemActionTypes =
    | FetchItemsAction
    | MarkReadAction
    | MarkAllReadAction
    | UndoMarkAllReadAction
    | MarkUnreadAction
    | ToggleStarredAction
    | ToggleHiddenAction

export function fetchItemsRequest(fetchCount = 0): ItemActionTypes {
    return {
        type: FETCH_ITEMS,
        status: ActionStatus.Request,
        fetchCount: fetchCount,
    }
}

export function fetchItemsSuccess(
    items: RSSItem[],
    itemState: ItemState
): ItemActionTypes {
    return {
        type: FETCH_ITEMS,
        status: ActionStatus.Success,
        items: items,
        itemState: itemState,
    }
}

export function fetchItemsFailure(source: RSSSource, err): ItemActionTypes {
    return {
        type: FETCH_ITEMS,
        status: ActionStatus.Failure,
        errSource: source,
        err: err,
    }
}

export function fetchItemsIntermediate(): ItemActionTypes {
    return {
        type: FETCH_ITEMS,
        status: ActionStatus.Intermediate,
    }
}

// Read/star state of every stored copy of the given link keys. Used to adopt
// the state of an article we already have instead of re-announcing it.
async function loadDuplicateStates(
    keys: string[]
): Promise<Map<string, { hasRead: boolean; starred: boolean }>> {
    const states = new Map<string, { hasRead: boolean; starred: boolean }>()
    const unique = Array.from(
        new Set(keys.filter(key => typeof key === "string" && key.length > 0))
    )
    for (let i = 0; i < unique.length; i += 40) {
        const rows = await database
            .select({
                linkKey: itemsTable.linkKey,
                hasRead: itemsTable.hasRead,
                starred: itemsTable.starred,
            })
            .from(itemsTable)
            .where(inArray(itemsTable.linkKey, unique.slice(i, i + 40)))
        for (const row of rows) {
            const previous = states.get(row.linkKey)
            states.set(row.linkKey, {
                hasRead: previous
                    ? previous.hasRead || row.hasRead
                    : row.hasRead,
                starred: previous
                    ? previous.starred || row.starred
                    : row.starred,
            })
        }
    }
    return states
}

export async function insertItems(items: RSSItem[]): Promise<RSSItem[]> {
    if (items.length === 0) return []
    // Service integrations construct articles without going through RSSItem.
    for (const item of items) {
        RSSItem.normalize(item)
    }
    items.sort((a, b) => a.date.getTime() - b.date.getTime())
    const keys = items.map(item =>
        typeof item.linkKey === "string"
            ? item.linkKey
            : storedLinkKey(item.link)
    )
    const storedCopies = duplicateFilterEnabled()
        ? await loadDuplicateStates(keys)
        : new Map<string, { hasRead: boolean; starred: boolean }>()
    const values = items.map((item, index) => {
        const linkKey = keys[index]
        const copy = linkKey ? storedCopies.get(linkKey) : undefined
        return {
            source: item.source,
            guid: item.guid || null,
            title: item.title,
            link: item.link,
            date: item.date,
            fetchedDate: item.fetchedDate,
            thumb: item.thumb || null,
            content: item.content,
            snippet: item.snippet,
            creator: item.creator || null,
            // A second copy of an article is not a new article: adopt its
            // read/star state and stay silent.
            hasRead: copy ? item.hasRead || copy.hasRead : item.hasRead,
            starred: copy ? item.starred || copy.starred : item.starred,
            hidden: item.hidden,
            notify: copy ? false : item.notify,
            serviceRef: item.serviceRef || null,
            linkKey: linkKey,
        }
    })
    // Bound SQL parameters and query construction even for large refreshes.
    const queries = []
    for (let i = 0; i < values.length; i += 50) {
        queries.push(
            database
                .insert(itemsTable)
                .values(values.slice(i, i + 50))
                .returning()
        )
    }
    const [first, ...rest] = queries
    const results = await database.batch([first, ...rest])
    return results.flat() as unknown as RSSItem[]
}

export function fetchItems(
    background = false,
    sids: number[] = null
): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        let promises = new Array<Promise<RSSItem[]>>()
        const initState = getState()
        if (!initState.app.fetchingItems && !initState.app.syncing) {
            if (
                sids === null ||
                sids.filter(
                    sid => initState.sources[sid].serviceRef !== undefined
                ).length > 0
            )
                await dispatch(syncWithService(background))
            let timenow = new Date().getTime()
            const sourcesState = getState().sources
            let sources =
                sids === null
                    ? Object.values(sourcesState).filter(s => {
                          let last = s.lastFetched ? s.lastFetched.getTime() : 0
                          return (
                              !s.serviceRef &&
                              (last > timenow ||
                                  last + (s.fetchFrequency || 0) * 60000 <=
                                      timenow)
                          )
                      })
                    : sids
                          .map(sid => sourcesState[sid])
                          .filter(s => !s.serviceRef)
            for (let source of sources) {
                const state = getState()
                let promise = RSSSource.fetchItems(
                    source,
                    getRulesForTarget(state.rules, state.groups, {
                        type: "source",
                        sid: source.sid,
                    })
                )
                promises.push(
                    promise.finally(() => dispatch(fetchItemsIntermediate()))
                )
            }
            dispatch(fetchItemsRequest(promises.length))
            const results = await Promise.allSettled(promises)
            return await new Promise<void>((resolve, reject) => {
                let items = new Array<RSSItem>()
                results.map((r, i) => {
                    if (r.status === "fulfilled") items.push(...r.value)
                    else {
                        console.log(r.reason)
                        dispatch(fetchItemsFailure(sources[i], r.reason))
                        dispatch(
                            setFetchError(
                                sources[i].sid,
                                String(r.reason ?? "")
                            )
                        )
                    }
                })
                insertItems(items)
                    .then(async inserted => {
                        const updates: Promise<void>[] = []
                        for (let i = 0; i < results.length; i++) {
                            if (results[i].status === "fulfilled") {
                                const source =
                                    getState().sources[sources[i].sid]
                                if (source) {
                                    updates.push(
                                        dispatch(
                                            updateSource({
                                                ...source,
                                                lastFetched: new Date(),
                                            })
                                        )
                                    )
                                    dispatch(clearFetchError(sources[i].sid))
                                }
                            }
                        }
                        for (const update of await Promise.allSettled(
                            updates
                        )) {
                            if (update.status === "rejected")
                                console.log(update.reason)
                        }
                        dispatch(
                            fetchItemsSuccess(
                                inserted.reverse(),
                                getState().items
                            )
                        )
                        resolve()
                        if (background) {
                            for (let item of inserted) {
                                if (item.notify) {
                                    dispatch(pushNotification(item))
                                }
                            }
                            if (inserted.length > 0) {
                                window.utils.requestAttention()
                            }
                        } else {
                            dispatch(dismissItems())
                        }
                        dispatch(setupAutoFetch())
                    })
                    .catch(err => {
                        dispatch(fetchItemsSuccess([], getState().items))
                        const cause =
                            err instanceof Error && err.cause ? err.cause : err
                        window.utils.showErrorBox(
                            "A database error has occurred.",
                            String(cause).slice(0, 2000)
                        )
                        console.log(err)
                        reject(err)
                    })
            })
        }
    }
}

// Every stored copy of an article shares read/star/hidden state. Without this
// a merge would leave a stale unread copy behind that reappears as "new" once
// the visible copy is read.
type DuplicateChange = {
    hasRead?: boolean
    starred?: boolean
    hidden?: boolean
}

function syncDuplicateCopies(
    item: RSSItem,
    changes: DuplicateChange
): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        if (!duplicateFilterEnabled() || !item.linkKey) return
        const rows = await database
            .select({ _id: itemsTable._id })
            .from(itemsTable)
            .where(eq(itemsTable.linkKey, item.linkKey))
        if (rows.length <= 1) return
        await database
            .update(itemsTable)
            .set(changes)
            .where(eq(itemsTable.linkKey, item.linkKey))
        const state = getState()
        let partial = false
        for (const row of rows) {
            const copy = state.items[row._id]
            if (!copy) {
                // The copy is outside the paged-in items; its source badge can
                // only be corrected from the database.
                partial = true
                continue
            }
            if (
                changes.hasRead !== undefined &&
                copy.hasRead !== changes.hasRead
            ) {
                dispatch(
                    changes.hasRead
                        ? markReadDone({ ...copy, hasRead: true })
                        : markUnreadDone({ ...copy, hasRead: false })
                )
            }
            if (
                changes.starred !== undefined &&
                copy.starred !== changes.starred
            ) {
                dispatch(
                    toggleStarredDone({ ...copy, starred: changes.starred })
                )
            }
            if (
                changes.hidden !== undefined &&
                copy.hidden !== changes.hidden
            ) {
                dispatch(toggleHiddenDone({ ...copy, hidden: changes.hidden }))
            }
        }
        if (partial) dispatch(updateUnreadCounts())
    }
}

const markReadDone = (item: RSSItem): ItemActionTypes => ({
    type: MARK_READ,
    item: item,
})

const markUnreadDone = (item: RSSItem): ItemActionTypes => ({
    type: MARK_UNREAD,
    item: item,
})

export function markRead(item: RSSItem): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        item = getState().items[item._id]
        if (!item.hasRead) {
            await database
                .update(itemsTable)
                .set({ hasRead: true })
                .where(eq(itemsTable._id, item._id))
            dispatch(markReadDone(item))
            if (item.serviceRef) {
                dispatch(dispatch(getServiceHooks()).markRead?.(item))
            }
            await dispatch(syncDuplicateCopies(item, { hasRead: true }))
        }
    }
}

export function markAllRead(
    sids: number[] = null,
    date: Date = null,
    before = true
): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        let state = getState()
        if (sids === null) {
            let feed = state.feeds[state.page.feedId]
            sids = feed.sids
        }
        if (sids.length === 0) return
        const action = dispatch(getServiceHooks()).markAllRead?.(
            sids,
            date,
            before
        )
        if (action) await dispatch(action)
        const conditions = [itemsInSources(sids), eq(itemsTable.hasRead, false)]
        if (date) {
            conditions.push(
                before ? lte(itemsTable.date, date) : gte(itemsTable.date, date)
            )
        }
        // Collect the ids the update will touch *before* running it. This has to
        // come from the database, not from the store: markAllRead covers every
        // unread row of those sources, while the store only holds the items the
        // current view has paged in, and undo must restore all of them.
        const affected = await database
            .select({ _id: itemsTable._id, linkKey: itemsTable.linkKey })
            .from(itemsTable)
            .where(and(...conditions))
        await database
            .update(itemsTable)
            .set({ hasRead: true })
            .where(and(...conditions))
        // Copies outside these sources belong to the same articles; leaving them
        // unread would make a merged article reappear as new elsewhere.
        let extra: number[] = []
        if (duplicateFilterEnabled()) {
            const keys = Array.from(
                new Set(affected.map(row => row.linkKey).filter(key => key))
            )
            if (keys.length > 0) {
                const twins = await database
                    .select({ _id: itemsTable._id })
                    .from(itemsTable)
                    .where(
                        and(
                            inArray(itemsTable.linkKey, keys),
                            eq(itemsTable.hasRead, false)
                        )
                    )
                await database
                    .update(itemsTable)
                    .set({ hasRead: true })
                    .where(inArray(itemsTable.linkKey, keys))
                extra = twins.map(row => row._id)
            }
        }
        if (affected.length > 0 || extra.length > 0) {
            dispatch(
                setLastMarkAll([...affected.map(row => row._id), ...extra])
            )
        }
        if (date) {
            dispatch({
                type: MARK_ALL_READ,
                sids: sids,
                time: date.getTime(),
                before: before,
            })
            dispatch(updateUnreadCounts())
        } else {
            dispatch({
                type: MARK_ALL_READ,
                sids: sids,
            })
            if (extra.length > 0) dispatch(updateUnreadCounts())
        }
    }
}

// Put the items changed by the last "mark all as read" back to unread.
export function undoLastMarkAll(): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        const iids = getState().app.lastMarkAll
        if (!iids || iids.length === 0) return
        await database
            .update(itemsTable)
            .set({ hasRead: false })
            .where(inArray(itemsTable._id, iids))
        dispatch({ type: UNDO_MARK_ALL_READ, iids: iids })
        dispatch(clearLastMarkAll())
        dispatch(updateUnreadCounts())
    }
}

export function markUnread(item: RSSItem): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        item = getState().items[item._id]
        if (item.hasRead) {
            await database
                .update(itemsTable)
                .set({ hasRead: false })
                .where(eq(itemsTable._id, item._id))
            dispatch(markUnreadDone(item))
            if (item.serviceRef) {
                dispatch(dispatch(getServiceHooks()).markUnread?.(item))
            }
            await dispatch(syncDuplicateCopies(item, { hasRead: false }))
        }
    }
}

const toggleStarredDone = (item: RSSItem): ItemActionTypes => ({
    type: TOGGLE_STARRED,
    item: item,
})

export function toggleStarred(item: RSSItem): AppThunk<Promise<void>> {
    return async dispatch => {
        await database
            .update(itemsTable)
            .set({ starred: !item.starred })
            .where(eq(itemsTable._id, item._id))
        dispatch(toggleStarredDone(item))
        if (item.serviceRef) {
            const hooks = dispatch(getServiceHooks())
            if (item.starred) dispatch(hooks.unstar?.(item))
            else dispatch(hooks.star?.(item))
        }
        await dispatch(syncDuplicateCopies(item, { starred: !item.starred }))
    }
}

const toggleHiddenDone = (item: RSSItem): ItemActionTypes => ({
    type: TOGGLE_HIDDEN,
    item: item,
})

export function toggleHidden(item: RSSItem): AppThunk<Promise<void>> {
    return async dispatch => {
        await database
            .update(itemsTable)
            .set({ hidden: !item.hidden })
            .where(eq(itemsTable._id, item._id))
        dispatch(toggleHiddenDone(item))
        await dispatch(syncDuplicateCopies(item, { hidden: !item.hidden }))
    }
}

export function itemShortcuts(item: RSSItem, e: KeyboardEvent): AppThunk {
    return dispatch => {
        if (e.metaKey) return
        switch (e.key) {
            case "m":
            case "M":
                if (item.hasRead) dispatch(markUnread(item))
                else dispatch(markRead(item))
                break
            case "b":
            case "B":
                if (!item.hasRead) dispatch(markRead(item))
                window.utils.openExternal(item.link, platformCtrl(e))
                break
            case "s":
            case "S":
                dispatch(toggleStarred(item))
                break
            case "h":
            case "H":
                if (!item.hasRead && !item.hidden) dispatch(markRead(item))
                dispatch(toggleHidden(item))
                break
        }
    }
}

export function applyItemReduction(item: RSSItem, type: string) {
    let nextItem = { ...item }
    switch (type) {
        case MARK_READ:
        case MARK_UNREAD: {
            nextItem.hasRead = type === MARK_READ
            break
        }
        case TOGGLE_STARRED: {
            nextItem.starred = !item.starred
            break
        }
        case TOGGLE_HIDDEN: {
            nextItem.hidden = !item.hidden
            break
        }
    }
    return nextItem
}

export function itemReducer(
    state: ItemState = {},
    action:
        | ItemActionTypes
        | FeedActionTypes
        | ServiceActionTypes
        | SettingsActionTypes
): ItemState {
    switch (action.type) {
        case FETCH_ITEMS:
            switch (action.status) {
                case ActionStatus.Success: {
                    let newMap = {}
                    for (let i of action.items) {
                        newMap[i._id] = i
                    }
                    return { ...newMap, ...state }
                }
                default:
                    return state
            }
        case MARK_UNREAD:
        case MARK_READ:
        case TOGGLE_STARRED:
        case TOGGLE_HIDDEN: {
            return {
                ...state,
                [action.item._id]: applyItemReduction(
                    state[action.item._id],
                    action.type
                ),
            }
        }
        case MARK_ALL_READ: {
            let nextState = { ...state }
            let sids = new Set(action.sids)
            for (let item of Object.values(state)) {
                if (sids.has(item.source) && !item.hasRead) {
                    if (
                        !action.time ||
                        (action.before
                            ? item.date.getTime() <= action.time
                            : item.date.getTime() >= action.time)
                    ) {
                        nextState[item._id] = {
                            ...item,
                            hasRead: true,
                        }
                    }
                }
            }
            return nextState
        }
        case UNDO_MARK_ALL_READ: {
            let nextState = { ...state }
            for (const iid of action.iids) {
                const item = nextState[iid]
                if (item && item.hasRead) {
                    nextState[iid] = {
                        ...item,
                        hasRead: false,
                    }
                }
            }
            return nextState
        }
        case LOAD_MORE:
        case INIT_FEED: {
            switch (action.status) {
                case ActionStatus.Success: {
                    let nextState = { ...state }
                    for (let i of action.items) {
                        nextState[i._id] = i
                    }
                    return nextState
                }
                default:
                    return state
            }
        }
        case SYNC_LOCAL_ITEMS: {
            let nextState = { ...state }
            for (let item of Object.values(state)) {
                // Local SQLite rows also have serviceRef, with a null value.
                if (item.serviceRef) {
                    const nextItem = { ...item }
                    nextItem.hasRead = !action.unreadIds.has(item.serviceRef)
                    nextItem.starred = action.starredIds.has(item.serviceRef)
                    nextState[item._id] = nextItem
                }
            }
            return nextState
        }
        case FREE_MEMORY: {
            const nextState: ItemState = {}
            for (let item of Object.values(state)) {
                if (action.iids.has(item._id)) nextState[item._id] = item
            }
            return nextState
        }
        default:
            return state
    }
}
