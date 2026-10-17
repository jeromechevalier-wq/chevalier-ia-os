// La porte du tableau de bord (scripts/porte/porte-tableau.js, cles-tableau.js, actions-tableaudebord.js) : clés, contrôles dans l'ordre, isolation entre propriétaires,
// écriture des indicateurs et de l'historique, validation stricte, refus des secrets, plafonds, journal, passerelle HTTP. Tout en mémoire : ni Firebase ni réseau.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { genererCle, enregistrementDe, verifierCle } from '../scripts/porte/cles.js';
import {
  genererCleTableau, analyserCleTableau, enregistrementTableau, verifierCleTableau, PREFIXE_TABLEAU, USAGE_TABLEAU,
} from '../scripts/porte/cles-tableau.js';
import { executer } from '../scripts/porte/outil.js';
import { creerPorteTableau } from '../scripts/porte/porte-tableau.js';
import { creerGestionnaireHttp, creerLimiteurMemoire } from '../scripts/porte/porte.js';

const T0 = Date.parse('2026-10-17T10:00:00Z');
const OCTETS = Buffer.alloc(32, 9);

function creerBase() {
  const docs = new Map();
  const cles = new Map();
  return {
    docs, cles,
    lireCle: async (e) => cles.get(e) ?? null,
    majCle: async (e, p) => { cles.set(e, { ...cles.get(e), ...p }); },
    creerSiAbsent: async (c, d) => { if (docs.has(c)) return false; docs.set(c, d); return true; },
    lireDoc: async (c) => (docs.has(c) ? { ...docs.get(c) } : null),
    majDoc: async (c, p) => { if (!docs.has(c)) return false; docs.set(c, { ...docs.get(c), ...p }); return true; },
  };
}

function monde({ contexte = 'crm', modules = { interne: ['tableaudebord'], audrey: ['tableaudebord'], martin: ['tableaudebord'], sansmodule: [] }, parMinute = 1000 } = {}) {
  const base = creerBase();
  const temps = { t: T0 };
  const journaux = [];
  const porte = creerPorteTableau({
    contexte, donnees: base, modulesActifs: async (p) => modules[p] ?? [], maintenant: () => temps.t, journal: (e) => journaux.push(e),
    limiteur: creerLimiteurMemoire({ parMinute, maintenant: () => temps.t }),
  });
  const cles = {};
  for (const p of ['interne', 'audrey', 'martin', 'sansmodule']) {
    const cle = genererCleTableau(p);
    const e = enregistrementTableau(cle, p, new Date(T0 - 86_400_000));
    base.cles.set(e.id, e.donnees);
    cles[p] = { cle, empreinte: e.id };
  }
  const appeler = (cle, corps, extra = {}) => porte({ methode: 'POST', authorization: cle ? `Bearer ${cle}` : undefined, corps, ...extra });
  const ecrire = (cle, indicateurs) => appeler(cle, { action: 'indicateurs.ecrire', donnees: { indicateurs } });
  const releves = (cle, liste) => appeler(cle, { action: 'releves.ajouter', donnees: { releves: liste } });
  return { base, porte, cles, temps, journaux, appeler, ecrire, releves };
}

const GITHUB = {
  id: 'cles_github_lecture', tableau: 'technique', famille: 'cles', nom: 'Jeton de lecture GitHub', type: 'etat', niveau: 'vert',
  message: 'Répond, expire dans 331 jours', echeance: '2027-09-15', releveLe: '2026-10-17T09:55:00Z', perimeApresMinutes: 2880, methode: 'auto', source: 'interne-surveillance-cles', procedure: 'Protocole de vérification des clés',
};
const STOCK = { id: 'stock_bordeaux_2022', tableau: 'stocks', famille: 'stock', nom: 'Bordeaux 2022', type: 'mesure', valeur: 42, unite: 'bouteilles', objectif: 40, releveLe: '2026-10-17T09:00:00Z', methode: 'manuel' };

