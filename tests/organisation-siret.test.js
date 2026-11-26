// SIRET, SIREN (calculé) et n° de TVA sur la fiche Organisation (décision de Jérôme du 26/11/2026) : la règle pure commune (js/modules/crm/logique.js,
// copiée dans functions/partage/) et les outils MCP creer_organisation, modifier_organisation et lire_organisation, de bout en bout par le protocole.
// Le nom de chaque test commence par le numéro du critère. Valeurs inventées : SIRET 123 456 789 00012, TVA FR12123456789. Aucune donnée réelle.
import './_fiche-essai.js'; // chantier 0 : fiche reglages_maison des essais, branchée en mémoire sur le serveur
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import * as L from '../functions/partage/logique.js';
import * as LE from '../js/modules/crm/logique.js';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerLimiteur } from '../functions/src/securite/limites.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';

process.env.GCLOUD_PROJECT = 'chevalier-ia-os';

const JETONS = { lecteur: `cia_${'L'.repeat(43)}`, biblio: `cia_${'H'.repeat(43)}` };
const entree = (jeton, nom, profil) => ({ jeton: nom, acteur: nom, profil, empreinte: empreinte(jeton), actif: true });
const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });

async function demarrer() {
  const collections = structuredClone(base);
  const donnees = creerAccesMemoire(collections);
  const horloge = { t: MAINTENANT.getTime() };
  const secret = JSON.stringify([entree(JETONS.lecteur, 'lecteur-essai', 'lecteur'), entree(JETONS.biblio, 'hermes-bibliothecaire', 'bibliothecaire')]);
  const magasin = creerMagasin({ lire: async () => secret, dureeCacheMs: 0 });
  const limiteur = creerLimiteur({ donnees, maintenant: () => horloge.t });
  const gestionnaire = creerGestionnaire({ magasin, donnees, limiteur, maintenant: () => horloge.t, journal: () => {} });
  const serveur = createServer((req, res) => {
    const m = [];
    req.on('data', (x) => m.push(x));
    req.on('end', () => {
      const texte = Buffer.concat(m).toString('utf8');
      try { req.body = texte ? JSON.parse(texte) : undefined; } catch { req.body = undefined; }
      gestionnaire(req, res);
    });
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  arrets.push(() => new Promise((ok) => serveur.close(ok)));
  const url = `http://127.0.0.1:${serveur.address().port}/mcp`;
  let n = 0;
  const appeler = async (jeton, nom, args = {}) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${JETONS[jeton]}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: nom, arguments: args } }),
    });
    const corps = await r.json();
    if (corps.error) return { isError: true, texte: corps.error.message };
    const texte = corps.result.content?.[0]?.text ?? '';
    let data;
    try { data = JSON.parse(texte); } catch { data = undefined; }
    return { isError: !!corps.result.isError, texte, data };
  };
  return { collections, appeler, doc: (nom, id) => collections[nom]?.find((d) => d.id === id) };
}
const ok = (r) => { assert.equal(r.isError, false, r.texte); return r.data; };
const refuse = (r, motif) => { assert.equal(r.isError, true, `devait être refusé : ${r.texte}`); if (motif) assert.match(r.texte, motif); };

describe('Règle pure identifiantsOrganisation (écran et serveur)', () => {
  test('2 « 123 456 789 00012 » donne siret 12345678900012 et siren 123456789 ; vide efface les deux ; affichage avec espaces', () => {
    assert.deepEqual(L.identifiantsOrganisation({ siret: '123 456 789 00012' }), { siret: '12345678900012', siren: '123456789' });
    assert.deepEqual(L.identifiantsOrganisation({ siret: '123.456.789-00012' }), { siret: '12345678900012', siren: '123456789' });
    assert.deepEqual(L.identifiantsOrganisation({ siret: '' }), { siret: '', siren: '' });
    assert.deepEqual(L.identifiantsOrganisation({ siret: '   ' }), { siret: '', siren: '' });
    assert.deepEqual(L.identifiantsOrganisation({}), {}, 'un champ non donné ne sort pas (patch partiel)');
    assert.equal(L.formaterSiret('12345678900012'), '123 456 789 00012');
    assert.equal(L.formaterSiret('123 456 789 00012'), '123 456 789 00012');
    assert.equal(L.formaterSiren('123456789'), '123 456 789');
  });

  test('3 SIRET de 13 chiffres ou avec lettres refusé ; TVA « 12345 » et « FR123 » refusés ; « fr 12 345678901 » donne FR12345678901', () => {
    for (const mauvais of ['123 456 789 0001', '1234567890001A', '123456789000123']) {
      assert.throws(() => L.identifiantsOrganisation({ siret: mauvais }), (e) => e.saisie === true && e.message === L.MESSAGE_SIRET_INVALIDE, mauvais);
    }
    assert.throws(() => L.identifiantsOrganisation({ numeroTva: '12345' }), (e) => e.saisie === true && e.message === L.MESSAGE_TVA_INVALIDE);
    assert.throws(() => L.identifiantsOrganisation({ numeroTva: 'FR123' }), (e) => e.saisie === true && /TVA/.test(e.message));
    assert.throws(() => L.identifiantsOrganisation({ numeroTva: 'FR1212345678' }), (e) => e.saisie === true, 'un numéro FR fait 13 caractères');
    assert.deepEqual(L.identifiantsOrganisation({ numeroTva: 'fr 12 345678901' }), { numeroTva: 'FR12345678901' });
    assert.deepEqual(L.identifiantsOrganisation({ numeroTva: 'be.0123456789' }), { numeroTva: 'BE0123456789' }, 'un autre pays : 2 lettres puis 2 à 13 caractères');
    assert.deepEqual(L.identifiantsOrganisation({ numeroTva: '' }), { numeroTva: '' });
    assert.deepEqual(L.validerOrganisation({ nom: 'X', siret: '123', numeroTva: '12345' }), { siret: L.MESSAGE_SIRET_INVALIDE, numeroTva: L.MESSAGE_TVA_INVALIDE });
    assert.deepEqual(L.validerOrganisation({ nom: 'X' }), {});
  });

  test('5 la copie du serveur est la même règle que l’écran ; une nouvelle organisation part avec des champs vides', () => {
    assert.equal(L.identifiantsOrganisation.toString(), LE.identifiantsOrganisation.toString());
    const o = L.nouvelleOrganisation({ nom: 'Atelier' }, { auteur: 'x' });
    assert.deepEqual([o.siret, o.siren, o.numeroTva], ['', '', '']);
    const o2 = L.nouvelleOrganisation({ nom: 'Atelier', siret: '123 456 789 00012', numeroTva: 'fr12123456789' }, { auteur: 'x' });
    assert.deepEqual([o2.siret, o2.siren, o2.numeroTva], ['12345678900012', '123456789', 'FR12123456789']);
    assert.deepEqual(L.erreursIdentifiantsOrganisation({ nom: 'Ancienne fiche' }), {}, 'une fiche sans ces champs n’a aucune erreur');
  });
});

