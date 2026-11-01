// Familles d'articles configurables, PR 1 (docs/cadrage-familles-configurables.md, §5) : les sept familles de premier niveau se renomment et se désactivent.
// Logique pure : familles.js (copiée sur le serveur) et ajouts-familles.js (boutons « + » du devis). Un test par critère ; le nom commence par le numéro (1.1 à 1.9).
// Les critères 1.1, 1.2, 1.4, 1.8 et 1.9 sont aussi vérifiés à l'écran (tests/e2e/devis-familles-configurables.spec.js) ; 1.7 côté assistant dans devis-mcp.test.js (K24).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as F from '../js/modules/devis/familles.js';
import * as A from '../js/modules/devis/articles.js';
import { entreesAjoutFamilles } from '../js/modules/devis/ajouts-familles.js';
import { arbreCatalogue, cheminDansArbre } from '../js/modules/devis/selecteur-catalogue-logique.js';

const defauts = () => F.famillesDe(null);
const renommer = (liste, id, nom) => F.planRenommerFamille(id, nom, liste).familles;
const desactiver = (liste, id, actif = false) => F.planDesactiverFamille(id, liste, actif).familles;
const IDS = [1, 2, 3, 4, 5, 6, 7].map((i) => `famille-${i}`);

describe('1.1 renommer « Fournitures » en « Supports »', () => {
  test('1.1 le nouveau nom se retrouve dans la colonne Famille, le filtre en arbre, la boîte de recherche et le bouton « + » du devis', () => {
    const l = renommer(defauts(), 'famille-1', 'Supports');
    const relue = F.famillesDe({ liste: l }); // ce que le document enregistré donne à la relecture
    assert.equal(relue.find((f) => f.id === 'famille-1').nom, 'Supports');
    assert.equal(F.cheminFamille(relue, 'famille-1'), 'Supports');
    assert.equal(F.cheminFamille(relue, 'famille-1-2'), 'Supports › Carrelage et revêtements', 'colonne Famille d’un article rangé dans une sous-famille');
    assert.equal(F.optionsFamillesArbre(relue).find((o) => o.valeur === 'famille-1').libelle, 'Supports');
    assert.equal(entreesAjoutFamilles(relue).principales[0].libelle, 'Supports');
    assert.equal(F.nomFamille(relue, 'famille-1'), 'Supports');
  });
  test('1.1 un nom déjà pris au premier niveau, vide ou trop long est refusé ; les espaces et les accents ne trompent pas', () => {
    const l = defauts();
    assert.match(F.planRenommerFamille('famille-1', 'ouvrages', l).erreur, /existe déjà/);
    assert.match(F.planRenommerFamille('famille-1', '  ', l).erreur, /Écris le nom/);
    assert.match(F.planRenommerFamille('famille-1', 'x'.repeat(61), l).erreur, /trop long/);
    assert.equal(F.planRenommerFamille('famille-1', 'Fournitures', l).erreur, null, 'garder son propre nom n’est pas un doublon');
  });
});

