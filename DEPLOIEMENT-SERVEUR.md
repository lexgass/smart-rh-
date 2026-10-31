# Mettre Smart RH en ligne sur un serveur

Ce guide installe Smart RH sur un serveur loué, accessible par une adresse du type **https://rh.votre-domaine.cg**, avec un certificat HTTPS gratuit renouvelé automatiquement. Comptez **une heure** la première fois, dont 20 minutes d'attente.

Tout ce qui est technique est fait par le script `serveur/installer.sh`. Vous avez seulement à louer le serveur, régler le nom de domaine et copier deux commandes.

```
Navigateur ──HTTPS──▶ Caddy (certificat automatique) ──▶ Smart RH (127.0.0.1:4322) ──▶ base + sauvegardes chiffrées
                       ports 80 et 443 seuls ouverts       service système, relancé seul    /var/lib/smart-rh
```

---

## 0. Avant de commencer : où seront les données ?

Smart RH contient des **données personnelles de salariés** (identité, salaires, CNSS). La loi congolaise n° 29-2019 sur la protection des données à caractère personnel encadre leur traitement et leur **transfert hors du Congo**. Avant d'héberger les données de vrais clients chez un hébergeur étranger, faites valider ce point par un juriste (déclaration, clause dans votre contrat client). Pour une démonstration ou un premier client pilote informé, le serveur peut être loué dès maintenant.

---

## 1. Louer le serveur (≈ 10 minutes)

Un « VPS » (serveur privé virtuel) suffit largement :

| Élément | Choix |
|---|---|
| Système | **Ubuntu 24.04 LTS** (ou Debian 12) |
| Taille | 2 processeurs, 4 Go de mémoire, 40 Go de disque (2 Go de mémoire suffisent pour quelques sociétés) |
| Prix | environ **5 à 10 € par mois** chez les hébergeurs européens courants (Hetzner, OVHcloud, Scaleway, Contabo…) ; vérifiez les tarifs du jour |
| Options à cocher | **sauvegarde automatique / snapshots** de l'hébergeur (1 à 2 € de plus par mois) : c'est le filet de sécurité si tout le serveur est perdu |
| Accès | un mot de passe root, ou mieux une **clé SSH** (voir section 7) |

Notez l'**adresse IP** du serveur, par exemple `203.0.113.10`. Activez la **double authentification** sur votre compte chez l'hébergeur et sur GitHub.

## 2. Le nom de domaine (≈ 5 minutes, puis jusqu'à 1 heure d'attente)

Chez le fournisseur de votre nom de domaine, ajoutez un enregistrement DNS :

| Type | Nom | Valeur |
|---|---|---|
| A | `rh` | l'adresse IP du serveur |

L'adresse sera alors **rh.votre-domaine.cg**. Vérifiez depuis votre PC, quand c'est pris en compte :

```powershell
nslookup rh.votre-domaine.cg
```

Le résultat doit afficher l'adresse IP du serveur.

## 3. Envoyer Smart RH et l'installer (≈ 15 minutes)

Deux façons, au choix. **La première est la plus simple.**

**A. Avec le paquet zip** (rien à régler dans GitHub). Dans PowerShell, sur votre PC, dans le dossier où se trouve le zip :

```powershell
scp smart-rh-deploiement-1.3.0.zip root@203.0.113.10:/root/
ssh root@203.0.113.10
```

Puis, une fois connecté au serveur :

```bash
apt-get update && apt-get install -y unzip
unzip /root/smart-rh-deploiement-1.3.0.zip -d /root
bash /root/smart-rh-deploiement/serveur/installer.sh rh.votre-domaine.cg
```

**B. Depuis GitHub** (les mises à jour se font ensuite par un simple `git push`). Sur votre PC, depuis le dossier du projet `smart-rh` :

```powershell
scp serveur\installer.sh root@203.0.113.10:/root/
ssh root@203.0.113.10
```

Puis sur le serveur :

```bash
bash /root/installer.sh rh.votre-domaine.cg
```

Le script, en 8 étapes :
1. met le système à jour et active les **correctifs de sécurité automatiques** ;
2. installe Node.js 22 ;
3. installe **Caddy**, qui obtient et renouvelle seul le certificat HTTPS ;
4. ferme le **pare-feu** sauf SSH, HTTP et HTTPS, et bloque les adresses qui essaient des mots de passe ;
5. crée un compte système dédié, sans droits, pour faire tourner Smart RH ;
6. installe le programme : avec le zip, il le copie tel quel ; depuis GitHub, il affiche une **clé de déploiement** ; ajoutez-la dans GitHub (dépôt > **Settings** > **Deploy keys** > **Add deploy key**, case « Allow write access » **décochée**), puis appuyez sur Entrée ;
7. écrit les réglages, crée le **code d'installation** et démarre le service ;
8. vérifie que tout répond et affiche **l'adresse de premier lancement**.

## 4. Premier lancement (≈ 5 minutes)

Le script se termine par une adresse de ce type :

```
https://rh.votre-domaine.cg/installation?jeton=4f1c…
```

Ouvrez-la **vous-même**, tout de suite : elle seule permet de créer le compte d'**administrateur global**. Sans le code, l'écran affiche « Installation verrouillée », ce qui empêche un inconnu de créer ce compte avant vous. Une fois le compte créé, l'écran se ferme définitivement.

Ensuite, comme sur un poste (voir `app/DEPLOIEMENT.md`, section 4) : créez les sociétés et leur administrateur, faites valider les règles de paie par l'expert-comptable.

## 5. La clé de sauvegarde (à faire le jour même)

