// Écran « Relations » du module Réseaux sociaux : où en est chaque échange LinkedIn, en quatre colonnes (À écrire, En attente, En échange, Rendez-vous).
// Rien n'est copié : les personnes, leurs étiquettes (les catégories) et les activités « linkedin » viennent du CRM ; la colonne et le badge de relance se calculent
// par `etapeRelation` (logique.js du module). Les cartes ne se déplacent pas (la colonne se déduit des échanges, jamais d'un glisser-déposer).
// Le module marche aussi quand Affaires est éteint : il lit lui-même les activités et les étiquettes (donnees.js du module), jamais celles de l'état du CRM.
import { h, icone, remplir, toast, confirmer, lirePreference, ecrirePreference } from '../../os/ui.js';
import { lien, naviguer } from '../../os/router.js';
import { enteteListe, barreListe, basculeVues } from '../crm/barre-liste.js';
import { boutonFiltres, fenetreFiltres, controleTests } from '../crm/filtres.js';
import { avatar, badgeTest, etatVide, pastilleEtiquette, MESSAGE_TEST_ECHEC } from '../crm/composants.js';
import { ouvrirCreationPersonne } from '../crm/personnes.js';
import * as CRM from '../crm/donnees.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';
import * as R from './logique.js';
import * as RL from './relations-logique.js';
import { ongletsReseauxSociaux, chargement } from './commun.js';

const VUES = [['kanban', 'Kanban', 'square-kanban'], ['liste', 'Liste', 'list']];
const GRIS = 'var(--bordure-forte)';

// Filtres mémorisés jusqu'au rechargement de la page ; la vue se garde aussi sur l'appareil.
let criteres = RL.criteresRelations();
let vue = null;

/** Filtres mémorisés jusqu'au rechargement de la page : remis à zéro à la déconnexion ou au changement de compte. */
export function oublierFiltresRelations() {
  criteres = RL.criteresRelations();
  vue = null;
}

const vueMemorisee = () => {
  const v = lirePreference('vue.reseauxsociaux.relations', 'kanban');
  return VUES.some(([id]) => id === v) ? v : 'kanban';
};

