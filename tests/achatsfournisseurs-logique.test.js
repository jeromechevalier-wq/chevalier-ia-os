// Module Achats « Fournisseurs » (PR 5) : règles pures, portées de l'appli d'achats avec les MÊMES cas et les mêmes valeurs (c'est le filet du portage).
// B1 fusion des deux listes, B2 compteur, B3 tri, B4 recherche, B5 filtre par état, B6 export CSV, B7 menu « … » ; C = confirmations d'IBAN (file, corps des écritures, alertes) ; D = format de l'IBAN ; E = textes et dates.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import {
  actionsLigne, CRITERES_FOURNISSEURS_VIDES, corpsConfirmation, corpsRevocation, dateFr, dateJourFichier, detailsEtat, etatConfirmation, etatDeLigne, filtrerFournisseurs, fusionner, ibanLisible, ibanValide,
  lireTriFournisseurs, normaliserIban, pastillesFournisseurs, phraseLigne, retirerCritereFournisseur, texteCompteur, texteObligatoire, trierFile, trierFournisseurs, TRI_FOURNISSEURS_DEFAUT, ETATS_FOURNISSEUR, LIBELLE_ETAT_FOURNISSEUR,
} from '../js/modules/achatsfournisseurs/logique.js';
import { BOM, construireCsv, ENTETES_FOURNISSEURS, formaterCellule, fournisseursCsv, nomFichierFournisseurs, nombreCsv, protegerFormule, TEXTE_RIEN_A_EXPORTER } from '../js/modules/achatsfournisseurs/csv.js';
import { IBAN, IBAN2, ligne, conf } from './fixtures/achats/fournisseurs.js';

describe('B1. fusion des deux listes en une ligne par couple', () => {
  test('B1a. à vérifier seul', () => {
    const [l] = fusionner([ligne()], []);
    assert.equal(l.etat, 'a_verifier'); assert.equal(l.nbFactures, 2);
  });
  test('B1b. confirmé seul : pas de nombre de factures ni de dernière facture', () => {
    const [l] = fusionner([], [conf()]);
    assert.equal(l.etat, 'confirme'); assert.equal(l.nbFactures, null); assert.equal(l.derniere, null);
  });
  test('B1c. couple dans les deux listes : la confirmation active gagne, une seule ligne', () => {
    const r = fusionner([ligne()], [conf()]);
    assert.equal(r.length, 1); assert.equal(r[0].etat, 'confirme'); assert.equal(r[0].source.type, 'confirme');
  });
  test('B1c2. une confirmation révoquée ne gagne pas : la ligne à vérifier reste', () => {
    const r = fusionner([ligne()], [conf({ revoque_le: '2026-11-12T00:00:00Z' })]);
    assert.equal(r.length, 1); assert.equal(r[0].source.type, 'a_verifier');
  });
  test('B1d. révoqué : ligne à vérifier avec revoque_le', () => {
    assert.equal(fusionner([ligne({ revoque_le: '2026-11-12T00:00:00Z', motif_revocation: 'RIB changé' })], [])[0].etat, 'revoque');
  });
  test('B1e. alerte : IBAN vu chez un autre fournisseur (ou ligne non confirmable)', () => {
    assert.equal(fusionner([ligne({ vu_chez_autre_siren: true })], [])[0].etat, 'alerte');
    assert.equal(etatDeLigne(ligne({ confirme_pour_autre_siren: true })), 'alerte');
  });
  test('B1f. aucune donnée : liste vide', () => { assert.deepEqual(fusionner([], []), []); });
  test('B1g. la ligne garde l’objet source tel quel (jamais reconstruit)', () => {
    const v = ligne({ vu_chez_autre_siren: true }); const c = conf({ fournisseur_id: 'autre', id: 'c9' });
    const r = fusionner([v], [c]);
    const a = r.find((x) => x.source.type === 'a_verifier'); const b = r.find((x) => x.source.type === 'confirme');
    assert.equal(a.source.ligne, v);
    assert.equal(b.source.confirmation, c);
  });
  test('B1h. à vérifier d’abord, puis confirmés du plus récent au plus ancien', () => {
    const r = fusionner([ligne({ iban: IBAN2 })], [conf({ id: 'vieille', confirme_le: '2026-01-01T00:00:00Z', fournisseur_id: 'x' }), conf({ id: 'recente', confirme_le: '2026-11-01T00:00:00Z', fournisseur_id: 'y' })]);
    assert.deepEqual(r.map((l) => l.etat), ['a_verifier', 'confirme', 'confirme']);
    assert.deepEqual(r.slice(1).map((l) => l.source.type === 'confirme' && l.source.confirmation.id), ['recente', 'vieille']);
  });
  test('B1i. le détail garde toute l’information d’avant (phrase, motif, raison, alerte, vérification)', () => {
    const t = (l) => detailsEtat(l).map((d) => d.texte).join(' | ');
    assert.match(t(fusionner([ligne({ revoque_le: '2026-11-12T00:00:00Z', motif_revocation: 'RIB changé' })], [])[0]), /révoquée le .*RIB changé/);
    assert.match(t(fusionner([ligne({ confirme_pour_autre_siren: true })], [])[0]), /autre fournisseur/);
    assert.match(detailsEtat(fusionner([ligne({ revoque_le: '2026-11-12T00:00:00Z', motif_revocation: 'RIB changé', facture_a_confirmer: null })], [])[0]).map((d) => d.texte).join('|'), /révoquée le .*\|motif : RIB changé\|Vu seulement/);
    assert.equal(detailsEtat(fusionner([ligne({ vu_seulement_sur_refusee: true, facture_a_confirmer: null })], [])[0]).length, 1); // phrase répétée par la raison : une seule fois
    assert.equal(detailsEtat(fusionner([ligne({ vu_chez_autre_siren: true })], [])[0]).some((d) => d.erreur), true);
    assert.match(t(fusionner([], [conf()])[0]), /^Vérifié : Appel au numéro connu · le .* par a@b\.fr$/);
  });
});

