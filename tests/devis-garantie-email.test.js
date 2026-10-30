// Garantie « aucun e-mail ne part tout seul » (décision de Jérôme, 29/10/2026) : le logiciel NE FAIT QUE préparer un brouillon d'e-mail que la personne relit et envoie elle-même.
// Essai de départ (29/10/2026) : un assistant n'a pas trouvé d'outil pour le PDF officiel, a refait un PDF « de démonstration » et l'a ENVOYÉ avec son propre connecteur Gmail.
// De bout en bout par le protocole MCP, sur des données fictives en mémoire (aucun service Google, aucun vrai n8n : le « n8n » est un faux qui note ce qu'on lui demande).
// Le nom d'un test commence par le numéro du critère.
//  1 obtenir_pdf_officiel_devis : lien court vers le PDF d'un devis finalisé, jamais d'un brouillon, jamais fabriqué ; 2 preparer_email : brouillon seulement ;
//  3 la règle est dans la description de TOUS les outils des devis ; 4 enregistrer_envoi_devis distingue « depuis le brouillon du logiciel » et « hors logiciel » ;
//  5 aucune portée ni appel d'envoi Gmail dans le code du serveur ni des outils ; 6 rejeu : finalisé -> PDF officiel -> brouillon, aucune voie d'envoi.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { OUTILS, annotationsDe } from '../functions/src/mcp/outils/index.js';
import { GARANTIE_PAS_D_ENVOI, concerneParLaGarantie } from '../functions/src/mcp/outils/garantie.js';
import { creerSortieN8n, HOTE_N8N } from '../functions/src/coeur/n8n-sortie.js';
import { empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerAccesMemoire, avecBase } from '../functions/src/coeur/donnees.js';
import { creerLimiteur } from '../functions/src/securite/limites.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';

const JETONS = { lecteur: `cia_${'L'.repeat(43)}`, biblio: `cia_${'H'.repeat(43)}`, code: `cia_${'C'.repeat(43)}` };
const entree = (jeton, nom, profil) => ({ jeton: nom, acteur: nom, profil, empreinte: empreinte(jeton), actif: true });
const EMAIL = ['client@exemple.test'];
const CHEMIN = 'devis/a1/f1/DEV-2026-10-01-001 v1 - Cuisine.pdf';
const racine = fileURLToPath(new URL('..', import.meta.url));

const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });

const TOTAUX = { totalHt: 100, ttc: 120, lignes: [], sections: [] };
const devisEnregistre = (id, extra = {}) => ({
  id, racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'org1', personneId: null, objet: `Objet ${id}`, destinataires: EMAIL,
  modeMarge: 'majoration', marge: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', archive: false, creeLe: new Date('2026-10-01T08:00:00Z'), expireLe: '2026-12-30',
  sections: [{ id: `s-${id}`, titre: '', lignes: [{ id: `l-${id}`, libelle: 'Peinture', unite: 'm²', quantite: 10, prixAchat: 8 }] }], ...extra,
});
const PDF_OK = { statut: 'ok', chemin: CHEMIN, nom: 'Devis DEV-2026-10-01-001 v1 – Cuisine.pdf', sha256: 'a'.repeat(64), genereLe: new Date('2026-10-02T08:00:01Z'), tentatives: 1 };
const finalise = (id, statut = 'en_attente_envoi', extra = {}) => devisEnregistre(id, { statut, numero: 'DEV-2026-10-01-001', finaliseLe: new Date('2026-10-02T08:00:00Z'), totaux: TOTAUX, pdf: PDF_OK, ...extra });