describe('Outils MCP', () => {
  test('4a modifier_organisation : siret (siren déduit, rendu dans champsModifies) et numeroTva ; vide efface ; lire_organisation rend les trois champs', async () => {
    const s = await demarrer();
    const r = ok(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', siret: '123 456 789 00012', numeroTva: 'fr 12 123456789' }));
    assert.deepEqual(r.champsModifies.sort(), ['numeroTva', 'siren', 'siret']);
    const o = s.doc('crm_organisations', 'org1');
    assert.deepEqual([o.siret, o.siren, o.numeroTva], ['12345678900012', '123456789', 'FR12123456789']);
    const lue = ok(await s.appeler('lecteur', 'lire_organisation', { id: 'org1' }));
    assert.deepEqual([lue.organisation.siret, lue.organisation.siren, lue.organisation.numeroTva], ['12345678900012', '123456789', 'FR12123456789']);
    ok(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', siret: '' }));
    assert.deepEqual([s.doc('crm_organisations', 'org1').siret, s.doc('crm_organisations', 'org1').siren, s.doc('crm_organisations', 'org1').numeroTva], ['', '', 'FR12123456789']);
  });

  test('4b modifier_organisation : SIRET ou TVA invalide refusé avec un message clair, rien n’est écrit ; siren n’est pas un paramètre', async () => {
    const s = await demarrer();
    ok(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', siret: '12345678900012' }));
    const avant = structuredClone(s.doc('crm_organisations', 'org1'));
    refuse(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', siret: '1234567890001' }), /SIRET doit faire 14 chiffres/);
    refuse(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', siret: '1234567890001A', ville: 'Paris' }), /SIRET doit faire 14 chiffres/);
    refuse(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', numeroTva: '12345' }), /numéro de TVA commence par 2 lettres/);
    refuse(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', numeroTva: 'FR123' }), /TVA/);
    assert.deepEqual(s.doc('crm_organisations', 'org1'), avant, 'rien n’est écrit après un refus');
    // Un « siren » envoyé quand même est ignoré (pas dans le schéma) : le SIREN reste celui du SIRET.
    const r = await s.appeler('biblio', 'modifier_organisation', { id: 'org1', siren: '999999999', ville: 'Lyon 2' });
    assert.equal(s.doc('crm_organisations', 'org1').siren, '123456789', r.texte);
  });

  test('4c creer_organisation : siret et numeroTva contrôlés, siren déduit ; refus sans rien créer', async () => {
    const s = await demarrer();
    const avant = s.collections.crm_organisations.length;
    refuse(await s.appeler('biblio', 'creer_organisation', { nom: 'Menuiserie Exemple', siret: '123' }), /SIRET doit faire 14 chiffres/);
    refuse(await s.appeler('biblio', 'creer_organisation', { nom: 'Menuiserie Exemple', numeroTva: '12345' }), /numéro de TVA/);
    assert.equal(s.collections.crm_organisations.length, avant, 'rien n’est créé après un refus');
    const r = ok(await s.appeler('biblio', 'creer_organisation', { nom: 'Menuiserie Exemple', siret: '123 456 789 00012', numeroTva: 'FR12123456789', siren: '999999999' }));
    const o = s.doc('crm_organisations', r.id);
    assert.deepEqual([o.siret, o.siren, o.numeroTva], ['12345678900012', '123456789', 'FR12123456789']);
  });
});
