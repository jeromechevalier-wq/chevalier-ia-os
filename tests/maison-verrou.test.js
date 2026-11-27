// Verrou du chantier 0 (25/11/2026) : aucun nom de projet, adresse de fonction, réserve de fichiers, compte de service, adresse de n8n ni compte de Jérôme
// n'est écrit en dur dans le code qui tourne côté serveur et dans les règles. Le même code doit pouvoir s'installer dans N projets Google (« maisons »).
// Périmètre : functions/src, functions-plateforme/src, scripts/porte (copié dans le serveur), firestore*.rules, storage*.rules, et le navigateur js/ (partie navigateur,
// 26/11/2026 : configuration lue dans /__/firebase/init.json, comptes et noms lus dans reglages_maison/ecran et /public).
// Les commentaires sont ignorés (ils peuvent citer un exemple d'adresse). Les motifs sont précis : un nom de projet seul (nom du serveur MCP vu par les
// assistants, functions/src/mcp/gestionnaire.js et mcp/outils/identite.js ; source des SMS, coeur/sms-direct.js) n'est PAS visé, il ne désigne aucune adresse.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPTE_JEROME, COMPTE_BOT, HOTE_N8N_ESSAI } from './_reglages-maison-essai.js';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const DOSSIERS = ['functions/src', 'functions-plateforme/src', 'scripts/porte', 'js'];
const DOSSIERS_SERVEUR = DOSSIERS.filter((d) => d !== 'js');
const REGLES = readdirSync(RACINE).filter((f) => /^(firestore|storage).*\.rules$/.test(f));

function fichiers(dossier) {
  const sortie = [];
  for (const nom of readdirSync(join(RACINE, dossier))) {
    const chemin = join(dossier, nom);
    if (statSync(join(RACINE, chemin)).isDirectory()) sortie.push(...fichiers(chemin));
    else if (/\.(js|mjs|cjs)$/.test(nom)) sortie.push(chemin);
  }
  return sortie;
}

