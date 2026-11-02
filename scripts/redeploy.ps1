<#
.SYNOPSIS
  Safely bring the production worker up to date with origin/master.

.DESCRIPTION
  Pulls, reinstalls and regenerates ONLY what the incoming commits actually
  require, gates the restart on the test suite, and health-checks the worker
  afterwards.

  The order matters. Tests run BEFORE the restart wherever possible, so a bad
  commit leaves the old worker serving students instead of taking production
  down. The worker is only stopped early when `npm ci` needs it stopped —
  node and esbuild hold file handles that make the install fail with EPERM.

  Never runs any `prisma migrate` command: production migrations are applied by
  Vercel's build, and several of those commands can drop data. Never reads or
  writes .env.

.PARAMETER Force
  Redeploy even when there are no new commits (useful after editing .env).

.PARAMETER SkipTests
  Restart without the test gate. For emergencies only — this is the safety net.

.EXAMPLE
  ssh nudge-pc "powershell -File C:\Users\inyan\nudge\scripts\redeploy.ps1"
#>
[CmdletBinding()]
param(
  [switch]$Force,
  [switch]$SkipTests
)

# 'Continue', not 'Stop': this script drives native tools (npm, npx, git) and
# checks $LASTEXITCODE after each one. Under 'Stop', PowerShell 5.1 turns any
# line a native command writes to stderr into a terminating NativeCommandError —
# vitest printing a harmless Vite warning would abort the whole deploy.
$ErrorActionPreference = 'Continue'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$AppName  = 'nudge-worker'

# Capture a native command's combined output without letting PowerShell wrap
# stderr into error objects. cmd does the redirection, so PS only reads a file.
function Invoke-Capture([string]$CommandLine) {
  $tmp = Join-Path $env:TEMP "nudge-redeploy-$PID-$(Get-Random).log"
  cmd /c "$CommandLine > `"$tmp`" 2>&1"
  $code = $LASTEXITCODE
  $text = if (Test-Path $tmp) { Get-Content $tmp } else { @() }
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  return [pscustomobject]@{ ExitCode = $code; Output = $text }
}

function Say([string]$msg, [string]$kind = 'info') {
  $prefix = switch ($kind) {
    'ok'   { '  [ok]  ' }
    'warn' { ' [warn] ' }
    'fail' { ' [FAIL] ' }
    'step' { '==> ' }
    default { '        ' }
  }
  Write-Host "$prefix$msg"
}

# pm2's jlist embeds the whole Windows environment, which carries both
# 'username' and 'USERNAME'. PowerShell 5.1's ConvertFrom-Json treats keys
# case-insensitively and throws on the duplicate, so node parses it instead.
function Get-Pm2Status([string]$Name) {
  $tmp = Join-Path $env:TEMP "nudge-pm2-$PID-$(Get-Random).json"
  cmd /c "npx --no-install pm2 jlist > `"$tmp`" 2>nul"
  if (-not (Test-Path $tmp)) { return $null }
  $js = $tmp.Replace('\', '/')
  $out = & node -e "try{const l=require('$js');const a=l.find(x=>x.name==='$Name');process.stdout.write(a?[a.pm2_env.status,a.pm2_env.restart_time,a.pid,a.pm2_env.pm_out_log_path,a.pm2_env.pm_err_log_path].join('|'):'')}catch(e){process.stdout.write('')}"
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  if ([string]::IsNullOrWhiteSpace($out)) { return $null }
  $p = "$out".Split('|')
  return [pscustomobject]@{
    Status = $p[0]; Restarts = $p[1]; ProcId = $p[2]
    OutLog = $p[3]; ErrLog = $p[4]
  }
}

# Size of a log right now, used as a read offset after the restart.
function Get-LogLength([string]$Path) {
  if ($Path -and (Test-Path $Path)) { return (Get-Item $Path).Length }
  return 0
}

# Only the bytes a log gained since $Offset. The pm2 error log accumulates for
# months, so scanning the whole thing re-reports failures that were fixed long
# ago — the health check must see only what THIS restart produced.
function Get-Appended([string]$Path, [long]$Offset) {
  if (-not $Path -or -not (Test-Path $Path)) { return '' }
  $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open,
                               [System.IO.FileAccess]::Read,
                               [System.IO.FileShare]::ReadWrite)
  try {
    if ($fs.Length -le $Offset) { return '' }
    [void]$fs.Seek($Offset, [System.IO.SeekOrigin]::Begin)
    $buf = New-Object byte[] ($fs.Length - $Offset)
    [void]$fs.Read($buf, 0, $buf.Length)
    return [System.Text.Encoding]::UTF8.GetString($buf)
  } finally { $fs.Dispose() }
}

