// inject.mjs — re-apply the Fluent Reader media patch to an app.asar.
//
// Usage:
//   node inject.mjs probe <asar> <unpackedDir>
//   node inject.mjs apply <baseAsar> <unpackedDir> <patchSrcDir> <outAsar>
//
// `probe` prints the archive's package.json "main" field as plain text.
// `apply` extracts the base archive, injects the patch files, rewrites
// package.json and index.html, repacks and verifies the result.
//
// It is idempotent: the markers we add to index.html are stripped before the
// fresh ones are written, so running it twice cannot duplicate them.
//
// @electron/asar lives in ./node_modules next to this file.
import fs from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"
import * as asar from "@electron/asar"

const here = path.dirname(fileURLToPath(import.meta.url))
const PATCH_FILES = ["patch-main.js", "patch-renderer.js", "patch.css"]

function fail(message) {
    console.error("INJECT FAILED: " + message)
    process.exit(1)
}

function copyTree(from, to) {
    fs.cpSync(from, to, { recursive: true })
}

// Copy an archive plus its unpacked sidecar into a scratch folder, so the
// extractor can find the external files it references.
function stageArchive(asarPath, unpackedDir, work, name) {
    const staged = path.join(work, name)
    fs.mkdirSync(staged, { recursive: true })
    const stagedAsar = path.join(staged, "app.asar")
    fs.copyFileSync(asarPath, stagedAsar)
    const sidecar = path.join(staged, "app.asar.unpacked")
    if (unpackedDir && fs.existsSync(unpackedDir)) {
        copyTree(unpackedDir, sidecar)
    } else {
        fs.mkdirSync(sidecar, { recursive: true })
    }
    return { stagedAsar, sidecar, appDir: path.join(staged, "app") }
}

// ------------------------------------------------------------------- probe
if (process.argv[2] === "probe") {
    const [, , , asarPath, unpackedDir] = process.argv
    if (!asarPath) fail("probe needs <asar> <unpackedDir>")
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "fr-probe-"))
    try {
        const { stagedAsar, appDir } = stageArchive(
            asarPath,
            unpackedDir,
            work,
            "probe"
        )
        asar.extractAll(stagedAsar, appDir)
        const pkgPath = path.join(appDir, "package.json")
        let main = ""
        if (fs.existsSync(pkgPath)) {
            main = JSON.parse(fs.readFileSync(pkgPath, "utf8")).main || ""
        }
        console.log(main)
    } finally {
        fs.rmSync(work, { recursive: true, force: true })
    }
    process.exit(0)
}

// ------------------------------------------------------------------- apply
if (process.argv[2] === "apply") {
    const [, , , baseAsar, unpackedDir, patchSrcDir, outAsar, distOverride] =
        process.argv
    if (!baseAsar || !patchSrcDir || !outAsar) {
        fail("apply needs <baseAsar> <unpackedDir> <patchSrcDir> <outAsar>")
    }
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "fr-inject-"))
    try {
        const { stagedAsar, appDir } = stageArchive(
            baseAsar,
            unpackedDir,
            work,
            "base"
        )
        asar.extractAll(stagedAsar, appDir)

        const distDir = path.join(appDir, "dist")
        if (!fs.existsSync(distDir)) fail("no dist/ directory in the archive")

        // Optional: replace the whole renderer build (used when the patch
        // carries features that need a real source change, e.g. a new view).
        if (distOverride) {
            if (!fs.existsSync(distOverride)) {
                fail("dist override not found: " + distOverride)
            }
            fs.rmSync(distDir, { recursive: true, force: true })
            fs.cpSync(distOverride, distDir, { recursive: true })
            console.log("dist replaced from " + distOverride)
        }

        // 1) the three patch files
        for (const name of PATCH_FILES) {
            const from = path.join(patchSrcDir, name)
            if (!fs.existsSync(from)) fail("missing patch source: " + name)
            fs.copyFileSync(from, path.join(distDir, name))
        }

        // 2) package.json -> point main at our shim
        const pkgPath = path.join(appDir, "package.json")
        if (!fs.existsSync(pkgPath)) fail("no package.json in the archive")
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
        pkg.main = "./dist/patch-main.js"
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))

        // 3) index.html -> CSP media-src + stylesheet + script
        const htmlPath = path.join(distDir, "index.html")
        if (!fs.existsSync(htmlPath)) fail("no dist/index.html in the archive")
        let html = fs.readFileSync(htmlPath, "utf8")

        // strip previous injections so repeated runs stay clean
        html = html.replace(/\s*<link[^>]*href="patch\.css"[^>]*>/gi, "")
        html = html.replace(
            /\s*<script[^>]*src="patch-renderer\.js"[^>]*><\/script>/gi,
            ""
        )
        html = html.replace(/;\s*media-src[^;]*/gi, ";")

        if (/Content-Security-Policy/i.test(html)) {
            html = html.replace(
                /(content="[^"]*)(")/i,
                "$1; media-src https: http: blob:$2"
            )
        } else {
            html = html.replace(
                /<head>/i,
                `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src https: http: blob:;">`
            )
        }
        if (!/href="patch\.css"/i.test(html)) {
            html = html.replace(
                /(<link[^>]*href="index\.css"[^>]*>)/i,
                '$1<link rel="stylesheet" href="patch.css">'
            )
        }
        if (!/src="patch-renderer\.js"/i.test(html)) {
            html = html.replace(
                /(<script[^>]*src="index\.js"[^>]*><\/script>)/i,
                '$1<script defer="defer" src="patch-renderer.js"></script>'
            )
        }
        fs.writeFileSync(htmlPath, html)

        for (const [label, ok] of [
            ["media-src in CSP", /media-src/i.test(html)],
            ["patch.css linked", /patch\.css/i.test(html)],
            ["patch-renderer.js linked", /patch-renderer\.js/i.test(html)],
            ["main -> patch-main.js", pkg.main === "./dist/patch-main.js"],
            [
                "patch files present",
                PATCH_FILES.every(n => fs.existsSync(path.join(distDir, n))),
            ],
        ]) {
            if (!ok) fail("post-injection check failed: " + label)
        }

        // 4) repack
        fs.rmSync(outAsar, { force: true })
        fs.rmSync(outAsar.replace(/\.asar$/, ".asar.unpacked"), {
            recursive: true,
            force: true,
        })
        await asar.createPackageWithOptions(appDir, outAsar, {
            unpackDir: "node_modules/better-sqlite3",
        })

        // 5) verify by reading the new archive back
        const checkDir = path.join(work, "check")
        asar.extractAll(outAsar, checkDir)
        const checkPkg = JSON.parse(
            fs.readFileSync(path.join(checkDir, "package.json"), "utf8")
        )
        if (checkPkg.main !== "./dist/patch-main.js") {
            fail("verification: main not patched")
        }
        for (const name of PATCH_FILES) {
            if (!fs.existsSync(path.join(checkDir, "dist", name))) {
                fail("verification: " + name + " missing from the new archive")
            }
        }

        let unpackedFiles = 0
        const unpackedOut = outAsar.replace(/\.asar$/, ".asar.unpacked")
        const walk = dir => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.isDirectory()) walk(path.join(dir, entry.name))
                else unpackedFiles++
            }
        }
        if (fs.existsSync(unpackedOut)) walk(unpackedOut)

        console.log(
            "OK: " +
                path.basename(outAsar) +
                " (" +
                fs.statSync(outAsar).size +
                " bytes), unpacked " +
                unpackedFiles +
                " files"
        )
    } finally {
        fs.rmSync(work, { recursive: true, force: true })
    }
    process.exit(0)
}

fail("unknown command: " + process.argv[2])
