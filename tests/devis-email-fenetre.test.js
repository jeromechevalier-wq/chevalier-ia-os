// « Préparer l'e-mail » avec contenu personnalisé (01/11/2026) : règles pures (écran ET serveur) et serveur (accès en mémoire, faux n8n). Le nom d'un test commence par le numéro du critère.
//  F1 la fenêtre est préremplie avec les textes standard EXACTS ; F2 ajouter/retirer des adresses, validation, maximum, doublons ; F3 cas vide ; F4 seuls les champs changés partent ;
//  F5 le serveur revérifie et nettoie ; F6 le texte vit côté serveur et n8n ne reçoit que des identifiants ; F7 sans champ, comportement inchangé ; F8 le devis n'est jamais modifié.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerAccesMemoire, COLLECTIONS as C } from '../functions/src/coeur/donnees.js';
import * as M from '../functions/src/coeur/devis-email.js';
import { creerSortieN8n, SECRET_URL, SECRET_CLE } from '../functions/src/coeur/n8n-sortie.js';
import { nouveauDevis } from '../functions/partage/devis.js';
import * as P from '../js/modules/devis/email-preparer.js';
import * as B from '../js/modules/devis/email-brouillon.js';

const ACTEUR = 'jerome.chevalier@gmail.com';
const T0 = new Date('2026-11-01T10:00:00Z');
const NUMERO = 'D-2026-014';
const devisType = (extra = {}) => ({ id: 'dv1', numero: NUMERO, objet: 'Rénovation salle de bain', destinataires: [{ email: 'marie@exemple.fr' }], copie: ['compta@exemple.fr'], ...extra });

describe('F1 la fenêtre est préremplie avec les textes standard exacts', () => {
  test('F1 objet « Devis D-2026-014 – Rénovation salle de bain » et message standard rempli, sans aucun changement de formulation', () => {
    const v = P.valeursDeDepart(devisType(), 'Marie Durand');
    assert.equal(v.objet, 'Devis D-2026-014 – Rénovation salle de bain');
    assert.equal(v.message, 'Bonjour Marie Durand,\n\nVeuillez trouver ci-joint notre devis D-2026-014 – Rénovation salle de bain.\n\nIl reste valable pour la durée indiquée sur le document. N’hésitez pas à me contacter pour toute question ou pour l’adapter.\n\nBien cordialement');
    assert.deepEqual(v.destinataires, ['marie@exemple.fr']);
    assert.deepEqual(v.copie, ['compta@exemple.fr']);
    assert.equal(B.OBJET_PAR_DEFAUT, 'Devis {numero} – {objet}');
  });
  test('F1 sans nom de contact : « Bonjour, » ; copie vide par défaut', () => {
    const v = P.valeursDeDepart(devisType({ copie: [] }), '');
    assert.match(v.message, /^Bonjour,\n/);
    assert.deepEqual(v.copie, []);
  });
});

describe('F2 adresses : ajouter, retirer, valider, maximum', () => {
  const base = { destinataires: ['a@exemple.fr'], copie: [] };
  test('F2 une adresse valide s’ajoute à la liste ; un champ vide ne fait rien', () => {
    assert.deepEqual(P.ajouterAdresse(base, 'destinataires', ' b@exemple.fr ').liste, ['a@exemple.fr', 'b@exemple.fr']);
    assert.deepEqual(P.ajouterAdresse(base, 'copie', 'c@exemple.fr').liste, ['c@exemple.fr']);
    const vide = P.ajouterAdresse(base, 'destinataires', '  ');
    assert.deepEqual(vide.liste, ['a@exemple.fr']);
    assert.equal(vide.erreur, undefined);
  });
  test('F2 une adresse mal écrite donne un message court sous le champ, la liste ne change pas', () => {
    for (const mauvaise of ['pasUneAdresse', 'a@', '@b.fr', 'josé@exemple.fr', 'x y@exemple.fr']) {
      const r = P.ajouterAdresse(base, 'destinataires', mauvaise);
      assert.match(r.erreur, /n’est pas valide \(exemple : contact@exemple\.fr\)/, mauvaise);
      assert.equal(r.liste, undefined);
    }
  });
  test('F2 doublon dans la liste, ou adresse déjà dans l’autre liste : refus clair', () => {
    assert.match(P.ajouterAdresse(base, 'destinataires', 'A@exemple.fr').erreur, /déjà dans la liste/);
    assert.match(P.ajouterAdresse(base, 'copie', 'a@exemple.fr').erreur, /déjà destinataire/);
    assert.match(P.ajouterAdresse({ destinataires: [], copie: ['c@exemple.fr'] }, 'destinataires', 'c@exemple.fr').erreur, /déjà en copie/);
  });
  test('F2 maximum de 10 adresses par champ : la 11e est refusée avec une phrase', () => {
    const dix = Array.from({ length: 10 }, (_, i) => `p${i}@exemple.fr`);
    assert.equal(B.MAX_ADRESSES_PAR_CHAMP, 10);
    assert.equal(P.ajouterAdresse({ destinataires: dix, copie: [] }, 'destinataires', 'onze@exemple.fr').erreur, '10 adresses : c’est le maximum.');
    assert.equal(P.ajouterAdresse({ destinataires: ['a@exemple.fr'], copie: dix }, 'copie', 'onze@exemple.fr').erreur, '10 adresses : c’est le maximum.');
  });
});