function Die([string]$msg) {
  Say $msg 'fail'
  Write-Host ''
  Write-Host 'Worker was left as it was. Nothing further was changed.'
  exit 1
}

Set-Location $RepoRoot
Write-Host ''
Say "redeploy - $RepoRoot" 'step'

# ---------------------------------------------------------------- preflight --
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'master') { Die "on branch '$branch', expected master." }

# Untracked files are fine (personal notes live here); modified TRACKED files
# are not — pulling over them risks losing work or hitting a conflict.
$dirty = git status --porcelain | Where-Object { $_ -notmatch '^\?\?' }
if ($dirty) {
  Say 'uncommitted changes to tracked files:' 'fail'
  $dirty | ForEach-Object { Say "    $_" }
  Die 'commit or stash them first.'
}
Say "on master, no local modifications" 'ok'

# ------------------------------------------------------------------- fetch ---
Say 'checking origin' 'step'
git fetch --quiet origin
if ($LASTEXITCODE -ne 0) { Die 'git fetch failed (network?).' }

$before = (git rev-parse HEAD).Trim()
$remote = (git rev-parse origin/master).Trim()

if ($before -eq $remote -and -not $Force) {
  Say "already up to date at $($before.Substring(0,7))" 'ok'
  Write-Host ''
  Write-Host 'Nothing to do. Use -Force to redeploy anyway.'
  exit 0
}

if ($before -ne $remote) {
  $count = (git rev-list --count "$before..$remote").Trim()
  Say "$count new commit(s):"
  git log --oneline "$before..$remote" | ForEach-Object { Say "    $_" }
}

# -------------------------------------------------------------------- pull ---
Say 'pulling' 'step'
git merge --ff-only origin/master   # ff-only: never invent a merge commit
if ($LASTEXITCODE -ne 0) { Die 'fast-forward failed - local history diverged. Resolve by hand.' }
$after = (git rev-parse HEAD).Trim()
Say "now at $($after.Substring(0,7))" 'ok'

# ------------------------------------------------- what do those commits need --
$changed = if ($before -eq $after) { @() } else { git diff --name-only $before $after }

$needsInstall  = @($changed | Where-Object { $_ -match '^(package\.json|package-lock\.json)$' }).Count -gt 0
$needsGenerate = @($changed | Where-Object { $_ -match '^prisma/schema\.prisma$' }).Count -gt 0
$newMigrations = @($changed | Where-Object { $_ -match '^prisma/migrations/' })

if ($Force -and $before -eq $after) { Say 'forced: restarting on the current commit' }

# A schema change with a stale generated client is the failure that takes the
# worker down with "Unknown argument" on every poll. Always regenerate.
if ($needsInstall)  { Say 'dependencies changed -> npm ci required' }
if ($needsGenerate) { Say 'prisma schema changed -> client regeneration required' }
if ($newMigrations) {
  Say "$($newMigrations.Count) new migration file(s) came down" 'warn'
  Say '  these are applied to production by Vercel, not by this script.'
  Say '  verify with: npx prisma migrate status'
}