describe('tableau de bord : format et séparation des clés', () => {
  test('cle-tdb.<propriétaire>.<43 caractères>, analyse stricte', () => {
    const c = genererCleTableau('interne', OCTETS);
    assert.match(c, /^cle-tdb\.interne\.[A-Za-z0-9_-]{43}$/);
    assert.equal(PREFIXE_TABLEAU, 'cle-tdb');
    assert.deepEqual(analyserCleTableau(c), { proprietaire: 'interne' });
    for (const x of ['', null, undefined, 42, `${c} `, c.toUpperCase(), c.slice(0, -1), `${c}x`, `cle-n8n.interne.${c.split('.')[2]}`]) assert.equal(analyserCleTableau(x), null, String(x));
    assert.throws(() => genererCleTableau('Interne', OCTETS), /invalide/);
  });
  test('une clé n8n n\'ouvre pas la porte du tableau de bord, et la clé du tableau de bord n\'ouvre pas la porte n8n', async () => {
    const n8n = genererCle('interne', OCTETS);
    const tdb = genererCleTableau('interne', OCTETS);
    const base = creerBase();
    const e1 = enregistrementDe(n8n, 'interne'); base.cles.set(e1.id, e1.donnees);
    const e2 = enregistrementTableau(tdb, 'interne'); base.cles.set(e2.id, e2.donnees);
    assert.equal((await verifierCleTableau(n8n, base.lireCle)).raison, 'format');
    assert.equal((await verifierCle(tdb, base.lireCle)).raison, 'format');
    assert.equal((await verifierCleTableau(tdb, base.lireCle)).ok, true);
  });
  test('un document sans l\'usage « tableaudebord » est refusé, même avec la bonne forme', async () => {
    const tdb = genererCleTableau('interne', OCTETS);
    const e = enregistrementTableau(tdb, 'interne');
    const sansUsage = { ...e.donnees }; delete sansUsage.usage;
    assert.equal((await verifierCleTableau(tdb, async () => sansUsage)).raison, 'usage_different');
    assert.equal(e.donnees.usage, USAGE_TABLEAU);
    assert.equal((await verifierCleTableau(tdb, async () => ({ ...e.donnees, actif: false }))).raison, 'revoquee');
    assert.equal((await verifierCleTableau(tdb, async () => ({ ...e.donnees, proprietaire: 'martin' }))).raison, 'proprietaire_different');
  });
  test('l\'enregistrement ne contient aucune partie de la clé', () => {
    const c = genererCleTableau('interne', OCTETS);
    const e = enregistrementTableau(c, 'interne');
    assert.ok(!JSON.stringify(e).includes(c.split('.')[2]));
  });
});

describe('tableau de bord : contrôles de la porte', () => {
  test('sans clé, mauvaise clé, clé révoquée, clé n8n : toujours 401 « cle_refusee », même message', async () => {
    const m = monde();
    const n8n = genererCle('interne'); const e = enregistrementDe(n8n, 'interne'); m.base.cles.set(e.id, e.donnees);
    m.base.cles.set(m.cles.martin.empreinte, { ...m.base.cles.get(m.cles.martin.empreinte), actif: false });
    const reponses = [];
    for (const cle of [undefined, 'n-importe-quoi', genererCleTableau('interne'), m.cles.martin.cle, n8n]) {
      const r = await m.ecrire(cle, [GITHUB]);
      assert.equal(r.statut, 401);
      reponses.push(JSON.stringify(r.corps));
    }
    assert.equal(new Set(reponses).size, 1);
    assert.equal(m.base.docs.size, 0);
  });
  test('méthode autre que POST : 405', async () => {
    const m = monde();
    assert.equal((await m.appeler(m.cles.interne.cle, {}, { methode: 'GET' })).statut, 405);
  });
  test('dans le CRM (base 1), seul le propriétaire « interne » peut écrire', async () => {
    const m = monde();
    assert.equal((await m.ecrire(m.cles.audrey.cle, [GITHUB])).statut, 401);
    assert.equal((await m.ecrire(m.cles.interne.cle, [GITHUB])).statut, 200);
  });
  test('forme de la requête : corps non objet, champ inconnu (dont « proprietaire »), action absente ou inconnue', async () => {
    const m = monde();
    const c = m.cles.interne.cle;
    assert.equal((await m.appeler(c, null)).statut, 400);
    assert.equal((await m.appeler(c, [])).statut, 400);
    assert.equal((await m.appeler(c, { action: 'indicateurs.ecrire', proprietaire: 'audrey', donnees: { indicateurs: [GITHUB] } })).statut, 400);
    assert.equal((await m.appeler(c, { donnees: {} })).statut, 400);
    assert.equal((await m.appeler(c, { action: 'indicateurs.supprimer' })).statut, 400);
    assert.equal((await m.appeler(c, { action: 'toString' })).corps.erreur, 'action_inconnue');
    assert.equal((await m.appeler(c, { action: '__proto__' })).statut, 400);
    assert.equal(m.base.docs.size, 0);
  });
  test('module non actif pour ce propriétaire : 403', async () => {
    const m = monde({ contexte: 'plateforme' });
    const r = await m.ecrire(m.cles.sansmodule.cle, [GITHUB]);
    assert.equal(r.statut, 403);
    assert.equal(r.corps.erreur, 'module_non_actif');
  });
  test('plafond de requêtes par clé : 429 au-delà', async () => {
    const m = monde({ parMinute: 2 });
    assert.equal((await m.ecrire(m.cles.interne.cle, [GITHUB])).statut, 200);
    assert.equal((await m.ecrire(m.cles.interne.cle, [GITHUB])).statut, 200);
    assert.equal((await m.ecrire(m.cles.interne.cle, [GITHUB])).statut, 429);
  });
  test('la date de dernier usage de la clé est notée', async () => {
    const m = monde();
    await m.ecrire(m.cles.interne.cle, [GITHUB]);
    assert.ok(m.base.cles.get(m.cles.interne.empreinte).dernierUsage instanceof Date);
  });
});

