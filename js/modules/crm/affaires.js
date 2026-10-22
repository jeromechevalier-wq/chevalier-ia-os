// Affaires : Kanban, liste, archives, fenêtre "Ajouter une affaire" et boîtes de dialogue des changements d'étape.
import { h, icone, remplir, dialogue, toast, ouvrirMenu, lirePreference, ecrirePreference } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import { celebrerGagne, messageBravo } from '../../os/celebrations.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import {
  lienPersonne, lienOrganisation, cheminAffaire, pastilleActivite, pastilleStatut, pastilleEtape, selecteurPersonne, selecteurOrganisation,
  organisationChoisieOuSaisie, etatVide, planifier,
} from './composants.js';
import { barreFiltres } from './filtres.js';
import { dialogueActivite } from './activites.js';

// État conservé pendant la session.
let criteres = L.criteresComplets('affaires', {});
let vue = lirePreference('vue.affaires', 'kanban'); // kanban | liste | archives
let triKanban = lirePreference('tri.kanban', 'activite');
let triListe = { colonne: 'titre', sens: 'asc' };
let enDeplacement = false;

// ---------------------------------------------------------------- boîtes de dialogue

/** Perdue : la raison est obligatoire. */
export async function ouvrirPerdue(a) {
  const raison = h('select', { class: 'champ', 'aria-label': 'Raison', autofocus: true }, h('option', { value: '' }, 'Choisir une raison'), L.RAISONS_PERDUE.map((r) => h('option', { value: r }, r)));
  const detail = h('textarea', { class: 'champ', rows: 2, 'aria-label': 'Précision', placeholder: 'Précision (facultatif)' });
  const erreur = h('p', { class: 'erreur', role: 'alert' });
  const r = await dialogue({
    titre: 'Affaire perdue',
    contenu: h('div', { class: 'pile' }, h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Raison'), raison), detail, erreur),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Marquer comme perdue', valeur: true, style: 'principal',
      avantFermeture: async () => {
        const res = await D.marquerAffairePerdue(a.id, { raison: raison.value, detail: detail.value });
        if (res.erreurs?.raison) { erreur.textContent = res.erreurs.raison; raison.classList.add('invalide'); return false; }
        return true;
      },
    }],
  });
  if (r) toast('Affaire marquée comme perdue');
  return !!r;
}

/**
 * Changement d'étape avec ses boîtes et ses animations :
 *  - étape « vente gagnée » : feu d'artifice (si les célébrations sont allumées) ;
 *  - action suggérée par l'étape (réglage, aucune par défaut) : fenêtre où l'on accepte ou refuse, jamais créée toute seule.
 */
export async function changerEtapeAvecBoites(a, etape) {
  const rouvre = a.statut === 'perdue';
  if (a.etape === etape && !rouvre) return;
  const r = await D.changerEtapeAffaire(a.id, etape);
  if (r.erreurs && Object.keys(r.erreurs).length) { toast('Changement impossible', { type: 'erreur' }); return; }
  if (L.estEtapeGagnee(etape, D.etat.config) && a.etape !== etape) celebrerGagne(messageBravo(), a.titre);
  if (r.suggestion) {
    await dialogueActivite({ liens: L.liensAffaire(a), titre: 'Action suggérée', valeurs: r.suggestion, libelleOk: 'Accepter', libelleFermer: 'Refuser' });
  }
}

/** Entrées du menu "Déplacer vers…" d'une affaire. */
export function entreesDeplacement(a) {
  const entrees = L.etapesActives(D.etat.config).map((e) => ({ libelle: `Déplacer vers : ${e.libelle}`, icone: 'arrow-right-left', desactive: a.etape === e.id && L.estVivante(a), action: () => changerEtapeAvecBoites(a, e.id) }));
  entrees.push({ libelle: 'Perdue…', icone: 'x', action: () => ouvrirPerdue(a) });
  if (a.statut === 'perdue') entrees.push({ libelle: 'Rouvrir', icone: 'rotate-ccw', action: () => D.rouvrir(a.id) });
  return entrees;
}

