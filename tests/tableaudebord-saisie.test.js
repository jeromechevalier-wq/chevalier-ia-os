// Saisie d'une date ou d'une mesure à l'écran du tableau de bord : la logique pure (scripts/porte/saisie-tableaudebord.js), sans Firebase ni réseau.
// La base et l'horloge sont simulées. Les tests S1 à S3 et P5/P6 du brief « saisie » ; l'appelant (S4) est dans tableaudebord-saisie-appel.test.js.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { saisir, ErreurSaisie, DELAI_ECHEANCE_JOURS, PERIME_APRES_MINUTES, RAPPEL, lireJour } from '../scripts/porte/saisie-tableaudebord.js';
import * as L from '../js/modules/tableaudebord/logique.js';

const JOUR = 86_400_000;
const T0 = Date.parse('2026-10-17T10:00:00Z');
const MAIL = 'jerome.chevalier@gmail.com';
const CLE_N8N = { id: 'cle_n8n', tableau: 'technique', famille: 'cles', nom: 'Clé API de n8n', type: 'etat', niveau: 'orange', message: 'Date à vérifier', methode: 'manuel', echeance: new Date('2026-12-01'), proprietaire: 'interne' };
const STOCK = { id: 'stock_bordeaux', tableau: 'stocks', famille: 'stock', nom: 'Bordeaux', type: 'mesure', valeur: 42, unite: 'bouteilles', methode: 'semi', proprietaire: 'interne' };
const AUTO = { id: 'cle_github', tableau: 'technique', famille: 'cles', nom: 'Jeton GitHub', type: 'etat', niveau: 'vert', methode: 'auto' };
const jourDans = (n) => new Date(T0 + n * JOUR).toISOString().slice(0, 10);

/** Base en mémoire dont le lot est atomique (tout ou rien) ; `panne` fait échouer le lot. */
export function baseEnMemoire(initial = {}) {
  const docs = new Map(Object.entries(initial));
  const lots = [];
  const base = {
    docs, lots, panne: false,
    async lireDoc(c) { return docs.has(c) ? { ...docs.get(c), id: c.split('/').at(-1) } : null; },
    async ecrireLot(ops) {
      lots.push(ops);
      if (base.panne) throw new Error('panne simulée');
      const copie = new Map(docs);
      for (const { type, chemin, donnees } of ops) {
        if (type === 'creer') { if (copie.has(chemin)) throw Object.assign(new Error('déjà là'), { code: 6 }); copie.set(chemin, { ...donnees }); }
        else { if (!copie.has(chemin)) throw Object.assign(new Error('absent'), { code: 5 }); copie.set(chemin, { ...copie.get(chemin), ...donnees }); }
      }
      docs.clear(); for (const [k, v] of copie) docs.set(k, v);
    },
  };
  return base;
}
const monde = () => baseEnMemoire({ 'tableaudebord_indicateurs/cle_n8n': CLE_N8N, 'tableaudebord_indicateurs/stock_bordeaux': STOCK, 'tableaudebord_indicateurs/cle_github': AUTO });
const saisirAvec = (base, demande, extra = {}) => saisir({ donnees: base, maintenant: () => T0, auteur: MAIL, demande, ...extra });
/** Niveau et libellé tels que l'écran les calcule avec le document écrit. */
function vuEcran(doc, maintenant = T0) {
  const i = { niveau: doc.niveau, echeanceMs: doc.echeance.getTime(), releveMs: doc.releveLe.getTime(), perimeApresMinutes: doc.perimeApresMinutes };
  const n = L.niveauEffectif(i, maintenant);
  return { niveau: n, libelle: L.LIBELLES[n] };
}

