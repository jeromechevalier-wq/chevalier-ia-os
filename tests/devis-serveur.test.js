// C2 à C7 : les transitions des devis côté serveur (functions/src/coeur/devis.js) et leur porte d'entrée chez Jérôme (functions/src/devis-appel.js).
// Accès aux données EN MÉMOIRE (aucune base) : les transactions y passent l'une après l'autre, comme Firestore qui relance la perdante.
// Le vrai test de concurrence sur l'émulateur est dans devis-serveur-firestore.test.js. La porte de la plateforme clients est dans devis-serveur-plateforme.test.js.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerAccesMemoire, avecBase, COLLECTIONS as C } from '../functions/src/coeur/donnees.js';
import * as S from '../functions/src/coeur/devis.js';
import { creerAppelDevis } from '../functions/src/devis-appel.js';
import { nouveauDevis } from '../functions/partage/devis.js';

const ACTEUR = 'jerome.chevalier@gmail.com';
const MAINTENANT = new Date('2026-10-24T10:00:00Z'); // 12 h à Paris, le 24/10/2026
const ctx = (extra = {}) => ({ acteur: ACTEUR, via: 'ecran', maintenant: MAINTENANT, ...extra });

/** Un monde en mémoire : devis, compteur, réglages du module, journal. */
function monde(devis = []) {
  const collections = { [C.devis]: devis, [C.devisCompteurs]: [], [C.devisParametres]: [{ id: 'reglages', regimeTva: 'assujetti' }], [C.audit]: [], [C.auditAvant]: [] };
  return { collections, donnees: creerAccesMemoire(collections) };
}
const ligne = (id) => ({ id, libelle: `Article ${id}`, unite: 'u', quantite: 2, prixAchat: 10 });
/** Un brouillon complet (un destinataire, une ligne), prêt à finaliser. */
function brouillon(id, extra = {}) {
  const d = nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }], affaireId: 'aff1' }, { id, maintenant: MAINTENANT, auteur: ACTEUR }, { marge: 20 });
  return { ...d, sections: [{ id: `s-${id}`, titre: 'Travaux', lignes: [ligne(`l-${id}`)] }], ...extra };
}
const photo = (m) => JSON.stringify(m.collections);
const leDevis = (m, id) => m.collections[C.devis].find((d) => d.id === id);

