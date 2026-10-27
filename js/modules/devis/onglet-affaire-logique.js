// Onglet « Devis » de la fiche d'une affaire : règles PURES (aucun accès au navigateur ni aux données), testées dans tests/devis-onglet-affaire.test.js.
import { enMs } from './liste.js';

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
/** Texte du lien qui ouvre le PDF. */
export const libelleOuvrirPdf = (d) => (brouillon(d) ? 'Ouvrir le PDF brouillon' : 'Ouvrir le PDF');
/** Noms accessibles (jamais vides) des trois actions d'une ligne. */
export const nomVoir = (d) => `Voir le devis ${d?.numero ?? d?.objet ?? 'brouillon'}`.trim();
export const nomOuvrirPdf = (d) => (brouillon(d) ? `Ouvrir le PDF brouillon du devis ${d?.objet || 'sans objet'}` : `Ouvrir le PDF du devis ${d?.numero ?? d?.objet ?? ''}`.trim());
export const nomTelecharger = (d) => (brouillon(d) ? `Télécharger le PDF brouillon du devis ${d?.objet || 'sans objet'}` : `Télécharger le PDF du devis ${d?.numero ?? d?.objet ?? ''}`.trim());

/** Route de l'écran du devis : l'éditeur pour un brouillon, la visualisation sinon. */
export const routeVoirDevis = (d) => (brouillon(d) ? `devis/editeur/${d.id}` : `devis/voir/${d.id}`);

/** Vrai si l'erreur d'une fonction du serveur est « introuvable » (pas de PDF brouillon fabriqué). */
export const estIntrouvable = (e) => String(e?.code ?? '').replace('functions/', '') === 'not-found';

/** Adresse que le navigateur peut ouvrir pour enregistrer le fichier : https seulement. */
export const adresseTelechargeable = (url) => typeof url === 'string' && url.startsWith('https://');
