// Écran Projets : Kanban par phase, liste, archives, fenêtre « Ajouter un projet », filtres et menus d'actions.
// Aucune règle métier ici : les règles sont dans logique.js (plans), exécutés par donnees.js.
import { h, icone, remplir, dialogue, demanderTexte, toast, ouvrirMenu, lirePreference, ecrirePreference } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as CRM from '../crm/donnees.js';
import * as L from '../crm/logique.js';
import {
  lienPersonne, lienOrganisation, pastilleActivite, selecteurPersonne, selecteurOrganisation, organisationChoisieOuSaisie, etatVide, planifier, nomCompte,
} from '../crm/composants.js';
import * as D from './donnees.js';
import * as P from './logique.js';

import { cheminProjet, anneauProgression } from './composants.js';

export { cheminProjet };

// État conservé pendant la session.
let criteres = P.criteresProjetsComplets();
let vue = lirePreference('vue.projets', 'kanban'); // kanban | liste | archives
let triListe = { colonne: 'titre', sens: 'asc' };
let enDeplacement = false;

const aujourdhui = () => CRM.ctx().aujourdhui;
const taches = () => D.etat.taches;

// ---------------------------------------------------------------- pastilles et actions communes

export function pastilleStatutProjet(p) {
  const s = P.STATUTS_PROJET.find((x) => x.id === p.statut);
  return h('span', { class: `pastille-statut statut-${p.statut}`, style: { '--couleur': s?.couleur || '#8d8993' } }, P.libelleStatutProjet(p.statut));
}

export function pastillePhase(phase) {
  return h('span', { class: 'pastille-statut', style: { '--couleur': P.couleurPhase(phase) } }, P.libellePhase(phase));
}

/** Terminer, mettre en pause, reprendre, rouvrir : la règle est dans logique.js, ici seulement le message. */
export async function terminerProjet(p) {
  await D.terminer(p.id);
  toast('Projet terminé');
}
export async function mettreEnPause(p) {
  await D.mettreEnPause(p.id);
  toast('Projet en pause');
}
export async function reprendre(p) {
  await D.reprendre(p.id);
  toast('Projet repris');
}
export async function rouvrir(p) {
  await D.rouvrir(p.id);
  toast('Projet rouvert');
}

/** Entrées « Déplacer vers… » d'un projet : une par phase. */
export function entreesDeplacement(p) {
  return P.PHASES.map((ph) => ({
    libelle: `Déplacer vers : ${ph.libelle}`, icone: 'arrow-right-left', desactive: p.phase === ph.id && !P.estProjetTermine(p),
    action: () => D.changerPhase(p.id, ph.id),
  }));
}

export function menuProjet(p) {
  return [
    { libelle: 'Ouvrir la fiche', icone: 'folder-kanban', action: () => naviguer(`projets/projets/${p.id}`) },
    ...(P.estProjetTermine(p)
      ? [{ libelle: 'Rouvrir', icone: 'rotate-ccw', action: () => rouvrir(p) }]
      : [
        p.statut === 'en_pause'
          ? { libelle: 'Reprendre', icone: 'rotate-ccw', action: () => reprendre(p) }
          : { libelle: 'Mettre en pause', icone: 'clock', action: () => mettreEnPause(p) },
        { libelle: 'Terminer', icone: 'circle-check', action: () => terminerProjet(p) },
      ]),
    { libelle: p.archive ? 'Désarchiver' : 'Archiver', icone: p.archive ? 'archive-restore' : 'archive', action: () => D.archiver(p.id, !p.archive) },
    { libelle: 'Supprimer définitivement…', icone: 'trash-2', danger: true, action: () => demanderSuppressionProjet(p) },
  ];
}