describe('F3 cas vide : aucun destinataire', () => {
  test('F3 le bouton est grisé sans destinataire, avec la phrase « Ajoute au moins un destinataire »', () => {
    assert.equal(P.peutPreparer({ destinataires: [] }), false);
    assert.equal(P.peutPreparer({ destinataires: ['a@exemple.fr'] }), true);
    assert.equal(P.MESSAGE_AJOUTER_DESTINATAIRE, 'Ajoute au moins un destinataire');
  });
});

describe('F4 seuls les champs changés partent au serveur', () => {
  const depart = P.valeursDeDepart(devisType(), 'Marie Durand');
  test('F4 rien changé : aucune saisie (l’appel est identique à celui d’avant la fenêtre)', () => {
    assert.equal(P.saisieModifiee(depart, structuredClone(depart)), null);
  });
  test('F4 un seul champ changé : seulement ce champ', () => {
    assert.deepEqual(P.saisieModifiee(depart, { ...depart, objet: 'Autre objet' }), { objet: 'Autre objet' });
    assert.deepEqual(P.saisieModifiee(depart, { ...depart, copie: [] }), { copie: [] });
    assert.deepEqual(P.saisieModifiee(depart, { ...depart, destinataires: ['a@exemple.fr'] }), { destinataires: ['a@exemple.fr'] });
  });
});

describe('F5 le serveur revérifie, remplit les manques et nettoie', () => {
  const defauts = { destinataires: ['marie@exemple.fr'], copie: ['compta@exemple.fr'], variables: { contact: 'Marie', numero: NUMERO, objet: 'Salle de bain' } };
  test('F5 champs absents ou vides : texte standard et adresses du devis', () => {
    const r = B.contenuDeLEnvoi({ objet: '   ', message: '' }, defauts);
    assert.equal(r.ok, true);
    assert.equal(r.sujet, 'Devis D-2026-014 – Salle de bain');
    assert.equal(r.message, B.messageParDefaut(defauts.variables));
    assert.deepEqual(r.destinataires, ['marie@exemple.fr']);
  });
  test('F5 adresse invalide, 11 adresses, type faux : refus avec phrase ; destinataires vides : « sans_destinataire »', () => {
    assert.equal(B.contenuDeLEnvoi({ destinataires: ['nimporte'] }, defauts).code, 'saisie_invalide');
    assert.equal(B.contenuDeLEnvoi({ destinataires: Array.from({ length: 11 }, (_, i) => `p${i}@exemple.fr`) }, defauts).code, 'saisie_invalide');
    assert.equal(B.contenuDeLEnvoi({ destinataires: 'a@exemple.fr' }, defauts).code, 'saisie_invalide');
    assert.equal(B.contenuDeLEnvoi({ objet: 12 }, defauts).code, 'saisie_invalide');
    const sans = B.contenuDeLEnvoi({ destinataires: [] }, defauts);
    assert.equal(sans.code, 'sans_destinataire');
    assert.equal(sans.erreur, 'Ajoute au moins un destinataire');
  });
  test('F5 nettoyage : balises HTML et caractères de contrôle retirés, retours à la ligne normalisés, objet sur une ligne', () => {
    const r = B.contenuDeLEnvoi({ objet: 'Devis <b>urgent</b>\nsuite\u0000', message: 'Bonjour<script>x</script>\r\n\r\n\r\n\r\nMerci\u0007' }, defauts);
    assert.equal(r.sujet, 'Devis urgent suite');
    assert.equal(r.message, 'Bonjourx\n\nMerci');
    assert.ok(!/<|>/.test(r.sujet + r.message));
  });
  test('F5 longueurs maximales : objet 200, message 5000', () => {
    assert.equal(B.contenuDeLEnvoi({ objet: 'x'.repeat(201) }, defauts).code, 'saisie_invalide');
    assert.equal(B.contenuDeLEnvoi({ objet: 'x'.repeat(200) }, defauts).ok, true);
    assert.equal(B.contenuDeLEnvoi({ message: 'y'.repeat(5001) }, defauts).code, 'saisie_invalide');
    assert.equal(B.contenuDeLEnvoi({ message: 'y'.repeat(5000) }, defauts).ok, true);
  });
  test('F5 une adresse donnée en copie qui est déjà destinataire est refusée ; la copie du devis qui recoupe de nouveaux destinataires est simplement écartée', () => {
    assert.equal(B.contenuDeLEnvoi({ destinataires: ['x@exemple.fr'], copie: ['X@exemple.fr'] }, defauts).code, 'saisie_invalide');
    assert.deepEqual(B.contenuDeLEnvoi({ destinataires: ['compta@exemple.fr'] }, defauts).copie, []);
  });
});

