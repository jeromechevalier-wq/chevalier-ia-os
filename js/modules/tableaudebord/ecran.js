// Écran unique « Maintenance » (23/10/2026, règle du propriétaire : jamais de sous-onglets) : en haut la phrase d'état et les compteurs, puis « À traiter en premier »,
// puis TOUS les indicateurs, un bloc repliable par famille (Finance et Stocks sont des familles comme les autres), puis « Historique des saisies » en bloc replié, fermé au départ.
// Le bouton « Filtres » (fenêtre commune de la coque) a deux critères : famille(s) et « À traiter seulement ». Les routes tableaudebord/technique|finance|stocks|historique
// ouvrent ce même écran et descendent au bloc concerné (signets conservés).
// Le niveau montré est recalculé ICI (échéance, relevé trop ancien) et chaque minute : un relevé qui vieillit devient gris sans rechargement.
// Texte affiché : toujours en texte simple (h() ne fabrique jamais de HTML).
// Saisie : un indicateur « manuel » ou « semi » a un bouton « Saisir la date » (ou « Saisir la valeur ») qui ouvre une zone SOUS sa ligne. L'écran n'écrit jamais lui-même
// dans la base : « Enregistrer » appelle la fonction du serveur (D.saisir), et le niveau change tout seul par la lecture en direct.
import { h, icone, remplir } from '../../os/ui.js';
import { boutonFiltres, fenetreFiltres } from '../crm/filtres.js';
import * as D from './donnees.js';
import * as L from './logique.js';

export const MESSAGE_VIDE = 'Aucun indicateur pour l\'instant. Les relevés arrivent chaque jour, après le premier passage des scripts de surveillance.';
export const MESSAGE_CHARGEMENT = 'Chargement des indicateurs…';
export const MESSAGE_ERREUR = 'Impossible de lire les indicateurs pour le moment. Vérifie ta connexion à internet, puis clique sur « Réessayer ».';
export const MESSAGE_RIEN_A_TRAITER = 'Rien à traiter.';
export const SANS_RESULTAT = 'Aucun indicateur pour ces filtres.';

// Filtres de l'écran : gardés tant que la page reste ouverte. `familles` = valeurs cochées (vide = toutes).
const filtres = { traiter: false, familles: [] };
// Familles repliées par l'utilisateur (une famille est ouverte par défaut) ; gardées tant que la page reste ouverte.
const replies = new Set();

// Saisie en cours (une seule zone ouverte à la fois). Le brouillon vit ici : l'écran se reconstruit à chaque changement de la base sans perdre ce qui est tapé.
const saisie = { id: null, ou: 'familles', brouillon: '', note: '', envoi: false, erreur: '' };
const videSaisie = () => Object.assign(saisie, { id: null, ou: 'familles', brouillon: '', note: '', envoi: false, erreur: '' });
export const TEXTE_ENREGISTRE = 'Enregistré';
export const MESSAGE_HISTORIQUE_VIDE = 'Aucune saisie pour l\'instant. Quand tu saisis une date ou une valeur, elle apparaît ici avec ton nom et l\'heure.';
export const MESSAGE_HISTORIQUE_CHARGEMENT = 'Chargement des saisies…';
export const MESSAGE_HISTORIQUE_ERREUR = 'Impossible de lire l\'historique des saisies pour le moment. Vérifie ta connexion à internet, puis clique sur « Réessayer ».';
export const LIBELLE_BLOC_HISTORIQUE = 'Historique des saisies';

