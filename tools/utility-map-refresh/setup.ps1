# setup.ps1 - one-time setup of the monthly utility map refresh on the town office PC
#
# Right-click this file > "Run with PowerShell". It will:
#   1. Install Python 3.12 and Git with winget, if they aren't installed yet
#      (Windows may ask you to approve the installs).
#   2. Ask for the GitHub token and save it in Windows Credential Manager
#      (the token is never written to a file).
#   3. Copy the records portal repo to %LOCALAPPDATA%\WinchesterUtilityMap\repo
#      and install the map builder's Python packages there.
#   4. Test that it can reach the FCC and push to GitHub.
#   5. Create the scheduled task "Winchester Utility Map Refresh":
#      3rd of each month at 8:13 AM; if the PC is off then, it runs the next
#      time the PC is on. Runs only while you're signed in.
#
# Safe to run again; it skips what's already done.

# 'Continue' so git/pip messages on stderr don't abort Windows PowerShell 5.1;
# every step checks its own result instead.
$ErrorActionPreference = 'Continue'
$RepoUrl  = 'https://x-access-token@github.com/winclerk/winclerk.github.io.git'
$TaskName = 'Winchester Utility Map Refresh'
$Home_    = Join-Path $env:LOCALAPPDATA 'WinchesterUtilityMap'
$Repo     = Join-Path $Home_ 'repo'
$Venv     = Join-Path $Home_ 'venv'
$VenvPy   = Join-Path $Venv 'Scripts\python.exe'

function Step([string]$msg) { Write-Host ''; Write-Host "== $msg" -ForegroundColor Cyan }
function Done([string]$msg) { Write-Host "   $msg" -ForegroundColor Green }
function Stop-Setup([string]$msg) {
    Write-Host ''; Write-Host "SETUP STOPPED: $msg" -ForegroundColor Red
    Read-Host 'Press Enter to close'; exit 1
}
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Find-Python {
    $c = Get-Command python -ErrorAction SilentlyContinue | Where-Object { $_.Source -notmatch 'WindowsApps' } | Select-Object -First 1
    if ($c) { return $c.Source }
    $p = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python3*\python.exe') -ErrorAction SilentlyContinue |
         Sort-Object FullName -Descending | Select-Object -First 1
    if ($p) { return $p.FullName }
    return $null
}

New-Item -ItemType Directory -Force -Path $Home_ | Out-Null

# ---- 1. Python and Git ----
Step 'Checking for Python and Git'
Refresh-Path
$py = Find-Python
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $py -or -not $git) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Stop-Setup 'winget (App Installer) is not available on this PC. Install Python 3.12 from python.org and Git from git-scm.com, then run this setup again.'
    }
}
if (-not $py) {
    Write-Host '   Installing Python 3.12...'
    winget install --exact --id Python.Python.3.12 --scope user --source winget
    Refresh-Path; $py = Find-Python
    if (-not $py) { Stop-Setup 'Python did not install. Install Python 3.12 from python.org, then run this setup again.' }
}
Done "Python: $py"
if (-not $git) {
    Write-Host '   Installing Git...'
    winget install --exact --id Git.Git --source winget
    Refresh-Path; $git = (Get-Command git -ErrorAction SilentlyContinue).Source
    if (-not $git) { Stop-Setup 'Git did not install. Install Git from git-scm.com, then run this setup again.' }
}
Done "Git: $git"

# ---- 2. GitHub token ----
Step 'Saving the GitHub token'
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'
$have = "protocol=https`nhost=github.com`nusername=x-access-token`n`n" | git -c credential.helper=manager credential fill 2>$null
if ($LASTEXITCODE -eq 0 -and ($have -match 'password=')) {
    $ans = Read-Host '   A token is already saved. Replace it? (y/N)'
    $replace = $ans -match '^[yY]'
} else { $replace = $true }
if ($replace) {
    $sec = Read-Host '   Paste the GitHub token, then press Enter (it will not show)' -AsSecureString
    $tok = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    if (-not $tok) { Stop-Setup 'No token entered.' }
    "protocol=https`nhost=github.com`nusername=x-access-token`npassword=$tok`n`n" | git -c credential.helper=manager credential approve
    $tok = $null
    Done 'Token saved in Windows Credential Manager.'
} else { Done 'Keeping the saved token.' }