describe('S1 le niveau d\'une échéance saisie', () => {
  test('S1 une échéance dans 12 jours rend l\'indicateur « À surveiller », dans 45 jours « OK », dans le passé « Panne » (logique et vue de l\'écran)', async () => {
    for (const [jours, niveau, libelle] of [[12, 'orange', 'À surveiller'], [45, 'vert', 'OK'], [-5, 'rouge', 'Panne']]) {
      const b = monde();
      const r = await saisirAvec(b, { indicateurId: 'cle_n8n', echeance: jourDans(jours) });
      assert.equal(r.niveau, niveau, `${jours} jours`);
      const doc = b.docs.get('tableaudebord_indicateurs/cle_n8n');
      assert.equal(doc.niveau, niveau);
      assert.deepEqual(vuEcran(doc), { niveau, libelle }, `${jours} jours : ce que l'écran montre`);
    }
  });
  test('P6 la constante des 30 jours est celle de l\'écran (DELAI_ECHEANCE / JOUR de logique.js)', () => {
    assert.equal(DELAI_ECHEANCE_JOURS, L.DELAI_ECHEANCE / L.JOUR);
    assert.equal(DELAI_ECHEANCE_JOURS, 30);
  });
  test('P4 la péremption est de 100 jours (144 000 minutes, sous le maximum de la porte), et le rappel le dit', async () => {
    assert.equal(PERIME_APRES_MINUTES, 144_000);
    const b = monde();
    const r = await saisirAvec(b, { indicateurId: 'cle_n8n', echeance: jourDans(200) });
    assert.equal(r.rappel, RAPPEL);
    assert.match(RAPPEL, /Prochaine vérification conseillée dans 100 jours/);
    assert.equal(b.docs.get('tableaudebord_indicateurs/cle_n8n').perimeApresMinutes, 144_000);
    // 101 jours plus tard, même avec une échéance lointaine : gris « Relevé trop ancien »
    assert.equal(vuEcran(b.docs.get('tableaudebord_indicateurs/cle_n8n'), T0 + 101 * JOUR).niveau, 'gris');
    assert.equal(vuEcran(b.docs.get('tableaudebord_indicateurs/cle_n8n'), T0 + 99 * JOUR).niveau, 'vert');
  });
  test('le message stocké est « Saisi par <adresse> » seulement : jamais « dans N jours » figé en base', async () => {
    const b = monde();
    const r = await saisirAvec(b, { indicateurId: 'cle_n8n', echeance: jourDans(12) });
    assert.equal(r.message, `Saisi par ${MAIL}`);
    assert.equal(b.docs.get('tableaudebord_indicateurs/cle_n8n').message, `Saisi par ${MAIL}`);
    assert.doesNotMatch(JSON.stringify([...b.docs.values()]), /dans \d+ jours/);
  });
  test('une mesure : valeur écrite, pas de niveau, même message', async () => {
    const b = monde();
    const r = await saisirAvec(b, { indicateurId: 'stock_bordeaux', valeur: 37.5 });
    assert.deepEqual([r.niveau, r.message], [null, `Saisi par ${MAIL}`]);
    const doc = b.docs.get('tableaudebord_indicateurs/stock_bordeaux');
    assert.equal(doc.valeur, 37.5);
    assert.equal(doc.niveau, null);
    assert.equal(doc.perimeApresMinutes, 144_000);
    assert.deepEqual(b.docs.get([...b.docs.keys()].find((k) => k.startsWith('tableaudebord_releves/'))).avant, { valeur: 42 });
  });
});