export async function demanderSuppressionProjet(p) {
  const champ = h('input', { class: 'champ', type: 'text', 'aria-label': `Tape « ${p.titre} » pour confirmer`, autocomplete: 'off', placeholder: p.titre });
  const r = await dialogue({
    titre: 'Supprimer définitivement ?',
    contenu: h('div', { class: 'pile' },
      h('p', {}, `Pour supprimer « ${p.titre} » avec ses tâches, notes et événements, tape son titre ci-dessous. Cette action est définitive. L’affaire liée n’est pas touchée.`), champ),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Supprimer', valeur: true, style: 'danger',
      avantFermeture: () => L.confirmationValide(champ.value, p.titre) || (champ.classList.add('invalide'), false),
    }],
  });
  if (!r) return false;
  await D.supprimerProjet(p.id);
  toast('Projet supprimé');
  if (location.hash.includes(p.id)) naviguer('projets/projets');
  return true;
}

// ---------------------------------------------------------------- fenêtre « Ajouter un projet »

/** Seul le titre est obligatoire. `lien` : { personneId, organisationId } à préremplir. */
export async function ouvrirCreationProjet({ personneId = null, organisationId = null } = {}) {
  const personneInitiale = personneId ? CRM.personne(personneId) : null;
  const orgInitiale = organisationId || personneInitiale?.organisationId || null;
  const champTitre = h('input', { class: 'champ', type: 'text', id: 'creation-projet-titre', autocomplete: 'off', 'aria-label': 'Titre', placeholder: 'Titre', autofocus: true });
  const orga = selecteurOrganisation({ valeurId: orgInitiale });
  const pers = selecteurPersonne({
    valeurId: personneId,
    surChoix: (el) => {
      const p = el ? CRM.personne(el.id) : null;
      if (p?.organisationId && !orga.choix()) { const o = CRM.organisation(p.organisationId); if (o) orga.definir({ id: o.id, libelle: o.nom }); }
    },
  });
  const erreur = h('p', { class: 'erreur', role: 'alert' });
  let identifiant = null;
  const r = await dialogue({
    titre: 'Ajouter un projet',
    classe: 'dialogue-formulaire',
    contenu: h('div', { class: 'pile formulaire-creation' },
      h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: 'creation-projet-titre' }, 'Titre'), champTitre),
      h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Personne'), pers.element),
      h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Organisation'), orga.element),
      erreur),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Enregistrer', valeur: true, style: 'principal',
      avantFermeture: async () => {
        const titre = L.nettoyerEspaces(champTitre.value);
        if (Object.keys(P.validerProjet({ titre })).length) { erreur.textContent = 'Le titre est obligatoire.'; champTitre.classList.add('invalide'); champTitre.focus(); return false; }
        try {
          const organisationIdChoisie = await organisationChoisieOuSaisie(orga);
          let idPersonne = pers.choix()?.id || null;
          if (!idPersonne && pers.texte()) {
            const existante = L.trouverDoublonsPersonne(CRM.etat.personnes, { nom: pers.texte() })[0];
            idPersonne = existante ? existante.id : await CRM.creerPersonne({ nom: pers.texte(), organisationId: organisationIdChoisie });
          }
          identifiant = await D.creerProjet({ titre, personneId: idPersonne, organisationId: organisationIdChoisie });
          return true;
        } catch (e) {
          console.warn(e);
          erreur.textContent = 'Enregistrement impossible, réessaie.';
          return false;
        }
      },
    }],
    auMontage: ({ boite, boutons }) => {
      boite.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.defaultPrevented && e.target.tagName === 'INPUT') { e.preventDefault(); boutons.at(-1).click(); }
      });
    },
  });
  if (r && identifiant) {
    toast('Projet ajouté', { lien: { libelle: 'Ouvrir la fiche', href: cheminProjet(identifiant) }, duree: 5000 });
    return identifiant;
  }
  return null;
}

// ---------------------------------------------------------------- filtres

