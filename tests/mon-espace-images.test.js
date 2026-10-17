// « Mon espace » (2.10.0), parties sans navigateur : reconnaissance du type d'image par les premiers octets (côté navigateur, la même règle que côté serveur),
// limites, message d'erreur de la fonction (le SDK Firebase ajoute « [403] »), et le logo de l'espace lu en direct par les célébrations.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { typeDesOctets, LIMITES } from '../js/os/mon-espace-images.js';
import { logoEspace, definirLogoEspace, definirChezClient } from '../js/os/contexte.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 0]);
const WEBP = new Uint8Array([...Buffer.from('RIFF'), 30, 0, 0, 0, ...Buffer.from('WEBPVP8 ')]);

describe('Images de Mon espace (navigateur)', () => {
  test('PNG, JPG et WebP reconnus par leurs premiers octets ; SVG, GIF, texte, vide refusés', () => {
    assert.equal(typeDesOctets(PNG), 'png');
    assert.equal(typeDesOctets(JPG), 'jpg');
    assert.equal(typeDesOctets(WEBP), 'webp');
    for (const refuse of ['<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'GIF89a......', 'texte quelconque', '', 'RIFF....WAVEfmt ']) assert.equal(typeDesOctets(new Uint8Array(Buffer.from(refuse))), null, refuse);
  });
  test('limites : logo 2 Mo et 512 px, image 1,5 Mo et 1600 px', () => {
    assert.deepEqual([LIMITES.logo.octets, LIMITES.logo.largeur], [2 * 1024 * 1024, 512]);
    assert.deepEqual([LIMITES.image.octets, LIMITES.image.largeur], [Math.floor(1.5 * 1024 * 1024), 1600]);
  });
});

describe('Logo de l\'espace lu en direct (contexte.js)', () => {
  test('seulement chez un client, seulement une adresse https ; jamais à la racine', () => {
    definirChezClient(false);
    definirLogoEspace('https://firebasestorage.googleapis.com/v0/b/x/o/logo.png?alt=media');
    assert.equal(logoEspace(), null, 'à la racine (CRM de Jérôme) : jamais de logo d\'espace');
    definirChezClient(true);
    assert.equal(logoEspace(), 'https://firebasestorage.googleapis.com/v0/b/x/o/logo.png?alt=media');
    for (const mauvais of ['http://exemple.test/logo.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '', null, 12]) {
      definirLogoEspace(mauvais);
      assert.equal(logoEspace(), null, String(mauvais));
    }
    definirLogoEspace('https://exemple.test/logo.png');
    definirChezClient(false);
    assert.equal(logoEspace(), null, 'espace fermé : plus de logo');
  });
});
