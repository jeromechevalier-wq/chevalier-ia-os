// Tests des outils d'écriture, de suppression et de restauration, de bout en bout par le protocole MCP (étape 4, plan-mcp.md 5.9 : tests 3, 4, 5, 6, 9,
// 10, 11, 13, 14, 16). Chaque test démarre son propre serveur sur des données fictives fraîches (mémoire) : aucun service Google, aucune donnée réelle.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import * as L from '../functions/partage/logique.js';
import * as PL from '../functions/partage/projets.js';
import { OUTILS_ECRITURE } from '../functions/src/mcp/outils/ecriture.js';
import { proprietaireParDefaut } from '../functions/src/coeur/metier.js';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerLimiteur, LIMITES_PAR_DEFAUT } from '../functions/src/securite/limites.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';

const JETONS = { lecteur: `cia_${'L'.repeat(43)}`, biblio: `cia_${'H'.repeat(43)}`, code: `cia_${'C'.repeat(43)}` };
const entree = (jeton, nom, profil, extra = {}) => ({ jeton: nom, acteur: nom, profil, empreinte: empreinte(jeton), actif: true, ...extra });
const REGLAGES = { id: 'etiquettes', items: [{ id: 'chaud', nom: 'Prospect chaud', ordre: 1 }] };

const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });

