// Colonne de droite des fiches : onglets Activité / Notes, Points clés, Historique.
// Partagée par les fiches personne, organisation et affaire.
import { h, icone, remplir, dialogue, confirmer, ouvrirMenu, toast } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { iconeTypeActivite, lienAffaire, lienPersonne, lienOrganisation, nomCompte } from './composants.js';

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
    const liens = { personneId: activite.personneId ?? null, organisationId: activite.organisationId ?? null, affaireId: activite.affaireId ?? null };
    await proposerProchaineActivite(liens);
  }
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
      { libelle: 'Supprimer', icone: 'trash-2', danger: true, action: async () => { if (await confirmer('Supprimer cette activité ?', a.titre, { libelleOk: 'Supprimer', danger: true })) await D.supprimerActivite(a.id); } },
    ]) }, icone('ellipsis', { taille: 16 }));
  return h('li', { class: `activite activite-${etat}`, dataset: { activite: a.id } },
    bouton,
    h('span', { class: 'activite-type' }, iconeTypeActivite(a.type)),
    h('div', { class: 'activite-texte' },
      h('strong', {}, a.titre),
      h('span', { class: 'activite-meta' },
        etat !== 'avenir' ? h('span', { class: `badge-etat ${etat}` }, LIBELLES_ETAT[etat]) : null,
        h('span', {}, L.formatJourCourt(a.date, aujourdhui), a.heure ? ` à ${a.heure.replace(':', ' h ')}` : ''),
        rattachement ? LIENS_RATTACHEMENT[rattachement.type](rattachement.fiche) : null,
        affaire ? lienAffaire(affaire) : null)),
    menu);
}

/**
 * Panneau complet. lien : { personneId } | { organisationId } | { affaireId } (filtre de la fiche).
 * liensCreation() : liens à poser sur ce qu'on crée (personneId, organisationId, affaireId).
 * `avecActivites: false` (fiche projet : les tâches d'un projet viennent à l'étape 4) : ni onglet « Activité », ni Points clés, seulement les notes et l'historique.
 */