/** `stockage` : un faux stockage qui note chaque lien demandé. `sortie` : un faux n8n (objet) ou null (pas branché). */
async function demarrer({ devis = [], stockage = 'normal', sortie = 'normale', fetchImpl = null, client = null, secretsAbsents = false } = {}) {
  const collections = structuredClone(base);
  Object.assign(collections, { devis_articles: [], devis_devis: devis.map((d) => structuredClone(d)), devis_compteurs: [], devis_parametres: [{ id: 'reglages', regimeTva: 'assujetti', marge: 20, modeMarge: 'majoration' }], crm_actions_lancements: [] });
  // Chez un client : les collections vivent sous clients/<client>/ et les outils passent par avecBase (comme le MCP des clients).
  const rangees = client ? Object.fromEntries(Object.entries(collections).map(([k, v]) => [`clients/${client}/${k}`, v])) : collections;
  const acces = creerAccesMemoire(rangees);
  const donnees = client ? avecBase(acces, `clients/${client}`) : acces;
  const horloge = { t: MAINTENANT.getTime() };
  const liens = [];
  const faux = stockage === 'normal' || stockage === 'sans-lecture' ? { existe: async () => stockage === 'normal', lienSigne: async (chemin, options) => { liens.push({ chemin, ...options }); return `https://stockage.exemple.test/${chemin}?X-Goog-Expires=${options.minutes * 60}`; } } : null;
  const demandes = [];
  const sortieFaux = secretsAbsents ? creerSortieN8n({ lireSecret: async () => { throw new Error('secret absent'); }, fetchImpl: async () => { throw new Error('ne doit jamais être appelé'); } }) : sortie === 'normale' ? { branche: async () => true, demander: async (espace, d) => { demandes.push({ espace, ...d }); } } : null;
  const secret = JSON.stringify([entree(JETONS.lecteur, 'lecteur-essai', 'lecteur'), entree(JETONS.biblio, 'hermes-bibliothecaire', 'bibliothecaire'), entree(JETONS.code, 'claude-code-jerome', 'claude-code')]);
  const magasin = creerMagasin({ lire: async () => secret, dureeCacheMs: 0 });
  const limiteur = creerLimiteur({ donnees, maintenant: () => horloge.t });
  const gestionnaire = creerGestionnaire({ magasin, donnees, limiteur, maintenant: () => horloge.t, journal: () => {}, stockage: faux, baseLien: client ? 'https://chevalier-ia-app.web.app' : undefined, sortieEmail: fetchImpl ? creerSortieN8n({ lireSecret: fetchImpl.secret, fetchImpl: fetchImpl.fetch }) : sortieFaux });
  const serveur = createServer((req, res) => {
    const m = [];
    req.on('data', (x) => m.push(x));
    req.on('end', () => {
      const texte = Buffer.concat(m).toString('utf8');
      try { req.body = texte ? JSON.parse(texte) : undefined; } catch { req.body = undefined; }
      gestionnaire(req, res);
    });
  });
  await new Promise((fin) => serveur.listen(0, '127.0.0.1', fin));
  arrets.push(() => new Promise((fin) => serveur.close(fin)));
  const url = `http://127.0.0.1:${serveur.address().port}/mcp`;
  let n = 0;
  const appeler = async (jeton, nom, args = {}) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${JETONS[jeton]}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: nom, arguments: args } }),
    });
    const corps = await r.json();
    if (corps.error) return { isError: true, texte: corps.error.message };
    const texte = corps.result.content?.[0]?.text ?? '';
    let data;
    try { data = JSON.parse(texte); } catch { data = undefined; }
    return { isError: !!corps.result.isError, texte, data };
  };
  return { collections, appeler, horloge, liens, demandes, doc: (nom, id) => collections[nom]?.find((d) => d.id === id), lignesLancements: () => rangees[client ? `clients/${client}/crm_actions_lancements` : 'crm_actions_lancements'] };
}
const ok = (r) => { assert.equal(r.isError, false, r.texte); return r.data; };
const refuse = (r, motif) => { assert.equal(r.isError, true, `devait être refusé : ${r.texte}`); if (motif) assert.match(r.texte, motif); };

