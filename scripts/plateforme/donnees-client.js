// Outil de REMISE et de SUPPRESSION des données d'un client (chantier 13).
//  exporter <client>   : fichier JSON de tout ce qui est sous clients/<client>/ (membres compris) + sa fiche de marque (+ ses images avec --avec-images).
//  supprimer <client>  : par défaut SIMULE (compte). Exige un export fait juste avant, puis une confirmation écrite (taper l'identifiant).
// Il ne touche jamais qu'à clients/<client>/**, marques/<client> et marques/<client>/ dans Storage. Voir docs/nouveau-client.md.
import { createInterface } from 'node:readline/promises';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Timestamp, GeoPoint, DocumentReference } from 'firebase-admin/firestore';
import {
  ErreurOutil, cheminAutorise, cible, exigerIdentifiant, fichierStorageAutorise, lireArguments, ouvrir, prefixeStorage, traduireErreur,
} from './commun.js';

export const AIDE = `Outil « données d'un client » — la suppression simule par défaut.

Sauvegarder / remettre les données d'un client :
  node scripts/donnees-client.js exporter <identifiant> [--sortie chemin/fichier.json] [--avec-images]

Supprimer un client (définitif) :
  node scripts/donnees-client.js supprimer <identifiant> --export chemin/fichier.json            (simulation : compte ce qui serait supprimé)
  node scripts/donnees-client.js supprimer <identifiant> --export chemin/fichier.json --ecrire   (supprime vraiment, après avoir demandé de taper l'identifiant)

Options communes : --projet <projet Firebase> (défaut : chevalier-ia-app) ; --bucket <nom du stockage>.`;

const RACINE_DEPOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FORMAT = 'chevalier-ia-os/export-client';

// ------------------------------------------------------------------------------------------------ valeurs Firestore <-> JSON

/** Valeur Firestore -> JSON sans perte (dates, références, octets… marqués par « __type »). */
export function encoder(v) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : { __type: 'nombre', valeur: String(v) };
  if (v instanceof Timestamp) return { __type: 'date', secondes: v.seconds, nanos: v.nanoseconds };
  if (v instanceof GeoPoint) return { __type: 'position', latitude: v.latitude, longitude: v.longitude };
  if (v instanceof DocumentReference) return { __type: 'reference', chemin: v.path };
  if (v instanceof Uint8Array) return { __type: 'octets', base64: Buffer.from(v).toString('base64') };
  if (Array.isArray(v)) return v.map(encoder);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encoder(x)]));
  return v === undefined ? null : String(v);
}

const versionDe = (snap) => (snap.updateTime ? `${snap.updateTime.seconds}.${String(snap.updateTime.nanoseconds).padStart(9, '0')}` : null);

// ------------------------------------------------------------------------------------------------ lecture de ce qu'a un client

/** Tous les documents sous clients/<client> (le document lui-même, ses sous-collections, récursivement, même les documents « fantômes »). */
export async function listerDocuments(db, client) {
  exigerIdentifiant(client);
  const refs = [];
  const marcher = async (ref) => {
    refs.push(ref);
    for (const col of await ref.listCollections()) {
      for (const sous of await col.listDocuments()) await marcher(sous);
    }
  };
  await marcher(db.doc(`clients/${client}`));
  const vus = [];
  for (let i = 0; i < refs.length; i += 300) {
    const snaps = await db.getAll(...refs.slice(i, i + 300));
    for (const s of snaps) if (s.exists) vus.push(s);
  }
  for (const s of vus) {
    if (!cheminAutorise(client, s.ref.path)) throw new Error(`Sécurité : chemin inattendu ${s.ref.path}`); // ne devrait jamais arriver
  }
  return vus.sort((a, b) => (a.ref.path < b.ref.path ? -1 : 1));
}

async function listerFichiers(bucket, client) {
  const [fichiers] = await bucket.getFiles({ prefix: prefixeStorage(client) });
  return fichiers.filter((f) => fichierStorageAutorise(client, f.name) && !f.name.endsWith('/'));
}

async function lireClient(ctx, client) {
  const { db, bucket } = ctx.base;
  const [docs, marque, fichiers] = await Promise.all([listerDocuments(db, client), db.doc(`marques/${client}`).get(), listerFichiers(bucket, client)]);
  return { docs, marque: marque.exists ? marque : null, fichiers };
}

