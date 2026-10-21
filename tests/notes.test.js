// Tests B : liens cliquables dans les notes (logique pure, sans navigateur).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decouperLiens, hrefDe } from '../js/modules/crm/liens-texte.js';

const liens = (t) => decouperLiens(t).filter((m) => m.href);

describe('I6 : liens dans les notes', () => {
  test('I6 : https://, http:// et www. deviennent des liens ; seule l’adresse est cliquable', () => {
    const m = decouperLiens('Voir https://exemple.fr/page puis http://a.org et www.b.com merci');
    assert.deepEqual(m.filter((x) => x.href).map((x) => x.texte), ['https://exemple.fr/page', 'http://a.org', 'www.b.com']);
    assert.equal(m[0].texte, 'Voir ');
    assert.equal(m[0].href, undefined);
  });
  test('I6 : un www. devient https://www. dans le lien, le texte affiché reste identique', () => {
    assert.deepEqual(liens('www.b.com'), [{ texte: 'www.b.com', href: 'https://www.b.com' }]);
    assert.equal(hrefDe('http://a.org'), 'http://a.org');
  });
  test('I6 : la ponctuation finale d’une phrase n’appartient pas au lien', () => {
    assert.equal(liens('Va sur https://exemple.fr.')[0].texte, 'https://exemple.fr');
    assert.equal(liens('(voir https://exemple.fr/x)')[0].texte, 'https://exemple.fr/x');
    assert.equal(liens('Est-ce https://exemple.fr/x ?')[0].texte, 'https://exemple.fr/x');
    assert.equal(liens('https://exemple.fr/a,')[0].texte, 'https://exemple.fr/a');
    assert.equal(liens('https://fr.wikipedia.org/wiki/Paris_(ville)')[0].texte, 'https://fr.wikipedia.org/wiki/Paris_(ville)');
  });
  test('I6 : les morceaux remis bout à bout redonnent exactement le texte enregistré', () => {
    for (const t of ['', 'sans lien', 'a https://x.fr, b\nwww.y.com.\n(www.z.org)', 'https://', 'www.', 'awww.truc.fr', '<img src=x onerror=alert(1)> https://x.fr']) {
      assert.equal(decouperLiens(t).map((m) => m.texte).join(''), t);
    }
  });
  test('I6 : pas de lien pour une adresse vide, un « www. » collé à un mot, ni pour javascript:', () => {
    assert.equal(liens('https:// seul').length, 0);
    assert.equal(liens('www. seul').length, 0);
    assert.equal(liens('awww.truc.fr').length, 0);
    assert.equal(liens('javascript:alert(1)').length, 0);
    assert.equal(liens('mail@www.truc.fr').length, 0);
  });
  test('I6 : le HTML saisi reste du texte simple', () => {
    assert.deepEqual(decouperLiens('<img src=x onerror=alert(1)>'), [{ texte: '<img src=x onerror=alert(1)>' }]);
  });
});
