// État des devis sur la fiche d'affaire et le Kanban : règles pures (archivés compris). Aucun navigateur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { devisDeAffaire, actionEnteteDevis } from '../js/modules/devis/onglet-affaire-logique.js';
import { pastilleDevisDeAffaire, etatDevisDeAffaire } from '../js/modules/devis/pastille-affaire.js';
import { origineMontant } from '../js/modules/crm/logique.js';

const MAINT = Date.parse('2026-10-25T10:00:00Z');
const JOUR = 86400000;
const opts = { aujourdhui: '2026-10-25', maintenantMs: MAINT };
const D = (id, extra) => ({ id, affaireId: 'a1', version: 1, statut: 'en_attente_envoi', numero: `DEV-${id}`, creeLe: new Date(MAINT - JOUR), ...extra });

test('1 devisDeAffaire garde les archivés', () => {
  const l = devisDeAffaire([D('x', { archive: true }), D('y', { creeLe: new Date(MAINT - 5 * JOUR) })], 'a1');
  assert.deepEqual(l.map((d) => d.id), ['x', 'y']);
});

test('1b actionEnteteDevis : non archivé d’abord, sinon l’archivé', () => {
  const nouveau = D('n', { archive: false, creeLe: new Date(MAINT - 9 * JOUR) });
  const archive = D('a', { archive: true, creeLe: new Date(MAINT - 1 * JOUR) });
  assert.equal(actionEnteteDevis([nouveau, archive], 'a1', true).route, 'devis/voir/n');
  assert.equal(actionEnteteDevis([archive], 'a1', true).route, 'devis/voir/a');
});

const aff = (detail, nature = 'propose', ht = 100) => ({ montantDevisHt: ht, montantDevisNature: nature, montantDevisDetail: detail });
test('3 origineMontant : un devis, plusieurs, détail absent, montant estimé, repli de nature', () => {
  const un = aff([{ numero: 'DEV-2026-10-26-004', version: 1, ht: 100, compte: true }]);
  assert.equal(origineMontant(un, () => ({ mot: 'finalisé', archive: true })), 'Devis DEV-2026-10-26-004, finalisé, archivé');
  assert.equal(origineMontant(un, () => ({ mot: 'finalisé', archive: false })), 'Devis DEV-2026-10-26-004, finalisé');
  assert.equal(origineMontant(un), 'Devis DEV-2026-10-26-004, proposé'); // repli : module éteint
  assert.equal(origineMontant(aff([{ numero: 'DEV-1', version: 2, ht: 100, compte: true }], 'accepte')), 'Devis DEV-1 v2, signé');
  assert.equal(origineMontant(aff([{ numero: 'DEV-1', version: 1, ht: 100, compte: true }, { numero: 'DEV-2', version: 2, ht: 100, compte: true }], 'accepte', 200)), 'Devis signés : DEV-1 + DEV-2 v2');
  const quatre = [1, 2, 3, 4].map((n) => ({ numero: `DEV-${n}`, version: 1, ht: 100, compte: true }));
  assert.equal(origineMontant(aff(quatre, 'accepte', 400)), '4 devis signés (détail dans le i)');
  assert.equal(origineMontant(aff(undefined)), 'D’après les devis');
  assert.equal(origineMontant(aff([])), 'D’après les devis');
  assert.equal(origineMontant(aff([{ numero: 'DEV-1', ht: 100, compte: false }])), 'D’après les devis'); // aucun devis compté : jamais un numéro inventé
  assert.equal(origineMontant({ montant: 100 }), ''); // montant estimé
  assert.equal(origineMontant({}), '');
  assert.equal(origineMontant(un, () => { throw new Error('x'); }), 'Devis DEV-2026-10-26-004, proposé'); // fournisseur qui plante
});

test('4 pastilleDevisDeAffaire : archivé = texte « (archivé) » et champ archive', () => {
  const p = pastilleDevisDeAffaire([D('x', { archive: true })], 'a1', opts);
  assert.equal(p.texte, 'Devis : Finalisé (archivé)');
  assert.equal(p.archive, true);
  const s = pastilleDevisDeAffaire([D('y', { statut: 'accepte', archive: true })], 'a1', opts);
  assert.equal(s.texte, 'Devis signé (archivé)');
  const n = pastilleDevisDeAffaire([D('z')], 'a1', opts);
  assert.equal(n.texte, 'Devis : Finalisé');
  assert.equal('archive' in n, false);
});

test('3c etatDevisDeAffaire : mot en minuscules sans « Devis », archive, introuvable = null', () => {
  const l = [D('x', { numero: 'DEV-9', statut: 'accepte', archive: true }), D('y', { numero: 'DEV-8', version: 2 })];
  assert.deepEqual(etatDevisDeAffaire(l, 'a1', 'DEV-9', 1, opts), { mot: 'signé', archive: true });
  assert.deepEqual(etatDevisDeAffaire(l, 'a1', 'DEV-8', 2, opts), { mot: 'finalisé', archive: false });
  assert.equal(etatDevisDeAffaire(l, 'a1', 'DEV-8', 1, opts), null);
  assert.equal(etatDevisDeAffaire(l, 'a2', 'DEV-9', 1, opts), null);
});
