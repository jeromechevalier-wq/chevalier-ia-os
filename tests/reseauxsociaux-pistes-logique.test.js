// Pistes de posts du module Réseaux sociaux (13/11/2026) : règles pures des sources (type, moyennes), des pistes, des exemples chiffrés, des compteurs, du prompt copié et de la lecture de la réponse collée.
// Sans navigateur ni émulateur. Données fictives uniquement. Les parcours à l'écran viennent avec l'écran (PR suivante).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/modules/reseauxsociaux/logique.js';
import * as I from '../js/modules/reseauxsociaux/idees-logique.js';
import * as N from '../js/modules/reseauxsociaux/inspirations-logique.js';
import * as P from '../js/modules/reseauxsociaux/pistes-logique.js';

const site = { id: 's1', type: 'site', nom: 'Site fictif', url: 'https://exemple.test', pourquoi: 'Des cas clairs' };
const profil = { id: 'p1', type: 'profil', nom: 'Alice Exemple', url: 'https://www.linkedin.com/in/alice-exemple', pourquoi: 'Accroches courtes', moyenneReactions: 40, moyenneCommentaires: 5 };
const veille = { id: 'v1', type: 'veille', nom: 'Résumé fictif', resume: '2026-11-10 Résumé fictif.md' };
const piste = (id, extra = {}) => ({ id, sourceId: 's1', sourceType: 'site', sourceTitre: 'Site fictif', angle: `Angle ${id}`, note: '', ancre: '', url: '', exempleId: null, pilier: null, format: null, service: null, etat: 'nouvelle', ideeId: null, lot: '', auteur: 'claude', ...extra });
const reponse = (pistes, extra = {}) => JSON.stringify({ format: 'pistes-v1', sourceId: 's1', pistes, ...extra });
const ids = () => { let k = 0; return () => `n${++k}`; };

describe('tables et libellés', () => {
  test('la table des pistes est dans la liste du module et dans les listes recopiées', () => {
    assert.equal(R.COLLECTION_PISTES, 'reseauxsociaux_pistes');
    assert.ok(R.COLLECTIONS.includes(R.COLLECTION_PISTES));
    assert.equal(R.COLLECTIONS.length, 6);
  });
});

describe('une source : type, adresse, moyennes', () => {
  test('une fiche sans type vaut « profil » (aucune migration)', () => {
    assert.equal(N.typeSource({ nom: 'Ancienne fiche' }), 'profil');
    assert.equal(N.typeSource({ type: 'inconnu' }), 'profil');
    assert.equal(N.normaliserInspiration({ nom: 'A', url: 'linkedin.com/in/a' }).type, 'profil');
    assert.deepEqual(N.TYPES_SOURCE.map((t) => t.id), ['profil', 'site', 'veille']);
  });
  test('adresse selon le type : LinkedIn pour un profil, https pour un site, facultative pour une veille', () => {
    assert.match(N.validerInspiration({ type: 'profil', nom: 'A', url: 'https://exemple.test' }), /LinkedIn/);
    assert.equal(N.validerInspiration({ type: 'site', nom: 'S', url: 'https://exemple.test' }), null);
    assert.match(N.validerInspiration({ type: 'site', nom: 'S', url: 'javascript:alert(1)' }), /adresse du site/);
    assert.match(N.validerInspiration({ type: 'site', nom: 'S' }), /adresse du site/);
    assert.equal(N.validerInspiration({ type: 'veille', nom: 'V' }), null);
    assert.match(N.validerInspiration({ type: 'veille', nom: 'V', url: 'http://exemple.test' }), /https/);
    assert.match(N.validerInspiration({ type: 'blog', nom: 'B', url: 'https://exemple.test' }), /Type de source inconnu/);
    assert.equal(N.normaliserInspiration({ type: 'site', nom: 'S', url: 'exemple.test/page' }).url, 'https://exemple.test/page');
  });
  test('veille : identifiant du contenu et fichier résumé gardés ; ailleurs ils sont vides', () => {
    const v = N.normaliserInspiration({ type: 'veille', nom: 'V', veilleContenuId: ' abc ', resume: ' f.md ', traiteLe: '2026-11-13' });
    assert.deepEqual([v.veilleContenuId, v.resume, v.traiteLe, v.url], ['abc', 'f.md', '2026-11-13', '']);
    const s = N.normaliserInspiration({ type: 'site', nom: 'S', url: 'https://exemple.test', veilleContenuId: 'abc', resume: 'f.md' });
    assert.deepEqual([s.veilleContenuId, s.resume], ['', '']);
  });
  test('moyennes d’un profil : nombres positifs seulement, jamais un zéro inventé ; réservées au type profil', () => {
    const p = N.normaliserInspiration({ type: 'profil', nom: 'A', url: 'linkedin.com/in/a', moyenneReactions: 41.5, moyenneCommentaires: 0, nombrePostsReleves: 12, releveLe: '2026-11-13' });
    assert.deepEqual([p.moyenneReactions, p.moyenneCommentaires, p.nombrePostsReleves, p.releveLe], [41.5, 0, 12, '2026-11-13']);
    const mauvais = N.normaliserInspiration({ type: 'profil', nom: 'A', url: 'linkedin.com/in/a', moyenneReactions: -3, moyenneCommentaires: '5', nombrePostsReleves: 2.5, releveLe: '2026-02-31' });
    assert.deepEqual([mauvais.moyenneReactions, mauvais.moyenneCommentaires, mauvais.nombrePostsReleves, mauvais.releveLe], [null, null, null, null]);
    assert.equal(N.normaliserInspiration({ type: 'site', nom: 'S', url: 'https://exemple.test', moyenneReactions: 10 }).moyenneReactions, null);
  });
  test('modifier une ancienne fiche garde ses champs et pose le type ; créer un site écrit le type', () => {
    const modif = N.planEnregistrerInspiration({ nom: 'Ancien', url: 'https://linkedin.com/in/a', pourquoi: 'x', piliers: [], formats: [], ordre: 4 }, { pourquoi: 'y' }, { id: 'a' }).ecritures[0];
    assert.deepEqual([modif.patch.type, modif.patch.nom, modif.patch.pourquoi, modif.patch.ordre], ['profil', 'Ancien', 'y', 4]);
    const creation = N.planEnregistrerInspiration(null, { type: 'site', nom: 'Site', url: 'https://exemple.test' }, { id: 'n1', autres: [] }).ecritures[0];
    assert.deepEqual([creation.type, creation.donnees.type, creation.donnees.url], ['creer', 'site', 'https://exemple.test/']);
  });
});

