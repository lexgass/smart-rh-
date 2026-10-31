# Déployer Smart RH 1.2

Ce guide installe Smart RH chez un client : sur un poste Windows, ou sur un petit serveur du réseau local auquel les autres postes se connectent par le navigateur. Il ne demande pas de compétence en développement : il suffit de recopier les commandes.

## 1. Ce qu'il faut

- Un ordinateur Windows 10, Windows 11 ou Windows Server, allumé pendant les heures de travail si d'autres postes s'y connectent.
- Node.js **22 LTS** (version 22.13 ou plus récente), à télécharger sur nodejs.org (bouton « LTS »), installation par défaut.
- 300 Mo d'espace disque, plus la place des sauvegardes.
- Le dossier `smart-rh` préparé avec `npm run paquet` (voir la section 9), copié par exemple dans `C:\SmartRH`.
- Pour le HTTPS : OpenSSL (fourni avec Git pour Windows) ou, à défaut, Windows PowerShell 5.1, présent sur tous les Windows.

Toutes les commandes se tapent dans **PowerShell**, ouvert dans le dossier de Smart RH (dans l'Explorateur : clic droit dans le dossier, « Ouvrir dans le Terminal »).

## 2. Installer

```powershell
node --version
```
Le résultat doit commencer par `v22.13` ou plus.

```powershell
npm ci --omit=dev
```
Installe les composants de Smart RH (une minute environ).

```powershell
npm install -g pm2
```
Installe PM2, qui fait tourner Smart RH en permanence et le relance en cas de problème.

```powershell
npm test
```
Facultatif mais conseillé : lance les tests automatiques. Les cinq lignes doivent commencer par `OK`.

## 3. Démarrer en production

Créez d'abord le certificat HTTPS (une fois, puis tous les 3 ans) :

```powershell
npm run certificat
```
Il crée le dossier `certificat` à côté de la base. Le fichier de clé qu'il contient (`.key` ou `.pfx`) ne doit jamais être copié ailleurs.

```powershell
pm2 start ecosystem.config.js --env production
pm2 save
```

Smart RH est alors accessible à l'adresse **https**://localhost:4322 sur ce poste. La première fois, le navigateur affiche un avertissement : la section 5 explique comment approuver le certificat.

Pour qu'il redémarre tout seul à l'ouverture de session Windows, créez dans le dossier de démarrage (touche Windows + R, tapez `shell:startup`, Entrée) un fichier `smart-rh.cmd` contenant :

```
@echo off
pm2 resurrect
```

### Préparer une démonstration

La démonstration est une installation de production remplie de sociétés et de salariés fictifs. Provisoirement, son écran de connexion propose aussi une **entrée directe** dans chacun des trois modes d'accès ; ces boutons n'apparaissent jamais sur une base de production.

```powershell
npm run demo:preparer
pm2 start ecosystem.config.js
```

La base est créée dans `demo\smart-rh-demo.db`, avec les comptes du parcours normal :
- un administrateur global ;
- un administrateur pour chacune des deux sociétés ;
- un utilisateur rattaché aux deux sociétés.

Leurs adresses et mots de passe sont écrits dans `demo\comptes-demo.txt`. Ce fichier est lisible sur ce poste seulement, jamais affiché par l'application et jamais copié dans le paquet livré. Pour choisir un même mot de passe pour tous les comptes : `npm run demo:preparer -- --mot-de-passe "votre phrase de démonstration"`. Pour repartir de zéro avant une présentation : `pm2 stop smart-rh`, `npm run demo:preparer -- --remplacer`, puis `pm2 start smart-rh`.

## 4. Premier lancement

Le parcours est toujours le même : **création du compte, puis accès par mot de passe**. Aucun écran ne s'ouvre sans authentification.

1. Ouvrez https://localhost:4322 : l'écran « Bienvenue dans Smart RH » demande de créer le compte d'**administrateur global** (nom, e-mail, mot de passe de 12 caractères au moins ; une phrase de plusieurs mots est idéale). C'est le compte de l'installateur : il crée les sociétés et leur administrateur, et gère les sauvegardes. Il ne sert pas au travail courant.
2. **Sociétés clientes** : créez chaque société avec sa convention collective, **son logo** (PNG, JPG ou WebP, 1 Mo au plus, repris en tête des bulletins de paie et des documents) et, dans le même formulaire, **son administrateur** (nom, e-mail, mot de passe provisoire). Transmettez-lui ses identifiants. Le logo se change ensuite dans **Informations légales**.
3. L'**administrateur de la société** se connecte, choisit son propre mot de passe (obligatoire), puis renseigne :
   - les **informations légales** : NIU, RCCM, numéro d'employeur CNSS (ils figurent sur les bulletins) ;
   - la **structure** : départements, catégories, postes ; dans **Convention collective**, il vérifie le niveau de chaque catégorie ;
   - les **utilisateurs** de sa société, chacun avec un mot de passe provisoire.
4. **Règles de paie** : faites valider les taux par l'expert-comptable (section 8).
5. **Sauvegardes** : l'administrateur global copie la clé de chiffrement hors de l'ordinateur (section 6).
6. **Embauche** : saisissez les salariés, puis calculez une première paie de contrôle.

## 5. Accès depuis les autres postes du réseau

La configuration de production écoute tout le réseau local (`HOST: '0.0.0.0'` dans `ecosystem.config.js`), en HTTPS.

1. Trouvez l'adresse du poste serveur :
   ```powershell
   ipconfig
   ```
   Relevez la ligne « Adresse IPv4 », par exemple `192.168.1.20`.
2. Autorisez le port dans le pare-feu Windows (PowerShell ouvert **en administrateur**) :
   ```powershell
   New-NetFirewallRule -DisplayName "Smart RH" -Direction Inbound -Protocol TCP -LocalPort 4322 -Action Allow -Profile Private
   ```
3. Sur les autres postes, ouvrez https://192.168.1.20:4322 (avec l'adresse relevée).
4. **Approuvez le certificat sur chaque poste**, une seule fois, pour que le navigateur ne l'affiche plus comme « non sécurisé » :
   - copiez sur le poste le fichier `certificat\smart-rh.crt` (ou `smart-rh.cer`) ; **jamais** le fichier `.key` ni `.pfx` ;
   - double-cliquez dessus, puis « Installer le certificat », « Ordinateur local », « Placer tous les certificats dans le magasin suivant » : **Autorités de certification racines de confiance** ;
   - redémarrez le navigateur.

**Sécurité.** Les échanges sont chiffrés (HTTPS, TLS 1.2 au minimum). Réservez malgré tout l'accès au réseau interne de l'entreprise. **N'ouvrez jamais le port 4322 sur internet.** Si le poste serveur change de nom ou d'adresse IP, relancez `npm run certificat` puis `pm2 restart smart-rh`.

Smart RH peut aussi être placé derrière un serveur web (IIS, Nginx, Caddy) qui gère le HTTPS : dans ce cas, `SMART_RH_HTTPS_PROXY: '1'`, `SMART_RH_PROXY: '1'` et `HOST: '127.0.0.1'`. Pour un serveur en ligne, suivez plutôt `DEPLOIEMENT-SERVEUR.md` (à la racine du projet) : tout y est automatisé.

## 6. Sauvegardes et restauration

- Une copie complète de la base est faite **automatiquement chaque jour**, conservée 14 jours, dans le dossier `sauvegardes` de Smart RH. L'administrateur global voit la liste dans **Administration > Sauvegardes**, peut en créer une à la demande et télécharger chaque copie.
- Chaque copie est **chiffrée** (AES-256-GCM) : un fichier perdu ou volé est illisible, et une copie modifiée est détectée à la restauration. La clé est dans `cle-sauvegarde.txt`, à côté de la base, créée à la première sauvegarde.
- **Copiez la clé une fois, hors de l'ordinateur** : gestionnaire de mots de passe, ou impression rangée dans un coffre. Sans elle, aucune copie ne peut être restaurée. Ne la mettez jamais sur la même clé USB que les sauvegardes. La page Sauvegardes affiche l'empreinte de la clé pour vérifier, sans la révéler, que la copie gardée est la bonne.
- **Copiez le dossier `sauvegardes` au moins une fois par semaine** sur une clé USB ou un disque externe rangé ailleurs.

Pour revenir à une copie :

```powershell
pm2 stop smart-rh
npm run restaurer -- sauvegardes\smart-rh-AAAAMMJJ-HHMMSS.db.chiffre smart-rh-restauree.db
Rename-Item smart-rh.db smart-rh-avant-restauration.db
Rename-Item smart-rh-restauree.db smart-rh.db
pm2 start smart-rh
```
Remplacez le nom par celui de la copie choisie. La restauration vérifie l'intégrité de la base et n'écrase jamais un fichier existant. Les saisies faites après cette copie sont perdues ; l'ancienne base reste dans `smart-rh-avant-restauration.db`. Sur un autre ordinateur, placez d'abord la clé dans `cle-sauvegarde.txt` (ou indiquez son chemin avec `SMART_RH_CLE_SAUVEGARDE`).

## 7. Modes d'accès, comptes et mots de passe

L'administration a **deux niveaux** : un administrateur global pour l'installation, et un administrateur par société pour ses comptes. Chaque compte a un des trois **modes d'accès** :

| Mode | Sociétés | Qui le crée | Accès |
|---|---|---|---|
| **Administrateur global** | Toutes | L'installation (premier compte), puis un administrateur global ; **deux comptes actifs au plus** | Création des sociétés et de leur administrateur, tous les comptes, sauvegardes, modèle national « Congo », barèmes partagés des conventions, et tout le reste |
| **Administrateur de société** | Une seule | L'administrateur global, en même temps que la société | Sa société : comptes et journal de sa société, règles de paie, structure, convention, informations légales, sorties, export des données personnelles |
| **Utilisateur** | Une ou plusieurs | L'administrateur de sa société, ou l'administrateur global (seul à pouvoir ouvrir plusieurs sociétés) | Saisie courante : salariés, embauche, congés, éléments variables, paie, déclarations, dotations. Ni règles, ni modification de la structure, ni sorties, ni comptes |

Les droits sont décrits dans une seule table (`acces.js`) et vérifiés pour chaque page avant son affichage. Les comptes des versions précédentes sont convertis automatiquement au premier démarrage : gestionnaire cabinet → administrateur global, administrateur société → administrateur de société, gestionnaire RH → utilisateur.

- Les mots de passe font **12 caractères au moins** ; les mots de passe trop courants sont refusés.
- Un mot de passe donné par un administrateur (création ou réinitialisation) est **provisoire** : la personne doit le changer à sa première connexion.
- Mot de passe oublié : l'administrateur de la société (ou l'administrateur global) le réinitialise dans **Utilisateurs > Gérer**.
- Compte d'administrateur global perdu : sur le poste serveur, dans le dossier de Smart RH :
  ```powershell
  node scripts/mot-de-passe.js adresse@email.cg "nouvelle phrase de passe"
  ```
