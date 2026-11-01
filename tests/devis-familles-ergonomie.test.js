// Module Devis, familles d'articles : sous-familles de départ, choix par champ intelligent, mémoire du devis ouvert (brief 19). Logique pure.
// Un test par point (le nom commence par P1 à P4) ; les écrans sont dans tests/e2e/devis-familles-ergonomie.spec.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../js/modules/devis/familles.js';

const tops = (l) => l.filter((f) => !f.parentId);
const enfantsDe = (l, id) => l.filter((f) => f.parentId === id).map((f) => f.nom);

describe('P1 sous-familles de départ', () => {
  test('P1 les sept familles ont leurs sous-familles de départ, avec identifiants stables, actives, sans doublon de nom sous un même parent', () => {
    const l = F.famillesDe(null);
    assert.equal(tops(l).length, 7);
    assert.deepEqual(enfantsDe(l, 'famille-1'), ['Gros œuvre et maçonnerie', 'Carrelage et revêtements', 'Étanchéité et isolation', 'Plâtrerie et cloisons', 'Peinture', 'Menuiserie', 'Plomberie et sanitaire', 'Électricité', 'Quincaillerie et visserie']);
    assert.deepEqual(enfantsDe(l, 'famille-2').slice(0, 3), ['Maçon', 'Carreleur', 'Étancheur']);
    assert.deepEqual(enfantsDe(l, 'famille-6'), ['Introduction', 'Conditions et mentions']);
    assert.deepEqual(enfantsDe(l, 'famille-7'), ['Déchets et évacuation', 'Déplacement', 'Protection de chantier']);
    for (const f of l.filter((x) => x.parentId)) {
      assert.match(f.id, /^famille-[1-7]-\d+$/);
      assert.equal(f.actif, true);
    }
    assert.equal(new Set(l.map((f) => f.id)).size, l.length, 'identifiants tous différents');
    for (const t of tops(l)) {
      const noms = enfantsDe(l, t.id).map((n) => n.toLowerCase());
      assert.equal(new Set(noms).size, noms.length, `${t.nom} : pas de nom en double`);
    }
    // Le type d'un article rangé dans une sous-famille de départ suit sa famille de premier niveau.
    assert.equal(F.typeDeFamille(l, 'famille-1-2'), 'fourniture');
    assert.equal(F.typeDeFamille(l, 'famille-2-1'), 'main_oeuvre');
    assert.equal(F.cheminFamille(l, 'famille-1-2'), 'Fournitures › Carrelage et revêtements');
  });

  test('P1 renommer ou désactiver une sous-famille de départ : le choix stocké l’emporte, les identifiants restent', () => {
    const l = F.famillesDe(null);
    const renommee = F.planRenommerFamille('famille-1-2', 'Faïence', l);
    assert.equal(renommee.erreur, null);
    const desactivee = F.planDesactiverFamille('famille-1-5', renommee.familles);
    assert.equal(desactivee.erreur, null);
    // Ce qui est écrit dans la base est relu tel quel : nom et état de l'utilisateur, parent de départ.
    const relue = F.famillesDe({ liste: desactivee.familles });
    assert.deepEqual(relue.find((f) => f.id === 'famille-1-2'), { id: 'famille-1-2', nom: 'Faïence', actif: true, parentId: 'famille-1' });
    assert.equal(relue.find((f) => f.id === 'famille-1-5').actif, false);
    assert.equal(relue.length, l.length, 'rien ajouté, rien perdu');
    // Une sous-famille de départ stockée avec un mauvais parent garde son parent de départ.
    const abimee = F.famillesDe({ liste: [{ id: 'famille-1-2', nom: 'Faïence', actif: true, parentId: 'famille-3' }] });
    assert.equal(abimee.find((f) => f.id === 'famille-1-2').parentId, 'famille-1');
    // Les autres sous-familles de départ ne sont pas touchées par un document qui n'en cite qu'une.
    assert.equal(abimee.find((f) => f.id === 'famille-1-3').nom, 'Étanchéité et isolation');
  });

  test('P1 les sept familles de premier niveau gardent leur identifiant (elles se renomment et se désactivent, voir 1.x) ; un ancien document sans sous-familles les reçoit toutes', () => {
    const l = F.famillesDe(null);
    for (let i = 1; i <= 7; i++) {
      assert.equal(F.planRenommerFamille(`famille-${i}`, `Autre ${i}`, l).famille.id, `famille-${i}`);
      assert.equal(F.planDesactiverFamille(`famille-${i}`, l).erreur, null);
      assert.equal(F.estFamilleDepart(`famille-${i}`), true);
    }
    assert.equal(F.estFamilleDepart('famille-1-1'), false);
    assert.equal(F.estSousFamilleDepart('famille-1-1'), true);
    // Ancien document : seulement une famille libre de l'utilisateur. Elle reste, et les sous-familles de départ s'ajoutent en lisant.
    const ancien = F.famillesDe({ liste: [{ id: 'sous-1', nom: 'Zinguerie', actif: true, parentId: 'famille-1' }] });
    assert.equal(ancien.length, F.FAMILLES_PAR_DEFAUT.length + 1);
    assert.deepEqual(ancien.at(-1), { id: 'sous-1', nom: 'Zinguerie', actif: true, parentId: 'famille-1' });
    // Une famille libre au même nom qu'une famille de départ sous un autre parent est permise ; sous le même parent, refusée.
    assert.match(F.erreursFamille('peinture', l, { parentId: 'famille-1' }), /existe déjà/);
    assert.equal(F.erreursFamille('Peinture', l, { parentId: 'famille-7' }), null);
  });
});