describe('tableau de bord : indicateurs.ecrire', () => {
  test('un relevé plus ancien ou identique est ignoré en silence, un plus récent est écrit', async () => {
    const m = monde();
    const c = m.cles.interne.cle;
    await m.ecrire(c, [STOCK]);
    const chem = 'tableaudebord_indicateurs/stock_bordeaux_2022';
    let r = await m.ecrire(c, [{ ...STOCK, valeur: 1, releveLe: '2026-10-17T08:00:00Z' }]);
    assert.deepEqual(r.corps.resultat, { ecrits: 0, ignores: 1 });
    assert.equal(m.base.docs.get(chem).valeur, 42);
    r = await m.ecrire(c, [{ ...STOCK, valeur: 2 }]);
    assert.deepEqual(r.corps.resultat, { ecrits: 0, ignores: 1 }, 'égalité : ignoré');
    assert.equal(m.base.docs.get(chem).valeur, 42);
    r = await m.ecrire(c, [{ ...STOCK, valeur: 3, releveLe: '2026-10-17T09:30:00Z' }]);
    assert.deepEqual(r.corps.resultat, { ecrits: 1, ignores: 0 });
    assert.equal(m.base.docs.get(chem).valeur, 3);
  });
  test('la date existante peut être un objet Firestore (toMillis) ou un nombre', async () => {
    const m = monde();
    const c = m.cles.interne.cle;
    m.base.docs.set('tableaudebord_indicateurs/stock_bordeaux_2022', { valeur: 9, releveLe: { toMillis: () => Date.parse('2026-10-17T12:00:00Z') } });
    assert.deepEqual((await m.ecrire(c, [STOCK])).corps.resultat, { ecrits: 0, ignores: 1 });
    m.base.docs.set('tableaudebord_indicateurs/stock_bordeaux_2022', { valeur: 9, releveLe: Date.parse('2026-10-17T08:00:00Z') });
    assert.deepEqual((await m.ecrire(c, [STOCK])).corps.resultat, { ecrits: 1, ignores: 0 });
  });
  test('identifiants : majuscule ou forme de clé refusées, 80 caractères en minuscules acceptés', async () => {
    const m = monde();
    const c = m.cles.interne.cle;
    for (const id of ['Stock_Majuscule', 'AIza' + 'a'.repeat(35), 'cle-tdb.interne.abc', 'a'.repeat(40) + 'B']) {
      const r = await m.ecrire(c, [{ ...STOCK, id }]);
      assert.equal(r.statut, 400, id);
      assert.ok(!JSON.stringify(r.corps).includes(id), 'la valeur refusée n\'est jamais renvoyée');
    }
    assert.equal((await m.releves(c, [{ indicateurId: 'Stock', releveLe: '2026-10-17T09:00:00Z', valeur: 1 }])).statut, 400);
    const long = 'cles_compte_de_service_cle_firebase_chevalier_ia_os';
    assert.equal((await m.ecrire(c, [{ ...STOCK, id: long }])).statut, 200);
    const quatreVingts = 'a'.repeat(80);
    assert.equal((await m.ecrire(c, [{ ...STOCK, id: quatreVingts }])).statut, 200);
    assert.equal((await m.releves(c, [{ indicateurId: quatreVingts, releveLe: '2026-10-17T09:00:00Z', valeur: 1 }])).statut, 200);
  });
  test('une clé Google (AIza) est refusée dans le nom et le message', async () => {
    const m = monde();
    const c = m.cles.interne.cle;
    const aiza = 'AIza' + 'Sy'.repeat(17) + 'x';
    assert.equal((await m.ecrire(c, [{ ...STOCK, nom: `Stock ${aiza}` }])).statut, 400);
    assert.equal((await m.ecrire(c, [{ ...GITHUB, message: aiza }])).statut, 400);
    assert.equal(m.base.docs.size, 0);
  });
  test('écrit l\'état actuel à la racine (CRM), le propriétaire vient de la clé, l\'auteur est le script', async () => {
    const m = monde();
    const r = await m.ecrire(m.cles.interne.cle, [GITHUB, STOCK]);
    assert.equal(r.statut, 200);
    assert.deepEqual(r.corps.resultat, { ecrits: 2, ignores: 0 });
    const d = m.base.docs.get('tableaudebord_indicateurs/cles_github_lecture');
    assert.equal(d.proprietaire, 'interne');
    assert.equal(d.ecritPar, `github:${m.cles.interne.empreinte.slice(0, 8)}`);
    assert.equal(d.niveau, 'vert');
    assert.ok(d.echeance instanceof Date && d.echeance.toISOString().startsWith('2027-09-15'));
    assert.ok(d.releveLe instanceof Date);
    assert.equal(m.base.docs.get('tableaudebord_indicateurs/stock_bordeaux_2022').valeur, 42);
  });
  test('chez un client (plateforme), sous clients/<id>/ et jamais chez un autre', async () => {
    const m = monde({ contexte: 'plateforme' });
    await m.ecrire(m.cles.audrey.cle, [GITHUB]);
    await m.ecrire(m.cles.martin.cle, [{ ...GITHUB, id: 'autre' }]);
    assert.deepEqual([...m.base.docs.keys()].sort(), ['clients/audrey/tableaudebord_indicateurs/cles_github_lecture', 'clients/martin/tableaudebord_indicateurs/autre']);
    assert.equal(m.base.docs.get('clients/audrey/tableaudebord_indicateurs/cles_github_lecture').proprietaire, 'audrey');
  });
  test('un nouveau relevé met à jour l\'ancien : un champ disparu (échéance) est remis à null, il ne reste pas', async () => {
    const m = monde();
    await m.ecrire(m.cles.interne.cle, [GITHUB]);
    const { echeance, ...sans } = GITHUB;
    await m.ecrire(m.cles.interne.cle, [{ ...sans, niveau: 'rouge', message: 'Ne répond plus', releveLe: '2026-10-17T09:58:00Z' }]);
    const d = m.base.docs.get('tableaudebord_indicateurs/cles_github_lecture');
    assert.equal(d.niveau, 'rouge');
    assert.equal(d.echeance, null);
    assert.equal(d.valeur, null);
  });
  test('validation : champ inconnu, état sans niveau, mesure sans valeur, doublon, liste vide, trop longue, valeurs hors choix', async () => {
    const m = monde();
    const c = m.cles.interne.cle;
    const refus = [
      [{ ...GITHUB, couleur: 'rouge' }], [{ ...GITHUB, niveau: undefined }], [{ ...STOCK, valeur: undefined }], [GITHUB, GITHUB], [],
      [{ ...GITHUB, niveau: 'violet' }], [{ ...GITHUB, tableau: 'cuisine' }], [{ ...GITHUB, id: 'a b' }], [{ ...GITHUB, methode: 'magie' }], [{ ...GITHUB, valeur: Infinity }],
      [{ ...GITHUB, echeance: 'demain' }], [{ ...GITHUB, echeance: '2101-01-01' }], [{ ...GITHUB, releveLe: '2030-01-01' }],
      Array.from({ length: 101 }, (_, i) => ({ ...GITHUB, id: `i${i}` })),
    ];
    for (const liste of refus) {
      const r = await m.ecrire(c, liste);
      assert.equal(r.statut, 400, JSON.stringify(liste).slice(0, 80));
    }
    assert.equal(m.base.docs.size, 0);
  });
  test('une échéance dans le passé ou dans le futur est acceptée', async () => {
    const m = monde();
    assert.equal((await m.ecrire(m.cles.interne.cle, [{ ...GITHUB, echeance: '2026-01-01' }])).statut, 200);
    assert.equal((await m.ecrire(m.cles.interne.cle, [{ ...GITHUB, echeance: '2099-12-31' }])).statut, 200);
  });
  test('un texte libre qui ressemble à une clé ou à un secret est refusé et rien n\'est écrit', async () => {
    const m = monde();
    const secrets = [
      `cle-tdb.interne.${'A'.repeat(43)}`, `cle-n8n.interne.${'B'.repeat(43)}`, `ghp_${'C'.repeat(36)}`, `github_pat_${'D'.repeat(40)}`, ['-----BEGIN', 'PRIVATE KEY-----'].join(' '),
      `cia_${'E'.repeat(40)}`, `AKIA${'F'.repeat(16)}`, 'x'.repeat(45), `K00${'G'.repeat(28)}`,
    ];
    for (const s of secrets) {
      for (const champ of ['nom', 'message', 'procedure', 'source']) {
        const r = await m.ecrire(m.cles.interne.cle, [{ ...GITHUB, [champ]: `Voir ${s} ici`.slice(0, champ === 'procedure' ? 120 : 200) }]);
        assert.equal(r.statut, 400, `${champ} : ${s.slice(0, 12)}`);
      }
    }
    assert.equal((await m.ecrire(m.cles.interne.cle, [{ ...GITHUB, unite: '-----BEGIN' }])).statut, 400); // « unité » : champ court
    assert.equal(m.base.docs.size, 0);
  });
  test('les messages d\'erreur nomment le champ, jamais la valeur reçue', async () => {
    const m = monde();
    const r = await m.ecrire(m.cles.interne.cle, [{ ...GITHUB, message: `ghp_${'Z'.repeat(36)}` }]);
    assert.ok(!JSON.stringify(r.corps).includes('ZZZZ'));
    assert.match(r.corps.message, /message/);
  });
});

