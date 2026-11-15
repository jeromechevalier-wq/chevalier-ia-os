// Module « Rendez-vous » : règles pures de js/modules/rdv/logique.js (SMS, réponses, téléphones, créneaux, états, échéances).
// Les noms de test commencent par le numéro de la consigne de Jérôme (3, 5, 6, 12, 13) ou par « L » pour la logique sans consigne.
// Données fictives uniquement.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/rdv/logique.js';

const iso = (s) => new Date(s).toISOString();
const parisEnISO = (a, m, j, h, mi = 0) => iso(L.instantDepuisParis(a, m, j, h, mi));

describe('12 comptage des SMS et règle des accents', () => {
  test('12 un SMS ordinaire en GSM-7 compte ses caractères : 160 pour un SMS, 153 par morceau au-delà', () => {
    assert.deepEqual(L.compterSms('a'.repeat(160)).segments, 1);
    assert.equal(L.compterSms('a'.repeat(161)).segments, 2);
    assert.equal(L.compterSms('a'.repeat(306)).segments, 2);
    assert.equal(L.compterSms('a'.repeat(307)).segments, 3);
    assert.equal(L.compterSms('').segments, 0);
    assert.equal(L.compterSms('é à è ù').encodage, 'gsm7', 'é à è ù sont dans l’alphabet de base');
  });
  test('12 les caractères de l’extension comptent double', () => {
    const c = L.compterSms('[x]{y}~^|\\');
    assert.equal(c.caracteres, 10);
    assert.equal(c.unites, 18, '8 caractères d’extension × 2 + x et y');
    assert.equal(L.compterSms('a'.repeat(155) + '[[[').segments, 2, '155 + 6 unités = 161');
  });
  test('12 un caractère hors liste fait basculer en Unicode : 70 caractères, puis 67 par morceau', () => {
    assert.equal(L.compterSms('Bonjour ê').encodage, 'unicode');
    assert.equal(L.compterSms('ê' + 'a'.repeat(69)).segments, 1);
    assert.equal(L.compterSms('ê' + 'a'.repeat(70)).segments, 2);
    assert.equal(L.compterSms('ê' + 'a'.repeat(133)).segments, 2);
    assert.equal(L.compterSms('ê' + 'a'.repeat(134)).segments, 3);
  });
  test('12 la normalisation remplace les accents hors GSM-7 sans toucher à ceux qui y sont', () => {
    assert.equal(L.normaliserSms('Noël, Zoë, Hélène, François, forêt, âge, île, hôtel, août, naïf, cœur'), 'Noel, Zoe, Hélène, Francois, foret, age, ile, hotel, aout, naif, coeur');
    assert.equal(L.normaliserSms('À È Ì Ò Ù'), 'A E I O U');
    assert.equal(L.normaliserSms('Ça et ç'), 'Ça et c', 'Ç majuscule est dans l’alphabet, ç minuscule non');
    assert.equal(L.normaliserSms('« oui » – l’été… 5 €'), '" oui " - l\'été... 5 EUR');
    assert.equal(L.normaliserSms('Salut 👍🏽 ça va 🇫🇷'), 'Salut  ca va ', 'les émojis (et ç minuscule devient c) sont supprimés');
    assert.equal(L.normaliserSms('étê'), 'éte', 'texte décomposé (NFD) : é recomposé, ê sans accent');
    assert.equal(L.normaliserSms('a\r\nb'), 'a\nb');
  });
  test('12 un nom à caractère rare inséré dans un modèle ne fait pas basculer le SMS en Unicode', () => {
    for (const nom of ['Zoë', 'Hélène', 'Noël', 'Lefèvre', 'Chloé-Anaïs', 'Œdipe']) {
      const sms = L.construireSms('confirmation', { ...L.EXEMPLE_SMS, client: nom, adresse: `Rue de l’Été, forêt de ${nom}` });
      assert.equal(sms.encodage, 'gsm7', nom);
      assert.deepEqual(sms.horsListe, [], nom);
    }
  });
  test('12 un caractère qu’on ne sait pas remplacer reste et le dit', () => {
    const p = L.preparerSms('Bonjour 你好');
    assert.equal(p.encodage, 'unicode');
    assert.deepEqual(p.horsListe, ['你', '好']);
  });
  test('12 les six modèles par défaut tiennent en un SMS avec des données d’exemple, et sont déjà sans caractère à remplacer', () => {
    const types = Object.keys(L.MODELES_DEFAUT);
    assert.deepEqual(types, ['confiance', 'creneaux', 'relance', 'confirmation', 'rappel', 'pluie']);
    for (const type of types) {
      const sms = L.construireSms(type, L.EXEMPLE_SMS);
      assert.ok(sms.segments <= 2, `${type} : ${sms.caracteres} caractères, ${sms.segments} SMS`);
      assert.ok(sms.texte.endsWith('Chevalier IA - Répondez STOP pour vous désabonner.'), `${type} : nom de l'entreprise et STOP en dernière ligne`);
      assert.equal(sms.encodage, 'gsm7', type);
      assert.equal(L.preparerSms(L.MODELES_DEFAUT[type]).modifie, false, `${type} : le modèle contient un caractère à remplacer`);
      assert.doesNotMatch(sms.texte, /\{[a-z_]+\}/, `${type} : variable non remplacée`);
      assert.doesNotMatch(L.MODELES_DEFAUT[type], /Jérôme|M\. Durand|CRM/i);
    }
  });
  test('12 les modèles par défaut n’emploient que les variables connues', () => {
    for (const m of Object.values(L.MODELES_DEFAUT)) assert.deepEqual(L.variablesInconnues(m), []);
    assert.deepEqual(L.variablesInconnues('Salut {prenom} {client}'), ['prenom']);
  });
  test('12 le compteur affiché suit la forme « n caractères sur 160 · 1 SMS »', () => {
    assert.equal(L.libelleCompteur('a'.repeat(124)), '124 caractères sur 160 · 1 SMS');
    assert.match(L.libelleCompteur('a'.repeat(200)), /^200 caractères sur 160 · 2 SMS$/);
    assert.match(L.libelleCompteur('Ça'), /^2 caractères sur 160/);
  });
  test('12 un modèle modifié par l’utilisateur l’emporte, un modèle vide revient au modèle par défaut', () => {
    assert.equal(L.modeleDe('rappel', { modeles: { rappel: 'Demain {heure}' } }), 'Demain {heure}');
    assert.equal(L.modeleDe('rappel', { modeles: { rappel: '   ' } }), L.MODELES_DEFAUT.rappel);
    assert.equal(L.construireSms('rappel', { heure: '10h' }, { modeles: { rappel: 'Demain à {heure} {inconnue}' } }).texte, 'Demain a 10h {inconnue}\nChevalier IA - Répondez STOP pour vous désabonner.'.replace('a 10h', 'à 10h'));
  });
});

describe('L téléphones', () => {
  test('L les formes acceptées donnent toutes le même numéro international', () => {
    for (const s of ['06 00 00 00 00', '06.00.00.00.00', '0600000000', '+33 6 00 00 00 00', '+33600000000', '0033 6 00 00 00 00', '+33 (0)6 00 00 00 00', '06-00-00-00-00', ' 06 00 00 00 00 ']) {
      const r = L.normaliserTelephone(s);
      assert.equal(r.ok, true, s);
      assert.equal(r.telephone, '+33600000000', s);
      assert.equal(r.affichage, '06 00 00 00 00');
    }
    assert.equal(L.normaliserTelephone('07 00 00 00 00').telephone, '+33700000000');
  });
  test('L un fixe, un numéro court ou étranger est refusé avec un message clair', () => {
    for (const s of ['01 00 00 00 00', '04 00 00 00 00', '05 00 00 00 00', '09 00 00 00 00', '08 00 00 00 00', '+33 1 00 00 00 00', '0033 4 00 00 00 00']) {
      const r = L.normaliserTelephone(s);
      assert.equal(r.ok, false, s);
      assert.match(r.message, /fixe/, s);
    }
    assert.equal(L.normaliserTelephone('06 00 00').ok, false);
    assert.equal(L.normaliserTelephone('+32 470 00 00 00').ok, false);
    assert.equal(L.normaliserTelephone('abc').ok, false);
    assert.equal(L.normaliserTelephone('').ok, false);
    assert.equal(L.normaliserTelephone('600000000').ok, false);
  });
  test('7 le lien tel: et l’affichage lisible', () => {
    assert.equal(L.lienTel('06 00 00 00 00'), 'tel:+33600000000');
    assert.equal(L.lienTel('01 00 00 00 00'), '');
    assert.equal(L.afficherTelephone('+33600000000'), '06 00 00 00 00');
    assert.equal(L.afficherTelephone('inconnu'), 'inconnu');
  });
});

describe('L lecture des réponses', () => {
  test('L les formes reconnues', () => {
    const cas = { '1': [1], '3': [3], '1 et 3': [1, 3], '1,3': [1, 3], '1, 3': [1, 3], '1 3': [1, 3], '1 + 2': [1, 2], '2+3': [2, 3], ' 1. ': [1], '3 et 1': [1, 3], '1 1': [1], '1 et 2 et 3': [1, 2, 3], '1/3': [1, 3], '1 & 2': [1, 2], 'Créneau': null };
    for (const [texte, attendu] of Object.entries(cas)) {
      const r = L.interpreterReponse(texte, 3);
      if (attendu === null) assert.equal(r.comprise, false, texte);
      else assert.deepEqual(r, { comprise: true, creneaux: attendu }, texte);
    }
  });
  test('L « aucun », « aucune », « 0 » et « non » sont des réponses valides : aucun créneau', () => {
    for (const t of ['aucun', 'Aucune', 'AUCUN.', '0', 'non', 'Non', ' non ']) assert.deepEqual(L.interpreterReponse(t, 3), { comprise: true, creneaux: [] }, t);
  });
  test('L le reste est incompris, y compris un créneau qui n’existe pas', () => {
    for (const t of ['', '   ', 'oui', 'peut-être', 'plutôt jeudi', '4', '1 et 4', '0 et 1', '13', '1 ou 3', 'non merci', 'ok 1', '1er']) assert.equal(L.interpreterReponse(t, 3).comprise, false, t);
    assert.equal(L.interpreterReponse('3', 2).comprise, false, 'seulement 2 créneaux proposés');
    assert.equal(L.interpreterReponse('2', 2).comprise, true);
  });
});

describe('13 réponse non comprise : alerte et relances suspendues', () => {
  const rdv = { id: 'r1', client: 'M. Durand', creneaux: [parisEnISO(2026, 11, 17, 10), parisEnISO(2026, 11, 18, 14), parisEnISO(2026, 11, 19, 9)], tour: 1, envoiDemandeLe: parisEnISO(2026, 11, 14, 9) };
  const pers = (id, extra = {}) => ({ id, nom: `Participant ${id}`, telephone: `+3360000000${id}`, etatReponse: 'attente', creneauxOk: [], ...extra });
  const params = { nomDansLesSms: 'Mme Martin', numerosAlerte: [{ id: 'n1', libelle: 'Mobile', numero: '+33700000001', actif: true }, { id: 'n2', libelle: 'Collègue', numero: '+33700000002', actif: false }], numeroAffiche: 'n1' };

  test('13 une réponse non comprise passe la personne en « incomprise » et demande une alerte', () => {
    const r = L.appliquerReponse({ participant: pers('1'), rdv, texte: 'plutôt jeudi', recuLe: '2026-11-14T10:00:00Z', idReponse: 'm9' });
    assert.equal(r.comprise, false);
    assert.equal(r.patch.etatReponse, 'incomprise');
    assert.equal(r.patch.reponse, 'plutôt jeudi', 'la réponse exacte est gardée');
    assert.equal(r.alerteIncomprise, true);
  });
  test('13 une personne dont la réponse n’est pas comprise n’est plus relancée, les autres le sont', () => {
    const participants = [pers('1', { etatReponse: 'incomprise', reponse: 'bof', reponseLe: '2026-11-14T10:00:00Z', idReponse: 'm1' }), pers('2'), pers('3', { etatReponse: 'comprise', creneauxOk: [1] })];
    const envoyes = participants.flatMap((p) => [
      { sens: 'sortant', echeance: L.idEcheance('r1', 1, 'confiance', p.id), envoyeLe: rdv.envoiDemandeLe },
      { sens: 'sortant', echeance: L.idEcheance('r1', 1, 'creneaux', p.id), envoyeLe: iso('2026-11-14T08:01:00Z') },
    ]);
    const dus = L.smsDus({ rdv, participants, parametres: params, messages: envoyes, maintenant: parisEnISO(2026, 11, 15, 10) });
    const relances = dus.filter((d) => d.typeMessage === 'relance');
    assert.deepEqual(relances.map((d) => d.participantId), ['2'], 'seule la personne en attente');
    const alertes = dus.filter((d) => d.typeMessage === 'alerte' && d.sousType === 'incomprise');
    assert.equal(alertes.length, 1, 'une alerte, vers le seul numéro actif');
    assert.equal(alertes[0].numero, '+33700000001');
    assert.match(alertes[0].texte, /bof/);
    assert.match(alertes[0].texte, /Participant 1/);
  });
  test('13 la professionnelle peut saisir la réponse à la place : l’état devient « saisie » et compte dans le bilan', () => {
    const patch = L.saisirReponse(pers('1', { etatReponse: 'incomprise', reponse: 'bof' }), [3, 1, 1, 9]);
    assert.deepEqual(patch, { etatReponse: 'saisie', creneauxOk: [1, 3], reponse: 'bof', ambigu: false });
    const b = L.bilanReponses([{ ...pers('1'), ...patch }, pers('2', { etatReponse: 'comprise', creneauxOk: [1] })], 3);
    assert.deepEqual(b.communs, [1]);
  });
  test('13 un « Merci » après une bonne réponse ou une saisie n’efface rien', () => {
    for (const etat of ['comprise', 'saisie']) {
      const r = L.appliquerReponse({ participant: pers('1', { etatReponse: etat, creneauxOk: [1, 3] }), rdv, texte: 'Merci' });
      assert.equal(r.patch, null, etat);
      assert.equal(r.alerteIncomprise, false);
    }
    const correction = L.appliquerReponse({ participant: pers('1', { etatReponse: 'comprise', creneauxOk: [1] }), rdv, texte: '2' });
    assert.deepEqual(correction.patch.creneauxOk, [2], 'une vraie correction remplace la réponse');
  });
  test('13 une réponse à une ancienne série n’est qu’une trace : l’état ne change pas', () => {
    const r = L.appliquerReponse({ participant: pers('1'), rdv: { ...rdv, tour: 2 }, texte: '1', tourReponse: 1 });
    assert.equal(r.historiqueSeulement, true);
    assert.equal(r.patch, null);
    assert.equal(L.appliquerReponse({ participant: pers('1'), rdv: { ...rdv, tour: 2 }, texte: '1' }).historiqueSeulement, false, 'sans tour, on prend le dernier');
  });
});

describe('5 et 6 créneaux écrits clairement, cellules du tableau', () => {
  test('5 « Créneau 1, mardi 17 novembre à 10h »', () => {
    assert.equal(L.libelleCreneau(0, parisEnISO(2026, 11, 17, 10)), 'Créneau 1, mardi 17 novembre à 10h');
    assert.equal(L.libelleCreneau(1, parisEnISO(2026, 11, 18, 14, 30)), 'Créneau 2, mercredi 18 novembre à 14h30');
    assert.equal(L.libelleCreneau(2, parisEnISO(2026, 11, 19, 9)), 'Créneau 3, jeudi 19 novembre à 9h');
  });
  test('5 formats court (écran) et SMS, en heure de Paris quelle que soit la machine', () => {
    assert.equal(L.formaterCreneau(parisEnISO(2026, 11, 19, 10)), 'jeu. 19 nov. 10 h');
    assert.equal(L.formaterCreneauSms(parisEnISO(2026, 11, 19, 10)), 'jeu. 19 nov. 10h');
    assert.equal(L.formaterCreneau('2026-07-01T22:30:00Z'), 'jeu. 2 juil. 0 h 30'.replace('0 h 30', '0h30'), 'minuit passé à Paris l’été : le lendemain');
    assert.equal(L.listeCreneauxSms([parisEnISO(2026, 11, 17, 10), parisEnISO(2026, 11, 18, 14)]), '1 : mar. 17 nov. 10h\n2 : mer. 18 nov. 14h');
  });
  test('6 coche verte, croix rouge, point d’interrogation, triangle rouge', () => {
    const base = { etatReponse: 'comprise', creneauxOk: [1, 3] };
    assert.equal(L.symboleCellule(base, 0), 'oui');
    assert.equal(L.symboleCellule(base, 1), 'non');
    assert.equal(L.symboleCellule(base, 2), 'oui');
    assert.equal(L.symboleCellule({ etatReponse: 'attente', creneauxOk: [] }, 0), 'inconnu');
    assert.equal(L.symboleCellule({}, 1), 'inconnu');
    assert.equal(L.symboleCellule({ etatReponse: 'incomprise' }, 0), 'incompris');
    assert.equal(L.symboleCellule({ etatReponse: 'saisie', creneauxOk: [2] }, 1), 'oui');
    assert.equal(L.symboleCellule({ etatReponse: 'comprise', creneauxOk: [] }, 0), 'non', '« aucun » : croix partout');
  });
});

describe('3 rôles', () => {
  const participants = [{ role: 'Client' }, { role: 'terrassier' }, { role: 'Terrassier' }];
  test('3 les rôles de départ', () => assert.deepEqual(L.ROLES_DEPART, ['Client', 'Terrassier', 'Architecte', 'Géomètre']));
  test('3 on ajoute un rôle, jamais deux fois le même (accents et majuscules ignorés)', () => {
    assert.deepEqual(L.ajouterRole(L.ROLES_DEPART, ' Maçon ').roles.at(-1), 'Maçon');
    assert.equal(L.ajouterRole(L.ROLES_DEPART, 'geometre').ok, false);
    assert.equal(L.ajouterRole(L.ROLES_DEPART, 'CLIENT').ok, false);
    assert.equal(L.ajouterRole(L.ROLES_DEPART, '   ').ok, false);
    assert.equal(L.ajouterRole(L.ROLES_DEPART, 'x'.repeat(41)).ok, false);
  });
  test('3 un rôle utilisé par un participant (archivé ou non) ne se supprime pas ; un rôle inutilisé, si', () => {
    assert.equal(L.usageRole('Terrassier', participants), 2);
    assert.equal(L.peutSupprimerRole('Terrassier', participants), false);
    const refus = L.retirerRole(L.ROLES_DEPART, 'Client', participants);
    assert.equal(refus.ok, false);
    assert.match(refus.message, /1 participant/);
    assert.match(L.retirerRole(L.ROLES_DEPART, 'Terrassier', participants).message, /2 participants/);
    assert.deepEqual(L.retirerRole(L.ROLES_DEPART, 'Architecte', participants).roles, ['Client', 'Terrassier', 'Géomètre']);
  });
});

