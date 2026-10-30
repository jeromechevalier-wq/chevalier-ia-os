// Tests D (module Devis, logique pure) : js/modules/devis/logique.js. node --test, sans navigateur ni Firebase.
// Chaque nom de test commence par le numéro du critère de docs/cadrage-devis.md §12.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/modules/devis/logique.js';

const ctx = () => ({ maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'moi@exemple.test', nouvelId: (n) => `${n}_1` });
const reglages = { modeMarge: 'majoration', marge: 20, margeDevis: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', dureeValiditeJours: 90 };
const ligne = (id, prixAchat, quantite, extra = {}) => ({ id, libelle: `Article ${id}`, unite: 'u', quantite, prixAchat, ...extra });

/** Devis de test : achats distinctifs (123,45 et 67,89), marge 20 %, quantités sans rapport avec les prix. */
const devisType = (extra = {}) => ({
  ...D.nouveauDevis({ affaireId: 'a1', destinataires: [{ email: 'client@exemple.test' }], copie: [{ email: 'copie@exemple.test' }] }, ctx(), reglages),
  adresses: { commanditaire: { id: 'ad1', texte: '1 rue du Test' }, facturation: null, chantier: { id: 'ad2', texte: '2 rue du Chantier' } },
  sections: [
    { id: 's1', titre: 'Toiture', lignes: [ligne('l1', 123.45, 3), ligne('l2', 67.89, 7, { tauxTva: 10 })] },
  ],
  ...extra,
});

describe('Arrondi et argent', () => {
  test('D6 arrondi demi vers le haut, symétrique, jamais -0', () => {
    assert.equal(D.arrondiCentime(1.005), 1.01);
    assert.equal(D.arrondiCentime(2.675), 2.68);
    assert.equal(D.arrondiCentime(-1.005), -1.01);
    assert.equal(D.arrondiCentime(-0.001), 0);
    assert.ok(Object.is(D.arrondiCentime(-0.001), 0));
    assert.equal(D.arrondiCentime(NaN), 0);
  });
  test('D6 arrondi : 3 lignes à 0,005 € donnent 0,03 (arrondi ligne par ligne)', () => {
    const d = devisType({ regimeTva: 'franchise', sections: [{ id: 's', titre: '', lignes: [ligne('a', 0.005, 1, { marge: 0 }), ligne('b', 0.005, 1, { marge: 0 }), ligne('c', 0.005, 1, { marge: 0 })] }] });
    assert.equal(D.totauxDevis(d).ht, 0.03);
  });
  test('D6 arrondi : quantité 2,5 × 0,333 donne 0,83', () => {
    assert.equal(D.totalLigne(2.5, 0.333), 0.83);
    const d = devisType({ sections: [{ id: 's', lignes: [ligne('a', 0.333, 2.5, { marge: 0 })] }] });
    assert.equal(D.totauxDevis(d).lignes[0].totalHT, 0.83);
  });
});

describe('Marge', () => {
  test('D6 100 € d\'achat à 20 % : 120 en majoration, 125 exactement en marge sur prix de vente', () => {
    assert.equal(D.prixVenteUnitaire(100, 20, 'majoration'), 120);
    assert.equal(D.prixVenteUnitaire(100, 20, 'marge_vente'), 125);
    assert.equal(D.coefficientDeMarge(20, 'majoration').coefficient, 1.2);
  });
  test('D6 marge négative acceptée ; 100 % refusé seulement en marge_vente, sans exception', () => {
    assert.equal(D.prixVenteUnitaire(100, -10, 'majoration'), 90);
    assert.equal(D.prixVenteUnitaire(100, -10, 'marge_vente'), 90.91);
    assert.equal(D.coefficientDeMarge(300, 'majoration').erreur, null);
    for (const m of [100, 150]) {
      const r = D.coefficientDeMarge(m, 'marge_vente');
      assert.equal(r.coefficient, null);
      assert.equal(r.erreur, 'En calcul comptable, la marge doit rester inférieure à 100 %.');
    }
    assert.equal(D.prixVenteUnitaire(100, 100, 'marge_vente'), null);
  });
  test('D5 la marge de la ligne l\'emporte sur la section puis sur le devis ; 0 est une vraie valeur', () => {
    const devis = { marge: 20 }; const section = { marge: 30 };
    assert.equal(D.margeEffective({ devis, section, ligne: { marge: 5 } }), 5);
    assert.equal(D.margeEffective({ devis, section, ligne: {} }), 30);
    assert.equal(D.margeEffective({ devis, section: {}, ligne: { marge: null } }), 20);
    assert.equal(D.margeEffective({ devis, section, ligne: { marge: 0 } }), 0);
    assert.equal(D.margeEffective({ devis, section: { marge: 0 }, ligne: {} }), 0);
    const d = { modeMarge: 'majoration', marge: 20, regimeTva: 'franchise', sections: [{ id: 's', marge: 50, lignes: [{ id: 'x', quantite: 1, prixAchat: 100 }, { id: 'y', quantite: 1, prixAchat: 100, marge: 0 }] }] };
    assert.deepEqual(D.totauxDevis(d).lignes.map((l) => l.prixVenteUnitaire), [150, 100]);
  });
  test('D6 une ligne vendue sous son prix d\'achat est signalée, sans blocage', () => {
    assert.equal(D.estVendueAPerte({ prixAchat: 10, prixVente: 9 }), true);
    assert.equal(D.estVendueAPerte({ prixAchat: 10, prixVente: 10 }), false);
    const d = devisType({ marge: -10, destinataires: [{ email: 'a@b.fr' }] });
    assert.equal(D.totauxDevis(d).lignes[0].venduAPerte, true);
    assert.deepEqual(D.erreursFinalisation(d), []);
  });
});

describe('Totaux et TVA', () => {
  test('D7 totaux HT, TVA par taux (triés décroissant) et TTC', () => {
    const t = D.totauxDevis(devisType());
    // l1 : 123,45 × 1,2 = 148,14 ; × 3 = 444,42 ; l2 : 67,89 × 1,2 = 81,47 (81,468) ; × 7 = 570,29
    assert.equal(t.lignes[0].prixVenteUnitaire, 148.14);
    assert.equal(t.lignes[0].totalHT, 444.42);
    assert.equal(t.lignes[1].prixVenteUnitaire, 81.47);
    assert.equal(t.lignes[1].totalHT, 570.29);
    assert.equal(t.ht, 1014.71);
    assert.deepEqual(t.tvaParTaux, [{ taux: 20, baseHT: 444.42, montant: 88.88 }, { taux: 10, baseHT: 570.29, montant: 57.03 }]);
    assert.equal(t.tva, 145.91);
    assert.equal(t.ttc, 1160.62);
    assert.equal(t.sections[0].sousTotalHT, 1014.71);
    assert.deepEqual(t.mentions, []);
  });
  test('D7 la TVA se calcule sur la somme des lignes d\'un taux, pas ligne par ligne', () => {
    const d = devisType({ sections: [{ id: 's', lignes: [ligne('a', 0.1, 1, { marge: 0 }), ligne('b', 0.1, 1, { marge: 0 }), ligne('c', 0.1, 1, { marge: 0 })] }] });
    // 0,30 HT × 20 % = 0,06 (et non 3 × 0,02 arrondis)
    assert.equal(D.totauxDevis(d).tva, 0.06);
  });
  test('D7 franchise : TVA nulle, TTC = HT, mention 293 B, aucun taux listé', () => {
    const t = D.totauxDevis(devisType({ regimeTva: 'franchise' }));
    assert.equal(t.tva, 0); assert.equal(t.ttc, t.ht); assert.deepEqual(t.tvaParTaux, []);
    assert.deepEqual(t.mentions, [D.MENTION_FRANCHISE]);
    assert.match(D.MENTION_FRANCHISE, /293 B/);
  });
  test('D29 autoliquidation : TVA nulle, mention d\'autoliquidation, taux des lignes conservés', () => {
    const d = devisType({ autoliquidation: true });
    const t = D.totauxDevis(d);
    assert.equal(t.tva, 0); assert.equal(t.ttc, t.ht); assert.deepEqual(t.tvaParTaux, []);
    assert.deepEqual(t.mentions, [D.MENTION_AUTOLIQUIDATION]);
    assert.equal(d.sections[0].lignes[1].tauxTva, 10);
  });
  test('D8 un devis figé ne bouge plus : changer le prix d\'achat ou les réglages ne change pas les totaux', () => {
    const brouillon = devisType();
    const r = D.figerPourFinalisation(brouillon, { numero: 'DEV-2026-10-24-001', finaliseLe: '2026-10-24', reglages: { regimeTva: 'assujetti' } });
    assert.deepEqual(r.erreurs, []);
    const fige = r.devis;
    assert.equal(fige.statut, 'en_attente_envoi');
    assert.equal(fige.numero, 'DEV-2026-10-24-001');
    assert.deepEqual(fige.finalisation, { n8n: 'en_cours' });
    assert.equal(fige.sections[0].lignes[0].prixVente, 148.14);
    assert.equal(fige.sections[0].lignes[1].tauxTva, 10);
    assert.equal(brouillon.statut, 'brouillon'); // l'original n'est pas touché
    assert.equal(brouillon.sections[0].lignes[0].prixVente, undefined);
    const avant = D.totauxDevis(fige);
    assert.deepEqual(fige.totaux, avant);
    const modifie = structuredClone(fige);
    modifie.marge = 99; modifie.modeMarge = 'marge_vente'; modifie.sections[0].lignes[0].prixAchat = 1;
    assert.deepEqual(D.totauxDevis(modifie), avant);
    // Les réglages ne sont jamais relus : on change le taux par défaut des réglages, rien ne bouge.
    const autreTaux = structuredClone(fige);
    autreTaux.tauxTvaDefaut = 5.5;
    assert.deepEqual(D.totauxDevis(autreTaux), avant);
  });
  test('D8 le régime de TVA est figé à la finalisation, refus d\'un devis invalide', () => {
    const r = D.figerPourFinalisation(devisType(), { numero: 'N', finaliseLe: '2026-10-24', reglages: { regimeTva: 'franchise' } });
    assert.equal(r.devis.regimeTva, 'franchise');
    assert.equal(r.devis.totaux.tva, 0);
    const refus = D.figerPourFinalisation(devisType({ sections: [] }), { numero: 'N', finaliseLe: '2026-10-24', reglages: { regimeTva: 'assujetti' } });
    assert.equal(refus.devis, null);
    assert.ok(refus.erreurs.length > 0);
  });
});

describe('Numéro, expiration, statuts', () => {
  test('D11 format du numéro DEV-AAAA-MM-JJ-NNN, 3 chiffres au moins', () => {
    assert.equal(D.numeroDevis('2026-10-24', 1), 'DEV-2026-10-24-001');
    assert.equal(D.numeroDevis('2026-10-24', 42), 'DEV-2026-10-24-042');
    assert.equal(D.numeroDevis('2026-10-24', 999), 'DEV-2026-10-24-999');
    assert.equal(D.numeroDevis('2026-10-24', 1000), 'DEV-2026-10-24-1000');
    assert.equal(D.numeroDevis('24/10/2026', 1), null);
    assert.equal(D.numeroDevis('2026-02-30', 1), null);
    assert.equal(D.numeroDevis('2026-10-24', 0), null);
  });
  test('D3 l\'expiration est calculée à la création (90 jours par défaut) ; D3 nouveau devis : version 1, brouillon', () => {
    assert.equal(D.dateExpiration('2026-10-24', 90), '2027-01-22');
    assert.equal(D.dateExpiration('2026-10-24T08:00:00Z', 30), '2026-11-23');
    assert.equal(D.dateExpiration('n importe quoi', 30), null);
    const d = D.nouveauDevis({ affaireId: 'a1', personneId: 'p1', marge: 15 }, ctx(), reglages);
    assert.equal(d.id, 'devis_1'); assert.equal(d.racineId, d.id);
    assert.equal(d.version, 1); assert.equal(d.numero, null); assert.equal(d.statut, 'brouillon');
    assert.deepEqual(d.sections, []); assert.equal(d.archive, false); assert.equal(d.autoliquidation, false);
    assert.equal(d.marge, 15); assert.equal(d.modeMarge, 'majoration'); assert.equal(d.tauxTvaDefaut, 20);
    assert.equal(d.regimeTva, 'assujetti'); assert.equal(d.creePar, 'moi@exemple.test'); assert.equal(d.expireLe, '2027-01-22');
    assert.equal(d.personneId, 'p1'); assert.equal(d.organisationId, null);
  });
  test('13e nouveauDevis : la marge du devis vient de valeurs.marge (0 compris), sinon de reglages.margeDevis, et jamais de la marge des articles', () => {
    const base = { affaireId: 'a1' };
    assert.equal(D.nouveauDevis(base, ctx(), { marge: 35, margeDevis: 12 }).marge, 12);
    assert.equal(D.nouveauDevis({ ...base, marge: 0 }, ctx(), { marge: 35, margeDevis: 12 }).marge, 0);
    assert.equal(D.nouveauDevis({ ...base, marge: 8 }, ctx(), { margeDevis: 12 }).marge, 8);
    assert.equal(D.nouveauDevis(base, ctx(), { marge: 35 }).marge, 0, 'des réglages incomplets (jamais passés par reglagesDevis) : pas de marge inventée');
  });
  test('D39 expiré = calcul à l\'affichage : la veille non, le jour même non, le lendemain oui, sans rien écrire', () => {
    const d = Object.freeze({ statut: 'envoye', expireLe: '2026-12-31' });
    assert.equal(D.estExpire(d, '2026-12-30'), false);
    assert.equal(D.estExpire(d, '2026-12-31'), false);
    assert.equal(D.estExpire(d, '2027-01-01'), true);
    assert.equal(D.estExpire({ statut: 'en_attente_envoi', expireLe: '2026-12-31' }, '2027-01-01'), true);
    for (const statut of ['brouillon', 'accepte', 'refuse', 'remplace']) assert.equal(D.estExpire({ statut, expireLe: '2026-01-01' }, '2027-01-01'), false);
    assert.deepEqual(d, { statut: 'envoye', expireLe: '2026-12-31' });
  });
  test('D16 table des transitions : aucune transition libre', () => {
    const attendu = {
      finaliser: ['brouillon'], marquer_envoye: ['en_attente_envoi'], accepter: ['en_attente_envoi', 'envoye'], refuser: ['en_attente_envoi', 'envoye'],
      nouvelle_version: ['en_attente_envoi', 'envoye', 'refuse'], remplacer: ['en_attente_envoi', 'envoye'], archiver: ['en_attente_envoi', 'accepte', 'refuse'],
    };
    for (const [action, permis] of Object.entries(attendu)) {
      for (const { id } of D.STATUTS_DEVIS) assert.equal(D.transitionPossible(id, action), permis.includes(id), `${action} depuis ${id}`);
    }
    assert.equal(D.transitionPossible('brouillon', 'inconnue'), false);
    assert.equal(D.statutApres('brouillon', 'finaliser'), 'en_attente_envoi');
    assert.equal(D.statutApres('envoye', 'accepter'), 'accepte');
    assert.equal(D.statutApres('brouillon', 'accepter'), null);
    assert.equal(D.statutApres('en_attente_envoi', 'accepter'), 'accepte', '5 signé aussi depuis Finalisé (30/10/2026)');
  });
  test('D21 archiver est un drapeau, permis pour finalisé, accepté ou refusé', () => {
    assert.equal(D.peutArchiver({ statut: 'accepte', archive: false }), true);
    assert.equal(D.peutArchiver({ statut: 'refuse' }), true);
    assert.equal(D.peutArchiver({ statut: 'en_attente_envoi' }), true, 'un devis finalisé jamais envoyé a une sortie');
    assert.equal(D.peutArchiver({ statut: 'accepte', archive: true }), false);
    assert.equal(D.peutArchiver({ statut: 'envoye' }), false);
    assert.equal(D.peutArchiver({ statut: 'brouillon' }), false);
  });
});

describe('Validation de finalisation', () => {
  test('D9b une adresse e-mail en copie invalide empêche de finaliser ; une adresse valide est acceptée', () => {
    assert.deepEqual(D.erreursFinalisation(devisType({ copie: ['contact@exemple.fr'] })), []);
    assert.ok(D.erreursFinalisation(devisType({ copie: ['pas-un-email'] })).some((e) => /en copie n'est pas valide/.test(e)));
  });
  test('D9c plus de 10 adresses en copie : le serveur refuse de finaliser (10 passent)', () => {
    const adresses = (n) => Array.from({ length: n }, (_, i) => `copie${i}@exemple.fr`);
    assert.deepEqual(D.erreursFinalisation(devisType({ copie: adresses(D.MAX_COPIE) })), []);
    assert.ok(D.erreursFinalisation(devisType({ copie: adresses(D.MAX_COPIE + 1) })).some((e) => /trop d'adresses e-mail en copie/.test(e)));
  });
  test('D9d une adresse à la fois destinataire et en copie empêche de finaliser (mêmes mots que le serveur MCP, sans tenir compte des majuscules)', () => {
    const erreurs = D.erreursFinalisation(devisType({ destinataires: [{ email: 'client@exemple.test' }], copie: ['autre@exemple.test', ' Client@Exemple.test '] }));
    assert.ok(erreurs.includes('L\'adresse « Client@Exemple.test » est déjà destinataire : elle ne peut pas être aussi en copie.'), erreurs.join(' | '));
    assert.deepEqual(D.erreursFinalisation(devisType({ destinataires: [{ email: 'client@exemple.test' }], copie: ['autre@exemple.test'] })), []);
    assert.deepEqual(D.erreursFinalisation(devisType({ destinataires: [], copie: ['client@exemple.test'] })), []);
  });
  test('D9 un devis complet est valide', () => assert.deepEqual(D.erreursFinalisation(devisType()), []));
  test('D9 sans ligne ; le destinataire est facultatif (impression, remise en main propre) mais une adresse écrite doit être valide', () => {
    assert.ok(D.erreursFinalisation(devisType({ sections: [] })).some((e) => /au moins une ligne/.test(e)));
    assert.ok(!D.erreursFinalisation(devisType({ destinataires: [] })).some((e) => /destinataire/.test(e)));
    assert.ok(!D.erreursFinalisation(devisType({ destinataires: [], copie: [{ email: 'copie@exemple.test' }] })).some((e) => /destinataire/.test(e)));
    assert.ok(D.erreursFinalisation(devisType({ destinataires: [{ email: 'pas-un-email' }] })).some((e) => /pas valide/.test(e)));
  });
  test('D9 quantité, prix d\'achat et marge invalides sont signalés ligne par ligne', () => {
    const base = (l, extra = {}) => devisType({ sections: [{ id: 's', titre: 'T', lignes: [l] }], ...extra });
    assert.ok(D.erreursFinalisation(base(ligne('a', 10, 0))).some((e) => /quantité/.test(e)));
    assert.ok(D.erreursFinalisation(base(ligne('a', 10, -2))).some((e) => /quantité/.test(e)));
    assert.ok(D.erreursFinalisation(base(ligne('a', 10, undefined))).some((e) => /quantité/.test(e)));
    assert.ok(D.erreursFinalisation(base(ligne('a', 'abc', 1))).some((e) => /prix d'achat/.test(e)));
    assert.ok(D.erreursFinalisation(base(ligne('a', undefined, 1))).some((e) => /prix d'achat/.test(e)));
    assert.ok(D.erreursFinalisation(base(ligne('a', 10, 1), { modeMarge: 'marge_vente', marge: 100 })).some((e) => /inférieure à 100/.test(e)));
    assert.ok(D.erreursFinalisation(base(ligne('a', 10, 1, { marge: 100 }), { modeMarge: 'marge_vente', marge: 10 })).some((e) => /inférieure à 100/.test(e)));
    assert.deepEqual(D.erreursFinalisation(base(ligne('a', 10, 1, { marge: 100 }))), []); // 100 % accepté en majoration
  });
  test('D38 une version déjà finalisée ne se finalise plus', () => {
    assert.ok(D.erreursFinalisation(devisType({ statut: 'envoye' })).some((e) => /version suivante/.test(e)));
  });
});

describe('Vue client et textes', () => {
  const interdit = ['prixAchat', 'marge', 'coefficient', 'modeMarge'];
  const cles = (o, acc = []) => {
    if (Array.isArray(o)) o.forEach((x) => cles(x, acc));
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { acc.push(k); cles(v, acc); }
    return acc;
  };
  const fige = () => D.figerPourFinalisation(devisType({ marge: 20 }), { numero: 'DEV-2026-10-24-007', finaliseLe: '2026-10-24', reglages: { regimeTva: 'assujetti' } }).devis;

  test('D13 la vue client n\'a aucune clé interdite, à aucun niveau, ni aucun prix d\'achat dans son JSON', () => {
    const d = fige();
    // une section et une ligne avec des marges propres, pour vérifier qu'elles ne sortent pas
    d.sections[0].marge = 33; d.sections[0].lignes[0].marge = 44;
    const v = D.vueClient(d, { espace: 'espace1', dossierDriveId: 'drv1', emetteur: { nom: 'Atelier Test' } });
    const toutes = cles(v);
    for (const k of interdit) assert.ok(!toutes.includes(k), `clé interdite : ${k}`);
    const json = JSON.stringify(v);
    for (const achat of ['123.45', '67.89', '123,45', '67,89']) assert.ok(!json.includes(achat), `fuite : ${achat}`);
    assert.equal(v.formatVersion, 1); assert.equal(v.espace, 'espace1'); assert.equal(v.devisId, d.id);
    assert.equal(v.version, 1); assert.equal(v.numero, 'DEV-2026-10-24-007');
    assert.equal(v.cleIdempotence, `${d.id}:1`); assert.equal(v.dossierDriveId, 'drv1');
    assert.equal(v.dateEmission, '2026-10-24'); assert.equal(v.dateValidite, d.expireLe);
    assert.deepEqual(v.destinataires, ['client@exemple.test']); assert.deepEqual(v.copie, ['copie@exemple.test']);
    assert.equal(v.emetteur.nom, 'Atelier Test');
    assert.equal(v.totaux.ht, d.totaux.ht);
    assert.equal(v.sections[0].lignes[0].totalHT, d.totaux.lignes[0].totalHT);
    assert.equal(v.sections[0].lignes[1].tauxTva, 10);
  });
  test('D13 sans émetteur fourni, pas de clé emetteur ; même si des champs de marge se glissent dans une adresse', () => {
    const d = fige();
    d.adresses.chantier = { id: 'ad2', texte: '2 rue du Chantier', marge: 5 };
    const v = D.vueClient(d, { espace: 'e' });
    assert.ok(!('emetteur' in v));
    assert.ok(!cles(v).includes('marge'));
  });
  test('D31 le texte client ne contient ni prix d\'achat ni coefficient ni marge ; la vue interne les contient', () => {
    const d = fige();
    const client = D.texteVueClient(d);
    for (const x of ['123,45', '67,89', '123.45', '67.89', 'coefficient', 'marge', 'achat', 'perte']) assert.ok(!client.toLowerCase().includes(x), `fuite : ${x}`);
    assert.match(client, /Total HT : 1014,71 €/);
    assert.match(client, /TVA 20 % sur 444,42 € : 88,88 €/);
    assert.match(client, /Total TTC : 1160,62 €/);
    assert.equal(client.split('\n').filter((l) => l.startsWith('- ')).length, 2);
    const interne = D.texteVueInterne(d);
    assert.match(interne, /achat 123,45 €/);
    assert.match(interne, /coefficient 1,2/);
    assert.match(interne, /marge 20 %/);
    const perte = D.texteVueInterne({ ...d, sections: [{ id: 's', lignes: [{ id: 'z', libelle: 'Z', quantite: 1, unite: 'u', prixAchat: 10, prixVente: 8 }] }] });
    assert.match(perte, /vendu à perte/);
  });
  test('D7 le texte client porte les mentions de franchise et d\'autoliquidation', () => {
    assert.match(D.texteVueClient(devisType({ regimeTva: 'franchise' })), /293 B/);
    assert.match(D.texteVueClient(devisType({ autoliquidation: true })), /Autoliquidation/);
  });
});

describe('Nouvelle version et montant d\'affaire', () => {
  test('D18 une nouvelle version est un brouillon copié, sans modifier l\'original', () => {
    const fige = D.figerPourFinalisation(devisType(), { numero: 'DEV-2026-10-24-003', finaliseLe: '2026-10-24', reglages: { regimeTva: 'assujetti' } }).devis;
    const copieAvant = structuredClone(fige);
    const v2 = D.nouvelleVersion(fige, { id: 'devis_2', creeLe: new Date('2026-11-02T09:00:00Z') });
    assert.deepEqual(fige, copieAvant);
    assert.equal(v2.id, 'devis_2'); assert.equal(v2.racineId, fige.racineId); assert.equal(v2.version, 2);
    assert.equal(v2.statut, 'brouillon'); assert.equal(v2.numero, 'DEV-2026-10-24-003');
    assert.equal(v2.finalisation, undefined); assert.equal(v2.finaliseLe, undefined); assert.equal(v2.totaux, undefined);
    assert.deepEqual(v2.destinataires, fige.destinataires); assert.deepEqual(v2.adresses, fige.adresses);
    assert.equal(v2.sections[0].lignes.length, 2); assert.equal(v2.sections[0].lignes[0].prixAchat, 123.45);
    assert.equal(v2.sections[0].lignes[0].prixVente, undefined); // recalculé tant que brouillon
    assert.equal(v2.expireLe, '2027-01-31');
    v2.sections[0].lignes[0].libelle = 'changé';
    assert.notEqual(fige.sections[0].lignes[0].libelle, 'changé'); // copie profonde
  });
  test('D17 montant d\'affaire : devis acceptés non archivés, sinon devis proposé le plus récent, sinon la saisie reste (détail : devis-montant-affaire.test.js)', () => {
    const fige = D.figerPourFinalisation(devisType(), { numero: 'N', finaliseLe: '2026-10-24', reglages: { regimeTva: 'assujetti' } }).devis;
    assert.equal(D.montantAffaireDepuisDevis([{ ...fige, statut: 'refuse' }, { ...fige, statut: 'brouillon' }], 5000), 5000);
    assert.equal(D.montantAffaireDepuisDevis([], 0), 0);
    assert.equal(D.montantAffaireDepuisDevis([{ ...fige, statut: 'envoye' }], 5000), 1014.71);
    assert.equal(D.montantAffaireDepuisDevis([{ ...fige, statut: 'accepte' }], 5000), 1014.71);
    assert.equal(D.montantAffaireDepuisDevis([{ ...fige, statut: 'accepte' }, { ...fige, statut: 'accepte', archive: true }, { ...fige, statut: 'envoye' }], 5000), 1014.71);
  });
});

describe('Corrections de relecture', () => {
  test('D8 un prix de vente périmé sur un brouillon est recalculé, pas honoré', () => {
    const d = devisType({ sections: [{ id: 's', lignes: [ligne('a', 50, 1, { marge: 20, prixVente: 120 })] }] });
    assert.equal(D.totauxDevis(d).lignes[0].prixVenteUnitaire, 60);
  });
  test('D13 deux lignes sans identifiant ne se confondent pas, et la validation les refuse', () => {
    const d = devisType({ regimeTva: 'franchise', sections: [{ id: 's', lignes: [ligne(undefined, 10, 1, { marge: 0 }), ligne(undefined, 90, 1, { marge: 0 })] }] });
    assert.deepEqual(D.vueClient(d).sections[0].lignes.map((l) => l.totalHT), [10, 90]);
    assert.ok(D.erreursFinalisation(d).some((e) => /identifiant/.test(e)));
  });
  test('D9 une marge qui rendrait le prix négatif est refusée à la finalisation', () => {
    const d = devisType({ modeMarge: 'majoration', marge: -150 });
    assert.ok(D.erreursFinalisation(d).some((e) => /négatif/.test(e)));
  });
  test('D39 une date ISO avec heure et une Date donnent le même jour', () => {
    assert.equal(D.dateExpiration('2026-10-24T23:30:00Z', 0), D.dateExpiration(new Date('2026-10-24T23:30:00Z'), 0));
  });
  test('D18 la nouvelle version garde la durée de validité et oublie la raison de refus', () => {
    const d = devisType({ dureeValiditeJours: 30, raisonRefus: 'trop cher' });
    const v2 = D.nouvelleVersion(d, { id: 'x2', creeLe: new Date('2026-10-24T10:00:00Z') });
    assert.equal(v2.raisonRefus, undefined);
    assert.equal(v2.expireLe, D.dateExpiration(new Date('2026-10-24T10:00:00Z'), 30));
  });
});

describe('C8 libellés des statuts', () => {
  test('C8 les libellés affichés sont Brouillon, Finalisé, Envoyé, Devis signé, Devis refusé, Expiré, Devis remplacé (les identifiants stockés ne changent pas)', () => {
    assert.deepEqual(D.STATUTS_DEVIS.map((s) => s.libelle), ['Brouillon', 'Finalisé', 'Envoyé', 'Devis signé', 'Devis refusé', 'Expiré', 'Devis remplacé']);
    const id = (libelle) => D.STATUTS_DEVIS.find((s) => s.libelle === libelle).id;
    assert.equal(id('Finalisé'), 'en_attente_envoi');
    assert.equal(id('Devis signé'), 'accepte');
    assert.equal(id('Brouillon'), 'brouillon');
    assert.equal(id('Envoyé'), 'envoye');
    assert.equal(id('Devis refusé'), 'refuse');
    assert.equal(id('Devis remplacé'), 'remplace');
    // Expiré se calcule à l'affichage : aucune action ne mène à lui.
    assert.equal(Object.values(D.TRANSITIONS).some((t) => t.vers === 'expire'), false);
    assert.equal(D.STATUTS_DEVIS.some((s) => /attente|Accepté/i.test(s.libelle)), false);
  });
});

describe('L1 export des données du module Devis', () => {
  test('L1 le fichier Devis a son propre nom, distinct de la sauvegarde complète, et la date est celle de Paris', async () => {
    const CRM = await import('../js/modules/crm/logique.js');
    assert.equal(CRM.nomFichierExport(new Date('2026-10-27T10:00:00Z'), 'devis'), 'chevalier-ia-devis-2026-10-27.json');
    assert.equal(CRM.nomFichierExport(new Date('2026-10-27T23:30:00Z'), 'devis'), 'chevalier-ia-devis-2026-10-28.json');
    assert.equal(CRM.nomFichierExport(new Date('2026-10-27T10:00:00Z')), 'chevalier-ia-os-2026-10-27.json');
  });
  test('L1 un module vide donne des listes vides, pas une erreur', async () => {
    const CRM = await import('../js/modules/crm/logique.js');
    const sortie = JSON.parse(CRM.exportJson({ devis_articles: [], devis_parametres: [], devis_devis: [] }, new Date('2026-10-27T10:00:00Z')));
    assert.deepEqual(sortie.collections, { devis_articles: [], devis_parametres: [], devis_devis: [] });
  });
});


describe('3 nom interne du devis (distinct de l’objet imprimé)', () => {
  test('3a un devis neuf porte le nom nettoyé (80 caractères au plus, accents gardés) ; sans nom, aucun champ', () => {
    const d = D.nouveauDevis({ affaireId: 'a1', nom: `  Variante   économique été ${'é'.repeat(100)}` }, ctx(), reglages);
    assert.ok(d.nom.startsWith('Variante économique été é'));
    assert.equal(d.nom.length, D.NOM_DEVIS_MAX);
    assert.equal('nom' in D.nouveauDevis({ affaireId: 'a1' }, ctx(), reglages), false);
    assert.equal(D.nettoyerNomDevis(undefined), '');
  });
  test('3c le nom n’est JAMAIS dans la vue client ni dans le HTML imprimé (l’objet, lui, y est)', async () => {
    const { htmlDuDevis } = await import('../js/modules/devis/html-devis.js');
    const d = devisType({ nom: 'Nom interne secret', objet: 'Rénovation de la cuisine' });
    assert.doesNotMatch(JSON.stringify(D.vueClient(d, { clientNom: 'Mme Dupont' })), /Nom interne secret/);
    const html = htmlDuDevis(d, { clientNom: 'Mme Dupont' });
    assert.doesNotMatch(html, /Nom interne secret/);
    assert.match(html, /Rénovation de la cuisine/);
  });
  test('3 une nouvelle version copie le nom', () => {
    const v2 = D.nouvelleVersion(devisType({ nom: 'Variante A', statut: 'envoye', numero: 'DEV-001' }), { id: 'd2', creeLe: new Date('2026-10-25T10:00:00Z') });
    assert.equal(v2.nom, 'Variante A');
  });
});

describe('SA devis sans affaire (28/10/2026) : le brouillon se crée sans affaire, la finalisation l’exige', () => {
  test('SA3 nouveauDevis accepte l’absence d’affaire ; erreursFinalisation nomme l’affaire manquante (même phrase pour l’écran, la fonction et l’assistant)', () => {
    const d = devisType({ affaireId: null, destinataires: [{ email: 'a@b.fr' }] });
    assert.equal(D.nouveauDevis({}, { id: 'x' }).affaireId, null);
    assert.ok(D.erreursFinalisation(d).includes(D.MESSAGE_AFFAIRE_MANQUANTE));
    assert.equal(D.MESSAGE_AFFAIRE_MANQUANTE, 'Choisis l\'affaire de ce devis.');
    assert.ok(!D.erreursFinalisation({ ...d, affaireId: 'a1' }).includes(D.MESSAGE_AFFAIRE_MANQUANTE));
  });
});
