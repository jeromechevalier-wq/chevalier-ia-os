// Chez un client, un lien `#/crm/…` écrit en dur est réécrit sous `#/espace/<client>/…` dès le survol, le focus, l'appui, le clic droit :
// « ouvrir dans un nouvel onglet » ne perd plus l'espace. Faux document minimal (pas de jsdom dans le dépôt).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { definirPrefixe, suivreLiensDuPrefixe } from '../js/os/router.js';

function faireDocument() {
  const ecouteurs = [];
  globalThis.document = {
    addEventListener: (type, f, capture) => ecouteurs.push({ type, f, capture: Boolean(capture) }),
    removeEventListener: (type, f, capture) => {
      const i = ecouteurs.findIndex((x) => x.type === type && x.f === f && x.capture === Boolean(capture));
      if (i >= 0) ecouteurs.splice(i, 1);
    },
  };
  return ecouteurs;
}
function faireLien(href) {
  const a = { attrs: href === undefined ? {} : { href }, getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }, setAttribute(n, v) { this.attrs[n] = v; } };
  // Fidèle à closest('a[href^="#/"]') : le lien n'est trouvé que si son href commence par « #/ ».
  a.closest = () => (String(a.attrs.href ?? '').startsWith('#/') ? a : null);
  const enfant = { closest: () => a.closest() };
  return { a, enfant };
}
const declencher = (ecouteurs, type, cible, extra = {}) => {
  const e = { type, target: cible, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
  for (const x of [...ecouteurs]) if (x.type === type) x.f(e);
  return e;
};

describe('liens-prefixe-clic-droit', () => {
  beforeEach(() => { definirPrefixe(''); });

  test('1. survol, focus, clic droit d’un lien #/crm/affaires/x en espace client : le href prend le préfixe', () => {
    definirPrefixe('espace/clientdemo');
    const ec = faireDocument();
    const stop = suivreLiensDuPrefixe();
    for (const type of ['mouseover', 'focusin', 'contextmenu', 'auxclick', 'pointerdown']) {
      const { a, enfant } = faireLien('#/crm/affaires/x');
      declencher(ec, type, enfant);
      assert.equal(a.getAttribute('href'), '#/espace/clientdemo/crm/affaires/x', type);
    }
    stop();
  });

  test('2. mousedown réécrit aussi le href (Ctrl/Cmd+clic, clic molette)', () => {
    definirPrefixe('espace/clientdemo');
    const ec = faireDocument();
    const stop = suivreLiensDuPrefixe();
    const { a, enfant } = faireLien('#/crm/affaires/x');
    declencher(ec, 'mousedown', enfant, { button: 1, ctrlKey: true });
    assert.equal(a.getAttribute('href'), '#/espace/clientdemo/crm/affaires/x');
    stop();
  });

  test('3. sans préfixe (CRM de Jérôme), rien n’est écouté et le href reste inchangé', () => {
    const ec = faireDocument();
    const stop = suivreLiensDuPrefixe();
    assert.equal(ec.length, 0);
    const { a, enfant } = faireLien('#/crm/affaires/x');
    declencher(ec, 'mouseover', enfant);
    assert.equal(a.getAttribute('href'), '#/crm/affaires/x');
    stop();
  });

  test('4. un lien déjà préfixé n’est pas modifié deux fois ; externe, vide, sans id : pas de plantage', () => {
    definirPrefixe('espace/clientdemo');
    const ec = faireDocument();
    const stop = suivreLiensDuPrefixe();
    const deja = faireLien('#/espace/clientdemo/crm/affaires/x');
    declencher(ec, 'mouseover', deja.enfant);
    declencher(ec, 'mouseover', deja.enfant);
    assert.equal(deja.a.getAttribute('href'), '#/espace/clientdemo/crm/affaires/x');
    const double = faireLien('#/crm/affaires/x');
    declencher(ec, 'mouseover', double.enfant);
    declencher(ec, 'contextmenu', double.enfant);
    assert.equal(double.a.getAttribute('href'), '#/espace/clientdemo/crm/affaires/x');
    for (const h of ['https://exemple.fr/a', 'mailto:a@b.fr', '', '#', undefined]) {
      const l = faireLien(h);
      declencher(ec, 'mouseover', l.enfant);
      assert.equal(l.a.getAttribute('href'), h === undefined ? null : h);
    }
    const sansId = faireLien('#/crm/affaires');
    declencher(ec, 'mouseover', sansId.enfant);
    assert.equal(sansId.a.getAttribute('href'), '#/espace/clientdemo/crm/affaires');
    declencher(ec, 'mouseover', { closest: () => null }); // aucun lien : rien
    declencher(ec, 'mouseover', undefined);
    stop();
  });

  test('5. la fonction de nettoyage retire tous les écouteurs', () => {
    definirPrefixe('espace/clientdemo');
    const ec = faireDocument();
    const stop = suivreLiensDuPrefixe();
    assert.equal(ec.length, 7);
    stop();
    assert.equal(ec.length, 0);
  });
});