describe('L heure de Paris et changements d’heure', () => {
  test('L instant ↔ heure murale, hiver et été', () => {
    assert.equal(parisEnISO(2026, 1, 15, 19), '2026-01-15T18:00:00.000Z');
    assert.equal(parisEnISO(2026, 7, 15, 19), '2026-07-15T17:00:00.000Z');
    assert.deepEqual(L.partiesParis(Date.parse('2026-07-15T17:00:00Z')), { annee: 2026, mois: 7, jour: 15, heure: 19, minute: 0, seconde: 0, jourSemaine: 3 });
  });
  test('L printemps (dimanche 29 mars 2026) : le rappel de la veille reste à 19 h, heure de Paris', () => {
    // rendez-vous dimanche 29 mars à 10 h → rappel samedi 28 mars 19 h (heure d’hiver, UTC+1)
    assert.equal(iso(L.instantRappelVeille(Date.parse(parisEnISO(2026, 3, 29, 10)))), '2026-03-28T18:00:00.000Z');
    // rendez-vous lundi 30 mars → rappel dimanche 29 mars 19 h (heure d’été, UTC+2)
    assert.equal(iso(L.instantRappelVeille(Date.parse(parisEnISO(2026, 3, 30, 10)))), '2026-03-29T17:00:00.000Z');
  });
  test('L automne (dimanche 25 octobre 2026) : idem dans l’autre sens', () => {
    assert.equal(iso(L.instantRappelVeille(Date.parse(parisEnISO(2026, 10, 25, 10)))), '2026-10-24T17:00:00.000Z', 'samedi 24 : encore l’heure d’été');
    assert.equal(iso(L.instantRappelVeille(Date.parse(parisEnISO(2026, 10, 26, 10)))), '2026-10-25T18:00:00.000Z', 'dimanche 25 : heure d’hiver');
  });
  test('L une heure qui n’existe pas (2 h 30 le 29 mars) avance d’une heure, une heure en double prend la seconde', () => {
    assert.equal(parisEnISO(2026, 3, 29, 2, 30), '2026-03-29T01:30:00.000Z');
    assert.equal(L.partiesParis(Date.parse('2026-03-29T01:30:00Z')).heure, 3);
    assert.equal(L.partiesParis(Date.parse(parisEnISO(2026, 10, 25, 2, 30))).heure, 2);
  });
  test('L plage d’envoi : dans la plage tout de suite, avant l’ouverture à 8 h, après la fermeture le lendemain à 8 h, aussi autour d’un changement d’heure', () => {
    const plage = { debut: '08:00', fin: '20:30' };
    const dans = Date.parse(parisEnISO(2026, 11, 16, 12));
    assert.equal(L.prochaineOuverture(dans, plage), dans);
    assert.equal(iso(L.prochaineOuverture(Date.parse(parisEnISO(2026, 11, 16, 6, 59)), plage)), parisEnISO(2026, 11, 16, 8));
    assert.equal(iso(L.prochaineOuverture(Date.parse(parisEnISO(2026, 11, 16, 20, 31)), plage)), parisEnISO(2026, 11, 17, 8));
    assert.equal(iso(L.prochaineOuverture(Date.parse(parisEnISO(2026, 3, 28, 22)), plage)), '2026-03-29T06:00:00.000Z', 'samedi soir → dimanche 8 h (heure d’été, UTC+2)');
    assert.equal(iso(L.prochaineOuverture(Date.parse(parisEnISO(2026, 10, 24, 22)), plage)), '2026-10-25T07:00:00.000Z', 'samedi soir → dimanche 8 h (heure d’hiver, UTC+1)');
    assert.equal(L.prochaineOuverture(dans, { debut: 'n’importe quoi', fin: '' }), dans, 'plage illisible : plage par défaut');
  });
  test('L « demain » se lit en jours de Paris, pas en tranches de 24 h', () => {
    assert.equal(L.quandRelatif(parisEnISO(2026, 11, 15, 8), parisEnISO(2026, 11, 14, 23, 50)), 'demain');
    assert.equal(L.quandRelatif(parisEnISO(2026, 11, 14, 23, 59), parisEnISO(2026, 11, 14, 0, 5)), "aujourd'hui");
    assert.equal(L.quandRelatif(parisEnISO(2026, 11, 19, 10), parisEnISO(2026, 11, 14, 9)), 'le jeu. 19 nov.');
  });
});

describe('L créneaux communs et états', () => {
  const creneaux = [parisEnISO(2026, 11, 17, 10), parisEnISO(2026, 11, 18, 14), parisEnISO(2026, 11, 19, 9)];
  const p = (id, etat, ok = []) => ({ id, nom: id, telephone: `+3360000010${id.length}`, etatReponse: etat, creneauxOk: ok });
  test('L tant que tout le monde n’a pas répondu, pas de créneau commun mais le meilleur est connu', () => {
    const b = L.bilanReponses([p('a', 'comprise', [3]), p('b', 'comprise', [2, 3]), p('c', 'attente'), p('d', 'attente')], 3);
    assert.deepEqual(b.communs, []);
    assert.deepEqual(b.parCreneau, [0, 1, 2]);
    assert.deepEqual(b.meilleur, { creneau: 3, nombre: 2 });
    assert.equal(b.reponses, 2);
    assert.equal(b.complet, false);
    assert.equal(b.enAttente, 2);
  });
  test('L tout le monde a répondu : le créneau commun est trouvé, ou aucun', () => {
    assert.deepEqual(L.bilanReponses([p('a', 'comprise', [1, 3]), p('b', 'saisie', [3])], 3).communs, [3]);
    assert.deepEqual(L.bilanReponses([p('a', 'comprise', [1]), p('b', 'comprise', [2])], 3).communs, []);
    assert.deepEqual(L.bilanReponses([p('a', 'comprise', [1, 2]), p('b', 'comprise', [1, 2])], 3).communs, [1, 2]);
    assert.deepEqual(L.bilanReponses([p('a', 'comprise', [])], 3).communs, [], '« aucun » : pas de créneau commun');
    assert.equal(L.bilanReponses([], 3).complet, false);
  });
  test('L colonnes : en attente, à valider, à reprendre, confirmé', () => {
    const rdv = { id: 'r', creneaux };
    assert.equal(L.etatCalcule(rdv, [p('a', 'comprise', [1]), p('b', 'attente')]), 'en_attente');
    assert.equal(L.etatCalcule(rdv, [p('a', 'comprise', [1]), p('b', 'incomprise')]), 'en_attente');
    assert.equal(L.etatCalcule(rdv, [p('a', 'comprise', [1]), p('b', 'comprise', [1, 2])]), 'a_valider');
    assert.equal(L.etatCalcule(rdv, [p('a', 'comprise', [1]), p('b', 'comprise', [2])]), 'a_reprendre');
    assert.equal(L.etatCalcule({ ...rdv, relancesTermineesLe: '2026-11-20T00:00:00Z' }, [p('a', 'comprise', [1]), p('b', 'attente')]), 'a_reprendre');
    assert.equal(L.etatCalcule({ ...rdv, etat: 'confirme', creneauChoisi: creneaux[0] }, [p('a', 'attente')]), 'confirme');
  });
  test('L phrases des cartes', () => {
    const rdv = { id: 'r', creneaux, tour: 1 };
    const ligne = (participants, extra = {}) => L.ligneEtat({ rdv: { ...rdv, ...extra }, participants, parametres: {}, messages: [], maintenant: '2026-11-14T10:00:00Z' });
    assert.equal(ligne([p('a', 'comprise', [1]), p('b', 'attente'), p('c', 'attente'), p('d', 'attente')]), '1 réponse sur 4');
    assert.equal(ligne([p('a', 'comprise', [1]), p('b', 'comprise', [1]), p('c', 'attente'), p('d', 'attente')]), '2 réponses sur 4');
    assert.equal(ligne([p('a', 'comprise', [1, 2]), p('b', 'comprise', [2])]), 'Créneau commun : mer. 18 nov. 14 h');
    assert.equal(ligne([p('a', 'comprise', [1]), p('b', 'comprise', [2])]), 'Aucun créneau commun');
    assert.equal(ligne([p('a', 'comprise', [1]), p('b', 'incomprise')]), 'Une réponse non comprise');
  });
  test('L la carte annonce la prochaine relance : « Relance 1 sur 3 demain »', () => {
    const rdv = { id: 'r', creneaux, tour: 1 };
    const participants = [p('a', 'comprise', [1]), p('b', 'attente')];
    const messages = participants.map((x) => ({ sens: 'sortant', echeance: L.idEcheance('r', 1, 'creneaux', x.id), envoyeLe: parisEnISO(2026, 11, 14, 10) }));
    const texte = L.ligneEtat({ rdv, participants, parametres: {}, messages, maintenant: parisEnISO(2026, 11, 14, 15) });
    assert.equal(texte, '1 réponse sur 2 · Relance 1 sur 3 demain');
  });
});

describe('L échéances : liste des SMS dus', () => {
  const creneaux = [parisEnISO(2026, 11, 17, 10), parisEnISO(2026, 11, 18, 14), parisEnISO(2026, 11, 19, 9)];
  const params = { nomDansLesSms: 'Mme Martin', numerosAlerte: [{ id: 'n1', libelle: 'Mobile', numero: '+33700000001', actif: true }, { id: 'n2', libelle: 'Collègue', numero: '+33700000002', actif: true }, { id: 'n3', libelle: 'Vacances', numero: '+33700000003', actif: false }], numeroAffiche: 'n2' };
  const base = { id: 'r1', client: 'M. Durand', adresse: '12 rue des Lilas\nLyon', creneaux, tour: 1, envoiDemandeLe: parisEnISO(2026, 11, 14, 9) };
  const parts = [{ id: 'a', nom: 'M. Durand', telephone: '+33600000001', etatReponse: 'attente', creneauxOk: [] }, { id: 'b', nom: 'Terrassier', telephone: '+33600000002', etatReponse: 'attente', creneauxOk: [] }];
  const envoye = (nature, id, quand) => ({ sens: 'sortant', echeance: L.idEcheance('r1', 1, nature, id), envoyeLe: quand });

  test('L au départ : le premier SMS part, les créneaux une minute après, pour chaque personne', () => {
    const t0 = parisEnISO(2026, 11, 14, 9);
    const dus = L.smsDus({ rdv: base, participants: parts, parametres: params, messages: [], maintenant: iso(Date.parse(t0) + 30 * 1000) });
    assert.deepEqual(dus.map((d) => d.typeMessage), ['confiance', 'confiance']);
    const apres = L.smsDus({ rdv: base, participants: parts, parametres: params, messages: [], maintenant: iso(Date.parse(t0) + 2 * 60 * 1000) });
    assert.deepEqual(apres.map((d) => d.typeMessage), ['confiance', 'confiance', 'creneaux', 'creneaux']);
    const sms = apres.find((d) => d.typeMessage === 'creneaux');
    assert.match(sms.texte, /^Mme Martin : rendez-vous M\. Durand/);
    assert.match(sms.texte, /1 : mar\. 17 nov\. 10h\n2 : mer\. 18 nov\. 14h\n3 : jeu\. 19 nov\. 9h/);
    assert.ok(sms.segments <= 2 && sms.texte.endsWith('STOP pour vous désabonner.'));
    const confiance = apres.find((d) => d.typeMessage === 'confiance');
    assert.match(confiance.texte, /06 00 00 00 00|07 00 00 00 02/, 'le numéro choisi pour les participants (n2)');
    assert.match(confiance.texte, /07 00 00 00 02/);
    assert.deepEqual(confiance.manque, []);
  });
  test('L chaque envoi a un identifiant fixe, déjà envoyé = plus dû, et le calcul est le même à chaque appel', () => {
    const t = iso(Date.parse(base.envoiDemandeLe) + 5 * 60 * 1000);
    const un = L.smsDus({ rdv: base, participants: parts, parametres: params, messages: [], maintenant: t });
    const deux = L.smsDus({ rdv: base, participants: parts, parametres: params, messages: [], maintenant: t });
    assert.deepEqual(un, deux);
    assert.equal(new Set(un.map((d) => d.idEcheance)).size, un.length);
    const restant = L.smsDus({ rdv: base, participants: parts, parametres: params, messages: [{ sens: 'sortant', echeance: un[0].idEcheance, envoyeLe: t }], maintenant: t });
    assert.equal(restant.length, un.length - 1);
    assert.ok(!restant.some((d) => d.idEcheance === un[0].idEcheance));
  });
  test('L les relances arrivent après le délai, une à la fois, pas en rafale après une panne (deux appels de suite)', () => {
    const envoyes = parts.flatMap((x) => [envoye('confiance', x.id, base.envoiDemandeLe), envoye('creneaux', x.id, parisEnISO(2026, 11, 14, 9, 1))]);
    const avant = L.smsDus({ rdv: base, participants: parts, parametres: params, messages: envoyes, maintenant: parisEnISO(2026, 11, 15, 9, 0) });
    assert.deepEqual(avant, [], '24 h pas tout à fait écoulées');
    // panne : le planificateur repasse le 16 à midi, alors que la relance 1 était due le 15
    const t1 = parisEnISO(2026, 11, 16, 12, 0);
    const un = L.smsDus({ rdv: base, participants: parts, parametres: params, messages: envoyes, maintenant: t1 });
    assert.deepEqual(un.map((d) => d.idEcheance.split(':')[2]), ['relance1', 'relance1']);
    const apresEnvoi = [...envoyes, ...un.map((d) => ({ sens: 'sortant', echeance: d.idEcheance, envoyeLe: t1 }))];
    assert.deepEqual(L.smsDus({ rdv: base, participants: parts, parametres: params, messages: apresEnvoi, maintenant: parisEnISO(2026, 11, 16, 12, 5) }), [], 'la relance 2 attend 24 h après l’envoi RÉEL de la relance 1, pas son échéance théorique');
    assert.equal(L.smsDus({ rdv: base, participants: parts, parametres: params, messages: apresEnvoi, maintenant: parisEnISO(2026, 11, 17, 12, 1) }).length, 2);
  });
  test('L une relance enregistrée sans heure d’envoi ne fait pas planter : le calendrier s’arrête', () => {
    const envoyes = parts.flatMap((x) => [envoye('confiance', x.id, base.envoiDemandeLe), envoye('creneaux', x.id, parisEnISO(2026, 11, 14, 9, 1)), { sens: 'sortant', echeance: L.idEcheance('r1', 1, 'relance1', x.id), envoyeLe: null }]);
    assert.deepEqual(L.smsDus({ rdv: base, participants: parts, parametres: params, messages: envoyes, maintenant: parisEnISO(2026, 11, 18, 12) }), []);
  });
  test('L un participant sans téléphone ne bloque pas les relances des autres, quelle que soit sa place', () => {
    for (const ordre of [[{ id: 'z', nom: 'Sans numéro', etatReponse: 'attente' }, ...parts], [...parts, { id: 'z', nom: 'Sans numéro', etatReponse: 'attente' }]]) {
      const envoyes = parts.flatMap((x) => [envoye('confiance', x.id, base.envoiDemandeLe), envoye('creneaux', x.id, parisEnISO(2026, 11, 14, 9, 1))]);
      const dus = L.smsDus({ rdv: base, participants: ordre, parametres: params, messages: envoyes, maintenant: parisEnISO(2026, 11, 16, 12) });
      assert.deepEqual(dus.map((d) => d.participantId).sort(), ['a', 'b']);
    }
  });
  test('L plus de relance ni de rappel une fois les créneaux passés', () => {
    const envoyes = parts.flatMap((x) => [envoye('confiance', x.id, base.envoiDemandeLe), envoye('creneaux', x.id, parisEnISO(2026, 11, 14, 9, 1))]);
    assert.deepEqual(L.smsDus({ rdv: base, participants: parts, parametres: params, messages: envoyes, maintenant: parisEnISO(2026, 11, 25, 12) }), []);
    const confirme = { ...base, etat: 'confirme', creneauChoisi: creneaux[0], confirmeLe: parisEnISO(2026, 11, 14, 10) };
    const conf = parts.map((x) => envoye('confirmation', x.id, parisEnISO(2026, 11, 14, 10)));
    assert.deepEqual(L.smsDus({ rdv: confirme, participants: parts, parametres: params, messages: conf, maintenant: parisEnISO(2026, 11, 25, 12) }), [], 'rappel « demain » jamais envoyé après le rendez-vous');
    assert.deepEqual(L.smsDus({ rdv: confirme, participants: parts, parametres: { ...params, rappel: { actif: true, heure: '23:00' } }, messages: conf, maintenant: parisEnISO(2026, 11, 17, 8, 30) }), [], 'heure de rappel hors plage repoussée à 8 h le jour J : plus de rappel');
  });
  test('L adresse absente : la confirmation part quand même, sans ligne vide ni {adresse}', () => {
    const dus = L.smsDus({ rdv: { ...base, adresse: '', etat: 'confirme', creneauChoisi: creneaux[0], confirmeLe: parisEnISO(2026, 11, 14, 10) }, participants: parts, parametres: params, messages: [], maintenant: parisEnISO(2026, 11, 14, 10) });
    assert.equal(dus[0].texte, 'RDV confirmé : M. Durand, mar. 17 nov. à 10h.\nMerci, Mme Martin\nChevalier IA - Répondez STOP pour vous désabonner.');
    assert.deepEqual(dus[0].manque, []);
  });
  test('L rendez-vous confirmé sans date de confirmation : la confirmation part quand même', () => {
    const dus = L.smsDus({ rdv: { ...base, etat: 'confirme', creneauChoisi: creneaux[0] }, participants: parts, parametres: params, messages: [], maintenant: parisEnISO(2026, 11, 14, 10) });
    assert.deepEqual(dus.map((d) => d.typeMessage), ['confirmation', 'confirmation']);
  });
  test('L deuxième série : pas de nouveau SMS de présentation', () => {
    const dus = L.smsDus({ rdv: { ...base, tour: 2, envoiDemandeLe: parisEnISO(2026, 11, 14, 9) }, participants: parts, parametres: params, messages: [], maintenant: parisEnISO(2026, 11, 14, 9, 5) });
    assert.deepEqual([...new Set(dus.map((d) => d.typeMessage))], ['creneaux']);
  });
  test('L deux numéros d’alerte sans identifiant sont alertés tous les deux', () => {
    const sansId = { ...params, numerosAlerte: [{ numero: '+33700000001', actif: true }, { numero: '+33700000002', actif: true }] };
    const rep = (id, ok) => ({ id, nom: id, telephone: '+33600000009', etatReponse: 'comprise', creneauxOk: ok, reponseLe: parisEnISO(2026, 11, 14, 11) });
    const dus = L.smsDus({ rdv: base, participants: [rep('a', [1]), rep('b', [2])], parametres: sansId, messages: [], maintenant: parisEnISO(2026, 11, 14, 12) }).filter((d) => d.typeMessage === 'alerte');
    assert.deepEqual(dus.map((d) => d.numero).sort(), ['+33700000001', '+33700000002']);
  });
  test('L délai et nombre de relances réglables, 0 relance = directement l’alerte', () => {
    const envoyes = parts.flatMap((x) => [envoye('confiance', x.id, base.envoiDemandeLe), envoye('creneaux', x.id, parisEnISO(2026, 11, 14, 9, 1))]);
    const p2 = { ...params, relances: { delaiHeures: 48, nombre: 2 } };
    assert.deepEqual(L.smsDus({ rdv: base, participants: parts, parametres: p2, messages: envoyes, maintenant: parisEnISO(2026, 11, 15, 12) }), []);
    assert.equal(L.smsDus({ rdv: base, participants: parts, parametres: p2, messages: envoyes, maintenant: parisEnISO(2026, 11, 16, 12) }).length, 2);
    const p0 = { ...params, relances: { delaiHeures: 24, nombre: 0 } };
    const dus = L.smsDus({ rdv: base, participants: parts, parametres: p0, messages: envoyes, maintenant: parisEnISO(2026, 11, 15, 12) });
    assert.deepEqual([...new Set(dus.map((d) => d.typeMessage))], ['alerte']);
  });
  test('L après la dernière relance sans réponse, 24 h plus tard : alerte « relances terminées » vers les numéros actifs seulement', () => {
    const t = (j, h) => parisEnISO(2026, 11, j, h);
    const messages = [
      ...parts.flatMap((x) => [envoye('confiance', x.id, base.envoiDemandeLe), envoye('creneaux', x.id, t(14, 9)), envoye('relance1', x.id, t(15, 9)), envoye('relance2', x.id, t(16, 9)), envoye('relance3', x.id, t(17, 9))]),
    ];
    assert.deepEqual(L.smsDus({ rdv: base, participants: parts, parametres: params, messages, maintenant: t(18, 8, 0) }), []);
    const dus = L.smsDus({ rdv: base, participants: parts, parametres: params, messages, maintenant: t(18, 10) });
    assert.deepEqual(dus.map((d) => d.numero).sort(), ['+33700000001', '+33700000002']);
    assert.ok(dus.every((d) => d.typeMessage === 'alerte' && d.sousType === 'fin-relances'));
    assert.match(dus[0].texte, /relances terminées/);
  });
  test('L plage d’envoi : une relance due à 3 h du matin attend 8 h ; la confirmation, elle, part tout de suite', () => {
    const envoyes = parts.flatMap((x) => [envoye('confiance', x.id, parisEnISO(2026, 11, 14, 19, 50)), envoye('creneaux', x.id, parisEnISO(2026, 11, 14, 20, 0))]);
    const rdv = { ...base, envoiDemandeLe: parisEnISO(2026, 11, 14, 19, 50) };
    // base 20 h + 24 h = lendemain 20 h : dans la plage
    assert.equal(L.smsDus({ rdv, participants: parts, parametres: params, messages: envoyes, maintenant: parisEnISO(2026, 11, 15, 20, 5) }).length, 2);
    const tard = parts.flatMap((x) => [envoye('confiance', x.id, parisEnISO(2026, 11, 14, 3, 0)), envoye('creneaux', x.id, parisEnISO(2026, 11, 14, 3, 1))]);
    const dus = L.smsDus({ rdv: { ...base, envoiDemandeLe: parisEnISO(2026, 11, 14, 3, 0) }, participants: parts, parametres: params, messages: tard, maintenant: parisEnISO(2026, 11, 15, 3, 5) });
    assert.deepEqual(dus, [], '3 h 01 + 24 h = 3 h 01 : hors plage');
    const ouverte = L.smsDus({ rdv: { ...base, envoiDemandeLe: parisEnISO(2026, 11, 14, 3, 0) }, participants: parts, parametres: params, messages: tard, maintenant: parisEnISO(2026, 11, 15, 8, 0) });
    assert.equal(ouverte.length, 2);
    assert.equal(ouverte[0].dueLe, parisEnISO(2026, 11, 15, 8, 0));
    const confirme = L.smsDus({ rdv: { ...base, etat: 'confirme', creneauChoisi: creneaux[2], confirmeLe: parisEnISO(2026, 11, 14, 23, 0) }, participants: parts, parametres: params, messages: [], maintenant: parisEnISO(2026, 11, 14, 23, 0) });
    assert.deepEqual(confirme.map((d) => d.typeMessage), ['confirmation', 'confirmation']);
    assert.match(confirme[0].texte, /jeu\. 19 nov\. à 9h/);
  });
  test('L rappel de la veille à l’heure réglée, désactivable, jamais dans le passé', () => {
    const confirme = { ...base, etat: 'confirme', creneauChoisi: creneaux[0], confirmeLe: parisEnISO(2026, 11, 14, 10) };
    const dejaEnvoyeConfirmation = parts.map((x) => envoye('confirmation', x.id, parisEnISO(2026, 11, 14, 10)));
    const avant = L.smsDus({ rdv: confirme, participants: parts, parametres: params, messages: dejaEnvoyeConfirmation, maintenant: parisEnISO(2026, 11, 16, 18, 59) });
    assert.deepEqual(avant, []);
    const apres = L.smsDus({ rdv: confirme, participants: parts, parametres: params, messages: dejaEnvoyeConfirmation, maintenant: parisEnISO(2026, 11, 16, 19, 0) });
    assert.deepEqual(apres.map((d) => d.typeMessage), ['rappel', 'rappel']);
    assert.match(apres[0].texte, /^Rappel : demain mar\. 17 nov\. à 10h/);
    const eteint = L.smsDus({ rdv: confirme, participants: parts, parametres: { ...params, rappel: { actif: false, heure: '19:00' } }, messages: dejaEnvoyeConfirmation, maintenant: parisEnISO(2026, 11, 16, 19, 30) });
    assert.deepEqual(eteint, []);
    const trop_tard = L.smsDus({ rdv: { ...confirme, confirmeLe: parisEnISO(2026, 11, 16, 20, 0) }, participants: parts, parametres: params, messages: [], maintenant: parisEnISO(2026, 11, 16, 20, 5) });
    assert.deepEqual(trop_tard.map((d) => d.typeMessage), ['confirmation', 'confirmation'], 'confirmé après l’heure du rappel : pas de rappel');
  });
  test('L alertes : créneau commun trouvé, aucun créneau commun', () => {
    const rep = (id, ok) => ({ id, nom: id, telephone: '+33600000009', etatReponse: 'comprise', creneauxOk: ok, reponseLe: parisEnISO(2026, 11, 14, 11) });
    const maintenant = parisEnISO(2026, 11, 14, 12);
    const commun = L.smsDus({ rdv: base, participants: [rep('a', [1, 2]), rep('b', [2])], parametres: params, messages: [], maintenant });
    const alertes = commun.filter((d) => d.typeMessage === 'alerte');
    assert.equal(alertes.length, 2);
    assert.match(alertes[0].texte, /tous dispos le mer\. 18 nov\. 14h/);
    const aucun = L.smsDus({ rdv: base, participants: [rep('a', [1]), rep('b', [2])], parametres: params, messages: [], maintenant }).filter((d) => d.typeMessage === 'alerte');
    assert.match(aucun[0].texte, /aucun créneau commun/);
    assert.ok(!aucun.some((d) => d.numero === '+33700000003'), 'le numéro éteint ne reçoit rien');
  });
  test('L un rendez-vous archivé ou annulé n’envoie plus rien', () => {
    for (const extra of [{ archive: true }, { annule: true }]) {
      assert.deepEqual(L.smsDus({ rdv: { ...base, ...extra }, participants: parts, parametres: params, messages: [], maintenant: parisEnISO(2026, 11, 20, 12) }), []);
    }
  });
  test('L un rendez-vous de test ne vise que le numéro de test, et rien s’il n’est pas réglé', () => {
    const maintenant = iso(Date.parse(base.envoiDemandeLe) + 5 * 60 * 1000);
    assert.deepEqual(L.smsDus({ rdv: { ...base, test: true }, participants: parts, parametres: params, messages: [], maintenant }), [], 'pas de numéro de test : rien ne part');
    const dus = L.smsDus({ rdv: { ...base, test: true }, participants: parts, parametres: { ...params, numeroTest: '+33600000099' }, messages: [], maintenant });
    assert.ok(dus.length > 0 && dus.every((d) => d.numero === '+33600000099'));
    assert.equal(L.numeroCible('+33600000001', { test: false }, params), '+33600000001');
  });
  test('L un modèle dont une variable reste vide est signalé (le serveur ne l’envoie pas tel quel)', () => {
    const dus = L.smsDus({ rdv: base, participants: parts, parametres: { ...params, nomDansLesSms: '', numerosAlerte: [] }, messages: [], maintenant: iso(Date.parse(base.envoiDemandeLe) + 1000) });
    assert.deepEqual(dus[0].manque.sort(), ['nom_pro', 'numero_pro']);
  });
  test('L un nom à caractère rare dans le chantier ne fait pas basculer en Unicode', () => {
    const dus = L.smsDus({ rdv: { ...base, client: 'M. Lefèvre-Zoë', adresse: 'Rue de l’Été' }, participants: parts, parametres: params, messages: [], maintenant: iso(Date.parse(base.envoiDemandeLe) + 5 * 60 * 1000) });
    assert.ok(dus.every((d) => d.encodage === 'gsm7'));
  });
});

