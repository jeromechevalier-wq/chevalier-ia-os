// « Mon espace » (2.9.0), côté serveur : la fonction appelable espaceReglages (functions-plateforme/src/espace.js).
// ÉMULATEUR Firestore + FAUX bucket Storage (db et bucket sont injectés). Les critères M11 et M16 de la recette sont ici (M11, M16) ; les autres sont dans tests/e2e/mon-espace.spec.js.
import assert from 'node:assert/strict';
import { test, describe, before, beforeEach } from 'node:test';
import { createRequire } from 'node:module';

process.env.GCLOUD_PROJECT = 'demo-chevalier-ia-os';
const requireFn = createRequire(new URL('../functions-plateforme/package.json', import.meta.url));
const { initializeApp, getApps } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
const E = await import('../functions-plateforme/src/espace.js');
const { Refus } = await import('../functions-plateforme/src/appels.js');

if (!getApps().length) initializeApp({ projectId: 'demo-chevalier-ia-os' });
const db = getFirestore();
const BUCKET = 'chevalier-ia-app.firebasestorage.app';

const ALICE = 'alice@exemple.test'; // éditrice chez audrey
const LEA = 'lea@exemple.test'; // lectrice chez audrey
const BOB = 'bob@exemple.test'; // éditeur chez boris (et second éditeur d'audrey dans certains tests)
const ZOE = 'zoe@exemple.test'; // éditrice d'un espace désactivé
const INCONNU = 'inconnu@exemple.test';
const id = (email, verifie = true) => ({ uid: `uid-${email}`, token: { email, email_verified: verifie } });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]), Buffer.from('JFIF'), Buffer.alloc(20)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([30, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(20)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const img = (octets) => ({ donnees: octets.toString('base64') });

/** Faux bucket : garde les fichiers en mémoire, note chaque envoi et chaque suppression ; on peut le faire échouer. */
function fauxBucket() {
  const b = { name: BUCKET, fichiers: new Map(), journal: [], panneEnvoi: false };
  b.file = (chemin) => ({
    save: async (octets, options) => { if (b.panneEnvoi) throw new Error('Envoi impossible'); b.fichiers.set(chemin, { octets, options }); b.journal.push(['envoi', chemin]); },
    delete: async () => { b.fichiers.delete(chemin); b.journal.push(['suppression', chemin]); },
  });
  return b;
}

const lire = async (chemin) => { const s = await db.doc(chemin).get(); return s.exists ? s.data() : null; };
const refus = async (promesse, code) => {
  try { await promesse; } catch (e) { assert.ok(e instanceof Refus, String(e?.stack || e)); if (code) assert.equal(e.code, code); return e; }
  assert.fail('un refus était attendu');
};
let bucket;
let t = 1760000000000;
const appel = (email, donnees, extra = {}) => E.reglerEspace({ db, bucket, nomBucket: BUCKET, auth: email ? id(email) : null, donnees, maintenant: (t += 1000), ...extra });
const MARQUE = { actif: true, nom: 'Atelier Audrey', couleur: '#336699', accueil: 'Bienvenue.', logo: null, images: [] };

before(async () => { assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'émulateur Firestore requis'); });
beforeEach(async () => {
  const r = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-chevalier-ia-os/databases/(default)/documents`, { method: 'DELETE' });
  assert.ok(r.ok);
  bucket = fauxBucket();
  await db.doc('marques/audrey').set({ ...MARQUE });
  await db.doc('marques/boris').set({ ...MARQUE, nom: 'Boris et Cie' });
  await db.doc('marques/ferme').set({ ...MARQUE, actif: false, nom: 'Fermé' });
  await db.doc('clients/audrey').set({ nom: 'Atelier Audrey', modules: { affaires: true }, equipe: [{ email: ALICE, role: 'editeur' }, { email: LEA, role: 'lecteur' }] });
  await db.doc('clients/boris').set({ nom: 'Boris et Cie', modules: {}, equipe: [{ email: BOB, role: 'editeur' }] });
  await db.doc('clients/ferme').set({ nom: 'Fermé', modules: {} });
  await db.doc(`clients/audrey/membres/${ALICE}`).set({ role: 'editeur', nom: 'Alice' });
  await db.doc(`clients/audrey/membres/${LEA}`).set({ role: 'lecteur' });
  await db.doc(`clients/boris/membres/${BOB}`).set({ role: 'editeur' });
  await db.doc(`clients/ferme/membres/${ZOE}`).set({ role: 'editeur' });
});

describe('M11 sécurité d\'appel : un seul refus neutre, la fiche ne bouge pas', () => {
  const NEUTRE = 'Action non autorisée.';
  const tentatives = [
    ['un lecteur', LEA, 'audrey'],
    ['un inconnu', INCONNU, 'audrey'],
    ['un éditeur d\'un autre espace', BOB, 'audrey'],
    ['un espace qui n\'existe pas', ALICE, 'fantome'],
    ['un espace désactivé', ZOE, 'ferme'],
  ];
  for (const [quoi, email, client] of tentatives) {
    test(`M11 ${quoi} reçoit « ${NEUTRE} » et rien n'est écrit`, async () => {
      const avant = [await lire('marques/audrey'), await lire('clients/audrey'), await lire('marques/ferme')];
      const e = await refus(appel(email, { client, action: 'enregistrer', nom: 'Pirate', couleur: '#ff0000', logo: img(PNG) }), 'permission-denied');
      assert.equal(e.message, NEUTRE);
      for (const action of ['image-ajouter', 'image-retirer', 'image-premiere', 'membre-ajouter', 'membre-role', 'membre-retirer']) {
        const e2 = await refus(appel(email, { client, action, image: img(PNG), url: 'x', email: 'a@b.fr', role: 'editeur' }), 'permission-denied');
        assert.equal(e2.message, NEUTRE, action);
      }
      assert.deepEqual([await lire('marques/audrey'), await lire('clients/audrey'), await lire('marques/ferme')], avant);
      assert.deepEqual(bucket.journal, []);
    });
  }
  test('M11 sans connexion, ou avec une adresse non vérifiée : refusé avant tout', async () => {
    await refus(appel(null, { client: 'audrey', action: 'enregistrer', nom: 'X' }), 'unauthenticated');
    await refus(E.reglerEspace({ db, bucket, auth: id(ALICE, false), donnees: { client: 'audrey', action: 'enregistrer', nom: 'X' } }), 'unauthenticated');
    assert.equal((await lire('marques/audrey')).nom, 'Atelier Audrey');
  });
  test('M11 l\'identifiant d\'espace reçu est une cible : motif strict, jamais de chemin', async () => {
    for (const client of ['../clients/audrey', 'audrey/membres', 'AUDREY', '', null, 12, 'a'.repeat(41), 'audrey ']) {
      const e = await refus(appel(ALICE, { client, action: 'enregistrer', nom: 'X' }), 'permission-denied');
      assert.equal(e.message, NEUTRE, 'même refus neutre pour un identifiant mal formé');
    }
  });
  for (const [quoi, donnees] of [
    ['réglages (logo)', { action: 'enregistrer', nom: 'Après retrait', logo: img(PNG) }],
    ['image', { action: 'image-ajouter', image: img(PNG) }],
  ]) {
    test(`M11 un éditeur retiré PENDANT l'envoi (${quoi}) : l'écriture finale est refusée (refus neutre), la fiche ne bouge pas, le fichier envoyé est supprimé`, async () => {
      await db.doc(`clients/audrey/membres/${BOB}`).set({ role: 'editeur' }); // un second éditeur, pour que ce retrait soit permis
      const envoi = bucket.file;
      bucket.file = (chemin) => ({ ...envoi(chemin), save: async (...a) => { await envoi(chemin).save(...a); await db.doc(`clients/audrey/membres/${ALICE}`).delete(); } }); // Alice est retirée pendant l'envoi
      const avant = await lire('marques/audrey');
      const e = await refus(appel(ALICE, { client: 'audrey', ...donnees }), 'permission-denied');
      assert.equal(e.message, NEUTRE);
      assert.deepEqual(await lire('marques/audrey'), avant);
      assert.equal(bucket.fichiers.size, 0, 'le fichier envoyé est supprimé');
    });
  }
  test('M11 un éditeur rétrogradé en lecteur pendant un retrait ou une mise en première d\'image : refusé aussi', async () => {
    await db.doc('marques/audrey').update({ images: [E.urlPublique(BUCKET, 'marques/audrey/image-1.png'), E.urlPublique(BUCKET, 'marques/audrey/image-2.png')] });
    const [a, b] = (await lire('marques/audrey')).images;
    await db.doc(`clients/audrey/membres/${ALICE}`).update({ role: 'lecteur' });
    const e = await refus(E.reglerEspace({ db, bucket, auth: id(ALICE), donnees: { client: 'audrey', action: 'image-premiere', url: b }, maintenant: 1 }), 'permission-denied');
    assert.equal(e.message, NEUTRE);
    assert.deepEqual((await lire('marques/audrey')).images, [a, b]);
  });
});

