' Smart RH, version portable : double-cliquez sur ce fichier. Aucune fenêtre noire ne s'ouvre.
' Le serveur tourne en arrière-plan sous surveillance (relancé automatiquement s'il s'arrête ou se fige).
' Pour l'arrêter : « Arrêter Smart RH.vbs ». Journaux : dossier donnees\logs.
Option Explicit
Dim fso, sh, env, dossier, nodeExe, app, donnees, logs, port, url, i, code

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dossier = fso.GetParentFolderName(WScript.ScriptFullName)
nodeExe = dossier & "\node\node.exe"
app = dossier & "\app"
donnees = dossier & "\donnees"
logs = donnees & "\logs"
port = "4322"
url = "http://localhost:" & port

If Not fso.FileExists(nodeExe) Then
  MsgBox "Fichier introuvable : node\node.exe" & vbCrLf & "Décompressez tout le dossier avant de lancer Smart RH.", vbCritical, "Smart RH"
  WScript.Quit 1
End If
If Not fso.FolderExists(donnees) Then fso.CreateFolder donnees
If Not fso.FolderExists(logs) Then fso.CreateFolder logs

Set env = sh.Environment("Process")
env("PORT") = port
env("HOST") = "127.0.0.1"
env("SMART_RH_DB") = donnees & "\smart-rh-demo.db"
env("SMART_RH_SAUVEGARDES") = donnees & "\sauvegardes"
env("SMART_RH_LOGS") = logs
sh.CurrentDirectory = app

' déjà lancé : on ouvre simplement le navigateur
If Repond(url & "/connexion") Then
  sh.Run url, 1, False
  WScript.Quit 0
End If

' premier lancement : préparation de la base de démonstration
If Not fso.FileExists(donnees & "\smart-rh-demo.db") Then
  code = sh.Run("cmd /c """"" & nodeExe & """ --no-warnings scripts\preparer-demo.js > """ & logs & "\preparation.log"" 2>&1""", 0, True)
  If code <> 0 Then
    MsgBox "La préparation de la base de démonstration a échoué." & vbCrLf & "Détails : donnees\logs\preparation.log", vbCritical, "Smart RH"
    WScript.Quit 1
  End If
End If

' lancement de la surveillance, invisible
sh.Run """" & nodeExe & """ --no-warnings scripts\surveillance.js demo", 0, False

' attente du démarrage (30 secondes au plus), puis ouverture du navigateur
For i = 1 To 60
  WScript.Sleep 500
  If Repond(url & "/connexion") Then
    sh.Run url, 1, False
    WScript.Quit 0
  End If
Next
MsgBox "Smart RH n'a pas démarré dans les 30 secondes." & vbCrLf & "Consultez le journal : donnees\logs\surveillance-*.log", vbExclamation, "Smart RH"
WScript.Quit 1

' vrai si la page répond avec un statut inférieur à 500 (en VBS, une erreur dans un If exécuterait la branche : on teste à part)
Function Repond(adresse)
  Dim h, s
  Repond = False
  On Error Resume Next
  Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  h.setTimeouts 2000, 2000, 2000, 2000
  h.Open "GET", adresse, False
  h.Send
  If Err.Number <> 0 Then Exit Function
  s = h.Status
  If Err.Number <> 0 Then Exit Function
  On Error GoTo 0
  If s > 0 And s < 500 Then Repond = True
End Function
