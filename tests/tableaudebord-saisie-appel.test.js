// Fonction appelable `tableaudebordSaisir` (functions/src/tableaudebord-saisie.js) : contrôle de l'appelant, demande mal formée, traduction des erreurs en phrases fixes
// et ligne de journal sans donnée personnelle (S4 du brief « saisie »). La base et l'horloge sont simulées ; rien ne touche Firebase ni le réseau.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerAppelSaisie, ligneDeJournalSaisie } from '../functions/src/tableaudebord-saisie.js';
import { COMPTES_AUTORISES } from '../functions/src/veille/appel.js';

const T0 = Date.parse('2026-10-17T10:00:00Z');
const MAIL = COMPTES_AUTORISES[0];
const bon = { token: { email: MAIL, email_verified: true } };
const requete = (data, auth) => ({ data, auth });
const CLE_N8N = { id: 'cle_n8n', tableau: 'technique', famille: 'cles', nom: 'Clé API de n8n', type: 'etat', niveau: 'orange', methode: 'manuel', echeance: new Date('2026-12-01'), proprietaire: 'interne' };
const AUTO = { id: 'cle_github', tableau: 'technique', famille: 'cles', nom: 'Jeton GitHub', type: 'etat', niveau: 'vert', methode: 'auto' };

/** Base en mémoire avec lot atomique ; `lots` garde les écritures, `lectures` compte les accès (pour prouver qu'une demande refusée n'atteint pas la base). */
function monde({ panne = null } = {}) {
  const docs = new Map([['tableaudebord_indicateurs/cle_n8n', CLE_N8N], ['tableaudebord_indicateurs/cle_github', AUTO]]);
  const m = {
    docs, lots: [], lectures: 0, journal: [],
    async lireDoc(c) { m.lectures++; return docs.has(c) ? { ...docs.get(c), id: c.split('/').at(-1) } : null; },
    async ecrireLot(ops) {
      if (panne) throw panne;
      m.lots.push(ops);
      for (const { type, chemin, donnees } of ops) docs.set(chemin, type === 'creer' ? { ...donnees } : { ...docs.get(chemin), ...donnees });
    },
  };
  m.appel = creerAppelSaisie({ donnees: m, maintenant: () => T0, journal: (e) => m.journal.push(e) });
  return m;
}

describe('accès à la fonction', () => {
  test('refuse sans connexion : « Connexion nécessaire. », rien n\'est lu ni écrit', async () => {
    const m = monde();
    for (const auth of [undefined, null, {}]) {
      await assert.rejects(() => m.appel(requete({ indicateurId: 'cle_n8n', echeance: '2027-05-01' }, auth)), (e) => e.code === 'unauthenticated' && e.message === 'Connexion nécessaire.');
    }
    assert.equal(m.lectures, 0);
    assert.equal(m.lots.length, 0);
  });
  test('refuse un e-mail non vérifié, même s\'il est dans la liste', async () => {
    const m = monde();
    for (const verifie of [false, undefined, 'true', 1]) {
      await assert.rejects(() => m.appel(requete({ indicateurId: 'cle_n8n', echeance: '2027-05-01' }, { token: { email: MAIL, email_verified: verifie } })), (e) => e.code === 'permission-denied');
    }
    assert.equal(m.lots.length, 0);
  });
  test('refuse un e-mail vérifié mais hors de la liste (COMPTES_AUTORISES)', async () => {
    const m = monde();
    for (const email of ['autre@exemple.fr', MAIL.toUpperCase(), ` ${MAIL}`, undefined]) {
      await assert.rejects(() => m.appel(requete({ indicateurId: 'cle_n8n', echeance: '2027-05-01' }, { token: { email, email_verified: true } })), (e) => e.code === 'permission-denied');
    }
    assert.equal(m.lectures, 0);
    assert.equal(m.lots.length, 0);
  });
  test('chaque compte autorisé et vérifié passe, et l\'auteur écrit est l\'e-mail de l\'appelant', async () => {
    for (const email of COMPTES_AUTORISES) {
      const m = monde();
      const r = await m.appel(requete({ indicateurId: 'cle_n8n', echeance: '2027-05-01', commentaire: 'Renouvelée' }, { token: { email, email_verified: true } }));
      assert.equal(r.ok, true);
      assert.equal(r.niveau, 'vert');
      assert.equal(m.lots.length, 1, 'un seul lot (indicateur + historique)');
      assert.equal(m.docs.get('tableaudebord_indicateurs/cle_n8n').saisiPar, email);
      const histo = m.lots[0].find((o) => o.type === 'creer').donnees;
      assert.equal(histo.saisiPar, email);
    }
  });
});

describe('demande mal formée', () => {
  test('corps absent, texte, nombre ou tableau : refusé par une phrase fixe, sans écriture', async () => {
    const m = monde();
    for (const data of [undefined, null, 'x', 5, [], [{ indicateurId: 'cle_n8n', echeance: '2027-05-01' }]]) {
      await assert.rejects(() => m.appel(requete(data, bon)), (e) => e.code === 'failed-precondition' && e.message === 'Demande inconnue.' && e.details?.code === 'demande_invalide');
    }
    assert.equal(m.lots.length, 0);
  });
  test('champ inconnu ou indicateur absent du corps : refusé, sans écriture', async () => {
    const m = monde();
    for (const data of [{ indicateurId: 'cle_n8n', echeance: '2027-05-01', niveau: 'vert' }, { indicateurId: 'cle_n8n', echeance: '2027-05-01', proprietaire: 'x' }, { echeance: '2027-05-01' }, {}]) {
      await assert.rejects(() => m.appel(requete(data, bon)), (e) => e.code === 'failed-precondition' && e.details?.code === 'demande_invalide');
    }
    assert.equal(m.lots.length, 0);
    assert.equal(m.docs.get('tableaudebord_indicateurs/cle_n8n').saisiPar, undefined);
  });
});

