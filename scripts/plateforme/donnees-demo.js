// Outil « données de démonstration » : remplit un client de la plateforme (projet chevalier-ia-app, clients/<identifiant>/…) de données FICTIVES
// (organisations, personnes, affaires dans chaque étape, fiches, projets, devis dans chaque statut) et d'une copie du catalogue des devis.
// Lancé À LA MAIN par Jérôme (scripts/donnees-demo.js), avec ses identifiants gcloud. Voir docs/nouveau-client.md, « Remplir un client de démonstration ».
//
// Garde-fous : simulation par défaut (--ecrire pour écrire) ; projet cible = chevalier-ia-app seulement (ou l'émulateur de test), jamais chevalier-ia-os ;
// le client doit avoir sa fiche clients/<identifiant> ; refus si le client a déjà des données (sauf --completer) ; chaque document créé porte
// `donneesDemo: true`, et --retirer ne supprime QUE les documents qui portent ce marqueur.
// Le catalogue est LU (lecture seule, jamais écrit) dans un projet source (--catalogue-depuis chevalier-ia-os) : aucun article réel n'est dans le dépôt.
// --catalogue-exemple utilise un petit catalogue FICTIF intégré (celui des tests).
//
// Toutes les fiches sont construites avec les MÊMES règles que l'écran et le serveur (plans de js/modules/crm, projets, devis). Les devis finalisés,
// envoyés, signés et refusés sont écrits avec les champs que poseraient les fonctions du serveur (functions/src/coeur/devis.js) : numéro, compteur,
// prix et totaux figés (figerPourFinalisation), finaliseLe, envoyeLe, accepteLe / refuseLe.
//
// Décisions prises seul (26/10/2026) :
// - Les champs d'auteur des articles copiés (proprietaire, creePar, modifiePar) prennent l'auteur de la démo : l'adresse de Jérôme ne part pas chez le client.
// - --masquer-prix-achat : le prix d'achat de chaque article copié devient son prix de vente (calculé avec la marge du projet source) et la marge est retirée,
//   la marge des réglages de la démo est mise à 0 : les devis gardent les mêmes prix de vente, sans que le coût réel soit visible.
// - Le compteur des numéros (devis_compteurs/global) est avancé et n'est jamais retiré par --retirer (un numéro déjà vu ne doit pas revenir).
// - Le document des réglages des devis et celui des familles ne sont écrits que s'ils n'existent pas encore chez le client.
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ErreurOutil, exigerIdentifiant, verifierEmail, lireArguments, cible, ouvrir, traduireErreur, PROJET_PLATEFORME, PROJETS_INTERDITS, modulesActifsDe } from './commun.js';
import * as L from '../../js/modules/crm/logique.js';
import * as P from '../../js/modules/projets/logique.js';
import * as D from '../../js/modules/devis/logique.js';
import * as A from '../../js/modules/devis/articles.js';
import * as F from '../../js/modules/devis/familles.js';
import { ligneDepuisArticle } from '../../js/modules/devis/editeur-logique.js';
import { prixVenteArticle, MOTS_OUVRAGE, MOT_OUVRAGE_DEFAUT } from '../../js/modules/devis/ouvrages.js';
import { cleDeExpression, identifiantDeRegle } from '../../js/modules/devis/vocabulaire.js';
import { ajouterMois } from '../../js/modules/crm/logique.js';
import { JEUX, MARGE_JEUX, catalogueDuJeu } from './jeux-demo/index.js';
import { fabriquerPdf, exigerModuleDevis, fichiersPdfDemo } from './donnees-demo-pdf.js';

export const MARQUEUR = 'donneesDemo';
export const PROJET_CATALOGUE = 'chevalier-ia-os';
/** Collections qui reçoivent des données de démonstration (et que --retirer parcourt). */
export const COLLECTIONS_DEMO = Object.freeze([
  'crm_organisations', 'crm_personnes', 'crm_affaires', 'crm_activites', 'crm_notes', 'crm_evenements',
  'projets_projets', 'projets_taches', 'devis_articles', 'devis_parametres', 'devis_devis', 'devis_vocabulaire',
]);
/** Collections qui, si elles ont déjà des documents, font refuser l'écriture (sauf --completer). */
const COLLECTIONS_PLEINES = ['crm_organisations', 'crm_personnes', 'crm_affaires', 'projets_projets', 'devis_devis', 'devis_articles'];

export const AIDE = `Outil « données de démonstration » : simule par défaut ; ajouter --ecrire pour écrire vraiment.

Remplir un client de démonstration (catalogue copié depuis ton Chevalier IA OS, en lecture seule) :
  node scripts/donnees-demo.js <identifiant-client> --catalogue-depuis ${PROJET_CATALOGUE} [--masquer-prix-achat] [--ecrire]
Avec le jeu d'un métier (catalogue, mots appris, devis et affaires fictifs ; --metier seul affiche la liste) :
  node scripts/donnees-demo.js <identifiant-client> --metier <nom> [--ecrire]
Avec le petit catalogue fictif intégré à la place :
  node scripts/donnees-demo.js <identifiant-client> --catalogue-exemple [--ecrire]
Retirer les données de démonstration (seulement les documents marqués « ${MARQUEUR} ») :
  node scripts/donnees-demo.js <identifiant-client> --retirer [--ecrire]

Fabriquer les PDF des devis fictifs déjà présents (par le déclencheur du serveur ; --ecrire pour le faire vraiment) :
  node scripts/donnees-demo.js <identifiant-client> --pdf [--ecrire]
  (ou --pdf ajouté à une commande de remplissage : le PDF est fait juste après l'écriture)

Options :
  --ecrire               écrit vraiment (sans elle : simulation, rien n'est écrit)
  --catalogue-depuis P   lit le catalogue (articles + familles) dans le projet P, en lecture seule
  --catalogue-exemple    utilise le petit catalogue fictif intégré
  --metier nom           utilise le jeu de ce métier (--metier seul, ou --metiers : liste des métiers) ; ne se combine pas avec les deux options de catalogue
  --masquer-prix-achat   la copie du catalogue ne montre pas les prix d'achat ni les marges
  --completer            ajoute la démo même si le client a déjà des données
  --auteur adresse       auteur des fiches (par défaut : le premier éditeur du client)
  --pdf                  fabrique les PDF des devis de démonstration (jamais fait sans cette option)
  --retirer              supprime les documents de démonstration
  --aide                 cette aide`;

// ------------------------------------------------------------------------------------------------ catalogue fictif (tests et --catalogue-exemple)

const art = (id, libelle, unite, prixAchat, type, familleId, tauxTva = 20, plus = {}) => ({ id, code: id.replace('demo-', '').toUpperCase(), libelle, unite, prixAchat, tauxTva, type, familleId, actif: true, ...plus });
/** Petit catalogue FICTIF (prix inventés). Familles : celles de départ du module (familles.js). */
export const CATALOGUE_EXEMPLE = Object.freeze([
  art('demo-f01', 'Plaque de plâtre BA13', 'm²', 4.2, 'fourniture', 'famille-1-4'),
  art('demo-f02', 'Isolant laine minérale 100 mm', 'm²', 6.9, 'fourniture', 'famille-1-3'),
  art('demo-f03', 'Carrelage grès cérame 60 x 60', 'm²', 22.5, 'fourniture', 'famille-1-2'),
  art('demo-f04', 'Colle carrelage C2 (sac 25 kg)', 'u', 14.8, 'fourniture', 'famille-1-2'),
  art('demo-f05', 'Peinture acrylique mate (pot 10 L)', 'u', 38, 'fourniture', 'famille-1-5'),
  art('demo-f06', 'Câble électrique 3G2,5', 'ml', 1.35, 'fourniture', 'famille-1-8'),
  art('demo-f07', 'Tableau électrique 2 rangées', 'u', 145, 'fourniture', 'famille-1-8'),
  art('demo-f08', 'Mitigeur thermostatique de douche', 'u', 89, 'fourniture', 'famille-1-7'),
  art('demo-m01', 'Pose de cloisons et doublages', 'h', 32, 'main_oeuvre', 'famille-2-4'),
  art('demo-m02', 'Pose de carrelage', 'h', 34, 'main_oeuvre', 'famille-2-2'),
  art('demo-m03', 'Travaux de peinture', 'h', 30, 'main_oeuvre', 'famille-2-5'),
  art('demo-m04', 'Travaux d’électricité', 'h', 38, 'main_oeuvre', 'famille-2-8'),
  art('demo-m05', 'Travaux de plomberie', 'h', 40, 'main_oeuvre', 'famille-2-7'),
  art('demo-d01', 'Évacuation des gravats', 'forfait', 180, 'divers', 'famille-7-1'),
  art('demo-o01', 'Cloison BA13 isolée sur ossature', 'm²', 0, 'ouvrage', 'famille-3-2', 20, {
    composants: [{ articleId: 'demo-f01', quantite: 2 }, { articleId: 'demo-f02', quantite: 1 }, { articleId: 'demo-m01', quantite: 0.6 }],
  }),
]);