describe('B2. compteur et pluriels', () => {
  const mix = (nbAV, nbC) => fusionner(
    Array.from({ length: nbAV }, (_, i) => ligne({ fournisseur_id: `a${i}` })), Array.from({ length: nbC }, (_, i) => conf({ id: `c${i}`, fournisseur_id: `c${i}` })));
  test('B2a. 0', () => { assert.equal(texteCompteur(mix(0, 0)), '0 IBAN · 0 à vérifier · 0 confirmé'); });
  test('B2b. 1', () => { assert.equal(texteCompteur(mix(1, 1)), '2 IBAN · 1 à vérifier · 1 confirmé'); });
  test('B2c. 2', () => { assert.equal(texteCompteur(mix(2, 2)), '4 IBAN · 2 à vérifier · 2 confirmés'); });
  test('B2d. avec un filtre : « k sur N »', () => { assert.equal(texteCompteur(mix(2, 2), 1), '1 sur 4 IBAN · 2 à vérifier · 2 confirmés'); });
});

describe('B3. tri', () => {
  const lignes = fusionner(
    [ligne({ fournisseur_id: 'b', nom: 'Bois Sud', nb_factures: 5, derniere_facture_le: '2026-10-01T00:00:00Z', iban: IBAN }), ligne({ fournisseur_id: 'a', nom: 'Électro', nb_factures: 1, derniere_facture_le: '2026-11-01T00:00:00Z', iban: IBAN2 }), ligne({ fournisseur_id: 'z', nom: null, nb_factures: 9, derniere_facture_le: null, iban: 'FR7611111222223333344444555' })],
    [conf({ fournisseur_id: 'k', nom: 'Chaux' })]);
  const noms = (t) => t.map((l) => l.nom);
  test('B3a. défaut : à vérifier d’abord, confirmés ensuite', () => {
    const attendu = noms(lignes); // ordre produit par la fusion = ordre de la file d’avant
    assert.deepEqual(noms(trierFournisseurs(lignes, { critere: 'defaut', sens: 'asc' })), attendu);
    assert.equal(attendu.at(-1), 'Chaux'); assert.deepEqual(attendu.slice(0, 2), ['Électro', 'Bois Sud']);
  });
  test('B3b. défaut inversé', () => { assert.deepEqual(noms(trierFournisseurs(lignes, { critere: 'defaut', sens: 'desc' })), [...noms(lignes)].reverse()); });
  test('B3c. nom, sans accents, nom absent en dernier dans les deux sens', () => {
    assert.deepEqual(noms(trierFournisseurs(lignes, { critere: 'nom', sens: 'asc' })), ['Bois Sud', 'Chaux', 'Électro', null]);
    assert.deepEqual(noms(trierFournisseurs(lignes, { critere: 'nom', sens: 'desc' })), ['Électro', 'Chaux', 'Bois Sud', null]);
  });
  test('B3d. nombre de factures : la confirmée (sans donnée) reste en dernier dans les deux sens', () => {
    assert.deepEqual(noms(trierFournisseurs(lignes, { critere: 'factures', sens: 'desc' })), [null, 'Bois Sud', 'Électro', 'Chaux']);
    assert.deepEqual(noms(trierFournisseurs(lignes, { critere: 'factures', sens: 'asc' })), ['Électro', 'Bois Sud', null, 'Chaux']);
  });
  test('B3e. dernière facture : les lignes sans date en dernier dans les deux sens', () => {
    assert.deepEqual(noms(trierFournisseurs(lignes, { critere: 'derniere', sens: 'desc' })), ['Électro', 'Bois Sud', null, 'Chaux']);
    assert.deepEqual(noms(trierFournisseurs(lignes, { critere: 'derniere', sens: 'asc' })), ['Bois Sud', 'Électro', null, 'Chaux']);
  });
  test('B3f. ne modifie pas la liste reçue', () => { const avant = [...lignes]; trierFournisseurs(lignes, { critere: 'nom', sens: 'desc' }); assert.deepEqual(lignes, avant); });
  test('B3g. le tri mémorisé « critère:sens » est relu ; tout ce qui est inconnu redonne le tri par défaut', () => {
    assert.deepEqual(lireTriFournisseurs('nom:desc'), { critere: 'nom', sens: 'desc' });
    for (const t of ['', 'nom', 'nom:haut', 'inconnu:asc', undefined, null]) assert.deepEqual(lireTriFournisseurs(t), TRI_FOURNISSEURS_DEFAUT);
  });
});