describe('erreurs traduites en phrases fixes', () => {
  test('une erreur métier (indicateur inconnu, automatique, mauvaise nature) devient une phrase lisible, sans détail technique', async () => {
    const m = monde();
    const cas = [
      [{ indicateurId: 'fantome', echeance: '2027-05-01' }, 'indicateur_inconnu', /n'existe pas/],
      [{ indicateurId: 'cle_github', echeance: '2027-05-01' }, 'indicateur_auto', /vérifié automatiquement/],
      [{ indicateurId: 'cle_n8n', valeur: 3 }, 'mauvais_type', /date d'échéance/],
    ];
    for (const [data, code, motif] of cas) {
      await assert.rejects(() => m.appel(requete(data, bon)), (e) => e.code === 'failed-precondition' && e.details?.code === code && motif.test(e.message) && !/Error|at |\.js|tableaudebord_/.test(e.message));
    }
    assert.equal(m.lots.length, 0);
  });
  test('une erreur inattendue de la base devient « Une erreur est survenue. Réessaie. », sans le texte d\'origine', async () => {
    const m = monde({ panne: new Error('secret interne : chemin tableaudebord_indicateurs/cle_n8n, jeton xyz') });
    await assert.rejects(() => m.appel(requete({ indicateurId: 'cle_n8n', echeance: '2027-05-01' }, bon)), (e) => {
      assert.equal(e.code, 'internal');
      assert.equal(e.message, 'Une erreur est survenue. Réessaie.');
      assert.equal(e.details, undefined);
      assert.doesNotMatch(JSON.stringify(e.message), /secret|jeton|tableaudebord_/);
      return true;
    });
    assert.equal(m.journal.at(-1).statut, 'erreur');
  });
});

describe('journal', () => {
  const NOTE = 'note-privee-unique-4711';
  test('la ligne de journal ne contient NI l\'e-mail, NI la note, NI la valeur saisie, NI la date saisie : seulement la liste blanche', async () => {
    const m = monde();
    m.docs.set('tableaudebord_indicateurs/stock_bordeaux', { id: 'stock_bordeaux', tableau: 'stocks', famille: 'stock', nom: 'Bordeaux', type: 'mesure', valeur: 42, methode: 'semi' });
    await m.appel(requete({ indicateurId: 'cle_n8n', echeance: '2027-05-01', commentaire: NOTE }, bon));
    await m.appel(requete({ indicateurId: 'stock_bordeaux', valeur: 987654.321, commentaire: NOTE }, bon));
    await assert.rejects(() => m.appel(requete({ indicateurId: 'cle_github', echeance: '2031-02-03', commentaire: NOTE }, bon)));
    assert.equal(m.journal.length, 3);
    const lignes = m.journal.map(ligneDeJournalSaisie);
    for (const l of lignes) {
      for (const interdit of [MAIL, 'gmail', NOTE, '987654', '2027-05-01', '2031-02-03', 'Renouvel']) assert.ok(!l.includes(interdit), `« ${interdit} » ne doit pas être journalisé : ${l}`);
      assert.deepEqual(Object.keys(JSON.parse(l)).filter((k) => !['severity', 'message', 'action', 'statut', 'code', 'indicateurId', 'dureeMs'].includes(k)), []);
    }
    assert.deepEqual(m.journal.map((e) => e.statut), ['ok', 'ok', 'refus']);
    assert.equal(JSON.parse(lignes[2]).code, 'indicateur_auto');
  });
  test('ligneDeJournalSaisie ignore tout champ hors liste blanche, tronque les textes et marque les erreurs en ERROR', () => {
    const l = JSON.parse(ligneDeJournalSaisie({ action: 'saisir', statut: 'erreur', code: 'x'.repeat(200), indicateurId: 'cle_n8n', dureeMs: 12, email: MAIL, commentaire: NOTE, valeur: 7, auteur: MAIL }));
    assert.deepEqual(Object.keys(l).sort(), ['action', 'code', 'dureeMs', 'indicateurId', 'message', 'severity', 'statut']);
    assert.equal(l.severity, 'ERROR');
    assert.equal(l.code.length, 80);
    assert.equal(JSON.parse(ligneDeJournalSaisie({ action: 'saisir', statut: 'ok' })).severity, 'INFO');
  });
  test('un identifiant qui n\'a pas la forme d\'un identifiant d\'indicateur n\'est pas journalisé', async () => {
    const m = monde();
    await assert.rejects(() => m.appel(requete({ indicateurId: `${MAIL} texte collé`, echeance: '2027-05-01' }, bon)));
    assert.equal(m.journal.at(-1).indicateurId, undefined);
    assert.ok(!ligneDeJournalSaisie(m.journal.at(-1)).includes(MAIL));
  });
});
