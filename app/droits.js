// Droits d'un salarié selon sa convention collective : essai, préavis, congés, indemnité de licenciement.
const { all, get } = require('./db');
const paie = require('./paie');
const { iso, jour, joursOuvrables } = require('./calendrier');

const bareme = (conv, type) => all('SELECT * FROM convention_baremes WHERE convention=? AND type=? ORDER BY borne_min', conv, type);
// ligne de barème dont la plage contient x (niveau de catégorie : bornes incluses)
const ligneNiveau = (conv, type, niveau) => bareme(conv, type).find((b) => niveau >= b.borne_min && niveau <= b.borne_max) || null;

function moisEntre(debut, fin) {
  const a = jour(debut), b = jour(fin);
  let n = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  if (b.getDate() < a.getDate()) n--;
  return Math.max(0, n);
}

function essai(societeId, niveau) {
  const l = ligneNiveau(paie.conventionDe(societeId), 'essai', niveau);
  return l ? { mois: l.valeur, source: l.source, libelle: l.libelle } : { mois: 1, source: 'Code du travail, art. 35 : 6 mois au plus, renouvellement compris', libelle: 'Valeur par défaut' };
}

function preavis(societeId, niveau) {
  const l = ligneNiveau(paie.conventionDe(societeId), 'preavis', niveau);
  if (!l) return { texte: 'À renseigner', source: 'Code du travail, art. 39 : fixé par la convention ou par arrêté', manquant: true };
  if (l.valeur == null) return { texte: 'À renseigner', source: l.source, libelle: l.libelle, manquant: true };
  return { valeur: l.valeur, unite: l.unite, texte: `${String(l.valeur).replace('.', ',')} ${l.unite}`, source: l.source, libelle: l.libelle };
}

// congés annuels : 26 jours ouvrables (paramètre) + supplément d'ancienneté de la convention
function congesAnnuels(societeId, ans, date) {
  const base = paie.param('CONGES_AN', societeId, date) ?? 26;
  const sup = bareme(paie.conventionDe(societeId), 'conges').filter((b) => ans >= b.borne_min).pop();
  return { base, supplement: sup ? sup.valeur : 0, total: base + (sup ? sup.valeur : 0), source: sup ? sup.source : null };
}

// salaire mensuel moyen : moyenne des bruts des 12 derniers bulletins, sinon salaire du contrat hors transport
function salaireMoyen(salarieId, contrat) {
  const b = all('SELECT brut FROM bulletins WHERE salarie_id=? ORDER BY periode DESC LIMIT 12', salarieId);
  if (b.length) return { montant: Math.round(b.reduce((a, x) => a + x.brut, 0) / b.length), source: `moyenne de ${b.length} bulletin${b.length > 1 ? 's' : ''}` };
  return { montant: (contrat.salaire_base || 0) + (contrat.sursalaire || 0), source: 'salaire du contrat (aucun bulletin calculé)' };
}

// estimation de l'indemnité de licenciement si la rupture intervenait à la date donnée (hors faute lourde)
function indemnite(salarie, contrat, date) {
  const sid = salarie.societe_id, conv = paie.conventionDe(sid);
  const tranches = bareme(conv, 'indemnite');
  const mois = moisEntre(salarie.date_embauche, date), ans = mois / 12;
  const min = paie.param('IND_MIN_MOIS', sid, date);
  if (!tranches.length) return { texte: 'Non prévue par la convention enregistrée', montant: null, mois };
  if (min != null && mois < min) return { texte: `Pas encore due (${min} mois d'ancienneté requis)`, montant: 0, mois };
  if (contrat.type === 'CDD') return { texte: 'Non due à l\'échéance d\'un CDD', montant: 0, mois };
  const sm = salaireMoyen(salarie.id, contrat);
  let total = 0;
  for (const t of tranches) {
    const annees = Math.max(0, Math.min(ans, t.borne_max) - t.borne_min);
    total += t.unite === '%' ? annees * sm.montant * t.valeur / 100 : annees * sm.montant * t.valeur;
  }
  const plafond = paie.param('IND_PLAFOND_MOIS', sid, date);
  if (plafond != null) total = Math.min(total, plafond * sm.montant);
  return { montant: Math.round(total), texte: null, mois, salaireMoyen: sm, source: tranches[0].source };
}

// période de référence des congés : 12 mois à partir de la date anniversaire d'embauche
function soldeConges(salarie, date) {
  const sid = salarie.societe_id;
  const mois = moisEntre(salarie.date_embauche, date);
  const debutPeriode = jour(salarie.date_embauche); debutPeriode.setFullYear(debutPeriode.getFullYear() + Math.floor(mois / 12));
  const debut = iso(debutPeriode);
  const ans = Math.floor(mois / 12);
  const droitsAnnuels = congesAnnuels(sid, Math.max(0, ans - 1), date);
  const acquisPrecedente = ans >= 1 ? droitsAnnuels.total : 0;
  const enCours = Math.round((mois % 12) * (congesAnnuels(sid, ans, date).total / 12) * 10) / 10;
  const pris = all("SELECT date_debut, date_fin FROM conges WHERE salarie_id=? AND type='conge_paye' AND statut='valide' AND date_fin>=?", salarie.id, debut)
    .reduce((n, c) => n + joursOuvrables(c.date_debut > debut ? c.date_debut : debut, c.date_fin), 0);
  const ouvertLe = (() => { const d = jour(salarie.date_embauche); d.setFullYear(d.getFullYear() + 1); return iso(d); })();
  return { disponible: acquisPrecedente - pris, acquisPrecedente, pris, enCours, debutPeriode: debut, ouvert: ans >= 1, ouvertLe, annuels: congesAnnuels(sid, ans, date) };
}

module.exports = { bareme, essai, preavis, congesAnnuels, indemnite, soldeConges, salaireMoyen, moisEntre };