describe('tableau de bord : une saisie à l\'écran n\'est jamais écrasée par le script (S5, P2, P3)', () => {
  const CHEM = 'tableaudebord_indicateurs/cle_n8n';
  const MANUEL = { id: 'cle_n8n', tableau: 'technique', famille: 'cles', nom: 'Clé API de n8n', type: 'etat', niveau: 'orange', message: 'Date à vérifier', releveLe: '2026-10-18T05:00:00Z', perimeApresMinutes: 2880, methode: 'manuel', procedure: 'Protocole' };
  const saisie = (m, extra = {}) => m.base.docs.set(CHEM, { ...MANUEL, niveau: 'vert', message: 'Saisi par jerome.chevalier@gmail.com', echeance: new Date('2027-05-01'), releveLe: new Date('2026-10-17T09:00:00Z'), saisiPar: 'jerome.chevalier@gmail.com', saisiLe: new Date('2026-10-17T09:00:00Z'), proprietaire: 'interne', ...extra });
  test('S5 saisie, puis relevé du script le lendemain : la saisie reste intacte, « ignores: 1 »', async () => {
    const m = monde();
    saisie(m);
    const avant = JSON.stringify(m.base.docs.get(CHEM));
    const r = await m.ecrire(m.cles.interne.cle, [MANUEL]);
    assert.deepEqual(r.corps.resultat, { ecrits: 0, ignores: 1 });
    assert.equal(JSON.stringify(m.base.docs.get(CHEM)), avant);
  });
  test('S5 même règle pour la méthode « semi », même si l\'échéance saisie est dépassée (Jérôme ressaisit)', async () => {
    const m = monde();
    saisie(m, { echeance: new Date('2026-01-01'), niveau: 'rouge' });
    const r = await m.ecrire(m.cles.interne.cle, [{ ...MANUEL, methode: 'semi', nom: 'Autre nom', message: 'Autre message' }]);
    assert.deepEqual(r.corps.resultat, { ecrits: 0, ignores: 1 });
    assert.equal(m.base.docs.get(CHEM).nom, 'Clé API de n8n');
    assert.equal(m.base.docs.get(CHEM).message, 'Saisi par jerome.chevalier@gmail.com');
  });
  test('S5 un indicateur « auto » est toujours écrasé par le script, même s\'il porte une trace de saisie', async () => {
    const m = monde();
    saisie(m);
    const r = await m.ecrire(m.cles.interne.cle, [{ ...MANUEL, methode: 'auto', message: 'Répond' }]);
    assert.deepEqual(r.corps.resultat, { ecrits: 1, ignores: 0 });
    assert.equal(m.base.docs.get(CHEM).message, 'Répond');
  });
  test('P3 un indicateur devenu auto perd sa trace de saisie (saisiPar et saisiLe remis à null)', async () => {
    const m = monde();
    saisie(m);
    await m.ecrire(m.cles.interne.cle, [{ ...MANUEL, methode: 'auto' }]);
    assert.equal(m.base.docs.get(CHEM).saisiPar, null);
    assert.equal(m.base.docs.get(CHEM).saisiLe, null);
    // et il n'est plus protégé : un relevé manuel suivant (plus récent) s'écrit
    const r = await m.ecrire(m.cles.interne.cle, [{ ...MANUEL, releveLe: '2026-10-19T05:00:00Z' }]);
    assert.deepEqual(r.corps.resultat, { ecrits: 1, ignores: 0 });
  });
  test('S5 un manuel sans saisie reste mis à jour par le script comme avant', async () => {
    const m = monde();
    await m.ecrire(m.cles.interne.cle, [MANUEL]);
    const r = await m.ecrire(m.cles.interne.cle, [{ ...MANUEL, releveLe: '2026-10-19T05:00:00Z', message: 'Date à vérifier encore' }]);
    assert.deepEqual(r.corps.resultat, { ecrits: 1, ignores: 0 });
    assert.equal(m.base.docs.get(CHEM).message, 'Date à vérifier encore');
  });
  test('P2 la porte REFUSE « saisie », « saisiPar » et « saisiLe » envoyés par un script (indicateurs.ecrire et releves.ajouter), rien n\'est écrit', async () => {
    const m = monde();
    const c = m.cles.interne.cle;
    for (const champ of ['saisie', 'saisiPar', 'saisiLe']) {
      const v = champ === 'saisie' ? true : champ === 'saisiPar' ? 'jerome.chevalier@gmail.com' : '2026-10-17T09:00:00Z';
      assert.equal((await m.ecrire(c, [{ ...MANUEL, [champ]: v }])).statut, 400, `indicateurs.ecrire ${champ}`);
      assert.equal((await m.releves(c, [{ indicateurId: 'cle_n8n', releveLe: '2026-10-17T09:00:00Z', [champ]: v }])).statut, 400, `releves.ajouter ${champ}`);
    }
    assert.equal(m.base.docs.size, 0);
  });
});

