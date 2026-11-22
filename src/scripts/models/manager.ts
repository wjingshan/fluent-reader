import intl from "react-intl-universal"
import { SourceGroup } from "../../schema-types"
import { AppThunk } from "../utils"
import { updateRulesForTarget } from "./rule"
import { reorderSourceGroups } from "./group"
import { deleteSource, RSSSource } from "./source"

// deleteSources() wraps the loop in saveSettings(), which force-opens the
// settings overlay (SAVE_SETTINGS sets display: true). The manager must not
// disturb that surface, so delete in batch mode without the wrapper.
export function deleteSourcesQuiet(
    sources: RSSSource[]
): AppThunk<Promise<void>> {
    return async dispatch => {
        for (const source of sources) {
            await dispatch(deleteSource(source, true))
        }
    }
}

// Batch-move sources into a group (gid) or out of any group (gid === null).
// Computes the next groups array with object spreads so `isMultiple`/`name`
// survive (the SourceGroup constructor would demote 1-sid groups), persists
// once, and returns the previous array so callers can undo by re-dispatching
// reorderSourceGroups(snapshot).
export function moveSourcesToGroup(
    sids: number[],
    gid: number | null
): AppThunk<SourceGroup[] | null> {
    return (dispatch, getState) => {
        const state = getState()
        const moving = sids.filter(sid => state.sources[sid])
        if (moving.length === 0) return null
        if (
            gid !== null &&
            !state.groups.some(g => g.isMultiple && g.gid === gid)
        ) {
            return null
        }
        const movingSet = new Set(moving)
        const prev = state.groups
        const next = prev
            .map(g => ({
                ...g,
                sids:
                    g.gid === gid
                        ? [
                              ...g.sids.filter(sid => !movingSet.has(sid)),
                              ...moving,
                          ]
                        : g.isMultiple || gid !== null
                        ? g.sids.filter(sid => !movingSet.has(sid))
                        : g.sids,
            }))
            .filter(g => g.isMultiple || g.sids.length > 0)
        if (gid === null) {
            for (const sid of moving) {
                if (prev.some(g => g.isMultiple && g.sids.includes(sid))) {
                    next.push(
                        new SourceGroup(window.settings.allocateGroupId(), [
                            sid,
                        ])
                    )
                }
            }
        }
        dispatch(reorderSourceGroups(next))
        return prev
    }
}

// `deleteSourceGroup` in group.ts calls saveSettings(), which opens the
// settings overlay. The manager lives above that overlay, so deleting a group
// from the manager would leave the settings panel open behind it. This variant
// performs the same work without touching the settings display state.
export function deleteSourceGroupQuiet(gid: number): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        const group = getState().groups.find(g => g.gid === gid)
        if (!group?.isMultiple) return
        try {
            await dispatch(updateRulesForTarget({ type: "group", gid }, []))
            const current = getState().groups.find(g => g.gid === gid)
            if (!current) return
            const orphanGroups = current.sids.map(
                sid => new SourceGroup(window.settings.allocateGroupId(), [sid])
            )
            dispatch(
                reorderSourceGroups(
                    getState().groups.flatMap(g =>
                        g.gid === gid ? orphanGroups : [g]
                    )
                )
            )
        } catch (err) {
            window.utils.showErrorBox(
                intl.get("settings.writeError"),
                String(err)
            )
        }
    }
}