// ---------------------------------------------------------------- pictogrammes (icône + mot : l'état n'est jamais montré par la couleur seule)
const SVG_NS = 'http://www.w3.org/2000/svg';
const CERCLE = '<circle cx="8" cy="8" r="7"/>';
const PICTOS = {
  vert: `${CERCLE}<path d="M4.8 8.4l2.2 2.2 4.2-4.6"/>`,
  orange: '<path d="M8 1.8l6.6 11.6H1.4z"/><path d="M8 6.4v3.2M8 11.4v.1"/>',
  rouge: `${CERCLE}<path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2"/>`,
  gris: `${CERCLE}<path d="M8 4.4V8l2.4 1.6"/>`,
};
function pictogramme(niveau) {
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg xmlns="${SVG_NS}" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PICTOS[niveau]}</svg>`;
  return tpl.content.firstElementChild;
}

/** Pastille d'état : icône ET mot. */
function pastille(niveau, texte = L.LIBELLES[niveau]) {
  return h('span', { class: `td-pastille td-n-${niveau}`, dataset: { pastille: niveau } }, pictogramme(niveau), h('span', {}, texte));
}

const texteReleve = (ms, maintenant) => (Number.isFinite(ms) ? `relevé ${L.depuis(ms, maintenant)}` : 'date de relevé inconnue');

function ligne(i, maintenant, { avecFamille = false, surSaisie = null, ou = 'familles', emplacementSaisie = 'familles' } = {}) {
  const niveau = L.niveauEffectif(i, maintenant);
  const valeur = i.type === 'mesure' ? L.texteValeur(i.valeur, i.unite) : '';
  const echeance = L.texteEcheance(i.echeanceMs, maintenant);
  return h('li', { class: 'td-ligne', dataset: { id: i.id, niveau: niveau ?? 'sans' } },
    h('div', { class: 'td-nom' }, i.nom, avecFamille ? h('small', {}, L.nomFamille(i.famille)) : null),
    h('div', { class: 'td-etat' }, valeur ? h('span', { class: 'td-valeur' }, valeur) : null, niveau ? pastille(niveau) : null),
    h('div', { class: 'td-detail' },
      i.message ? [h('span', { class: 'td-message' }, i.message), ' · '] : null,
      h('span', { class: 'td-releve', dataset: { releve: Number.isFinite(i.releveMs) ? i.releveMs : '' } }, texteReleve(i.releveMs, maintenant)),
      echeance ? h('div', { class: 'td-echeance' }, echeance) : null),
    h('div', { class: 'td-outils' },
      L.LIBELLES_METHODE[i.methode] ? h('span', { class: 'td-methode', title: L.AIDE_METHODE[i.methode] }, L.LIBELLES_METHODE[i.methode]) : null,
      i.procedure ? h('span', { class: 'td-procedure' }, `Procédure : ${i.procedure}`) : null,
      surSaisie && L.peutSaisir(i) && saisie.id !== i.id
        ? h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { saisir: i.id, focus: `saisir-${ou}-${i.id}` }, onclick: () => surSaisie.ouvrir(i, ou) }, L.libelleSaisie(i)) : null),
    surSaisie && L.peutSaisir(i) && saisie.id === i.id && emplacementSaisie === ou ? zoneSaisie(i, surSaisie) : null);
}

/** Zone de saisie sous la ligne : un champ (date ou nombre), une note facultative, « Enregistrer » et « Annuler ». Pas de fenêtre. */
function zoneSaisie(i, actions) {
  const mesure = i.type === 'mesure';
  const idChamp = `td-saisie-${L.idFamille(i.id)}`;
  const champ = h('input', {
    class: 'champ', id: idChamp, type: mesure ? 'number' : 'date', step: mesure ? 'any' : null, value: saisie.brouillon, disabled: saisie.envoi,
    dataset: { focus: 'saisie-champ' }, oninput: (e) => { saisie.brouillon = e.target.value; },
  });
  const note = h('input', {
    class: 'champ', id: `${idChamp}-note`, type: 'text', maxlength: '200', value: saisie.note, disabled: saisie.envoi,
    dataset: { focus: 'saisie-note' }, oninput: (e) => { saisie.note = e.target.value; },
  });
  return h('form', {
    class: 'td-saisie', novalidate: true, dataset: { saisie: i.id },
    onsubmit: (e) => { e.preventDefault(); if (!saisie.envoi) actions.enregistrer(i); },
    onkeydown: (e) => { if (e.key === 'Escape' && !saisie.envoi) { e.stopPropagation(); actions.annuler(i); } },
  },
  h('div', { class: 'bloc-champ td-saisie-champ' }, h('label', { class: 'etiquette', for: idChamp }, mesure ? 'Nouvelle valeur' : 'Nouvelle date d\'échéance'), champ),
  h('div', { class: 'bloc-champ td-saisie-note' }, h('label', { class: 'etiquette', for: `${idChamp}-note` }, 'Note (facultatif)'), note),
  h('div', { class: 'groupe-boutons td-saisie-actions' },
    h('button', { type: 'submit', class: 'bouton bouton-principal bouton-petit', disabled: saisie.envoi, dataset: { role: 'enregistrer' } }, saisie.envoi ? 'Envoi…' : 'Enregistrer'),
    h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', disabled: saisie.envoi, dataset: { role: 'annuler' }, onclick: () => actions.annuler(i) }, 'Annuler')),
  saisie.erreur ? h('p', { class: 'td-saisie-erreur', role: 'alert' }, saisie.erreur) : null);
}

function compteursPastilles(c, { tous = false } = {}) {
  return h('div', { class: 'td-compteurs' }, L.NIVEAUX.filter((n) => tous || c[n]).map((n) => {
    const p = pastille(n, L.libelleCompteur(n, c[n]));
    p.dataset.compteur = n;
    return p;
  }));
}

// ---------------------------------------------------------------- haut de l'écran : phrase d'état, compteurs, à traiter en premier
function vueGenerale(tous, maintenant, actions, emplacementSaisie) {
  const c = L.compter(tous, maintenant);
  const phrase = L.phraseGlobale(c);
  const niveau = L.niveauGlobal(c);
  const aFaire = L.listeATraiter(tous, maintenant);
  const releves = tous.map((i) => i.releveMs).filter(Number.isFinite);
  const dernier = releves.length ? Math.max(...releves) : null;
  return [
    h('section', { class: 'td-panneau td-global', 'aria-labelledby': 'td-phrase' },
      h('div', { class: 'td-global-texte' },
        h('h2', { id: 'td-phrase', class: `td-phrase td-t-${niveau}`, dataset: { niveau } }, pictogramme(niveau), h('span', {}, phrase)),
        dernier !== null ? h('small', { class: 'td-aide' }, 'Dernier relevé du système : ', h('span', { dataset: { releve: dernier } }, L.depuis(dernier, maintenant))) : null),
      compteursPastilles(c, { tous: true })),
    h('section', { class: 'td-panneau', 'aria-labelledby': 'td-a-traiter' },
      h('h2', { id: 'td-a-traiter' }, 'À traiter en premier'),
      aFaire.length ? h('ul', { class: 'td-liste', dataset: { liste: 'a-traiter' } }, aFaire.map((i) => ligne(i, maintenant, { avecFamille: true, surSaisie: actions, ou: 'a-traiter', emplacementSaisie })))
        : h('p', { class: 'td-vide td-rien' }, MESSAGE_RIEN_A_TRAITER)),
  ];
}

// ---------------------------------------------------------------- blocs par famille (tous les indicateurs : Clés, Sauvegardes… mais aussi Finance et Stocks quand un indicateur les porte)
/** Indicateurs que les filtres laissent voir : « À traiter seulement » ET (famille 1 OU famille 2…). */
function indicateursFiltres(tous, maintenant) {
  const restants = L.filtrer(tous, { traiter: filtres.traiter }, maintenant);
  return filtres.familles.length ? restants.filter((i) => filtres.familles.includes(i.famille || '')) : restants;
}

function vueParFamille(tous, maintenant, actions, emplacementSaisie) {
  const visibles = indicateursFiltres(tous, maintenant);
  const groupes = L.regrouperParFamille(visibles, maintenant, tous);
  return h('section', { class: 'td-tous', 'aria-labelledby': 'td-tous' },
    h('h2', { id: 'td-tous', class: 'td-titre-section' }, 'Tous les indicateurs'),
    groupes.length
      ? groupes.map((g) => h('details', {
        class: 'td-panneau td-famille', open: !replies.has(g.famille),
        dataset: { famille: g.famille, tableaux: [...new Set(tous.filter((i) => (i.famille || '') === g.famille).map((i) => i.tableau))].join(' ') },
        ontoggle: (e) => { if (e.currentTarget.open) replies.delete(g.famille); else replies.add(g.famille); },
      },
      h('summary', { class: 'td-resume-bloc' }, h('h2', { id: L.idFamille(g.famille) }, g.titre), compteursPastilles(g.compteurs)),
      h('ul', { class: 'td-liste' }, g.indicateurs.map((i) => ligne(i, maintenant, { surSaisie: actions, ou: 'familles', emplacementSaisie })))))
      : h('p', { class: 'td-vide td-rien' }, filtres.traiter ? MESSAGE_RIEN_A_TRAITER : SANS_RESULTAT));
}

// ---------------------------------------------------------------- bloc « Historique des saisies » (replié en bas de page)
/** Liste du plus récent au plus ancien : date et heure, auteur, indicateur, « avant → après », note. */
function vueHistorique(saisies, indicateurs) {
  const parId = new Map(indicateurs.map((i) => [i.id, i]));
  return h('ul', { class: 'td-liste td-historique', dataset: { liste: 'historique' } }, saisies.map((s) => {
    const ind = parId.get(s.indicateurId);
    return h('li', { class: 'td-h-ligne', dataset: { id: s.id } },
      h('div', { class: 'td-h-quand' }, L.dateHeure(s.releveMs)),
      h('div', { class: 'td-h-qui' }, s.auteur ?? 'auteur inconnu'),
      h('div', { class: 'td-h-nom' }, ind?.nom ?? s.indicateurId),
      h('div', { class: 'td-h-change' }, L.texteAvantApres(s, ind?.unite)),
      s.commentaire ? h('div', { class: 'td-h-note' }, s.commentaire) : null);
  }));
}

// ---------------------------------------------------------------- montage
/**
 * Monte l'écran unique. `ancre` = la route demandée ('general', 'technique', 'finance', 'stocks', 'historique') : toutes ouvrent le même écran,
 * les quatre dernières descendent au bloc concerné. Renvoie la fonction qui l'arrête ; `quitter.aller(ancre)` change d'ancre sans tout reconstruire.
 */
export function rendreTableau(conteneur, ancre) {
  const barreFiltres = h('div', { class: 'td-filtres' });
  const zonePastilles = h('div', { class: 'pastilles-actives td-pastilles' });
  const zonePrincipale = h('div', { class: 'td-zone' });
  const corpsHistorique = h('div', { class: 'td-historique-corps' });
  const blocHistorique = h('details', {
    class: 'td-panneau td-bloc-historique', id: 'td-bloc-historique', dataset: { role: 'historique' },
    ontoggle: () => { if (blocHistorique.open) { demarrerHistorique(); rendreHistorique(); } else { signatureH = ''; remplir(corpsHistorique); } },
  }, h('summary', { class: 'td-resume-bloc' }, h('h2', { id: 'td-historique' }, LIBELLE_BLOC_HISTORIQUE)), corpsHistorique);
  const contenu = h('div', { class: 'td-contenu' }, zonePrincipale, blocHistorique);
  // Confirmation d'une saisie : hors de `contenu`, car la ligne saisie peut disparaître de la liste (un indicateur redevenu OK quitte « À traiter en premier »).
  const avis = h('div', { class: 'td-avis', role: 'status' });
  let signature = '';
  let signatureH = '';
  let actif = true;
  let minuteurAvis = null;
  let historiqueDemarre = false;
  let ancreEnAttente = ancre;
  videSaisie();

  const boutonF = boutonFiltres({ auClic: async () => {
    const possibles = L.famillesPossibles(D.etat.indicateurs, { traiter: filtres.traiter }, Date.now());
    const r = await fenetreFiltres({
      controles: [
        { cle: 'familles', libelle: 'Famille', type: 'cases', options: possibles.map((f) => ({ valeur: f.valeur, libelle: f.libelle })) },
        { cle: 'traiter', libelle: 'À traiter seulement', type: 'oui' },
      ],
      criteres: { traiter: filtres.traiter, familles: filtres.familles },
      effacer: () => ({ traiter: false, familles: [] }),
    });
    boutonF.element.focus();
    if (!r) return;
    filtres.traiter = !!r.traiter;
    filtres.familles = [...(r.familles || [])];
    signature = '';
    rendre();
  } });
  remplir(barreFiltres, boutonF.element, zonePastilles);

  conteneur.append(h('div', { class: 'page page-tableaudebord' },
    h('header', { class: 'page-tete' }, h('h1', {}, 'Maintenance')),
    barreFiltres, avis, contenu));

  function annoncer(nom, rappel) {
    clearTimeout(minuteurAvis);
    remplir(avis, h('p', { class: 'td-avis-texte' }, h('strong', {}, TEXTE_ENREGISTRE), ` · ${nom}. ${rappel ?? ''}`.trimEnd()));
    minuteurAvis = setTimeout(() => remplir(avis), 10000);
  }
  const actions = {
    ouvrir(i, ou = 'familles') { clearTimeout(minuteurAvis); remplir(avis); Object.assign(saisie, { id: i.id, ou, brouillon: '', note: '', envoi: false, erreur: '' }); rendre(); contenu.querySelector('[data-focus="saisie-champ"]')?.focus(); },
    annuler(i) {
      const ou = saisie.ou;
      videSaisie();
      rendre();
      (contenu.querySelector(`[data-focus="saisir-${ou}-${i.id}"]`) ?? contenu.querySelector(`[data-focus="saisir-familles-${i.id}"]`))?.focus();
    },
    async enregistrer(i) {
      const brut = saisie.brouillon.trim();
      const mesure = i.type === 'mesure';
      const nombre = mesure ? Number(brut.replace(',', '.')) : null;
      if (!brut || (mesure && !Number.isFinite(nombre))) {
        saisie.erreur = mesure ? 'Entre un nombre.' : 'Choisis une date.';
        rendre();
        return;
      }
      const demande = { indicateurId: i.id };
      if (mesure) demande.valeur = nombre; else demande.echeance = brut;
      if (saisie.note.trim()) demande.commentaire = saisie.note.trim();
      saisie.envoi = true;
      saisie.erreur = '';
      rendre();
      try {
        const r = await D.saisir(demande);
        if (!actif) return;
        videSaisie();
        annoncer(i.nom, r?.rappel);
      } catch (e) {
        if (!actif) return;
        saisie.envoi = false;
        saisie.erreur = e.message;
      }
      rendre();
    },
  };

  function etatSimple(classe, texte, role, bouton = null) {
    return h('div', { class: `td-etat-ecran ${classe}`, role }, h('p', {}, texte), bouton);
  }

  /** Puces des filtres actifs (retirables) et pastille de compte du bouton « Filtres ». */
  function majFiltres(possibles, pret) {
    const actifs = [
      ...(filtres.traiter ? [{ libelle: 'À traiter seulement', retirer: () => { filtres.traiter = false; } }] : []),
      ...filtres.familles.map((f) => ({ libelle: possibles.find((p) => p.valeur === f)?.libelle ?? L.nomFamille(f), retirer: () => { filtres.familles = filtres.familles.filter((x) => x !== f); } })),
    ];
    const retirer = (p) => { p.retirer(); signature = ''; rendre(); boutonF.element.focus(); };
    boutonF.majCompte(actifs.length);
    boutonF.element.disabled = !pret; // rien à filtrer (chargement, erreur de lecture, aucun indicateur) : le bouton est grisé
    remplir(zonePastilles,
      actifs.map((p) => h('span', { class: 'pastille-filtre', dataset: { filtre: p.libelle } }, p.libelle,
        h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': `Retirer le filtre : ${p.libelle}`, onclick: () => retirer(p) }, icone('x', { taille: 12 })))),
      actifs.length > 1 ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => { filtres.traiter = false; filtres.familles = []; signature = ''; rendre(); boutonF.element.focus(); } }, 'Tout effacer') : null);
  }

  function rendre() {
    const maintenant = Date.now();
    const tous = D.etat.indicateurs;
    const lignes = tous.map((i) => [i.id, i.tableau, i.famille, i.nom, i.type, L.niveauEffectif(i, maintenant), i.message, i.valeur, i.unite, i.methode, i.procedure,
      L.texteEcheance(i.echeanceMs, maintenant), i.releveMs]);
    const sig = JSON.stringify([D.etat.erreur, D.etat.pret, filtres, lignes, saisie.id, saisie.ou, saisie.envoi, saisie.erreur]);
    if (sig !== signature) {
      signature = sig;
      const focus = document.activeElement?.dataset?.focus ?? null;
      const pret = D.etat.pret && !D.etat.erreur && tous.length > 0;
      const possibles = L.famillesPossibles(tous, { traiter: filtres.traiter }, maintenant);
      // Chaque liste ne propose que les valeurs possibles : une famille cochée qui n'a plus rien à traiter est retirée.
      filtres.familles = filtres.familles.filter((f) => possibles.some((p) => p.valeur === f));
      if (D.etat.erreur) {
        remplir(zonePrincipale, etatSimple('td-erreur', MESSAGE_ERREUR, 'alert',
          h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { role: 'reessayer' }, onclick: () => D.reessayer() }, 'Réessayer')));
      } else if (!D.etat.pret) {
        remplir(zonePrincipale, etatSimple('td-chargement', MESSAGE_CHARGEMENT, 'status'));
      } else if (tous.length === 0) {
        remplir(zonePrincipale, etatSimple('td-vide', MESSAGE_VIDE, 'status'));
      } else {
        // La zone de saisie vit dans « À traiter en premier » si on l'y a ouverte et que la ligne y est encore ; sinon dans son bloc de famille.
        const dansATraiter = L.listeATraiter(tous, maintenant).some((i) => i.id === saisie.id);
        const emplacementSaisie = saisie.ou === 'a-traiter' && dansATraiter ? 'a-traiter' : 'familles';
        remplir(zonePrincipale, vueGenerale(tous, maintenant, actions, emplacementSaisie), vueParFamille(tous, maintenant, actions, emplacementSaisie));
      }
      majFiltres(possibles, pret);
      if (focus) contenu.querySelector(`[data-focus="${focus}"]`)?.focus();
    }
    majDepuis(maintenant);
    descendre();
    if (blocHistorique.open) rendreHistorique();
  }

  function demarrerHistorique() {
    if (historiqueDemarre) return;
    historiqueDemarre = true;
    D.demarrerHistorique(); // la lecture des saisies ne démarre qu'à l'ouverture du bloc
  }

  function rendreHistorique() {
    const H = D.historique;
    const saisies = L.saisiesRecentes(H.saisies);
    const sig = JSON.stringify(['historique', H.erreur, H.pret, saisies, D.etat.indicateurs.map((i) => [i.id, i.nom, i.unite])]);
    if (sig === signatureH) return;
    signatureH = sig;
    const focus = document.activeElement?.dataset?.focus ?? null;
    if (H.erreur) {
      remplir(corpsHistorique, etatSimple('td-erreur', MESSAGE_HISTORIQUE_ERREUR, 'alert',
        h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { role: 'reessayer' }, onclick: () => D.reessayerHistorique() }, 'Réessayer')));
    } else if (!H.pret) {
      remplir(corpsHistorique, etatSimple('td-chargement', MESSAGE_HISTORIQUE_CHARGEMENT, 'status'));
    } else if (saisies.length === 0) {
      remplir(corpsHistorique, etatSimple('td-vide', MESSAGE_HISTORIQUE_VIDE, 'status'));
    } else {
      remplir(corpsHistorique, vueHistorique(saisies, D.etat.indicateurs));
    }
    if (focus) contenu.querySelector(`[data-focus="${focus}"]`)?.focus();
  }

  /** Les routes tableaudebord/technique|finance|stocks|historique : ouvrir le bloc concerné et y descendre (une seule fois, dès qu'il existe). */
  function descendre() {
    const demande = ancreEnAttente;
    if (!demande || demande === 'general') { ancreEnAttente = null; return; }
    if (demande === 'historique') {
      ancreEnAttente = null;
      if (!blocHistorique.open) { blocHistorique.open = true; demarrerHistorique(); rendreHistorique(); }
      blocHistorique.scrollIntoView({ block: 'start' });
      return;
    }
    if (!D.etat.pret && !D.etat.erreur) return; // les blocs n'existent pas encore : on attend la lecture
    ancreEnAttente = null;
    const cible = contenu.querySelector(`.td-famille[data-tableaux~="${demande}"]`);
    if (!cible) return;
    if (!cible.open) cible.open = true; // l'événement « toggle » retire la famille des repliées
    cible.scrollIntoView({ block: 'start' });
  }

  /** Les « relevé il y a … » avancent sans reconstruire la liste (le focus et le défilement ne bougent pas). */
  function majDepuis(maintenant) {
    contenu.querySelectorAll('.td-releve[data-releve]').forEach((el) => { el.textContent = texteReleve(el.dataset.releve === '' ? NaN : Number(el.dataset.releve), maintenant); });
    contenu.querySelectorAll('.td-aide [data-releve]').forEach((el) => { el.textContent = L.depuis(Number(el.dataset.releve), maintenant); });
  }

  const arretDonnees = D.surChangement(rendre);
  const minuteur = setInterval(rendre, L.MINUTE); // chaque minute : « il y a … » et passage au gris
  rendre();
  function quitter() {
    actif = false;
    clearTimeout(minuteurAvis);
    clearInterval(minuteur);
    arretDonnees();
    if (historiqueDemarre) D.arreterHistorique();
  }
  quitter.aller = (nouvelle) => { ancreEnAttente = nouvelle; rendre(); };
  return quitter;
}
