// Colonne de droite des fiches : onglets Activité / Notes, Points clés, Historique.
// Partagée par les fiches personne, organisation et affaire.
import { h, icone, remplir, dialogue, confirmer, ouvrirMenu, toast } from '../../os/ui.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { decouperLiens } from './liens-texte.js';
import { boutonFiltres, fenetreFiltres } from './filtres.js';
import { iconeTypeActivite, lienAffaire, lienPersonne, lienOrganisation, nomCompte } from './composants.js';

/** Texte d'une note en nœuds : texte simple et liens (nouvel onglet). Jamais d'innerHTML : le texte reste du texte. */
export function noeudsTexte(texte) {
  return decouperLiens(texte).map((m) => (m.href
    ? h('a', { class: 'lien-note', href: m.href, target: '_blank', rel: 'noopener noreferrer' }, m.texte)
    : document.createTextNode(m.texte)));
}

/**
 * Modification d'une note sur place (note du fil et note épinglée) : un champ, « Enregistrer », « Annuler ».
 * `corps` : l'élément dont le contenu est remplacé ; `fermer()` redessine la zone (après l'enregistrement ou l'annulation).
 */
function modifierNoteSurPlace(n, corps, fermer) {
  const zone = h('textarea', { class: 'champ', rows: 4, 'aria-label': 'Modifier la note', value: n.texte });
  let boutonEnregistrer = null;
  const sauve = async () => {
    if (!L.nettoyerEspaces(zone.value)) { toast('Écris quelque chose, ou clique sur Annuler.', { type: 'erreur' }); return; }
    boutonEnregistrer.disabled = true; // un double clic ne doit pas écrire deux fois
    try { await D.majNote(n.id, zone.value); fermer(); } catch (e) { console.warn(e); boutonEnregistrer.disabled = false; toast('Modification impossible', { type: 'erreur' }); }
  };
  boutonEnregistrer = h('button', { type: 'button', class: 'bouton bouton-principal bouton-petit', 'data-action': 'enregistrer-note', onclick: sauve }, 'Enregistrer');
  corps.replaceChildren(zone, h('div', { class: 'note-actions' },
    boutonEnregistrer,
    h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', onclick: fermer }, 'Annuler')));
  zone.focus();
}

const LIBELLES_ETAT = { retard: 'En retard', aujourdhui: "Aujourd'hui", avenir: '' };

/** Boutons de date rapide + sélecteur de date. Renvoie { element, valeur(), definir(jour) }. */
export function selecteurDate(jourInitial) {
  const champ = h('input', { class: 'champ', type: 'date', 'aria-label': 'Date', value: jourInitial });
  const aujourdhui = D.ctx().aujourdhui;
  const boutons = L.DATES_RAPIDES.map((b) => h('button', {
    type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-date-rapide': b.id,
    onclick: () => { champ.value = L.dateRapide(b.id, aujourdhui); champ.dispatchEvent(new Event('change')); },
  }, b.libelle));
  return {
    element: h('div', { class: 'selecteur-date' }, h('div', { class: 'dates-rapides' }, boutons), champ),
    champ,
    valeur: () => champ.value,
  };
}

/**
 * Fenêtre "Planifier une activité" (suggestions douces, "prochaine activité" après un "Fait").
 * valeurs : { type, titre, date }. Renvoie l'identifiant créé, ou null si la fenêtre est fermée.
 */
export async function dialogueActivite({ liens, titre = 'Planifier une activité', valeurs = {}, libelleOk = 'Planifier', libelleFermer = 'Plus tard' }) {
  const aujourdhui = D.ctx().aujourdhui;
  let type = valeurs.type || 'tache';
  const champTitre = h('input', { class: 'champ', type: 'text', 'aria-label': 'Titre de l’activité', value: valeurs.titre ?? L.titreActiviteParDefaut(type) });
  const date = selecteurDate(valeurs.date || aujourdhui);
  const heure = h('input', { class: 'champ champ-court', type: 'time', 'aria-label': 'Heure (facultatif)' });
  const types = h('div', { class: 'types-activite', role: 'group', 'aria-label': 'Type d’activité' });
  function rendreTypes() {
    remplir(types, L.TYPES_ACTIVITE.map((t) => h('button', {
      type: 'button', class: `pastille-type${t.id === type ? ' actif' : ''}`, 'aria-pressed': String(t.id === type),
      onclick: () => {
        if (champTitre.value === L.titreActiviteParDefaut(type)) champTitre.value = L.titreActiviteParDefaut(t.id);
        type = t.id;
        rendreTypes();
      },
    }, iconeTypeActivite(t.id), t.libelle)));
  }
  rendreTypes();
  let identifiant = null;
  const r = await dialogue({
    titre,
    classe: 'dialogue-formulaire',
    contenu: h('div', { class: 'pile' }, types,
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Titre'), champTitre),
      h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Date'), date.element),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Heure'), heure)),
    boutons: [
      { libelle: libelleFermer, valeur: null },
      {
        libelle: libelleOk, valeur: true, style: 'principal',
        avantFermeture: async () => {
          const v = { type, titre: champTitre.value, date: date.valeur(), heure: heure.value, ...liens };
          if (Object.keys(L.validerActivite(v)).length) { toast('Choisis une date.', { type: 'erreur' }); return false; }
          identifiant = await D.creerActivite(v);
          return true;
        },
      },
    ],
  });
  return r ? identifiant : null;
}