describe('un exemple chiffré et l’écart à la moyenne', () => {
  test('réactions, commentaires et jour du relevé sont rangés ; le texte du post n’a toujours pas de champ', () => {
    const n = N.normaliserExemple({ profilId: 'p1', url: 'https://www.linkedin.com/posts/a-1', reactions: 120, commentaires: 14, releveLe: '2026-11-13', texte: 'TEXTE TIERS', contenu: 'AUTRE' });
    assert.deepEqual([n.reactions, n.commentaires, n.releveLe], [120, 14, '2026-11-13']);
    assert.ok(!JSON.stringify(n).includes('TEXTE TIERS') && !JSON.stringify(n).includes('AUTRE'));
    const vide = N.normaliserExemple({ profilId: 'p1', url: 'https://www.linkedin.com/posts/a-1', reactions: -1, commentaires: 'beaucoup' });
    assert.deepEqual([vide.reactions, vide.commentaires, vide.releveLe], [null, null, null]);
  });
  test('un nombre qui n’est pas un entier est refusé à la validation', () => {
    const base = { profilId: 'p1', url: 'https://www.linkedin.com/posts/a-1' };
    assert.equal(N.validerExemple({ ...base, reactions: 0, commentaires: 3 }), null);
    assert.match(N.validerExemple({ ...base, reactions: -2 }), /nombres entiers/);
    assert.match(N.validerExemple({ ...base, commentaires: 1.5 }), /nombres entiers/);
    assert.match(N.validerExemple({ ...base, releveLe: '2026-13-01' }), /relevé/);
  });
  test('l’écart est CALCULÉ : (réactions + commentaires) sur (moyennes) ; jamais de division par zéro ni de valeur inventée', () => {
    const e = N.ecartALaMoyenne({ reactions: 90, commentaires: 15 }, profil); // 105 / 45
    assert.equal(e.libelle, '× 2,3 la moyenne');
    assert.ok(Math.abs(e.rapport - 105 / 45) < 1e-9);
    assert.equal(N.ecartALaMoyenne({ reactions: 90 }, profil), null);
    assert.equal(N.ecartALaMoyenne({ reactions: 90, commentaires: 1 }, { moyenneReactions: 0, moyenneCommentaires: 0 }), null);
    assert.equal(N.ecartALaMoyenne({ reactions: 90, commentaires: 1 }, {}), null);
    assert.equal(N.ecartALaMoyenne({ reactions: 90, commentaires: 1 }, null), null);
  });
  test('un exemple modifié garde ses chiffres', () => {
    const plan = N.planEnregistrerExemple({ profilId: 'p1', url: 'https://www.linkedin.com/posts/a-1', reactions: 50, commentaires: 5, releveLe: '2026-11-13' }, { pourquoi: 'Autre' }, { id: 'e1' }).ecritures[0];
    assert.deepEqual([plan.patch.reactions, plan.patch.commentaires, plan.patch.releveLe, plan.patch.pourquoi], [50, 5, '2026-11-13', 'Autre']);
  });
});

describe('une piste : liste fermée de champs', () => {
  test('aucun champ texte, contenu ni extrait n’est écrit ; les champs sont exactement ceux prévus', () => {
    const n = P.normaliserPiste({ sourceId: 's1', angle: 'Un angle', texte: 'TEXTE TIERS', contenu: 'COPIE', extrait: 'EXTRAIT', corps: 'x', note: 'n' });
    assert.deepEqual(Object.keys(n).sort(), ['ancre', 'angle', 'auteur', 'etat', 'exempleId', 'format', 'ideeId', 'lot', 'note', 'pilier', 'service', 'sourceId', 'sourceTitre', 'sourceType', 'url']);
    assert.ok(!JSON.stringify(n).match(/TEXTE TIERS|COPIE|EXTRAIT/));
  });
  test('valeurs inconnues : pilier ancien converti, format et service inconnus null, état inconnu « nouvelle », lien non https vidé, auteur inconnu « utilisateur »', () => {
    const n = P.normaliserPiste({ sourceId: 's1', angle: ' Un   angle ', pilier: 'pme', format: 'x', service: 'cuisine', etat: 'zzz', url: 'http://exemple.test', auteur: 'robot', sourceType: 'blog' });
    assert.deepEqual([n.angle, n.pilier, n.format, n.service, n.etat, n.url, n.auteur, n.sourceType], ['Un angle', 'cas_concrets', null, null, 'nouvelle', '', 'utilisateur', 'profil']);
    assert.equal(P.normaliserPiste({ url: 'exemple.test/page' }).url, '');
    assert.equal(P.normaliserPiste({ url: 'https://exemple.test/page' }).url, 'https://exemple.test/page');
  });
  test('validation : angle obligatoire, longueurs refusées (jamais coupées en silence)', () => {
    assert.equal(P.validerPiste({ sourceId: 's1', angle: 'ok' }), null);
    assert.match(P.validerPiste({ sourceId: 's1', angle: '  ' }), /angle/);
    assert.match(P.validerPiste({ sourceId: 's1', angle: 'x'.repeat(201) }), /200/);
    assert.match(P.validerPiste({ sourceId: 's1', angle: 'x', note: 'y'.repeat(301) }), /300/);
    assert.match(P.validerPiste({ sourceId: 's1', angle: 'x', ancre: 'y'.repeat(201) }), /200/);
    assert.match(P.validerPiste({ sourceId: 's1', angle: 'x', url: 'http://exemple.test' }), /https/);
    assert.match(P.validerPiste({ angle: 'x' }), /source/);
  });
  test('l’identifiant d’une source de veille venue de n8n est prévisible', () => {
    assert.equal(P.idSourceVeille(' c42 '), 'veille-c42');
  });
});