/**
 * Un « jeu » de démonstration : le mot du métier posé dans les réglages des devis (seulement si le client n'a pas de réglages) et les mots appris.
 * Aujourd'hui un seul jeu (plâtre, carrelage, peinture : le mot reste « ouvrage »). Un futur métier (agence : « prestation ») ajoute un jeu, sans toucher au reste.
 */
export const JEU_BATIMENT = Object.freeze({ motOuvrage: MOT_OUVRAGE_DEFAUT });

/**
 * Mots appris du catalogue FICTIF (identifiants `demo-…`). `cibles` : un seul article = `articleId` ; plusieurs = « au choix » (`cibles`, sans article), comme l'écran Vocabulaire.
 * `appris` : mot appris par le serveur (réponses de l'utilisateur) ; sinon ajouté à la main. `statut` : active, a_confirmer, desactivee. Aucune marque réelle.
 */
export const MOTS_EXEMPLE = Object.freeze([
  { expression: 'placo', articles: ['demo-f01'], statut: 'active', validation: 'humain' },
  { expression: 'cloison', articles: ['demo-o01'], statut: 'active', appris: 'apprise_question', validation: 'reponses', exemple: 'une cloison pour la chambre' },
  { expression: 'carrelage', articles: ['demo-f03', 'demo-m02'], statut: 'active', validation: 'humain' },
  { expression: 'electricite', articles: ['demo-m04', 'demo-f06', 'demo-f07'], statut: 'active', appris: 'apprise_correction', validation: 'reponses', exemple: 'refaire l’électricité' },
  { expression: 'gravats', articles: ['demo-d01'], statut: 'active', validation: 'humain' },
  { expression: 'peinture', articles: ['demo-f05'], statut: 'active', validation: 'humain' },
  { expression: 'douche', articles: ['demo-f08'], statut: 'a_confirmer', appris: 'apprise_question', exemple: 'une douche thermostatique' },
  { expression: 'colle', articles: ['demo-f04'], statut: 'desactivee', validation: 'humain' },
]);

/**
 * Les documents `devis_vocabulaire` du jeu, pour les articles copiés. Un mot dont un article visé n'est pas dans la copie est sauté (catalogue copié d'ailleurs : les identifiants ne correspondent pas) ;
 * un mot qui existe déjà chez le client (`existants`, identifiants) est sauté aussi : jamais d'écrasement. Retour : `{ documents: [{ id, donnees }], sautes: { catalogue, existant } }`.
 */
export function construireVocabulaire(articles, { auteur, maintenant, existants = new Set(), mots = MOTS_EXEMPLE }) {
  const parId = new Map(articles.map((a) => [a.id, a]));
  const jour = L.aujourdhuiParis(maintenant);
  const documents = [];
  const sautes = { catalogue: 0, existant: 0 };
  for (const m of mots) {
    const cibles = m.articles.map((id) => parId.get(id));
    if (cibles.some((a) => !a)) { sautes.catalogue += 1; continue; }
    const cle = cleDeExpression(m.expression);
    const id = identifiantDeRegle(cle);
    if (existants.has(id)) { sautes.existant += 1; continue; }
    const designe = cibles.length === 1
      ? { articleId: cibles[0].id, articleLibelle: cibles[0].libelle }
      : { articleId: '', articleLibelle: '', cibles: cibles.map((a) => ({ genre: 'article', id: a.id, libelle: a.libelle })) };
    const confirmations = m.statut === 'a_confirmer' ? 1 : (m.appris ? 2 : 0);
    const donnees = {
      cle, expression: m.expression, ...designe, statut: m.statut, origine: m.appris ?? 'manuelle', confirmations, contradictions: 0, conflit: false,
      exemples: m.exemple ? [m.exemple] : [], creeLe: maintenant, modifieLe: maintenant, creePar: auteur, modifiePar: auteur, [MARQUEUR]: true,
    };
    // Le mot à confirmer garde sa confirmation de la VEILLE : sinon « confirmation déjà comptée aujourd'hui » empêcherait de l'activer devant le prospect.
    if (m.appris) Object.assign(donnees, { derniereConfirmationLe: m.statut === 'a_confirmer' ? L.ajouterJours(jour, -1) : jour, derniereUtilisationLe: jour });
    if (m.validation) Object.assign(donnees, { valideLe: jour, validePar: m.validation, revoirLe: ajouterMois(jour, 6) });
    documents.push({ id, donnees });
  }
  return { documents, sautes };
}

// ------------------------------------------------------------------------------------------------ données fictives

const ORGANISATIONS = [
  ['SCI Les Tilleuls', 'Lyon', 'Services'], ['Boulangerie du Vieux Four', 'Villeurbanne', 'Commerce'], ['Cabinet médical des Lilas', 'Bron', 'Services'],
  ['Association sportive du Parc', 'Caluire-et-Cuire', 'Associatif'], ['Atelier mécanique Rhône-Sud', 'Vénissieux', 'Industrie'], ['Hôtel du Marché', 'Lyon', 'Commerce'],
  ['Crèche Les Petits Pas', 'Écully', 'Associatif'], ['Pharmacie de la Gare', 'Oullins', 'Commerce'], ['Résidence Les Érables (syndic)', 'Villeurbanne', 'Services'],
  ['Brasserie des Canuts', 'Lyon', 'Commerce'], ['Agence immobilière Horizon', 'Tassin-la-Demi-Lune', 'Services'], ['Menuiserie Bois & Fils', 'Décines', 'Industrie'],
  ['École de musique Allegro', 'Sainte-Foy-lès-Lyon', 'Associatif'], ['Garage Central', 'Saint-Priest', 'Commerce'], ['Cabinet comptable Équilibre', 'Lyon', 'Services'],
];
const PRENOMS = ['Claire', 'Hugo', 'Nadia', 'Paul', 'Sophie', 'Karim', 'Julie', 'Thomas', 'Léa', 'Antoine', 'Inès', 'Mathieu', 'Camille', 'Yann', 'Élodie', 'Marc', 'Anaïs', 'Bruno', 'Chloé', 'Romain'];
const NOMS = ['Dupontel', 'Lambert', 'Ferrand', 'Roche', 'Garnier', 'Benali', 'Morel', 'Girard', 'Fontaine', 'Perrin', 'Chevrier', 'Bonnet', 'Lemaire', 'Riviere', 'Charpin', 'Petitjean', 'Vasseur', 'Leclerc', 'Aubert', 'Marchand'];
const TRAVAUX = [
  'Rénovation salle de bain', 'Réfection cuisine', 'Mise aux normes électriques', 'Peinture des locaux', 'Isolation des combles', 'Carrelage du rez-de-chaussée',
  'Création de cloisons', 'Rénovation vestiaires', 'Remplacement sanitaires', 'Aménagement bureau', 'Réfection couloir et cage d’escalier', 'Rénovation appartement T3',
  'Réaménagement accueil', 'Rénovation sols', 'Remise en état après dégât des eaux', 'Rénovation chambre', 'Création salle d’eau', 'Rafraîchissement façade intérieure', 'Réfection plafonds',
];
const SOURCES = L.SOURCES_NEUTRES;

/** Petit tirage pseudo-aléatoire DÉTERMINISTE (mêmes données à chaque lancement pour un même catalogue). */
function tirage(graine) {
  let a = graine >>> 0;
  const suivant = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { nombre: suivant, entier: (min, max) => min + Math.floor(suivant() * (max - min + 1)), choix: (liste) => liste[Math.floor(suivant() * liste.length)] };
}
const jourAvant = (maintenant, jours, heure = 9) => { const d = new Date(maintenant.getTime() - jours * 86_400_000); d.setUTCHours(heure, 0, 0, 0); return d; };
const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

