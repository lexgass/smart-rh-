#!/usr/bin/env bash
# Mise à jour de Smart RH sur le serveur.
#   Installé depuis GitHub :   bash /opt/smart-rh/serveur/mettre-a-jour.sh
#   Installé depuis le zip :   bash /opt/smart-rh/serveur/mettre-a-jour.sh /root/smart-rh-deploiement-X.Y.Z.zip
# Étapes : sauvegarde chiffrée, nouvelle version, tests, redémarrage, vérification.
# En cas d'échec des tests, rien n'est changé pour les utilisateurs.
set -euo pipefail
CODE=/opt/smart-rh
CONF=/etc/smart-rh/smart-rh.env
PAQUET="${1:-}"
[ "$(id -u)" = 0 ] || { echo "À lancer en root (sudo -i)."; exit 1; }

sauvegarde() {
  echo "==> Sauvegarde chiffrée avant la mise à jour"
  ( set -a; . "$CONF"; set +a; cd "$CODE/app"; runuser -u smartrh -- env SMART_RH_DB="$SMART_RH_DB" SMART_RH_SAUVEGARDES="$SMART_RH_SAUVEGARDES" SMART_RH_LOGS="$SMART_RH_LOGS" SMART_RH_CLE_SAUVEGARDE="$(dirname "$SMART_RH_DB")/cle-sauvegarde.txt" \
    node --no-warnings -e "console.log('Copie : ' + require('./sauvegarde').sauvegarder(true))" )
}
verifier() {
  systemctl restart smart-rh
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS -o /dev/null http://127.0.0.1:4322/connexion; then return 0; fi
    sleep 2
  done
  return 1
}

if [ -n "$PAQUET" ]; then
  # ---------- mise à jour depuis un paquet zip ----------
  [ -f "$PAQUET" ] || { echo "Paquet introuvable : $PAQUET"; exit 1; }
  command -v unzip >/dev/null || apt-get install -yq unzip
  TRAVAIL=$(mktemp -d)
  unzip -q "$PAQUET" -d "$TRAVAIL"
  NOUVEAU=$(dirname "$(find "$TRAVAIL" -maxdepth 3 -path '*/app/package.json' | head -1)")
  NOUVEAU=$(dirname "$NOUVEAU")
  [ -f "$NOUVEAU/app/package.json" ] || { echo "Ce zip ne contient pas Smart RH."; exit 1; }
  echo "Version installée : $(cat "$CODE/VERSION.txt" 2>/dev/null || echo inconnue)"
  echo "Nouvelle version  : $(cat "$NOUVEAU/VERSION.txt" 2>/dev/null || echo inconnue)"
  sauvegarde
  echo "==> Préparation et tests de la nouvelle version (sur une base temporaire)"
  ( cd "$NOUVEAU/app" && npm ci --omit=dev --no-audit --no-fund && npm test --silent ) || { echo "Tests en échec : la version en service n'a pas été touchée."; rm -rf "$TRAVAIL"; exit 1; }
  echo "==> Remplacement du programme (l'ancien est gardé dans $CODE.precedent)"
  rm -rf "$CODE.precedent"
  mv "$CODE" "$CODE.precedent"
  install -d -m 0755 "$CODE"
  cp -a "$NOUVEAU/app" "$NOUVEAU/serveur" "$CODE/"
  [ -f "$NOUVEAU/VERSION.txt" ] && cp "$NOUVEAU/VERSION.txt" "$CODE/"
  chown -R root:root "$CODE"
  rm -rf "$TRAVAIL"
  if verifier; then echo "Smart RH est à jour et répond ($(cat "$CODE/VERSION.txt" 2>/dev/null))."; exit 0; fi
  echo "Smart RH ne répond pas : retour à la version précédente."
  rm -rf "$CODE"; mv "$CODE.precedent" "$CODE"; systemctl restart smart-rh
  echo "Diagnostic : journalctl -u smart-rh -n 50"
  exit 1
fi

# ---------- mise à jour depuis GitHub ----------
[ -d "$CODE/.git" ] || { echo "Installé depuis un zip : indiquez le nouveau paquet, par exemple : bash $0 /root/smart-rh-deploiement-1.4.0.zip"; exit 1; }
cd "$CODE"
git fetch --quiet origin
AVANT=$(git rev-parse HEAD)
APRES=$(git rev-parse '@{u}')
if [ "$AVANT" = "$APRES" ]; then echo "Smart RH est déjà à jour ($(git log -1 --format='%h %s'))."; exit 0; fi
echo "Nouveautés :"
git log --oneline "$AVANT..$APRES"
echo
sauvegarde

echo "==> Nouvelle version"
git merge --ff-only --quiet "$APRES"
cd app
npm ci --omit=dev --no-audit --no-fund

echo "==> Tests (sur une base temporaire, sans toucher aux données)"
if ! npm test --silent; then
  echo "Tests en échec : retour à la version précédente, Smart RH n'a pas été redémarré."
  cd "$CODE"; git reset --hard --quiet "$AVANT"; cd app; npm ci --omit=dev --no-audit --no-fund
  exit 1
fi
chown -R root:root "$CODE"

echo "==> Redémarrage"
if verifier; then echo "Smart RH est à jour et répond ($(git -C "$CODE" log -1 --format='%h %s'))."; exit 0; fi
echo "Smart RH ne répond pas après la mise à jour. Retour arrière :"
echo "  cd $CODE && git reset --hard $AVANT && cd app && npm ci --omit=dev && systemctl restart smart-rh"
echo "Diagnostic : journalctl -u smart-rh -n 50"
exit 1
