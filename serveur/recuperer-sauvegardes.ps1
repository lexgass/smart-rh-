# Rapatrie sur ce PC les sauvegardes chiffrées du serveur Smart RH (une fois par semaine au moins).
# Usage dans PowerShell :  .\recuperer-sauvegardes.ps1 -Serveur 203.0.113.10
# Les fichiers restent chiffrés : sans la clé de sauvegarde (rangée ailleurs), ils sont illisibles.
param(
  [Parameter(Mandatory = $true)][string]$Serveur,
  [string]$Utilisateur = 'root',
  [string]$Dossier = (Join-Path $env:USERPROFILE 'Documents\Smart RH\sauvegardes-serveur')
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Dossier | Out-Null
Write-Host "Copie des sauvegardes de $Serveur vers $Dossier..."
scp -p "${Utilisateur}@${Serveur}:/var/lib/smart-rh/sauvegardes/*.db.chiffre" "$Dossier\"
if ($LASTEXITCODE -ne 0) { throw "Copie impossible (code $LASTEXITCODE). Vérifiez l'adresse du serveur et la connexion SSH." }
$copies = Get-ChildItem $Dossier -Filter '*.db.chiffre' | Sort-Object LastWriteTime -Descending
Write-Host ("{0} sauvegarde(s) sur ce PC, la plus récente : {1}" -f $copies.Count, $copies[0].Name)