/** Quantité plausible selon l'unité, plafonnée pour qu'une ligne ne dépasse pas ~5 000 € HT. */
function quantitePour(article, prixVente, t) {
  const u = String(article.unite ?? '').toLowerCase();
  let q;
  if (['m²', 'm2', 'm3', 'm³'].includes(u)) q = t.entier(6, 45);
  else if (['m', 'ml'].includes(u)) q = t.entier(5, 40);
  else if (u === 'h') q = t.entier(4, 32);
  else if (['jour', 'j'].includes(u)) q = t.entier(1, 5);
  else if (['forfait', 'lot', 'ensemble'].includes(u)) q = 1;
  else q = t.entier(1, 6);
  if (prixVente > 0) q = Math.max(1, Math.min(q, Math.floor(5000 / prixVente)));
  return q;
}

/** « Mon entreprise » fictive du jeu (le nom, et pour un métier sans chantier le texte d'assurance), sinon celle du bâtiment. */
function emetteurDe(jeu) {
  return jeu?.entreprise ? Object.freeze({ ...ENTREPRISE_DEMO, ...jeu.entreprise }) : ENTREPRISE_DEMO;
}

/** Sections d'un devis « vedette » écrit à la main : `[{ titre, lignes: [[idArticle, quantité, taux de TVA facultatif]] }]`. Un article inconnu du catalogue est une erreur (le test de complétude la voit avant). */
function sectionsVedette(vedette, articles, brouillon, habitation) {
  const parId = new Map(articles.map((a) => [a.id, a]));
  return vedette.sections.map((sec, s) => ({
    id: `s${s + 1}`, titre: sec.titre,
    lignes: sec.lignes.map(([idArticle, quantite, taux], k) => {
      const article = parId.get(idArticle);
      if (!article) throw new Error(`Devis vedette « ${vedette.objet} » : article inconnu ${idArticle}`);
      const { genre: _g, ...ligne } = ligneDepuisArticle(article, { id: `l${s + 1}-${k + 1}`, articles, devis: brouillon });
      ligne.quantite = quantite;
      ligne.tauxTva = taux ?? (habitation ? 10 : 20);
      return ligne;
    }),
  }));
}

/**
 * Plan complet de la démonstration, SANS rien écrire : `{ documents: [{ collection, id, donnees }], compteur, resume }`.
 * entree : { config (construireConfig), articles (catalogue copié, avec id), familles (doc devis_parametres/familles ou null), reglages (réglages des devis),
 *            auteur, maintenant, nouvelId(collection), compteurDepart (valeur actuelle du compteur des numéros) }.
 */
