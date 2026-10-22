; MR.K Typeless 설치 프로그램 (Inno Setup 6)
; 만들기: ISCC /DAppVersion=1.1.0 installer.iss  →  build\MRK-Typeless-Setup.exe
; 관리자 권한 없이 내 계정에만 설치합니다 (%LOCALAPPDATA%\Programs\MRK-Typeless).

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6F3B8E2A-4C1D-4E7B-9A55-1D2C3B4A5E6F}
AppName=MR.K Typeless
AppVersion={#AppVersion}
AppVerName=MR.K Typeless {#AppVersion}
AppPublisher=미스터홈즈
AppPublisherURL=https://mrk-typeless.vercel.app/download
AppSupportURL=https://mrk-typeless.vercel.app/download
DefaultDirName={localappdata}\Programs\MRK-Typeless
DefaultGroupName=MR.K Typeless
DisableProgramGroupPage=yes
DisableDirPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
OutputDir=build
OutputBaseFilename=MRK-Typeless-Setup
SetupIconFile=build\icon.ico
UninstallDisplayIcon={app}\MRK-Typeless.exe
UninstallDisplayName=MR.K Typeless
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=force
RestartApplications=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Tasks]
Name: "desktopicon"; Description: "바탕화면에 바로가기 만들기"; GroupDescription: "추가 작업:"
Name: "autostart"; Description: "Windows를 켤 때 자동으로 실행 (권장)"; GroupDescription: "추가 작업:"

[Files]
Source: "dist-dir\MRK-Typeless\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\MR.K Typeless"; Filename: "{app}\MRK-Typeless.exe"
Name: "{autodesktop}\MR.K Typeless"; Filename: "{app}\MRK-Typeless.exe"; Tasks: desktopicon

[Registry]
; 프로그램 설정의 "Windows를 켤 때 자동으로 실행"과 같은 자리입니다.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "MRK-Typeless"; ValueData: """{app}\MRK-Typeless.exe"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\MRK-Typeless.exe"; Description: "MR.K Typeless 바로 실행"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM MRK-Typeless.exe"; Flags: runhidden; RunOnceId: "StopApp"

; 설정·사전·기록(%APPDATA%\MRK-Typeless)은 다시 설치할 때를 위해 지우지 않고 남겨 둡니다.