describe('Marque : nom, couleur, texte d\'accueil', () => {
  test('un éditeur change le nom : marques ET clients.nom ; les autres champs ne bougent pas', async () => {
    const r = await appel(ALICE, { client: 'audrey', action: 'enregistrer', nom: '  Atelier   Ingrid ' });
    assert.equal(r.marque.nom, 'Atelier Ingrid');
    assert.deepEqual(await lire('marques/audrey'), { ...MARQUE, nom: 'Atelier Ingrid' });
    const c = await lire('clients/audrey');
    assert.equal(c.nom, 'Atelier Ingrid');
    assert.deepEqual(c.modules, { affaires: true }, 'les modules ne sont jamais touchés');
  });
  test('chaque appel n\'écrit que les champs envoyés ; « actif » et « modules » ne s\'écrivent jamais, même demandés', async () => {
    await appel(ALICE, { client: 'audrey', action: 'enregistrer', couleur: '#AABBCC', actif: false, modules: { crm: true }, equipe: [] });
    assert.deepEqual(await lire('marques/audrey'), { ...MARQUE, couleur: '#aabbcc' });
    assert.deepEqual((await lire('clients/audrey')).modules, { affaires: true });
    assert.equal((await lire('clients/audrey')).equipe.length, 2);
  });
  test('une couleur très pâle est acceptée telle quelle (la page la corrige à l\'affichage) ; #abc devient #aabbcc', async () => {
    await appel(ALICE, { client: 'audrey', action: 'enregistrer', couleur: '#ffffff' });
    assert.equal((await lire('marques/audrey')).couleur, '#ffffff');
    await appel(ALICE, { client: 'audrey', action: 'enregistrer', couleur: '#abc' });
    assert.equal((await lire('marques/audrey')).couleur, '#aabbcc');
  });
  test('validation : nom vide ou trop long, couleur fausse, accueil trop long, rien à enregistrer', async () => {
    const ecrit = (d) => appel(ALICE, { client: 'audrey', action: 'enregistrer', ...d });
    await refus(ecrit({ nom: '   ' }), 'invalid-argument');
    await refus(ecrit({ nom: 'x'.repeat(81) }), 'invalid-argument');
    await refus(ecrit({ nom: 12 }), 'invalid-argument');
    await refus(ecrit({ couleur: 'rouge' }), 'invalid-argument');
    await refus(ecrit({ couleur: 'url(javascript:1)' }), 'invalid-argument');
    await refus(ecrit({ accueil: 'a'.repeat(501) }), 'invalid-argument');
    await refus(ecrit({}), 'invalid-argument');
    await ecrit({ nom: 'x'.repeat(80), accueil: 'a'.repeat(500) });
    assert.equal((await lire('marques/audrey')).nom.length, 80);
  });
  test('le texte d\'accueil est stocké tel quel (jamais interprété) ; vide autorisé', async () => {
    await appel(ALICE, { client: 'audrey', action: 'enregistrer', accueil: '<b>Salut</b> & "bienvenue"' });
    assert.equal((await lire('marques/audrey')).accueil, '<b>Salut</b> & "bienvenue"');
    await appel(ALICE, { client: 'audrey', action: 'enregistrer', accueil: '' });
    assert.equal((await lire('marques/audrey')).accueil, '');
  });
  test('journal serveur : qui, quel espace, quels champs, jamais le contenu', async () => {
    const sorties = [];
    const ecrire = process.stdout.write;
    process.stdout.write = (morceau, ...reste) => { sorties.push(String(morceau)); return typeof reste.at(-1) === 'function' ? reste.at(-1)() : true; }; // le journal de Cloud Functions écrit en JSON sur la sortie
    try { await appel(ALICE, { client: 'audrey', action: 'enregistrer', nom: 'Secret nom', logo: img(PNG) }); } finally { process.stdout.write = ecrire; }
    const lignes = sorties.map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter((x) => x?.message === 'Espace : réglages modifiés').map((x) => [x.message, { email: x.email, client: x.client, champs: x.champs }]);
    assert.equal(lignes.length, 1);
    assert.deepEqual(lignes[0][1], { email: ALICE, client: 'audrey', champs: ['nom', 'logo'] });
    assert.ok(!JSON.stringify(lignes).includes('Secret nom'));
  });
});

