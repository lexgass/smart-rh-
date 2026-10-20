// Vérifie le moteur ITS sur les trois exemples chiffrés publiés par Congo Paie (barème 2026).
// Lancer avec : node test-paie.js
process.env.SMART_RH_DB = ':memory:';
const assert = require('node:assert');
const { its } = require('../paie');

const cas = [
  // [brut mensuel, parts, ITS annuel attendu]
  [90000, 1, 22600],
  [350000, 3, 141600],
  [1200000, 3.5, 1185300],
];
for (const [brut, parts, attendu] of cas) {
  const cnss = Math.round(Math.min(brut, 1200000) * 0.04);
  const r = its(brut - cnss, parts, 1, '2026-10-28');
  assert.strictEqual(r.annuel, attendu, `brut ${brut}, ${parts} part(s) : obtenu ${r.annuel}, attendu ${attendu}`);
  console.log(`OK  brut ${brut} FCFA, ${parts} part(s) -> ITS ${r.annuel} FCFA par an`);
}