export function menuAffaire(a) {
  return [
    { libelle: 'Ouvrir la fiche', icone: 'briefcase', action: () => naviguer(`crm/affaires/${a.id}`) },
    ...(a.statut === 'perdue' ? [{ libelle: 'Rouvrir', icone: 'rotate-ccw', action: () => D.rouvrir(a.id) }] : []),
    { libelle: a.archive ? 'Désarchiver' : 'Archiver', icone: a.archive ? 'archive-restore' : 'archive', action: () => D.archiverAffaire(a.id, !a.archive) },
    { libelle: 'Supprimer définitivement…', icone: 'trash-2', danger: true, action: () => demanderSuppressionAffaire(a) },
  ];
}

export async function demanderSuppressionAffaire(a) {
  const champ = h('input', { class: 'champ', type: 'text', 'aria-label': `Tape « ${a.titre} » pour confirmer`, autocomplete: 'off', placeholder: a.titre });
  const r = await dialogue({
    titre: 'Supprimer définitivement ?',
    contenu: h('div', { class: 'pile' }, h('p', {}, `Pour supprimer « ${a.titre} » avec ses activités, notes et événements, tape son titre ci-dessous. Cette action est définitive.`), champ),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Supprimer', valeur: true, style: 'danger',
      avantFermeture: () => L.confirmationValide(champ.value, a.titre) || (champ.classList.add('invalide'), false),
    }],
  });
  if (!r) return false;
  await D.supprimerAffaire(a.id);
  toast('Affaire supprimée');
  if (location.hash.includes(a.id)) naviguer('crm/affaires');
  return true;
}

// ---------------------------------------------------------------- fenêtre "Ajouter une affaire"

export async function ouvrirCreationAffaire({ personneId = null, organisationId = null } = {}) {
  const personneInitiale = personneId ? D.personne(personneId) : null;
  const orgInitiale = organisationId || personneInitiale?.organisationId || null;
  const titreDefaut = () => L.titreParDefaut({ organisation: D.organisation(orga.choix()?.id || orgInitiale), personne: D.personne(pers.choix()?.id || personneId) });
  let titreModifie = false;
  const champTitre = h('input', { class: 'champ', type: 'text', id: 'creation-affaire-titre', autocomplete: 'off', 'aria-label': 'Titre', placeholder: 'Titre', autofocus: true,
    oninput: () => { titreModifie = true; } });
  const champMontant = h('input', { class: 'champ', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', 'aria-label': 'Montant en euros', placeholder: 'Montant (€)' });
  const modeles = L.modelesAffaireActifs(D.etat.modelesAffaire);
  const champModele = h('select', { class: 'champ', 'aria-label': 'Modèle d’affaire' }, h('option', { value: '' }, 'Aucun modèle'), modeles.map((m) => h('option', { value: m.id }, m.nom)));
  const orga = selecteurOrganisation({ valeurId: orgInitiale, surChoix: majTitre });
  const pers = selecteurPersonne({
    valeurId: personneId,
    surChoix: (el) => {
      const p = el ? D.personne(el.id) : null;
      if (p?.organisationId && !orga.choix()) { const o = D.organisation(p.organisationId); if (o) orga.definir({ id: o.id, libelle: o.nom }); }
      majTitre();
    },
  });
  function majTitre() { if (!titreModifie) { champTitre.value = ''; champTitre.placeholder = titreDefaut() || 'Titre'; } }
  champTitre.placeholder = L.titreParDefaut({ organisation: D.organisation(orgInitiale), personne: personneInitiale }) || 'Titre';
  const erreur = h('p', { class: 'erreur', role: 'alert' });
  let identifiant = null;
  const r = await dialogue({
    titre: 'Ajouter une affaire',
    classe: 'dialogue-formulaire',
    contenu: h('div', { class: 'pile formulaire-creation' },
      h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: 'creation-affaire-titre' }, 'Titre'), champTitre),
      h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Personne'), pers.element),
      h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Organisation'), orga.element),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Montant'), champMontant),
      modeles.length ? h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Modèle d’affaire'), champModele) : null,
      erreur),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Enregistrer', valeur: true, style: 'principal',
      avantFermeture: async () => {
        const titre = L.nettoyerEspaces(champTitre.value) || champTitre.placeholder;
        if (Object.keys(L.validerAffaire({ titre: titre === 'Titre' ? '' : titre })).length) { erreur.textContent = 'Le titre est obligatoire.'; champTitre.classList.add('invalide'); champTitre.focus(); return false; }
        try {
          const organisationIdChoisie = await organisationChoisieOuSaisie(orga);
          const choixPersonne = pers.choix();
          let idPersonne = choixPersonne?.id || null;
          if (!idPersonne && pers.texte()) {
            const existante = L.trouverDoublonsPersonne(D.etat.personnes, { nom: pers.texte() })[0];
            idPersonne = existante ? existante.id : await D.creerPersonne({ nom: pers.texte(), organisationId: organisationIdChoisie });
          }
          identifiant = await D.creerAffaire({ titre, personneId: idPersonne, organisationId: organisationIdChoisie, montant: champMontant.value }, { modeleId: champModele.value || null });
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
    toast('Affaire ajoutée', { lien: { libelle: 'Ouvrir la fiche', href: cheminAffaire(identifiant) }, duree: 5000 });
    return identifiant;
  }
  return null;
}