async function ouvrirFenetreFiltres() {
  const c = P.criteresProjetsComplets(criteres);
  const groupe = (cle, libelle, options) => h('fieldset', { class: 'groupe-cases' }, h('legend', { class: 'etiquette' }, libelle),
    h('div', { class: 'cases' }, options.map((o) => h('label', { class: 'case' },
      h('input', { type: 'checkbox', checked: c[cle].includes(o.id), dataset: { cle, valeur: o.id },
        onchange: (e) => { c[cle] = e.target.checked ? [...c[cle], o.id] : c[cle].filter((v) => v !== o.id); } }), o.libelle))));
  const r = await dialogue({
    titre: 'Filtres',
    classe: 'dialogue-formulaire dialogue-filtres',
    contenu: h('div', { class: 'pile filtres-corps' },
      groupe('phases', 'Phase', P.PHASES),
      groupe('statuts', 'Statut', P.STATUTS_PROJET),
      groupe('natures', 'Nature', P.NATURES_PROJET),
      h('label', { class: 'case case-seule' }, h('input', { type: 'checkbox', checked: c.enRetard, dataset: { cle: 'enRetard' }, onchange: (e) => { c.enRetard = e.target.checked; } }), 'En retard')),
    boutons: [{ libelle: 'Tout effacer', valeur: 'effacer' }, { libelle: 'Appliquer', valeur: 'appliquer', style: 'principal' }],
  });
  if (r === 'effacer') return P.criteresProjetsComplets({ recherche: c.recherche });
  return r === 'appliquer' ? c : null;
}

/** Pastilles des filtres posés : [{ libelle, retirer() }]. */
function pastillesFiltres() {
  const c = P.criteresProjetsComplets(criteres);
  const sans = (cle, valeur) => P.criteresProjetsComplets({ ...c, [cle]: c[cle].filter((v) => v !== valeur) });
  return [
    ...c.phases.map((v) => ({ libelle: `Phase : ${P.libellePhase(v)}`, retirer: () => sans('phases', v) })),
    ...c.statuts.map((v) => ({ libelle: `Statut : ${P.libelleStatutProjet(v)}`, retirer: () => sans('statuts', v) })),
    ...c.natures.map((v) => ({ libelle: `Nature : ${P.libelleNature(v)}`, retirer: () => sans('natures', v) })),
    ...(c.enRetard ? [{ libelle: 'En retard', retirer: () => P.criteresProjetsComplets({ ...c, enRetard: false }) }] : []),
  ];
}

// ---------------------------------------------------------------- Kanban

function carte(p, rafraichir) {
  const o = CRM.organisation(p.organisationId);
  const pers = CRM.personne(p.personneId);
  const sesTaches = D.tachesDe(p.id);
  const enRetard = P.estProjetEnRetard(p, sesTaches, aujourdhui());
  const couleur = P.pastilleProjet(p, sesTaches, aujourdhui());
  const menu = h('button', { type: 'button', class: 'bouton-icone carte-menu', 'aria-label': `Actions : ${p.titre}`,
    onclick: (e) => { e.stopPropagation(); ouvrirMenu(e.currentTarget, [...entreesDeplacement(p), ...menuProjet(p)]); } }, icone('ellipsis', { taille: 16 }));
  const dates = p.dateDebut || p.dateFin
    ? h('span', { class: 'carte-sous carte-dates' }, icone('calendar', { taille: 12 }), [p.dateDebut ? L.formatJour(p.dateDebut) : '…', p.dateFin ? L.formatJour(p.dateFin) : '…'].join(' → '))
    : null;
  const el = h('article', { class: `carte-projet carte-affaire statut-${p.statut}`, draggable: 'true', tabindex: '0', dataset: { projet: p.id }, 'aria-label': p.titre, style: { '--couleur': P.couleurPhase(p.phase) },
    onclick: (e) => { if (!e.target.closest('a, button')) naviguer(`projets/projets/${p.id}`); },
    onkeydown: (e) => { if (e.key === 'Enter' && e.target === el) naviguer(`projets/projets/${p.id}`); },
    ondragstart: (e) => { enDeplacement = true; e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('en-deplacement'); },
    ondragend: () => { enDeplacement = false; el.classList.remove('en-deplacement'); document.querySelectorAll('.colonne.cible').forEach((c) => c.classList.remove('cible')); rafraichir(); } },
  h('div', { class: 'carte-ligne' }, h('strong', { class: 'carte-titre' }, p.titre), menu),
  o ? h('span', { class: 'carte-sous' }, icone('building-2', { taille: 12 }), o.nom) : null,
  pers ? h('span', { class: 'carte-sous' }, icone('user', { taille: 12 }), pers.nom) : null,
  dates,
  h('div', { class: 'carte-pied' },
    p.nature === 'extraction' ? h('span', { class: 'badge-nature' }, 'Extraction') : null,
    p.statut === 'en_pause' ? h('span', { class: 'badge-pause' }, 'En pause') : null,
    enRetard ? h('span', { class: 'badge-retard' }, 'En retard') : null,
    p.proprietaire ? h('span', { class: 'carte-proprietaire' }, nomCompte(p.proprietaire)) : null,
    anneauProgression(P.progressionProjet(D.tachesDe(p.id))),
    pastilleActivite(couleur)));
  return el;
}