# ---- 3. Repo and Python packages ----
Step 'Getting the records portal repo'
if (Test-Path (Join-Path $Repo '.git')) {
    git -C $Repo pull --ff-only --quiet
    Done 'Repo updated.'
} else {
    git -c credential.helper=manager clone --quiet $RepoUrl $Repo
    if ($LASTEXITCODE -ne 0) { Stop-Setup 'Could not copy the repo from GitHub. Check that the token has access to winclerk/winclerk.github.io.' }
    Done "Repo copied to $Repo"
}
git -C $Repo config core.autocrlf false
git -C $Repo config credential.helper manager
git -C $Repo config user.name 'Winchester utility map (town office PC)'
git -C $Repo config user.email 'luke@winchester.wi.gov'

Step 'Installing the map builder packages'
if (-not (Test-Path $VenvPy)) { & $py -m venv $Venv }
& $VenvPy -m pip install --quiet --upgrade pip
& $VenvPy -m pip install --quiet requests h3 shapely pyshp
if ($LASTEXITCODE -ne 0) { Stop-Setup 'Python packages did not install.' }
Done 'Packages installed.'

# ---- 4. Tests ----
Step 'Testing the FCC connection from Python'
& $VenvPy -c "import requests,sys; r=requests.get('https://broadbandmap.fcc.gov/nbm/map/api/published/filing', headers={'User-Agent':'WinchesterUtilityMap/1.0'}, timeout=60); print('   FCC answered', r.status_code); sys.exit(0 if r.ok else 1)"
if ($LASTEXITCODE -ne 0) { Write-Host '   The FCC refused the request from Python. The scheduled task will still be created; tell Claude this result.' -ForegroundColor Yellow }
else { Done 'FCC reachable.' }

Step 'Testing GitHub push access'
git -C $Repo push --dry-run --quiet
if ($LASTEXITCODE -ne 0) { Stop-Setup 'GitHub refused the push test. Check that the token has "Contents: Read and write" on winclerk/winclerk.github.io.' }
Done 'Push access works.'

# ---- 5. Scheduled task ----
Step "Creating the scheduled task '$TaskName'"
$RunPs1 = Join-Path $Repo 'tools\utility-map-refresh\run.ps1'
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$esc = { param($s) [System.Security.SecurityElement]::Escape($s) }
$months = (@('January','February','March','April','May','June','July','August','September','October','November','December') | ForEach-Object { "<$_ />" }) -join ''
$first = (Get-Date -Day 1 -Hour 8 -Minute 13 -Second 0).AddMonths(1)   # starts next month, so nothing counts as missed
$start = $first.AddDays(2).ToString('yyyy-MM-ddTHH:mm:ss')
$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Rebuilds the Winchester utility map from FCC and PSC data and publishes it to records.winchesterwi.com. Set up by tools/utility-map-refresh/setup.ps1.</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>$start</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByMonth><DaysOfMonth><Day>3</Day></DaysOfMonth><Months>$months</Months></ScheduleByMonth>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$(& $esc $user)</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
    <ExecutionTimeLimit>PT2H</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$(& $esc $RunPs1)"</Arguments>
    </Exec>
  </Actions>
</Task>
"@
try { Register-ScheduledTask -TaskName $TaskName -Xml $xml -Force -ErrorAction Stop | Out-Null }
catch { Stop-Setup "Windows would not create the scheduled task: $($_.Exception.Message)" }
Done 'Scheduled task created: 3rd of each month, 8:13 AM.'

Write-Host ''
Write-Host 'Setup finished.' -ForegroundColor Green
Write-Host "To run a refresh now: open Task Scheduler, right-click '$TaskName', choose Run."
Write-Host "Logs: $(Join-Path $Home_ 'logs')"
Read-Host 'Press Enter to close'
