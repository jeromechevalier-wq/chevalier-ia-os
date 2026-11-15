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
    assert.match(sms.texte, /^Mme Martin : chantier M\. Durand/);
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
    assert.equal(dus[0].texte, 'RDV confirmé : chantier M. Durand, mar. 17 nov. à 10h.\nMerci, Mme Martin\nChevalier IA - Répondez STOP pour vous désabonner.');
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
    assert.match(alertes[0].texte, /un créneau convient à tous \(mer\. 18 nov\. 14h\)/);
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
    assert.deepEqual(L.creneauxAConfirmer(tous, { creneaux, maintenant }), [2, 3], 'le 1 est passé ; 2 et 3 conviennent à tous, dans l’ordre des numéros : aucun choix d’office');
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
  test('A3 plusieurs créneaux conviennent à tous : le bandeau les cite tous, la liste de choix les donne dans l’ordre, aucun n’est choisi d’office', () => {
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
  test('L SMS de pluie et d’annulation sans nom ni date : aucune accolade visible', () => {
    for (const [type, rdv, params] of [['pluie', { client: 'M. Durand' }, {}], ['pluie', {}, {}], ['pluie', { client: 'M. Durand', etat: 'confirme' }, { nomDansLesSms: 'Mme Martin' }], ['annulation', {}, {}]]) {
      const t = L.texteSmsManuel(type, rdv, params);
      assert.doesNotMatch(t, /[{}]/, `${type} ${JSON.stringify(rdv)}`);
      assert.ok(t.length > 20 && L.compterSms(t).encodage === 'gsm7');
    }
    assert.match(L.texteSmsManuel('pluie', { client: 'M. Durand' }, { nomDansLesSms: 'Mme Martin' }), /^Mme Martin : le RDV \(chantier M\. Durand\) est annulé à cause de la pluie\./);
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