describe('1.2 désactiver « Matériels »', () => {
  const articles = [{ id: 'a1', libelle: 'Bétonnière', type: 'materiel', familleId: 'famille-5-2' }, { id: 'a2', libelle: 'Mini-pelle', type: 'materiel' }, { id: 'a3', libelle: 'Vis', type: 'fourniture' }];
  test('1.2 plus de bouton « Matériel » dans le menu « … » ni dans le menu « insérer » ; le bouton « Divers » reste', () => {
    const l = desactiver(defauts(), 'famille-5');
    const e = entreesAjoutFamilles(l);
    assert.deepEqual(e.autres.map((x) => x.libelle), ['Sous-traitance', 'Divers']);
    assert.deepEqual(e.principales.map((x) => x.libelle), ['Fourniture', 'Main d’œuvre', 'Ouvrage']);
  });
  test('1.2 les articles rangés dedans restent comptés et visibles au Catalogue (filtre sur la famille désactivée, avec la mention « désactivée »)', () => {
    const l = desactiver(defauts(), 'famille-5');
    assert.equal(F.nombreArticlesDeFamille(l, articles, 'famille-5'), 2, 'un article en sous-famille et un ancien article sans famille (famille de départ de son type)');
    const trouves = A.filtrerArticles(articles, { statut: 'tous', familleId: 'famille-5', familles: l });
    assert.deepEqual(trouves.map((a) => a.id).sort(), ['a1', 'a2']);
    const option = F.optionsFamillesArbre(l).find((o) => o.valeur === 'famille-5');
    assert.match(option.note, /désactivée/);
    assert.match(option.note, /inclut ses sous-familles/);
    assert.equal(F.optionsFamillesArbre(defauts()).find((o) => o.valeur === 'famille-4').note, 'inclut ses sous-familles', 'une famille active n’a pas la mention');
    assert.equal(F.familleEffective(articles[1]), 'famille-5', 'l’article sans famille reste rangé dans sa famille de départ');
  });
  test('1.2 un article neuf ne peut plus être rangé dans la famille désactivée ni dans ses sous-familles ; un article qui y est déjà la garde', () => {
    const l = desactiver(defauts(), 'famille-5');
    assert.match(F.erreurFamilleArticle('famille-5', l), /désactivée/);
    assert.match(F.erreurFamilleArticle('famille-5-1', l), /« Matériels » est désactivée/);
    assert.equal(F.erreurFamilleArticle('famille-5', l, 'famille-5'), null);
    assert.equal(F.erreurFamilleArticle('famille-5-1', l, 'famille-5-1'), null);
    assert.equal(F.erreurFamilleArticle('famille-1', l), null);
  });
  test('1.2 la famille proposée d’office à un article neuf est « Fournitures », ou la première famille active (jamais « Textes » tant qu’une autre est active)', () => {
    assert.equal(F.familleParDefaut(defauts()), 'famille-1');
    assert.equal(F.familleParDefaut(desactiver(defauts(), 'famille-1')), 'famille-2');
    const seulsTextes = IDS.filter((id) => id !== 'famille-6').reduce((l, id) => desactiver(l, id), defauts());
    assert.equal(F.familleParDefaut(seulsTextes), 'famille-6');
    assert.equal(F.familleParDefaut([]), '');
    assert.equal(F.familleParDefaut(null), '');
  });
});

describe('1.2 suite : sélecteur du Vocabulaire, articles actifs, article déjà rangé', () => {
  test('1.2 le sélecteur du Vocabulaire range sous « Sans famille » les articles d’une famille désactivée ET de ses sous-familles (jamais perdus de vue)', () => {
    const l = desactiver(defauts(), 'famille-5');
    const arts = [{ id: 'b', libelle: 'Bétonnière', type: 'materiel', familleId: 'famille-5-2' }, { id: 'm', libelle: 'Mini-pelle', type: 'materiel' }, { id: 'v', libelle: 'Vis', type: 'fourniture', familleId: 'famille-1-9' }];
    const arbre = arbreCatalogue(arts, l);
    assert.notDeepEqual(cheminDansArbre(arbre, 'b'), [], 'l’article est retrouvable dans l’arbre');
    const sans = arbre.find((n) => n.nom === 'Sans famille');
    assert.deepEqual(sans.articles.map((a) => a.id).sort(), ['b', 'm']);
    assert.equal(arbre.some((n) => n.nom === 'Matériels'), false);
  });
  test('1.2 le compte de la confirmation ne compte que les articles actifs', () => {
    const arts = [{ id: 'a', type: 'materiel' }, { id: 'b', type: 'materiel', actif: false }];
    assert.equal(F.nombreArticlesDeFamille(defauts(), arts, 'famille-5'), 1);
  });
  test('1.2 un ancien article sans famille (rangé par son type dans une famille désactivée) peut être modifié sans la quitter', () => {
    const l = desactiver(defauts(), 'famille-5');
    const r = A.validerArticle({ familleId: 'famille-5' }, { familles: l, courant: { libelle: 'Pelle', prixAchat: 9, type: 'materiel' } });
    assert.equal(r.erreurs.familleId, undefined);
    assert.match(A.validerArticle({ familleId: 'famille-5' }, { familles: l, courant: { libelle: 'Vis', prixAchat: 1, type: 'fourniture' } }).erreurs.familleId, /désactivée/);
  });
});

