// Étapes du module Devis pour la page Réglages > Déploiement (25/10/2026). LOGIQUE PURE (ni DOM, ni Firebase) : la définition des lignes et le calcul de leur état
// à partir de ce que le module a déjà lu (réglages, étapes des affaires, catalogue). La lecture est faite par index.js (controlesDeploiement).
// Une ligne n'existe que si le module Devis est actif (`module: 'devis'`). Aucune valeur n'est rendue : seulement « ok », « manque » ou « inconnu ».
import { DOCS } from '../../os/deploiement.js';
import { validerEntreprise } from './articles.js';
import { erreursEmetteur } from './logique.js';

const geler = (liste) => Object.freeze(liste.map((e) => Object.freeze(e)));

export const ETAPES_DEPLOIEMENT_DEVIS = geler([
  { id: 'devis-donnees-client', groupe: 'avant', module: 'devis', type: 'manuel', libelle: 'Catalogue et anciens devis rassemblés',
    reparation: 'Rassemble le catalogue d’articles (tableur ou CSV) et tous les anciens devis, pour les importer dans l’espace.', lien: `${DOCS}deploiement-client.md` },
  { id: 'devis-entreprise', groupe: 'pendant', module: 'devis', type: 'auto', libelle: '« Mon entreprise » complète (mentions légales des devis)',
    reparation: 'Il manque des mentions légales : ouvre Réglages > Devis > Mon entreprise et remplis ce qui est listé sous « Mentions manquantes ».', route: 'reglages/devis/reglages-entreprise' },
  { id: 'devis-catalogue', groupe: 'pendant', module: 'devis', type: 'auto', libelle: 'Catalogue d’articles rempli',
    reparation: 'Le catalogue est vide : importe ton catalogue, ou ajoute au moins un article.', route: 'devis/bordereau' },
  { id: 'pdf-stockage', groupe: 'pendant', module: 'devis', type: 'auto', controle: 'serveur.pdf-stockage', libelle: 'Le stockage des PDF répond',
    reparation: 'Le stockage où sont rangés les PDF des devis ne répond pas (ou n’a pas été vérifié). L’administrateur de la plateforme contrôle le stockage et ses droits (voir le mode d’emploi du PDF), puis clique sur « Revérifier ».', lien: `${DOCS}pdf-clients.md` },
  { id: 'pdf-fonctions', groupe: 'pendant', module: 'devis', type: 'auto', controle: 'serveur.pdf-fonctions', libelle: 'Ce serveur connaît les fonctions du PDF',
    reparation: 'Ce serveur ne connaît pas les fonctions du PDF : il est trop ancien. L’administrateur de la plateforme relance le déploiement des fonctions (workflow « Déploiement plateforme clients », choix « fonctions »), puis clique sur « Revérifier ». Attention : un déploiement partiel n’est pas détecté ici ; vérifier que devisPdfAuto est bien publiée dans la console Cloud Functions.', lien: `${DOCS}pdf-clients.md` },
  { id: 'devis-preparer-email', groupe: 'pendant', module: 'devis', type: 'manuel', libelle: 'Bouton « Préparer l’e-mail » branché',
    reparation: 'Absent chez les clients pour l’instant : la porte des workflows n’existe pas encore pour les espaces clients. Le bouton « Préparer l’e-mail » reste grisé (« pas encore branché »), l’outil de l’assistant qui prépare le brouillon répond « pas encore branché » et l’e-mail du devis ne peut pas encore être préparé. L’administrateur de la plateforme le branche avec le déploiement manuel.', lien: `${DOCS}ajouter-un-bouton-workflow.md` },
  { id: 'devis-garantie-email', groupe: 'pendant', module: 'devis', type: 'manuel', libelle: 'Garantie lue : le logiciel n’envoie jamais d’e-mail',
    reparation: 'À lire : Notre logiciel n’envoie jamais rien : il prépare seulement un brouillon, que tu relis et envoies toi-même. Si tu connectes le Gmail de ton assistant, c’est toi qui règles cet accès (de préférence brouillon, ou confirmation avant tout envoi) : nous ne le contrôlons pas.', lien: `${DOCS}deploiement-client.md` },
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

/** Catalogue : au moins un article actif. */
export const etatCatalogue = (articles) => sur(() => ((articles ?? []).some((a) => a && a.actif !== false) ? 'ok' : 'manque'));

/** États de toutes les lignes automatiques du module, chacune calculée seule (une erreur = « inconnu », les autres continuent). */
export function controlerDeploiementDevis({ pret = true, reglages, articles, erreurArticles = false } = {}) {
  if (!pret) return { 'devis-entreprise': 'inconnu', 'devis-catalogue': 'inconnu' };
  return {
    'devis-entreprise': etatEntreprise(reglages),
    'devis-catalogue': erreurArticles ? 'inconnu' : etatCatalogue(articles), // catalogue illisible : on ne sait pas s'il est vide
  };
}
