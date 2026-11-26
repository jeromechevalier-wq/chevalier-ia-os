// Maison d'un client, côté SERVEUR MCP (26/11/2026, suite de la PR 700 côté écran) : quand reglages_maison/ecran porte configuration_crm: 'neutre',
// le serveur prend la configuration neutre (étapes, phases, réglages de départ) et les membres de la maison, jamais ceux de Jérôme.
// Champ absent, autre valeur, fiche absente ou illisible : configuration de Jérôme, comme avant. Tout en mémoire : aucun service Google, adresses inventées.
import './_fiche-essai.js'; // fiche reglages_maison/maison des essais, branchée en mémoire (propriétaire par défaut des jetons « cia_… »)
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerLimiteur } from '../functions/src/securite/limites.js';
import { creerAccesMemoire, avecBase } from '../functions/src/coeur/donnees.js';
import { lireConfig, lireConfigurationMaison, choixConfiguration, configurationEcran, DUREE_CACHE_ECRAN_MS } from '../functions/src/coeur/config.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-maison-essai';

const JETON = `cia_${'C'.repeat(43)}`;
const ECRAN_NEUTRE = Object.freeze({
  configuration_crm: 'neutre',
  personnes: [{ email: 'Admin@Exemple.test', nom: 'Admin', portrait: '' }, { email: 'equipe@exemple.test', nom: '' }, { nom: 'sans adresse' }],
  comptes_jerome_seul: ['admin@exemple.test'],
});
const ECRAN_SANS_CHAMP = Object.freeze({ personnes: [{ email: 'admin@exemple.test', nom: 'Admin' }], comptes_jerome_seul: ['admin@exemple.test'] });

const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });

/** Serveur MCP complet sur des données fraîches. `ecran` : le document reglages_maison/ecran (absent si non donné). `envelopper(donnees)` : pannes injectées. */
async function demarrer({ ecran, envelopper = (d) => d } = {}) {
  const collections = structuredClone(base);
  if (ecran) collections.reglages_maison = [{ id: 'ecran', ...structuredClone(ecran) }];
  const donnees = envelopper(creerAccesMemoire(collections));
  const magasin = creerMagasin({ lire: async () => JSON.stringify([{ jeton: 'claude-code-essai', acteur: 'claude-code-essai', profil: 'claude-code', empreinte: empreinte(JETON), actif: true }]), dureeCacheMs: 0 });
  const gestionnaire = creerGestionnaire({ magasin, donnees, limiteur: creerLimiteur({ donnees, maintenant: () => MAINTENANT.getTime() }), maintenant: () => MAINTENANT.getTime(), journal: () => {} });
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
  const appeler = async (nom, args = {}) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${JETON}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: nom, arguments: args } }),
    });
    const corps = await r.json();
    if (corps.error) return { isError: true, texte: corps.error.message };
    const texte = corps.result.content?.[0]?.text ?? '';
    let data;
    try { data = JSON.parse(texte); } catch { data = undefined; }
    return { isError: !!corps.result.isError, texte, data };
  };
  return { collections, appeler, doc: (nom, id) => collections[nom]?.find((d) => d.id === id) };
}
const ok = (r) => { assert.equal(r.isError, false, r.texte); return r.data; };
const refuse = (r, motif) => { assert.equal(r.isError, true, `devait être refusé : ${r.texte}`); if (motif) assert.match(r.texte, motif); };
const nouveaux = (s, nom, avant) => s.collections[nom].filter((d) => !avant.includes(d.id));

const ETAPES_JEROME = ['premier_contact', 'rdv_fixe', 'proposition_envoyee', 'gagne', 'etape_5', 'etape_6'];
const ETAPES_NEUTRES = ['etape_1', 'etape_2', 'etape_3', 'etape_4', 'etape_5', 'etape_6'];
const PHASES_JEROME = ['lancement', 'decouverte', 'livraison', 'cloture', 'phase_5', 'phase_6'];
const PHASES_NEUTRES = ['phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5', 'phase_6'];

/** Vérifie que lire_reglages rend la configuration de Jérôme (comportement d'avant). */
function attendreJerome(r) {
  assert.deepEqual(r.configuration.etapes.map((e) => e.id), ETAPES_JEROME);
  assert.deepEqual(r.configuration.phases.map((p) => p.id), PHASES_JEROME);
  assert.equal(r.configuration.etapes.find((e) => e.roleGagnee).id, 'gagne');
  assert.equal(r.configuration.options.suiviPaiements, true);
  assert.deepEqual(r.referentiels.projets.assignes.map((m) => m.id), ['jerome', 'charles']);
  assert.equal(r.reglages.prenomCelebration, 'Jérôme');
  assert.equal(r.reglages.debutActivite, '2026-10');
  assert.equal(r.reglages.delaiPaiementJours, 45, 'le document enregistré passe toujours par-dessus');
}

