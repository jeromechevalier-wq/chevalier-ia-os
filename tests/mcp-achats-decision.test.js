// Achats par l'assistant, étape C (26/11/2026) : valider, refuser, archiver une facture d'achat et la relier à un chantier, toujours par les webhooks n8n
// avec un ticket NEUF par appel. Faux `pg` en mémoire et faux réseau (tests/_achats-essai.js) ; adresses en exemple.test.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  valider_facture_achat, refuser_facture_achat, archiver_facture_achat, relier_facture_achat_chantier, OUTILS_ACHATS, PROFILS_ECRITURE_ACHATS,
} from '../functions/src/mcp/outils/achats.js';
import { annotationsDe } from '../functions/src/mcp/outils/index.js';
import { erreurLisible } from '../functions/src/mcp/gestionnaire.js';
import { MESSAGE_ACCES_REFUSE, MESSAGE_ADRESSE, MESSAGE_REFUS_SERVEUR, MESSAGE_REPONSE_INATTENDUE, MESSAGE_DEJA_TRAITEE, MESSAGE_RESEAU } from '../functions/src/base/assistant-achats.js';
// Les fonctions de l'ÉCRAN (originaux, pas les copies du serveur) : le serveur doit trouver exactement la même chose.
import { controlerFacture, alertesAffichees } from '../js/modules/achatsfactures/controles.js';
import { alerteNomFournisseur, construireCorps, PHRASE_LIAISON_ARCHIVEE } from '../js/modules/achatsfactures/decision.js';
import { phraseChantierFerme } from '../js/modules/achatsfactures/agences.js';
import {
  service, fausseBase, fauxReseau, reponse, donneesDeBase, EMAIL, CONNEXION, WEBHOOKS, N8N, F1, F2, F3, CH_OUVERT, CH_TERMINE, AG_ACTIVE, AG_INACTIVE, id,
} from './_achats-essai.js';

const OUTILS_DECISION = [valider_facture_achat, refuser_facture_achat, archiver_facture_achat, relier_facture_achat_chantier];
const MOTIF = 'Vérifié avec le fournisseur par téléphone';
const ARGS = {
  valider_facture_achat: { factureId: F1, agenceId: AG_ACTIVE, motif: MOTIF },
  refuser_facture_achat: { factureId: F1, motif: MOTIF },
  archiver_facture_achat: { factureId: F2 },
  relier_facture_achat_chantier: { factureId: F2, chantierId: CH_OUVERT },
};
const contexte = (s, args, extra = {}) => ({ email: EMAIL, args, achats: () => s, reserverEcriture: async () => {}, ...extra });
const corpsEnvoye = (appel) => JSON.parse(appel.init.body);
const ticketsEnvoyes = (r) => r.appels.map((a) => a.init.headers.Authorization);
const usagesDemandes = (base) => base.journal.filter((j) => j.sql.includes('"demander_ticket_n8n"')).map((j) => j.valeurs[0]);

/** Alertes de l'écran pour F1 (examiner.js : controlerFacture + alertesAffichees + alerteNomFournisseur), avec les mêmes données. */
function alertesDeLEcran(d, agence) {
  const f = d.factures.find((x) => x.id === F1);
  const meme = d.factures.filter((x) => x.fournisseur_siren === f.fournisseur_siren && x.id !== f.id);
  const lignes = d.lignes_facture.filter((l) => l.facture_id === F1);
  const controles = controlerFacture(f, meme, [], lignes, d.ibans_confirmes, null);
  const fo = d.fournisseurs.find((x) => x.id === agence.fournisseur_id);
  const nom = alerteNomFournisseur(f.fournisseur, fo?.nom);
  return nom ? [...alertesAffichees(controles), nom] : alertesAffichees(controles);
}