describe('C2 devisFinaliser : numéro DEV-<date du jour à Paris>-NNN', () => {
  test('C2 le premier devis finalisé reçoit -001, le deuxième -002 ; le devis est figé et passe à « Finalisé » (en_attente_envoi)', async () => {
    const m = monde([brouillon('d1'), brouillon('d2')]);
    const r1 = await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'd1' });
    const r2 = await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'd2' });
    assert.equal(r1.ok, true);
    assert.equal(r1.numero, 'DEV-2026-10-24-001');
    assert.equal(r2.numero, 'DEV-2026-10-24-002');
    const d1 = leDevis(m, 'd1');
    assert.equal(d1.statut, 'en_attente_envoi');
    assert.equal(d1.numero, 'DEV-2026-10-24-001');
    assert.equal(d1.totaux.ht, 24); // 2 x (10 € + 20 %)
    assert.equal(d1.sections[0].lignes[0].prixVente, 12);
    assert.equal(d1.regimeTva, 'assujetti');
    assert.deepEqual(d1.finalisation, { n8n: 'en_attente' }); // rien n'est encore envoyé à n8n
    assert.ok(d1.finaliseLe instanceof Date);
    assert.equal(m.collections[C.devisCompteurs].find((x) => x.id === 'global').valeur, 2);
  });
  test('C2 la date du numéro est celle de Paris : 23 h 30 UTC le 24 octobre est déjà le 25', async () => {
    const m = monde([brouillon('d1')]);
    const r = await S.finaliser({ donnees: m.donnees, ctx: ctx({ maintenant: new Date('2026-10-24T23:30:00Z') }), devisId: 'd1' });
    assert.equal(r.numero, 'DEV-2026-10-25-001');
  });
  test('C2 le compteur est global : un numéro consommé un autre jour est suivi du suivant', async () => {
    const m = monde([brouillon('d1'), brouillon('d2')]);
    await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'd1' });
    const r = await S.finaliser({ donnees: m.donnees, ctx: ctx({ maintenant: new Date('2026-11-02T10:00:00Z') }), devisId: 'd2' });
    assert.equal(r.numero, 'DEV-2026-11-02-002');
  });
  test('C2 dix finalisations simultanées ne reçoivent jamais le même numéro', async () => {
    const m = monde(Array.from({ length: 10 }, (_, i) => brouillon(`d${i}`)));
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: `d${i}` })));
    const numeros = rs.map((r) => r.numero).sort();
    assert.equal(new Set(numeros).size, 10);
    assert.deepEqual(numeros, Array.from({ length: 10 }, (_, i) => `DEV-2026-10-24-${String(i + 1).padStart(3, '0')}`));
    assert.equal(m.collections[C.devisCompteurs][0].valeur, 10);
  });
  test('C2 une deuxième demande sur le même devis est refusée (une seule finalisation, un seul numéro)', async () => {
    const m = monde([brouillon('d1')]);
    await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'd1' });
    const avant = photo(m);
    await assert.rejects(() => S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'd1' }), (e) => e.code === 'transition_interdite');
    assert.equal(photo(m), avant);
  });
  test('C2 chaque finalisation laisse sa ligne de journal et sa copie avant/après, sans le compteur', async () => {
    const m = monde([brouillon('d1')]);
    const r = await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'd1' });
    const lignes = m.collections[C.audit];
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].outil, 'devisFinaliser');
    assert.equal(lignes[0].acteur, ACTEUR);
    assert.equal(lignes[0].collection, 'devis_devis');
    assert.equal(lignes[0].docId, 'd1');
    assert.equal(lignes[0].statut, 'succes');
    assert.equal(lignes[0].operationId, r.operationId);
    const copie = m.collections[C.auditAvant].find((x) => x.id === lignes[0].id);
    assert.equal(copie.avant.statut, 'brouillon');
    assert.equal(copie.apres.statut, 'en_attente_envoi');
  });
});

describe('C3 devisFinaliser d’une version 2', () => {
  test('C3 la version 2 garde le numéro de sa racine, ne consomme pas le compteur, et la version 1 passe à Remplacé', async () => {
    const m = monde([brouillon('v1')]);
    const r1 = await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'v1' });
    await S.changerStatut({ donnees: m.donnees, ctx: ctx(), devisId: 'v1', action: 'marquer_envoye' });
    const nv = await S.nouvelleVersion({ donnees: m.donnees, ctx: ctx(), devisId: 'v1' });
    assert.equal(nv.devis.numero, r1.numero);
    const compteurAvant = m.collections[C.devisCompteurs][0].valeur;
    const r2 = await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: nv.devis.id });
    assert.equal(r2.ok, true);
    assert.equal(r2.numero, r1.numero);
    assert.equal(r2.nouveauNumero, false);
    assert.equal(m.collections[C.devisCompteurs][0].valeur, compteurAvant);
    assert.equal(leDevis(m, 'v1').statut, 'remplace');
    assert.deepEqual(r2.remplaces, ['v1']);
    assert.equal(leDevis(m, nv.devis.id).statut, 'en_attente_envoi');
    assert.equal(leDevis(m, nv.devis.id).version, 2);
  });
  test('C3 une version 1 « Finalisée » (jamais envoyée) est aussi remplacée par la version 2 finalisée', async () => {
    const m = monde([brouillon('v1')]);
    await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'v1' });
    const nv = await S.nouvelleVersion({ donnees: m.donnees, ctx: ctx(), devisId: 'v1' });
    await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: nv.devis.id });
    assert.equal(leDevis(m, 'v1').statut, 'remplace');
  });
  test('C3 une version 1 refusée n’est PAS remplacée (elle reste refusée), la version 2 garde quand même le numéro', async () => {
    const m = monde([brouillon('v1')]);
    await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'v1' });
    await S.changerStatut({ donnees: m.donnees, ctx: ctx(), devisId: 'v1', action: 'marquer_envoye' });
    await S.changerStatut({ donnees: m.donnees, ctx: ctx(), devisId: 'v1', action: 'refuser' });
    const nv = await S.nouvelleVersion({ donnees: m.donnees, ctx: ctx(), devisId: 'v1' });
    const r = await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: nv.devis.id });
    assert.equal(leDevis(m, 'v1').statut, 'refuse');
    assert.equal(r.numero, leDevis(m, 'v1').numero);
  });
});

