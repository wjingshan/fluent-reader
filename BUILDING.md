# 构建与打包（本地修改版）

这个分支（`master-Rae`）在 Fluent Reader 1.3.2 的基础上加了若干本地功能，并附带一层运行时补丁。
本文说明如何从源码一路构建出可以安装的程序。

## 两层的分工

| 层 | 内容 | 怎么产生 |
|---|---|---|
| 源码层 | 瀑布流视图、多图折叠/展开/翻页、按需翻译、置顶按钮、分组拖拽排序、跨源重复合并 | `npm run build` |
| 补丁层 | Referer 注入、悬停播放视频、Eagle 导入按钮、环回 CORS | `local-patch/apply-patch.ps1` |

补丁层是在**打包或安装之后**改写 `app.asar` 实现的，不能通过 `npm run build` 得到。
`electron-builder` 打出的安装包里**不含补丁层**，装完还要跑一次注入脚本。

## 环境

- **Node.js 20+**（项目用 webpack 5；本机验证过 22.x）
- npm（随 Node 提供）
- Windows 打包需要 **NSIS 由 electron-builder 自动下载**，首次打包要有网络
- 如果要打 AppX 商店包，还需要对应的**代码签名证书**——本地通常没有，跳过即可

## 一、构建源码

```powershell
npm install
npm run build
```

产物在 `dist/`：`electron.js`、`preload.js`、`index.js`、`index.html`。

> `postinstall` 会尝试通过 `install-electron` 拉取 Electron 二进制。如果网络受限导致它失败，
> `npm run build` 仍可正常完成（构建只依赖 webpack），但 `npm run electron` 无法在本机直接跑起来。

## 二、打包成安装程序

```powershell
npm run package-win-ci
```

- 用的是 `electron-builder -w --x64 -p never`，即 **NSIS 安装包 + 免安装 zip**
- 产物目录由 `electron-builder.yml` 的 `directories.output` 决定：**`bin/win32/x64/`**
  （注意是 `win32`，不是 `win`），里面是 `Fluent Reader Setup <version>.exe` 和 `Fluent Reader <version>.exe`
- `-p never` 表示不自动发布，只产出本地文件
- 首次运行会先下载并解压约 **240 MB 的 Electron 运行时**到 `bin/win32/x64/win-unpacked/`，
  这一步在慢网络下可能花很久；如果卡住，可以先设镜像再重试（见文末）

**不要用 `npm run package-win`** —— 那个脚本打的是 **AppX**（`appx:x64` 与 `appx:arm64`），
需要 `electron-builder.yml` 里 `appx.identityName` / `publisher` 对应的签名证书，本地一般跑不通。

其它平台：

```powershell
npm run package-linux   # AppImage
npm run package-mac     # dmg（需要 macOS 与签名）
```

## 三、安装后再注入补丁

安装包本身**不含**视频悬停播放和 Eagle 按钮。装好并至少运行一次之后：

```powershell
cd local-patch
npm install          # 只装 @electron/asar
.\apply-patch.ps1    # 默认改写 C:\Program Files\Fluent Reader\resources\app.asar
```

注入是幂等的，可以反复运行；还原用 `local-patch\restore.ps1`。
细节见 [local-patch/README.md](local-patch/README.md)。

## 四、改了代码之后

- 只改 `src/` → `npm run build`，然后重新安装 / 打包；如果已经注入过补丁，
  需要用 `local-patch` 在原版备份上**重新注入一次**（因为安装新 asar 会覆盖掉补丁）
- 只改 `local-patch/patch/` → 不用重新构建，直接重跑 `apply-patch.ps1`
- 验证门槛：`npm run build` 与 `npx prettier --check .` 都要通过

## 常见问题

**打包卡在下载 Electron / NSIS**

electron-builder 首次运行要下载对应版本的 Electron 与 NSIS 工具。可以设置镜像后重试：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm run package-win-ci
```

**打完包装上，程序打不开、也没有报错**

多半是安装/注入前强杀了 Fluent Reader，留下了 Chromium 单例锁。重启系统即可恢复。
`apply-patch.ps1` 已经改成先请求窗口关闭（`WM_CLOSE`）再强杀，正常情况下不会触发。

**安装包能跑但没有视频悬停播放**

说明补丁层没注入。装完后记得在 `local-patch` 里跑一次 `apply-patch.ps1`。