describe('lire la réponse collée : chaque cas du tableau d’erreurs', () => {
  const lire = (texte, existantes = []) => P.lireReponsePistes(texte, { source: site, pistesExistantes: existantes });
  const bonne = { angle: 'Une facture oubliée', note: 'Parce que', ancre: 'Page tarifs', url: 'https://exemple.test/tarifs', pilier: 'cas_concrets', format: 'carrousel', service: 'finance' };

  test('réponse correcte : une ligne cochée, valeurs gardées', () => {
    const r = lire(reponse([bonne]));
    assert.equal(r.ok, true);
    assert.deepEqual([r.nombreCochees, r.champsIgnores, r.message], [1, 0, '']);
    assert.deepEqual(r.lignes[0].piste, { ...bonne, exempleId: '' });
    assert.deepEqual([r.lignes[0].cochee, r.lignes[0].refus, r.lignes[0].remarques], [true, null, []]);
  });
  test('zone vide ou texte sans JSON lisible : message, rien à créer', () => {
    for (const t of ['', '   ', 'Voici mes idées : une, deux, trois', '{ pas du json }', '{"format": "pistes-v1", "pistes": [', null, undefined]) {
      assert.deepEqual(lire(t), { ok: false, erreur: 'Je n’arrive pas à lire cette réponse. Copie tout le bloc entre accolades.' }, String(t));
    }
  });
  test('format différent de pistes-v1, ou pistes qui n’est pas une liste : même message', () => {
    const msg = 'Je n’arrive pas à lire cette réponse. Copie tout le bloc entre accolades.';
    assert.equal(lire(JSON.stringify({ format: 'pistes-v2', pistes: [] })).erreur, msg);
    assert.equal(lire(JSON.stringify({ pistes: [bonne] })).erreur, msg);
    assert.equal(lire(JSON.stringify({ format: 'pistes-v1', pistes: 'une piste' })).erreur, msg);
    assert.equal(lire(JSON.stringify({ format: 'pistes-v1', pistes: { angle: 'x' } })).erreur, msg);
    assert.equal(lire(JSON.stringify([bonne])).erreur, msg);
  });
  test('sourceId d’une autre source : « autre source », rien à créer ; absent : accepté', () => {
    assert.deepEqual(lire(reponse([bonne], { sourceId: 'autre' })), { ok: false, erreur: 'Cette réponse est pour une autre source.' });
    assert.equal(lire(JSON.stringify({ format: 'pistes-v1', pistes: [bonne] })).ok, true);
    assert.equal(lire(reponse([bonne], { sourceId: null })).ok, true, 'sourceId nul = aucune source annoncée : accepté (décision du 13/11)');
    assert.equal(lire(reponse([bonne], { sourceId: '' })).ok, false, 'une chaîne vide n’est pas « absent » : refusée');
  });
  test('les longueurs se comptent en caractères réels : 200 emojis passent entiers, 201 sont refusés', () => {
    const deux = '😀'.repeat(200);
    const ok = lire(reponse([{ angle: deux }]));
    assert.equal(ok.lignes[0].angle, deux);
    assert.equal(P.normaliserPiste({ sourceId: 's1', angle: deux }).angle, deux);
    assert.match(lire(reponse([{ angle: '😀'.repeat(201) }])).lignes[0].refus, /angle trop long/);
  });
  test('Claude entoure le JSON d’un bloc de code ou d’une phrase : lu quand même', () => {
    assert.equal(lire(`Voici :\n\`\`\`json\n${reponse([bonne])}\n\`\`\`\nBonne chance !`).nombreCochees, 1);
  });
  test('champ inconnu (dont texte, contenu, extrait) : ignoré, compté, jamais écrit', () => {
    const r = lire(reponse([{ ...bonne, texte: 'TEXTE TIERS', contenu: 'COPIE', extrait: 'EXTRAIT', exempleId: 'e1', etat: 'retenue', lot: 'x', auteur: 'utilisateur' }]));
    assert.equal(r.champsIgnores, 7); // texte, contenu, extrait, exempleId, etat, lot, auteur
    assert.ok(!JSON.stringify(r.lignes).match(/TEXTE TIERS|COPIE|EXTRAIT|e1/));
    assert.equal(r.lignes[0].piste.exempleId, '');
  });
  test('angle vide : piste refusée avec la raison, décochée', () => {
    const r = lire(reponse([{ ...bonne, angle: '   ' }, { note: 'sans angle' }, { ...bonne, angle: 42 }, 'texte', null, [1]]));
    assert.deepEqual(r.lignes.map((l) => [l.refus, l.cochee, l.piste]), [['angle vide', false, null], ['angle vide', false, null], ['angle vide', false, null], ['ce n’est pas une piste', false, null], ['ce n’est pas une piste', false, null], ['ce n’est pas une piste', false, null]]);
    assert.deepEqual([r.nombreCochees, r.message], [0, 'Aucune piste valide dans cette réponse.']);
  });
  test('angle, note ou ancre trop long : refusée « trop long », jamais coupée', () => {
    const r = lire(reponse([{ ...bonne, angle: 'x'.repeat(201) }, { ...bonne, note: 'x'.repeat(301) }, { ...bonne, ancre: 'x'.repeat(201) }, { ...bonne, angle: 'x'.repeat(200), note: 'y'.repeat(300), ancre: 'z'.repeat(200) }]));
    assert.deepEqual(r.lignes.map((l) => [!!l.refus, l.cochee]), [[true, false], [true, false], [true, false], [false, true]]);
    assert.match(r.lignes[0].refus, /angle trop long/);
    assert.match(r.lignes[1].refus, /note trop long/);
    assert.match(r.lignes[2].refus, /ancre trop long/);
  });
  test('pilier, format ou service inconnu : piste gardée, champ vide, remarque « à choisir »', () => {
    const r = lire(reponse([{ ...bonne, pilier: 'zzz', format: 'zzz', service: 'zzz' }]));
    const l = r.lignes[0];
    assert.deepEqual([l.cochee, l.piste.pilier, l.piste.format, l.piste.service], [true, null, null, null]);
    assert.deepEqual(l.remarques, ['pilier à choisir', 'format à choisir', 'service à choisir']);
    assert.deepEqual(lire(reponse([{ angle: 'Sans classement' }])).lignes[0].remarques, []); // absent n'est pas inconnu
    assert.equal(lire(reponse([{ ...bonne, pilier: 'pme' }])).lignes[0].piste.pilier, 'cas_concrets'); // ancien identifiant lu
  });
  test('url qui n’est pas en https : lien retiré, remarque, piste gardée', () => {
    for (const url of ['http://exemple.test/x', 'exemple.test/x', 'javascript:alert(1)']) {
      const l = lire(reponse([{ ...bonne, url }])).lignes[0];
      assert.deepEqual([l.piste.url, l.cochee, l.remarques], ['', true, ['lien retiré']], url);
    }
  });
  test('doublon avec le stock : décochée « déjà en stock » (sans casse, accents ni ponctuation) ; avec une autre source : pas un doublon', () => {
    const stock = [piste('a', { angle: 'Une FACTURE oubliée !' }), piste('b', { sourceId: 'autre', angle: 'Autre source' })];
    const r = lire(reponse([{ angle: 'une facture oubliée' }, { angle: 'Autre source' }, { angle: 'Une facture oubliée ?' }]), stock);
    assert.deepEqual(r.lignes.map((l) => [l.doublon, l.cochee, l.remarques]), [[true, false, ['déjà en stock']], [false, true, []], [true, false, ['déjà en stock']]]);
    assert.equal(r.nombreCochees, 1);
    const accents = lire(reponse([{ angle: 'Éléphant à l’école' }]), [piste('c', { angle: 'elephant a l ecole' })]);
    assert.equal(accents.lignes[0].doublon, true);
  });
  test('doublon dans la réponse : la seconde est décochée « déjà dans la réponse » ; un angle refusé ne compte pas', () => {
    const r = lire(reponse([{ angle: 'Mon angle' }, { angle: 'mon  ANGLE.' }, { angle: '' }, { angle: 'Un autre' }]));
    assert.deepEqual(r.lignes.map((l) => [l.cochee, l.remarques]), [[true, []], [false, ['déjà dans la réponse']], [false, []], [true, []]]);
  });
  test('plus de 30 pistes : les 30 premières valides cochées, les suivantes décochées « au-delà de 30 »', () => {
    const r = lire(reponse(Array.from({ length: 35 }, (_, k) => ({ angle: `Angle numéro ${k}` }))));
    assert.equal(r.nombreCochees, 30);
    assert.deepEqual(r.lignes.slice(30).map((l) => [l.cochee, l.remarques]), Array(5).fill([false, ['au-delà de 30']]));
    // les refusées et les doublons ne comptent pas dans les 30
    const m = lire(reponse([{ angle: '' }, { angle: 'Dup' }, { angle: 'dup' }, ...Array.from({ length: 29 }, (_, k) => ({ angle: `Autre ${k}` }))]));
    assert.equal(m.nombreCochees, 30);
    assert.ok(m.lignes.at(-1).cochee);
  });
  test('texte collé énorme (plus de 60 000 caractères) : « Réponse trop longue », rien n’est lu', () => {
    assert.deepEqual(lire(`${reponse([bonne])}${' '.repeat(60001)}`), { ok: false, erreur: 'Réponse trop longue.' });
    assert.equal(lire(reponse([bonne]) + ' '.repeat(100)).ok, true);
  });
  test('aucune piste valide : ok mais bouton « Créer » grisé (0 cochée) et message clair', () => {
    const r = lire(reponse([]));
    assert.deepEqual([r.ok, r.nombreCochees, r.message], [true, 0, 'Aucune piste valide dans cette réponse.']);
  });
  test('lire n’écrit rien : aucune écriture, résultat pur', () => {
    const r = lire(reponse([bonne]));
    assert.ok(!('ecritures' in r));
  });
});