describe('S2 un seul lot : l\'indicateur ET l\'historique', () => {
  test('S2 la saisie écrit en UN lot la mise à jour de l\'indicateur et la ligne d\'historique (saisiPar, avant, saisiLe, saisie: true)', async () => {
    const b = monde();
    await saisirAvec(b, { indicateurId: 'cle_n8n', echeance: jourDans(45), commentaire: 'Renouvelée dans la console' });
    assert.equal(b.lots.length, 1);
    assert.deepEqual(b.lots[0].map((o) => [o.type, o.chemin]), [
      ['maj', 'tableaudebord_indicateurs/cle_n8n'], ['creer', 'tableaudebord_releves/cle_n8n_20261017T100000'],
    ]);
    const ind = b.docs.get('tableaudebord_indicateurs/cle_n8n');
    assert.equal(ind.saisiPar, MAIL);
    assert.equal(ind.saisiLe.getTime(), T0);
    assert.equal(ind.releveLe.getTime(), T0);
    assert.equal(ind.echeance.toISOString().slice(0, 10), jourDans(45));
    const rel = b.docs.get('tableaudebord_releves/cle_n8n_20261017T100000');
    assert.equal(rel.saisie, true);
    assert.equal(rel.saisiPar, MAIL);
    assert.equal(rel.saisiLe.getTime(), T0);
    assert.deepEqual(rel.avant, { echeance: CLE_N8N.echeance });
    assert.equal(rel.echeance.toISOString().slice(0, 10), jourDans(45));
    assert.equal(rel.indicateurId, 'cle_n8n');
    assert.equal(rel.commentaire, 'Renouvelée dans la console');
    assert.equal(rel.proprietaire, 'interne');
    assert.equal(rel.niveau, 'vert');
  });
  test('S2 panne simulée du lot : ni l\'indicateur ni l\'historique ne sont écrits', async () => {
    const b = monde();
    const avant = JSON.stringify([...b.docs.entries()]);
    b.panne = true;
    await assert.rejects(() => saisirAvec(b, { indicateurId: 'cle_n8n', echeance: jourDans(45) }), /panne simulée/);
    assert.equal(JSON.stringify([...b.docs.entries()]), avant);
  });
  test('P9 deux saisies à la même seconde sur le même indicateur : la 2e échoue en entier (la création de l\'historique est refusée), rien ne change', async () => {
    const b = monde();
    await saisirAvec(b, { indicateurId: 'cle_n8n', echeance: jourDans(45) });
    const apres1 = JSON.stringify([...b.docs.entries()]);
    await assert.rejects(() => saisirAvec(b, { indicateurId: 'cle_n8n', echeance: jourDans(60) }), /déjà là/);
    assert.equal(JSON.stringify([...b.docs.entries()]), apres1);
  });
  test('chez un client, le paramètre « base » place les deux documents sous clients/<id>/', async () => {
    const b = baseEnMemoire({ 'clients/audrey/tableaudebord_indicateurs/cle_n8n': CLE_N8N });
    await saisirAvec(b, { indicateurId: 'cle_n8n', echeance: jourDans(45) }, { base: 'clients/audrey', proprietaire: 'audrey' });
    assert.deepEqual([...b.docs.keys()].sort(), ['clients/audrey/tableaudebord_indicateurs/cle_n8n', 'clients/audrey/tableaudebord_releves/cle_n8n_20261017T100000']);
  });
});

