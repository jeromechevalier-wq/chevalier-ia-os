// Outil des clés (scripts/porte/outil.js) avec un stockage en mémoire : garde-fous, simulation, remise de la clé, rotation, révocation.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { executer, lireArguments } from '../scripts/porte/outil.js';
import { analyserCle, empreinte, verifierCle } from '../scripts/porte/cles.js';

const T0 = Date.parse('2026-10-14T10:00:00Z');

function monde({ clients = ['audrey', 'martin'], cles = [] } = {}) {
  const docs = new Map(cles.map(({ id, ...d }) => [id, d]));
  const sortie = [];
  const presse = { contenu: null, panne: false };
  const store = {
    async listerCles(p) { return [...docs].filter(([, d]) => !p || d.proprietaire === p).map(([id, d]) => ({ ...d, id })); },
    async lireCle(id) { return docs.has(id) ? { ...docs.get(id), id } : null; },
    async ecrireCle(id, d) { if (docs.has(id)) throw new Error('existe'); docs.set(id, d); },
    async majCle(id, p) { docs.set(id, { ...docs.get(id), ...p }); },
    async clientExiste(id) { return clients.includes(id); },
  };
  const ctx = {
    store, sortie: (l) => sortie.push(l), maintenant: () => T0,
    copier: (t) => { if (presse.panne) return false; presse.contenu = t; return true; },
    erreurIdentifiant: (id) => (['tous', 'admin', 'clients'].includes(id) ? `« ${id} » est réservé.` : null),
  };
  return { docs, sortie, presse, ctx, texte: () => sortie.join('\n') };
}
const doc = (id, p, extra = {}) => ({ id, proprietaire: p, idCourt: id.slice(0, 8), actif: true, creeLe: new Date(T0 - 86_400_000 * 30), dernierUsage: null, revoqueLe: null, ...extra });
const ID = (c) => c.repeat(8) + '0'.repeat(56); // empreinte factice dont l'identifiant court est c × 8

describe('outil des clés : arguments', () => {
  test('option inconnue, valeur manquante ou argument seul : erreur claire, jamais ignorés', () => {
    assert.match(lireArguments(['bidule']).erreur, /Commande inconnue/);
    assert.match(lireArguments([]).erreur, /Commande inconnue/);
    assert.match(lireArguments(['creer', '--nimporte']).erreur, /Option inconnue/);
    assert.match(lireArguments(['creer', '--projet']).erreur, /attend une valeur/);
    assert.match(lireArguments(['creer', '--projet', '--ecrire']).erreur, /attend une valeur/);
    assert.match(lireArguments(['creer', 'audrey']).erreur, /Argument inattendu/);
    assert.deepEqual(lireArguments(['creer', '--projet', 'crm', '--ecrire']).options, { projet: 'crm', ecrire: true });
  });
});