# ----------------------------------------------------------------- install ---
if ($needsInstall) {
  Say 'stopping worker (npm ci cannot replace files node/esbuild hold open)' 'step'
  [void](Invoke-Capture "npx --no-install pm2 stop $AppName")
  Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='esbuild.exe'" |
    Where-Object { $_.CommandLine -like "*$($RepoRoot.Replace('\','\\'))*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 3

  Say 'npm ci' 'step'
  npm ci
  if ($LASTEXITCODE -ne 0) {
    Say 'npm ci failed. If this was EPERM, something still holds a file open.' 'fail'
    Die 'retry once; if it persists, reboot rather than fighting it.'
  }
  Say 'dependencies installed' 'ok'
}

# ---------------------------------------------------------------- generate ---
if ($needsGenerate -or $needsInstall) {
  Say 'npx prisma generate' 'step'
  $gen = Invoke-Capture 'npx prisma generate'
  $gen.Output | Where-Object { $_ -match 'Generated|Error' } | ForEach-Object { Say "    $_" }
  if ($gen.ExitCode -ne 0) {
    $gen.Output | Select-Object -Last 10 | ForEach-Object { Say "    $_" }
    Die 'prisma generate failed.'
  }
  Say 'client regenerated' 'ok'
}

# -------------------------------------------------------------------- tests --
# The gate. Runs before the restart so a bad commit leaves the old worker up.
if ($SkipTests) {
  Say 'TEST GATE SKIPPED - restarting unverified code' 'warn'
} else {
  Say 'npm test' 'step'
  $test = Invoke-Capture 'npm test'
  if ($test.ExitCode -ne 0) {
    $test.Output | Select-Object -Last 25 | ForEach-Object { Say "    $_" }
    Say 'tests failed - NOT restarting.' 'fail'
    if ($needsInstall) {
      Die 'worker is DOWN (it was stopped for npm ci). Fix, or rerun with -SkipTests.'
    }
    Die 'the worker is still running the previous commit, so students are unaffected.'
  }
  $summary = ($test.Output | Select-String -Pattern 'Tests\s+\d+\s+passed' | Select-Object -Last 1)
  if ($summary) { Say (($summary.Line -replace '\s+', ' ').Trim()) 'ok' }
  else          { Say 'tests passed' 'ok' }
}

# ----------------------------------------------------------------- restart ---
Say 'restarting worker' 'step'

$known = Get-Pm2Status $AppName

# Mark where both logs end, so the health check reads only what follows.
$outMark = Get-LogLength $known.OutLog
$errMark = Get-LogLength $known.ErrLog

if ($known) {
  $r = Invoke-Capture "npx --no-install pm2 restart $AppName --update-env"
} else {
  $r = Invoke-Capture 'npx --no-install pm2 start ecosystem.config.cjs'
}
if ($r.ExitCode -ne 0) {
  $r.Output | Select-Object -Last 10 | ForEach-Object { Say "    $_" }
  Die 'pm2 failed to start the worker.'
}

# ------------------------------------------------------------ health check ---
Say 'watching startup' 'step'
Start-Sleep -Seconds 12

$fresh = Get-Pm2Status $AppName
$log = (Get-Appended $fresh.OutLog $outMark) + "`n" + (Get-Appended $fresh.ErrLog $errMark)

if ([string]::IsNullOrWhiteSpace($log)) {
  Say 'no output yet - worker may still be starting' 'warn'
} else {
  $log -split "`r?`n" | Where-Object { $_ -match '^\[' } |
    Select-Object -First 10 | ForEach-Object { Say "    $_" }
}

$bad = [regex]::Matches(
  $log,
  '(?im)^.*(Unknown argument|PrismaClientValidationError|expiry error|authentication_error|invalid x-api-key|circuit open).*$'
)
if ($bad.Count -gt 0) {
  $bad | Select-Object -First 5 | ForEach-Object { Say "    $($_.Value.Trim())" 'fail' }
  Die 'worker started but is reporting errors. Check: npx pm2 logs nudge-worker'
}

# ENOTFOUND is reported separately: ioredis often logs one or two while the
# connection is still coming up, and those resolve on their own. Only a
# connection that never settles is worth failing the deploy over.
if ($log -match 'ENOTFOUND') {
  Say 'redis name resolution errors during startup' 'warn'
  Start-Sleep -Seconds 8
  $later = (Get-Appended $fresh.ErrLog $errMark)
  $tail = ($later -split "`r?`n" | Select-Object -Last 6) -join ' '
  if ($tail -match 'ENOTFOUND') { Die 'redis is still unreachable - check the network.' }
  Say 'redis settled - connection recovered' 'ok'
}

$procs = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*src/worker/index.ts*' -or $_.CommandLine -like '*src\worker\index.ts*' })

$status = Get-Pm2Status $AppName
if (-not $status) { Die 'pm2 no longer lists the worker.' }
if ($status.Status -ne 'online') {
  Die "pm2 reports status '$($status.Status)' - the worker is not running."
}

Say "pm2 status: $($status.Status), pid $($status.ProcId), restarts: $($status.Restarts)" 'ok'
Say "worker processes: $($procs.Count)" $(if ($procs.Count -le 2) { 'ok' } else { 'warn' })
if ($procs.Count -gt 2) {
  Say 'more worker processes than expected - duplicate texts are possible.' 'warn'
  Say '  inspect with: npx pm2 list'
}

if ($log -match 'MESSAGING_MODE|to \+1.*:\s') {
  Say 'output looks like console mode - texts may not be reaching anyone.' 'warn'
}

Write-Host ''
Say "deployed $($before.Substring(0,7)) -> $($after.Substring(0,7))" 'ok'
Write-Host ''
exit 0
