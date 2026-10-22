// La porte (scripts/porte/porte.js) : contrôles dans l'ordre, intégrité auprès de n8n, isolation entre propriétaires, actions de la veille,
// validation stricte, plafonds, journal sans donnée sensible, passerelle HTTP. Tout en mémoire : ni Firebase ni réseau.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { genererCle, enregistrementDe } from '../scripts/porte/cles.js';
import { creerPorte, creerGestionnaireHttp, creerLimiteurMemoire, raisonDeRefusIntegrite, DUREE_CACHE_INTEGRITE_MS } from '../scripts/porte/porte.js';
import { ErreurN8n } from '../scripts/porte/n8n.js';

const T0 = Date.parse('2026-10-14T10:00:00Z');

/** Base en mémoire : chemin -> données. */
function creerBase() {
  const docs = new Map();
  const cles = new Map();
  return {
    docs, cles,
    lireCle: async (e) => cles.get(e) ?? null,
    majCle: async (e, p) => { cles.set(e, { ...cles.get(e), ...p }); },
    lireDoc: async (c) => (docs.has(c) ? { ...docs.get(c), id: c.split('/').pop() } : null),
    creerSiAbsent: async (c, d) => { if (docs.has(c)) return false; docs.set(c, d); return true; },
    majDoc: async (c, p) => { if (!docs.has(c)) return false; docs.set(c, { ...docs.get(c), ...p }); return true; },
    lister: async (chemin, { etat, limite = 100 } = {}) => [...docs].filter(([c, d]) => c.startsWith(`${chemin}/`) && !c.slice(chemin.length + 1).includes('/') && (!etat || d.etat === etat))
      .slice(0, limite).map(([c, d]) => ({ ...d, id: c.split('/').pop() })),
  };
}

const wf = (id, nom, ...etiquettes) => ({ id, nom, etiquettes });
const WORKFLOWS = {
  wA1: wf('wA1', 'client-audrey-veille-collecte', 'client-audrey'),
  wA2: wf('wA2', 'client-audrey-veille-resume', 'client-audrey', 'domaine-marketing'),
  wM1: wf('wM1', 'client-martin-veille-collecte', 'client-martin'),
  wDouble: wf('wDouble', 'client-audrey-x', 'client-audrey', 'client-martin'),
  wMauvaisNom: wf('wMauvaisNom', 'veille-sans-prefixe', 'client-audrey'),
  wSansTag: wf('wSansTag', 'client-audrey-sans-tag'),
  wI1: wf('wI1', 'interne-veille-collecte', 'interne', 'domaine-marketing'),
  wI2: wf('wI2', 'produit-veille-demo', 'produit'),
  wI3: wf('wI3', 'interne-mauvais', 'interne', 'produit'),
  wI4: wf('wI4', 'produit-mauvais-tag', 'interne'),
  wI5: wf('wI5', 'interne-avec-client', 'interne', 'client-audrey'),
  wI6: wf('wI6', 'sans-pour-qui', 'domaine-marketing'),
};

function monde({ parMinute = 1000, contexte = 'plateforme', modules = { audrey: ['veille'], martin: ['veille'], interne: ['veille'], sansveille: [] }, n8nPanne = null, sansN8n = false } = {}) {
  const base = creerBase();
  const lectures = [];
  const temps = { t: T0 };
  const journaux = [];
  const n8n = sansN8n ? null : {
    async lireWorkflow(id) {
      lectures.push(id);
      if (n8nPanne) throw new ErreurN8n(n8nPanne, 'panne');
      if (!WORKFLOWS[id]) throw new ErreurN8n('introuvable', 'non');
      return WORKFLOWS[id];
    },
  };
  const porte = creerPorte({
    contexte, donnees: base, n8n, modulesActifs: async (p) => modules[p] ?? [], maintenant: () => temps.t, journal: (e) => journaux.push(e),
    limiteur: creerLimiteurMemoire({ parMinute, maintenant: () => temps.t }),
  });
  const cles = {};
  for (const p of ['audrey', 'martin', 'interne', 'sansveille']) {
    const cle = genererCle(p);
    const e = enregistrementDe(cle, p, new Date(T0 - 86_400_000));
    base.cles.set(e.id, e.donnees);
    cles[p] = { cle, empreinte: e.id };
  }
  const appeler = (cle, corps, extra = {}) => porte({ methode: 'POST', authorization: cle ? `Bearer ${cle}` : undefined, corps, ...extra });
  const veille = (cle, action, donnees, workflowId = 'wA1') => appeler(cle, { module: 'veille', action, workflowId, donnees });
  return { base, porte, cles, lectures, temps, journaux, appeler, veille };
}

const SOURCE = { nom: 'Chaîne Alpha', type: 'YouTube', actif: true };
const CONTENU = { id: 'c1', sourceId: 's1', titre: 'Une vidéo', url: 'https://exemple.test/v1', datePublication: '2026-10-10T08:00:00Z' };

describe('porte : clé', () => {
  test('sans clé, clé inconnue, mal formée, révoquée ou d\'un autre format : toujours la MÊME réponse 401', async () => {
    const m = monde();
    const e = m.cles.audrey.empreinte;
    m.base.cles.set(m.cles.martin.empreinte, { ...m.base.cles.get(m.cles.martin.empreinte), actif: false });
    const reponses = [
      await m.veille(null, 'sources.lire', {}),
      await m.veille('cle-n8n.audrey.' + 'A'.repeat(43), 'sources.lire', {}),
      await m.veille('n_importe_quoi', 'sources.lire', {}),
      await m.veille('cia_' + 'a'.repeat(43), 'sources.lire', {}),
      await m.veille(m.cles.martin.cle, 'sources.lire', {}),
      await m.veille(m.cles.audrey.cle.replace('audrey', 'martin'), 'sources.lire', {}),
    ];
    for (const r of reponses) assert.deepEqual(r, { statut: 401, corps: { ok: false, erreur: 'cle_refusee', message: 'Clé refusée.' } });
    assert.ok(e);
    assert.equal(m.lectures.length, 0, 'aucun appel à n8n avant d\'avoir une clé valide');
  });
  test('seule la méthode POST est acceptée', async () => {
    const m = monde();
    for (const methode of ['GET', 'PUT', 'DELETE', 'PATCH']) assert.equal((await m.porte({ methode, authorization: `Bearer ${m.cles.audrey.cle}`, corps: {} })).statut, 405);
  });
  test('une clé valide note son dernier usage une seule fois par tranche de 5 minutes', async () => {
    const m = monde();
    await m.veille(m.cles.audrey.cle, 'sources.lire', {});
    const premier = m.base.cles.get(m.cles.audrey.empreinte).dernierUsage;
    assert.equal(premier.getTime(), T0);
    m.temps.t = T0 + 4 * 60_000;
    await m.veille(m.cles.audrey.cle, 'sources.lire', {});
    assert.equal(m.base.cles.get(m.cles.audrey.empreinte).dernierUsage.getTime(), T0, 'pas de réécriture avant 5 minutes');
    m.temps.t = T0 + 6 * 60_000;
    await m.veille(m.cles.audrey.cle, 'sources.lire', {});
    assert.equal(m.base.cles.get(m.cles.audrey.empreinte).dernierUsage.getTime(), T0 + 6 * 60_000);
  });
  test('une clé révoquée est refusée aussitôt, l\'autre clé du même client continue', async () => {
    const m = monde();
    const cle2 = genererCle('audrey');
    const e2 = enregistrementDe(cle2, 'audrey');
    m.base.cles.set(e2.id, e2.donnees);
    m.base.docs.set('clients/audrey/veille_sources/s1', SOURCE);
    assert.equal((await m.veille(m.cles.audrey.cle, 'sources.lire', {})).statut, 200);
    m.base.cles.set(m.cles.audrey.empreinte, { ...m.base.cles.get(m.cles.audrey.empreinte), actif: false });
    assert.equal((await m.veille(m.cles.audrey.cle, 'sources.lire', {})).statut, 401);
    assert.equal((await m.veille(cle2, 'sources.lire', {})).statut, 200);
  });
  test('plafond de requêtes par clé et par minute (429), la minute suivante repart', async () => {
    const m = monde({ parMinute: 5 });
    for (let i = 0; i < 5; i++) assert.equal((await m.veille(m.cles.audrey.cle, 'sources.lire', {})).statut, 200);
    assert.equal((await m.veille(m.cles.audrey.cle, 'sources.lire', {})).statut, 429);
    assert.equal((await m.veille(m.cles.martin.cle, 'sources.lire', {}, 'wM1')).statut, 200, 'le plafond est par clé');
    m.temps.t += 61_000;
    assert.equal((await m.veille(m.cles.audrey.cle, 'sources.lire', {})).statut, 200);
  });
});