describe('B4. recherche', () => {
  const lignes = fusionner([ligne({ nom: 'Électro Sud' })], [conf({ fournisseur_id: 'k', nom: 'Chaux & Fils', siren: '552100554', iban: IBAN2 })]);
  const trouve = (q) => filtrerFournisseurs(lignes, { ...CRITERES_FOURNISSEURS_VIDES, recherche: q }).map((l) => l.nom);
  test('B4a. nom sans casse ni accents', () => { assert.deepEqual(trouve('electro'), ['Électro Sud']); assert.deepEqual(trouve('SUD élec'), ['Électro Sud']); });
  test('B4b. SIREN', () => { assert.deepEqual(trouve('552100'), ['Chaux & Fils']); });
  test('B4c. IBAN sans espaces', () => { assert.deepEqual(trouve(IBAN), ['Électro Sud']); });
  test('B4d. IBAN avec espaces (groupes de 4)', () => { assert.deepEqual(trouve('FR76 3000 6000 0112'), ['Électro Sud']); assert.deepEqual(trouve('FR14 2004 1010'), ['Chaux & Fils']); });
  test('B4e. rien de trouvé, et recherche vide = tout', () => { assert.deepEqual(trouve('zzzz'), []); assert.equal(trouve('  ').length, 2); });
});

