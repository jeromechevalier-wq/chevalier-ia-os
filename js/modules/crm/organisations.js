// Liste des organisations et fenêtre "Ajouter une organisation".
import { h, icone, remplir, dialogue, toast, ouvrirMenu, lirePreference, ecrirePreference } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { avatar, cheminOrganisation, pastillesEtiquettes, selecteurEtiquettes, etatVide, planifier, selecteurTri } from './composants.js';
import * as T from './tri.js';
import { barreFiltres } from './filtres.js';

let criteres = L.criteresComplets('organisations', {});
// Un seul tri : { critere, sens }, piloté par le menu de tri, la flèche et les en-têtes ; mémorisé sous `tri.organisations`.
let tri = T.lireTriMemorise('organisations', lirePreference);

const nbPersonnes = (o) => L.personnesDeLOrganisation(D.etat.personnes, o.id).length;
const nbAffairesEnCours = (o) => D.etat.affaires.filter((a) => a.organisationId === o.id && L.estAffaireActive(a)).length;

const COLONNES = [
  { id: 'nom', libelle: 'Nom', tri: (o) => L.normaliser(o.nom), fixe: true },
  { id: 'ville', libelle: 'Ville', tri: (o) => L.normaliser(o.ville) },
  { id: 'secteur', libelle: 'Secteur', tri: (o) => L.normaliser(o.secteur) },
  { id: 'personnes', libelle: 'Personnes', tri: nbPersonnes },
  { id: 'affaires', libelle: 'Affaires en cours', tri: nbAffairesEnCours },
  { id: 'etiquettes', libelle: 'Étiquettes', tri: (o) => (o.etiquettes || []).length },
];
const COLONNES_DEFAUT = COLONNES.map((c) => c.id);
/** Clés de tri : celles des colonnes (même identifiant), plus la création (sans colonne). */
const CLES_TRI = { ...Object.fromEntries(COLONNES.map((c) => [c.id, c.tri])), creation: T.cleCreation };

function colonnesVisibles() {
  try {
    const v = JSON.parse(lirePreference('colonnes.organisations', 'null'));
    if (Array.isArray(v) && v.length) return v.filter((id) => COLONNES.some((c) => c.id === id));
  } catch { /* préférence illisible */ }
  return COLONNES_DEFAUT;
}

function cellule(colonne, o) {
  switch (colonne) {
    case 'nom': return h('a', { class: 'cellule-nom', href: cheminOrganisation(o.id) }, avatar(o.nom, 30, 'avatar-organisation'), h('span', {}, o.nom));
    case 'ville': return o.ville || null;
    case 'secteur': return o.secteur || null;
    case 'personnes': return String(nbPersonnes(o));
    case 'affaires': return String(nbAffairesEnCours(o));
    case 'etiquettes': return pastillesEtiquettes(o.etiquettes);
    default: return null;
  }
}

