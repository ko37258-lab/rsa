<#
  k-shorts.mrkzip.com  -  Cloudflare 터널 점검 / 다시 연결 / PC 켤 때 자동 시작 등록 (Windows)

  사용법: 같은 폴더의 k-shorts-tunnel-start.bat 을 더블클릭
          (또는 이 파일을 우클릭 → "PowerShell에서 실행")

  하는 일
    1) 지금 주소가 열리는지 확인
    2) cloudflared 프로그램 찾기 (없으면 winget 으로 설치, 1년 넘은 버전이면 업데이트)
    3) 터널 설정 찾기 (%USERPROFILE%\.cloudflared\*.yml, 실행 중인 cloudflared 의 토큰)
    4) Windows 서비스 "Cloudflared" 로 등록 → PC 켜면 로그인 전이라도 자동 연결,
       꺼지면 자동 재시작
    5) 주소가 실제로 열리는지 다시 확인하고 결과를 쉽게 표시
#>
param(
    [string]$UserHome = $env:USERPROFILE,
    [string]$Hostname = 'k-shorts.mrkzip.com'
)

$ErrorActionPreference = 'Continue'
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {}

$ServiceName = 'Cloudflared'
$RegKey      = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
$Url         = "https://$Hostname/"
$LogDir      = Join-Path $env:ProgramData 'cloudflared'
$LogFile     = Join-Path $LogDir 'k-shorts-tunnel.log'

# ---------------------------------------------------------------- 출력 도우미
function Say([string]$m, [string]$c = 'Gray') { Write-Host $m -ForegroundColor $c }
function Step([string]$m) { Write-Host ''; Write-Host ">> $m" -ForegroundColor Cyan }
function Ok([string]$m)   { Write-Host "   [완료] $m" -ForegroundColor Green }
function Info([string]$m) { Write-Host "   - $m" -ForegroundColor Gray }
function Warn([string]$m) { Write-Host "   [주의] $m" -ForegroundColor Yellow }
function Bad([string]$m)  { Write-Host "   [실패] $m" -ForegroundColor Red }
function End-Script([int]$code = 0) {
    Write-Host ''
    [void](Read-Host '엔터 키를 누르면 이 창이 닫힙니다')
    exit $code
}