describe('Logo : envoyer, écrire la fiche, supprimer l\'ancien', () => {
  test('un PNG : chemin construit par le serveur, cache public, adresse publique dans la fiche', async () => {
    const r = await appel(ALICE, { client: 'audrey', action: 'enregistrer', logo: { ...img(PNG), nom: '../../x.png', chemin: 'autre/chose.png' } });
    const chemin = `marques/audrey/logo-${t}.png`;
    assert.deepEqual([...bucket.fichiers.keys()], [chemin]);
    assert.equal(bucket.fichiers.get(chemin).options.contentType, 'image/png');
    assert.equal(bucket.fichiers.get(chemin).options.metadata.cacheControl, 'public, max-age=3600');
    assert.equal(r.marque.logo, E.urlPublique(BUCKET, chemin));
    assert.equal((await lire('marques/audrey')).logo, E.urlPublique(BUCKET, chemin));
  });
  test('JPG et WebP acceptés ; remplacer un logo supprime l\'ancien fichier APRÈS avoir écrit la fiche, y compris celui de l\'outil de Jérôme (logo.png)', async () => {
    await db.doc('marques/audrey').update({ logo: E.urlPublique(BUCKET, 'marques/audrey/logo.png') });
    bucket.fichiers.set('marques/audrey/logo.png', { octets: PNG });
    await appel(ALICE, { client: 'audrey', action: 'enregistrer', logo: img(JPG) });
    assert.deepEqual(bucket.journal.map((x) => x[0]), ['envoi', 'suppression']);
    assert.deepEqual([...bucket.fichiers.keys()], [`marques/audrey/logo-${t}.jpg`]);
    await appel(ALICE, { client: 'audrey', action: 'enregistrer', logo: img(WEBP) });
    assert.deepEqual([...bucket.fichiers.keys()], [`marques/audrey/logo-${t}.webp`]);
  });
  test('M5 refusé : SVG (même annoncé PNG), texte, GIF, vide, base64 faux, plus de 2 Mo ; rien n\'est envoyé ni écrit', async () => {
    const ecrit = (logo) => appel(ALICE, { client: 'audrey', action: 'enregistrer', logo });
    const e1 = await refus(ecrit({ ...img(SVG), type: 'image/png' }), 'invalid-argument');
    assert.match(e1.message, /pas un PNG, un JPG ou un WebP/);
    await refus(ecrit(img(Buffer.from('GIF89a....'))), 'invalid-argument');
    await refus(ecrit(img(Buffer.alloc(0))), 'invalid-argument');
    await refus(ecrit({ donnees: 'pas du base64 !!' }), 'invalid-argument');
    await refus(ecrit('texte'), 'invalid-argument');
    const gros = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(E.OCTETS_LOGO)]);
    const e2 = await refus(ecrit(img(gros)), 'invalid-argument');
    assert.match(e2.message, /trop lourd/);
    assert.deepEqual(bucket.journal, []);
    assert.equal((await lire('marques/audrey')).logo, null);
  });
  test('si l\'envoi du fichier échoue, la fiche ne change pas (nom compris)', async () => {
    bucket.panneEnvoi = true;
    await assert.rejects(appel(ALICE, { client: 'audrey', action: 'enregistrer', nom: 'Nouveau', logo: img(PNG) }));
    assert.deepEqual(await lire('marques/audrey'), MARQUE);
    assert.equal((await lire('clients/audrey')).nom, 'Atelier Audrey');
  });
  test('la fiche ne pointe jamais vers un fichier absent : si l\'écriture de la fiche est refusée après l\'envoi, le nouveau fichier est supprimé', async () => {
    const envoi = bucket.file;
    bucket.file = (chemin) => ({ ...envoi(chemin), save: async (...a) => { await envoi(chemin).save(...a); await db.doc('marques/audrey').update({ actif: false }); } }); // l'espace est désactivé pendant l'envoi
    const e = await refus(appel(ALICE, { client: 'audrey', action: 'enregistrer', logo: img(PNG) }), 'permission-denied');
    assert.equal(e.message, 'Action non autorisée.');
    assert.deepEqual(bucket.journal.map((x) => x[0]), ['envoi', 'suppression']);
    assert.equal(bucket.fichiers.size, 0);
    assert.equal((await lire('marques/audrey')).logo, null);
  });
  test('M7 retirer le logo : la fiche est mise à jour, puis le fichier supprimé ; un fichier hors de marques/<client>/ n\'est jamais supprimé', async () => {
    await db.doc('marques/audrey').update({ logo: E.urlPublique(BUCKET, `marques/audrey/logo-1.png`) });
    bucket.fichiers.set('marques/audrey/logo-1.png', { octets: PNG });
    const r = await appel(ALICE, { client: 'audrey', action: 'enregistrer', logo: null });
    assert.equal(r.marque.logo, null);
    assert.equal((await lire('marques/audrey')).logo, null);
    assert.deepEqual(bucket.journal, [['suppression', 'marques/audrey/logo-1.png']]);
    bucket.journal.length = 0;
    for (const logo of [E.urlPublique(BUCKET, 'marques/boris/logo.png'), E.urlPublique(BUCKET, 'clients/audrey/secret.png'), E.urlPublique('autre-bucket', 'marques/audrey/logo.png'), 'https://exemple.test/x.png', E.urlPublique(BUCKET, 'marques/audrey/../boris/logo.png')]) {
      await db.doc('marques/audrey').update({ logo });
      await appel(ALICE, { client: 'audrey', action: 'enregistrer', logo: null });
    }
    assert.deepEqual(bucket.journal, [], 'aucune suppression hors du dossier de cet espace');
  });
});