describe('B5. filtre par état', () => {
  const lignes = fusionner(
    [ligne({ fournisseur_id: 'a' }), ligne({ fournisseur_id: 'b', vu_chez_autre_siren: true }), ligne({ fournisseur_id: 'c', revoque_le: '2026-11-12T00:00:00Z' })], [conf({ fournisseur_id: 'd' })]);
  const etats = (e) => filtrerFournisseurs(lignes, { recherche: '', etats: e }).map((l) => l.etat).sort();
  test('B5a. chaque état seul', () => {
    assert.deepEqual(etats(['a_verifier']), ['a_verifier']); assert.deepEqual(etats(['alerte']), ['alerte']);
    assert.deepEqual(etats(['revoque']), ['revoque']); assert.deepEqual(etats(['confirme']), ['confirme']);
  });
  test('B5b. cumul de deux états', () => { assert.deepEqual(etats(['alerte', 'revoque']), ['alerte', 'revoque']); });
  test('B5c. aucun état coché = tout', () => { assert.equal(etats([]).length, 4); });
  test('B5d. pastilles et retrait d’un état', () => {
    const c = { recherche: 'x', etats: ['alerte', 'revoque'] };
    assert.deepEqual(pastillesFournisseurs(c).map((p) => p.libelle), ['État : À vérifier : alerte', 'État : Confirmation révoquée']);
    assert.deepEqual(retirerCritereFournisseur(c, { cle: 'etat', valeur: 'alerte', libelle: '' }), { recherche: 'x', etats: ['revoque'] });
  });
  test('B5e. les quatre états ont chacun un libellé', () => {
    assert.deepEqual([...ETATS_FOURNISSEUR], ['a_verifier', 'alerte', 'revoque', 'confirme']);
    for (const e of ETATS_FOURNISSEUR) assert.ok(LIBELLE_ETAT_FOURNISSEUR[e]);
  });
});