- Une session se ferme après **30 minutes sans activité**, et dans tous les cas après 12 heures.
- Après 8 erreurs depuis un même poste, la connexion y est bloquée 15 minutes ; après 10 erreurs sur un même compte, **le compte** est verrouillé 15 minutes (un administrateur peut le débloquer en le réactivant).
- Le **Journal** trace les modifications, les connexions (réussies et refusées) et les consultations de données personnelles (fiches, bulletins, exports).
- Demande d'accès d'un salarié à ses données (loi n° 29-2019) : fiche du salarié, bouton **Données personnelles** (administrateurs global et de société).
- Chaque personne règle son affichage dans **Mon compte > Affichage et accessibilité** : thème clair, sombre ou automatique, taille du texte, contraste renforcé, animations réduites, police très lisible.

La conformité de sécurité est détaillée dans `SECURITE.md`.

## 8. Avant la première vraie paie

Les taux livrés dans le modèle « Congo 2026 » sont **indicatifs**. Faites valider par l'expert-comptable, dans **Règles de paie** et **Convention collective** :

- le barème de l'ITS, l'abattement de 20 % et le quotient familial (loi de finances 2026) ;
- les taux et plafonds CNSS et CAMU, la contribution de solidarité, la TOL ;
- la répartition de la taxe unique entre CNSS et DGI ;
- les barèmes de la convention de chaque société (préavis, indemnité, ancienneté), en particulier ceux marqués « À renseigner ».