describe('porte : forme de la requête, module', () => {
  test('corps absent, tableau, champ inconnu, module ou action invalides, workflowId absent : 400', async () => {
    const m = monde();
    const c = m.cles.audrey.cle;
    for (const corps of [null, [], 'texte', 42, { module: 'veille' }, { module: 'veille', action: 'sources.lire' }, { module: 'veille', action: 'sources.lire', workflowId: 'wA1', extra: 1 },
      { module: 'veille', action: 'sources.lire', workflowId: 'a/b' }, { module: 'veille', action: 'sources.lire', workflowId: 'x'.repeat(65) }, { module: 'VEILLE', action: 'sources.lire', workflowId: 'wA1' },
      { module: 'veille', action: '../x', workflowId: 'wA1' }, { module: 'veille', action: 5, workflowId: 'wA1' }]) {
      assert.equal((await m.appeler(c, corps)).statut, 400, JSON.stringify(corps));
    }
  });
  test('module ou action inconnus, y compris les noms piégés (__proto__, constructor)', async () => {
    const m = monde();
    for (const [module, action] of [['crm', 'sources.lire'], ['veille', 'tout.supprimer'], ['__proto__', 'x'], ['veille', 'constructor'], ['veille', '__proto__'], ['constructor', 'sources.lire']]) {
      const r = await m.appeler(m.cles.audrey.cle, { module, action, workflowId: 'wA1' });
      assert.equal(r.statut, 400, `${module}/${action}`);
      assert.equal(r.corps.erreur === 'action_inconnue' || r.corps.erreur === 'requete_invalide', true);
    }
  });
  test('module non actif pour ce propriétaire : 403, et n8n n\'est pas interrogé', async () => {
    const m = monde();
    const r = await m.veille(m.cles.sansveille.cle, 'sources.lire', {}, 'wA1');
    assert.equal(r.statut, 403);
    assert.equal(r.corps.erreur, 'module_non_actif');
    assert.equal(m.lectures.length, 0);
  });
});

describe('porte : intégrité du workflow (plateforme)', () => {
  test('un workflow du client (étiquette client-<id> et nom client-<id>-…) passe', async () => {
    const m = monde();
    assert.equal((await m.veille(m.cles.audrey.cle, 'sources.lire', {}, 'wA2')).statut, 200);
  });
  test('refusés : workflow d\'un autre client, deux étiquettes de client, mauvais nom, sans étiquette, inexistant', async () => {
    const m = monde();
    for (const id of ['wM1', 'wDouble', 'wMauvaisNom', 'wSansTag', 'wInexistant', 'wI1']) {
      const r = await m.veille(m.cles.audrey.cle, 'sources.lire', {}, id);
      assert.equal(r.statut, 403, id);
      assert.equal(r.corps.erreur, 'workflow_refuse', id);
      assert.ok(!JSON.stringify(r).includes('martin'), 'la réponse ne dit pas à qui appartient le workflow');
    }
  });
  test('n8n en panne, clé d\'API refusée ou contrôle absent : la porte se ferme (503), elle ne laisse jamais passer faute de contrôle', async () => {
    for (const panne of ['injoignable', 'refuse', 'reponse']) {
      const m = monde({ n8nPanne: panne });
      const r = await m.veille(m.cles.audrey.cle, 'sources.lire', {}, 'wA1');
      assert.equal(r.statut, 503, panne);
      assert.equal(r.corps.erreur, 'verification_indisponible');
    }
    assert.equal((await monde({ sansN8n: true }).veille(monde({ sansN8n: true }).cles.audrey.cle, 'sources.lire', {})).statut, 401); // clé d'un autre monde : refusée avant tout
    const m = monde({ sansN8n: true });
    assert.equal((await m.veille(m.cles.audrey.cle, 'sources.lire', {}, 'wA1')).statut, 503);
  });
  test('un contrôle réussi est gardé 60 s ; un refus n\'est jamais gardé', async () => {
    const m = monde();
    await m.veille(m.cles.audrey.cle, 'sources.lire', {}, 'wA1');
    await m.veille(m.cles.audrey.cle, 'sources.lire', {}, 'wA1');
    assert.equal(m.lectures.length, 1);
    m.temps.t += DUREE_CACHE_INTEGRITE_MS + 1;
    await m.veille(m.cles.audrey.cle, 'sources.lire', {}, 'wA1');
    assert.equal(m.lectures.length, 2);
    await m.veille(m.cles.audrey.cle, 'sources.lire', {}, 'wM1');
    await m.veille(m.cles.audrey.cle, 'sources.lire', {}, 'wM1');
    assert.equal(m.lectures.length, 4, 'le refus est revérifié à chaque appel');
  });
  test('le cache est propre à chaque propriétaire : le même workflow ne passe pas pour une autre clé', async () => {
    const m = monde();
    assert.equal((await m.veille(m.cles.audrey.cle, 'sources.lire', {}, 'wA1')).statut, 200);
    assert.equal((await m.veille(m.cles.martin.cle, 'sources.lire', {}, 'wA1')).statut, 403);
  });
});