// ---- serveur
const URL_WEBHOOK = 'https://n8n.chevalier-ia.fr/webhook/essai-faux-webhook';
function fauxN8n() {
  const recus = [];
  const sortie = creerSortieN8n({ lireSecret: async (nom) => ({ [SECRET_URL]: URL_WEBHOOK, [SECRET_CLE]: 's' })[nom], fetchImpl: async (url, options) => { recus.push(JSON.parse(options.body)); return { ok: true, status: 200 }; }, maintenant: () => T0.getTime() });
  return { recus, sortie };
}
function monde(devisExtra = {}) {
  const d = nouveauDevis({ destinataires: [{ email: 'marie@exemple.fr' }], copie: ['compta@exemple.fr'], affaireId: 'aff1', personneId: 'p1', objet: 'Rénovation cuisine' }, { id: 'dv1', maintenant: T0, auteur: ACTEUR }, { marge: 37 });
  const devis = { ...d, objet: 'Rénovation cuisine', destinataires: [{ email: 'marie@exemple.fr' }], copie: ['compta@exemple.fr'], statut: 'en_attente_envoi', numero: 'DEV-1', version: 1, finaliseLe: T0,
    sections: [{ id: 's1', titre: 'T', lignes: [{ id: 'l1', libelle: 'Carrelage', unite: 'm²', quantite: 2, prixAchat: 40, prixVente: 60 }] }], pdf: { statut: 'ok', chemin: 'devis/aff1/x/devis.pdf', nom: 'Devis.pdf', tentatives: 1 }, ...devisExtra };
  const collections = { [C.devis]: [devis], [C.personnes]: [{ id: 'p1', nom: 'Marie Durand' }], [C.audit]: [], [C.auditAvant]: [], [C.actionsLancements]: [] };
  return { collections, donnees: creerAccesMemoire(collections) };
}
const pdfFaux = async () => ({ lienSigne: 'https://stockage.exemple.test/x', octets: 1 });
let n = 0;
const demander = (m, n8n, saisie) => M.demanderPreparation({ donnees: m.donnees, ctx: { acteur: ACTEUR, via: 'ecran', maintenant: T0 }, devisId: 'dv1', espace: 'interne', sortie: n8n.sortie, saisie, genererId: () => `dem_f${++n}` });
const lire = (m, demandeId) => M.lireEmailPourDemande({ donnees: m.donnees, devisId: 'dv1', demandeId, maintenant: new Date(T0.getTime() + 60_000), pdf: pdfFaux });

