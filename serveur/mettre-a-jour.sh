#!/usr/bin/env bash
# Mise à jour de Smart RH sur le serveur, depuis GitHub.
# Usage, en root sur le serveur :  bash /opt/smart-rh/serveur/mettre-a-jour.sh
# Étapes : sauvegarde chiffrée, récupération de la nouvelle version, tests, redémarrage, vérification.
# En cas d'échec des tests, rien n'est changé pour les utilisateurs.
set -euo pipefail
CODE=/opt/smart-rh
CONF=/etc/smart-rh/smart-rh.env
[ "$(id -u)" = 0 ] || { echo "À lancer en root (sudo -i)."; exit 1; }
cd "$CODE"

git fetch --quiet origin
AVANT=$(git rev-parse HEAD)
APRES=$(git rev-parse '@{u}')
if [ "$AVANT" = "$APRES" ]; then echo "Smart RH est déjà à jour ($(git log -1 --format='%h %s'))."; exit 0; fi
echo "Nouveautés :"
git log --oneline "$AVANT..$APRES"

echo
echo "==> Sauvegarde chiffrée avant la mise à jour"
( set -a; . "$CONF"; set +a; cd "$CODE/app"; runuser -u smartrh -- env SMART_RH_DB="$SMART_RH_DB" SMART_RH_SAUVEGARDES="$SMART_RH_SAUVEGARDES" SMART_RH_LOGS="$SMART_RH_LOGS" \
  node --no-warnings -e "console.log('Copie : ' + require('./sauvegarde').sauvegarder(true))" )

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
systemctl restart smart-rh
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -o /dev/null http://127.0.0.1:4322/connexion; then echo "Smart RH est à jour et répond ($(git -C "$CODE" log -1 --format='%h %s'))."; exit 0; fi
  sleep 2
done
echo "Smart RH ne répond pas après la mise à jour. Retour arrière :"
echo "  cd $CODE && git reset --hard $AVANT && cd app && npm ci --omit=dev && systemctl restart smart-rh"
echo "Diagnostic : journalctl -u smart-rh -n 50"
exit 1