describe('tableau de bord : releves.ajouter (historique)', () => {
  const R1 = { indicateurId: 'rdv_tenus', releveLe: '2026-10-17T10:15:00Z', valeur: 9, objectif: 12 };
  test('crée un point par relevé, avec l\'objectif en vigueur, le propriétaire de la clé et l\'auteur', async () => {
    const m = monde();
    const r = await m.releves(m.cles.interne.cle, [R1, { ...R1, indicateurId: 'ca_encaisse', valeur: 4200, objectif: 6000 }]);
    assert.deepEqual(r.corps.resultat, { crees: 2, dejaPresents: 0 });
    const d = m.base.docs.get('tableaudebord_releves/rdv_tenus_20261017T101500');
    assert.equal(d.valeur, 9);
    assert.equal(d.objectif, 12);
    assert.equal(d.proprietaire, 'interne');
    assert.match(d.saisiPar, /^github:/);
    assert.ok(d.releveLe instanceof Date);
  });
  test('appel répété : rien n\'est écrasé, « dejaPresents » le dit (un relevé déjà écrit ne change jamais)', async () => {
    const m = monde();
    await m.releves(m.cles.interne.cle, [R1]);
    const r = await m.releves(m.cles.interne.cle, [{ ...R1, valeur: 999 }]);
    assert.deepEqual(r.corps.resultat, { crees: 0, dejaPresents: 1 });
    assert.equal(m.base.docs.get('tableaudebord_releves/rdv_tenus_20261017T101500').valeur, 9);
  });
  test('un identifiant d\'indicateur de plus de 80 caractères est refusé pour l\'historique (le chemin dépasserait 100)', async () => {
    const m = monde();
    assert.equal((await m.releves(m.cles.interne.cle, [{ ...R1, indicateurId: 'x'.repeat(81) }])).statut, 400);
    assert.equal((await m.releves(m.cles.interne.cle, [{ ...R1, indicateurId: 'x'.repeat(80) }])).statut, 200);
  });
  test('validation : champ inconnu, doublon dans la liste, date absente, liste de plus de 200', async () => {
    const m = monde();
    const c = m.cles.interne.cle;
    for (const liste of [[{ ...R1, proprietaire: 'audrey' }], [R1, R1], [{ indicateurId: 'x', valeur: 1 }], Array.from({ length: 201 }, (_, i) => ({ ...R1, indicateurId: `i${i}` }))]) {
      assert.equal((await m.releves(c, liste)).statut, 400);
    }
    assert.equal(m.base.docs.size, 0);
  });
});

