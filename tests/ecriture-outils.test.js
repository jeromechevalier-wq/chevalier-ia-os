// Tests des outils d'écriture, de suppression et de restauration, de bout en bout par le protocole MCP (étape 4, plan-mcp.md 5.9 : tests 3, 4, 5, 6, 9,
// 10, 11, 13, 14, 16). Chaque test démarre son propre serveur sur des données fictives fraîches (mémoire) : aucun service Google, aucune donnée réelle.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import * as L from '../functions/partage/logique.js';
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
  const vue = () => Object.fromEntries(Object.entries(collections).filter(([k]) => !['crm_audit', 'crm_audit_avant', 'mcp_limites'].includes(k)).map(([k, v]) => [k, structuredClone(v).sort((a, b) => a.id.localeCompare(b.id))]));
  return { collections, donnees, appeler, brut, horloge, lignesJournal, vue, doc: (nom, id) => collections[nom]?.find((d) => d.id === id) };
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
    refuse(await s.appeler('biblio', 'creer_personne', { nom: 'Jean Dupont', roles: ['roi'] }));
    refuse(await s.appeler('biblio', 'creer_personne', { nom: 'Jean Dupont', emails: [{ valeur: 'pas-un-mail' }] }), /email n'est pas valide/);
    const bon = ok(await s.appeler('biblio', 'creer_personne', { nom: 'Jean Dupont', organisationId: 'org2', etiquettes: ['chaud'], roles: ['partenaire'], ville: ' Nantes ' }));
    assert.deepEqual([s.doc('crm_personnes', bon.id).organisationId, s.doc('crm_personnes', bon.id).ville, s.doc('crm_personnes', bon.id).roles], ['org2', 'Nantes', ['partenaire']]);
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
    assert.equal(gagne.suggestion.titre, 'Envoyer la facture');
    assert.equal(gagne.suggestion.date, '2026-10-05', 'jour de Paris');
    assert.deepEqual(s.collections.crm_evenements.filter((e) => e.affaireId === 'a1' && e.date.getTime() === MAINTENANT.getTime()).map((e) => e.type).sort(), ['affaire_gagnee', 'etape_changee']);
    assert.equal(s.collections.crm_activites.length, 4, 'la suggestion n’est pas créée toute seule');
    assert.equal(ok(await s.appeler('biblio', 'changer_etape', { id: 'a1', etape: 'gagne' })).rien, true);
    refuse(await s.appeler('biblio', 'changer_etape', { id: 'a1', etape: 'bidon' }), /Étape inconnue/);
    ok(await s.appeler('biblio', 'modifier_affaire', { id: 'a1', montant: 1000 }));
    ok(await s.appeler('biblio', 'changer_etape', { id: 'a1', etape: 'facture_payee', montantEncaisse: 900 }));
    const a1 = s.doc('crm_affaires', 'a1');
    assert.equal(a1.archive, true);
    assert.equal(a1.encaissements.at(-1).montant, 900);
    assert.equal(a1.modifiePar, 'hermes-bibliothecaire');
    assert.ok(s.collections.crm_evenements.some((e) => e.affaireId === 'a1' && e.type === 'encaissement'));
  });

  test('test 11 : parité avec l’écran — le patch écrit par l’outil est exactement celui de la règle pure sur les mêmes données', async () => {
    const s = await demarrer();
    const avant = structuredClone(s.doc('crm_affaires', 'a2'));
    const regle = L.changementEtape(avant, 'facture_envoyee', { maintenant: MAINTENANT, auteur: 'x' });
    ok(await s.appeler('code', 'changer_etape', { id: 'a2', etape: 'facture_envoyee' }));
    const apres = s.doc('crm_affaires', 'a2');
    for (const [k, v] of Object.entries(regle.patch)) assert.deepEqual(apres[k], v, k);
    assert.equal(apres.titre, avant.titre);
  });

  test('test 11 : perdue, pause, rouvrir, encaissement, avec les mêmes contrôles de saisie que l’écran', async () => {
    const s = await demarrer();
    refuse(await s.appeler('biblio', 'marquer_perdue', { id: 'a1', raison: 'Parce que' }), /raison est obligatoire/);
    ok(await s.appeler('biblio', 'marquer_perdue', { id: 'a1', raison: 'Prix', detail: ' trop cher ' }));
    assert.equal(s.doc('crm_affaires', 'a1').statut, 'perdue');
    assert.equal(s.doc('crm_affaires', 'a1').raisonPerdueDetail, 'trop cher');
    ok(await s.appeler('biblio', 'rouvrir_affaire', { id: 'a1' }));
    assert.equal(s.doc('crm_affaires', 'a1').statut, 'ouverte');
    assert.equal(ok(await s.appeler('biblio', 'rouvrir_affaire', { id: 'a1' })).rien, true, 'une affaire ouverte ne se rouvre pas');
    refuse(await s.appeler('biblio', 'mettre_en_pause', { id: 'a1', dateReveil: '2027-13-45' }));
    ok(await s.appeler('biblio', 'mettre_en_pause', { id: 'a1', dateReveil: '2027-01-15' }));
    assert.deepEqual([s.doc('crm_affaires', 'a1').statut, s.doc('crm_affaires', 'a1').dateReveil], ['en_pause', '2027-01-15']);
    refuse(await s.appeler('biblio', 'ajouter_encaissement', { id: 'a2', montant: -5 }));
    ok(await s.appeler('biblio', 'ajouter_encaissement', { id: 'a2', montant: 250, date: '2026-10-03' }));
    assert.equal(s.doc('crm_affaires', 'a2').encaissements.at(-1).montant, 250);
    assert.ok(s.collections.crm_evenements.some((e) => e.affaireId === 'a2' && e.type === 'encaissement' && /250/.test(e.texte)));
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
    refuse(await s.appeler('biblio', 'retirer_document', { affaireId: 'a1', index: 0, url: 'https://exemple.test/contrat' }), /ne correspond pas/);
    refuse(await s.appeler('biblio', 'retirer_document', { affaireId: 'a1', index: 7 }), /introuvable/);
    refuse(await s.appeler('biblio', 'retirer_document', { affaireId: 'a1' }), /index ou url/);
    ok(await s.appeler('biblio', 'retirer_document', { affaireId: 'a1', url: 'https://exemple.test/devis' }));
    assert.deepEqual(s.doc('crm_affaires', 'a1').documents.map((d) => d.libelle), ['Contrat']);
  });

  test('adresse GitHub et dossier Drive d’une affaire : créés et modifiés par les outils, adresses invalides refusées, chaîne vide = effacer', async () => {
    const s = await demarrer();
    const avant = s.vue();
    refuse(await s.appeler('biblio', 'creer_affaire', { titre: 'X', urlGithub: 'http://exemple.test/depot' }), /https:\/\/github\.com\//);
    refuse(await s.appeler('biblio', 'creer_affaire', { titre: 'X', urlDossier: 'https://exemple.test/dossier' }), /dossier Google Drive/);
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
    const r = ok(await s.appeler('code', 'supprimer_personne', { id: 'p1', choix: 'affaires', confirmationNom: 'camille durand' }));
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
    const r = ok(await s.appeler('code', 'supprimer_personne', { id: 'p1', choix: 'conserver', confirmationNom: 'Camille Durand' }));
    assert.equal(s.doc('crm_affaires', 'a1').personneId, null);
    assert.ok(s.doc('crm_affaires', 'a1'), 'l’affaire est conservée');
    assert.equal(s.doc('crm_activites', 'ac1').personneId, null);
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }));
    assert.deepEqual(s.vue(), avant);
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
    const r = ok(await s.appeler('code', 'supprimer_organisation', { id: o.id, confirmationNom: 'vide totale' }));
    assert.equal(s.doc('crm_organisations', o.id), undefined);
    assert.equal(r.supprimes.crm_evenements, 1, 'son événement de création part avec elle');
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }));
    assert.deepEqual(s.vue(), avant2);
  });

  test('supprimer une affaire, une note, une activité : récupérables ; la restauration est refusée si quelqu’un a modifié entre-temps, forcer l’écrase (test 7)', async () => {
    const s = await demarrer();
    const avant = s.vue();
    const a = ok(await s.appeler('code', 'supprimer_affaire', { id: 'a1', confirmationNom: 'site vitrine atelier des lilas' }));
    assert.equal(s.doc('crm_affaires', 'a1'), undefined);
    assert.equal(s.doc('crm_activites', 'ac1'), undefined, 'son fil part avec elle');
    const n = ok(await s.appeler('code', 'supprimer_note', { id: 'n2' }));
    const ac = ok(await s.appeler('code', 'supprimer_activite', { id: 'ac4' }));
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

  test('test 8 : copie « avant » expirée : message clair', async () => {
    const s = await demarrer();
    const r = ok(await s.appeler('code', 'supprimer_note', { id: 'n1' }));
    s.collections.crm_audit_avant = [];
    refuse(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }), /n’existent plus.*90 jours.*sauvegarde/);
  });

  test('une suppression du bibliothécaire créée par erreur par Claude Code se retrouve dans lire_audit (outil, acteur, action « supprimer »)', async () => {
    const s = await demarrer();
    const r = ok(await s.appeler('code', 'supprimer_activite', { id: 'ac2' }));
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

  test('suppressions par jour : la suivante est refusée et rien n’est supprimé ; le lendemain (jour de Paris) repart ; les restaurations ne comptent pas comme suppressions', async () => {
    const s = await demarrer({ jetonsExtra: { code: { limites: { suppressionsParJour: 2 } } } });
    const op1 = ok(await s.appeler('code', 'supprimer_note', { id: 'n1' }));
    ok(await s.appeler('code', 'supprimer_note', { id: 'n2' }));
    const avant = s.vue();
    refuse(await s.appeler('code', 'supprimer_activite', { id: 'ac4' }), /Plafond atteint.*2 suppressions par jour/);
    assert.deepEqual(s.vue(), avant);
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: op1.operationId, apercu: false }));
    ok(await s.appeler('code', 'modifier_affaire', { id: 'a1', montant: 5 })); // une écriture ordinaire ne compte pas comme suppression
    s.horloge.t += 24 * 3_600_000;
    ok(await s.appeler('code', 'supprimer_activite', { id: 'ac4' }));
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
