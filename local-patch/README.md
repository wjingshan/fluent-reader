# local-patch —— 媒体互操作补丁

Fluent Reader 本体之外的一层运行时补丁，通过改写**已安装的 `app.asar`** 生效。
它不属于上游项目，也不需要重新编译 `src/`：升级 Fluent Reader 之后重跑一次即可。

## 它做什么

| 能力 | 说明 |
|---|---|
| Referer 注入 | 给 `media` / `image` 请求补上来源站点的 Referer，绕开图床防盗链 |
| 视频版 GIF 悬停播放 | 卡片里识别 `<video>`/GIF，悬停时叠一层 `<video>` 播放 |
| Eagle 导入按钮 | 瀑布流/卡片角落的按钮，把原图 + 文章链接推到本地 Eagle |
| 环回 CORS 修复 | renderer 经本地环回向 Eagle API 发请求时的预检与 CORS 头 |

## 前置

- Node.js（打包 asar 用）
- 管理员权限（写 `C:\Program Files\...`）
- 装好并至少运行过一次 Fluent Reader

## 用法

```powershell
cd local-patch
npm install              # 只装 @electron/asar
.\apply-patch.ps1        # 默认 C:\Program Files\Fluent Reader
.\apply-patch.ps1 -InstallDir "D:\Apps\Fluent Reader"
```

脚本会：

1. 优雅关闭正在运行的 Fluent Reader（先 `WM_CLOSE`，等 10 秒，关不掉才强杀并警告）
2. 读当前 `app.asar`，判断是否已打过补丁
3. **未打过** → 备份成 `app.asar.orig`，在它上面注入
4. **已打过** → 以 `app.asar.orig` 为基底重新注入（幂等，可反复运行）
5. 写回安装目录

## 还原

```powershell
.\restore.ps1
```

## 文件

| 文件 | 作用 |
|---|---|
| `apply-patch.ps1` | 注入器（提权、备份、幂等） |
| `inject.mjs` | asar 读取 / 注入 / 打包，所有路径由命令行参数传入 |
| `restore.ps1` | 用 `app.asar.orig` 还原 |
| `patch/patch-main.js` | 主进程补丁：Referer、Eagle 环回服务 |
| `patch/patch-renderer.js` | 渲染进程补丁：卡片装饰、悬停播放、Eagle 按钮 |
| `patch/patch.css` | 补丁注入的样式 |

## 注意

- 补丁只在**已安装的 asar** 上生效。改了 `src/` 需要先 `npm run build`，再重新注入。
- `app.asar.orig` 是还原的命脉，不要删。
- 如果打完补丁后 Fluent Reader 打不开、也没有任何报错，多半是关闭时被强杀留下了 Chromium 单例锁——重启系统即可恢复。
- 这些文件与 `/src` 的改动互相独立：`src` 决定程序逻辑，`local-patch` 决定网络请求与卡片注入。
