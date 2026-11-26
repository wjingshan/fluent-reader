import * as React from "react"
import { useMemo, useCallback, useEffect, useRef, useState } from "react"
import intl from "react-intl-universal"
import { SourceGroup, ViewType } from "../schema-types"
import { RSSSource } from "../scripts/models/source"
import { ALL, initFeeds } from "../scripts/models/feed"
import { useAppSelector, useAppDispatch, rootStore } from "../scripts/reducer"
import { toggleMenu, openGroupMenu } from "../scripts/models/app"
import { toggleGroupExpansion } from "../scripts/models/group"
import { fetchItems } from "../scripts/models/item"
import {
    selectAllArticles,
    selectSources,
    toggleSearch,
} from "../scripts/models/page"
import {
    makeStyles,
    mergeClasses,
    ToggleButton,
    tokens,
    Tree,
    TreeItem,
    TreeItemLayout,
    TreeOpenChangeData,
    useSubtreeContext_unstable,
} from "@fluentui/react-components"
import { useFocusFinders } from "@fluentui/react-tabster"
import {
    ArrowSync16Regular,
    Checkmark16Regular,
    DocumentOnePageMultiple16Regular,
    Filter12Filled,
    Search16Regular,
} from "@fluentui/react-icons"
import { FlatButton } from "./utils/FlatButton"
import { FlatButtonGroup } from "./utils/FlatButtonGroup"
import { useIsWideScreen } from "./utils/hooks/useIsWideScreen"
import { useIsBlurred } from "./utils/hooks/useIsBlurred"
import { useArticleOverlayOpen } from "./utils/hooks/useArticleOverlayOpen"
import { Icon } from "@fluentui/react"
import { StackShim } from "@fluentui/react-migration-v8-v9"

// Sidebar marker for entries whose view no longer follows the global default.
const VIEW_ICONS: Record<ViewType, string> = {
    [ViewType.Cards]: "GridViewMedium",
    [ViewType.List]: "BacklogList",
    [ViewType.Magazine]: "Articles",
    [ViewType.Compact]: "BulletedList",
    [ViewType.Customized]: "Tiles",
}

const useMenuClasses = makeStyles({
    menuBtn: {
        height: "var(--navHeight)",
        lineHeight: "var(--navHeight)",
    },
    menuBtnBlurred: {
        color: "var(--neutralSecondaryAlt)",
    },
    menuGroupDarwin: {
        display: "flex",
        flexDirection: "row-reverse",
    },
    menuHeader: {
        height: "var(--navHeight)",
    },
    menuContainer: {
        "position": "fixed",
        "zIndex": 5,
        "left": 0,
        "top": 0,
        "width": "100%",
        "height": "100%",
        "pointerEvents": "none",
        "@media (min-width: 1024px)": {
            width: "280px !important",
            background: "none",
            backdropFilter: "none",
        },
    },
    menuContainerShow: {
        pointerEvents: "unset",
    },
    menuArticleBlurred: {
        filter: "var(--blur)",
    },
    menuInner: {
        "position": "absolute",
        "left": 0,
        "top": 0,
        "width": "280px",
        "height": "100%",
        "backgroundColor": "var(--neutralLighterAltOpacity)",
        "backdropFilter": "var(--blur)",
        "boxShadow": "5px 0 25px #0004",
        "transition":
            "clip-path var(--transition-timing) 0.367s, opacity cubic-bezier(0, 0, 0.2, 1) 0.367s",
        "clipPath": "inset(0 100% 0 0)",
        "opacity": 0,
        "@media (min-width: 1024px)": {
            "backgroundColor": "var(--neutralLight)",
            "boxShadow": "none",
            "::after": {
                content: '""',
                display: "block",
                pointerEvents: "none",
                position: "absolute",
                top: "-10%",
                right: 0,
                width: "120%",
                height: "120%",
                boxShadow: "inset 5px 0 25px #0004",
            },
        },
    },
    menuInnerShow: {
        "clipPath": "inset(0 -50px 0 0)",
        "opacity": 1,
        "@media (min-width: 1024px)": {
            clipPath: "inset(0)",
        },
    },
    menuInnerDarwin: {
        "@media (min-width: 1024px)": {
            background: "none",
        },
    },
    navWrapper: {
        maxHeight: "calc(100% - var(--navHeight))",
        overflowX: "hidden",
        overflowY: "auto",
    },
    tree: {
        paddingTop: 0,
        paddingBottom: 0,
    },
    subsHeaderStack: {
        marginTop: "16px",
        marginBottom: "4px",
        marginLeft: "8px",
        marginRight: "8px",
    },
    subsHeader: {
        fontSize: "12px",
        color: tokens.colorNeutralForeground4,
        userSelect: "none",
    },
    favicon: {
        width: "16px",
        height: "16px",
        verticalAlign: "middle",
        userSelect: "none",
    },
    primaryIcon: {
        color: tokens.colorCompoundBrandForeground1,
    },
    notice: {
        position: "absolute",
        left: "16px",
        right: "16px",
        bottom: "16px",
        padding: "8px 12px",
        borderRadius: tokens.borderRadiusMedium,
        backgroundColor: tokens.colorNeutralBackground1,
        border: `1px solid ${tokens.colorNeutralStroke1}`,
        boxShadow: tokens.shadow16,
        color: tokens.colorNeutralForeground2,
        fontSize: "12px",
        lineHeight: "18px",
        textAlign: "center",
        pointerEvents: "none",
        zIndex: 3,
    },
})

