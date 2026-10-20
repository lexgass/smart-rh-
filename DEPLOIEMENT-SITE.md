# Mettre en ligne le site vitrine Smart RH (serveur Apache)

Le site (`site/`) est fait de pages statiques : pas de base de données, pas de PHP. Il suffit d'un **hébergement mutualisé** qui fonctionne avec Apache ou qui lit les fichiers `.htaccess` (LiteSpeed le fait aussi). Un serveur dédié ou un VPS n'est pas nécessaire.

## 1. Choisir l'hébergeur et le nom de domaine

Les prix relevés en 2026 sont des prix d'appel, souvent avec un engagement de 12 à 48 mois. Ils peuvent doubler au renouvellement, donc vérifiez le prix à la deuxième année.

| Hébergeur | Prix indicatif | À retenir |
|---|---|---|
| o2switch | de 1,86 à 7 € HT par mois selon les sources | offre unique illimitée, prix annoncé stable, en France |
| OVHcloud (offre mutualisée) | à partir de 1,59 à 3,29 € HT par mois | Apache, grand choix de noms de domaine |
| Hostinger | 2,99 € HT par mois en promotion | moins cher à l'entrée, renouvellement nettement plus cher |
| Infomaniak | environ 5,75 € HT par mois | certificat HTTPS et sauvegardes inclus |

Avant d'acheter, vérifiez que l'offre inclut le **certificat HTTPS gratuit (Let's Encrypt)** et l'**accès FTP ou SFTP**.

**Nom de domaine** : `.com` chez l'hébergeur, ou `.cg` auprès du registre congolais (NIC Congo) ou d'un revendeur.

## 2. Remplir les coordonnées

Ouvrez `site/config.js` et renseignez :
- le téléphone et le numéro WhatsApp ;
- l'e-mail et l'adresse ;
- le lien de votre page Cal.com ;
- les liens YouTube des deux vidéos.

Dans `site/mentions-legales.html`, remplacez les éléments entre crochets : société, RCCM, NIU et hébergeur.

## 3. Envoyer les fichiers

1. Dans l'espace client de l'hébergeur, **activez le certificat HTTPS** du domaine.
2. Installez **FileZilla**, gratuit, et connectez-vous avec les identifiants FTP ou SFTP fournis par l'hébergeur.
3. Ouvrez le dossier racine du site, en général `www/` ou `public_html/`.
4. Envoyez **tout le contenu** du dossier `site/` :
   - `index.html` ;
   - `mentions-legales.html` ;
   - `style.css`, `config.js` et `site.js` ;
   - les dossiers `img/` et `fonts/` ;
   - et le fichier **`.htaccess`**. C'est un fichier caché : dans FileZilla, menu Serveur > Forcer l'affichage des fichiers cachés.

## 4. Vérifier

- `http://votre-domaine` redirige vers `https://votre-domaine`.
- La page s'affiche avec les bonnes polices et le logo.
- « Choisir un créneau » ouvre Cal.com, et « WhatsApp » ouvre la conversation.
- Plus aucun bouton n'est entouré de pointillés rouges. Ces pointillés signalent un lien non rempli dans `config.js`.
- Sur un téléphone, la page s'affiche sans défilement de côté, sauf le tableau des prix.

## Le fichier `.htaccess`

Il est lu par Apache. Il :
- impose le HTTPS ;
- ajoute les en-têtes de sécurité ;
- compresse les pages ;
- règle le cache des images et des polices ;
- interdit l'affichage du contenu des dossiers.

Chaque réglage est ignoré si le module Apache correspondant n'est pas disponible chez l'hébergeur, donc il ne peut pas bloquer le site.

## Mettre à jour le site

Modifiez les fichiers dans `site/`, puis renvoyez uniquement les fichiers modifiés par FileZilla. Les changements sont visibles immédiatement.
