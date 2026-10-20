// Moteur de paie : aucune valeur légale n'est écrite ici, tout vient des paramètres datés et des rubriques.
const { all, get, run, transaction } = require('./db');
require('./migrations');
const { joursDansMois } = require('./calendrier');

const conventionDe = (societeId) => get('SELECT convention_code c FROM societes WHERE id=?', societeId)?.c || null;

// Valeur d'un paramètre à une date. Priorité : la société, puis sa convention collective, puis le modèle pays ; la version la plus récente gagne.
function param(code, societeId, date) {
  const conv = conventionDe(societeId);
  const r = get(`SELECT valeur FROM parametres WHERE code=? AND date_debut<=?
                   AND (societe_id=? OR (societe_id IS NULL AND (convention IS NULL OR convention=?)))
                 ORDER BY CASE WHEN societe_id IS NOT NULL THEN 0 WHEN convention IS NOT NULL THEN 1 ELSE 2 END, date_debut DESC LIMIT 1`, code, date, societeId, conv);
  return r ? r.valeur : null;
}

// Taux de la prime d'ancienneté selon les paramètres de la convention (départ, pas, second pas, palier final, plafond)
function tauxAnciennete(ans, societeId, date) {
  const P = (c) => param(c, societeId, date);
  const debut = P('ANC_DEBUT_ANS') ?? 2;
  if (ans < debut) return 0;
  const seuil2 = P('ANC_SEUIL2'), pas2 = P('ANC_PAS2');
  let taux = (P('ANC_TAUX_DEBUT') ?? 0) + (Math.min(ans, seuil2 ?? Infinity) - debut) * (P('ANC_PAS') ?? 0);
  if (seuil2 != null && pas2 != null && ans > seuil2) taux += (ans - seuil2) * pas2;
  taux = Math.min(taux, P('ANC_PLAFOND') ?? 100);
  const palier = P('ANC_PALIER_ANS');
  if (palier != null && ans >= palier) taux = Math.max(taux, P('ANC_PALIER_TAUX') ?? taux);
  return taux;
}

function partsFiscales(salarie, societeId, date) {
  if (!param('ITS_QUOTIENT', societeId, date)) return 1;
  const marie = /^mari/i.test(salarie.situation || '');
  const n = salarie.enfants || 0;
  const parts = marie ? 2 + 0.5 * n : (n > 0 ? 2 + 0.5 * (n - 1) : 1);
  return Math.min(parts, param('ITS_PARTS_MAX', societeId, date) || parts);
}

// ITS mensuel à partir de la base mensuelle (imposable moins retraite CNSS)
function its(baseMensuelle, parts, societeId, date) {
  const version = get('SELECT MAX(date_debut) d FROM tranches_its WHERE date_debut<=?', date).d;
  if (!version || baseMensuelle <= 0) return { montant: 0, netImposable: 0 };
  const tranches = all('SELECT * FROM tranches_its WHERE date_debut=? ORDER BY (borne_sup IS NULL), borne_sup', version);
  const abattement = param('ITS_ABATTEMENT', societeId, date) || 0;
  const netImposable = Math.floor(baseMensuelle * 12 * (1 - abattement / 100) / 1000) * 1000;
  const quotient = netImposable / parts;
  let impot = 0, bas = 0;
  for (const t of tranches) {
    const haut = t.borne_sup ?? Infinity;
    if (quotient > bas) impot += t.forfait + (Math.min(quotient, haut) - bas) * t.taux / 100;
    bas = haut;
  }
  return { montant: Math.round(impot * parts / 12), annuel: Math.round(impot * parts), netImposable };
}

function anneesEntre(debut, fin) {
  const a = new Date(debut), b = new Date(fin);
  let n = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) n--;
  return Math.max(0, n);
}

// types d'heures supplémentaires : paramètre de majoration et libellé du bulletin
const HEURES = {
  hs1: ['HS_MAJ_1', 'Heures supplémentaires +10 %'],
  hs2: ['HS_MAJ_2', 'Heures supplémentaires +25 %'],
  hs_nuit: ['HS_MAJ_NUIT', 'Heures supplémentaires de nuit +50 %'],
  hs_repos: ['HS_MAJ_REPOS', 'Heures supplémentaires repos ou férié +50 %'],
  hs_nuit_repos: ['HS_MAJ_NUIT_REPOS', 'Heures supplémentaires nuit, repos ou férié +100 %'],
};

