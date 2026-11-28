// Remplit le registre privé de la Console (fiche reglages_maison/registre_console de la base du CRM de Jérôme), à partir d'un fichier JSON PRIVÉ gardé hors du dépôt.
//
//   node scripts/console-registre.js --projet <id du projet du CRM> --fichier <chemin du fichier JSON privé>
//        valide le fichier et affiche un résumé SANS aucune valeur (essai à blanc : rien n'est écrit)
//   ... la même commande avec --oui                   écrit vraiment (remplace toute la fiche par la version validée)
//   ... avec --oui --forcer                           écrit même si des entrées ont été retirées ou s'il n'y a aucun bâtiment (sinon : refus)
//
// Garde-fous avant d'écrire (relecture Fable de la PR 771) : (1) la fiche reglages_maison/maison du projet --projet doit avoir un champ projet_plateforme_lie
// non vide (sinon ce n'est pas le CRM de Jérôme : refus ; la valeur lue n'est jamais affichée) ; (2) sans --forcer, refus si le validateur a retiré
// au moins une entrée ou s'il ne reste aucun bâtiment. Le projet de l'immeuble lu en (1) sert aussi au validateur (une maison ne peut pas pointer vers lui).
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

/** Lit les arguments ; renvoie { projet, fichier, oui, forcer } ou lance une erreur en français. */
export function lireArguments(args) {
  const r = { oui: false, forcer: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--oui') r.oui = true;
    else if (a === '--forcer') r.forcer = true;
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

/**
 * Garde-fou avant l'écriture : un texte d'erreur (sans aucune valeur) si le fichier validé ne doit pas être écrit, sinon null.
 * Refus sans --forcer : au moins une entrée retirée par le validateur, ou aucun bâtiment valide (la fiche entière serait remplacée par une liste vide).
 */
export function refusAvantEcriture(valide, { forcer = false } = {}) {
  if (forcer) return null;
  if (valide.motifs.length) return `${valide.motifs.length} entrée(s) retirée(s) par la validation : corrige le fichier privé, ou ajoute --forcer pour écrire quand même la version validée. Rien n'a été écrit.`;
  if (!valide.batiments.length) return 'aucun bâtiment valide : la fiche serait vidée. Corrige le fichier privé, ou ajoute --forcer pour écrire quand même. Rien n\'a été écrit.';
  return null;
}

const adresseFiche = (projet, document) => `https://firestore.googleapis.com/v1/projects/${projet}/databases/(default)/documents/${COLLECTION_REGISTRE}/${document}`;
const entetes = (jeton, projet) => ({ Authorization: `Bearer ${jeton}`, 'x-goog-user-project': projet, 'Content-Type': 'application/json' });

/** Lit le champ projet_plateforme_lie de reglages_maison/maison (REST) : le texte, ou '' si la fiche ou le champ manque. Ne l'affiche jamais. */
export async function lireProjetLie({ projet, jeton, requete = fetch }) {
  const rep = await requete(adresseFiche(projet, 'maison'), { method: 'GET', headers: entetes(jeton, projet) });
  if (rep.status === 404) return '';
  if (rep.status !== 200) {
    const corps = await rep.json().catch(() => ({}));
    throw new Error(`lecture de la fiche de la maison refusée (${corps?.error?.status || `statut ${rep.status}`}) : gcloud est-il connecté au bon compte ?`);
  }
  const corps = await rep.json().catch(() => ({}));
  const v = corps?.fields?.projet_plateforme_lie?.stringValue;
  return typeof v === 'string' ? v.trim() : '';
}

/** Écrit la fiche validée (REST, remplace toute la fiche). */
export async function ecrireRegistre({ projet, jeton, fiche, requete = fetch }) {
  const rep = await requete(adresseFiche(projet, DOCUMENT_REGISTRE), {
    method: 'PATCH', headers: entetes(jeton, projet), body: JSON.stringify({ fields: versValeurFirestore(fiche).mapValue.fields }),
  });
  if (rep.status !== 200) {
    const corps = await rep.json().catch(() => ({}));
    throw new Error(`écriture refusée (${corps?.error?.status || `statut ${rep.status}`}) : gcloud est-il connecté au bon compte ?`);
  }
}

/**
 * Le déroulé complet ; tout ce qui touche le réseau ou le disque se remplace dans les tests (aucun appel réseau dans les tests).
 * `lireFichier` : (chemin) => texte ; `lireJeton` : () => jeton gcloud ; `lireLie` / `ecrire` : voir lireProjetLie / ecrireRegistre ; `afficher` : (texte) => void.
 * Rend 'essai', 'ecrit' ; lance une erreur en français (sans valeur) en cas de refus.
 */
export async function principal(args, {
  lireFichier = (chemin) => readFileSync(chemin, 'utf8'),
  lireJeton = () => execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim(),
  lireLie = lireProjetLie, ecrire = ecrireRegistre, afficher = (t) => console.log(t),
} = {}) {
  const a = lireArguments(args);
  let brut;
  try { brut = JSON.parse(lireFichier(a.fichier)); } catch { throw new Error('fichier illisible ou JSON invalide'); }
  const essai = validerRegistre(brut, { projetCourant: a.projet });
  afficher(resume(essai));
  if (!a.oui) { afficher('Essai à blanc : rien n\'a été écrit. Ajoute --oui pour écrire.'); return 'essai'; }
  const jeton = lireJeton();
  // (1) Le projet visé est-il bien le CRM de Jérôme ? Seul lui a un immeuble lié dans sa fiche de maison.
  const projetImmeuble = await lireLie({ projet: a.projet, jeton });
  if (!projetImmeuble) throw new Error('le projet --projet n\'a pas de projet lié dans sa fiche de maison : ce n\'est pas le CRM de Jérôme. Rien n\'a été écrit.');
  // (2) Nouvelle validation avec le projet de l'immeuble (une maison ne peut pas le lire), puis refus s'il reste des entrées retirées ou aucun bâtiment.
  const valide = validerRegistre(brut, { projetCourant: a.projet, projetImmeuble });
  if (valide.motifs.length !== essai.motifs.length) afficher(resume(valide));
  const refus = refusAvantEcriture(valide, { forcer: a.forcer });
  if (refus) throw new Error(refus);
  const fiche = ficheAEcrire(valide);
  await ecrire({ projet: a.projet, jeton, fiche });
  afficher(`Fait : registre écrit (${fiche.batiments.length} bâtiments).`);
  return 'ecrit';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal(process.argv.slice(2)).catch((err) => { console.error(`Refusé : ${err.message}`); process.exit(1); });
}