describe('1.3 on ne peut pas désactiver la dernière famille active', () => {
  test('1.3 six désactivations passent, la septième dit « Il en faut au moins une. » et n’écrit rien', () => {
    let l = defauts();
    for (const id of IDS.slice(0, 6)) { const r = F.planDesactiverFamille(id, l); assert.equal(r.erreur, null); l = r.familles; }
    const dernier = F.planDesactiverFamille('famille-7', l);
    assert.equal(dernier.erreur, 'Il en faut au moins une.');
    assert.equal(dernier.familles, null);
    assert.equal(F.ERREUR_DERNIERE_FAMILLE, 'Il en faut au moins une.');
  });
  test('1.3 la règle ne compte que le premier niveau : désactiver des sous-familles ne la déclenche pas ; désactiver une famille déjà désactivée n’est pas une erreur', () => {
    let l = defauts();
    for (const f of l.filter((x) => x.parentId)) l = desactiver(l, f.id);
    assert.equal(F.planDesactiverFamille('famille-1', l).erreur, null);
    const unique = IDS.slice(1).reduce((x, id) => desactiver(x, id), defauts());
    assert.equal(F.planDesactiverFamille('famille-2', unique).erreur, null, 'déjà désactivée : rien à refuser');
    assert.equal(F.planDesactiverFamille('famille-1', unique).erreur, 'Il en faut au moins une.');
  });
});

describe('1.4 réactiver', () => {
  test('1.4 réactiver « Matériels » remet le bouton et rien d’autre ne change (liste identique à l’originale)', () => {
    const l = defauts();
    const retour = desactiver(desactiver(l, 'famille-5'), 'famille-5', true);
    assert.deepEqual(retour, l);
    assert.equal(entreesAjoutFamilles(retour).autres.some((x) => x.familleId === 'famille-5'), true);
  });
});

describe('1.5 identifiants et types inchangés ; un devis finalisé ne dépend pas des familles', () => {
  test('1.5 après renommage et désactivation, famille-1 à famille-7 gardent leur identifiant et leur type (aussi après un aller-retour par le document)', () => {
    let l = defauts();
    IDS.forEach((id, i) => { l = renommer(l, id, `Nom ${i}`); });
    l = desactiver(desactiver(l, 'famille-5'), 'famille-7');
    const relue = F.famillesDe({ liste: l });
    assert.deepEqual(relue.filter(F.estPremierNiveau).map((f) => f.id), IDS);
    assert.deepEqual(IDS.map((id) => F.typeDeFamille(relue, id)), ['fourniture', 'main_oeuvre', 'ouvrage', 'sous_traitance', 'materiel', 'texte', 'divers']);
    assert.equal(F.typeDeFamille(relue, 'famille-5-1'), 'materiel', 'une sous-famille garde le type de son parent désactivé');
    assert.equal(F.familleDeType('materiel'), 'famille-5');
  });
  test('1.5 le type d’un article se lit dans la table des types, jamais dans le nom : un article rangé dans « Forfaits » (ex-« Ouvrages ») reste un ouvrage', () => {
    const l = renommer(defauts(), 'famille-1', 'Supports');
    const r = A.validerArticle({ libelle: 'Vis', prixAchat: 1, familleId: 'famille-1' }, { familles: l });
    assert.deepEqual(r.erreurs, {});
    assert.equal(r.valeurs.type, 'fourniture');
    assert.equal(F.typeDeFamille(renommer(defauts(), 'famille-3', 'Forfaits'), 'famille-3'), 'ouvrage');
  });
  test('1.5 le document imprimable et le PDF ne lisent aucune famille : un devis finalisé s’affiche et s’exporte à l’identique', () => {
    for (const f of ['document.js', 'html-devis.js', 'pdf.js']) {
      const src = readFileSync(new URL(`../js/modules/devis/${f}`, import.meta.url), 'utf8');
      assert.doesNotMatch(src, /famille/i, `${f} ne lit aucune famille`);
    }
  });
});

