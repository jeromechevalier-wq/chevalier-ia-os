// Onglet « Devis » de la fiche d'une affaire : règles PURES (aucun accès au navigateur ni aux données), testées dans tests/devis-onglet-affaire.test.js.
import { enMs, totauxDe } from './liste.js';

export const LIBELLE_CHARGEMENT = 'Chargement des devis…';
export const LIBELLE_VIDE = 'Aucun devis pour cette affaire.';
export const ERREUR_LECTURE_ONGLET = 'Les devis n’ont pas pu être chargés. Recharge la page.';

const cleDate = (d) => enMs(d?.creeLe) ?? enMs(d?.finaliseLe) ?? 0;

/**
 * Les devis de l'affaire, du plus récent au plus ancien (même clé que `devisRecentDeAffaire` : création, sinon finalisation, puis version).
 * Les devis archivés sont écartés ; les versions « Remplacé » restent (leur PDF est réel et a pu être envoyé).
 */
export function devisDeAffaire(devis, affaireId) {
  if (!affaireId) return [];
  return (devis ?? [])
    .filter((d) => d?.affaireId === affaireId && d.archive !== true)
    .sort((a, b) => (cleDate(b) - cleDate(a)) || ((b.version ?? 1) - (a.version ?? 1)));
}

/** « DEV-… », « DEV-… v2 » ou « Brouillon » (comme la liste des devis). */
export const intituleDevis = (d) => `${d?.numero ?? 'Brouillon'}${(d?.version ?? 1) > 1 ? ` v${d.version}` : ''}`;

/** Nombre montré dans la pastille de l'onglet : null tant que les devis ne sont pas lus. */
export const compteurOnglet = (lignes, pret) => (pret ? lignes.length : null);

const brouillon = (d) => d?.statut === 'brouillon';
/** Nom accessible (jamais vide) du lien d'une ligne. */
export const nomVoir = (d) => `Voir le devis ${d?.numero || String(d?.nom ?? '').trim() || String(d?.objet ?? '').trim() || 'brouillon'}`.trim();
/**
 * Texte d'une ligne de l'onglet Devis : « Nom – objet » ou le nom seul pour un brouillon nommé (le nom remplace « Brouillon »), « DEV-… – Nom » une fois numéroté ;
 * sans nom, l'ancien comportement (« intitulé – objet »). Le nom reste interne : jamais sur le PDF.
 */
export const libelleLigneDevis = (d) => {
  const nom = String(d?.nom ?? '').trim();
  const objet = String(d?.objet ?? '').trim();
  const tete = nom ? (d?.numero ? `${intituleDevis(d)} – ${nom}` : nom) : intituleDevis(d);
  return objet ? `${tete} – ${objet}` : tete;
};

/** Route de l'écran du devis : l'éditeur pour un brouillon, la visualisation sinon. */
export const routeVoirDevis = (d) => (brouillon(d) ? `devis/editeur/${d.id}` : `devis/voir/${d.id}`);

/**
 * Le bouton d'action de l'en-tête de l'affaire : « Créer un devis » sans devis, « Voir le devis » (le plus récent) sinon ; rien tant que les devis ne sont pas lus.
 * Même si l'affaire est perdue ou gagnée : on a toujours envie de revoir le devis ; mais on n'y crée pas de nouveau devis (`ouverte` faux). Rend { mode: 'creer' } ou { mode: 'voir', route }.
 */
export function actionEnteteDevis(devis, affaireId, pret, ouverte = true) {
  if (!pret || !affaireId) return null;
  const dernier = devisDeAffaire(devis, affaireId)[0];
  if (dernier) return { mode: 'voir', libelle: 'Voir le devis', route: routeVoirDevis(dernier) };
  return ouverte ? { mode: 'creer', libelle: 'Créer un devis' } : null; // pas de nouveau devis sur une affaire gagnée ou perdue
}

/**
 * Le montant que la fiche de l'affaire montre quand elle a des devis : la somme des TTC des devis VIVANTS (comme l'onglet « Devis », qui affiche le TTC).
 * Vivant = ni archivé, ni « Remplacé » (ancienne version : une seule version par devis compte, la plus récente, même si la v1 n'est pas encore « Remplacé »), ni « Refusé » (choix : un devis refusé ne sera pas facturé).
 * Un brouillon compte. Un devis dont le total ne se calcule pas est écarté. null s'il n'y en a aucun (la fiche montre alors le montant estimé).
 * Forme rendue au CRM : { libelle, total, suffixe, detail: [{ texte, montant }] }.
 */
export function montantDevisDeAffaire(devis, affaireId) {
  const vus = new Set();
  const vivants = devisDeAffaire(devis, affaireId)
    .filter((d) => d.statut !== 'remplace' && d.statut !== 'refuse')
    // Une seule version par devis (la plus récente, la liste est triée récent d'abord) : pendant une nouvelle version, la v1 n'est « Remplacé » qu'à la finalisation de la v2.
    .filter((d) => { const r = d.racineId ?? d.id; if (vus.has(r)) return false; vus.add(r); return true; })
    .map((d) => ({ d, t: totauxDe(d) }))
    .filter((x) => x.t && Number.isFinite(x.t.ttc));
  if (!vivants.length) return null;
  const total = vivants.reduce((somme, x) => somme + Math.round(x.t.ttc * 100), 0) / 100;
  return {
    libelle: vivants.length === 1 ? 'Montant du devis' : `Total des devis (${vivants.length})`,
    total,
    suffixe: 'TTC',
    detail: vivants.map((x) => ({ texte: libelleLigneDevis(x.d), montant: x.t.ttc })),
  };
}