describe('porte : intégrité du workflow (CRM de Jérôme, propriétaire « interne »)', () => {
  test('interne-… ou produit-… avec le bon tag : accepté ; tout le reste refusé', () => {
    assert.equal(raisonDeRefusIntegrite('crm', 'interne', WORKFLOWS.wI1), null);
    assert.equal(raisonDeRefusIntegrite('crm', 'interne', WORKFLOWS.wI2), null);
    assert.equal(raisonDeRefusIntegrite('crm', 'interne', WORKFLOWS.wI3), 'pour_qui_absent_ou_multiple');
    assert.equal(raisonDeRefusIntegrite('crm', 'interne', WORKFLOWS.wI4), 'nom_different');
    assert.equal(raisonDeRefusIntegrite('crm', 'interne', WORKFLOWS.wI5), 'etiquette_client_presente');
    assert.equal(raisonDeRefusIntegrite('crm', 'interne', WORKFLOWS.wI6), 'pour_qui_absent_ou_multiple');
    assert.equal(raisonDeRefusIntegrite('crm', 'audrey', WORKFLOWS.wI1), 'proprietaire_inconnu');
    assert.equal(raisonDeRefusIntegrite('autre', 'interne', WORKFLOWS.wI1), 'contexte_inconnu');
  });
  test('dans la base 1, un workflow de client est refusé même avec une clé « interne »', async () => {
    const m = monde({ contexte: 'crm' });
    assert.equal((await m.veille(m.cles.interne.cle, 'sources.lire', {}, 'wI1')).statut, 200);
    assert.equal((await m.veille(m.cles.interne.cle, 'sources.lire', {}, 'wA1')).statut, 403);
    assert.equal((await m.veille(m.cles.interne.cle, 'sources.lire', {}, 'wI5')).statut, 403);
  });
  test('une clé de client n\'a aucun droit dans la base 1', async () => {
    const m = monde({ contexte: 'crm' });
    assert.equal((await m.veille(m.cles.audrey.cle, 'sources.lire', {}, 'wA1')).statut, 403);
  });
});

