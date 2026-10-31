#!/usr/bin/env bash
# Installation de Smart RH sur un serveur en ligne neuf (Ubuntu 24.04 LTS ou Debian 12).
# Usage, en root sur le serveur :  bash installer.sh rh.votre-domaine.cg
# Le script peut être relancé sans risque : ce qui est déjà en place est conservé (base, clé, réglages).
set -euo pipefail

DOMAINE="${1:-}"
DEPOT="${DEPOT:-git@github.com:lexgass/smart-rh-.git}"
BRANCHE="${BRANCHE:-main}"
CODE=/opt/smart-rh            # le programme (lecture seule pour le service)
DONNEES=/var/lib/smart-rh     # la base, la clé de sauvegarde, les sauvegardes, les logs
CONF=/etc/smart-rh            # les réglages (smart-rh.env)

[ -n "$DOMAINE" ] || { echo "Usage : bash installer.sh rh.votre-domaine.cg"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "À lancer en root (commande : sudo -i, puis relancez)."; exit 1; }
etape() { echo; echo "==> $*"; }

etape "1/8 Mise à jour du système"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq curl git unzip ufw fail2ban unattended-upgrades gnupg ca-certificates openssl debian-keyring debian-archive-keyring apt-transport-https
# correctifs de sécurité installés automatiquement chaque nuit
dpkg-reconfigure -f noninteractive unattended-upgrades
timedatectl set-timezone Africa/Brazzaville || true

etape "2/8 Node.js 22"
if ! node -v 2>/dev/null | grep -q '^v22'; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -q
  apt-get install -yq nodejs
fi
node -v

etape "3/8 Caddy : HTTPS automatique (certificat Let's Encrypt renouvelé tout seul)"
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -yq caddy
fi

etape "4/8 Pare-feu : seuls SSH, HTTP et HTTPS sont ouverts"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban   # bloque les adresses qui essaient des mots de passe SSH

etape "5/8 Compte de service et dossiers"
id smartrh >/dev/null 2>&1 || useradd --system --home-dir "$DONNEES" --shell /usr/sbin/nologin smartrh
install -d -o smartrh -g smartrh -m 0700 "$DONNEES" "$DONNEES/sauvegardes" "$DONNEES/logs"
install -d -o root -g smartrh -m 0750 "$CONF"

ICI=$(cd "$(dirname "$0")" && pwd)
if [ -f "$ICI/../app/package.json" ] && [ ! -d "$CODE/.git" ]; then
  # installation depuis le paquet zip : le programme est copié tel quel, sans passer par GitHub
  etape "6/8 Programme Smart RH, depuis le paquet"
  if [ -d "$CODE/app" ]; then echo "Smart RH est déjà installé : pour une nouvelle version, utilisez mettre-a-jour.sh (voir le guide)."; else
    install -d -m 0755 "$CODE"
    cp -a "$ICI/../app" "$ICI/../serveur" "$CODE/"
    [ -f "$ICI/../VERSION.txt" ] && cp "$ICI/../VERSION.txt" "$CODE/"
  fi
else
etape "6/8 Programme Smart RH, depuis GitHub"
fi
if [ ! -d "$CODE/.git" ] && [ ! -d "$CODE/app" ]; then
  if [[ "$DEPOT" == git@* ]]; then
    # clé de déploiement : le serveur peut lire le dépôt, et rien d'autre
    install -d -m 0700 /root/.ssh
    [ -f /root/.ssh/smart-rh-deploiement ] || ssh-keygen -q -t ed25519 -N '' -C "smart-rh@$DOMAINE" -f /root/.ssh/smart-rh-deploiement
    grep -q 'smart-rh-deploiement' /root/.ssh/config 2>/dev/null || printf 'Host github.com\n  IdentityFile /root/.ssh/smart-rh-deploiement\n  IdentitiesOnly yes\n' >> /root/.ssh/config
    ssh-keyscan -t ed25519 github.com >> /root/.ssh/known_hosts 2>/dev/null
    echo
    echo "Ajoutez cette clé dans GitHub : votre dépôt > Settings > Deploy keys > Add deploy key"
    echo "(titre : serveur Smart RH ; laissez « Allow write access » DÉCOCHÉ) :"
    echo
    cat /root/.ssh/smart-rh-deploiement.pub
    echo
    read -rp "Appuyez sur Entrée une fois la clé ajoutée dans GitHub... " _
  fi
  git clone --branch "$BRANCHE" "$DEPOT" "$CODE"
fi
cd "$CODE/app"
npm ci --omit=dev --no-audit --no-fund
chown -R root:root "$CODE"

etape "7/8 Réglages, service et HTTPS"
if [ ! -f "$CONF/smart-rh.env" ]; then
  JETON=$(openssl rand -hex 24)
  cat > "$CONF/smart-rh.env" <<REGLAGES
# Réglages de Smart RH sur ce serveur (voir DEPLOIEMENT.md, section 11). Après une modification : systemctl restart smart-rh
NODE_ENV=production
TZ=Africa/Brazzaville
PORT=4322
HOST=127.0.0.1
SMART_RH_DB=$DONNEES/smart-rh.db
SMART_RH_SAUVEGARDES=$DONNEES/sauvegardes
SMART_RH_LOGS=$DONNEES/logs
SMART_RH_CONSERVATION=30
SMART_RH_PROXY=1
SMART_RH_HTTPS_PROXY=1
SMART_RH_INSTALLATION_JETON=$JETON
REGLAGES
fi
chown root:smartrh "$CONF/smart-rh.env"
chmod 0640 "$CONF/smart-rh.env"
install -m 0644 "$CODE/serveur/smart-rh.service" /etc/systemd/system/smart-rh.service
systemctl daemon-reload
systemctl enable smart-rh
systemctl restart smart-rh
sed "s/rh\.exemple\.cg/$DOMAINE/g" "$CODE/serveur/Caddyfile" > /etc/caddy/Caddyfile
install -d -o caddy -g caddy /var/log/caddy
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy || systemctl restart caddy

etape "8/8 Vérification"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -o /dev/null http://127.0.0.1:4322/connexion; then OK=1; break; fi
  sleep 2
done
if [ "${OK:-0}" != 1 ]; then
  echo "Smart RH ne répond pas. Voir : journalctl -u smart-rh -n 50"
  exit 1
fi
JETON=$(grep '^SMART_RH_INSTALLATION_JETON=' "$CONF/smart-rh.env" | cut -d= -f2)
echo
echo "Smart RH est installé et démarré."
echo
echo "1. Vérifiez que le nom $DOMAINE pointe bien vers ce serveur (le certificat HTTPS est obtenu dans la minute qui suit)."
echo "2. Créez le compte d'administrateur global en ouvrant CETTE adresse (gardez-la pour vous) :"
echo
echo "   https://$DOMAINE/installation?jeton=$JETON"
echo
echo "3. Copiez ensuite la clé de sauvegarde dans votre gestionnaire de mots de passe : cat $DONNEES/cle-sauvegarde.txt"
echo "   (elle est créée à la première sauvegarde, quelques secondes après le démarrage)"