export function panneauActivite({ lien, liensCreation, avecActivites = true }) {
  let fil = { notes: [], evenements: [] };
  let filtre = 'tous';
  let onglet = avecActivites ? 'activite' : 'notes';

  const zonePointsCles = h('div', { class: 'points-cles' });
  const zoneHistorique = h('div', { class: 'historique' });
  const racine = h('div', { class: 'panneau-activite' });

  // ---- compositeur (onglets Activité / Notes)
  let type = 'tache';
  let titreModifie = false;
  const champTitre = h('input', { class: 'champ', type: 'text', 'aria-label': 'Titre de l’activité', placeholder: 'Clique ici pour ajouter une activité…', value: '',
    oninput: () => { titreModifie = true; } });
  const date = selecteurDate(D.ctx().aujourdhui);
  const champHeure = h('input', { class: 'champ champ-court', type: 'time', 'aria-label': 'Heure (facultatif)' });
  const types = h('div', { class: 'types-activite', role: 'group', 'aria-label': 'Type d’activité' });
  function rendreTypes() {
    remplir(types, L.TYPES_ACTIVITE.map((t) => h('button', {
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
    } catch (e) {
      console.warn(e);
      toast('Ajout impossible', { type: 'erreur' });
    }
    boutonActivite.disabled = false;
  }
  const panneauActiviteSaisie = h('div', { class: 'compositeur-corps', role: 'tabpanel', 'aria-label': 'Activité' },
    types, champTitre, h('div', { class: 'ligne-date' }, date.element, champHeure), h('div', { class: 'compositeur-actions' }, boutonActivite));

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
  function choisirOnglet(o) {
    onglet = o;
    for (const [b, id] of [[ongletActivite, 'activite'], [ongletNotes, 'notes']]) {
      b.classList.toggle('actif', id === o);
      b.setAttribute('aria-selected', String(id === o));
    }
    panneauActiviteSaisie.hidden = o !== 'activite';
    panneauNoteSaisie.hidden = o !== 'notes';
    (o === 'activite' ? champTitre : champNote).focus();
  }
  if (!avecActivites) {
    ongletNotes.classList.add('actif');
    ongletNotes.setAttribute('aria-selected', 'true');
    panneauActiviteSaisie.hidden = true;
  }
  const compositeur = h('div', { class: 'compositeur' }, h('div', { class: 'onglets', role: 'tablist' }, avecActivites ? ongletActivite : null, ongletNotes), panneauActiviteSaisie, panneauNoteSaisie);

  // ---- points clés et historique
  function rendrePointsCles() {
    const aujourdhui = D.ctx().aujourdhui;
    const liste = L.pointsClesFiche(D.activitesDe(lien), aujourdhui);
    remplir(zonePointsCles,
      h('h3', { class: 'sous-titre' }, 'Points clés'),
      liste.length
        ? h('ul', { class: 'liste-activites' }, liste.map((a) => ligneActivite(a, aujourdhui)))
        : h('p', { class: 'aide' }, 'Aucune activité à faire.'));
  }

  function rendreHistorique() {
    const entrees = L.entreesHistorique({ activites: D.activitesDe(lien), notes: fil.notes, evenements: fil.evenements }, filtre);
    remplir(zoneHistorique,
      h('h3', { class: 'sous-titre' }, 'Historique'),
      h('div', { class: 'pastilles-filtre', role: 'group', 'aria-label': 'Filtrer l’historique' },
        L.FILTRES_HISTORIQUE.map((f) => h('button', { type: 'button', class: `pastille-type${f.id === filtre ? ' actif' : ''}`, 'aria-pressed': String(f.id === filtre), dataset: { filtre: f.id },
          onclick: () => { filtre = f.id; rendreHistorique(); } }, f.libelle))),
      entrees.length
        ? h('ol', { class: 'fil' }, entrees.map(ligneHistorique))
        : h('p', { class: 'aide' }, 'Rien à afficher pour le moment.'));
  }

  function ligneHistorique(e) {
    const el = e.element;
    const meta = h('span', { class: 'fil-meta' }, L.formatDateHeure(e.date), el.auteur || el.creePar ? ` · ${nomCompte(el.auteur || el.creePar)}${L.mentionCanal(el)}` : '');
    if (e.genre === 'note') return ligneNote(el, meta);
    if (e.genre === 'activite') {
      return h('li', { class: 'fil-ligne', dataset: { genre: 'activite' } }, h('span', { class: 'fil-puce' }, iconeTypeActivite(el.type)), h('div', { class: 'fil-texte' }, h('span', {}, `${L.libelleTypeActivite(el.type)} fait : `, h('strong', {}, el.titre)), meta));
    }
    return h('li', { class: 'fil-ligne', dataset: { genre: 'evenement' } }, h('span', { class: 'fil-puce' }, icone('circle', { taille: 10 })), h('div', { class: 'fil-texte' }, h('span', {}, el.texte), meta));
  }

  function ligneNote(n, meta) {
    const texte = h('p', { class: 'note-texte' }, n.texte);
    const carte = h('li', { class: 'fil-ligne fil-note', dataset: { genre: 'note', note: n.id } }, h('span', { class: 'fil-puce' }, icone('sticky-note', { taille: 14 })),
      h('div', { class: 'fil-texte note-carte' }, texte, meta,
        h('div', { class: 'note-actions' },
          h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'data-action': 'modifier-note', onclick: () => modifier() }, icone('pencil', { taille: 14 }), 'Modifier'),
          h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'data-action': 'supprimer-note', onclick: async () => { if (await confirmer('Supprimer cette note ?', '', { libelleOk: 'Supprimer', danger: true })) await D.supprimerNote(n.id); } }, icone('trash-2', { taille: 14 }), 'Supprimer'))));
    function modifier() {
      const zone = h('textarea', { class: 'champ', rows: 4, 'aria-label': 'Modifier la note', value: n.texte });
      const corps = carte.querySelector('.fil-texte');
      const sauve = async () => { if (L.nettoyerEspaces(zone.value)) await D.majNote(n.id, zone.value); };
      corps.replaceChildren(zone, h('div', { class: 'note-actions' },
        h('button', { type: 'button', class: 'bouton bouton-principal bouton-petit', onclick: sauve }, 'Enregistrer'),
        h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', onclick: rendreHistorique }, 'Annuler')));
      zone.focus();
    }
    return carte;
  }

  racine.append(...[compositeur, avecActivites ? zonePointsCles : null, zoneHistorique].filter(Boolean));
  if (avecActivites) rendrePointsCles();
  rendreHistorique();

  const arretFil = D.ecouterFil(lien, (donnees) => { fil = donnees; rendreHistorique(); });
  const arretDonnees = D.surChangement(() => {
    if (avecActivites) rendrePointsCles();
    // Pas de nouveau rendu pendant la modification d'une note (sinon le texte en cours serait perdu).
    if (!(document.activeElement?.tagName === 'TEXTAREA' && zoneHistorique.contains(document.activeElement))) rendreHistorique();
  });
  return {
    element: racine,
    arreter() { arretFil(); arretDonnees(); },
    focusActivite() { choisirOnglet('activite'); },
    focusNote() { choisirOnglet('notes'); },
  };
}

