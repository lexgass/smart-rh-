// Calendrier du Congo-Brazzaville : jours fériés et décompte des jours ouvrables (lundi au samedi, hors fériés).
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const jour = (s) => { const [a, m, j] = s.split('-').map(Number); return new Date(a, m - 1, j); };

// dimanche de Pâques (algorithme de Meeus/Jones/Butcher)
function paques(a) {
  const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((c + 8) / 25), h = Math.floor((c - g + 1) / 3);
  const i = (19 * b + c - e - h + 15) % 30, k = Math.floor(d / 4), l = d % 4, m = (32 + 2 * f + 2 * k - i - l) % 7, n = Math.floor((b + 11 * i + 22 * m) / 451);
  const mois = Math.floor((i + m - 7 * n + 114) / 31), j = ((i + m - 7 * n + 114) % 31) + 1;
  return new Date(a, mois - 1, j);
}
const decale = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function feries(annee) {
  const p = paques(annee);
  return new Map([
    [`${annee}-01-01`, 'Jour de l\'an'], [iso(decale(p, 1)), 'Lundi de Pâques'], [`${annee}-05-01`, 'Fête du travail'],
    [iso(decale(p, 39)), 'Ascension'], [iso(decale(p, 50)), 'Lundi de Pentecôte'], [`${annee}-06-10`, 'Fête de la réconciliation'],
    [`${annee}-08-15`, 'Fête de l\'indépendance'], [`${annee}-11-01`, 'Toussaint'], [`${annee}-11-28`, 'Proclamation de la République'], [`${annee}-12-25`, 'Noël'],
  ]);
}
const cache = new Map();
const ferie = (s) => { const a = Number(s.slice(0, 4)); if (!cache.has(a)) cache.set(a, feries(a)); return cache.get(a).get(s) || null; };

// jours ouvrables entre deux dates incluses
function joursOuvrables(debut, fin) {
  let n = 0;
  for (let d = jour(debut); iso(d) <= fin; d = decale(d, 1)) if (d.getDay() !== 0 && !ferie(iso(d))) n++;
  return n;
}
// jours ouvrables d'une absence compris dans un mois 'AAAA-MM'
function joursDansMois(debut, fin, periode) {
  const d1 = `${periode}-01`, d2 = iso(new Date(Number(periode.slice(0, 4)), Number(periode.slice(5, 7)), 0));
  const a = debut > d1 ? debut : d1, b = fin < d2 ? fin : d2;
  return a <= b ? joursOuvrables(a, b) : 0;
}

module.exports = { iso, jour, decale, ferie, feries, joursOuvrables, joursDansMois };