describe('tableau de bord : journal, erreurs, passerelle HTTP', () => {
  test('le journal ne contient ni la clé, ni les données reçues, ni les messages', async () => {
    const m = monde();
    await m.ecrire(m.cles.interne.cle, [GITHUB]);
    await m.ecrire('mauvaise', [GITHUB]);
    const texte = JSON.stringify(m.journaux);
    assert.ok(!texte.includes(m.cles.interne.cle.split('.')[2]));
    assert.ok(!texte.includes('Répond, expire'));
    assert.ok(!texte.includes('Jeton de lecture'));
    assert.deepEqual(m.journaux.map((j) => j.statut), [200, 401]);
    assert.equal(m.journaux[0].action, 'indicateurs.ecrire');
    assert.equal(m.journaux[0].module, 'tableaudebord');
  });
  test('une panne de la base : 500 « erreur_interne » sans détail', async () => {
    const m = monde();
    m.base.majDoc = async () => { throw new Error('boum secret interne'); };
    const r = await m.ecrire(m.cles.interne.cle, [GITHUB]);
    assert.equal(r.statut, 500);
    assert.equal(r.corps.erreur, 'erreur_interne');
    assert.ok(!JSON.stringify(r.corps).includes('boum'));
  });

  async function serveur(m) {
    const gestionnaire = creerGestionnaireHttp(m.porte, { chemins: ['/', '/tableau-de-bord'] });
    const s = createServer(gestionnaire);
    await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
    const url = `http://127.0.0.1:${s.address().port}`;
    return { url, fermer: () => new Promise((ok) => s.close(ok)) };
  }
  test('HTTP : /tableau-de-bord répond, /porte n\'existe pas ici, un navigateur (en-tête Origin) est refusé', async () => {
    const m = monde();
    const s = await serveur(m);
    try {
      const corps = JSON.stringify({ action: 'indicateurs.ecrire', donnees: { indicateurs: [GITHUB] } });
      const ent = { 'content-type': 'application/json', authorization: `Bearer ${m.cles.interne.cle}` };
      const ok = await fetch(`${s.url}/tableau-de-bord`, { method: 'POST', headers: ent, body: corps });
      assert.equal(ok.status, 200);
      assert.deepEqual((await ok.json()).resultat, { ecrits: 1, ignores: 0 });
      assert.equal((await fetch(`${s.url}/porte`, { method: 'POST', headers: ent, body: corps })).status, 404);
      assert.equal((await fetch(`${s.url}/tableau-de-bord`, { method: 'POST', headers: { ...ent, origin: 'https://exemple.test' }, body: corps })).status, 403);
      assert.equal((await fetch(`${s.url}/tableau-de-bord`, { method: 'GET' })).status, 405);
      const gros = await fetch(`${s.url}/tableau-de-bord`, { method: 'POST', headers: ent, body: 'x'.repeat(300 * 1024) });
      assert.equal(gros.status, 413);
      const nonJson = await fetch(`${s.url}/tableau-de-bord`, { method: 'POST', headers: ent, body: 'pas du json' });
      assert.equal(nonJson.status, 400);
    } finally { await s.fermer(); }
  });
  test('la porte n8n garde ses chemins par défaut (/ et /porte seulement)', async () => {
    const m = monde();
    const s = createServer(creerGestionnaireHttp(m.porte));
    await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
    try {
      const u = `http://127.0.0.1:${s.address().port}`;
      assert.equal((await fetch(`${u}/tableau-de-bord`, { method: 'POST', body: '{}' })).status, 404);
      assert.notEqual((await fetch(`${u}/porte`, { method: 'POST', body: '{}' })).status, 404);
    } finally { await new Promise((ok) => s.close(ok)); }
  });
});

