// Ajoute des pièces d'or au village d'une personne, pour essayer les achats du village (cadeau de Jérôme, demandé le 28/11/2026).
//
//   node scripts/donner-or-village.js --projet <id du projet Firebase> --compte <adresse e-mail du compte> --pieces <nombre>
//        montre le solde avant et après, SANS rien écrire (essai à blanc)
//   ... la même commande avec --oui                   écrit vraiment
//   --client <id>   seulement pour la plateforme des clients (chemin clients/<id>/…) ; absent = une maison (chemin à la racine)
//
// Se lance depuis le Mac, avec le compte gcloud de Jérôme (gcloud auth print-access-token) : aucune clé, aucun secret dans ce fichier.
// Écrit dans village_utilisateurs/<uid> les champs or (+ pièces), version (+ 1, pour que l'écran prenne le nouveau solde) et modifieLe.
// Ne touche pas à « gagne » (l'or gagné par le travail) : un cadeau n'est pas un gain. Écriture refusée si le portefeuille a changé
// entre la lecture et l'écriture (précondition updateTime) : relancer la commande.
// Le dépôt est public : aucun nom de client, projet ou adresse ici ; tout arrive par les arguments.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PIECES_MAX = 100000;
export const MOTIF_PROJET = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const MOTIF_CLIENT = /^[A-Za-z0-9_-]{1,64}$/;

/** Lit les arguments ; renvoie { projet, compte, pieces, client, oui } ou lance une erreur en français. */
export function lireArguments(args) {
  const r = { oui: false, client: '' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--oui') r.oui = true;
    else if (['--projet', '--compte', '--pieces', '--client'].includes(a)) r[a.slice(2)] = args[++i] ?? '';
    else throw new Error(`argument inconnu : ${a}`);
  }
  if (!MOTIF_PROJET.test(r.projet || '')) throw new Error('--projet manquant ou invalide (identifiant du projet Firebase)');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.compte || '')) throw new Error('--compte manquant ou invalide (adresse e-mail du compte)');
  const n = /^\d{1,6}$/.test(r.pieces || '') ? Number(r.pieces) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > PIECES_MAX) throw new Error(`--pieces doit être un entier entre 1 et ${PIECES_MAX}`);
  r.pieces = n;
  if (r.client && !MOTIF_CLIENT.test(r.client)) throw new Error('--client invalide');
  return r;
}

/** Entier positif lu dans un champ Firestore REST ({ integerValue: "12" }) ; sinon 0 (comme portefeuilleDe côté serveur). */
export function entierDe(champ) {
  const v = champ && champ.integerValue !== undefined ? Number(champ.integerValue) : NaN;
  return Number.isInteger(v) && v >= 0 ? v : 0;
}

/** Corps et masque de l'écriture : nouveau solde = ancien + pièces, version + 1. */
export function nouvelleEcriture(champsActuels, pieces, maintenantIso) {
  const or = entierDe(champsActuels?.or) + pieces;
  const version = entierDe(champsActuels?.version) + 1;
  return {
    or, version,
    corps: { fields: { or: { integerValue: String(or) }, version: { integerValue: String(version) }, modifieLe: { timestampValue: maintenantIso } } },
    masque: ['or', 'version', 'modifieLe'],
  };
}

/** Adresse du PATCH : masque des champs + précondition (le portefeuille n'a pas changé depuis la lecture, ou n'existe toujours pas). */
export function adresseEcriture(doc, ecriture, lu) {
  const condition = lu.existe ? `currentDocument.updateTime=${encodeURIComponent(lu.updateTime)}` : 'currentDocument.exists=false';
  return `${doc}?${ecriture.masque.map((m) => `updateMask.fieldPaths=${m}`).join('&')}&${condition}`;
}

/** Chemin du portefeuille : à la racine pour une maison, sous clients/<id>/ pour la plateforme. */
export const cheminPortefeuille = (client, uid) => `${client ? `clients/${client}/` : ''}village_utilisateurs/${uid}`;

const raison = (r) => r.corps?.error?.status || `statut ${r.statut}`;

async function appeler(url, jeton, projet, options = {}) {
  const rep = await fetch(url, { ...options, headers: { Authorization: `Bearer ${jeton}`, 'x-goog-user-project': projet, 'Content-Type': 'application/json' } });
  const corps = await rep.json().catch(() => ({}));
  return { statut: rep.status, corps };
}

async function principal() {
  const a = lireArguments(process.argv.slice(2));
  const jeton = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  const recherche = await appeler(`https://identitytoolkit.googleapis.com/v1/projects/${a.projet}/accounts:lookup`, jeton, a.projet,
    { method: 'POST', body: JSON.stringify({ email: [a.compte] }) });
  if (recherche.statut !== 200) throw new Error(`recherche du compte impossible (${raison(recherche)}) : gcloud est-il connecté ?`);
  const uid = recherche.corps?.users?.[0]?.localId;
  if (!uid) throw new Error(`aucun compte avec cette adresse dans ${a.projet}`);
  const base = `https://firestore.googleapis.com/v1/projects/${a.projet}/databases/(default)/documents/`;
  if (a.client) {
    const membre = await appeler(`${base}clients/${a.client}/membres/${encodeURIComponent(a.compte.toLowerCase())}`, jeton, a.projet);
    if (membre.statut === 404) throw new Error('ce compte n\'est pas membre de cet espace (--client)');
    if (membre.statut !== 200) throw new Error(`lecture des membres impossible (${raison(membre)})`);
  }
  const chemin = cheminPortefeuille(a.client, uid);
  const doc = base + chemin;
  const lu = await appeler(doc, jeton, a.projet);
  if (lu.statut !== 200 && lu.statut !== 404) throw new Error(`lecture du portefeuille impossible (${raison(lu)})`);
  const existe = lu.statut === 200;
  const e = nouvelleEcriture(existe ? lu.corps.fields : null, a.pieces, new Date().toISOString());
  console.log(`Portefeuille : ${chemin}${existe ? '' : ' (n\'existe pas encore : il sera créé)'}`);
  console.log(`Solde actuel : ${existe ? entierDe(lu.corps.fields?.or) : 0} pièces. Après le cadeau : ${e.or} pièces.`);
  if (!a.oui) { console.log('Essai à blanc : rien n\'a été écrit. Ajoute --oui pour écrire.'); return; }
  const ecrit = await appeler(adresseEcriture(doc, e, { existe, updateTime: lu.corps.updateTime }), jeton, a.projet, { method: 'PATCH', body: JSON.stringify(e.corps) });
  if (ecrit.statut !== 200) {
    const r = raison(ecrit);
    throw new Error(['FAILED_PRECONDITION', 'ALREADY_EXISTS', 'ABORTED'].includes(r) ? 'le portefeuille a changé pendant la commande : relance-la' : `écriture refusée (${r})`);
  }
  console.log(`Fait : ${a.pieces} pièces ajoutées, nouveau solde ${entierDe(ecrit.corps.fields?.or)} pièces.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((err) => { console.error(`Refusé : ${err.message}`); process.exit(1); });
}
