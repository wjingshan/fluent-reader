param(
    [string]$InstallDir = 'C:\Program Files\Fluent Reader'
)

<#
    Fluent Reader 媒体补丁 —— 注入器

    在**当前安装的** app.asar 上重新注入补丁，因此软件升级后重跑一次即可，
    不需要重新生成补丁包，也不怕升级把补丁冲掉。

    用法：
      .\apply-patch.ps1                       # 默认安装到 C:\Program Files\Fluent Reader
      .\apply-patch.ps1 -InstallDir "D:\Apps\Fluent Reader"

    需要：管理员权限（写 Program Files）、Node.js（用于打包 asar）
#>
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
$res = Join-Path $InstallDir 'resources'
$asar = Join-Path $res 'app.asar'
$orig = "$asar.orig"
$unpacked = Join-Path $res 'app.asar.unpacked'
$patchDir = Join-Path $here 'patch'
$injector = Join-Path $here 'inject.mjs'

function Write-Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok($m) { Write-Host "    $m" -ForegroundColor Green }

# ---------------------------------------------------------------- elevation
$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host '需要管理员权限，正在请求提权（请在弹出的 UAC 窗口点"是"）...'
    $proc = Start-Process powershell -Verb RunAs -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"",
        '-InstallDir', "`"$InstallDir`""
    ) -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        Write-Host "补丁未应用（提权进程退出码 $($proc.ExitCode)）。" -ForegroundColor Red
    }
    return
}

# ---------------------------------------------------------------- preflight
if (-not (Test-Path $asar)) {
    throw "找不到 $asar —— 请用 -InstallDir 指定 Fluent Reader 的安装目录。"
}
if (-not (Test-Path $injector)) { throw "找不到 inject.mjs" }
if (-not (Test-Path $patchDir)) { throw "找不到 patch 目录" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw '找不到 node.exe —— 打包 asar 需要 Node.js。请先安装 Node.js 再运行本脚本。'
}
Write-Step "Node.js $((& node --version))"

Write-Step '关闭 Fluent Reader ...'
# Close it politely first: force-killing Electron leaves its Chromium
# single-instance lock behind, and the next launch then exits with code 0 and no
# window until the machine is rebooted.
$running = @(Get-Process 'Fluent Reader' -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) {
    foreach ($proc in $running) {
        if ($proc.MainWindowHandle -ne 0) { $proc.CloseMainWindow() | Out-Null }
    }
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        if (-not (Get-Process 'Fluent Reader' -ErrorAction SilentlyContinue)) { break }
    }
    $left = @(Get-Process 'Fluent Reader' -ErrorAction SilentlyContinue)
    if ($left.Count -gt 0) {
        Write-Host "    还有 $($left.Count) 个实例未响应，强制结束（下次启动若打不开需重启系统）" -ForegroundColor Yellow
        foreach ($proc in $left) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Milliseconds 1500
    } else {
        Write-Ok '已优雅关闭'
    }
} else {
    Write-Ok '没有正在运行的实例'
}

# ------------------------------------------------- pick a pristine base asar
$currentMain = (& node $injector probe $asar $unpacked 2>$null | Select-Object -First 1)
if (-not $currentMain) { throw '无法读取当前 app.asar（probe 失败）。' }
Write-Ok "当前 app.asar 的 main = $currentMain"

$isPatched = ($currentMain -eq './dist/patch-main.js')
if ($isPatched) {
    if (-not (Test-Path $orig)) {
        throw "当前 app.asar 已经打过补丁，但找不到原版备份 $orig，无法安全地重新注入。`n请先运行 restore.ps1 还原，再运行本脚本。"
    }
    $base = $orig
    Write-Ok '当前已打过补丁 —— 以原版备份为基底重新注入（幂等，可反复运行）'
} else {
    $base = $asar
    Copy-Item $asar $orig -Force
    Write-Ok "当前是干净的原版 —— 已刷新原版备份 -> $orig"
}

# ------------------------------------------------------------- inject
Write-Step '注入补丁并重新打包 ...'
$work = Join-Path $env:TEMP ("fr-apply-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $work | Out-Null
try {
    $out = Join-Path $work 'app.patched.asar'
    & node $injector apply $base $unpacked $patchDir $out
    if ($LASTEXITCODE -ne 0) { throw "注入失败（inject.mjs 退出码 $LASTEXITCODE）" }

    # ------------------------------------------------------------ install
    Write-Step '写入安装目录 ...'
    Copy-Item $out $asar -Force
    $newUnpacked = $out -replace '\.asar$', '.asar.unpacked'
    if (Test-Path $newUnpacked) {
        if (Test-Path $unpacked) {
            Copy-Item "$newUnpacked\*" $unpacked -Recurse -Force
        } else {
            Copy-Item $newUnpacked $unpacked -Recurse -Force
        }
        $n = (Get-ChildItem $unpacked -Recurse -File | Measure-Object).Count
        Write-Ok "app.asar.unpacked 已同步（$n 个文件）"
    }
    Write-Ok "app.asar 已替换（$((Get-FileHash $asar -Algorithm SHA256).Hash)）"

    Write-Host ''
    Write-Host '补丁已应用。' -ForegroundColor Green
    Write-Host '启动 Fluent Reader 即可。卡片视图：悬停播放视频版 GIF，右下角按钮可导入 Eagle。'
    Write-Host '还原：运行 restore.ps1'
}
finally {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