/** Après un "Fait" : propose la prochaine activité (ignorable). */
export function proposerProchaineActivite(liens) {
  return dialogueActivite({
    liens, titre: 'Prochaine activité ?', libelleOk: 'Planifier',
    valeurs: { type: 'tache', titre: 'Relancer', date: L.dateRapide('3j', D.ctx().aujourdhui) },
  });
}

/** "Fait" sur une activité : enregistre, puis propose la suivante. */
export async function faireActivite(activite, { proposer = true } = {}) {
  await D.marquerActiviteFaite(activite.id);
  if (proposer) {
    const liens = { personneId: activite.personneId ?? null, organisationId: activite.organisationId ?? null, affaireId: activite.affaireId ?? null, ...(activite.projetId ? { projetId: activite.projetId } : {}) };
    await proposerProchaineActivite(liens);
  }
}

/**
 * Clic sur « En retard » ou sur la date : fenêtre pour déplacer l'activité.
 * L'heure se règle d'abord ; un clic sur un raccourci (Demain, +3 jours…) ou un changement de date enregistre et ferme.
 * « Enregistrer » sert quand on ne change que l'heure.
 */
export async function dialogueDecalage(a, { enregistrerPatch = (patch) => D.majActivite(a.id, patch), sansDate = false } = {}) {
  const date = selecteurDate(a.date);
  const heure = h('input', { class: 'champ champ-court', type: 'time', 'aria-label': 'Heure (facultatif)', value: a.heure || '' });
  let fermerFenetre = () => {};
  let enCours = false;
  async function enregistrer() {
    if (enCours) return false;
    if (!date.valeur() && !sansDate) { toast('Choisis une date.', { type: 'erreur' }); return false; }
    enCours = true;
    try {
      await enregistrerPatch({ date: date.valeur(), heure: date.valeur() ? heure.value : '' });
      return true;
    } catch (e) {
      console.warn(e);
      toast('Modification impossible', { type: 'erreur' });
      enCours = false;
      return false;
    }
  }
  // Raccourcis : changement simulé → on enregistre tout de suite. Date saisie ou choisie dans le calendrier : petite attente,
  // pour ne pas fermer pendant qu'on tape le jour puis le mois au clavier.
  let attente = null;
  date.champ.addEventListener('change', (e) => {
    clearTimeout(attente);
    const lancer = async () => { if (await enregistrer()) fermerFenetre(null); };
    if (e.isTrusted) attente = setTimeout(lancer, 700); else lancer();
  });
  await dialogue({
    titre: 'Changer la date',
    classe: 'dialogue-formulaire',
    auMontage: ({ fermer }) => { fermerFenetre = fermer; },
    contenu: h('div', { class: 'pile' },
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Heure'), heure),
      h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Date'), date.element,
        sansDate ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', dataset: { action: 'effacer-date' }, onclick: async () => { date.champ.value = ''; heure.value = ''; if (await enregistrer()) fermerFenetre(null); } }, 'Sans date') : null)),
    boutons: [
      { libelle: 'Annuler', valeur: null },
      { libelle: 'Enregistrer', valeur: true, style: 'principal', avantFermeture: enregistrer },
    ],
  });
  clearTimeout(attente);
}

/** Titre cliquable : un clic le transforme en champ ; Entrée ou clic ailleurs enregistre, Échap annule. */
function titreModifiable(a) {
  const el = h('strong', { class: 'activite-titre-modifiable', tabindex: '0', role: 'button', title: 'Cliquer pour modifier le texte' }, a.titre);
  function editer() {
    const champ = h('input', { class: 'champ', type: 'text', 'aria-label': 'Modifier le texte de l’activité', value: a.titre });
    let fini = false;
    const terminer = async (enregistrer) => {
      if (fini) return;
      fini = true;
      const texte = L.nettoyerEspaces(champ.value);
      if (enregistrer && texte && texte !== a.titre) {
        try { await D.majActivite(a.id, { titre: texte }); return; } catch (e) { console.warn(e); toast('Modification impossible', { type: 'erreur' }); }
      }
      champ.replaceWith(el);
    };
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); terminer(true); } else if (e.key === 'Escape') terminer(false);
    });
    champ.addEventListener('blur', () => terminer(true));
    el.replaceWith(champ);
    champ.focus();
    champ.select();
  }
  el.addEventListener('click', editer);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') editer(); });
  return el;
}

