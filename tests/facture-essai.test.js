// Script scripts/facture-essai.js (28/11/2026) : facture d'essai cohérente (SIRET, TVA, IBAN aux clés justes ; totaux exacts ; numéro unique).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOURNISSEUR, luhnValide, ibanValide, ibanFrancais, tvaIntracom, composerFacture, htmlFacture, lireArguments } from '../scripts/facture-essai.js';

test('fournisseur : SIREN et SIRET valides (Luhn), TVA et IBAN aux clés justes', () => {
  assert.equal(FOURNISSEUR.siren.length, 9);
  assert.ok(luhnValide(FOURNISSEUR.siren));
  assert.equal(FOURNISSEUR.siret.length, 14);
  assert.ok(luhnValide(FOURNISSEUR.siret));
  assert.ok(FOURNISSEUR.siret.startsWith(FOURNISSEUR.siren));
  assert.equal(FOURNISSEUR.tva, tvaIntracom(FOURNISSEUR.siren));
  assert.ok(ibanValide(FOURNISSEUR.iban));
  assert.equal(FOURNISSEUR.iban.length, 27);
});

test('IBAN : un exemple public connu est reconnu, une clé fausse est refusée', () => {
  assert.ok(ibanValide('FR7630006000011234567890189'));
  assert.ok(!ibanValide('FR7630006000011234567890188'));
  assert.ok(ibanValide(ibanFrancais('30006', '00001', '12345678901')));
});

test('facture : totaux exacts, TVA 20 %, numéro unique par seconde, date du jour', () => {
  let s = 0.37;
  const hasard = () => { s = (s * 9301 + 49297) % 233280 / 233280; return s; };
  const d = new Date(2026, 10, 28, 10, 30, 5);
  const f = composerFacture(d, hasard);
  assert.ok(f.lignes.length >= 2 && f.lignes.length <= 4);
  const ht = Math.round(f.lignes.reduce((t, l) => t + l.total, 0) * 100) / 100;
  assert.equal(f.ht, ht);
  assert.equal(f.tva, Math.round(f.ht * 20) / 100);
  assert.equal(f.ttc, Math.round((f.ht + f.tva) * 100) / 100);
  assert.match(f.numero, /^FE-20261128-103005-\d{3}$/);
  assert.equal(f.date, '28/11/2026');
  const html = htmlFacture(f);
  assert.ok(html.includes(f.numero));
  assert.ok(html.includes("Client d'essai"));
  assert.ok(htmlFacture(f, FOURNISSEUR, '<b>X</b>').includes('&lt;b&gt;X&lt;/b&gt;'));
  assert.ok(html.includes(FOURNISSEUR.siret));
});

test('fournisseur : SIREN hors de la plage attribuée (commence par 0), IBAN d\'exemple public', () => {
  assert.ok(FOURNISSEUR.siren.startsWith('0'));
  assert.equal(FOURNISSEUR.iban, 'FR7630006000011234567890189');
});

test('numéro unique même dans la même seconde (suffixe tiré au hasard)', () => {
  const d = new Date(2026, 10, 28, 10, 30, 5);
  const a = composerFacture(d, () => 0.1).numero;
  const b = composerFacture(d, () => 0.9).numero;
  assert.notEqual(a, b);
});

test('arguments : --sortie et --client exigent une valeur, le reste est refusé', () => {
  assert.equal(lireArguments(['--client', 'Essai']).client, 'Essai');
  assert.throws(() => lireArguments(['--sortie']));
  assert.throws(() => lireArguments(['--sortie', '--client']));
  assert.throws(() => lireArguments(['--sorti', 'x']));
  assert.throws(() => lireArguments(['--help']));
});