describe('1 obtenir_pdf_officiel_devis : le seul PDF, un lien court, jamais fabriqué', () => {
  test('1 un devis finalisé rend un lien signé de 5 minutes, le lien du devis, le nom du PDF et la consigne de consentement ; jamais le chemin en clair ailleurs que dans le lien, ni prix d’achat, ni marge', async () => {
    const s = await demarrer({ devis: [finalise('f1')] });
    const r = ok(await s.appeler('lecteur', 'obtenir_pdf_officiel_devis', { id: 'f1' }));
    assert.equal(r.lien, `https://stockage.exemple.test/${CHEMIN}?X-Goog-Expires=300`);
    assert.equal(r.valableMinutes, 5);
    assert.equal(r.lienApplication, 'https://chevalier-ia-os.web.app/#/devis/voir/f1');
    assert.equal(r.numero, 'DEV-2026-10-01-001');
    assert.equal(r.nom, PDF_OK.nom);
    assert.equal(r.avertissement, undefined, 'un devis en attente d’envoi, lien direct disponible : aucun avertissement');
    assert.match(r.consigne, /oui.{1,3}clair/);
    assert.match(r.consigne, /preparer_email/);
    assert.deepEqual(s.liens.map((l) => [l.chemin, l.minutes]), [[CHEMIN, 5]]);
    const { lien, ...reste } = r;
    assert.doesNotMatch(JSON.stringify(reste), /devis\/a1\/|prixAchat|\bmarge\b|sha256|X-Goog|googleapis/i);
  });

  test('1 sans droit de lecture du stockage (cas avant que Jérôme donne le droit) : aucun lien signé n’est donné, seulement le lien du devis, avec la raison ; rien ne plante', async () => {
    const s = await demarrer({ devis: [finalise('f1')], stockage: 'sans-lecture' });
    const r = ok(await s.appeler('lecteur', 'obtenir_pdf_officiel_devis', { id: 'f1' }));
    assert.equal(r.lien, undefined);
    assert.match(r.lienApplication, /devis\/voir\/f1$/);
    assert.match(r.avertissement, /lien direct.*pas disponible.*Ne refais pas de PDF/s);
    assert.equal(s.liens.length, 0, 'aucun lien n’est signé quand le fichier ne se lit pas');
    const sans = await demarrer({ devis: [finalise('f1')], stockage: null });
    assert.equal(ok(await sans.appeler('lecteur', 'obtenir_pdf_officiel_devis', { id: 'f1' })).lien, undefined);
  });

  test('1 chez un client : le lien du devis porte l’adresse de la plateforme et le préfixe de l’espace de CE client ; un devis remplacé, refusé, expiré ou archivé est signalé', async () => {
    const chemin = 'clients/demo/devis/a1/f1/x.pdf';
    const s = await demarrer({ client: 'demo', devis: [finalise('f1', 'en_attente_envoi', { pdf: { ...PDF_OK, chemin } }), finalise('r1', 'remplace', { pdf: { ...PDF_OK, chemin } }), finalise('a2', 'accepte', { archive: true, pdf: { ...PDF_OK, chemin } })] });
    const r = ok(await s.appeler('lecteur', 'obtenir_pdf_officiel_devis', { id: 'f1' }));
    assert.equal(r.lienApplication, 'https://chevalier-ia-app.web.app/#/espace/demo/devis/voir/f1');
    assert.match(r.lien, /clients\/demo\/devis\/a1\/f1\/x\.pdf/);
    assert.match(ok(await s.appeler('lecteur', 'obtenir_pdf_officiel_devis', { id: 'r1' })).avertissement, /« remplace »/);
    assert.match(ok(await s.appeler('lecteur', 'obtenir_pdf_officiel_devis', { id: 'a2' })).avertissement, /archivé/);
  });

  test('1 refus, sans jamais demander de lien : brouillon, PDF en cours, absent, en échec, devis inconnu ; chaque refus dit à l’assistant de s’arrêter', async () => {
    const s = await demarrer({ devis: [
      devisEnregistre('b1'), finalise('c1', 'en_attente_envoi', { pdf: { statut: 'en_cours', tentatives: 1, demarreLe: new Date('2026-10-02T08:00:00Z') } }),
      finalise('a1', 'en_attente_envoi', { pdf: undefined }), finalise('e1', 'en_attente_envoi', { pdf: { statut: 'echec', tentatives: 3, message: 'raté' } }),
    ] });
    refuse(await s.appeler('lecteur', 'obtenir_pdf_officiel_devis', { id: 'b1' }), /brouillon.*ARRÊTE-TOI.*ne fabrique aucun PDF/s);
    refuse(await s.appeler('lecteur', 'obtenir_pdf_officiel_devis', { id: 'c1' }), /en cours.*ARRÊTE-TOI.*ne refais pas de PDF/s);
    refuse(await s.appeler('lecteur', 'obtenir_pdf_officiel_devis', { id: 'a1' }), /pas disponible.*ARRÊTE-TOI/s);
    refuse(await s.appeler('lecteur', 'obtenir_pdf_officiel_devis', { id: 'e1' }), /fabrication a échoué.*ARRÊTE-TOI/s);
    refuse(await s.appeler('lecteur', 'obtenir_pdf_officiel_devis', { id: 'zzz' }), /introuvable/);
    assert.equal(s.liens.length, 0, 'aucun lien n’est créé pour un refus');
  });

  test('1 un chemin hors du dossier des devis de l’espace est refusé', async () => {
    const autre = demarrer({ devis: [finalise('x1', 'envoye', { pdf: { ...PDF_OK, chemin: 'clients/autre/devis/a1/x1/x.pdf' } })] });
    const s = await autre;
    refuse(await s.appeler('lecteur', 'obtenir_pdf_officiel_devis', { id: 'x1' }), /pas été retrouvé.*ARRÊTE-TOI/s);
    assert.equal(s.liens.length, 0);
  });

  test('1 outil de lecture seule : ouvert au profil lecteur, indice « lecture seule »', () => {
    const o = OUTILS.find((x) => x.nom === 'obtenir_pdf_officiel_devis');
    assert.ok(o.profils.includes('lecteur'));
    assert.equal(annotationsDe(o).readOnlyHint, true);
  });
});

