// Passage d'une base 1.0 (rôles cabinet / admin / rh) aux trois modes d'accès.
// Usage : node tests/migration.js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const mode = process.argv[2];
if (!mode) {
  // le script se relance lui-même dans un processus neuf par cas (les modules gardent la base ouverte)
  for (const m of ['production']) process.stdout.write(execFileSync(process.execPath, ['--no-warnings', __filename, m], { encoding: 'utf8' }));
  process.exit();
}

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-rh-migration-'));
const base = path.join(dossier, 'v10.db');
// base au format 1.0 : comptes réels et, en démonstration, anciens comptes de démonstration
const v10 = new DatabaseSync(base);
v10.exec(`CREATE TABLE societes(id INTEGER PRIMARY KEY, nom TEXT, ville TEXT, convention TEXT, niu TEXT, rccm TEXT, cnss_employeur TEXT);
INSERT INTO societes(nom, ville, convention) VALUES ('Alpha', 'Brazzaville', 'Commerce'), ('Beta', 'Pointe-Noire', 'Commerce');
CREATE TABLE utilisateurs(id INTEGER PRIMARY KEY, email TEXT UNIQUE, nom TEXT, mot_de_passe TEXT, role TEXT, societe_id INTEGER, actif INTEGER DEFAULT 1, cree_le TEXT, derniere_connexion TEXT, demo INTEGER DEFAULT 0);
INSERT INTO utilisateurs(email, nom, mot_de_passe, role, societe_id, demo) VALUES
  ('cabinet@test.cg', 'Cabinet', 'x', 'cabinet', NULL, 0), ('chef@alpha.cg', 'Chef Alpha', 'x', 'admin', 1, 0), ('agent@beta.cg', 'Agent Beta', 'x', 'rh', 2, 0),
  ('demo.cabinet@smart-rh.local', 'Cabinet démo', 'x', 'cabinet', NULL, 1), ('demo.admin@smart-rh.local', 'Admin démo', 'x', 'admin', 1, 1), ('demo.rh@smart-rh.local', 'RH démo', 'x', 'rh', 1, 1);`);
v10.close();
Object.assign(process.env, { SMART_RH_DB: base, SMART_RH_SAUVEGARDES: path.join(dossier, 'sauvegardes') });

let n = 0;
const ok = (c, m) => { assert.ok(c, `${mode} : ${m}`); n++; };
require('../server');
const { get, all, db } = require('../db');
const role = (email) => get('SELECT role FROM utilisateurs WHERE email=?', email)?.role;
ok(role('cabinet@test.cg') === 'admin', 'gestionnaire cabinet → Admin');
ok(role('chef@alpha.cg') === 'societe' && get("SELECT societe_id FROM utilisateurs WHERE email='chef@alpha.cg'").societe_id === 1, 'administrateur société → Société, même société');
ok(role('agent@beta.cg') === 'utilisateur' && all("SELECT x.societe_id FROM utilisateur_societes x JOIN utilisateurs u ON u.id=x.utilisateur_id WHERE u.email='agent@beta.cg'").map((x) => x.societe_id).join() === '2', 'gestionnaire RH → Utilisateur, rattaché à sa société');
// un second démarrage ne doit rien convertir de nouveau
require('../acces').migrer();
ok(role('cabinet@test.cg') === 'admin' && role('chef@alpha.cg') === 'societe', 'migration jouée une seule fois');
ok(!get('SELECT id FROM utilisateurs WHERE demo=1'), 'anciens comptes de démonstration (sans mot de passe utilisable) retirés');
db.close();
try { fs.rmSync(dossier, { recursive: true, force: true }); } catch { /* nettoyé par le système */ }
console.log(`OK  ${n} vérifications réussies (migration 1.0 → 1.1, ${mode})`);
process.exit();