describe('C4 devisFinaliser d’un devis invalide', () => {
  test('C4 sans ligne (le destinataire n’est plus obligatoire) : rien n’est écrit (ni devis, ni compteur, ni journal) et les messages reviennent', async () => {
    const vide = { ...nouveauDevis({}, { id: 'vide', maintenant: MAINTENANT, auteur: ACTEUR }, {}) };
    const m = monde([vide]);
    const avant = photo(m);
    const r = await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'vide' });
    assert.equal(r.ok, false);
    assert.ok(!r.erreurs.some((e) => /destinataire/.test(e)), r.erreurs.join(' | ')); // l'adresse e-mail est facultative : on peut imprimer et remettre le devis en main propre
    assert.ok(r.erreurs.some((e) => /au moins une ligne/.test(e)), r.erreurs.join(' | '));
    assert.equal(photo(m), avant);
    assert.equal(m.collections[C.devisCompteurs].length, 0);
    assert.equal(m.collections[C.audit].length, 0);
  });
  test('C4 un devis invalide ne consomme pas de numéro : le suivant reçoit -001', async () => {
    const m = monde([nouveauDevis({}, { id: 'vide', maintenant: MAINTENANT, auteur: ACTEUR }, {}), brouillon('bon')]);
    await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'vide' });
    const r = await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'bon' });
    assert.equal(r.numero, 'DEV-2026-10-24-001');
  });
  test('C4 un devis introuvable ou un identifiant invalide est refusé sans rien écrire', async () => {
    const m = monde([brouillon('d1')]);
    const avant = photo(m);
    await assert.rejects(() => S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'nexistepas' }), (e) => e.code === 'introuvable');
    await assert.rejects(() => S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'a/b' }), (e) => e.code === 'demande_invalide');
    await assert.rejects(() => S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: undefined }), (e) => e.code === 'demande_invalide');
    assert.equal(photo(m), avant);
  });
});