describe('S3 ce qui est refusé (rien n\'est écrit)', () => {
  const refuse = async (demande, motif, extra) => {
    const b = monde();
    const avant = JSON.stringify([...b.docs.entries()]);
    await assert.rejects(() => saisirAvec(b, demande, extra), (e) => e instanceof ErreurSaisie && motif.test(e.message), JSON.stringify(demande));
    assert.equal(JSON.stringify([...b.docs.entries()]), avant, 'rien n\'est écrit');
    assert.equal(b.lots.length, 0);
  };
  test('S3 un indicateur « auto » est refusé avec la phrase prévue', async () => {
    await refuse({ indicateurId: 'cle_github', echeance: jourDans(45) }, /^Cet indicateur est vérifié automatiquement : il n'y a rien à saisir\.$/);
  });
  test('S3 une donnée du mauvais type est refusée : une date pour une mesure, une valeur pour un état, ou les deux, ou aucune', async () => {
    await refuse({ indicateurId: 'stock_bordeaux', echeance: jourDans(45) }, /valeur/);
    await refuse({ indicateurId: 'cle_n8n', valeur: 12 }, /date d'échéance/);
    await refuse({ indicateurId: 'cle_n8n', echeance: jourDans(45), valeur: 12 }, /date d'échéance/);
    await refuse({ indicateurId: 'cle_n8n' }, /date d'échéance/);
    await refuse({ indicateurId: 'stock_bordeaux' }, /valeur/);
  });
  test('S3 un champ inconnu est refusé (dont ceux que seule la fonction pose : saisie, saisiPar, niveau)', async () => {
    for (const champ of ['niveau', 'saisie', 'saisiPar', 'saisiLe', 'proprietaire', 'message', 'methode']) {
      await refuse({ indicateurId: 'cle_n8n', echeance: jourDans(45), [champ]: 'vert' }, /^Demande inconnue\.$/);
    }
    await refuse(null, /^Demande inconnue\.$/);
    await refuse([], /^Demande inconnue\.$/);
  });
  test('S3 une note qui ressemble à un secret est refusée, et le message ne répète pas la note', async () => {
    for (const s of [`ghp_${'C'.repeat(36)}`, `cle-tdb.interne.${'A'.repeat(43)}`, 'x'.repeat(45), ['-----BEGIN', 'PRIVATE KEY-----'].join(' '), 'a'.repeat(201)]) {
      const b = monde();
      await assert.rejects(() => saisirAvec(b, { indicateurId: 'cle_n8n', echeance: jourDans(45), commentaire: `Voir ${s}` }),
        (e) => e instanceof ErreurSaisie && /^La note /.test(e.message) && !e.message.includes(s.slice(0, 12)));
      assert.equal(b.lots.length, 0);
    }
  });
  test('P5 format de date : tout ce qui n\'est pas AAAA-MM-JJ est refusé, et la date doit exister (2026-02-30 refusée)', async () => {
    for (const mauvaise of ['17/10/2026', '2026-1-5', '2026-10-17T00:00:00Z', '2026-02-30', '2026-13-01', '1999-12-31', '2100-01-02', 'demain', '']) {
      await refuse({ indicateurId: 'cle_n8n', echeance: mauvaise }, /date|Demande/);
    }
    assert.equal(lireJour('2100-01-01').toISOString(), '2100-01-01T00:00:00.000Z');
    assert.equal(lireJour('2028-02-29').toISOString(), '2028-02-29T00:00:00.000Z', 'année bissextile');
  });
  test('une valeur non finie ou hors bornes est refusée', async () => {
    for (const v of [Infinity, NaN, 1e13, -1e13, '12', null]) await refuse({ indicateurId: 'stock_bordeaux', valeur: v }, /./);
  });
  test('indicateur inexistant, identifiant piégé ou trop long : refusé', async () => {
    await refuse({ indicateurId: 'nexiste_pas', echeance: jourDans(45) }, /n'existe pas/);
    await refuse({ indicateurId: '../x', echeance: jourDans(45) }, /^Demande inconnue\.$/);
    await refuse({ indicateurId: 'a'.repeat(81), echeance: jourDans(45) }, /n'existe pas/);
  });
  test('un indicateur sans méthode connue ne se saisit pas', async () => {
    const b = baseEnMemoire({ 'tableaudebord_indicateurs/x': { ...CLE_N8N, methode: undefined } });
    await assert.rejects(() => saisirAvec(b, { indicateurId: 'x', echeance: jourDans(45) }), /ne se saisit pas/);
    assert.equal(b.lots.length, 0);
  });
});

describe('le code de la saisie', () => {
  const t = readFileSync(new URL('../scripts/porte/saisie-tableaudebord.js', import.meta.url), 'utf8');
  test('ne touche ni Firebase, ni le réseau, ni la console ; n\'importe que validation.js ; aucune suppression', () => {
    const code = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\bdb\b|firebase|firestore|recursiveDelete|\.delete\(|console\.|process\.env|eval\(|new Function|fetch\(/i);
    assert.deepEqual([...t.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]), ['./validation.js']);
  });
  test('les deux tables sont écrites dans le code, jamais reçues', () => {
    assert.deepEqual([...new Set([...t.matchAll(/'(tableaudebord_[a-z_]+)'/g)].map((m) => m[1]))].sort(), ['tableaudebord_indicateurs', 'tableaudebord_releves']);
  });
});
