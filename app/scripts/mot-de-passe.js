// Secours : définit un nouveau mot de passe pour un compte, depuis le poste qui héberge Smart RH.
// Usage : node scripts/mot-de-passe.js adresse@email.cg "nouveau mot de passe"
// (à lancer dans le dossier de Smart RH, avec les mêmes variables SMART_RH_DB que le service si la base a été déplacée)
const { run, get } = require('../db');
const { hacher, motDePasseRefuse } = require('../auth');

const [, , email, mdp] = process.argv;
if (!email || !mdp) { console.log('Usage : node scripts/mot-de-passe.js adresse@email.cg "nouveau mot de passe"'); process.exit(1); }
const refus = motDePasseRefuse(mdp, email);
if (refus) { console.log(`Mot de passe refusé (${refus}) : 12 caractères au moins, pas un mot de passe courant, sans l'adresse e-mail.`); process.exit(1); }
const u = get('SELECT id, nom FROM utilisateurs WHERE email=? AND demo=0', email.trim().toLowerCase());
if (!u) { console.log(`Aucun compte avec l'adresse ${email}.`); process.exit(1); }
run('UPDATE utilisateurs SET mot_de_passe=?, actif=1, echecs=0, bloque_jusqua=NULL WHERE id=?', hacher(mdp), u.id);
run('DELETE FROM sessions WHERE utilisateur_id=?', u.id);
console.log(`Mot de passe de ${u.nom} modifié. Le compte est actif ; ses anciennes sessions sont fermées.`);