describe('L même téléphone dans plusieurs rendez-vous', () => {
  const rdv = (id, extra = {}) => ({ id, creneaux: ['2026-11-20T09:00:00Z'], ...extra });
  const part = (id, tel, extra = {}) => ({ id, telephone: tel, etatReponse: 'attente', ...extra });
  test('L un seul rendez-vous ouvert avec ce numéro : réponse rattachée', () => {
    const r = L.rattacherReponse('06 00 00 00 01', [{ rdv: rdv('r1'), participants: [part('a', '+33600000001')] }, { rdv: rdv('r2'), participants: [part('b', '+33600000002')] }]);
    assert.deepEqual(r, { type: 'unique', rendezVousId: 'r1', participantId: 'a' });
  });
  test('L deux rendez-vous ouverts qui attendent ce numéro : ambigu, rien n’est deviné', () => {
    const r = L.rattacherReponse('+33600000001', [{ rdv: rdv('r1'), participants: [part('a', '+33600000001')] }, { rdv: rdv('r2'), participants: [part('b', '+33600000001')] }]);
    assert.equal(r.type, 'ambigu');
    assert.deepEqual(r.cibles, [{ rendezVousId: 'r1', participantId: 'a' }, { rendezVousId: 'r2', participantId: 'b' }]);
  });
  test('L même si un seul des deux attend encore, rien n’est deviné ; archivés, annulés et confirmés ne comptent pas', () => {
    const r = L.rattacherReponse('+33600000001', [
      { rdv: rdv('r1'), participants: [part('a', '+33600000001', { etatReponse: 'incomprise' })] },
      { rdv: rdv('r2'), participants: [part('b', '+33600000001')] },
      { rdv: rdv('r3', { archive: true }), participants: [part('c', '+33600000001')] },
      { rdv: rdv('r4', { annule: true }), participants: [part('d', '+33600000001')] },
      { rdv: rdv('r5', { etat: 'confirme' }), participants: [part('e', '+33600000001')] },
    ]);
    assert.equal(r.type, 'ambigu');
    assert.deepEqual(r.cibles.map((c) => c.rendezVousId), ['r1', 'r2']);
  });
  test('L numéro inconnu', () => assert.equal(L.rattacherReponse('+33600000042', [{ rdv: rdv('r1'), participants: [part('a', '+33600000001')] }]).type, 'inconnu'));
});

describe('L validation de la création', () => {
  const maintenant = '2026-11-14T09:00:00Z';
  const futur = ['2026-11-20T09:00:00Z'];
  test('L un participant au téléphone valide et un créneau futur suffisent ; le téléphone est rendu normalisé', () => {
    const r = L.validerNouveauRdv({ participants: [{ nom: 'M. Durand', telephone: '06 00 00 00 00' }], creneaux: futur, maintenant });
    assert.equal(r.ok, true);
    assert.equal(r.participants[0].telephone, '+33600000000');
  });
  test('L deux participants avec le même numéro sont refusés (un SMS ne part jamais deux fois au même téléphone)', () => {
    const r = L.validerNouveauRdv({ participants: [{ telephone: '0600000001' }, { telephone: '+33 6 00 00 00 01' }], creneaux: futur, maintenant });
    assert.equal(r.ok, false);
    assert.match(r.erreurs[0], /Participant 2 : .*déjà/);
  });
  test('L la même personne sur deux lignes est refusée, et un rendez-vous réunit 5 personnes au plus', () => {
    const r = L.validerNouveauRdv({ participants: [{ personneId: 'p1', telephone: '06 00 00 00 01' }, { personneId: 'p1', telephone: '06 00 00 00 02' }], creneaux: futur, maintenant });
    assert.match(r.erreurs[0], /Participant 2 : cette personne est déjà dans la liste/);
    const six = Array.from({ length: 6 }, (_, i) => ({ personneId: `p${i}`, telephone: `06 00 00 00 0${i}` }));
    assert.match(L.validerNouveauRdv({ participants: six, creneaux: futur, maintenant }).erreurs[0], /5 personnes au plus/);
    assert.equal(L.validerNouveauRdv({ participants: six.slice(0, 5), creneaux: futur, maintenant }).ok, true);
  });
  test('L les problèmes sont dits un par un', () => {
    assert.match(L.validerNouveauRdv({ participants: [], creneaux: futur, maintenant }).erreurs[0], /au moins un participant/);
    assert.match(L.validerNouveauRdv({ participants: [{ telephone: '01 00 00 00 00' }], creneaux: futur, maintenant }).erreurs[0], /Participant 1 : .*fixe/);
    assert.match(L.validerNouveauRdv({ participants: [{ telephone: '06 00 00 00 00' }], creneaux: [], maintenant }).erreurs[0], /au moins un créneau/);
    assert.match(L.validerNouveauRdv({ participants: [{ telephone: '06 00 00 00 00' }], creneaux: ['2026-11-01T09:00:00Z'], maintenant }).erreurs[0], /futur/);
    assert.match(L.validerNouveauRdv({ participants: [{ telephone: '06 00 00 00 00' }], creneaux: ['2026-11-20T09:00:00Z', '2026-11-20T09:00:00Z'], maintenant }).erreurs[0], /identiques/);
    assert.match(L.validerNouveauRdv({ participants: [{ telephone: '06 00 00 00 00' }], creneaux: ['2026-11-20T09:00:00Z', '2026-11-21T09:00:00Z', '2026-11-22T09:00:00Z', '2026-11-23T09:00:00Z'], maintenant }).erreurs[0], /3 créneaux au plus/);
    assert.match(L.validerNouveauRdv({ participants: [{ telephone: '06 00 00 00 00' }], creneaux: ['pas une date'], maintenant }).erreurs[0], /valides/);
  });
});

