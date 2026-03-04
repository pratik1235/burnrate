; =============================================================================
; Burnrate — Inno Setup installer script
; Build the Windows executable first: scripts\build-windows.bat
; Then compile this script with Inno Setup to create the installer.
; =============================================================================

[Setup]
AppName=Burnrate
AppVersion=1.0.0
AppPublisher=Pratik Prakash
AppPublisherURL=https://github.com/pratik1235/burnrate
DefaultDirName={autopf}\Burnrate
DefaultGroupName=Burnrate
OutputDir=dist
OutputBaseFilename=Burnrate-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
WizardStyle=modern

[Files]
Source: "dist\Burnrate\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Burnrate"; Filename: "{app}\Burnrate.exe"
Name: "{autodesktop}\Burnrate"; Filename: "{app}\Burnrate.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Run]
Filename: "{app}\Burnrate.exe"; Description: "Launch Burnrate"; Flags: postinstall nowait skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