describe('F6 le texte vit côté serveur : n8n ne reçoit que des identifiants et le relit par devis.lireEmail', () => {
  test('F6 destinataires, copie, objet et message saisis : mémorisés dans un document à part, jamais dans l’appel à n8n ni dans la ligne de la demande', async () => {
    const m = monde();
    const n8n = fauxN8n();
    const { demandeId } = await demander(m, n8n, { destinataires: ['paul@exemple.fr', 'luc@exemple.fr'], copie: [], objet: 'Mon objet', message: 'Mon message\nsur deux lignes' });
    assert.deepEqual(Object.keys(n8n.recus[0]).sort(), ['action', 'demandeId', 'devisId', 'espace']);
    assert.ok(!/paul@|Mon objet|Mon message/.test(JSON.stringify(n8n.recus)));
    const ligne = m.collections[C.actionsLancements].find((l) => l.id === demandeId);
    assert.ok(!/paul@|Mon objet|Mon message/.test(JSON.stringify(ligne)), 'la ligne de la demande ne contient jamais de contenu');
    const r = await lire(m, demandeId);
    assert.deepEqual(r.destinataires, ['paul@exemple.fr', 'luc@exemple.fr']);
    assert.deepEqual(r.copie, []);
    assert.equal(r.sujet, 'Mon objet');
    assert.equal(r.message, 'Mon message\nsur deux lignes');
    assert.deepEqual(Object.keys(r).sort(), ['copie', 'destinataires', 'message', 'numero', 'objet', 'pdf', 'sujet', 'version']);
  });
  test('F6 un champ non donné reprend la valeur du devis ou le texte standard', async () => {
    const m = monde();
    const { demandeId } = await demander(m, fauxN8n(), { objet: 'Autre objet' });
    const r = await lire(m, demandeId);
    assert.equal(r.sujet, 'Autre objet');
    assert.deepEqual(r.destinataires, ['marie@exemple.fr']);
    assert.deepEqual(r.copie, ['compta@exemple.fr']);
    assert.equal(r.message, B.messageParDefaut({ contact: 'Marie Durand', numero: 'DEV-1', objet: 'Rénovation cuisine' }));
  });
  test('F6 un devis sans destinataire peut partir si la fenêtre en donne ; sinon refus « sans_destinataire »', async () => {
    const m = monde({ destinataires: [] });
    await assert.rejects(demander(m, fauxN8n(), null), (e) => e.code === 'sans_destinataire');
    await assert.rejects(demander(m, fauxN8n(), { destinataires: [] }), (e) => e.code === 'sans_destinataire' && e.message === 'Ajoute au moins un destinataire');
    const { demandeId } = await demander(m, fauxN8n(), { destinataires: ['nouveau@exemple.fr'] });
    assert.deepEqual((await lire(m, demandeId)).destinataires, ['nouveau@exemple.fr']);
  });
});

describe('F7 sans champ, le comportement est inchangé', () => {
  test('F7 aucun document de contenu n’est écrit et lireEmail rend les valeurs du devis et le texte standard', async () => {
    const m = monde();
    const { demandeId } = await demander(m, fauxN8n(), null);
    assert.ok(!m.collections[C.actionsLancements].some((l) => String(l.id).startsWith('contenu-')));
    const r = await lire(m, demandeId);
    assert.deepEqual(r.destinataires, ['marie@exemple.fr']);
    assert.equal(r.sujet, 'Devis DEV-1 – Rénovation cuisine');
    const aussi = await demander(monde(), fauxN8n(), { destinataires: undefined, objet: null });
    assert.ok(aussi.ok);
  });
});

describe('F5 serveur : un refus ne laisse rien derrière lui', () => {
  test('F5 adresse invalide : refus avant toute écriture et avant n8n', async () => {
    const m = monde();
    const n8n = fauxN8n();
    await assert.rejects(demander(m, n8n, { destinataires: ['pas une adresse'] }), (e) => e.code === 'demande_invalide' && /n’est pas valide/.test(e.message));
    assert.equal(n8n.recus.length, 0);
    assert.equal(m.collections[C.actionsLancements].length, 0);
    assert.equal(m.collections[C.devis][0].emailPrepare, undefined);
  });
});

describe('F8 le devis n’est jamais modifié par la fenêtre', () => {
  test('F8 les adresses du devis restent celles du devis après une demande avec d’autres adresses', async () => {
    const m = monde();
    await demander(m, fauxN8n(), { destinataires: ['paul@exemple.fr'], copie: [] });
    const d = m.collections[C.devis][0];
    assert.deepEqual(d.destinataires, [{ email: 'marie@exemple.fr' }]);
    assert.deepEqual(d.copie, ['compta@exemple.fr']);
    assert.equal(d.emailPrepare.statut, 'demandee');
  });
});