describe('porte : actions de la veille et isolation', () => {
  const pret = async (contexte = 'plateforme') => {
    const m = monde({ contexte });
    m.base.docs.set('clients/audrey/veille_sources/s1', SOURCE);
    m.base.docs.set('clients/audrey/veille_sources/s2', { nom: 'Pause', actif: false });
    m.base.docs.set('clients/martin/veille_sources/s1', { nom: 'Source de Martin', actif: true });
    m.base.docs.set('veille_sources/s1', { nom: 'Source de Jérôme', type: 'Podcast', actif: true });
    return m;
  };
  const audrey = (m, action, donnees, w = 'wA1') => m.veille(m.cles.audrey.cle, action, donnees, w);

  test('sources.lire : seulement les sources de CE client, actives par défaut', async () => {
    const m = await pret();
    const r = await audrey(m, 'sources.lire', {});
    assert.deepEqual(r.corps.resultat.sources.map((s) => s.nom), ['Chaîne Alpha']);
    assert.deepEqual((await audrey(m, 'sources.lire', { actifSeulement: false })).corps.resultat.sources.length, 2);
  });
  test('contenus.ajouter : crée à l\'état « nouveau » sous le client, sans doublon, et note qui a écrit', async () => {
    const m = await pret();
    const r = await audrey(m, 'contenus.ajouter', { contenus: [CONTENU, { ...CONTENU, id: 'c2', titre: 'Deux' }] });
    assert.deepEqual(r.corps.resultat, { crees: 2, existants: 0 });
    const d = m.base.docs.get('clients/audrey/veille_contenus/c1');
    assert.equal(d.etat, 'nouveau');
    assert.equal(d.sourceNom, 'Chaîne Alpha');
    assert.equal(d.type, 'YouTube');
    assert.equal(d.ecritPar, `porte:${m.base.cles.get(m.cles.audrey.empreinte).idCourt}`);
    assert.ok(d.datePublication instanceof Date);
    assert.ok(!('id' in d), 'l\'identifiant est le nom du document, pas un champ');
    assert.deepEqual((await audrey(m, 'contenus.ajouter', { contenus: [CONTENU] })).corps.resultat, { crees: 0, existants: 1 });
    assert.equal(m.base.docs.get('clients/audrey/veille_contenus/c1').etat, 'nouveau');
    assert.ok(![...m.base.docs.keys()].some((c) => c.startsWith('clients/martin/veille_contenus') || c.startsWith('veille_contenus')), 'rien chez les autres');
  });
  test('un appel répété ne réécrit pas un contenu déjà traité (il reste « résumé »)', async () => {
    const m = await pret();
    await audrey(m, 'contenus.ajouter', { contenus: [CONTENU] });
    await audrey(m, 'contenus.changerEtat', { id: 'c1', etat: 'resume' });
    await audrey(m, 'contenus.ajouter', { contenus: [CONTENU] });
    assert.equal(m.base.docs.get('clients/audrey/veille_contenus/c1').etat, 'resume');
  });
  test('contenus.ajouter : source inconnue = rien d\'écrit du tout ; source d\'un autre client = inconnue', async () => {
    const m = await pret();
    const r = await audrey(m, 'contenus.ajouter', { contenus: [CONTENU, { ...CONTENU, id: 'c2', sourceId: 'inconnue' }] });
    assert.equal(r.statut, 404);
    assert.equal(r.corps.erreur, 'source_inconnue');
    assert.equal([...m.base.docs.keys()].filter((c) => c.includes('veille_contenus')).length, 0);
    m.base.docs.set('clients/martin/veille_sources/seulement-martin', SOURCE);
    assert.equal((await audrey(m, 'contenus.ajouter', { contenus: [{ ...CONTENU, sourceId: 'seulement-martin' }] })).statut, 404);
  });
  test('validation stricte : champ inconnu, adresse javascript:, caractère de contrôle, trop long, doublon, liste vide ou trop grande, mauvais type', async () => {
    const m = await pret();
    const mauvais = [
      { contenus: [{ ...CONTENU, champInconnu: 1 }] }, { contenus: [{ ...CONTENU, url: 'javascript:alert(1)' }] }, { contenus: [{ ...CONTENU, url: 'data:text/html,x' }] },
      { contenus: [{ ...CONTENU, titre: 'a\u0000b' }] }, { contenus: [{ ...CONTENU, titre: 'a\nb' }] }, { contenus: [{ ...CONTENU, titre: 'x'.repeat(301) }] },
      { contenus: [CONTENU, CONTENU] }, { contenus: [] }, { contenus: Array.from({ length: 101 }, (_, i) => ({ ...CONTENU, id: `c${i}` })) },
      { contenus: [{ ...CONTENU, id: 'a/b' }] }, { contenus: [{ ...CONTENU, id: '../x' }] }, { contenus: [{ ...CONTENU, titre: 42 }] }, { contenus: [{ ...CONTENU, type: 'Film' }] },
      { contenus: [{ ...CONTENU, datePublication: 'hier' }] }, { contenus: [{ ...CONTENU, datePublication: '1990-01-01' }] }, { contenus: [{ ...CONTENU, datePublication: '2099-01-01' }] },
      { contenus: 'x' }, {}, { contenus: [CONTENU], autre: 1 }, { contenus: [null] }, { contenus: [{ titre: 'sans id' }] },
    ];
    for (const d of mauvais) {
      const r = await audrey(m, 'contenus.ajouter', d);
      assert.equal(r.statut, 400, JSON.stringify(d).slice(0, 80));
      assert.equal(r.corps.erreur, 'requete_invalide');
    }
    assert.equal([...m.base.docs.keys()].filter((c) => c.includes('veille_contenus')).length, 0, 'aucune écriture partielle');
  });
  test('validation : un champ nommé comme une propriété d\'objet (__proto__, constructor) est refusé', async () => {
    const m = await pret();
    for (const nom of ['__proto__', 'constructor', 'toString']) {
      const donnees = JSON.parse(`{"contenus":[{"id":"c1","sourceId":"s1","titre":"x","${nom}":1}]}`);
      assert.equal((await audrey(m, 'contenus.ajouter', donnees)).statut, 400, nom);
    }
  });
  test('contenus.changerEtat : un contenu qui existe seulement ; l\'étape d\'échec seulement pour « echec » ; la date de traitement est posée', async () => {
    const m = await pret();
    await audrey(m, 'contenus.ajouter', { contenus: [CONTENU] });
    assert.equal((await audrey(m, 'contenus.changerEtat', { id: 'inconnu', etat: 'resume' })).statut, 404);
    assert.equal((await audrey(m, 'contenus.changerEtat', { id: 'c1', etat: 'resume', etapeEchec: 'x' })).statut, 400);
    assert.equal((await audrey(m, 'contenus.changerEtat', { id: 'c1', etat: 'inexistant' })).statut, 400);
    assert.equal((await audrey(m, 'contenus.changerEtat', { id: 'c1', etat: 'echec', etapeEchec: 'Transcription' })).statut, 200);
    const d = m.base.docs.get('clients/audrey/veille_contenus/c1');
    assert.deepEqual([d.etat, d.etapeEchec], ['echec', 'Transcription']);
    assert.ok(d.traiteLe instanceof Date);
    assert.equal(m.base.docs.has('clients/audrey/veille_contenus/inconnu'), false, 'jamais de création par une mise à jour');
    await audrey(m, 'contenus.changerEtat', { id: 'c1', etat: 'en_cours' });
    assert.deepEqual([m.base.docs.get('clients/audrey/veille_contenus/c1').etapeEchec, m.base.docs.get('clients/audrey/veille_contenus/c1').traiteLe], [null, null]);
  });
  test('contenus.lire : filtre par état, limité, seulement les contenus de ce client', async () => {
    const m = await pret();
    await audrey(m, 'contenus.ajouter', { contenus: [CONTENU, { ...CONTENU, id: 'c2' }] });
    await audrey(m, 'contenus.changerEtat', { id: 'c2', etat: 'resume' });
    m.base.docs.set('clients/martin/veille_contenus/m1', { titre: 'Martin', etat: 'nouveau' });
    const r = await audrey(m, 'contenus.lire', { etat: 'nouveau' });
    assert.deepEqual(r.corps.resultat.contenus.map((c) => c.id), ['c1']);
    assert.equal(typeof r.corps.resultat.contenus[0].detecteLe, 'string', 'dates en texte ISO');
    assert.equal((await audrey(m, 'contenus.lire', { limite: 201 })).statut, 400);
    assert.equal((await audrey(m, 'contenus.lire', { limite: 0 })).statut, 400);
    assert.equal((await audrey(m, 'contenus.lire', {})).corps.resultat.contenus.length, 2);
  });
  test('resumes.lire : renvoie les résumés de ce client seulement, limité, en lecture seule', async () => {
    const m = await pret();
    await audrey(m, 'contenus.ajouter', { contenus: [CONTENU] });
    await audrey(m, 'resumes.ajouter', { contenuId: 'c1', idExecution: '1', lienHtml: 'https://exemple.fr/r' });
    m.base.docs.set('clients/martin/veille_resumes/r-m1', { contenuId: 'm1', lienHtml: 'https://exemple.fr/martin' });
    const r = await audrey(m, 'resumes.lire', {});
    assert.equal(r.statut, 200);
    assert.deepEqual(r.corps.resultat.resumes.map((x) => [x.id, x.contenuId, x.lienHtml]), [['r-c1-1', 'c1', 'https://exemple.fr/r']]);
    assert.equal(typeof r.corps.resultat.resumes[0].creeLe, 'string', 'dates en texte ISO');
    assert.equal((await audrey(m, 'resumes.lire', { limite: 201 })).statut, 400);
    assert.equal((await audrey(m, 'resumes.lire', { autre: 1 })).statut, 400);
  });
  test('resumes.ajouter : le contenu doit exister, identifiant composé et stable, coût et modèle contrôlés, aucune clé secrète acceptée', async () => {
    const m = await pret();
    await audrey(m, 'contenus.ajouter', { contenus: [CONTENU] });
    const base = { contenuId: 'c1', idExecution: '4521', modele: 'deepseek/deepseek-v4-pro', coutReel: 0.002, devise: 'USD', payeur: 'jerome', cleIa: 'openrouter-jerome', lienHtml: 'https://exemple.test/h.html' };
    assert.equal((await audrey(m, 'resumes.ajouter', { ...base, contenuId: 'inconnu' })).statut, 404);
    const r = await audrey(m, 'resumes.ajouter', base);
    assert.deepEqual(r.corps.resultat, { id: 'r-c1-4521', cree: true });
    assert.deepEqual((await audrey(m, 'resumes.ajouter', { ...base, coutReel: 99 })).corps.resultat, { id: 'r-c1-4521', cree: false }, 'même exécution = même résumé, jamais réécrit');
    assert.equal(m.base.docs.get('clients/audrey/veille_resumes/r-c1-4521').coutReel, 0.002);
    for (const mauvais of [{ coutReel: -1 }, { coutReel: 1001 }, { coutReel: NaN }, { coutReel: '0.1' }, { payeur: 'moi' }, { devise: 'GBP' }, { cleIa: 'sk-or-v1-ABCDEF1234567890' }, { cleIa: 'cle-n8n.audrey.' + 'A'.repeat(43) },
      { lienHtml: 'javascript:1' }, { modele: 'a b' }, { idExecution: 'a/b' }]) {
      const x = await audrey(m, 'resumes.ajouter', { ...base, idExecution: '9', ...mauvais });
      assert.equal(x.statut, 400, JSON.stringify(mauvais));
    }
  });
  test('resumes.ajouter avec une page HTML : la page est gardée à part (veille_pages), jamais réécrite, retours à la ligne permis, autres caractères de contrôle refusés', async () => {
    const m = await pret();
    await audrey(m, 'contenus.ajouter', { contenus: [CONTENU] });
    const html = '<!DOCTYPE html>\n<html><body>\n\t<h1>Résumé « ÿ » 🙂</h1>\r\n</body></html>';
    const r = await audrey(m, 'resumes.ajouter', { contenuId: 'c1', idExecution: '7', html });
    assert.deepEqual(r.corps.resultat, { id: 'r-c1-7', cree: true });
    assert.equal(m.base.docs.get('clients/audrey/veille_pages/r-c1-7').html, html);
    assert.equal(m.base.docs.get('clients/audrey/veille_resumes/r-c1-7').pageDisponible, true);
    assert.equal('html' in m.base.docs.get('clients/audrey/veille_resumes/r-c1-7'), false, 'la page n\'alourdit pas la liste des résumés');
    const encore = await audrey(m, 'resumes.ajouter', { contenuId: 'c1', idExecution: '7', html: '<p>autre</p>' });
    assert.equal(encore.corps.resultat.cree, false);
    assert.equal(m.base.docs.get('clients/audrey/veille_pages/r-c1-7').html, html, 'une page existante n\'est jamais écrasée');
    for (const mauvais of ['a\u0000b', 'a\u001bb', '', '   ', 'x'.repeat(150001), 12]) {
      assert.equal((await audrey(m, 'resumes.ajouter', { contenuId: 'c1', idExecution: '8', html: mauvais })).statut, 400, JSON.stringify(mauvais).slice(0, 30));
    }
    assert.equal(m.base.docs.has('clients/audrey/veille_pages/r-c1-8'), false);
    const sans = await audrey(m, 'resumes.ajouter', { contenuId: 'c1', idExecution: '9' });
    assert.equal(m.base.docs.has('clients/audrey/veille_pages/r-c1-9'), false);
    assert.equal('pageDisponible' in m.base.docs.get('clients/audrey/veille_resumes/r-c1-9'), false);
    assert.equal(sans.statut, 200);
  });
  test('isolation : la clé d\'Audrey n\'écrit jamais chez Martin ni à la racine, et le chemin n\'est jamais fourni par le workflow', async () => {
    const m = await pret();
    await audrey(m, 'contenus.ajouter', { contenus: [CONTENU] });
    const chemins = [...m.base.docs.keys()];
    assert.ok(chemins.filter((c) => c.includes('veille_contenus')).every((c) => c.startsWith('clients/audrey/')));
    const r = await audrey(m, 'contenus.ajouter', { contenus: [{ ...CONTENU, id: 'x', sourceId: 's1', chemin: 'clients/martin/veille_contenus/x' }] });
    assert.equal(r.statut, 400);
    const r2 = await m.appeler(m.cles.audrey.cle, { module: 'veille', action: 'contenus.ajouter', workflowId: 'wA1', client: 'martin', donnees: { contenus: [CONTENU] } });
    assert.equal(r2.statut, 400, 'un champ « client » est refusé : le propriétaire vient de la clé');
  });
  test('base 1 : la clé « interne » écrit à la RACINE (veille_*), jamais sous clients/', async () => {
    const m = await pret('crm');
    const r = await m.veille(m.cles.interne.cle, 'contenus.ajouter', { contenus: [CONTENU] }, 'wI1');
    assert.equal(r.statut, 200);
    assert.equal(m.base.docs.get('veille_contenus/c1').sourceNom, 'Source de Jérôme');
    assert.equal(m.base.docs.get('veille_contenus/c1').type, 'Podcast', 'le type de la source est repris quand le workflow n\'en donne pas');
    assert.equal([...m.base.docs.keys()].filter((c) => c.startsWith('clients/') && c.includes('veille_contenus')).length, 0);
  });
});

