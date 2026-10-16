// Outil « nouveau client » (chantier 13) : crée la fiche de marque, la fiche du client (modules actifs), les membres, et envoie les images.
// Par défaut il SIMULE : il valide tout et affiche exactement ce qui serait écrit. Il n'écrit qu'avec --ecrire.
// Usage et pas à pas : docs/nouveau-client.md. Lancé par Jérôme sur son Mac, avec ses identifiants Google.
import { readFileSync, statSync, existsSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import {
  ErreurOutil, MAX_IMAGES, TAILLE_MAX_IMAGE, cible, exigerIdentifiant, JSON_JOLI, lireArguments, lireMembre, lireModules,
  modulesActifsDe, objetModules, verifierModulesPourClient, ouvrir, urlPublique, verifierCouleur, verifierEmail, verifierListeModules, fichierStorageAutorise,
  prefixeStorage, traduireErreur,
} from './commun.js';
import { IDS_MODULES, identifiantActuel } from '../../js/os/registre.js';

export const AIDE = `Outil « nouveau client » — simule par défaut ; ajouter --ecrire pour écrire vraiment.

Créer un client :
  node scripts/nouveau-client.js <identifiant> --nom "Nom affiché" --couleur "#336699" --accueil "Texte de bienvenue" \\
       --membre prenom@exemple.fr:editeur [--membre autre@exemple.fr:lecteur] --modules affaires,projets,automatisations \\
       [--logo chemin/logo.png] [--images chemin/a.jpg,chemin/b.jpg] [--ecrire]
  Un client qui existe déjà est refusé, sauf avec --mettre-a-jour (seuls les champs écrits dans la commande changent).

Commandes annexes (toutes avec --ecrire pour écrire vraiment) :
  node scripts/nouveau-client.js afficher <identifiant>
  node scripts/nouveau-client.js ajouter-membre <identifiant> adresse:rôle
  node scripts/nouveau-client.js changer-role <identifiant> adresse:rôle
  node scripts/nouveau-client.js retirer-membre <identifiant> adresse
  node scripts/nouveau-client.js activer-module <identifiant> affaires|projets|veille|automatisations
  node scripts/nouveau-client.js desactiver-module <identifiant> affaires|projets|veille|automatisations
  node scripts/nouveau-client.js desactiver-client <identifiant>      (la page du client devient « indisponible »)
  node scripts/nouveau-client.js reactiver-client <identifiant>

Options communes : --projet <projet Firebase> (défaut : chevalier-ia-app) ; --bucket <nom du stockage> ; --hors-ligne (simulation sans rien lire en ligne).`;

const COMMANDES = ['afficher', 'ajouter-membre', 'changer-role', 'retirer-membre', 'activer-module', 'desactiver-module', 'desactiver-client', 'reactiver-client'];
const TYPES_IMAGE = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

function typeReel(octets) {
  const h = (...o) => o.every((v, i) => octets[i] === v);
  if (h(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (h(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (h(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (octets.length > 12 && octets.toString('latin1', 0, 4) === 'RIFF' && octets.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Vérifie un fichier image (existence, extension, taille, contenu réel) ; renvoie { local, extension, type, octets, contenu }. */
export function lireImage(chemin, etiquette) {
  const local = resolve(String(chemin).trim());
  if (!existsSync(local) || !statSync(local).isFile()) throw new ErreurOutil(`${etiquette} : le fichier « ${chemin} » est introuvable.`);
  const extension = extname(local).toLowerCase();
  const type = TYPES_IMAGE[extension];
  if (!type) throw new ErreurOutil(`${etiquette} : « ${basename(local)} » n'est pas une image acceptée (png, jpg, webp ou gif ; pas de svg).`);
  const taille = statSync(local).size;
  if (taille === 0) throw new ErreurOutil(`${etiquette} : « ${basename(local)} » est vide.`);
  if (taille > TAILLE_MAX_IMAGE) throw new ErreurOutil(`${etiquette} : « ${basename(local)} » pèse ${(taille / 1048576).toFixed(1)} Mo ; maximum ${TAILLE_MAX_IMAGE / 1048576} Mo.`);
  const contenu = readFileSync(local);
  const vrai = typeReel(contenu);
  if (vrai !== type) throw new ErreurOutil(`${etiquette} : le contenu de « ${basename(local)} » ne correspond pas à son extension ${extension}.`);
  return { local, extension: extension === '.jpeg' ? '.jpg' : extension, type, octets: taille, contenu };
}

// ------------------------------------------------------------------------------------------------ lecture de l'état

async function lireEtat(ctx, id) {
  const { db } = ctx.base;
  const [marque, client, membres, collections] = await Promise.all([
    db.doc(`marques/${id}`).get(),
    db.doc(`clients/${id}`).get(),
    db.collection(`clients/${id}/membres`).get(),
    db.doc(`clients/${id}`).listCollections(),
  ]);
  return {
    marque: marque.exists ? marque.data() : null,
    client: client.exists ? client.data() : null,
    membres: Object.fromEntries(membres.docs.map((d) => [d.id, d.data()])),
    existe: marque.exists || client.exists || membres.size > 0 || collections.length > 0,
  };
}
const ETAT_VIDE = { marque: null, client: null, membres: {}, existe: false };

async function etat(ctx, id) {
  if (ctx.horsLigne) return ETAT_VIDE;
  return lireEtat(ctx, id);
}

// ------------------------------------------------------------------------------------------------ plan et application

// Comparaison qui ignore l'ordre des clés d'un objet : Firestore range les clés d'une « map » par ordre alphabétique à la relecture
// (les modules affaires, projets, automatisations reviennent dans l'ordre affaires, automatisations, projets).
const triee = (v) => (v && typeof v === 'object' && !Array.isArray(v) && typeof v.toMillis !== 'function'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, triee(v[k])])) : v);
const memes = (a, b) => JSON.stringify(triee(a)) === JSON.stringify(triee(b));

/** Ajoute un document au plan en comparant avec l'existant : CRÉER / MODIFIER / INCHANGÉ. */
function opDoc(plan, chemin, avant, apres, fusion = true) {
  const action = avant == null ? 'CRÉER' : Object.keys(apres).every((k) => memes(avant[k], apres[k])) ? 'INCHANGÉ' : 'MODIFIER';
  plan.docs.push({ chemin, donnees: apres, fusion, action });
}

function afficherPlan(plan, ctx, titre) {
  const { out } = ctx;
  out(`\n${titre}`);
  for (const d of plan.docs) {
    out(`  ${d.action.padEnd(8)} ${d.chemin}`);
    if (d.action !== 'INCHANGÉ') for (const l of JSON_JOLI(d.donnees).split('\n')) out(`             ${l}`);
  }
  for (const f of plan.envois) out(`  ENVOYER  ${f.destination}  (${f.octets} octets, ${f.type})`);
  for (const f of plan.retraits) out(`  RETIRER  ${f} (ancien fichier remplacé)`);
  for (const a of plan.avertissements) out(`  ⚠ ${a}`);
}

async function appliquer(plan, ctx) {
  const { db, bucket } = ctx.base;
  // 1. images d'abord : la fiche de marque ne doit jamais pointer vers un fichier qui n'existe pas.
  for (const f of plan.envois) {
    await bucket.file(f.destination).save(f.contenu, { resumable: false, contentType: f.type, metadata: { cacheControl: 'public, max-age=3600' } });
    ctx.ecrits = (ctx.ecrits || 0) + 1;
    ctx.out(`  ✔ envoyé ${f.destination}`);
  }
  // 2. documents Firestore, en un seul lot (tout ou rien) ; la fiche de marque (qui active la page) en dernier.
  const docs = plan.docs.filter((d) => d.action !== 'INCHANGÉ').sort((a, b) => (a.chemin.startsWith('marques/') ? 1 : 0) - (b.chemin.startsWith('marques/') ? 1 : 0));
  if (docs.length) {
    const lot = db.batch();
    for (const d of docs) {
      if (d.action === 'SUPPRIMER') lot.delete(db.doc(d.chemin));
      else lot.set(db.doc(d.chemin), d.donnees, { merge: d.fusion });
    }
    await lot.commit();
    ctx.ecrits = (ctx.ecrits || 0) + docs.length;
    for (const d of docs) ctx.out(`  ✔ ${{ CRÉER: 'créé', MODIFIER: 'modifié', SUPPRIMER: 'supprimé' }[d.action]} ${d.chemin}`);
  }
  for (const f of plan.retraits) {
    await bucket.file(f).delete({ ignoreNotFound: true });
    ctx.out(`  ✔ retiré ${f}`);
  }
}

function nouveauPlan() { return { docs: [], envois: [], retraits: [], avertissements: [] }; }

/** Termine une commande : affiche le plan puis, selon --ecrire, écrit ou simule. */
async function terminer(plan, ctx, titre) {
  afficherPlan(plan, ctx, titre);
  const rien = plan.docs.every((d) => d.action === 'INCHANGÉ') && !plan.envois.length && !plan.retraits.length;
  if (rien) { ctx.out('\nRien à changer : tout est déjà comme demandé.'); return 0; }
  if (!ctx.ecrire) {
    ctx.out("\nSIMULATION : rien n'a été écrit. Pour écrire vraiment, relancez la même commande avec --ecrire à la fin.");
    return 0;
  }
  ctx.out('\nÉcriture en cours…');
  await appliquer(plan, ctx);
  ctx.out('\nTerminé.');
  return 0;
}

// ------------------------------------------------------------------------------------------------ création / mise à jour

async function creer(id, options, ctx) {
  const erreurs = [];
  const essayer = (f) => { try { return f(); } catch (e) { if (e instanceof ErreurOutil) { erreurs.push(...e.messages); return undefined; } throw e; } };
  const miseAJour = Boolean(options['mettre-a-jour']);

  const nom = options.nom === undefined ? undefined : String(options.nom).trim();
  if (nom !== undefined && (nom === '' || nom.length > 80)) erreurs.push('--nom : entre 1 et 80 caractères.');
  const couleur = options.couleur === undefined ? undefined : essayer(() => verifierCouleur(options.couleur));
  const accueil = options.accueil === undefined ? undefined : String(options.accueil).trim();
  if (accueil !== undefined && accueil.length > 500) erreurs.push(`--accueil : 500 caractères au plus (là : ${accueil.length}).`);
  const modulesDemandes = options.modules === undefined ? undefined : essayer(() => verifierModulesPourClient(id, lireModules(options.modules)));
  const membres = [];
  for (const m of options.membre || []) {
    const lu = essayer(() => lireMembre(m));
    if (!lu) continue;
    if (membres.some((x) => x.email === lu.email)) erreurs.push(`Le membre ${lu.email} est écrit deux fois.`);
    else membres.push(lu);
  }
  const logo = options.logo === undefined ? undefined : essayer(() => lireImage(options.logo, '--logo'));
  const listeImages = options.images === undefined ? undefined : String(options.images).split(',').map((s) => s.trim()).filter(Boolean);
  if (listeImages && listeImages.length > MAX_IMAGES) erreurs.push(`--images : ${MAX_IMAGES} images au plus (là : ${listeImages.length}).`);
  const images = listeImages?.slice(0, MAX_IMAGES).map((c, i) => essayer(() => lireImage(c, `--images n° ${i + 1}`))).filter(Boolean);

  if (!miseAJour) {
    if (nom === undefined) erreurs.push('--nom est obligatoire pour créer un client.');
    if (!options.membre) erreurs.push('Au moins un --membre est obligatoire (sinon personne ne pourrait entrer), par exemple --membre prenom@exemple.fr:editeur');
  }
  if (erreurs.length) throw new ErreurOutil(erreurs);

  const avant = await etat(ctx, id);
  if (avant.existe && !miseAJour) {
    throw new ErreurOutil([`Le client « ${id} » existe déjà : rien n'est écrit.`, 'Pour le modifier, ajoutez --mettre-a-jour (seuls les champs écrits dans la commande changent). Pour voir ce qui existe : afficher ' + id]);
  }
  if (!avant.existe && miseAJour && !ctx.horsLigne) {
    throw new ErreurOutil([`Le client « ${id} » n'existe pas : rien à mettre à jour.`, 'Retirez --mettre-a-jour pour le créer.']);
  }

  const plan = nouveauPlan();
  const bucketNom = ctx.cible.bucket;
  const dossier = prefixeStorage(id);

  // Fiche de marque
  const marque = { actif: true };
  if (nom !== undefined) marque.nom = nom;
  if (couleur !== undefined) marque.couleur = couleur;
  if (accueil !== undefined) marque.accueil = accueil;
  const actuel = avant.marque || {};
  if (logo) {
    const destination = `${dossier}logo${logo.extension}`;
    marque.logo = urlPublique(bucketNom, destination);
    plan.envois.push({ destination, ...logo });
  }
  if (images) {
    marque.images = images.map((img, i) => {
      const destination = `${dossier}image-${i + 1}${img.extension}`;
      plan.envois.push({ destination, ...img });
      return urlPublique(bucketNom, destination);
    });
  }
  if (miseAJour && avant.marque && avant.marque.actif !== true) plan.avertissements.push('Ce client est désactivé : cette commande le réactive (actif: true).');
  opDoc(plan, `marques/${id}`, avant.marque, marque);

  // Fiche du client (nom + modules)
  const fiche = {};
  if (nom !== undefined) fiche.nom = nom;
  if (modulesDemandes !== undefined) fiche.modules = objetModules(modulesDemandes);
  if (!miseAJour && modulesDemandes === undefined) {
    fiche.modules = objetModules([]);
    plan.avertissements.push('Aucun module demandé (--modules) : le client verra seulement l\'accueil provisoire. Ajoutez-en plus tard avec activer-module.');
  }
  if (Object.keys(fiche).length) opDoc(plan, `clients/${id}`, avant.client, fiche);

  // Membres
  for (const m of membres) opDoc(plan, `clients/${id}/membres/${m.email}`, avant.membres[m.email] ?? null, { role: m.role });
  if (!miseAJour && !membres.some((m) => m.role === 'editeur')) plan.avertissements.push('Aucun membre « editeur » : personne ne pourra écrire dans cet espace.');

  // Anciens fichiers remplacés (extension différente ou image en moins)
  if (!ctx.horsLigne && (logo || images)) {
    const [fichiers] = await ctx.base.bucket.getFiles({ prefix: dossier });
    const garder = new Set(plan.envois.map((e) => e.destination));
    for (const f of fichiers) {
      const court = f.name.slice(dossier.length);
      const concerne = (logo && /^logo\./.test(court)) || (images && /^image-\d+\./.test(court));
      if (concerne && !garder.has(f.name) && fichierStorageAutorise(id, f.name)) plan.retraits.push(f.name);
    }
  }

  return terminer(plan, ctx, `${miseAJour ? 'MISE À JOUR' : 'CRÉATION'} du client « ${id} »`);
}

// ------------------------------------------------------------------------------------------------ commandes annexes

async function exigerClient(ctx, id) {
  const e = await lireEtat(ctx, id);
  if (!e.existe) throw new ErreurOutil(`Le client « ${id} » n'existe pas.`);
  return e;
}

async function afficher(id, ctx) {
  const e = await exigerClient(ctx, id);
  const { out } = ctx;
  out(`Client « ${id} »`);
  out(`  Page : ${e.marque ? (e.marque.actif === true ? 'ACTIVE' : 'DÉSACTIVÉE') : 'AUCUNE FICHE DE MARQUE'}  (nom : ${e.marque?.nom ?? '—'}, couleur : ${e.marque?.couleur ?? '—'})`);
  out(`  Logo : ${e.marque?.logo ? 'oui' : 'non'} ; images : ${Array.isArray(e.marque?.images) ? e.marque.images.length : 0}`);
  const actifs = modulesActifsDe(e.client?.modules);
  out(`  Modules actifs : ${actifs.length ? actifs.join(', ') : 'aucun'}`);
  const m = Object.entries(e.membres);
  out(`  Membres (${m.length}) :${m.length ? '' : ' aucun'}`);
  for (const [email, d] of m.sort()) out(`    ${email} — ${d.role}`);
  return 0;
}

async function ajouterMembre(id, texte, ctx, { changer }) {
  const m = lireMembre(texte);
  const e = await exigerClient(ctx, id);
  const actuel = e.membres[m.email];
  if (changer && !actuel) throw new ErreurOutil(`${m.email} n'est pas membre de « ${id} » : utilisez ajouter-membre.`);
  if (!changer && actuel && actuel.role !== m.role) throw new ErreurOutil(`${m.email} est déjà membre de « ${id} » avec le rôle « ${actuel.role} » : utilisez changer-role pour le modifier.`);
  const plan = nouveauPlan();
  opDoc(plan, `clients/${id}/membres/${m.email}`, actuel ?? null, { role: m.role });
  return terminer(plan, ctx, `${changer ? 'CHANGEMENT DE RÔLE' : 'AJOUT D\'UN MEMBRE'} chez « ${id} »`);
}

async function retirerMembre(id, texte, ctx) {
  const email = verifierEmail(texte);
  const e = await exigerClient(ctx, id);
  if (!e.membres[email]) throw new ErreurOutil(`${email} n'est pas membre de « ${id} » : rien à retirer.`);
  const autresEditeurs = Object.entries(e.membres).filter(([a, d]) => a !== email && d.role === 'editeur');
  const plan = nouveauPlan();
  plan.docs.push({ chemin: `clients/${id}/membres/${email}`, donnees: e.membres[email], fusion: false, action: 'SUPPRIMER' });
  if (e.membres[email].role === 'editeur' && !autresEditeurs.length) plan.avertissements.push("C'est le dernier éditeur : après ça, personne ne pourra plus écrire dans cet espace.");
  plan.avertissements.push(`${email} perd l'accès tout de suite.`);
  return terminer(plan, ctx, `RETRAIT D'UN MEMBRE de « ${id} »`);
}

async function changerModule(id, moduleDemande, ctx, activer) {
  const module = identifiantActuel(moduleDemande); // ancien nom « journal » accepté
  if (!IDS_MODULES.includes(module)) throw new ErreurOutil(`Module inconnu : « ${module} ». Modules connus : ${IDS_MODULES.join(', ')}.`);
  const e = await exigerClient(ctx, id);
  const actuels = modulesActifsDe(e.client?.modules);
  const voulus = activer ? [...new Set([...actuels, module])] : actuels.filter((m) => m !== module);
  const liste = verifierListeModules(voulus); // projets exige affaires, y compris quand on désactive affaires
  if (activer) verifierModulesPourClient(id, liste); // automatisations : identifiant de 17 caractères au plus
  const plan = nouveauPlan();
  opDoc(plan, `clients/${id}`, e.client, { modules: objetModules(liste) });
  return terminer(plan, ctx, `${activer ? 'ACTIVATION' : 'DÉSACTIVATION'} du module « ${module} » chez « ${id} »`);
}

async function activerClient(id, ctx, actif) {
  const e = await exigerClient(ctx, id);
  if (!e.marque) throw new ErreurOutil(`« ${id} » n'a pas de fiche de marque (marques/${id}) : rien à ${actif ? 'réactiver' : 'désactiver'}.`);
  const plan = nouveauPlan();
  opDoc(plan, `marques/${id}`, e.marque, { actif });
  if (!actif) plan.avertissements.push('La page du client devient « indisponible ». Ses données et ses membres ne sont pas effacés.');
  return terminer(plan, ctx, `${actif ? 'RÉACTIVATION' : 'DÉSACTIVATION'} du client « ${id} »`);
}

// ------------------------------------------------------------------------------------------------ point d'entrée

/**
 * Exécute l'outil. `ctx.out` reçoit les lignes affichées. Renvoie le code de sortie (0 = bien, 1 = refus ou erreur).
 * @param {string[]} argv arguments après « node scripts/nouveau-client.js »
 * @param {{ out: (l?: string) => void, env?: object }} ctx
 */
export async function executerNouveauClient(argv, ctx) {
  try {
    const { positionnels, options } = lireArguments(argv, {
      valeurs: ['nom', 'couleur', 'accueil', 'modules', 'logo', 'images', 'projet', 'bucket'],
      repetables: ['membre'],
      drapeaux: ['ecrire', 'mettre-a-jour', 'hors-ligne', 'aide'],
    });
    if (options.aide || !positionnels.length) { ctx.out(AIDE); return options.aide ? 0 : 1; }
    const commande = COMMANDES.includes(positionnels[0]) ? positionnels[0] : null;
    const id = exigerIdentifiant(commande ? positionnels[1] : positionnels[0]);
    const reste = positionnels.slice(commande ? 2 : 1);
    if (!commande && reste.length) throw new ErreurOutil(`Argument en trop : « ${reste.join(' ')} ». Les options commencent par --.`);
    if (commande && (options.nom || options.membre || options.logo || options.images || options.modules || options.couleur || options.accueil || options['mettre-a-jour'])) {
      throw new ErreurOutil(`« ${commande} » n'accepte pas les options de création (--nom, --membre…). Voir --aide.`);
    }
    const attendus = { afficher: 0, 'ajouter-membre': 1, 'changer-role': 1, 'retirer-membre': 1, 'activer-module': 1, 'desactiver-module': 1, 'desactiver-client': 0, 'reactiver-client': 0 };
    if (commande && reste.length !== attendus[commande]) throw new ErreurOutil(`« ${commande} ${id} » attend ${attendus[commande]} argument(s) de plus (voir --aide).`);

    ctx.cible = cible(options, ctx.env || process.env);
    ctx.ecrire = Boolean(options.ecrire);
    ctx.horsLigne = Boolean(options['hors-ligne']);
    if (ctx.horsLigne && (ctx.ecrire || commande)) throw new ErreurOutil('--hors-ligne ne sert qu\'à simuler une création : il ne se combine pas avec --ecrire ni avec une commande annexe.');
    ctx.out(`Base visée : ${ctx.cible.projet} ${ctx.cible.emulateur ? '(ÉMULATEUR de test)' : '(VRAIE base)'} ; stockage : ${ctx.cible.bucket}`);
    if (!ctx.horsLigne) ctx.base = ouvrir(ctx.cible);
    else ctx.out('Mode hors ligne : rien n\'est lu en ligne, on ne vérifie donc pas si le client existe déjà.');

    if (!commande) return await creer(id, options, ctx);
    switch (commande) {
      case 'afficher': return await afficher(id, ctx);
      case 'ajouter-membre': return await ajouterMembre(id, reste[0], ctx, { changer: false });
      case 'changer-role': return await ajouterMembre(id, reste[0], ctx, { changer: true });
      case 'retirer-membre': return await retirerMembre(id, reste[0], ctx);
      case 'activer-module': return await changerModule(id, reste[0], ctx, true);
      case 'desactiver-module': return await changerModule(id, reste[0], ctx, false);
      case 'desactiver-client': return await activerClient(id, ctx, false);
      case 'reactiver-client': return await activerClient(id, ctx, true);
      default: return 1;
    }
  } catch (e) {
    const lignes = e instanceof ErreurOutil ? e.messages : traduireErreur(e);
    for (const l of lignes) ctx.out(`✖ ${l}`);
    ctx.out(ctx.ecrits ? 'Attention : une partie a déjà été écrite (lignes « ✔ » ci-dessus). Relancez après correction : l\'outil reprend sans rien dupliquer.' : "Rien n'a été écrit.");
    return 1;
  }
}
