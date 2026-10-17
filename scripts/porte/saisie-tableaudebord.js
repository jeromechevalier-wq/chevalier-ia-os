// Saisie d'une date d'échéance ou d'une valeur à l'écran du tableau de bord : la LOGIQUE, pure (la base et l'horloge sont injectées, aucun accès direct à la base).
// Appelée par la fonction `tableaudebordSaisir` (functions/src/tableaudebord-saisie.js), qui a déjà contrôlé QUI appelle. Copiée dans functions/partage/porte/ avant les tests et le déploiement.
//
// Ordre des contrôles (le premier qui échoue arrête tout ; jusqu'à l'étape 4 incluse, RIEN n'est écrit) :
//   1. forme de la demande (champ inconnu refusé, note sans secret) ; 2. l'indicateur existe, sa méthode permet la saisie, la donnée est du bon type ;
//   3. date réelle (AAAA-MM-JJ) ou nombre fini ; 4. nouveau niveau et message, calculés ICI ;
//   5. écriture en UN SEUL lot atomique : la mise à jour de l'indicateur ET la ligne d'historique (tout ou rien).
// Le message stocké est « Saisi par <adresse> » seulement : les jours restants sont recalculés en direct par l'écran, jamais figés en base.
import { valider, ErreurValidation } from './validation.js';

export const TABLES_SAISIE = Object.freeze({ indicateurs: 'tableaudebord_indicateurs', releves: 'tableaudebord_releves' });
/** Une échéance à moins de 30 jours passe en orange. Même bornes que DELAI_ECHEANCE de js/modules/tableaudebord/logique.js (un test vérifie qu'elles restent égales). */
export const DELAI_ECHEANCE_JOURS = 30;
const JOUR_MS = 24 * 60 * 60 * 1000;
/** CHOIX : Jérôme revérifie ses clés manuelles tous les 100 jours ; passé ce délai l'indicateur devient gris « Relevé trop ancien », même si l'échéance saisie est lointaine. */
export const JOURS_AVANT_PEREMPTION = 100;
export const PERIME_APRES_MINUTES = JOURS_AVANT_PEREMPTION * 24 * 60;
export const RAPPEL = `Prochaine vérification conseillée dans ${JOURS_AVANT_PEREMPTION} jours`;

/** Erreur « métier » : code stable, message écrit pour être affiché tel quel à Jérôme (jamais de détail technique). */
export class ErreurSaisie extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ErreurSaisie';
    this.code = code;
  }
}

const SCHEMA_DEMANDE = {
  indicateurId: { type: 'idsur', requis: true },
  echeance: { type: 'texte', max: 10 },
  valeur: { type: 'nombre', min: -1e12, max: 1e12 },
  commentaire: { type: 'libre', max: 200 },
};

const chemin = (base, table, id) => `${base ? `${base}/` : ''}${table}/${id}`;
const dateCompacte = (d) => d.toISOString().replace(/[-:]/g, '').slice(0, 15); // 20261017T101500

/** Une erreur de validation devient une phrase pour Jérôme (le texte technique, qui nomme le champ, ne sort jamais). */
function phrase(e) {
  const m = String(e.message);
  if (m.includes('Champ inconnu') || m.includes('doit être un objet')) return 'Demande inconnue.';
  if (m.includes('commentaire')) return 'La note est trop longue (200 caractères au plus) ou ressemble à une clé : retire-la.';
  if (m.includes('valeur')) return 'La valeur doit être un nombre.';
  if (m.includes('echeance')) return 'La date n\'est pas valide. Choisis un jour dans le calendrier.';
  return 'Demande inconnue.';
}

/** Date AAAA-MM-JJ réelle (2026-02-30 refusée), entre 2000 et 2100, à minuit UTC. */
export function lireJour(texte) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texte)) throw new ErreurSaisie('date_invalide', 'La date n\'est pas valide. Choisis un jour dans le calendrier.');
  const d = new Date(texte);
  const ms = d.getTime();
  if (Number.isNaN(ms) || d.toISOString().slice(0, 10) !== texte || ms < Date.UTC(2000, 0, 1) || ms > Date.UTC(2100, 0, 1)) {
    throw new ErreurSaisie('date_invalide', 'La date n\'est pas valide. Choisis un jour dans le calendrier (avant 2100).');
  }
  return d;
}