// ---------------------------------------------------------------- page Affaires

function contexteFiltres() {
  return { activites: D.etat.activites, personnes: D.etat.personnes, organisations: D.etat.organisations, aujourdhui: D.ctx().aujourdhui, config: D.etat.config };
}

function prochaine(a) {
  return L.prochaineActivite(L.activitesDeAffaire(D.etat.activites, a.id));
}

function trierCartes(affaires) {
  if (triKanban === 'montant') return L.trier(affaires, (a) => (a.montant === null || a.montant === undefined ? null : -Number(a.montant)));
  if (triKanban === 'titre') return L.trier(affaires, (a) => L.normaliser(a.titre));
  if (triKanban === 'creation') return L.trier(affaires, (a) => -(L.versDate(a.creeLe)?.getTime() ?? 0));
  return L.trier(affaires, (a) => { const p = prochaine(a); return p ? `${p.date}T${p.heure || '00:00'}` : null; });
}

function carte(a) {
  const aujourdhui = D.ctx().aujourdhui;
  const activites = L.activitesDeAffaire(D.etat.activites, a.id);
  const couleur = L.pastilleActivite(activites, aujourdhui);
  const p = D.personne(a.personneId);
  const o = D.organisation(a.organisationId);
  const priorite = a.priorite && a.priorite !== 'tiede' ? h('span', { class: `badge-priorite ${a.priorite}` }, L.libellePriorite(a.priorite)) : null;
  const menu = h('button', { type: 'button', class: 'bouton-icone carte-menu', 'aria-label': `Actions : ${a.titre}`, onclick: (e) => { e.stopPropagation(); ouvrirMenu(e.currentTarget, entreesDeplacement(a)); } }, icone('ellipsis', { taille: 16 }));
  const el = h('article', { class: `carte-affaire statut-${L.statutAffiche(a)}`, draggable: 'true', tabindex: '0', dataset: { affaire: a.id }, 'aria-label': a.titre,
    onclick: (e) => { if (!e.target.closest('a, button')) naviguer(`crm/affaires/${a.id}`); },
    onkeydown: (e) => { if (e.key === 'Enter' && e.target === el) naviguer(`crm/affaires/${a.id}`); },
    ondragstart: (e) => { enDeplacement = true; e.dataTransfer.setData('text/plain', a.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('en-deplacement'); },
    ondragend: () => { enDeplacement = false; el.classList.remove('en-deplacement'); document.querySelectorAll('.colonne.cible').forEach((c) => c.classList.remove('cible')); rafraichir(); } },
  h('div', { class: 'carte-ligne' }, h('strong', { class: 'carte-titre' }, a.titre), menu),
  o ? h('span', { class: 'carte-sous' }, icone('building-2', { taille: 12 }), o.nom) : null,
  p ? h('span', { class: 'carte-sous' }, icone('user', { taille: 12 }), p.nom) : null,
  h('div', { class: 'carte-pied' },
    h('span', { class: 'carte-montant' }, a.montant !== null && a.montant !== undefined ? L.formatEuros(a.montant) : ''),
    priorite,
    couleur === 'rouge' ? h('span', { class: 'badge-retard' }, 'En retard') : null,
    pastilleActivite(couleur)));
  return el;
}

function colonne({ id, titre, couleur, affaires, onDrop }) {
  const totaux = L.totauxColonne(affaires);
  const corps = h('div', { class: 'colonne-corps' }, trierCartes(affaires).map(carte));
  const el = h('section', { class: 'colonne', dataset: { colonne: id }, 'aria-label': titre, style: { '--couleur': couleur },
    ondragover: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('cible'); },
    ondragleave: (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('cible'); },
    ondrop: (e) => {
      e.preventDefault();
      el.classList.remove('cible');
      enDeplacement = false;
      const a = D.affaire(e.dataTransfer.getData('text/plain'));
      if (a) onDrop(a);
    } },
  h('header', { class: 'colonne-tete' },
    h('h2', {}, titre),
    h('span', { class: 'colonne-totaux' }, `${totaux.montant ? `${L.formatEuros(totaux.montant)} · ` : ''}${totaux.nombre} ${totaux.nombre > 1 ? 'affaires' : 'affaire'}`)),
  corps);
  return el;
}