/** Démarre un serveur MCP complet (jetons, plafonds, moteur d'écriture) sur des données fraîches. */
async function demarrer({ limites = {}, jetonsExtra = {} } = {}) {
  const collections = structuredClone(base);
  collections.crm_parametres.push(structuredClone(REGLAGES), { id: 'offres', items: [{ id: 'o1', nom: 'Site vitrine', ordre: 1 }] });
  const donnees = creerAccesMemoire(collections);
  const horloge = { t: MAINTENANT.getTime() };
  const lignesJournal = [];
  const secret = JSON.stringify([
    entree(JETONS.lecteur, 'lecteur-essai', 'lecteur'),
    entree(JETONS.biblio, 'hermes-bibliothecaire', 'bibliothecaire', jetonsExtra.biblio),
    entree(JETONS.code, 'claude-code-jerome', 'claude-code', jetonsExtra.code),
  ]);
  const magasin = creerMagasin({ lire: async () => secret, dureeCacheMs: 0 });
  const limiteur = creerLimiteur({ donnees, maintenant: () => horloge.t });
  const gestionnaire = creerGestionnaire({ magasin, donnees, limiteur, maintenant: () => horloge.t, journal: (e) => lignesJournal.push(e) });
  const serveur = createServer((req, res) => {
    const m = [];
    req.on('data', (x) => m.push(x));
    req.on('end', () => {
      const texte = Buffer.concat(m).toString('utf8');
      try { req.body = texte ? JSON.parse(texte) : undefined; } catch { req.body = undefined; }
      gestionnaire(req, res);
    });
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  arrets.push(() => new Promise((ok) => serveur.close(ok)));
  const url = `http://127.0.0.1:${serveur.address().port}/mcp`;
  let n = 0;
  const brut = (jeton, methode, params) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(jeton ? { Authorization: `Bearer ${JETONS[jeton] ?? jeton}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: methode, params }),
  });
  /** Appelle un outil : { isError, texte, data } (data = JSON de la réponse quand elle en est). */
  const appeler = async (jeton, nom, args = {}) => {
    const r = await brut(jeton, 'tools/call', { name: nom, arguments: args });
    const corps = await r.json();
    if (corps.error) return { isError: true, texte: corps.error.message, erreurProtocole: true };
    const texte = corps.result.content?.[0]?.text ?? '';
    let data;
    try { data = JSON.parse(texte); } catch { data = undefined; }
    return { isError: !!corps.result.isError, texte, data };
  };
  /** Suppression en deux temps (double confirmation) : aperçu, puis rappel avec le code. Rend la réponse du second appel (ou du premier s'il est refusé). */
  const supprimer = async (jeton, nom, args) => {
    const apercu = await appeler(jeton, nom, args);
    if (apercu.isError) return apercu;
    assert.equal(apercu.data.apercu, true, apercu.texte);
    return appeler(jeton, nom, { ...args, codeConfirmation: apercu.data.code });
  };
  const vue = () => Object.fromEntries(Object.entries(collections).filter(([k]) => !['crm_audit', 'crm_audit_avant', 'mcp_limites', 'mcp_codes'].includes(k)).map(([k, v]) => [k, structuredClone(v).sort((a, b) => a.id.localeCompare(b.id))]));
  return { collections, donnees, appeler, supprimer, brut, horloge, lignesJournal, vue, doc: (nom, id) => collections[nom]?.find((d) => d.id === id) };
}
const ok = (r) => { assert.equal(r.isError, false, r.texte); return r.data; };
const refuse = (r, motif) => { assert.equal(r.isError, true, `devait être refusé : ${r.texte}`); if (motif) assert.match(r.texte, motif); };

describe('Droits par profil (test 5)', () => {
  test('le lecteur ne voit aucun outil d’écriture ; le bibliothécaire écrit mais ne supprime ni ne restaure ; Claude Code a tout', async () => {
    const s = await demarrer();
    const noms = async (j) => (await (await s.brut(j, 'tools/list')).json()).result.tools.map((t) => t.name);
    const lecteur = await noms('lecteur');
    const biblio = await noms('biblio');
    const code = await noms('code');
    assert.ok(lecteur.includes('chercher') && !lecteur.includes('creer_personne'));
    for (const o of ['creer_personne', 'modifier_affaire', 'changer_etape', 'ajouter_note', 'creer_activite', 'joindre_lien']) assert.ok(biblio.includes(o), o);
    for (const o of ['supprimer_personne', 'supprimer_organisation', 'supprimer_affaire', 'supprimer_note', 'supprimer_activite', 'restaurer_depuis_audit']) {
      assert.ok(!biblio.includes(o), `${o} ne doit pas être offert au bibliothécaire`);
      assert.ok(code.includes(o), o);
    }
    assert.ok(code.length > biblio.length && biblio.length > lecteur.length);
  });

  test('même si l’appel arrive : supprimer_affaire et restaurer_depuis_audit sont refusés au bibliothécaire, et un lecteur ne peut pas écrire ; rien n’est modifié', async () => {
    const s = await demarrer();
    const avant = s.vue();
    refuse(await s.appeler('biblio', 'supprimer_affaire', { id: 'a1', confirmationNom: 'Site vitrine Atelier des Lilas' }));
    refuse(await s.appeler('biblio', 'restaurer_depuis_audit', { operationId: 'op1', apercu: false }));
    refuse(await s.appeler('lecteur', 'creer_personne', { nom: 'Intrus Total' }));
    assert.deepEqual(s.vue(), avant);
    assert.equal(s.collections.crm_audit.length, 3, 'aucune trace écrite pour un refus (il va dans les journaux Google)');
  });
});

describe('Propriétaire par défaut (points 2 et 4)', () => {
  test('P2 serveur de Jérôme : un jeton « cia_… » (claude-code, sans e-mail) donne Jérôme comme propriétaire', async () => {
    const s = await demarrer();
    const p = ok(await s.appeler('code', 'creer_personne', { nom: 'Fiche Par Jeton Code' }));
    assert.equal(s.doc('crm_personnes', p.id).proprietaire, 'jerome.chevalier@gmail.com');
  });
  test('P4 chez un client (accès avec base) sans e-mail de jeton : propriétaire vide, jamais Jérôme ; sur le serveur de Jérôme, Jérôme', () => {
    const chezClient = { donnees: { base: 'clients/a' } };
    assert.equal(proprietaireParDefaut(chezClient, undefined), '');
    assert.equal(proprietaireParDefaut({ ...chezClient, email: '   ' }, ''), '');
    assert.equal(proprietaireParDefaut({ ...chezClient, email: 'alice@exemple.test' }, undefined), 'alice@exemple.test');
    assert.equal(proprietaireParDefaut({ ...chezClient, email: 'alice@exemple.test' }, 'autre@exemple.test'), 'autre@exemple.test');
    assert.equal(proprietaireParDefaut({ donnees: {} }, undefined), 'jerome.chevalier@gmail.com');
    assert.equal(proprietaireParDefaut({ donnees: {}, email: 'charles@exemple.test' }, undefined), 'charles@exemple.test');
  });
});

describe('Acteur (test 3)', () => {
  test('un jeton hermes-bibliothecaire écrit « auteur: hermes-bibliothecaire, via: mcp » dans la fiche, le fil et l’audit ; Claude Code écrit le sien', async () => {
    const s = await demarrer();
    const p = ok(await s.appeler('biblio', 'creer_personne', { nom: 'Marie Nouvelle', emails: [{ valeur: 'marie@exemple.test', type: 'travail' }] }));
    const doc = s.doc('crm_personnes', p.id);
    assert.equal(doc.creePar, 'hermes-bibliothecaire');
    assert.equal(doc.modifiePar, 'hermes-bibliothecaire');
    assert.equal(doc.via, 'mcp');
    assert.equal(doc.proprietaire, 'jerome.chevalier@gmail.com', 'propriétaire par défaut : Jérôme, pas l’agent');
    const fil = ok(await s.appeler('biblio', 'lire_personne', { id: p.id, avecFil: true })).fil;
    assert.equal(fil[0].auteur, 'hermes-bibliothecaire');
    assert.equal(fil[0].via, 'mcp');
    assert.match(fil[0].texte, /Personne créée : Marie Nouvelle/);
    const audit = ok(await s.appeler('biblio', 'lire_audit', { operationId: p.operationId }));
    assert.ok(audit.lignes.length === 2 && audit.lignes.every((l) => l.acteur === 'hermes-bibliothecaire' && l.via === 'mcp' && l.outil === 'creer_personne' && l.statut === 'succes'));
    const q = ok(await s.appeler('code', 'ajouter_note', { texte: 'Note de Claude Code', personneId: p.id }));
    assert.equal(s.doc('crm_notes', q.id).auteur, 'claude-code-jerome');
    assert.equal(s.collections.crm_audit.find((l) => l.docId === q.id).acteur, 'claude-code-jerome');
  });

  test('propriétaire choisi à la création : respecté (le fil garde l’acteur)', async () => {
    const s = await demarrer();
    const o = ok(await s.appeler('biblio', 'creer_organisation', { nom: 'Nouvelle Boutique', proprietaire: 'paul@exemple.test' }));
    assert.equal(s.doc('crm_organisations', o.id).proprietaire, 'paul@exemple.test');
    assert.equal(s.doc('crm_organisations', o.id).creePar, 'hermes-bibliothecaire');
  });
});

describe('Création et modification (tests 9 et 11)', () => {
  test('test 9 : un doublon de nom (accents, casse, espaces ignorés) ou d’e-mail est refusé avec la liste ; forcer: true le permet', async () => {
    const s = await demarrer();
    const avant = s.vue();
    refuse(await s.appeler('biblio', 'creer_personne', { nom: '  CAMILLE   durand ' }), /Camille Durand \(id p1\).*forcer: true/);
    refuse(await s.appeler('biblio', 'creer_personne', { nom: 'Autre Nom', emails: [{ valeur: 'CAMILLE@exemple.test' }] }), /Camille Durand/);
    assert.deepEqual(s.vue(), avant);
    const r = ok(await s.appeler('biblio', 'creer_personne', { nom: 'Camille Durand', forcer: true }));
    assert.ok(s.doc('crm_personnes', r.id));
    refuse(await s.appeler('biblio', 'creer_organisation', { nom: 'atelier des lilas' }), /Atelier des Lilas/);
    ok(await s.appeler('biblio', 'creer_organisation', { nom: 'atelier des lilas', forcer: true }));
  });

  test('création de personne : nom obligatoire, organisation connue, étiquettes connues, rôles permis, e-mail valide', async () => {
    const s = await demarrer();
    refuse(await s.appeler('biblio', 'creer_personne', { nom: '   ' }), /nom est obligatoire/);
    refuse(await s.appeler('biblio', 'creer_personne', { nom: 'Jean Dupont', organisationId: 'inconnue' }), /Organisation introuvable/);
    refuse(await s.appeler('biblio', 'creer_personne', { nom: 'Jean Dupont', etiquettes: ['nexistepas'] }), /Étiquette\(s\) inconnue/);
    refuse(await s.appeler('biblio', 'creer_personne', { nom: 'Jean Dupont', emails: [{ valeur: 'pas-un-mail' }] }), /email n'est pas valide/);
    const bon = ok(await s.appeler('biblio', 'creer_personne', { nom: 'Jean Dupont', organisationId: 'org2', etiquettes: ['chaud'], ville: ' Nantes ' }));
    assert.deepEqual([s.doc('crm_personnes', bon.id).organisationId, s.doc('crm_personnes', bon.id).ville, s.doc('crm_personnes', bon.id).etiquettes], ['org2', 'Nantes', ['chaud']]);
  });

  test('modification de personne : seuls les champs donnés changent ; nom redécoupé ; rien à modifier et fiche inconnue refusés ; doublon refusé', async () => {
    const s = await demarrer();
    const avant = structuredClone(s.doc('crm_personnes', 'p2'));
    const r = ok(await s.appeler('biblio', 'modifier_personne', { id: 'p2', ville: 'Brest', nom: 'Élodie Bernard-Petit' }));
    assert.deepEqual(r.champsModifies.sort(), ['nom', 'nomFamille', 'prenom', 'ville']);
    const p = s.doc('crm_personnes', 'p2');
    assert.equal(p.ville, 'Brest');
    assert.equal(p.prenom, 'Élodie');
    assert.equal(p.nomFamille, 'Bernard-Petit');
    assert.equal(p.modifiePar, 'hermes-bibliothecaire');
    assert.deepEqual(p.emails, avant.emails, 'les champs non donnés sont conservés');
    refuse(await s.appeler('biblio', 'modifier_personne', { id: 'p2' }), /Aucun champ/);
    refuse(await s.appeler('biblio', 'modifier_personne', { id: 'zzz', ville: 'x' }), /introuvable/);
    refuse(await s.appeler('biblio', 'modifier_personne', { id: 'p2', nom: 'Camille Durand' }), /Camille Durand/);
    ok(await s.appeler('biblio', 'modifier_personne', { id: 'p2', organisationId: null }));
    assert.equal(s.doc('crm_personnes', 'p2').organisationId, null);
    ok(await s.appeler('biblio', 'modifier_personne', { id: 'p2', archive: true }));
    assert.equal(s.doc('crm_personnes', 'p2').archive, true);
  });

  test('test 11 : créer une affaire = règles de l’écran (titre par défaut, organisation héritée, étape, statut, événement) ; étape ou priorité inconnue refusée', async () => {
    const s = await demarrer();
    refuse(await s.appeler('biblio', 'creer_affaire', { titre: 'X', etape: 'nimporte' }), /Étape inconnue/);
    refuse(await s.appeler('biblio', 'creer_affaire', { titre: 'X', priorite: 'brulante' }), /Priorité inconnue/);
    refuse(await s.appeler('biblio', 'creer_affaire', { titre: 'X', personneId: 'zzz' }), /Personne introuvable/);
    refuse(await s.appeler('biblio', 'creer_affaire', {}), /titre est obligatoire/);
    const r = ok(await s.appeler('biblio', 'creer_affaire', { personneId: 'p2', montant: 800 }));
    const a = s.doc('crm_affaires', r.id);
    assert.equal(a.titre, 'Boulangerie Martin');
    assert.equal(a.organisationId, 'org2');
    assert.equal(a.etape, 'premier_contact');
    assert.equal(a.statut, 'ouverte');
    assert.equal(a.montant, 800);
    assert.equal(a.proprietaire, 'jerome.chevalier@gmail.com');
    assert.equal(a.via, 'mcp');
    const ev = s.collections.crm_evenements.find((e) => e.affaireId === r.id);
    assert.equal(ev.type, 'affaire_creee');
    assert.equal(ev.auteur, 'hermes-bibliothecaire');
    assert.equal(ev.personneId, 'p2');
  });

  test('test 11 : changer l’étape — statut gagnée, événements, archive et encaissement en « facture_payee » ; même étape = rien à faire ; étape inconnue refusée', async () => {
    const s = await demarrer();
    const gagne = ok(await s.appeler('biblio', 'changer_etape', { id: 'a1', etape: 'gagne' }));
    assert.equal(gagne.statut, 'gagnee');
    assert.equal(gagne.suggestion, null, 'aucune action suggérée par défaut (les deux règles en dur ont disparu)');
    assert.deepEqual(s.collections.crm_evenements.filter((e) => e.affaireId === 'a1' && e.date.getTime() === MAINTENANT.getTime()).map((e) => e.type).sort(), ['affaire_gagnee', 'etape_changee'], 'gagnée sans projet : aucun projet n’est créé avec elle');
    assert.equal('extraction' in gagne, false);
    assert.equal((s.collections.projets_projets || []).length, 0);
    assert.equal(s.collections.crm_activites.length, 4, 'la suggestion n’est pas créée toute seule');
    assert.equal(ok(await s.appeler('biblio', 'changer_etape', { id: 'a1', etape: 'gagne' })).rien, true);
    refuse(await s.appeler('biblio', 'changer_etape', { id: 'a1', etape: 'bidon' }), /Étape inconnue/);
    ok(await s.appeler('biblio', 'modifier_affaire', { id: 'a1', montant: 1000 }));
    // depuis la 2.2, la vente s'arrête à Gagné : les anciennes étapes de facturation sont refusées, rien n'est écrit
    refuse(await s.appeler('biblio', 'changer_etape', { id: 'a1', etape: 'facture_payee' }), /Étape inconnue/);
    refuse(await s.appeler('biblio', 'changer_etape', { id: 'a1', etape: 'facture_envoyee' }), /Étape inconnue/);
    const a1 = s.doc('crm_affaires', 'a1');
    assert.equal(a1.etape, 'gagne');
    assert.equal(a1.archive, false);
    assert.equal(a1.modifiePar, 'hermes-bibliothecaire');
    assert.equal(s.collections.crm_evenements.some((e) => e.affaireId === 'a1' && e.type === 'encaissement'), false);
  });

  test('test 11 : parité avec l’écran — le patch écrit par l’outil est exactement celui de la règle pure sur les mêmes données', async () => {
    const s = await demarrer();
    const avant = structuredClone(s.doc('crm_affaires', 'a2'));
    const regle = L.changementEtape(avant, 'gagne', { maintenant: MAINTENANT, auteur: 'x', config: L.CONFIG_JEROME });
    ok(await s.appeler('code', 'changer_etape', { id: 'a2', etape: 'gagne' }));
    const apres = s.doc('crm_affaires', 'a2');
    for (const [k, v] of Object.entries(regle.patch)) assert.deepEqual(apres[k], v, k);
    assert.equal(apres.titre, avant.titre);
  });

  test('test 11 : perdue, rouvrir, avec les mêmes contrôles de saisie que l’écran', async () => {
    const s = await demarrer();
    refuse(await s.appeler('biblio', 'marquer_perdue', { id: 'a1', raison: 'Parce que' }), /raison est obligatoire/);
    ok(await s.appeler('biblio', 'marquer_perdue', { id: 'a1', raison: 'Prix', detail: ' trop cher ' }));
    assert.equal(s.doc('crm_affaires', 'a1').statut, 'perdue');
    assert.equal(s.doc('crm_affaires', 'a1').raisonPerdueDetail, 'trop cher');
    ok(await s.appeler('biblio', 'rouvrir_affaire', { id: 'a1' }));
    assert.equal(s.doc('crm_affaires', 'a1').statut, 'ouverte');
    assert.equal(ok(await s.appeler('biblio', 'rouvrir_affaire', { id: 'a1' })).rien, true, 'une affaire ouverte ne se rouvre pas');
    // plus de pause (22/10/2026) : les trois outils n'existent plus, sans alias
    for (const nom of ['mettre_en_pause', 'mettre_projet_en_pause', 'reprendre_projet']) {
      const r = await s.appeler('code', nom, { id: 'a1', dateReveil: '2027-01-15' });
      assert.ok(r.isError || /inconnu|unknown|not found/i.test(JSON.stringify(r)), nom);
    }
    // une ancienne affaire restée « en_pause » (base non migrée) se rouvre et s'affiche comme ouverte
    s.collections.crm_affaires.push({ ...structuredClone(s.doc('crm_affaires', 'a1')), id: 'a-vieille', statut: 'en_pause', dateReveil: '2026-12-01' });
    const rouverte = ok(await s.appeler('biblio', 'rouvrir_affaire', { id: 'a-vieille' }));
    assert.equal(rouverte.statut, 'ouverte');
    assert.equal(s.doc('crm_affaires', 'a-vieille').statut, 'ouverte');
    assert.equal(s.doc('crm_affaires', 'a-vieille').dateReveil, null, 'l’ancienne date de réveil est effacée');
    // l'ajout d'un encaissement sur l'affaire n'existe plus (2.2) : l'argent se saisit sur les factures des projets
    const inconnu = await s.appeler('biblio', 'ajouter_encaissement', { id: 'a2', montant: 250 });
    assert.ok(inconnu.isError || /inconnu|unknown|not found/i.test(JSON.stringify(inconnu)));
  });

  test('notes et activités : liens comme l’écran (une affaire porte sa personne et son organisation), date du jour à Paris, activité terminée une seule fois', async () => {
    const s = await demarrer();
    refuse(await s.appeler('biblio', 'ajouter_note', { texte: 'orpheline' }), /Rattacher/);
    refuse(await s.appeler('biblio', 'ajouter_note', { texte: 'x', affaireId: 'zzz' }), /Affaire introuvable/);
    const n = ok(await s.appeler('biblio', 'ajouter_note', { texte: '  Appeler jeudi ', affaireId: 'a1' }));
    assert.deepEqual([s.doc('crm_notes', n.id).texte, s.doc('crm_notes', n.id).personneId, s.doc('crm_notes', n.id).organisationId, s.doc('crm_notes', n.id).affaireId], ['Appeler jeudi', 'p1', 'org1', 'a1']);
    ok(await s.appeler('biblio', 'modifier_note', { id: n.id, texte: 'Appeler vendredi' }));
    assert.equal(s.doc('crm_notes', n.id).texte, 'Appeler vendredi');
    const a = ok(await s.appeler('biblio', 'creer_activite', { type: 'appel', titre: 'Rappeler', personneId: 'p2' }));
    const act = s.doc('crm_activites', a.id);
    assert.deepEqual([act.date, act.type, act.fait, act.organisationId, act.auteur], ['2026-10-05', 'appel', false, 'org2', 'hermes-bibliothecaire']);
    refuse(await s.appeler('biblio', 'creer_activite', { titre: 'sans lien' }), /Rattacher/);
    refuse(await s.appeler('biblio', 'creer_activite', { personneId: 'p2', date: '05/10/2026' }));
    ok(await s.appeler('biblio', 'terminer_activite', { id: a.id }));
    assert.equal(s.doc('crm_activites', a.id).fait, true);
    assert.ok(s.collections.crm_evenements.some((e) => e.type === 'activite_faite' && e.personneId === 'p2'));
    assert.equal(ok(await s.appeler('biblio', 'terminer_activite', { id: a.id })).rien, true);
  });

  test('test 16 : joindre_lien refuse une adresse sans http ; retirer_document par index ou par url (jamais le mauvais)', async () => {
    const s = await demarrer();
    refuse(await s.appeler('biblio', 'joindre_lien', { affaireId: 'a1', url: 'ftp://exemple.test/x' }), /http/);
    refuse(await s.appeler('biblio', 'joindre_lien', { affaireId: 'a1', url: 'javascript:alert(1)' }), /http/);
    ok(await s.appeler('biblio', 'joindre_lien', { affaireId: 'a1', url: 'https://exemple.test/contrat', libelle: 'Contrat' }));
    assert.deepEqual(s.doc('crm_affaires', 'a1').documents.map((d) => d.libelle), ['Devis', 'Contrat']);
    assert.deepEqual(s.doc('crm_affaires', 'a1').documents.map((d) => d.favori), [undefined, undefined], 'sans favori: true, pas d’étoile');
    ok(await s.appeler('biblio', 'joindre_lien', { affaireId: 'a1', url: 'https://exemple.test/suivi', libelle: 'Suivi', favori: true }));
    assert.equal(s.doc('crm_affaires', 'a1').documents.at(-1).favori, true);
    // Note facultative (300 caractères au plus), renvoyée à la lecture ; sans nom : le nom du site
    ok(await s.appeler('biblio', 'joindre_lien', { affaireId: 'a1', url: 'https://www.exemple.test/portrait', note: 'envoyé au client' }));
    assert.deepEqual(s.doc('crm_affaires', 'a1').documents.at(-1), { libelle: 'exemple.test', url: 'https://www.exemple.test/portrait', note: 'envoyé au client' });
    assert.equal(ok(await s.appeler('biblio', 'lister_documents', { affaireId: 'a1' })).documents.at(-1).note, 'envoyé au client');
    refuse(await s.appeler('biblio', 'joindre_lien', { affaireId: 'a1', url: 'https://exemple.test/long', note: 'x'.repeat(301) }));
    ok(await s.appeler('biblio', 'retirer_document', { affaireId: 'a1', url: 'https://www.exemple.test/portrait' }));
    ok(await s.appeler('biblio', 'retirer_document', { affaireId: 'a1', url: 'https://exemple.test/suivi' }));
    refuse(await s.appeler('biblio', 'retirer_document', { affaireId: 'a1', index: 0, url: 'https://exemple.test/contrat' }), /ne correspond pas/);
    refuse(await s.appeler('biblio', 'retirer_document', { affaireId: 'a1', index: 7 }), /introuvable/);
    refuse(await s.appeler('biblio', 'retirer_document', { affaireId: 'a1' }), /index ou url/);
    ok(await s.appeler('biblio', 'retirer_document', { affaireId: 'a1', url: 'https://exemple.test/devis' }));
    assert.deepEqual(s.doc('crm_affaires', 'a1').documents.map((d) => d.libelle), ['Contrat']);
  });

  test('pièces jointes d’un projet : mêmes règles que sur une affaire (http exigé, favori, retrait par index ou url, une seule cible)', async () => {
    const s = await demarrer();
    const projet = ok(await s.appeler('biblio', 'creer_projet', { titre: 'Marketing - Prospection' }));
    refuse(await s.appeler('biblio', 'joindre_lien', { url: 'https://exemple.test/x' }), /affaireId ou projetId/);
    refuse(await s.appeler('biblio', 'joindre_lien', { affaireId: 'a1', projetId: projet.id, url: 'https://exemple.test/x' }), /affaireId ou projetId/);
    refuse(await s.appeler('biblio', 'joindre_lien', { projetId: projet.id, url: 'ftp://exemple.test/x' }), /http/);
    refuse(await s.appeler('biblio', 'joindre_lien', { projetId: 'inconnu', url: 'https://exemple.test/x' }), /introuvable/i);
    ok(await s.appeler('biblio', 'joindre_lien', { projetId: projet.id, url: 'https://exemple.test/fiche', libelle: 'Fiche', favori: true }));
    ok(await s.appeler('biblio', 'joindre_lien', { projetId: projet.id, url: 'https://exemple.test/autre', libelle: 'Autre' }));
    assert.deepEqual(s.doc('projets_projets', projet.id).documents, [{ libelle: 'Fiche', url: 'https://exemple.test/fiche', favori: true }, { libelle: 'Autre', url: 'https://exemple.test/autre' }]);
    assert.equal(s.doc('crm_affaires', 'a1').documents.length, 1, 'l’affaire n’est pas touchée');
    refuse(await s.appeler('biblio', 'retirer_document', { projetId: projet.id, index: 0, url: 'https://exemple.test/autre' }), /ne correspond pas/);
    refuse(await s.appeler('biblio', 'retirer_document', { projetId: projet.id, index: 5 }), /ce projet/);
    ok(await s.appeler('biblio', 'retirer_document', { projetId: projet.id, url: 'https://exemple.test/fiche' }));
    assert.deepEqual(s.doc('projets_projets', projet.id).documents.map((d) => d.libelle), ['Autre']);
    const liste = ok(await s.appeler('biblio', 'lister_documents', { projetId: projet.id }));
    assert.deepEqual(liste.documents, [{ projetId: projet.id, titreProjet: 'Marketing - Prospection', index: 0, libelle: 'Autre', url: 'https://exemple.test/autre', favori: false }]);
    assert.ok(ok(await s.appeler('biblio', 'lister_documents', {})).documents.some((d) => d.affaireId === 'a1'), 'sans filtre : affaires et projets');
  });

  test('adresse GitHub et dossier Drive d’une affaire : créés et modifiés par les outils, adresses invalides refusées, chaîne vide = effacer', async () => {
    const s = await demarrer();
    const avant = s.vue();
    refuse(await s.appeler('biblio', 'creer_affaire', { titre: 'X', urlGithub: 'http://exemple.test/depot' }), /https:\/\/github\.com\//);
    refuse(await s.appeler('biblio', 'creer_affaire', { titre: 'X', urlDossier: 'Mon Drive/dossier-sans-lien' }), /lien complet/);
    refuse(await s.appeler('biblio', 'creer_affaire', { titre: 'X', urlDossier: 'javascript:alert(1)' }), /lien complet/);
    assert.deepEqual(s.vue(), avant);
    const r = ok(await s.appeler('biblio', 'creer_affaire', { titre: 'Avec adresses', urlGithub: 'https://github.com/jeromechevalier-wq/essai', urlDossier: 'https://drive.google.com/drive/folders/abc123_-X' }));
    assert.equal(s.doc('crm_affaires', r.id).urlGithub, 'https://github.com/jeromechevalier-wq/essai');
    assert.equal(s.doc('crm_affaires', r.id).urlDossier, 'https://drive.google.com/drive/folders/abc123_-X');
    refuse(await s.appeler('biblio', 'modifier_affaire', { id: r.id, urlGithub: 'github.com/pas-https/x' }), /https:\/\/github\.com\//);
    ok(await s.appeler('biblio', 'modifier_affaire', { id: 'a1', urlGithub: 'https://github.com/jeromechevalier-wq/autre' }));
    assert.equal(s.doc('crm_affaires', 'a1').urlGithub, 'https://github.com/jeromechevalier-wq/autre');
    assert.equal(ok(await s.appeler('biblio', 'lire_affaire', { id: 'a1' })).affaire.urlGithub, 'https://github.com/jeromechevalier-wq/autre', 'la lecture renvoie le champ');
    ok(await s.appeler('biblio', 'modifier_affaire', { id: 'a1', urlGithub: '' }));
    assert.equal(s.doc('crm_affaires', 'a1').urlGithub, '');
  });

  test('l’appel à un outil avec des arguments invalides ne laisse aucune trace ni aucune donnée', async () => {
    const s = await demarrer();
    const avant = s.vue();
    const lignes = s.collections.crm_audit.length;
    for (const [nom, args] of [['creer_personne', {}], ['modifier_affaire', { id: 'a1', montant: 'beaucoup' }], ['changer_etape', { id: 'a1' }], ['ajouter_note', { texte: 'x'.repeat(30000), affaireId: 'a1' }]]) refuse(await s.appeler('biblio', nom, args));
    assert.deepEqual(s.vue(), avant);
    assert.equal(s.collections.crm_audit.length, lignes);
  });
});

describe('Suppression et restauration (tests 6 et 10)', () => {
  test('test 6 : supprimer une personne avec « affaires » puis restaurer_depuis_audit redonne EXACTEMENT les mêmes documents (mêmes identifiants, mêmes liens)', async () => {
    const s = await demarrer();
    const avant = s.vue();
    const r = ok(await s.supprimer('code', 'supprimer_personne', { id: 'p1', choix: 'affaires', confirmationNom: 'camille durand' }));
    assert.equal(s.doc('crm_personnes', 'p1'), undefined);
    assert.deepEqual(r.supprimes, { crm_personnes: 1, crm_affaires: 2, crm_activites: 2, crm_notes: 2, crm_evenements: 2 });
    assert.match(r.restaurable, /restaurer_depuis_audit/);
    const apercu = ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId }));
    assert.equal(apercu.apercu, true);
    assert.equal(apercu.aDefaire, 9);
    assert.equal(s.doc('crm_personnes', 'p1'), undefined, 'l’aperçu n’écrit rien');
    const fait = ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }));
    assert.equal(fait.restauree, true);
    assert.deepEqual(s.vue(), avant, 'la base est exactement revenue à son état d’avant');
    // restaurer deux fois : plus rien à faire
    assert.equal(ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false })).rienAFaire, true);
  });

  test('supprimer une personne en conservant ses affaires : détachées, puis tout se restaure à l’identique', async () => {
    const s = await demarrer();
    const avant = s.vue();
    refuse(await s.appeler('code', 'supprimer_personne', { id: 'p1', confirmationNom: 'Camille Durand' }), /choix = "affaires".*"conserver"/);
    const r = ok(await s.supprimer('code', 'supprimer_personne', { id: 'p1', choix: 'conserver', confirmationNom: 'Camille Durand' }));
    assert.equal(s.doc('crm_affaires', 'a1').personneId, null);
    assert.ok(s.doc('crm_affaires', 'a1'), 'l’affaire est conservée');
    assert.equal(s.doc('crm_activites', 'ac1').personneId, null);
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }));
    assert.deepEqual(s.vue(), avant);
  });

  test('un projet lié à ce qu’on supprime est conservé, son lien est vidé, et tout se restaure à l’identique (module Projets)', async () => {
    const s = await demarrer();
    s.collections.projets_projets = [{ id: 'pr1', titre: 'Audit Lilas', affaireId: 'a1', personneId: 'p1', organisationId: 'org1', phase: 'lancement', statut: 'actif', archive: false }];
    s.collections.crm_evenements.push({ id: 'ev-pr1', type: 'projet_cree', texte: 'Projet créé : Audit Lilas', projetId: 'pr1', affaireId: 'a1', personneId: 'p1', organisationId: 'org1', auteur: 'x' });
    const avant = s.vue();
    const r = ok(await s.supprimer('code', 'supprimer_affaire', { id: 'a1', confirmationNom: 'Site vitrine Atelier des Lilas' }));
    assert.equal(s.doc('crm_affaires', 'a1'), undefined);
    assert.deepEqual([s.doc('projets_projets', 'pr1').affaireId, s.doc('projets_projets', 'pr1').personneId], [null, 'p1'], 'projet gardé, seul le lien vers l’affaire est vidé');
    assert.equal(s.doc('crm_evenements', 'ev-pr1').affaireId, null, 'le fil du projet est gardé, détaché de l’affaire');
    assert.equal(r.detaches.projets_projets, 1);
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }));
    assert.deepEqual(s.vue(), avant);

    const r2 = ok(await s.supprimer('code', 'supprimer_personne', { id: 'p1', choix: 'affaires', confirmationNom: 'Camille Durand' }));
    assert.equal(s.doc('crm_personnes', 'p1'), undefined);
    assert.deepEqual([s.doc('projets_projets', 'pr1').affaireId, s.doc('projets_projets', 'pr1').personneId, s.doc('projets_projets', 'pr1').organisationId], [null, null, 'org1']);
    assert.ok(s.doc('crm_evenements', 'ev-pr1'), 'le fil du projet survit à la personne et à ses affaires');
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r2.operationId, apercu: false }));
    assert.deepEqual(s.vue(), avant);
  });

  test('X2 extraction de valeur supprimée : marquer_perdue et changer_etape ne créent aucun projet ; la restauration défait l’affaire', async () => {
    const s = await demarrer();
    const avant = s.vue();
    const r = ok(await s.appeler('code', 'marquer_perdue', { id: 'a1', raison: 'Prix', detail: 'trop cher' }));
    assert.equal(r.statut, 'perdue');
    assert.equal('extraction' in r, false, 'plus de champ « extraction » dans la réponse');
    assert.equal((s.collections.projets_projets || []).length, 0);
    assert.equal((s.collections.projets_taches || []).length, 0);
    const op = (await s.donnees.liste('crm_audit', { champ: 'outil', valeur: 'marquer_perdue' })).sort((a, b) => a.date - b.date)[0].operationId;
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: op, apercu: false, forcer: true }));
    assert.equal(s.doc('crm_affaires', 'a1').statut, avant.crm_affaires.find((a) => a.id === 'a1').statut);
    ok(await s.appeler('biblio', 'changer_etape', { id: 'a1', etape: 'gagne' }));
    assert.equal((s.collections.projets_projets || []).length, 0, 'affaire gagnée sans projet : rien n’est créé');
  });

  test('test 10 : la confirmation par le nom est exigée (absente, fausse, d’une autre fiche) : rien n’est supprimé', async () => {
    const s = await demarrer();
    const avant = s.vue();
    refuse(await s.appeler('code', 'supprimer_personne', { id: 'p2', choix: 'affaires' }));
    refuse(await s.appeler('code', 'supprimer_personne', { id: 'p2', choix: 'affaires', confirmationNom: 'Camille Durand' }), /non confirmée/);
    refuse(await s.appeler('code', 'supprimer_affaire', { id: 'a2', confirmationNom: 'a2' }), /non confirmée/);
    refuse(await s.appeler('code', 'supprimer_organisation', { id: 'org2', confirmationNom: '' }));
    assert.deepEqual(s.vue(), avant);
    assert.ok(!/Boulangerie Martin|Élodie|Application de commande/.test(JSON.stringify(await s.appeler('code', 'supprimer_affaire', { id: 'a2', confirmationNom: 'faux' }))), 'le message ne révèle pas le nom attendu');
  });

  test('test 10 : supprimer une organisation qui a des personnes ou des affaires est refusé ; une organisation vide se supprime et se restaure', async () => {
    const s = await demarrer();
    const avant = s.vue();
    refuse(await s.appeler('code', 'supprimer_organisation', { id: 'org1', confirmationNom: 'Atelier des Lilas' }), /encore 1 personne et 2 affaires/);
    assert.deepEqual(s.vue(), avant);
    ok(await s.appeler('code', 'creer_organisation', { nom: 'Vide Totale' }));
    const o = s.collections.crm_organisations.find((x) => x.nom === 'Vide Totale');
    const avant2 = s.vue();
    const r = ok(await s.supprimer('code', 'supprimer_organisation', { id: o.id, confirmationNom: 'vide totale' }));
    assert.equal(s.doc('crm_organisations', o.id), undefined);
    assert.equal(r.supprimes.crm_evenements, 1, 'son événement de création part avec elle');
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }));
    assert.deepEqual(s.vue(), avant2);
  });

  test('supprimer une affaire, une note, une activité : récupérables ; la restauration est refusée si quelqu’un a modifié entre-temps, forcer l’écrase (test 7)', async () => {
    const s = await demarrer();
    const avant = s.vue();
    const a = ok(await s.supprimer('code', 'supprimer_affaire', { id: 'a1', confirmationNom: 'site vitrine atelier des lilas' }));
    assert.equal(s.doc('crm_affaires', 'a1'), undefined);
    assert.equal(s.doc('crm_activites', 'ac1'), undefined, 'son fil part avec elle');
    const n = ok(await s.supprimer('code', 'supprimer_note', { id: 'n2' }));
    const ac = ok(await s.supprimer('code', 'supprimer_activite', { id: 'ac4' }));
    for (const op of [ac, n, a]) ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: op.operationId, apercu: false }));
    assert.deepEqual(s.vue(), avant);

    const m = ok(await s.appeler('code', 'modifier_affaire', { id: 'a2', montant: 111 }));
    ok(await s.appeler('code', 'modifier_affaire', { id: 'a2', montant: 222 })); // quelqu’un modifie ensuite
    const refus = await s.appeler('code', 'restaurer_depuis_audit', { operationId: m.operationId, apercu: false });
    refuse(refus, /forcer/);
    assert.equal(s.doc('crm_affaires', 'a2').montant, 222);
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: m.operationId, apercu: false, forcer: true }));
    assert.equal(s.doc('crm_affaires', 'a2').montant, undefined);
  });

  test('test 8 : copie « avant » manquante : message clair', async () => {
    const s = await demarrer();
    const r = ok(await s.supprimer('code', 'supprimer_note', { id: 'n1' }));
    s.collections.crm_audit_avant = [];
    refuse(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }), /manquent.*sauvegarde/);
  });

  test('une suppression du bibliothécaire créée par erreur par Claude Code se retrouve dans lire_audit (outil, acteur, action « supprimer »)', async () => {
    const s = await demarrer();
    const r = ok(await s.supprimer('code', 'supprimer_activite', { id: 'ac2' }));
    const audit = ok(await s.appeler('biblio', 'lire_audit', { operationId: r.operationId }));
    assert.deepEqual(audit.lignes.map((l) => [l.outil, l.acteur, l.action, l.collection, l.docId]), [['supprimer_activite', 'claude-code-jerome', 'supprimer', 'crm_activites', 'ac2']]);
  });
});

describe('Plafonds de débit (test 13)', () => {
  test('le 121e appel d’une minute reçoit 429 avec Retry-After ; la minute suivante repart', async () => {
    const s = await demarrer();
    for (let i = 0; i < LIMITES_PAR_DEFAUT.requetesParMinute; i++) assert.equal((await s.brut('code', 'tools/list')).status, 200, `appel ${i + 1}`);
    const r = await s.brut('code', 'tools/list');
    assert.equal(r.status, 429);
    assert.equal(await r.text(), '{"error":"limite_depassee"}');
    assert.ok(Number(r.headers.get('retry-after')) >= 1 && Number(r.headers.get('retry-after')) <= 60);
    assert.equal((await s.brut('biblio', 'tools/list')).status, 200, 'le plafond est par jeton');
    s.horloge.t += 61_000;
    assert.equal((await s.brut('code', 'tools/list')).status, 200);
  });

  test('un jeton peut avoir ses propres plafonds ; un jeton inconnu ou révoqué ne consomme rien', async () => {
    const s = await demarrer({ jetonsExtra: { biblio: { limites: { requetesParMinute: 3 } } } });
    for (let i = 0; i < 3; i++) assert.equal((await s.brut('biblio', 'tools/list')).status, 200);
    assert.equal((await s.brut('biblio', 'tools/list')).status, 429);
    for (let i = 0; i < 5; i++) assert.equal((await s.brut(`cia_${'Z'.repeat(43)}`, 'tools/list')).status, 401);
  });

  test('écritures par heure : l’appel qui dépasse est refusé avant d’écrire, avec le délai ; l’heure suivante repart', async () => {
    const s = await demarrer({ jetonsExtra: { biblio: { limites: { ecrituresParHeure: 3 } } } });
    for (let i = 0; i < 3; i++) ok(await s.appeler('biblio', 'ajouter_note', { texte: `note ${i}`, affaireId: 'a1' }));
    const notes = s.collections.crm_notes.length;
    refuse(await s.appeler('biblio', 'ajouter_note', { texte: 'trop', affaireId: 'a1' }), /Plafond atteint.*3 écritures par heure.*Réessayer dans/);
    assert.equal(s.collections.crm_notes.length, notes);
    assert.equal(ok(await s.appeler('biblio', 'lire_audit', {})).total, 3 + 3, 'la lecture reste possible');
    s.horloge.t += 3_600_000;
    ok(await s.appeler('biblio', 'ajouter_note', { texte: 'repartie', affaireId: 'a1' }));
  });

  test('un appel refusé pour saisie invalide ne consomme pas le plafond', async () => {
    const s = await demarrer({ jetonsExtra: { biblio: { limites: { ecrituresParHeure: 2 } } } });
    for (let i = 0; i < 5; i++) refuse(await s.appeler('biblio', 'creer_personne', { nom: 'Camille Durand' })); // doublon
    ok(await s.appeler('biblio', 'ajouter_note', { texte: 'a', affaireId: 'a1' }));
    ok(await s.appeler('biblio', 'ajouter_note', { texte: 'b', affaireId: 'a1' }));
    refuse(await s.appeler('biblio', 'ajouter_note', { texte: 'c', affaireId: 'a1' }), /Plafond/);
  });

  test('suppressions par jour : la suivante est refusée et rien n’est supprimé ; le lendemain (jour de Paris) repart ; une restauration qui supprime compte comme suppression, une qui recrée non', async () => {
    const s = await demarrer({ jetonsExtra: { code: { limites: { suppressionsParJour: 2 } } } });
    const op1 = ok(await s.supprimer('code', 'supprimer_note', { id: 'n1' }));
    ok(await s.supprimer('code', 'supprimer_note', { id: 'n2' }));
    const avant = s.vue();
    // l'aperçu prévient AVANT de donner un code quand le plafond restant ne suffit pas
    const sansCode = ok(await s.appeler('code', 'supprimer_activite', { id: 'ac4' }));
    assert.equal(sansCode.depassePlafond, true); assert.equal(sansCode.code, undefined); assert.equal(sansCode.suppressionsRestantesAujourdhui, 0);
    assert.deepEqual(s.vue(), avant);
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: op1.operationId, apercu: false }));
    ok(await s.appeler('code', 'modifier_affaire', { id: 'a1', montant: 5 })); // une écriture ordinaire ne compte pas comme suppression
    s.horloge.t += 24 * 3_600_000;
    ok(await s.supprimer('code', 'supprimer_activite', { id: 'ac4' }));
  });

  test('un code obtenu avant que le plafond soit atteint ne passe pas ensuite : Plafond atteint, rien supprimé', async () => {
    const s = await demarrer({ jetonsExtra: { code: { limites: { suppressionsParJour: 2 } } } });
    const apercu = ok(await s.appeler('code', 'supprimer_activite', { id: 'ac4' }));
    assert.ok(apercu.code && !apercu.depassePlafond);
    ok(await s.supprimer('code', 'supprimer_note', { id: 'n1' }));
    ok(await s.supprimer('code', 'supprimer_note', { id: 'n2' }));
    const avant = s.vue();
    refuse(await s.appeler('code', 'supprimer_activite', { id: 'ac4', codeConfirmation: apercu.code }), /Plafond atteint.*2 suppressions par jour/);
    assert.deepEqual(s.vue(), avant);
  });

  test('limites illisibles dans le secret : valeurs par défaut', async () => {
    const { limitesDuJeton } = await import('../functions/src/securite/limites.js');
    assert.deepEqual(limitesDuJeton({ limites: { requetesParMinute: -1, ecrituresParHeure: 'x', suppressionsParJour: 1.5 } }), LIMITES_PAR_DEFAUT);
    assert.deepEqual(limitesDuJeton({}), LIMITES_PAR_DEFAUT);
    assert.equal(limitesDuJeton({ limites: { suppressionsParJour: 3 } }).suppressionsParJour, 3);
  });
});

describe('Journaux sans contenu (test 14)', () => {
  test('les écritures, refus, doublons et plafonds laissent un journal sans nom, e-mail, texte ni confirmation ; seuls outil, opération et code y figurent', async () => {
    const s = await demarrer();
    ok(await s.appeler('biblio', 'creer_personne', { nom: 'Marie Confidentielle', emails: [{ valeur: 'marie.secrete@exemple.test' }] }));
    refuse(await s.appeler('biblio', 'creer_personne', { nom: 'Camille Durand' }));
    ok(await s.appeler('biblio', 'ajouter_note', { texte: 'Texte très privé de la note', affaireId: 'a1' }));
    refuse(await s.appeler('code', 'supprimer_personne', { id: 'p2', choix: 'affaires', confirmationNom: 'Mauvais Nom Secret' }));
    const tout = JSON.stringify(s.lignesJournal);
    for (const interdit of ['Marie', 'Confidentielle', 'marie.secrete', 'Camille', 'très privé', 'Mauvais Nom', 'Bearer', ...Object.values(JETONS)]) assert.equal(tout.includes(interdit), false, interdit);
    const ecritures = s.lignesJournal.filter((l) => l.outil === 'creer_personne' && l.statut === 200);
    assert.ok(ecritures.some((l) => l.operationId), 'l’opération est notée pour retrouver la trace');
    assert.ok(s.lignesJournal.some((l) => l.code === 'doublon'), 'le code du refus est noté');
    const champs = new Set(s.lignesJournal.flatMap((l) => Object.keys(l)));
    for (const c of champs) assert.ok(['jeton', 'acteur', 'profil', 'methodeMcp', 'outil', 'operationId', 'dureeMs', 'statut', 'code'].includes(c), c);
  });

  test('l’audit « sans contenu » : crm_audit ne garde aucune valeur de fiche, même après plusieurs écritures ; les valeurs sont dans les copies à durée limitée', async () => {
    const s = await demarrer();
    ok(await s.appeler('biblio', 'creer_personne', { nom: 'Marie Confidentielle', emails: [{ valeur: 'marie.secrete@exemple.test' }] }));
    ok(await s.appeler('biblio', 'ajouter_note', { texte: 'Texte très privé de la note', affaireId: 'a1' }));
    const audit = JSON.stringify(s.collections.crm_audit.filter((l) => !['au1', 'au2', 'au3'].includes(l.id)));
    for (const interdit of ['Marie', 'marie.secrete', 'très privé']) assert.equal(audit.includes(interdit), false, interdit);
    assert.ok(JSON.stringify(s.collections.crm_audit_avant).includes('Marie Confidentielle'));
    assert.ok(s.collections.crm_audit_avant.every((c) => c.expireAt instanceof Date));
  });
});

// ---------------------------------------------------------------- projets (2.1) et factures (2.2)

describe('Outils des projets : mêmes règles que l’écran, avec audit et restauration', () => {
  /** Serveur avec les modèles de départ (Audit, Accompagnement) installés. */
  async function avecModeles() {
    const s = await demarrer();
    s.collections.projets_modeles = PL.MODELES_JEROME.map((m, i) => ({ ...structuredClone(m), ordre: i + 1, actif: true }));
    return s;
  }
  const projets = (s) => s.collections.projets_projets || [];

  test('droits : lecture pour les trois profils, écriture pour le bibliothécaire et Claude Code, suppression pour Claude Code seul', async () => {
    const s = await demarrer();
    const noms = async (j) => (await (await s.brut(j, 'tools/list')).json()).result.tools.map((t) => t.name);
    const ecriture = ['creer_projet', 'creer_projet_depuis_affaire', 'modifier_projet', 'changer_phase_projet', 'rouvrir_projet', 'archiver_projet', 'terminer_projet', 'ajouter_livrable_projet', 'terminer_livrable_projet', 'ajouter_facture', 'marquer_facture_payee', 'abandonner_facture'];
    const lecture = ['lister_projets', 'lire_projet', 'lister_modeles_projet'];
    const lecteur = await noms('lecteur'); const biblio = await noms('biblio'); const code = await noms('code');
    for (const o of lecture) assert.ok(lecteur.includes(o) && biblio.includes(o) && code.includes(o), o);
    for (const o of ecriture) assert.ok(!lecteur.includes(o) && biblio.includes(o) && code.includes(o), o);
    assert.ok(!lecteur.includes('supprimer_projet') && !biblio.includes('supprimer_projet') && code.includes('supprimer_projet'));
    refuse(await s.appeler('lecteur', 'creer_projet', { titre: 'X' }));
    refuse(await s.appeler('biblio', 'supprimer_projet', { id: 'x', confirmationNom: 'x' }));
    assert.equal(projets(s).length, 0);
  });

  test('créer un projet : règles de l’écran (titre obligatoire, modèle, dates, offre), tâches du modèle, événement, propriétaire par défaut', async () => {
    const s = await avecModeles();
    refuse(await s.appeler('biblio', 'creer_projet', { titre: '   ' }), /titre/i);
    refuse(await s.appeler('biblio', 'creer_projet', { titre: 'X', modeleId: 'nimporte' }), /Modèle de projet introuvable/);
    refuse(await s.appeler('biblio', 'creer_projet', { titre: 'X', dateDebut: '2026-10-10', dateFin: '2026-10-01' }), /fin ne peut pas précéder/);
    refuse(await s.appeler('biblio', 'creer_projet', { titre: 'X', offreId: 'inconnue' }), /Offre inconnue/);
    refuse(await s.appeler('biblio', 'creer_projet', { titre: 'X', personneId: 'fantome' }), /Personne introuvable/);
    assert.equal(projets(s).length, 0, 'aucun refus n’écrit');
    const r = ok(await s.appeler('biblio', 'creer_projet', { titre: ' Audit des Lilas ', personneId: 'p1', modeleId: 'audit', dateDebut: '2026-10-05' }));
    const p = s.doc('projets_projets', r.id);
    assert.deepEqual([p.titre, p.phase, p.statut, p.organisationId, p.modeleId, p.proprietaire, p.factures], ['Audit des Lilas', 'lancement', 'actif', 'org1', 'audit', 'jerome.chevalier@gmail.com', []]);
    assert.equal(p.creePar, 'hermes-bibliothecaire');
    assert.equal(s.collections.projets_taches.filter((t) => t.projetId === r.id).length, 3);
    assert.ok(s.collections.crm_evenements.some((e) => e.type === 'projet_cree' && e.projetId === r.id && e.personneId === 'p1'));
    assert.ok(s.lignesJournal.length > 0);
  });

  test('créer le projet d’une affaire gagnée : lie l’affaire ; refus si l’affaire n’est pas gagnée ou a déjà un projet', async () => {
    const s = await avecModeles();
    refuse(await s.appeler('biblio', 'creer_projet_depuis_affaire', { affaireId: 'a1' }), /gagn/i);
    const r = ok(await s.appeler('biblio', 'creer_projet_depuis_affaire', { affaireId: 'a2', modeleId: 'accompagnement' }));
    assert.equal(s.doc('crm_affaires', 'a2').projetId, r.id);
    assert.equal(s.doc('projets_projets', r.id).affaireId, 'a2');
    assert.equal(s.doc('projets_projets', r.id).titre, 'Application de commande Boulangerie');
    refuse(await s.appeler('biblio', 'creer_projet_depuis_affaire', { affaireId: 'a2' }), /déjà/i);
    refuse(await s.appeler('biblio', 'creer_projet_depuis_affaire', { affaireId: 'fantome' }), /Affaire introuvable/);
  });

  test('I5 (TL3) plus de champ description dans les outils ; creer_affaire, creer_projet et creer_projet_depuis_affaire créent une note épinglée de départ (vide, ou copie de celle de l’affaire), journalisée, absente du fil tant qu’elle est vide', async () => {
    const s = await avecModeles();
    for (const nom of ['creer_affaire', 'modifier_affaire', 'creer_projet', 'modifier_projet', 'creer_projet_depuis_affaire']) {
      const o = OUTILS_ECRITURE.find((x) => x.nom === nom);
      // Ancien paramètre accepté sans documentation (clients MCP qui ont gardé l'ancienne liste d'outils).
      assert.equal(o.schema.description?.description, undefined, `${nom} : paramètre description non documenté`);
      assert.doesNotMatch(o.description, /texte libre|description \(/, `${nom} : la description de l’outil ne parle plus du texte libre`);
    }
    // creer_affaire : une note épinglée vide, rendue dans noteEpingleeId, même moteur (journal) que les autres écritures.
    const a = ok(await s.appeler('biblio', 'creer_affaire', { titre: 'Boulangerie', personneId: 'p1' }));
    assert.equal('description' in s.doc('crm_affaires', a.id), false);
    const noteA = s.doc('crm_notes', a.noteEpingleeId);
    assert.deepEqual([noteA.texte, noteA.epinglee, noteA.affaireId, noteA.personneId, noteA.auteur, noteA.via], ['', true, a.id, 'p1', 'hermes-bibliothecaire', 'mcp']);
    assert.ok(s.collections.crm_audit.some((l) => l.docId === a.noteEpingleeId && l.collection === 'crm_notes' && l.action === 'creer' && l.outil === 'creer_affaire'));
    // Lecture : la note vide ne pollue pas le fil ; un ancien champ description resté en base est ignoré.
    const lue = ok(await s.appeler('biblio', 'lire_affaire', { id: a.id, avecFil: true }));
    assert.equal(lue.fil.some((e) => e.genre === 'note'), false);
    s.doc('crm_affaires', 'a2').description = 'Ancien texte libre resté en base';
    assert.equal('description' in ok(await s.appeler('biblio', 'lire_affaire', { id: 'a2' })).affaire, false);
    refuse(await s.appeler('biblio', 'modifier_affaire', { id: 'a2', description: 'x' }), /Aucun champ.*note épinglée.*modifier_note/);
    const avec = ok(await s.appeler('biblio', 'modifier_affaire', { id: 'a2', source: '', description: 'x' }));
    assert.match(avec.avertissement, /description ignoré.*modifier_note/);
    assert.equal(s.doc('crm_affaires', 'a2').description, 'Ancien texte libre resté en base', 'rien n’est écrit dans l’ancien champ');
    // L'agent remplit la note avec modifier_note : elle apparaît alors dans le fil.
    ok(await s.appeler('biblio', 'modifier_note', { id: a.noteEpingleeId, texte: 'Besoin : une appli de commande.' }));
    assert.equal(ok(await s.appeler('biblio', 'lire_affaire', { id: a.id, avecFil: true })).fil.filter((e) => e.genre === 'note').length, 1);
    // Projet depuis une affaire gagnée : copie du texte de la note épinglée de l'affaire ; l'originale reste à l'affaire.
    s.collections.crm_notes.push({ id: 'n-a2', texte: 'Devis signé le 12.\nDémarrage en novembre.', epinglee: true, affaireId: 'a2', personneId: null, organisationId: null, auteur: 'x', creeLe: MAINTENANT, modifieLe: MAINTENANT });
    const r = ok(await s.appeler('biblio', 'creer_projet_depuis_affaire', { affaireId: 'a2' }));
    const noteP = s.doc('crm_notes', r.noteEpingleeId);
    assert.deepEqual([noteP.texte, noteP.epinglee, noteP.projetId, noteP.affaireId], ['Devis signé le 12.\nDémarrage en novembre.', true, r.id, 'a2']);
    assert.notEqual(r.noteEpingleeId, 'n-a2');
    assert.equal(s.doc('crm_notes', 'n-a2').texte, 'Devis signé le 12.\nDémarrage en novembre.', 'la note de l’affaire reste à elle');
    assert.equal('description' in s.doc('projets_projets', r.id), false);
    // Fil MCP de l'affaire : l'originale seulement, pas aussi la copie du projet (même affaireId, même texte).
    const filA2 = ok(await s.appeler('biblio', 'lire_affaire', { id: 'a2', avecFil: true })).fil.filter((e) => e.genre === 'note');
    assert.deepEqual(filA2.map((e) => e.id), ['n-a2']);
    const filP = ok(await s.appeler('biblio', 'lire_projet', { id: r.id, avecFil: true })).fil.filter((e) => e.genre === 'note');
    assert.deepEqual(filP.map((e) => e.id), [r.noteEpingleeId]);
    // creer_projet : note vide ; lire_projet n'a ni description ni note vide dans le fil.
    const p = ok(await s.appeler('biblio', 'creer_projet', { titre: 'Site' }));
    const noteVide = s.doc('crm_notes', p.noteEpingleeId);
    assert.deepEqual([noteVide.texte, noteVide.epinglee, noteVide.projetId], ['', true, p.id]);
    const lp = ok(await s.appeler('biblio', 'lire_projet', { id: p.id, avecFil: true }));
    assert.equal('description' in lp.projet, false);
    assert.equal(lp.fil.some((e) => e.genre === 'note'), false);
    refuse(await s.appeler('biblio', 'modifier_projet', { id: p.id, description: 'x' }), /Aucun champ.*note épinglée.*modifier_note/);
    assert.match(ok(await s.appeler('biblio', 'modifier_projet', { id: p.id, titre: 'Site 2', description: 'x' })).avertissement, /modifier_note/);
    // Les listes ne rendent plus l'ancien champ resté en base.
    s.doc('projets_projets', p.id).description = 'Ancien texte du projet';
    assert.equal(ok(await s.appeler('biblio', 'lister_affaires', {})).affaires.some((x) => 'description' in x), false);
    assert.equal(ok(await s.appeler('biblio', 'lister_projets', {})).projets.some((x) => 'description' in x), false);
  });

  test('I5 ancien paramètre description (client MCP pas à jour) : à la création, il devient le texte de la note épinglée de départ', async () => {
    const s = await avecModeles();
    const a = ok(await s.appeler('biblio', 'creer_affaire', { titre: 'Boulangerie', description: '  Besoin : une appli.\nDevis à faire.  ' }));
    assert.deepEqual([s.doc('crm_notes', a.noteEpingleeId).texte, s.doc('crm_notes', a.noteEpingleeId).epinglee], ['Besoin : une appli.\nDevis à faire.', true]);
    assert.equal('description' in s.doc('crm_affaires', a.id), false);
    const p = ok(await s.appeler('biblio', 'creer_projet', { titre: 'Site', description: 'Refonte du site vitrine.' }));
    assert.equal(s.doc('crm_notes', p.noteEpingleeId).texte, 'Refonte du site vitrine.');
    s.collections.crm_notes.push({ id: 'n-a2', texte: 'Note de l’affaire', epinglee: true, affaireId: 'a2', personneId: null, organisationId: null, auteur: 'x', creeLe: MAINTENANT, modifieLe: MAINTENANT });
    const r = ok(await s.appeler('biblio', 'creer_projet_depuis_affaire', { affaireId: 'a2', description: 'Texte donné par l’agent' }));
    const n = s.doc('crm_notes', r.noteEpingleeId);
    assert.equal(n.texte, 'Texte donné par l’agent', 'le texte donné l’emporte sur la copie');
    assert.equal('copieDeNoteId' in n, false);
    // Chaîne vide envoyée par un ancien client : « non donné », la note de l'affaire est copiée.
    s.doc('projets_projets', r.id).affaireId = null; s.doc('crm_affaires', 'a2').projetId = null;
    const r2 = ok(await s.appeler('biblio', 'creer_projet_depuis_affaire', { affaireId: 'a2', description: '' }));
    assert.deepEqual([s.doc('crm_notes', r2.noteEpingleeId).texte, s.doc('crm_notes', r2.noteEpingleeId).copieDeNoteId], ['Note de l’affaire', 'n-a2']);
    refuse(await s.appeler('biblio', 'creer_affaire', { titre: 'Trop long', description: 'x'.repeat(20001) }));
  });

  test('phase, archivage, modification : mêmes règles que l’écran ; « rien à faire » n’écrit rien', async () => {
    const s = await avecModeles();
    const { id } = ok(await s.appeler('biblio', 'creer_projet', { titre: 'Site' }));
    refuse(await s.appeler('biblio', 'changer_phase_projet', { id, phase: 'bidon' }), /Phase inconnue/);
    ok(await s.appeler('biblio', 'changer_phase_projet', { id, phase: 'livraison' }));
    assert.equal(s.doc('projets_projets', id).phase, 'livraison');
    assert.equal(ok(await s.appeler('biblio', 'changer_phase_projet', { id, phase: 'livraison' })).rien, true);
    assert.equal(s.doc('projets_projets', id).statut, 'actif');
    ok(await s.appeler('biblio', 'archiver_projet', { id, archive: true }));
    assert.equal(s.doc('projets_projets', id).archive, true);
    ok(await s.appeler('biblio', 'archiver_projet', { id, archive: false }));
    refuse(await s.appeler('biblio', 'modifier_projet', { id }), /Aucun champ/);
    refuse(await s.appeler('biblio', 'modifier_projet', { id, dateDebut: 'demain' }), /AAAA-MM-JJ/);
    refuse(await s.appeler('biblio', 'modifier_projet', { id, urlGithub: 'pas-une-url' }));
    // Dossier de travail : n'importe quel lien complet (plus de restriction « Google Drive seulement »), un texte libre est refusé.
    refuse(await s.appeler('biblio', 'modifier_projet', { id, urlDossier: 'Mon Drive/Projets/x' }), /lien complet/);
    for (const lien of ['smb://nas/clients/carrel', 'https://exemple.test/espace/carrel', 'http://nas.local:5000/partage']) {
      ok(await s.appeler('biblio', 'modifier_projet', { id, urlDossier: lien }));
      assert.equal(s.doc('projets_projets', id).urlDossier, lien);
    }
    ok(await s.appeler('biblio', 'modifier_projet', { id, urlDossier: '' }));
    assert.equal(s.doc('projets_projets', id).urlDossier, '');
    assert.match(OUTILS_ECRITURE.find((o) => o.nom === 'modifier_projet').schema.urlDossier.description, /n’importe quel lien/);
    assert.doesNotMatch(OUTILS_ECRITURE.find((o) => o.nom === 'modifier_projet').schema.urlDossier.description, /Google Drive de travail/);
    ok(await s.appeler('biblio', 'modifier_projet', { id, titre: 'Site refait', dateFin: '2026-12-01', urlDossier: 'https://drive.google.com/drive/folders/abc' }));
    assert.deepEqual([s.doc('projets_projets', id).titre, s.doc('projets_projets', id).dateFin, s.doc('projets_projets', id).modifiePar], ['Site refait', '2026-12-01', 'hermes-bibliothecaire']);
    refuse(await s.appeler('biblio', 'lire_projet', { id: 'fantome' }), /introuvable/);
  });

  test('terminer un projet : phase Clôture, statut Terminé, archivé, aucun autre projet créé ; terminer deux fois ne fait rien', async () => {
    const s = await avecModeles();
    const { id } = ok(await s.appeler('code', 'creer_projet', { titre: 'Site vitrine', urlDossier: 'https://drive.google.com/drive/folders/xyz' }));
    const fin = ok(await s.appeler('code', 'terminer_projet', { id }));
    assert.deepEqual([s.doc('projets_projets', id).statut, s.doc('projets_projets', id).phase, s.doc('projets_projets', id).archive], ['termine', 'cloture', true]);
    assert.equal(projets(s).length, 1, 'X2 la fin d’un projet ne crée plus de projet d’extraction');
    assert.equal('extraction' in fin, false);
    assert.equal(ok(await s.appeler('code', 'terminer_projet', { id })).rien, true);
    ok(await s.appeler('code', 'rouvrir_projet', { id }));
    ok(await s.appeler('code', 'terminer_projet', { id }));
    assert.equal(projets(s).length, 1);
  });

  test('X7 un ancien projet « nature: extraction » (sans l’option) se lit et se termine comme un projet ordinaire, sans erreur', async () => {
    const s = await avecModeles();
    s.collections.projets_projets = [{ id: 'ex1', titre: 'Extraction : Ancien', nature: 'extraction', projetSourceId: 'pr9', affaireId: null, phase: 'decouverte', statut: 'actif', archive: false, factures: [] }];
    const lu = ok(await s.appeler('lecteur', 'lire_projet', { id: 'ex1' }));
    assert.equal(lu.projet.titre, 'Extraction : Ancien');
    assert.equal(lu.projet.nature, 'extraction', 'la donnée est montrée telle quelle');
    assert.equal(ok(await s.appeler('lecteur', 'lister_projets', {})).total, 1);
    const avant = structuredClone(s.doc('projets_projets', 'ex1'));
    ok(await s.appeler('code', 'terminer_projet', { id: 'ex1' }));
    assert.deepEqual([s.doc('projets_projets', 'ex1').statut, s.doc('projets_projets', 'ex1').nature, s.doc('projets_projets', 'ex1').projetSourceId], ['termine', avant.nature, avant.projetSourceId]);
    assert.equal(projets(s).length, 1);
  });

  test('K3 livrables : ajouter_livrable_projet et terminer_livrable_projet (anciens noms retirés), phase du projet par défaut, validation, événement « Livrable fait », remettre à faire', async () => {
    const s = await avecModeles();
    const { id } = ok(await s.appeler('biblio', 'creer_projet', { titre: 'Site', modeleId: 'accompagnement' }));
    refuse(await s.appeler('biblio', 'ajouter_livrable_projet', { projetId: id, titre: ' ' }), /titre/i);
    refuse(await s.appeler('biblio', 'ajouter_livrable_projet', { projetId: id, titre: 'X', phase: 'bidon' }), /Phase inconnue/);
    refuse(await s.appeler('biblio', 'ajouter_livrable_projet', { projetId: id, titre: 'X', assigneA: 'fantome' }), /inconnue/);
    refuse(await s.appeler('biblio', 'ajouter_livrable_projet', { projetId: 'fantome', titre: 'X' }), /Projet introuvable/);
    const t = ok(await s.appeler('biblio', 'ajouter_livrable_projet', { projetId: id, titre: 'Envoyer le devis', date: '2026-10-09', assigneA: 'charles' }));
    const tache = s.doc('projets_taches', t.id);
    assert.deepEqual([tache.phase, tache.fait, tache.date, tache.assigneA, tache.projetId], ['lancement', false, '2026-10-09', 'charles', id]);
    ok(await s.appeler('biblio', 'terminer_livrable_projet', { id: t.id }));
    assert.equal(s.doc('projets_taches', t.id).fait, true);
    assert.ok(s.collections.crm_evenements.some((e) => e.type === 'tache_faite' && e.projetId === id));
    assert.equal(ok(await s.appeler('biblio', 'terminer_livrable_projet', { id: t.id })).rien, true);
    ok(await s.appeler('biblio', 'terminer_livrable_projet', { id: t.id, fait: false }));
    assert.equal(s.doc('projets_taches', t.id).fait, false);
    // K3 : les anciens noms d'outils n'existent plus (décision de Jérôme : aucun alias)
    refuse(await s.appeler('biblio', 'ajouter_tache_projet', { projetId: id, titre: 'X' }));
    refuse(await s.appeler('biblio', 'terminer_tache_projet', { id: t.id }));
    assert.ok(s.collections.crm_evenements.some((e) => e.texte === 'Livrable fait : Envoyer le devis'));
  });

  test('factures : 30 % + 30 % + 40 %, la Clôture est refusée tant qu’une facture est à payer (message avec les factures), deux sorties', async () => {
    const s = await avecModeles();
    const { id } = ok(await s.appeler('biblio', 'creer_projet', { titre: 'Audit' }));
    refuse(await s.appeler('biblio', 'ajouter_facture', { projetId: id, montant: 0 }));
    refuse(await s.appeler('biblio', 'ajouter_facture', { projetId: id, montant: 100, dateEnvoi: '10/10/2026' }));
    const f1 = ok(await s.appeler('biblio', 'ajouter_facture', { projetId: id, montant: 300, libelle: 'Acompte 30 %', dateEnvoi: '2026-10-01' }));
    const f2 = ok(await s.appeler('biblio', 'ajouter_facture', { projetId: id, montant: 300, libelle: 'En cours 30 %' }));
    ok(await s.appeler('biblio', 'ajouter_facture', { projetId: id, montant: 400, libelle: 'Solde 40 %' }));
    assert.deepEqual(s.doc('projets_projets', id).factures.map((f) => [f.libelle, f.montant, f.statut]), [['Acompte 30 %', 300, 'a_payer'], ['En cours 30 %', 300, 'a_payer'], ['Solde 40 %', 400, 'a_payer']]);
    ok(await s.appeler('biblio', 'marquer_facture_payee', { projetId: id, factureId: f1.factureId, datePaiement: '2026-10-04' }));
    // une facture se paie en entier : un autre montant est refusé (message clair), rien n'est écrit ; le montant exact passe
    refuse(await s.appeler('biblio', 'marquer_facture_payee', { projetId: id, factureId: f2.factureId, montant: 250 }), /se paie en entier/);
    assert.deepEqual(s.doc('projets_projets', id).factures.map((f) => [f.statut, f.montant]), [['payee', 300], ['a_payer', 300], ['a_payer', 400]]);
    ok(await s.appeler('biblio', 'marquer_facture_payee', { projetId: id, factureId: f2.factureId, montant: 300 }));
    assert.deepEqual(s.doc('projets_projets', id).factures.map((f) => [f.statut, f.montant]), [['payee', 300], ['payee', 300], ['a_payer', 400]]);
    assert.equal(ok(await s.appeler('biblio', 'marquer_facture_payee', { projetId: id, factureId: f1.factureId })).rien, true);
    assert.equal(s.collections.crm_evenements.filter((e) => e.type === 'encaissement' && e.projetId === id).length, 2);
    // clôture refusée : message de l'écran + factures nommées
    const refus = await s.appeler('biblio', 'terminer_projet', { id });
    refuse(refus, /Clôture bloquée.*Solde 40 %/);
    assert.match(refus.texte, /impaye/);
    refuse(await s.appeler('biblio', 'changer_phase_projet', { id, phase: 'cloture' }), /Clôture bloquée/);
    assert.equal(s.doc('projets_projets', id).statut, 'actif');
    // la raison de l'impayé est obligatoire
    refuse(await s.appeler('biblio', 'terminer_projet', { id, impaye: { raison: '   ' } }), /pourquoi/);
    const fin = ok(await s.appeler('biblio', 'terminer_projet', { id, impaye: { raison: 'Client injoignable' } }));
    const p = s.doc('projets_projets', id);
    assert.deepEqual([p.statut, p.factures.map((f) => f.statut), p.factures[2].raison], ['termine', ['payee', 'payee', 'abandonnee'], 'Client injoignable']);
    assert.equal(fin.abandonnees.length, 1);
    assert.equal(projets(s).length, 1);
    assert.ok(s.collections.crm_evenements.some((e) => e.type === 'facture_abandonnee' && e.projetId === id));
  });

  test('abandonner une facture à la main : raison obligatoire ; une facture payée ne s’abandonne pas ; elle ne bloque plus la clôture', async () => {
    const s = await avecModeles();
    const { id } = ok(await s.appeler('biblio', 'creer_projet', { titre: 'Audit' }));
    const f = ok(await s.appeler('biblio', 'ajouter_facture', { projetId: id, montant: 500 }));
    const payee = ok(await s.appeler('biblio', 'ajouter_facture', { projetId: id, montant: 100, datePaiement: '2026-10-02' }));
    refuse(await s.appeler('biblio', 'abandonner_facture', { projetId: id, factureId: f.factureId, raison: ' ' }), /pourquoi/);
    refuse(await s.appeler('biblio', 'abandonner_facture', { projetId: id, factureId: payee.factureId, raison: 'x' }), /payée/);
    refuse(await s.appeler('biblio', 'abandonner_facture', { projetId: id, factureId: 'fantome', raison: 'x' }), /introuvable/);
    ok(await s.appeler('biblio', 'abandonner_facture', { projetId: id, factureId: f.factureId, raison: 'Geste commercial' }));
    ok(await s.appeler('biblio', 'terminer_projet', { id }));
    assert.equal(s.doc('projets_projets', id).statut, 'termine');
  });

  test('K3 lecture : lister_projets (filtres, avancement, facturation), lire_projet (clé « livrables », factures, fil), lister_modeles_projet (clé « livrables »)', async () => {
    const s = await avecModeles();
    const a = ok(await s.appeler('biblio', 'creer_projet', { titre: 'Audit des Lilas', personneId: 'p1', modeleId: 'audit' }));
    const b = ok(await s.appeler('biblio', 'creer_projet', { titre: 'Autre projet' }));
    ok(await s.appeler('biblio', 'changer_phase_projet', { id: b.id, phase: 'livraison' }));
    ok(await s.appeler('biblio', 'ajouter_facture', { projetId: a.id, montant: 1000 }));
    const liste = ok(await s.appeler('lecteur', 'lister_projets', {}));
    assert.deepEqual(liste.projets.map((p) => p.titre), ['Audit des Lilas', 'Autre projet']);
    const lilas = liste.projets[0];
    assert.deepEqual([lilas.personne, lilas.organisation, lilas.avancement.total, lilas.avancement.faites], ['Camille Durand', 'Atelier des Lilas', 3, 0]);
    assert.deepEqual([lilas.facturation.facture, lilas.facturation.paye, lilas.facturation.aPayer, lilas.facturation.impaye], [1000, 0, 1, false]);
    assert.deepEqual(ok(await s.appeler('lecteur', 'lister_projets', { recherche: 'lilas' })).projets.map((p) => p.id), [a.id]);
    assert.deepEqual(ok(await s.appeler('lecteur', 'lister_projets', { phase: 'livraison' })).projets.map((p) => p.id), [b.id]);
    assert.equal(ok(await s.appeler('lecteur', 'lister_projets', { archive: true })).total, 0);
    const fiche = ok(await s.appeler('lecteur', 'lire_projet', { id: a.id, avecFil: true }));
    assert.equal(fiche.projet.titre, 'Audit des Lilas');
    assert.equal(fiche.livrables.length, 3);
    assert.equal(fiche.projet.factures.length, 1);
    assert.deepEqual([fiche.personne.nom, 'extraction' in fiche, fiche.fil.some((e) => e.type === 'projet_cree')], ['Camille Durand', false, true]);
    assert.equal(ok(await s.appeler('lecteur', 'lister_modeles_projet', {})).total, 2);
    // K3 : les modèles et la fiche d'un projet parlent de « livrables » (le stockage garde `taches`, aucune migration)
    const modeles = ok(await s.appeler('lecteur', 'lister_modeles_projet', {})).modeles;
    assert.ok(modeles.every((m) => Array.isArray(m.livrables) && !('taches' in m)));
    assert.ok(!('taches' in fiche));
    assert.ok(ok(await s.appeler('lecteur', 'lire_reglages', {})).referentiels.projets.phases.some((p) => p.id === 'cloture'));
  });

  test('supprimer_projet (Claude Code) : confirmation par le titre, tâches et fil supprimés, affaire gardée ; restaurer_depuis_audit redonne tout', async () => {
    const s = await avecModeles();
    const r = ok(await s.appeler('code', 'creer_projet_depuis_affaire', { affaireId: 'a2', modeleId: 'audit' }));
    const avant = structuredClone(s.vue());
    refuse(await s.appeler('code', 'supprimer_projet', { id: r.id }));
    refuse(await s.appeler('code', 'supprimer_projet', { id: r.id, confirmationNom: 'Mauvais titre' }), /non confirmée/);
    assert.deepEqual(s.vue(), avant, 'rien n’est supprimé sans confirmation');
    const sup = ok(await s.supprimer('code', 'supprimer_projet', { id: r.id, confirmationNom: 'application de commande boulangerie' }));
    assert.equal(s.doc('projets_projets', r.id), undefined);
    assert.equal(s.collections.projets_taches.filter((t) => t.projetId === r.id).length, 0);
    assert.equal(s.doc('crm_affaires', 'a2').projetId, null, 'l’affaire est gardée, son lien vidé');
    assert.equal(s.collections.crm_evenements.filter((e) => e.projetId === r.id).length, 0);
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: sup.operationId, apercu: false }));
    assert.deepEqual(s.vue(), avant, 'la restauration redonne exactement les mêmes documents');
  });

  test('une opération d’écriture de projet est journalisée (audit) et restaurable : annuler une création de projet le supprime avec ses tâches', async () => {
    const s = await avecModeles();
    const r = ok(await s.appeler('biblio', 'creer_projet', { titre: 'Test', modeleId: 'audit' }));
    assert.equal(s.collections.projets_taches.length, 3);
    assert.ok((await s.donnees.liste('crm_audit', { champ: 'operationId', valeur: r.operationId })).length >= 5);
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }));
    assert.equal(projets(s).length, 0);
    assert.equal(s.collections.projets_taches.length, 0);
    assert.equal(s.collections.crm_evenements.filter((e) => e.type === 'projet_cree').length, 0);
  });
});

// ---------------------------------------------------------------- configuration de l'espace (ménage du CRM, 2026-10-16)

describe('Configuration de l’espace lue par le serveur : la même que l’écran', () => {
  const avecReglage = (s, id, doc) => { s.collections.crm_parametres = [...s.collections.crm_parametres.filter((d) => d.id !== id), { id, ...doc }]; };

  test('sans document de configuration, la racine garde les valeurs de Jérôme (migration douce)', async () => {
    const s = await demarrer();
    const r = ok(await s.appeler('biblio', 'lire_reglages'));
    assert.equal('extractionValeur' in r.configuration.options, false, 'X1 l’option « Extraction de valeur » n’existe plus dans les réglages lus');
    assert.equal(r.configuration.options.suiviPaiements, true);
    assert.deepEqual(r.referentiels.etapes.map((e) => e.id), ['premier_contact', 'rdv_fixe', 'proposition_envoyee', 'gagne']);
  });

  test('étapes : un emplacement désactivé est refusé, un renommage se voit dans lire_reglages, le rôle « vente gagnée » est celui de la configuration', async () => {
    const s = await demarrer();
    avecReglage(s, 'etapes', { items: [{ libelle: 'Contact' }, { libelle: 'Rendez-vous', actif: false }, {}, { libelle: 'Signé' }], roleGagnee: 'proposition_envoyee' });
    const r = ok(await s.appeler('biblio', 'lire_reglages'));
    assert.equal(r.configuration.etapes[0].libelle, 'Contact');
    assert.deepEqual(r.referentiels.etapes.map((e) => e.id), ['premier_contact', 'proposition_envoyee', 'gagne']);
    refuse(await s.appeler('biblio', 'changer_etape', { id: 'a2', etape: 'rdv_fixe' }), /désactivée/);
    refuse(await s.appeler('biblio', 'creer_affaire', { titre: 'X', etape: 'rdv_fixe' }), /désactivée/);
    const g = ok(await s.appeler('biblio', 'changer_etape', { id: 'a2', etape: 'proposition_envoyee' }));
    assert.equal(g.statut, 'gagnee', 'le rôle « vente gagnée » est porté par l’étape que la configuration désigne');
  });

  test('action suggérée par une étape : rendue par changer_etape, jamais créée', async () => {
    const s = await demarrer();
    avecReglage(s, 'etapes', { items: [{}, { action: { type: 'appel', titre: 'Confirmer', delaiJours: 2 } }] });
    const avant = s.collections.crm_activites.length;
    const r = ok(await s.appeler('biblio', 'changer_etape', { id: 'a2', etape: 'rdv_fixe' }));
    assert.deepEqual(r.suggestion, { type: 'appel', titre: 'Confirmer', date: '2026-10-07' });
    assert.equal(s.collections.crm_activites.length, avant);
  });

  test('X1 un ancien réglage « extractionValeur » resté dans la base est ignoré : rien n’est créé, aucune erreur', async () => {
    const s = await demarrer();
    avecReglage(s, 'reglages', { extractionValeur: true });
    const perdue = ok(await s.appeler('biblio', 'marquer_perdue', { id: 'a2', raison: 'Prix' }));
    assert.equal('extraction' in perdue, false);
    assert.equal((s.collections.projets_projets || []).length, 0);
    const { id } = ok(await s.appeler('biblio', 'creer_projet', { titre: 'Chantier' }));
    const fin = ok(await s.appeler('biblio', 'terminer_projet', { id }));
    assert.equal('extraction' in fin, false);
    assert.equal('extraction' in ok(await s.appeler('biblio', 'lire_projet', { id })), false);
  });

  test('suivi des paiements éteint : factures refusées, clôture jamais bloquée ; règle « clôture bloquée » réglable', async () => {
    const s = await demarrer();
    const { id } = ok(await s.appeler('biblio', 'creer_projet', { titre: 'Audit' }));
    ok(await s.appeler('biblio', 'ajouter_facture', { projetId: id, montant: 100 }));
    avecReglage(s, 'reglages', { clotureBloquee: false });
    const libre = ok(await s.appeler('biblio', 'terminer_projet', { id }));
    assert.equal(libre.statut, 'termine', 'règle éteinte : une facture à payer ne bloque pas');
    const s2 = await demarrer();
    avecReglage(s2, 'reglages', { suiviPaiements: false });
    const p2 = ok(await s2.appeler('biblio', 'creer_projet', { titre: 'Audit' })).id;
    refuse(await s2.appeler('biblio', 'ajouter_facture', { projetId: p2, montant: 100 }), /suivi des paiements est désactivé/);
    assert.equal(ok(await s2.appeler('biblio', 'terminer_projet', { id: p2 })).statut, 'termine');
    assert.equal((await s2.appeler('biblio', 'lire_projet', { id: p2 })).data.facturation, null);
  });

  test('phases : une phase désactivée est refusée, la phase « clôture » est celle de la configuration', async () => {
    const s = await demarrer();
    avecReglage(s, 'phases', { items: [{}, { actif: false }], roleCloture: 'livraison' });
    const { id } = ok(await s.appeler('biblio', 'creer_projet', { titre: 'Chantier' }));
    refuse(await s.appeler('biblio', 'changer_phase_projet', { id, phase: 'decouverte' }), /désactivée/);
    ok(await s.appeler('biblio', 'terminer_projet', { id }));
    assert.equal(s.doc('projets_projets', id).phase, 'livraison');
  });
});

describe('Emails et téléphones multiples d’une organisation (critère 8)', () => {
  test('8a modifier_organisation : emails et telephones (listes avec type) remplacent la liste, l’ancien champ est vidé, lire_organisation les rend', async () => {
    const s = await demarrer();
    const r = ok(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', emails: [{ valeur: 'contact@exemple.test', type: 'travail' }, { valeur: 'compta@exemple.test', type: 'autre' }], telephones: [{ valeur: '04 00 00 00 00' }] }));
    assert.deepEqual(r.champsModifies.sort(), ['email', 'emails', 'telephone', 'telephones']);
    const o = s.doc('crm_organisations', 'org1');
    assert.deepEqual(o.emails, [{ valeur: 'contact@exemple.test', type: 'travail' }, { valeur: 'compta@exemple.test', type: 'autre' }]);
    assert.deepEqual(o.telephones, [{ valeur: '04 00 00 00 00', type: 'travail' }]);
    assert.equal(o.email, '');
    const lue = ok(await s.appeler('lecteur', 'lire_organisation', { id: 'org1' }));
    assert.equal(lue.organisation.emails.length, 2);
    assert.equal(lue.organisation.telephones[0].valeur, '04 00 00 00 00');
  });

  test('8b un email invalide est refusé (saisie_invalide) et rien n’est écrit ; plus de 10 valeurs est refusé', async () => {
    const s = await demarrer();
    const avant = s.vue();
    refuse(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', emails: [{ valeur: 'pas-un-email' }] }), /invalide/i);
    refuse(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', email: 'pas-un-email' }), /invalide/i);
    refuse(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', emails: Array.from({ length: 11 }, (_, i) => ({ valeur: `e${i}@exemple.test` })) }));
    assert.deepEqual(s.vue(), avant);
  });

  test('8c les anciens champs texte email et telephone sont AJOUTÉS à la liste (jamais perdus), sans doublon', async () => {
    const s = await demarrer();
    ok(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', emails: [{ valeur: 'un@exemple.test' }] }));
    ok(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', email: 'Deux@Exemple.test', telephone: '04 11 11 11 11' }));
    ok(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', email: 'deux@exemple.test' })); // déjà là : pas de doublon
    const o = s.doc('crm_organisations', 'org1');
    assert.deepEqual(o.emails.map((e) => e.valeur), ['un@exemple.test', 'Deux@Exemple.test']);
    assert.deepEqual(o.telephones.map((t) => t.valeur), ['04 11 11 11 11']);
    ok(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', telephone: '04.11.11.11.11' })); // mêmes chiffres : pas de doublon
    assert.equal(s.doc('crm_organisations', 'org1').telephones.length, 1);
  });

  test('8f une liste déjà pleine (10) refuse un email donné par l\'ancien champ ; la création sans doublon d\'email ; une valeur blanche est ignorée', async () => {
    const s = await demarrer();
    ok(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', emails: Array.from({ length: 10 }, (_, i) => ({ valeur: `e${i}@exemple.test` })) }));
    refuse(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', email: 'onzieme@exemple.test' }), /Au plus 10/);
    assert.equal(s.doc('crm_organisations', 'org1').emails.length, 10);
    const o = ok(await s.appeler('biblio', 'creer_organisation', { nom: 'Sans Doublon', emails: [{ valeur: 'a@exemple.test' }, { valeur: 'A@Exemple.test' }, { valeur: ' ' }] }));
    assert.deepEqual(s.doc('crm_organisations', o.id).emails.map((e) => e.valeur), ['a@exemple.test']);
  });

  test('8d une organisation non convertie (ancien champ email) : lire_organisation le rend comme première valeur ; la liste vide [] efface tout', async () => {
    const s = await demarrer();
    s.collections.crm_organisations.find((o) => o.id === 'org1').email = 'ancien@exemple.test';
    const lue = ok(await s.appeler('lecteur', 'lire_organisation', { id: 'org1' }));
    assert.deepEqual(lue.organisation.emails, [{ valeur: 'ancien@exemple.test', type: 'travail' }]);
    ok(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', emails: [] }));
    const o = s.doc('crm_organisations', 'org1');
    assert.deepEqual(o.emails, []);
    assert.equal(o.email, '');
  });

  test('8e creer_organisation accepte emails et telephones, refuse un email invalide', async () => {
    const s = await demarrer();
    const o = ok(await s.appeler('biblio', 'creer_organisation', { nom: 'Boutique Neuve', emails: [{ valeur: 'neuve@exemple.test', type: 'perso' }], telephones: [{ valeur: '04 22 22 22 22' }] }));
    assert.deepEqual(s.doc('crm_organisations', o.id).emails, [{ valeur: 'neuve@exemple.test', type: 'perso' }]);
    assert.equal(s.doc('crm_organisations', o.id).telephones.length, 1);
    refuse(await s.appeler('biblio', 'creer_organisation', { nom: 'Autre Boutique', emails: [{ valeur: 'x' }] }), /pas valide|invalide/i);
  });
});

describe('Adresses enregistrées d’une personne et d’une organisation (critères A6 et A7)', () => {
  const liste = [{ libelle: 'Siège', adresse: '12 rue des Lilas\n69001 Lyon', parDefaut: true }, { libelle: 'Atelier', adresse: '3 impasse des Roses, 69002 Lyon' }];

  test('A6 creer_organisation et modifier_organisation acceptent adresses ; lire_organisation rend les mêmes adresses', async () => {
    const s = await demarrer();
    const cree = ok(await s.appeler('biblio', 'creer_organisation', { nom: 'Boutique Adresses', adresses: liste }));
    const lue = ok(await s.appeler('lecteur', 'lire_organisation', { id: cree.id }));
    assert.deepEqual(lue.organisation.adresses.map((x) => [x.libelle, x.adresse, x.parDefaut]), [['Siège', '12 rue des Lilas\n69001 Lyon', true], ['Atelier', '3 impasse des Roses, 69002 Lyon', false]]);
    assert.ok(lue.organisation.adresses.every((x) => x.id));
    ok(await s.appeler('biblio', 'modifier_organisation', { id: cree.id, adresses: [lue.organisation.adresses[1]] }));
    assert.deepEqual(s.doc('crm_organisations', cree.id).adresses.map((x) => x.libelle), ['Atelier']);
    ok(await s.appeler('biblio', 'modifier_organisation', { id: cree.id, adresses: [] }));
    assert.deepEqual(s.doc('crm_organisations', cree.id).adresses, []);
  });

  test('A6 un ancien enregistrement sans liste est relu avec « Principale » et rien n’est écrit', async () => {
    const s = await demarrer();
    s.collections.crm_organisations.find((o) => o.id === 'org1').adresse = '8 quai du Port';
    const avant = s.vue();
    const lue = ok(await s.appeler('lecteur', 'lire_organisation', { id: 'org1' }));
    assert.equal(lue.organisation.adresses.length, 1);
    assert.equal(lue.organisation.adresses[0].libelle, 'Principale');
    assert.match(lue.organisation.adresses[0].adresse, /8 quai du Port/);
    assert.deepEqual(s.vue(), avant);
  });

  test('A7 modifier la liste ne change ni adresse ni ville de l’organisation', async () => {
    const s = await demarrer();
    s.collections.crm_organisations.find((o) => o.id === 'org1').adresse = '8 quai du Port';
    const lue = ok(await s.appeler('biblio', 'lire_organisation', { id: 'org1' }));
    ok(await s.appeler('biblio', 'modifier_organisation', { id: 'org1', adresses: [...lue.organisation.adresses, { libelle: 'Dépôt', adresse: '1 zone industrielle' }] }));
    const o = s.doc('crm_organisations', 'org1');
    assert.equal(o.adresse, '8 quai du Port');
    assert.equal(o.ville, 'Lyon');
    assert.deepEqual(o.adresses.map((x) => x.libelle), ['Principale', 'Dépôt']);
  });

  test('A6 personne : creer_personne, modifier_personne et lire_personne ; adresse vide, doublon et plus de 10 sont refusés sans rien écrire', async () => {
    const s = await demarrer();
    const p = ok(await s.appeler('biblio', 'creer_personne', { nom: 'Personne Adresses', adresses: liste }));
    assert.equal(s.doc('crm_personnes', p.id).adresses.length, 2);
    ok(await s.appeler('biblio', 'modifier_personne', { id: p.id, adresses: [{ libelle: 'Maison', adresse: '5 rue Basse' }] }));
    const lue = ok(await s.appeler('lecteur', 'lire_personne', { id: p.id }));
    assert.deepEqual(lue.personne.adresses.map((x) => x.libelle), ['Maison']);
    const avant = s.vue();
    refuse(await s.appeler('biblio', 'modifier_personne', { id: p.id, adresses: [{ adresse: '  ' }] }), /Écrivez l’adresse/);
    refuse(await s.appeler('biblio', 'modifier_personne', { id: p.id, adresses: [{ adresse: '5 rue Basse' }, { adresse: '5 RUE basse' }] }), /déjà dans la liste/);
    refuse(await s.appeler('biblio', 'modifier_personne', { id: p.id, adresses: Array.from({ length: 11 }, (_, i) => ({ adresse: `${i} rue Haute` })) }));
    refuse(await s.appeler('biblio', 'creer_organisation', { nom: 'Refusée', adresses: [{ adresse: '' }] }), /Écrivez l’adresse/);
    assert.deepEqual(s.vue(), avant);
  });
});

// ---------------------------------------------------------------- Devis : bordereau de prix (24/10/2026)

describe('B9 outils du bordereau (module Devis) : mêmes règles que l’écran, avec audit ; l’assistant n’invente jamais un prix', () => {
  const articles = (s) => s.collections.devis_articles || [];

  test('B9 droits : lecture pour les trois profils, écriture pour le bibliothécaire et Claude Code, aucune suppression', async () => {
    const s = await demarrer();
    const noms = async (j) => (await (await s.brut(j, 'tools/list')).json()).result.tools.map((t) => t.name);
    const lecteur = await noms('lecteur'); const biblio = await noms('biblio'); const code = await noms('code');
    for (const o of ['lister_articles', 'chercher_article']) assert.ok(lecteur.includes(o) && biblio.includes(o) && code.includes(o), o);
    for (const o of ['creer_article', 'modifier_article', 'desactiver_article']) assert.ok(!lecteur.includes(o) && biblio.includes(o) && code.includes(o), o);
    assert.ok(![...lecteur, ...biblio, ...code].includes('supprimer_article'), 'un article ne se supprime jamais');
    refuse(await s.appeler('lecteur', 'creer_article', { libelle: 'X', prixAchat: 1 }));
    assert.equal(articles(s).length, 0);
  });

  test('B9 l’assistant crée un article (euros, unité par défaut u), avec sa trace dans le journal et un propriétaire', async () => {
    const s = await demarrer();
    const r = ok(await s.appeler('biblio', 'creer_article', { libelle: ' Carrelage  60 x 60 ', prixAchat: 12.5, unite: 'm²', code: 'CAR-1', tauxTva: 10 }));
    const a = s.doc('devis_articles', r.id);
    assert.deepEqual([a.libelle, a.unite, a.prixAchat, a.code, a.tauxTva, a.actif], ['Carrelage 60 x 60', 'm²', 12.5, 'CAR-1', 10, true]);
    assert.equal(a.creePar, 'hermes-bibliothecaire');
    assert.ok(a.proprietaire, 'propriétaire par défaut');
    const simple = ok(await s.appeler('biblio', 'creer_article', { libelle: 'Vis', prixAchat: 0.1 }));
    assert.equal(s.doc('devis_articles', simple.id).unite, 'u');
    const audit = s.collections.crm_audit.filter((l) => l.collection === 'devis_articles' && l.docId === r.id);
    assert.deepEqual(audit.map((l) => [l.action, l.outil, l.statut]), [['creer', 'creer_article', 'succes']]);
    assert.ok(s.lignesJournal.length > 0);
  });

  test('B9 un prix d’achat non numérique est refusé (texte, vide, absent, négatif, 3 décimales) : rien n’est écrit', async () => {
    const s = await demarrer();
    refuse(await s.appeler('biblio', 'creer_article', { libelle: 'X', prixAchat: 'douze' }));
    refuse(await s.appeler('biblio', 'creer_article', { libelle: 'X', prixAchat: '12,5' }));
    refuse(await s.appeler('biblio', 'creer_article', { libelle: 'X', prixAchat: '' }));
    refuse(await s.appeler('biblio', 'creer_article', { libelle: 'X' }));
    refuse(await s.appeler('biblio', 'creer_article', { libelle: 'X', prixAchat: null }));
    refuse(await s.appeler('biblio', 'creer_article', { libelle: 'X', prixAchat: -3 }));
    refuse(await s.appeler('biblio', 'creer_article', { libelle: 'X', prixAchat: 1.234 }), /2 décimales/);
    refuse(await s.appeler('biblio', 'creer_article', { libelle: '   ', prixAchat: 5 }), /libellé est obligatoire/);
    assert.equal(articles(s).length, 0, 'aucun refus n’écrit');
  });

  test('B9 un code déjà utilisé par un article actif est refusé avec le message de l’écran', async () => {
    const s = await demarrer();
    ok(await s.appeler('biblio', 'creer_article', { libelle: 'Carrelage', prixAchat: 10, code: 'CAR' }));
    refuse(await s.appeler('biblio', 'creer_article', { libelle: 'Autre', prixAchat: 3, code: 'car' }), /déjà utilisé par l’article actif « Carrelage »/);
    assert.equal(articles(s).length, 1);
  });

  test('B9 chercher et lister : par code ou libellé (accents et casse ignorés), actifs par défaut', async () => {
    const s = await demarrer();
    const a = ok(await s.appeler('biblio', 'creer_article', { libelle: 'Carrelage grès cérame', prixAchat: 20, code: 'GRES' }));
    ok(await s.appeler('biblio', 'creer_article', { libelle: 'Peinture blanche', prixAchat: 8 }));
    assert.deepEqual(ok(await s.appeler('lecteur', 'chercher_article', { texte: 'GRES' })).articles.map((x) => x.id), [a.id]);
    assert.deepEqual(ok(await s.appeler('lecteur', 'chercher_article', { texte: 'gres cerame' })).articles.map((x) => x.id), [a.id]);
    assert.deepEqual(ok(await s.appeler('lecteur', 'chercher_article', { texte: 'inconnu' })).articles, []);
    assert.match(ok(await s.appeler('lecteur', 'chercher_article', { texte: 'a' })).message, /au moins/);
    const liste = ok(await s.appeler('lecteur', 'lister_articles', {}));
    assert.deepEqual(liste.articles.map((x) => x.libelle), ['Carrelage grès cérame', 'Peinture blanche']);
    assert.equal(liste.articles[0].prixAchat, 20);
    ok(await s.appeler('biblio', 'desactiver_article', { id: a.id }));
    assert.deepEqual(ok(await s.appeler('lecteur', 'lister_articles', {})).articles.map((x) => x.libelle), ['Peinture blanche']);
    assert.deepEqual(ok(await s.appeler('lecteur', 'lister_articles', { statut: 'desactives' })).articles.map((x) => x.libelle), ['Carrelage grès cérame']);
    assert.equal(ok(await s.appeler('lecteur', 'lister_articles', { statut: 'tous' })).total, 2);
    assert.deepEqual(ok(await s.appeler('lecteur', 'chercher_article', { texte: 'carrelage' })).articles, [], 'la recherche ne rend que les articles actifs');
  });

  test('B9 modifier : prix en euros, code, TVA ; un champ vide ou sans changement est refusé ; le prix doit rester numérique', async () => {
    const s = await demarrer();
    const a = ok(await s.appeler('biblio', 'creer_article', { libelle: 'Carrelage', prixAchat: 10, code: 'CAR', tauxTva: 20 }));
    const r = ok(await s.appeler('biblio', 'modifier_article', { id: a.id, prixAchat: 12.75, tauxTva: null }));
    assert.deepEqual(r.champsModifies, ['prixAchat', 'tauxTva']);
    assert.deepEqual([s.doc('devis_articles', a.id).prixAchat, s.doc('devis_articles', a.id).tauxTva], [12.75, null]);
    ok(await s.appeler('biblio', 'modifier_article', { id: a.id, code: '' }));
    assert.equal(s.doc('devis_articles', a.id).code, '');
    refuse(await s.appeler('biblio', 'modifier_article', { id: a.id, prixAchat: 'cher' }));
    refuse(await s.appeler('biblio', 'modifier_article', { id: a.id }), /Aucun champ à modifier/);
    refuse(await s.appeler('biblio', 'modifier_article', { id: a.id, prixAchat: 12.75 }), /Aucun champ à modifier/);
    refuse(await s.appeler('biblio', 'modifier_article', { id: 'fantome', prixAchat: 1 }), /Article introuvable/);
    ok(await s.appeler('biblio', 'creer_article', { libelle: 'Peinture', prixAchat: 5, code: 'PEI' }));
    ok(await s.appeler('biblio', 'modifier_article', { id: a.id, code: 'CAR-2' }));
    refuse(await s.appeler('biblio', 'modifier_article', { id: a.id, code: 'pei ' }), /déjà utilisé/);
    assert.equal(s.doc('devis_articles', a.id).modifiePar, 'hermes-bibliothecaire');
  });

  test('B9 désactiver ne supprime jamais ; réactiver le remet ; réactiver est refusé si le code est repris ; restaurer_depuis_audit défait une modification', async () => {
    const s = await demarrer();
    const a = ok(await s.appeler('biblio', 'creer_article', { libelle: 'Carrelage', prixAchat: 10, code: 'CAR' }));
    const off = ok(await s.appeler('biblio', 'desactiver_article', { id: a.id }));
    assert.equal(off.actif, false);
    assert.equal(s.doc('devis_articles', a.id).actif, false);
    assert.equal(articles(s).length, 1, 'le document est toujours là');
    refuse(await s.appeler('biblio', 'desactiver_article', { id: a.id }), /déjà désactivé/);
    ok(await s.appeler('biblio', 'creer_article', { libelle: 'Nouveau carrelage', prixAchat: 11, code: 'CAR' }));
    refuse(await s.appeler('biblio', 'desactiver_article', { id: a.id, reactiver: true }), /maintenant utilisé par l’article actif « Nouveau carrelage »/);
    const b = ok(await s.appeler('biblio', 'creer_article', { libelle: 'Peinture', prixAchat: 5 }));
    ok(await s.appeler('biblio', 'desactiver_article', { id: b.id }));
    ok(await s.appeler('biblio', 'desactiver_article', { id: b.id, reactiver: true }));
    assert.equal(s.doc('devis_articles', b.id).actif, true);
    refuse(await s.appeler('biblio', 'desactiver_article', { id: b.id, reactiver: true }), /déjà actif/);
    refuse(await s.appeler('biblio', 'desactiver_article', { id: 'fantome' }), /Article introuvable/);
    const modif = ok(await s.appeler('biblio', 'modifier_article', { id: b.id, prixAchat: 99 }));
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: modif.operationId, apercu: false }));
    assert.equal(s.doc('devis_articles', b.id).prixAchat, 5, 'la restauration rétablit l’ancien prix');
  });
});
