// Volet « Idées » du module Réseaux sociaux (12/11/2026) : règles pures (passage de témoin, lien { reseau, outil, id }, états, filtres, tirage d'une contrainte), sans navigateur ni émulateur.
// Les parcours à l'écran sont dans tests/e2e/reseauxsociaux-idees.spec.js. Données fictives uniquement.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as R from '../js/modules/reseauxsociaux/logique.js';
import * as I from '../js/modules/reseauxsociaux/idees-logique.js';
import * as P from '../js/modules/reseauxsociaux/posts-logique.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const idee = (id, extra = {}) => ({ id, angle: `Angle ${id}`, sources: [], pilier: null, format: null, service: null, etat: 'idee', texte: '', lien: null, ...extra });
/** Source d'aléatoire fixe : rend les valeurs dans l'ordre, puis la dernière. */
const suite = (...valeurs) => { let i = 0; return () => valeurs[Math.min(i++, valeurs.length - 1)]; };

describe('tables du module', () => {
  test('les trois nouvelles tables sont dans la liste du module, nommées reseauxsociaux_<table>', () => {
    assert.deepEqual([R.COLLECTION_IDEES, R.COLLECTION_INSPIRATIONS, R.COLLECTION_EXEMPLES], ['reseauxsociaux_idees', 'reseauxsociaux_inspirations', 'reseauxsociaux_exemples']);
    for (const c of [R.COLLECTION_IDEES, R.COLLECTION_INSPIRATIONS, R.COLLECTION_EXEMPLES]) assert.ok(R.COLLECTIONS.includes(c), c);
  });
});