// Calcule un bulletin sans l'enregistrer. periode = 'AAAA-MM'.
function calculer(salarie, contrat, periode) {
  const sid = salarie.societe_id;
  const date = `${periode}-28`;
  const P = (c) => (c ? param(c, sid, date) : null);
  const rubriques = all('SELECT * FROM rubriques WHERE societe_id=? AND actif=1 ORDER BY ordre', sid);
  const lignes = [];
  const t = { brut: 0, cotisable: 0, imposable: 0, retenues: 0, patronal: 0, cnssSal: 0 };
  const parts = partsFiscales(salarie, sid, date);

  for (const r of rubriques.filter((x) => x.sens === 'gain')) {
    let base = null, taux = null, montant = 0;
    if (r.mode === 'contrat') montant = contrat[r.assiette] || 0;
    else if (r.mode === 'anciennete') {
      taux = tauxAnciennete(anneesEntre(salarie.date_embauche, date), sid, date);
      if (taux) { base = contrat.salaire_base; montant = Math.round(base * taux / 100); }
    }
    if (!montant) continue;
    t.brut += montant; if (r.cotisable) t.cotisable += montant; if (r.imposable) t.imposable += montant;
    lignes.push({ ...r, base, taux, montant });
  }

  // éléments variables du mois : heures supplémentaires et primes ponctuelles
  const tauxHoraire = ((contrat.salaire_base || 0) + (contrat.sursalaire || 0)) / (P('HEURES_MOIS') || 173.33);
  for (const v of all('SELECT * FROM variables WHERE salarie_id=? AND periode=? ORDER BY id', salarie.id, periode)) {
    let montant, base = null, taux = null, libelle = v.libelle;
    if (HEURES[v.type]) {
      if (!v.quantite) continue;
      taux = P(HEURES[v.type][0]) ?? 0; base = Math.round(tauxHoraire);
      montant = Math.round(v.quantite * tauxHoraire * (1 + taux / 100));
      libelle = `${HEURES[v.type][1]} (${String(v.quantite).replace('.', ',')} h)`;
    } else { montant = Math.round(v.montant || 0); if (!montant) continue; }
    t.brut += montant; t.cotisable += montant; t.imposable += montant;
    lignes.push({ code: v.type.toUpperCase(), libelle, sens: 'gain', base, taux, montant, ordre: 45 });
  }

  // absences non rémunérées validées : retenue de 1/26 du salaire mensuel par jour ouvrable
  const jours = all("SELECT date_debut, date_fin FROM conges WHERE salarie_id=? AND type='sans_solde' AND statut='valide'", salarie.id)
    .reduce((n, a) => n + joursDansMois(a.date_debut, a.date_fin, periode), 0);
  if (jours) {
    const base = (contrat.salaire_base || 0) + (contrat.sursalaire || 0);
    const montant = -Math.round(base / 26 * jours);
    t.brut += montant; t.cotisable += montant; t.imposable += montant;
    lignes.push({ code: 'ABSENCE', libelle: `Absence non rémunérée (${jours} jour${jours > 1 ? 's' : ''} ouvrable${jours > 1 ? 's' : ''})`, sens: 'gain', base, taux: null, montant, ordre: 50 });
  }

  const assiette = (r) => {
    if (r.assiette === 'BRUT') return t.brut;
    if (r.assiette === 'COTISABLE') return t.cotisable;
    if (r.assiette === 'IMPOSABLE_NET') return t.imposable - t.cnssSal;
    return 0;
  };
  for (const r of rubriques.filter((x) => x.sens !== 'gain')) {
    let base = null, taux = null, montant = 0;
    if (r.mode === 'taux') {
      base = assiette(r);
      const plafond = P(r.plafond_param), seuil = P(r.seuil_param);
      if (plafond != null) base = Math.min(base, plafond);
      if (seuil != null) base = Math.max(0, base - seuil);
      taux = P(r.taux_param) || 0; montant = Math.round(base * taux / 100);
    } else if (r.mode === 'fixe') montant = P(r.montant_param) || 0;
    else if (r.mode === 'its') {
      base = assiette(r); montant = its(base, parts, sid, date).montant;
    }
    if (r.code === 'CNSS_SAL') t.cnssSal = montant;
    if (!montant) continue;
    if (r.sens === 'retenue') t.retenues += montant; else t.patronal += montant;
    lignes.push({ ...r, base, taux, montant });
  }
  return { lignes, parts, ...t, net: t.brut - t.retenues, cout: t.brut + t.patronal };
}

function enregistrer(salarie, contrat, periode) {
  const b = calculer(salarie, contrat, periode);
  const ancien = get('SELECT id FROM bulletins WHERE salarie_id=? AND periode=?', salarie.id, periode);
  if (ancien) { run('DELETE FROM bulletin_lignes WHERE bulletin_id=?', ancien.id); run('DELETE FROM bulletins WHERE id=?', ancien.id); }
  const id = run('INSERT INTO bulletins(salarie_id,periode,brut,cotisable,imposable,retenues,net,patronal,parts,calcule_le) VALUES(?,?,?,?,?,?,?,?,?,?)',
    salarie.id, periode, b.brut, b.cotisable, b.imposable, b.retenues, b.net, b.patronal, b.parts, new Date().toISOString()).lastInsertRowid;
  for (const l of b.lignes) run('INSERT INTO bulletin_lignes(bulletin_id,code,libelle,sens,base,taux,montant,ordre) VALUES(?,?,?,?,?,?,?,?)', id, l.code, l.libelle, l.sens, l.base, l.taux, l.montant, l.ordre);
  return Number(id);
}

// paie de toute la société pour un mois : une seule transaction (rapide, et rien n'est enregistré à moitié en cas d'erreur)
function calculerSociete(societeId, periode) {
  return transaction(() => {
    let n = 0;
    for (const s of all("SELECT * FROM salaries WHERE societe_id=? AND statut='Actif' AND date_embauche<=?", societeId, `${periode}-31`)) {
      const c = get('SELECT * FROM contrats WHERE salarie_id=? ORDER BY date_debut DESC LIMIT 1', s.id);
      if (c && (!c.date_fin || c.date_fin >= `${periode}-01`)) { enregistrer(s, c, periode); n++; }
    }
    return n;
  });
}

module.exports = { HEURES, param, partsFiscales, its, calculer, enregistrer, calculerSociete, anneesEntre, tauxAnciennete, conventionDe };