const resumeCollections = (docs) => {
  const compte = {};
  for (const s of docs) {
    const morceaux = s.ref.path.split('/'); // clients, <client>, <collection>, <doc>, …
    const nom = morceaux.length === 2 ? '(fiche du client)' : morceaux[2];
    compte[nom] = (compte[nom] || 0) + 1;
  }
  return Object.entries(compte).sort(([a], [b]) => (a < b ? -1 : 1));
};

// ------------------------------------------------------------------------------------------------ exporter

function dossierSur(chemin) {
  const abs = resolve(chemin);
  const rel = relative(RACINE_DEPOT, abs);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new ErreurOutil("La sauvegarde ne doit pas être enregistrée à l'intérieur du dossier du projet (on risquerait de la publier ou de la commiter par erreur). Choisissez un dossier ailleurs, par exemple --sortie ~/Documents/sauvegardes-clients/mon-fichier.json");
  }
  return abs;
}

async function exporter(client, options, ctx) {
  const { out } = ctx;
  const horodatage = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sortie = dossierSur(options.sortie || join(homedir(), 'Documents', 'sauvegardes-clients', `${client}-${horodatage}.json`));
  if (existsSync(sortie)) throw new ErreurOutil(`Le fichier ${sortie} existe déjà : rien n'est écrasé. Choisissez un autre nom avec --sortie.`);

  const etat = await lireClient(ctx, client);
  if (!etat.docs.length && !etat.marque && !etat.fichiers.length) throw new ErreurOutil(`Le client « ${client} » n'existe pas (aucune donnée trouvée).`);

  const fichiers = etat.fichiers.map((f) => ({ nom: f.name, octets: Number(f.metadata.size ?? 0), type: f.metadata.contentType ?? null }));
  const contenu = {
    format: FORMAT,
    version: 1,
    client,
    projet: ctx.cible.projet,
    exporteLe: new Date().toISOString(),
    nombreDocuments: etat.docs.length,
    marque: etat.marque ? { chemin: etat.marque.ref.path, version: versionDe(etat.marque), donnees: encoder(etat.marque.data()) } : null,
    documents: etat.docs.map((s) => ({ chemin: s.ref.path, version: versionDe(s), donnees: encoder(s.data()) })),
    fichiers,
    imagesSauvegardees: Boolean(options['avec-images']),
  };
  mkdirSync(dirname(sortie), { recursive: true });
  writeFileSync(sortie, `${JSON.stringify(contenu, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  out(`✔ Sauvegarde écrite : ${sortie}`);
  out(`  ${etat.docs.length} document(s) du client, ${etat.marque ? 'sa fiche de marque, ' : ''}${fichiers.length} fichier(s) d'image listé(s).`);
  for (const [nom, n] of resumeCollections(etat.docs)) out(`    ${nom} : ${n}`);

  if (options['avec-images'] && etat.fichiers.length) {
    const dossier = sortie.replace(/\.json$/i, '') + '-images';
    for (const f of etat.fichiers) {
      const cheminLocal = join(dossier, f.name.slice(prefixeStorage(client).length));
      mkdirSync(dirname(cheminLocal), { recursive: true });
      await f.download({ destination: cheminLocal });
    }
    out(`✔ ${etat.fichiers.length} image(s) copiée(s) dans ${dossier}`);
  } else if (etat.fichiers.length) {
    out("  Les images ne sont pas copiées (ajoutez --avec-images pour les copier).");
  }
  out('  Ce fichier contient les données du client : ne le laissez pas traîner, ne le mettez ni dans le dépôt ni dans un message.');
  return 0;
}

// ------------------------------------------------------------------------------------------------ supprimer

/** Compare l'état actuel à l'export : renvoie la liste des problèmes (vide = l'export couvre exactement ce qui va être supprimé). */
export function comparerAvecExport(exportJson, client, etatActuel, projet) {
  const p = [];
  if (!exportJson || exportJson.format !== FORMAT || exportJson.version !== 1) return ["Ce fichier n'est pas une sauvegarde faite par « exporter »."];
  if (exportJson.client !== client) p.push(`Cette sauvegarde est celle du client « ${exportJson.client} », pas de « ${client} ».`);
  if (exportJson.projet !== projet) p.push(`Cette sauvegarde vient du projet « ${exportJson.projet} », pas de « ${projet} ».`);
  if (p.length) return p;
  const enExport = new Map((exportJson.documents || []).map((d) => [d.chemin, d]));
  for (const s of etatActuel.docs) {
    const e = enExport.get(s.ref.path);
    if (!e) p.push(`Document absent de la sauvegarde (créé depuis) : ${s.ref.path}`);
    else if (e.version !== versionDe(s)) p.push(`Document modifié depuis la sauvegarde : ${s.ref.path}`);
  }
  if (etatActuel.marque) {
    if (!exportJson.marque) p.push(`Fiche de marque absente de la sauvegarde : ${etatActuel.marque.ref.path}`);
    else if (exportJson.marque.version !== versionDe(etatActuel.marque)) p.push(`Fiche de marque modifiée depuis la sauvegarde : ${etatActuel.marque.ref.path}`);
  }
  const nomsExport = new Set((exportJson.fichiers || []).map((f) => f.nom));
  for (const f of etatActuel.fichiers) if (!nomsExport.has(f.name)) p.push(`Fichier absent de la sauvegarde (envoyé depuis) : ${f.name}`);
  return p;
}

async function demanderConfirmation(client, options, ctx) {
  if (options.confirmer !== undefined) return options.confirmer === client;
  if (!ctx.lireLigne) return null; // pas de clavier : on ne peut pas demander
  const reponse = await ctx.lireLigne(`Pour supprimer DÉFINITIVEMENT le client « ${client} », tapez son identifiant puis Entrée (autre chose = annuler) : `);
  return reponse.trim() === client;
}

async function supprimer(client, options, ctx) {
  const { out } = ctx;
  if (!options.export) throw new ErreurOutil(["Sauvegarde obligatoire avant toute suppression : indiquez le fichier avec --export.", `Pour la faire : node scripts/donnees-client.js exporter ${client}`]);
  const fichierExport = resolve(options.export);
  if (!existsSync(fichierExport)) throw new ErreurOutil(`Le fichier de sauvegarde ${fichierExport} est introuvable.`);
  let sauvegarde;
  try { sauvegarde = JSON.parse(readFileSync(fichierExport, 'utf8')); } catch { throw new ErreurOutil(`Le fichier ${fichierExport} est illisible (ce n'est pas du JSON).`); }

  const etat = await lireClient(ctx, client);
  if (!etat.docs.length && !etat.marque && !etat.fichiers.length) throw new ErreurOutil(`Le client « ${client} » n'existe pas (ou a déjà été supprimé) : rien à supprimer.`);
  const problemes = comparerAvecExport(sauvegarde, client, etat, ctx.cible.projet);
  if (problemes.length) {
    throw new ErreurOutil([`La sauvegarde ne correspond pas à ce qui existe aujourd'hui : rien n'est supprimé.`, ...problemes.slice(0, 10).map((l) => `  - ${l}`),
      ...(problemes.length > 10 ? [`  … et ${problemes.length - 10} autre(s)`] : []), `Refaites une sauvegarde : node scripts/donnees-client.js exporter ${client}`]);
  }

  const membres = etat.docs.filter((s) => s.ref.path.startsWith(`clients/${client}/membres/`)).map((s) => s.ref.path.split('/')[3]);
  out(`SUPPRESSION du client « ${client} » — ce qui serait supprimé :`);
  out(`  Documents sous clients/${client}/ : ${etat.docs.length}`);
  for (const [nom, n] of resumeCollections(etat.docs)) out(`    ${nom} : ${n}`);
  out(`  Fiche de marque marques/${client} : ${etat.marque ? 'oui' : 'absente'}`);
  out(`  Fichiers d'images ${prefixeStorage(client)}… : ${etat.fichiers.length}`);
  out(`  Personnes qui perdent l'accès (${membres.length}) : ${membres.join(', ') || 'aucune'}`);
  out(`  Sauvegarde vérifiée : ${fichierExport} (faite le ${sauvegarde.exporteLe})`);
  if (etat.fichiers.length && !sauvegarde.imagesSauvegardees) out("  ⚠ Les images n'ont pas été copiées dans la sauvegarde (pas de --avec-images) : elles seront perdues.");

  if (!ctx.ecrire) {
    out("\nSIMULATION : rien n'a été supprimé. Pour supprimer vraiment, relancez la même commande avec --ecrire à la fin.");
    return 0;
  }
  const ok = await demanderConfirmation(client, options, ctx);
  if (ok === null) throw new ErreurOutil(["Confirmation impossible : cette fenêtre ne permet pas de taper une réponse.", `Ajoutez --confirmer ${client} à la commande pour confirmer par écrit.`]);
  if (!ok) throw new ErreurOutil("Confirmation absente ou différente de l'identifiant : rien n'est supprimé.");

  const { db, bucket } = ctx.base;
  const journal = [];
  const note = (l) => { journal.push(l); out(l); };
  note(`\nSuppression en cours (${new Date().toISOString()}), projet ${ctx.cible.projet}…`);
  if (etat.marque) { await etat.marque.ref.delete(); note(`  ✔ supprimé marques/${client}  (la page du client est déjà indisponible)`); }
  await db.recursiveDelete(db.doc(`clients/${client}`));
  note(`  ✔ supprimé clients/${client}/** (${etat.docs.length} document(s)) :`);
  for (const s of etat.docs) note(`      ${s.ref.path}`);
  for (const f of etat.fichiers) {
    if (!fichierStorageAutorise(client, f.name)) continue;
    await f.delete({ ignoreNotFound: true });
    note(`  ✔ supprimé fichier ${f.name}`);
  }
  const reste = await lireClient(ctx, client);
  const nReste = reste.docs.length + (reste.marque ? 1 : 0) + reste.fichiers.length;
  if (nReste) throw new ErreurOutil(`Vérification : il reste ${nReste} élément(s) pour « ${client} ». Relancez la suppression (avec une nouvelle sauvegarde).`);
  note(`✔ Vérification : plus rien pour « ${client} ». Terminé.`);
  try { appendFileSync(`${fichierExport}.suppression.txt`, `${journal.join('\n')}\n`); out(`  Journal enregistré : ${fichierExport}.suppression.txt`); } catch { /* le journal à l'écran suffit */ }
  return 0;
}

// ------------------------------------------------------------------------------------------------ point d'entrée

/**
 * @param {string[]} argv arguments après « node scripts/donnees-client.js »
 * @param {{ out: (l?: string) => void, env?: object, lireLigne?: (question: string) => Promise<string> }} ctx
 */
export async function executerDonneesClient(argv, ctx) {
  try {
    const { positionnels, options } = lireArguments(argv, {
      valeurs: ['sortie', 'export', 'confirmer', 'projet', 'bucket'],
      drapeaux: ['ecrire', 'avec-images', 'aide'],
    });
    if (options.aide || !positionnels.length) { ctx.out(AIDE); return options.aide ? 0 : 1; }
    const [commande, client, ...reste] = positionnels;
    if (!['exporter', 'supprimer'].includes(commande)) throw new ErreurOutil(`Commande inconnue « ${commande} » : exporter ou supprimer.`);
    exigerIdentifiant(client);
    if (reste.length) throw new ErreurOutil(`Argument en trop : « ${reste.join(' ')} ». Un seul client à la fois.`);
    if (commande === 'exporter' && (options.ecrire || options.export || options.confirmer)) throw new ErreurOutil("« exporter » n'accepte pas --ecrire, --export ni --confirmer.");
    if (commande === 'supprimer' && (options.sortie || options['avec-images'])) throw new ErreurOutil("« supprimer » n'accepte pas --sortie ni --avec-images (c'est « exporter » qui les utilise).");
    ctx.cible = cible(options, ctx.env || process.env);
    ctx.ecrire = Boolean(options.ecrire);
    ctx.out(`Base visée : ${ctx.cible.projet} ${ctx.cible.emulateur ? '(ÉMULATEUR de test)' : '(VRAIE base)'} ; stockage : ${ctx.cible.bucket}`);
    ctx.base = ouvrir(ctx.cible);
    return commande === 'exporter' ? await exporter(client, options, ctx) : await supprimer(client, options, ctx);
  } catch (e) {
    const lignes = e instanceof ErreurOutil ? e.messages : traduireErreur(e);
    for (const l of lignes) ctx.out(`✖ ${l}`);
    return 1;
  }
}

/** Lecture d'une ligne au clavier (usage réel) ; null si la fenêtre n'est pas interactive. */
export function lecteurClavier() {
  if (!process.stdin.isTTY) return null;
  return async (question) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try { return await rl.question(question); } finally { rl.close(); }
  };
}