describe('une idée : champs et états', () => {
  test('quatre états, trois colonnes de Kanban (quatre au plus), les abandonnées hors colonnes', () => {
    assert.deepEqual(I.ETATS_IDEE.map((e) => e.id), ['idee', 'en_redaction', 'dans_buffer', 'abandonnee']);
    assert.deepEqual(I.COLONNES_IDEES, ['idee', 'en_redaction', 'dans_buffer']);
    assert.ok(I.COLONNES_IDEES.length <= 4);
  });
  test('une idée rangée a exactement les champs prévus ; pilier, format, service inconnus deviennent null ; un ancien pilier est converti', () => {
    const n = I.normaliserIdee({ angle: '  Un   angle  ', pilier: 'pme', format: 'inconnu', service: 'cuisine', etat: 'en_redaction', texte: 'Bonjour', extra: 1 });
    assert.deepEqual(Object.keys(n).sort(), ['angle', 'etat', 'format', 'lien', 'pilier', 'pisteId', 'service', 'sources', 'texte']);
    assert.equal(n.angle, 'Un angle');
    assert.deepEqual([n.pilier, n.format, n.service], ['cas_concrets', null, null]);
    assert.equal(I.normaliserIdee({ angle: 'x', etat: 'nimporte' }).etat, 'idee');
  });
  test('une source riche : titre, adresse avec ancre, section, extrait, date de consultation, copie archivée, résumé de la veille et mots-clés', () => {
    const n = I.normaliserSourceUnique({ type: 'veille', titre: ' Un   titre ', url: 'exemple.test/page#section-2', ancre: 'Section 2', extrait: '  Les mots   de la source ', consulteLe: '2026-11-10', archive: 'https://archive.exemple.test/copie', resume: ' 2026-11-10 Résumé fictif.md ', motsCles: 'agents, factures', extra: 1 });
    assert.deepEqual(n, { type: 'veille', titre: 'Un titre', url: 'https://exemple.test/page#section-2', ancre: 'Section 2', extrait: 'Les mots de la source', consulteLe: '2026-11-10', archive: 'https://archive.exemple.test/copie', resume: '2026-11-10 Résumé fictif.md', motsCles: 'agents, factures' });
  });
  test('une source de type « site » garde la page d’origine et la date de consultation ; résumé et mots-clés ne servent qu’à la veille', () => {
    const n = I.normaliserSourceUnique({ type: 'site', titre: 'Page d’un concurrent', url: 'https://exemple.test/offre', consulteLe: '2026-11-12', resume: 'x', motsCles: 'y' });
    assert.deepEqual([n.type, n.url, n.consulteLe, n.resume, n.motsCles], ['site', 'https://exemple.test/offre', '2026-11-12', '', '']);
  });
  test('sans extrait : la source reste valable (extrait vide, jamais inventé) ; l’extrait est coupé à 400 caractères et refusé au-delà à la validation', () => {
    assert.equal(I.normaliserSourceUnique({ type: 'site', titre: 'T', url: 'https://exemple.test' }).extrait, '');
    assert.equal(I.normaliserSourceUnique({ type: 'site', titre: 'T', extrait: 'x'.repeat(900) }).extrait.length, I.MAX_EXTRAIT);
    assert.equal(I.validerSources([{ type: 'site', extrait: 'x'.repeat(400) }]), null);
    assert.match(I.validerSources([{ type: 'site', extrait: 'x'.repeat(401) }]), /400/);
  });
  test('plusieurs sources : toutes gardées dans l’ordre, les sources vides retirées, aucune source = idée libre', () => {
    const n = I.normaliserIdee({ angle: 'a', sources: [{ type: 'site', titre: 'A' }, { type: 'libre' }, { type: 'veille', resume: 'f.md' }, { type: 'inspiration', titre: 'Alice Exemple' }] });
    assert.deepEqual(n.sources.map((s) => [s.type, s.titre || s.resume]), [['site', 'A'], ['veille', 'f.md'], ['inspiration', 'Alice Exemple']]);
    assert.deepEqual(I.normaliserIdee({ angle: 'a' }).sources, []);
    assert.deepEqual(I.typesSources({}), ['libre']);
    assert.deepEqual(I.typesSources(n), ['site', 'veille', 'inspiration']);
    assert.equal(I.normaliserSources(Array.from({ length: 25 }, (_, k) => ({ type: 'site', titre: `S${k}` }))).length, I.MAX_SOURCES);
  });
  test('lien sûr : seules les adresses https sont gardées (javascript:, data:, http:, identifiants dans l’adresse refusés)', () => {
    for (const mauvaise of ['javascript:alert(1)', 'data:text/html,x', 'http://exemple.test', 'https://u:p@exemple.test', 'ftp://exemple.test', 'https://localhost', 'a b', '']) assert.equal(I.normaliserUrlWeb(mauvaise), '', mauvaise);
    assert.equal(I.normaliserUrlWeb('exemple.test/a'), 'https://exemple.test/a');
    assert.match(I.validerSources([{ type: 'site', url: 'javascript:alert(1)' }]), /adresse/);
    assert.match(I.validerSources([{ type: 'site', archive: 'http://exemple.test' }]), /archivée/);
    assert.match(I.validerSources([{ type: 'site', consulteLe: '2026-02-30' }]), /date/);
    assert.equal(I.normaliserSourceUnique({ type: 'site', titre: 'x', url: 'javascript:alert(1)' }).url, '');
  });
  test('libellé d’une source : « Veille : fichier », « Site : titre », « Inspiration »', () => {
    assert.equal(I.libelleSourceIdee({ type: 'veille', resume: 'fichier.md' }), 'Veille : fichier.md');
    assert.equal(I.libelleSourceIdee({ type: 'site', titre: 'Page' }), 'Site : Page');
    assert.equal(I.libelleSourceIdee({ type: 'inspiration' }), 'Inspiration');
  });
  test('validation : l’angle est obligatoire et court ; le texte ne dépasse pas la limite de LinkedIn', () => {
    assert.match(I.validerIdee({ angle: '   ' }), /angle/);
    assert.match(I.validerIdee({ angle: 'x'.repeat(I.MAX_ANGLE + 1) }), /angle/);
    assert.equal(I.validerIdee({ angle: 'ok', etat: 'en_redaction', texte: 'x'.repeat(R.LIMITE_LINKEDIN) }), null);
    assert.match(I.validerIdee({ angle: 'ok', etat: 'en_redaction', texte: 'x'.repeat(R.LIMITE_LINKEDIN + 1) }), /limite/);
  });
});

