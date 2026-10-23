// Copie os_objectifs -> os_kpi et os_objectifs_saisies -> os_kpi_saisies (scripts/kpi/migration.js) avec un faux Firestore en mémoire.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { executer, lireArguments, egal, documentCible } from '../scripts/kpi/migration.js';

const SECRET = 'Libellé très privé 4242';
const horodatage = (ms) => ({ toMillis: () => ms });
const copie = (d) => ({ ...d }); // les horodatages (objets immuables) sont partagés, pas clonés

function monde({ anciens = {}, nouveaux = {} } = {}) {
  const tables = new Map();
  for (const [nom, docs] of [...Object.entries(anciens), ...Object.entries(nouveaux)]) {
    const m = tables.get(nom) ?? new Map();
    for (const [id, d] of Object.entries(docs)) m.set(id, copie(d));
    tables.set(nom, m);
  }
  const ecritures = [];
  const sortie = [];
  const t = (nom) => { if (!tables.has(nom)) tables.set(nom, new Map()); return tables.get(nom); };
  const store = {
    async lire(c) { return [...(tables.get(c) ?? [])].map(([id, data]) => ({ id, data })); },
    async lireUn(c, id) { return tables.get(c)?.get(id) ?? null; },
    async ecrire(c, id, d, { ecraser }) {
      if (!ecraser && t(c).has(id)) throw new Error('existe déjà');
      ecritures.push([c, id]);
      t(c).set(id, copie(d));
    },
  };
  const instantane = () => JSON.stringify([...tables].map(([n, m]) => [n, [...m]]));
  return { t, ecritures, sortie, ctx: { store, sortie: (l) => sortie.push(l) }, texte: () => sortie.join('\n'), instantane };
}
const ANCIENS = () => ({
  os_objectifs: {
    a: { id: 'a', libelle: SECRET, type: 'manuel', cible: 7, ordre: 1, actif: true },
    b: { id: 'b', libelle: 'autre', type: 'calcule', cible: 3, ordre: 2, actif: true, module: 'crm', accueil: false },
  },
  os_objectifs_saisies: { a_2026_10: { objectifId: 'a', mois: '2026-10', valeur: 123456, maj: horodatage(1000) } },
});

describe('migration KPI : arguments', () => {
  test("option inconnue, argument seul, --ecraser sans --ecrire, autre projet : erreur claire", () => {
    assert.match(lireArguments(['--nimporte']).erreur, /Option inconnue/);
    assert.match(lireArguments(['bidule']).erreur, /Argument inattendu/);
    assert.match(lireArguments(['--ecraser']).erreur, /--ecrire/);
    assert.match(lireArguments(['--projet', 'plateforme']).erreur, /base 1/);
    assert.deepEqual(lireArguments(['--projet', 'crm', '--ecrire']).options, { ecrire: true });
  });
});

