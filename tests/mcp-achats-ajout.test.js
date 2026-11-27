// Achats par l'assistant, étape D (26/11/2026) : ajouter une facture d'achat en PDF par un LIEN D'ENVOI (outil ajouter_facture_achat, puis page /depot/<lien>
// servie par depotdocument : functions/src/coeur/depot-lien.js, genre « depot_achat »), le serveur la fait suivre au webhook « ajoutFacture » de n8n avec un ticket neuf.
// Tout en mémoire : faux `pg`, faux réseau, données fictives (tests/_achats-essai.js) ; adresses en exemple.test.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { z } from 'zod';
import { creerGestionnaireDepot, emettreLienDepot, DUREE_DEPOT_MS } from '../functions/src/coeur/depot-lien.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { ajouter_facture_achat, PROFILS_ECRITURE_ACHATS } from '../functions/src/mcp/outils/achats.js';
import { annotationsDe } from '../functions/src/mcp/outils/index.js';
import { MESSAGE_ACCES_REFUSE, MESSAGE_ADRESSE, MESSAGE_PAS_BRANCHEE, MESSAGE_AJOUTEE } from '../functions/src/base/assistant-achats.js';
import { ConfigurationAbsente } from '../functions/src/base/porte-base.js';
import { MESSAGE_INCERTAIN } from '../js/modules/achatsfactures/upload.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';
import { service, fauxReseau, reponse, pdfEssai, EMAIL, CONNEXION, WEBHOOKS, N8N, id, F1, F2 } from './_achats-essai.js';

const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });
const FACTURE = id(77);
const BASE_LIEN = 'https://site-essai.web.app/depot';

/**
 * Le lien est demandé par l'OUTIL (comme le fait l'assistant), le fichier arrive sur un vrai serveur HTTP (comme la commande curl rendue).
 * `achats` : options du service (tests/_achats-essai.js) ; `brancher` : faux = depotdocument sans deposerAchat (plateforme des clients).
 */
