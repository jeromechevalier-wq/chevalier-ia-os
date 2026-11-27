// Données du village rangé par chaque utilisateur (étape 2 de docs/accueil-village.md, 27/11/2026) : le SEUL fichier du village qui parle à Firestore.
// Un document par maison rangée : village_utilisateurs/{uid}/batiments/{id} (dans une maison : à la racine ; sur la plateforme : sous l'espace, `base`).
// Les règles (firestore.rules) ne laissent lire et écrire que le compte lui-même et contrôlent chaque champ. Chaque écriture pose le document ENTIER
// (set sans fusion) avec `modifieLe` = l'heure du serveur ; plusieurs maisons s'écrivent d'un coup (writeBatch : tout ou rien).
// Jamais d'exception vers l'écran : lire() rend { etat: 'ok', docs } | { etat: 'refus' } (règles pas encore publiées) | { etat: 'erreur' } ; enregistrer() rend vrai ou faux.
// Pannes simulées (émulateurs seulement) : window.__chevalierTest.pannesVillage = { lecture: n, ecriture: n, refus: n } fait échouer les n prochains appels.
import { collection, doc, getDocs, writeBatch, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db, MODE_EMULATEURS } from './firebase.js';
import { cheminCollection } from './chemins.js';

/** Vrai (et le compteur baisse) si une panne simulée de cette sorte est demandée par un test. N'existe qu'avec les émulateurs. */
function pannePosee(sorte) {
  if (!MODE_EMULATEURS) return false;
  const p = window.__chevalierTest?.pannesVillage;
  if (!p || !(p[sorte] > 0)) return false;
  p[sorte] -= 1;
  return true;
}

/** Couche de données du village de l'utilisateur `uid`. `base` : '' (maison) ou le chemin de l'espace (plateforme). */
export function creerDonneesVillage({ base = '', uid }) {
  const segments = [...cheminCollection(base, 'village_utilisateurs').split('/'), String(uid), 'batiments'];
  const dossier = () => collection(db, ...segments);
  return {
    async lire() {
      try {
        if (pannePosee('refus')) return { etat: 'refus' };
        if (pannePosee('lecture')) throw new Error('panne simulée');
        const instantane = await getDocs(dossier());
        return { etat: 'ok', docs: instantane.docs.map((d) => ({ id: d.id, ...d.data() })) };
      } catch (e) {
        return { etat: e?.code === 'permission-denied' ? 'refus' : 'erreur' };
      }
    },
    /** `liste` : [{ id, donnees }] ; chaque document est écrit ENTIER, avec l'heure du serveur. */
    async enregistrer(liste) {
      try {
        if (!liste.length) return true;
        if (pannePosee('ecriture')) throw new Error('panne simulée');
        const lot = writeBatch(db);
        for (const { id, donnees } of liste) lot.set(doc(dossier(), id), { ...donnees, modifieLe: serverTimestamp() });
        await lot.commit();
        return true;
      } catch {
        return false;
      }
    },
    async retirer(id) {
      try {
        if (pannePosee('ecriture')) throw new Error('panne simulée');
        await deleteDoc(doc(dossier(), id));
        return true;
      } catch {
        return false;
      }
    },
  };
}
