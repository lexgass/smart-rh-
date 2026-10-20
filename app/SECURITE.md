# Sécurité de Smart RH 1.2

Référentiels retenus :

- **OWASP ASVS 5.0, niveau 2** (Application Security Verification Standard, mai 2025). Le niveau 2 est celui que l'OWASP recommande pour les applications métier qui traitent des données sensibles. Les salaires, la situation familiale et les numéros CNSS en font partie.
- **Loi n° 29-2019 du 10 octobre 2019** portant protection des données à caractère personnel (République du Congo, Journal officiel n° 45 de 2019).
- **WCAG 2.2, niveau AA** pour l'accessibilité.

Ce document est une **auto-évaluation** faite le 18 octobre 2026, chapitre par chapitre. Ce n'est pas une certification : avant la commercialisation, un audit par un tiers indépendant (test d'intrusion) est recommandé. Chaque mesure marquée « vérifiée » est couverte par un test automatique (`npm test`).

## 1. Synthèse

| Chapitre ASVS 5.0 | État | Points principaux |
|---|---|---|
| V1 Encodage et assainissement | Conforme | Échappement de toute valeur affichée ; requêtes SQL paramétrées ; formules Excel neutralisées |
| V2 Validation et logique métier | Conforme | Validation côté serveur, références vérifiées contre la société ouverte, bornes métier |
| V3 Sécurité du navigateur | Conforme, une réserve | CSP sans script dans les pages ; styles en ligne encore autorisés |
| V4 API et services web | Non applicable | Une seule adresse JSON (recherche), en lecture, derrière la session |
| V5 Fichiers | Conforme | Aucun dépôt de fichier ; téléchargements par nom contrôlé |
| V6 Authentification | **Partiel** | Mots de passe, verrouillage et provisoires conformes ; **pas de double authentification** (écart accepté) |
| V7 Sessions | Conforme | Jeton aléatoire, empreinte seule stockée, inactivité 30 min, durée max 12 h |
| V8 Autorisations | Conforme | Table unique des droits, vérifiée avant chaque page ; cloisonnement par société |
| V9 / V10 Jetons, OAuth | Non applicable | Pas de jeton autoporteur ni de connexion par un tiers |
| V11 Cryptographie | Conforme | scrypt (N=2^17) ; AES-256-GCM pour les sauvegardes ; aléa cryptographique |
| V12 Communications | Conforme | HTTPS intégré, TLS 1.2 minimum, HSTS |
| V13 Configuration | Conforme | Secrets hors du code et du paquet ; une seule dépendance, sans vulnérabilité connue |
| V14 Protection des données | **Partiel** | Pas de cache, exports tracés ; **base non chiffrée sur le disque** (écart accepté) |
| V15 Code et architecture | Conforme | Dépendances minimales, contrôles centralisés, tests automatiques |
| V16 Journalisation et erreurs | Conforme, une réserve | Journal des actions, connexions et consultations ; journal non scellé |
| V17 WebRTC | Non applicable | |

## 2. Détail par chapitre

### V1 Encodage et assainissement
- Toute valeur affichée passe par la fonction d'échappement HTML `e()`. Les paramètres d'adresse ne sont jamais recopiés tels quels : ils sont validés (format) ou remplacés par des codes connus. *Vérifié : injection de script dans `/declarations/imprimer`.*
- Toutes les requêtes SQL sont paramétrées. Deux exceptions maîtrisées : `PRAGMA table_info` reçoit des noms de table fixes écrits dans le code, et `VACUUM INTO` reçoit un chemin construit par le serveur, avec les apostrophes doublées.
- Exports Excel : une cellule qui commence par `=`, `+`, `-` ou `@` est préfixée, pour qu'Excel ne l'exécute pas comme une formule. *Vérifié.*

