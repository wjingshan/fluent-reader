import * as React from "react"
import intl from "react-intl-universal"
import { Stack, Link } from "@fluentui/react"

// Injected by webpack's DefinePlugin at build time (see webpack.config.js).
// `typeof` keeps this safe if someone builds without those defines.
declare const __FR_GIT_BRANCH__: string
declare const __FR_GIT_COMMIT__: string
declare const __FR_GIT_DATE__: string
declare const __FR_GIT_DIRTY__: string

const gitBranch =
    typeof __FR_GIT_BRANCH__ !== "undefined" ? __FR_GIT_BRANCH__ : ""
const gitCommit =
    typeof __FR_GIT_COMMIT__ !== "undefined" ? __FR_GIT_COMMIT__ : ""
const gitDate = typeof __FR_GIT_DATE__ !== "undefined" ? __FR_GIT_DATE__ : ""
const gitDirty = typeof __FR_GIT_DIRTY__ !== "undefined" ? __FR_GIT_DIRTY__ : ""

const MY_REPO = "https://github.com/wjingshan/fluent-reader"
const MY_BRANCH_URL = gitBranch
    ? `${MY_REPO}/tree/${encodeURIComponent(gitBranch)}`
    : MY_REPO

const AboutTab: React.FC = () => {
    return (
        <div className="tab-body">
            <Stack className="settings-about" horizontalAlign="center">
                <img
                    src="icons/logo.svg"
                    alt="Fluent Reader Logo"
                    style={{ width: 120, height: 120 }}
                />
                <h3 style={{ fontWeight: 600 }}>Fluent Reader</h3>
                <small>
                    {intl.get("settings.version")}{" "}
                    {globalThis.utils.getVersion()}
                </small>
                {gitCommit ? (
                    <small style={{ color: "var(--neutralSecondary)" }}>
                        {intl.get("settings.localBuild")} {gitBranch || "-"} @{" "}
                        {gitCommit}
                        {gitDirty ? "*" : ""}
                        {gitDate ? ` · ${gitDate}` : ""}
                    </small>
                ) : null}
                <p className="settings-hint">
                    Copyright © 2020 Haoyuan Liu. All rights reserved.
                </p>
                <Stack
                    horizontal
                    horizontalAlign="center"
                    tokens={{ childrenGap: 12 }}>
                    <small>
                        <Link
                            onClick={() =>
                                globalThis.utils.openExternal(
                                    "https://github.com/yang991178/fluent-reader/wiki/Support#keyboard-shortcuts"
                                )
                            }>
                            {intl.get("settings.shortcuts")}
                        </Link>
                    </small>
                    <small>
                        <Link
                            onClick={() =>
                                globalThis.utils.openExternal(
                                    "https://github.com/yang991178/fluent-reader"
                                )
                            }>
                            {intl.get("settings.openSource")}
                        </Link>
                    </small>
                    <small>
                        <Link
                            onClick={() =>
                                globalThis.utils.openExternal(
                                    "https://github.com/yang991178/fluent-reader/issues"
                                )
                            }>
                            {intl.get("settings.feedback")}
                        </Link>
                    </small>
                    {gitBranch ? (
                        <small>
                            <Link
                                onClick={() =>
                                    globalThis.utils.openExternal(MY_BRANCH_URL)
                                }>
                                {gitBranch}
                            </Link>
                        </small>
                    ) : null}
                </Stack>
            </Stack>
        </div>
    )
}

export default AboutTab