describe('Achats par l’assistant : décisions (par n8n)', () => {
  test('C1 mêmes alertes que l’écran', async () => {
    for (const nomFournisseur of ['Matériaux Essai', 'Tout autre nom SARL']) {
      const d = donneesDeBase();
      d.fournisseurs[0].nom = nomFournisseur; // nom de l'entreprise de l'agence : différent → alerte « nom » en plus
      const attendues = alertesDeLEcran(d, d.etablissements_fournisseur[0]);
      assert.ok(attendues.length > 0, 'la facture d’essai a des alertes');
      const e = service({ base: fausseBase({ donnees: d }) });
      const err = await e.s.validerFacture({ email: EMAIL, factureId: F1, agenceId: AG_ACTIVE }).catch((x) => x);
      assert.equal(err.code, 'motif_obligatoire');
      assert.deepEqual(err.alertes, attendues, nomFournisseur);
      // la lecture d'une facture montre les mêmes alertes que l'écran (sans l'alerte de nom, qui dépend de l'agence choisie)
      const lue = await e.s.lireFacture({ email: EMAIL, factureId: F1 });
      assert.deepEqual(lue.alertes, attendues.filter((a) => a.code !== 'nom-fournisseur'));
    }
    // l'assistant ne peut pas déclarer lui-même les alertes : pas de champ « alertes » dans le schéma
    assert.equal(z.strictObject(valider_facture_achat.schema).safeParse({ ...ARGS.valider_facture_achat, alertes: [] }).success, false);
  });

  test('C2 validation sans agence refusée', async () => {
    const e = service();
    await assert.rejects(e.s.validerFacture({ email: EMAIL, factureId: F1, motif: MOTIF }), { code: 'agence_obligatoire' });
    assert.equal(e.base.tickets(), 0);
    assert.equal(e.reseau.appels.length, 0);
    assert.equal(z.strictObject(valider_facture_achat.schema).safeParse({ factureId: F1 }).success, false, 'agenceId obligatoire dans le schéma');
    // agence inactive ou fusionnée, introuvable : refus, rien n'est envoyé
    await assert.rejects(e.s.validerFacture({ email: EMAIL, factureId: F1, agenceId: AG_INACTIVE, motif: MOTIF }), { code: 'agence_inactive' });
    await assert.rejects(e.s.validerFacture({ email: EMAIL, factureId: F1, agenceId: id(299), motif: MOTIF }), { code: 'agence_introuvable' });
    await assert.rejects(e.s.validerFacture({ email: EMAIL, factureId: F1, agenceId: AG_ACTIVE, chantierId: CH_TERMINE, motif: MOTIF }), { code: 'chantier_ferme' });
    await assert.rejects(e.s.validerFacture({ email: EMAIL, factureId: F2, agenceId: AG_ACTIVE, motif: MOTIF }), { message: MESSAGE_DEJA_TRAITEE });
    assert.equal(e.base.tickets(), 0);
    assert.equal(e.reseau.appels.length, 0);
  });

  test('C3 refus sans motif refusé', async () => {
    for (const motif of [undefined, '', 'ab', '   ab   ', 'x'.repeat(501)]) {
      const e = service();
      await assert.rejects(e.s.refuserFacture({ email: EMAIL, factureId: F1, motif }), { code: 'motif_obligatoire' }, String(motif).slice(0, 10));
      assert.equal(e.base.tickets(), 0);
      assert.equal(e.reseau.appels.length, 0);
    }
    const schema = z.strictObject(refuser_facture_achat.schema);
    assert.equal(schema.safeParse({ factureId: F1 }).success, false);
    assert.equal(schema.safeParse({ factureId: F1, motif: 'x'.repeat(501) }).success, false);
    // un bon motif passe : corps de l'écran
    const e = service();
    const r = await e.s.refuserFacture({ email: EMAIL, factureId: F1, motif: `  ${MOTIF}  ` });
    assert.equal(r.ok, true);
    assert.deepEqual(corpsEnvoye(e.reseau.appels[0]), construireCorps(F1, 'refuser', MOTIF, [], null));
    assert.equal(e.reseau.appels[0].url, WEBHOOKS.validation);
  });

  test('C4 alerte : motif obligatoire, alertes du serveur', async () => {
    const d = donneesDeBase();
    const attendues = alertesDeLEcran(d, d.etablissements_fournisseur[0]);
    const e = service({ base: fausseBase({ donnees: d }) });
    const err = await e.s.validerFacture({ email: EMAIL, factureId: F1, agenceId: AG_ACTIVE }).catch((x) => x);
    assert.equal(err.code, 'motif_obligatoire');
    assert.ok(erreurLisible(err));
    for (const a of attendues) assert.ok(err.message.includes(a.message), 'le refus LISTE chaque alerte');
    assert.equal(e.base.tickets(), 0);
    assert.equal(e.reseau.appels.length, 0);
    const r = await e.s.validerFacture({ email: EMAIL, factureId: F1, agenceId: AG_ACTIVE, chantierId: CH_OUVERT, motif: MOTIF });
    assert.equal(r.ok, true);
    assert.equal(r.accepteeMalgreAlertes, attendues.length);
    const corps = corpsEnvoye(e.reseau.appels[0]);
    assert.deepEqual(corps, construireCorps(F1, 'accepter', MOTIF, attendues, { etablissement_id: AG_ACTIVE, chantier_id: CH_OUVERT }));
    assert.deepEqual(corps.alertes, attendues, 'les alertes du SERVEUR');
    assert.equal(corps.motif, MOTIF);
  });

  test('C5 ticket neuf à chaque appel, jamais rendu', async () => {
    const journal = [];
    const e = service({ journal });
    const r1 = await e.s.refuserFacture({ email: EMAIL, factureId: F1, motif: MOTIF });
    const r2 = await e.s.archiverFacture({ email: EMAIL, factureId: F2 });
    assert.deepEqual(ticketsEnvoyes(e.reseau), ['Bearer ticket-1', 'Bearer ticket-2'], 'deux appels, deux tickets différents');
    assert.deepEqual(usagesDemandes(e.base), ['validation', 'actions'], 'le bon usage');
    for (const a of e.reseau.appels) {
      assert.equal(a.init.method, 'POST');
      assert.equal(a.init.redirect, 'error');
      assert.ok(a.init.signal instanceof AbortSignal);
    }
    const texte = JSON.stringify([r1, r2, journal]);
    assert.ok(!texte.includes('ticket-'), 'ni dans la réponse ni dans le journal');
    // la demande de ticket se fait dans une transaction rôle porte, utilisateur = l'e-mail, pas en lecture seule
    const i = e.base.sqls().findIndex((q) => q.includes('"demander_ticket_n8n"'));
    const avant = e.base.journal.slice(0, i).reverse();
    assert.equal(avant.find((j) => j.sql.startsWith('begin')).sql, 'begin');
    assert.equal(avant.find((j) => j.sql.startsWith('set local role')).sql, 'set local role porte');
    assert.ok(avant.find((j) => j.sql.startsWith('select set_config')).valeurs.includes(EMAIL));
  });

  test('C6 ticket absent : rien n’est envoyé', async () => {
    const plafond = fausseBase({ panne: (sql) => { if (sql.includes('"demander_ticket_n8n"')) throw Object.assign(new Error('trop'), { code: 'P0001', detail: 'ticket_trop_de_demandes' }); } });
    const e = service({ base: plafond });
    await assert.rejects(e.s.refuserFacture({ email: EMAIL, factureId: F1, motif: MOTIF }), (err) => err.code === 'ticket_trop_de_demandes' && /réessaie dans une minute/.test(err.message));
    assert.equal(e.reseau.appels.length, 0);
    const refus = fausseBase({ panne: (sql) => { if (sql.includes('"demander_ticket_n8n"')) throw Object.assign(new Error('non'), { code: 'P0001', detail: 'acces_base_refuse' }); } });
    const e2 = service({ base: refus });
    await assert.rejects(e2.s.archiverFacture({ email: EMAIL, factureId: F2 }), { message: MESSAGE_ACCES_REFUSE });
    assert.equal(e2.reseau.appels.length, 0);
    const vide = service({ base: fausseBase({ ticket: () => null }) });
    await assert.rejects(vide.s.archiverFacture({ email: EMAIL, factureId: F2 }), { code: 'ticket' });
    assert.equal(vide.reseau.appels.length, 0);
  });

  test('C7 ticket périmé refusé, un seul nouvel essai', async () => {
    const deuxFois = service({ reseau: fauxReseau(() => reponse(401, { erreur: 'ticket' })) });
    await assert.rejects(deuxFois.s.refuserFacture({ email: EMAIL, factureId: F1, motif: MOTIF }), { message: MESSAGE_REFUS_SERVEUR });
    assert.equal(deuxFois.reseau.appels.length, 2, 'un seul nouvel essai');
    assert.deepEqual(ticketsEnvoyes(deuxFois.reseau), ['Bearer ticket-1', 'Bearer ticket-2'], 'avec un ticket neuf');
    const puisBon = service({ reseau: fauxReseau((a, n) => (n === 1 ? reponse(401, {}) : reponse(200, { ok: true }))) });
    assert.equal((await puisBon.s.refuserFacture({ email: EMAIL, factureId: F1, motif: MOTIF })).ok, true);
    assert.equal(puisBon.reseau.appels.length, 2);
  });

  test('C8 réponse inattendue', async () => {
    for (const r of [reponse(200, {}), reponse(200, { ok: 'oui' }), reponse(200, undefined), reponse(204, undefined)]) {
      const e = service({ reseau: fauxReseau(() => r) });
      await assert.rejects(e.s.archiverFacture({ email: EMAIL, factureId: F2 }), { message: MESSAGE_REPONSE_INATTENDUE });
    }
    const coupe = service({ reseau: fauxReseau(() => { throw new TypeError('fetch failed'); }) });
    await assert.rejects(coupe.s.archiverFacture({ email: EMAIL, factureId: F2 }), { message: MESSAGE_RESEAU });
  });

  test('C9 adresse du service contrôlée', async () => {
    const cas = [
      { connexion: null, n8n: N8N },
      { connexion: { ...CONNEXION, webhooks: {} }, n8n: N8N },
      { connexion: { ...CONNEXION, webhooks: { ...WEBHOOKS, validation: 'http://n8n.exemple.test/webhook/validation', actions: 'http://n8n.exemple.test/webhook/actions' } }, n8n: N8N },
      { connexion: { ...CONNEXION, webhooks: { ...WEBHOOKS, validation: 'https://pirate.exemple.test/v', actions: 'https://pirate.exemple.test/a' } }, n8n: N8N },
      { connexion: { ...CONNEXION, webhooks: { ...WEBHOOKS, validation: 'https://n8n.exemple.test.pirate.exemple.test/v', actions: 'https://n8n.exemple.test.pirate.exemple.test/a' } }, n8n: N8N },
      { connexion: { ...CONNEXION, webhooks: { ...WEBHOOKS, validation: 'https://moi:mdp@n8n.exemple.test/v', actions: 'https://moi:mdp@n8n.exemple.test/a' } }, n8n: N8N },
      { connexion: CONNEXION, n8n: '' },
      { connexion: CONNEXION, n8n: 'pas une adresse' },
    ];
    for (const [i, c] of cas.entries()) {
      const e = service(c);
      await assert.rejects(e.s.refuserFacture({ email: EMAIL, factureId: F1, motif: MOTIF }), { message: MESSAGE_ADRESSE }, `cas ${i}`);
      await assert.rejects(e.s.archiverFacture({ email: EMAIL, factureId: F2 }), { message: MESSAGE_ADRESSE }, `cas ${i}`);
      await assert.rejects(e.s.validerFacture({ email: EMAIL, factureId: F1, agenceId: AG_ACTIVE, motif: MOTIF }), { message: MESSAGE_ADRESSE }, `cas ${i}`);
      assert.equal(e.base.tickets(), 0, `cas ${i} : zéro ticket`);
      assert.equal(e.reseau.appels.length, 0, `cas ${i} : zéro appel`);
    }
  });

  test('C10 compte non autorisé', async () => {
    for (const outil of OUTILS_DECISION) {
      const e = service({ comptes: [] });
      await assert.rejects(async () => outil.executer(contexte(e.s, ARGS[outil.nom])), { message: MESSAGE_ACCES_REFUSE }, outil.nom);
      assert.equal(e.ouvertures.n, 0, outil.nom);
      assert.equal(e.reseau.appels.length, 0, outil.nom);
      const sansEmail = service();
      await assert.rejects(async () => outil.executer(contexte(sansEmail.s, ARGS[outil.nom], { email: undefined })), { message: MESSAGE_ACCES_REFUSE }, outil.nom);
      assert.equal(sansEmail.ouvertures.n, 0);
    }
  });

  test('C11 refus métier rendus lisibles', async () => {
    const cas = [
      [409, { code: 'deja_traitee', erreur: 'n’importe quoi' }, `${MESSAGE_DEJA_TRAITEE} (code : deja_traitee)`],
      [422, { code: 'chantier_termine', erreur: 'Ce chantier est terminé : choisis-en un autre.' }, 'Ce chantier est terminé : choisis-en un autre. (code : chantier_termine)'],
      [422, { code: 'agence_inactive', erreur: 'Cette agence est inactive.' }, 'Cette agence est inactive. (code : agence_inactive)'],
      [409, { code: 'facture_deja_reliee', erreur: 'Déjà reliée.' }, 'Déjà reliée. (code : facture_deja_reliee)'],
      [500, { erreur: 'stack trace interne' }, 'Une erreur est survenue, réessaie dans un instant.'],
      [422, { code: 'Pas Simple; drop', erreur: 'Refusé.' }, 'Refusé.'],
    ];
    for (const [statut, corps, message] of cas) {
      const e = service({ reseau: fauxReseau(() => reponse(statut, corps)) });
      const err = await e.s.archiverFacture({ email: EMAIL, factureId: F2 }).catch((x) => x);
      assert.equal(err.message, message);
      assert.ok(erreurLisible(err));
    }
  });

  test('C12 aucune identité dans le corps', async () => {
    const e = service();
    await e.s.validerFacture({ email: EMAIL, factureId: F1, agenceId: AG_ACTIVE, chantierId: CH_OUVERT, motif: MOTIF });
    await e.s.refuserFacture({ email: EMAIL, factureId: F1, motif: MOTIF });
    await e.s.archiverFacture({ email: EMAIL, factureId: F2 });
    await e.s.relierChantier({ email: EMAIL, factureId: F2, chantierId: CH_OUVERT });
    assert.equal(e.reseau.appels.length, 4);
    for (const a of e.reseau.appels) {
      const texte = a.init.body;
      for (const interdit of [EMAIL, 'lea', 'espace-essai', 'espace_id', 'utilisateur', 'decide_par', 'email']) assert.ok(!texte.includes(interdit), `${interdit} dans ${texte}`);
    }
    assert.deepEqual(corpsEnvoye(e.reseau.appels[2]), { facture_id: F2, action: 'archiver' });
    assert.deepEqual(corpsEnvoye(e.reseau.appels[3]), { facture_id: F2, chantier_id: CH_OUVERT, action: 'relier_chantier' });
    assert.equal(e.reseau.appels[3].url, WEBHOOKS.actions);
  });

  test('C13 relier : règles de l’écran', async () => {
    const d = donneesDeBase();
    const ACCEPTEE_ARCHIVEE = id(4);
    const ACCEPTEE_RELIEE = id(5);
    d.factures.push({ id: ACCEPTEE_ARCHIVEE, statut: 'acceptee', chantier_id: null, archivee_le: '2026-11-02T00:00:00Z' });
    d.factures.push({ id: ACCEPTEE_RELIEE, statut: 'acceptee', chantier_id: CH_OUVERT, archivee_le: null });
    const e = service({ base: fausseBase({ donnees: d }) });
    await assert.rejects(e.s.relierChantier({ email: EMAIL, factureId: F1, chantierId: CH_OUVERT }), { code: 'liaison_facture_non_acceptee' });
    await assert.rejects(e.s.relierChantier({ email: EMAIL, factureId: F3, chantierId: CH_OUVERT }), { code: 'liaison_facture_non_acceptee' });
    await assert.rejects(e.s.relierChantier({ email: EMAIL, factureId: ACCEPTEE_ARCHIVEE, chantierId: CH_OUVERT }), { message: PHRASE_LIAISON_ARCHIVEE });
    await assert.rejects(e.s.relierChantier({ email: EMAIL, factureId: ACCEPTEE_RELIEE, chantierId: CH_OUVERT }), { code: 'facture_deja_reliee' });
    const ferme = d.chantiers.find((c) => c.id === CH_TERMINE);
    await assert.rejects(e.s.relierChantier({ email: EMAIL, factureId: F2, chantierId: CH_TERMINE }), { message: phraseChantierFerme(ferme) });
    await assert.rejects(e.s.relierChantier({ email: EMAIL, factureId: F2, chantierId: id(199) }), { code: 'chantier_introuvable' });
    assert.equal(e.reseau.appels.length, 0);
    assert.equal(e.base.tickets(), 0);
    const r = await e.s.relierChantier({ email: EMAIL, factureId: F2, chantierId: CH_OUVERT });
    assert.deepEqual(r, { ok: true, factureId: F2, statut: 'acceptee', chantier: { id: CH_OUVERT, nom: 'Maison Dupont' } });
    // archiver : une facture « à valider » ne s'archive pas (règle de l'écran), une archivée non plus
    await assert.rejects(e.s.archiverFacture({ email: EMAIL, factureId: F1 }), { code: 'facture_a_valider' });
    await assert.rejects(e.s.archiverFacture({ email: EMAIL, factureId: F3 }), { code: 'deja_archivee' });
    assert.equal(e.reseau.appels.length, 1);
  });

  test('C14 plafond', async () => {
    const ErreurLimite = class extends Error { constructor() { super('Plafond d’écritures atteint pour ce jeton.'); this.name = 'ErreurLimite'; } };
    for (const outil of OUTILS_DECISION) {
      const e = service();
      await assert.rejects(async () => outil.executer(contexte(e.s, ARGS[outil.nom], { reserverEcriture: async () => { throw new ErreurLimite(); } })), { name: 'ErreurLimite' }, outil.nom);
      assert.equal(e.base.tickets(), 0, outil.nom);
      assert.equal(e.reseau.appels.length, 0, outil.nom);
    }
    // un refus (motif manquant) ne consomme pas le plafond
    let reservees = 0;
    const e = service();
    await assert.rejects(async () => refuser_facture_achat.executer(contexte(e.s, { factureId: F1, motif: 'a' }, { reserverEcriture: async () => { reservees += 1; } })));
    assert.equal(reservees, 0);
    await refuser_facture_achat.executer(contexte(e.s, { factureId: F1, motif: MOTIF }, { reserverEcriture: async () => { reservees += 1; } }));
    assert.equal(reservees, 1);
  });

  test('C15 annotations et profils', () => {
    for (const outil of OUTILS_DECISION) {
      assert.ok(OUTILS_ACHATS.includes(outil));
      const a = annotationsDe(outil);
      assert.equal(a.readOnlyHint, false, outil.nom);
      assert.equal(a.destructiveHint, false, outil.nom);
      assert.deepEqual(outil.profils, [...PROFILS_ECRITURE_ACHATS], outil.nom);
      assert.deepEqual(outil.profils, ['ecriture', 'complet']);
      assert.match(outil.description, /restaurer_depuis_audit ne l'annule pas/, outil.nom);
      assert.equal(outil.stricte, true);
    }
  });
});