### V2 Validation et logique métier
- Chaque formulaire est validé côté serveur : dates au format `AAAA-MM-JJ`, nombres finis, bornes (6 mois d'essai au plus, 300 heures supplémentaires par mois au plus, niveaux de catégorie 1 à 20), textes tronqués à une longueur maximale.
- Toute référence reçue (salarié, poste, département, catégorie, absence, bulletin, dotation) est recherchée **avec la société ouverte comme condition**. Un identifiant d'une autre société est ignoré. *Vérifié : poste rattaché à un département d'une autre société, bulletin et fiche d'une autre société.*
- Les corps de requête sont limités à 200 Ko et à 5 000 champs.

### V3 Sécurité du navigateur
- `Content-Security-Policy` : `script-src 'self'`, sans aucun script ni gestionnaire d'événement écrit dans les pages. *Vérifié sur toutes les pages des tests.* Les comportements (envoi automatique, confirmation, impression) sont déclarés par des attributs `data-` et gérés par `app.js`.
- Également envoyés : `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Permissions-Policy`, et `Strict-Transport-Security` en HTTPS.
- Cookie de session : `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS.
- Réserve : `style-src 'unsafe-inline'` reste nécessaire pour les largeurs des graphiques (attributs `style`). Le risque est faible, car aucun script en ligne n'est autorisé.

### V5 Fichiers
- L'application ne reçoit aucun fichier.
- Les sauvegardes ne se téléchargent que par un nom conforme au format attendu, ce qui empêche de remonter dans les dossiers (`../`). Les noms des fichiers exportés sont construits par le serveur.

### V6 Authentification
- Mots de passe :
  - 12 caractères au moins, 128 au plus ;
  - refus des mots de passe courants et de ceux qui contiennent l'adresse e-mail ;
  - aucune règle de composition imposée, conformément à l'ASVS ;
  - les phrases de passe sont encouragées.
- Un mot de passe défini par un administrateur est **provisoire** : il doit être changé à la première connexion. *Vérifié.*
- Le changement de mot de passe exige l'ancien et ferme toutes les autres sessions.
- Protection contre les essais répétés :
  - 8 échecs depuis une même adresse IP la bloquent 15 minutes ;
  - 10 échecs sur un même compte le verrouillent 15 minutes, quelle que soit l'adresse. *Vérifié.*
- Le message d'échec et le temps de calcul sont identiques que le compte existe ou non. Un calcul leurre est fait pour les adresses inconnues. *Vérifié pour le message.*
- **Écart accepté (décision du 18 octobre 2026) : pas de double authentification.** Le niveau 2 de l'ASVS demande une authentification à plusieurs facteurs. Elle est reportée à une version suivante. La piste prévue est un code à 6 chiffres par application (TOTP), sans SMS ni internet.

### V7 Sessions
- Le jeton fait 256 bits, issu de `crypto.randomBytes`. Seule son empreinte SHA-256 est stockée : une copie de la base ne permet pas de reprendre une session.
- À chaque connexion, une nouvelle session est créée et l'ancien jeton est supprimé.
- Une session se ferme :
  - après 30 minutes sans activité, ou au plus tard 12 heures après son ouverture (réglable) *(vérifié)* ;
  - à la déconnexion ;
  - à la désactivation du compte ;
  - au changement ou à la réinitialisation du mot de passe.
- La société ouverte est enregistrée dans la session, côté serveur. Elle n'est plus dans un cookie modifiable. L'accès du compte à cette société est revérifié à chaque requête.
- Jeton anti-falsification (CSRF) :
  - un jeton de 256 bits est propre à chaque session ;
  - il est ajouté automatiquement à chaque formulaire et exigé pour chaque envoi ;
  - avant la connexion, l'en-tête `Origin` doit désigner Smart RH. *Vérifié.*

### V8 Autorisations
- Deux niveaux d'administration (administrateur global, deux au plus ; un administrateur par société) et trois modes d'accès. Une **table unique des droits** (`acces.js`) associe chaque adresse sensible à un droit. Le contrôle a lieu dans le middleware, **avant** que l'écran ne s'exécute, donc un écran qui oublierait sa propre vérification reste protégé.
- Les menus et la recherche n'affichent que ce que le mode d'accès permet, mais la protection ne repose pas sur eux.
- Le cloisonnement entre sociétés est double. D'abord, la société ouverte doit faire partie des sociétés du compte. Ensuite, chaque requête SQL filtre sur cette société.
- Les barèmes des conventions collectives et le modèle national sont **partagés** par toutes les sociétés. Seul l'administrateur global peut les modifier ; un administrateur de société définit des valeurs propres à sa société, dans « Règles de paie ». *Vérifié : un administrateur de société ne peut plus modifier le barème partagé, ce qui était possible en 1.0.*
- Le parcours de chaque mode d'accès est vérifié par les tests : pages autorisées, pages refusées (403), sociétés hors périmètre.

### V11 Cryptographie
- Mots de passe : scrypt avec N=2^17, r=8, p=1 et un sel de 128 bits (recommandation OWASP). Les empreintes de la version 1.0 (N=2^14) sont recalculées automatiquement à la connexion suivante. *Vérifié.* À la connexion, le calcul se fait hors du fil principal.
- Sauvegardes : AES-256-GCM, avec un vecteur aléatoire par fichier. L'étiquette d'authenticité fait détecter toute modification. *Vérifié.*
- Clé de sauvegarde : 256 bits aléatoires, dans un fichier séparé, jamais inclus dans le paquet ni dans les sauvegardes. Seule son empreinte est affichée.
- Comparaisons de secrets à temps constant (`timingSafeEqual`).

### V12 Communications
- HTTPS intégré, avec un certificat créé à l'installation (`npm run certificat`, RSA 3072, valable 3 ans, couvrant le nom et les adresses IP du serveur) et TLS 1.2 au minimum.
- En production, HTTPS est activé par défaut. Au démarrage, un avertissement apparaît si l'application est ouverte au réseau sans HTTPS.
- Le certificat est auto-signé, donc il faut l'approuver sur chaque poste (procédure dans `DEPLOIEMENT.md`). Cela convient à un réseau local ; un accès par internet demande un certificat d'une autorité reconnue.

### V13 Configuration
- Seule dépendance : Express 5. `npm audit` : aucune vulnérabilité connue au 18 octobre 2026.
- Les secrets (clé de sauvegarde, clé TLS, base) ne sont ni dans le code ni dans le paquet livré (`scripts/paquet.js` les exclut), ni dans le dépôt (`.gitignore`).
- Base de démonstration (`npm run demo:preparer`) : comptes créés selon le parcours de production, mots de passe dans un fichier local jamais affiché ni livré. **Provisoirement**, elle propose une entrée directe dans les trois modes d'accès, refusée sur toute base de production. Les anciens comptes de démonstration sans mot de passe sont supprimés au démarrage. *Vérifié.*
- Délais de requête (30 s) et d'en-têtes (15 s) pour limiter les connexions lentes.

### V14 Protection des données
- `Cache-Control: no-store` sur toutes les pages : rien ne reste dans le cache du navigateur d'un poste partagé.
- Seuls les administrateurs (global et de société) peuvent exporter les données personnelles d'un salarié, et l'export est tracé.
- **Écart accepté : la base n'est pas chiffrée sur le disque** (décision du 18 octobre 2026). La chiffrer demanderait un composant natif supplémentaire (SQLCipher). Mesures compensatoires :
  - sauvegardes chiffrées ;
  - session Windows protégée par mot de passe sur le poste serveur ;
  - BitLocker recommandé dans le guide de déploiement.

### V15 Code et architecture
- Les contrôles sont centralisés à un seul endroit chacun :
  - droits ;
  - jeton anti-falsification ;
  - en-têtes ;
  - journal.
- Pas de code exécuté depuis une donnée (`eval`, gabarits dynamiques).
- 200 vérifications automatiques couvrent la paie, les droits, la sécurité et l'affichage.

### V16 Journalisation et erreurs
- Le journal trace, avec l'heure, le compte, la société et l'adresse IP :
  - les modifications ;
  - les connexions, réussies ou refusées ;
  - les verrouillages ;
  - les déconnexions ;
  - les consultations de fiches et de bulletins ;
  - les exports et les téléchargements de sauvegardes.
- Le journal ne contient ni mot de passe ni jeton.
- Aucun écran ne permet de modifier ou d'effacer le journal.
- En cas d'erreur inattendue, l'utilisateur voit un message neutre, sans détail technique ; le détail part dans le journal du serveur (`pm2 logs`).
- Réserve : le journal est dans la base. Une personne qui a accès au fichier sur le serveur pourrait le modifier. Le scellement (chaînage des lignes par empreinte) est une amélioration possible.

## 3. Loi n° 29-2019 sur les données personnelles

Smart RH fournit les moyens techniques suivants. L'**employeur** reste le responsable du traitement.

| Exigence | Ce que fait Smart RH |
|---|---|
| Sécurité et confidentialité | Mesures des chapitres V6 à V14 ci-dessus ; cloisonnement des sociétés ; trois modes d'accès |
| Droit d'accès de la personne | Fiche salarié > **Données personnelles** : fichier complet (identité, contrats, historique, absences, matériel, bulletins) |
| Droit de rectification | Fiche salarié > **Modifier**, avec un avenant tracé dans l'historique |
| Traçabilité | Journal des modifications et des consultations |
| Minimisation | Seules les données utiles à la paie et aux obligations sociales sont demandées |

**Démarches restant à la charge de l'employeur**, à vérifier dans le texte de la loi avec un juriste :
- formalités auprès de l'autorité de protection des données ;
- information des salariés sur le traitement ;
- durées de conservation, compatibles avec les obligations sociales et fiscales de conservation des bulletins ;
- traitement des demandes d'effacement.

## 4. Accessibilité (WCAG 2.2 AA)

Dans **Mon compte > Affichage et accessibilité**, chaque personne règle :
- le thème : clair, sombre ou automatique ;
- la taille du texte : 100, 115 ou 130 % ;
- le contraste : standard ou renforcé ;
- les animations : normales ou réduites ;
- la police : celle de Smart RH ou une police très lisible.

Les réglages sont enregistrés sur le compte et suivent la personne sur tous les postes.

Également en place :
- un lien « Aller au contenu » pour la navigation au clavier ;
- le focus toujours visible ;
- des bulles d'aide accessibles au clavier ;
- des états qui ne reposent jamais sur la couleur seule (icône et libellé) ;
- des couleurs de graphiques choisies pour rester lisibles par les daltoniens ;
- des données des graphiques consultables en tableau.

## 5. Tests

```powershell
npm test         # paie, droits, sécurité, affichage : 200 vérifications
npm run charge   # montée en charge : 200 sociétés, 5 000 salariés, 50 utilisateurs simultanés
npm audit --omit=dev
```