describe('fiche : bandeaux, confirmation, nouvelle série', () => {
  const futur = (n, h = 10) => new Date(Date.now() + n * 86400000 + h * 3600000).toISOString();
  const p = (id, etat, ok = []) => ({ id, nom: id, telephone: `+3360000000${id.length}`, etatReponse: etat, creneauxOk: ok });
  test('L le bandeau violet dit ce qui se passe et rappelle que seule la professionnelle confirme', () => {
    const b = (parts) => L.bandeauCreneau(L.bilanReponses(parts, 3));
    assert.equal(b([p('a', 'comprise', [3]), p('bb', 'comprise', [3]), p('ccc', 'attente'), p('dddd', 'attente')]).texte, 'Pour l’instant, le créneau 3 convient à 2 personnes sur 4. Seul toi peux le confirmer.');
    assert.equal(b([p('a', 'comprise', [2]), p('bb', 'attente')]).texte, 'Pour l’instant, le créneau 2 convient à 1 personne sur 2. Seul toi peux le confirmer.');
    assert.equal(b([p('a', 'comprise', [1, 3]), p('bb', 'saisie', [3])]).texte, 'Le créneau 3 convient à tout le monde. Seul toi peux le confirmer.');
    assert.equal(b([p('a', 'comprise', [1]), p('bb', 'comprise', [2])]).type, 'aucun');
    assert.equal(b([p('a', 'attente')]), null);
    assert.equal(L.bandeauCreneau({ total: 0 }), null);
  });
  test('L le créneau proposé à la confirmation : le commun, sinon celui qui convient au plus de monde', () => {
    assert.equal(L.creneauAConfirmer(L.bilanReponses([p('a', 'comprise', [2, 3]), p('bb', 'comprise', [3])], 3)), 3);
    assert.equal(L.creneauAConfirmer(L.bilanReponses([p('a', 'comprise', [2]), p('bb', 'attente')], 3)), 2);
    assert.equal(L.creneauAConfirmer(L.bilanReponses([p('a', 'attente')], 3)), null);
  });
  test('L confirmer : seulement un rendez-vous ouvert, un créneau qui existe et qui est futur', () => {
    const rdv = { id: 'r', creneaux: [futur(2), futur(3), futur(-1)], tour: 1 };
    const maintenant = new Date().toISOString();
    const ok = L.planConfirmer(rdv, 2, maintenant);
    assert.equal(ok.patch.etat, 'confirme');
    assert.equal(ok.patch.creneauChoisi, new Date(rdv.creneaux[1]).toISOString());
    assert.ok(ok.patch.confirmeLe);
    assert.match(L.planConfirmer(rdv, 4, maintenant).erreur, /n’existe pas/);
    assert.match(L.planConfirmer(rdv, 3, maintenant).erreur, /déjà passé/);
    assert.match(L.planConfirmer({ ...rdv, etat: 'confirme' }, 1, maintenant).erreur, /plus à confirmer/);
    assert.match(L.planConfirmer({ ...rdv, archive: true }, 1, maintenant).erreur, /plus à confirmer/);
  });
  test('L nouvelle série : tour + 1, réponses remises à zéro, créneaux validés ; refus si confirmé, annulé ou sans créneau futur', () => {
    const rdv = { id: 'r', creneaux: [futur(2)], tour: 1, etat: 'a_valider', relancesFaites: 2 };
    const maintenant = new Date().toISOString();
    const plan = L.planNouvelleSerie(rdv, [futur(4), futur(5)], maintenant);
    assert.deepEqual([plan.patchRdv.tour, plan.patchRdv.etat, plan.patchRdv.relancesFaites, plan.patchRdv.creneaux.length], [2, 'en_attente', 0, 2]);
    assert.deepEqual(plan.patchParticipant, { etatReponse: 'attente', creneauxOk: [], reponse: '', reponseLe: null, idReponse: null });
    assert.match(L.planNouvelleSerie(rdv, [], maintenant).erreur, /au moins un créneau/);
    assert.match(L.planNouvelleSerie(rdv, [futur(-1)], maintenant).erreur, /futur/);
    const apresConfirmation = L.planNouvelleSerie({ ...rdv, etat: 'confirme', creneauChoisi: futur(2), confirmeLe: maintenant }, [futur(4)], maintenant);
    assert.deepEqual([apresConfirmation.patchRdv.etat, apresConfirmation.patchRdv.creneauChoisi, apresConfirmation.patchRdv.confirmeLe], ['en_attente', null, null], 'après la pluie, une nouvelle série est possible et retire le créneau choisi');
    assert.match(L.planNouvelleSerie({ ...rdv, archive: true }, [futur(4)], maintenant).erreur, /plus ouvert/);
    assert.match(L.planNouvelleSerie({ ...rdv, annule: true }, [futur(4)], maintenant).erreur, /plus ouvert/);
    assert.equal(L.validerCreneaux([futur(4), futur(4)], maintenant).erreurs[0], 'Deux créneaux sont identiques.');
  });
  test('L les créneaux déjà passés ne sont jamais proposés à la confirmation (égalité : le plus tôt)', () => {
    const maintenant = new Date().toISOString();
    const creneaux = [futur(-1), futur(3), futur(2)];
    const tous = L.bilanReponses([p('a', 'comprise', [1, 2, 3]), p('bb', 'comprise', [1, 2, 3])], 3);
    assert.deepEqual(L.creneauxAConfirmer(tous, { creneaux, maintenant }), [3, 2], 'le 1 est passé ; 2 et 3 conviennent à tous, proposés du plus tôt (le 3) au plus tard, chacun garde son numéro : aucun choix d’office');
    assert.equal(L.creneauAConfirmer(tous, { creneaux, maintenant }), null, 'deux créneaux communs à venir : aucun n’est choisi à la place de la professionnelle');
    assert.equal(L.bandeauCreneau(tous, { creneaux, maintenant }).texte, 'Les créneaux 2 et 3 conviennent à tout le monde. Seul toi peux en confirmer un.', 'le 1 passé n’est pas cité');
    const unSeulAvenir = L.bilanReponses([p('a', 'comprise', [1, 3]), p('bb', 'comprise', [1, 3])], 3);
    assert.equal(L.creneauAConfirmer(unSeulAvenir, { creneaux, maintenant }), 3, 'un seul créneau commun à venir : proposé tel quel');
    assert.equal(L.bandeauCreneau(unSeulAvenir, { creneaux, maintenant }).texte, 'Le créneau 3 convient à tout le monde. Seul toi peux le confirmer.');
    const seulPasse = L.bilanReponses([p('a', 'comprise', [1]), p('bb', 'comprise', [1])], 3);
    assert.equal(L.creneauAConfirmer(seulPasse, { creneaux, maintenant }), null);
    assert.match(L.bandeauCreneau(seulPasse, { creneaux, maintenant }).texte, /sont passés/);
    const partiel = L.bilanReponses([p('a', 'comprise', [2]), p('bb', 'attente')], 3);
    assert.equal(L.creneauAConfirmer(partiel, { creneaux, maintenant }), 2);
  });
  test('A3l plusieurs créneaux conviennent à tous : le bandeau les cite tous, la liste de choix les donne dans l’ordre, aucun n’est choisi d’office', () => {
    const tous = L.bilanReponses([p('a', 'comprise', [1, 2]), p('bb', 'comprise', [1, 2])], 3);
    assert.deepEqual(tous.communs, [1, 2]);
    assert.equal(L.creneauAConfirmer(tous), null);
    assert.deepEqual(L.creneauxAConfirmer(tous), [1, 2]);
    const b = L.bandeauCreneau(tous);
    assert.deepEqual([b.type, b.creneau, b.creneaux], ['commun', null, [1, 2]]);
    assert.equal(b.texte, 'Les créneaux 1 et 2 conviennent à tout le monde. Seul toi peux en confirmer un.');
    assert.equal(L.bandeauCreneau(L.bilanReponses([p('a', 'comprise', [1, 2, 3]), p('bb', 'comprise', [1, 2, 3])], 3)).texte, 'Les créneaux 1, 2 et 3 conviennent à tout le monde. Seul toi peux en confirmer un.');
    // un seul créneau commun, cas partiel et cas vide : inchangés
    assert.deepEqual(L.creneauxAConfirmer(L.bilanReponses([p('a', 'comprise', [2]), p('bb', 'attente')], 3)), [2]);
    assert.deepEqual(L.creneauxAConfirmer(L.bilanReponses([p('a', 'attente')], 3)), []);
    assert.equal(L.creneauAConfirmer(L.bilanReponses([p('a', 'comprise', [1]), p('bb', 'comprise', [2])], 3)), 1, 'personne en commun : le créneau qui convient au plus de monde, le plus tôt à égalité');
  });
  test('A3m carte Kanban : plusieurs créneaux communs à venir sont comptés, un seul reste nommé, un créneau commun passé est écarté', () => {
    const creneaux = [parisEnISO(2026, 11, 17, 10), parisEnISO(2026, 11, 18, 14), parisEnISO(2026, 11, 19, 9)];
    const rdv = { id: 'r', creneaux, tour: 1 };
    const ligne = (participants, maintenant = '2026-11-14T10:00:00Z') => L.ligneEtat({ rdv, participants, parametres: {}, messages: [], maintenant });
    assert.equal(ligne([p('a', 'comprise', [1, 2]), p('b', 'comprise', [1, 2])]), '2 créneaux communs');
    assert.equal(ligne([p('a', 'comprise', [1, 2, 3]), p('b', 'comprise', [1, 2, 3])]), '3 créneaux communs');
    assert.equal(ligne([p('a', 'comprise', [1, 2]), p('b', 'comprise', [1, 2])], '2026-11-17T12:00:00Z'), 'Créneau commun : mer. 18 nov. 14 h', 'le 1 (mar. 17 nov. 10 h) est passé : un seul reste');
  });
  test('A3n le choix fait dans la fenêtre n’est valable que si la date n’a pas changé, que tout le monde a répondu et que le créneau est toujours commun et à venir', () => {
    const rdv = { id: 'r', creneaux: [futur(2), futur(3), futur(4)], tour: 1 };
    const parts = [p('a', 'comprise', [1, 2]), p('bb', 'comprise', [1, 2])];
    const maintenant = new Date().toISOString();
    const v = (r, ps, n, d = rdv.creneaux[n - 1]) => L.verdictChoix(r, ps, n, d, maintenant);
    assert.equal(v(rdv, parts, 2), 'ok');
    assert.equal(v({ ...rdv, creneaux: [rdv.creneaux[0], futur(5), rdv.creneaux[2]] }, parts, 2, rdv.creneaux[1]), 'creneau', 'la date du créneau 2 a changé');
    assert.equal(v(rdv, [p('a', 'comprise', [1, 2]), p('bb', 'comprise', [1])], 2), 'creneau', 'le créneau 2 n’est plus commun');
    assert.equal(v({ ...rdv, creneaux: [futur(-1), rdv.creneaux[1], rdv.creneaux[2]] }, parts, 1, rdv.creneaux[0]), 'creneau', 'le créneau 1 est passé');
    // I1 : jamais de repli sur « le créneau qui convient au plus de monde » : la fenêtre dit « conviennent à tout le monde »
    assert.equal(v(rdv, [...parts, p('ccc', 'attente')], 1), 'creneau', 'participant ajouté, en attente');
    assert.equal(v(rdv, [p('a', 'comprise', [3]), p('bb', 'comprise', [1, 2])], 1), 'creneau', 'réponse corrigée en [3] : plus de créneau commun');
    assert.equal(v(rdv, [p('a', 'incomprise'), p('bb', 'comprise', [1, 2])], 1), 'creneau', 'réponse devenue non comprise');
    // M3 : le rendez-vous lui-même n'est plus à confirmer
    assert.equal(v({ ...rdv, etat: 'confirme', creneauChoisi: rdv.creneaux[0] }, parts, 2), 'rendezvous', 'confirmé ailleurs');
    assert.equal(v({ ...rdv, annule: true }, parts, 2), 'rendezvous', 'annulé');
    assert.equal(v({ ...rdv, archive: true }, parts, 2), 'rendezvous', 'archivé');
    assert.equal(v(null, parts, 2), 'rendezvous', 'supprimé');
  });
  test('A3o la fenêtre d’UN seul créneau : refus si la date affichée a changé, si le créneau est passé, si les réponses ne le proposent plus ou si le rendez-vous n’est plus à confirmer', () => {
    const rdv = { id: 'r', creneaux: [futur(2), futur(3), futur(4)], tour: 1 };
    const parts = [p('a', 'comprise', [3]), p('bb', 'attente')]; // le créneau 3 est le seul proposé (il convient à 1 personne sur 2)
    const maintenant = new Date().toISOString();
    const v = (r, ps, n, d = rdv.creneaux[n - 1]) => L.verdictCreneauUnique(r, ps, n, d, maintenant);
    assert.equal(v(rdv, parts, 3), 'ok');
    assert.equal(v({ ...rdv, creneaux: [rdv.creneaux[0], rdv.creneaux[1], futur(9)] }, parts, 3, rdv.creneaux[2]), 'creneau', 'date changée');
    assert.equal(v({ ...rdv, creneaux: [rdv.creneaux[0], rdv.creneaux[1]] }, parts, 3, rdv.creneaux[2]), 'creneau', 'créneau retiré');
    assert.equal(v({ ...rdv, creneaux: [futur(-1), rdv.creneaux[1], rdv.creneaux[2]] }, [p('a', 'comprise', [1]), p('bb', 'attente')], 1, rdv.creneaux[0]), 'creneau', 'créneau passé');
    // m5 : les réponses changent pendant que la fenêtre est ouverte
    assert.equal(v(rdv, [p('a', 'comprise', [3]), p('bb', 'comprise', [2])], 3), 'creneau', 'une réponse arrive : le créneau 2 convient autant, le plus tôt gagne (2)');
    assert.equal(v(rdv, [p('a', 'comprise', [3]), p('bb', 'comprise', [3])], 3), 'ok', 'tout le monde répond 3 : c’est toujours le seul proposé');
    assert.equal(v(rdv, [p('a', 'comprise', [1, 3]), p('bb', 'comprise', [1, 3])], 3), 'creneau', 'deux créneaux deviennent communs : la fenêtre à choix s’impose');
    assert.equal(v(rdv, [p('a', 'comprise', [2]), p('bb', 'attente')], 3), 'creneau', 'la réponse corrigée ne propose plus le 3');
    assert.equal(v({ ...rdv, etat: 'confirme', creneauChoisi: rdv.creneaux[0] }, parts, 3), 'rendezvous');
    assert.equal(v({ ...rdv, annule: true }, parts, 3), 'rendezvous');
    assert.equal(v({ ...rdv, archive: true }, parts, 3), 'rendezvous');
    assert.equal(v(null, parts, 3), 'rendezvous');
  });
  describe('A6 avant de confirmer : ce qui va partir par SMS', () => {
    const creneaux = [parisEnISO(2026, 11, 17, 10), parisEnISO(2026, 11, 18, 14), parisEnISO(2026, 11, 19, 9)];
    const rdv = { id: 'r', client: 'M. Durand', adresse: '12 rue des Lilas\n69000 Lyon', creneaux, tour: 1 };
    const maintenant = '2026-11-14T10:00:00Z';
    const parts = [
      { id: 'a', nom: 'M. Durand', telephone: '+33600000001', etatReponse: 'comprise', creneauxOk: [2] },
      { id: 'b', nom: 'Terrassier', telephone: '+33600000002', etatReponse: 'comprise', creneauxOk: [2] },
      { id: 'c', nom: 'Architecte', telephone: '+33600000003', etatReponse: 'comprise', creneauxOk: [2] },
      { id: 'd', nom: 'Sans numéro', telephone: '', etatReponse: 'comprise', creneauxOk: [2] },
    ];
    const reglages = { nomDansLesSms: 'Mme Martin', rappel: { actif: true, heure: '19:00' }, prixSms: 0.1, tarifsAu: '1er novembre 2026' };
    const STOP = ['+33600000003']; // la liste des numéros qui ont répondu STOP, tenue par le serveur (la seule que smsDus lit)
    const prevoir = (extra = {}) => L.previsionConfirmation({ rdv, participants: parts, parametres: reglages, numero: 2, maintenant, desinscrits: STOP, ...extra });
    test('A6 le numéro masqué garde le début et la fin', () => {
      assert.equal(L.masquerTelephone('+33600000002'), '06 •• •• •• 02');
      assert.equal(L.masquerTelephone('0600000002'), '06 •• •• •• 02');
      assert.doesNotMatch(L.masquerTelephone('+33612345678'), /1234|5678|3456/);
    });
    test('A6 qui reçoit quoi : confirmation tout de suite aux joignables, rien aux désinscrits (STOP) et sans téléphone, rappel la veille à 19h', () => {
      const r = prevoir();
      assert.deepEqual(r.personnes.map((x) => [x.nom, x.statut, x.telephone]), [['M. Durand', 'recoit', '06 •• •• •• 01'], ['Terrassier', 'recoit', '06 •• •• •• 02'], ['Architecte', 'desinscrit', '06 •• •• •• 03'], ['Sans numéro', 'sans-telephone', '']]);
      assert.equal(r.destinataires, 2);
      assert.equal(r.rappelLe, parisEnISO(2026, 11, 17, 19), 'la veille du mer. 18 nov., à 19h');
      assert.deepEqual([r.messages, r.segments], [4, 4], '2 confirmations + 2 rappels, un segment chacun');
      assert.equal(r.aucun, false);
      assert.match(r.confirmation.texte, /^RDV confirmé : M\. Durand, mer\. 18 nov\. à 14h\./);
      assert.match(r.confirmation.texte, /STOP/, 'la mention STOP est dans le vrai texte');
      assert.deepEqual(r.confirmation.manque, []);
    });
    test('A6 un numéro dans la liste des désinscrits ne reçoit rien non plus', () => {
      const r = prevoir({ desinscrits: [...STOP, '+33600000002'] });
      assert.equal(r.personnes[1].statut, 'desinscrit');
      assert.equal(r.destinataires, 1);
    });
    test('A6 le coût vient du prix réglable : segments × prix, estimation datée', () => {
      const r = prevoir();
      assert.equal(r.cout, L.coutSms(r.confirmation.texte, 0.1) * 2 + L.coutSms(L.construireSms('rappel', { nom_pro: 'Mme Martin', client: 'M. Durand', adresse: '12 rue des Lilas, 69000 Lyon', date: 'mer. 18 nov.', heure: '14h' }, reglages).texte, 0.1) * 2);
      assert.equal(r.tarifsAu, '1er novembre 2026');
      assert.equal(prevoir({ parametres: { ...reglages, prixSms: 0.2 } }).cout, Math.round(prevoir().cout * 2 * 1e6) / 1e6, 'un prix doublé double le coût');
    });
    test('A6 pas de rappel si le rappel est coupé ou si la veille est déjà passée', () => {
      const coupe = prevoir({ parametres: { ...reglages, rappel: { actif: false, heure: '19:00' } } });
      assert.equal(coupe.rappelLe, null); assert.equal(coupe.messages, 2);
      const tard = prevoir({ maintenant: '2026-11-17T20:00:00Z' }); // le 17 à 21h Paris : la veille à 19h est passée
      assert.equal(tard.rappelLe, null); assert.equal(tard.messages, 2);
    });
    test('A6 aucun joignable : « Aucun SMS ne partira », coût zéro', () => {
      const r = L.previsionConfirmation({ rdv, participants: [parts[2], parts[3]], parametres: reglages, numero: 2, maintenant, desinscrits: STOP });
      assert.equal(r.aucun, true); assert.equal(r.messages, 0); assert.equal(r.segments, 0); assert.equal(r.cout, 0);
      assert.equal(L.phraseAvantConfirmer({ rdv, participants: [parts[2], parts[3]], parametres: reglages, numeros: [2], maintenant, desinscrits: STOP }), 'Aucun SMS ne partira : aucun participant n’a de numéro joignable.');
      assert.equal(L.previsionConfirmation({ rdv, participants: [], parametres: reglages, numero: 2, maintenant }).aucun, true, 'aucun participant');
    });
    test('A6 rendez-vous de test : les SMS vont au numéro de test, jamais aux participants ; sans numéro de test rien ne part', () => {
      const t = L.previsionConfirmation({ rdv: { ...rdv, test: true }, participants: parts, parametres: { ...reglages, numeroTest: '+33600000009' }, numero: 2, maintenant, desinscrits: STOP });
      assert.equal(t.test, true); assert.equal(t.numeroTest, '06 •• •• •• 09'); assert.equal(t.destinataires, 3, 'deux joignables + « Sans numéro » : en test, smsDus écrit aussi pour lui, au numéro de test'); assert.equal(t.personnes[2].statut, 'desinscrit');
      assert.match(L.phraseAvantConfirmer({ rdv: { ...rdv, test: true }, participants: parts, parametres: { ...reglages, numeroTest: '+33600000009' }, numeros: [2], maintenant }), /seulement vers le numéro de test \(06 •• •• •• 09\), jamais vers les participants/);
      const sans = L.previsionConfirmation({ rdv: { ...rdv, test: true }, participants: parts, parametres: reglages, numero: 2, maintenant, desinscrits: STOP });
      assert.equal(sans.aucun, true); assert.equal(sans.raisonAucun, 'test-sans-numero'); assert.equal(sans.messages, 0);
      assert.match(L.phraseAvantConfirmer({ rdv: { ...rdv, test: true }, participants: parts, parametres: reglages, numeros: [2], maintenant }), /aucun SMS ne partira \(le numéro des SMS de test n’est pas réglé\)/);
    });
    test('A6 la phrase sous le bouton : les chiffres viennent des vrais participants, le rappel n’est cité que s’il part pour tous les créneaux proposés', () => {
      const phrase = (extra = {}) => L.phraseAvantConfirmer({ rdv, participants: parts, parametres: reglages, numeros: [2], maintenant, desinscrits: STOP, ...extra });
      assert.equal(phrase(), 'En confirmant : 2 personnes reçoivent un SMS de confirmation tout de suite, puis un rappel la veille à 19h. Les numéros désinscrits (STOP) ne reçoivent rien.');
      assert.equal(phrase({ participants: [parts[0]] }), 'En confirmant : 1 personne reçoit un SMS de confirmation tout de suite, puis un rappel la veille à 19h. Les numéros désinscrits (STOP) ne reçoivent rien.');
      assert.doesNotMatch(phrase({ parametres: { ...reglages, rappel: { actif: false, heure: '19:00' } } }), /rappel/);
      assert.match(phrase({ numeros: [1, 2] }), /rappel la veille à 19h/, 'deux créneaux à venir : le rappel part dans les deux cas');
      assert.doesNotMatch(phrase({ numeros: [1, 2], maintenant: '2026-11-16T20:30:00Z' }), /rappel/, 'la veille du 1er créneau est déjà passée : pas de rappel promis');
      assert.equal(phrase({ numeros: [] }), '');
    });
    test('A6 miroir exact du serveur : seul le numéro de la liste des STOP est exclu (le repère « desinscrit » d’une fiche n’y change rien, comme dans smsDus)', () => {
      const flag = [{ ...parts[0], desinscrit: true }, parts[1]];
      const r = L.previsionConfirmation({ rdv, participants: flag, parametres: reglages, numero: 2, maintenant, desinscrits: [] });
      assert.deepEqual(r.personnes.map((x) => x.statut), ['recoit', 'recoit']);
      const serveur = L.smsDus({ rdv: { ...rdv, etat: 'confirme', creneauChoisi: creneaux[1], confirmeLe: maintenant }, participants: flag, parametres: reglages, messages: [], maintenant, desinscrits: [] }).filter((x) => x.typeMessage === 'confirmation');
      assert.equal(serveur.length, r.destinataires, 'même nombre de confirmations que smsDus');
      const avecListe = L.previsionConfirmation({ rdv, participants: flag, parametres: reglages, numero: 2, maintenant, desinscrits: ['+33600000001'] });
      assert.equal(avecListe.destinataires, 1);
      assert.equal(L.smsDus({ rdv: { ...rdv, etat: 'confirme', creneauChoisi: creneaux[1], confirmeLe: maintenant }, participants: flag, parametres: reglages, messages: [], maintenant, desinscrits: ['+33600000001'] }).filter((x) => x.typeMessage === 'confirmation').length, 1);
    });
    test('A6 le rappel suit la plage d’envoi comme dans smsDus : décalé à l’ouverture, ou plus de rappel s’il tomberait le jour du rendez-vous', () => {
      const avec = (heure, plage) => prevoir({ parametres: { ...reglages, rappel: { actif: true, heure }, ...(plage ? { plage } : {}) } });
      assert.equal(avec('19:00').rappelLe, parisEnISO(2026, 11, 17, 19), 'dans la plage : à l’heure réglée');
      assert.equal(avec('22:00').rappelLe, null, 'à 22h, hors de la plage 08:00-20:30 : le rappel attendrait le matin du rendez-vous, donc plus de rappel annoncé');
      assert.equal(avec('22:00').messages, 2);
      assert.equal(avec('07:00').rappelLe, parisEnISO(2026, 11, 17, 8), 'à 7h : le rappel part à l’ouverture, 8h la veille');
      assert.equal(L.phraseAvantConfirmer({ rdv, participants: parts, parametres: { ...reglages, rappel: { actif: true, heure: '07:00' } }, numeros: [2], maintenant, desinscrits: STOP }).includes('un rappel la veille à 8h'), true, 'la phrase dit l’heure réelle');
      assert.doesNotMatch(L.phraseAvantConfirmer({ rdv, participants: parts, parametres: { ...reglages, rappel: { actif: true, heure: '22:00' } }, numeros: [2], maintenant, desinscrits: STOP }), /rappel/);
      // Le serveur fait pareil, évalué à l'instant où le rappel serait dû (c'est ce qui rend la borne « avant le début du jour du rendez-vous » de smsDus testable).
      const rdvConfirme = { ...rdv, etat: 'confirme', creneauChoisi: creneaux[1], confirmeLe: maintenant };
      const rappelsServeur = (heure, quand) => L.smsDus({ rdv: rdvConfirme, participants: parts, parametres: { ...reglages, rappel: { actif: true, heure } }, messages: [], maintenant: quand, desinscrits: STOP }).filter((x) => x.typeMessage === 'rappel');
      assert.equal(rappelsServeur('22:00', parisEnISO(2026, 11, 18, 8, 5)).length, 0, 'rappel à 22h le 17, décalé à 8h le 18 (jour du rendez-vous) : smsDus le jette alors qu’il serait dû à 8h05 sans la borne');
      assert.equal(rappelsServeur('22:00', parisEnISO(2026, 11, 17, 21)).length, 0, 'et rien n’est dû le soir même non plus');
      const dus = rappelsServeur('07:00', parisEnISO(2026, 11, 17, 8, 5));
      assert.equal(dus.length, 2, 'rappel à 7h le 17, décalé à 8h le 17 : dû à 8h05 pour les deux personnes joignables');
      assert.ok(dus.every((x) => x.dueLe === avec('07:00').rappelLe), 'même instant que celui annoncé par la prévision');
      assert.equal(rappelsServeur('07:00', parisEnISO(2026, 11, 17, 7, 30)).length, 0, 'pas dû avant l’ouverture de la plage (8h)');
    });
    test('A6 aucun destinataire : aucun rappel n’est annoncé (rappelLe vide) même si le rappel est actif et la veille à venir', () => {
      const r = L.previsionConfirmation({ rdv, participants: [parts[0], parts[1]], parametres: reglages, numero: 2, maintenant, desinscrits: ['+33600000001', '+33600000002'] });
      assert.equal(r.destinataires, 0);
      assert.equal(r.rappelLe, null);
      assert.equal(r.segments, 0);
      assert.doesNotMatch(L.phraseAvantConfirmer({ rdv, participants: [parts[0], parts[1]], parametres: reglages, numeros: [2], maintenant, desinscrits: ['+33600000001', '+33600000002'] }), /rappel/);
    });
    test('A6 SMS facturés = segments : une adresse longue double le compte, le détail confirmation / rappel porte ses propres segments', () => {
      const longue = { ...rdv, adresse: `${'12 rue des Lilas '.repeat(9).trim()}\n69000 Lyon` };
      const r = L.previsionConfirmation({ rdv: longue, participants: parts.slice(0, 2), parametres: reglages, numero: 2, maintenant });
      assert.ok(r.confirmation.segments >= 2, `la confirmation tient en ${r.confirmation.segments} segments`);
      const rappelSegments = L.construireSms('rappel', { nom_pro: 'Mme Martin', client: 'M. Durand', adresse: longue.adresse.replace(/\n/g, ', '), date: 'mer. 18 nov.', heure: '14h' }, reglages).segments;
      assert.equal(r.segmentsConfirmation, r.confirmation.segments * 2);
      assert.equal(r.segmentsRappel, rappelSegments * 2);
      assert.equal(r.segments, r.segmentsConfirmation + r.segmentsRappel);
      assert.ok(r.segments > r.messages, 'plus de SMS facturés que de messages');
      assert.equal(r.cout, Math.round((L.coutSms(r.confirmation.texte, 0.1) * 2 + 0.1 * rappelSegments * 2) * 1e6) / 1e6, 'le coût suit les segments');
    });
    test('A6 un caractère spécial (Unicode) fait passer à 70 unités par SMS : le compte de segments le suit', () => {
      const unicode = { ...rdv, client: 'M. Durand \u{1F600}' };
      const r = L.previsionConfirmation({ rdv: unicode, participants: parts.slice(0, 1), parametres: reglages, numero: 2, maintenant });
      assert.equal(r.confirmation.segments, L.preparerSms(r.confirmation.texte).segments);
      assert.equal(r.segmentsConfirmation, r.confirmation.segments);
    });
    test('A6 rendez-vous de test : la cible vient de numeroCible comme dans smsDus ; un participant sans téléphone reçoit alors le SMS au numéro de test (comme le serveur)', () => {
      const reg = { ...reglages, numeroTest: '+33600000009' };
      const test = { ...rdv, test: true };
      const sansTel = [{ id: 'z', nom: 'Sans numéro', telephone: '', etatReponse: 'comprise', creneauxOk: [2] }];
      const r = L.previsionConfirmation({ rdv: test, participants: sansTel, parametres: reg, numero: 2, maintenant });
      const serveur = L.smsDus({ rdv: { ...test, etat: 'confirme', creneauChoisi: creneaux[1], confirmeLe: maintenant }, participants: sansTel, parametres: reg, messages: [], maintenant, desinscrits: [] }).filter((x) => x.typeMessage === 'confirmation');
      assert.equal(serveur.length, 1, 'smsDus écrit bien un SMS pour ce participant, au numéro de test');
      assert.equal(serveur[0].numero, '+33600000009');
      assert.equal(r.destinataires, serveur.length, 'même nombre que smsDus');
      assert.equal(r.personnes[0].statut, 'recoit');
    });
    test('A6 mode test + numéro de test réglé + tous désinscrits : « Aucun SMS ne partira » passe avant la phrase du numéro de test', () => {
      const reg = { ...reglages, numeroTest: '+33600000009' };
      const tous = L.phraseAvantConfirmer({ rdv: { ...rdv, test: true }, participants: parts.slice(0, 2), parametres: reg, numeros: [2], maintenant, desinscrits: ['+33600000001', '+33600000002'] });
      assert.equal(tous, 'Aucun SMS ne partira : aucun participant n’a de numéro joignable.');
    });
    test('A6 un numéro qui n’a pas la forme attendue est masqué en entier (jamais montré en clair)', () => {
      assert.equal(L.masquerTelephone('abc12'), '•• •• •• •• ••');
      assert.equal(L.masquerTelephone(''), '•• •• •• •• ••');
      assert.equal(L.masquerTelephone('06 12 34 56 7'), '•• •• •• •• ••');
      assert.equal(L.masquerTelephone('06 12 34 56 78'), '06 •• •• •• 78');
    });
    test('A6 un nom de professionnelle manquant est signalé (accolade restante) au lieu d’être caché', () => {
      const r = prevoir({ parametres: { ...reglages, nomDansLesSms: '' } });
      assert.ok(r.confirmation.manque.includes('nom_pro'));
    });
  });
  test('L SMS de pluie et d’annulation sans nom ni date : aucune accolade visible', () => {
    for (const [type, rdv, params] of [['pluie', { client: 'M. Durand' }, {}], ['pluie', {}, {}], ['pluie', { client: 'M. Durand', etat: 'confirme' }, { nomDansLesSms: 'Mme Martin' }], ['annulation', {}, {}]]) {
      const t = L.texteSmsManuel(type, rdv, params);
      assert.doesNotMatch(t, /[{}]/, `${type} ${JSON.stringify(rdv)}`);
      assert.ok(t.length > 20 && L.compterSms(t).encodage === 'gsm7');
    }
    assert.match(L.texteSmsManuel('pluie', { client: 'M. Durand' }, { nomDansLesSms: 'Mme Martin' }), /^Mme Martin : le RDV \(M\. Durand\) est annulé à cause de la pluie\./);
  });
  test('L un rendez-vous annulé est toujours dans les Archives', () => {
    const rdvs = [{ id: 'a', annule: true, archive: false }, { id: 'b' }, { id: 'c', archive: true }];
    assert.deepEqual(L.filtrerRendezVous(rdvs, {}, {}).map((r) => r.id), ['b']);
    assert.deepEqual(L.filtrerRendezVous(rdvs, {}, {}, { archives: true }).map((r) => r.id), ['a', 'c']);
  });
  test('L SMS de pluie et d’annulation : texte prérempli, sans caractère à remplacer, moins de 160 caractères', () => {
    const rdv = { client: 'M. Durand', creneauChoisi: '2031-03-17T09:00:00Z' };
    for (const type of ['pluie', 'annulation']) {
      const t = L.texteSmsManuel(type, rdv, { nomDansLesSms: 'Mme Martin' });
      assert.ok(L.compterSms(t).segments <= 2 && L.compterSms(t).encodage === 'gsm7', type);
      assert.match(t, /Chevalier IA - Répondez STOP pour vous désabonner\.$/, type);
      assert.doesNotMatch(t, /\{|\}/);
    }
    assert.match(L.texteSmsManuel('annulation', { client: 'M. Durand' }, {}), /est annulé\./);
  });
  test('L historique : les messages par date, avec le nom retrouvé par le numéro', () => {
    const h = L.historiqueMessages([{ id: 'b', numero: '+33600000002', recuLe: '2031-03-17T11:00:00Z', sens: 'entrant' }, { id: 'a', numero: '+33600000001', envoyeLe: '2031-03-17T09:00:00Z', sens: 'sortant' }], [{ telephone: '+33600000001', nom: 'M. Durand' }, { telephone: '+33600000002', nom: 'Terrassier' }]);
    assert.deepEqual(h.map((m) => [m.id, m.qui]), [['a', 'M. Durand'], ['b', 'Terrassier']]);
  });
});