/** Niveau d'une échéance à l'instant `maintenant` (millisecondes) : rouge si dépassée, orange à moins de 30 jours, vert sinon. */
export function niveauDeEcheance(echeanceMs, maintenant) {
  const reste = echeanceMs - maintenant;
  if (reste < 0) return 'rouge';
  if (reste < DELAI_ECHEANCE_JOURS * JOUR_MS) return 'orange';
  return 'vert';
}

/**
 * Enregistre une saisie. `donnees` : adaptateur (lireDoc, ecrireLot). `maintenant()` : millisecondes. `auteur` : adresse e-mail de l'appelant (déjà contrôlée).
 * `base` : '' chez Jérôme (données à la racine). `demande` : { indicateurId, echeance? | valeur?, commentaire? }. Renvoie { niveau, message, rappel }.
 */
export async function saisir({ donnees, maintenant, auteur, demande, base = '', proprietaire = 'interne' }) {
  let d;
  try { d = valider(demande, SCHEMA_DEMANDE, 'demande'); } catch (e) {
    if (e instanceof ErreurValidation) throw new ErreurSaisie('demande_invalide', phrase(e));
    throw e;
  }
  if (d.indicateurId.length > 80) throw new ErreurSaisie('indicateur_inconnu', 'Cet indicateur n\'existe pas.');
  if (typeof auteur !== 'string' || !auteur) throw new ErreurSaisie('demande_invalide', 'Demande inconnue.');

  const chem = chemin(base, TABLES_SAISIE.indicateurs, d.indicateurId);
  const existant = await donnees.lireDoc(chem);
  if (!existant) throw new ErreurSaisie('indicateur_inconnu', 'Cet indicateur n\'existe pas.');
  if (existant.methode === 'auto') throw new ErreurSaisie('indicateur_auto', 'Cet indicateur est vérifié automatiquement : il n\'y a rien à saisir.');
  if (existant.methode !== 'manuel' && existant.methode !== 'semi') throw new ErreurSaisie('indicateur_non_saisissable', 'Cet indicateur ne se saisit pas à la main.');
  const estEtat = existant.type !== 'mesure';
  if (estEtat && (d.echeance === undefined || d.valeur !== undefined)) throw new ErreurSaisie('mauvais_type', 'Cet indicateur se saisit avec une date d\'échéance.');
  if (!estEtat && (d.valeur === undefined || d.echeance !== undefined)) throw new ErreurSaisie('mauvais_type', 'Cet indicateur se saisit avec une valeur (un nombre).');

  const maintenantMs = maintenant();
  const adate = new Date(maintenantMs);
  const jour = estEtat ? lireJour(d.echeance) : null;
  const niveau = estEtat ? niveauDeEcheance(jour.getTime(), maintenantMs) : null;
  const message = `Saisi par ${auteur}`;
  const donnee = estEtat ? { echeance: jour } : { valeur: d.valeur };
  const cle = estEtat ? 'echeance' : 'valeur';

  await donnees.ecrireLot([
    {
      type: 'maj',
      chemin: chem,
      donnees: { ...donnee, niveau, message, releveLe: adate, saisiPar: auteur, saisiLe: adate, perimeApresMinutes: PERIME_APRES_MINUTES },
    },
    {
      type: 'creer',
      chemin: chemin(base, TABLES_SAISIE.releves, `${d.indicateurId}_${dateCompacte(adate)}`),
      donnees: {
        indicateurId: d.indicateurId, releveLe: adate, ...donnee, niveau, message, saisie: true, saisiPar: auteur, saisiLe: adate,
        avant: { [cle]: existant[cle] ?? null }, commentaire: d.commentaire || null, proprietaire,
      },
    },
  ]);
  return { niveau, message, rappel: RAPPEL };
}