Calculez ensuite une paie de contrôle et comparez-la, salarié par salarié, avec la paie précédente de l'entreprise.

## 9. Préparer et mettre à jour

Sur le poste de développement, le paquet à livrer se prépare avec :

```powershell
npm run paquet
```
Il crée le dossier `paquet\smart-rh`, sans base de données, sans sauvegardes, sans clé ni certificat.

Pour mettre à jour une installation :

1. Dans Smart RH : **Sauvegardes > Sauvegarder maintenant**.
2. `pm2 stop smart-rh`
3. Remplacez les fichiers du dossier par ceux du nouveau paquet, **sans toucher** à `smart-rh.db`, `cle-sauvegarde.txt`, ni aux dossiers `sauvegardes` et `certificat`.
4. `npm ci --omit=dev`
5. Mise à jour depuis la 1.0 : `npm run certificat`, puis `pm2 delete smart-rh` et `pm2 start ecosystem.config.js --env production` pour prendre la nouvelle configuration (HTTPS).
6. `pm2 start smart-rh` (si l'étape 5 n'a pas été faite) puis `pm2 save`.

Les évolutions de la base sont appliquées automatiquement au démarrage, sans perte de données.

## 10. En cas de problème

| Symptôme | Que faire |
|---|---|
| La page ne s'ouvre pas | `pm2 status` : la ligne `smart-rh` doit être `online`. Sinon `pm2 logs smart-rh --lines 30`. |
| « aucun certificat trouvé » dans les journaux | Lancez `npm run certificat`, puis `pm2 restart smart-rh`. |
| Le navigateur affiche « non sécurisé » | Le certificat n'est pas approuvé sur ce poste (section 5, point 4), ou le nom ou l'adresse du serveur a changé depuis sa création. |
| « Formulaire expiré » | La page était ouverte depuis longtemps ou la session s'est fermée : rechargez la page et recommencez. |
| Message d'erreur dans une page | `pm2 logs smart-rh --lines 50`, puis transmettez le message et l'heure au support. |
| « Port déjà utilisé » | Une autre application occupe le 4322 : changez `PORT` dans `ecosystem.config.js`, puis `pm2 restart smart-rh --update-env`. |
| Les autres postes n'accèdent pas | Vérifiez l'adresse IP, la règle de pare-feu (section 5) et que le poste serveur est allumé. |
| Un compte est « Verrouillé » | Trop d'erreurs de mot de passe : il se débloque seul après 15 minutes, ou un administrateur le réactive dans Utilisateurs. |

