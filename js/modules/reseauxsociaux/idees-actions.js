// Écritures du volet « Idées et inspirations » : seul point d'écriture des écrans Idées et Inspirations.
// Tout passe par `executer` (le journal commun : la donnée, sa ligne d'audit et sa copie « avant » dans le même lot), jamais de setDoc direct.
// Chaque document existant est relu FRAIS avant d'écrire (un second enregistrement rapproché, avant que l'écoute en direct n'ait rendu le premier, ne réécrit pas `creeLe`).
// Aucune écriture dans Buffer ici : la poussée d'une idée dans Buffer viendra plus tard, dans le fichier qui parle déjà à Buffer (donnees.js).
import { collection, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../../os/firebase.js';
import { executer } from '../../os/journal-donnees.js';
import * as D from './donnees.js';
import * as R from './logique.js';
import * as I from './idees-logique.js';
import * as N from './inspirations-logique.js';
import * as P from './pistes-logique.js';
import * as V from './inspirations-vue-logique.js';

const nouvelId = (nom) => doc(collection(db, D.chemin(nom))).id;

async function lire(nom, id) {
  if (!id) return null;
  const lu = await getDoc(doc(db, D.chemin(nom), id));
  return lu.exists() ? { id, ...lu.data() } : null;
}

/** Crée (`id` nul) ou modifie une idée. Renvoie l'identifiant. Lève l'erreur de validation (message lisible) ou celle de l'écriture. */
export async function enregistrerIdee(id, valeurs) {
  const existante = await lire(R.COLLECTION_IDEES, id);
  if (id && !existante) throw new I.ErreurClaire('Cette idée n’existe plus.');
  const idDoc = id || nouvelId(R.COLLECTION_IDEES);
  await executer(I.planEnregistrerIdee(existante, valeurs, { id: idDoc }).ecritures);
  return idDoc;
}

/** Change l'état d'une idée. Passer à « dans_buffer » efface son texte (passage de témoin). `options.lien` = { reseau, outil, id } si on le connaît. */
export async function changerEtatIdee(id, etat, options = {}) {
  const existante = await lire(R.COLLECTION_IDEES, id);
  await executer(I.planChangerEtatIdee(existante, etat, { id }, options).ecritures);
}

/** Crée (`id` nul) ou modifie un profil d'inspiration (un nouveau profil se met en fin de liste). Renvoie l'identifiant. */
export async function enregistrerInspiration(id, valeurs) {
  const existant = await lire(R.COLLECTION_INSPIRATIONS, id);
  if (id && !existant) throw new I.ErreurClaire('Ce profil n’existe plus.');
  const idDoc = id || nouvelId(R.COLLECTION_INSPIRATIONS);
  await executer(N.planEnregistrerInspiration(existant, valeurs, { id: idDoc, autres: D.etat.inspirations }).ecritures);
  return idDoc;
}

/** Monte (-1) ou descend (+1) un profil d'une place. */
export async function deplacerInspiration(id, sens) {
  await executer(N.planDeplacerInspiration(D.etat.inspirations, id, sens).ecritures);
}

/** Crée (`id` nul) ou modifie un exemple de post (lien et analyse, jamais le texte du post). Renvoie l'identifiant. */
export async function enregistrerExemple(id, valeurs) {
  const existant = await lire(R.COLLECTION_EXEMPLES, id);
  if (id && !existant) throw new I.ErreurClaire('Cet exemple n’existe plus.');
  const idDoc = id || nouvelId(R.COLLECTION_EXEMPLES);
  await executer(N.planEnregistrerExemple(existant, valeurs, { id: idDoc }).ecritures);
  return idDoc;
}

// ---------------------------------------------------------------- pistes (13/11/2026)

/**
 * Dépose des pistes sur une source (l'aperçu validé de la réponse collée, ou une piste saisie à la main). `source` = la fiche affichée (réelle, ou virtuelle pour un résumé de veille : la fiche est alors créée ici,
 * avec son nom et son `veilleContenuId`). `options` : `voie` (« collage » ou « main », pour l'étiquette du lot), `auteur` (« claude » par défaut), `accepterDoublons` (vrai quand Jérôme a recoché un doublon).
 * La source est relue FRAIS : si elle existe déjà, on la modifie seulement (`traiteLe`) ; sinon elle est créée. Rien n'est supprimé. Renvoie { creees, ignorees }.
 */
export async function ajouterPistes(source, entrees, { voie = 'collage', auteur = 'claude', accepterDoublons = false } = {}) {
  const fiche = await lire(R.COLLECTION_INSPIRATIONS, source.id);
  if (!source.virtuelle && !fiche) throw new I.ErreurClaire('Cette source n’existe plus.');
  const base = fiche ?? source;
  const sourceExiste = !!fiche;
  const dernier = Math.max(-1, ...D.etat.inspirations.map((p) => (Number.isFinite(p.ordre) ? p.ordre : -1)));
  const plan = P.planAjouterPistes(
    // Le nom et le résumé de veille servent quand la fiche n'existe pas encore : sans eux la fiche créée serait sans nom (refusée) et sans lien avec son contenu de veille.
    { ...base, id: source.id, type: N.typeSource(base), nom: base.nom ?? source.nom, veilleContenuId: base.veilleContenuId ?? source.veilleContenuId },
    entrees,
    { nouvelId, jour: V.jourDuLot(), lot: V.etiquetteLot(voie), auteur, accepterDoublons, sourceExiste, ordre: dernier + 1, pistesExistantes: V.pistesDeSource(D.etat.pistes, source.id) });
  await executer(plan.ecritures);
  return { creees: plan.creees, ignorees: plan.ignorees };
}

/** Écarte une piste, la retient ou la remet en stock (un état de plus : rien ne s'efface). */
export async function changerEtatPiste(id, etat) {
  const existante = await lire(R.COLLECTION_PISTES, id);
  await executer(P.planChangerEtatPiste(existante, etat, { id }).ecritures);
}

/** « En faire une idée » : crée l'idée (angle, pilier, format, service, source = la piste) et lie les deux ; la piste passe « retenue ». Renvoie l'identifiant de l'idée. */
export async function enFaireUneIdee(pisteId) {
  const piste = await lire(R.COLLECTION_PISTES, pisteId);
  if (!piste) throw new I.ErreurClaire('Cette piste n’existe plus.');
  const source = await lire(R.COLLECTION_INSPIRATIONS, piste.sourceId);
  const ideeId = nouvelId(R.COLLECTION_IDEES);
  await executer(P.planEnFaireUneIdee(piste, source, { ideeId }).ecritures);
  return ideeId;
}