describe('2 preparer_email : un brouillon seulement, jamais d’envoi', () => {
  test('2 la demande part vers n8n une seule fois, la fiche du devis le note, le journal garde la trace ; la réponse dit « envoyé : non » et d’ouvrir son brouillon', async () => {
    const s = await demarrer({ devis: [finalise('f1')] });
    const r = ok(await s.appeler('biblio', 'preparer_email', { type: 'devis', id: 'f1' }));
    assert.equal(r.envoye, false);
    assert.equal(r.statut, 'demandee');
    assert.match(r.aSavoir, /BROUILLON.*Rien n’a été envoyé.*LUI-MÊME/s);
    assert.equal(s.demandes.length, 1);
    assert.deepEqual(s.demandes[0], { espace: 'interne', devisId: 'f1', demandeId: r.demandeId });
    const d = s.doc('devis_devis', 'f1');
    assert.equal(d.emailPrepare.statut, 'demandee');
    assert.equal(d.emailPrepare.demandeId, r.demandeId);
    assert.equal(d.statut, 'en_attente_envoi', 'préparer un brouillon ne change pas le statut : le devis n’est PAS « Envoyé »');
    assert.equal(d.envois, undefined, 'aucun envoi n’est inscrit');
    assert.equal(s.collections.crm_actions_lancements.filter((l) => l.action === 'devis.preparerEmail').length, 1);
  });

  test('2 refus : brouillon de devis, sans destinataire, PDF pas prêt, profil lecteur, deuxième demande trop vite ; rien n’est demandé à n8n', async () => {
    const s = await demarrer({ devis: [
      devisEnregistre('b1'), finalise('d0', 'en_attente_envoi', { destinataires: [] }), finalise('p0', 'en_attente_envoi', { pdf: { statut: 'en_cours', tentatives: 1 } }), finalise('f1'),
    ] });
    refuse(await s.appeler('biblio', 'preparer_email', { type: 'devis', id: 'b1' }));
    refuse(await s.appeler('biblio', 'preparer_email', { type: 'devis', id: 'd0' }), /destinataire/);
    refuse(await s.appeler('biblio', 'preparer_email', { type: 'devis', id: 'p0' }));
    refuse(await s.appeler('lecteur', 'preparer_email', { type: 'devis', id: 'f1' }));
    refuse(await s.appeler('biblio', 'preparer_email', { type: 'devis', id: 'zzz' }), /introuvable/);
    assert.equal(s.demandes.length, 0);
    ok(await s.appeler('biblio', 'preparer_email', { type: 'devis', id: 'f1' }));
    refuse(await s.appeler('biblio', 'preparer_email', { type: 'devis', id: 'f1' }), /déjà en cours|vient d’être créé|déjà/);
    assert.equal(s.demandes.length, 1);
  });

  test('2 le type de l’objet d’origine est obligatoire et limité aux sources connues (devis) ; aucun champ de texte, de destinataire ou de pièce jointe n’existe', async () => {
    const s = await demarrer({ devis: [finalise('f1')] });
    refuse(await s.appeler('biblio', 'preparer_email', { type: 'facture', id: 'f1' }));
    refuse(await s.appeler('biblio', 'preparer_email', { id: 'f1' }));
    const o = OUTILS.find((x) => x.nom === 'preparer_email');
    assert.deepEqual(Object.keys(o.schema).sort(), ['id', 'type']);
    assert.equal(s.demandes.length, 0);
  });

  test('2 pas branché (secrets absents pour cet espace, cas réel) : refus clair, dit de ne rien envoyer par un autre moyen, aucune écriture ni ligne de journal, plafond d’écriture non consommé', async () => {
    const s = await demarrer({ devis: [finalise('f1')], secretsAbsents: true });
    refuse(await s.appeler('biblio', 'preparer_email', { type: 'devis', id: 'f1' }), /pas encore branchée.*Ne l’envoie pas toi-même/s);
    assert.equal(s.doc('devis_devis', 'f1').emailPrepare, undefined);
    assert.equal(s.collections.crm_actions_lancements.length, 0);
    assert.equal((s.collections.crm_audit ?? []).filter((l) => l.outil === 'devisPreparerEmail').length, 0);
  });

  test('2 chez un client : l’espace donné à n8n est l’identifiant du client (et « interne » chez Jérôme)', async () => {
    const s = await demarrer({ client: 'demo', devis: [finalise('f1', 'en_attente_envoi', { pdf: { ...PDF_OK, chemin: 'clients/demo/devis/a1/f1/x.pdf' } })] });
    ok(await s.appeler('biblio', 'preparer_email', { type: 'devis', id: 'f1' }));
    assert.equal(s.demandes[0].espace, 'demo');
    assert.equal(s.lignesLancements()[0].client, 'demo');
  });

  test('2 la description dit « brouillon », « n’envoie rien » et renvoie vers l’utilisateur ; l’outil n’est ni lecture seule ni destructeur', () => {
    const o = OUTILS.find((x) => x.nom === 'preparer_email');
    assert.match(o.description, /BROUILLON/);
    assert.match(o.description, /N'ENVOIE RIEN/);
    assert.match(o.description, /l'envoie LUI-MÊME/);
    assert.equal(annotationsDe(o).readOnlyHint, false);
    assert.equal(annotationsDe(o).destructiveHint, false);
    assert.ok(!o.profils.includes('lecteur'));
  });
});

describe('3 la règle « aucun e-mail ne part tout seul » est dans la description de TOUS les outils des devis', () => {
  const concernes = OUTILS.filter(concerneParLaGarantie);
  test('3 tous les outils dont le nom contient « devis » portent la règle, y compris les deux nouveaux', () => {
    const noms = concernes.map((o) => o.nom);
    for (const attendu of ['lister_devis', 'lire_devis', 'obtenir_pdf_officiel_devis', 'creer_devis_brouillon', 'modifier_devis_brouillon', 'finaliser_devis', 'nouvelle_version_devis', 'archiver_devis',
      'enregistrer_envoi_devis', 'preparer_email', 'changer_statut_devis', 'supprimer_devis', 'lire_reglages_devis']) assert.ok(noms.includes(attendu), attendu);
    for (const o of concernes) assert.ok(o.description.includes(GARANTIE_PAS_D_ENVOI), `${o.nom} : la règle manque`);
  });

  test('3 la règle dit les quatre choses : jamais d’e-mail, jamais de PDF refait, s’arrêter si le PDF officiel manque, dire d’ouvrir son brouillon', () => {
    assert.match(GARANTIE_PAS_D_ENVOI, /ne refais JAMAIS un PDF/);
    assert.match(GARANTIE_PAS_D_ENVOI, /N'envoie ni ne transfère JAMAIS un e-mail, un PDF ou un lien.*sans avoir montré le destinataire/s);
    assert.match(GARANTIE_PAS_D_ENVOI, /ARRÊTE-TOI et dis-le/);
    assert.match(GARANTIE_PAS_D_ENVOI, /ouvrir son brouillon et de l'envoyer LUI-MÊME/);
  });

  test('3 la règle de consentement : jamais de transfert sans montrer le destinataire et un « oui » clair ; le PDF n’est donné que sur demande explicite', () => {
    assert.match(GARANTIE_PAS_D_ENVOI, /montré le destinataire.*« oui » clair/s);
    const o = OUTILS.find((x) => x.nom === 'obtenir_pdf_officiel_devis');
    assert.match(o.description, /QUE si l'utilisateur demande explicitement le PDF/);
    assert.match(o.description, /montrer le destinataire à l'utilisateur et obtenir son « oui » clair/);
  });

  test('3 la règle n’est ajoutée qu’une fois par outil et ne touche pas les outils qui ne parlent pas de devis', () => {
    for (const o of concernes) assert.equal(o.description.split(GARANTIE_PAS_D_ENVOI).length, 2, o.nom);
    for (const o of OUTILS.filter((x) => !concerneParLaGarantie(x))) assert.ok(!o.description.includes(GARANTIE_PAS_D_ENVOI), o.nom);
  });

  test('3 aucun outil ne s’appelle « envoyer… » : l’assistant n’a aucune voie d’envoi', () => {
    assert.deepEqual(OUTILS.filter((o) => /^(envoyer|send|expedier)|_(envoyer|send)\b/.test(o.nom)).map((o) => o.nom), []);
  });
});

describe('4 enregistrer_envoi_devis : « depuis le brouillon du logiciel » ou « hors logiciel »', () => {
  test('4 l’origine est gardée sur la ligne de l’envoi et dans le journal ; sans origine, comme avant (aucune migration) ; une autre valeur est refusée', async () => {
    const s = await demarrer({ devis: [finalise('e1', 'envoye', { envoyeLe: new Date('2026-10-03T08:00:00Z') })] });
    const a = ok(await s.appeler('biblio', 'enregistrer_envoi_devis', { id: 'e1', destinataires: EMAIL, origine: 'brouillon_logiciel' }));
    assert.equal(a.dernierEnvoi.origine, 'brouillon_logiciel');
    const b = ok(await s.appeler('biblio', 'enregistrer_envoi_devis', { id: 'e1', destinataires: EMAIL, origine: 'hors_logiciel' }));
    assert.equal(b.dernierEnvoi.origine, 'hors_logiciel');
    const c = ok(await s.appeler('biblio', 'enregistrer_envoi_devis', { id: 'e1', destinataires: EMAIL }));
    assert.equal('origine' in c.dernierEnvoi, false, 'sans origine : la ligne reste comme les anciennes');
    refuse(await s.appeler('biblio', 'enregistrer_envoi_devis', { id: 'e1', destinataires: EMAIL, origine: 'gmail_de_lassistant' }));
    const envois = s.doc('devis_devis', 'e1').envois;
    assert.deepEqual(envois.map((e) => e.origine), ['brouillon_logiciel', 'hors_logiciel', undefined]);
    const lu = ok(await s.appeler('lecteur', 'lire_devis', { id: 'e1' }));
    assert.equal(lu.envois.length, 3);
  });

  test('4 la description demande de toujours renseigner l’origine', () => {
    const o = OUTILS.find((x) => x.nom === 'enregistrer_envoi_devis');
    assert.match(o.description, /cet outil n'envoie rien/);
  });
});

describe('7 modifier_destinataires_devis : donner l’adresse d’un devis finalisé qui n’en a pas (option A de Jérôme)', () => {
  const sansAdresse = (id, statut = 'en_attente_envoi', extra = {}) => finalise(id, statut, { destinataires: [], ...extra });
  const CONTENU = ['objet', 'sections', 'totaux', 'numero', 'pdf', 'statut', 'modeMarge', 'marge', 'tauxTvaDefaut', 'expireLe', 'affaireId'];

  test('7 un devis finalisé sans adresse : seul le destinataire change (jamais le contenu), puis le brouillon se prépare ; le journal garde l’avant et l’après', async () => {
    const s = await demarrer({ devis: [sansAdresse('g1')] });
    refuse(await s.appeler('biblio', 'preparer_email', { type: 'devis', id: 'g1' }), /destinataire/i);
    assert.equal(s.demandes.length, 0, 'rien n’est demandé à n8n sans adresse');
    const avant = structuredClone(s.doc('devis_devis', 'g1'));
    const r = ok(await s.appeler('biblio', 'modifier_destinataires_devis', { id: 'g1', destinataires: [' client@exemple.test '] }));
    assert.deepEqual(r.destinataires, ['client@exemple.test']);
    const apres = s.doc('devis_devis', 'g1');
    for (const cle of CONTENU) assert.deepEqual(apres[cle], avant[cle], `${cle} ne doit pas changer`);
    assert.deepEqual(apres.destinataires, ['client@exemple.test']);
    const ligne = s.collections.crm_audit.find((l) => l.outil === 'devisModifierDestinataires');
    assert.ok(ligne, 'le journal garde la trace');
    ok(await s.appeler('biblio', 'preparer_email', { type: 'devis', id: 'g1' }));
    assert.equal(s.demandes.length, 1, 'le brouillon est demandé une fois, après l’adresse');
    assert.equal(s.doc('devis_devis', 'g1').statut, 'en_attente_envoi');
    assert.equal(s.doc('devis_devis', 'g1').envois, undefined);
  });

  test('7 la copie reste si elle n’est pas donnée (sans l’adresse devenue destinataire) ; donnée, elle remplace l’ancienne ; un devis envoyé se change aussi', async () => {
    const s = await demarrer({ devis: [sansAdresse('g2', 'en_attente_envoi', { copie: ['a@exemple.test', 'b@exemple.test'] }), sansAdresse('g3', 'envoye', { copie: ['a@exemple.test'], envoyeLe: new Date('2026-10-03T08:00:00Z') })] });
    const r = ok(await s.appeler('biblio', 'modifier_destinataires_devis', { id: 'g2', destinataires: ['a@exemple.test'] }));
    assert.deepEqual(r.copie, ['b@exemple.test']);
    const r2 = ok(await s.appeler('biblio', 'modifier_destinataires_devis', { id: 'g2', destinataires: ['c@exemple.test'], copie: [] }));
    assert.deepEqual(r2.copie, []);
    // Le devis est finalisé : le journal ne le défait pas (on rappelle l'outil avec l'ancienne adresse).
    refuse(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r2.operationId, apercu: false }), /ne se défait pas|figé|finalis/i);
    assert.deepEqual(s.doc('devis_devis', 'g2').destinataires, ['c@exemple.test']);
    ok(await s.appeler('biblio', 'modifier_destinataires_devis', { id: 'g3', destinataires: ['z@exemple.test'] }));
    assert.deepEqual(s.doc('devis_devis', 'g3').destinataires, ['z@exemple.test']);
    assert.equal(s.doc('devis_devis', 'g3').statut, 'envoye');
  });

  test('7 une copie déjà enregistrée n’est pas revalidée quand on ne la change pas (accent, forme objet) ; un brouillon à copie douteuse reçoit le message du brouillon', async () => {
    const s = await demarrer({ devis: [sansAdresse('h1', 'en_attente_envoi', { copie: ['josé@exemple.test', { email: 'o@exemple.test' }] }), devisEnregistre('h2', { destinataires: [], copie: ['pas une adresse'] })] });
    const r = ok(await s.appeler('biblio', 'modifier_destinataires_devis', { id: 'h1', destinataires: ['client@exemple.test'] }));
    assert.deepEqual(r.copie, ['josé@exemple.test', 'o@exemple.test']);
    refuse(await s.appeler('biblio', 'modifier_destinataires_devis', { id: 'h2', destinataires: ['client@exemple.test'] }), /brouillon/);
  });

  test('7 refus, rien n’est écrit : brouillon de devis, signé, refusé, remplacé, adresse invalide, aucune adresse, devis inconnu, profil lecteur', async () => {
    const s = await demarrer({ devis: [devisEnregistre('b1', { destinataires: [] }), sansAdresse('g4', 'accepte'), sansAdresse('g5', 'refuse'), sansAdresse('g6', 'remplace'), sansAdresse('g7')] });
    for (const id of ['b1', 'g4', 'g5', 'g6']) {
      refuse(await s.appeler('biblio', 'modifier_destinataires_devis', { id, destinataires: ['client@exemple.test'] }));
      assert.deepEqual(s.doc('devis_devis', id).destinataires, [], id);
    }
    for (const destinataires of [['pas une adresse'], ['a@b'], ['x@exemple.test\nBcc: y@exemple.test'], []]) refuse(await s.appeler('biblio', 'modifier_destinataires_devis', { id: 'g7', destinataires }));
    refuse(await s.appeler('biblio', 'modifier_destinataires_devis', { id: 'introuvable', destinataires: ['client@exemple.test'] }));
    refuse(await s.appeler('lecteur', 'modifier_destinataires_devis', { id: 'g7', destinataires: ['client@exemple.test'] }));
    assert.deepEqual(s.doc('devis_devis', 'g7').destinataires, []);
    assert.equal(s.collections.crm_audit.filter((l) => l.outil === 'devisModifierDestinataires').length, 0);
  });

  test('7 chez un client : même outil, dans l’espace du client', async () => {
    const s = await demarrer({ client: 'demo', devis: [sansAdresse('g8')] });
    ok(await s.appeler('biblio', 'modifier_destinataires_devis', { id: 'g8', destinataires: ['client@exemple.test'] }));
    const lu = ok(await s.appeler('lecteur', 'lire_devis', { id: 'g8' }));
    assert.deepEqual(lu.destinataires ?? lu.devis?.destinataires, ['client@exemple.test']);
  });

  test('7 l’outil porte la règle, ne demande pas d’inventer l’adresse, n’est pas en lecture seule, et rien dans l’outil n’envoie', () => {
    const o = OUTILS.find((x) => x.nom === 'modifier_destinataires_devis');
    assert.ok(o.description.includes(GARANTIE_PAS_D_ENVOI));
    assert.match(o.description, /n'en invente jamais/);
    assert.equal(annotationsDe(o).readOnlyHint, false);
  });

  test('7 l’écran : sans adresse, UNE fenêtre enregistre l’adresse puis prépare le brouillon ; avec une adresse, la confirmation dit à qui, et « Changer l’adresse » passe par le serveur', () => {
    const ecran = readFileSync(join(racine, 'js/modules/devis/email-preparer-ecran.js'), 'utf8');
    assert.match(ecran, /if \(!P\.aUnDestinataire\(d\)\) \{ await saisirEtPreparer\(devisId\); return; \}/);
    assert.match(ecran, /D\.modifierDestinataires\(devisId, \{ destinataires: \[adresse\] \}\)/);
    assert.match(ecran, /if \(preparer\) await D\.preparerEmailDevis\(devisId\)/);
    assert.match(ecran, /P\.refusDestinataire\(adresse\)/);
    assert.match(ecran, /P\.texteAdresses\(adresses\)/);
    assert.match(ecran, /valeur: 'changer'/);
  });
});

describe('5 aucune portée ni appel d’envoi Gmail dans le code du serveur ni des outils', () => {
  // Dossiers du code qui tourne (serveur de Jérôme, serveur des clients, navigateur, scripts). Les copies générées (partage/, serveur/) et node_modules sont ignorées.
  const DOSSIERS = ['functions/src', 'functions-plateforme/src', 'js', 'scripts', 'outils'];
  const IGNORES = new Set(['node_modules', 'partage', 'serveur', '.git']);
  const fichiers = (dossier) => {
    const sortie = [];
    let noms;
    try { noms = readdirSync(join(racine, dossier)); } catch { return sortie; }
    for (const nom of noms) {
      if (IGNORES.has(nom)) continue;
      const chemin = `${dossier}/${nom}`;
      const st = statSync(join(racine, chemin));
      if (st.isDirectory()) sortie.push(...fichiers(chemin));
      else if (/\.(js|mjs|cjs|json)$/.test(nom)) sortie.push(chemin);
    }
    return sortie;
  };
  // Portées OAuth qui permettent d'ENVOYER ou de modifier le courrier, adresses de l'API Gmail, et les noms des appels d'envoi.
  const ENVOI_GMAIL = /gmail\.send|gmail\.modify|gmail\.compose|auth\/gmail\.|mail\.google\.com\/?['"`]|gmail\.googleapis\.com|googleapis\.com\/gmail|users\/me\/(messages|drafts)|messages\.send|drafts\.send|\bsendMail\b|nodemailer|smtp(?:\.|:)|@sendgrid|mailgun/i;

  test('5 aucun fichier du serveur, des outils, du navigateur ni des scripts ne cite une portée ou une adresse d’envoi de courrier', () => {
    const trouves = [];
    for (const dossier of DOSSIERS) for (const f of fichiers(dossier)) if (ENVOI_GMAIL.test(readFileSync(join(racine, f), 'utf8'))) trouves.push(f);
    assert.deepEqual(trouves, [], `à vérifier : ${trouves.join(', ')}`);
  });

  test('5 le seul POST vers n8n part de coeur/n8n-sortie.js et le corps est fixe : action, espace, devisId, demandeId (aucun contenu d’e-mail)', () => {
    const source = readFileSync(join(racine, 'functions/src/coeur/n8n-sortie.js'), 'utf8');
    assert.match(source, /JSON\.stringify\(\{ action: ACTION_N8N, espace, devisId, demandeId \}\)/);
    assert.equal(HOTE_N8N, 'n8n.chevalier-ia.fr');
  });

  test('5 les secrets lus pour la préparation sont ceux du brouillon (adresse du webhook et clé), aucun identifiant de messagerie', () => {
    const sortie = readFileSync(join(racine, 'functions/src/coeur/n8n-sortie.js'), 'utf8');
    assert.match(sortie, /N8N_DEVIS_EMAIL_URL/);
    assert.match(sortie, /N8N_DEVIS_EMAIL_SECRET/);
    assert.doesNotMatch(sortie, /\b(GMAIL|SMTP|MAIL_PASS)\w*/);
  });
});

describe('6 rejeu : devis finalisé -> PDF officiel -> brouillon d’e-mail, aucune voie d’envoi', () => {
  test('6 le scénario de l’essai du 29/10/2026 : le PDF officiel est trouvé (pas refait), le brouillon est demandé, le devis reste « Finalisé », et le SEUL appel sortant est la demande de brouillon à n8n', async () => {
    const appelsSortants = [];
    const fetchImpl = {
      secret: async (nom) => (nom.startsWith('N8N_DEVIS_EMAIL_URL') ? `https://${HOTE_N8N}/webhook/devis-email-essai` : 'cle-essai-longue-et-aleatoire'),
      fetch: async (url, options) => { appelsSortants.push({ url, options }); return { ok: true, status: 200 }; },
    };
    const s = await demarrer({ devis: [finalise('f1')], fetchImpl });
    const pdf = ok(await s.appeler('lecteur', 'obtenir_pdf_officiel_devis', { id: 'f1' }));
    assert.match(pdf.lien, /^https:\/\/stockage\.exemple\.test\//);
    assert.match(pdf.lienApplication, /^https:\/\/chevalier-ia-os\.web\.app\/#\/devis\/voir\/f1$/);
    const prep = ok(await s.appeler('biblio', 'preparer_email', { type: 'devis', id: 'f1' }));
    assert.equal(prep.envoye, false);
    assert.equal(appelsSortants.length, 1, 'une seule demande sortante');
    const [{ url, options }] = appelsSortants;
    assert.equal(new URL(url).hostname, HOTE_N8N);
    assert.equal(options.method, 'POST');
    assert.deepEqual(Object.keys(JSON.parse(options.body)).sort(), ['action', 'demandeId', 'devisId', 'espace']);
    assert.equal(JSON.parse(options.body).action, 'devis.preparerEmail');
    assert.doesNotMatch(options.body, /@|client@exemple|DEV-2026/, 'ni adresse e-mail, ni numéro, ni texte du message dans la demande');
    const d = s.doc('devis_devis', 'f1');
    assert.equal(d.statut, 'en_attente_envoi', 'toujours « Finalisé » : rien n’est parti');
    assert.equal(d.envois, undefined);
    assert.equal(d.envoyeLe, undefined);
    // La seule suite possible vient de l'humain : « Devis envoyé » + trace de l'origine.
    ok(await s.appeler('code', 'changer_statut_devis', { id: 'f1', action: 'marquer_envoye' }));
    const trace = ok(await s.appeler('biblio', 'enregistrer_envoi_devis', { id: 'f1', destinataires: EMAIL, origine: 'brouillon_logiciel' }));
    assert.equal(trace.dernierEnvoi.origine, 'brouillon_logiciel');
    assert.equal(appelsSortants.length, 1, 'enregistrer l’envoi n’appelle rien non plus');
  });
});