export function construirePlan({ config, articles, familles = null, reglages, auteur, maintenant, nouvelId, compteurDepart = 0, jeu = null }) {
  const ORGS = jeu?.organisations ?? ORGANISATIONS;
  const LISTE_TRAVAUX = jeu?.travaux ?? TRAVAUX;
  const emetteur = emetteurDe(jeu);
  const vedettes = (jeu?.vedettes ?? []).map((v) => ({ ...v })); // devis écrits à la main : le premier devis tiré avec leur statut les remplace
  const t = tirage(articles.length * 7919 + 17);
  const docs = new Map(); // id -> { collection, id, donnees }
  const ctxA = (date) => ({ maintenant: date, auteur, proprietaire: auteur, config, nouvelId });
  const appliquer = (ecritures, ctx) => {
    for (const e of ecritures) {
      const marques = {};
      for (const c of e.horodater || []) marques[c] = ctx.maintenant;
      for (const c of e.signer || []) marques[c] = auteur;
      if (e.type === 'creer') docs.set(`${e.collection}/${e.id}`, { collection: e.collection, id: e.id, donnees: { ...e.donnees, ...marques, [MARQUEUR]: true } });
      else if (e.type === 'modifier') {
        const d = docs.get(`${e.collection}/${e.id}`);
        if (!d) throw new Error(`Écriture inattendue sur un document qui n'est pas de la démonstration : ${e.collection}/${e.id}`);
        Object.assign(d.donnees, e.patch, marques);
      } else throw new Error(`Écriture inattendue : ${e.type}`);
    }
  };
  const fiche = (collection, id) => ({ ...docs.get(`${collection}/${id}`).donnees, id });

  // ---- organisations et personnes
  const orgs = ORGS.map(([nom, ville, secteur], i) => {
    const ctx = ctxA(jourAvant(maintenant, 120 - i));
    const domaine = `${sansAccent(nom).split('.').slice(0, 2).join('-')}.exemple.test`;
    const p = L.planCreerOrganisation({ nom, ville, adresse: `${10 + i} rue de l’Exemple, ${ville}`, secteur, emails: [{ valeur: `contact@${domaine}`, type: 'travail' }], telephones: [{ valeur: `04 00 00 ${String(10 + i).padStart(2, '0')} 00`, type: 'travail' }] }, ctx);
    appliquer(p.ecritures, ctx);
    return { id: p.id, nom, ville, domaine };
  });
  const personnes = PRENOMS.map((prenom, i) => {
    const org = i < orgs.length ? orgs[i] : null; // les 5 dernières sont des particuliers
    const ctx = ctxA(jourAvant(maintenant, 110 - i));
    const nom = `${prenom} ${NOMS[i]}`;
    const email = org ? `${sansAccent(prenom)}.${sansAccent(NOMS[i])}@${org.domaine}` : `${sansAccent(prenom)}.${sansAccent(NOMS[i])}@exemple.test`;
    const p = L.planCreerPersonne({ nom, organisationId: org?.id ?? null, ville: org?.ville ?? 'Lyon', source: SOURCES[i % SOURCES.length], emails: [{ valeur: email, type: org ? 'travail' : 'perso' }], telephones: [{ valeur: `06 00 00 ${String(10 + i).padStart(2, '0')} ${String(i).padStart(2, '0')}`, type: org ? 'travail' : 'perso' }] }, ctx);
    appliquer(p.ecritures, ctx);
    return { id: p.id, nom, email, org, ville: org?.ville ?? 'Lyon' };
  });

  // ---- répartition des affaires sur les étapes : au moins 2 par étape ouverte, des gagnées, des perdues
  const etapes = L.etapesActives(config);
  const gagnee = L.etapeGagnee(config);
  const ouvertes = etapes.filter((e) => e.id !== gagnee);
  const nOuvertes = Math.max(12, ouvertes.length * 2);
  const affairesPrevues = [];
  for (let k = 0; k < nOuvertes; k += 1) affairesPrevues.push({ etape: ouvertes[Math.floor((k * ouvertes.length) / nOuvertes)].id, rang: k / nOuvertes, genre: 'ouverte' });
  for (let k = 0; k < 4; k += 1) affairesPrevues.push({ etape: gagnee, genre: 'gagnee' });
  for (let k = 0; k < 3; k += 1) affairesPrevues.push({ etape: ouvertes[Math.min(ouvertes.length - 1, Math.max(0, ouvertes.length - 2 + (k % 2)))].id, genre: 'perdue' });
  // Statut des devis : brouillon tôt dans le pipeline, finalisé puis envoyé plus loin ; signé sur les gagnées, refusé sur les perdues.
  const gagneesPrevues = affairesPrevues.filter((x) => x.genre === 'gagnee');
  const pourStatut = (a) => {
    if (a.genre === 'gagnee') return gagneesPrevues.indexOf(a) < 3 ? 'accepte' : null;
    if (a.genre === 'perdue') return 'refuse';
    if (a.rang < 0.25) return null;
    if (a.rang < 0.5) return 'brouillon';
    if (a.rang < 0.75) return 'en_attente_envoi';
    return 'envoye';
  };

  // ---- catalogue utilisable : regroupé par famille (nom de la famille = titre de section)
  const liste = F.famillesDe(familles ?? null);
  const nomsFamilles = new Map(liste.map((f) => [f.id, f.nom]));
  const utilisables = articles.filter((a) => a.actif !== false && a.type !== A.TYPE_TEXTE && (a.type === 'ouvrage' ? Array.isArray(a.composants) && a.composants.length : typeof a.prixAchat === 'number' && a.prixAchat > 0));
  const groupes = new Map();
  for (const a of utilisables) {
    const titre = nomsFamilles.get(a.familleId) || A.libelleType(a.type) || 'Travaux';
    if (!groupes.has(titre)) groupes.set(titre, []);
    groupes.get(titre).push(a);
  }
  const titresGroupes = [...groupes.keys()].sort((x, y) => x.localeCompare(y, 'fr'));
  if (!utilisables.length) throw new ErreurOutil('Le catalogue ne contient aucun article utilisable (actif, avec un prix) : impossible de construire des devis.');

  const affaires = [];
  const devisListe = [];
  let compteur = compteurDepart;
  let iDevis = 0;
  affairesPrevues.forEach((prevue, i) => {
    const statut = pourStatut(prevue);
    const vedette = statut ? vedettes.find((v) => v.statut === statut && !v.utilisee) : null;
    if (vedette) vedette.utilisee = true;
    // Un devis vedette peut demander un client « particulier » (TVA réduite possible) ou « entreprise » ; sinon le tirage habituel.
    const candidats = vedette?.client ? personnes.filter((x) => (vedette.client === 'particulier') === !x.org) : personnes;
    const personne = vedette?.client ? candidats[i % candidats.length] : personnes[(i * 7) % personnes.length];
    const travaux = vedette?.travaux ?? LISTE_TRAVAUX[i % LISTE_TRAVAUX.length];
    const titre = `${travaux} – ${personne.org ? personne.org.nom : personne.nom}`;
    const debut = 95 - i * 4; // jours avant aujourd'hui
    const ctx = ctxA(jourAvant(maintenant, debut));
    const p = L.planCreerAffaire({ titre, personneId: personne.id, organisationId: personne.org?.id ?? null, etape: prevue.etape, priorite: ['chaud', 'tiede', 'froid'][i % 3], source: SOURCES[i % SOURCES.length], besoin: `${travaux} (${personne.ville})` },
      { personnes: [], organisations: [] }, ctx);
    // planCreerAffaire écrit la note épinglée de départ : on lui donne un texte.
    appliquer(p.ecritures, ctx);
    const note = p.ecritures.find((e) => e.collection === 'crm_notes');
    docs.get(`crm_notes/${note.id}`).donnees.texte = `Visite faite sur place. Le client souhaite : ${travaux.toLowerCase()}. Budget évoqué lors du premier échange, à confirmer avec le devis.`;
    const affaire = { id: p.id, titre, personne, prevue, debut, travaux };
    affaires.push(affaire);
    const liens = { personneId: personne.id, organisationId: personne.org?.id ?? null, affaireId: p.id };
    // Fiches : un appel fait, une activité à venir (affaires ouvertes), parfois une note et des liens.
    const ctxAppel = ctxA(jourAvant(maintenant, debut - 1, 10));
    const appel = L.planCreerActivite({ type: 'appel', titre: 'Premier appel : comprendre le besoin', date: L.aujourdhuiParis(ctxAppel.maintenant), heure: '10:00', ...liens }, ctxAppel);
    appliquer(appel.ecritures, ctxAppel);
    appliquer(L.planActiviteFaite(fiche('crm_activites', appel.id), ctxAppel).ecritures, ctxAppel);
    if (prevue.genre === 'ouverte') {
      const ctxRdv = ctxA(jourAvant(maintenant, 1));
      const rdv = L.planCreerActivite({ type: i % 2 ? 'rendez_vous' : 'appel', titre: i % 2 ? 'Rendez-vous sur le chantier' : 'Relancer le client', date: L.ajouterJours(L.aujourdhuiParis(maintenant), 1 + (i % 6)), heure: '14:00', ...liens }, ctxRdv);
      appliquer(rdv.ecritures, ctxRdv);
    }
    if (i % 2 === 0) {
      const ctxN = ctxA(jourAvant(maintenant, Math.max(1, debut - 3)));
      appliquer(L.planCreerNote('Accès au chantier par la cour ; prévoir la protection des sols et l’évacuation des gravats.', liens, ctxN).ecritures, ctxN);
    }
    const nDocs = i % 3;
    if (nDocs) {
      const d = docs.get(`crm_affaires/${p.id}`).donnees;
      d.documents = [
        { libelle: 'Photos du chantier', url: `https://exemple.test/photos/chantier-${i + 1}`, ajouteLe: jourAvant(maintenant, debut - 1).toISOString() },
        { libelle: 'Plan du logement', url: `https://exemple.test/plans/plan-${i + 1}.pdf`, ajouteLe: jourAvant(maintenant, debut - 2).toISOString() },
      ].slice(0, nDocs);
    }
    if (prevue.genre === 'perdue') {
      const ctxP = ctxA(jourAvant(maintenant, Math.max(1, debut - 12)));
      appliquer(L.planMarquerPerdue(fiche('crm_affaires', p.id), { raison: ['Prix', 'Concurrent', 'Pas le moment'][i % 3], detail: 'Réponse reçue par téléphone.' }, ctxP).ecritures, ctxP);
    }

    // ---- devis de l'affaire
    if (!statut) return;
    const td = tirage(1000 + iDevis * 31 + articles.length);
    const habitation = (jeu?.tvaReduite ?? true) && (vedette?.client ? vedette.client === 'particulier' : (!personne.org || i % 4 === 0));
    const creeLe = jourAvant(maintenant, debut - 2, 9);
    const id = nouvelId('devis_devis');
    const brouillon = D.nouveauDevis({ affaireId: p.id, personneId: personne.id, organisationId: personne.org?.id ?? null, destinataires: [personne.email] },
      { id, maintenant: creeLe, auteur, proprietaire: auteur }, reglages);
    brouillon.objet = vedette?.objet ?? `${travaux} – ${personne.ville}`;
    brouillon.tauxTvaDefaut = habitation ? 10 : 20;
    // 2 à 4 sections (une par famille du catalogue), 4 à 12 lignes en tout : on prend les familles à la suite jusqu'à avoir assez de lignes.
    const voulues = Math.min(titresGroupes.length, td.entier(2, 4));
    const depart = td.entier(0, titresGroupes.length - 1);
    const sections = [];
    let nLignes = 0;
    for (let s = 0; s < titresGroupes.length && sections.length < 4 && nLignes < 12 && (sections.length < voulues || nLignes < 4); s += 1) {
      const titreS = titresGroupes[(depart + s) % titresGroupes.length];
      const candidats = groupes.get(titreS);
      const combien = Math.min(candidats.length, td.entier(2, 3), 12 - nLignes);
      const debutC = td.entier(0, candidats.length - 1);
      const lignes = [];
      for (let k = 0; k < combien; k += 1) {
        const article = candidats[(debutC + k) % candidats.length];
        const { genre: _g, ...ligne } = ligneDepuisArticle(article, { id: `l${s + 1}-${k + 1}`, articles, devis: brouillon });
        const pv = D.prixVenteDeLigne(brouillon, {}, ligne) ?? 0;
        ligne.quantite = quantitePour(article, pv, td);
        // Logement : TVA à 10 %, sauf la première ligne de la troisième section (20 %) ; locaux professionnels : 20 %.
        ligne.tauxTva = habitation ? (sections.length === 2 && k === 0 ? 20 : 10) : 20;
        lignes.push(ligne);
        nLignes += 1;
      }
      sections.push({ id: `s${s + 1}`, titre: titreS, lignes });
    }
    brouillon.sections = vedette ? sectionsVedette(vedette, articles, brouillon, habitation) : sections;
    if (iDevis % 3 === 0) brouillon.acompte = { type: 'pourcentage', valeur: 30, moment: 'signature' };
    else if (iDevis % 5 === 1) brouillon.acompte = { type: 'pourcentage', valeur: 40, moment: 'debut_travaux' };
    if (iDevis % 4 === 2) brouillon.ajustement = { coefficient: 0.97 };
    if (iDevis % 6 === 5) brouillon.remise = { type: 'pourcentage', valeur: 5 };
    if (vedette) { delete brouillon.ajustement; delete brouillon.remise; delete brouillon.acompte; if (vedette.acompte) brouillon.acompte = vedette.acompte; } // un devis vedette est écrit à la main : pas d'ajustement ni de remise du tirage
    const debutTravaux = L.ajouterJours(L.aujourdhuiParis(creeLe), 30);
    brouillon.chantier = { adresse: { ligne1: `${12 + i} ${jeu?.voie ?? 'avenue des Chantiers'}`, codePostal: '69000', ville: personne.ville }, debutTravaux, dureeEstimee: { valeur: td.entier(1, 4), unite: 'semaine' } };
    if (statut === 'brouillon') brouillon.expireLe = L.ajouterJours(L.aujourdhuiParis(maintenant), 30); // un brouillon de démonstration reste finalisable, quelle que soit la durée de validité réglée chez le client
    brouillon.texteLibre = vedette?.texteLibre ?? jeu?.texteLibre ?? 'Travaux réalisés dans les règles de l’art, selon les normes en vigueur. Protection des sols et nettoyage du chantier compris.';
    brouillon.notesBasDePage = `${jeu?.noteDevis ?? 'Devis établi après visite du chantier.'} Prix valables ${brouillon.dureeValiditeJours} jours. Toute modification fera l’objet d’un avenant.`;
    if (jeu?.dechets ?? true) brouillon.dechets = { types: ['inertes', 'non_dangereux'], pointCollecte: `Déchèterie professionnelle de ${personne.ville}`, volumeMin: 1, volumeMax: 3, unite: 'm3', coutTtcParM3: 45 };
    const { id: _id, ...base } = brouillon;
    let devis = { ...base, modifieLe: creeLe, modifiePar: auteur, [MARQUEUR]: true };
    if (statut !== 'brouillon') {
      const finaliseLe = jourAvant(maintenant, debut - 4, 11);
      compteur += 1;
      const numero = D.numeroDevis(L.aujourdhuiParis(finaliseLe), compteur);
      const fige = D.figerPourFinalisation({ ...devis, id }, { numero, finaliseLe, reglages, emetteur, clientNom: personne.org ? personne.org.nom : personne.nom }); // « Mon entreprise » de démonstration (valeurs fictives) passe les règles de finalisation
      if (fige.erreurs.length) throw new Error(`Devis de démonstration invalide (${brouillon.objet}) : ${fige.erreurs.join(' ')}`);
      const { id: _i, ...f } = fige.devis;
      devis = { ...f, finalisation: { n8n: 'en_attente' }, archive: false, archiveLe: null, envoyeLe: null, accepteLe: null, refuseLe: null, remplaceLe: null, pdf: null, envois: null, emailPrepare: null };
      if (statut !== 'en_attente_envoi') {
        devis.statut = 'envoye';
        devis.envoyeLe = jourAvant(maintenant, debut - 6, 15);
      }
      if (statut === 'accepte') { devis.statut = 'accepte'; devis.accepteLe = jourAvant(maintenant, debut - 10, 16); }
      if (statut === 'refuse') { devis.statut = 'refuse'; devis.refuseLe = jourAvant(maintenant, debut - 11, 16); }
    }
    docs.set(`devis_devis/${id}`, { collection: 'devis_devis', id, donnees: devis });
    devisListe.push({ id, affaireId: p.id });
    // Montant de l'affaire : le HT du devis comme montant estimé ; un devis finalisé, envoyé ou signé écrit en plus le montant calculé.
    const affaireDemo = docs.get(`crm_affaires/${p.id}`).donnees;
    const htDevis = (devis.totaux ?? D.totauxDevis(devis)).ht;
    affaireDemo.montant = htDevis;
    const calcule = D.montantDesDevis([{ ...devis, id }]); // ce que fait le serveur : devis proposé ou accepté (docs/montant-affaire.md)
    if (calcule) Object.assign(affaireDemo, { montantDevisHt: calcule.montant, montantDevisNature: calcule.nature, montantDevisDetail: calcule.detail });
    iDevis += 1;
  });

  // ---- projets : 2 par phase active (clôture comprise, projet resté actif), d'abord sur les affaires gagnées, puis des projets sans affaire
  const phases = config.phases.filter((ph) => ph.actif);
  const gagnees = affaires.filter((a) => a.prevue.genre === 'gagnee');
  const projets = [];
  const PROJETS_PAR_PHASE = 2;
  for (let k = 0; k < phases.length * PROJETS_PAR_PHASE; k += 1) {
    const phase = phases[k % phases.length].id;
    const a = gagnees[k];
    const ctx = ctxA(jourAvant(maintenant, a ? Math.max(1, a.debut - 12) : 40 - k));
    let p;
    if (a) {
      p = P.planCreerProjetDepuisAffaire({ affaire: fiche('crm_affaires', a.id), projets: [], valeurs: { phase }, notesAffaire: [], texteNote: `Chantier : ${a.travaux.toLowerCase()}. Démarrage prévu selon le planning validé avec le client.` }, ctx);
      if (Object.keys(p.erreurs).length) throw new Error(`Projet de démonstration refusé : ${Object.values(p.erreurs).join(' ')}`);
    } else {
      const personne = personnes[(k * 3 + 1) % personnes.length];
      const travaux = LISTE_TRAVAUX[(k * 5 + 2) % LISTE_TRAVAUX.length];
      p = P.planCreerProjet({ titre: `${travaux} – ${personne.org ? personne.org.nom : personne.nom}`, personneId: personne.id, organisationId: personne.org?.id ?? null, phase, dateDebut: L.aujourdhuiParis(ctx.maintenant) }, ctx,
        { texteNote: `Chantier : ${travaux.toLowerCase()} (${personne.ville}).` });
    }
    appliquer(p.ecritures, ctx);
    projets.push({ id: p.id, titre: p.titre, phase });
  }

  return {
    documents: [...docs.values()],
    compteur: compteur > compteurDepart ? compteur : null,
    resume: { organisations: orgs.length, personnes: personnes.length, affaires, devis: devisListe, projets },
  };
}

