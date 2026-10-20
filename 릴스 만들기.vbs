' Reels Autopilot launcher: opens the app in the browser without a black console window.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
py = here & "\.venv\Scripts\pythonw.exe"
If Not fso.FileExists(py) Then
  MsgBox "Please run the installer first (double-click the install .bat file in this folder).", 48, "Reels Autopilot"
  WScript.Quit 1
End If
sh.Run """" & py & """ -m reels_autopilot ui", 0, False