describe('ajouter des pistes : un seul plan pour l’écran et pour les outils', () => {
  const ctx = (extra = {}) => ({ nouvelId: ids(), jour: '2026-11-13', lot: '2026-11-13-collage', ...extra });
  test('une écriture par piste (etat nouvelle, auteur claude, lot) + la date de traitement sur la source', () => {
    const plan = P.planAjouterPistes(site, [{ angle: 'Un', pilier: 'pedagogie' }, { angle: 'Deux' }], ctx());
    assert.equal(plan.creees, 2);
    assert.deepEqual(plan.ecritures.map((e) => [e.type, e.collection]), [['creer', 'reseauxsociaux_pistes'], ['creer', 'reseauxsociaux_pistes'], ['modifier', 'reseauxsociaux_inspirations']]);
    const d = plan.ecritures[0].donnees;
    assert.deepEqual([d.sourceId, d.sourceType, d.sourceTitre, d.etat, d.auteur, d.lot, d.ideeId, d.pilier], ['s1', 'site', 'Site fictif', 'nouvelle', 'claude', '2026-11-13-collage', null, 'pedagogie']);
    assert.deepEqual(plan.ecritures[0].horodater, ['creeLe', 'modifieLe']);
    assert.deepEqual([plan.ecritures[2].id, plan.ecritures[2].patch], ['s1', { traiteLe: '2026-11-13' }]);
    assert.deepEqual(plan.ecritures.slice(0, 2).map((e) => e.id), ['n1', 'n2']);
  });
  test('aucune écriture de suppression, jamais', () => {
    const plan = P.planAjouterPistes(site, [{ angle: 'Un' }], ctx());
    assert.ok(plan.ecritures.every((e) => e.type !== 'supprimer'));
  });
  test('un champ hors liste fermée n’est jamais écrit (texte, contenu, extrait, etat, ideeId, exempleId par le collage)', () => {
    const plan = P.planAjouterPistes(site, [{ angle: 'Un', texte: 'TIERS', contenu: 'C', extrait: 'E', etat: 'retenue', ideeId: 'i1', exempleId: 'e1', auteur: 'utilisateur' }], ctx());
    const d = plan.ecritures[0].donnees;
    assert.ok(!('texte' in d) && !('contenu' in d) && !('extrait' in d));
    assert.deepEqual([d.etat, d.ideeId, d.exempleId, d.auteur], ['nouvelle', null, null, 'claude']);
  });
  test('les outils peuvent lier la piste à un exemple (champs de l’outil), jamais le collage', () => {
    const plan = P.planAjouterPistes(profil, [{ angle: 'Un', exempleId: 'e1' }], ctx({ champsPermis: P.CHAMPS_OUTIL }));
    assert.equal(plan.ecritures[0].donnees.exempleId, 'e1');
    assert.equal(plan.ecritures[0].donnees.sourceType, 'profil');
  });
  test('auteur : « utilisateur » pour la saisie à la main', () => {
    assert.equal(P.planAjouterPistes(site, [{ angle: 'Un' }], ctx({ auteur: 'utilisateur', lot: 'main' })).ecritures[0].donnees.auteur, 'utilisateur');
  });
  test('doublons : ignorés par défaut (outils), acceptés quand l’écran le demande (case recochée)', () => {
    const stock = [piste('a', { angle: 'Un angle' })];
    const plan = P.planAjouterPistes(site, [{ angle: 'un ANGLE' }, { angle: 'Neuf' }], ctx({ pistesExistantes: stock }));
    assert.equal(plan.creees, 1);
    assert.deepEqual(plan.ignorees, [{ rang: 1, raison: 'déjà en stock' }]);
    assert.equal(P.planAjouterPistes(site, [{ angle: 'un ANGLE' }], ctx({ pistesExistantes: stock, accepterDoublons: true })).creees, 1);
    assert.throws(() => P.planAjouterPistes(site, [{ angle: 'un ANGLE' }], ctx({ pistesExistantes: stock })), I.ErreurClaire);
  });
  test('refusées : ignorées avec la raison ; aucune valide = erreur claire', () => {
    const plan = P.planAjouterPistes(site, [{ angle: '' }, { angle: 'ok' }, { angle: 'x'.repeat(201) }], ctx());
    assert.equal(plan.creees, 1);
    assert.deepEqual(plan.ignorees.map((i) => i.rang), [1, 3]);
    assert.throws(() => P.planAjouterPistes(site, [{ angle: '' }], ctx()), (e) => e instanceof I.ErreurClaire && /angle vide/.test(e.message));
    assert.throws(() => P.planAjouterPistes(site, [], ctx()), I.ErreurClaire);
    assert.throws(() => P.planAjouterPistes(site, 'une piste', ctx()), I.ErreurClaire);
  });
  test('30 pistes au plus par lot', () => {
    const trente = Array.from({ length: 30 }, (_, k) => ({ angle: `Angle ${k}` }));
    assert.equal(P.planAjouterPistes(site, trente, ctx()).creees, 30);
    assert.throws(() => P.planAjouterPistes(site, [...trente, { angle: 'Trente et une' }], ctx()), (e) => e instanceof I.ErreurClaire && /30/.test(e.message));
  });
  test('contexte incomplet : fabrique d’identifiants, source, jour', () => {
    assert.throws(() => P.planAjouterPistes(site, [{ angle: 'x' }], { jour: '2026-11-13' }), I.ErreurClaire);
    assert.throws(() => P.planAjouterPistes({}, [{ angle: 'x' }], ctx()), I.ErreurClaire);
    assert.throws(() => P.planAjouterPistes(site, [{ angle: 'x' }], ctx({ jour: 'hier' })), I.ErreurClaire);
  });
  test('résumé de veille venu de n8n sans fiche : la fiche source est créée au premier besoin', () => {
    const plan = P.planAjouterPistes({ id: P.idSourceVeille('c42'), type: 'veille', nom: 'Résumé n8n', veilleContenuId: 'c42' }, [{ angle: 'Un' }], ctx({ sourceExiste: false, ordre: 7 }));
    const e = plan.ecritures.at(-1);
    assert.deepEqual([e.type, e.collection, e.id, e.donnees.type, e.donnees.veilleContenuId, e.donnees.traiteLe, e.donnees.ordre], ['creer', 'reseauxsociaux_inspirations', 'veille-c42', 'veille', 'c42', '2026-11-13', 7]);
    assert.equal(plan.ecritures[0].donnees.sourceId, 'veille-c42');
  });
  test('fiche à créer : le nom est exigé, et le contenu de veille pour un résumé (sinon refus clair, rien d’écrit)', () => {
    const c = ctx({ sourceExiste: false, ordre: 1 });
    assert.throws(() => P.planAjouterPistes({ id: 'veille-c1', type: 'veille', veilleContenuId: 'c1' }, [{ angle: 'Un' }], c), (e) => e instanceof I.ErreurClaire && /nom/i.test(e.message));
    assert.throws(() => P.planAjouterPistes({ id: 'veille-c1', type: 'veille', nom: 'Résumé' }, [{ angle: 'Un' }], c), (e) => e instanceof I.ErreurClaire && /veilleContenuId/.test(e.message));
    assert.equal(P.planAjouterPistes({ id: 'x1', type: 'site', nom: 'Un site', url: 'https://site.test' }, [{ angle: 'Un' }], c).creees, 1); // un site n'a pas de contenu de veille
  });
});