// ------------------------------------------------------------------------------------------------ catalogue

/** Prépare la copie d'un catalogue lu : mêmes identifiants (les ouvrages pointent vers leurs composants), auteur remplacé, prix d'achat masqués si demandé. */
export function copierCatalogue(articles, { auteur, masquer = false, reglagesSource = {} }) {
  return articles.map((a) => {
    const copie = { ...a, proprietaire: auteur };
    if ('creePar' in a) copie.creePar = auteur;
    if ('modifiePar' in a) copie.modifiePar = auteur;
    if (masquer && a.type !== 'ouvrage' && typeof a.prixAchat === 'number') {
      const pv = typeof a.prixVenteForce === 'number' ? a.prixVenteForce : prixVenteArticle(a, reglagesSource);
      copie.prixAchat = typeof pv === 'number' ? pv : a.prixAchat;
      delete copie.marge;
    } else if (masquer) delete copie.marge;
    return copie;
  });
}

function ouvrirSource(projet) {
  const nom = `source-catalogue-${projet}`;
  const app = getApps().find((a) => a.name === nom) || initializeApp({ projectId: projet }, nom);
  return getFirestore(app);
}

/** Lecture SEULE du catalogue d'un projet source (racine : devis_articles, devis_parametres/familles et /reglages). Aucune écriture ici. */
export async function lireCatalogueSource(projet) {
  const db = ouvrirSource(projet);
  const [snap, familles, reglages] = await Promise.all([
    db.collection(A.COLLECTION_ARTICLES).get(),
    db.collection(A.COLLECTION_PARAMETRES).doc(F.ID_DOCUMENT_FAMILLES).get(),
    db.collection(A.COLLECTION_PARAMETRES).doc(A.ID_REGLAGES).get(),
  ]);
  return {
    articles: snap.docs.map((d) => ({ ...d.data(), id: d.id })),
    familles: familles.exists ? familles.data() : null,
    reglages: reglages.exists ? reglages.data() : null,
  };
}

// ------------------------------------------------------------------------------------------------ jeux par métier

/**
 * Contrôle de complétude d'un jeu : liste des problèmes (vide = le jeu est complet et prêt). Un jeu qui échoue n'apparaît pas dans la liste des métiers.
 * Vérifie les données (catalogue, ensembles, mots appris, vedettes) puis fabrique un plan complet pour compter les devis par statut et les affaires par étape.
 */
