const HtmlWebpackPlugin = require("html-webpack-plugin")
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin")
const { GriffelPlugin } = require("@griffel/webpack-plugin")
const MiniCssExtractPlugin = require("mini-css-extract-plugin")
const webpack = require("webpack")
const { execSync } = require("child_process")

// Build provenance shown on the About tab. Resolved at build time so the running
// app can state which checkout it came from; every lookup degrades to an empty
// string when git is unavailable (e.g. building from a tarball).
function gitInfo() {
    const read = args => {
        try {
            return execSync(`git ${args}`, {
                cwd: __dirname,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            }).trim()
        } catch {
            return ""
        }
    }
    return {
        branch: read("rev-parse --abbrev-ref HEAD"),
        commit: read("rev-parse --short HEAD"),
        date: read("log -1 --format=%cs"),
        dirty: read("status --porcelain --untracked-files=no") ? "1" : "",
    }
}

const GIT = gitInfo()

module.exports = [
    {
        mode: "production",
        stats: "minimal",
        entry: "./src/electron.ts",
        target: "electron-main",
        externals: {
            "better-sqlite3": "commonjs better-sqlite3",
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    include: /src/,
                    resolve: {
                        extensions: [".ts", ".js"],
                    },
                    use: [{ loader: "ts-loader" }],
                },
            ],
        },
        output: {
            devtoolModuleFilenameTemplate: "[absolute-resource-path]",
            path: __dirname + "/dist",
            filename: "electron.js",
        },
        node: {
            __dirname: false,
        },
    },
    {
        mode: "production",
        stats: "minimal",
        entry: "./src/preload.ts",
        target: "electron-preload",
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    include: /src/,
                    resolve: {
                        extensions: [".ts", ".js"],
                    },
                    use: [{ loader: "ts-loader" }],
                },
            ],
        },
        output: {
            path: __dirname + "/dist",
            filename: "preload.js",
        },
    },
    {
        mode: "production",
        stats: "minimal",
        entry: "./src/index.tsx",
        target: "web",
        devtool: "source-map",
        performance: {
            hints: false,
        },
        module: {
            rules: [
                {
                    test: /\.(js|ts|tsx)$/,
                    include: [/src/, /node_modules\/@fluentui/],
                    use: {
                        loader: "@griffel/webpack-plugin/loader",
                    },
                },
                {
                    test: /\.ts(x?)$/,
                    include: /src/,
                    resolve: {
                        extensions: [".ts", ".tsx", ".js"],
                    },
                    use: {
                        loader: "ts-loader",
                    },
                },
                {
                    test: /\.css$/,
                    use: [MiniCssExtractPlugin.loader, "css-loader"],
                },
            ],
        },
        output: {
            path: __dirname + "/dist",
            filename: "index.js",
        },
        plugins: [
            new NodePolyfillPlugin({
                additionalAliases: ["process"],
                excludeAliases: ["Buffer"],
            }),
            new HtmlWebpackPlugin({
                template: "./src/index.html",
            }),
            new MiniCssExtractPlugin(),
            new GriffelPlugin(),
            new webpack.DefinePlugin({
                __FR_GIT_BRANCH__: JSON.stringify(GIT.branch),
                __FR_GIT_COMMIT__: JSON.stringify(GIT.commit),
                __FR_GIT_DATE__: JSON.stringify(GIT.date),
                __FR_GIT_DIRTY__: JSON.stringify(GIT.dirty),
            }),
        ],
    },
]