## 10 bis. Fichiers de log et surveillance

Smart RH écrit un fichier de log par jour dans le dossier `logs`, à côté de la base, et le conserve 30 jours :

| Fichier | Contenu |
|---|---|
| `smart-rh-AAAA-MM-JJ.log` | Démarrage (version, configuration), arrêts, erreurs avec leur origine, connexions et refus, sauvegardes, état de la mémoire toutes les 10 minutes, requêtes lentes |
| `acces-AAAA-MM-JJ.log` | Chaque page : méthode, adresse (sans paramètres), statut, durée, compte, société, adresse IP |
| `surveillance-AAAA-MM-JJ.log` | Version portable : lancements, contrôles, relances, messages du serveur |

Les logs ne contiennent jamais de mot de passe, de jeton ni de contenu de formulaire.

**Surveillance.**
- Avec PM2 (installation chez un client), c'est PM2 qui relance Smart RH en cas d'arrêt.
- Sans PM2, `npm run surveillance` lance Smart RH sous surveillance :
  - une vérification toutes les 15 secondes ;
  - une relance s'il s'arrête, ou s'il ne répond plus pendant 45 secondes ;
  - un abandon après 10 relances en 10 minutes, pour éviter de tourner en boucle sur une panne permanente.

  La version portable l'utilise automatiquement.