export function problemesDuJeu(jeu) {
  const p = [];
  try {
    if (!jeu?.id || !jeu?.nom) p.push('identifiant ou nom manquant');
    if (!MOTS_OUVRAGE.some((m) => m.id === jeu?.motOuvrage)) p.push('mot du métier inconnu');
    const cat = catalogueDuJeu(jeu);
    if (cat.articles.length < 20) p.push(`catalogue trop court (${cat.articles.length} articles, 20 au moins)`);
    if (cat.articles.filter((a) => a.type === 'ouvrage').length < 3) p.push('moins de 3 ensembles');
    if (new Set(cat.articles.map((a) => a.id)).size !== cat.articles.length) p.push('identifiants d\'article en double');
    if ((jeu.mots ?? []).length < 6) p.push('moins de 6 mots appris');
    const vocab = construireVocabulaire(cat.articles, { auteur: 'demo@exemple.test', maintenant: new Date('2026-01-15T10:00:00Z'), mots: jeu.mots ?? [] });
    if (vocab.sautes.catalogue) p.push('un mot appris vise un article absent du catalogue');
    if ((jeu.organisations ?? []).length < 12) p.push('moins de 12 organisations');
    if ((jeu.travaux ?? []).length < 8) p.push('moins de 8 intitulés de travaux');
    for (const statut of ['brouillon', 'envoye', 'accepte']) if (!(jeu.vedettes ?? []).some((v) => v.statut === statut)) p.push(`pas de devis vedette « ${statut} »`);
    if (!p.length) {
      const config = L.construireConfig({ etapes: null, phases: null, reglages: null }, { racine: false, membres: [] });
      let n = 0;
      const plan = construirePlan({ config, articles: cat.articles, familles: cat.familles, reglages: A.reglagesDevis({ ...A.REGLAGES_DEVIS_DEFAUT, motOuvrage: jeu.motOuvrage, entreprise: emetteurDe(jeu) }), auteur: 'demo@exemple.test', maintenant: new Date('2026-01-15T10:00:00Z'), nouvelId: (c) => `${c}-${(n += 1)}`, jeu });
      const statuts = new Map();
      for (const { id } of plan.resume.devis) { const d = plan.documents.find((x) => x.id === id).donnees; statuts.set(d.statut, (statuts.get(d.statut) ?? 0) + 1); }
      for (const s of ['brouillon', 'en_attente_envoi', 'envoye', 'accepte', 'refuse']) if ((statuts.get(s) ?? 0) < 2) p.push(`moins de 2 devis « ${s} »`);
      for (const e of L.etapesActives(config)) if (plan.resume.affaires.filter((a) => a.prevue.etape === e.id).length < 2) p.push(`moins de 2 affaires dans l'étape « ${e.libelle ?? e.id} »`);
    }
  } catch (e) {
    p.push(`erreur à la fabrication : ${e.message}`);
  }
  return p;
}

/** Les jeux complets et prêts, par ordre de définition. */
export const metiersDisponibles = () => Object.values(JEUX).filter((j) => problemesDuJeu(j).length === 0);

/** Texte de la liste des métiers (affichée par --metier seul). */
export function listeMetiers() {
  const jeux = metiersDisponibles();
  return ['Métiers disponibles pour --metier :', ...jeux.map((j) => `  ${j.id.padEnd(12)} ${j.nom} (mot du métier : « ${j.motOuvrage} »)`),
    'Exemple : node scripts/donnees-demo.js <identifiant-client> --metier ' + (jeux[0]?.id ?? '<nom>')];
}

/** Le jeu demandé, ou une erreur claire qui rappelle la liste. */
export function exigerJeu(nom) {
  const jeux = metiersDisponibles();
  const jeu = jeux.find((j) => j.id === String(nom).trim().toLowerCase());
  if (!jeu) throw new ErreurOutil([`Métier inconnu : « ${nom} ».`, ...listeMetiers()]);
  return jeu;
}

// ------------------------------------------------------------------------------------------------ commande

const nettoyer = (v) => {
  if (v === undefined) return undefined;
  if (v === null || typeof v !== 'object' || v instanceof Date || typeof v.toDate === 'function') return v;
  if (Array.isArray(v)) return v.map(nettoyer).filter((x) => x !== undefined);
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, nettoyer(x)]));
};

const ENTREPRISE_DEMO = Object.freeze({
  nom: 'Rénovation Démo', forme: 'SARL', siret: '000 000 000 00000', tva: 'FR00000000000',
  adresse: { ligne1: '1 rue de l’Exemple', codePostal: '69000', ville: 'Lyon' }, email: 'contact@exemple.test', telephone: '04 00 00 00 00',
  assuranceTexte: 'Assurance décennale : Assurances Fictives (exemple), contrat numéro : 000000, territorialité : France métropolitaine.',
  mediateur: { nom: 'Médiateur de la consommation (exemple)', site: 'https://mediateur.exemple.test' },
});

/**
 * Garde-fou « client de démonstration » : l'outil n'écrit (ni ne retire, ni ne fabrique de PDF) que chez un client dont la fiche clients/<id> porte `demo: true`.
 * Aucune option ne contourne ce refus (même pas --completer). La marque se pose avec `nouveau-client.js --demo` (création) ou `marquer-demo.js` (client existant).
 */
export function exigerClientDemo(id, fiche) {
  if (fiche?.demo !== true) {
    throw new ErreurOutil([
      `Ce client n'est pas marqué comme client de démonstration : l'outil refuse d'écrire. Rien n'a été modifié.`,
      `Pour marquer un client de démonstration existant : node scripts/marquer-demo.js --client ${id} (simulation), puis node scripts/marquer-demo.js --client ${id} --ecrire.`,
      'On ne transforme jamais un vrai client en client de démonstration : on crée un nouveau client avec --demo.',
    ]);
  }
}

/** Relit la fiche juste avant la première écriture : la marque a pu être retirée entre la lecture du début et maintenant. */
async function relireMarque(db, id) {
  exigerClientDemo(id, (await db.doc(`clients/${id}`).get()).data());
}

function cheminsClient(db, id) {
  return (c) => db.collection(`clients/${id}/${c}`);
}

async function retirer(id, ctx) {
  const db = ctx.base.db;
  const col = cheminsClient(db, id);
  let total = 0;
  const refs = [];
  let affairesDemo = [];
  for (const c of COLLECTIONS_DEMO) {
    const snap = await col(c).where(MARQUEUR, '==', true).get();
    if (c === 'crm_affaires') affairesDemo = snap.docs.map((d) => d.id);
    if (snap.size) ctx.out(`  ${c} : ${snap.size} document(s) de démonstration`);
    total += snap.size;
    refs.push(...snap.docs.map((d) => d.ref));
  }
  if (!total) { ctx.out('Aucune donnée de démonstration chez ce client : rien à retirer.'); return 0; }
  // Fichiers des PDF : seulement sous clients/<id>/devis/<affaireId>/ des affaires de démonstration. Lus AVANT la suppression des documents (qui portent les ids).
  let fichiers;
  try {
    fichiers = await fichiersPdfDemo(ctx.base.bucket, id, affairesDemo);
  } catch (e) {
    throw new ErreurOutil(["Impossible de lire les fichiers PDF du client dans Storage (rien n'a été supprimé).", ...traduireErreur(e)]);
  }
  if (fichiers.length) ctx.out(`  Storage : ${fichiers.length} fichier(s) PDF des devis de démonstration`);
  if (!ctx.ecrire) { ctx.out(`SIMULATION : ${total} document(s)${fichiers.length ? ` et ${fichiers.length} fichier(s) PDF` : ''} seraient supprimés (seulement ceux marqués « ${MARQUEUR} »). Rien n'a été supprimé. Relancez avec --ecrire.`); return 0; }
  await relireMarque(db, id);
  for (const f of fichiers) {
    if (!f.name.startsWith(`clients/${id}/devis/`)) throw new Error(`Chemin refusé : ${f.name}`);
    await f.delete({ ignoreNotFound: true });
    ctx.ecrits = true;
  }
  for (let i = 0; i < refs.length; i += 400) {
    const lot = db.batch();
    for (const r of refs.slice(i, i + 400)) {
      if (!r.path.startsWith(`clients/${id}/`)) throw new Error(`Chemin refusé : ${r.path}`);
      lot.delete(r);
    }
    await lot.commit();
    ctx.ecrits = true;
  }
  ctx.out(`✔ ${total} document(s) de démonstration${fichiers.length ? ` et ${fichiers.length} fichier(s) PDF` : ''} supprimés. Les autres données du client n'ont pas été touchées.`);
  return 0;
}