describe('porte : journal, erreurs, plafonds de taille', () => {
  test('le journal ne contient ni la clé, ni les données, ni les titres', async () => {
    const m = monde();
    m.base.docs.set('clients/audrey/veille_sources/s1', SOURCE);
    await m.veille(m.cles.audrey.cle, 'contenus.ajouter', { contenus: [{ ...CONTENU, titre: 'TITRE-SECRET-123' }] });
    await m.veille('cle-n8n.audrey.' + 'Z'.repeat(43), 'sources.lire', {});
    const texte = JSON.stringify(m.journaux);
    assert.ok(m.journaux.length >= 2);
    for (const interdit of [m.cles.audrey.cle, m.cles.audrey.cle.split('.')[2], 'TITRE-SECRET-123', 'Z'.repeat(43), 'exemple.test']) assert.ok(!texte.includes(interdit), interdit.slice(0, 20));
    const ligne = m.journaux.find((j) => j.action === 'contenus.ajouter');
    assert.deepEqual(Object.keys(ligne).sort(), ['action', 'dureeMs', 'idCourt', 'module', 'proprietaire', 'statut', 'workflowId']);
  });
  test('une erreur inattendue donne 500 sans détail, et un journal qui plante ne casse pas l\'appel', async () => {
    const m = monde();
    m.base.lister = async () => { throw new Error('SECRET interne : mot de passe de la base'); };
    const r = await m.veille(m.cles.audrey.cle, 'sources.lire', {});
    assert.equal(r.statut, 500);
    assert.deepEqual(r.corps, { ok: false, erreur: 'erreur_interne', message: 'Une erreur est survenue.' });
    const n = creerPorte({ contexte: 'plateforme', donnees: m.base, n8n: { lireWorkflow: async () => WORKFLOWS.wA1 }, modulesActifs: async () => ['veille'], journal: () => { throw new Error('boum'); } });
    m.base.lister = async () => [];
    assert.equal((await n({ methode: 'POST', authorization: `Bearer ${m.cles.audrey.cle}`, corps: { module: 'veille', action: 'sources.lire', workflowId: 'wA1', donnees: {} } })).statut, 200);
  });
  test('le dernier usage n\'est jamais une raison de refuser : si son écriture échoue, l\'appel passe', async () => {
    const m = monde();
    m.base.majCle = async () => { throw new Error('indisponible'); };
    assert.equal((await m.veille(m.cles.audrey.cle, 'sources.lire', {})).statut, 200);
  });
});