describe('C5 devisChangerStatut', () => {
  const ETATS = ['brouillon', 'en_attente_envoi', 'envoye', 'accepte', 'refuse', 'remplace'];
  const ATTENDU = { marquer_envoye: { de: 'en_attente_envoi', vers: 'envoye', date: 'envoyeLe' }, accepter: { de: 'envoye', vers: 'accepte', date: 'accepteLe' }, refuser: { de: 'envoye', vers: 'refuse', date: 'refuseLe' } };
  for (const [action, t] of Object.entries(ATTENDU)) {
    test(`C5 ${action} : permis depuis « ${t.de} » (statut et ${t.date} écrits), refusé sans écriture depuis tous les autres statuts`, async () => {
      for (const statut of ETATS) {
        const m = monde([brouillon('d1', { statut, numero: statut === 'brouillon' ? null : 'DEV-2026-10-01-001' })]);
        const avant = photo(m);
        if (statut === t.de) {
          const r = await S.changerStatut({ donnees: m.donnees, ctx: ctx(), devisId: 'd1', action });
          assert.equal(r.ok, true);
          assert.equal(leDevis(m, 'd1').statut, t.vers);
          assert.ok(leDevis(m, 'd1')[t.date] instanceof Date);
          assert.equal(m.collections[C.audit].at(-1).outil, 'devisChangerStatut');
        } else {
          await assert.rejects(() => S.changerStatut({ donnees: m.donnees, ctx: ctx(), devisId: 'd1', action }), (e) => e.code === 'transition_interdite', `${action} depuis ${statut}`);
          assert.equal(photo(m), avant, `${action} depuis ${statut} : rien n'est écrit`);
        }
      }
    });
  }
  test('C5 une action inconnue (finaliser, archiver, remplacer, au hasard) est refusée : chaque transition a sa fonction', async () => {
    const m = monde([brouillon('d1', { statut: 'envoye', numero: 'DEV-2026-10-01-001' })]);
    const avant = photo(m);
    for (const action of ['finaliser', 'archiver', 'remplacer', 'nouvelle_version', 'n_importe_quoi', undefined]) {
      await assert.rejects(() => S.changerStatut({ donnees: m.donnees, ctx: ctx(), devisId: 'd1', action }), (e) => e.code === 'demande_invalide', String(action));
    }
    assert.equal(photo(m), avant);
  });
  test('C5 accepter une version passe les autres versions vivantes de la même racine à Remplacé (les refusées restent refusées)', async () => {
    const base = { racineId: 'v1', numero: 'DEV-2026-10-01-001' };
    const m = monde([
      brouillon('v1', { ...base, version: 1, statut: 'envoye' }),
      brouillon('v2', { ...base, version: 2, statut: 'envoye' }),
      brouillon('v0', { ...base, version: 0, statut: 'refuse' }),
      brouillon('autre', { racineId: 'autre', numero: 'DEV-2026-10-02-002', statut: 'envoye' }),
    ]);
    const r = await S.changerStatut({ donnees: m.donnees, ctx: ctx(), devisId: 'v2', action: 'accepter' });
    assert.deepEqual(r.remplaces, ['v1']);
    assert.deepEqual(['v1', 'v2', 'v0', 'autre'].map((id) => leDevis(m, id).statut), ['remplace', 'accepte', 'refuse', 'envoye']);
  });
  test('C5 archiver : seulement un devis Signé ou Refusé non archivé ; on peut désarchiver ; rien d’autre', async () => {
    const m = monde([brouillon('s', { statut: 'accepte', numero: 'DEV-2026-10-01-001' }), brouillon('e', { statut: 'envoye', numero: 'DEV-2026-10-01-002' })]);
    await assert.rejects(() => S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 'e', archive: true }), (e) => e.code === 'transition_interdite');
    await assert.rejects(() => S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 's', archive: 'oui' }), (e) => e.code === 'demande_invalide');
    await assert.rejects(() => S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 's', archive: false }), (e) => e.code === 'transition_interdite');
    await S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 's', archive: true });
    assert.equal(leDevis(m, 's').archive, true);
    assert.ok(leDevis(m, 's').archiveLe instanceof Date);
    await assert.rejects(() => S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 's', archive: true }), (e) => e.code === 'transition_interdite');
    await S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 's', archive: false });
    assert.equal(leDevis(m, 's').archive, false);
    assert.equal(leDevis(m, 's').statut, 'accepte'); // l'archive n'est pas un statut
    assert.equal(m.collections[C.audit].at(-1).outil, 'devisArchiver');
  });
});