let rafraichir = () => {};

export function rendreAffaires(conteneur) {
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const zone = h('div', { class: 'zone-affaires' });
  const filtres = barreFiltres({
    liste: 'affaires', placeholder: 'Rechercher une affaire',
    lireCriteres: () => criteres,
    ecrireCriteres: (c) => { criteres = L.criteresComplets('affaires', c); rendre(); filtres.rafraichir(); },
    contexte: () => ({ offres: D.etat.offres, personnes: D.etat.personnes, organisations: D.etat.organisations, config: D.etat.config }),
  });

  function bascule() {
    const vues = [['kanban', 'Kanban', 'square-kanban'], ['liste', 'Liste', 'list'], ['archives', 'Archives', 'archive']];
    return h('div', { class: 'bascule-vues', role: 'group', 'aria-label': 'Vue' }, vues.map(([id, libelle, ic]) => h('button', {
      type: 'button', class: `bascule-vue${vue === id ? ' actif' : ''}`, 'aria-pressed': String(vue === id), dataset: { vue: id },
      onclick: () => { vue = id; ecrirePreference('vue.affaires', id); rendre(); },
    }, icone(ic, { taille: 16 }), h('span', {}, libelle))));
  }
  const zoneBascule = h('div', {});
  const selectTri = h('select', { class: 'champ champ-tri', 'aria-label': 'Trier par', onchange: (e) => { triKanban = e.target.value; ecrirePreference('tri.kanban', triKanban); rendre(); } },
    [['activite', 'Trier par : Activité suivante'], ['montant', 'Trier par : Montant'], ['titre', 'Trier par : Titre'], ['creation', 'Trier par : Création']].map(([v, l]) => h('option', { value: v, selected: v === triKanban }, l)));

  function rendre() {
    remplir(zoneBascule, bascule());
    selectTri.hidden = vue !== 'kanban';
    if (!D.estPret()) { remplir(zone, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); return; }
    if (vue === 'kanban') rendreKanban();
    else rendreListe(vue === 'archives');
  }

  function rendreKanban() {
    const ctxF = contexteFiltres();
    const ouvertes = L.filtrerAffaires(D.etat.affaires, { ...criteres, archives: false }, ctxF);
    const vivantes = ouvertes.filter((a) => L.estVivante(a));
    remplir(compteur, `${vivantes.length} ${vivantes.length > 1 ? 'affaires' : 'affaire'}`);
    if (!D.etat.affaires.length) {
      remplir(zone, etatVide('Ajoute ta première affaire depuis la fiche d’une personne, ou avec le bouton ci-dessous.', { action: h('button', { type: 'button', class: 'bouton bouton-principal', onclick: () => ouvrirCreationAffaire() }, icone('plus', { taille: 16 }), 'Affaire') }));
      return;
    }
    // Toutes les étapes actives, même vides (on peut glisser une carte dans chacune).
    const colonnes = L.etapesActives(D.etat.config).map((e) => {
      const liste = vivantes.filter((a) => a.etape === e.id);
      return colonne({ id: e.id, titre: e.libelle, couleur: e.couleur, affaires: liste, onDrop: (a) => changerEtapeAvecBoites(a, e.id) });
    });
    remplir(zone, h('div', { class: 'kanban' }, colonnes));
  }

  const COLONNES_LISTE = [
    { id: 'titre', libelle: 'Titre', tri: (a) => L.normaliser(a.titre) },
    { id: 'personne', libelle: 'Personne', tri: (a) => L.normaliser(D.personne(a.personneId)?.nom) },
    { id: 'organisation', libelle: 'Organisation', tri: (a) => L.normaliser(D.organisation(a.organisationId)?.nom) },
    { id: 'etape', libelle: 'Étape', tri: (a) => D.etat.config.etapes.findIndex((e) => e.id === a.etape) },
    { id: 'montant', libelle: 'Montant', tri: (a) => (a.montant === null || a.montant === undefined ? null : Number(a.montant)) },
    { id: 'priorite', libelle: 'Priorité', tri: (a) => L.PRIORITES.findIndex((p) => p.id === a.priorite) },
    { id: 'activite', libelle: 'Prochaine activité', tri: (a) => { const p = prochaine(a); return p ? `${p.date}T${p.heure || '00:00'}` : null; } },
  ];

  function rendreListe(archives) {
    const ctxF = contexteFiltres();
    let lignes = L.filtrerAffaires(D.etat.affaires, { ...criteres, archives }, ctxF);
    const col = COLONNES_LISTE.find((c) => c.id === triListe.colonne) || COLONNES_LISTE[0];
    lignes = L.trier(lignes, col.tri, triListe.sens);
    remplir(compteur, `${lignes.length} ${lignes.length > 1 ? 'affaires' : 'affaire'}${archives ? ' archivées' : ''}`);
    if (!lignes.length) { remplir(zone, etatVide(archives ? 'Aucune affaire archivée.' : 'Aucune affaire ne correspond.')); return; }
    const aujourdhui = D.ctx().aujourdhui;
    const entete = h('tr', {}, COLONNES_LISTE.map((c) => h('th', { scope: 'col', 'aria-sort': triListe.colonne === c.id ? (triListe.sens === 'asc' ? 'ascending' : 'descending') : 'none' },
      h('button', { type: 'button', class: 'tri', onclick: () => { triListe = { colonne: c.id, sens: triListe.colonne === c.id && triListe.sens === 'asc' ? 'desc' : 'asc' }; rendre(); } },
        c.libelle, triListe.colonne === c.id ? icone(triListe.sens === 'asc' ? 'arrow-up' : 'arrow-down', { taille: 12 }) : null))), h('th', { class: 'col-actions' }));
    const corps = lignes.map((a) => {
      const p = prochaine(a);
      return h('tr', { class: 'ligne-liste', dataset: { id: a.id }, onclick: (e) => { if (!e.target.closest('a, button')) naviguer(`crm/affaires/${a.id}`); } },
        h('td', { dataset: { libelle: 'Titre' } }, h('a', { class: 'cellule-nom', href: cheminAffaire(a.id) }, h('span', {}, a.titre))),
        h('td', { dataset: { libelle: 'Personne' } }, lienPersonne(D.personne(a.personneId))),
        h('td', { dataset: { libelle: 'Organisation' } }, lienOrganisation(D.organisation(a.organisationId))),
        h('td', { dataset: { libelle: 'Étape' } }, L.estVivante(a) ? pastilleEtape(a.etape) : pastilleStatut(L.statutAffiche(a))),
        h('td', { dataset: { libelle: 'Montant' } }, a.montant !== null && a.montant !== undefined ? L.formatEuros(a.montant) : null),
        h('td', { dataset: { libelle: 'Priorité' } }, L.libellePriorite(a.priorite)),
        h('td', { dataset: { libelle: 'Prochaine activité' } }, p ? h('span', { class: 'activite-liste' }, pastilleActivite(L.pastilleActivite([p], aujourdhui)), `${p.titre} · ${L.formatJourCourt(p.date, aujourdhui)}`) : null),
        h('td', { class: 'col-actions' }, h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Actions : ${a.titre}`, onclick: (e) => ouvrirMenu(e.currentTarget, menuAffaire(a)) }, icone('ellipsis', { taille: 18 }))));
    });
    remplir(zone, h('div', { class: 'zone-tableau' }, h('table', { class: 'tableau tableau-affaires' }, h('thead', {}, entete), h('tbody', {}, corps))));
  }

  const entete = h('header', { class: 'page-tete' },
    h('div', {}, h('h1', {}, 'Affaires'), compteur),
    h('div', { class: 'page-actions' },
      zoneBascule,
      h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'nouvelle-affaire', onclick: () => ouvrirCreationAffaire() }, icone('plus', { taille: 16 }), 'Affaire')));
  conteneur.append(h('div', { class: 'page page-affaires' }, entete, h('div', { class: 'barre-affaires' }, filtres.element, selectTri), zone));

  const planifie = planifier(() => { if (enDeplacement) return; rendre(); filtres.rafraichir(); });
  rafraichir = () => planifie();
  rendre();
  const arret = D.surChangement(planifie);
  return () => { arret(); rafraichir = () => {}; };
}