describe('porte : passerelle HTTP', () => {
  async function serveur(m, options) {
    const s = createServer(creerGestionnaireHttp(m.porte, options));
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${s.address().port}`;
    return { url, fin: () => new Promise((r) => s.close(r)) };
  }
  const post = (url, cle, corps, entetes = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cle ? { Authorization: `Bearer ${cle}` } : {}), ...entetes }, body: typeof corps === 'string' ? corps : JSON.stringify(corps) });

  test('appel normal, mauvais chemin, mauvaise méthode, origine de navigateur, JSON cassé, corps trop gros', async () => {
    const m = monde();
    m.base.docs.set('clients/audrey/veille_sources/s1', SOURCE);
    const s = await serveur(m, { octetsMax: 2000 });
    try {
      const ok = await post(`${s.url}/porte`, m.cles.audrey.cle, { module: 'veille', action: 'sources.lire', workflowId: 'wA1', donnees: {} });
      assert.equal(ok.status, 200);
      assert.equal(ok.headers.get('cache-control'), 'no-store');
      assert.match(ok.headers.get('content-type'), /application\/json/);
      assert.equal((await ok.json()).resultat.sources.length, 1);
      assert.equal((await post(`${s.url}/autre`, m.cles.audrey.cle, {})).status, 404);
      assert.equal((await fetch(`${s.url}/porte`)).status, 405);
      assert.equal((await post(`${s.url}/porte`, m.cles.audrey.cle, {}, { Origin: 'https://site-malveillant.test' })).status, 403);
      const cassé = await post(`${s.url}/porte`, m.cles.audrey.cle, '{pas du json');
      assert.equal(cassé.status, 400);
      const sansCle = await post(`${s.url}/porte`, null, '{pas du json');
      assert.equal(sansCle.status, 401, 'un corps cassé sans clé donne 401 : la réponse ne permet pas de tester une clé');
      const gros = await post(`${s.url}/porte`, m.cles.audrey.cle, { module: 'veille', action: 'sources.lire', workflowId: 'wA1', donnees: { x: 'a'.repeat(5000) } });
      assert.equal(gros.status, 413);
    } finally { await s.fin(); }
  });

  test('corps déjà lu par les fonctions Firebase (flux vide, rawBody rempli) : la porte lit rawBody', async () => {
    const m = monde();
    m.base.docs.set('clients/audrey/veille_sources/s1', SOURCE);
    const gestionnaire = creerGestionnaireHttp(m.porte, { octetsMax: 2000 });
    const s = createServer(async (req, res) => {
      const morceaux = [];
      for await (const x of req) morceaux.push(x);
      req.rawBody = Buffer.concat(morceaux); // comme Firebase : le flux est consommé avant la porte
      await gestionnaire(req, res);
    });
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${s.address().port}/porte`;
    try {
      const ok = await post(url, m.cles.audrey.cle, { module: 'veille', action: 'sources.lire', workflowId: 'wA1', donnees: {} });
      assert.equal(ok.status, 200);
      assert.equal((await ok.json()).resultat.sources.length, 1);
      const gros = await post(url, m.cles.audrey.cle, { module: 'veille', action: 'sources.lire', workflowId: 'wA1', donnees: { x: 'a'.repeat(5000) } });
      assert.equal(gros.status, 413);
    } finally { await new Promise((r) => s.close(r)); }
  });
});