describe('modifier, écarter, en faire une idée', () => {
  test('modifier : seuls les champs permis changent ; le reste est gardé', () => {
    const e = piste('p1', { angle: 'Avant', note: 'n', pilier: 'pedagogie', lot: 'L', auteur: 'claude', ideeId: 'i1', etat: 'retenue' });
    const ecr = P.planModifierPiste(e, { angle: 'Après', lot: 'AUTRE', ideeId: 'x', auteur: 'utilisateur', texte: 'T', sourceId: 'autre' }, { id: 'p1' }).ecritures[0];
    assert.deepEqual([ecr.type, ecr.collection, ecr.id, ecr.horodater], ['modifier', 'reseauxsociaux_pistes', 'p1', ['modifieLe']]);
    assert.deepEqual([ecr.patch.angle, ecr.patch.note, ecr.patch.pilier, ecr.patch.lot, ecr.patch.auteur, ecr.patch.ideeId, ecr.patch.sourceId, ecr.patch.etat], ['Après', 'n', 'pedagogie', 'L', 'claude', 'i1', 's1', 'retenue']);
    assert.ok(!('texte' in ecr.patch));
  });
  test('modifier : erreurs lisibles', () => {
    assert.throws(() => P.planModifierPiste(null, {}, { id: 'p1' }), I.ErreurClaire);
    assert.throws(() => P.planModifierPiste(piste('p1'), { etat: 'zzz' }, { id: 'p1' }), I.ErreurClaire);
    assert.throws(() => P.planModifierPiste(piste('p1'), { angle: '' }, { id: 'p1' }), I.ErreurClaire);
    assert.throws(() => P.planModifierPiste(piste('p1'), { angle: 'x' }, {}), I.ErreurClaire);
  });
  test('écarter : l’état passe à « ecartee », la piste reste (aucune suppression) ; elle peut revenir en stock', () => {
    const plan = P.planChangerEtatPiste(piste('p1'), 'ecartee', { id: 'p1' });
    assert.deepEqual([plan.ecritures.length, plan.ecritures[0].type, plan.ecritures[0].patch.etat, plan.ecritures[0].patch.angle], [1, 'modifier', 'ecartee', 'Angle p1']);
    assert.equal(P.planChangerEtatPiste(piste('p1', { etat: 'ecartee' }), 'nouvelle', { id: 'p1' }).ecritures[0].patch.etat, 'nouvelle');
  });
  test('en faire une idée : l’idée reprend angle, pilier, format, service et source ; les deux sont liées', () => {
    const p = piste('p1', { angle: 'Mon angle', ancre: 'Page tarifs', url: 'https://exemple.test/tarifs', pilier: 'cas_concrets', format: 'carrousel', service: 'finance' });
    const [creation, modif] = P.planEnFaireUneIdee(p, site, { ideeId: 'i1' }).ecritures;
    assert.deepEqual([creation.type, creation.collection, creation.id], ['creer', 'reseauxsociaux_idees', 'i1']);
    const d = creation.donnees;
    assert.deepEqual([d.angle, d.pilier, d.format, d.service, d.etat, d.pisteId, d.texte], ['Mon angle', 'cas_concrets', 'carrousel', 'finance', 'idee', 'p1', '']);
    assert.deepEqual([d.sources.length, d.sources[0].type, d.sources[0].titre, d.sources[0].url, d.sources[0].ancre, d.sources[0].extrait], [1, 'site', 'Site fictif', 'https://exemple.test/tarifs', 'Page tarifs', '']);
    assert.deepEqual([modif.type, modif.collection, modif.id, modif.patch], ['modifier', 'reseauxsociaux_pistes', 'p1', { etat: 'retenue', ideeId: 'i1' }]);
  });
  test('en faire une idée : type de source de l’idée selon la source (profil = inspiration, veille = veille avec le fichier résumé)', () => {
    const dp = P.planEnFaireUneIdee(piste('p1', { sourceId: 'p1' }), profil, { ideeId: 'i1' }).ecritures[0].donnees;
    assert.deepEqual([dp.sources[0].type, dp.sources[0].url], ['inspiration', 'https://www.linkedin.com/in/alice-exemple']);
    const dv = P.planEnFaireUneIdee(piste('p1', { sourceId: 'v1' }), veille, { ideeId: 'i1' }).ecritures[0].donnees;
    assert.deepEqual([dv.sources[0].type, dv.sources[0].resume], ['veille', '2026-11-10 Résumé fictif.md']);
  });
  test('en faire une idée : une piste déjà liée, absente ou sans identifiant d’idée est refusée', () => {
    assert.throws(() => P.planEnFaireUneIdee(piste('p1', { ideeId: 'i0' }), site, { ideeId: 'i1' }), (e) => e instanceof I.ErreurClaire && /déjà/.test(e.message));
    assert.throws(() => P.planEnFaireUneIdee(null, site, { ideeId: 'i1' }), I.ErreurClaire);
    assert.throws(() => P.planEnFaireUneIdee(piste('p1'), site, {}), I.ErreurClaire);
  });
  test('l’idée garde le champ pisteId (facultatif : absent = null)', () => {
    assert.equal(I.normaliserIdee({ angle: 'x', pisteId: ' p9 ' }).pisteId, 'p9');
    assert.equal(I.normaliserIdee({ angle: 'x' }).pisteId, null);
    const modif = I.planEnregistrerIdee({ angle: 'x', pisteId: 'p9', etat: 'idee' }, { angle: 'y' }, { id: 'i1' }).ecritures[0];
    assert.equal(modif.patch.pisteId, 'p9');
  });
});

