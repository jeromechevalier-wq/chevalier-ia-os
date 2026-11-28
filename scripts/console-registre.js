// Remplit le registre privé de la Console (fiche reglages_maison/registre_console de la base du CRM de Jérôme), à partir d'un fichier JSON PRIVÉ gardé hors du dépôt.
//
//   node scripts/console-registre.js --projet <id du projet du CRM> --fichier <chemin du fichier JSON privé>
//        valide le fichier et affiche un résumé SANS aucune valeur (essai à blanc : rien n'est écrit)
//   ... la même commande avec --oui                   écrit vraiment (remplace toute la fiche par la version validée)
//
// Forme du fichier : { "batiments": [ { "cle", "nom", "genre": "maison", "etat": "en_service" | "en_construction" | "a_venir",
//   "projets": [ { "role", "libelle" } ], "lecture_projet" } ], "projets_os": [ … ], "projets_immeuble": [ … ] } (docs/console.md, section 12).
// Même validateur que le serveur (functions/src/console/registre.js, sans dépendance) : une entrée invalide est retirée avec un motif, jamais écrite.
// Se lance depuis le Mac, avec le compte gcloud de Jérôme (gcloud auth print-access-token), comme scripts/donner-or-village.js : aucune clé, aucun secret dans ce fichier.
// Le dépôt est public : aucun nom de client, de projet ni d'adresse ici ; tout arrive par les arguments et le fichier privé.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validerRegistre, MOTIF_PROJET, COLLECTION_REGISTRE, DOCUMENT_REGISTRE } from '../functions/src/console/registre.js';

/** Lit les arguments ; renvoie { projet, fichier, oui } ou lance une erreur en français. */
export function lireArguments(args) {
  const r = { oui: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--oui') r.oui = true;
    else if (['--projet', '--fichier'].includes(a)) r[a.slice(2)] = args[++i] ?? '';
    else throw new Error(`argument inconnu : ${a}`);
  }
  if (!MOTIF_PROJET.test(r.projet || '')) throw new Error('--projet manquant ou invalide (identifiant du projet Firebase du CRM)');
  if (!r.fichier) throw new Error('--fichier manquant (chemin du fichier JSON privé)');
  return r;
}

/** Une valeur JSON au format REST de Firestore (textes, nombres entiers, booléens, null, listes, objets). */
export function versValeurFirestore(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === 'number') return { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(versValeurFirestore) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, versValeurFirestore(x)])) } };
}

/** La fiche à écrire : seulement la version validée (jamais une entrée refusée). */
export function ficheAEcrire(valide) {
  return {
    batiments: valide.batiments.map((b) => ({ cle: b.cle, nom: b.nom, genre: b.genre, etat: b.etat, projets: b.projets, ...(b.lecture_projet ? { lecture_projet: b.lecture_projet } : {}) })),
    projets_os: valide.projets_os,
    projets_immeuble: valide.projets_immeuble,
  };
}

/** Résumé SANS valeur : nombres et motifs (les motifs ne contiennent qu'un rang et une raison). */
export function resume(valide) {
  const parEtat = (e) => valide.batiments.filter((b) => b.etat === e).length;
  return [
    `Bâtiments valides : ${valide.batiments.length} (en service : ${parEtat('en_service')}, en construction : ${parEtat('en_construction')}, à venir : ${parEtat('a_venir')}).`,
    `Maisons avec un projet à lire : ${valide.batiments.filter((b) => b.lecture_projet).length}.`,
    `Projets notés : Chevalier IA OS ${valide.projets_os.length}, immeuble ${valide.projets_immeuble.length}.`,
    valide.motifs.length ? `Entrées retirées (${valide.motifs.length}) :\n${valide.motifs.map((m) => `  - ${m}`).join('\n')}` : 'Aucune entrée retirée.',
  ].join('\n');
}

async function principal() {
  const a = lireArguments(process.argv.slice(2));
  let brut;
  try { brut = JSON.parse(readFileSync(a.fichier, 'utf8')); } catch { throw new Error('fichier illisible ou JSON invalide'); }
  const valide = validerRegistre(brut, { projetCourant: a.projet });
  console.log(resume(valide));
  if (!a.oui) { console.log('Essai à blanc : rien n\'a été écrit. Ajoute --oui pour écrire.'); return; }
  const jeton = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  const fiche = ficheAEcrire(valide);
  const url = `https://firestore.googleapis.com/v1/projects/${a.projet}/databases/(default)/documents/${COLLECTION_REGISTRE}/${DOCUMENT_REGISTRE}`;
  const rep = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${jeton}`, 'x-goog-user-project': a.projet, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: versValeurFirestore(fiche).mapValue.fields }),
  });
  if (rep.status !== 200) {
    const corps = await rep.json().catch(() => ({}));
    throw new Error(`écriture refusée (${corps?.error?.status || `statut ${rep.status}`}) : gcloud est-il connecté au bon compte ?`);
  }
  console.log(`Fait : registre écrit (${fiche.batiments.length} bâtiments).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((err) => { console.error(`Refusé : ${err.message}`); process.exit(1); });
}
