// Déclarations : bordereau CNSS, état mensuel ITS / TUS / TOL / CAMU, déclaration annuelle des salaires (DAS). Export Excel (CSV).
const { all, get } = require('./db');
const paie = require('./paie');
const logo = require('./logo');

module.exports = (app, h) => {
  const { e, fcfa, nb, dateFr, aujourdhui, MOIS, page, carte, tableau, kpi, aide, ic, imprimable } = h;
  const moisFr = (p) => `${MOIS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
  const echeanceDe = (p) => { const d = new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)), p.slice(5, 7) === '07' ? 20 : 15); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // une ligne par bulletin, avec les montants de chaque rubrique (base et montant)
  function etat(societeId, periode) {
    const bul = all(`SELECT b.*, e.nom, e.prenom, e.matricule, e.num_cnss FROM bulletins b JOIN salaries e ON e.id=b.salarie_id WHERE e.societe_id=? AND b.periode=? ORDER BY e.nom`, societeId, periode);
    for (const b of bul) {
      b.r = {};
      for (const l of all('SELECT code, base, montant FROM bulletin_lignes WHERE bulletin_id=?', b.id)) b.r[l.code] = l;
    }
    return bul;
  }
  const m = (b, code) => b.r[code]?.montant || 0;
  const base = (b, code) => b.r[code]?.base || 0;
  const somme = (liste, f) => liste.reduce((a, x) => a + f(x), 0);

  function lignesCnss(bul) {
    return bul.map((b) => ({ b, ret: base(b, 'CNSS_SAL') || base(b, 'CNSS_PAT'), retSal: m(b, 'CNSS_SAL'), retPat: m(b, 'CNSS_PAT'), pf: base(b, 'CNSS_PF'), pfM: m(b, 'CNSS_PF'), at: m(b, 'CNSS_AT') }))
      .map((x) => ({ ...x, total: x.retSal + x.retPat + x.pfM + x.at }));
  }

  app.get('/declarations', (req, res) => {
    const sid = req.societe.id, j = aujourdhui();
    const onglet = ['cnss', 'impots', 'annuel'].includes(req.query.onglet) ? req.query.onglet : 'cnss';
    const periodes = all('SELECT DISTINCT b.periode FROM bulletins b JOIN salaries e ON e.id=b.salarie_id WHERE e.societe_id=? ORDER BY b.periode DESC', sid).map((x) => x.periode);
    const periode = periodes.includes(req.query.periode) ? req.query.periode : periodes[0];
    const annee = /^\d{4}$/.test(req.query.annee || '') ? req.query.annee : (periode || j).slice(0, 4);
    const date = periode ? `${periode}-28` : j;
    const tusCnss = paie.param('TUS_PART_CNSS', sid, date), tusDgi = paie.param('TUS_PART_DGI', sid, date);
    const effectif = get("SELECT COUNT(*) n FROM salaries WHERE societe_id=? AND statut='Actif'", sid).n;

    const onglets = [['cnss', 'Bordereau CNSS'], ['impots', 'Impôts et taxes (DGI)'], ['annuel', 'Déclaration annuelle (DAS)']];
    const nav = `<nav class="onglets" aria-label="Déclarations">${onglets.map(([k, t]) => `<a href="/declarations?onglet=${k}${periode ? `&periode=${periode}` : ''}"${onglet === k ? ' class="actif" aria-current="page"' : ''}>${t}</a>`).join('')}</nav>`;
    const choixPeriode = periodes.length ? `<form method="get" action="/declarations" class="barre-outils periode"><input type="hidden" name="onglet" value="${onglet}">${onglet === 'annuel'
      ? `<label class="en-ligne">${ic('agenda')}Année<select name="annee" data-envoi-auto>${[...new Set(periodes.map((p) => p.slice(0, 4)))].map((a) => `<option${a === annee ? ' selected' : ''}>${a}</option>`).join('')}</select></label>`
      : `<label class="en-ligne">${ic('agenda')}Mois de paie<select name="periode" data-envoi-auto>${periodes.map((p) => `<option value="${p}"${p === periode ? ' selected' : ''}>${moisFr(p)}</option>`).join('')}</select></label>`}
      <noscript><button class="bouton secondaire">Afficher</button></noscript></form>` : '';
    if (!periodes.length) return res.send(page(req, { titre: 'Déclarations' }, `${nav}${carte('', '<div class="etat-vide">Aucune paie calculée. Les déclarations sont établies à partir des bulletins. <a href="/paie">Calculer la paie</a></div>')}`));

    const exporter = (type) => `<a class="bouton secondaire" href="/declarations/export?type=${type}&periode=${periode}&annee=${annee}">${ic('telecharger')}Exporter pour Excel</a>`;
    const imprimer = (type) => `<a class="bouton fantome" href="/declarations/imprimer?type=${type}&periode=${periode}&annee=${annee}">${ic('imprimer')}Version imprimable</a>`;
    let contenu = '';

    if (onglet === 'cnss') {
      const L = lignesCnss(etat(sid, periode));
      const tus = Math.round(somme(L, (x) => x.b.brut) * (tusCnss || 0) / 100);
      const total = somme(L, (x) => x.total);
      contenu = `<div class="kpis">
        ${kpi('equipe', L.length, 'salariés déclarés')}
        ${kpi('paie', `${fcfa(total)} <small>FCFA</small>`, 'cotisations CNSS', 'Retraite (parts salarié et employeur), prestations familiales et accidents du travail.')}
        ${kpi('societe', `${fcfa(tus)} <small>FCFA</small>`, `part CNSS de la taxe unique (${nb(tusCnss)} %)`, 'Depuis la loi de finances 2026, la taxe unique sur les salaires est recouvrée en partie par la CNSS.')}
        ${kpi('agenda', dateFr(echeanceDe(periode)), 'date limite de dépôt et de paiement', effectif > 20 ? 'Déclaration mensuelle (plus de 20 salariés).' : 'Avec 20 salariés ou moins, le bordereau peut être trimestriel : à confirmer auprès de la CNSS.', 'jaune')}
      </div>
      ${carte(`Bordereau de cotisations, ${moisFr(periode)}${aide('Assiettes plafonnées : 1 200 000 FCFA pour la retraite, 600 000 FCFA pour les prestations familiales et les accidents du travail.')}`, tableau(['Salarié', 'N° CNSS', '+Brut', '+Base retraite', '+Retraite salarié', '+Retraite employeur', '+Base PF et AT', '+Prest. familiales', '+Acc. du travail', '+Total'],
        L.map((x) => `<tr><td>${e(x.b.prenom)} ${e(x.b.nom)}</td><td class="${x.b.num_cnss ? '' : 'manquant'}">${x.b.num_cnss ? e(x.b.num_cnss) : '<span class="et rouge" data-bulle="Numéro CNSS manquant : à renseigner dans la fiche salarié avant le dépôt." tabindex="0">Manquant</span>'}</td><td class="n">${fcfa(x.b.brut)}</td><td class="n">${fcfa(x.ret)}</td><td class="n">${fcfa(x.retSal)}</td><td class="n">${fcfa(x.retPat)}</td><td class="n">${fcfa(x.pf)}</td><td class="n">${fcfa(x.pfM)}</td><td class="n">${fcfa(x.at)}</td><td class="n"><b>${fcfa(x.total)}</b></td></tr>`)
          .concat([`<tr class="total"><td>Total</td><td></td><td class="n">${fcfa(somme(L, (x) => x.b.brut))}</td><td class="n">${fcfa(somme(L, (x) => x.ret))}</td><td class="n">${fcfa(somme(L, (x) => x.retSal))}</td><td class="n">${fcfa(somme(L, (x) => x.retPat))}</td><td class="n">${fcfa(somme(L, (x) => x.pf))}</td><td class="n">${fcfa(somme(L, (x) => x.pfM))}</td><td class="n">${fcfa(somme(L, (x) => x.at))}</td><td class="n">${fcfa(total)}</td></tr>`])), { outil: `<div class="outils-carte">${imprimer('cnss')}${exporter('cnss')}</div>` })}`;
    } else if (onglet === 'impots') {
      const B = etat(sid, periode);
      const its = somme(B, (b) => m(b, 'ITS')), tol = somme(B, (b) => m(b, 'TOL')), sol = somme(B, (b) => m(b, 'CAMU_SOL'));
      const tusDgiM = Math.round(somme(B, (b) => b.brut) * (tusDgi || 0) / 100);
      const camu = somme(B, (b) => m(b, 'CAMU_SAL') + m(b, 'CAMU_PAT'));
      contenu = `<div class="kpis">
        ${kpi('paie', `${fcfa(its)} <small>FCFA</small>`, 'impôt sur les salaires retenu', 'ITS retenu à la source sur les salaires du mois, à reverser à la DGI.')}
        ${kpi('societe', `${fcfa(tusDgiM)} <small>FCFA</small>`, `part DGI de la taxe unique (${nb(tusDgi)} %)`, 'Le reste de la taxe unique est versé à la CNSS (onglet Bordereau CNSS).')}
        ${kpi('equipe', `${fcfa(tol + sol)} <small>FCFA</small>`, 'TOL et solidarité CAMU', 'Taxe d\'occupation des locaux et contribution de solidarité CAMU retenues sur les salaires.')}
        ${kpi('agenda', dateFr(echeanceDe(periode)), 'date limite de déclaration et de paiement', 'Le 15 du mois suivant (le 20 pour les salaires de juillet), CGI art. 461 bis.', 'jaune')}
      </div>
      <div class="disposition d-2-1">
      ${carte(`État des retenues, ${moisFr(periode)}`, tableau(['Salarié', '+Brut', '+Imposable', '+Parts', '+ITS', '+TOL', '+Solidarité CAMU'], B.map((b) => `<tr><td>${e(b.prenom)} ${e(b.nom)}</td><td class="n">${fcfa(b.brut)}</td><td class="n">${fcfa(b.imposable)}</td><td class="n">${nb(b.parts)}</td><td class="n"><b>${fcfa(m(b, 'ITS'))}</b></td><td class="n">${fcfa(m(b, 'TOL'))}</td><td class="n">${fcfa(m(b, 'CAMU_SOL'))}</td></tr>`)
        .concat([`<tr class="total"><td>Total</td><td class="n">${fcfa(somme(B, (b) => b.brut))}</td><td class="n">${fcfa(somme(B, (b) => b.imposable))}</td><td></td><td class="n">${fcfa(its)}</td><td class="n">${fcfa(tol)}</td><td class="n">${fcfa(sol)}</td></tr>`])), { outil: `<div class="outils-carte">${imprimer('impots')}${exporter('impots')}</div>` })}
      ${carte('Récapitulatif à verser', `<dl class="recap-versements">
        <div><dt>Impôt sur les salaires (ITS)</dt><dd>${fcfa(its)} FCFA</dd><small>DGI</small></div>
        <div><dt>Taxe unique, part DGI</dt><dd>${fcfa(tusDgiM)} FCFA</dd><small>DGI</small></div>
        <div><dt>Taxe d'occupation des locaux</dt><dd>${fcfa(tol)} FCFA</dd><small>DGI</small></div>
        <div><dt>Contribution de solidarité CAMU</dt><dd>${fcfa(sol)} FCFA</dd><small>à confirmer</small></div>
        <div class="total-versement"><dt>Total DGI</dt><dd>${fcfa(its + tusDgiM + tol)} FCFA</dd></div>
        <div><dt>Cotisations CAMU (caisse)${aide('Parts salarié et employeur, dues seulement si la société est immatriculée à la caisse CAMU.')}</dt><dd>${fcfa(camu)} FCFA</dd><small>CAMU</small></div></dl>`)}
      </div>`;
    } else {
      const lignes = all(`SELECT e.id, e.nom, e.prenom, e.num_cnss, COUNT(b.id) mois, SUM(b.brut) brut, SUM(b.imposable) imposable, SUM(b.net) net,
          SUM((SELECT montant FROM bulletin_lignes WHERE bulletin_id=b.id AND code='ITS')) its, SUM((SELECT montant FROM bulletin_lignes WHERE bulletin_id=b.id AND code='CNSS_SAL')) cnss
        FROM bulletins b JOIN salaries e ON e.id=b.salarie_id WHERE e.societe_id=? AND substr(b.periode,1,4)=? GROUP BY e.id ORDER BY e.nom`, sid, annee);
      contenu = `<div class="kpis trois">
        ${kpi('equipe', lignes.length, `salariés payés en ${annee}`)}
        ${kpi('paie', `${fcfa(somme(lignes, (l) => l.its || 0))} <small>FCFA</small>`, 'ITS retenu sur l\'année')}
        ${kpi('agenda', `janvier ${Number(annee) + 1}`, 'dépôt de la déclaration annuelle', 'La déclaration annuelle des salaires (DAS) de l\'année est déposée en janvier suivant.', 'jaune')}
      </div>
      ${carte(`Déclaration annuelle des salaires, ${annee}${aide('Cumul des bulletins calculés dans Smart RH pour l\'année. Les mois sans bulletin ne sont pas comptés.')}`, tableau(['Salarié', 'N° CNSS', '+Mois payés', '+Brut', '+Imposable', '+Retraite CNSS', '+ITS', '+Net versé'], lignes.map((l) => `<tr><td>${e(l.prenom)} ${e(l.nom)}</td><td>${e(l.num_cnss) || '—'}</td><td class="n">${l.mois}</td><td class="n">${fcfa(l.brut)}</td><td class="n">${fcfa(l.imposable)}</td><td class="n">${fcfa(l.cnss)}</td><td class="n"><b>${fcfa(l.its)}</b></td><td class="n">${fcfa(l.net)}</td></tr>`)
        .concat([`<tr class="total"><td>Total</td><td></td><td></td><td class="n">${fcfa(somme(lignes, (l) => l.brut))}</td><td class="n">${fcfa(somme(lignes, (l) => l.imposable))}</td><td class="n">${fcfa(somme(lignes, (l) => l.cnss || 0))}</td><td class="n">${fcfa(somme(lignes, (l) => l.its || 0))}</td><td class="n">${fcfa(somme(lignes, (l) => l.net))}</td></tr>`])), { outil: `<div class="outils-carte">${imprimer('annuel')}${exporter('annuel')}</div>` })}`;
    }
    res.send(page(req, { titre: 'Déclarations', sous: 'Établies à partir des bulletins calculés. Vérifiez-les, puis exportez-les ou imprimez-les pour le dépôt. Taux indicatifs tant que l\'expert-comptable ne les a pas validés.' }, `${nav}${choixPeriode}${contenu}`));
  });

  // données communes à l'export et à l'impression
  function tableauDeclaration(sid, type, periode, annee) {
    if (type === 'cnss') {
      const L = lignesCnss(etat(sid, periode));
      return { titre: `Bordereau de cotisations CNSS, ${moisFr(periode)}`, entetes: ['Nom', 'Prénom', 'N° CNSS', 'Brut', 'Base retraite', 'Retraite salarié', 'Retraite employeur', 'Base PF et AT', 'Prestations familiales', 'Accidents du travail', 'Total'],
        lignes: L.map((x) => [x.b.nom, x.b.prenom, x.b.num_cnss || '', x.b.brut, x.ret, x.retSal, x.retPat, x.pf, x.pfM, x.at, x.total]) };
    }
    if (type === 'impots') {
      const B = etat(sid, periode);
      return { titre: `État des retenues ITS, TOL et CAMU, ${moisFr(periode)}`, entetes: ['Nom', 'Prénom', 'Brut', 'Imposable', 'Parts', 'ITS', 'TOL', 'Solidarité CAMU'],
        lignes: B.map((b) => [b.nom, b.prenom, b.brut, b.imposable, b.parts, m(b, 'ITS'), m(b, 'TOL'), m(b, 'CAMU_SOL')]) };
    }
    const L = all(`SELECT e.nom, e.prenom, e.num_cnss, COUNT(b.id) mois, SUM(b.brut) brut, SUM(b.imposable) imposable,
        SUM((SELECT montant FROM bulletin_lignes WHERE bulletin_id=b.id AND code='CNSS_SAL')) cnss, SUM((SELECT montant FROM bulletin_lignes WHERE bulletin_id=b.id AND code='ITS')) its, SUM(b.net) net
      FROM bulletins b JOIN salaries e ON e.id=b.salarie_id WHERE e.societe_id=? AND substr(b.periode,1,4)=? GROUP BY e.id ORDER BY e.nom`, sid, annee);
    return { titre: `Déclaration annuelle des salaires, ${annee}`, entetes: ['Nom', 'Prénom', 'N° CNSS', 'Mois payés', 'Brut', 'Imposable', 'Retraite CNSS', 'ITS', 'Net versé'],
      lignes: L.map((l) => [l.nom, l.prenom, l.num_cnss || '', l.mois, l.brut, l.imposable, l.cnss || 0, l.its || 0, l.net]) };
  }

  // paramètres des exports : vérifiés avant tout usage (ils reviennent dans un nom de fichier et dans un lien)
  const demande = (q) => ({ type: ['cnss', 'impots', 'annuel'].includes(q.type) ? q.type : 'cnss', periode: /^\d{4}-\d{2}$/.test(q.periode || '') ? q.periode : aujourdhui().slice(0, 7), annee: /^\d{4}$/.test(q.annee || '') ? q.annee : aujourdhui().slice(0, 4) });
  app.get('/declarations/export', (req, res) => {
    const q = demande(req.query), t = tableauDeclaration(req.societe.id, q.type, q.periode, q.annee);
    // une cellule commençant par = + - @ serait exécutée comme formule par Excel : on la neutralise
    const cell = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : `"${String(v).replace(/^([=+\-@\t\r])/, "'$1").replace(/"/g, '""')}"`);
    const csv = '﻿' + [t.entetes, ...t.lignes].map((l) => l.map(cell).join(';')).join('\r\n');
    const nom = `${q.type}-${q.type === 'annuel' ? q.annee : q.periode}-${req.societe.nom.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nom}"` }).send(csv);
  });
  app.get('/declarations/imprimer', (req, res) => {
    const s = req.societe, q = demande(req.query), t = tableauDeclaration(s.id, q.type, q.periode, q.annee);
    const num = (v, k) => (typeof v === 'number' && k > 1 ? `<td class="n">${fcfa(v)}</td>` : `<td>${e(v)}</td>`);
    res.send(imprimable(t.titre, `/declarations?onglet=${q.type}&periode=${q.periode}`, `

      <div class="entete"><div>${logo.balise(s.id)}<b>${e(s.nom)}</b><br>${e(s.ville)}<br>NIU ${e(s.niu)}<br>CNSS employeur ${e(s.cnss_employeur)}</div><div class="droite"><h1>${e(t.titre)}</h1>Édité le ${dateFr(aujourdhui())}</div></div>
      <table class="simple"><tr>${t.entetes.map((x, k) => `<th${k > 1 ? ' class="n"' : ''}>${e(x)}</th>`).join('')}</tr>${t.lignes.map((l) => `<tr>${l.map(num).join('')}</tr>`).join('')}</table>
      <p class="petit">Document préparé avec Smart RH à partir des bulletins calculés. Taux indicatifs, à vérifier avant dépôt.</p>
      <div class="signatures"><div>Établi par</div><div>Visa de l'employeur</div></div>`));
  });
};