**Version portable** : `npm run portable` fabrique `livraison/SmartRH-portable` et son zip. On démarre Smart RH avec « Smart RH.vbs », sans fenêtre noire, et on l'arrête avec « Arrêter Smart RH.vbs ».

## 11. Réglages (variables d'environnement)

| Variable | Rôle | Valeur par défaut |
|---|---|---|
| `PORT` | Port d'écoute | 4322 |
| `HOST` | `127.0.0.1` : ce poste seulement ; `0.0.0.0` : tout le réseau local | 127.0.0.1 |
| `SMART_RH_DB` | Fichier de la base | `smart-rh.db` dans le dossier |
| `SMART_RH_SAUVEGARDES` | Dossier des sauvegardes | `sauvegardes` dans le dossier |
| `SMART_RH_CONSERVATION` | Jours de conservation des sauvegardes | 14 |
| `SMART_RH_LOGS` | Dossier des fichiers de log | `logs` à côté de la base |
| `SMART_RH_LOGS_JOURS` | Jours de conservation des fichiers de log | 30 |
| `SMART_RH_CLE_SAUVEGARDE` | Fichier de la clé de chiffrement des sauvegardes | `cle-sauvegarde.txt` à côté de la base |
| `SMART_RH_INACTIVITE_MINUTES` | Fermeture d'une session sans activité | 30 |
| `SMART_RH_SESSION_HEURES` | Durée maximale d'une session | 12 |
| `SMART_RH_HTTPS` | `1` : HTTPS (certificat de `npm run certificat`, ou serveur web devant) | 0 (1 en production) |
| `SMART_RH_CERTIFICAT`, `SMART_RH_CLE` | Certificat et clé HTTPS | `certificat\smart-rh.crt` et `.key` à côté de la base |
| `SMART_RH_PROXY` | `1` derrière un serveur web : adresse du client lue dans X-Forwarded-For | 0 |
| `SMART_RH_HTTPS_PROXY` | `1` quand le HTTPS est assuré par le serveur web placé devant (Caddy, Nginx) : cookies réservés au HTTPS et HSTS, Smart RH écoutant en HTTP sur 127.0.0.1 | 0 |
| `SMART_RH_INSTALLATION_JETON` | Serveur en ligne : code exigé par l'écran de premier lancement (`/installation?jeton=…`), pour que personne ne crée le premier compte avant vous | vide (écran ouvert) |

## Capacité mesurée

`npm run charge` génère une base de 200 sociétés et 5 000 salariés, avec 5 mois de paie, et la soumet à 50 utilisateurs simultanés pendant 30 secondes. Sur le poste de développement (octobre 2026) : 455 pages par seconde, aucune erreur, réponse médiane de 86 ms, 95 % des pages en moins de 241 ms ; paie d'une société de 500 salariés en 0,9 seconde. Pendant ce calcul, les autres utilisateurs attendent jusqu'à une seconde.

## Limites de la version 1.2

- Pas de synchronisation en ligne entre plusieurs sites : prévue pour une version suivante.
- Les déclarations CNSS et DGI sont préparées et exportées (Excel, impression), pas télétransmises.
- Pas de double authentification (prévue pour une version suivante).
- La base elle-même n'est pas chiffrée sur le disque (seules les sauvegardes le sont) : protégez l'accès au poste serveur (session Windows avec mot de passe, BitLocker si possible).