async function remplir(id, options, ctx, fiche) {
  const db = ctx.base.db;
  const col = cheminsClient(db, id);
  // Données déjà là ?
  const demoDeja = await col('crm_affaires').where(MARQUEUR, '==', true).limit(1).get();
  if (!demoDeja.empty) throw new ErreurOutil('Ce client a déjà des données de démonstration. Retirez-les d\'abord : node scripts/donnees-demo.js ' + id + ' --retirer --ecrire');
  const pleines = [];
  for (const c of COLLECTIONS_PLEINES) if (!(await col(c).limit(1).get()).empty) pleines.push(c);
  if (pleines.length && !options.completer) {
    throw new ErreurOutil([`Ce client a déjà des données (${pleines.join(', ')}) : l'outil refuse de les mélanger avec la démonstration.`, 'Pour ajouter quand même la démonstration à côté, ajoutez --completer.']);
  }

  // Catalogue
  const jeuMetier = ctx.jeuMetier ?? null;
  let catalogue;
  if (jeuMetier) {
    const cat = catalogueDuJeu(jeuMetier);
    catalogue = { articles: cat.articles, familles: cat.familles, reglages: { modeMarge: 'majoration', marge: MARGE_JEUX } };
    ctx.out(`Jeu « ${jeuMetier.nom} » : ${cat.articles.length} articles (dont ${cat.articles.filter((a) => a.type === 'ouvrage').length} ensembles), prix inventés.`);
  } else if (options['catalogue-exemple']) {
    catalogue = { articles: CATALOGUE_EXEMPLE.map((a) => ({ ...a })), familles: null, reglages: { modeMarge: 'majoration', marge: 25 } };
    ctx.out('Catalogue : le petit catalogue FICTIF intégré (15 articles).');
  } else {
    const source = options['catalogue-depuis'];
    if (source === ctx.cible.projet) throw new ErreurOutil('Le projet source du catalogue ne peut pas être le projet du client.');
    if (!ctx.cible.emulateur && source !== PROJET_CATALOGUE) throw new ErreurOutil(`Le catalogue ne se copie que depuis « ${PROJET_CATALOGUE} ».`);
    try {
      catalogue = await (ctx.lireCatalogue ?? lireCatalogueSource)(source);
    } catch (e) {
      throw new ErreurOutil([`Impossible de lire le catalogue dans le projet « ${source} » (lecture seule).`, ...traduireErreur(e), 'Pour une démonstration sans votre catalogue, relancez avec --catalogue-exemple à la place.']);
    }
    if (!catalogue.articles.length) throw new ErreurOutil([`Le catalogue du projet « ${source} » est vide.`, 'Relancez avec --catalogue-exemple pour utiliser le catalogue fictif.']);
    ctx.out(`Catalogue lu dans « ${source} » (lecture seule, rien n'y est écrit) : ${catalogue.articles.length} article(s)${catalogue.familles ? ', familles comprises' : ''}.`);
  }
  const masquer = Boolean(options['masquer-prix-achat']);
  const reglagesSource = A.reglagesDevis(catalogue.reglages);
  const articles = copierCatalogue(catalogue.articles, { auteur: ctx.auteur, masquer, reglagesSource });
  if (masquer) ctx.out('Prix d\'achat masqués : chaque article copié prend son prix de vente comme prix d\'achat, sans marge.');
  else ctx.out('Catalogue copié tel quel (documents entiers : prix, compositions des ouvrages, familles).');

  // Réglages et configuration du client
  const [reglagesDoc, famillesDoc, compteurDoc, etapesDoc, phasesDoc, reglagesCrm] = await Promise.all([
    col(A.COLLECTION_PARAMETRES).doc(A.ID_REGLAGES).get(), col(A.COLLECTION_PARAMETRES).doc(F.ID_DOCUMENT_FAMILLES).get(),
    col('devis_compteurs').doc('global').get(), col('crm_parametres').doc('etapes').get(), col('crm_parametres').doc('phases').get(), col('crm_parametres').doc('reglages').get(),
  ]);
  const config = L.construireConfig({ etapes: etapesDoc.exists ? etapesDoc.data() : null, phases: phasesDoc.exists ? phasesDoc.data() : null, reglages: reglagesCrm.exists ? reglagesCrm.data() : null }, { racine: false, membres: [] });
  const jeu = ctx.jeu ?? (jeuMetier ? { motOuvrage: jeuMetier.motOuvrage } : JEU_BATIMENT);
  if (!MOTS_OUVRAGE.some((m) => m.id === jeu.motOuvrage)) throw new ErreurOutil(`Le mot du métier du jeu (« ${jeu.motOuvrage} ») n'est pas dans la liste du logiciel.`);
  const reglagesDemo = A.reglagesDevis({ ...A.REGLAGES_DEVIS_DEFAUT, motOuvrage: jeu.motOuvrage, modeMarge: reglagesSource.modeMarge, marge: masquer ? 0 : reglagesSource.marge, margeDevis: masquer ? 0 : reglagesSource.margeDevis, entreprise: emetteurDe(jeuMetier) });
  const reglages = reglagesDoc.exists ? A.reglagesDevis(reglagesDoc.data()) : reglagesDemo;
  const compteurDepart = Number.isInteger(compteurDoc.data()?.valeur) ? compteurDoc.data().valeur : 0;

  const plan = construirePlan({ config, articles, familles: famillesDoc.exists ? famillesDoc.data() : catalogue.familles, reglages, auteur: ctx.auteur, maintenant: ctx.maintenant ?? new Date(), nouvelId: (c) => col(c).doc().id, compteurDepart, jeu: jeuMetier });

  // Liste complète des documents à écrire
  const ecritures = [];
  const existants = options.completer ? new Set((await col(A.COLLECTION_ARTICLES).get()).docs.map((d) => d.id)) : new Set();
  let articlesIgnores = 0;
  for (const a of articles) {
    if (existants.has(a.id)) { articlesIgnores += 1; continue; }
    const { id: aid, ...donnees } = a;
    ecritures.push({ chemin: `${A.COLLECTION_ARTICLES}/${aid}`, donnees: { ...donnees, [MARQUEUR]: true } });
  }
  if (!reglagesDoc.exists) ecritures.push({ chemin: `${A.COLLECTION_PARAMETRES}/${A.ID_REGLAGES}`, donnees: { ...reglagesDemo, [MARQUEUR]: true } });
  else ctx.out('Réglages des devis : ceux du client sont gardés tels quels (« Mon entreprise » et le mot du métier ne sont pas remplacés).');
  if (catalogue.familles && !famillesDoc.exists) ecritures.push({ chemin: `${A.COLLECTION_PARAMETRES}/${F.ID_DOCUMENT_FAMILLES}`, donnees: { ...catalogue.familles, [MARQUEUR]: true } });
  for (const d of plan.documents) ecritures.push({ chemin: `${d.collection}/${d.id}`, donnees: d.donnees });
  // Mots appris : seulement ceux dont les articles sont dans la copie, jamais par-dessus un mot que le client a déjà.
  const motsExistants = new Set((await col('devis_vocabulaire').get()).docs.map((d) => d.id));
  const vocab = construireVocabulaire(articles, { auteur: ctx.auteur, maintenant: ctx.maintenant ?? new Date(), existants: motsExistants, mots: jeuMetier?.mots ?? MOTS_EXEMPLE });
  for (const d of vocab.documents) ecritures.push({ chemin: `devis_vocabulaire/${d.id}`, donnees: d.donnees, creerSeulement: true });
  ctx.out(vocab.documents.length ? `Mots appris : ${vocab.documents.length} (vocabulaire d'exemple)${vocab.sautes.existant ? `, ${vocab.sautes.existant} déjà présent(s) chez le client, gardé(s) tel(s) quel(s)` : ''}.`
    : `Mots appris : aucun (${vocab.sautes.catalogue ? 'ce catalogue n\'est pas celui d\'exemple' : 'tous existent déjà chez le client'}).`);

  // Résumé lisible
  const nomEtape = (e) => L.libelleEtape(e, config);
  ctx.out('');
  ctx.out(`Client : ${id}${fiche.nom ? ` (${fiche.nom})` : ''} ; auteur des fiches : ${ctx.auteur}`);
  const actifs = modulesActifsDe(fiche.modules);
  const manquants = ['affaires', 'projets', 'devis'].filter((m) => !actifs.includes(m));
  if (manquants.length) ctx.out(`⚠ Modules pas encore activés chez ce client : ${manquants.join(', ')} (node scripts/nouveau-client.js activer-module ${id} <module> --ecrire).`);
  ctx.out(`Organisations : ${plan.resume.organisations} ; personnes : ${plan.resume.personnes} ; articles du catalogue : ${articles.length - articlesIgnores}${articlesIgnores ? ` (${articlesIgnores} déjà présents, gardés)` : ''}`);
  ctx.out(`Affaires : ${plan.resume.affaires.length}`);
  for (const e of L.etapesActives(config)) {
    const n = plan.resume.affaires.filter((a) => a.prevue.etape === e.id);
    ctx.out(`  - ${nomEtape(e.id)} : ${n.length} (dont ${n.filter((a) => a.prevue.genre === 'perdue').length} perdue(s))`);
  }
  ctx.out(`Devis : ${plan.resume.devis.length}`);
  for (const { id: did } of plan.resume.devis) {
    const d = plan.documents.find((x) => x.id === did).donnees;
    const ttc = (d.totaux ?? D.totauxDevis(d)).ttc;
    ctx.out(`  - ${(D.STATUTS_DEVIS.find((s) => s.id === d.statut)?.libelle ?? d.statut).padEnd(9)} ${(d.numero ?? '(sans numéro)').padEnd(18)}  ${d.objet}  ${D.montantFr(ttc)} TTC`);
  }
  ctx.out(`Projets : ${plan.resume.projets.length} (${config.phases.filter((ph) => ph.actif).map((ph) => `${ph.libelle} ${plan.resume.projets.filter((p) => p.phase === ph.id).length}`).join(', ')})`);
  const parCollection = {};
  for (const e of ecritures) { const c = e.chemin.split('/')[0]; parCollection[c] = (parCollection[c] ?? 0) + 1; }
  ctx.out(`Documents à créer sous clients/${id}/ : ${ecritures.length} (${Object.entries(parCollection).map(([c, n]) => `${c} ${n}`).join(', ')})`);
  if (plan.compteur) ctx.out(`Compteur des numéros de devis : ${compteurDepart} -> ${plan.compteur}`);

  if (options.pdf) ctx.out(`Avec --pdf : après l'écriture, le serveur fabriquerait le PDF des ${plan.resume.devis.filter(({ id: did }) => plan.documents.find((x) => x.id === did).donnees.statut !== 'brouillon').length} devis qui ne sont plus des brouillons.`);
  if (!ctx.ecrire) { ctx.out(''); ctx.out('SIMULATION : rien n\'a été écrit. Relisez, puis relancez la même commande avec --ecrire.'); return 0; }
  await relireMarque(db, id);
  const simples = ecritures.filter((e) => !e.creerSeulement);
  for (let i = 0; i < simples.length; i += 400) {
    const lot = db.batch();
    for (const e of simples.slice(i, i + 400)) lot.set(db.doc(`clients/${id}/${e.chemin}`), nettoyer(e.donnees));
    await lot.commit();
    ctx.ecrits = true;
  }
  // Les mots appris sont écrits avec `create` : un mot réel apparu entre la lecture et l'écriture n'est jamais écrasé (l'écriture échoue proprement).
  const motsACreer = ecritures.filter((e) => e.creerSeulement);
  if (motsACreer.length) {
    const lot = db.batch();
    for (const e of motsACreer) lot.create(db.doc(`clients/${id}/${e.chemin}`), nettoyer(e.donnees));
    try {
      await lot.commit();
    } catch (e) {
      if (e?.code === 6 || /already exists|ALREADY_EXISTS/i.test(String(e?.message))) throw new ErreurOutil(['Un mot appris est apparu chez le client pendant le chargement : aucun mot n\'a été écrit et aucun mot du client n\'a été touché.', 'Le reste de la démonstration est écrit : relancez --retirer --ecrire, puis le chargement.']);
      throw e;
    }
    ctx.ecrits = true;
  }
  if (plan.compteur) await col('devis_compteurs').doc('global').set({ valeur: plan.compteur, modifieLe: ctx.maintenant ?? new Date() }, { merge: true });
  ctx.out(`✔ ${ecritures.length} document(s) écrits. Pour tout retirer plus tard : node scripts/donnees-demo.js ${id} --retirer --ecrire`);
  if (options.pdf) return await fabriquerPdf(id, ctx, fiche);
  return 0;
}