describe('B6. export des fournisseurs', () => {
  const lignes = fusionner([ligne({ nom: 'A;B "chez" lui\nligne', nb_factures: 3 }), ligne({ fournisseur_id: 'q', nom: '=CMD()', iban: IBAN2 })], [conf({ fournisseur_id: 'k', nom: 'Chaux' })]);
  const csv = fournisseursCsv(lignes);
  test('B6a. en-têtes et une ligne par fournisseur', () => {
    assert.equal(csv.replace(BOM, '').split('\r\n')[0], ENTETES_FOURNISSEURS.join(';'));
    assert.deepEqual([...ENTETES_FOURNISSEURS], ['Fournisseur', 'SIREN', 'État', 'Nombre de factures', 'Dernière facture']);
    assert.equal(csv.replace(BOM, '').split('\r\n').filter(Boolean).length, 4); // en-têtes + 3 fournisseurs
  });
  test('B6b. échappement des « ; », guillemets, retours à la ligne et formules', () => {
    assert.ok(csv.includes('"A;B ""chez"" lui\nligne"')); assert.ok(csv.includes("'=CMD()"));
  });
  test('B6c. nombre de factures entier, vide pour une confirmée ; dernière facture en JJ/MM/AAAA', () => {
    assert.ok(csv.includes(';3;18/11/2026')); assert.match(csv, /Chaux;830825741;Confirmé;;\r\n/);
  });
  test('B6d. aucun IBAN dans le fichier', () => {
    assert.ok(!csv.includes(IBAN)); assert.ok(!csv.includes(IBAN2)); assert.doesNotMatch(csv, /FR\d\d/);
  });
  test('B6e. nom du fichier, et date du jour à Paris', () => {
    assert.equal(nomFichierFournisseurs('2026-11-23'), 'fournisseurs-2026-11-23.csv');
    assert.equal(dateJourFichier(new Date('2026-11-22T23:30:00Z')), '2026-11-23'); // minuit passé à Paris
    assert.equal(dateJourFichier(new Date('2026-07-01T12:00:00Z')), '2026-07-01');
    assert.equal(TEXTE_RIEN_A_EXPORTER, 'Rien à exporter');
  });
  test('B6f. cellules : accents tels quels, guillemets doublés, tout début de formule protégé, nombre négatif sans apostrophe, vide pour null et nombre invalide', () => {
    assert.equal(formaterCellule('Électricité é à ç'), 'Électricité é à ç');
    assert.equal(formaterCellule('dit "ok"'), '"dit ""ok"""');
    assert.equal(formaterCellule('a;b'), '"a;b"');
    for (const t of ['=1+1', '+33', '-5', '@SOMME(A1)', '\tx', '\rx']) assert.equal(protegerFormule(t), `'${t}`);
    assert.equal(formaterCellule('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
    assert.equal(protegerFormule('Normal -tiret'), 'Normal -tiret');
    assert.equal(formaterCellule(-100), '-100,00'); assert.equal(formaterCellule(1234.5), '1234,50'); assert.equal(nombreCsv(0), '0,00');
    for (const v of [null, undefined, NaN, '']) assert.equal(formaterCellule(v), '');
  });
  test('B6g. fichier : BOM, séparateur « ; », fin de ligne Windows ; liste vide = seulement les en-têtes', () => {
    assert.equal(construireCsv(['A', 'B'], [['x', 1.5]]), `${BOM}A;B\r\nx;1,50\r\n`);
    assert.equal(fournisseursCsv([]), `${BOM}${ENTETES_FOURNISSEURS.join(';')}\r\n`);
  });
});

describe('B7. le menu « … » respecte etatConfirmation', () => {
  const a = (o) => actionsLigne(fusionner([ligne(o)], [])[0]);
  test('B7a. ligne normale : « Confirmer »', () => { assert.deepEqual(a({}), ['confirmer']); });
  test('B7b. alerte confirmable : « Confirmer quand même »', () => { assert.deepEqual(a({ vu_chez_autre_siren: true }), ['confirmer_quand_meme']); });
  test('B7c. révoquée : « Reconfirmer quand même »', () => { assert.deepEqual(a({ revoque_le: '2026-11-12T00:00:00Z' }), ['reconfirmer']); });
  test('B7d. jamais « Confirmer » quand c’est interdit : IBAN confirmé ailleurs, refusée seulement, IBAN invalide', () => {
    assert.deepEqual(a({ confirme_pour_autre_siren: true }), []); assert.deepEqual(a({ facture_a_confirmer: null, vu_seulement_sur_refusee: true }), []);
    assert.deepEqual(a({ iban: 'FR7630006000011234567890188' }), []);
  });
  test('B7e. cohérent avec etatConfirmation pour toutes les combinaisons', () => {
    for (const confirme_pour_autre_siren of [false, true]) for (const facture_a_confirmer of ['f', null]) for (const iban of [IBAN, 'FR76']) for (const revoque_le of [null, '2026-11-12T00:00:00Z']) for (const vu_chez_autre_siren of [false, true]) {
      const l = ligne({ confirme_pour_autre_siren, facture_a_confirmer, iban, revoque_le, vu_chez_autre_siren });
      assert.equal(actionsLigne(fusionner([l], [])[0]).length > 0, etatConfirmation(l).peutConfirmer);
    }
  });
  test('B7f. une ligne confirmée : « Révoquer »', () => { assert.deepEqual(actionsLigne(fusionner([], [conf()])[0]), ['revoquer']); });
});

describe('C5. file « fournisseurs à vérifier »', () => {
  test('C5a. une ligne normale se confirme ; sans facture non refusée, IBAN invalide ou confirmé ailleurs : pas de bouton', () => {
    assert.deepEqual(etatConfirmation(ligne()), { peutConfirmer: true, direct: true });
    assert.equal(etatConfirmation(ligne({ facture_a_confirmer: null, vu_seulement_sur_refusee: true })).peutConfirmer, false);
    assert.equal(etatConfirmation(ligne({ iban: 'FR7630006000011234567890188' })).peutConfirmer, false);
    assert.equal(etatConfirmation(ligne({ confirme_pour_autre_siren: true })).peutConfirmer, false);
  });
  test('C5b. les phrases distinguent révoquée, acceptée jamais confirmée et jamais confirmée', () => {
    assert.match(phraseLigne(ligne({ revoque_le: '2026-11-20T00:00:00Z' })), /révoquée/);
    assert.match(phraseLigne(ligne({ a_une_facture_acceptee: true })), /jamais confirmé/);
    assert.equal(phraseLigne(ligne()), 'Jamais confirmé');
  });
  test('C5c. le tri met le confirmable d\'abord, puis le plus récent', () => {
    const r = trierFile([ligne({ fournisseur_id: 'a', confirme_pour_autre_siren: true }), ligne({ fournisseur_id: 'b', derniere_facture_le: '2026-01-01T00:00:00Z' }), ligne({ fournisseur_id: 'c', derniere_facture_le: '2026-06-01T00:00:00Z' })]);
    assert.deepEqual(r.map((l) => l.fournisseur_id), ['c', 'b', 'a']);
  });
});

describe('C5. corps des écritures', () => {
  test('C5d. confirmation : le moyen de vérification est obligatoire (3 à 500 caractères), corps limité aux 4 champs', () => {
    assert.deepEqual(corpsConfirmation(ligne(), '  Appel au numéro connu '), { fournisseur_id: 'fo', iban: IBAN, facture_id: 'f1', moyen_verification: 'Appel au numéro connu' });
    assert.throws(() => corpsConfirmation(ligne(), ' ab '), /au moins 3/);
    assert.throws(() => corpsConfirmation(ligne(), 'x'.repeat(501)), /500/);
    assert.throws(() => corpsConfirmation(ligne({ confirme_pour_autre_siren: true }), 'Appel'), /autre fournisseur/);
  });
  test('C5e. révocation : motif obligatoire', () => {
    assert.deepEqual(corpsRevocation('i1', ' RIB changé '), { id: 'i1', motif: 'RIB changé' });
    assert.throws(() => corpsRevocation('i1', ''));
    assert.throws(() => corpsRevocation('', 'motif ok'));
  });
  test('C5f. un texte vide ou absent est refusé avec le nom du champ', () => {
    assert.throws(() => texteObligatoire(undefined, 'Pourquoi ?'), /Pourquoi \? : écris au moins 3 caractères/);
  });
});

describe('C5. IBAN révoqué ou vu chez un autre fournisseur', () => {
  test('C5g. révoqué : pas de bouton direct, alerte avec date et motif', () => {
    const e = etatConfirmation(ligne({ revoque_le: '2026-11-20T10:00:00Z', motif_revocation: 'RIB piraté' }));
    assert.match(e.peutConfirmer && !e.direct && e.alerte, /révoquée le 20\/11\/2026 : RIB piraté/);
  });
  test('C5h. vu chez un autre SIREN : pas de bouton direct non plus', () => {
    const e = etatConfirmation(ligne({ vu_chez_autre_siren: true }));
    assert.equal(e.peutConfirmer && e.direct, false);
  });
  test('C5i. « confirmer quand même » garde la mention dans le moyen de vérification, texte toujours obligatoire', () => {
    const rev = ligne({ revoque_le: '2026-11-20T10:00:00Z' });
    assert.equal(corpsConfirmation(rev, 'Appel au gérant').moyen_verification, 'Reconfirmation après révocation : Appel au gérant');
    assert.throws(() => corpsConfirmation(rev, ' '));
    assert.match(corpsConfirmation(ligne({ vu_chez_autre_siren: true }), 'Appel').moyen_verification, /^Confirmation malgré l’alerte/);
    assert.throws(() => corpsConfirmation(rev, 'x'.repeat(480)), /caractères au plus/);
  });
});

describe('D. format de l\'IBAN', () => {
  test('D1. des IBAN valides de plusieurs pays, avec ou sans espaces et casse', () => {
    for (const i of [IBAN, IBAN2, 'DE89370400440532013000', 'GB82WEST12345698765432', 'ES9121000418450200051332', 'IT60X0542811101000000123456', 'NL91ABNA0417164300', 'BE68539007547034', 'CH9300762011623852957', 'LU280019400644750000']) assert.equal(ibanValide(i), true, i);
    assert.equal(ibanValide('fr76 3000 6000 0112 3456 7890 189'), true);
    assert.equal(normaliserIban('fr76 3000-6000'), 'FR7630006000');
  });
  test('D2. clé fausse, longueur fausse, pays inconnu, vide, trop court : invalide', () => {
    for (const i of ['FR7630006000011234567890188', 'FR76300060000112345678901', 'ZZ7630006000011234567890189', '', '1234']) assert.equal(ibanValide(i), false, i);
    assert.equal(normaliserIban(''), null); assert.equal(normaliserIban(null), null);
  });
  test('D3. affichage par groupes de 4', () => { assert.equal(ibanLisible('FR7630006000011234567890189'), 'FR76 3000 6000 0112 3456 7890 189'); });
});

describe('E. dates', () => {
  test('E1. une date sans heure est écrite telle quelle (jamais décalée) ; un horodatage est converti en date de Paris ; vide = tiret', () => {
    assert.equal(dateFr('2026-11-05'), '05/11/2026');
    assert.equal(dateFr('2026-11-22T23:30:00Z'), '23/11/2026');
    assert.equal(dateFr(null), '—');
  });
});