describe('outil des clés : garde-fous communs', () => {
  test('projet obligatoire et connu ; propriétaire obligatoire (sauf lister)', async () => {
    const m = monde();
    assert.equal(await executer(['creer', '--proprietaire', 'audrey'], m.ctx), 1);
    assert.equal(await executer(['creer', '--projet', 'autre', '--proprietaire', 'audrey'], m.ctx), 1);
    assert.equal(await executer(['creer', '--projet', 'plateforme'], m.ctx), 1);
    assert.equal(await executer(['lister', '--projet', 'plateforme'], m.ctx), 0);
    assert.equal(m.docs.size, 0);
  });
  test('base 1 : seul le propriétaire « interne » ; base 2 : un client qui existe, et jamais un mot réservé', async () => {
    const m = monde();
    assert.equal(await executer(['creer', '--projet', 'crm', '--proprietaire', 'audrey', '--ecrire'], m.ctx), 1);
    assert.equal(await executer(['creer', '--projet', 'plateforme', '--proprietaire', 'inconnu', '--ecrire'], m.ctx), 1);
    assert.match(m.texte(), /n'existe pas/);
    assert.equal(await executer(['creer', '--projet', 'plateforme', '--proprietaire', 'tous', '--ecrire'], m.ctx), 1);
    assert.equal(await executer(['creer', '--projet', 'plateforme', '--proprietaire', 'Audrey', '--ecrire'], m.ctx), 1);
    assert.equal(m.docs.size, 0, 'aucune clé créée par un refus');
  });
});

describe('outil des clés : créer', () => {
  test('sans --ecrire : simulation, rien n\'est écrit, rien n\'est copié', async () => {
    const m = monde();
    assert.equal(await executer(['creer', '--projet', 'plateforme', '--proprietaire', 'audrey'], m.ctx), 0);
    assert.equal(m.docs.size, 0);
    assert.equal(m.presse.contenu, null);
    assert.match(m.texte(), /simulation/);
  });
  test('avec --ecrire : clé copiée (jamais affichée), seule l\'empreinte est enregistrée, et la clé marche', async () => {
    const m = monde();
    assert.equal(await executer(['creer', '--projet', 'plateforme', '--proprietaire', 'audrey', '--ecrire'], m.ctx), 0);
    const cle = m.presse.contenu;
    assert.deepEqual(analyserCle(cle), { proprietaire: 'audrey' });
    assert.ok(!m.texte().includes(cle) && !m.texte().includes(cle.split('.')[2]), 'la clé n\'est pas affichée');
    assert.equal(m.docs.size, 1);
    assert.ok(m.docs.has(empreinte(cle)));
    assert.ok(!JSON.stringify([...m.docs]).includes(cle.split('.')[2]), 'aucune partie secrète en base');
    const r = await verifierCle(cle, async (e) => m.docs.get(e) ?? null);
    assert.equal(r.ok, true);
  });
  test('--afficher : la clé est montrée une fois et rien n\'est copié', async () => {
    const m = monde();
    await executer(['creer', '--projet', 'crm', '--proprietaire', 'interne', '--ecrire', '--afficher'], m.ctx);
    const trouvee = m.texte().match(/cle-n8n\.interne\.[A-Za-z0-9_-]{43}/);
    assert.ok(trouvee);
    assert.equal(m.presse.contenu, null);
    assert.ok(m.docs.has(empreinte(trouvee[0])));
  });
  test('presse-papiers en panne : rien n\'est créé (pas de clé fantôme)', async () => {
    const m = monde();
    m.presse.panne = true;
    assert.equal(await executer(['creer', '--projet', 'plateforme', '--proprietaire', 'audrey', '--ecrire'], m.ctx), 1);
    assert.equal(m.docs.size, 0);
    assert.match(m.texte(), /--afficher/);
  });
  test('changer de clé : l\'ancienne reste valable, la nouvelle marche, et l\'outil explique comment révoquer', async () => {
    const m = monde({ cles: [doc(ID('a'), 'audrey', { dernierUsage: new Date(T0 - 3600_000) })] });
    assert.equal(await executer(['creer', '--projet', 'plateforme', '--proprietaire', 'audrey', '--ecrire'], m.ctx), 0);
    assert.equal(m.docs.size, 2);
    assert.equal(m.docs.get(ID('a')).actif, true, 'l\'ancienne n\'est pas touchée');
    assert.match(m.texte(), /restent valables/);
    assert.match(m.texte(), /lister --projet plateforme --proprietaire audrey/);
  });
  test('quatrième clé active refusée, avec la liste des clés à révoquer ; les clés d\'un autre client ne comptent pas', async () => {
    const m = monde({ cles: [doc(ID('a'), 'audrey'), doc(ID('b'), 'audrey'), doc(ID('c'), 'audrey'), doc(ID('d'), 'audrey', { actif: false }), doc(ID('e'), 'martin')] });
    assert.equal(await executer(['creer', '--projet', 'plateforme', '--proprietaire', 'audrey', '--ecrire'], m.ctx), 1);
    assert.equal(m.docs.size, 5);
    assert.match(m.texte(), /3 clés actives/);
    const m2 = monde({ cles: [doc(ID('a'), 'audrey'), doc(ID('b'), 'audrey'), doc(ID('c'), 'audrey')] });
    assert.equal(await executer(['creer', '--projet', 'plateforme', '--proprietaire', 'martin', '--ecrire'], m2.ctx), 0);
  });
});

describe('outil des clés : longueur de l\'identifiant', () => {
  test('un client de plus de 17 caractères ne peut pas avoir de clé (l\'étiquette n8n client-<id> dépasserait 24 caractères)', async () => {
    const m = monde({ clients: ['a'.repeat(17), 'a'.repeat(18)] });
    assert.equal(await executer(['creer', '--projet', 'plateforme', '--proprietaire', 'a'.repeat(18), '--ecrire'], m.ctx), 1);
    assert.match(m.texte(), /24 caractères/);
    assert.equal(m.docs.size, 0);
    assert.equal(await executer(['creer', '--projet', 'plateforme', '--proprietaire', 'a'.repeat(17), '--ecrire'], m.ctx), 0);
  });
});

describe('outil des clés : lister', () => {
  test('montre l\'identifiant court, l\'état, le dernier usage ; jamais la clé ni l\'empreinte complète', async () => {
    const m = monde({ cles: [doc(ID('a'), 'audrey', { dernierUsage: new Date(T0 - 3600_000) }), doc(ID('b'), 'audrey', { actif: false }), doc(ID('c'), 'martin')] });
    assert.equal(await executer(['lister', '--projet', 'plateforme', '--proprietaire', 'audrey'], m.ctx), 0);
    const t = m.texte();
    assert.match(t, /aaaaaaaa +active +utilisée aujourd'hui +\(EN SERVICE\)/);
    assert.match(t, /bbbbbbbb +révoquée/);
    assert.ok(!t.includes('cccccccc'), 'pas celles d\'un autre client');
    assert.ok(!t.includes(ID('a')), 'jamais l\'empreinte complète');
  });
});

describe('outil des clés : révoquer', () => {
  const avec = (extra = {}) => monde({ cles: [doc(ID('a'), 'audrey', extra), doc(ID('b'), 'audrey'), doc(ID('c'), 'martin')] });
  test('identifiant court obligatoire et exact, limité au propriétaire demandé', async () => {
    const m = avec();
    assert.equal(await executer(['revoquer', '--projet', 'plateforme', '--proprietaire', 'audrey', '--ecrire'], m.ctx), 1);
    assert.equal(await executer(['revoquer', '--projet', 'plateforme', '--proprietaire', 'audrey', '--cle', 'zzzzzzzz', '--ecrire'], m.ctx), 1);
    assert.equal(await executer(['revoquer', '--projet', 'plateforme', '--proprietaire', 'audrey', '--cle', 'cccccccc', '--ecrire'], m.ctx), 1, 'la clé de martin n\'est pas visible depuis audrey');
    assert.equal(m.docs.get(ID('c')).actif, true);
  });
  test('simulation par défaut ; avec --ecrire la clé est marquée révoquée (jamais supprimée) et refusée aussitôt', async () => {
    const m = avec();
    assert.equal(await executer(['revoquer', '--projet', 'plateforme', '--proprietaire', 'audrey', '--cle', 'aaaaaaaa'], m.ctx), 0);
    assert.equal(m.docs.get(ID('a')).actif, true);
    assert.equal(await executer(['revoquer', '--projet', 'plateforme', '--proprietaire', 'audrey', '--cle', 'aaaaaaaa', '--ecrire'], m.ctx), 0);
    assert.equal(m.docs.get(ID('a')).actif, false);
    assert.equal(m.docs.get(ID('a')).revoqueLe.getTime(), T0);
    assert.equal(m.docs.size, 3, 'aucune suppression');
    assert.equal(m.docs.get(ID('b')).actif, true, 'l\'autre clé n\'est pas touchée');
  });
  test('clé en service (utilisée il y a moins de 24 h) : refus sans --forcer, accepté avec', async () => {
    const m = avec({ dernierUsage: new Date(T0 - 2 * 3600_000) });
    assert.equal(await executer(['revoquer', '--projet', 'plateforme', '--proprietaire', 'audrey', '--cle', 'aaaaaaaa', '--ecrire'], m.ctx), 1);
    assert.match(m.texte(), /arrêtera les workflows/);
    assert.equal(m.docs.get(ID('a')).actif, true);
    assert.equal(await executer(['revoquer', '--projet', 'plateforme', '--proprietaire', 'audrey', '--cle', 'aaaaaaaa', '--ecrire', '--forcer'], m.ctx), 0);
    assert.equal(m.docs.get(ID('a')).actif, false);
  });
  test('dernière clé active : avertissement dit clairement ; déjà révoquée : rien à faire', async () => {
    const m = monde({ cles: [doc(ID('a'), 'audrey'), doc(ID('b'), 'audrey', { actif: false })] });
    await executer(['revoquer', '--projet', 'plateforme', '--proprietaire', 'audrey', '--cle', 'aaaaaaaa'], m.ctx);
    assert.match(m.texte(), /dernière clé active/);
    const m2 = monde({ cles: [doc(ID('b'), 'audrey', { actif: false })] });
    assert.equal(await executer(['revoquer', '--projet', 'plateforme', '--proprietaire', 'audrey', '--cle', 'bbbbbbbb', '--ecrire'], m2.ctx), 0);
    assert.match(m2.texte(), /déjà révoquée/);
  });
});

describe('outil des clés : le point d\'entrée', () => {
  test('ne supprime rien, n\'écrit nulle part ailleurs que plateforme_cles, et n\'écrase jamais (create)', async () => {
    const { readFileSync } = await import('node:fs');
    const s = readFileSync(new URL('../scripts/cles.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(s, /\.delete\(|recursiveDelete|\.set\(/);
    assert.match(s, /\.create\(donnees\)/);
    assert.deepEqual([...s.matchAll(/collection\('([a-z_]+)'\)/g)].map((m) => m[1]), ['clients']);
    assert.match(s, /db\.collection\(TABLE_CLES\)|const table = db\.collection\(TABLE_CLES\)/);
    const o = readFileSync(new URL('../scripts/porte/outil.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(o, /console\.|process\.env|writeFile/);
  });
});
