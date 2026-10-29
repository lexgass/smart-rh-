// Gestion documentaire : modèles de documents (rédigés ou collés, avec logo, en-tête et pied de page), documents rédigés
// pour un salarié à partir d'un modèle (champs de fusion remplis automatiquement), pièces déposées (scans), le tout réuni
// dans le dossier du salarié, de l'embauche à la sortie.
const { db, run, all, get, transaction } = require('./db');
const logo = require('./logo');
const acces = require('./acces');
const { ETAPES, TYPES, typeDe, CHAMPS, BIBLIOTHEQUE } = require('./documents-modeles');

db.exec(`
CREATE TABLE IF NOT EXISTS modeles_documents(id INTEGER PRIMARY KEY, societe_id INTEGER, type TEXT, titre TEXT, entete TEXT, corps TEXT, pied TEXT,
  logo_mode TEXT DEFAULT 'societe', logo_type TEXT, logo BLOB, modifie_le TEXT, modifie_par TEXT);
CREATE TABLE IF NOT EXISTS documents(id INTEGER PRIMARY KEY, societe_id INTEGER, salarie_id INTEGER, modele_id INTEGER, type TEXT, titre TEXT,
  entete TEXT, corps TEXT, pied TEXT, logo_mode TEXT, fichier BLOB, fichier_type TEXT, fichier_nom TEXT, statut TEXT, date_document TEXT, note TEXT, cree_le TEXT, cree_par TEXT);
CREATE INDEX IF NOT EXISTS ix_modeles_soc ON modeles_documents(societe_id, type);
CREATE INDEX IF NOT EXISTS ix_documents_sal ON documents(salarie_id, date_document);
CREATE INDEX IF NOT EXISTS ix_documents_soc ON documents(societe_id, date_document);
`);
if (!all('PRAGMA table_info(societes)').some((c) => c.name === 'modeles_charges')) db.exec('ALTER TABLE societes ADD COLUMN modeles_charges INTEGER DEFAULT 0');

const STATUTS = { brouillon: ['Brouillon', 'gris'], remis: ['Remis au salarié', 'bleu'], signe: ['Signé', 'vert'], archive: ['Archivé', 'gris'] };
const FICHIER_MAX = 5 * 1024 * 1024;

// la bibliothèque est copiée dans chaque société une seule fois ; ensuite les modèles lui appartiennent (modifiables, supprimables)
function assurerModeles(societeId) {
  if (get('SELECT modeles_charges FROM societes WHERE id=?', societeId)?.modeles_charges) return;
  transaction(() => {
    for (const m of BIBLIOTHEQUE) run('INSERT INTO modeles_documents(societe_id,type,titre,entete,corps,pied,logo_mode,modifie_le,modifie_par) VALUES(?,?,?,?,?,?,?,?,?)', societeId, m.type, m.titre, m.entete, m.corps, m.pied, 'societe', new Date().toISOString(), 'Bibliothèque Smart RH');
    run('UPDATE societes SET modeles_charges=1 WHERE id=?', societeId);
  });
}

/* ---------- nettoyage du HTML collé ou saisi ----------
   Liste blanche de balises et d'attributs : tout le reste (scripts, styles Word, images, liens, événements) est retiré. */
const BALISES = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'sup', 'sub', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'div', 'span', 'hr', 'blockquote']);
const VIDES = new Set(['br', 'hr']);
const PROPRIETES = new Set(['text-align', 'font-weight', 'font-style', 'text-decoration', 'font-size', 'text-indent', 'margin-left', 'margin-top', 'margin-bottom', 'padding', 'padding-left', 'line-height', 'width', 'vertical-align', 'border', 'border-top', 'border-bottom', 'border-collapse', 'color', 'background-color']);
function filtrerStyle(style) {
  return String(style).split(';').map((d) => d.split(':')).filter(([p, v]) => p && v !== undefined)
    .map(([p, ...v]) => [p.trim().toLowerCase(), v.join(':').trim()])
    .filter(([p, v]) => PROPRIETES.has(p) && /^[#a-z0-9 .,%()-]{1,60}$/i.test(v) && !/url|expression|javascript/i.test(v))
    .map(([p, v]) => `${p}: ${v}`).join('; ');
}
function nettoyer(html) {
  let s = String(html || '').slice(0, 300000);
  s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|iframe|object|embed|svg|math|template|noscript|title|head|xml)\b[\s\S]*?<\/\1\s*>/gi, '');
  return s.split(/(<[^>]*>)/).map((morceau) => {
    if (!morceau.startsWith('<')) return morceau.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const m = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>$/.exec(morceau);
    if (!m) return '';
    const [, fin, nom, reste] = m, balise = nom.toLowerCase();
    if (!BALISES.has(balise)) return '';
    if (fin) return VIDES.has(balise) ? '' : `</${balise}>`;
    const attrs = [];
    const style = /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(reste);
    const align = /\salign\s*=\s*"?(left|center|right|justify)"?/i.exec(reste);
    const s2 = [style ? filtrerStyle(style[2] ?? style[3]) : '', align ? `text-align: ${align[1].toLowerCase()}` : ''].filter(Boolean).join('; ');
    if (s2) attrs.push(`style="${s2.replace(/"/g, '')}"`);
    for (const a of ['colspan', 'rowspan']) { const x = new RegExp(`\\s${a}\\s*=\\s*"?(\\d{1,2})"?`, 'i').exec(reste); if (x) attrs.push(`${a}="${x[1]}"`); }
    return `<${balise}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`;
  }).join('');
}

