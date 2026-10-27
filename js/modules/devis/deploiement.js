// Étapes du module Devis pour la page Réglages > Déploiement (25/10/2026). LOGIQUE PURE (ni DOM, ni Firebase) : la définition des lignes et le calcul de leur état
// à partir de ce que le module a déjà lu (réglages, étapes des affaires, catalogue). La lecture est faite par index.js (controlesDeploiement).
// Une ligne n'existe que si le module Devis est actif (`module: 'devis'`). Aucune valeur n'est rendue : seulement « ok », « manque » ou « inconnu ».
import { DOCS } from '../../os/deploiement.js';
import { validerEntreprise, validerReglagesDevis } from './articles.js';
import { erreursEmetteur } from './logique.js';

const geler = (liste) => Object.freeze(liste.map((e) => Object.freeze(e)));

export const ETAPES_DEPLOIEMENT_DEVIS = geler([
  { id: 'devis-donnees-client', groupe: 'avant', module: 'devis', type: 'manuel', libelle: 'Catalogue et anciens devis rassemblés',
    reparation: 'Rassemble le catalogue d’articles (tableur ou CSV) et tous les anciens devis, pour les importer dans l’espace.', lien: `${DOCS}deploiement-client.md` },
  { id: 'devis-entreprise', groupe: 'pendant', module: 'devis', type: 'auto', libelle: '« Mon entreprise » complète (mentions légales des devis)',
    reparation: 'Il manque des mentions légales : ouvre Réglages > Devis > Mon entreprise et remplis ce qui est listé sous « Mentions manquantes ».', route: 'reglages/devis/reglages-entreprise' },
  { id: 'devis-etape', groupe: 'pendant', module: 'devis', type: 'auto', libelle: 'Étape où vivent les devis choisie',
    reparation: 'Ouvre Réglages > Devis > Général et choisis « Étape où vivent les devis » (une étape qui existe encore dans tes affaires).', route: 'reglages/devis/reglages-devis' },
  { id: 'devis-catalogue', groupe: 'pendant', module: 'devis', type: 'auto', libelle: 'Catalogue d’articles rempli',
    reparation: 'Le catalogue est vide : importe ton catalogue, ou ajoute au moins un article.', route: 'devis/bordereau' },
  { id: 'devis-preparer-email', groupe: 'pendant', module: 'devis', type: 'manuel', libelle: 'Bouton « Préparer l’e-mail » branché',
    reparation: 'Absent chez les clients pour l’instant : la porte des workflows n’existe pas encore pour les espaces clients. Le bouton « Préparer l’e-mail » reste grisé (« pas encore branché ») et l’e-mail du devis ne peut pas encore être préparé. L’administrateur de la plateforme le branche avec le déploiement manuel.', lien: `${DOCS}ajouter-un-bouton-workflow.md` },
  { id: 'devis-essai', groupe: 'pendant', module: 'devis', type: 'manuel', libelle: 'Essai de bout en bout d’un devis (PDF, e-mail, Envoyé)',
    reparation: 'Sur une affaire de test : crée un devis, finalise-le, ouvre son PDF depuis l’onglet Devis de l’affaire, prépare l’e-mail, passe-le à Envoyé, puis archive l’essai.', lien: `${DOCS}deploiement-client.md` },
  { id: 'devis-mcp', groupe: 'pendant', module: 'devis', type: 'manuel', libelle: 'Assistant : « liste mes devis » vérifié',
    reparation: 'Demande à ton assistant « liste mes devis », puis « lis le devis X » : il ne montre jamais les prix d’achat.', lien: `${DOCS}deploiement-client.md` },
]);

const sur = (calcul) => { try { return calcul(); } catch { return 'inconnu'; } };

/** « Mon entreprise » complète : le même calcul que le point rouge de Réglages > Devis (aucune mention manquante). */
export function etatEntreprise(reglages) {
  return sur(() => (erreursEmetteur(validerEntreprise(reglages?.entreprise).entreprise).mentions.length === 0 ? 'ok' : 'manque'));
}

/** Étape des devis : réglée (non vide) ET acceptée par la même validation que l'enregistrement (elle existe encore dans les étapes actives). */
export function etatEtapeDevis(reglages, etapesIds) {
  return sur(() => {
    const etape = reglages?.etapeDevis;
    if (typeof etape !== 'string' || !etape) return 'manque';
    const { erreurs } = validerReglagesDevis({ etapeDevis: etape }, { actuels: reglages, etapesIds: etapesIds ?? [] });
    return erreurs.etapeDevis ? 'manque' : 'ok';
  });
}

/** Catalogue : au moins un article actif. */
export const etatCatalogue = (articles) => sur(() => ((articles ?? []).some((a) => a && a.actif !== false) ? 'ok' : 'manque'));

/** États de toutes les lignes automatiques du module, chacune calculée seule (une erreur = « inconnu », les autres continuent). */
export function controlerDeploiementDevis({ pret = true, reglages, etapesIds, articles, erreurArticles = false } = {}) {
  if (!pret) return { 'devis-entreprise': 'inconnu', 'devis-etape': 'inconnu', 'devis-catalogue': 'inconnu' };
  return {
    'devis-entreprise': etatEntreprise(reglages), 'devis-etape': etatEtapeDevis(reglages, etapesIds),
    'devis-catalogue': erreurArticles ? 'inconnu' : etatCatalogue(articles), // catalogue illisible : on ne sait pas s'il est vide
  };
}