export const Menu: React.FC = () => {
    const dispatch = useAppDispatch()
    const menuClasses = useMenuClasses()
    const { findFirstFocusable } = useFocusFinders()
    const isWideScreen = useIsWideScreen()
    const isDarwin = globalThis.utils.platform === "darwin"
    const isBlurred = useIsBlurred()

    const status = useAppSelector(
        s => s.app.sourceInit && !s.app.settings.display
    )
    const display = useAppSelector(s => s.app.menu)
    const selected = useAppSelector(s => s.app.menuKey)
    const sources = useAppSelector(s => s.sources)
    const groups = useAppSelector(s => s.groups)
    const searchOn = useAppSelector(s => s.page.searchOn)
    const groupViews = useAppSelector(s => s.page.groupViews)
    const articleOverlayOpen = useArticleOverlayOpen()

    const openItems = useMemo(
        () =>
            new Set(
                groups
                    .filter(g => g.isMultiple && g.expanded)
                    .map(g => "g-" + g.gid)
            ),
        [groups]
    )

    const handleToggleMenu = useCallback(() => dispatch(toggleMenu()), [])
    const handleToggleSearch = useCallback(() => dispatch(toggleSearch()), [])
    const handleAllArticles = useCallback((init = false) => {
        dispatch(selectAllArticles(init))
        dispatch(initFeeds())
    }, [])
    const handleSelectSourceGroup = useCallback(
        (group: SourceGroup, menuKey: string) => {
            dispatch(selectSources(group.sids, menuKey, group.name))
            dispatch(initFeeds())
        },
        []
    )
    const handleSelectSource = useCallback((source: RSSSource) => {
        dispatch(selectSources([source.sid], "s-" + source.sid, source.name))
        dispatch(initFeeds())
    }, [])
    const handleGroupContextMenu = useCallback(
        (sids: number[], event: React.MouseEvent, menuKey?: string) => {
            dispatch(openGroupMenu(sids, event, menuKey))
        },
        []
    )

    const handleOpenChange = useCallback(
        (_event: any, data: TreeOpenChangeData) => {
            if (
                data.type === "ExpandIconClick" ||
                data.type === "ArrowRight" ||
                data.type === "ArrowLeft"
            ) {
                const value = String(data.value)
                if (value.startsWith("g-")) {
                    const gid = Number.parseInt(value.slice(2))
                    dispatch(toggleGroupExpansion(gid))
                }
            }
        },
        []
    )

    const [isUnreadSourcesOnly, setIsUnreadSourcesOnly] = useState(() =>
        globalThis.settings.getUnreadSourcesOnly()
    )

    const totalUnread = useMemo(
        () =>
            Object.values(sources)
                .filter(s => !s.hidden)
                .map(s => s.unreadCount)
                .reduce((a, b) => a + b, 0),
        [sources]
    )

    // In unread-only mode a group with nothing new still shows up, and its
    // count slot becomes a refresh button: the sidebar is the only place where
    // the user can ask "did anything arrive here?" without opening the group.
    const [refreshingGroups, setRefreshingGroups] = useState<
        Record<number, boolean>
    >({})
    const [notice, setNotice] = useState<string | null>(null)
    const noticeTimer = useRef<number>(null)
    const showNotice = (text: string) => {
        if (noticeTimer.current) clearTimeout(noticeTimer.current)
        setNotice(text)
        noticeTimer.current = window.setTimeout(() => setNotice(null), 2800)
    }
    useEffect(() => {
        return () => {
            if (noticeTimer.current) clearTimeout(noticeTimer.current)
        }
    }, [])

    const unreadOfSources = (sids: number[]) =>
        sids.reduce(
            (sum, sid) =>
                sum + (rootStore.getState().sources[sid]?.unreadCount || 0),
            0
        )

    // fetchItems is a global switch: it silently does nothing while any fetch
    // is in flight. Refreshing one group must not be swallowed just because
    // another group (or the scheduler) is fetching, so wait for the slot first
    // instead of dropping the request.
    const waitForFetchSlot = async () => {
        const deadline = Date.now() + 90000
        while (Date.now() < deadline) {
            const app = rootStore.getState().app
            if (!app.fetchingItems && !app.syncing) return true
            await new Promise(resolve => setTimeout(resolve, 150))
        }
        return false
    }

    const refreshGroup = (sids: number[], gid: number) => {
        // Only this group is busy, so a second group must still be clickable.
        if (refreshingGroups[gid]) return
        setRefreshingGroups(state => ({ ...state, [gid]: true }))
        const settle = () =>
            setRefreshingGroups(state => {
                const next = { ...state }
                delete next[gid]
                return next
            })
        const run = async () => {
            if (!(await waitForFetchSlot())) {
                showNotice(intl.get("menu.refreshFailed"))
                return
            }
            const before = unreadOfSources(sids)
            await dispatch(fetchItems(false, sids))
            // Counts are read from the store: this render's `sources` is the
            // value captured before the fetch ran.
            if (unreadOfSources(sids) <= before)
                showNotice(intl.get("menu.refreshedNoNew"))
        }
        run()
            .catch(() => showNotice(intl.get("menu.refreshFailed")))
            .finally(settle)
    }

    const treeRef = useRef<HTMLDivElement>(null)
    const previousDisplayRef = useRef(display)
    useEffect(() => {
        if (display && !previousDisplayRef.current) {
            findFirstFocusable(treeRef.current)?.focus()
        }
        previousDisplayRef.current = display
    }, [display])

    // Two feeds can share a display name (a site's own feed and a proxied copy
    // of it). Showing their host lets the sidebar tell them apart.
    const duplicateNames = useMemo(() => {
        const counts = new Map<string, number>()
        for (const source of Object.values(sources)) {
            const name = (source.name || "").trim()
            if (!name) continue
            counts.set(name, (counts.get(name) || 0) + 1)
        }
        const dup = new Set<string>()
        counts.forEach((count, name) => {
            if (count > 1) dup.add(name)
        })
        return dup
    }, [sources])

    const hostOf = (url: string) => {
        try {
            return new URL(url).host
        } catch {
            return ""
        }
    }

    const renderSourceItem = (s: RSSSource) => {
        const key = "s-" + s.sid
        const suffix = duplicateNames.has((s.name || "").trim())
            ? hostOf(s.url || "")
            : undefined
        return (
            <MenuTreeItem
                key={key}
                value={key}
                label={s.name}
                suffix={suffix}
                isSelected={selected === key}
                icon={
                    s.iconurl ? (
                        <img
                            alt=""
                            className={menuClasses.favicon}
                            src={s.iconurl}
                        />
                    ) : undefined
                }
                unreadCount={s.unreadCount}
                viewType={groupViews[key]}
                onClick={() => handleSelectSource(s)}
                onContextMenu={e => {
                    // Without this the row's event reaches the group node and
                    // replaces the single-source target with the whole group.
                    e.stopPropagation()
                    handleGroupContextMenu([s.sid], e, key)
                }}
            />
        )
    }

    return (
        status && (
            <div
                className={mergeClasses(
                    menuClasses.menuContainer,
                    display && menuClasses.menuContainerShow,
                    articleOverlayOpen && menuClasses.menuArticleBlurred
                )}
                onClick={handleToggleMenu}>
                <div
                    className={mergeClasses(
                        menuClasses.menuInner,
                        display && menuClasses.menuInnerShow,
                        isDarwin && menuClasses.menuInnerDarwin
                    )}
                    onClick={e => e.stopPropagation()}>
                    <div className={menuClasses.menuHeader}>
                        {display && (
                            <FlatButtonGroup
                                styleClass={
                                    isDarwin
                                        ? menuClasses.menuGroupDarwin
                                        : undefined
                                }>
                                <FlatButton
                                    styleClass={mergeClasses(
                                        menuClasses.menuBtn,
                                        isBlurred
                                            ? menuClasses.menuBtnBlurred
                                            : undefined
                                    )}
                                    title={intl.get("menu.close")}
                                    ariaLabel={intl.get("menu.close")}
                                    onClick={handleToggleMenu}>
                                    {isWideScreen ? (
                                        <Icon
                                            iconName={
                                                isDarwin
                                                    ? "SidePanel"
                                                    : "GlobalNavButton"
                                            }
                                        />
                                    ) : (
                                        <Icon iconName="Back" />
                                    )}
                                </FlatButton>
                            </FlatButtonGroup>
                        )}
                    </div>
                    <div className={menuClasses.navWrapper}>
                        <Tree
                            ref={treeRef}
                            className={menuClasses.tree}
                            size="small"
                            appearance="subtle-alpha"
                            openItems={openItems}
                            onOpenChange={handleOpenChange}>
                            <MenuTreeItem
                                value="search"
                                label={intl.get("search")}
                                icon={
                                    <Search16Regular
                                        className={menuClasses.primaryIcon}
                                    />
                                }
                                aside={
                                    searchOn ? (
                                        <Checkmark16Regular
                                            className={menuClasses.primaryIcon}
                                        />
                                    ) : undefined
                                }
                                onClick={handleToggleSearch}
                            />
                            <MenuTreeItem
                                value={ALL}
                                label={intl.get("allArticles")}
                                isSelected={selected === ALL}
                                icon={
                                    <DocumentOnePageMultiple16Regular
                                        className={menuClasses.primaryIcon}
                                    />
                                }
                                unreadCount={totalUnread}
                                onClick={() =>
                                    handleAllArticles(selected !== ALL)
                                }
                            />
                            {groups.length > 0 && (
                                <StackShim
                                    horizontal
                                    horizontalAlign="space-between"
                                    verticalAlign="center"
                                    className={menuClasses.subsHeaderStack}>
                                    <span className={menuClasses.subsHeader}>
                                        {intl.get("menu.subscriptions")}
                                    </span>
                                    <ToggleButton
                                        aria-label={
                                            isUnreadSourcesOnly
                                                ? intl.get("context.unreadOnly")
                                                : intl.get("allArticles")
                                        }
                                        checked={isUnreadSourcesOnly}
                                        onClick={() => {
                                            setIsUnreadSourcesOnly(value => {
                                                globalThis.settings.setUnreadSourcesOnly(
                                                    !value
                                                )
                                                return !value
                                            })
                                        }}
                                        size="small"
                                        appearance="transparent"
                                        icon={<Filter12Filled />}>
                                        {isUnreadSourcesOnly &&
                                            intl.get("context.unreadOnly")}
                                    </ToggleButton>
                                </StackShim>
                            )}
                            {groups
                                .filter(g => {
                                    if (g.sids.length === 0) return false
                                    if (!isUnreadSourcesOnly) return true
                                    // A real group stays visible even with
                                    // nothing unread: its count slot then holds
                                    // the refresh button.
                                    if (g.isMultiple) return true
                                    return g.sids.some(
                                        sid => sources[sid]?.unreadCount > 0
                                    )
                                })
                                .map(g => {
                                    if (g.isMultiple) {
                                        const groupSources = g.sids.map(
                                            sid => sources[sid]
                                        )
                                        const groupKey = "g-" + g.gid
                                        const isGroupSelected =
                                            selected === groupKey
                                        const groupUnread = groupSources
                                            .map(s => s.unreadCount)
                                            .reduce((a, b) => a + b, 0)
                                        const visibleGroupSources =
                                            isUnreadSourcesOnly
                                                ? groupSources.filter(
                                                      s => s.unreadCount > 0
                                                  )
                                                : groupSources
                                        return (
                                            <MenuTreeItem
                                                key={groupKey}
                                                value={groupKey}
                                                itemType="branch"
                                                label={g.name}
                                                isSelected={isGroupSelected}
                                                unreadCount={groupUnread}
                                                refresh={
                                                    isUnreadSourcesOnly &&
                                                    groupUnread === 0
                                                        ? {
                                                              // Keyed by this
                                                              // group only: a
                                                              // refresh in one
                                                              // group must not
                                                              // spin the others.
                                                              busy: Boolean(
                                                                  refreshingGroups[
                                                                      g.gid
                                                                  ]
                                                              ),
                                                              onClick: () =>
                                                                  refreshGroup(
                                                                      g.sids,
                                                                      g.gid
                                                                  ),
                                                          }
                                                        : undefined
                                                }
                                                viewType={groupViews[groupKey]}
                                                onClick={() =>
                                                    handleSelectSourceGroup(
                                                        g,
                                                        groupKey
                                                    )
                                                }
                                                onContextMenu={e =>
                                                    handleGroupContextMenu(
                                                        g.sids,
                                                        e,
                                                        groupKey
                                                    )
                                                }>
                                                <Tree>
                                                    {visibleGroupSources.map(
                                                        renderSourceItem
                                                    )}
                                                </Tree>
                                            </MenuTreeItem>
                                        )
                                    } else {
                                        return renderSourceItem(
                                            sources[g.sids[0]]
                                        )
                                    }
                                })}
                        </Tree>
                        {notice && (
                            <div className={menuClasses.notice} role="status">
                                {notice}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )
    )
}

const useTreeItemClasses = makeStyles({
    treeItem: {
        minHeight: "32px",
    },
    treeLeafItem: {
        paddingLeft: "12px",
    },
    treeLeafSubItem: {
        paddingLeft: "24px",
    },
    selectedItem: {
        "::after": {
            content: '""',
            position: "absolute",
            left: 0,
            top: "4px",
            width: "4px",
            height: "24px",
            borderRadius: tokens.borderRadiusCircular,
            backgroundColor: tokens.colorCompoundBrandForeground1,
        },
    },
    selectedItemText: {
        color: tokens.colorNeutralForeground1,
        fontWeight: tokens.fontWeightSemibold,
    },
    label: {
        minWidth: 0,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
    },
    unreadCount: {
        color: tokens.colorNeutralForeground3,
        marginLeft: "auto",
        paddingLeft: "4px",
        flexShrink: 0,
    },
    // Stands in for the unread count of a group that has none: in unread-only
    // mode such a group still needs a way to ask "anything new in here?".
    refreshAction: {
        "display": "inline-flex",
        "alignItems": "center",
        "justifyContent": "center",
        "width": "20px",
        "height": "20px",
        "padding": "0",
        "border": "none",
        "borderRadius": tokens.borderRadiusSmall,
        "background": "transparent",
        "color": tokens.colorCompoundBrandForeground1,
        "fontSize": "16px",
        "lineHeight": "16px",
        "cursor": "pointer",
        "flexShrink": 0,
        ":hover": {
            backgroundColor: tokens.colorSubtleBackgroundHover,
        },
        ":disabled": {
            // A spinning brand-coloured arrow reads as "working"; grey would
            // read as "not available".
            color: tokens.colorCompoundBrandForeground1,
            opacity: 0.55,
            cursor: "default",
            backgroundColor: "transparent",
        },
    },
    refreshSpinning: {
        animationName: {
            from: { transform: "rotate(0deg)" },
            to: { transform: "rotate(360deg)" },
        },
        animationDuration: "900ms",
        animationIterationCount: "infinite",
        animationTimingFunction: "linear",
    },
    asideGroup: {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        marginLeft: "auto",
        paddingLeft: "4px",
        flexShrink: 0,
    },
    viewBadge: {
        display: "flex",
        alignItems: "center",
        color: tokens.colorNeutralForeground3,
        opacity: 0.75,
        fontSize: "12px",
    },
    nameSuffix: {
        color: tokens.colorNeutralForeground4,
        fontSize: "11px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "96px",
    },
})

interface MenuTreeItemProps {
    value: string
    itemType?: "leaf" | "branch"
    label: string
    // Extra grey text after the label, used to tell sources with the same name
    // apart (for example a proxied feed and the site's own feed).
    suffix?: string
    isSelected?: boolean
    icon?: React.ReactElement
    unreadCount?: number
    // Replaces the unread count with a refresh button: an empty group in
    // unread-only mode still needs a way to ask for new items.
    refresh?: { busy: boolean; onClick: () => void }
    // set when this entry remembers a view of its own
    viewType?: ViewType
    aside?: React.ReactElement
    onClick: () => void
    onContextMenu?: (e: React.MouseEvent) => void
    children?: React.ReactNode
}

const MenuTreeItem: React.FC<MenuTreeItemProps> = ({
    value,
    itemType = "leaf",
    label,
    suffix,
    isSelected = false,
    icon,
    unreadCount,
    viewType,
    aside,
    refresh,
    onClick,
    onContextMenu,
    children,
}) => {
    const c = useTreeItemClasses()
    const { level } = useSubtreeContext_unstable()
    const count =
        unreadCount && unreadCount > 0 ? (
            <span className={c.unreadCount}>
                {unreadCount >= 1000 ? "999+" : String(unreadCount)}
            </span>
        ) : undefined
    const countSlot = refresh ? (
        <button
            type="button"
            className={c.refreshAction}
            disabled={refresh.busy}
            title={intl.get(refresh.busy ? "menu.refreshing" : "menu.refresh")}
            aria-label={intl.get(
                refresh.busy ? "menu.refreshing" : "menu.refresh"
            )}
            onClick={e => {
                // Without this the click also selects and expands the group.
                e.stopPropagation()
                refresh.onClick()
            }}>
            <ArrowSync16Regular
                className={refresh.busy ? c.refreshSpinning : undefined}
            />
        </button>
    ) : (
        count
    )
    let resolvedAside: React.ReactElement | undefined = aside
    if (
        resolvedAside === undefined &&
        (viewType !== undefined || countSlot || suffix || refresh)
    ) {
        resolvedAside = (
            <span className={c.asideGroup}>
                {suffix ? <span className={c.nameSuffix}>{suffix}</span> : null}
                {viewType !== undefined ? (
                    <span
                        className={c.viewBadge}
                        title={intl.get("context.customView")}
                        aria-label={intl.get("context.customView")}>
                        <Icon iconName={VIEW_ICONS[viewType]} />
                    </span>
                ) : null}
                {countSlot}
            </span>
        )
    }
    const handleContextMenu = onContextMenu
        ? (e: React.MouseEvent) => {
              e.stopPropagation()
              onContextMenu(e)
          }
        : undefined
    return (
        <TreeItem
            value={value}
            itemType={itemType}
            onClick={onClick}
            onContextMenu={handleContextMenu}>
            <TreeItemLayout
                aria-label={`${isSelected ? "Selected: " : ""}${label}${
                    suffix ? ` (${suffix})` : ""
                }`}
                className={mergeClasses(
                    c.treeItem,
                    itemType === "leaf" && c.treeLeafItem,
                    level > 1 && c.treeLeafSubItem,
                    isSelected && c.selectedItem
                )}
                iconBefore={icon}
                main={{ className: c.label }}
                aside={resolvedAside}>
                <span className={isSelected ? c.selectedItemText : undefined}>
                    {label}
                </span>
            </TreeItemLayout>
            {children}
        </TreeItem>
    )
}