const LIENS_RATTACHEMENT = { affaire: lienAffaire, personne: lienPersonne, organisation: lienOrganisation };

/** Ligne d'activité à faire (Points clés). `tousRattachements` (accueil) : affaire, sinon personne, sinon organisation. */
export function ligneActivite(a, aujourdhui, { avecAffaire = true, tousRattachements = false, surFait = null } = {}) {
  const etat = L.estActiviteEnRetard(a, aujourdhui) ? 'retard' : a.date === aujourdhui ? 'aujourdhui' : 'avenir';
  const rattachement = tousRattachements
    ? L.rattachementActivite(a, { affaire: D.affaire, personne: D.personne, organisation: D.organisation })
    : null;
  const affaire = !tousRattachements && avecAffaire && a.affaireId ? D.affaire(a.affaireId) : null;
  const bouton = h('button', { type: 'button', class: 'case-fait', 'aria-label': `Marquer comme fait : ${a.titre}`, title: 'Fait',
    onclick: () => (surFait ? surFait(a) : faireActivite(a)) }, icone('check', { taille: 14 }));
  const menu = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Actions : ${a.titre}`,
    onclick: (e) => ouvrirMenu(e.currentTarget, [
      { libelle: 'Supprimer', icone: 'trash-2', danger: true, action: () => retirerAvecAnnulation({
        titre: 'Supprimer cette activité ?', message: a.titre, libelleOk: 'Supprimer', danger: true,
        faire: () => D.supprimerActivite(a.id), defaire: () => D.restaurerActivite(a), messageFait: 'Activité supprimée' }) },
    ]) }, icone('ellipsis', { taille: 16 }));
  return h('li', { class: `activite activite-${etat}`, dataset: { activite: a.id } },
    bouton,
    h('span', { class: 'activite-type' }, iconeTypeActivite(a.type)),
    h('div', { class: 'activite-texte' },
      titreModifiable(a),
      h('span', { class: 'activite-meta' },
        etat !== 'avenir' ? h('button', { type: 'button', class: `badge-etat ${etat}`, title: 'Changer la date', onclick: () => dialogueDecalage(a) }, LIBELLES_ETAT[etat]) : null,
        h('span', { class: 'activite-date-modifiable', role: 'button', tabindex: '0', title: 'Changer la date', onclick: () => dialogueDecalage(a),
          onkeydown: (e) => { if (e.key === 'Enter') dialogueDecalage(a); } }, L.formatJourCourt(a.date, aujourdhui), a.heure ? ` à ${a.heure.replace(':', ' h ')}` : ''),
        rattachement ? LIENS_RATTACHEMENT[rattachement.type](rattachement.fiche) : null,
        affaire ? lienAffaire(affaire) : null)),
    menu);
}

// Types cochés dans la fenêtre « Filtres » de l'historique (J1) : mémorisés jusqu'au rechargement de la page, partagés par toutes les fiches (pas de stockage navigateur).
let typesHistorique = [];

/**
 * Panneau complet. lien : { personneId } | { organisationId } | { affaireId } (filtre de la fiche).
 * liensCreation() : liens à poser sur ce qu'on crée (personneId, organisationId, affaireId).
 * `affaireLiee: { affaireId, fusionnerNotes(notesDeLaFiche, notesDeLAffaire) }` (fiche projet) : montre aussi les notes de l'affaire, en lecture seule
 * (les notes marquées `deAffaire` n'ont ni « Modifier » ni « Supprimer » : elles restent sur l'affaire).
 * `avecActivites: false` : ni onglet « Activité », ni Points clés, seulement les notes et l'historique (plus utilisé : la fiche projet a retrouvé ses activités).
 * `avecDocuments` : ajoute un onglet « Documents » (après Notes) ; la fiche y met son contenu par `majDocuments({ element, compteur })` (appelée à chaque fois que la fiche est redessinée).
 * `typesActivite` : identifiants des types proposés dans l'onglet Activité (par défaut tous, dans l'ordre de `L.TYPES_ACTIVITE`). Le type choisi au départ est le premier (Appel).
 */
export function panneauActivite({ lien, liensCreation, avecActivites = true, affaireLiee = null, typesActivite = null, avecDocuments = false }) {
  let fil = { notes: [], evenements: [] };
  let filAffaire = { notes: [] };
  let onglet = avecActivites ? 'activite' : 'notes';
  const typesProposes = L.TYPES_ACTIVITE.filter((t) => !typesActivite || typesActivite.includes(t.id));

  const zonePointsCles = h('div', { class: 'points-cles' });
  const zoneHistorique = h('div', { class: 'historique' });
  const racine = h('div', { class: 'panneau-activite' });

  // ---- compositeur (onglets Activité / Notes)
  let type = typesProposes.length ? typesProposes[0].id : L.TYPES_ACTIVITE[0].id; // le premier type de la liste (Appel), sur l’affaire comme sur le projet
  let titreModifie = false;
  const champTitre = h('input', { class: 'champ', type: 'text', 'aria-label': 'Titre de l’activité', placeholder: 'Clique ici pour ajouter une activité…', value: '',
    oninput: () => { titreModifie = true; } });
  const date = selecteurDate(D.ctx().aujourdhui);
  const champHeure = h('input', { class: 'champ champ-court', type: 'time', 'aria-label': 'Heure (facultatif)' });
  const types = h('div', { class: 'types-activite', role: 'group', 'aria-label': 'Type d’activité' });
  function rendreTypes() {
    remplir(types, typesProposes.map((t) => h('button', {
      type: 'button', class: `pastille-type${t.id === type ? ' actif' : ''}`, 'aria-pressed': String(t.id === type),
      onclick: () => { type = t.id; if (!titreModifie) champTitre.value = ''; rendreTypes(); champTitre.focus(); },
    }, iconeTypeActivite(t.id), t.libelle)));
  }
  rendreTypes();
  const boutonActivite = h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'enregistrer-activite', onclick: enregistrerActivite }, 'Enregistrer l’activité');
  async function enregistrerActivite() {
    const v = { type, titre: champTitre.value, date: date.valeur(), heure: champHeure.value, ...liensCreation() };
    if (Object.keys(L.validerActivite(v)).length) { toast('Choisis une date.', { type: 'erreur' }); return; }
    boutonActivite.disabled = true;
    try {
      await D.creerActivite(v);
      champTitre.value = '';
      titreModifie = false;
      champHeure.value = '';
      date.champ.value = D.ctx().aujourdhui;
      toast('Activité ajoutée');
      replier(true);
    } catch (e) {
      console.warn(e);
      toast('Ajout impossible', { type: 'erreur' });
    }
    boutonActivite.disabled = false;
  }
  const panneauActiviteSaisie = h('div', { class: 'compositeur-corps replie', role: 'tabpanel', 'aria-label': 'Activité' },
    types, champTitre, h('div', { class: 'ligne-date' }, date.element, champHeure), h('div', { class: 'compositeur-actions' }, boutonActivite));
  // Formulaire replié : une seule ligne « Clique ici… » ; les raccourcis, la date, l'heure et le bouton apparaissent dès qu'on y met le focus.
  function replier(oui) { panneauActiviteSaisie.classList.toggle('replie', oui); }
  panneauActiviteSaisie.addEventListener('focusin', () => replier(false));
  champTitre.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !champTitre.value) { replier(true); champTitre.blur(); } });

  const champNote = h('textarea', { class: 'champ', rows: 3, 'aria-label': 'Nouvelle note', placeholder: 'Écris une note (la dictée du clavier fonctionne ici)…' });
  const boutonNote = h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'ajouter-note', onclick: async () => {
    const texte = champNote.value;
    if (Object.keys(L.validerNote(texte)).length) return;
    boutonNote.disabled = true;
    try {
      await D.creerNote(texte, liensCreation());
      champNote.value = '';
    } catch (e) {
      console.warn(e);
      toast('Ajout impossible', { type: 'erreur' });
    }
    boutonNote.disabled = false;
  } }, 'Ajouter la note');
  const panneauNoteSaisie = h('div', { class: 'compositeur-corps', role: 'tabpanel', 'aria-label': 'Notes', hidden: avecActivites }, champNote, h('div', { class: 'compositeur-actions' }, boutonNote));

  const ongletActivite = h('button', { type: 'button', role: 'tab', class: 'onglet actif', 'aria-selected': 'true', onclick: () => choisirOnglet('activite') }, icone('calendar', { taille: 16 }), 'Activité');
  const ongletNotes = h('button', { type: 'button', role: 'tab', class: 'onglet', 'aria-selected': 'false', onclick: () => choisirOnglet('notes') }, icone('sticky-note', { taille: 16 }), 'Notes');
  // ---- onglet Documents (affaire et projet) : le contenu est fourni par la fiche
  const compteurDocuments = h('span', { class: 'compteur', dataset: { role: 'compteur-documents' } }, '0');
  const ongletDocuments = avecDocuments ? h('button', { type: 'button', role: 'tab', class: 'onglet', 'aria-selected': 'false', 'data-onglet': 'documents', onclick: () => choisirOnglet('documents') },
    icone('paperclip', { taille: 16 }), 'Documents', compteurDocuments) : null;
  const zoneDocuments = h('div', { class: 'pile' });
  const panneauDocuments = avecDocuments ? h('div', { class: 'compositeur-corps', role: 'tabpanel', 'aria-label': 'Documents', hidden: true }, zoneDocuments) : null;
  function choisirOnglet(o) {
    onglet = o;
    for (const [b, id] of [[ongletActivite, 'activite'], [ongletNotes, 'notes'], [ongletDocuments, 'documents']]) {
      if (!b) continue;
      b.classList.toggle('actif', id === o);
      b.setAttribute('aria-selected', String(id === o));
    }
    panneauActiviteSaisie.hidden = o !== 'activite';
    panneauNoteSaisie.hidden = o !== 'notes';
    if (panneauDocuments) panneauDocuments.hidden = o !== 'documents';
    if (o === 'activite') champTitre.focus();
    else if (o === 'notes') champNote.focus();
  }
  if (!avecActivites) {
    ongletNotes.classList.add('actif');
    ongletNotes.setAttribute('aria-selected', 'true');
    panneauActiviteSaisie.hidden = true;
  }
  const compositeur = h('div', { class: 'compositeur' }, h('div', { class: 'onglets', role: 'tablist' }, avecActivites ? ongletActivite : null, ongletNotes, ongletDocuments), panneauActiviteSaisie, panneauNoteSaisie, panneauDocuments);

  // ---- points clés et historique
  // Sans les copies en double (I5 : la note épinglée d'un projet créé depuis une affaire copie celle de l'affaire).
  const notesDeLaFiche = () => L.sansCopiesDeNote(affaireLiee ? affaireLiee.fusionnerNotes(fil.notes, filAffaire.notes) : fil.notes, lien);
  let toutDeploye = false;
  const boutonsPlier = new WeakMap(); // texte d'une note du fil -> son bouton Développer / Réduire
  /** Le bouton n'existe que si le texte dépasse la limite ; une note dépliée dont le texte tient (fenêtre élargie) n'a plus de « Réduire ». */
  function verifierNote(texte) {
    const bouton = boutonsPlier.get(texte);
    if (!bouton) return;
    if (!texte.classList.contains('deployee')) { bouton.hidden = !(texte.scrollHeight > texte.clientHeight + 1); return; }
    const style = getComputedStyle(texte);
    const limite = Number(style.getPropertyValue('--lignes-max')) * parseFloat(style.lineHeight);
    bouton.hidden = Number.isFinite(limite) && texte.getBoundingClientRect().height <= limite + 1;
  }
  const observateurNotes = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((entrees) => entrees.forEach((e) => verifierNote(e.target))) : null;
  const notesDeployees = new Set(); // notes du fil dépliées (« Développer »), gardées d'un redessin à l'autre
  let epingleeEnEdition = null; // identifiant de la note épinglée en cours de modification (on ne redessine pas dessous)
  let pointsClesEnAttente = false;
  function rendrePointsCles() {
    if (epingleeEnEdition) return;
    // Pas de nouveau rendu pendant qu'on écrit dans la note de départ vide (I5) : sinon le texte en cours serait perdu ; il est fait en quittant le champ.
    if (document.activeElement?.classList?.contains('champ-note-depart') && zonePointsCles.contains(document.activeElement)) { pointsClesEnAttente = true; return; }
    pointsClesEnAttente = false;
    const aujourdhui = D.ctx().aujourdhui;
    const liste = L.pointsClesFiche(D.activitesDe(lien), aujourdhui);
    const epinglees = L.notesEpinglees(notesDeLaFiche(), lien);
    remplir(zonePointsCles,
      h('div', { class: 'points-cles-tete' },
        h('h3', { class: 'sous-titre' }, 'Points clés'),
        epinglees.some((n) => !L.estNoteVide(n)) ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'data-action': 'developper-tout',
          onclick: () => { toutDeploye = !toutDeploye; rendrePointsCles(); } }, toutDeploye ? 'Réduire tout' : 'Développer tout') : null),
      epinglees.length ? h('ul', { class: 'liste-notes-epinglees' }, epinglees.map((n) => (L.estNoteVide(n) ? ligneNoteDeDepart(n) : ligneNoteEpinglee(n)))) : null,
      liste.length
        ? h('ul', { class: 'liste-activites' }, liste.map((a) => ligneActivite(a, aujourdhui)))
        : h('p', { class: 'aide' }, 'Aucune activité à faire.'));
  }

  /** Note épinglée : carte jaune en haut des Points clés ; le texte est coupé à 3 lignes tant qu'on n'a pas cliqué « Développer tout ». */
  function ligneNoteEpinglee(n) {
    return h('li', { class: `note-epinglee${toutDeploye ? ' deployee' : ''}`, dataset: { note: n.id } },
      icone('pin', { taille: 14 }),
      h('div', { class: 'note-epinglee-corps' }, h('p', { class: 'note-texte' }, noeudsTexte(n.texte)),
        h('span', { class: 'fil-meta' }, L.formatDateHeure(versDateNote(n)), n.auteur ? ` · ${nomCompte(n.auteur)}` : '', n.deAffaire ? ' · note de l’affaire' : ''),
        n.deAffaire ? null : h('div', { class: 'note-actions' },
          h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'data-action': 'modifier-note-epinglee',
            onclick: (e) => {
              epingleeEnEdition = n.id;
              modifierNoteSurPlace(n, e.currentTarget.closest('.note-epinglee-corps'), () => { epingleeEnEdition = null; rendrePointsCles(); });
            } }, icone('pencil', { taille: 14 }), 'Modifier'))),
      n.deAffaire ? null : h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Désépingler la note', title: 'Désépingler', 'data-action': 'desepingler-note',
        onclick: () => D.epinglerNote(n.id, false).then(() => toast('Note désépinglée')).catch((e) => { console.warn(e); toast('Modification impossible', { type: 'erreur' }); }) }, icone('x', { taille: 14 })));
  }
  const versDateNote = (n) => L.versDate(n.creeLe);

  /**
   * Note épinglée de départ encore vide (I5, à la place de l'ancien champ « description ») : on écrit directement dedans. Le texte d'invitation grisé
   * disparaît au clic et revient si on ne tape rien ; le texte s'enregistre en quittant le champ (la note devient alors une note épinglée ordinaire) ; Échap annule.
   */
  function ligneNoteDeDepart(n) {
    const invitation = lien.projetId ? L.INVITATION_NOTE_PROJET : L.INVITATION_NOTE_AFFAIRE;
    const champ = h('textarea', { class: 'champ-note-depart', rows: 3, maxlength: '20000', spellcheck: true, placeholder: invitation, 'data-champ': 'note-depart',
      'aria-label': lien.projetId ? 'De quoi parle ce projet' : 'De quoi parle cette affaire' });
    champ.addEventListener('focus', () => { champ.placeholder = ''; });
    champ.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); champ.value = ''; champ.blur(); } });
    champ.addEventListener('blur', async () => {
      champ.placeholder = invitation;
      if (!L.nettoyerEspaces(champ.value)) { champ.value = ''; if (pointsClesEnAttente) rendrePointsCles(); return; }
      try { await D.majNote(n.id, champ.value); } catch (e) {
        console.warn(e);
        toast('Enregistrement impossible : vérifie ta connexion, puis clique dans la note et quitte-la pour réessayer.', { type: 'erreur' });
        return; // le texte tapé reste dans le champ
      }
      if (pointsClesEnAttente) rendrePointsCles();
    });
    return h('li', { class: 'note-epinglee note-epinglee-vide', dataset: { note: n.id } },
      icone('pin', { taille: 14 }),
      h('div', { class: 'note-epinglee-corps' }, champ),
      // Sur une note VIDE, la croix la supprime (désépinglée, elle resterait en base sans jamais s'afficher) ; confirmation puis « Annuler » pendant 8 s.
      h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Supprimer la note vide', title: 'Supprimer', 'data-action': 'supprimer-note-vide',
        onclick: () => retirerAvecAnnulation({
          titre: 'Supprimer cette note vide ?', message: 'Elle ne reviendra pas : tu pourras toujours écrire une note dans l’onglet « Notes ».', libelleOk: 'Supprimer', danger: true,
          faire: () => D.supprimerNote(n.id), defaire: () => D.restaurerNote(n), messageFait: 'Note supprimée' }) }, icone('x', { taille: 14 })));
  }

  // Bouton « Filtres » de l'historique : le même que celui des listes (Personnes…), la même fenêtre (cases à cocher, Tout effacer / Appliquer), logique « OU ».
  async function ouvrirFiltresHistorique() {
    const r = await fenetreFiltres({
      controles: [{ cle: 'types', libelle: 'Type', type: 'cases', options: L.TYPES_FILTRE_HISTORIQUE.map((f) => ({ valeur: f.id, libelle: f.libelle })) }],
      criteres: { types: typesHistorique },
      effacer: () => ({ types: [] }),
    });
    if (!r) return;
    typesHistorique = L.typesHistoriqueValides(r.types);
    rendreHistorique();
  }
  const filtresHistorique = boutonFiltres({ auClic: ouvrirFiltresHistorique, petit: true });

  function rendreHistorique() {
    const notes = notesDeLaFiche();
    const entrees = L.entreesHistorique({ activites: D.activitesDe(lien), notes, evenements: fil.evenements }, typesHistorique);
    filtresHistorique.majCompte(typesHistorique.length);
    const actifs = L.TYPES_FILTRE_HISTORIQUE.filter((f) => typesHistorique.includes(f.id));
    const avaitFocus = document.activeElement === filtresHistorique.element; // le redessin détache le bouton : on lui rend le focus (clavier)
    remplir(zoneHistorique,
      h('div', { class: 'points-cles-tete' }, h('h3', { class: 'sous-titre' }, 'Historique'), filtresHistorique.element),
      actifs.length ? h('div', { class: 'pastilles-actives' },
        actifs.map((f) => h('span', { class: 'pastille-filtre' }, f.libelle,
          h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': `Retirer le filtre : ${f.libelle}`, onclick: () => { typesHistorique = typesHistorique.filter((t) => t !== f.id); rendreHistorique(); } }, icone('x', { taille: 12 })))),
        actifs.length > 1 ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => { typesHistorique = []; rendreHistorique(); } }, 'Tout effacer') : null) : null,
      entrees.length
        ? h('ol', { class: 'fil' }, entrees.map(ligneHistorique))
        : h('p', { class: 'aide' }, actifs.length ? 'Rien à afficher avec ces filtres. Décoche un filtre.' : 'Rien à afficher pour le moment.'));
    if (avaitFocus) filtresHistorique.element.focus();
  }

  function ligneHistorique(e) {
    const el = e.element;
    const meta = h('span', { class: 'fil-meta' }, L.formatDateHeure(e.date), el.auteur || el.creePar ? ` · ${nomCompte(el.auteur || el.creePar)}${L.mentionCanal(el)}` : '', el.deAffaire ? ' · note de l’affaire' : '');
    if (e.genre === 'note') return ligneNote(el, meta);
    if (e.genre === 'activite') {
      return h('li', { class: 'fil-ligne', dataset: { genre: 'activite' } }, h('span', { class: 'fil-puce' }, iconeTypeActivite(el.type)), h('div', { class: 'fil-texte' }, h('span', {}, `${L.libelleTypeActivite(el.type)} fait : `, h('strong', {}, el.titre)), meta));
    }
    return h('li', { class: 'fil-ligne', dataset: { genre: 'evenement' } }, h('span', { class: 'fil-puce' }, icone('circle', { taille: 10 })), h('div', { class: 'fil-texte' }, h('span', {}, el.texte), meta));
  }

  function ligneNote(n, meta) {
    const texte = h('p', { class: 'note-texte' }, noeudsTexte(n.texte));
    const deployee = notesDeployees.has(n.id);
    if (deployee) texte.classList.add('deployee');
    const boutonPlier = h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'data-action': 'developper-note', hidden: true,
      onclick: () => {
        if (notesDeployees.has(n.id)) notesDeployees.delete(n.id); else notesDeployees.add(n.id);
        texte.classList.toggle('deployee', notesDeployees.has(n.id));
        boutonPlier.textContent = notesDeployees.has(n.id) ? 'Réduire' : 'Développer';
      } }, deployee ? 'Réduire' : 'Développer');
    // Le bouton n'existe que si le texte dépasse la limite de lignes (20 sur ordinateur, 12 sur téléphone : voir le CSS).
    boutonsPlier.set(texte, boutonPlier);
    observateurNotes?.observe(texte);
    const carte = h('li', { class: `fil-ligne fil-note${n.deAffaire ? ' fil-note-affaire' : ''}`, dataset: { genre: 'note', note: n.id } }, h('span', { class: 'fil-puce' }, icone('sticky-note', { taille: 14 })),
      h('div', { class: 'fil-texte note-carte' }, texte, boutonPlier, meta,
        n.deAffaire ? null : h('div', { class: 'note-actions' },
          avecActivites ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'data-action': n.epinglee ? 'desepingler-note' : 'epingler-note',
            onclick: () => D.epinglerNote(n.id, !n.epinglee).then(() => toast(n.epinglee ? 'Note désépinglée' : 'Note épinglée')).catch((e) => { console.warn(e); toast('Modification impossible', { type: 'erreur' }); }) },
            icone('pin', { taille: 14 }), n.epinglee ? 'Désépingler' : 'Épingler') : null,
          h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'data-action': 'modifier-note', onclick: () => modifier() }, icone('pencil', { taille: 14 }), 'Modifier'),
          h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'data-action': 'supprimer-note', onclick: () => retirerAvecAnnulation({
            titre: 'Supprimer cette note ?', message: '', libelleOk: 'Supprimer', danger: true,
            faire: () => D.supprimerNote(n.id), defaire: () => D.restaurerNote(n), messageFait: 'Note supprimée' }) }, icone('trash-2', { taille: 14 }), 'Supprimer'))));
    function modifier() { modifierNoteSurPlace(n, carte.querySelector('.fil-texte'), rendreHistorique); }
    return carte;
  }

  // Pas de nouveau rendu pendant la modification d'une note (sinon le texte en cours serait perdu).
  function rendreHistoriqueSiPasEdition() {
    if (!(document.activeElement?.tagName === 'TEXTAREA' && zoneHistorique.contains(document.activeElement))) rendreHistorique();
  }
  racine.append(...[compositeur, avecActivites ? zonePointsCles : null, zoneHistorique].filter(Boolean));
  if (avecActivites) rendrePointsCles();
  rendreHistorique();

  const arretFil = D.ecouterFil(lien, (donnees) => { fil = donnees; if (avecActivites) rendrePointsCles(); rendreHistoriqueSiPasEdition(); });
  const arretFilAffaire = affaireLiee ? D.ecouterFil({ affaireId: affaireLiee.affaireId }, (donnees) => { filAffaire = donnees; if (avecActivites) rendrePointsCles(); rendreHistoriqueSiPasEdition(); }) : () => {};
  const arretDonnees = D.surChangement(() => {
    if (avecActivites) rendrePointsCles();
    rendreHistoriqueSiPasEdition();
  });
  return {
    element: racine,
    arreter() { observateurNotes?.disconnect(); arretFil(); arretFilAffaire(); arretDonnees(); },
    focusActivite() { choisirOnglet('activite'); },
    focusNote() { choisirOnglet('notes'); },
    majDocuments({ element, compteur }) { remplir(zoneDocuments, element); compteurDocuments.textContent = String(compteur); },
  };
}