describe('compteurs et état affiché : calculés, jamais stockés', () => {
  const idees = [{ id: 'i1', etat: 'dans_buffer' }, { id: 'i2', etat: 'en_redaction' }, { id: 'i3', etat: 'idee' }, { id: 'i4', etat: 'abandonnee' }];
  const pistes = [
    piste('a'), piste('b', { etat: 'retenue', ideeId: 'i1' }), piste('c', { etat: 'retenue', ideeId: 'i2' }), piste('d', { etat: 'retenue', ideeId: 'i3' }),
    piste('e', { etat: 'ecartee' }), piste('f', { sourceId: 'autre' }), piste('g', { etat: 'retenue', ideeId: 'i4' }),
  ];
  test('pistes, retenues et « postées » (l’idée liée est « Dans Buffer »)', () => {
    assert.deepEqual(P.compteursSource('s1', pistes, idees), { pistes: 6, retenues: 4, postees: 1 });
    assert.deepEqual(P.compteursSource('inconnue', pistes, idees), { pistes: 0, retenues: 0, postees: 0 });
    assert.deepEqual(P.compteursSource('s1', null, null), { pistes: 0, retenues: 0, postees: 0 });
  });
  test('si l’idée revient en arrière, le compteur « postées » redescend tout seul', () => {
    const avant = P.compteursSource('s1', pistes, idees).postees;
    const apres = P.compteursSource('s1', pistes, idees.map((i) => (i.id === 'i1' ? { ...i, etat: 'en_redaction' } : i))).postees;
    assert.deepEqual([avant, apres], [1, 0]);
  });
  test('état affiché : stock, retenue, rédaction, postée, écartée', () => {
    assert.deepEqual(pistes.slice(0, 7).map((p) => P.etatAffichePiste(p, idees)), ['stock', 'postee', 'redaction', 'retenue', 'ecartee', 'stock', 'retenue']);
    assert.equal(P.etatAffichePiste(piste('x', { etat: 'retenue', ideeId: 'disparue' }), idees), 'retenue');
    assert.equal(P.etatAffichePiste(piste('x', { etat: 'ecartee', ideeId: 'i1' }), idees), 'ecartee');
  });
});

