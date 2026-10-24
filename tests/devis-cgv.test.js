// Tests G (module Devis, générateur de CGV) : js/modules/devis/cgv.js. node --test, sans navigateur.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cgvHtml, sectionsCgv, erreursCgv, CGV_RELUES_PAR_JURISTE, AVERTISSEMENT_CGV } from '../js/modules/devis/cgv.js';

const base = {
  typePrestations: 'travaux_fournitures',
  professionnel: { nom: 'Atelier Exemple', email: 'contact@exemple.test' },
  mediateur: { nom: 'Médiateur Test', email: 'mediation@exemple.test', site: 'https://mediation.exemple.test' },
  tribunal: 'le tribunal judiciaire de Ville',
  validiteDevisJours: 45, delaiPaiementJours: 21, acomptePourcent: 35, penalitesRetard: false,
};
const titres = (p) => sectionsCgv(p).map((s) => s.titre);
const tout = (p) => sectionsCgv(p).flatMap((s) => [s.titre, ...s.paragraphes.map((x) => `${x.intitule ?? ''} ${x.texte}`)]).join('\n');

describe('G cgv', () => {
  test('G1 les trois types donnent des titres et des rubriques différents', () => {
    const t = titres({ ...base, typePrestations: 'travaux' }), f = titres({ ...base, typePrestations: 'fournitures' }), m = titres(base);
    assert.ok(t.includes('Réception') && !t.includes('Livraison') && !t.includes('Réserve de propriété'));
    assert.ok(f.includes('Livraison') && f.includes('Réserve de propriété') && !f.includes('Réception'));
    assert.ok(m.includes('Livraison') && m.includes('Réception') && m.includes('Réserve de propriété'));
    assert.match(cgvHtml({ ...base, typePrestations: 'travaux' }), /<h1>Conditions générales de travaux<\/h1>/);
    assert.match(cgvHtml({ ...base, typePrestations: 'fournitures' }), /<h1>Conditions générales de vente<\/h1>/);
    assert.match(cgvHtml(base), /<h1>Conditions générales de vente et de travaux<\/h1>/);
    for (const r of ['Comment ça marche', 'Prix', 'Délais', 'Garanties', 'Résiliation', 'Données personnelles', 'En cas de problème', 'Rétractation']) assert.ok(m.includes(r), r);
  });
  test('G2 les valeurs saisies apparaissent dans le texte', () => {
    const x = tout(base);
    for (const v of ['35\u00a0%', '21 jours', '45 jours', 'le tribunal judiciaire de Ville', 'Médiateur Test', 'mediation@exemple.test', 'contact@exemple.test']) assert.ok(x.includes(v), v);
    assert.match(x, /réclamation écrite/);
  });
  test('G3 les pénalités n\'apparaissent que si demandées', () => {
    assert.ok(!tout(base).includes('Pénalités de retard'));
    assert.ok(tout({ ...base, penalitesRetard: true }).includes('Pénalités de retard'));
  });
  test('G4 validations, un message par problème', () => {
    assert.deepEqual(erreursCgv(base), []);
    const un = (extra, re) => { const e = erreursCgv({ ...base, ...extra }); assert.equal(e.length, 1, JSON.stringify(e)); assert.match(e[0], re); };
    un({ professionnel: { nom: '', email: 'a@b.test' } }, /nom du professionnel/);
    un({ professionnel: { nom: 'X', email: '' } }, /e-mail du professionnel est obligatoire/);
    un({ professionnel: { nom: 'X', email: 'pas un mail' } }, /e-mail du professionnel est illisible/);
    un({ mediateur: {} }, /médiateur/);
    un({ mediateur: { nom: 'M', email: 'nope' } }, /e-mail du médiateur/);
    un({ tribunal: '' }, /tribunal/);
    un({ validiteDevisJours: 0 }, /validité/);
    un({ delaiPaiementJours: 400 }, /délai de paiement/);
    un({ acomptePourcent: 101 }, /acompte/);
    un({ couleur: 'rouge' }, /couleur/);
    un({ typePrestations: 'autre' }, /type de prestations/);
  });
  test('G5 échappement HTML des valeurs saisies', () => {
    const s = '<script>alert(1)</script>';
    const h = cgvHtml({ ...base, mediateur: { nom: s }, tribunal: s, professionnel: { nom: s, email: 'a@b.test' } });
    assert.ok(!h.includes('<script'));
    assert.ok(h.includes('&lt;script&gt;'));
  });
  test('G6 aucune ressource externe ni JavaScript', () => {
    const h = cgvHtml({ ...base, mediateur: { nom: 'M', email: 'm@exemple.test' } });
    assert.ok(!/<script|<link|<img|<iframe|@import|url\(|src=|https?:\/\//i.test(h));
    assert.ok(!/<script|<link|<img|<iframe|@import|url\(|\ssrc=|\shref=/i.test(cgvHtml(base)));
    assert.ok(!/\son\w+=/i.test(h));
  });
  test('G7 la couleur sert à l\'accent des titres', () => {
    const h = cgvHtml({ ...base, couleur: '#aa1122' });
    assert.match(h, /--accent: #aa1122/);
    assert.match(h, /h2 \{[^}]*var\(--accent\)/);
    assert.match(cgvHtml(base), /--accent: #333333/);
    const rouge = cgvHtml({ ...base, couleur: 'red' });
    assert.match(rouge, /--accent: #333333/);
    assert.ok(!/<style>[\s\S]*\bred\b[\s\S]*<\/style>/.test(rouge));
  });
  test('G8 le texte n\'est pas encore relu par un juriste', () => assert.equal(CGV_RELUES_PAR_JURISTE, false));
  test('G9 aucun nom de logiciel concurrent ni de client', () => {
    const x = (tout(base) + cgvHtml(base)).toLowerCase();
    for (const m of ['pipedrive', 'hubspot', 'salesforce', 'batigest', 'obat', 'tolteck', 'costructor', 'henrri', 'zoho']) assert.ok(!x.includes(m), m);
  });
  test('G10 l\'avertissement est présent par défaut, absent avec avertissement: false', () => {
    assert.ok(cgvHtml(base).includes('class="avertissement"'));
    assert.ok(cgvHtml(base, { avertissement: true }).includes('relu et validé par le juriste'));
    assert.ok(!cgvHtml(base, { avertissement: false }).includes('class="avertissement"'));
    assert.match(AVERTISSEMENT_CGV, /^Ce texte est fourni à titre d'exemple/);
  });
});