describe('Images de la page de connexion', () => {
  const ajouter = (octets = PNG) => appel(ALICE, { client: 'audrey', action: 'image-ajouter', image: img(octets) });
  test('M8 jusqu\'à 4 images, une par appel ; la 5e est refusée avec un message clair et son fichier supprimé', async () => {
    for (let i = 0; i < 4; i++) await ajouter();
    assert.equal((await lire('marques/audrey')).images.length, 4);
    const e = await refus(ajouter(), 'failed-precondition');
    assert.match(e.message, /déjà 4 images/);
    assert.equal(bucket.fichiers.size, 4);
    assert.equal((await lire('marques/audrey')).images.length, 4);
  });
  test('deux ajouts en même temps : aucune image perdue, jamais plus de 4', async () => {
    const resultats = await Promise.allSettled([ajouter(), ajouter(JPG), ajouter(WEBP), ajouter(), ajouter(JPG), ajouter(WEBP)]);
    const images = (await lire('marques/audrey')).images;
    assert.equal(images.length, 4);
    assert.equal(resultats.filter((r) => r.status === 'fulfilled').length, 4);
    assert.equal(bucket.fichiers.size, 4, 'les fichiers des appels refusés sont supprimés');
  });
  test('refusé : SVG, trop lourd (1,5 Mo), autre type ; chemin construit par le serveur', async () => {
    await refus(ajouter(SVG), 'invalid-argument');
    await refus(ajouter(Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(E.OCTETS_IMAGE)])), 'invalid-argument');
    await ajouter(JPG);
    assert.match([...bucket.fichiers.keys()][0], /^marques\/audrey\/image-\d+\.jpg$/);
  });
  test('retirer : fiche d\'abord, puis le fichier ; une image inconnue est refusée', async () => {
    await ajouter(); await ajouter(JPG);
    const [a, b] = (await lire('marques/audrey')).images;
    bucket.journal.length = 0;
    const r = await appel(ALICE, { client: 'audrey', action: 'image-retirer', url: a });
    assert.deepEqual(r.marque.images, [b]);
    assert.equal(bucket.journal.length, 1);
    assert.equal(bucket.journal[0][0], 'suppression');
    await refus(appel(ALICE, { client: 'audrey', action: 'image-retirer', url: a }), 'not-found');
    await refus(appel(ALICE, { client: 'audrey', action: 'image-retirer', url: 12 }), 'invalid-argument');
  });
  test('mettre en première : la première sert de fond ; ordre des autres conservé', async () => {
    await ajouter(); await ajouter(JPG); await ajouter(WEBP);
    const [a, b, c] = (await lire('marques/audrey')).images;
    const r = await appel(ALICE, { client: 'audrey', action: 'image-premiere', url: c });
    assert.deepEqual(r.marque.images, [c, a, b]);
    assert.deepEqual((await lire('marques/audrey')).images, [c, a, b]);
  });
});

