// Éditeur de devis : fonctions pures de js/modules/devis/editeur-logique.js. Chaque test commence par le numéro du critère (E1 à E8).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import * as Ed from '../js/modules/devis/editeur-logique.js';
import { totauxDevis, prixVenteDeLigne, erreursFinalisation } from '../js/modules/devis/logique.js';

const L = (id, extra = {}) => ({ id, libelle: `Ligne ${id}`, quantite: 1, unite: 'u', prixAchat: 10, ...extra });
const devisDe = (sections, extra = {}) => ({ id: 'd1', statut: 'brouillon', affaireId: 'a1', modeMarge: 'majoration', marge: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', sections, ...extra });
const ids = (sections) => Ed.aplatir(sections).map((e) => e.id);
// Deux sections : « s1 » (a, b) et « s2 » (c), et une ligne « z » avant toute section.
const exemple = () => [
  { id: 'sec-debut', titre: '', lignes: [L('z')] },
  { id: 's1', titre: 'Cuisine', lignes: [L('a'), L('b')] },
  { id: 's2', titre: 'Salon', lignes: [L('c')] },
];
const suite = () => { let n = 0; return () => `n${++n}`; };

describe('E1 ajout de lignes', () => {
  const articles = [
    { id: 'c1', libelle: 'BA13', unite: 'm²', prixAchat: 5, actif: true },
    { id: 'c2', libelle: 'Rail', unite: 'u', prixAchat: 10, actif: true },
  ];
  test('E1 une ligne copiée d’un article garde libellé, unité, prix d’achat, TVA, code ; la marge propre n’est posée que si l’article en a une', () => {
    const l = Ed.ligneDepuisArticle({ id: 'a1', libelle: 'Carrelage', unite: 'm²', prixAchat: 50, tauxTva: 10, code: 'CAR', familleId: 'f1' }, { id: 'x1' });
    assert.deepEqual(l, { genre: 'ligne', id: 'x1', articleId: 'a1', type: null, libelle: 'Carrelage', unite: 'm²', quantite: 1, code: 'CAR', familleId: 'f1', tauxTva: 10, prixAchat: 50 });
    assert.equal(Ed.ligneDepuisArticle({ id: 'a2', libelle: 'X', unite: 'u', prixAchat: 8, marge: 35 }, { id: 'x2' }).marge, 35);
  });
  test('E1 un article de type Texte donne une ligne sans prix ; un ouvrage est figé avec sa composition et garde son prix de vente (24 €)', () => {
    const t = Ed.ligneDepuisArticle({ id: 't', libelle: 'Note', type: 'texte' }, { id: 'x3' });
    assert.equal(t.type, 'texte'); assert.equal(t.prixAchat, 0);
    const ouvrage = { id: 'o1', libelle: 'Cloison', unite: 'm²', type: 'ouvrage', composants: [{ articleId: 'c1', quantite: 2 }, { articleId: 'c2', quantite: 1 }] };
    const l = Ed.ligneDepuisArticle(ouvrage, { id: 'x4', articles, devis: { marge: 20, modeMarge: 'majoration' } });
    assert.equal(l.ouvrage.composants.length, 2);
    assert.equal(l.ouvrage.prixVenteHT, 24); // 2 × 6 + 12
    assert.equal(l.prixAchat, 20);
    assert.equal(l.description, '- BA13 (2 m²)\n- Rail (1 u)');
    assert.equal(prixVenteDeLigne(devisDe([]), { }, l), 24);
    assert.equal(Ed.descriptionDeLigne({ ...l, quantite: 3 }), '- BA13 (6 m²)\n- Rail (3 u)');
  });
  test('E1 ajouter au bout, ou juste au-dessous d’une ligne ; une ligne avant toute section va dans la section sans titre', () => {
    const fin = Ed.ajouterElement([], Ed.ligneLibre('l1'));
    assert.deepEqual(fin.map((s) => [s.id, s.lignes.map((l) => l.id)]), [['sec-debut', ['l1']]]);
    const milieu = Ed.ajouterElement(exemple(), Ed.ligneLibre('n'), 'a');
    assert.deepEqual(milieu[1].lignes.map((l) => l.id), ['a', 'n', 'b']);
    assert.deepEqual(ids(Ed.ajouterElement(exemple(), Ed.ligneLibre('t'))), ['z', 's1', 'a', 'b', 's2', 'c', 't']);
  });
  test('E1 insérer une section au-dessous d’une ligne coupe la section en deux ; sous un titre de section, la ligne entre au début de cette section', () => {
    const coupee = Ed.ajouterElement(exemple(), Ed.sectionNeuve('s3', 'Nouveau'), 'a');
    assert.deepEqual(ids(coupee), ['z', 's1', 'a', 's3', 'b', 's2', 'c']);
    assert.deepEqual(ids(Ed.ajouterElement(exemple(), Ed.ligneLibre('n'), 's2')), ['z', 's1', 'a', 'b', 's2', 'n', 'c']);
  });
});

describe('E2 déplacement', () => {
  test('E2 une ligne monte et descend d’un cran, y compris de section en section', () => {
    assert.deepEqual(ids(Ed.deplacerElement(exemple(), 'b', -1)), ['z', 's1', 'b', 'a', 's2', 'c']);
    assert.deepEqual(ids(Ed.deplacerElement(exemple(), 'a', 1)), ['z', 's1', 'b', 'a', 's2', 'c']);
    assert.deepEqual(ids(Ed.deplacerElement(exemple(), 'b', 1)), ['z', 's1', 'a', 's2', 'b', 'c']); // b passe dans « Salon »
    assert.deepEqual(ids(Ed.deplacerElement(exemple(), 'a', -1)), ['z', 'a', 's1', 'b', 's2', 'c']); // a remonte au-dessus du titre
  });
  test('E2 une section emporte ses lignes ; la dernière ne descend pas, la première ne monte pas', () => {
    assert.deepEqual(ids(Ed.deplacerElement(exemple(), 's2', -1)), ['z', 's2', 'c', 's1', 'a', 'b']);
    assert.deepEqual(ids(Ed.deplacerElement(exemple(), 's1', 1)), ['z', 's2', 'c', 's1', 'a', 'b']);
    assert.deepEqual(ids(Ed.deplacerElement(exemple(), 's2', 1)), ids(exemple()));
    assert.deepEqual(ids(Ed.deplacerElement(exemple(), 'z', -1)), ids(exemple()));
    assert.deepEqual(Ed.deplacementsPossibles(exemple(), 'z'), { monter: false, descendre: true });
    assert.deepEqual(Ed.deplacementsPossibles(exemple(), 's2'), { monter: true, descendre: false });
    assert.deepEqual(Ed.deplacementsPossibles(exemple(), 'inconnu'), { monter: false, descendre: false });
  });
  test('E2 déplacer ne change aucune donnée des lignes ; un identifiant inconnu ne change rien', () => {
    const avant = exemple();
    const apres = Ed.deplacerElement(avant, 'a', 1);
    assert.deepEqual(Ed.trouverLigne(apres, 'a').ligne, L('a'));
    assert.deepEqual(avant, exemple());
    assert.deepEqual(Ed.deplacerElement(avant, 'zzz', 1), avant);
  });
});

describe('E3 duplication et suppression', () => {
  test('E3 dupliquer une ligne la copie juste au-dessous avec un identifiant neuf', () => {
    const { sections, ids: nouveaux } = Ed.dupliquerElement(exemple(), 'a', suite());
    assert.deepEqual(nouveaux, ['n1']);
    assert.deepEqual(ids(sections), ['z', 's1', 'a', 'n1', 'b', 's2', 'c']);
    assert.equal(Ed.trouverLigne(sections, 'n1').ligne.libelle, 'Ligne a');
  });
  test('E3 dupliquer une section copie ses lignes, tous les identifiants sont neufs et uniques', () => {
    const { sections, ids: nouveaux } = Ed.dupliquerElement(exemple(), 's1', suite());
    assert.deepEqual(nouveaux, ['n1', 'n2', 'n3']);
    assert.deepEqual(ids(sections), ['z', 's1', 'a', 'b', 'n1', 'n2', 'n3', 's2', 'c']);
    assert.equal(new Set(ids(sections)).size, ids(sections).length);
  });
  test('E3 supprimer une ligne, ou une section avec ses lignes ; le nombre de lignes emportées est connu avant', () => {
    assert.deepEqual(ids(Ed.supprimerElement(exemple(), 'b')), ['z', 's1', 'a', 's2', 'c']);
    assert.deepEqual(ids(Ed.supprimerElement(exemple(), 's1')), ['z', 's2', 'c']);
    assert.equal(Ed.lignesEmportees(exemple(), 's1'), 2);
    assert.equal(Ed.lignesEmportees(exemple(), 'c'), 1);
    assert.equal(Ed.lignesEmportees(exemple(), 'zzz'), 0);
    assert.deepEqual(Ed.supprimerElement([], 'a'), []);
  });
});

describe('E4 numérotation d’affichage', () => {
  test('E4 la section sans titre compte comme la section 1 (comme dans le document), les lignes se numérotent 1.1, 2.1…', () => {
    assert.deepEqual(Ed.numerotation(exemple()), { 'sec-debut': '1', z: '1.1', s1: '2', a: '2.1', b: '2.2', s2: '3', c: '3.1' });
    assert.deepEqual(Ed.numerotation([]), {});
  });
  test('E4 à plat puis réassemblé, rien ne change (aller-retour)', () => {
    assert.deepEqual(Ed.assembler(Ed.aplatir(exemple())), exemple());
    const avecSaut = [{ id: 's9', titre: 'A', sautDePageAvant: true, marge: 5, lignes: [L('k')] }];
    assert.deepEqual(Ed.assembler(Ed.aplatir(avecSaut)), avecSaut);
  });
});

describe('E5 prix de vente saisi', () => {
  const proche = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
  test('E5 le prix de vente saisi règle la marge propre de la ligne (les deux modes) et le total retombe sur ce prix', () => {
    const maj = Ed.avecPrixVente(L('a', { prixAchat: 100 }), 120, 'majoration');
    proche(maj.marge, 20);
    const vente = Ed.avecPrixVente(L('a', { prixAchat: 100 }), 125, 'marge_vente');
    proche(vente.marge, 20);
    for (const [ligne, mode] of [[maj, 'majoration'], [vente, 'marge_vente']]) {
      const t = totauxDevis(devisDe([{ id: 's', lignes: [{ ...ligne, quantite: 3 }] }], { modeMarge: mode }));
      assert.equal(t.totalHt, mode === 'majoration' ? 360 : 375);
    }
  });
  test('E5 un prix d’achat inconnu (ligne libre) : le prix saisi devient le prix d’achat, marge 0 ; un prix négatif ou illisible ne change rien', () => {
    const libre = Ed.avecPrixVente(Ed.ligneLibre('l'), 80, 'majoration');
    assert.equal(libre.prixAchat, 80); assert.equal(libre.marge, 0);
    assert.equal(prixVenteDeLigne(devisDe([]), { }, libre), 80);
    assert.deepEqual(Ed.avecPrixVente(Ed.ligneLibre('l'), -3, 'majoration'), Ed.ligneLibre('l'));
    assert.deepEqual(Ed.avecPrixVente(Ed.ligneLibre('l'), Number.NaN, 'majoration'), Ed.ligneLibre('l'));
    assert.equal(Ed.margePourPrixVente(0, 10, 'majoration'), null);
    assert.equal(Ed.margePourPrixVente(10, 0, 'marge_vente'), null);
  });
  test('E5 un prix de vente à 0 € est accepté (marge de -100 % en majoration)', () => {
    const l = Ed.avecPrixVente(L('a', { prixAchat: 50 }), 0, 'majoration');
    proche(l.marge, -100);
    assert.equal(prixVenteDeLigne(devisDe([]), { }, l), 0);
  });
});

describe('E6 changements et alerte de sortie', () => {
  const base = devisDe(exemple(), { affaireId: 'a1', objet: 'Cuisine' });
  test('E6 sans changement, aucune alerte ; un champ enregistré modifié en déclenche une', () => {
    assert.equal(Ed.aDesChangements(base, structuredClone(base)), false);
    assert.equal(Ed.sortieAConfirmer({ enregistre: base, courant: structuredClone(base) }), false);
    const change = { ...structuredClone(base), objet: 'Cuisine et salon' };
    assert.equal(Ed.aDesChangements(base, change), true);
    assert.equal(Ed.sortieAConfirmer({ enregistre: base, courant: change }), true);
  });
  test('E6 un enregistrement en cours demande aussi de patienter ; un devis en lecture seule n’alerte jamais ; les champs protégés sont ignorés', () => {
    assert.equal(Ed.sortieAConfirmer({ enregistre: base, courant: base, enCours: true }), true);
    assert.equal(Ed.sortieAConfirmer({ enregistre: base, courant: { ...base, objet: 'x' }, lectureSeule: true }), false);
    assert.equal(Ed.aDesChangements(base, { ...base, numero: 'DEV-1', statut: 'envoye', modifieLe: 1 }), false);
  });
  test('E6 l’enregistrement ne contient aucun champ protégé ni valeur indéfinie', () => {
    const e = Ed.champsAEnregistrer({ ...base, numero: 'DEV-1', statut: 'brouillon', version: 2, totaux: { ht: 1 }, objet: undefined });
    for (const interdit of ['numero', 'statut', 'version', 'totaux', 'id', 'racineId', 'archive']) assert.equal(interdit in e, false);
    assert.equal('objet' in e, false);
    assert.equal(e.affaireId, 'a1');
    assert.deepEqual(Ed.champsAEnregistrer({ ...base, copie: ['a@exemple.fr'] }).copie, ['a@exemple.fr']); // les e-mails en copie s'enregistrent
    assert.equal(Ed.libelleEnregistrement('enregistre'), 'Enregistré');
    assert.equal(Ed.libelleEnregistrement('erreur'), 'Échec de l’enregistrement');
    // Les trois états courants restent courts et de longueur voisine : la barre du haut ne saute pas.
    const courts = ['enregistre', 'attente', 'enCours'].map((e) => Ed.libelleEnregistrement(e).length);
    assert.ok(Math.max(...courts) <= 15 && Math.max(...courts) - Math.min(...courts) <= 5, courts.join(','));
  });
});

describe('E7 avertissements non bloquants', () => {
  test('E7 aucune ligne', () => {
    assert.deepEqual(Ed.avertissements(devisDe([])).map((a) => a.code), ['aucuneLigne']);
  });
  test('E7 total à zéro et ligne sans quantité (une ligne de texte n’a pas besoin de quantité)', () => {
    const zero = devisDe([{ id: 's', lignes: [L('a', { prixAchat: 0 })] }]);
    assert.deepEqual(Ed.avertissements(zero).map((a) => a.code), ['totalZero']);
    const sans = devisDe([{ id: 's', lignes: [L('a', { quantite: 0 }), L('b')] }]);
    assert.deepEqual(Ed.avertissements(sans).map((a) => a.code), ['sansQuantite']);
    const texte = devisDe([{ id: 's', lignes: [L('a'), { ...Ed.ligneTexte('t'), quantite: undefined }] }]);
    assert.deepEqual(Ed.avertissements(texte), []);
  });
  test('E7 un devis correct n’a aucun avertissement et se finalise (hors destinataire)', () => {
    const ok = devisDe([{ id: 's', lignes: [L('a', { quantite: 2 })] }], { destinataires: ['client@example.fr'] });
    assert.deepEqual(Ed.avertissements(ok), []);
    assert.deepEqual(erreursFinalisation(ok), []);
    const avecTexte = devisDe([{ id: 's', lignes: [L('a'), Ed.ligneTexte('t')] }], { destinataires: ['client@example.fr'] });
    assert.deepEqual(erreursFinalisation(avecTexte), []); // une ligne de texte ne bloque pas la finalisation
  });
});

describe('E8 affaire, client et copie', () => {
  test('E8 aucun champ n’est obligatoire pour commencer : l’affaire se règle à la finalisation', () => {
    assert.deepEqual(Ed.champsManquants({}), []);
    assert.deepEqual(Ed.champsManquants({ affaireId: 'a1' }), []);
  });
  test('E8 valeurs d’un nouveau brouillon : client organisation ou personne, adresse reprise partout, premier e-mail en destinataire', () => {
    const org = { id: 'o1', nom: 'Société', emails: [{ valeur: 'contact@exemple.fr', type: 'travail' }, { valeur: 'autre@exemple.fr' }] };
    const v = Ed.valeursDeCreation({ id: 'a1' }, { type: 'organisation', fiche: org, adresse: '12 rue des Lilas\n75000 Paris' });
    assert.equal(v.affaireId, 'a1'); assert.equal(v.organisationId, 'o1'); assert.equal(v.personneId, null);
    assert.deepEqual(v.destinataires, ['contact@exemple.fr']);
    assert.deepEqual(v.adresses.chantier, { texte: '12 rue des Lilas\n75000 Paris' });
    const sans = Ed.valeursDeCreation({ id: 'a2' }, null);
    assert.deepEqual(sans.destinataires, []); assert.equal(sans.adresses.chantier, null);
    assert.deepEqual(Ed.chantierAvecAdresse({ debutTravaux: '2026-11-02' }, '3 rue X'), { debutTravaux: '2026-11-02', adresse: { texte: '3 rue X' } });
    assert.deepEqual(Ed.chantierAvecAdresse({ adresse: { texte: 'a' }, debutTravaux: '2026-11-02' }, ''), { debutTravaux: '2026-11-02' });
  });
  test('E8 copier un devis : nouveaux identifiants, prix figés retirés, ni numéro ni statut ; la copie reste finalisable', () => {
    const source = devisDe([{ id: 's1', titre: 'A', lignes: [L('a', { prixVente: 99 })] }], { numero: 'DEV-1', affaireId: 'a1', remise: { type: 'pourcentage', valeur: 10 } });
    const c = Ed.copieDeDevis(source, suite());
    assert.equal('numero' in c, false); assert.equal('statut' in c, false);
    assert.deepEqual(c.remise, { type: 'pourcentage', valeur: 10 });
    assert.deepEqual(c.sections.map((s) => s.id), ['n1']);
    assert.equal(c.sections[0].lignes[0].id, 'n2');
    assert.equal('prixVente' in c.sections[0].lignes[0], false);
    assert.equal(Ed.estLectureSeule({ statut: 'envoye' }), true);
    assert.equal(Ed.estLectureSeule({ statut: 'brouillon' }), false);
  });
});

describe('E9 prix de vente : ligne libre et marge impossible', () => {
  test('E9 une ligne libre prend toujours le prix saisi comme prix d’achat, marge 0, même si elle avait un coût', () => {
    const l = Ed.avecPrixVente({ ...Ed.ligneLibre('l'), prixAchat: 40, marge: 25 }, 90, 'majoration');
    assert.equal(l.prixAchat, 90); assert.equal(l.marge, 0);
  });
  test('E9 ligne du Bordereau, marge impossible (0 € en marge sur prix de vente) : rien n’est effacé, la saisie est signalée non réglable', () => {
    const l = L('a', { prixAchat: 50, marge: 10 });
    assert.equal(Ed.prixVenteReglable(l, 0, 'marge_vente'), false);
    assert.deepEqual(Ed.avecPrixVente(l, 0, 'marge_vente'), l);
    assert.equal(Ed.prixVenteReglable(l, 0, 'majoration'), true);
    assert.equal(Ed.prixVenteReglable(l, 80, 'marge_vente'), true);
    assert.equal(Ed.prixVenteReglable(l, -1, 'majoration'), false);
  });
});

describe('E10 une section ne monte jamais au-dessus des lignes de tête', () => {
  test('E10 « Monter » est grisé pour la première section quand des lignes libres la précèdent, et déplacer ne fait rien', () => {
    assert.equal(Ed.deplacementsPossibles(exemple(), 's1').monter, false);
    assert.deepEqual(ids(Ed.deplacerElement(exemple(), 's1', -1)), ids(exemple()));
    assert.equal(Ed.deplacementsPossibles(exemple(), 's2').monter, true);
    const sansTete = [{ id: 's1', titre: 'A', lignes: [L('a')] }, { id: 's2', titre: 'B', lignes: [] }];
    assert.equal(Ed.deplacementsPossibles(sansTete, 's1').monter, false);
    assert.equal(Ed.deplacementsPossibles(sansTete, 's2').monter, true);
  });
});

describe('E11 devis modifié ailleurs', () => {
  test('E11 même contenu quel que soit l’ordre des clés ; un champ différent est reconnu', () => {
    const a = { statut: 'brouillon', objet: 'x', chantier: { debutTravaux: '2026-11-02', adresse: { texte: 'r' } }, modifieLe: 1 };
    const b = { objet: 'x', chantier: { adresse: { texte: 'r' }, debutTravaux: '2026-11-02' }, modifieLe: 2 };
    assert.equal(Ed.memeContenu(a, b), true);
    assert.equal(Ed.memeContenu(a, { ...b, objet: 'y' }), false);
  });
});

describe('COP3 refus d’ajout d’une adresse en copie', () => {
  test('COP3 chaque cause de refus a son message ; un texte vide et une adresse valable ne sont pas refusés', () => {
    assert.equal(Ed.refusAjoutCopie('', ['a@x.fr'], []), null);
    assert.equal(Ed.refusAjoutCopie('b@x.fr', ['a@x.fr'], ['c@x.fr']), null);
    assert.equal(Ed.refusAjoutCopie('pas-un-email', [], []), Ed.MESSAGE_COPIE_INVALIDE);
    assert.equal(Ed.refusAjoutCopie(' A@X.fr ', ['a@x.fr'], []), Ed.MESSAGE_COPIE_DEJA);
    assert.equal(Ed.refusAjoutCopie('c@x.fr', ['a@x.fr'], ['C@x.fr']), Ed.MESSAGE_COPIE_DEJA_DESTINATAIRE);
    assert.equal(Ed.refusAjoutCopie('z@x.fr', Array.from({ length: 10 }, (_, i) => `p${i}@x.fr`), []), Ed.MESSAGE_COPIE_PLAFOND);
  });
  test('COP8 memeAdresse (partagée par la copie et le destinataire) ignore les espaces autour et les majuscules', () => {
    assert.equal(Ed.memeAdresse(' Compta@Exemple.fr ', 'compta@exemple.fr'), true);
    assert.equal(Ed.memeAdresse('compta@exemple.fr', 'contact@exemple.fr'), false);
    assert.equal(Ed.memeAdresse(null, ''), true); // deux vides : rien à comparer, l'appelant écarte le texte vide avant
  });
});