/* ---------- champs de fusion ---------- */
const dateFr = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const fcfa = (n) => (n == null || n === '' ? '' : Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' '));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function contexte(societe, salarieId) {
  const s = salarieId ? get(`SELECT e.*, p.intitule, d.nom dep, c.code cat, c.libelle catlib FROM salaries e LEFT JOIN postes p ON p.id=e.poste_id
    LEFT JOIN departements d ON d.id=p.departement_id LEFT JOIN categories c ON c.id=p.categorie_id WHERE e.id=? AND e.societe_id=?`, salarieId, societe.id) : null;
  const k = s ? get('SELECT * FROM contrats WHERE salarie_id=? ORDER BY date_debut DESC LIMIT 1', s.id) : null;
  const ans = s?.date_embauche ? Math.max(0, Math.floor((Date.now() - new Date(s.date_embauche)) / (365.25 * 864e5))) : null;
  return {
    societe: { nom: societe.nom, ville: societe.ville, niu: societe.niu, rccm: societe.rccm, cnss_employeur: societe.cnss_employeur, convention: societe.convention },
    salarie: s ? { civilite: s.sexe === 'F' ? 'Madame' : 'Monsieur', prenom: s.prenom, nom: s.nom, nom_complet: `${s.prenom} ${s.nom}`, matricule: s.matricule, date_naissance: dateFr(s.date_naissance), num_cnss: s.num_cnss, telephone: s.telephone, situation: s.situation, enfants: s.enfants, date_embauche: dateFr(s.date_embauche), anciennete: ans == null ? '' : `${ans} an${ans > 1 ? 's' : ''}`, e: s.sexe === 'F' ? 'e' : '' } : {},
    poste: s ? { intitule: s.intitule, departement: s.dep, categorie: s.cat, categorie_libelle: s.catlib } : {},
    contrat: k ? { type: k.type, date_debut: dateFr(k.date_debut), date_fin: dateFr(k.date_fin), fin_essai: dateFr(k.fin_essai), salaire_base: fcfa(k.salaire_base), sursalaire: fcfa(k.sursalaire), prime_transport: fcfa(k.prime_transport), salaire_brut: fcfa((k.salaire_base || 0) + (k.sursalaire || 0) + (k.prime_transport || 0)) } : {},
    document: { date: dateFr(jourLocal()), lieu: societe.ville },
  };
}
const CHAMP = /\{\{\s*([a-z_]+)\.([a-z_0-9]+)\s*\}\}/g;
// champs « saisie.xxx » d'un modèle : ils deviennent des cases à remplir au moment de rédiger le document
const saisiesDe = (...textes) => [...new Set(textes.join(' ').match(/\{\{\s*saisie\.([a-z_0-9]+)\s*\}\}/g)?.map((x) => x.replace(/[{}\s]/g, '').slice(7)) || [])];
// les clés sont sans accents (saisie.qualite_du_signataire) : on rend au libellé ses accents usuels
const ACCENTS = { qualite: 'qualité', duree: 'durée', periode: 'période', entree: 'entrée', numero: 'numéro', echeance: 'échéance', reference: 'référence', departement: 'département', interesse: 'intéressé', superieur: 'supérieur', prevue: 'prévue', prevu: 'prévu', effectue: 'effectué', montant_brut: 'montant brut', reprise: 'reprise', faits: 'faits', retenue: 'retenue', remuneration: 'rémunération', experience: 'expérience', etablissement: 'établissement', delai: 'délai', precedent: 'précédent', precedente: 'précédente', reunion: 'réunion', securite: 'sécurité', annee: 'année', mise_a_pied: 'mise à pied', a: 'à' };
const libelleSaisie = (cle) => { const t = cle.split('_').map((m) => ACCENTS[m] || m).join(' ').replace(/\b([dl]) /g, '$1\'').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
// date du jour à l'heure locale du poste (toISOString donnerait la date UTC, la veille en soirée)
const jourLocal = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
function fusion(html, ctx, saisies = {}) {
  return String(html || '').replace(CHAMP, (tout, groupe, cle) => {
    if (groupe === 'saisie') return saisies[cle] ? esc(saisies[cle]) : '<span class="a-remplir">…………</span>';
    const v = ctx[groupe]?.[cle];
    return v === undefined || v === null || v === '' ? (ctx[groupe] ? '<span class="a-remplir">…………</span>' : tout) : esc(v);
  });
}
const typeFichier = (b) => (b.subarray(0, 4).toString('latin1') === '%PDF' ? 'application/pdf' : logo.typeImage(b));

module.exports = (app, h) => {
  const { e, page, carte, tableau, aide, ic, options } = h;
  const optionsTypes = (choisi, seulementRediges = true) => ETAPES.filter(([k]) => !seulementRediges || k !== 'pieces').map(([k, l]) => `<optgroup label="${e(l)}">${TYPES.filter((t) => t[2] === k).map(([c, lib]) => `<option value="${c}"${c === choisi ? ' selected' : ''}>${e(lib)}</option>`).join('')}</optgroup>`).join('');
  const optionsPieces = () => TYPES.filter((t) => t[2] === 'pieces').map(([c, l]) => `<option value="${c}">${e(l)}</option>`).join('');
  const pastille = (st) => `<span class="et ${STATUTS[st]?.[1] || 'gris'}">${STATUTS[st]?.[0] || e(st)}</span>`;
  const lienDoc = (d) => (d.fichier_type ? `/documents/${d.id}/fichier` : `/documents/${d.id}`);

  // en-tête de document : logo de la société, logo propre au modèle, ou aucun
  const logoHtml = (mode, societeId, modeleId) => (mode === 'aucun' ? '' : mode === 'perso' && modeleId ? `<img class="logo-societe" src="/documents/modeles/${modeleId}/logo" alt="Logo">` : logo.balise(societeId));

  // carte « Dossier documentaire » de la fiche salarié
  h.carteDocuments = (req, s) => {
    assurerModeles(req.societe.id);
    const docs = all('SELECT id, type, titre, statut, date_document, fichier_type, fichier_nom FROM documents WHERE salarie_id=? AND societe_id=? ORDER BY date_document DESC, id DESC', s.id, req.societe.id);
    const modeles = all('SELECT id, type, titre FROM modeles_documents WHERE societe_id=? ORDER BY titre', req.societe.id);
    const parEtape = ETAPES.map(([k, l]) => [l, docs.filter((d) => typeDe(d.type)[2] === k)]).filter(([, l]) => l.length);
    return carte(`Dossier documentaire <span class="compteur">${docs.length}</span>${aide('Tous les documents du salarié, de l\'embauche à la sortie : documents rédigés à partir d\'un modèle et pièces déposées (scans).')}`, `
      ${docs.length ? parEtape.map(([l, ds]) => `<p class="etape-doc">${e(l)}</p>${tableau(['Document', 'Date', 'État', ''], ds.map((d) => `<tr><td><b>${e(d.titre)}</b>${d.fichier_type ? ` <small class="discret">fichier ${d.fichier_type === 'application/pdf' ? 'PDF' : 'image'}</small>` : ''}</td><td>${dateFr(d.date_document)}</td><td>${pastille(d.statut)}</td><td class="n"><a class="bouton fantome petit" href="${lienDoc(d)}"${d.fichier_type ? ' target="_blank" rel="noopener"' : ''}>Ouvrir</a></td></tr>`))}`).join('') : '<p class="discret">Aucun document pour le moment.</p>'}
      <div class="actions-docs">
        <form method="get" action="/salaries/${s.id}/documents/nouveau" class="form-mini large"><label class="en-ligne">Rédiger<select name="modele" required>${modeles.map((m) => `<option value="${m.id}">${e(m.titre)}</option>`).join('')}</select></label><button class="bouton secondaire">${ic('document')}Rédiger</button></form>
        <form method="post" action="/salaries/${s.id}/pieces" enctype="multipart/form-data" class="form-mini large"><label class="en-ligne">Déposer<select name="type">${optionsPieces()}</select></label><input type="file" name="fichier" accept="application/pdf,image/png,image/jpeg,image/webp" required aria-label="Fichier à déposer"><button class="bouton secondaire">${ic('telecharger')}Déposer</button></form>
      </div>`, { id: 'documents' });
  };

  /* ---------- page Gestion documentaire ---------- */
  app.get('/documents', (req, res) => {
    const sid = req.societe.id;
    assurerModeles(sid);
    const onglet = req.query.onglet === 'modeles' ? 'modeles' : 'documents';
    const peutModeles = acces.peut(req, 'modeles');
    const nav = `<nav class="onglets" aria-label="Gestion documentaire"><a href="/documents"${onglet === 'documents' ? ' class="actif" aria-current="page"' : ''}>Documents des salariés</a><a href="/documents?onglet=modeles"${onglet === 'modeles' ? ' class="actif" aria-current="page"' : ''}>Modèles</a></nav>`;
    let contenu;
    if (onglet === 'modeles') {
      const ms = all('SELECT id, type, titre, logo_mode, modifie_le, modifie_par FROM modeles_documents WHERE societe_id=? ORDER BY type, titre', sid);
      const lignes = ETAPES.filter(([k]) => k !== 'pieces').flatMap(([k, l]) => { const x = ms.filter((m) => typeDe(m.type)[2] === k); return x.length ? [`<tr class="groupe-ligne"><td colspan="4">${e(l)}</td></tr>`, ...x.map((m) => `<tr><td><b>${e(m.titre)}</b><small class="discret bloc">${e(typeDe(m.type)[1])}</small></td><td class="discret">${{ societe: 'Logo de la société', perso: 'Logo propre', aucun: 'Sans logo' }[m.logo_mode] || ''}</td><td class="discret">${dateFr(m.modifie_le)}<small class="bloc">${e(m.modifie_par || '')}</small></td>
        <td class="n outils"><a class="bouton fantome petit" href="/documents/modeles/${m.id}/apercu">Aperçu</a>${peutModeles ? `<a class="bouton fantome petit" href="/documents/modeles/${m.id}/modifier">Modifier</a><form method="post" action="/documents/modeles/${m.id}/dupliquer"><button class="bouton fantome petit">Dupliquer</button></form><form method="post" action="/documents/modeles/${m.id}/supprimer" data-confirmer="Supprimer le modèle « ${e(m.titre)} » ? Les documents déjà rédigés sont conservés."><button class="bouton fantome petit">Supprimer</button></form>` : ''}</td></tr>`)] : []; });
      contenu = `<div class="disposition d-2-1">${carte(`Modèles de la société <span class="compteur">${ms.length}</span>`, tableau(['Modèle', 'Logo', 'Modifié', ''], lignes, 'Aucun modèle.'))}
        ${peutModeles ? carte(`Nouveau modèle${aide('Rédigez votre modèle ou collez-le depuis Word : la mise en forme est conservée (gras, titres, listes, tableaux, alignements). Ajoutez ensuite les champs qui se remplissent tout seuls.')}`, `<form method="get" action="/documents/modeles/nouveau" class="form-pile"><label>Type de document<select name="type">${optionsTypes('contrat_cdi')}</select></label><button class="bouton">${ic('plus')}Créer le modèle</button></form>
          <p class="discret petit-texte">Les modèles fournis sont indicatifs : faites-les relire par votre juriste avant de les utiliser.</p>`, { cls: 'collant' }) : carte('', '<p class="discret">La création et la modification des modèles sont réservées aux administrateurs.</p>')}</div>`;
    } else {
      const q = String(req.query.q || '').trim().slice(0, 80), type = TYPES.some((t) => t[0] === req.query.type) ? req.query.type : '';
      const docs = all(`SELECT d.id, d.type, d.titre, d.statut, d.date_document, d.fichier_type, e.id sid, e.nom, e.prenom, e.matricule FROM documents d JOIN salaries e ON e.id=d.salarie_id
        WHERE d.societe_id=? ${type ? 'AND d.type=?' : ''} ORDER BY d.date_document DESC, d.id DESC LIMIT 500`, ...[sid, ...(type ? [type] : [])])
        .filter((d) => !q || `${d.prenom} ${d.nom} ${d.matricule} ${d.titre}`.toLowerCase().includes(q.toLowerCase()));
      contenu = carte('', `<form method="get" action="/documents" class="barre-outils periode"><label class="recherche">${ic('loupe')}<input type="search" name="q" value="${e(q)}" placeholder="Salarié, matricule, document…" aria-label="Rechercher un document"></label>
        <label class="en-ligne">Type<select name="type" data-envoi-auto><option value="">Tous</option>${ETAPES.map(([k, l]) => `<optgroup label="${e(l)}">${TYPES.filter((t) => t[2] === k).map(([c, lib]) => `<option value="${c}"${c === type ? ' selected' : ''}>${e(lib)}</option>`).join('')}</optgroup>`).join('')}</select></label><button class="bouton secondaire">Filtrer</button></form>
        ${tableau(['Salarié', 'Document', 'Étape', 'Date', 'État', ''], docs.map((d) => `<tr><td><a href="/salaries/${d.sid}#documents"><b>${e(d.prenom)} ${e(d.nom)}</b></a><small class="discret bloc">${e(d.matricule)}</small></td><td>${e(d.titre)}</td><td class="discret">${e(ETAPES.find((x) => x[0] === typeDe(d.type)[2])?.[1] || '')}</td><td>${dateFr(d.date_document)}</td><td>${pastille(d.statut)}</td><td class="n"><a class="bouton fantome petit" href="${lienDoc(d)}"${d.fichier_type ? ' target="_blank" rel="noopener"' : ''}>Ouvrir</a></td></tr>`), 'Aucun document. Rédigez-en un depuis la fiche d\'un salarié (rubrique « Dossier documentaire »).')}`);
    }
    res.send(page(req, { titre: 'Gestion documentaire', sous: 'Les documents de la vie de chaque salarié dans l\'entreprise, et les modèles pour les rédiger.' }, nav + contenu));
  });

  /* ---------- modèles : éditeur ---------- */
  const formulaireModele = (req, m) => {
    const champs = CHAMPS.map(([g, l]) => `<optgroup label="${e(g)}">${l.map(([c, lib]) => `<option value="{{${c}}}">${e(lib)}</option>`).join('')}</optgroup>`).join('');
    const zone = (nom, titre, contenu, bulle, cls = '') => `<div class="zone-edition"><div class="zone-titre"><b>${titre}</b>${aide(bulle)}</div><div class="editable ${cls}" contenteditable="true" data-zone="${nom}" role="textbox" aria-multiline="true" aria-label="${titre}">${contenu || ''}</div><textarea name="${nom}" hidden></textarea></div>`;
    const barre = `<div class="barre-edition" role="toolbar" aria-label="Mise en forme">
      <button type="button" data-cmd="bold" title="Gras"><b>G</b></button><button type="button" data-cmd="italic" title="Italique"><i>I</i></button><button type="button" data-cmd="underline" title="Souligné"><u>S</u></button>
      <span class="sep"></span><button type="button" data-cmd="formatBlock" data-val="h2" title="Titre">Titre</button><button type="button" data-cmd="formatBlock" data-val="h3" title="Sous-titre">Sous-titre</button><button type="button" data-cmd="formatBlock" data-val="p" title="Paragraphe">¶</button>
      <span class="sep"></span><button type="button" data-cmd="insertUnorderedList" title="Liste à puces">• Liste</button><button type="button" data-cmd="insertOrderedList" title="Liste numérotée">1. Liste</button>
      <span class="sep"></span><button type="button" data-cmd="justifyLeft" title="Aligner à gauche">Gauche</button><button type="button" data-cmd="justifyCenter" title="Centrer">Centre</button><button type="button" data-cmd="justifyRight" title="Aligner à droite">Droite</button><button type="button" data-cmd="justifyFull" title="Justifier">Justifié</button>
      <span class="sep"></span><button type="button" data-cmd="removeFormat" title="Effacer la mise en forme">Effacer</button>
      <select data-inserer aria-label="Insérer un champ"><option value="">Insérer un champ…</option>${champs}</select>
      <button type="button" data-saisie title="Ajouter une case que vous remplirez à chaque document (date d'effet, motif…)">+ Champ à remplir</button></div>`;
    return `<form method="post" action="/documents/modeles${m.id ? `/${m.id}` : ''}" enctype="multipart/form-data" class="editeur-modele" id="editeur">
      <div class="disposition d-2-1">
        <div class="pile">
          ${carte('', `<div class="champs"><label>Titre du modèle<input name="titre" required maxlength="160" value="${e(m.titre)}"></label><label>Type de document<select name="type">${optionsTypes(m.type)}</select></label></div>`)}
          ${carte('', `${barre}${zone('entete', 'En-tête', m.entete, 'Affiché en haut de chaque document, à côté du logo : raison sociale, adresse, numéros.', 'petite')}${zone('corps', 'Texte du document', m.corps, 'Rédigez ou collez votre texte (Word, PDF copié…). Les champs entre accolades se remplissent avec les données du salarié.', 'grande')}${zone('pied', 'Pied de page', m.pied, 'Répété en bas de chaque page à l\'impression.', 'petite')}`)}
        </div>
        <div class="pile collant">
          ${carte('Logo', `<fieldset class="choix-affichage"><legend class="visuellement-cache">Logo du document</legend><div class="segments verticaux">${[['societe', 'Logo de la société', 'Celui des Informations légales'], ['perso', 'Logo propre à ce modèle', 'Par exemple un logo de filiale ou de projet'], ['aucun', 'Sans logo', 'Pour du papier à en-tête déjà imprimé']].map(([v, l, d]) => `<label><input type="radio" name="logo_mode" value="${v}"${(m.logo_mode || 'societe') === v ? ' checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}</div></fieldset>
            <label>Logo propre (${logo.FORMATS})<input type="file" name="logo" accept="image/png,image/jpeg,image/webp"></label>${m.id && m.logo_type ? `<img class="apercu-logo-modele" src="/documents/modeles/${m.id}/logo" alt="Logo actuel">` : ''}`)}
          ${carte('Champs automatiques', `<p class="discret petit-texte">Choisissez un champ dans la barre d'outils : il est remplacé par la donnée du salarié lors de la rédaction. Un « champ à remplir » devient une case à compléter à chaque document.</p><ul class="liste-champs">${CHAMPS[1][1].slice(0, 4).map(([c, l]) => `<li><code>{{${c}}}</code> ${e(l)}</li>`).join('')}<li>…</li></ul>`)}
          <div class="actions"><button class="bouton large">${ic('coche')}Enregistrer le modèle</button>${m.id ? `<a class="bouton fantome" href="/documents/modeles/${m.id}/apercu">Aperçu</a>` : ''}<a class="bouton fantome" href="/documents?onglet=modeles">Annuler</a></div>
        </div>
      </div></form><script src="/editeur.js"></script>`;
  };
  app.get('/documents/modeles/nouveau', (req, res) => {
    const type = TYPES.some((t) => t[0] === req.query.type) ? req.query.type : 'autre';
    const base = BIBLIOTHEQUE.find((b) => b.type === type);
    res.send(page(req, { titre: 'Nouveau modèle', fil: 'Gestion documentaire / Nouveau modèle' }, formulaireModele(req, { titre: typeDe(type)[1], type, entete: base?.entete || BIBLIOTHEQUE[0].entete, corps: base?.corps || '<p></p>', pied: base?.pied || BIBLIOTHEQUE[0].pied, logo_mode: 'societe' })));
  });
  const modele = (req) => get('SELECT * FROM modeles_documents WHERE id=? AND societe_id=?', Number(req.params.id), req.societe.id);
  app.get('/documents/modeles/:id/modifier', (req, res) => {
    const m = modele(req); if (!m) return res.redirect('/documents?onglet=modeles');
    res.send(page(req, { titre: 'Modifier le modèle', fil: `Gestion documentaire / ${m.titre}`, sous: req.query.m === 'enregistre' ? 'Modèle enregistré.' : req.query.m && logo.MESSAGES[req.query.m] ? logo.MESSAGES[req.query.m] : '' }, formulaireModele(req, m)));
  });
  const enregistrerModele = (req, res, existant) => {
    const b = req.body, f = req.fichiers?.logo;
    const refus = logo.refusLogo(f);
    if (refus) return res.redirect(existant ? `/documents/modeles/${existant.id}/modifier?m=${refus}` : '/documents?onglet=modeles');
    const v = { titre: String(b.titre || '').trim().slice(0, 160) || 'Modèle sans titre', type: TYPES.some((t) => t[0] === b.type) ? b.type : 'autre', entete: nettoyer(b.entete), corps: nettoyer(b.corps), pied: nettoyer(b.pied), logo_mode: ['societe', 'perso', 'aucun'].includes(b.logo_mode) ? b.logo_mode : 'societe' };
    const qui = `${req.user.nom} (${req.user.email})`, quand = new Date().toISOString();
    let id = existant?.id;
    if (existant) run('UPDATE modeles_documents SET titre=?, type=?, entete=?, corps=?, pied=?, logo_mode=?, modifie_le=?, modifie_par=? WHERE id=?', v.titre, v.type, v.entete, v.corps, v.pied, v.logo_mode, quand, qui, id);
    else id = Number(run('INSERT INTO modeles_documents(societe_id,type,titre,entete,corps,pied,logo_mode,modifie_le,modifie_par) VALUES(?,?,?,?,?,?,?,?,?)', req.societe.id, v.type, v.titre, v.entete, v.corps, v.pied, v.logo_mode, quand, qui).lastInsertRowid);
    if (f) run('UPDATE modeles_documents SET logo=?, logo_type=? WHERE id=?', f.donnees, logo.typeImage(f.donnees), id);
    res.redirect(`/documents/modeles/${id}/modifier?m=enregistre`);
  };
  app.post('/documents/modeles', (req, res) => enregistrerModele(req, res, null));
  app.post('/documents/modeles/:id', (req, res) => { const m = modele(req); if (!m) return res.redirect('/documents?onglet=modeles'); enregistrerModele(req, res, m); });
  app.post('/documents/modeles/:id/dupliquer', (req, res) => {
    const m = modele(req);
    if (m) run('INSERT INTO modeles_documents(societe_id,type,titre,entete,corps,pied,logo_mode,logo,logo_type,modifie_le,modifie_par) VALUES(?,?,?,?,?,?,?,?,?,?,?)', m.societe_id, m.type, `${m.titre} (copie)`, m.entete, m.corps, m.pied, m.logo_mode, m.logo, m.logo_type, new Date().toISOString(), `${req.user.nom} (${req.user.email})`);
    res.redirect('/documents?onglet=modeles');
  });
  app.post('/documents/modeles/:id/supprimer', (req, res) => { run('DELETE FROM modeles_documents WHERE id=? AND societe_id=?', Number(req.params.id), req.societe.id); res.redirect('/documents?onglet=modeles'); });
  app.get('/documents/modeles/:id/logo', (req, res) => {
    const m = get('SELECT logo, logo_type FROM modeles_documents WHERE id=? AND societe_id=?', Number(req.params.id), req.societe.id);
    if (!m?.logo) return res.status(404).end();
    res.set({ 'Content-Type': m.logo_type, 'Cache-Control': 'private, max-age=3600' }).send(Buffer.from(m.logo));
  });

  /* ---------- impression : logo, en-tête, texte, pied répété sur chaque page ---------- */
  const imprimer = (req, res, { titre, retour, entete, corps, pied, logoMode, modeleId, outils = '' }) => res.send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(titre)}</title><link rel="icon" href="/logo.svg"><link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/style.css"></head>
<body class="doc"><div class="barre-doc"><a href="${e(retour)}" class="bouton fantome">← Retour</a>${outils}<button class="bouton" type="button" data-imprimer>${ic('imprimer')}Imprimer ou enregistrer en PDF</button></div>
<article class="lettre"><header class="lettre-entete">${logoHtml(logoMode, req.societe.id, modeleId)}<div>${entete || ''}</div></header><div class="lettre-corps">${corps || ''}</div><div class="lettre-reserve" aria-hidden="true"></div><footer class="lettre-pied">${pied || ''}</footer></article><script src="/imprimer.js"></script><script src="/app.js"></script></body></html>`);

  app.get('/documents/modeles/:id/apercu', (req, res) => {
    const m = modele(req); if (!m) return res.redirect('/documents?onglet=modeles');
    const ex = get("SELECT id FROM salaries WHERE societe_id=? AND statut='Actif' ORDER BY id LIMIT 1", req.societe.id);
    const ctx = contexte(req.societe, ex?.id);
    imprimer(req, res, { titre: `Aperçu — ${m.titre}`, retour: '/documents?onglet=modeles', entete: fusion(m.entete, ctx), corps: fusion(m.corps, ctx), pied: fusion(m.pied, ctx), logoMode: m.logo_mode, modeleId: m.id,
      outils: `<span class="discret">Aperçu avec ${ex ? 'les données d\'un salarié de la société' : 'les données de la société'}</span>` });
  });

  /* ---------- rédaction d'un document pour un salarié ---------- */
  const salarie = (req) => get('SELECT * FROM salaries WHERE id=? AND societe_id=?', Number(req.params.id), req.societe.id);
  app.get('/salaries/:id/documents/nouveau', (req, res) => {
    const s = salarie(req); if (!s) return res.redirect('/salaries');
    assurerModeles(req.societe.id);
    let m = req.query.modele ? get('SELECT * FROM modeles_documents WHERE id=? AND societe_id=?', Number(req.query.modele), req.societe.id) : null;
    if (!m && req.query.type) m = get('SELECT * FROM modeles_documents WHERE type=? AND societe_id=? ORDER BY id LIMIT 1', String(req.query.type), req.societe.id);
    if (!m) return res.redirect(`/salaries/${s.id}#documents`);
    const champs = saisiesDe(m.entete, m.corps, m.pied);
    res.send(page(req, { titre: m.titre, fil: `Salariés / ${s.prenom} ${s.nom} / ${m.titre}`, sous: `Pour ${e(s.prenom)} ${e(s.nom)}. Les données du salarié, du poste et du contrat sont reprises automatiquement ; complétez les cases ci-dessous.` }, `
      <form method="post" action="/salaries/${s.id}/documents" class="carte form-pile etroit-large"><input type="hidden" name="modele" value="${m.id}">
        <label>Date du document<input type="date" name="date_document" value="${jourLocal()}" required></label>
        ${champs.length ? `<div class="champs">${champs.map((c) => `<label>${e(libelleSaisie(c))}<input name="saisie_${c}" maxlength="500"></label>`).join('')}</div>` : '<p class="discret">Ce modèle n\'a aucune case à compléter.</p>'}
        <div class="actions"><button class="bouton">${ic('document')}Rédiger le document</button><a class="bouton fantome" href="/salaries/${s.id}#documents">Annuler</a></div>
        <p class="discret petit-texte">Vous pourrez relire et modifier le texte avant de l'imprimer. Une case laissée vide apparaît en pointillés.</p></form>`));
  });
  app.post('/salaries/:id/documents', (req, res) => {
    const s = salarie(req); const m = s && get('SELECT * FROM modeles_documents WHERE id=? AND societe_id=?', Number(req.body.modele), req.societe.id);
    if (!s || !m) return res.redirect('/salaries');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date_document || '') ? req.body.date_document : jourLocal();
    const saisies = Object.fromEntries(saisiesDe(m.entete, m.corps, m.pied).map((c) => [c, String(req.body[`saisie_${c}`] || '').trim().slice(0, 500)]));
    const ctx = contexte(req.societe, s.id); ctx.document.date = dateFr(date);
    const id = Number(run('INSERT INTO documents(societe_id,salarie_id,modele_id,type,titre,entete,corps,pied,logo_mode,statut,date_document,cree_le,cree_par) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      req.societe.id, s.id, m.id, m.type, m.titre, fusion(m.entete, ctx, saisies), fusion(m.corps, ctx, saisies), fusion(m.pied, ctx, saisies), m.logo_mode, 'brouillon', date, new Date().toISOString(), `${req.user.nom} (${req.user.email})`).lastInsertRowid);
    run('INSERT INTO evenements(salarie_id,date,type,detail) VALUES(?,?,?,?)', s.id, date, 'Document', m.titre);
    res.redirect(`/documents/${id}`);
  });

  /* ---------- pièces déposées ---------- */
  app.post('/salaries/:id/pieces', (req, res) => {
    const s = salarie(req), f = req.fichiers?.fichier;
    if (!s) return res.redirect('/salaries');
    const type = TYPES.some((t) => t[0] === req.body.type && t[2] === 'pieces') ? req.body.type : 'autre';
    const mime = f && f.donnees.length <= FICHIER_MAX ? typeFichier(f.donnees) : null;
    if (!mime) return res.redirect(`/salaries/${s.id}?m=piece_refusee#documents`);
    run('INSERT INTO documents(societe_id,salarie_id,type,titre,fichier,fichier_type,fichier_nom,statut,date_document,cree_le,cree_par) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      req.societe.id, s.id, type, typeDe(type)[1], f.donnees, mime, String(f.nom || '').replace(/[^\w .()-]/g, '_').slice(0, 120), 'archive', jourLocal(), new Date().toISOString(), `${req.user.nom} (${req.user.email})`);
    res.redirect(`/salaries/${s.id}#documents`);
  });

  /* ---------- un document : lecture, impression, modification, état ---------- */
  const documentDe = (req) => get('SELECT d.*, e.nom, e.prenom FROM documents d JOIN salaries e ON e.id=d.salarie_id WHERE d.id=? AND d.societe_id=?', Number(req.params.id), req.societe.id);
  app.get('/documents/:id', (req, res) => {
    const d = documentDe(req); if (!d) return res.redirect('/documents');
    if (d.fichier_type) return res.redirect(`/documents/${d.id}/fichier`);
    const etats = `<form method="post" action="/documents/${d.id}/statut" class="form-mini"><select name="statut" data-envoi-auto aria-label="État du document">${Object.entries(STATUTS).map(([k, [l]]) => `<option value="${k}"${k === d.statut ? ' selected' : ''}>${l}</option>`).join('')}</select><noscript><button class="bouton secondaire petit">OK</button></noscript></form>`;
    imprimer(req, res, { titre: `${d.titre} — ${d.prenom} ${d.nom}`, retour: `/salaries/${d.salarie_id}#documents`, entete: d.entete, corps: d.corps, pied: d.pied, logoMode: d.logo_mode, modeleId: d.modele_id,
      outils: `${etats}<a class="bouton secondaire" href="/documents/${d.id}/modifier">${ic('reglages')}Modifier le texte</a>${acces.peut(req, 'documents.supprimer') ? `<form method="post" action="/documents/${d.id}/supprimer" data-confirmer="Supprimer définitivement ce document du dossier du salarié ?"><button class="bouton fantome">Supprimer</button></form>` : ''}` });
  });
  app.get('/documents/:id/modifier', (req, res) => {
    const d = documentDe(req); if (!d || d.fichier_type) return res.redirect('/documents');
    res.send(page(req, { titre: 'Modifier le document', fil: `Salariés / ${d.prenom} ${d.nom} / ${d.titre}`, sous: 'Les modifications ne concernent que ce document ; le modèle reste inchangé.' }, `
      <form method="post" action="/documents/${d.id}" class="editeur-modele" id="editeur">${carte('', `<div class="barre-edition" role="toolbar" aria-label="Mise en forme"><button type="button" data-cmd="bold"><b>G</b></button><button type="button" data-cmd="italic"><i>I</i></button><button type="button" data-cmd="underline"><u>S</u></button><span class="sep"></span><button type="button" data-cmd="justifyLeft">Gauche</button><button type="button" data-cmd="justifyCenter">Centre</button><button type="button" data-cmd="justifyRight">Droite</button><button type="button" data-cmd="justifyFull">Justifié</button></div>
        <div class="zone-edition"><div class="editable grande" contenteditable="true" data-zone="corps" role="textbox" aria-multiline="true" aria-label="Texte du document">${d.corps}</div><textarea name="corps" hidden></textarea></div>`)}
        <div class="actions"><button class="bouton">${ic('coche')}Enregistrer</button><a class="bouton fantome" href="/documents/${d.id}">Annuler</a></div></form><script src="/editeur.js"></script>`));
  });
  app.post('/documents/:id', (req, res) => {
    const d = documentDe(req); if (!d || d.fichier_type) return res.redirect('/documents');
    run('UPDATE documents SET corps=? WHERE id=?', nettoyer(req.body.corps), d.id);
    res.redirect(`/documents/${d.id}`);
  });
  app.post('/documents/:id/statut', (req, res) => {
    const d = documentDe(req);
    if (d && STATUTS[req.body.statut]) run('UPDATE documents SET statut=? WHERE id=?', req.body.statut, d.id);
    res.redirect(d ? `/documents/${d.id}` : '/documents');
  });
  app.post('/documents/:id/supprimer', (req, res) => {
    const d = documentDe(req);
    if (d) run('DELETE FROM documents WHERE id=?', d.id);
    res.redirect(d ? `/salaries/${d.salarie_id}#documents` : '/documents');
  });
  app.get('/documents/:id/fichier', (req, res) => {
    const d = documentDe(req); if (!d?.fichier) return res.status(404).end();
    // fichier affiché dans le navigateur, isolé (aucun script ne peut s'exécuter dans son contexte)
    res.set({ 'Content-Type': d.fichier_type, 'Content-Disposition': `inline; filename="${String(d.fichier_nom || 'document').replace(/"/g, '')}"`, 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'no-store' }).send(Buffer.from(d.fichier));
  });
};
Object.assign(module.exports, { nettoyer, fusion, contexte, saisiesDe, assurerModeles, TYPES });
