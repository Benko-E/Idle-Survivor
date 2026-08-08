' Starts the dev server without a console window in your face, then opens the
' game in your default browser once the server is actually ready.
'
' The server itself sits minimised in the taskbar. Close that window to stop it.
' Launched by the "Idle Survivor (dev)" desktop shortcut.

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

' This script lives in <project>\tools\, so go up two levels to reach the root.
projectDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = projectDir

' Window style 7 = minimised, without stealing focus.
sh.Run "cmd /c npm run dev -- --open", 7, False