Smart RH fait **une sauvegarde chiffrée chaque jour**, conservée 30 jours sur le serveur. Sans la clé, elles sont illisibles, y compris pour vous. Sur le serveur :

```bash
cat /var/lib/smart-rh/cle-sauvegarde.txt
```

Copiez la ligne affichée dans votre **gestionnaire de mots de passe** (ou imprimez-la et rangez-la dans un coffre). Ne l'envoyez jamais par e-mail ni messagerie.

## 6. Garder une copie hors du serveur (chaque semaine, 1 minute)

Si le serveur est perdu, les sauvegardes qui s'y trouvent le sont aussi. Une fois par semaine, depuis votre PC, dans le dossier `smart-rh` :

```powershell
.\serveur\recuperer-sauvegardes.ps1 -Serveur 203.0.113.10
```

Les copies arrivent dans `Documents\Smart RH\sauvegardes-serveur`, toujours chiffrées. Avec les snapshots de l'hébergeur (section 1), vous avez deux filets indépendants.

**Restaurer** une copie sur le serveur :

```bash
systemctl stop smart-rh
cd /opt/smart-rh/app
runuser -u smartrh -- env $(grep -v '^#' /etc/smart-rh/smart-rh.env | xargs) node --no-warnings scripts/restaurer.js /var/lib/smart-rh/sauvegardes/smart-rh-AAAAMMJJ-HHMMSS.db.chiffre /var/lib/smart-rh/smart-rh-restauree.db
mv /var/lib/smart-rh/smart-rh.db /var/lib/smart-rh/smart-rh-avant-restauration.db
mv /var/lib/smart-rh/smart-rh-restauree.db /var/lib/smart-rh/smart-rh.db
systemctl start smart-rh
```

## 7. Sécuriser l'accès au serveur (recommandé, 10 minutes)

Remplacez le mot de passe root par une **clé SSH**, beaucoup plus sûre. Sur votre PC :

```powershell
ssh-keygen -t ed25519
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@203.0.113.10 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

Vérifiez que `ssh root@203.0.113.10` entre **sans** demander de mot de passe, puis, sur le serveur, interdisez les mots de passe :

```bash
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\n' > /etc/ssh/sshd_config.d/50-cle-seulement.conf
systemctl reload ssh
```

Gardez le mot de passe root chez l'hébergeur : sa console web reste un accès de secours.

## 8. Mettre à jour Smart RH

**Installé avec le zip :** envoyez le nouveau paquet sur le serveur (`scp`, comme à la section 3), puis :

```bash
bash /opt/smart-rh/serveur/mettre-a-jour.sh /root/smart-rh-deploiement-1.4.0.zip
```

L'ancienne version reste dans `/opt/smart-rh.precedent` ; si la nouvelle ne répond pas, le script y revient tout seul.

**Installé depuis GitHub :** envoyez la nouvelle version sur GitHub (`git push`), puis sur le serveur :

```bash
bash /opt/smart-rh/serveur/mettre-a-jour.sh
```

Le script fait une **sauvegarde chiffrée**, récupère la nouvelle version, **lance tous les tests** sur une base temporaire, puis redémarre. Si un test échoue, il revient à la version précédente et les utilisateurs ne voient rien. Prévenez-les : le redémarrage coupe l'accès quelques secondes (les saisies en cours sont à refaire).

## 9. Surveillance et dépannage

| Besoin | Commande (sur le serveur) |
|---|---|
| Smart RH tourne-t-il ? | `systemctl status smart-rh` |
| Les 50 derniers messages | `journalctl -u smart-rh -n 50` |
| Fichiers de log du jour | `ls /var/lib/smart-rh/logs` |
| Redémarrer | `systemctl restart smart-rh` |
| Certificat HTTPS, accès | `journalctl -u caddy -n 50` ; `tail /var/log/caddy/smart-rh.log` |
| Mot de passe oublié | voir ci-dessous |
| Place disque | `df -h /` |

Mot de passe oublié (la session de ce compte est fermée, le compte débloqué) :

```bash
cd /opt/smart-rh/app
runuser -u smartrh -- env $(grep -v '^#' /etc/smart-rh/smart-rh.env | xargs) node --no-warnings scripts/mot-de-passe.js adresse@email.cg "nouvelle phrase de passe"
```

Smart RH est **relancé automatiquement** s'il s'arrête, et démarre avec le serveur. Pour être prévenu d'une panne, créez une sonde gratuite (UptimeRobot, Better Stack…) sur `https://rh.votre-domaine.cg/connexion`.

## 10. Ce qu'il ne faut pas faire

- **Ne mettez jamais la base de démonstration en ligne** : elle ouvre des entrées directes sans mot de passe. Le serveur part toujours d'une base vide.
- N'ouvrez pas le port 4322 dans le pare-feu : seul Caddy doit parler à Smart RH.
- Ne partagez pas l'adresse de premier lancement (section 4).
- Ne stockez pas la clé de sauvegarde au même endroit que les sauvegardes.

## Fichiers fournis

| Fichier | Rôle |
|---|---|
| `serveur/installer.sh` | Installation complète du serveur (relançable sans risque) |
| `serveur/mettre-a-jour.sh` | Mise à jour avec sauvegarde, tests et retour arrière |
| `serveur/smart-rh.service` | Service système : démarrage automatique, relance, cloisonnement |
| `serveur/Caddyfile` | HTTPS automatique, compression, journal des accès |
| `serveur/recuperer-sauvegardes.ps1` | Copie des sauvegardes chiffrées du serveur vers votre PC |
