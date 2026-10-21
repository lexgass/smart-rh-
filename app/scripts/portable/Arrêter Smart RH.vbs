' Arrête proprement Smart RH (version portable) : la surveillance arrête le serveur puis s'arrête elle-même.
Option Explicit
Dim fso, sh, logs, pid, i, f

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
logs = fso.GetParentFolderName(WScript.ScriptFullName) & "\donnees\logs"

If Not fso.FileExists(logs & "\surveillance.pid") Then
  MsgBox "Smart RH n'est pas en cours d'exécution.", vbInformation, "Smart RH"
  WScript.Quit 0
End If

' demande d'arrêt propre, notée dans le journal
Set f = fso.CreateTextFile(logs & "\arret.demande", True)
f.Write "arret"
f.Close

For i = 1 To 20
  WScript.Sleep 500
  If Not fso.FileExists(logs & "\surveillance.pid") Then
    MsgBox "Smart RH est arrêté.", vbInformation, "Smart RH"
    WScript.Quit 0
  End If
Next

' la surveillance ne répond pas : arrêt forcé de ce seul processus et de ses enfants
Set f = fso.OpenTextFile(logs & "\surveillance.pid", 1)
pid = Trim(f.ReadAll)
f.Close
If IsNumeric(pid) Then sh.Run "taskkill /PID " & pid & " /T /F", 0, True
On Error Resume Next
fso.DeleteFile logs & "\surveillance.pid"
fso.DeleteFile logs & "\arret.demande"
MsgBox "Smart RH a été arrêté (arrêt forcé).", vbInformation, "Smart RH"