describe('migration KPI : copie', () => {
  test("la simulation (par défaut) n'écrit rien et affiche les nombres", async () => {
    const m = monde({ anciens: ANCIENS() });
    const avant = m.instantane();
    assert.equal(await executer([], m.ctx), 0);
    assert.equal(m.ecritures.length, 0);
    assert.equal(m.instantane(), avant);
    assert.match(m.texte(), /SIMULATION/);
    assert.match(m.texte(), /os_objectifs -> os_kpi : 2 documents dans l'ancienne table, 2 à copier/);
    assert.match(m.texte(), /os_objectifs_saisies -> os_kpi_saisies : 1 documents dans l'ancienne table, 1 à copier/);
  });

  test("--ecrire copie les deux tables (mêmes identifiants et champs) et ajoute module/accueil seulement s'ils manquent", async () => {
    const m = monde({ anciens: ANCIENS() });
    assert.equal(await executer(['--ecrire'], m.ctx), 0);
    assert.deepEqual(m.t('os_kpi').get('a'), { id: 'a', libelle: SECRET, type: 'manuel', cible: 7, ordre: 1, actif: true, module: 'os', accueil: true });
    assert.equal(m.t('os_kpi').get('b').module, 'crm'); // déjà présent : pas touché
    assert.equal(m.t('os_kpi').get('b').accueil, false);
    assert.deepEqual(m.t('os_kpi_saisies').get('a_2026_10'), m.t('os_objectifs_saisies').get('a_2026_10'));
    assert.deepEqual([...m.t('os_kpi').keys()].sort(), ['a', 'b']);
  });

  test("les anciennes tables restent intactes (jamais modifiées ni supprimées)", async () => {
    const m = monde({ anciens: ANCIENS() });
    const photo = () => JSON.stringify([...m.t('os_objectifs')]) + JSON.stringify([...m.t('os_objectifs_saisies')]);
    const avant = photo();
    await executer(['--ecrire'], m.ctx);
    await executer(['--ecrire', '--ecraser'], m.ctx);
    assert.equal(photo(), avant);
    assert.ok(m.ecritures.every(([c]) => c === 'os_kpi' || c === 'os_kpi_saisies'), "on n'écrit que dans les nouvelles tables");
  });

  test('rejouer est idempotent : pas de doublon, aucune réécriture', async () => {
    const m = monde({ anciens: ANCIENS() });
    await executer(['--ecrire'], m.ctx);
    const apres = m.instantane();
    const nb = m.ecritures.length;
    m.sortie.length = 0;
    assert.equal(await executer(['--ecrire'], m.ctx), 0);
    assert.equal(m.ecritures.length, nb);
    assert.equal(m.instantane(), apres);
    assert.match(m.texte(), /0 copiés, 2 déjà identiques/);
  });

  test('un document divergent de la nouvelle table est refusé et signalé, sans rien écraser (code 1)', async () => {
    const m = monde({ anciens: ANCIENS(), nouveaux: { os_kpi: { a: { id: 'a', libelle: 'modifié ailleurs', module: 'os', accueil: true } } } });
    assert.equal(await executer(['--ecrire'], m.ctx), 1);
    assert.equal(m.t('os_kpi').get('a').libelle, 'modifié ailleurs');
    assert.match(m.texte(), /1 différents \(refusés\)/);
    assert.match(m.texte(), /laissés tels quels[^\n]*: a$/m);
    assert.ok(m.t('os_kpi').has('b'), 'les autres documents sont copiés quand même');
  });

  test('--ecraser remplace le document divergent', async () => {
    const m = monde({ anciens: ANCIENS(), nouveaux: { os_kpi: { a: { id: 'a', libelle: 'modifié ailleurs' } } } });
    assert.equal(await executer(['--ecrire', '--ecraser'], m.ctx), 0);
    assert.equal(m.t('os_kpi').get('a').libelle, SECRET);
  });

  test('la sortie ne contient aucune valeur de document (libellé, montant) : seulement nombres et identifiants', async () => {
    const m = monde({ anciens: ANCIENS(), nouveaux: { os_kpi: { a: { id: 'a', libelle: 'divergent-xyz' } } } });
    await executer([], m.ctx);
    await executer(['--ecrire'], m.ctx);
    const t = m.texte();
    assert.doesNotMatch(t, new RegExp(SECRET));
    assert.doesNotMatch(t, /123456|autre|divergent-xyz/);
  });

  test('tables vides : 0 partout, aucune erreur', async () => {
    const m = monde();
    assert.equal(await executer(['--ecrire'], m.ctx), 0);
    assert.match(m.texte(), /0 documents dans l'ancienne table, 0 copiés/);
  });

  test("égalité : horodatages comparés par instant, tableaux et objets en profondeur ; documentCible n'écrase pas un champ présent", () => {
    assert.ok(egal({ m: horodatage(5), l: [1, { z: 2 }] }, { m: horodatage(5), l: [1, { z: 2 }] }));
    assert.ok(!egal({ m: horodatage(5) }, { m: horodatage(6) }));
    assert.ok(!egal({ a: 1 }, { a: 1, b: 2 }));
    assert.deepEqual(documentCible({ accueil: false }, { module: 'os', accueil: true }), { accueil: false, module: 'os' });
  });
});