describe('lire_reglages : configuration de Jérôme ou neutre selon reglages_maison/ecran', () => {
  test('1. fiche ecran absente : configuration de Jérôme, inchangée', async () => {
    attendreJerome(ok(await (await demarrer()).appeler('lire_reglages')));
  });
  test('2. fiche ecran SANS configuration_crm (la maison de Jérôme) : configuration de Jérôme, inchangée', async () => {
    attendreJerome(ok(await (await demarrer({ ecran: ECRAN_SANS_CHAMP })).appeler('lire_reglages')));
  });
  test('3. configuration_crm d’une autre valeur (« Neutre », « jerome ») : configuration de Jérôme', async () => {
    for (const v of ['Neutre', 'jerome', '']) attendreJerome(ok(await (await demarrer({ ecran: { ...ECRAN_SANS_CHAMP, configuration_crm: v } })).appeler('lire_reglages')));
  });
  test('4. configuration_crm = « neutre » : étapes, phases, options, réglages et membres neutres ; rien de Jérôme ni de Charles', async () => {
    const s = await demarrer({ ecran: ECRAN_NEUTRE });
    const r = ok(await s.appeler('lire_reglages'));
    assert.deepEqual(r.configuration.etapes.map((e) => e.id), ETAPES_NEUTRES);
    assert.deepEqual(r.configuration.phases.map((p) => p.id), PHASES_NEUTRES);
    assert.equal(r.configuration.etapes.find((e) => e.roleGagnee).id, 'etape_5');
    assert.equal(r.configuration.phases.find((p) => p.roleCloture).id, 'phase_4');
    assert.equal(r.configuration.options.suiviPaiements, false);
    assert.deepEqual(r.referentiels.projets.assignes, [{ id: 'admin@exemple.test', libelle: 'Admin' }, { id: 'equipe@exemple.test', libelle: 'equipe@exemple.test' }]);
    assert.equal(r.reglages.prenomCelebration, '');
    assert.equal(r.reglages.imageCelebration, '');
    assert.equal(r.reglages.proprietaireGithub, '');
    assert.equal(r.reglages.cheminProjets, '');
    assert.equal(r.reglages.delaiPaiementJours, 45, 'le document enregistré passe toujours par-dessus');
    const texte = JSON.stringify(r);
    for (const mot of ['Jérôme', 'Charles', 'jerome', 'charles', 'premier_contact', 'lancement']) assert.ok(!texte.includes(mot), `« ${mot} » ne doit pas apparaître`);
  });
  test('5. fiche ecran illisible (panne de lecture) : configuration de Jérôme, comme avant, sans erreur', async () => {
    const envelopper = (d) => ({ ...d, async document(nom, id) { if (nom === 'reglages_maison') throw new Error('panne simulée'); return d.document(nom, id); } });
    attendreJerome(ok(await (await demarrer({ ecran: ECRAN_NEUTRE, envelopper })).appeler('lire_reglages')));
  });
});

describe('Outils d’écriture et de lecture : étapes et phases de la bonne configuration', () => {
  test('6. creer_affaire : première étape neutre (etape_1) en maison neutre, premier_contact chez Jérôme', async () => {
    for (const [ecran, attendue] of [[ECRAN_NEUTRE, 'etape_1'], [undefined, 'premier_contact']]) {
      const s = await demarrer({ ecran });
      const avant = s.collections.crm_affaires.map((a) => a.id);
      ok(await s.appeler('creer_affaire', { titre: 'Essai étape' }));
      assert.equal(nouveaux(s, 'crm_affaires', avant)[0].etape, attendue);
    }
  });
  test('7. changer_etape : en maison neutre, etape_5 gagne et « gagne » est inconnue ; chez Jérôme, « gagne » gagne', async () => {
    const n = await demarrer({ ecran: ECRAN_NEUTRE });
    refuse(await n.appeler('changer_etape', { id: 'a3', etape: 'gagne' }), /Étape inconnue/);
    ok(await n.appeler('changer_etape', { id: 'a1', etape: 'etape_5' }));
    assert.equal(n.doc('crm_affaires', 'a1').statut, 'gagnee');
    const j = await demarrer();
    refuse(await j.appeler('changer_etape', { id: 'a1', etape: 'etape_1' }), /Étape inconnue/);
    ok(await j.appeler('changer_etape', { id: 'a1', etape: 'gagne' }));
    assert.equal(j.doc('crm_affaires', 'a1').statut, 'gagnee');
  });
  test('8. creer_projet puis changer_phase_projet : phases neutres en maison neutre, phases de Jérôme sinon', async () => {
    for (const [ecran, depart, suivante, etrangere] of [[ECRAN_NEUTRE, 'phase_1', 'phase_2', 'decouverte'], [undefined, 'lancement', 'decouverte', 'phase_2']]) {
      const s = await demarrer({ ecran });
      const avant = (s.collections.projets_projets || []).map((p) => p.id);
      ok(await s.appeler('creer_projet', { titre: 'Projet essai' }));
      const p = nouveaux(s, 'projets_projets', avant)[0];
      assert.equal(p.phase, depart);
      refuse(await s.appeler('changer_phase_projet', { id: p.id, phase: etrangere }), /Phase inconnue/);
      ok(await s.appeler('changer_phase_projet', { id: p.id, phase: suivante }));
      assert.equal(s.doc('projets_projets', p.id).phase, suivante);
      const lu = ok(await s.appeler('lire_projet', { id: p.id }));
      assert.equal(lu.projet.phase, suivante);
      const liste = ok(await s.appeler('lister_projets', {}));
      assert.ok(liste.projets.some((x) => x.id === p.id));
    }
  });
  test('9. ajouter_livrable_projet : en maison neutre, « Confiée à » accepte un membre de la maison et refuse Charles ; chez Jérôme, l’inverse', async () => {
    for (const [ecran, accepte, refusee] of [[ECRAN_NEUTRE, 'admin@exemple.test', 'charles'], [undefined, 'charles', 'admin@exemple.test']]) {
      const s = await demarrer({ ecran });
      const avant = (s.collections.projets_projets || []).map((p) => p.id);
      ok(await s.appeler('creer_projet', { titre: 'Projet livrables' }));
      const p = nouveaux(s, 'projets_projets', avant)[0];
      refuse(await s.appeler('ajouter_livrable_projet', { projetId: p.id, titre: 'Livrable refusé', assigneA: refusee }), /pas membre de l’espace/);
      ok(await s.appeler('ajouter_livrable_projet', { projetId: p.id, titre: 'Livrable accepté', assigneA: accepte }));
    }
  });
  test('10. lister_affaires : même résultat dans les deux configurations (il ne lit pas la configuration)', async () => {
    const n = ok(await (await demarrer({ ecran: ECRAN_NEUTRE })).appeler('lister_affaires', {}));
    const j = ok(await (await demarrer()).appeler('lister_affaires', {}));
    assert.deepEqual(n, j);
  });
});