describe('M nom de l’entreprise et STOP dans chaque SMS', () => {
  test('M le nom est réglable, « Chevalier IA » tant qu’il n’est pas réglé, nettoyé et limité', () => {
    assert.equal(L.mentionStop({}), 'Chevalier IA - Répondez STOP pour vous désabonner.');
    assert.equal(L.mentionStop({ nomEntreprise: '   ' }), 'Chevalier IA - Répondez STOP pour vous désabonner.');
    assert.equal(L.mentionStop({ nomEntreprise: '  Géolucie   Étanchéité ' }), 'Géolucie Étanchéité - Répondez STOP pour vous désabonner.');
    assert.equal(L.mentionStop({ nomEntreprise: 'x'.repeat(80) }).split(' - ')[0].length, L.NOM_ENTREPRISE_MAX);
    assert.equal(L.PARAMETRES_DEFAUT.nomEntreprise, 'Chevalier IA');
  });
  test('M la ligne est ajoutée une seule fois, jamais si le texte porte déjà cette mention', () => {
    const un = L.avecMentionStop('Bonjour', { nomEntreprise: 'Géolucie' });
    assert.equal(un, 'Bonjour\nGéolucie - Répondez STOP pour vous désabonner.');
    assert.equal(L.avecMentionStop(un, { nomEntreprise: 'Géolucie' }), un);
    assert.equal(L.avecMentionStop('Répondez STOP pour arrêter', {}), 'Répondez STOP pour arrêter\nChevalier IA - Répondez STOP pour vous désabonner.', 'un autre « STOP » écrit à la main ne remplace pas la mention complète');
    assert.equal(L.avecMentionStop('   ', {}), '');
  });
  test('M les six modèles portent le nom réglé ; les alertes à la professionnelle n’en portent pas', () => {
    for (const type of Object.keys(L.MODELES_DEFAUT)) {
      const sms = L.construireSms(type, L.EXEMPLE_SMS, { nomEntreprise: 'Géolucie' });
      assert.ok(sms.texte.endsWith('Géolucie - Répondez STOP pour vous désabonner.'), type);
    }
    assert.doesNotMatch(L.texteAlerte('incomprise', { client: 'M. Durand', nom: 'Terrassier', reponse: 'peut-etre' }).texte, /STOP/);
  });
  test('M un client, une rue ou un modèle qui contient « Stop » ne fait pas sauter la ligne (relecture Fable)', () => {
    const fin = 'Chevalier IA - Répondez STOP pour vous désabonner.';
    for (const client of ['Stop Fuites SARL', 'Garage Auto Stop', 'M. Stop', 'non-stop', 'Stop&Go']) {
      const sms = L.construireSms('confirmation', { ...L.EXEMPLE_SMS, client });
      assert.ok(sms.texte.endsWith(fin), client);
      assert.equal(sms.texte.split('STOP pour vous').length, 2, `${client} : une seule ligne`);
    }
    assert.ok(L.texteSmsManuel('pluie', { client: 'Garage Auto Stop', creneauChoisi: '2031-03-17T09:00:00Z' }, { nomDansLesSms: 'Mme Martin' }).endsWith(fin));
    assert.equal(L.avecMentionStop(`Bonjour\n${fin}`, {}), `Bonjour\n${fin}`, 'jamais deux fois');
  });
  test('M le nom de l’entreprise est normalisé comme un SMS (accents gardés si GSM-7, € remplacé, émojis retirés)', () => {
    assert.match(L.mentionStop({ nomEntreprise: 'Bat Eco € 🚀' }), /^Bat Eco EUR - /);
    assert.equal(L.compterSms(L.mentionStop({ nomEntreprise: 'Géolucie Étanchéité' })).encodage, 'gsm7');
    assert.match(L.mentionStop({ nomEntreprise: 'Bâtiment Œuvre' }), /^Batiment OEuvre - /, 'accent non GSM-7 remplacé');
    assert.match(L.mentionStop({ nomEntreprise: '🚀🚀' }), /^Chevalier IA - /, 'un nom fait seulement d\'émojis revient au nom de départ');
  });
});

