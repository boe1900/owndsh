<#
 * [INPUT]: 依赖 upstream/deepseek-harness.lock.json、Git CLI 与可访问的官方 GitHub 仓库
 * [OUTPUT]: 在产品仓库同级目录准备干净且检出锁定 commit 的 DeepSeek Harness checkout
 * [POS]: scripts 的 Windows 开发环境入口，与 bootstrap-harness.sh 保持行为一致
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
#>

[CmdletBinding()]
param(
    [string]$Destination,
    [switch]$CheckOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-CheckedGit {
    param([Parameter(Mandatory)][string[]]$Arguments)

    & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git command failed: git $($Arguments -join ' ')"
    }
}

function Normalize-RepositoryUrl {
    param([Parameter(Mandatory)][string]$Url)

    return $Url.Trim().TrimEnd('/') -replace '\.git$', ''
}

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$lockPath = Join-Path $projectRoot 'upstream/deepseek-harness.lock.json'
$lock = Get-Content -Raw -LiteralPath $lockPath | ConvertFrom-Json

if ($lock.commit -notmatch '^[0-9a-f]{40}$') {
    throw "Invalid Harness commit in $lockPath"
}

if ([string]::IsNullOrWhiteSpace($Destination)) {
    $workspaceRoot = Split-Path -Parent $projectRoot
    $Destination = Join-Path $workspaceRoot 'deepseek-harness'
}
$checkout = [System.IO.Path]::GetFullPath($Destination)

if (-not (Test-Path -LiteralPath $checkout)) {
    if ($CheckOnly) {
        throw "Harness checkout does not exist: $checkout"
    }
    Invoke-CheckedGit @('clone', $lock.repository, $checkout)
}

if (-not (Test-Path -LiteralPath (Join-Path $checkout '.git'))) {
    throw "Destination is not a Git checkout: $checkout"
}

$origin = & git -C $checkout remote get-url origin
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($origin)) {
    throw "Cannot read Harness origin: $checkout"
}
$origin = $origin.Trim()
if ((Normalize-RepositoryUrl $origin) -ne (Normalize-RepositoryUrl $lock.repository)) {
    throw "Harness origin mismatch: expected $($lock.repository), got $origin"
}

$dirty = & git -C $checkout status --porcelain
if ($LASTEXITCODE -ne 0) {
    throw "Cannot inspect Harness checkout: $checkout"
}
if ($dirty) {
    throw "Harness checkout has local changes; refusing to change revisions: $checkout"
}

if (-not $CheckOnly) {
    Invoke-CheckedGit @('-C', $checkout, 'fetch', 'origin', '--tags', '--prune')
    Invoke-CheckedGit @('-C', $checkout, 'cat-file', '-e', "$($lock.commit)^{commit}")
    Invoke-CheckedGit @('-C', $checkout, 'switch', '--detach', $lock.commit)
}

$head = & git -C $checkout rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($head)) {
    throw "Cannot read Harness HEAD: $checkout"
}
$head = $head.Trim()
if ($head -ne $lock.commit) {
    throw "Harness checkout is not at the locked commit $($lock.commit): $checkout"
}

[PSCustomObject]@{
    Repository = $lock.repository
    Version = $lock.version
    Commit = $head
    Checkout = $checkout
    Mode = if ($CheckOnly) { 'check' } else { 'prepare' }
}