export function rendreOrganisations(conteneur) {
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const zoneTableau = h('div', { class: 'zone-tableau' });
  const filtres = barreFiltres({
    liste: 'organisations', placeholder: 'Rechercher une organisation',
    lireCriteres: () => criteres,
    ecrireCriteres: (c) => { criteres = L.criteresComplets('organisations', c); rendre(); filtres.rafraichir(); },
    contexte: () => ({ etiquettes: D.etat.etiquettes }),
  });
  const boutonColonnes = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Choisir les colonnes', 'data-action': 'colonnes',
    onclick: (e) => {
      const visibles = colonnesVisibles();
      ouvrirMenu(e.currentTarget, COLONNES.filter((c) => !c.fixe).map((c) => ({
        libelle: `${visibles.includes(c.id) ? '✓ ' : ''}${c.libelle}`,
        action: () => {
          const v = visibles.includes(c.id) ? visibles.filter((x) => x !== c.id) : [...visibles, c.id];
          ecrirePreference('colonnes.organisations', JSON.stringify(COLONNES.filter((x) => x.fixe || v.includes(x.id)).map((x) => x.id)));
          rendre();
        },
      })));
    } }, icone('columns-3', { taille: 18 }));

  const choixTri = selecteurTri({ options: T.optionsMenu('organisations', tri.critere), valeur: tri.critere, sens: tri.sens, surChangement: (nouveau) => changerTri(nouveau) });
  function changerTri(nouveau) {
    tri = nouveau;
    ecrirePreference('tri.organisations', T.texteTri(tri));
    rendre();
  }

  function rendre() {
    choixTri.maj(T.optionsMenu('organisations', tri.critere), tri.critere, tri.sens);
    let lignes = L.filtrerOrganisations(D.etat.organisations, criteres);
    lignes = T.trierSelon(lignes, tri, CLES_TRI);
    remplir(compteur, `${lignes.length} ${lignes.length > 1 ? 'organisations' : 'organisation'}`);
    if (!D.estPret()) { remplir(zoneTableau, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); return; }
    if (!lignes.length) {
      remplir(zoneTableau, etatVide(
        D.etat.organisations.length ? 'Aucune organisation ne correspond.' : 'Ajoute ta première organisation.',
        { action: D.etat.organisations.length ? null : h('button', { type: 'button', class: 'bouton bouton-principal', onclick: () => ouvrirCreationOrganisation() }, icone('plus', { taille: 16 }), 'Organisation') }));
      return;
    }
    const visibles = COLONNES.filter((c) => colonnesVisibles().includes(c.id));
    const entete = h('tr', {}, visibles.map((c) => h('th', { scope: 'col', 'aria-sort': tri.critere === c.id ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none' },
      h('button', { type: 'button', class: 'tri', onclick: () => changerTri(T.triApresClicColonne('organisations', tri, c.id)) },
        c.libelle, tri.critere === c.id ? icone(tri.sens === 'asc' ? 'arrow-up' : 'arrow-down', { taille: 12 }) : null))),
    h('th', { class: 'col-actions' }, boutonColonnes));
    const corps = lignes.map((o) => h('tr', { class: 'ligne-liste', dataset: { id: o.id },
      onclick: (e) => { if (!e.target.closest('a, button')) naviguer(`crm/organisations/${o.id}`); } },
    visibles.map((c) => h('td', { dataset: { colonne: c.id, libelle: c.libelle } }, cellule(c.id, o))),
    h('td', { class: 'col-actions' }, h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Actions : ${o.nom}`,
      onclick: (e) => ouvrirMenu(e.currentTarget, menuOrganisation(o)) }, icone('ellipsis', { taille: 18 })))));
    remplir(zoneTableau, h('table', { class: 'tableau tableau-organisations' }, h('thead', {}, entete), h('tbody', {}, corps)));
  }

  const entete = h('header', { class: 'page-tete' },
    h('div', {}, h('h1', {}, 'Organisations'), compteur),
    h('div', { class: 'page-actions' },
      h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'nouvelle-organisation', onclick: () => ouvrirCreationOrganisation() }, icone('plus', { taille: 16 }), 'Organisation')));
  conteneur.append(h('div', { class: 'page page-liste' }, entete, h('div', { class: 'barre-affaires' }, filtres.element, choixTri.element), zoneTableau));

  const rafraichir = planifier(() => { rendre(); filtres.rafraichir(); });
  rendre();
  return D.surChangement(rafraichir);
}

/** Suppression d'une organisation : refusée (message clair) tant qu'elle a des personnes ou des affaires. */
export async function demanderSuppressionOrganisation(o) {
  const verif = L.verifierSuppressionOrganisation(o.id, { personnes: D.etat.personnes, affaires: D.etat.affaires });
  if (!verif.ok) {
    const archiver = await dialogue({
      titre: 'Suppression impossible', contenu: h('p', {}, verif.raison),
      boutons: [{ libelle: 'Fermer', valeur: false }, { libelle: 'Archiver', valeur: true, style: 'principal' }],
    });
    if (archiver) { await D.majOrganisation(o.id, { archive: true }); toast('Organisation archivée'); }
    return false;
  }
  const champ = h('input', { class: 'champ', type: 'text', 'aria-label': `Tape « ${o.nom} » pour confirmer`, autocomplete: 'off', placeholder: o.nom });
  const r = await dialogue({
    titre: 'Supprimer définitivement ?',
    contenu: h('div', { class: 'pile' }, h('p', {}, `Pour supprimer « ${o.nom} », tape son nom ci-dessous. Cette action est définitive.`), champ),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Supprimer', valeur: true, style: 'danger',
      avantFermeture: () => L.confirmationValide(champ.value, o.nom) || (champ.classList.add('invalide'), false),
    }],
  });
  if (!r) return false;
  try {
    await D.supprimerOrganisation(o.id);
    toast('Organisation supprimée');
    naviguer('crm/organisations');
    return true;
  } catch (e) {
    toast(e.message || 'Suppression impossible', { type: 'erreur' });
    return false;
  }
}

export function menuOrganisation(o) {
  return [
    { libelle: 'Ouvrir la fiche', icone: 'building-2', action: () => naviguer(`crm/organisations/${o.id}`) },
    { libelle: o.archive ? 'Désarchiver' : 'Archiver', icone: o.archive ? 'archive-restore' : 'archive', action: () => D.majOrganisation(o.id, { archive: !o.archive }) },
    { libelle: 'Supprimer définitivement…', icone: 'trash-2', danger: true, action: () => demanderSuppressionOrganisation(o) },
  ];
}

// ---------------------------------------------------------------- fenêtre "Ajouter une organisation"

export async function ouvrirCreationOrganisation({ nom = '' } = {}) {
  const champNom = h('input', { class: 'champ', type: 'text', id: 'creation-org-nom', autocomplete: 'off', 'aria-label': 'Nom', placeholder: 'Nom', value: nom, autofocus: true });
  const champAdresse = h('input', { class: 'champ', type: 'text', autocomplete: 'off', 'aria-label': 'Adresse', placeholder: 'Adresse' });
  let etiquettes = [];
  const champEtiquettes = selecteurEtiquettes({ surChoix: (liste) => { etiquettes = liste.map((e) => e.id); } });
  const bandeau = h('div', { class: 'bandeau-doublon', role: 'status', hidden: true });
  let boutonEnregistrer = null;
  function verifierDoublon() {
    const trouves = L.trouverDoublonsOrganisation(D.etat.organisations, champNom.value);
    bandeau.hidden = !trouves.length;
    if (trouves.length) remplir(bandeau, icone('triangle-alert', { taille: 16 }), h('span', {}, 'Cette organisation existe déjà : ', h('a', { href: cheminOrganisation(trouves[0].id), onclick: () => { document.querySelector('.voile-dialogue')?.remove(); } }, trouves[0].nom)));
    if (boutonEnregistrer) boutonEnregistrer.textContent = trouves.length ? 'Créer quand même' : 'Enregistrer';
  }
  champNom.addEventListener('input', verifierDoublon);
  const corps = h('div', { class: 'pile formulaire-creation' },
    h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: 'creation-org-nom' }, 'Nom'), champNom),
    bandeau,
    h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Étiquettes'), champEtiquettes.element),
    h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Adresse'), champAdresse),
    h('p', { class: 'erreur', role: 'alert', 'data-erreur': 'creation' }));
  let identifiant = null;
  const r = await dialogue({
    titre: 'Ajouter une organisation',
    classe: 'dialogue-formulaire',
    contenu: corps,
    boutons: [
      { libelle: 'Annuler', valeur: false },
      {
        libelle: 'Enregistrer', valeur: true, style: 'principal',
        avantFermeture: async () => {
          const erreur = corps.querySelector('[data-erreur]');
          const valeurs = { nom: champNom.value, adresse: champAdresse.value, etiquettes };
          const erreurs = L.validerOrganisation(valeurs);
          if (erreurs.nom) { erreur.textContent = erreurs.nom; champNom.classList.add('invalide'); champNom.focus(); return false; }
          try {
            identifiant = await D.creerOrganisation(valeurs);
            return true;
          } catch (e) {
            console.warn(e);
            erreur.textContent = 'Enregistrement impossible, réessaie.';
            return false;
          }
        },
      },
    ],
    auMontage: ({ boite, boutons }) => {
      boutonEnregistrer = boutons.at(-1);
      boite.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.defaultPrevented && e.target.tagName === 'INPUT') { e.preventDefault(); boutonEnregistrer.click(); }
      });
    },
  });
  if (r && identifiant) {
    toast('Organisation ajoutée', { lien: { libelle: 'Ouvrir la fiche', href: cheminOrganisation(identifiant) }, duree: 5000 });
    return identifiant;
  }
  return null;
}

