// Données de l'écran « Fréquentation du site » : le lien de partage Plausible, gardé dans les réglages de l'espace (crm_parametres/frequentation_site, aucune nouvelle table).
// Lecture à l'ouverture de l'écran (pas d'abonnement), écriture par le journal commun (jamais de setDoc direct).
import { doc, getDocFromServer } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../../os/firebase.js';
import { executer } from '../../os/journal-donnees.js';
import * as L from '../crm/logique.js';
import { chemin } from './donnees.js';
import * as F from './frequentation-logique.js';

// ---------------------------------------------------------------- lien de partage de la fréquentation du site (Plausible)

/** Lit le lien de partage enregistré (chaîne vide = aucun). Lève l'erreur de lecture : l'écran la montre avec « Réessayer ». */
export async function lireLienFrequentation() {
  const d = await getDocFromServer(doc(db, chemin(F.DOCUMENT_LIEN.collection), F.DOCUMENT_LIEN.id));
  return d.exists() ? F.lienDepuisDocument(d.data()) : '';
}

/** Enregistre (ou retire, avec une chaîne vide) le lien de partage, par le journal commun. Le lien est vérifié ici aussi. Renvoie le lien gardé. */
export async function enregistrerLienFrequentation(texte) {
  const retrait = !String(texte ?? '').trim();
  const v = retrait ? { ok: true, lien: '' } : F.verifierLien(texte);
  if (!v.ok) throw new Error(v.message);
  const ref = doc(db, chemin(F.DOCUMENT_LIEN.collection), F.DOCUMENT_LIEN.id);
  const existe = (await getDocFromServer(ref)).exists(); // « modifier » garde la copie « avant » dans le journal ; « creer » seulement la première fois
  await executer([existe ? L.ecritureModifier(F.DOCUMENT_LIEN.collection, F.DOCUMENT_LIEN.id, { lien: v.lien })
    : L.ecritureCreer(F.DOCUMENT_LIEN.collection, F.DOCUMENT_LIEN.id, { lien: v.lien })]);
  return v.lien;
}