describe('le prompt à copier', () => {
  test('seules les pistes de la source du prompt sont citées (celles d’une autre source sont ignorées)', () => {
    const t = P.construirePromptPistes({ source: site, pistesExistantes: [piste('a', { angle: 'Angle de ce site' }), piste('z', { sourceId: 'autre', angle: 'Angle d’une autre source' })] });
    assert.ok(t.includes('Angle de ce site'));
    assert.ok(!t.includes('Angle d’une autre source'));
  });
  const stock = [piste('a', { angle: 'Angle ancien', creeLe: '2026-11-01T10:00:00Z' }), piste('b', { angle: 'Angle récent', creeLe: '2026-11-05T10:00:00Z' })];
  test('contient la demande, la source, les règles, les champs fermés, les valeurs permises, les pistes en stock et le modèle', () => {
    const t = P.construirePromptPistes({ source: site, pistesExistantes: stock });
    assert.match(t, /entre 10 et 30 pistes de posts LinkedIn pour moi à partir/);
    assert.match(P.construirePromptPistes({ source: site, auteur: ' Alice Exemple ' }), /pour Alice Exemple à partir.*\n[\s\S]*un angle pour Alice Exemple/);
    for (const x of ['Site fictif', 'Site', 'https://exemple.test', 'Des cas clairs']) assert.ok(t.includes(x), x);
    assert.match(t, /Jamais de phrase recopiée/);
    assert.match(t, /UNIQUEMENT par le bloc JSON/);
    assert.match(t, /200 caractères au plus/);
    for (const c of ['- angle (obligatoire', '- note (', '- ancre (', '- url :', '- pilier, format, service :']) assert.ok(t.includes(c), c);
    assert.match(t, /liste fermée/);
    for (const liste of [R.PILIERS, R.FORMATS, R.SERVICES]) for (const x of liste) assert.ok(t.includes(`- ${x.id} : ${x.libelle}`), x.id);
    assert.ok(t.includes('Angle ancien') && t.includes('Angle récent'));
    assert.match(t, /Ne propose rien qui dise la même chose/);
    assert.ok(t.includes('"format": "pistes-v1"') && t.includes('"sourceId": "s1"'));
  });
  test('les valeurs permises viennent des listes du module, pas du texte écrit en dur', () => {
    const t = P.construirePromptPistes({ source: site });
    const permis = t.slice(t.indexOf('PILIERS PERMIS'), t.indexOf('PISTES DÉJÀ'));
    assert.equal([...permis.matchAll(/^- ([a-z_]+) : /gm)].length, R.PILIERS.length + R.FORMATS.length + R.SERVICES.length);
  });
  test('jamais le mot « extrait », jamais un champ texte ou contenu dans les champs permis', () => {
    for (const s of [site, profil, veille]) {
      const t = P.construirePromptPistes({ source: s, exemples: [{ accroche: 'A', extrait: 'TEXTE DU POST', texte: 'AUTRE TEXTE' }] });
      assert.ok(!/extrait|TEXTE DU POST|AUTRE TEXTE/i.test(t), s.type);
    }
  });
  test('le JSON du modèle est lisible, au format pistes-v1, et la réponse modèle (remplie) est lue par lireReponsePistes', () => {
    const t = P.construirePromptPistes({ source: site });
    const modele = JSON.parse(t.slice(t.indexOf('{', t.indexOf('MODÈLE DE RÉPONSE'))));
    assert.deepEqual([modele.format, modele.sourceId, Object.keys(modele.pistes[0])], ['pistes-v1', 's1', [...P.CHAMPS_REPONSE]]);
    const r = P.lireReponsePistes(t.slice(t.indexOf('MODÈLE DE RÉPONSE')), { source: site });
    assert.equal(r.ok, true);
    assert.deepEqual(r.lignes[0].remarques, ['lien retiré', 'pilier à choisir', 'format à choisir', 'service à choisir']); // les marques du modèle ne sont pas des valeurs permises
  });
  test('au plus 100 angles déjà en stock, les plus récents', () => {
    const beaucoup = Array.from({ length: 130 }, (_, k) => piste(`p${k}`, { angle: `Angle numéro ${k}`, creeLe: new Date(Date.UTC(2026, 10, 1, 0, k)).toISOString() }));
    const t = P.construirePromptPistes({ source: site, pistesExistantes: beaucoup });
    assert.equal([...t.matchAll(/^- Angle numéro /gm)].length, 100);
    assert.ok(t.includes('Angle numéro 129') && t.includes('Angle numéro 30') && !t.includes('Angle numéro 29\n'));
    assert.match(P.construirePromptPistes({ source: site }), /Aucune pour l’instant/);
  });
  test('source de veille : le titre du résumé, le nom exact du fichier, et le résumé comme seule porte d’entrée', () => {
    const t = P.construirePromptPistes({ source: veille });
    assert.ok(t.includes('Titre du résumé : Résumé fictif') && t.includes('Fichier résumé (nom exact) : 2026-11-10 Résumé fictif.md'));
    assert.match(t, /jamais le transcript/);
  });
  test('profil : le lien, les analyses déjà écrites (jamais le texte d’un post) et la moyenne', () => {
    const t = P.construirePromptPistes({ source: profil, exemples: [{ accroche: 'Chiffre en première ligne', structure: 'Histoire puis leçon', longueur: '1 200 caractères', pourquoi: 'Concret', extrait: 'TEXTE TIERS' }] });
    for (const x of ['https://www.linkedin.com/in/alice-exemple', 'Accroche : Chiffre en première ligne', 'Structure : Histoire puis leçon', 'Pourquoi ça marche : Concret', '40 réactions et 5 commentaires']) assert.ok(t.includes(x), x);
    assert.ok(!t.includes('TEXTE TIERS'));
  });
  test('profil sans analyse d’exemple : le prompt le dit et propose de faire d’abord le relevé', () => {
    const t = P.construirePromptPistes({ source: profil, exemples: [{}] });
    assert.match(t, /Aucune analyse de post n’est encore enregistrée/);
    assert.match(t, /faire le relevé/);
  });
  test('une source sans nom ni lien ne casse rien', () => {
    assert.match(P.construirePromptPistes({}), /cette source/);
    assert.match(P.construirePromptPistes(), /LES RÈGLES/);
  });
});