describe('1.6 anciens et nouveaux documents', () => {
  test('1.6 un document ancien (sans entrées de départ, ou avec les entrées écrites par l’ancien code : noms d’origine, tout actif) donne exactement les noms d’origine', () => {
    assert.deepEqual(F.famillesDe({ liste: [] }), defauts());
    assert.deepEqual(F.famillesDe({ liste: defauts() }), defauts(), 'ce que l’ancien code écrivait (la liste complète telle quelle) se relit à l’identique');
    assert.deepEqual(F.famillesDe({ liste: defauts().filter((f) => f.parentId) }), defauts(), 'sous-familles seules');
    assert.deepEqual(F.famillesDe(null), defauts());
    assert.deepEqual(F.famillesDe({ liste: 'pas une liste' }), defauts());
  });
  test('1.6 un document avec entrées de départ lu par l’ANCIEN code les ignore sans erreur (même filtre que l’ancien code) : retour arrière sans dégât', () => {
    const nouveau = desactiver(renommer(defauts(), 'famille-1', 'Supports'), 'famille-5');
    const filtreAncien = (liste) => liste.filter((f) => !IDS.includes(f.id)); // ce que l'ancien `famillesDe` jetait
    const ignoree = filtreAncien(nouveau);
    assert.equal(ignoree.length, nouveau.length - 7, 'seules les sept entrées de premier niveau sont jetées, rien d’autre');
    assert.ok(ignoree.every((f) => f.parentId), 'il ne reste que des sous-familles, intactes');
  });
  test('1.6 seuls le nom et l’état actif d’une entrée de départ comptent : un type, un parent ou un identifiant abîmé est ignoré', () => {
    const l = F.famillesDe({ liste: [{ id: 'famille-2', nom: 'Équipe', actif: false, type: 'materiel', parentId: 'famille-1' }, { id: 'famille-3', nom: '   ', actif: false }] });
    assert.deepEqual(l.find((f) => f.id === 'famille-2'), { id: 'famille-2', nom: 'Équipe', actif: false });
    assert.equal(F.typeDeFamille(l, 'famille-2'), 'main_oeuvre');
    assert.deepEqual(l.find((f) => f.id === 'famille-3'), { id: 'famille-3', nom: 'Ouvrages', actif: true }, 'un nom vide revient au nom d’origine');
    assert.equal(l.length, F.FAMILLES_PAR_DEFAUT.length);
  });
});

