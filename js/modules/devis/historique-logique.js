// Panneau « Historique » d'un devis : fonctions PURES (aucun accès au navigateur). L'écran (editeur-ecran.js) les appelle ; `node --test` les vérifie (tests/devis-actions.test.js).
// Il remplace l'ancienne fiche : versions du devis, envois par e-mail et dates.
import { enMs, libelleStatut } from './liste.js';
import { historiqueEnvois } from './email-brouillon.js';
import { lignePrepare } from './email-preparer.js';

export const MESSAGE_AUCUN_ENVOI = 'Pas encore envoyé';
const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' });

/** Jour JJ/MM/AAAA d'une date Firestore, Date, nombre ou texte ; texte vide si inconnue. */
export function jourFr(valeur) {
  const ms = enMs(valeur);
  return ms === null ? '' : FORMAT_JOUR.format(new Date(ms));
}

/**
 * Versions d'un devis, de la plus ancienne à la plus récente : [{ id, version, numero, statut, libelleStatut, jour, courante }].
 * `toutes` : les devis de même racine (donnees.js, versionsDe). Un devis sans autre version donne une seule ligne (la courante).
 */
export function versionsHistorique(d, toutes = []) {
  const racine = d?.racineId ?? d?.id;
  const liste = (toutes ?? []).filter((x) => (x.racineId ?? x.id) === racine);
  if (!liste.some((x) => x.id === d?.id) && d) liste.push(d);
  return liste.sort((a, b) => (a.version ?? 1) - (b.version ?? 1)).map((x) => ({
    id: x.id, version: x.version ?? 1, numero: x.numero ?? null, statut: x.statut ?? 'brouillon', libelleStatut: libelleStatut(x.statut ?? 'brouillon'),
    jour: jourFr(x.finaliseLe ?? x.creeLe), courante: x.id === d?.id,
  }));
}

/** Dates du devis, dans l'ordre de sa vie : seulement celles qui existent. [{ cle, libelle, jour }]. */
export function datesHistorique(d) {
  const lignes = [
    ['cree', 'Créé le', d?.creeLe], ['finalise', 'Finalisé le', d?.finaliseLe], ['envoye', 'Envoyé le', d?.envoyeLe],
    ['accepte', 'Signé le', d?.accepteLe], ['refuse', 'Refusé le', d?.refuseLe],
  ];
  const sortie = lignes.map(([cle, libelle, v]) => ({ cle, libelle, jour: jourFr(v) })).filter((l) => l.jour);
  if (d?.archive === true) sortie.push({ cle: 'archive', libelle: 'Archivé', jour: '' });
  return sortie;
}

/** Tout le contenu du panneau : { versions, envois, emailPrepare, dates }. `envois` est vide pour un brouillon (rien n'a pu partir). `emailPrepare` : null ou la ligne « E-mail préparé dans Gmail le … » (email-preparer.js). */
export function contenuHistorique(d, toutes = [], maintenant = Date.now()) {
  return {
    versions: versionsHistorique(d, toutes),
    envois: d?.statut === 'brouillon' ? [] : historiqueEnvois(d),
    emailPrepare: lignePrepare(d, maintenant),
    dates: datesHistorique(d),
  };
}