describe('tableau de bord : le code', () => {
  const lire = (f) => readFileSync(new URL(`../scripts/porte/${f}`, import.meta.url), 'utf8');
  test('la logique ne touche ni Firebase ni le réseau ni la console, et n\'offre aucune suppression', () => {
    for (const f of ['cles-tableau.js', 'actions-tableaudebord.js', 'porte-tableau.js']) {
      assert.doesNotMatch(lire(f), /\bdb\b|firebase|firestore|recursiveDelete|\.delete\(|console\.|process\.env|eval\(|new Function|fetch\(/i, `${f} touche à l'extérieur`);
    }
  });
  test('les actions n\'écrivent que dans tableaudebord_indicateurs et tableaudebord_releves', () => {
    const t = lire('actions-tableaudebord.js');
    const tables = [...t.matchAll(/'(tableaudebord_[a-z_]+)'/g)].map((x) => x[1]).sort();
    assert.deepEqual([...new Set(tables)], ['tableaudebord_indicateurs', 'tableaudebord_releves']);
  });
});

describe('tableau de bord : l\'outil de clés (--usage tableaudebord)', () => {
  function atelier(cles = []) {
    const base = new Map(cles.map((c) => [c.id, c.donnees]));
    const sorties = [];
    const copies = [];
    const ctx = {
      sortie: (l) => sorties.push(l), copier: (t) => { copies.push(t); return true; }, maintenant: () => T0,
      store: {
        listerCles: async (p) => [...base.values()].filter((d) => !p || d.proprietaire === p),
        ecrireCle: async (id, d) => { base.set(id, d); }, majCle: async (id, p) => { base.set(id, { ...base.get(id), ...p }); },
        lireCle: async (id) => base.get(id) ?? null, clientExiste: async () => true,
      },
    };
    return { ctx, base, sorties, copies };
  }
  test('simulation par défaut : rien n\'est écrit', async () => {
    const a = atelier();
    assert.equal(await executer(['creer', '--projet', 'crm', '--proprietaire', 'interne', '--usage', 'tableaudebord'], a.ctx), 0);
    assert.equal(a.base.size, 0);
    assert.equal(a.copies.length, 0);
  });
  test('--ecrire : crée une clé cle-tdb copiée SANS « Bearer », enregistrée avec l\'usage, jamais affichée', async () => {
    const a = atelier();
    assert.equal(await executer(['creer', '--projet', 'crm', '--proprietaire', 'interne', '--usage', 'tableaudebord', '--ecrire'], a.ctx), 0);
    assert.equal(a.copies.length, 1);
    assert.match(a.copies[0], /^cle-tdb\.interne\.[A-Za-z0-9_-]{43}$/);
    const [doc] = [...a.base.values()];
    assert.equal(doc.usage, 'tableaudebord');
    assert.ok(!a.sorties.join('\n').includes(a.copies[0].split('.')[2]));
    assert.match(a.sorties.join('\n'), /CLE_TABLEAU_DE_BORD/);
  });
  test('sans --usage, la clé reste une clé n8n (comportement d\'avant inchangé)', async () => {
    const a = atelier();
    await executer(['creer', '--projet', 'crm', '--proprietaire', 'interne', '--ecrire'], a.ctx);
    assert.match(a.copies[0], /^Bearer cle-n8n\.interne\./);
    assert.equal([...a.base.values()][0].usage, undefined);
  });
  test('les 3 clés actives se comptent par usage : 3 clés n8n n\'empêchent pas d\'avoir une clé du tableau de bord', async () => {
    const trois = [1, 2, 3].map((i) => enregistrementDe(genererCle('interne', Buffer.alloc(32, i)), 'interne'));
    const a = atelier(trois);
    assert.equal(await executer(['creer', '--projet', 'crm', '--proprietaire', 'interne', '--usage', 'tableaudebord', '--ecrire'], a.ctx), 0);
    assert.equal(await executer(['creer', '--projet', 'crm', '--proprietaire', 'interne', '--ecrire'], a.ctx), 1);
  });
  test('usage inconnu, ou plateforme des clients : refusé, aucune clé créée', async () => {
    const a = atelier();
    assert.equal(await executer(['creer', '--projet', 'crm', '--proprietaire', 'interne', '--usage', 'autre', '--ecrire'], a.ctx), 1);
    assert.equal(await executer(['creer', '--projet', 'plateforme', '--proprietaire', 'audrey', '--usage', 'tableaudebord', '--ecrire'], a.ctx), 1);
    assert.equal(a.base.size, 0);
  });
});