// Feuille de style de l'écran, ajoutée au premier affichage (la feuille commune du module est posée par index.js).
function ajouterFeuille(nom) {
  if (document.querySelector(`link[data-reseauxsociaux="${nom}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL(`../../../css/${nom}.css`, import.meta.url).href;
  l.dataset.reseauxsociaux = nom;
  document.head.append(l);
}

const nomOrganisation = (p) => CRM.organisation(p.organisationId)?.nom || '';
/** La fiche d'une personne n'est servie que si le module Affaires est actif : sans lui le nom reste du texte (même règle que l'écran Aujourd'hui). */
const ficheDisponible = () => !CRM.estNoyau();

/** Pastille d'une catégorie : la vraie étiquette du CRM (nom et couleur) quand elle est lue, sinon son nom attendu en gris. */
function pastilleCategorie(id) {
  const lue = D.etat.etiquettes.find((e) => e.id === id);
  const prevue = R.CATEGORIES.find((c) => c.id === id);
  return h('span', { dataset: { categorie: id } }, pastilleEtiquette({ nom: lue?.nom || prevue?.nom || id, couleur: lue?.couleur || GRIS }));
}
const pastillesCategories = (r) => (r.categories.length
  ? h('span', { class: 'groupe-pastilles' }, r.categories.map(pastilleCategorie))
  : h('span', { class: 'pastille-etiquette', style: { '--couleur': GRIS }, dataset: { categorie: 'aucune' } }, 'Sans catégorie'));

/** Badge d'une relation : rouge pour « À relancer · N j » (jamais jaune), pastille grise pour « À répondre ». */
function badge(r) {
  if (!r.badge) return null;
  return r.badge === 'relancer'
    ? h('span', { class: 'badge-retard', dataset: { badge: 'relancer' } }, R.libelleBadgeRelation(r))
    : h('span', { class: 'pastille-etiquette', style: { '--couleur': GRIS }, dataset: { badge: 'repondre' } }, R.libelleBadgeRelation(r));
}

const nomLisible = (p) => p.nom || 'Sans nom';
const lienNom = (p, classe = 'lien-fiche') => (ficheDisponible()
  ? h('a', { class: classe, href: lien(`crm/personnes/${p.id}`), dataset: { role: 'nom' } }, nomLisible(p))
  : h('span', { class: classe, dataset: { role: 'nom' } }, nomLisible(p)));

const texteDernier = (r) => (r.dernier ? `Dernier échange : ${RL.libelleJourCourt(r.dernier)}` : 'Aucun échange pour le moment');

function carte(r) {
  const p = r.personne;
  const orga = nomOrganisation(p);
  const ouvrir = () => { if (ficheDisponible()) naviguer(`crm/personnes/${p.id}`); };
  const el = h('article', { class: 'carte-affaire carte-relation', tabindex: '0', dataset: { personne: p.id, etape: r.etape }, 'aria-label': nomLisible(p),
    onclick: (e) => { if (!e.target.closest('a, button')) ouvrir(); },
    onkeydown: (e) => { if (e.key === 'Enter' && e.target === el) ouvrir(); } },
  h('div', { class: 'carte-ligne' }, avatar(nomLisible(p), 32), h('strong', { class: 'carte-titre' }, lienNom(p, 'lien-fiche carte-nom'), badgeTest(p))),
  orga ? h('span', { class: 'carte-sous' }, icone('building-2', { taille: 12 }), orga) : null,
  h('div', { class: 'carte-pastilles' }, pastillesCategories(r)),
  h('div', { class: 'carte-pied' }, badge(r), h('span', { class: 'carte-sous carte-date' }, texteDernier(r))));
  return el;
}

function colonne(def, relations) {
  return h('section', { class: 'colonne', dataset: { colonne: def.id }, 'aria-label': def.libelle, style: { '--couleur': def.couleur } },
    h('header', { class: 'colonne-tete' }, h('h2', {}, def.libelle), h('span', { class: 'colonne-totaux' }, RL.texteCompteRelations(relations.length))),
    h('div', { class: 'colonne-corps' }, relations.map(carte)));
}

function tableauListe(relations) {
  const libelleEtape = (id) => RL.COLONNES_RELATIONS.find((c) => c.id === id)?.libelle || '';
  const entetes = ['Nom', 'Organisation', 'Catégorie', 'Étape', 'Dernier échange', 'À faire'];
  const corps = relations.map((r) => h('tr', { class: 'ligne-liste', dataset: { personne: r.personne.id, etape: r.etape },
    onclick: (e) => { if (!e.target.closest('a, button') && ficheDisponible()) naviguer(`crm/personnes/${r.personne.id}`); } },
  h('td', { dataset: { libelle: 'Nom' } }, h('span', { class: 'cellule-nom' }, avatar(nomLisible(r.personne), 30), lienNom(r.personne, 'lien-fiche'), badgeTest(r.personne))),
  h('td', { dataset: { libelle: 'Organisation' } }, nomOrganisation(r.personne) || null),
  h('td', { dataset: { libelle: 'Catégorie' } }, pastillesCategories(r)),
  h('td', { dataset: { libelle: 'Étape' } }, libelleEtape(r.etape)),
  h('td', { dataset: { libelle: 'Dernier échange' } }, r.dernier ? RL.libelleJourCourt(r.dernier) : null),
  h('td', { dataset: { libelle: 'À faire' } }, badge(r))));
  return h('table', { class: 'tableau tableau-relations' }, h('thead', {}, h('tr', {}, entetes.map((t) => h('th', { scope: 'col' }, h('span', { class: 'tri' }, t))))), h('tbody', {}, corps));
}

const nomCategorie = (id) => (id === RL.SANS_CATEGORIE ? 'Sans catégorie' : D.etat.etiquettes.find((e) => e.id === id)?.nom || R.CATEGORIES.find((c) => c.id === id)?.nom || id);

/** Contrôles de la fenêtre « Filtres » commune : catégories (avec « Sans catégorie »), deux cases de relance, et le filtre « Tests ». */
function controlesFiltres() {
  return [
    { cle: 'categories', libelle: 'Catégorie', type: 'cases', options: [...R.CATEGORIES.map((c) => ({ valeur: c.id, libelle: nomCategorie(c.id) })), { valeur: RL.SANS_CATEGORIE, libelle: 'Sans catégorie' }] },
    { cle: 'aRelancer', libelle: 'À relancer seulement', type: 'oui' },
    { cle: 'aRepondre', libelle: 'À répondre seulement', type: 'oui' },
    controleTests(),
  ];
}

/** Les filtres posés, sous forme de pastilles qu'on retire une à une : [{ libelle, retirer(criteres) → criteres }]. */
function pastillesActives(c) {
  const sortie = [];
  for (const id of c.categories) sortie.push({ libelle: nomCategorie(id), retirer: (k) => ({ ...k, categories: k.categories.filter((x) => x !== id) }) });
  if (c.aRelancer) sortie.push({ libelle: 'À relancer seulement', retirer: (k) => ({ ...k, aRelancer: false }) });
  if (c.aRepondre) sortie.push({ libelle: 'À répondre seulement', retirer: (k) => ({ ...k, aRepondre: false }) });
  if (c.tests !== RL.CRITERES_RELATIONS_VIDES.tests) sortie.push({ libelle: L.libelleFiltreTests(c.tests), retirer: (k) => ({ ...k, tests: RL.CRITERES_RELATIONS_VIDES.tests }) });
  return sortie;
}

/** Ajoute une relation : la fenêtre « Ajouter une personne » du CRM, telle quelle ; la personne créée reçoit ensuite la source « LinkedIn » pour figurer ici. */
async function ajouterRelation() {
  try {
    const id = await ouvrirCreationPersonne();
    if (id) await CRM.majPersonne(id, { source: 'LinkedIn' });
  } catch (e) {
    console.warn(e);
    toast(MESSAGE_TEST_ECHEC, { type: 'erreur' });
  }
}

const MESSAGES_CLAIRS = ['Les catégories ne sont pas disponibles pour le moment.', 'Ouvre une fois Affaires pour préparer les catégories.'];

/** Bandeau des catégories : rien tant que les étiquettes ne sont pas lues ou quand tout existe ; sinon bouton « Créer les catégories » (jamais automatique) ou raison. */
function bandeauCategories() {
  const e = D.etat;
  if (e.etiquettesDisponibles === null) return null;
  if (e.etiquettesDisponibles === false) {
    return h('p', { class: 'aide', dataset: { role: 'categories-indisponibles' } }, 'Les catégories ne sont pas disponibles pour le moment.');
  }
  const manquantes = RL.nomsCategoriesManquantes(e.etiquettes);
  if (!manquantes.length) return null;
  const creer = async () => {
    const ok = await confirmer('Créer les catégories ?', `Ces catégories vont être ajoutées à tes étiquettes : ${manquantes.join(', ')}. Les étiquettes que tu as déjà ne changent pas.`, { libelleOk: 'Créer les catégories' });
    if (!ok) return;
    try {
      const r = await D.creerCategories(manquantes);
      toast(r.creees.length ? `Catégories créées : ${r.creees.join(', ')}` : 'Les catégories existent déjà');
    } catch (err) {
      console.warn(err);
      toast(MESSAGES_CLAIRS.includes(err?.message) ? err.message : MESSAGE_TEST_ECHEC, { type: 'erreur' });
    }
  };
  return h('div', { class: 'bandeau-categories', role: 'status', dataset: { role: 'bandeau-categories' } },
    h('span', {}, 'Les catégories ne sont pas encore créées.'),
    h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'creer-categories' }, onclick: creer }, 'Créer les catégories'));
}

export function rendreRelations(conteneur) {
  ajouterFeuille('reseauxsociaux-relations');
  vue = vue ?? vueMemorisee();
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const zone = h('div', { class: 'zone-relations' });
  const zoneBandeau = h('div', { class: 'zone-bandeau-categories' });
  const zoneVues = h('div', { class: 'zone-bascule' });
  const pastilles = h('div', { class: 'pastilles-actives' });
  const boutons = boutonFiltres({ auClic: async () => {
    const r = await fenetreFiltres({ controles: controlesFiltres(), criteres: { ...criteres }, effacer: () => RL.criteresRelations({ recherche: criteres.recherche }) });
    if (r) poser(RL.criteresRelations({ ...r, recherche: criteres.recherche }));
  } });
  const barre = barreListe({
    recherche: { placeholder: 'Rechercher une relation', libelleAria: 'Rechercher une relation (nom ou organisation)', valeur: criteres.recherche, surSaisie: (v) => poser({ ...criteres, recherche: v }) },
    elements: { filtres: boutons.element, vues: zoneVues, pastilles },
  });
  const bouton = h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'nouvelle-relation' }, onclick: ajouterRelation }, icone('plus', { taille: 16 }), 'Relation');

  function poser(nouveaux) { criteres = RL.criteresRelations(nouveaux); rendre(); }

  function rendre() {
    remplir(zoneBandeau, bandeauCategories());
    remplir(zoneVues, basculeVues({ vues: VUES, courante: vue, surChangement: (id) => { vue = id; ecrirePreference('vue.reseauxsociaux.relations', id); rendre(); } }));
    boutons.majCompte(RL.nombreFiltres(criteres));
    remplir(pastilles, pastillesActives(criteres).map((a) => h('span', { class: 'pastille-filtre' }, a.libelle,
      h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': `Retirer le filtre : ${a.libelle}`, onclick: () => poser(a.retirer(criteres)) }, icone('x', { taille: 12 })))));
    if (barre.champ.value !== criteres.recherche && document.activeElement !== barre.champ) barre.champ.value = criteres.recherche;
    if (!CRM.estPret() || !D.etat.pret) { remplir(compteur, ''); remplir(zone, chargement()); return; }
    const toutes = RL.construireRelations(CRM.etat.personnes, D.activitesDesRelations(), new Date());
    const gardees = RL.filtrerRelations(toutes, criteres, nomOrganisation);
    remplir(compteur, RL.texteCompteRelations(gardees.length), gardees.length !== toutes.length ? ` sur ${toutes.length}` : '');
    if (!toutes.length) {
      remplir(zone, etatVide('Aucune relation LinkedIn pour le moment. Importe ton archive LinkedIn ou ajoute une relation.', { action: h('a', { class: 'bouton bouton-secondaire', href: lien('reseauxsociaux/import'), dataset: { action: 'importer' } }, icone('upload', { taille: 16 }), 'Importer') }));
      return;
    }
    if (!gardees.length) { remplir(zone, etatVide('Aucune relation ne correspond à ces filtres.')); return; }
    if (vue === 'liste') { remplir(zone, h('div', { class: 'zone-tableau' }, tableauListe(gardees))); return; }
    const parColonne = RL.grouperParColonne(gardees);
    remplir(zone, h('div', { class: 'kanban kanban-relations' }, RL.COLONNES_RELATIONS.map((def) => colonne(def, parColonne[def.id]))));
  }

  conteneur.append(h('div', { class: 'page page-liste page-reseauxsociaux page-relations' },
    enteteListe({ titre: 'Relations', compteur, actions: [bouton] }), ongletsReseauxSociaux('reseauxsociaux/relations'), zoneBandeau, barre.element, zone));
  const arrets = [D.surChangement(rendre), CRM.surChangement(rendre)];
  rendre();
  D.chargerEtiquettes().catch((e) => console.warn(e)); // relit les étiquettes à l'ouverture : elles ont pu être créées depuis le démarrage (une lecture, puis l'écran se redessine)
  return function quitter() { arrets.forEach((f) => f()); };
}