describe('B1 les neuf alertes sont des modèles réglables', () => {
  const ctx = { client: 'M. Durand', creneau: '2031-03-17T09:00:00Z', nom: 'M. Petit', reponse: 'plutot jeudi' };
  test('B1 les 15 modèles réglables : six pour les participants, neuf alertes sous la clé alerte-<sous-type>', () => {
    assert.deepEqual(Object.keys(L.TOUS_MODELES_DEFAUT), ['confiance', 'creneaux', 'relance', 'confirmation', 'rappel', 'pluie', ...L.SOUS_TYPES_ALERTE.map((t) => `alerte-${t}`)]);
    assert.equal(L.SOUS_TYPES_ALERTE.length, 9);
    assert.equal(L.SOUS_TYPES_ALERTE.at(-1), 'solde-bas');
    assert.deepEqual(Object.keys(L.MODELES_DEFAUT).length, 6, 'les six modèles des participants gardent leur liste');
  });
  test('B1 chaque alerte de départ est déjà sans caractère à remplacer, sans STOP, et chacune tient en un SMS avec des données d’exemple', () => {
    for (const t of L.SOUS_TYPES_ALERTE) {
      const cle = `alerte-${t}`;
      assert.equal(L.preparerSms(L.MODELES_ALERTE_DEFAUT[cle]).modifie, false, `${cle} : un caractère est remplacé`);
      const sms = L.texteAlerte(t, L.EXEMPLE_ALERTE);
      assert.equal(sms.segments, 1, `${cle} : ${sms.caracteres} caractères`);
      assert.doesNotMatch(sms.texte, /Répondez STOP|\{[a-z_]+\}/, cle);
      // chaque alerte de rendez-vous a la variable {client} ; « solde bas » n'en a aucun (pas de rendez-vous) : elle a {solde} et {seuil}
      assert.ok(L.LIBELLES_ALERTES[cle] && L.VARIABLES_ALERTE[cle].includes(t === 'solde-bas' ? 'solde' : 'client'), cle);
    }
  });
  test('B1 un modèle réglé remplace le texte de départ ; vide ou absent = texte de départ ; retour au défaut', () => {
    const p = { modeles: { 'alerte-echec-envoi': 'Oups {client} : {nom} injoignable' } };
    assert.equal(L.texteAlerte('echec-envoi', ctx, p).texte, 'Oups M. Durand : M. Petit injoignable');
    assert.match(L.texteAlerte('echec-envoi', ctx, { modeles: { 'alerte-echec-envoi': '   ' } }).texte, /n'est pas parti vers M\. Petit/);
    assert.equal(L.modeleDe('alerte-echec-envoi', {}), L.MODELES_ALERTE_DEFAUT['alerte-echec-envoi']);
    assert.doesNotMatch(L.texteAlerte('echec-envoi', ctx, p).texte, /STOP/, 'pas de mention STOP, même sur un modèle réglé');
  });
  test('B1 chaque alerte n’accepte que SES variables ; les six modèles gardent la liste des participants', () => {
    assert.deepEqual(L.variablesInconnues('{client} {creneau} {lien}', 'alerte-commun'), []);
    assert.deepEqual(L.variablesInconnues('{nom}', 'alerte-commun'), ['nom']);
    assert.deepEqual(L.variablesInconnues('{lien}', 'alerte-incomprise'), ['lien'], 'le lien n’existe que pour « commun » et « aucun »');
    assert.deepEqual(L.variablesInconnues('{creneau}', 'alerte-aucun'), ['creneau']);
    assert.deepEqual(L.variablesInconnues('{reponse} {nom}', 'alerte-tardive'), []);
    assert.deepEqual(L.variablesInconnues('{adresse} {client}', 'confirmation'), []);
    assert.deepEqual(L.variablesInconnues('{reponse}', 'rappel'), ['reponse']);
    assert.deepEqual(L.variablesInconnues('{inconnue} {client}'), ['inconnue'], 'sans type : la liste des participants (appel d’origine)');
    assert.deepEqual(L.variablesDuModele('alerte-commun'), ['client', 'creneau', 'lien']);
  });
  test('B1 le repli reste « à regarder dans l’appli » pour un sous-type inconnu, sans le mot « chantier »', () => {
    assert.equal(L.texteAlerte('inconnu', {}).texte, 'RDV (sans nom) : à regarder dans l\'appli.');
    assert.doesNotMatch(L.texteAlerte('incomprise', {}).texte, /chantier/i);
  });
  test('B1 aperçu des neuf alertes : « avec lien » et « sans lien » seulement pour commun, aucun et solde-bas', () => {
    const a = L.apercuAlertes({});
    assert.equal(a.length, 9);
    assert.deepEqual(a.filter((x) => x.aLien).map((x) => x.sousType), ['commun', 'aucun', 'solde-bas']);
    assert.ok(a.every((x) => (x.aLien ? x.sansLien && x.caracteres > x.sansLien.caracteres : x.sansLien === null)));
  });
});

describe('B2 le lien du rendez-vous dans les alertes « commun » et « aucun »', () => {
  const T = '+33700000001';
  const parametres = { numerosAlerte: [{ id: 'n1', libelle: 'Mobile', numero: T, actif: true }], relances: { delaiHeures: 24, nombre: 3 }, rappel: { actif: true, heure: '19:00' }, plage: { debut: '08:00', fin: '20:30' } };
  const maintenant = parisEnISO(2026, 11, 14, 12);
  const futur = (j) => parisEnISO(2026, 11, 14 + j, 10);
  const rdv = (extra = {}) => ({ id: 'rdvAbc123', client: 'M. Durand', creneaux: [futur(3), futur(4), futur(5)], tour: 1, envoiDemandeLe: parisEnISO(2026, 11, 14, 9), archive: false, annule: false, etat: 'en_attente', ...extra });
  const rep = (id, ok) => ({ id, nom: id, telephone: '+33600000009', etatReponse: 'comprise', creneauxOk: ok, reponseLe: parisEnISO(2026, 11, 14, 11) });
  const alertes = (args) => L.smsDus({ parametres, messages: [], maintenant, ...args }).filter((d) => d.typeMessage === 'alerte');
  const LIEN = 'https://exemple.test/#/rdv/liste/rdvAbc123';

  test('B2 « un créneau convient à tous » porte le lien, et cite un créneau À VENIR', () => {
    const [a] = alertes({ rdv: rdv(), participants: [rep('a', [2, 3]), rep('b', [2])], lien: LIEN });
    assert.equal(a.sousType, 'commun');
    assert.ok(a.texte.endsWith(`\n${LIEN}`), a.texte);
    assert.match(a.texte, /mer\. 18 nov\./, 'le créneau 2 (futur), pas un autre');
    assert.equal(a.manque.length, 0);
  });
  test('B2 « aucun créneau commun » porte le lien aussi ; les autres alertes n’en portent jamais', () => {
    const [a] = alertes({ rdv: rdv(), participants: [rep('a', [1]), rep('b', [2])], lien: LIEN });
    assert.equal(a.sousType, 'aucun');
    assert.ok(a.texte.endsWith(LIEN));
    const autres = alertes({ rdv: rdv(), participants: [{ ...rep('a', []), etatReponse: 'incomprise', reponse: 'bof', reponseLe: parisEnISO(2026, 11, 14, 11), idReponse: 'x1' }], lien: LIEN });
    assert.equal(autres[0].sousType, 'incomprise');
    assert.doesNotMatch(autres[0].texte, /https/);
  });
  test('B2 sans lien (serveur sans adresse) : ni lien, ni accolade, ni ligne vide', () => {
    const [a] = alertes({ rdv: rdv(), participants: [rep('a', [1]), rep('b', [1])] });
    assert.equal(a.sousType, 'commun');
    assert.doesNotMatch(a.texte, /https|\{|\n$/);
    assert.equal(a.manque.length, 0);
  });
  test('B2 si l’utilisateur retire {lien} du modèle, il n’y a plus de lien', () => {
    const p = { ...parametres, modeles: { 'alerte-commun': 'RDV {client} : {creneau} convient.' } };
    const [a] = alertes({ rdv: rdv(), participants: [rep('a', [1]), rep('b', [1])], lien: LIEN, parametres: p });
    assert.equal(a.texte, `RDV M. Durand : ${L.formaterCreneauSms(rdv().creneaux[0])} convient.`);
  });
  test('B2 au plus une alerte « commun » par numéro et par série : déjà envoyée = plus rien ; une nouvelle série en renvoie une', () => {
    const args = { rdv: rdv(), participants: [rep('a', [1]), rep('b', [1])], lien: LIEN };
    const [premiere] = alertes(args);
    const envoye = { id: 'm1', echeance: premiere.idEcheance, etatEnvoi: 'envoye', sens: 'sortant', tour: 1 };
    assert.match(premiere.idEcheance, /:alerte-commun:n1$/);
    assert.equal(alertes({ ...args, messages: [envoye] }).length, 0, 'le même tour ne renvoie jamais l’alerte');
    const tour2 = alertes({ ...args, rdv: rdv({ tour: 2 }), messages: [envoye] });
    assert.equal(tour2.length, 1, 'une nouvelle série de propositions = une nouvelle alerte');
  });
  test('B2 tous les créneaux communs sont passés : la professionnelle reçoit « aucun créneau commun » (aucun à venir ne convient), jamais « commun » sur une date passée', () => {
    const r = rdv({ creneaux: [parisEnISO(2026, 11, 13, 10), futur(3)] });
    const toutPasse = alertes({ rdv: r, participants: [rep('a', [1]), rep('b', [1])], lien: LIEN });
    assert.deepEqual(toutPasse.map((x) => x.sousType), ['aucun']);
    assert.ok(toutPasse[0].texte.endsWith(LIEN));
    const mix = alertes({ rdv: r, participants: [rep('a', [1, 2]), rep('b', [1, 2])], lien: LIEN });
    assert.equal(mix.length, 1);
    assert.equal(mix[0].sousType, 'commun');
    assert.match(mix[0].texte, /mar\. 17 nov\./, 'le premier créneau commun encore à venir (le 2e), pas le passé');
  });
  test('B2 « aucun » après des créneaux communs passés : envoyé s’ils sont passés depuis 1 jour, jamais s’ils le sont depuis plus de 7 jours (vieux rendez-vous)', () => {
    const r = rdv({ creneaux: [parisEnISO(2026, 11, 13, 10), futur(3)] });
    const args = { rdv: r, participants: [rep('a', [1]), rep('b', [1])], lien: LIEN };
    assert.deepEqual(alertes(args).map((x) => x.sousType), ['aucun'], 'passé depuis 1 jour');
    const dixJours = L.smsDus({ ...args, parametres, messages: [], maintenant: parisEnISO(2026, 11, 23, 12) }).filter((d) => d.typeMessage === 'alerte');
    assert.equal(dixJours.length, 0, 'passé depuis plus de 7 jours');
    const cinqMois = L.smsDus({ ...args, rdv: rdv({ creneaux: [parisEnISO(2026, 6, 13, 10)] }), parametres, messages: [], maintenant }).filter((d) => d.typeMessage === 'alerte');
    assert.equal(cinqMois.length, 0, 'passé depuis 5 mois');
    const sansCommun = L.smsDus({ ...args, participants: [rep('a', [1]), rep('b', [2])], parametres, messages: [], maintenant }).filter((d) => d.typeMessage === 'alerte');
    assert.deepEqual(sansCommun.map((x) => x.sousType), ['aucun'], 'le vrai « aucun créneau commun » n’est pas concerné par la borne');
  });
  test('B2 la carte et le tableau disent « Aucun créneau commun à venir » quand tous les communs sont passés (jamais une date passée)', () => {
    const r = rdv({ creneaux: [parisEnISO(2026, 11, 13, 10), futur(3)] });
    const etat = (participants, rd = r) => L.ligneEtat({ rdv: rd, participants, parametres, messages: [], maintenant });
    assert.equal(etat([rep('a', [1]), rep('b', [1])]), 'Aucun créneau commun à venir');
    assert.match(etat([rep('a', [1, 2]), rep('b', [1, 2])]), /^Créneau commun : .*17 nov/, 'un créneau commun encore à venir est cité');
    assert.equal(etat([rep('a', [1]), rep('b', [2])]), 'Aucun créneau commun');
  });
  test('B2 si « commun » est déjà parti et que son créneau passe ensuite, « aucun » ne suit pas', () => {
    const args = { rdv: rdv(), participants: [rep('a', [1]), rep('b', [1])], lien: LIEN };
    const [premiere] = alertes(args);
    const envoye = { id: 'm1', echeance: premiere.idEcheance, etatEnvoi: 'envoye', sens: 'sortant', tour: 1 };
    const plusTard = L.smsDus({ ...args, parametres, messages: [envoye], maintenant: parisEnISO(2026, 11, 20, 12) }).filter((d) => d.typeMessage === 'alerte');
    assert.equal(plusTard.length, 0, 'le créneau est passé, mais la pro a déjà été prévenue');
  });
  test('B2 un modèle stocké qui écrit {lien} pour une alerte qui ne le prévoit pas part sans lien', () => {
    const p = { ...parametres, modeles: { 'alerte-incomprise': 'RDV {client} : {nom} {lien}' } };
    const [a] = alertes({ rdv: rdv(), participants: [{ ...rep('a', []), etatReponse: 'incomprise', reponse: 'bof', reponseLe: parisEnISO(2026, 11, 14, 11), idReponse: 'x1' }], lien: LIEN, parametres: p });
    assert.equal(a.texte, 'RDV M. Durand : a');
    assert.doesNotMatch(a.texte, /https|\{/);
  });
  test('B2 un modèle qui ne donne aucun texte (« {lien} » seul, sans adresse) n’envoie aucune alerte', () => {
    const p = { ...parametres, modeles: { 'alerte-commun': '{lien}' } };
    assert.equal(alertes({ rdv: rdv(), participants: [rep('a', [1]), rep('b', [1])], parametres: p }).length, 0, 'sans adresse : texte vide, rien ne part');
    assert.equal(alertes({ rdv: rdv(), participants: [rep('a', [1]), rep('b', [1])], parametres: p, lien: LIEN })[0].texte, LIEN, 'avec adresse : le texte est l’adresse');
  });
  test('B2 l’aperçu compte avec l’adresse réelle de l’espace : « commun » et « aucun » tiennent en 1 SMS chez Jérôme et chez un client (id jusqu’à 10 caractères), et le texte long en annonce 2', () => {
    for (const client of ['', 'demo', 'clientdemo']) {
      for (const a of L.apercuAlertes({}, { client }).filter((x) => x.aLien)) {
        assert.equal(a.segments, 1, `${a.sousType} / ${client || 'Jérôme'} : ${a.caracteres} caractères`);
        assert.ok(a.texte.includes(client ? `/#/espace/${client}/rdv/liste/` : '/#/rdv/liste/'));
      }
    }
    const long = L.apercuAlertes({}, { client: 'un-espace-client-tres-long' }).find((x) => x.sousType === 'commun');
    assert.equal(long.segments, 2);
    assert.equal(long.sansLien.segments, 1);
  });
  test('B2 la longueur du lien est comptée : l’alerte avec lien peut passer à 2 SMS, et le compteur le dit', () => {
    const long = { client: 'Mme Dupont-Martin & Fils (maison)', creneau: '2031-03-17T09:00:00Z', lien: `https://chevalier-ia-app.web.app/#/espace/mon-espace/rdv/liste/${'a'.repeat(20)}` };
    const avec = L.texteAlerte('commun', long);
    const sans = L.texteAlerte('commun', { ...long, lien: '' });
    assert.equal(avec.segments, 2);
    assert.equal(sans.segments, 1);
    assert.equal(avec.encodage, 'gsm7', 'l’adresse n’a aucun caractère hors liste');
  });
});

describe('B3 plus de « chantier » dans les textes de départ', () => {
  test('B3 les six modèles, les alertes, le repli et les SMS manuels ne contiennent plus le mot', () => {
    for (const [type, texte] of Object.entries(L.TOUS_MODELES_DEFAUT)) assert.doesNotMatch(texte, /chantier/i, type);
    for (const t of L.SOUS_TYPES_ALERTE) assert.doesNotMatch(L.texteAlerte(t, {}).texte, /chantier/i, t);
    const rdv = { client: 'M. Durand', creneauChoisi: '2031-03-17T09:00:00Z' };
    for (const type of ['annulation', 'pluie']) {
      assert.doesNotMatch(L.texteSmsManuel(type, rdv, { nomDansLesSms: 'Mme Martin' }), /chantier/i, type);
      assert.doesNotMatch(L.texteSmsManuel(type, { client: 'M. Durand' }, {}), /chantier/i, type);
    }
  });
  test('B3 un modèle déjà modifié et stocké ne change pas', () => {
    assert.equal(L.modeleDe('rappel', { modeles: { rappel: 'Demain chantier {client}' } }), 'Demain chantier {client}');
  });
});

describe('B4 prix du SMS configurable', () => {
  test('B4 prix et date de départ : 0,0685 € au 1er novembre 2026', () => {
    assert.equal(L.PARAMETRES_DEFAUT.prixSms, 0.0685);
    assert.equal(L.PARAMETRES_DEFAUT.tarifsAu, '1er novembre 2026');
    assert.equal(L.prixSmsDe({}), 0.0685);
    assert.equal(L.tarifsAuDe(undefined), '1er novembre 2026');
  });
  test('B4 coutSms = prix × SMS facturés (1 SMS = 1 prix ; 161 caractères = 2 ; Unicode compté par 70 puis 67 ; texte vide = 0)', () => {
    assert.equal(L.coutSms('a'.repeat(160), 0.0685), 0.0685);
    assert.equal(L.coutSms('a'.repeat(161), 0.0685), 0.137);
    assert.equal(L.coutSms('', 0.0685), 0);
    assert.equal(L.coutSms('你' + 'a'.repeat(70), 0.1), 0.2, 'caractère impossible à remplacer : Unicode, 71 unités = 2 SMS');
    assert.equal(L.coutSms('ê' + 'a'.repeat(70), 0.1), 0.1, 'ê est remplacé par e avant l’envoi : 1 SMS');
    assert.equal(L.coutSms('a'.repeat(307), 0.1), 0.3, '3 morceaux');
    assert.equal(L.coutSms('a'.repeat(400), 100), 300, 'un exemple de 100 € par SMS : 3 SMS = 300 €');
  });
  test('B4 un prix réglé sert ; un prix absurde (zéro, négatif, texte, trop grand) revient au prix de départ', () => {
    assert.equal(L.prixSmsDe({ prixSms: 0.08 }), 0.08);
    for (const mauvais of [0, -1, 'abc', null, 6, NaN]) assert.equal(L.prixSmsDe({ prixSms: mauvais }), 0.0685, String(mauvais));
    assert.equal(L.tarifsAuDe({ tarifsAu: '  1er janvier 2027 ' }), '1er janvier 2027');
  });
  test('B4 le libellé de l’aperçu est une estimation datée, jamais une facture', () => {
    const l = L.libelleCout('a'.repeat(161), { prixSms: 0.1, tarifsAu: '1er janvier 2027' });
    assert.equal(l, '≈ 0,20 € · estimation basée sur les tarifs ClickSend au 1er janvier 2027');
    assert.doesNotMatch(l, /facture/i);
    assert.equal(L.formaterEuros(0.0685), '0,0685 €');
    assert.equal(L.formaterEuros(0.137), '0,137 €');
  });
  test('B4 un prix absent des réglages n’empêche rien : les SMS dus ne changent pas', () => {
    assert.equal(L.libelleCout('abc', {}), '≈ 0,0685 € · estimation basée sur les tarifs ClickSend au 1er novembre 2026');
  });
});

describe('B1 contrôle d’un modèle avant enregistrement', () => {
  test('B1 vide, variable inconnue pour ce modèle, ou {lien} plus d’une fois : refusés avec un message clair', () => {
    assert.equal(L.validerModele('RDV {client} : {lien}', 'alerte-commun').ok, true);
    assert.equal(L.validerModele('   ', 'alerte-commun').ok, false);
    assert.match(L.validerModele('{nom}', 'alerte-commun').message, /Variable inconnue ici : \{nom\}.*\{client\}, \{creneau\}, \{lien\}/);
    assert.match(L.validerModele('{lien}', 'alerte-incomprise').message, /Variable inconnue ici : \{lien\}/);
    const deux = L.validerModele('{lien} et encore {lien}', 'alerte-aucun');
    assert.equal(deux.ok, false);
    assert.match(deux.message, /une seule fois/);
    assert.equal(L.validerModele('Rappel {client} {heure}', 'rappel').ok, true);
  });
});

describe('B4 lecture stricte du prix saisi', () => {
  test('B4 virgule ou point décimal, entre 0,001 et 5 ; tout autre format (0x1, 1e-7, négatif, texte, vide) est refusé', () => {
    assert.equal(L.lirePrixSms('0,0685'), 0.0685);
    assert.equal(L.lirePrixSms(' 0.1 '), 0.1);
    assert.equal(L.lirePrixSms('5'), 5);
    assert.equal(L.lirePrixSms('0,001'), 0.001);
    for (const mauvais of ['0x1', '1e-7', '1e0', '-1', '0', '0,0001', '5,01', '6', 'abc', '', ' ', '1,2,3', '0,1234567', 'Infinity', null, undefined]) assert.equal(L.lirePrixSms(mauvais), null, String(mauvais));
  });
  test('B4 un prix déjà stocké hors bornes (trop petit, trop grand) revient au prix de départ', () => {
    assert.equal(L.prixSmsDe({ prixSms: 0.0001 }), 0.0685);
    assert.equal(L.prixSmsDe({ prixSms: 0.001 }), 0.001);
    assert.equal(L.prixSmsDe({ prixSms: '0.1' }), 0.0685, 'un texte stocké n’est pas un prix');
  });
});

describe('C1 modifier le rendez-vous', () => {
  const FUT = (j) => iso(Date.now() + j * 86400000);
  const rdv = (extra = {}) => ({ id: 'r1', client: 'M. Durand', objet: 'Visite', adresse: '12 rue\n69000 Lyon', commune: 'Lyon', creneaux: [FUT(5), FUT(6)], etat: 'en_attente', archive: false, annule: false, tour: 1, envoiDemandeLe: null, ...extra });
  const part = (id, nom, tel, extra = {}) => ({ id, rendezVousId: 'r1', nom, role: 'Client', telephone: tel, etatReponse: 'attente', creneauxOk: [], ...extra });
  const deux = [part('p1', 'M. Durand', '+33600000001'), part('p2', 'Terrassier', '+33600000002')];
  const cibleDe = (r, parts, extra = {}) => ({ objet: r.objet, adresse: r.adresse, creneaux: r.creneaux, participants: parts.map((p) => ({ id: p.id, nom: p.nom, telephone: p.telephone, role: p.role })), ...extra });
  const maintenant = new Date();

  test('C1 avant le premier envoi : objet, adresse, numéro, rôle, ajout, retrait et créneaux se changent ; l\'état et le client sont recalculés', () => {
    const r = rdv();
    const cible = cibleDe(r, deux, { objet: ' Autre   objet ', adresse: '3 impasse\n38000 Grenoble', creneaux: [FUT(8)] });
    cible.participants = [{ ...cible.participants[0], telephone: '06 11 22 33 44', role: 'Architecte' }, { nom: 'Géomètre', telephone: '0699887766', role: 'Géomètre' }];
    const plan = L.planModifierRendezVous({ rdv: r, participants: deux, cible, maintenant });
    assert.equal(plan.erreur, undefined);
    assert.equal(plan.patchRdv.objet, 'Autre objet');
    assert.equal(plan.patchRdv.commune, 'Grenoble');
    assert.deepEqual(plan.retraits, ['p2']);
    assert.deepEqual(plan.ajouts.map((a) => [a.nom, a.telephone]), [['Géomètre', '+33699887766']]);
    assert.deepEqual(plan.majs, [{ id: 'p1', patch: { telephone: '+33611223344', role: 'Architecte' } }]);
    assert.equal(plan.remiseAZero, true);
    assert.equal(plan.patchRdv.creneaux.length, 1);
  });
  test('C1 les règles de la création s\'appliquent : 5 personnes au plus, doublon de numéro, numéro fixe, créneau passé, aucun participant', () => {
    const r = rdv();
    const essai = (participants, creneaux = r.creneaux) => L.planModifierRendezVous({ rdv: r, participants: deux, cible: { objet: '', adresse: '', creneaux, participants }, maintenant }).erreur;
    const six = Array.from({ length: 6 }, (_, i) => ({ nom: `P${i}`, telephone: `06000000${10 + i}` }));
    assert.match(essai(six), /5 personnes au plus/);
    assert.match(essai([{ nom: 'A', telephone: '0600000001' }, { nom: 'B', telephone: '+33600000001' }]), /déjà celui d’un autre/);
    assert.ok(essai([{ nom: 'A', telephone: '0100000000' }]));
    assert.match(essai([{ nom: 'A', telephone: '0600000001' }], [iso(Date.now() - 86400000)]), /futur/);
    assert.match(essai([]), /au moins un participant/);
    assert.match(essai([{ nom: '', telephone: '0600000009' }]), /nom/);
  });
  test('C1 après le premier envoi : objet et adresse seulement ; participants et créneaux refusés, la phrase renvoie vers « Proposer d\'autres créneaux »', () => {
    const r = rdv({ envoiDemandeLe: iso(Date.now() - 3600000) });
    const ok = L.planModifierRendezVous({ rdv: r, participants: deux, cible: { objet: 'Nouveau', adresse: 'Ailleurs' }, maintenant });
    assert.equal(ok.erreur, undefined);
    assert.deepEqual([ok.patchRdv.objet, ok.ajouts.length, ok.retraits.length, ok.majs.length], ['Nouveau', 0, 0, 0]);
    const creneaux = L.planModifierRendezVous({ rdv: r, participants: deux, cible: cibleDe(r, deux, { creneaux: [FUT(9)] }), maintenant });
    assert.match(creneaux.erreur, /Proposer d’autres créneaux/);
    const retrait = L.planModifierRendezVous({ rdv: r, participants: deux, cible: cibleDe(r, [deux[0]]), maintenant });
    assert.match(retrait.erreur, /plus les participants/);
    const numero = L.planModifierRendezVous({ rdv: r, participants: deux, cible: cibleDe(r, [{ ...deux[0], telephone: '+33699999999' }, deux[1]]), maintenant });
    assert.match(numero.erreur, /plus les participants/);
    const memes = L.planModifierRendezVous({ rdv: r, participants: deux, cible: cibleDe(r, deux), maintenant });
    assert.equal(memes.erreur, undefined, 'les mêmes participants et créneaux (écrits autrement) ne sont pas un changement');
  });
  test('C1 un participant qui a un SMS dans l\'historique ne se retire pas et ne change pas de numéro ; un participant sans SMS reste libre, même à la deuxième série', () => {
    const r = rdv();
    const messages = [{ id: 'm1', participantId: 'p2' }];
    const retrait = L.planModifierRendezVous({ rdv: r, participants: deux, messages, cible: cibleDe(r, [deux[0]]), maintenant });
    assert.match(retrait.erreur, /déjà reçu des SMS/);
    const numero = L.planModifierRendezVous({ rdv: r, participants: deux, messages, cible: cibleDe(r, [deux[0], { ...deux[1], telephone: '+33699999999' }]), maintenant });
    assert.match(numero.erreur, /déjà reçu des SMS/);
    assert.equal(L.planModifierRendezVous({ rdv: r, participants: deux, messages, cible: cibleDe(r, [{ ...deux[0], telephone: '+33699999999' }, deux[1]]), maintenant }).erreur, undefined, 'p1 n\'a reçu aucun SMS : son numéro peut changer');
    const tour2 = rdv({ tour: 2 });
    assert.equal(L.planModifierRendezVous({ rdv: tour2, participants: deux, cible: cibleDe(tour2, [deux[0]]), maintenant }).erreur, undefined, 'série 2, aucun SMS pour p2 : il peut être retiré');
    assert.match(L.planModifierRendezVous({ rdv: tour2, participants: deux, messages, cible: cibleDe(tour2, [deux[0]]), maintenant }).erreur, /déjà reçu des SMS/);
  });
  test('C1 seuls l\'objet ou l\'adresse changent : aucune autre validation (un créneau passé ne bloque pas la correction d\'une adresse)', () => {
    const r = rdv({ creneaux: [iso(Date.now() - 86400000)] });
    const plan = L.planModifierRendezVous({ rdv: r, participants: deux, cible: cibleDe(r, deux, { adresse: '5 rue Neuve\n69000 Lyon' }), maintenant });
    assert.equal(plan.erreur, undefined);
    assert.equal(plan.patchRdv.adresse, '5 rue Neuve\n69000 Lyon');
    assert.deepEqual([plan.ajouts.length, plan.retraits.length, plan.majs.length, plan.remiseAZero], [0, 0, 0, false]);
  });
  test('C1 un participant sans numéro enregistré (valeur vide) ne bloque pas la correction de l\'objet ou de l\'adresse', () => {
    const r = rdv();
    const sansNumero = [part('p1', 'M. Durand', ''), deux[1]];
    const plan = L.planModifierRendezVous({ rdv: r, participants: sansNumero, cible: cibleDe(r, sansNumero, { objet: 'Autre objet' }), maintenant });
    assert.equal(plan.erreur, undefined);
    assert.equal(plan.patchRdv.objet, 'Autre objet');
  });
  test('C1 les réponses déjà saisies repartent à zéro seulement si un créneau EXISTANT change ou disparaît ; en ajouter un les garde', () => {
    const r = rdv();
    const repondu = [part('p1', 'A', '+33600000001', { etatReponse: 'comprise', creneauxOk: [1] }), part('p2', 'B', '+33600000002')];
    const ajout = L.planModifierRendezVous({ rdv: r, participants: repondu, cible: cibleDe(r, repondu, { creneaux: [...r.creneaux, FUT(9)] }), maintenant });
    assert.equal(ajout.erreur, undefined);
    assert.equal(ajout.remiseAZero, false);
    for (const creneaux of [[r.creneaux[0], FUT(11)], [r.creneaux[0]], [r.creneaux[1], r.creneaux[0]]]) {
      const plan = L.planModifierRendezVous({ rdv: r, participants: repondu, cible: cibleDe(r, repondu, { creneaux }), maintenant });
      assert.equal(plan.remiseAZero, true, JSON.stringify(creneaux));
    }
  });
  test('C1 un rendez-vous annulé, archivé ou confirmé ne se modifie pas', () => {
    for (const extra of [{ annule: true }, { archive: true }, { etat: 'confirme', creneauChoisi: FUT(5) }]) {
      const r = rdv(extra);
      assert.match(L.planModifierRendezVous({ rdv: r, participants: deux, cible: cibleDe(r, deux), maintenant }).erreur, /plus ouvert/, JSON.stringify(extra));
    }
  });
  test('C1 retirer le seul participant sans réponse d\'un rendez-vous où tout le monde a répondu recalcule l\'état dans le même plan', () => {
    const r = rdv();
    const parts = [part('p1', 'A', '+33600000001', { etatReponse: 'comprise', creneauxOk: [1] }), part('p2', 'B', '+33600000002')];
    const plan = L.planModifierRendezVous({ rdv: r, participants: parts, cible: cibleDe(r, [parts[0]]), maintenant });
    assert.deepEqual(plan.retraits, ['p2']);
    assert.equal(plan.patchRdv.etat, 'a_valider');
    const ajout = L.planModifierRendezVous({ rdv: { ...r, etat: 'a_valider' }, participants: [parts[0]], cible: { ...cibleDe(r, [parts[0]]), participants: [{ id: 'p1', nom: 'A', telephone: '+33600000001', role: 'Client' }, { nom: 'C', telephone: '0600000003' }] }, maintenant });
    assert.equal(ajout.patchRdv.etat, 'en_attente', 'un nouveau participant n\'a pas répondu');
  });
});

describe('C2 SMS à renvoyer', () => {
  const rdv = { id: 'r1', tour: 2, creneaux: [new Date(Date.now() + 5 * 86400000).toISOString()] };
  const p = { id: 'p1' };
  const m = (extra = {}) => ({ id: 'm1', participantId: 'p1', sens: 'sortant', etatEnvoi: 'abandonne', typeMessage: 'creneaux', tour: 2, envoyeLe: '2026-11-16T10:00:00Z', ...extra });
  test('C2 un SMS abandonné de la série courante se renvoie ; le plus récent est repris', () => {
    assert.equal(L.smsARenvoyer(rdv, p, [m(), m({ id: 'm2', envoyeLe: '2026-11-16T11:00:00Z' })]).id, 'm2');
  });
  test('C2 jamais : SMS envoyé, en échec ou réservé (réessayés seuls), ancienne série, alerte, déjà renvoyé, entrant, autre participant', () => {
    for (const extra of [{ etatEnvoi: 'envoye' }, { etatEnvoi: 'echec' }, { etatEnvoi: 'reserve' }, { tour: 1 }, { typeMessage: 'alerte' }, { renvoyeLe: '2026-11-16T12:00:00Z' }, { sens: 'entrant' }, { participantId: 'p9' }]) {
      assert.equal(L.smsARenvoyer(rdv, p, [m(extra)]), null, JSON.stringify(extra));
    }
  });
  test('C2 présentation, créneaux et relance : seulement si le rendez-vous est ouvert avec un créneau à venir ; l\'annulation reste renvoyable même annulée', () => {
    const futur = { ...rdv, creneaux: [iso(Date.now() + 86400000)] };
    for (const type of ['confiance', 'creneaux', 'relance']) {
      assert.equal(L.smsARenvoyer(futur, p, [m({ typeMessage: type })])?.id, 'm1', type);
      assert.equal(L.smsARenvoyer({ ...futur, etat: 'confirme', creneauChoisi: futur.creneaux[0] }, p, [m({ typeMessage: type })]), null, `${type} confirmé`);
      assert.equal(L.smsARenvoyer({ ...rdv, creneaux: [iso(Date.now() - 86400000)] }, p, [m({ typeMessage: type })]), null, `${type} créneaux passés`);
    }
    assert.equal(L.smsARenvoyer({ ...futur, annule: true, archive: true }, p, [m({ typeMessage: 'annulation' })])?.id, 'm1');
    assert.equal(L.smsARenvoyer({ ...futur, archive: true }, p, [m({ typeMessage: 'pluie' })]), null);
    assert.equal(L.smsARenvoyer({ ...futur, etat: 'confirme', creneauChoisi: futur.creneaux[0] }, p, [m({ typeMessage: 'confirmation' })])?.id, 'm1', 'une confirmation se renvoie sur un rendez-vous confirmé');
  });
  test('C2 les types sans sens sont écartés AVANT de prendre le plus récent : l\'annulation abandonnée reste renvoyable sur un rendez-vous annulé', () => {
    const annule = { ...rdv, annule: true, archive: true };
    const messages = [m({ id: 'a', typeMessage: 'annulation', envoyeLe: '2026-11-16T10:00:00Z' }), m({ id: 'b', typeMessage: 'creneaux', envoyeLe: '2026-11-16T11:00:00Z' })];
    assert.equal(L.smsARenvoyer(annule, p, messages)?.id, 'a');
  });
  test('C2 un numéro de la liste des désinscrits (STOP) : pas de bouton', () => {
    assert.equal(L.smsARenvoyer(rdv, { id: 'p1', telephone: '+33600000001' }, [m()], { desinscrits: ['+33600000001'] }), null);
    assert.equal(L.smsARenvoyer(rdv, { id: 'p1', telephone: '+33600000001' }, [m()], { desinscrits: ['+33600000009'] })?.id, 'm1');
  });
  test('C2 jamais pour un participant désinscrit ni sur un rendez-vous annulé ou archivé', () => {
    assert.equal(L.smsARenvoyer(rdv, { id: 'p1', desinscrit: true }, [m()]), null);
    assert.equal(L.smsARenvoyer({ ...rdv, annule: true }, p, [m()]), null);
    assert.equal(L.smsARenvoyer({ ...rdv, archive: true }, p, [m()]), null);
    assert.equal(L.smsARenvoyer({ ...rdv, archive: true }, p, [m({ typeMessage: 'annulation', participantId: 'p1' })])?.id, 'm1', 'seul le SMS d\'annulation reste renvoyable');
  });
});

describe('D1 désinscrit (STOP) : visible, et ne bloque personne', () => {
  const rdv = { id: 'r1', client: 'M. Durand', creneaux: [parisEnISO(2026, 11, 17, 10), parisEnISO(2026, 11, 18, 14), parisEnISO(2026, 11, 19, 9)], tour: 1, envoiDemandeLe: parisEnISO(2026, 11, 14, 9) };
  const pers = (id, extra = {}) => ({ id, nom: `Participant ${id}`, telephone: `+3360000000${id}`, etatReponse: 'attente', creneauxOk: [], ...extra });
  const params = { nomDansLesSms: 'Mme Martin', numerosAlerte: [{ id: 'n1', libelle: 'Mobile', numero: '+33700000001', actif: true }], numeroAffiche: 'n1', relances: { nombre: 2, delaiHeures: 24 } };
  const stop = (id, extra = {}) => pers(id, { etatReponse: 'incomprise', reponse: 'STOP', desinscrit: true, ...extra });
  const bon = (id, ok) => pers(id, { etatReponse: 'comprise', creneauxOk: ok });

  test('D1-1 « Désinscrit (STOP) » prime dans les 4 états de réponse ; un participant sans repère ne change pas', () => {
    for (const etatReponse of ['attente', 'comprise', 'saisie', 'incomprise']) {
      assert.equal(L.symboleCellule(pers('1', { desinscrit: true, etatReponse, creneauxOk: [1] }), 0), 'desinscrit', etatReponse);
    }
    assert.equal(L.symboleCellule(pers('1', { etatReponse: 'incomprise' }), 0), 'incompris');
    assert.equal(L.symboleCellule(pers('1', { desinscrit: false, etatReponse: 'comprise', creneauxOk: [1] }), 0), 'oui');
  });
  test('D1-1 la phrase d’état dit « désinscrit (STOP) », jamais « réponse non comprise » ; le bilan ne compte plus un STOP comme réponse incomprise', () => {
    const participants = [stop('1'), pers('2')];
    const b = L.bilanReponses(participants, 3);
    assert.deepEqual([b.incomprises, b.desinscrits, b.reponses, b.total], [0, 1, 0, 2]);
    const phrase = L.ligneEtat({ rdv, participants, parametres: params, messages: [], maintenant: parisEnISO(2026, 11, 15, 10) });
    assert.match(phrase, /^1 désinscrit \(STOP\) · 0 réponse sur 2/);
    assert.doesNotMatch(phrase, /non compris/);
    assert.match(L.ligneEtat({ rdv, participants: [stop('1'), stop('2')], parametres: params, messages: [], maintenant: parisEnISO(2026, 11, 15, 10) }), /^2 désinscrits \(STOP\)/);
    // une vraie réponse non comprise d'un autre participant reste signalée
    assert.equal(L.ligneEtat({ rdv, participants: [stop('1'), pers('2', { etatReponse: 'incomprise' })], parametres: params, messages: [], maintenant: parisEnISO(2026, 11, 15, 10) }), 'Une réponse non comprise');
  });
  test('D1-2 règle : `complet` = tous les NON-désinscrits ont répondu ; `communs` calculés sur eux ; `total` inchangé ; un désinscrit n’est jamais « OK »', () => {
    const participants = [bon('1', [1, 2]), bon('2', [1]), stop('3', { etatReponse: 'comprise', creneauxOk: [1, 2, 3] })];
    const b = L.bilanReponses(participants, 3);
    assert.equal(b.total, 3);
    assert.equal(b.complet, true);
    assert.deepEqual(b.communs, [1], 'le « 1 » reçu après STOP ne compte pas');
    assert.deepEqual(b.parCreneau, [2, 1, 0]);
    assert.equal(b.reponses, 2);
    assert.equal(L.etatCalcule(rdv, participants), 'a_valider');
    assert.equal(L.bandeauCreneau(b, { creneaux: rdv.creneaux, maintenant: parisEnISO(2026, 11, 15, 10) }).type, 'commun');
    // un désinscrit qui n'a jamais répondu ne bloque pas non plus
    assert.equal(L.bilanReponses([bon('1', [2]), stop('2')], 3).complet, true);
    // tout le monde désinscrit : rien à confirmer, jamais « complet »
    const tous = L.bilanReponses([stop('1'), stop('2')], 3);
    assert.deepEqual([tous.complet, tous.communs, tous.total], [false, [], 2]);
    // sans désinscrit, rien ne change
    assert.equal(L.bilanReponses([bon('1', [1]), pers('2')], 3).complet, false);
  });
  test('D1-2 les alertes « commun » partent quand tous les non-désinscrits ont répondu, avec le créneau des seuls non-désinscrits', () => {
    const participants = [bon('1', [2]), bon('2', [2, 3]), stop('3')].map((x) => ({ ...x, reponseLe: '2026-11-15T08:00:00Z' }));
    const dus = L.smsDus({ rdv, participants, parametres: params, messages: [], maintenant: parisEnISO(2026, 11, 15, 10), lien: 'https://exemple.test/#/rdv/liste/r1' });
    const commun = dus.filter((d) => d.typeMessage === 'alerte' && d.sousType === 'commun');
    assert.equal(commun.length, 1);
    assert.ok(!dus.some((d) => d.sousType === 'aucun'));
    assert.ok(dus.some((d) => d.sousType === 'desinscription'), 'l’alerte STOP existante est inchangée');
  });
  test('D1-2 la prévision de confirmation ne change pas : un STOP de la liste ou le repère seul', () => {
    const participants = [bon('1', [1]), stop('2')];
    const p = L.previsionConfirmation({ rdv, participants, parametres: params, numero: 1, maintenant: parisEnISO(2026, 11, 15, 10), desinscrits: ['+33600000002'] });
    assert.deepEqual(p.personnes.map((x) => x.statut), ['recoit', 'desinscrit']);
  });

  // Après « Proposer d'autres créneaux » : etatReponse repasse à 'attente', desinscrit reste vrai.
  const envoisDe = (participants, jusqua = 1) => participants.flatMap((x) => [
    { sens: 'sortant', echeance: L.idEcheance('r1', 1, 'confiance', x.id), envoyeLe: rdv.envoiDemandeLe },
    { sens: 'sortant', echeance: L.idEcheance('r1', 1, 'creneaux', x.id), envoyeLe: parisEnISO(2026, 11, 14, 9, 1) },
  ]).concat(participants.filter((x) => x.desinscrit !== true).flatMap((x) => Array.from({ length: jusqua }, (_, k) => ({ sens: 'sortant', echeance: L.idEcheance('r1', 1, `relance${k + 1}`, x.id), envoyeLe: parisEnISO(2026, 11, 15 + k, 9, 30) }))));
  test('D1-3 un désinscrit en « attente » (après de nouveaux créneaux) ne bloque ni les relances suivantes ni l’alerte de fin', () => {
    const participants = [pers('1', { desinscrit: true }), pers('2')];
    const messages = envoisDe(participants, 1);
    const dus = L.smsDus({ rdv, participants, parametres: params, messages, maintenant: parisEnISO(2026, 11, 16, 12), desinscrits: ['+33600000001'] });
    assert.deepEqual(dus.filter((d) => d.typeMessage === 'relance').map((d) => [d.participantId, d.idEcheance.split(':')[2]]), [['2', 'relance2']]);
    const fin = L.smsDus({ rdv: { ...rdv, creneaux: [parisEnISO(2026, 11, 30, 10)] }, participants, parametres: params, messages: envoisDe(participants, 2), maintenant: parisEnISO(2026, 11, 18, 12), desinscrits: ['+33600000001'] });
    assert.equal(fin.filter((d) => d.sousType === 'fin-relances').length, 1, 'l’alerte « relances terminées » part');
    assert.equal(L.prochaineRelance({ rdv, participants, parametres: params, messages: envoisDe(participants, 2), desinscrits: [] }), null);
  });
  test('D1-3 un STOP reçu pour un autre rendez-vous (numéro dans la liste, aucun repère ici) ne bloque pas non plus', () => {
    const participants = [pers('1'), pers('2')];
    const messages = envoisDe(participants.slice(1), 1).concat(envoisDe(participants.slice(0, 1), 0).filter((m) => !/relance/.test(m.echeance)));
    const sans = L.smsDus({ rdv, participants, parametres: params, messages, maintenant: parisEnISO(2026, 11, 16, 12), desinscrits: [] });
    assert.equal(sans.filter((d) => d.typeMessage === 'relance').length, 1, 'sans liste : la relance 1 de la personne 1 est encore due (elle n’a pas été relancée)');
    const avec = L.smsDus({ rdv, participants, parametres: params, messages, maintenant: parisEnISO(2026, 11, 16, 12), desinscrits: ['+33600000001'] });
    assert.deepEqual(avec.filter((d) => d.typeMessage === 'relance').map((d) => [d.participantId, d.idEcheance.split(':')[2]]), [['2', 'relance2']], 'le calendrier de la personne 2 avance');
    assert.ok(L.prochaineRelance({ rdv, participants, parametres: params, messages, desinscrits: ['+33600000001'] }));
  });
  test('D1-2 un désinscrit dont la professionnelle a SAISI la réponse compte comme les autres ; il reste affiché « Désinscrit (STOP) »', () => {
    const participants = [bon('1', [1, 2]), stop('2', { etatReponse: 'saisie', creneauxOk: [2] })];
    const b = L.bilanReponses(participants, 3);
    assert.deepEqual([b.complet, b.communs, b.desinscrits, b.reponses, b.total], [true, [2], 1, 2, 2]);
    assert.equal(L.symboleCellule(participants[1], 1), 'desinscrit');
    assert.equal(L.bilanReponses([bon('1', [1, 2]), stop('2', { etatReponse: 'comprise', creneauxOk: [2] })], 3).reponses, 1, 'la réponse par SMS après STOP reste ignorée');
  });
  test('D1-1 la mention « désinscrit (STOP) » est aussi sur la phrase d’un rendez-vous complet', () => {
    const phrase = L.ligneEtat({ rdv, participants: [bon('1', [1, 2]), bon('2', [1, 2]), stop('3')], parametres: params, messages: [], maintenant: parisEnISO(2026, 11, 15, 10) });
    assert.equal(phrase, '2 créneaux communs · 1 désinscrit (STOP)');
  });
  test('D1-5 borne d’âge : « aucun créneau commun » ne repart pas pour un rendez-vous dont tous les créneaux sont passés depuis plus de 7 jours', () => {
    const ancien = { ...rdv, creneaux: [parisEnISO(2026, 9, 15, 10), parisEnISO(2026, 9, 16, 14), parisEnISO(2026, 9, 17, 9)], envoiDemandeLe: parisEnISO(2026, 9, 1, 9) };
    const participants = [bon('1', [1]), bon('2', [2]), stop('3')].map((x) => ({ ...x, reponseLe: '2026-09-02T08:00:00Z' }));
    const dus = L.smsDus({ rdv: ancien, participants, parametres: params, messages: [], maintenant: parisEnISO(2026, 11, 15, 10) });
    assert.deepEqual(dus.filter((d) => d.typeMessage === 'alerte' && (d.sousType === 'aucun' || d.sousType === 'commun')), []);
    const recent = { ...ancien, creneaux: [parisEnISO(2026, 11, 13, 10), parisEnISO(2026, 11, 14, 14), parisEnISO(2026, 11, 14, 9)] };
    const dus2 = L.smsDus({ rdv: recent, participants, parametres: params, messages: [], maintenant: parisEnISO(2026, 11, 15, 10) });
    assert.equal(dus2.filter((d) => d.sousType === 'aucun').length, 1, 'un rendez-vous récent est toujours alerté');
  });
  test('D1-4 un désinscrit dont la réponse a été SAISIE : aucun SMS de lui ne l\'efface (« 1 », nouveau STOP), trace seulement', () => {
    const saisi = stop('2', { etatReponse: 'saisie', creneauxOk: [2], reponse: 'STOP' });
    for (const texte of ['1', 'STOP', 'plutôt jeudi']) {
      const r = L.appliquerReponse({ participant: saisi, rdv, texte, recuLe: '2026-11-15T10:00:00Z', idReponse: 'm5' });
      assert.deepEqual([r.historiqueSeulement, r.patch, r.alerteIncomprise], [true, null, false], texte);
    }
    // le patch STOP d'un participant non saisi reste inchangé
    assert.equal(L.appliquerReponse({ participant: pers('3'), rdv, texte: 'STOP' }).patch.desinscrit, true);
  });
  test('D1-4 verrous : aucune réponse ultérieure ne remet « désinscrit » à faux', () => {
    const avant = stop('1');
    const apres = (texte, extra = {}) => ({ ...avant, ...(L.appliquerReponse({ participant: avant, rdv, texte, recuLe: '2026-11-15T10:00:00Z', idReponse: 'm2', ...extra }).patch || {}) });
    for (const texte of ['1', '1 et 2', 'aucun', 'plutôt jeudi']) {
      const p = apres(texte);
      assert.equal(p.desinscrit, true, texte);
      assert.equal(L.symboleCellule(p, 0), 'desinscrit', texte);
      assert.equal(L.bilanReponses([p, bon('2', [1])], 3).reponses, 1, `${texte} : jamais « OK »`);
    }
    assert.equal(apres('oui').etatReponse, 'incomprise', '« oui » n’est pas compris');
    assert.equal(apres('1').etatReponse, 'comprise');
  });
});

describe('D1 icônes de l’écran', () => {
  test('D1-1 chaque icône des symboles de la fiche existe dans ICONES (une icône absente rend un svg vide sans erreur)', async () => {
    const { readFileSync } = await import('node:fs');
    const fiche = readFileSync(new URL('../js/modules/rdv/fiche.js', import.meta.url), 'utf8');
    const ui = readFileSync(new URL('../js/os/ui.js', import.meta.url), 'utf8');
    const noms = [...fiche.slice(fiche.indexOf('const SYMBOLES'), fiche.indexOf('};', fiche.indexOf('const SYMBOLES'))).matchAll(/icone: '([a-z-]+)'/g)].map((m) => m[1]);
    assert.ok(noms.includes('circle-x') && noms.length === 5, noms.join());
    for (const n of noms) assert.ok(new RegExp(`["']${n}["']\\s*:`).test(ui), `${n} absent de ICONES`);
  });
});

describe('E2 alerte « solde ClickSend bas » : modèle, variables, seuils', () => {
  test('E2-a modèle de départ : seulement {solde}, {seuil} et {lien} (aucun lien écrit en dur, aucune variable {client}), sans le mot « chantier », sans STOP', () => {
    const m = L.MODELES_ALERTE_DEFAUT['alerte-solde-bas'];
    assert.deepEqual(L.VARIABLES_ALERTE['alerte-solde-bas'], ['solde', 'seuil', 'lien']);
    assert.deepEqual([...m.matchAll(/\{([a-z]+)\}/g)].map((x) => x[1]).sort(), ['lien', 'seuil', 'solde']);
    assert.doesNotMatch(m, /https?:|clicksend\.com|chantier|STOP|\{client\}/i);
    assert.equal(L.TOUS_MODELES_DEFAUT['alerte-solde-bas'], m);
    assert.equal(L.LIBELLES_ALERTES['alerte-solde-bas'], 'Alerte : solde ClickSend bas');
    assert.equal(L.libelleModele('alerte-solde-bas'), 'Alerte : solde ClickSend bas');
  });
  test('E2-b le texte : solde et seuil en euros à la française, lien donné par l’appelant ; sans lien la ligne disparaît ; une variable de rendez-vous est refusée à l’enregistrement', () => {
    const lien = 'https://exemple.test/recharge';
    assert.equal(L.texteAlerte('solde-bas', { solde: 4.998, seuil: 5, lien }).texte, `ClickSend : solde bas, 5,00 EUR (seuil 5 EUR).\n${lien}`);
    assert.equal(L.texteAlerte('solde-bas', { solde: 0, seuil: 2.5 }).texte, 'ClickSend : solde bas, 0,00 EUR (seuil 2,5 EUR).');
    assert.equal(L.texteAlerte('solde-bas', { solde: -1.2, seuil: 2, lien }).texte.split('\n')[0], 'ClickSend : solde bas, -1,20 EUR (seuil 2 EUR).');
    assert.deepEqual(L.variablesInconnues('{solde} {seuil} {lien}', 'alerte-solde-bas'), []);
    assert.deepEqual(L.variablesInconnues('{client} {creneau}', 'alerte-solde-bas'), ['client', 'creneau']);
    assert.equal(L.validerModele('Solde {solde} {lien} {lien}', 'alerte-solde-bas').ok, false, '{lien} une seule fois');
    assert.equal(L.validerModele('Solde {solde}', 'alerte-solde-bas').ok, true);
  });
  test('E2-c aperçu : la page de recharge donnée par l’écran est celle qui compte ; sans elle, on compte avec l’adresse d’un rendez-vous ; l’exemple tient en un SMS', () => {
    const RECHARGE = 'https://exemple.test/recharge';
    const a = L.apercuAlertes({}, { lienRecharge: RECHARGE }).find((x) => x.sousType === 'solde-bas');
    assert.ok(a.texte.endsWith(RECHARGE)); assert.equal(a.aLien, true); assert.equal(a.segments, 1);
    assert.ok(a.sansLien.caracteres < a.caracteres);
    const b = L.apercuAlertes({}).find((x) => x.sousType === 'solde-bas');
    assert.ok(b.texte.includes('/#/rdv/liste/'), 'repli : l’adresse d’exemple d’un rendez-vous');
    for (const x of L.apercuAlertes({}, { lienRecharge: RECHARGE }).filter((y) => y.sousType !== 'solde-bas' && y.aLien)) assert.ok(!x.texte.includes(RECHARGE), `${x.sousType} garde l’adresse du rendez-vous`);
  });
  test('E2-d seuils : trois, décroissants, de 0 à 1 000 € ; départ 10, 5 et 2 ; tout réglage faux retombe sur le départ', () => {
    assert.deepEqual(L.SEUILS_SOLDE_DEFAUT, [10, 5, 2]);
    assert.deepEqual(L.PARAMETRES_DEFAUT.seuilsSolde, [10, 5, 2]);
    assert.deepEqual(L.seuilsSoldeDe({}), [10, 5, 2]);
    assert.deepEqual(L.seuilsSoldeDe({ seuilsSolde: [100, 50, 0] }), [100, 50, 0]);
    assert.deepEqual(L.seuilsSoldeDe({ seuilsSolde: [1000, 999.5, 0.25] }), [1000, 999.5, 0.25]);
    for (const faux of [[5, 5, 2], [2, 5, 10], [10, 5], [10, 5, 2, 1], [1001, 5, 2], [10, 5, -1], ['10', 5, 2], [10, NaN, 2], 'x', null]) assert.deepEqual(L.seuilsSoldeDe({ seuilsSolde: faux }), [10, 5, 2], JSON.stringify(faux));
    assert.equal(L.validerSeuilsSolde([10, 5, 2]).ok, true);
    assert.equal(L.validerSeuilsSolde([5, 5, 2]).ok, false);
    assert.match(L.validerSeuilsSolde([2, 5, 10]).message, /diminuer/);
  });
  test('E2-e saisie d’un seuil : comme le prix d’un SMS, chiffres et une virgule ou un point (2 décimales), de 0 à 1 000', () => {
    for (const [saisie, n] of [['10', 10], [' 2,5 ', 2.5], ['0', 0], ['1000', 1000], ['0.25', 0.25]]) assert.equal(L.lireSeuilSolde(saisie), n, saisie);
    for (const faux of ['', 'abc', '-1', '1001', '1e2', '0x10', '2,555', '1 000', '10 €', '.5', null, undefined]) assert.equal(L.lireSeuilSolde(faux), null, String(faux));
  });
  test('E2-f le texte du lien ne vit pas dans logique.js (copié côté serveur) : aucune adresse de ClickSend', () => {
    assert.equal(/clicksend\.com|https?:\/\/dashboard/i.test(JSON.stringify(L.MODELES_ALERTE_DEFAUT)), false);
  });
});

describe('D2 STOP : traces « bloque » et phrases', () => {
  test('D2-3a une trace « bloque » ne compte pas comme « a déjà reçu un SMS » ; un vrai SMS, si', () => {
    const p = { id: 'p1' };
    const bloque = { id: 'stop_x', participantId: 'p1', sens: 'sortant', etatEnvoi: 'bloque' };
    assert.equal(L.participantContacte(p, [bloque]), false);
    assert.equal(L.participantContacte(p, [bloque, { id: 'm', participantId: 'p1', etatEnvoi: 'envoye' }]), true);
  });
  test('D2-3a l’historique retrouve le nom d’une trace « bloque » par le participant (elle n’a pas de numéro)', () => {
    const parts = [{ id: 'p1', nom: 'Mme Dupont', telephone: '+33600000001' }];
    const h = L.historiqueMessages([{ id: 'stop_x', participantId: 'p1', etatEnvoi: 'bloque', creeLe: '2026-11-16T10:00:00Z' }, { id: 'in', numero: '+33600000001', sens: 'entrant', recuLe: '2026-11-16T09:00:00Z' }], parts);
    assert.deepEqual(h.map((m) => [m.id, m.qui]), [['in', 'Mme Dupont'], ['stop_x', 'Mme Dupont']]);
    assert.equal(L.TEXTE_SMS_BLOQUE, 'SMS non envoyé : numéro désinscrit (STOP)');
  });
  test('D2-3c phrases : « 1 personne désinscrite (STOP) n’a rien reçu », pluriel, rien si zéro ; comptage par repère OU par liste', () => {
    assert.equal(L.phraseDesinscritsSansSms(0), '');
    assert.equal(L.phraseDesinscritsSansSms(1), '1 personne désinscrite (STOP) n’a rien reçu');
    assert.equal(L.phraseDesinscritsSansSms(2), '2 personnes désinscrites (STOP) n’ont rien reçu');
    const parts = [{ id: 'a', telephone: '+33600000001', desinscrit: true }, { id: 'b', telephone: '+33600000002' }, { id: 'c', telephone: '+33600000003' }];
    assert.equal(L.nombreDesinscrits(parts, ['+33600000002']), 2);
    assert.equal(L.nombreDesinscrits(parts, []), 1);
    assert.equal(L.phrasePropositionsEnvoyees(0), 'Propositions envoyées');
    assert.equal(L.phrasePropositionsEnvoyees(1, 3), 'Propositions envoyées. 1 personne désinscrite (STOP) n’a rien reçu.');
    assert.equal(L.phrasePropositionsEnvoyees(2, 2), 'Aucune proposition n’est partie : tous les participants sont désinscrits (STOP).');
  });
  test('D2-3b phrase après un SMS à la main : partiel, tous bloqués (annulation faite quand même), aucun bloqué', () => {
    assert.equal(L.phraseApresSmsManuel({ nombre: 2, nombreBloques: 0, declenche: true }, 'pluie'), 'SMS en cours d’envoi');
    assert.equal(L.phraseApresSmsManuel({ nombre: 2, nombreBloques: 0, declenche: false }, 'pluie'), 'SMS enregistré : il partira dans quelques minutes');
    assert.equal(L.phraseApresSmsManuel({ nombre: 1, nombreBloques: 1, declenche: true }, 'pluie'), 'SMS en cours d’envoi. 1 personne désinscrite (STOP) n’a rien reçu.');
    assert.match(L.phraseApresSmsManuel({ nombre: 0, nombreBloques: 2, declenche: false }, 'annulation'), /^Rendez-vous annulé\. Aucun SMS n’est parti : tous les participants sont désinscrits \(STOP\)\.$/);
    assert.match(L.phraseApresSmsManuel({ nombre: 0, nombreBloques: 1, declenche: false }, 'pluie'), /^Aucun SMS n’est parti/);
  });
});