describe('C6 devisNouvelleVersion', () => {
  test('C6 crée le brouillon suivant : même racine, version + 1, même numéro, prix recalculables, sans les dates de la version figée', async () => {
    const m = monde([brouillon('v1')]);
    await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'v1' });
    await S.changerStatut({ donnees: m.donnees, ctx: ctx(), devisId: 'v1', action: 'marquer_envoye' });
    const r = await S.nouvelleVersion({ donnees: m.donnees, ctx: ctx({ acteur: 'autre@exemple.test' }), devisId: 'v1' });
    const v2 = leDevis(m, r.devis.id);
    assert.equal(v2.statut, 'brouillon');
    assert.equal(v2.racineId, 'v1');
    assert.equal(v2.version, 2);
    assert.equal(v2.numero, leDevis(m, 'v1').numero);
    assert.equal(v2.creePar, 'autre@exemple.test');
    for (const cle of ['finaliseLe', 'envoyeLe', 'totaux', 'finalisation']) assert.equal(v2[cle], undefined, cle);
    assert.equal(v2.sections[0].lignes[0].prixVente, undefined);
    assert.equal(leDevis(m, 'v1').statut, 'envoye'); // la version de départ ne change pas
    assert.equal(m.collections[C.audit].at(-1).action, 'creer');
  });
  test('C6 refusée depuis un brouillon (et depuis un devis Signé ou Remplacé), sans rien écrire', async () => {
    for (const statut of ['brouillon', 'accepte', 'remplace']) {
      const m = monde([brouillon('d1', { statut, numero: statut === 'brouillon' ? null : 'DEV-2026-10-01-001' })]);
      const avant = photo(m);
      await assert.rejects(() => S.nouvelleVersion({ donnees: m.donnees, ctx: ctx(), devisId: 'd1' }), (e) => e.code === 'transition_interdite', statut);
      assert.equal(photo(m), avant);
    }
  });
  test('C6 refusée s’il existe déjà un brouillon de la même racine ; permise pour une autre racine', async () => {
    const m = monde([brouillon('v1', { statut: 'envoye', numero: 'DEV-2026-10-01-001' }), brouillon('v2', { racineId: 'v1', version: 2, numero: 'DEV-2026-10-01-001' }), brouillon('x', { statut: 'envoye', numero: 'DEV-2026-10-02-002' })]);
    const avant = photo(m);
    await assert.rejects(() => S.nouvelleVersion({ donnees: m.donnees, ctx: ctx(), devisId: 'v1' }), (e) => e.code === 'brouillon_existant');
    assert.equal(photo(m), avant);
    const r = await S.nouvelleVersion({ donnees: m.donnees, ctx: ctx(), devisId: 'x' });
    assert.equal(r.devis.version, 2);
  });
  test('C6 deux demandes simultanées : une seule crée le brouillon, l’autre est refusée', async () => {
    const m = monde([brouillon('v1', { statut: 'envoye', numero: 'DEV-2026-10-01-001' })]);
    const rs = await Promise.allSettled([S.nouvelleVersion({ donnees: m.donnees, ctx: ctx(), devisId: 'v1' }), S.nouvelleVersion({ donnees: m.donnees, ctx: ctx(), devisId: 'v1' })]);
    assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(m.collections[C.devis].filter((d) => d.statut === 'brouillon').length, 1);
  });
  test('C6 la version suivante d’une version refusée reprend après la plus haute version existante (jamais deux versions 2)', async () => {
    const m = monde([
      brouillon('v1', { statut: 'refuse', numero: 'DEV-2026-10-01-001' }),
      brouillon('v2', { racineId: 'v1', version: 2, statut: 'envoye', numero: 'DEV-2026-10-01-001' }),
    ]);
    const r = await S.nouvelleVersion({ donnees: m.donnees, ctx: ctx(), devisId: 'v1' });
    assert.equal(r.devis.version, 3);
  });
});

