// L'assemblage RÉEL de la porte du CRM (functions/src/porte.js, creerPorteCrm) expose bien le module « devis » avec son service : clé, module actif, contrôle d'intégrité du workflow (faux n8n),
// lecture de l'e-mail puis note du résultat. Sans émulateur : une fausse base Firestore en mémoire (juste ce que les accès du serveur utilisent) et un faux stockage.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerPorteCrm } from '../functions/src/porte.js';
import { genererCle, enregistrementDe, TABLE_CLES } from '../scripts/porte/cles.js';
import { MODULES_DE_LA_PORTE } from '../scripts/porte/porte.js';

const maintenant = new Date();

/** Fausse base : chemin « collection/id » -> données. Offre collection().doc(), doc(), runTransaction() comme firebase-admin. */
function fausseBase(depart) {
  const docs = new Map(Object.entries(depart));
  const ref = (chemin) => ({
    path: chemin,
    get: async () => ({ exists: docs.has(chemin), id: chemin.split('/').pop(), data: () => structuredClone(docs.get(chemin)), updateTime: null }),
    update: async (p) => { if (!docs.has(chemin)) throw Object.assign(new Error('absent'), { code: 5 }); docs.set(chemin, { ...docs.get(chemin), ...p }); },
  });
  return {
    docs,
    collection: (n) => ({ doc: (id) => ref(`${n}/${id}`) }),
    doc: (chemin) => ref(chemin),
    runTransaction: async (fn) => {
      const ecritures = [];
      const t = {
        get: (r) => r.get(),
        set: (r, d) => ecritures.push(() => docs.set(r.path, d)),
        update: (r, d) => ecritures.push(() => docs.set(r.path, { ...docs.get(r.path), ...d })),
        delete: (r) => ecritures.push(() => docs.delete(r.path)),
      };
      const res = await fn(t);
      ecritures.forEach((e) => e());
      return res;
    },
  };
}

describe('Q1 la porte du CRM, telle que la fonction l’assemble', () => {
  test('Q1 le module « devis » est dans la porte ; lireEmail puis noterEmailPrepare marchent de bout en bout avec le vrai service', async () => {
    assert.deepEqual(Object.keys(MODULES_DE_LA_PORTE.devis).sort(), ['devis.lireEmail', 'devis.noterEmailPrepare']);
    const cle = genererCle('interne');
    const e = enregistrementDe(cle, 'interne', maintenant);
    const db = fausseBase({
      [`${TABLE_CLES}/${e.id}`]: e.donnees,
      'devis_devis/dv1': { statut: 'en_attente_envoi', numero: 'DEV-1', version: 1, objet: 'Cuisine', personneId: 'p1', destinataires: ['marie@exemple.fr'], copie: [], pdf: { statut: 'ok', chemin: 'devis/aff1/dv1/devis.pdf', nom: 'Devis.pdf', sha256: 'SECRET' }, marge: 33 },
      'crm_personnes/p1': { nom: 'Marie Durand' },
      'crm_actions_lancements/dem_1': { action: 'devis.preparerEmail', client: 'interne', devisId: 'dv1', demandeId: 'dem_1', statut: 'demandee', demandeLe: maintenant },
    });
    const liens = [];
    const porte = creerPorteCrm({
      db, lireSecret: async () => 'cle-api-factice', sortie: () => {},
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ id: 'w1', name: 'interne-devis-email', tags: [{ name: 'interne' }] }) }),
      stockage: () => ({ lienSigne: async (chemin, o) => { liens.push(o.minutes); return 'https://stockage.exemple.test/signe'; }, taille: async () => 2048 }),
    });
    const appeler = (action, donnees) => porte({ methode: 'POST', authorization: `Bearer ${cle}`, corps: { module: 'devis', action, workflowId: 'w1', donnees } });
    const lu = await appeler('devis.lireEmail', { devisId: 'dv1', demandeId: 'dem_1' });
    assert.equal(lu.statut, 200, JSON.stringify(lu.corps));
    assert.equal(lu.corps.resultat.numero, 'DEV-1');
    assert.equal(lu.corps.resultat.pdf.lienSigne, 'https://stockage.exemple.test/signe');
    assert.deepEqual(liens, [10]);
    assert.ok(!JSON.stringify(lu.corps).includes('SECRET') && !JSON.stringify(lu.corps).includes('33') && !JSON.stringify(lu.corps).includes('devis/aff1'));
    const note = await appeler('devis.noterEmailPrepare', { devisId: 'dv1', demandeId: 'dem_1', statut: 'ok' });
    assert.equal(note.statut, 200, JSON.stringify(note.corps));
    assert.equal(db.docs.get('devis_devis/dv1').emailPrepare.statut, 'ok');
    assert.equal(db.docs.get('devis_devis/dv1').statut, 'en_attente_envoi');
    assert.equal(db.docs.get('crm_actions_lancements/dem_1').statut, 'ok');
  });
});