describe('Membres : une seule transaction (membres ET équipe)', () => {
  const membre = (action, email, role, extra = {}) => appel(ALICE, { client: 'audrey', action, email, role, ...extra });
  const equipeDe = async () => (await lire('clients/audrey')).equipe;
  const membresDe = async () => Object.fromEntries((await db.collection('clients/audrey/membres').get()).docs.map((d) => [d.id, d.data()]));

  test('M12 ajouter : le document de membre ET l\'équipe, en minuscules et triée', async () => {
    const r = await membre('membre-ajouter', '  Ingrid.Atamian@Gmail.COM ', 'lecteur');
    assert.deepEqual((await membresDe())['ingrid.atamian@gmail.com'], { role: 'lecteur' });
    assert.deepEqual(r.equipe, [{ email: ALICE, role: 'editeur' }, { email: 'ingrid.atamian@gmail.com', role: 'lecteur' }, { email: LEA, role: 'lecteur' }]);
    assert.deepEqual(await equipeDe(), r.equipe);
    assert.deepEqual((await lire('clients/audrey')).modules, { affaires: true });
  });
  test('M13 refusé : adresse mal formée, trop longue, déjà membre, rôle inconnu ; rien n\'est ajouté', async () => {
    for (const mal of ['pas-une-adresse', 'a@b', 'a b@c.fr', 'a/b@c.fr', '', null, `${'x'.repeat(120)}@c.fr`]) await refus(membre('membre-ajouter', mal, 'lecteur'), 'invalid-argument');
    const e = await refus(membre('membre-ajouter', LEA.toUpperCase(), 'lecteur'), 'already-exists');
    assert.equal(e.message, 'Cette personne est déjà dans l’espace');
    await refus(membre('membre-ajouter', 'nouveau@exemple.test', 'proprietaire'), 'invalid-argument');
    assert.equal(Object.keys(await membresDe()).length, 2);
    assert.equal((await equipeDe()).length, 2);
  });
  test('M13 la 21e adresse est refusée (20 membres au plus)', async () => {
    for (let i = 3; i <= 20; i++) await membre('membre-ajouter', `m${i}@exemple.test`, 'lecteur');
    assert.equal(Object.keys(await membresDe()).length, 20);
    const e = await refus(membre('membre-ajouter', 'm21@exemple.test', 'lecteur'), 'resource-exhausted');
    assert.equal(e.message, 'Limite atteinte : contacte ton administrateur');
    assert.equal(Object.keys(await membresDe()).length, 20);
  });
  test('M14 changer le rôle : le nom du membre est gardé, l\'équipe est à jour', async () => {
    await membre('membre-role', LEA, 'editeur');
    assert.deepEqual((await membresDe())[LEA], { role: 'editeur' });
    await membre('membre-role', ALICE, 'editeur');
    assert.deepEqual((await membresDe())[ALICE], { role: 'editeur', nom: 'Alice' });
    assert.ok((await equipeDe()).every((m) => m.role === 'editeur'));
    await refus(membre('membre-role', 'absent@exemple.test', 'editeur'), 'not-found');
  });
  test('M15 retirer : le membre disparaît des deux endroits et sa fiche est rendue (pour « Annuler » : même rôle, même nom)', async () => {
    const r = await membre('membre-retirer', LEA);
    assert.deepEqual(r.retire, { email: LEA, role: 'lecteur', nom: '' });
    assert.equal((await membresDe())[LEA], undefined);
    assert.deepEqual(await equipeDe(), [{ email: ALICE, role: 'editeur' }]);
    await membre('membre-ajouter', r.retire.email, r.retire.role, { nom: r.retire.nom });
    assert.deepEqual((await membresDe())[LEA], { role: 'lecteur' });
    await refus(membre('membre-retirer', 'absent@exemple.test'), 'not-found');
  });
  test('M16 le dernier éditeur ne peut ni se retirer ni se passer en lecteur : « Il faut garder au moins un éditeur. »', async () => {
    const e1 = await refus(membre('membre-retirer', ALICE), 'failed-precondition');
    assert.equal(e1.message, 'Il faut garder au moins un éditeur.');
    const e2 = await refus(membre('membre-role', ALICE, 'lecteur'), 'failed-precondition');
    assert.equal(e2.message, 'Il faut garder au moins un éditeur.');
    assert.deepEqual((await membresDe())[ALICE], { role: 'editeur', nom: 'Alice' });
    assert.equal((await equipeDe()).length, 2);
  });
  test('M16 avec un second éditeur on peut se retirer ; et le retiré n\'a plus aucun droit', async () => {
    await membre('membre-role', LEA, 'editeur');
    await membre('membre-retirer', ALICE);
    await refus(membre('membre-ajouter', 'x@exemple.test', 'lecteur'), 'permission-denied');
    await refus(appel(ALICE, { client: 'audrey', action: 'enregistrer', nom: 'Z' }), 'permission-denied');
  });
  test('M16 deux éditeurs se retirent EN MÊME TEMPS : un seul passe, il reste un éditeur', async () => {
    await membre('membre-role', LEA, 'editeur');
    for (let essai = 0; essai < 3; essai++) {
      await db.doc(`clients/audrey/membres/${ALICE}`).set({ role: 'editeur' });
      await db.doc(`clients/audrey/membres/${LEA}`).set({ role: 'editeur' });
      const r = await Promise.allSettled([
        appel(ALICE, { client: 'audrey', action: 'membre-retirer', email: LEA }),
        appel(LEA, { client: 'audrey', action: 'membre-retirer', email: ALICE }),
        appel(ALICE, { client: 'audrey', action: 'membre-role', email: ALICE, role: 'lecteur' }),
        appel(LEA, { client: 'audrey', action: 'membre-role', email: LEA, role: 'lecteur' }),
      ]);
      const editeurs = Object.values(await membresDe()).filter((m) => m.role === 'editeur');
      assert.ok(editeurs.length >= 1, `essai ${essai} : il reste au moins un éditeur`);
      assert.ok(r.some((x) => x.status === 'fulfilled'));
      assert.deepEqual((await equipeDe()).map((m) => m.email), Object.keys(await membresDe()).sort(), 'équipe et membres restent d\'accord');
    }
  });
});