describe('C7 qui peut appeler (porte de Jérôme)', () => {
  const requete = (email, data = { devisId: 'd1', action: 'marquer_envoye', archive: true }, { verifie = true } = {}) => ({
    auth: email === undefined ? undefined : { uid: 'u', token: { email, email_verified: verifie } }, data,
  });
  const OPERATIONS = ['finaliser', 'changerStatut', 'nouvelleVersion', 'archiver'];
  const appels = (m) => OPERATIONS.map((o) => [o, creerAppelDevis(o, { donnees: () => m.donnees })]);

  test('C7 un compte inconnu, un compte non vérifié et un appel sans connexion sont refusés pour les quatre fonctions, sans rien écrire', async () => {
    const m = monde([brouillon('d1', { statut: 'envoye', numero: 'DEV-2026-10-01-001' })]);
    const avant = photo(m);
    for (const [o, appel] of appels(m)) {
      await assert.rejects(() => appel(requete('intrus@exemple.test')), (e) => e.code === 'permission-denied', `${o} : autre compte`);
      await assert.rejects(() => appel(requete(ACTEUR, undefined, { verifie: false })), (e) => e.code === 'permission-denied', `${o} : e-mail non vérifié`);
      await assert.rejects(() => appel(requete(undefined)), (e) => e.code === 'unauthenticated', `${o} : sans connexion`);
      await assert.rejects(() => appel({ data: {}, auth: { uid: 'u', token: {} } }), (e) => e.code === 'permission-denied', `${o} : jeton sans e-mail`);
    }
    assert.equal(photo(m), avant);
  });
  test('C7 un compte autorisé passe : finaliser, changer de statut, nouvelle version et archiver répondent sans le devis entier', async () => {
    const m = monde([brouillon('d1')]);
    const [fin, stat, nouv, arch] = appels(m).map(([, a]) => a);
    const f = await fin(requete(ACTEUR, { devisId: 'd1' }));
    assert.deepEqual([f.ok, f.statut, f.nouveauNumero], [true, 'en_attente_envoi', true]);
    assert.match(f.numero, /^DEV-\d{4}-\d{2}-\d{2}-001$/);
    assert.equal(f.sections, undefined);
    const s = await stat(requete(ACTEUR, { devisId: 'd1', action: 'marquer_envoye' }));
    assert.equal(s.statut, 'envoye');
    const n = await nouv(requete(ACTEUR, { devisId: 'd1' }));
    assert.equal(n.statut, 'brouillon');
    await stat(requete(ACTEUR, { devisId: 'd1', action: 'refuser' }));
    const a = await arch(requete(ACTEUR, { devisId: 'd1', archive: true }));
    assert.equal(a.ok, true);
  });
  test('C7 un devis invalide rend ok:false et ses messages (pas une panne) ; un refus de transition devient failed-precondition ; un devis inconnu not-found', async () => {
    const m = monde([nouveauDevis({}, { id: 'vide', maintenant: MAINTENANT, auteur: ACTEUR }, {}), brouillon('b')]);
    const [fin, stat] = appels(m).map(([, a]) => a);
    const r = await fin(requete(ACTEUR, { devisId: 'vide' }));
    assert.equal(r.ok, false);
    assert.ok(r.erreurs.length >= 1);
    await assert.rejects(() => stat(requete(ACTEUR, { devisId: 'b', action: 'accepter' })), (e) => e.code === 'failed-precondition');
    await assert.rejects(() => fin(requete(ACTEUR, { devisId: 'inconnu' })), (e) => e.code === 'not-found');
    await assert.rejects(() => stat(requete(ACTEUR, { devisId: 'b' })), (e) => e.code === 'invalid-argument');
  });
  test('C7 le journal Cloud ne reçoit ni l’identifiant du devis ni l’adresse de l’appelant', async () => {
    const m = monde([brouillon('d1')]);
    const lignes = [];
    const appel = creerAppelDevis('finaliser', { donnees: () => m.donnees, journal: (e) => lignes.push(e) });
    await appel(requete(ACTEUR, { devisId: 'd1' }));
    const texte = JSON.stringify(lignes);
    assert.doesNotMatch(texte, /d1|jerome|@/);
  });
  test('C7 un client ne peut appeler que dans SON espace : la base cadrée sur clients/<client> ne voit pas le devis d’un autre', async () => {
    const collections = { 'clients/a/devis_devis': [brouillon('da')], 'clients/b/devis_devis': [brouillon('db')], 'clients/a/devis_compteurs': [], 'clients/b/devis_compteurs': [], 'clients/a/crm_audit': [], 'clients/a/crm_audit_avant': [] };
    const brut = creerAccesMemoire(collections);
    const dansA = avecBase(brut, 'clients/a');
    await assert.rejects(() => S.finaliser({ donnees: dansA, ctx: ctx(), devisId: 'db' }), (e) => e.code === 'introuvable');
    const r = await S.finaliser({ donnees: dansA, ctx: ctx(), devisId: 'da' });
    assert.equal(r.ok, true);
    assert.equal(collections['clients/b/devis_devis'][0].statut, 'brouillon');
    assert.equal(collections['clients/b/devis_compteurs'].length, 0);
  });
});