describe('1.7 côté assistant (la copie serveur est le même fichier)', () => {
  test('1.7 les règles de familles sont celles du fichier copié sur le serveur (aucune règle propre à l’écran) ; creer_article suit erreurFamilleArticle (voir K24 de devis-mcp)', () => {
    const src = readFileSync(new URL('../js/modules/devis/familles.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /^import /m, 'familles.js n’importe rien : preparer-fonctions.js le copie tel quel');
    const articles = readFileSync(new URL('../js/modules/devis/articles.js', import.meta.url), 'utf8'); // copié lui aussi : planCreerArticle contrôle la famille avec erreurFamilleArticle
    assert.match(articles, /erreurFamilleArticle\(familleId, familles/);
  });
});

describe('1.8 sous-famille sous une famille désactivée', () => {
  test('1.8 refusée avec « Réactive d’abord « Matériels ». » ; acceptée une fois la famille réactivée', () => {
    const l = desactiver(defauts(), 'famille-5');
    const r = F.planCreationFamille('Échafaudage léger', l, { nouvelId: () => 'x', parentId: 'famille-5' });
    assert.equal(r.erreur, 'Réactive d’abord « Matériels ».');
    assert.equal(r.familles, null);
    assert.equal(F.planCreationFamille('Échafaudage léger', desactiver(l, 'famille-5', true), { nouvelId: () => 'x', parentId: 'famille-5' }).erreur, null);
  });
  test('1.8 le message cite le nom que l’utilisateur a choisi', () => {
    const l = desactiver(renommer(defauts(), 'famille-5', 'Engins'), 'famille-5');
    assert.equal(F.planCreationFamille('Grues', l, { nouvelId: () => 'x', parentId: 'famille-5' }).erreur, 'Réactive d’abord « Engins ».');
  });
});

describe('1.9 cas vide et cas d’erreur', () => {
  test('1.9 une famille sans sous-famille reste une famille valide (arbre avec enfants vides) ; la liste d’options ne plante pas sur une liste vide', () => {
    const arbre = F.arbreFamilles(defauts());
    assert.equal(arbre.length, 7);
    assert.deepEqual(arbre.find((x) => x.famille.id === 'famille-6').enfants.map((f) => f.nom), ['Introduction', 'Conditions et mentions']);
    assert.deepEqual(F.optionsFamillesArbre([]).map((o) => o.valeur), ['sans_famille']);
    assert.equal(F.nombreArticlesDeFamille(defauts(), [], 'famille-1'), 0);
    assert.equal(F.nombreArticlesDeFamille(null, null, 'famille-1'), 0);
  });
  test('1.9 les familles inconnues sont refusées par message, jamais par une erreur de programme', () => {
    assert.match(F.planRenommerFamille('absente', 'X', defauts()).erreur, /introuvable/);
    assert.match(F.planDesactiverFamille('absente', defauts()).erreur, /introuvable/);
  });
});

describe('boutons « + » du devis : nom et mot du métier', () => {
  test('1.1 tant que la famille n’est pas renommée, le bouton garde le mot d’origine, et pour les ouvrages le mot du métier (« Prestation »)', () => {
    const e = entreesAjoutFamilles(defauts(), 'Prestation');
    assert.deepEqual(e.principales.map((x) => x.libelle), ['Fourniture', 'Main d’œuvre', 'Prestation']);
    assert.deepEqual(e.principales.map((x) => x.familleId), ['famille-1', 'famille-2', 'famille-3']);
    assert.deepEqual(e.autres.map((x) => x.familleId), ['famille-4', 'famille-5', 'famille-7']);
  });
  test('1.1 une fois « Ouvrages » renommé en « Forfaits », le bouton dit « Forfaits » et le mot du métier ne gagne plus', () => {
    const e = entreesAjoutFamilles(renommer(defauts(), 'famille-3', 'Forfaits'), 'Prestation');
    assert.equal(e.principales[2].libelle, 'Forfaits');
  });
  test('1.2 « Textes » n’a pas de bouton « + » (il vit dans le bouton « Texte ») ; toutes désactivées sauf « Textes » : aucune entrée, sans erreur', () => {
    const seulsTextes = IDS.filter((id) => id !== 'famille-6').reduce((l, id) => desactiver(l, id), defauts());
    const e = entreesAjoutFamilles(seulsTextes);
    assert.deepEqual([e.principales, e.autres], [[], []]);
    assert.deepEqual(entreesAjoutFamilles(null), { principales: [], autres: [] });
    assert.equal(entreesAjoutFamilles(defauts()).autres.concat(entreesAjoutFamilles(defauts()).principales).some((x) => x.familleId === 'famille-6'), false);
  });
  test('1.2 les clés des entrées du menu « insérer » restent celles d’avant (les parcours existants les lisent)', () => {
    const e = entreesAjoutFamilles(defauts());
    assert.deepEqual([...e.principales, ...e.autres].map((x) => x.cle), ['fourniture', 'main-oeuvre', 'ouvrage', 'sous-traitance', 'materiel', 'divers']);
  });
});