function colonne(phase, projets, rafraichir) {
  const el = h('section', { class: 'colonne', dataset: { colonne: phase.id }, 'aria-label': phase.libelle, style: { '--couleur': phase.couleur },
    ondragover: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('cible'); },
    ondragleave: (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('cible'); },
    ondrop: (e) => {
      e.preventDefault();
      el.classList.remove('cible');
      enDeplacement = false;
      const p = D.projet(e.dataTransfer.getData('text/plain'));
      if (p) D.changerPhase(p.id, phase.id);
    } },
  h('header', { class: 'colonne-tete' }, h('h2', {}, phase.libelle), h('span', { class: 'colonne-totaux' }, `${projets.length} ${projets.length > 1 ? 'projets' : 'projet'}`)),
  h('div', { class: 'colonne-corps' }, L.trier(projets, (p) => L.normaliser(p.titre)).map((p) => carte(p, rafraichir))));
  return el;
}

// ---------------------------------------------------------------- page Projets

export function rendreProjets(conteneur) {
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const zone = h('div', { class: 'zone-affaires zone-projets' });
  const zoneBascule = h('div', {});
  const zoneFiltres = h('div', { class: 'barre-filtres' });
  let rafraichir = () => {};

  function contexteFiltres(archives) {
    return { personnes: CRM.etat.personnes, organisations: CRM.etat.organisations, taches: taches(), aujourdhui: aujourdhui(), archives };
  }

  function bascule() {
    const vues = [['kanban', 'Kanban', 'square-kanban'], ['liste', 'Liste', 'list'], ['archives', 'Archives', 'archive']];
    return h('div', { class: 'bascule-vues', role: 'group', 'aria-label': 'Vue' }, vues.map(([id, libelle, ic]) => h('button', {
      type: 'button', class: `bascule-vue${vue === id ? ' actif' : ''}`, 'aria-pressed': String(vue === id), dataset: { vue: id },
      onclick: () => { vue = id; ecrirePreference('vue.projets', id); rendre(); },
    }, icone(ic, { taille: 16 }), h('span', {}, libelle))));
  }

  function majCriteres(nouveaux) {
    criteres = P.criteresProjetsComplets(nouveaux);
    rendre();
  }

  const champRecherche = h('input', { class: 'champ', type: 'search', 'aria-label': 'Rechercher un projet', placeholder: 'Rechercher un projet', autocomplete: 'off', value: criteres.recherche,
    oninput: (e) => majCriteres({ ...criteres, recherche: e.target.value }) });
  const boutonFiltres = h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'filtres', onclick: async () => {
    const r = await ouvrirFenetreFiltres();
    if (r) majCriteres(r);
  } });
  async function enregistrerFiltre() {
    const nom = await demanderTexte('Enregistrer ce filtre', { libelle: 'Nom du filtre' });
    if (!nom) return;
    const r = P.nouveauFiltreProjets(nom, criteres, CRM.etat.filtres, L.idAleatoire().slice(0, 4));
    if (r.erreurs.nom) { toast(r.erreurs.nom, { type: 'erreur' }); return; }
    await CRM.enregistrerFiltres([...CRM.etat.filtres, r.filtre]);
    toast('Filtre enregistré');
  }
  const boutonEnregistres = h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'filtres-enregistres', 'aria-label': 'Filtres enregistrés',
    onclick: (e) => ouvrirMenu(e.currentTarget, [
      ...P.filtresEnregistresProjets(CRM.etat.filtres).map((f) => ({ libelle: f.nom, icone: 'bookmark', action: () => majCriteres(f.criteres) })),
      { libelle: 'Enregistrer ce filtre…', icone: 'bookmark-plus', desactive: !P.criteresProjetsActifs(criteres), action: enregistrerFiltre },
    ]) }, icone('bookmark', { taille: 16 }));
  const zonePastilles = h('div', { class: 'pastilles-actives' });
  zoneFiltres.append(h('div', { class: 'barre-filtres-ligne' }, h('div', { class: 'champ-avec-icone' }, icone('search', { taille: 16 }), champRecherche), boutonFiltres, boutonEnregistres), zonePastilles);

  function majFiltres() {
    const actifs = pastillesFiltres();
    remplir(boutonFiltres, icone('funnel', { taille: 16 }), 'Filtres', actifs.length ? h('span', { class: 'compteur-filtres' }, String(actifs.length)) : null);
    remplir(zonePastilles,
      actifs.map((a) => h('span', { class: 'pastille-filtre' }, a.libelle,
        h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': `Retirer le filtre : ${a.libelle}`, onclick: () => majCriteres(a.retirer()) }, icone('x', { taille: 12 })))),
      actifs.length > 1 ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => majCriteres({ recherche: criteres.recherche }) }, 'Tout effacer') : null);
    if (champRecherche.value !== criteres.recherche && document.activeElement !== champRecherche) champRecherche.value = criteres.recherche;
  }

  function rendre() {
    remplir(zoneBascule, bascule());
    majFiltres();
    if (!(D.estPret() && CRM.estPret())) { remplir(zone, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); return; }
    if (vue === 'kanban') rendreKanban();
    else rendreListe(vue === 'archives');
  }

  function rendreKanban() {
    const projets = L.trier(P.filtrerProjets(D.etat.projets, criteres, contexteFiltres(false)), (p) => L.normaliser(p.titre));
    remplir(compteur, `${projets.length} ${projets.length > 1 ? 'projets' : 'projet'}`);
    if (!D.etat.projets.length) {
      remplir(zone, etatVide('Ajoute ton premier projet avec le bouton ci-dessous.', { action: h('button', { type: 'button', class: 'bouton bouton-principal', onclick: () => ouvrirCreationProjet() }, icone('plus', { taille: 16 }), 'Projet') }));
      return;
    }
    remplir(zone, h('div', { class: 'kanban' }, P.PHASES.map((ph) => colonne(ph, P.projetsDePhase(projets, ph.id), rafraichir))));
  }

  const COLONNES_LISTE = [
    { id: 'titre', libelle: 'Titre', tri: (p) => L.normaliser(p.titre) },
    { id: 'personne', libelle: 'Personne', tri: (p) => L.normaliser(CRM.personne(p.personneId)?.nom) },
    { id: 'organisation', libelle: 'Organisation', tri: (p) => L.normaliser(CRM.organisation(p.organisationId)?.nom) },
    { id: 'phase', libelle: 'Phase', tri: (p) => P.PHASES.findIndex((x) => x.id === p.phase) },
    { id: 'statut', libelle: 'Statut', tri: (p) => P.STATUTS_PROJET.findIndex((x) => x.id === p.statut) },
    { id: 'debut', libelle: 'Début', tri: (p) => p.dateDebut || null },
    { id: 'fin', libelle: 'Fin prévue', tri: (p) => p.dateFin || null },
  ];

  function rendreListe(archives) {
    let lignes = P.filtrerProjets(D.etat.projets, criteres, contexteFiltres(archives));
    const col = COLONNES_LISTE.find((c) => c.id === triListe.colonne) || COLONNES_LISTE[0];
    lignes = L.trier(lignes, col.tri, triListe.sens);
    remplir(compteur, `${lignes.length} ${lignes.length > 1 ? 'projets' : 'projet'}${archives ? ' archivés' : ''}`);
    if (!lignes.length) { remplir(zone, etatVide(archives ? 'Aucun projet archivé.' : 'Aucun projet ne correspond.')); return; }
    const entete = h('tr', {}, COLONNES_LISTE.map((c) => h('th', { scope: 'col', 'aria-sort': triListe.colonne === c.id ? (triListe.sens === 'asc' ? 'ascending' : 'descending') : 'none' },
      h('button', { type: 'button', class: 'tri', onclick: () => { triListe = { colonne: c.id, sens: triListe.colonne === c.id && triListe.sens === 'asc' ? 'desc' : 'asc' }; rendre(); } },
        c.libelle, triListe.colonne === c.id ? icone(triListe.sens === 'asc' ? 'arrow-up' : 'arrow-down', { taille: 12 }) : null))), h('th', { class: 'col-actions' }));
    const corps = lignes.map((p) => h('tr', { class: 'ligne-liste', dataset: { id: p.id }, onclick: (e) => { if (!e.target.closest('a, button')) naviguer(`projets/projets/${p.id}`); } },
      h('td', { dataset: { libelle: 'Titre' } }, h('a', { class: 'cellule-nom', href: cheminProjet(p.id) }, h('span', {}, p.titre))),
      h('td', { dataset: { libelle: 'Personne' } }, lienPersonne(CRM.personne(p.personneId))),
      h('td', { dataset: { libelle: 'Organisation' } }, lienOrganisation(CRM.organisation(p.organisationId))),
      h('td', { dataset: { libelle: 'Phase' } }, pastillePhase(p.phase)),
      h('td', { dataset: { libelle: 'Statut' } }, pastilleStatutProjet(p)),
      h('td', { dataset: { libelle: 'Début' } }, p.dateDebut ? L.formatJour(p.dateDebut) : null),
      h('td', { dataset: { libelle: 'Fin prévue' } }, p.dateFin ? L.formatJour(p.dateFin) : null),
      h('td', { class: 'col-actions' }, h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Actions : ${p.titre}`, onclick: (e) => ouvrirMenu(e.currentTarget, menuProjet(p)) }, icone('ellipsis', { taille: 18 })))));
    remplir(zone, h('div', { class: 'zone-tableau' }, h('table', { class: 'tableau tableau-projets' }, h('thead', {}, entete), h('tbody', {}, corps))));
  }

  const entete = h('header', { class: 'page-tete' },
    h('div', {}, h('p', { class: 'etiquette' }, 'Livraison'), h('h1', {}, 'Projets'), compteur),
    h('div', { class: 'page-actions' },
      zoneBascule,
      h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'nouveau-projet', onclick: () => ouvrirCreationProjet() }, icone('plus', { taille: 16 }), 'Projet')));
  conteneur.append(h('div', { class: 'page page-affaires page-projets' }, entete, h('div', { class: 'barre-affaires' }, zoneFiltres), zone));

  const planifie = planifier(() => { if (enDeplacement) return; rendre(); });
  rafraichir = planifie;
  rendre();
  const arrets = [D.surChangement(planifie), CRM.surChangement(planifie)];
  return () => arrets.forEach((f) => f());
}