# ---------------------------------------------------------------- 관리자 권한
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Say '관리자 권한이 필요합니다. 곧 뜨는 확인 창에서 [예]를 눌러주세요.' 'Yellow'
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"",
                 '-UserHome', "`"$UserHome`"", '-Hostname', $Hostname)
    try {
        Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList -ErrorAction Stop
    } catch {
        Bad '관리자 권한을 받지 못했습니다. 다시 실행해서 [예]를 눌러주세요.'
        End-Script 1
    }
    exit 0
}

# ---------------------------------------------------------------- 주소 확인
function Test-Site {
    $res = @{ Code = 0; Body = ''; Error = '' }
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20 -Headers @{ 'Cache-Control' = 'no-cache' } -ErrorAction Stop
        $res.Code = [int]$r.StatusCode
    } catch {
        $resp = $_.Exception.Response
        if ($resp) {
            $res.Code = [int]$resp.StatusCode
            if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
                $res.Body = $_.ErrorDetails.Message
            } else {
                try { $sr = New-Object IO.StreamReader($resp.GetResponseStream()); $res.Body = $sr.ReadToEnd(); $sr.Close() } catch {}
            }
        } else {
            $res.Error = $_.Exception.Message
        }
    }
    return $res
}

# 터널이 Cloudflare 에 붙어 있는가 (530 / 1033 이 아니면 붙어 있는 것)
function Test-TunnelUp($r) {
    return ($r.Code -ne 0 -and $r.Code -ne 530 -and ($r.Body -notmatch 'error code:\s*1033'))
}

function Describe-Site($r) {
    if ($r.Code -eq 0) { return "응답 없음 (인터넷 연결 확인 필요: $($r.Error))" }
    if ($r.Code -eq 530 -or $r.Body -match 'error code:\s*1033') { return '열리지 않음 - Cloudflare 1033 (PC의 터널이 연결돼 있지 않음)' }
    if ($r.Code -eq 502 -or $r.Code -eq 504) { return "터널은 연결됐지만 PC 안의 k-shorts 프로그램이 응답하지 않음 (HTTP $($r.Code))" }
    if ($r.Code -eq 404) { return "열리긴 하지만 '페이지 없음(404)'이 나옴 - 터널 설정에 이 주소가 빠졌을 수 있음" }
    if ($r.Code -ge 200 -and $r.Code -lt 500) { return "정상적으로 열림 (HTTP $($r.Code))" }
    return "오류 응답 (HTTP $($r.Code))"
}

# ---------------------------------------------------------------- cloudflared 찾기
function Get-ServiceImagePath {
    if (Test-Path $RegKey) { return (Get-ItemProperty -Path $RegKey -ErrorAction SilentlyContinue).ImagePath }
    return $null
}

function Get-ExeFromImagePath([string]$ip) {
    if (-not $ip) { return $null }
    if ($ip -match '^\s*"([^"]+)"') { return $Matches[1] }
    if ($ip -match '^\s*(.+?\.exe)') { return $Matches[1] }
    return $null
}

function Find-Cloudflared {
    $c = @()
    $c += Get-ExeFromImagePath (Get-ServiceImagePath)
    $cmd = Get-Command cloudflared.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { $c += $cmd.Path }
    $c += @(Get-Process -Name cloudflared -ErrorAction SilentlyContinue | ForEach-Object { $_.Path })
    if (${env:ProgramFiles(x86)}) { $c += Join-Path ${env:ProgramFiles(x86)} 'cloudflared\cloudflared.exe' }
    if ($env:ProgramFiles)        { $c += Join-Path $env:ProgramFiles 'cloudflared\cloudflared.exe' }
    if ($env:LOCALAPPDATA)        { $c += Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\cloudflared.exe' }
    foreach ($sub in @('.cloudflared', '', 'Downloads', 'Desktop')) {
        $d = $UserHome
        if ($sub) { $d = Join-Path $UserHome $sub }
        $c += Join-Path $d 'cloudflared.exe'
        $c += Join-Path $d 'cloudflared-windows-amd64.exe'
    }
    foreach ($p in $c) {
        if ($p -and (Test-Path -LiteralPath $p -PathType Leaf)) { return (Get-Item -LiteralPath $p).FullName }
    }
    return $null
}

function Get-CfVersion([string]$exe) {
    $out = (& $exe --version 2>$null) | Out-String
    if ($out -match '(\d{4})\.(\d{1,2})\.(\d+)') {
        return @{ Text = $Matches[0]; Date = (Get-Date -Year ([int]$Matches[1]) -Month ([int]$Matches[2]) -Day 1) }
    }
    return $null
}

# ---------------------------------------------------------------- 터널 설정 찾기
function Read-TunnelConfig([string]$path) {
    $text = Get-Content -LiteralPath $path -Raw
    $dir  = Split-Path -Parent $path
    $cfg  = @{ Path = $path; Dir = $dir; Tunnel = $null; CredFile = $null; OriginCert = $null; Origin = $null;
               MentionsHost = ($text -match [regex]::Escape($Hostname)) }

    if ($text -match '(?m)^\s*tunnel\s*:\s*["'']?([^"''\s#]+)') { $cfg.Tunnel = $Matches[1] }

    # 자격 증명(JSON) 파일: 서비스는 SYSTEM 계정으로 돌기 때문에 경로를 명시적으로 넘긴다
    if ($text -match '(?m)^\s*credentials-file\s*:\s*(.+?)\s*$') {
        $cf = ($Matches[1] -replace '\s+#.*$', '').Trim().Trim([char[]]@('"', "'"))
        if ($cf.StartsWith('~')) { $cf = Join-Path $UserHome ($cf.Substring(1).TrimStart([char[]]@('/', '\'))) }
        if (Test-Path -LiteralPath $cf) { $cfg.CredFile = (Get-Item -LiteralPath $cf).FullName }
    }
    if (-not $cfg.CredFile -and $cfg.Tunnel) {
        $j = Join-Path $dir "$($cfg.Tunnel).json"
        if (Test-Path -LiteralPath $j) {
            $cfg.CredFile = $j
        } else {
            $jsons = @(Get-ChildItem -LiteralPath $dir -Filter '*.json' -File -ErrorAction SilentlyContinue |
                       Where-Object { $_.BaseName -match '^[0-9a-fA-F-]{36}$' })
            if ($jsons.Count -eq 1) { $cfg.CredFile = $jsons[0].FullName }
        }
    }

    foreach ($pem in @((Join-Path $dir 'cert.pem'), (Join-Path $UserHome '.cloudflared\cert.pem'))) {
        if (Test-Path -LiteralPath $pem) { $cfg.OriginCert = $pem; break }
    }

    # ingress 에서 이 주소가 가리키는 PC 안의 프로그램 주소(service) 찾기
    $lines  = $text -split "\r?\n"
    $hostRx = 'hostname\s*:\s*["'']?' + [regex]::Escape($Hostname) + '["'']?(\s|#|$)'
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match $hostRx) {
            for ($j = $i + 1; $j -lt [Math]::Min($i + 10, $lines.Count); $j++) {
                if ($lines[$j] -match '^\s*-\s') { break }
                if ($lines[$j] -match '^\s*service\s*:\s*["'']?([^"''\s#]+)') { $cfg.Origin = $Matches[1]; break }
            }
            if (-not $cfg.Origin -and $i -gt 0 -and $lines[$i - 1] -match 'service\s*:\s*["'']?([^"''\s#]+)') {
                $cfg.Origin = $Matches[1]
            }
            break
        }
    }
    return $cfg
}

function Find-TunnelConfig {
    $dirs = @(
        (Join-Path $UserHome '.cloudflared'),
        (Join-Path $env:windir 'System32\config\systemprofile\.cloudflared'),
        (Join-Path $UserHome '.cloudflare-warp'),
        (Join-Path $UserHome 'cloudflare-warp')
    )
    $files = @()
    foreach ($d in $dirs) {
        if (Test-Path -LiteralPath $d) {
            $files += @(Get-ChildItem -LiteralPath $d -File -ErrorAction SilentlyContinue |
                        Where-Object { $_.Extension -eq '.yml' -or $_.Extension -eq '.yaml' })
        }
    }
    $withTunnel = @($files | Where-Object { (Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue) -match '(?m)^\s*tunnel\s*:' })
    $hit = $withTunnel | Where-Object { (Get-Content -LiteralPath $_.FullName -Raw) -match [regex]::Escape($Hostname) } | Select-Object -First 1
    if (-not $hit) { $hit = $withTunnel | Where-Object { $_.Name -eq 'config.yml' } | Select-Object -First 1 }
    if (-not $hit) { $hit = $withTunnel | Select-Object -First 1 }
    if ($hit) { return (Read-TunnelConfig $hit.FullName) }
    return $null
}

function Find-RunningToken {
    $tok = $null
    foreach ($p in @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue)) {
        if ($p.CommandLine -and $p.CommandLine -match '--token[=\s]+["'']?(eyJ[A-Za-z0-9+/=_\-\.]{20,})') { $tok = $Matches[1] }
    }
    return $tok
}

function Read-TunnelToken {
    Write-Host ''
    Say '   Cloudflare 터널 "토큰"이 필요합니다. (1분이면 됩니다)' 'Yellow'
    Say '    1) 브라우저에서 https://one.dash.cloudflare.com 접속 후 로그인'
    Say '    2) Networks(네트워크) > Tunnels(터널) 에서 k-shorts 주소를 연결한 터널 클릭'
    Say '    3) Configure(구성) > Windows 선택 > "cloudflared.exe service install eyJ..." 명령을 통째로 복사'
    Say '    4) 아래에 붙여넣고 엔터  (그냥 엔터 = 건너뛰기)'
    $in = Read-Host '   붙여넣기'
    if ($in -match '(eyJ[A-Za-z0-9+/=_\-\.]{20,})') { return $Matches[1] }
    if ($in) { Warn '토큰 형식(eyJ... 로 시작)이 아니어서 건너뜁니다.' }
    return $null
}

# ---------------------------------------------------------------- 서비스(자동 시작)
function New-ConfigImagePath([string]$exe, $cfg) {
    $p = @("`"$exe`"", 'tunnel', '--config', "`"$($cfg.Path)`"")
    if ($cfg.OriginCert) { $p += @('--origincert', "`"$($cfg.OriginCert)`"") }
    $p += @('--logfile', "`"$LogFile`"", 'run')
    if ($cfg.CredFile) { $p += @('--credentials-file', "`"$($cfg.CredFile)`"") }
    if ($cfg.Tunnel)   { $p += $cfg.Tunnel }
    return ($p -join ' ')
}

function New-TokenImagePath([string]$exe, [string]$token) {
    return "`"$exe`" tunnel --logfile `"$LogFile`" run --token $token"
}

function Set-ServiceImagePath([string]$imagePath) {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $svc) {
        New-Service -Name $ServiceName -BinaryPathName $imagePath -DisplayName 'Cloudflared agent' `
                    -Description "Cloudflare Tunnel - $Hostname" -StartupType Automatic -ErrorAction Stop | Out-Null
    } else {
        if ($svc.Status -ne 'Stopped') {
            Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
            try { $svc.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(20)) } catch {}
        }
        Set-ItemProperty -Path $RegKey -Name ImagePath -Value $imagePath -ErrorAction Stop
    }
}

function Set-AutoStart {
    Set-Service -Name $ServiceName -StartupType Automatic -ErrorAction SilentlyContinue
    # 터널이 죽으면 5초 / 15초 / 60초 뒤 자동으로 다시 켜기
    & sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/15000/restart/60000 | Out-Null
    & sc.exe failureflag $ServiceName 1 | Out-Null
}

function Restart-Tunnel {
    try {
        $svc = Get-Service -Name $ServiceName -ErrorAction Stop
        if ($svc.Status -ne 'Stopped') {
            Stop-Service -Name $ServiceName -Force -ErrorAction Stop
            $svc.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(20))
        }
        Start-Service -Name $ServiceName -ErrorAction Stop
        Ok '터널 서비스를 켰습니다.'
        return $true
    } catch {
        Bad "터널 서비스를 켜지 못했습니다: $($_.Exception.Message)"
        return $false
    }
}

function Get-LogSize {
    if (Test-Path -LiteralPath $LogFile) { return (Get-Item -LiteralPath $LogFile).Length }
    return 0
}

function Get-NewLog([long]$offset) {
    if (-not (Test-Path -LiteralPath $LogFile)) { return '' }
    try {
        $fs = [IO.File]::Open($LogFile, 'Open', 'Read', 'ReadWrite')
        try {
            if ($offset -gt $fs.Length) { $offset = 0 }
            [void]$fs.Seek($offset, 'Begin')
            $sr = New-Object IO.StreamReader($fs)
            return $sr.ReadToEnd()
        } finally { $fs.Close() }
    } catch { return '' }
}

function Show-LogTail([long]$offset) {
    $t = Get-NewLog $offset
    if (-not $t) { return }
    $lines = @($t -split "\r?\n" | Where-Object { $_ -match 'ERR|error|fail' } | Select-Object -Last 6)
    if ($lines.Count -gt 0) {
        Info '터널 기록 중 오류 부분:'
        foreach ($l in $lines) {
            if ($l.Length -gt 220) { $l = $l.Substring(0, 220) + '...' }
            Write-Host "     $l" -ForegroundColor DarkGray
        }
    }
}

# 주소가 열리고, (기록 파일을 쓰는 경우) 서비스가 실제로 Cloudflare 에 붙었는지까지 확인
function Wait-Tunnel([int]$seconds, [long]$logOffset, [bool]$useLog) {
    $deadline = (Get-Date).AddSeconds($seconds)
    $r = $null; $svcOk = $true
    Write-Host '   연결 확인 중' -NoNewline
    do {
        Start-Sleep -Seconds 5
        Write-Host '.' -NoNewline
        $r = Test-Site
        $svcOk = $true
        if ($useLog) { $svcOk = ((Get-NewLog $logOffset) -match 'Registered tunnel connection') }
        if ((Test-TunnelUp $r) -and $svcOk) { break }
    } while ((Get-Date) -lt $deadline)
    Write-Host ''
    return @{ Site = $r; ServiceOk = $svcOk }
}

function Test-Origin([string]$origin) {
    if (-not $origin -or $origin -notmatch '^(https?|tcp)://') { return $null }
    try { $u = [Uri]$origin } catch { return $null }
    $client = New-Object Net.Sockets.TcpClient
    try {
        $ok = $client.ConnectAsync($u.Host, $u.Port).Wait(3000)
        return ($ok -and $client.Connected)
    } catch { return $false } finally { $client.Close() }
}

function Show-Summary($site, $cfg) {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    $wmi = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'" -ErrorAction SilentlyContinue
    $up  = Test-TunnelUp $site

    Write-Host ''
    Write-Host '==================== 결과 ====================' -ForegroundColor Cyan
    Write-Host "  주소              : $Url"
    if ($up -and $site.Code -eq 404) {
        Write-Host "  접속              : $(Describe-Site $site)" -ForegroundColor Yellow
    } elseif ($up -and $site.Code -ne 502 -and $site.Code -ne 504) {
        Write-Host "  접속              : 정상 - 열립니다 (HTTP $($site.Code))" -ForegroundColor Green
    } elseif ($up) {
        Write-Host "  접속              : 터널은 연결됨 / k-shorts 프로그램이 응답 안 함 (HTTP $($site.Code))" -ForegroundColor Yellow
    } else {
        Write-Host "  접속              : 아직 안 열림 - $(Describe-Site $site)" -ForegroundColor Red
    }
    $st = '없음'
    if ($svc) { if ($svc.Status -eq 'Running') { $st = '켜져 있음' } else { $st = "꺼져 있음 ($($svc.Status))" } }
    Write-Host "  터널 서비스        : $st"
    $auto = '꺼짐'
    if ($wmi -and $wmi.StartMode -eq 'Auto') { $auto = '켜짐 (PC를 켜면 터널이 자동으로 연결됩니다)' }
    Write-Host "  PC 켤 때 자동 시작 : $auto"
    Write-Host '==============================================' -ForegroundColor Cyan

    if ($up -and ($site.Code -eq 502 -or $site.Code -eq 504)) {
        Write-Host ''
        if ($cfg -and $cfg.Origin) {
            $o = Test-Origin $cfg.Origin
            if ($o -eq $false) { Warn "PC 안의 k-shorts 프로그램($($cfg.Origin))이 꺼져 있는 것 같습니다. 그 프로그램을 먼저 켜주세요." }
            else { Warn "k-shorts 프로그램($($cfg.Origin))이 응답하지 않습니다. 프로그램을 다시 켜보세요." }
        } else {
            Warn 'PC 안의 k-shorts 프로그램(웹 서버)이 꺼져 있습니다. 그 프로그램을 먼저 켜주세요.'
        }
    } elseif ($up) {
        Write-Host ''
        Info '참고: k-shorts 프로그램 자체도 PC를 켤 때 함께 켜져 있어야 주소가 열립니다.'
    } else {
        Write-Host ''
        Warn "Cloudflare 대시보드에서 $Hostname 이 연결된 터널과 이 PC에 등록한 터널이 같은지 확인이 필요합니다."
        Warn '이 창을 캡처해서 Claude에게 보내주시면 이어서 봐드립니다.'
    }
    return ($up -and $site.Code -ne 502 -and $site.Code -ne 504)
}

# ================================================================ 실행
function Main {
    Write-Host '==============================================' -ForegroundColor Cyan
    Write-Host '  k-shorts 터널 점검 / 다시 연결 / 자동 시작 등록' -ForegroundColor Cyan
    Write-Host "  주소: $Url" -ForegroundColor Cyan
    Write-Host '==============================================' -ForegroundColor Cyan
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

    # 1 ---------------------------------------------------------------
    Step '1/5 지금 주소가 열리는지 확인'
    $before = Test-Site
    Info (Describe-Site $before)
    $alreadyUp = Test-TunnelUp $before

    # 2 ---------------------------------------------------------------
    Step '2/5 cloudflared(터널 프로그램) 찾기'
    $hasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)
    $exe = Find-Cloudflared
    if (-not $exe) {
        Warn '설치돼 있지 않습니다. 자동 설치를 시도합니다 (winget).'
        if ($hasWinget) {
            & winget install --id Cloudflare.cloudflared -e --silent --accept-source-agreements --accept-package-agreements | Out-Host
            $exe = Find-Cloudflared
        }
    }
    if (-not $exe) {
        Bad 'cloudflared 를 찾지도, 설치하지도 못했습니다.'
        Info 'https://github.com/cloudflare/cloudflared/releases 에서 cloudflared-windows-amd64.msi 를 설치한 뒤 다시 실행해주세요.'
        End-Script 1
    }
    Ok "찾음: $exe"
    $ver = Get-CfVersion $exe
    if ($ver) {
        Info "버전: $($ver.Text)"
        if (-not $alreadyUp -and $hasWinget -and $ver.Date -lt (Get-Date).AddMonths(-12)) {
            Warn '1년 넘은 버전이라 최신으로 업데이트합니다.'
            Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
            & winget upgrade --id Cloudflare.cloudflared -e --silent --accept-source-agreements --accept-package-agreements | Out-Host
            $v2 = Get-CfVersion $exe
            if ($v2) { Info "현재 버전: $($v2.Text)" }
        }
    }

    # 3 ---------------------------------------------------------------
    Step '3/5 터널 설정 찾기'
    $cfg = Find-TunnelConfig
    if ($cfg) {
        Ok "설정 파일: $($cfg.Path)"
        Info "터널: $($cfg.Tunnel)"
        if ($cfg.Origin) { Info "k-shorts 프로그램 주소(PC 안): $($cfg.Origin)" }
        if (-not $cfg.MentionsHost) { Warn "이 설정 파일에는 $Hostname 이 적혀 있지 않습니다 (대시보드에서 관리하는 터널일 수 있음)." }
    } else {
        Info '설정 파일 없음 (Cloudflare 대시보드에서 만든 "토큰 방식" 터널일 가능성이 큽니다)'
    }
    $procToken = Find-RunningToken
    if ($procToken) { Info '지금 실행 중인 cloudflared 에서 터널 토큰을 찾았습니다.' }

    # 4 ---------------------------------------------------------------
    Step '4/5 터널 켜기 + PC 켤 때 자동 시작 등록'
    $curIP  = Get-ServiceImagePath
    $curExe = Get-ExeFromImagePath $curIP
    $curOk  = [bool]($curIP -and ($curIP -match '\brun\b') -and $curExe -and (Test-Path -LiteralPath $curExe))
    if ($curIP) {
        Info "기존 자동 시작 서비스: 있음 (상태: $((Get-Service -Name $ServiceName -ErrorAction SilentlyContinue).Status))"
        if (-not $curOk) { Warn '기존 서비스의 실행 명령이 비어 있거나 잘못돼 있어 고칩니다.' }
    } else {
        Info '기존 자동 시작 서비스: 없음 → 새로 등록합니다.'
    }

    $finalSite = $before

    if ($alreadyUp -and $curOk) {
        # 이미 열리는 중이면 끊지 않고 자동 시작 설정만 확실히 해 둔다
        Set-AutoStart
        $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -ne 'Running') { [void](Restart-Tunnel) }
        Ok '이미 연결돼 있어서 끊지 않고 자동 시작 설정만 확인했습니다.'
    } else {
        $plans = New-Object System.Collections.ArrayList
        if ($curOk) { [void]$plans.Add(@{ Name = '기존 서비스 설정 그대로 다시 켜기'; ImagePath = $null }) }
        if ($procToken -and -not ($curIP -and $curIP.Contains($procToken))) {
            [void]$plans.Add(@{ Name = '실행 중이던 터널 토큰으로 서비스 등록'; ImagePath = (New-TokenImagePath $exe $procToken) })
        }
        if ($cfg -and $cfg.Tunnel) {
            $cfgIP = New-ConfigImagePath $exe $cfg
            if ($cfgIP -ne $curIP) { [void]$plans.Add(@{ Name = '설정 파일로 서비스 등록'; ImagePath = $cfgIP }) }
        }
        [void]$plans.Add(@{ Name = 'Cloudflare 대시보드 토큰으로 서비스 등록'; ImagePath = 'ASK' })

        foreach ($plan in $plans) {
            $ip = $plan.ImagePath
            if ($ip -eq 'ASK') {
                $tok = Read-TunnelToken
                if (-not $tok) { break }
                $ip = New-TokenImagePath $exe $tok
            }
            Write-Host ''
            Info "시도: $($plan.Name)"
            if ($ip) {
                try { Set-ServiceImagePath $ip; Ok '서비스 등록 완료' }
                catch { Bad "서비스 등록 실패: $($_.Exception.Message)"; continue }
            }
            Set-AutoStart
            $offset = Get-LogSize
            $nowIP  = Get-ServiceImagePath
            $useLog = [bool]($nowIP -and $nowIP.IndexOf($LogFile, [StringComparison]::OrdinalIgnoreCase) -ge 0)
            if (-not (Restart-Tunnel)) { Show-LogTail $offset; continue }
            $w = Wait-Tunnel 90 $offset $useLog
            $finalSite = $w.Site
            Info (Describe-Site $finalSite)
            if ((Test-TunnelUp $finalSite) -and $w.ServiceOk) { Ok '터널이 Cloudflare에 연결됐습니다.'; break }
            Warn '이 방법으로는 연결되지 않았습니다.'
            Show-LogTail $offset
        }
    }

    # 5 ---------------------------------------------------------------
    Step '5/5 결과'
    Start-Sleep -Seconds 2
    $finalSite = Test-Site
    $good = Show-Summary $finalSite $cfg
    if ($good) { End-Script 0 } else { End-Script 1 }
}

try { Main } catch { Bad "예상하지 못한 오류: $($_.Exception.Message)"; End-Script 1 }
