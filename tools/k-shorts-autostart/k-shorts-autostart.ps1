<#
  K-쇼츠컷 자동 실행 설정 (Windows)
  - PC를 켜고 로그인하면 「K-쇼츠컷 실행.cmd」가 저절로 실행되게, 시작프로그램 폴더에 바로가기를 만든다(창은 최소화).
  - 전원에 꽂혀 있을 때 절전·최대 절전을 '안 함'으로 바꾼다.
  관리자 권한이 필요 없다. 이미 등록돼 있으면 다시 만들지 않는다.
#>
$ErrorActionPreference = 'Continue'
function Say([string]$m, [string]$c = 'Gray') { Write-Host $m -ForegroundColor $c }
function Done([int]$code) { Write-Host ''; [void](Read-Host '엔터 키를 누르면 이 창이 닫힙니다'); exit $code }

Say '=============================================' Cyan
Say '  K-쇼츠컷 자동 실행 설정' Cyan
Say '=============================================' Cyan

# 1) 「K-쇼츠컷 실행」 파일 찾기 ------------------------------------------
Say ''
Say '>> 1/3 「K-쇼츠컷 실행」 파일 찾기' Cyan
$roots = @('C:\CLAUDE\k-shortscut', 'C:\CLAUDE',
           [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('MyDocuments'), $env:USERPROFILE) |
         Where-Object { $_ -and (Test-Path -LiteralPath $_) }
$found = $null
foreach ($r in $roots) {
    $c = @(Get-ChildItem -LiteralPath $r -Filter '*.cmd' -Recurse -Depth 3 -File -ErrorAction SilentlyContinue |
           Where-Object { $_.Name -like '*쇼츠*' -and $_.Name -like '*실행*' })
    if ($c.Count -gt 0) {
        $found = $c | Sort-Object { $_.Name -ne 'K-쇼츠컷 실행.cmd' }, { $_.FullName.Length } | Select-Object -First 1
        break
    }
}
if (-not $found) {
    Say '   [실패] 「K-쇼츠컷 실행」 파일을 찾지 못했습니다.' Red
    if (Test-Path -LiteralPath 'C:\CLAUDE\k-shortscut') {
        Say '   C:\CLAUDE\k-shortscut 안의 실행 파일:'
        Get-ChildItem -LiteralPath 'C:\CLAUDE\k-shortscut' -Filter '*.cmd' -File -ErrorAction SilentlyContinue | ForEach-Object { Say "     $($_.Name)" }
    }
    Say '   이 창을 사진 찍어 Claude에게 보내 주세요.' Yellow
    Done 1
}
Say "   [완료] 찾음: $($found.FullName)" Green

# 2) 시작프로그램 등록 ----------------------------------------------------
Say ''
Say '>> 2/3 PC를 켜면 저절로 실행되게 등록' Cyan
$startup = [Environment]::GetFolderPath('Startup')
$ws = New-Object -ComObject WScript.Shell
$dup = @(Get-ChildItem -LiteralPath $startup -File -ErrorAction SilentlyContinue | Where-Object {
           ($_.Name -eq $found.Name) -or
           ($_.Extension -eq '.lnk' -and $ws.CreateShortcut($_.FullName).TargetPath -eq $found.FullName) })
$registered = $false
if ($dup.Count -gt 0) {
    Say "   [완료] 이미 등록돼 있습니다: $($dup[0].Name)" Green
    $registered = $true
} else {
    $lnk = Join-Path $startup 'K-쇼츠컷 자동 실행.lnk'
    try {
        $s = $ws.CreateShortcut($lnk)
        $s.TargetPath = $found.FullName
        $s.WorkingDirectory = $found.DirectoryName
        $s.WindowStyle = 7
        $s.Description = 'K-쇼츠컷: 로그인하면 자동 실행'
        $s.Save()
    } catch {}
    if (Test-Path -LiteralPath $lnk) { Say '   [완료] 등록했습니다. (창은 작게 내려간 채로 열립니다)' Green; $registered = $true }
    else { Say '   [실패] 등록하지 못했습니다.' Red }
}

# 3) 절전 끄기 ------------------------------------------------------------
Say ''
Say '>> 3/3 절전 모드 끄기 (전원에 꽂혀 있을 때)' Cyan
& powercfg.exe /change standby-timeout-ac 0 | Out-Null; $a = $LASTEXITCODE
& powercfg.exe /change hibernate-timeout-ac 0 | Out-Null; $b = $LASTEXITCODE
$power = ($a -eq 0 -and $b -eq 0)
if ($power) { Say "   [완료] 절전·최대 절전을 '안 함'으로 바꿨습니다." Green }
else { Say "   [주의] 절전 설정을 바꾸지 못했습니다. 설정 > 시스템 > 전원에서 '안 함'으로 바꿔 주세요." Yellow }

# 결과 --------------------------------------------------------------------
Say ''
Say '==================== 결과 ====================' Cyan
if ($registered) { Say '  자동 실행 : 켜짐 - PC를 켜고 로그인하면 K-쇼츠컷이 저절로 켜집니다.' Green }
else             { Say '  자동 실행 : 실패 - 이 창을 사진 찍어 Claude에게 보내 주세요.' Red }
if ($power)      { Say '  절전 모드 : 꺼짐 - 켜 두는 동안 PC가 잠들지 않습니다.' Green }
else             { Say '  절전 모드 : 그대로 - 직접 바꿔 주세요.' Yellow }
Say '  참고      : 작게 내려간 까만 K-쇼츠컷 창은 닫지 마세요.'
Say '==============================================' Cyan
if ($registered) { Done 0 } else { Done 1 }
