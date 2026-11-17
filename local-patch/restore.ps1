param(
    [string]$InstallDir = 'C:\Program Files\Fluent Reader'
)

<#
    Fluent Reader 媒体补丁 —— 还原

    把 app.asar 恢复成原版（安装补丁时自动备份的 app.asar.orig）。
    不会删除你的文章、订阅源或设置。
#>
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$res = Join-Path $InstallDir 'resources'
$asar = Join-Path $res 'app.asar'
$orig = "$asar.orig"

$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host '需要管理员权限，正在请求提权（请在弹出的 UAC 窗口点"是"）...'
    Start-Process powershell -Verb RunAs -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"",
        '-InstallDir', "`"$InstallDir`""
    )
    return
}

if (-not (Test-Path $orig)) {
    throw "没有找到原版备份 $orig —— 无法还原。可以重新安装 Fluent Reader（覆盖安装不会丢数据）。"
}

Write-Host '关闭 Fluent Reader ...'
Get-Process 'Fluent Reader' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 900

Copy-Item $orig $asar -Force
Write-Host "已还原原版 app.asar。" -ForegroundColor Green
Write-Host "（原版备份 $orig 保留着，方便你以后再打补丁。）"
