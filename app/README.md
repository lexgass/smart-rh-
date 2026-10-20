# Smart RH 1.2

Gestion RH et paie pour les PME du Congo-Brazzaville : plusieurs sociétés, règles de paie paramétrables et datées, conventions collectives, congés, éléments variables, déclarations CNSS et DGI, sorties, comptes et sauvegardes. Fonctionne en local, sans internet.

**Installer chez un client : voir [DEPLOIEMENT.md](DEPLOIEMENT.md). Sécurité et conformité : voir [SECURITE.md](SECURITE.md).**

## Commandes

```bash
npm ci --omit=dev
npm start
npm run demo
npm test
npm run charge
npm run certificat
npm run paquet
```

- `npm ci --omit=dev` : installe les dépendances.
- `npm start` : production (base vierge, création du compte d'administrateur global au premier lancement).
- `npm run demo:preparer` : prépare la base de démonstration (sociétés et salariés fictifs, comptes avec mots de passe dans `demo/comptes-demo.txt`).
- `npm run demo` : lance Smart RH sur cette base, exactement comme en production (connexion par mot de passe).
- `npm test` : calcul de l'ITS, puis parcours complets en démonstration et en production (droits, sécurité, affichage).
- `npm run charge` : test de montée en charge (200 sociétés, 5 000 salariés, 50 utilisateurs simultanés).
- `npm run certificat` : crée le certificat HTTPS du serveur.
- `npm run restaurer -- <copie> <nouvelle base>` : restaure une sauvegarde chiffrée.
- `npm run paquet` : prépare `paquet/smart-rh` à livrer.

Sous PM2 : `pm2 start ecosystem.config.js` (démonstration) ou `pm2 start ecosystem.config.js --env production`, puis `pm2 restart smart-rh` après une modification du code. Réglages : `config.js` et section 11 du guide de déploiement.

## Modes d'accès

| Mode | Sociétés | Accès |
|---|---|---|
| Administrateur global | Toutes | L'installation : sociétés et leur administrateur, sauvegardes, règles partagées (deux comptes au plus) |
| Administrateur de société | Une | Sa société : ses comptes, règles, structure et sorties |
| Utilisateur | Une ou plusieurs | La saisie courante : salariés, congés, éléments variables, paie, dotations |

## Organisation

| Fichier | Rôle |
|---|---|
| `config.js` | Réglages lus dans les variables d'environnement |
| `db.js` | Base (mode WAL, requêtes préparées en cache, transactions), référentiel légal « Congo 2026 », données fictives de la démonstration |
| `migrations.js` | Évolutions du schéma au démarrage, index, conventions collectives |
| `acces.js` | Les trois modes d'accès : table des droits, sociétés ouvertes à chaque compte |
| `auth.js` | Comptes, mots de passe, sessions, jeton anti-falsification, verrouillage, préférences d'affichage, utilisateurs |
| `journal.js` | Journal des modifications, connexions et consultations |
| `sauvegarde.js` | Sauvegardes chiffrées, quotidiennes et à la demande |
| `paie.js` | Moteur de paie (règles : société, puis convention, puis modèle national) |
| `droits.js` | Droits selon la convention : essai, préavis, congés, indemnités, soldes |
| `calendrier.js` | Jours fériés du Congo, jours ouvrables |
| `server.js` | En-têtes de sécurité, HTTPS, menus, écrans principaux, pages d'erreur |
| `routes-*.js` | Congés, conventions, déclarations, éléments variables, sorties, gestion des fiches et données personnelles, recherche |
| `tests/` | Tests automatiques |
| `scripts/` | Paquet, certificat HTTPS, restauration, test de charge, mot de passe de secours, préparation et lancement de la démonstration |

Les taux du modèle « Congo 2026 » sont indicatifs : ils doivent être validés par un expert-comptable avant la première vraie paie (section 8 du guide).