describe('Lecture de la fiche ecran par le serveur (config.js)', () => {
  test('11. configurationEcran : seule la valeur exacte « neutre » compte ; personnes mal formées ignorées, e-mails en minuscules', () => {
    assert.deepEqual(configurationEcran(null), { neutre: false, membres: [] });
    assert.deepEqual(configurationEcran({ configuration_crm: 'NEUTRE' }), { neutre: false, membres: [] });
    assert.deepEqual(configurationEcran({ configuration_crm: 'neutre' }), { neutre: true, membres: [] });
    assert.deepEqual(configurationEcran(ECRAN_NEUTRE).membres, [
      { id: 'admin@exemple.test', libelle: 'Admin', email: 'admin@exemple.test' },
      { id: 'equipe@exemple.test', libelle: 'equipe@exemple.test', email: 'equipe@exemple.test' },
    ]);
  });
  test('12. cache de 60 s : une seule lecture dans la minute, relue après ; une panne n’est jamais gardée', async () => {
    let lectures = 0;
    let panne = false;
    const donnees = { base: undefined, async document(nom) { if (nom !== 'reglages_maison') return null; lectures += 1; if (panne) throw new Error('panne'); return { configuration_crm: 'neutre' }; } };
    let t = 1_000;
    const maintenant = () => t;
    panne = true;
    assert.equal((await lireConfigurationMaison(donnees, { maintenant })).neutre, false, 'panne = comportement d’avant');
    panne = false;
    assert.equal((await lireConfigurationMaison(donnees, { maintenant })).neutre, true, 'la panne n’a pas été gardée');
    assert.equal(lectures, 2);
    t += DUREE_CACHE_ECRAN_MS - 1;
    await lireConfigurationMaison(donnees, { maintenant });
    assert.equal(lectures, 2, 'dans la minute : cache');
    t += 2;
    await lireConfigurationMaison(donnees, { maintenant });
    assert.equal(lectures, 3, 'après la minute : relue');
  });
  test('13. avec une base (plateforme des clients) : la fiche n’est JAMAIS lue, configuration neutre comme avant', async () => {
    const collections = { reglages_maison: [{ id: 'ecran', configuration_crm: 'autre' }] };
    const memoire = creerAccesMemoire(collections);
    const lus = [];
    const espion = { ...memoire, async document(nom, id) { lus.push(nom); return memoire.document(nom, id); } };
    const client = avecBase(espion, 'clients/essai');
    const config = await lireConfig(client);
    assert.equal(config.etapes[0].id, 'etape_1');
    assert.ok(!lus.some((n) => n.includes('reglages_maison')), lus.join(', '));
  });
  test('14. `racine` donné explicitement : gardé tel quel, la fiche n’est pas lue', async () => {
    let lue = false;
    const donnees = { async document(nom) { if (nom === 'reglages_maison') lue = true; return nom === 'reglages_maison' ? { configuration_crm: 'neutre' } : null; } };
    assert.deepEqual(await choixConfiguration(donnees, { racine: true }), { racine: true, membres: null });
    assert.deepEqual(await choixConfiguration(donnees, { racine: false }), { racine: false, membres: null });
    assert.equal(lue, false);
    assert.equal((await choixConfiguration(donnees, {})).racine, false, 'sans racine donnée : la maison neutre décide');
  });
});
