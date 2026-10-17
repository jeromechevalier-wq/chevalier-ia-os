// Tests de l'import de contacts de prospection (scripts/plateforme/importer-contacts.js, lancé par scripts/importer-contacts-ingrid.mjs).
// ÉMULATEUR Firestore seulement (projet demo-chevalier-ia-os) : jamais la vraie base. FAUX contacts écrits ici : aucune vraie personne.
// Lancé par « npm run test:outil-client ».
import assert from 'node:assert/strict';
import { test, describe, before, after, beforeEach } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { getDocs, collection, setLogLevel } from 'firebase/firestore';
import { executerImport, identifiants, preparerEtiquettes } from '../scripts/plateforme/importer-contacts.js';
import { cible, ouvrir } from '../scripts/plateforme/commun.js';
import { parametresDepart, ETAPES_NEUTRES } from '../js/modules/crm/logique.js';

setLogLevel('error');

const PROJET = 'demo-chevalier-ia-os';
const racine = fileURLToPath(new URL('..', import.meta.url));
const [hoteF, portF] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const ESPACE = 'espace-essai';
const BASE = `clients/${ESPACE}`;
const ALICE = 'alice@exemple.test';
const PROPRIO = 'proprio@exemple.test';

let env;
let admin;
let dossier;

// Faux contacts (inventés pour ce test).
const FAUX = {
  espace: ESPACE,
  contacts: [
    { nom: 'Anne Faux', secteur: 'Boulangerie fictive', telephone: '06 00 00 00 01', mail: 'Anne.Faux@exemple.test', commentaires: ['Premier commentaire  tel quel', 'Deuxième : "avec" des signes — & accents é'], groupe: 'Groupe Un', etape: 'echange_en_cours' },
    { nom: 'Bob Inventé', secteur: 'Menuiserie fictive', telephone: '', mail: '', commentaires: [], groupe: 'Groupe Deux', etape: 'nouveau_contact' },
    { nom: 'Carole Test', secteur: 'Conseil fictif', telephone: '06 00 00 00 03', mail: '', commentaires: ['Un seul'], groupe: 'Groupe Un', etape: 'nouveau_contact' },
  ],
};
const fichierFaux = (donnees = FAUX, nom = 'contacts.json') => { const p = join(dossier, nom); writeFileSync(p, JSON.stringify(donnees)); return p; };

async function lancer(argv) {
  const lignes = [];
  const code = await executerImport(argv, { out: (l = '') => lignes.push(l), env: process.env });
  return { code, texte: lignes.join('\n') };
}
const importer = (f, ...plus) => lancer(['--fichier', f, '--espace', ESPACE, '--proprietaire', PROPRIO, ...plus]);