// Le texte sans ses commentaires (lignes de commentaire, blocs « barre-étoile », fins de ligne « // … » hors des chaînes).
export function sansCommentaires(texte) {
  const sansBlocs = texte.replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '));
  return sansBlocs.split('\n').map((ligne) => {
    if (/^\s*\/\//.test(ligne)) return '';
    for (let i = ligne.indexOf(' //'); i !== -1; i = ligne.indexOf(' //', i + 1)) {
      const avant = ligne.slice(0, i);
      const pair = (c) => (avant.split(c).length - 1) % 2 === 0;
      if (pair("'") && pair('"') && pair('`')) return avant;
    }
    return ligne;
  }).join('\n');
}

const echapper = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const MOTIFS_INTERDITS = [
  { nom: 'adresse dérivée d\'un nom de projet', motif: /chevalier-ia-(os|app)\.(web\.app|firebaseapp\.com|firebasestorage\.app|iam\.gserviceaccount\.com|cloudfunctions\.net|appspot\.com)/ },
  // Dans js/, « projet: » est un mot de l'écran (« ce projet ») : seul « projectId: » y est visé (motifJs).
  { nom: 'projet écrit en dur (projectId / projet)', motif: /\b(projectId|projet)\s*:\s*['"`][a-z]/, motifJs: /\bprojectId\s*:\s*['"`][a-z]/ },
  { nom: 'projet par défaut', motif: /\|\|\s*['"`]chevalier-ia-/ },
  { nom: 'compte de Jérôme', motif: new RegExp(echapper(COMPTE_JEROME), 'i') },
  { nom: 'compte du bot', motif: new RegExp(echapper(COMPTE_BOT), 'i') },
  { nom: 'adresse Gmail', motif: /[A-Za-z0-9._%+-]+@gmail\.com/ },
  { nom: 'hôte du n8n', motif: new RegExp(echapper(HOTE_N8N_ESSAI), 'i') },
  { nom: 'compte de service complet', motif: /@[a-z0-9-]+\.iam\.gserviceaccount\.com/ },
];

/**
 * Exceptions écrites et commentées : [fichier, motif, texte exact toléré, raison].
 * Une exception qui ne sert plus fait échouer le test (elle doit être retirée).
 */
export const EXCEPTIONS = [
  ['functions-plateforme/src/espace.js', 'adresse Gmail', 'prenom@gmail.com', 'exemple d\'adresse dans un message d\'erreur montré au client (« par exemple prenom@gmail.com »)'],  // Seule exception de la nuit du 25/11/2026 : baseAccorderAcces tourne sous base-acces@, qui n'a aucun droit de lecture Firestore ; elle garde donc
  // sa liste « Jérôme seul » écrite dans le code, comme sur main, en attente de l'accord de Jérôme pour le droit de lecture de base-acces@ (fiche reglages_maison).
  ['functions/src/base/acces-appel.js', 'compte de Jérôme', COMPTE_JEROME, 'en attente de l\'accord de Jérôme pour le droit de lecture de base-acces@'],
  ['functions/src/base/acces-appel.js', 'adresse Gmail', COMPTE_JEROME, 'en attente de l\'accord de Jérôme pour le droit de lecture de base-acces@'],
  // Navigateur (26/11/2026). Fichiers partagés avec le serveur (copiés par scripts/preparer-fonctions.js) : on n'y touche pas la nuit, PR de jour.
  ['js/modules/crm/logique.js', 'compte de Jérôme', COMPTE_JEROME, 'fichier partagé avec le serveur, PR de jour (MEMBRES_JEROME, noms du journal)'],
  ['js/modules/crm/logique.js', 'compte du bot', COMPTE_BOT, 'fichier partagé avec le serveur, PR de jour (MEMBRES_JEROME, noms du journal)'],
  ['js/modules/crm/logique.js', 'adresse Gmail', COMPTE_JEROME, 'fichier partagé avec le serveur, PR de jour (MEMBRES_JEROME, noms du journal)'],
  ['js/modules/crm/logique.js', 'adresse Gmail', COMPTE_BOT, 'fichier partagé avec le serveur, PR de jour (MEMBRES_JEROME)'],
  ['js/modules/crm/logique.js', 'adresse Gmail', `GoogleDrive-${COMPTE_JEROME}`, 'fichier partagé avec le serveur, PR de jour (ancien chemin Drive, plus utilisé)'],
  ['js/modules/rdv/logique.js', 'adresse dérivée d\'un nom de projet', 'chevalier-ia-os.web.app', 'fichier partagé avec le serveur, PR de jour (adresse d\'exemple des SMS)'],
  ['js/modules/rdv/logique.js', 'adresse dérivée d\'un nom de projet', 'chevalier-ia-app.web.app', 'fichier partagé avec le serveur, PR de jour (adresse d\'exemple des SMS)'],
  ['js/os/mon-espace.js', 'adresse Gmail', 'prenom@gmail.com', 'exemple d\'adresse dans l\'aide de « Mon espace » (« par exemple prenom@gmail.com »)'],
];

const aVerifier = [...DOSSIERS.flatMap(fichiers), ...REGLES];

describe('Chantier 0 : rien de propre à une maison dans le code du serveur et dans les règles', () => {
  test('MV1 aucun motif interdit (adresse de projet, projet en dur, projet par défaut, comptes de Jérôme, Gmail, n8n, compte de service complet)', () => {
    assert.ok(aVerifier.length > 300, `périmètre trop petit : ${aVerifier.length} fichiers`);
    assert.ok(aVerifier.some((f) => f.startsWith('js/')), 'le navigateur est dans le périmètre');
    const trouves = [];
    const exceptionsVues = new Set();
    for (const f of aVerifier) {
      const lignes = sansCommentaires(readFileSync(join(RACINE, f), 'utf8')).split('\n');
      lignes.forEach((ligne, i) => {
        for (const { nom, motif, motifJs } of MOTIFS_INTERDITS) {
          const m = ligne.match(f.startsWith('js/') && motifJs ? motifJs : motif);
          if (!m) continue;
          const exception = EXCEPTIONS.find(([fe, ne, texte]) => fe === f && ne === nom && ligne.includes(texte) && m[0] === texte);
          if (exception) { exceptionsVues.add(exception); continue; }
          trouves.push(`${f}:${i + 1} (${nom})`);
        }
      });
    }
    assert.deepEqual(trouves, [], `écrit en dur :\n${trouves.join('\n')}`);
    for (const e of EXCEPTIONS) assert.ok(exceptionsVues.has(e), `exception inutile, à retirer : ${e[0]} (${e[2]})`);
  });

  test('MV2 le détecteur voit bien ce qu\'il doit voir (sinon MV1 ne prouverait rien) et ignore les commentaires', () => {
    const vus = (t) => MOTIFS_INTERDITS.filter(({ motif }) => motif.test(sansCommentaires(t))).map((m) => m.nom);
    assert.deepEqual(vus("const a = 'https://chevalier-ia-os.web.app';"), ['adresse dérivée d\'un nom de projet']);
    assert.deepEqual(vus("serviceAccount: 'porte-serveur@chevalier-ia-app.iam.gserviceaccount.com',"), ['adresse dérivée d\'un nom de projet', 'compte de service complet']);
    assert.deepEqual(vus("initializeApp({ projectId: 'un-projet' });"), ['projet écrit en dur (projectId / projet)']);
    assert.deepEqual(vus("const p = process.env.GCLOUD_PROJECT || 'chevalier-ia-os';"), ['projet par défaut']);
    assert.deepEqual(vus(`const e = '${COMPTE_JEROME}';`), ['compte de Jérôme', 'adresse Gmail']);
    assert.deepEqual(vus(`const u = 'https://${HOTE_N8N_ESSAI}';`), ['hôte du n8n']);
    assert.deepEqual(vus("// https://chevalier-ia-os.web.app/mcp (commentaire)\nconst x = 1; // https://chevalier-ia-app.web.app"), []);
    assert.deepEqual(vus("/* https://chevalier-ia-os.web.app */ const y = 2;"), []);
    assert.deepEqual(vus("const s = 'a // https://chevalier-ia-os.web.app';"), ['adresse dérivée d\'un nom de projet'], 'un « // » dans une chaîne n\'est pas un commentaire');
    assert.deepEqual(vus("export const NOM_SERVEUR_CRM = 'chevalier-ia-os';"), [], 'le nom du serveur MCP (vu par les assistants) reste permis');
    assert.deepEqual(vus("initializeApp({ projectId: projet }, 'plateforme');"), [], 'un projet lu dans une variable est permis');
    // Navigateur (26/11/2026) : dans js/, seul « projectId: » compte comme projet écrit en dur (« projet: 'ce projet' » est un texte de l'écran).
    const motifProjet = MOTIFS_INTERDITS.find((m) => m.motifJs);
    assert.ok(motifProjet.motifJs.test('export const firebaseConfig = { projectId: "un-projet" };'));
    assert.ok(!motifProjet.motifJs.test("const GENRE = { affaire: 'cette affaire', projet: 'ce projet' };"));
    assert.ok(motifProjet.motif.test("const GENRE = { projet: 'ce projet' };"), 'côté serveur, le motif large reste');
  });

  test('MV3 comptes de service : calculés par compteDeService(\'nom\') (adresse complète dans le projet courant), jamais écrits en dur ni en raccourci « nom@ »', () => {
    for (const f of ['functions/src/index.js', 'functions-plateforme/src/index.js']) {
      const t = sansCommentaires(readFileSync(join(RACINE, f), 'utf8'));
      const declarations = [...t.matchAll(/(?:serviceAccount:|const COMPTE_[A-Z_]+ =)\s*([^,}\n;]+)/g)].map((m) => m[1].trim());
      assert.ok(declarations.length >= 3, `${f} : comptes de service introuvables`);
      for (const d of declarations) {
        if (/^(COMPTE_[A-Z_]+|[A-Z_]+\.serviceAccount)$/.test(d)) continue; // renvoi à une constante ou à des options, elles-mêmes vérifiées ici
        assert.match(d, /^compteDeService\('[a-z][a-z0-9-]{4,28}'\)$/, `${f} : ${d}`);
      }
      assert.doesNotMatch(t, /'[a-z][a-z0-9-]*@'/, `${f} : raccourci « nom@ » interdit (firebase-tools ne le complète pas pour les secrets ni Cloud Scheduler)`);
    }
  });

  test('MV4 la source « pour les essais » de la fiche n\'est jamais appelée par le serveur ; le serveur ne lit plus js/os/administrateur.js', () => {
    for (const f of DOSSIERS_SERVEUR.flatMap(fichiers)) {
      const t = readFileSync(join(RACINE, f), 'utf8');
      if (f === 'functions/src/securite/reglages-maison.js') continue;
      assert.doesNotMatch(t, /remplacerSourcePourEssais/, f);
      assert.doesNotMatch(t, /administrateur\.js'/, `${f} : « Jérôme seul » se lit dans la fiche (estJeromeSeul), plus dans js/os/administrateur.js`);
    }
    assert.doesNotMatch(readFileSync(join(RACINE, 'scripts/preparer-fonctions.js'), 'utf8'), /copyFileSync\([^)]*administrateur\.js/);
    if (existsSync(join(RACINE, 'functions/partage'))) assert.ok(!existsSync(join(RACINE, 'functions/partage/administrateur.js')), 'ancienne copie retirée par preparer-fonctions.js');
  });

  test('MV5 la fiche reglages_maison est fermée au navigateur dans les deux jeux de règles (maison : seuls le nom et le logo de « public » ; plateforme : tout refusé par défaut)', () => {
    const r = readFileSync(join(RACINE, 'firestore.rules'), 'utf8');
    // Une seule écriture permise depuis un navigateur (27/11/2026, Mon espace d'une maison de client) : MODIFIER le nom et le logo de `public`, par un compte de la maison
    // (compteAutorise ; plus seulement le titulaire depuis le 27/11/2026, accord de Jérôme), contrôlée par identiteMaisonValide (deux champs seulement + la ligne de journal
    // obligatoire, jamais chez Jérôme). `maison` et `ecran` ne s'écrivent jamais ; ni création, ni suppression, ni liste.
    assert.match(r, /match \/reglages_maison\/\{id\} \{\s+allow get: if id == 'public' \|\| \(id == 'ecran' && compteAutorise\(\)\);\s+allow update: if id == 'public' && compteAutorise\(\) && identiteMaisonValide\(\);\s+allow list, create, delete: if false;\s+\}/);
    assert.match(r, /return apres\.diff\(avant\)\.affectedKeys\(\)\.hasOnly\(\['nom_espace', 'logo', 'ligne_journal'\]\)\s+&& \(avant\.get\('nom_espace', ''\) != '' \|\| avant\.get\('connexion_neutre', false\) == true\)/);
    assert.match(r, /\s+&& identiteMaisonJournalisee\(apres\);\s+\}/, 'journal obligatoire, contrôlé en dernier');
    assert.equal((r.match(/reglages_maison\/\{id\}/g) || []).length, 1, 'un seul bloc pour reglages_maison');
    const p = sansCommentaires(readFileSync(join(RACINE, 'firestore.plateforme.rules'), 'utf8'));
    assert.doesNotMatch(p, /reglages_maison/, 'la plateforme ne l\'ouvre jamais : elle tombe dans le refus par défaut');
    assert.match(p, /match \/\{document=\*\*\} \{\s+allow read, write: if false;/);
    assert.ok(relative(RACINE, join(RACINE, 'storage.plateforme.rules')) && !/reglages_maison/.test(readFileSync(join(RACINE, 'storage.plateforme.rules'), 'utf8')));
  });
});
