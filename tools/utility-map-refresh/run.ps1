# run.ps1 - monthly refresh of the Winchester utility map (records.winchesterwi.com/utility-map.html)
#
# Runs on the town office PC from Task Scheduler (created by setup.ps1).
# It runs here instead of on GitHub because the FCC broadband map refuses
# requests from GitHub's servers but accepts them from the office connection.
#
# Each run: pulls the repo, rebuilds the map, writes utility_map_last_run.json
# (ok or failed), commits and pushes. A GitHub workflow checks that file on the
# 6th of each month and emails the Clerk if the run failed or didn't happen.
#
# Log files: %LOCALAPPDATA%\WinchesterUtilityMap\logs

$ErrorActionPreference = 'Continue'
$env:GIT_TERMINAL_PROMPT = '0'   # never wait for a password prompt
$env:GCM_INTERACTIVE = 'never'   # never open a sign-in window
$env:PYTHONIOENCODING = 'utf-8'

$Home_ = Join-Path $env:LOCALAPPDATA 'WinchesterUtilityMap'
$Repo  = Join-Path $Home_ 'repo'
$Py    = Join-Path $Home_ 'venv\Scripts\python.exe'
$LogDir = Join-Path $Home_ 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir ("refresh-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd_HHmm'))

function Write-Log([string]$msg) {
    $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $Log -Value $line -Encoding UTF8
}

function Invoke-Logged([string]$Exe, [string[]]$Arguments) {
    Write-Log ("> {0} {1}" -f $Exe, ($Arguments -join ' '))
    $out = & $Exe @Arguments 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
    if ($out) { Add-Content -Path $Log -Value $out -Encoding UTF8 }
    return [pscustomobject]@{ Code = $code; Output = @($out) }
}

# GitHub token saved by setup.ps1 (DPAPI-encrypted, this Windows account only),
# passed to git as an HTTP header through environment variables.
$TokenFile = Join-Path $Home_ 'github-token.dpapi'
$sec = Get-Content -Path $TokenFile | ConvertTo-SecureString
$tok = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
$env:GIT_CONFIG_COUNT = '1'
$env:GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader'
$env:GIT_CONFIG_VALUE_0 = 'AUTHORIZATION: basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('x-access-token:' + $tok))
$tok = $null

Set-Location $Repo
$result = 'ok'
$detail = ''

# 1. Get the latest repo (the records portal sync commits often).
$r = Invoke-Logged 'git' @('pull', '--ff-only', '--quiet')
if ($r.Code -ne 0) {
    $result = 'failed'
    $detail = 'git pull failed: ' + (($r.Output | Select-Object -Last 2) -join ' ')
}

# 2. Rebuild the map.
if ($result -eq 'ok') {
    $r = Invoke-Logged $Py @('utility_map_build.py')
    if ($r.Code -ne 0) {
        $result = 'failed'
        $err = $r.Output | Where-Object { $_ -match 'ERROR' } | Select-Object -Last 1
        if (-not $err) { $err = ($r.Output | Select-Object -Last 1) }
        $detail = "build failed: $err"
    }
}
Write-Log "result: $result $detail"

# 3. Record this run so the GitHub check can see it.
$stamp = [ordered]@{
    ran_at   = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    computer = $env:COMPUTERNAME
    result   = $result
    detail   = $detail
}
$json = ($stamp | ConvertTo-Json) -replace "`r`n", "`n"
[System.IO.File]::WriteAllText((Join-Path $Repo 'utility_map_last_run.json'), $json + "`n", (New-Object System.Text.UTF8Encoding $false))

# 4. Commit and push (retry once after a rebase if the portal sync pushed meanwhile).
Invoke-Logged 'git' @('add', 'utility-map.html', 'electric_psc_cache.json', 'utility_map_last_run.json') | Out-Null
$msg = if ($result -eq 'ok') { 'Refresh utility map data (town office PC)' } else { 'Utility map refresh failed (town office PC)' }
Invoke-Logged 'git' @('commit', '--quiet', '-m', $msg) | Out-Null
$pushed = $false
for ($i = 0; $i -lt 2 -and -not $pushed; $i++) {
    $p = Invoke-Logged 'git' @('push', '--quiet')
    if ($p.Code -eq 0) { $pushed = $true }
    else { Invoke-Logged 'git' @('pull', '--rebase', '--quiet') | Out-Null }
}
Write-Log ("pushed: {0}" -f $pushed)

if ($result -ne 'ok' -or -not $pushed) { exit 1 }
exit 0