const lireDoc = async (chemin) => { const s = await admin.db.doc(chemin).get(); return s.exists ? s.data() : null; };
const liste = async (nom) => (await admin.db.collection(`${BASE}/${nom}`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
async function photo() {
  const docs = [];
  const marcher = async (d) => {
    const s = await d.get();
    if (s.exists) docs.push([d.path, JSON.stringify(s.data())]);
    for (const c of await d.listCollections()) for (const x of await c.listDocuments()) await marcher(x);
  };
  for (const r of await admin.db.collection('clients').listDocuments()) await marcher(r);
  return JSON.stringify(docs.sort());
}
const creerEspace = async (modules = { affaires: true, projets: true }) => admin.db.doc(BASE).set({ nom: 'Espace d\'essai', modules });

before(async () => {
  dossier = mkdtempSync(join(tmpdir(), 'import-contacts-'));
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST absent : ces tests ne se lancent que sur l'émulateur");
  assert.equal(cible({}, process.env).emulateur, true);
  admin = ouvrir(cible({}, process.env));
  env = await initializeTestEnvironment({ projectId: PROJET, firestore: { rules: readFileSync(join(racine, 'firestore.plateforme.rules'), 'utf8'), host: hoteF, port: Number(portF) } });
});
after(async () => { await env?.cleanup(); rmSync(dossier, { recursive: true, force: true }); });
beforeEach(async () => { await env.clearFirestore(); });

describe('import de contacts : simulation', () => {
  test("I1 la simulation (par défaut) n'écrit rien, détaille 2 contacts et résume les autres", async () => {
    await creerEspace();
    const avant = await photo();
    const r = await importer(fichierFaux());
    assert.equal(r.code, 0, r.texte);
    assert.equal(await photo(), avant, "la simulation n'a rien écrit");
    assert.match(r.texte, /SIMULATION/);
    assert.match(r.texte, /3 contact\(s\) dans le fichier : 3 à créer, 0 déjà présent/);
    assert.equal((r.texte.match(/──── Contact n° /g) || []).length, 2, 'deux contacts détaillés');
    assert.match(r.texte, new RegExp(`CRÉER ${BASE}/crm_personnes/${identifiants('Anne Faux').personne}`));
    assert.match(r.texte, /3\. Carole Test : \d+ documents/);
    assert.match(r.texte, /Rien n'a été écrit|rien n'a été écrit/);
  });

  test('I2 sans espace dans la base, ou sans le module affaires : refus clair, rien écrit', async () => {
    let r = await importer(fichierFaux());
    assert.equal(r.code, 1);
    assert.match(r.texte, /n'existe pas dans cette base/);
    await creerEspace({ affaires: false, projets: false });
    r = await importer(fichierFaux(), '--ecrire');
    assert.equal(r.code, 1);
    assert.match(r.texte, /module « affaires » n'est pas actif/);
    assert.deepEqual(await liste('crm_personnes'), []);
  });

  test('I3 le mode hors ligne simule sans lire la base ; il refuse --ecrire', async () => {
    const r = await importer(fichierFaux(), '--hors-ligne');
    assert.equal(r.code, 0, r.texte);
    assert.match(r.texte, /Mode hors ligne/);
    const e = await importer(fichierFaux(), '--hors-ligne', '--ecrire');
    assert.equal(e.code, 1);
    assert.match(e.texte, /ne se combine pas avec --ecrire/);
  });
});

describe('import de contacts : écriture', () => {
  test('I4 écrit une personne et une affaire par contact, sans société, avec notes, étiquettes, événements et audit', async () => {
    await creerEspace();
    const r = await importer(fichierFaux(), '--ecrire');
    assert.equal(r.code, 0, r.texte);
    assert.match(r.texte, /3 contact\(s\) créé\(s\), 0 sauté/);
    const id = identifiants('Anne Faux');

    assert.equal((await liste('crm_personnes')).length, 3);
    assert.equal((await liste('crm_affaires')).length, 3);
    assert.equal((await liste('crm_organisations')).length, 0, 'aucune société');
    assert.equal((await liste('crm_activites')).length, 0);

    const p = await lireDoc(`${BASE}/crm_personnes/${id.personne}`);
    assert.equal(p.nom, 'Anne Faux');
    assert.equal(p.prenom, 'Anne');
    assert.equal(p.nomFamille, 'Faux');
    assert.equal(p.organisationId, null);
    assert.deepEqual(p.emails, [{ valeur: 'anne.faux@exemple.test', type: 'travail' }]);
    assert.deepEqual(p.emailsNormalises, ['anne.faux@exemple.test']);
    assert.deepEqual(p.telephones, [{ valeur: '06 00 00 00 01', type: 'travail' }]);
    assert.deepEqual(p.etiquettes, ['groupe_un']);
    assert.equal(p.proprietaire, PROPRIO);
    assert.equal(p.creePar, PROPRIO);
    assert.equal(p.archive, false);
    assert.equal(p.oppositionProspection, false);
    assert.ok(p.creeLe && p.modifieLe);

    const a = await lireDoc(`${BASE}/crm_affaires/${id.affaire}`);
    assert.equal(a.titre, 'Anne Faux');
    assert.equal(a.personneId, id.personne);
    assert.equal(a.organisationId, null);
    assert.equal(a.etape, 'etape_2', '« échange en cours » = la deuxième étape');
    assert.equal(a.statut, 'ouverte');
    assert.equal(a.montant, null);
    assert.equal(a.offreId, null);
    assert.equal(a.raisonPerdue, '');
    assert.equal(a.proprietaire, PROPRIO);
    const b = await lireDoc(`${BASE}/crm_affaires/${identifiants('Bob Inventé').affaire}`);
    assert.equal(b.etape, 'etape_1', '« nouveau contact » = la première étape');
    assert.equal(b.statut, 'ouverte');

    // Notes : secteur puis commentaires recopiés tels quels, sur la personne ET sur l'affaire.
    // Les espaces doubles du premier commentaire sont conservés : on compare avec le texte exact du fichier.
    const exact = `Secteur : Boulangerie fictive\n${FAUX.contacts[0].commentaires.join('\n')}`;
    assert.ok(exact.includes('commentaire  tel quel'));
    const np = await lireDoc(`${BASE}/crm_notes/${id.notePersonne}`);
    const na = await lireDoc(`${BASE}/crm_notes/${id.noteAffaire}`);
    assert.equal(np.texte, exact);
    assert.equal(na.texte, exact);
    assert.deepEqual([np.personneId, np.affaireId], [id.personne, null]);
    assert.deepEqual([na.personneId, na.affaireId], [id.personne, id.affaire]);
    assert.equal(np.auteur, PROPRIO);
    // Bob n'a pas de commentaire : la note ne contient que le secteur.
    assert.equal((await lireDoc(`${BASE}/crm_notes/${identifiants('Bob Inventé').notePersonne}`)).texte, 'Secteur : Menuiserie fictive');
    assert.equal((await liste('crm_notes')).length, 6);

    // Activité de création dans le fil + audit (une ligne et une copie par document).
    const ev = await liste('crm_evenements');
    assert.equal(ev.length, 6);
    assert.deepEqual(ev.map((e) => e.type).sort(), ['affaire_creee', 'affaire_creee', 'affaire_creee', 'personne_creee', 'personne_creee', 'personne_creee']);
    const audit = await liste('crm_audit');
    assert.equal(audit.length, 3 * 6);
    assert.ok(audit.every((l) => l.outil === 'importer-contacts-ingrid' && l.action === 'creer' && l.statut === 'succes' && l.acteur === PROPRIO));
    assert.equal((await liste('crm_audit_avant')).length, 3 * 6);

    // Étiquettes : les deux de départ de l'espace sont gardées, les groupes sont ajoutés.
    const etiq = (await lireDoc(`${BASE}/crm_parametres/etiquettes`)).items;
    assert.deepEqual(etiq.map((e) => e.id), ['prioritaire', 'partenaire', 'groupe_un', 'groupe_deux']);
    assert.ok(etiq.every((e) => /^#[0-9a-f]{6}$/i.test(e.couleur) && e.nom));
  });

  test('I5 relancer ne crée aucun doublon et ne touche à rien', async () => {
    await creerEspace();
    await importer(fichierFaux(), '--ecrire');
    const avant = await photo();
    const r = await importer(fichierFaux(), '--ecrire');
    assert.equal(r.code, 0, r.texte);
    assert.match(r.texte, /0 à créer, 3 déjà présent/);
    assert.match(r.texte, /0 contact\(s\) créé\(s\), 3 sauté/);
    assert.equal(await photo(), avant, 'aucun document créé, modifié ni dupliqué');
  });

  test('I6 une fiche modifiée à la main n\'est jamais écrasée : le contact est sauté et on le dit', async () => {
    await creerEspace();
    await importer(fichierFaux(), '--ecrire');
    const id = identifiants('Anne Faux');
    await admin.db.doc(`${BASE}/crm_personnes/${id.personne}`).update({ ville: 'Modifiée à la main', telephones: [] });
    await admin.db.doc(`${BASE}/crm_notes/${id.notePersonne}`).update({ texte: 'Note réécrite' });
    await admin.db.doc(`${BASE}/crm_affaires/${identifiants('Carole Test').affaire}`).delete(); // une seule fiche manque : tout le contact est sauté
    const r = await importer(fichierFaux(), '--ecrire');
    assert.equal(r.code, 0, r.texte);
    assert.match(r.texte, /Anne Faux : DÉJÀ PRÉSENT/);
    assert.match(r.texte, /Carole Test : DÉJÀ PRÉSENT/);
    assert.equal((await lireDoc(`${BASE}/crm_personnes/${id.personne}`)).ville, 'Modifiée à la main');
    assert.equal((await lireDoc(`${BASE}/crm_notes/${id.notePersonne}`)).texte, 'Note réécrite');
    assert.equal(await lireDoc(`${BASE}/crm_affaires/${identifiants('Carole Test').affaire}`), null, "l'affaire supprimée à la main n'est pas recréée");
  });

  test('I7 les étapes viennent des paramètres de l\'espace (étape 1 désactivée : la première étape active est etape_2)', async () => {
    await creerEspace();
    const etapes = parametresDepart({ racine: false }).etapes;
    etapes.items = etapes.items.map((e) => (e.id === 'etape_1' ? { ...e, actif: false } : e));
    await admin.db.doc(`${BASE}/crm_parametres/etapes`).set(etapes);
    const r = await importer(fichierFaux(), '--ecrire');
    assert.equal(r.code, 0, r.texte);
    assert.match(r.texte, /Étapes lues dans l'espace : « nouveau contact » = etape_2/);
    assert.equal((await lireDoc(`${BASE}/crm_affaires/${identifiants('Bob Inventé').affaire}`)).etape, 'etape_2');
    assert.equal((await lireDoc(`${BASE}/crm_affaires/${identifiants('Anne Faux').affaire}`)).etape, 'etape_3');
  });

  test('I8 une étiquette qui existe déjà (autre casse, sans accent) est reprise, pas dupliquée', async () => {
    await creerEspace();
    await admin.db.doc(`${BASE}/crm_parametres/etiquettes`).set({ items: [{ id: 'g1', nom: 'GROUPE un', couleur: '#111111', ordre: 1 }] });
    await importer(fichierFaux(), '--ecrire');
    const etiq = (await lireDoc(`${BASE}/crm_parametres/etiquettes`)).items;
    assert.deepEqual(etiq.map((e) => e.id), ['g1', 'groupe_deux']);
    assert.deepEqual((await lireDoc(`${BASE}/crm_personnes/${identifiants('Anne Faux').personne}`)).etiquettes, ['g1']);
    // fonction pure : un identifiant déjà pris reçoit un suffixe
    assert.deepEqual(preparerEtiquettes([{ id: 'opco', nom: 'Autre', ordre: 1 }], ['OPCO']).ids, { OPCO: 'opco_2' });
  });

  test("I9 l'import ne touche qu'à l'espace visé", async () => {
    await creerEspace();
    await admin.db.doc('clients/autre-espace').set({ nom: 'Autre', modules: { affaires: true } });
    await admin.db.doc('clients/autre-espace/crm_personnes/x').set({ nom: 'Autre personne' });
    const avant = JSON.stringify((await admin.db.doc('clients/autre-espace').get()).data());
    await importer(fichierFaux(), '--ecrire');
    assert.equal(JSON.stringify((await admin.db.doc('clients/autre-espace').get()).data()), avant);
    assert.equal((await admin.db.collection('clients/autre-espace/crm_personnes').get()).size, 1);
    assert.equal((await admin.db.collection('crm_personnes').get()).size, 0, 'rien à la racine (le CRM de Jérôme)');
    assert.equal((await importer(fichierFaux(), '--projet', 'chevalier-ia-os')).code, 1, 'le projet du CRM de Jérôme est refusé');
  });

  test('I10 un membre de l\'espace lit les fiches importées par les vraies règles ; un étranger est refusé', async () => {
    await creerEspace();
    await admin.db.doc(`${BASE}/membres/${ALICE}`).set({ role: 'editeur' });
    await importer(fichierFaux(), '--ecrire');
    const alice = env.authenticatedContext('u-alice', { email: ALICE, email_verified: true }).firestore();
    const zoe = env.authenticatedContext('u-zoe', { email: 'zoe@exemple.test', email_verified: true }).firestore();
    const lu = await assertSucceeds(getDocs(collection(alice, `${BASE}/crm_personnes`)));
    assert.equal(lu.size, 3);
    await assertSucceeds(getDocs(collection(alice, `${BASE}/crm_notes`)));
    await assertFails(getDocs(collection(zoe, `${BASE}/crm_personnes`)));
  });
});

describe('import de contacts : fichier invalide et sécurité', () => {
  test('I11 un fichier invalide est refusé en entier, avec tous les problèmes, sans rien écrire', async () => {
    await creerEspace();
    const mauvais = { espace: ESPACE, contacts: [{ nom: 'Dup Un', mail: 'pas-un-mail', etape: 'inconnue' }, { nom: 'dup  un' }, { nom: '' }] };
    const r = await importer(fichierFaux(mauvais, 'mauvais.json'), '--ecrire');
    assert.equal(r.code, 1);
    assert.match(r.texte, /pas valide/);
    assert.match(r.texte, /étape « inconnue » inconnue/);
    assert.match(r.texte, /le même nom que le contact n° 1/);
    assert.match(r.texte, /le nom est vide/);
    assert.deepEqual(await liste('crm_personnes'), []);
    assert.equal((await lancer(['--fichier', join(dossier, 'absent.json')])).code, 1);
    assert.equal((await importer(fichierFaux({ ...FAUX, espace: 'autre' }, 'e.json'))).code, 1, 'espace du fichier ≠ --espace');
    assert.equal((await lancer(['--fichier', fichierFaux(), '--ecrie'])).code, 1, 'une faute de frappe sur une option est refusée');
  });

  test('I12 le script ne contient aucune donnée personnelle (adresse e-mail, numéro de téléphone) ni ne lit de fichier du dépôt', () => {
    for (const f of ['scripts/importer-contacts-ingrid.mjs', 'scripts/plateforme/importer-contacts.js', 'tests/importer-contacts.test.js']) {
      const t = readFileSync(join(racine, f), 'utf8');
      const adresses = (t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []).filter((a) => !/@exemple\.test$/.test(a) && a !== 'jerome.chevalier@gmail.com');
      assert.deepEqual(adresses, [], `${f} : adresse e-mail réelle`);
      assert.equal(/\b0[1-9]([ .]?\d{2}){4}\b/.test(t.replace(/06 00 00 00 0\d/g, '')), false, `${f} : numéro de téléphone`);
    }
  });

  test('I13 les étapes de départ du code sont celles que le script suppose (etape_1 = Nouveau contact, etape_2 = Échange en cours)', () => {
    assert.deepEqual(ETAPES_NEUTRES.slice(0, 2).map((e) => [e.id, e.libelle]), [['etape_1', 'Nouveau contact'], ['etape_2', 'Échange en cours']]);
  });
});