describe('porte : le code', () => {
  const lire = (f) => readFileSync(new URL(`../scripts/porte/${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  test('n8n.js : un seul appel réseau, en GET ; jamais de redirection ; la clé d\'API ne sort que dans un en-tête', () => {
    const c = lire('n8n.js');
    assert.deepEqual([...c.matchAll(/method\s*:\s*['"`]([A-Za-z]+)['"`]/g)].map((m) => m[1]), ['GET']);
    assert.equal((c.match(/\bfetchImpl\s*\(/g) || []).length, 1);
    assert.match(c, /redirect: 'error'/);
    assert.doesNotMatch(c, /POST|PUT|PATCH|DELETE|console\.|process\.env/);
    assert.deepEqual([...c.matchAll(/\/api\/v1\/([a-z]+)/g)].map((m) => m[1]), ['workflows']);
  });
  test('seul l\'adaptateur parle à la base, et il ne sait que créer, mettre à jour et lire : aucune suppression, aucun « set » qui écraserait', () => {
    const a = lire('adaptateur.js');
    assert.doesNotMatch(a, /\.delete\(|\.set\(|recursiveDelete|\.add\(|runTransaction/);
    // `ecrireLot` : un seul lot (db.batch()), avec création et mise à jour seulement (jamais .set, .delete).
    assert.equal((a.match(/\bbatch\(/g) || []).length, 1);
    assert.match(a, /db\.batch\(\)/);
    assert.match(a, /lot\.create\(ref, donnees\)/);
    assert.match(a, /lot\.update\(ref, donnees\)/);
    assert.doesNotMatch(a, /lot\.(set|delete)\(/);
    assert.match(a, /\.create\(donnees\)/);
    // Mise à jour simple, ou avec la seule précondition « document inchangé depuis la lecture » (lastUpdateTime) : aucune autre option (pas de merge, pas de remplacement) : majCle, majDoc simple, majDoc avec précondition.
    assert.match(a, /\.update\(partiel\)/);
    assert.match(a, /\.update\(partiel, \{ lastUpdateTime \}\)/);
    assert.equal((a.match(/\.update\(partiel/g) || []).length, 3);
    for (const f of ['porte.js', 'actions-veille.js', 'actions-automatisations.js', 'validation.js', 'cles.js']) assert.doesNotMatch(lire(f), /\bdb\b|firebase|firestore|recursiveDelete/i, `${f} ne touche pas à la base directement`);
  });
  test('pas de console, de variable d\'environnement, d\'eval ni de processus dans les fichiers de la porte', () => {
    for (const f of ['adaptateur.js', 'porte.js', 'actions-veille.js', 'actions-automatisations.js', 'validation.js', 'cles.js', 'n8n.js']) assert.doesNotMatch(lire(f), /console\.|process\.env|eval\(|new Function|child_process/, f);
  });
  test('le nom des tables est écrit dans le code, jamais reçu du workflow', () => {
    const c = lire('actions-veille.js');
    assert.deepEqual([...c.matchAll(/'(veille_[a-z]+)'/g)].map((m) => m[1]).sort(), ['veille_contenus', 'veille_pages', 'veille_resumes', 'veille_sources']);
  });
});

// --- Module Automatisations : la file « À valider » (actions propositions.*) ---
const AUTOM = { audrey: ['veille', 'automatisations'], martin: ['automatisations'], interne: ['automatisations'], sansveille: ['veille'] };
const PROPOSITION = { id: 'p1', type: 'Nouveau contact', titre: 'Ajouter une personne', resume: 'Reçu par e-mail.', champs: [{ nom: 'Nom', valeur: 'Alice Exemple' }, { nom: 'Ville', valeur: 'Lyon' }], lien: 'https://exemple.test/mail/1', executionId: '42' };

describe('porte : automatisations (propositions)', () => {
  const prop = (m, cle, action, donnees, workflowId = 'wA1') => m.appeler(cle, { module: 'automatisations', action, workflowId, donnees });

  test('1 rejouer « ajouter » ne crée aucun doublon et répond cree:false', async () => {
    const m = monde({ modules: AUTOM });
    const r1 = await prop(m, m.cles.audrey.cle, 'propositions.ajouter', PROPOSITION);
    assert.equal(r1.statut, 200);
    assert.deepEqual(r1.corps.resultat, { id: 'p1', cree: true, etat: 'a_valider' });
    const d = m.base.docs.get('clients/audrey/automatisations_propositions/p1');
    assert.equal(d.etat, 'a_valider');
    assert.ok(d.creeLe instanceof Date && d.expireLe instanceof Date);
    assert.equal(d.expireLe.getTime() - d.creeLe.getTime(), 30 * 86_400_000);
    assert.deepEqual(d.champsProposes, PROPOSITION.champs);
    assert.equal(d.executions.proposer, '42');
    m.base.docs.set('clients/audrey/automatisations_propositions/p1', { ...d, etat: 'validee' });
    const r2 = await prop(m, m.cles.audrey.cle, 'propositions.ajouter', { ...PROPOSITION, titre: 'Autre titre' });
    assert.deepEqual(r2.corps.resultat, { id: 'p1', cree: false, etat: 'validee' });
    assert.equal(m.base.docs.get('clients/audrey/automatisations_propositions/p1').titre, 'Ajouter une personne', 'rien n\'est écrasé');
    assert.equal([...m.base.docs.keys()].filter((c) => c.includes('automatisations_propositions')).length, 1);
  });

  test('2 un champ inconnu, un secret, un objet libre, une liste vide ou trop grande sont refusés (rien n\'est écrit)', async () => {
    const m = monde({ modules: AUTOM });
    const essais = [
      { ...PROPOSITION, etat: 'validee' },
      { ...PROPOSITION, proprietaire: 'martin' },
      { ...PROPOSITION, titre: 'cia_' + 'a'.repeat(30) },
      { ...PROPOSITION, resume: 'A'.repeat(45) },
      { ...PROPOSITION, champs: [{ nom: 'Nom', valeur: 'ghp_' + 'a'.repeat(30) }] },
      { ...PROPOSITION, champs: [{ nom: 'Nom', valeur: 'x', autre: 'y' }] },
      { ...PROPOSITION, champs: [{ nom: 'Nom', valeur: { a: 1 } }] },
      { ...PROPOSITION, champs: { Nom: 'x' } },
      { ...PROPOSITION, champs: [] },
      { ...PROPOSITION, champs: Array.from({ length: 41 }, (_, i) => ({ nom: `n${i}`, valeur: 'x' })) },
      { ...PROPOSITION, champs: [{ nom: 'Nom', valeur: 'a' }, { nom: 'Nom', valeur: 'b' }] },
      { ...PROPOSITION, id: 'P1 / ../x' },
      { ...PROPOSITION, lien: 'javascript:alert(1)' },
      { ...PROPOSITION, type: 'T'.repeat(41) },
      { ...PROPOSITION, titre: '' },
    ];
    for (const e of essais) assert.equal((await prop(m, m.cles.audrey.cle, 'propositions.ajouter', e)).statut, 400, JSON.stringify(e).slice(0, 60));
    assert.equal(m.base.docs.size, 0);
  });

  test('2 bis un corps de plus de 256 Ko est refusé par la passerelle (413), avant toute écriture', async () => {
    const m = monde({ modules: AUTOM });
    const s = createServer(creerGestionnaireHttp(m.porte));
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    try {
      const corps = { module: 'automatisations', action: 'propositions.ajouter', workflowId: 'wA1', donnees: { ...PROPOSITION, champs: Array.from({ length: 40 }, (_, i) => ({ nom: `n${i}`, valeur: 'a'.repeat(8000) })) } };
      const r = await fetch(`http://127.0.0.1:${s.address().port}/porte`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${m.cles.audrey.cle}` }, body: JSON.stringify(corps) });
      assert.equal(r.status, 413);
      assert.equal(m.base.docs.size, 0);
    } finally { await new Promise((r) => s.close(r)); }
  });

  const deposer = async (m, id, valideeLe) => {
    await prop(m, m.cles.audrey.cle, 'propositions.ajouter', { ...PROPOSITION, id });
    const c = `clients/audrey/automatisations_propositions/${id}`;
    if (valideeLe) m.base.docs.set(c, { ...m.base.docs.get(c), etat: 'validee', valideeLe: new Date(valideeLe), champsValides: PROPOSITION.champs, valideePar: 'a@exemple.test', canal: 'interface' });
  };

  test('3 « lireValidees » ne renvoie que les validées, les plus anciennes d\'abord, avec une limite', async () => {
    const m = monde({ modules: AUTOM });
    await deposer(m, 'p-nouvelle', T0);
    await deposer(m, 'p-b', T0 - 1000);
    await deposer(m, 'p-a', T0 - 5000);
    await deposer(m, 'p-attente');
    await deposer(m, 'p-c', T0 - 3000);
    const tout = (await prop(m, m.cles.audrey.cle, 'propositions.lireValidees', {})).corps.resultat.propositions;
    assert.deepEqual(tout.map((p) => p.id), ['p-a', 'p-c', 'p-b', 'p-nouvelle']);
    assert.equal(tout[0].valideeLe, new Date(T0 - 5000).toISOString(), 'dates en texte');
    assert.ok(!('ecritPar' in tout[0]) && !('proprietaire' in tout[0]));
    assert.deepEqual((await prop(m, m.cles.audrey.cle, 'propositions.lireValidees', { limite: 2 })).corps.resultat.propositions.map((p) => p.id), ['p-a', 'p-c']);
    assert.equal((await prop(m, m.cles.audrey.cle, 'propositions.lireValidees', { limite: 101 })).statut, 400);
    assert.equal((await prop(m, m.cles.martin.cle, 'propositions.lireValidees', {}, 'wM1')).corps.resultat.propositions.length, 0);
  });

  test('4 « marquerAppliquee » sur une proposition non validée est refusé ; depuis « validee » elle passe, une seule fois', async () => {
    const m = monde({ modules: AUTOM });
    await deposer(m, 'p1');
    const c = 'clients/audrey/automatisations_propositions/p1';
    const r = await prop(m, m.cles.audrey.cle, 'propositions.marquerAppliquee', { id: 'p1', executionId: '77' });
    assert.equal(r.statut, 409);
    assert.equal(r.corps.erreur, 'transition_interdite');
    assert.equal(m.base.docs.get(c).etat, 'a_valider');
    assert.equal((await prop(m, m.cles.audrey.cle, 'propositions.marquerEchec', { id: 'p1', erreur: 'x' })).statut, 409);
    assert.equal((await prop(m, m.cles.audrey.cle, 'propositions.marquerAppliquee', { id: 'absente' })).statut, 404);
    m.base.docs.set(c, { ...m.base.docs.get(c), etat: 'validee' });
    assert.deepEqual((await prop(m, m.cles.audrey.cle, 'propositions.marquerAppliquee', { id: 'p1', executionId: '77' })).corps.resultat, { id: 'p1', etat: 'appliquee', deja: false });
    assert.equal(m.base.docs.get(c).etat, 'appliquee');
    assert.equal(m.base.docs.get(c).executions.appliquer, '77');
    assert.deepEqual((await prop(m, m.cles.audrey.cle, 'propositions.marquerAppliquee', { id: 'p1', executionId: '88' })).corps.resultat, { id: 'p1', etat: 'appliquee', deja: true }, 'rejeu : succès sans rien changer');
    assert.equal(m.base.docs.get(c).executions.appliquer, '77');
    assert.equal((await prop(m, m.cles.audrey.cle, 'propositions.marquerEchec', { id: 'p1', erreur: 'x' })).statut, 409, 'appliquee puis échec : interdit');
  });

  test('4 rejouer « marquerEchec » ne compte pas une tentative de plus ; echec puis appliquee reste interdit', async () => {
    const m = monde({ modules: AUTOM });
    await deposer(m, 'p1', T0);
    const c = 'clients/audrey/automatisations_propositions/p1';
    assert.deepEqual((await prop(m, m.cles.audrey.cle, 'propositions.marquerEchec', { id: 'p1', erreur: 'panne' })).corps.resultat, { id: 'p1', etat: 'echec', tentatives: 1, deja: false });
    assert.deepEqual((await prop(m, m.cles.audrey.cle, 'propositions.marquerEchec', { id: 'p1', erreur: 'panne' })).corps.resultat, { id: 'p1', etat: 'echec', tentatives: 1, deja: true });
    assert.equal(m.base.docs.get(c).tentatives, 1);
    assert.equal((await prop(m, m.cles.audrey.cle, 'propositions.marquerAppliquee', { id: 'p1' })).statut, 409);
  });

  test('4 une erreur qui ressemble à un secret est enregistrée masquée (200), jamais renvoyée ni journalisée', async () => {
    const m = monde({ modules: AUTOM });
    await deposer(m, 'p1', T0);
    const secret = 'ghp_' + 'a'.repeat(30);
    const r = await prop(m, m.cles.audrey.cle, 'propositions.marquerEchec', { id: 'p1', erreur: `Échec avec ${secret}` });
    assert.equal(r.statut, 200);
    assert.match(m.base.docs.get('clients/audrey/automatisations_propositions/p1').derniereErreur, /masqué/);
    assert.ok(!JSON.stringify(m.base.docs.get('clients/audrey/automatisations_propositions/p1')).includes(secret));
    assert.ok(!JSON.stringify(r).includes(secret) && !JSON.stringify(m.journaux).includes(secret));
  });

  test('4 bis « marquerEchec » depuis « validee » compte la tentative et garde l\'erreur coupée à 200 caractères', async () => {
    const m = monde({ modules: AUTOM });
    await deposer(m, 'p1', T0);
    const r = await prop(m, m.cles.audrey.cle, 'propositions.marquerEchec', { id: 'p1', erreur: 'erreur '.repeat(70) });
    assert.deepEqual(r.corps.resultat, { id: 'p1', etat: 'echec', tentatives: 1, deja: false });
    const d =m.base.docs.get('clients/audrey/automatisations_propositions/p1');
    assert.equal(d.etat, 'echec');
    assert.equal(d.derniereErreur.length, 200);
  });

  test('5 un propriétaire ne voit ni ne modifie jamais les propositions d\'un autre (corps sans propriétaire, chemin écrit dans le code)', async () => {
    const m = monde({ modules: AUTOM });
    await deposer(m, 'p1', T0);
    assert.equal((await prop(m, m.cles.martin.cle, 'propositions.marquerAppliquee', { id: 'p1' }, 'wM1')).statut, 404);
    assert.equal((await prop(m, m.cles.martin.cle, 'propositions.marquerAppliquee', { id: 'p1', proprietaire: 'audrey' }, 'wM1')).statut, 400);
    assert.equal((await prop(m, m.cles.martin.cle, 'propositions.lireValidees', {}, 'wM1')).corps.resultat.propositions.length, 0);
    await prop(m, m.cles.martin.cle, 'propositions.ajouter', { ...PROPOSITION, titre: 'Pour Martin' }, 'wM1');
    assert.equal(m.base.docs.get('clients/martin/automatisations_propositions/p1').titre, 'Pour Martin');
    assert.equal(m.base.docs.get('clients/audrey/automatisations_propositions/p1').titre, 'Ajouter une personne');
    // Un workflow d'Audrey avec la clé de Martin est refusé par le contrôle d'intégrité.
    assert.equal((await prop(m, m.cles.martin.cle, 'propositions.lireValidees', {}, 'wA1')).statut, 403);
    // Chez Jérôme (base 1) : racine, jamais sous clients/.
    const j = monde({ modules: AUTOM, contexte: 'crm' });
    assert.equal((await prop(j, j.cles.interne.cle, 'propositions.ajouter', PROPOSITION, 'wI1')).statut, 200);
    assert.ok(j.base.docs.has('automatisations_propositions/p1'));
  });

  test('6 le journal de la porte ne contient aucun contenu de proposition', async () => {
    const m = monde({ modules: AUTOM });
    await prop(m, m.cles.audrey.cle, 'propositions.ajouter', { ...PROPOSITION, titre: 'TITRE-SECRET-123', resume: 'RESUME-SECRET-456', champs: [{ nom: 'NOM-SECRET-789', valeur: 'VALEUR-SECRET-000' }], lien: 'https://lien-secret.test/x' });
    await prop(m, m.cles.audrey.cle, 'propositions.lireValidees', {});
    await prop(m, m.cles.audrey.cle, 'propositions.marquerEchec', { id: 'p1', erreur: 'ERREUR-SECRETE-111' });
    const texte = JSON.stringify(m.journaux);
    assert.ok(m.journaux.length >= 3);
    for (const interdit of ['TITRE-SECRET', 'RESUME-SECRET', 'NOM-SECRET', 'VALEUR-SECRET', 'lien-secret', 'ERREUR-SECRETE']) assert.ok(!texte.includes(interdit), interdit);
    assert.deepEqual(Object.keys(m.journaux[0]).sort(), ['action', 'dureeMs', 'idCourt', 'module', 'proprietaire', 'statut', 'workflowId']);
  });

  test('7 module « automatisations » inactif pour ce propriétaire : refus 403, rien n\'est écrit', async () => {
    const m = monde({ modules: AUTOM });
    const r = await prop(m, m.cles.sansveille.cle, 'propositions.ajouter', PROPOSITION, 'wA1');
    assert.equal(r.statut, 403);
    const r2 = await prop(m, m.cles.sansveille.cle, 'propositions.lireValidees', {}, 'wA1');
    assert.equal(r2.statut, 403);
    assert.equal(r2.corps.erreur, 'module_non_actif');
    assert.equal(m.base.docs.size, 0);
  });

  test('7 bis aucune action « decider » : un workflow ne peut ni valider ni refuser', async () => {
    const m = monde({ modules: AUTOM });
    for (const a of ['propositions.decider', 'propositions.valider', 'propositions.refuser', 'propositions.relancer']) assert.equal((await prop(m, m.cles.audrey.cle, a, { id: 'p1' })).corps.erreur, 'action_inconnue', a);
  });

  test('le nom de la table est écrit dans le code, et les transitions viennent du fichier pur', () => {
    const c = readFileSync(new URL('../scripts/porte/actions-automatisations.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.deepEqual([...c.matchAll(/'(automatisations_[a-z]+)'/g)].map((x) => x[1]), ['automatisations_propositions']);
    assert.match(c, /from '\.\.\/\.\.\/js\/modules\/automatisations\/propositions\.js'/);
    assert.doesNotMatch(c, /etat: '(validee|appliquee|echec)'/, 'les états de destination viennent des transitions pures');
  });
});