export async function executerDonneesDemo(argv, ctx) {
  try {
    // `--metier` sans nom (ou `--metiers`) : affiche la liste des métiers disponibles et s'arrête, sans base.
    const iMetier = argv.findIndex((a) => a === '--metier' || a === '--metier=');
    if (argv.includes('--metiers') || (iMetier >= 0 && (iMetier === argv.length - 1 || String(argv[iMetier + 1]).startsWith('--')))) {
      for (const l of listeMetiers()) ctx.out(l);
      return 0;
    }
    const { positionnels, options } = lireArguments(argv, {
      valeurs: ['catalogue-depuis', 'auteur', 'metier'],
      drapeaux: ['ecrire', 'pdf', 'retirer', 'completer', 'catalogue-exemple', 'masquer-prix-achat', 'aide', 'metiers'],
    });
    if (options.aide || !positionnels.length) { ctx.out(AIDE); return options.aide ? 0 : 1; }
    if (positionnels.length > 1) throw new ErreurOutil(`Argument en trop : « ${positionnels.slice(1).join(' ')} ». Un seul client à la fois ; les options commencent par --.`);
    const id = exigerIdentifiant(positionnels[0]);
    const pdfSeul = options.pdf && !options['catalogue-depuis'] && !options['catalogue-exemple'] && !options.metier;
    if (options.pdf && options.retirer) throw new ErreurOutil('--pdf et --retirer ne se combinent pas.');
    if (pdfSeul && (options.completer || options['masquer-prix-achat'])) throw new ErreurOutil("--pdf seul ne se combine qu'avec --ecrire (les autres options servent au remplissage).");
    if (options.metier && (options['catalogue-depuis'] || options['catalogue-exemple'])) throw new ErreurOutil('--metier ne se combine pas avec --catalogue-depuis ni --catalogue-exemple : le jeu du métier apporte son propre catalogue.');
    if (options.metier && !options.retirer) ctx.jeuMetier = exigerJeu(options.metier);
    if (!options.retirer && !pdfSeul && !options['catalogue-depuis'] && !options['catalogue-exemple'] && !options.metier) {
      throw new ErreurOutil(['Indiquez d\'où vient le catalogue des devis :', `  --catalogue-depuis ${PROJET_CATALOGUE}   (copie de votre catalogue, lu en lecture seule)`, '  --catalogue-exemple              (petit catalogue fictif intégré)', '  --metier <nom>                   (jeu complet d\'un métier ; node scripts/donnees-demo.js --metier affiche la liste)']);
    }
    if (options['catalogue-depuis'] && options['catalogue-exemple']) throw new ErreurOutil('Choisissez --catalogue-depuis OU --catalogue-exemple, pas les deux.');
    if (options.retirer && (options['catalogue-depuis'] || options['catalogue-exemple'] || options.metier || options.completer || options['masquer-prix-achat'])) throw new ErreurOutil('--retirer ne se combine qu\'avec --ecrire.');

    const env = ctx.env || process.env;
    ctx.cible = cible({}, env);
    // Garde-fou : jamais le CRM de Jérôme (déjà refusé par cible), et en vrai seulement le projet des clients.
    if (PROJETS_INTERDITS.includes(ctx.cible.projet) || (!ctx.cible.emulateur && ctx.cible.projet !== PROJET_PLATEFORME)) {
      throw new ErreurOutil(`Projet « ${ctx.cible.projet} » refusé : cet outil n'écrit que dans le projet des clients « ${PROJET_PLATEFORME} ».`);
    }
    ctx.ecrire = Boolean(options.ecrire);
    ctx.out(`Base visée : ${ctx.cible.projet} ${ctx.cible.emulateur ? '(ÉMULATEUR de test)' : '(VRAIE base)'}${ctx.ecrire ? '' : ' ; SIMULATION'}`);
    ctx.base = ctx.base ?? ouvrir(ctx.cible);

    const ficheSnap = await ctx.base.db.doc(`clients/${id}`).get();
    if (!ficheSnap.exists) throw new ErreurOutil(`Le client « ${id} » n'existe pas (pas de fiche clients/${id}). Créez-le d'abord avec scripts/nouveau-client.js.`);
    exigerClientDemo(id, ficheSnap.data());
    if (options.retirer) return await retirer(id, ctx);
    if (options.pdf) exigerModuleDevis(ficheSnap.data());
    if (pdfSeul) return await fabriquerPdf(id, ctx, ficheSnap.data() ?? {});

    if (options.auteur) ctx.auteur = verifierEmail(options.auteur);
    else {
      const membres = await ctx.base.db.collection(`clients/${id}/membres`).get();
      ctx.auteur = membres.docs.filter((d) => d.data().role === 'editeur').map((d) => d.id).sort()[0] ?? 'demo@exemple.test';
    }
    return await remplir(id, options, ctx, ficheSnap.data() ?? {});
  } catch (e) {
    const lignes = e instanceof ErreurOutil ? e.messages : traduireErreur(e);
    for (const l of lignes) ctx.out(`✖ ${l}`);
    if (ctx.phasePdf) ctx.out(ctx.ecrits ? 'Des devis ont été touchés par --pdf. Relancez --pdf --ecrire (seul, sans les options de remplissage) : la reprise remet d\'abord les statuts d\'origine.' : "Rien n'a été écrit.");
    else ctx.out(ctx.ecrits ? 'Attention : une partie a déjà été écrite. Pour repartir de zéro : --retirer --ecrire, puis relancez.' : "Rien n'a été écrit.");
    return 1;
  }
}
