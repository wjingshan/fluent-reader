import intl from "react-intl-universal"
import { SourceGroup } from "../../schema-types"
import { AppThunk } from "../utils"
import { updateRulesForTarget } from "./rule"
import { reorderSourceGroups } from "./group"

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