async function demarrer({ achats = {}, brancher = true, journalDepot = [] } = {}) {
  const collections = structuredClone(base);
  const donnees = creerAccesMemoire(collections);
  const horloge = { t: MAINTENANT.getTime() };
  const journal = [];
  const e = service({ journal, ...achats });
  const stockage = { deposer: async () => { throw new Error('jamais pour un achat'); }, supprimer: async () => {} };
  const gestionnaire = creerGestionnaireDepot({ donnees: () => donnees, stockage, journal: (x) => journalDepot.push(x), maintenant: () => horloge.t, ...(brancher ? { deposerAchat: (d) => e.s.deposerFacture(d) } : {}) });
  const serveur = createServer((req, res) => {
    const m = [];
    req.on('data', (x) => m.push(x));
    req.on('end', () => { req.rawBody = Buffer.concat(m); gestionnaire(req, res); });
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  arrets.push(() => new Promise((ok) => serveur.close(ok)));
  const racine = `http://127.0.0.1:${serveur.address().port}`;
  let reservees = 0;
  const contexte = (args = {}, extra = {}) => ({
    email: EMAIL, args, achats: () => e.s, donnees, lienDepot: BASE_LIEN, acteur: 'assistant-essai', jeton: 'jeton-essai', maintenant: new Date(horloge.t),
    reserverEcriture: async () => { reservees += 1; }, ...extra,
  });
  const demanderLien = async (args, extra) => ajouter_facture_achat.executer(contexte(args, extra));
  const jetonDe = (r) => r.lien.slice(BASE_LIEN.length + 1);
  const envoyer = async (jeton, octets, nom = 'facture.pdf') => {
    const r = await fetch(`${racine}/depot/${jeton}?nom=${encodeURIComponent(nom)}`, { method: 'PUT', body: octets, headers: { 'Content-Type': 'application/pdf' } });
    return { statut: r.status, corps: await r.json().catch(() => null) };
  };
  return { e, collections, donnees, horloge, journal, journalDepot, demanderLien, jetonDe, envoyer, racine, reservees: () => reservees, page: (j) => fetch(`${racine}/depot/${j}`) };
}
const liens = (s) => (s.collections.mcp_codes ?? []).filter((d) => d.genre === 'depot_achat');
const ok200 = () => fauxReseau(() => reponse(200, { ok: true, facture_id: FACTURE, lecture: 'ok' }));

describe('Achats par l’assistant : ajouter une facture en PDF (lien d’envoi)', () => {
  test('D1 lien d’envoi : forme, durée, usage unique', async () => {
    const s = await demarrer({ achats: { reseau: ok200() } });
    const r = await s.demanderLien({ nom: 'facture fournisseur.pdf' });
    assert.ok(r.lien.startsWith(`${BASE_LIEN}/`));
    assert.match(s.jetonDe(r), /^[A-Za-z0-9_-]{43}$/);
    assert.equal(r.valableMinutes, 10);
    assert.equal(r.tailleMaxMo, 10);
    assert.equal(r.usageUnique, true);
    assert.match(r.commandeAvecTerminal, /curl .*-X PUT .*application\/pdf.*facture%20fournisseur\.pdf/);
    assert.ok(r.etapeSuivante.includes('lister_factures_achat'));
    assert.equal(s.reservees(), 1, 'un lien compte comme une écriture');
    // le lien garde le compte vérifié (minuscules) et PAS de fiche cible ; rien d'autre n'est créé tant qu'aucun fichier n'arrive
    const [l] = liens(s);
    assert.deepEqual(Object.keys(l).filter((k) => k !== 'id').sort(), ['acteur', 'email', 'genre', 'jetonMcp', 'valideJusqua']);
    assert.equal(l.email, EMAIL);
    assert.equal(l.valideJusqua, s.horloge.t + DUREE_DEPOT_MS);
    assert.equal(s.e.reseau.appels.length, 0);
    assert.equal(s.e.base.tickets(), 0);
    // la page s'affiche (PDF seulement, texte des achats) sans consommer le lien
    const page = await s.page(s.jetonDe(r));
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /accept="application\/pdf,\.pdf"/);
    assert.match(html, /Le PDF sera ajouté aux factures à valider/);
    assert.ok(!/crm/i.test(html));
    assert.equal(liens(s).length, 1);
    // un envoi : le lien est consommé ; le second reçoit « plus valable »
    assert.equal((await s.envoyer(s.jetonDe(r), pdfEssai())).statut, 200);
    assert.equal((await s.envoyer(s.jetonDe(r), pdfEssai())).statut, 404);
    // périmé au bout de 10 minutes
    const r2 = await s.demanderLien();
    s.horloge.t += DUREE_DEPOT_MS + 1;
    assert.equal((await s.envoyer(s.jetonDe(r2), pdfEssai())).statut, 404);
    // schéma : nom avec .pdf seulement, rien d'autre
    const schema = z.strictObject(ajouter_facture_achat.schema);
    assert.equal(schema.safeParse({ nom: 'photo.jpg' }).success, false);
    assert.equal(schema.safeParse({ email: 'autre@exemple.test' }).success, false);
    assert.deepEqual(ajouter_facture_achat.profils, [...PROFILS_ECRITURE_ACHATS]);
    assert.equal(annotationsDe(ajouter_facture_achat).readOnlyHint, false);
  });

  test('D2 PDF déposé : ticket neuf, multipart, facture créée', async () => {
    const s = await demarrer({ achats: { reseau: ok200() } });
    const r = await s.demanderLien();
    const pdf = pdfEssai(5000);
    const rep = await s.envoyer(s.jetonDe(r), pdf, 'Facture N°12 (copie).pdf');
    assert.equal(rep.statut, 200, JSON.stringify(rep.corps));
    assert.deepEqual(rep.corps, { ok: true, factureId: FACTURE, lecture: 'ok', message: MESSAGE_AJOUTEE });
    assert.equal(s.e.base.tickets(), 1, 'UN ticket');
    const usages = s.e.base.journal.filter((j) => j.sql.includes('"demander_ticket_n8n"')).map((j) => j.valeurs[0]);
    assert.deepEqual(usages, ['ajoutFacture']);
    assert.equal(s.e.reseau.appels.length, 1, 'UN envoi');
    const [appel] = s.e.reseau.appels;
    assert.equal(appel.url, WEBHOOKS.ajoutFacture);
    assert.equal(appel.init.redirect, 'error');
    assert.equal(appel.init.headers.Authorization, 'Bearer ticket-1');
    assert.equal(appel.init.headers['Content-Type'], undefined, 'multipart : la frontière est posée par fetch');
    assert.ok(appel.init.body instanceof FormData);
    const fichier = appel.init.body.get('fichier');
    assert.equal(fichier.type, 'application/pdf');
    assert.equal(fichier.name, 'Facture N12 copie.pdf');
    assert.deepEqual(Buffer.from(await fichier.arrayBuffer()), pdf);
    assert.equal([...appel.init.body.keys()].length, 1, 'aucun autre champ (ni e-mail ni espace)');
    assert.equal(liens(s).length, 0, 'lien consommé');
    // lecture à compléter : dite
    const s2 = await demarrer({ achats: { reseau: fauxReseau(() => reponse(200, { ok: true, facture_id: FACTURE, lecture: 'a_completer' })) } });
    assert.equal((await s2.envoyer(s2.jetonDe(await s2.demanderLien()), pdfEssai())).corps.lecture, 'a_completer');
  });

  test('D3 PDF trop gros : message clair, rien n’est envoyé', async () => {
    const s = await demarrer({ achats: { reseau: ok200() } });
    const r = await s.demanderLien();
    const rep = await s.envoyer(s.jetonDe(r), pdfEssai(10 * 1024 * 1024 + 1));
    assert.equal(rep.statut, 413);
    assert.equal(rep.corps.erreur, 'Ce PDF est trop gros (10 Mo au plus). Réduis-le ou scanne-le en moins haute qualité.');
    assert.equal(s.e.base.tickets(), 0);
    assert.equal(s.e.reseau.appels.length, 0);
    assert.equal(liens(s).length, 1, 'lien rendu');
    assert.equal((await s.envoyer(s.jetonDe(r), pdfEssai())).statut, 200, 'un nouvel essai passe');
    // n8n dit « trop gros » : message de l'écran
    const s2 = await demarrer({ achats: { reseau: fauxReseau(() => reponse(413, { code: 'trop_gros' })) } });
    const rep2 = await s2.envoyer(s2.jetonDe(await s2.demanderLien()), pdfEssai());
    assert.equal(rep2.statut, 413);
  });

  test('D4 PDF en double : message clair', async () => {
    const s = await demarrer({ achats: { reseau: fauxReseau(() => reponse(409, { ok: false, code: 'doublon', erreur: 'x' })) } });
    const r = await s.demanderLien();
    const rep = await s.envoyer(s.jetonDe(r), pdfEssai());
    assert.equal(rep.statut, 409);
    assert.equal(rep.corps.erreur, 'Cette facture a déjà été ajoutée. Rien n’a été créé en double.');
    assert.equal(rep.corps.factureId, undefined, 'pas d’identifiant valable : aucun');
    assert.equal(liens(s).length, 0, 'consommé');
  });

  test('D4b même fichier (409) avec l’identifiant de la fiche : date relue dans la base, identifiant rendu', async () => {
    const s = await demarrer({ achats: { reseau: fauxReseau(() => reponse(409, { ok: false, code: 'doublon', facture_id: F1 })) } });
    const rep = await s.envoyer(s.jetonDe(await s.demanderLien()), pdfEssai());
    assert.equal(rep.statut, 409);
    assert.equal(rep.corps.erreur, 'Cette facture a déjà été ajoutée le 20/11/2026 à 11:00. Rien n’a été créé en double.');
    assert.equal(rep.corps.factureId, F1);
  });

  test('D4c réponse « ajoutée » qui désigne une fiche déjà décidée (PDF rangé dans la facture existante) : doublon, pas « Facture ajoutée »', async () => {
    const s = await demarrer({ achats: { reseau: fauxReseau(() => reponse(200, { ok: true, facture_id: F2, lecture: 'ok', lignes_ecrites: false })) } });
    const rep = await s.envoyer(s.jetonDe(await s.demanderLien()), pdfEssai());
    assert.equal(rep.statut, 409);
    assert.equal(rep.corps.erreur, 'Une facture de ce fournisseur avec ce numéro existe déjà (ajoutée le 18/11/2026 à 11:00). Ouvre-la pour vérifier.');
    assert.equal(rep.corps.factureId, F2);
  });

  test('5 refus 409 avec deja_connue (fournisseur et numéro) : message « existe déjà, ouvre-la »', async () => {
    const s = await demarrer({ achats: { reseau: fauxReseau(() => reponse(409, { ok: false, code: 'doublon', deja_connue: true, facture_id: F2 })) } });
    const rep = await s.envoyer(s.jetonDe(await s.demanderLien()), pdfEssai());
    assert.equal(rep.statut, 409);
    assert.equal(rep.corps.erreur, 'Une facture de ce fournisseur avec ce numéro existe déjà (ajoutée le 18/11/2026 à 11:00). Ouvre-la pour vérifier.');
    assert.equal(rep.corps.factureId, F2);
  });

  test('1+2 réponse « ajoutée » qui désigne une fiche « à valider » ancienne, sans signal du workflow : succès normal (aucune comparaison d’horloge, pas de 409)', async () => {
    const s = await demarrer({ achats: { reseau: fauxReseau(() => reponse(200, { ok: true, facture_id: F1, lecture: 'ok' })) } });
    const rep = await s.envoyer(s.jetonDe(await s.demanderLien()), pdfEssai());
    assert.equal(rep.statut, 200);
    assert.equal(rep.corps.ok, true);
    assert.equal(rep.corps.factureId, F1);
    assert.equal(rep.corps.dejaConnue, undefined);
    assert.equal(rep.corps.message, MESSAGE_AJOUTEE);
  });

  test('1+2 fiche « à valider » existante signalée par le workflow (deja_connue) : succès « déjà connue », pas de 409', async () => {
    const s = await demarrer({ achats: { reseau: fauxReseau(() => reponse(200, { ok: true, facture_id: F1, lecture: 'ok', deja_connue: true })) } });
    const rep = await s.envoyer(s.jetonDe(await s.demanderLien()), pdfEssai());
    assert.equal(rep.statut, 200);
    assert.equal(rep.corps.dejaConnue, true);
    assert.equal(rep.corps.message, 'Facture déjà connue : sa lecture a été mise à jour avec ce nouveau document.');
  });

  test('D5 pas un vrai PDF', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(4000, 1)]);
    const html = Buffer.from(`<html>${' '.repeat(4000)}</html>`);
    const sansFin = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(4000, 0x20)]);
    const minuscule = Buffer.from('%PDF-1.7\n%%EOF');
    for (const [nom, octets] of [['image', png], ['html', html], ['sans fin', sansFin], ['trop petit', minuscule]]) {
      const s = await demarrer({ achats: { reseau: ok200() } });
      const r = await s.demanderLien();
      const rep = await s.envoyer(s.jetonDe(r), octets, `${nom}.pdf`);
      assert.equal(rep.statut, 422, nom);
      assert.equal(rep.corps.ok, false);
      assert.equal(s.e.base.tickets(), 0, nom);
      assert.equal(s.e.reseau.appels.length, 0, nom);
      assert.equal(liens(s).length, 1, `${nom} : lien rendu`);
    }
    // cas vide : 0 octet
    const s = await demarrer({ achats: { reseau: ok200() } });
    const vide = await s.envoyer(s.jetonDe(await s.demanderLien()), Buffer.alloc(0));
    assert.equal(vide.statut, 400);
    assert.equal(vide.corps.erreur, 'Le fichier est vide ou n\'a pas été reçu.');
  });

  test('D6 lien périmé ou déjà servi', async () => {
    let lacher;
    const attente = new Promise((ok) => { lacher = ok; });
    const s = await demarrer({ achats: { reseau: fauxReseau(async () => { await attente; return reponse(200, { ok: true, facture_id: FACTURE }); }) } });
    const j = s.jetonDe(await s.demanderLien());
    const deux = [s.envoyer(j, pdfEssai()), s.envoyer(j, pdfEssai())];
    await new Promise((ok) => setTimeout(ok, 50));
    lacher();
    const statuts = (await Promise.all(deux)).map((r) => r.statut).sort();
    assert.deepEqual(statuts, [200, 404], 'un seul passe');
    assert.equal(s.e.reseau.appels.length, 1);
    assert.equal((await s.envoyer('A'.repeat(43), pdfEssai())).statut, 404, 'lien inconnu');
    assert.equal((await s.page('A'.repeat(43))).status, 404);
  });

  test('D7 ticket absent ou périmé : refus', async () => {
    const s = await demarrer({ achats: { reseau: fauxReseau(() => reponse(401, {})) } });
    const rep = await s.envoyer(s.jetonDe(await s.demanderLien()), pdfEssai());
    assert.equal(rep.statut, 502);
    assert.equal(rep.corps.erreur, 'Le serveur a refusé l\'opération. Demande un nouveau lien.');
    assert.equal(s.e.reseau.appels.length, 2, 'un seul nouvel essai, ticket neuf');
    assert.equal(liens(s).length, 0);
    const { fausseBase } = await import('./_achats-essai.js');
    const plafond = fausseBase({ panne: (sql) => { if (sql.includes('"demander_ticket_n8n"')) throw Object.assign(new Error('trop'), { code: 'P0001', detail: 'ticket_trop_de_demandes' }); } });
    const s2 = await demarrer({ achats: { base: plafond, reseau: ok200() } });
    const rep2 = await s2.envoyer(s2.jetonDe(await s2.demanderLien()), pdfEssai());
    assert.equal(rep2.statut, 503);
    assert.ok(!rep2.corps.ok);
    assert.equal(s2.e.reseau.appels.length, 0, 'rien n’est parti');
    assert.equal(liens(s2).length, 1, 'lien rendu : rien n’a été envoyé');
    const s3 = await demarrer({ achats: { reseau: fauxReseau(() => reponse(200, { ok: true })) } });
    const rep3 = await s3.envoyer(s3.jetonDe(await s3.demanderLien()), pdfEssai());
    assert.equal(rep3.statut, 502, 'jamais « ajoutée » sans identifiant de facture');
  });

  test('D8 compte retiré : refus au dépôt', async () => {
    const comptes = [EMAIL];
    const s = await demarrer({ achats: { comptes, reseau: ok200() } });
    const j = s.jetonDe(await s.demanderLien());
    comptes.length = 0; // le compte est retiré de comptes_autorises entre le lien et l'envoi
    const rep = await s.envoyer(j, pdfEssai());
    assert.equal(rep.statut, 403);
    assert.equal(rep.corps.erreur, 'Accès refusé.');
    assert.equal(s.e.base.journal.length, 0, 'base jamais ouverte');
    assert.equal(s.e.reseau.appels.length, 0);
    // la demande du lien elle-même est refusée pour un compte non autorisé ou sans e-mail
    const s2 = await demarrer({ achats: { comptes: [] } });
    await assert.rejects(s2.demanderLien(), { message: MESSAGE_ACCES_REFUSE });
    await assert.rejects(s2.demanderLien({}, { email: undefined }), { message: MESSAGE_ACCES_REFUSE });
    assert.equal(liens(s2).length, 0);
    assert.equal(s2.reservees(), 0);
  });

  test('D9 délai : message incertain, pas d’échec sec', async () => {
    const delai = fauxReseau(() => { throw Object.assign(new Error('délai'), { name: 'TimeoutError' }); });
    const s = await demarrer({ achats: { reseau: delai } });
    const rep = await s.envoyer(s.jetonDe(await s.demanderLien()), pdfEssai());
    assert.equal(rep.statut, 504);
    assert.equal(rep.corps.erreur, MESSAGE_INCERTAIN);
    assert.equal(liens(s).length, 0, 'consommé (le doublon par empreinte protège)');
  });

  test('D10 journal propre', async () => {
    const journalDepot = [];
    const s = await demarrer({ achats: { reseau: ok200() }, journalDepot });
    const r = await s.demanderLien({ nom: 'secret-fournisseur.pdf' });
    await s.envoyer(s.jetonDe(r), pdfEssai(), 'secret-fournisseur.pdf');
    const s2 = await demarrer({ achats: { reseau: fauxReseau(() => reponse(401, {})) } , journalDepot });
    await s2.envoyer(s2.jetonDe(await s2.demanderLien()), pdfEssai(), 'secret-fournisseur.pdf');
    const texte = JSON.stringify([s.journal, s2.journal, journalDepot]);
    assert.ok(s.journal.length > 0 && journalDepot.length > 0);
    for (const interdit of [s.jetonDe(r), s2.jetonDe ? 'ticket-' : '', 'secret-fournisseur', EMAIL, '%PDF', 'https://', N8N]) if (interdit) assert.ok(!texte.includes(interdit), interdit);
  });

  test('D11 ancien dépôt inchangé', async () => {
    // un lien de document (affaire) marche comme avant, même avec le service des achats branché
    const collections = structuredClone(base);
    const donnees = creerAccesMemoire(collections);
    const objets = new Map();
    let appelsAchat = 0;
    const g = creerGestionnaireDepot({
      donnees: () => donnees, stockage: { deposer: async (c, o) => { objets.set(c, o); }, supprimer: async () => {} }, maintenant: () => MAINTENANT.getTime(),
      deposerAchat: async () => { appelsAchat += 1; return { statut: 200, corps: {} }; },
    });
    const serveur = createServer((req, res) => { const m = []; req.on('data', (x) => m.push(x)); req.on('end', () => { req.rawBody = Buffer.concat(m); g(req, res); }); });
    await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
    arrets.push(() => new Promise((ok) => serveur.close(ok)));
    const jeton = await emettreLienDepot({ donnees, cibleType: 'affaire', cibleId: 'a1', acteur: 'assistant-essai', maintenant: MAINTENANT.getTime() });
    const page = await (await fetch(`http://127.0.0.1:${serveur.address().port}/depot/${jeton}`)).text();
    assert.match(page, /onglet « Documents »/);
    assert.ok(!page.includes('accept="application/pdf'));
    const r = await fetch(`http://127.0.0.1:${serveur.address().port}/depot/${jeton}?nom=piece.pdf`, { method: 'PUT', body: pdfEssai() });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).affaireId, 'a1');
    assert.equal(objets.size, 1);
    assert.equal(appelsAchat, 0);
    // sans deposerAchat (plateforme des clients) : un lien d'achat répond « plus valable », page comprise, et n'est pas consommé pour rien
    const s = await demarrer({ brancher: false, achats: { reseau: ok200() } });
    const j = s.jetonDe(await s.demanderLien());
    assert.equal((await s.page(j)).status, 404);
    const rep = await s.envoyer(j, pdfEssai());
    assert.equal(rep.statut, 404);
    assert.match(rep.corps.erreur, /n'est plus valable/);
    assert.equal(s.e.reseau.appels.length, 0);
    // genre inconnu ou lien d'achat sans compte : refusés à la création
    await assert.rejects(emettreLienDepot({ donnees, genre: 'autre', acteur: 'x', maintenant: 0 }));
    await assert.rejects(emettreLienDepot({ donnees, genre: 'depot_achat', acteur: 'x', maintenant: 0 }));
    // un serveur sans lien d'envoi : l'outil le dit
    await assert.rejects(s.demanderLien({}, { lienDepot: null }), /lien d'envoi n'existe pas/);
  });

  test('D12 adresse contrôlée dès le lien', async () => {
    const cas = [
      { connexion: { ...CONNEXION, webhooks: { ...WEBHOOKS, ajoutFacture: undefined } } },
      { connexion: { ...CONNEXION, webhooks: { ...WEBHOOKS, ajoutFacture: 'https://pirate.exemple.test/ajout' } } },
      { connexion: { ...CONNEXION, webhooks: { ...WEBHOOKS, ajoutFacture: 'http://n8n.exemple.test/ajout' } } },
      { n8n: '' },
    ];
    for (const [i, c] of cas.entries()) {
      const s = await demarrer({ achats: c });
      await assert.rejects(s.demanderLien(), { message: MESSAGE_ADRESSE }, `cas ${i}`);
      assert.equal(liens(s).length, 0, `cas ${i} : aucun lien`);
      assert.equal(s.reservees(), 0);
    }
    const pasBranchee = await demarrer({ achats: { config: async () => { throw new ConfigurationAbsente('absent'); } } });
    await assert.rejects(pasBranchee.demanderLien(), { message: MESSAGE_PAS_BRANCHEE });
    // l'adresse change entre le lien et l'envoi : rien n'est envoyé, le lien est rendu
    let connexion = CONNEXION;
    const s = await demarrer({ achats: { connexion: () => connexion, reseau: ok200() } });
    const j = s.jetonDe(await s.demanderLien());
    connexion = { ...CONNEXION, webhooks: { ...WEBHOOKS, ajoutFacture: 'https://pirate.exemple.test/ajout' } };
    const rep = await s.envoyer(j, pdfEssai());
    assert.equal(rep.statut, 503);
    assert.equal(rep.corps.erreur, MESSAGE_ADRESSE);
    assert.equal(s.e.reseau.appels.length, 0);
    assert.equal(liens(s).length, 1);
  });
});