describe('passage de témoin : le texte n’a qu’un propriétaire', () => {
  test('en rédaction, le texte vit dans l’idée (fins de ligne normalisées)', () => {
    assert.equal(I.normaliserIdee({ angle: 'a', etat: 'en_redaction', texte: 'Ligne 1\r\nLigne 2' }).texte, 'Ligne 1\nLigne 2');
  });
  test('à l’état « dans_buffer », le texte est TOUJOURS effacé, même s’il est fourni', () => {
    assert.equal(I.normaliserIdee({ angle: 'a', etat: 'dans_buffer', texte: 'Un texte qui ne doit pas rester' }).texte, '');
  });
  test('passer une idée en rédaction vers « dans_buffer » : l’écriture planifiée a un texte vide et garde le reste', () => {
    const existante = idee('i1', { etat: 'en_redaction', texte: 'Mon brouillon', pilier: 'pedagogie', format: 'texte' });
    const plan = I.planChangerEtatIdee(existante, 'dans_buffer', { id: 'i1' });
    assert.equal(plan.ecritures.length, 1);
    const e = plan.ecritures[0];
    assert.deepEqual([e.type, e.collection, e.id], ['modifier', 'reseauxsociaux_idees', 'i1']);
    assert.equal(e.patch.texte, '');
    assert.equal(e.patch.etat, 'dans_buffer');
    assert.deepEqual([e.patch.pilier, e.patch.format], ['pedagogie', 'texte']);
    assert.deepEqual(e.horodater, ['modifieLe']);
  });
  test('l’écran demande confirmation seulement quand un texte serait effacé', () => {
    assert.equal(I.effaceraLeTexte({ etat: 'en_redaction', texte: 'Un brouillon' }, 'dans_buffer'), true);
    assert.equal(I.effaceraLeTexte({ etat: 'en_redaction', texte: '   ' }, 'dans_buffer'), false);
    assert.equal(I.effaceraLeTexte({ etat: 'idee', texte: '' }, 'dans_buffer'), false);
    assert.equal(I.effaceraLeTexte({ etat: 'dans_buffer', texte: '' }, 'dans_buffer'), false);
    assert.equal(I.effaceraLeTexte({ etat: 'en_redaction', texte: 'Un brouillon' }, 'abandonnee'), false);
  });
  test('décision prise seule : une idée remise à « Idée » ou abandonnée garde son brouillon ; seul le passage dans Buffer l’efface', () => {
    assert.equal(I.normaliserIdee({ angle: 'a', etat: 'abandonnee', texte: 'Brouillon' }).texte, 'Brouillon');
    assert.equal(I.normaliserIdee({ angle: 'a', etat: 'idee', texte: 'Brouillon' }).texte, 'Brouillon');
  });
  test('où se trouve le texte : « Pas encore écrit », « Dans le module », « Dans Buffer »', () => {
    assert.deepEqual(I.ouEstLeTexte(idee('a')), { lieu: 'aucun', libelle: 'Pas encore écrit' });
    assert.deepEqual(I.ouEstLeTexte(idee('b', { etat: 'en_redaction', texte: 'Du texte' })), { lieu: 'module', libelle: 'Dans le module' });
    assert.deepEqual(I.ouEstLeTexte(idee('c', { etat: 'en_redaction', texte: '' })), { lieu: 'aucun', libelle: 'Pas encore écrit' });
    assert.deepEqual(I.ouEstLeTexte(idee('d', { etat: 'dans_buffer' })), { lieu: 'buffer', libelle: 'Dans Buffer' });
  });
  test('aucun appel à Buffer ni aucun serveur dans les fichiers du volet Idées (écriture seulement dans le journal commun)', () => {
    for (const f of ['idees-logique', 'inspirations-logique', 'idees-actions', 'idees-ecran', 'inspirations-ecran']) {
      const t = lire(`js/modules/reseauxsociaux/${f}.js`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      assert.doesNotMatch(t, /httpsCallable|reseauxsociauxBuffer|fetch\(|setDoc|addDoc|updateDoc|deleteDoc/, f);
      assert.doesNotMatch(t, /identifiantBuffer|idBuffer/, `${f} : le lien se dit { reseau, outil, id }, jamais un champ « identifiantBuffer »`);
    }
    assert.match(lire('js/modules/reseauxsociaux/idees-actions.js'), /executer\(/);
  });
});

describe('le lien idée -> post : { reseau, outil, id }', () => {
  test('forme exacte { reseau, outil, id } ; valeurs par défaut linkedin et buffer', () => {
    assert.deepEqual(I.creerLien({ id: 'post-fictif-1' }), { reseau: 'linkedin', outil: 'buffer', id: 'post-fictif-1' });
    assert.deepEqual(Object.keys(I.creerLien({ id: 'x' })), ['reseau', 'outil', 'id']);
  });
  test('un autre réseau et un autre outil sont possibles ; sans identifiant, pas de lien', () => {
    assert.deepEqual(I.normaliserLien({ reseau: 'Instagram', outil: 'Planoly', id: ' abc ' }), { reseau: 'instagram', outil: 'planoly', id: 'abc' });
    assert.equal(I.creerLien({ id: '  ' }), null);
    assert.equal(I.normaliserLien(null), null);
    assert.equal(I.normaliserLien({ reseau: 'linkedin', id: 'x' }), null);
    assert.equal(I.normaliserLien('texte'), null);
  });
  test('le lien est écrit dans l’idée sous cette forme', () => {
    const plan = I.planChangerEtatIdee(idee('i1', { etat: 'en_redaction', texte: 'x' }), 'dans_buffer', { id: 'i1' }, { lien: I.creerLien({ id: 'post-fictif-1' }) });
    assert.deepEqual(plan.ecritures[0].patch.lien, { reseau: 'linkedin', outil: 'buffer', id: 'post-fictif-1' });
  });
});

describe('plans d’écriture (journal commun)', () => {
  test('création : un document daté de création et de modification, valeurs rangées', () => {
    const plan = I.planEnregistrerIdee(null, { angle: 'Une idée', pilier: 'actu_ia', format: 'carrousel', service: 'finance' }, { id: 'n1' });
    const e = plan.ecritures[0];
    assert.deepEqual([e.type, e.collection, e.id], ['creer', 'reseauxsociaux_idees', 'n1']);
    assert.deepEqual(e.horodater, ['creeLe', 'modifieLe']);
    assert.deepEqual([e.donnees.etat, e.donnees.texte, e.donnees.lien], ['idee', '', null]);
  });
  test('modification : seule la date de modification est posée ; un champ non fourni reste celui de l’idée', () => {
    const plan = I.planEnregistrerIdee(idee('i1', { pilier: 'pedagogie' }), { angle: 'Nouvel angle' }, { id: 'i1' });
    const e = plan.ecritures[0];
    assert.equal(e.type, 'modifier');
    assert.deepEqual(e.horodater, ['modifieLe']);
    assert.deepEqual([e.patch.angle, e.patch.pilier], ['Nouvel angle', 'pedagogie']);
  });
  test('refus lisibles : angle vide, état inconnu, idée absente, identifiant manquant', () => {
    assert.throws(() => I.planEnregistrerIdee(null, { angle: '' }, { id: 'n1' }), (e) => e instanceof I.ErreurClaire && /angle/.test(e.message));
    assert.throws(() => I.planChangerEtatIdee(idee('a'), 'inconnu', { id: 'a' }), I.ErreurClaire);
    assert.throws(() => I.planChangerEtatIdee(null, 'idee', { id: 'a' }), I.ErreurClaire);
    assert.throws(() => I.planEnregistrerIdee(null, { angle: 'x' }, {}), I.ErreurClaire);
  });
  test('abandonner : l’état passe à « abandonnee », le reste est gardé', () => {
    const plan = I.planChangerEtatIdee(idee('i1', { angle: 'Garde-moi', etat: 'en_redaction', texte: 'Brouillon' }), 'abandonnee', { id: 'i1' });
    assert.deepEqual([plan.ecritures[0].patch.etat, plan.ecritures[0].patch.angle, plan.ecritures[0].patch.texte], ['abandonnee', 'Garde-moi', 'Brouillon']);
  });
  test('libellés du Journal : les trois tables sont nommées', async () => {
    const { LIBELLES_JOURNAL } = await import('../js/modules/reseauxsociaux/libelles-journal.js');
    for (const c of R.COLLECTIONS) assert.ok(Array.isArray(LIBELLES_JOURNAL[c]) && LIBELLES_JOURNAL[c].length === 2, c);
  });
});

describe('colonnes et filtres', () => {
  const liste = [
    idee('a', { etat: 'idee', pilier: 'cas_concrets', format: 'texte', service: 'finance', modifieLe: '2026-11-01T10:00:00Z' }),
    idee('b', { etat: 'idee', pilier: 'pedagogie', sources: [{ type: 'veille', resume: 'veille-ia.md' }], modifieLe: '2026-11-05T10:00:00Z' }),
    idee('c', { etat: 'en_redaction', angle: 'Les Factures à relancer', modifieLe: '2026-11-03T10:00:00Z' }),
    idee('d', { etat: 'dans_buffer' }),
    idee('e', { etat: 'abandonnee', angle: 'Vieille idée' }),
  ];
  test('trois colonnes, la plus récemment modifiée en haut ; les abandonnées n’y sont pas', () => {
    const c = I.colonnesIdees(I.filtrerIdees(liste, I.criteresIdees()));
    assert.deepEqual(Object.keys(c), ['idee', 'en_redaction', 'dans_buffer']);
    assert.deepEqual(c.idee.map((i) => i.id), ['b', 'a']);
    assert.deepEqual([c.en_redaction.map((i) => i.id), c.dans_buffer.map((i) => i.id)], [['c'], ['d']]);
  });
  test('le filtre « Abandonnées » les retrouve dans une colonne à part', () => {
    const c = I.colonnesIdees(I.filtrerIdees(liste, { abandonnees: true }), { abandonnees: true });
    assert.deepEqual(Object.keys(c), ['abandonnee']);
    assert.deepEqual(c.abandonnee.map((i) => i.id), ['e']);
  });
  test('filtres combinés : « ou » dans un groupe, « et » entre groupes, recherche sans accent ni majuscule', () => {
    assert.deepEqual(I.filtrerIdees(liste, { piliers: ['cas_concrets', 'pedagogie'] }).map((i) => i.id), ['a', 'b']);
    assert.deepEqual(I.filtrerIdees(liste, { piliers: ['cas_concrets', 'pedagogie'], sources: ['veille'] }).map((i) => i.id), ['b']);
    assert.deepEqual(I.filtrerIdees(liste, { services: ['finance'] }).map((i) => i.id), ['a']);
    assert.deepEqual(I.filtrerIdees(liste, { recherche: 'FACTURES a relancer' }).map((i) => i.id), ['c']);
    assert.equal(I.nombreFiltresIdees({ piliers: ['a'], abandonnees: true, recherche: 'x' }), 2);
  });
});

describe('tirage d’une contrainte pilier × format × service (aléa injecté)', () => {
  const SUGGESTIONS = [{ pilier: 'cas_concrets', format: 'video' }, { pilier: 'pedagogie', format: 'carrousel' }, { pilier: 'actu_ia', format: 'texte' }];
  test('même source d’aléatoire = même tirage ; pilier × format pris parmi les suggestions de la matrice', () => {
    const a = I.tirerContrainte(suite(0, 0), { suggestions: SUGGESTIONS });
    const b = I.tirerContrainte(suite(0, 0), { suggestions: SUGGESTIONS });
    assert.deepEqual(a, b);
    assert.deepEqual([a.pilier, a.format, a.origine], ['cas_concrets', 'video', 'suggestion']);
    assert.deepEqual(I.tirerContrainte(suite(0.5, 0), { suggestions: SUGGESTIONS }), { pilier: 'pedagogie', format: 'carrousel', service: 'administratif_rh', origine: 'suggestion' });
    assert.deepEqual(I.tirerContrainte(suite(0.99, 0), { suggestions: SUGGESTIONS }), { pilier: 'actu_ia', format: 'texte', service: 'administratif_rh', origine: 'suggestion' });
  });
  test('les bornes de l’aléa (0 et presque 1, et même hors bornes) donnent toujours une case et un service connus', () => {
    for (const x of [0, 0.999999, 1, 5, -1]) {
      const c = I.tirerContrainte(() => x, { suggestions: SUGGESTIONS });
      assert.ok(R.PILIERS.some((p) => p.id === c.pilier) && R.FORMATS.some((f) => f.id === c.format) && R.SERVICES.some((s) => s.id === c.service), String(x));
    }
  });
  test('sans suggestion (aucun post connu), le tirage porte sur toutes les cases pilier × format', () => {
    const premiere = I.tirerContrainte(suite(0, 0));
    const derniere = I.tirerContrainte(suite(0.999, 0));
    assert.deepEqual([premiere.pilier, premiere.format, premiere.origine], ['cas_concrets', 'texte', 'toutes']);
    assert.deepEqual([derniere.pilier, derniere.format], ['demarche_offre', 'video']);
    assert.equal(R.PILIERS.length * R.FORMATS.length, 20);
  });
  test('une suggestion inconnue est ignorée', () => {
    assert.equal(I.tirerContrainte(suite(0, 0), { suggestions: [{ pilier: 'x', format: 'y' }] }).origine, 'toutes');
  });
  test('la source d’aléatoire est obligatoire', () => {
    assert.throws(() => I.tirerContrainte(undefined, { suggestions: SUGGESTIONS }), /aléatoire/);
  });
  test('service : usage compté dans les posts classés et les idées non abandonnées', () => {
    const compte = I.compterServices(
      [{ services: ['finance', 'production'] }, { services: ['finance'] }, { services: [] }, { services: ['cuisine'] }],
      [idee('a', { service: 'commercial' }), idee('b', { service: 'finance', etat: 'abandonnee' }), idee('c', { service: null })]);
    assert.deepEqual(compte, { administratif_rh: 0, finance: 2, production: 1, commercial: 1, direction: 0 });
  });
  test('service : le moins utilisé pèse le plus, aucun poids nul', () => {
    const poids = Object.fromEntries(I.poidsServices({ administratif_rh: 0, finance: 4, production: 1, commercial: 4, direction: 2 }).map((p) => [p.id, p.poids]));
    assert.deepEqual(poids, { administratif_rh: 5, finance: 1, production: 4, commercial: 1, direction: 3 });
  });
  test('service : avec l’aléa fixe, le tirage favorise le service le moins utilisé', () => {
    const classements = [{ services: ['administratif_rh', 'finance', 'production', 'commercial'] }, { services: ['administratif_rh', 'finance', 'production', 'commercial'] }]; // direction jamais utilisé
    const compte = { administratif_rh: 2, finance: 2, production: 2, commercial: 2, direction: 0 };
    const poids = I.poidsServices(compte); // 1, 1, 1, 1, 3 -> total 7 ; direction occupe [4, 7[
    assert.equal(poids.reduce((t, p) => t + p.poids, 0), 7);
    assert.equal(I.tirerContrainte(suite(0, 0.6), { suggestions: SUGGESTIONS, classements }).service, 'direction'); // 0,6 × 7 = 4,2
    assert.equal(I.tirerContrainte(suite(0, 0.99), { suggestions: SUGGESTIONS, classements }).service, 'direction');
    assert.equal(I.tirerContrainte(suite(0, 0.1), { suggestions: SUGGESTIONS, classements }).service, 'administratif_rh');
    // sur 100 tirages régulièrement répartis, le service jamais utilisé sort le plus souvent
    const sorties = {};
    for (let k = 0; k < 100; k++) { const s = I.tirerContrainte(suite(0, k / 100), { suggestions: SUGGESTIONS, classements }).service; sorties[s] = (sorties[s] || 0) + 1; }
    assert.ok(sorties.direction > sorties.finance && sorties.direction > sorties.production, JSON.stringify(sorties));
    assert.equal(Object.keys(sorties).length, 5, 'tous les services restent possibles');
  });
  test('le pilier × format vient bien des suggestions de la matrice de posts-logique.js', () => {
    const posts = [
      { id: 'p1', statut: 'publie', publieLe: '2026-11-03T05:08:00Z', classement: { pilier: 'pedagogie', format: 'texte', services: [] } },
      { id: 'p2', statut: 'publie', publieLe: '2026-11-04T05:08:00Z', classement: { pilier: 'pedagogie', format: 'texte', services: [] } },
    ];
    const suggestions = P.matrice(posts).suggestions;
    assert.equal(suggestions.length, P.NB_SUGGESTIONS);
    const c = I.tirerContrainte(suite(0.3, 0.5), { suggestions });
    assert.ok(suggestions.some((s) => s.pilier === c.pilier && s.format === c.format));
  });
  test('libellé : « Cas concrets × Vidéo 9:16 × Production »', () => {
    assert.equal(I.libelleContrainte({ pilier: 'cas_concrets', format: 'video', service: 'production' }), 'Cas concrets × Vidéo 9:16 × Production');
  });
});
