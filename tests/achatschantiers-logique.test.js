// Module Achats « Chantiers » (24/11/2026, PR 6) : tests de la logique pure, des favoris, de l'export CSV et de la couche de données (faux réseau, aucun appel réel).
// La logique est recopiée de l'appli d'origine : ces cas sont le filet du portage (mêmes règles, mêmes messages).
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { expect, espion } from './_expect-achatschantiers.js';
import * as L from '../js/modules/achatschantiers/logique.js';
import * as F from '../js/modules/achatschantiers/favoris.js';
import * as C from '../js/modules/achatschantiers/export-csv.js';
import { creerDonnees, COLONNES_CHANTIERS, TABLE_CHANTIERS, VUE_CHIFFRES } from '../js/modules/achatschantiers/donnees.js';

const ch = (o = {}) => ({ id: 'c1', nom: 'Villa Dupont', code: 'CH-1', client: 'Dupont', statut: 'en_cours', archive: false, adresse: '12 rue des Lilas, 83560 Vinon-sur-Verdon', budget_ht: 12500.5, date_debut: '2026-03-01', date_fin_prevue: '2026-09-30', date_fin_reelle: null, ...o });
const champs = (o = {}) => ({ ...L.CHAMPS_VIDES, ...o });

describe('formats', () => {
  test('normaliser : sans accents, sans casse, ligatures', () => {
    expect(L.normaliser('Électro Cœur')).toBe('electro coeur');
    expect(L.normaliser(null)).toBe('');
  });
  test('dateFr : une date sans heure n’est jamais décalée', () => {
    expect(L.dateFr('2026-03-01')).toBe('01/03/2026');
    expect(L.dateFr(null)).toBe('—');
  });
  test('euros : vide = tiret', () => {
    expect(L.euros(null)).toBe('—');
    expect(L.euros(100)).toMatch(/100,00/);
  });
  test('dateJourFichier : heure de Paris', () => {
    expect(L.dateJourFichier(new Date('2026-11-24T23:30:00Z'))).toBe('2026-11-25');
  });
});

describe('ville et libellé', () => {
  test('ville après le code postal', () => {
    expect(L.villeChantier('12 rue des Lilas, 83560 Vinon-sur-Verdon')).toBe('Vinon-sur-Verdon');
    expect(L.villeChantier('83560 Vinon Cedex 03')).toBe('Vinon');
  });
  test('sans code postal : dernier segment après une virgule, sauf s’il porte un chiffre', () => {
    expect(L.villeChantier('Quartier des Pins, Manosque')).toBe('Manosque');
    expect(L.villeChantier('Quartier des Pins, lot 4')).toBeNull();
    expect(L.villeChantier('Manosque')).toBeNull();
    expect(L.villeChantier(null)).toBeNull();
  });
  test('bâtiment, lot, zone, France ne sont pas une ville', () => {
    expect(L.villeChantier('rue X, Bât B')).toBeNull();
    expect(L.villeChantier('rue X, France')).toBeNull();
  });
  test('libelleChantier : « Nom · Ville » sauf si le nom contient déjà la ville', () => {
    expect(L.libelleChantier(ch())).toBe('Villa Dupont · Vinon-sur-Verdon');
    expect(L.libelleChantier(ch({ nom: 'Villa Vinon-sur-Verdon' }))).toBe('Villa Vinon-sur-Verdon');
    expect(L.libelleChantier(ch({ adresse: null }))).toBe('Villa Dupont');
  });
});

describe('formulaire', () => {
  test('lireBudget', () => {
    expect(L.lireBudget('')).toBeNull();
    expect(L.lireBudget('12 500,50')).toBe(12500.5);
    expect(L.lireBudget('12500.5')).toBe(12500.5);
    expect(Number.isNaN(L.lireBudget('abc'))).toBe(true);
    expect(Number.isNaN(L.lireBudget('-5'))).toBe(true);
    expect(Number.isNaN(L.lireBudget('1,234'))).toBe(true);
  });
  test('verifierChantier : messages', () => {
    expect(L.verifierChantier(champs(), true)).toBe('Le nom du chantier est obligatoire.');
    expect(L.verifierChantier(champs({ nom: 'A' }), true)).toBeNull();
    expect(L.verifierChantier(champs({ nom: 'A' }), false)).toBe('Le code du chantier ne peut pas être vide.');
    expect(L.verifierChantier(champs({ nom: 'x'.repeat(201) }), true)).toMatch(/trop long/);
    expect(L.verifierChantier(champs({ nom: 'A', budget_ht: 'zz' }), true)).toMatch(/budget/);
    expect(L.verifierChantier(champs({ nom: 'A', statut: 'nimporte' }), true)).toBe('Choisis le statut du chantier.');
    expect(L.verifierChantier(champs({ nom: 'A', date_debut: '2026-02-30' }), true)).toMatch(/début/);
    expect(L.verifierChantier(champs({ nom: 'A', date_fin_prevue: '2026-13-01' }), true)).toMatch(/fin prévue/);
    expect(L.verifierChantier(champs({ nom: 'A', date_debut: '2028-02-29' }), true)).toBeNull();
  });
  test('corpsCreationChantier : seulement les champs remplis, jamais date_fin_reelle', () => {
    expect(L.corpsCreationChantier(champs({ nom: ' A ' }))).toEqual({ nom: 'A', statut: 'en_preparation' });
    expect(L.corpsCreationChantier(champs({ nom: 'A', code: 'X', budget_ht: '10,5', date_debut: '2026-01-02' }))).toEqual({ nom: 'A', statut: 'en_preparation', code: 'X', budget_ht: 10.5, date_debut: '2026-01-02' });
  });
  test('champsDepuis puis champsModifies : rien changé = objet vide', () => {
    const c = ch();
    expect(L.champsModifies(c, L.champsDepuis(c))).toEqual({});
  });
  test('champsModifies : seulement ce qui change, vidés = null, budget vidé = 0', () => {
    const c = ch();
    const f = L.champsDepuis(c);
    expect(L.champsModifies(c, { ...f, nom: 'Autre' })).toEqual({ nom: 'Autre' });
    expect(L.champsModifies(c, { ...f, client: '', adresse: '', date_debut: '' })).toEqual({ client: null, adresse: null, date_debut: null });
    expect(L.champsModifies(c, { ...f, budget_ht: '' })).toEqual({ budget_ht: 0 });
    expect(L.champsModifies(c, { ...f, statut: 'termine' })).toEqual({ statut: 'termine' });
  });
});

describe('vues, regroupement, totaux', () => {
  const liste = [ch({ id: 'a', nom: 'Zèbre' }), ch({ id: 'b', nom: 'alpha', archive: true }), ch({ id: 'c', nom: 'Beta', statut: 'termine', budget_ht: 0 })];
  test('chantiersAffiches : archives ou non, recherche sans accents, tri par nom', () => {
    expect(L.chantiersAffiches(liste, false, '').map((c) => c.id)).toEqual(['c', 'a']);
    expect(L.chantiersAffiches(liste, true, '').map((c) => c.id)).toEqual(['b']);
    expect(L.chantiersAffiches(liste, false, 'zebre').map((c) => c.id)).toEqual(['a']);
  });
  test('lireVueChantiers : seul « liste » se retient', () => {
    expect(L.lireVueChantiers('liste')).toBe('liste');
    expect(L.lireVueChantiers('archives')).toBe('kanban');
    expect(L.lireVueChantiers(null)).toBe('kanban');
  });
  test('chantiersDeVue et regrouperParStatut : quatre colonnes, archivés exclus', () => {
    expect(L.chantiersDeVue(liste, 'archives').length).toBe(1);
    expect(L.chantiersDeVue(liste, 'kanban').length).toBe(2);
    const g = L.regrouperParStatut(liste);
    expect(Object.keys(g)).toEqual(['en_preparation', 'en_cours', 'termine', 'suspendu']);
    expect(g.en_cours.map((c) => c.id)).toEqual(['a']);
    expect(g.suspendu).toEqual([]);
  });
  test('totalBudget : arrondi, 0 ne compte pas, aucun = null', () => {
    expect(L.totalBudget([ch({ budget_ht: 0.1 }), ch({ budget_ht: 0.2 })])).toBe(0.3);
    expect(L.totalBudget([ch({ budget_ht: 0 }), ch({ budget_ht: null })])).toBeNull();
  });
  test('texteTeteColonne', () => {
    expect(L.texteTeteColonne(0, null)).toBe('0 chantier · —');
    expect(L.texteTeteColonne(2, 100)).toMatch(/^2 chantiers · 100,00/);
  });
  test('compteur et actions du menu', () => {
    expect(L.texteCompteurChantiers(13, 13, false)).toBe('13 chantiers');
    expect(L.texteCompteurChantiers(13, 2, false)).toBe('2 sur 13 chantiers');
    expect(L.texteCompteurChantiers(2, 2, true)).toBe('2 chantiers archivés');
    expect(L.texteCompteurChantiers(1, 1, true)).toBe('1 chantier archivé');
    expect(L.actionsChantier(ch())).toEqual(['modifier', 'archiver']);
    expect(L.actionsChantier(ch({ archive: true }))).toEqual(['desarchiver']);
    expect(L.actionArchivageChantier(ch())).toEqual({ libelle: 'Archiver', archive: true });
    expect(L.actionArchivageChantier(ch({ archive: true }))).toEqual({ libelle: 'Désarchiver', archive: false });
  });
});

describe('filtres et tri', () => {
  const liste = [ch({ id: 'a', nom: 'B', client: 'Martin', statut: 'termine' }), ch({ id: 'b', nom: 'A', client: null, statut: 'en_cours' }), ch({ id: 'c', nom: 'C', client: 'Martin', statut: 'en_cours' })];
  test('filtrerChantiers : statut, client, recherche', () => {
    expect(L.filtrerChantiers(liste, { recherche: '', statuts: ['en_cours'], client: '' }).map((c) => c.id)).toEqual(['b', 'c']);
    expect(L.filtrerChantiers(liste, { recherche: '', statuts: [], client: 'mart' }).map((c) => c.id)).toEqual(['a', 'c']);
    expect(L.filtrerChantiers(liste, { recherche: 'A', statuts: [], client: '' }).length).toBeTruthy();
  });
  test('compte de filtres, pastilles, retrait', () => {
    const c = { recherche: '', statuts: ['termine'], client: 'Martin' };
    expect(L.nombreFiltresChantiers(c)).toBe(2);
    expect(L.criteresChantiersActifs(L.CRITERES_CHANTIERS_VIDES)).toBe(false);
    expect(L.criteresChantiersActifs({ ...L.CRITERES_CHANTIERS_VIDES, recherche: 'x' })).toBe(true);
    const p = L.pastillesChantiers(c);
    expect(p.map((x) => x.libelle)).toEqual(['Statut : Terminé', 'Client : Martin']);
    expect(L.retirerCritereChantier(c, p[0])).toEqual({ recherche: '', statuts: [], client: 'Martin' });
    expect(L.retirerCritereChantier(c, p[1])).toEqual({ recherche: '', statuts: ['termine'], client: '' });
  });
  test('lireTriChantiers', () => {
    expect(L.lireTriChantiers('budget:desc')).toEqual({ critere: 'budget', sens: 'desc' });
    expect(L.lireTriChantiers('zzz:asc')).toEqual(L.TRI_CHANTIERS_DEFAUT);
    expect(L.lireTriChantiers(null)).toEqual(L.TRI_CHANTIERS_DEFAUT);
    expect(L.lireTriChantiers('nom:bof')).toEqual(L.TRI_CHANTIERS_DEFAUT);
  });
  test('trierChantiers : nom, statut dans l’ordre métier, code avec nombres, vides en dernier dans les deux sens', () => {
    const ids = (l) => l.map((c) => c.id);
    expect(ids(L.trierChantiers(liste, { critere: 'nom', sens: 'asc' }))).toEqual(['b', 'a', 'c']);
    expect(ids(L.trierChantiers(liste, { critere: 'nom', sens: 'desc' }))).toEqual(['c', 'a', 'b']);
    expect(ids(L.trierChantiers(liste, { critere: 'statut', sens: 'asc' }))).toEqual(['b', 'c', 'a']);
    const codes = [ch({ id: '10', code: 'CH-10' }), ch({ id: '2', code: 'CH-2' }), ch({ id: 'v', code: '' })];
    expect(ids(L.trierChantiers(codes, { critere: 'code', sens: 'asc' }))).toEqual(['2', '10', 'v']);
    expect(ids(L.trierChantiers(codes, { critere: 'code', sens: 'desc' }))).toEqual(['10', '2', 'v']);
    const bud = [ch({ id: 'p', budget_ht: 5 }), ch({ id: 'z', budget_ht: 0 }), ch({ id: 'g', budget_ht: 50 })];
    expect(ids(L.trierChantiers(bud, { critere: 'budget', sens: 'desc' }))).toEqual(['g', 'p', 'z']);
    expect(ids(L.trierChantiers(bud, { critere: 'budget', sens: 'asc' }))).toEqual(['p', 'g', 'z']);
  });
});

describe('archivage', () => {
  test('textes', () => {
    const t = L.textesArchivage('Villa');
    expect(t.titre).toBe('Archiver ce chantier ?');
    expect(t.message).toMatch(/« Villa » ira dans les archives/);
    expect(L.textesArchivage('').message).toMatch(/^Il ira/);
  });
  test('archiverPuisRelire : succès annulable, relecture toujours faite', async () => {
    const relire = espion();
    expect(await L.archiverPuisRelire(async () => {}, relire)).toEqual({ ok: true, annulable: true });
    expect(relire).toHaveBeenCalledTimes(1);
  });
  test('archiverPuisRelire : refus du serveur, message gardé tel quel', async () => {
    const relire = espion();
    const r = await L.archiverPuisRelire(async () => { throw new Error('Refusé par le serveur'); }, relire);
    expect(r).toEqual({ ok: false, message: 'Refusé par le serveur' });
    expect(relire).toHaveBeenCalledTimes(1);
    const r2 = await L.archiverPuisRelire(async () => { throw 'x'; }, relire);
    expect(r2.message).toBe(L.MESSAGE_ERREUR_PAR_DEFAUT);
  });
  test('annulerArchivage', async () => {
    const relire = espion();
    expect(await L.annulerArchivage(async () => {}, relire)).toEqual({ ok: true });
    const r = await L.annulerArchivage(async () => { throw new Error('non'); }, relire);
    expect(r).toEqual({ ok: false, message: 'Impossible d’annuler : non' });
    expect(relire).toHaveBeenCalledTimes(1);
  });
});

describe('chiffres du budget', () => {
  const ligne = { chantier_id: 'c1', budget_ht: 1000, budget_renseigne: true, accepte_ht: 400, en_attente_ht: 100, reste_ht: 600, pct_budget_consomme: 40, niveau: 'ok' };
  test('niveau et pourcentage', () => {
    expect(L.libelleNiveau('depasse')).toBe('Budget dépassé');
    expect(L.libelleNiveau('inconnu')).toBe('');
    expect(L.textePourcentage(42.5)).toBe('42,5 %');
    expect(L.textePourcentage(null)).toBe('—');
    expect(L.textePourcentage(Number.NaN)).toBe('—');
  });
  test('indexerChiffres ignore les lignes sans identifiant', () => {
    const m = L.indexerChiffres([ligne, { budget_ht: 1 }, null]);
    expect(m.size).toBe(1);
    expect(m.get('c1').accepte_ht).toBe(400);
    expect(L.indexerChiffres(undefined).size).toBe(0);
  });
  test('lignesChiffres : budget non renseigné = tirets, pas de « 0 % »', () => {
    expect(L.lignesChiffres(null)).toBeNull();
    const sans = L.lignesChiffres({ ...ligne, budget_renseigne: false, budget_ht: 0, reste_ht: 0, pct_budget_consomme: null });
    expect(sans.find((x) => x.id === 'budget').valeur).toBe('—');
    expect(sans.find((x) => x.id === 'reste').valeur).toBe('—');
    expect(sans.find((x) => x.id === 'pct').valeur).toBe('—');
    expect(L.lignesChiffres(ligne).find((x) => x.id === 'pct').valeur).toBe('40 %');
  });
  test('largeurBarre : bornée à 0-100, aucune sans budget', () => {
    expect(L.largeurBarre(ligne)).toBe(40);
    expect(L.largeurBarre({ ...ligne, pct_budget_consomme: 140 })).toBe(100);
    expect(L.largeurBarre({ ...ligne, pct_budget_consomme: -3 })).toBe(0);
    expect(L.largeurBarre({ ...ligne, budget_renseigne: false })).toBeNull();
    expect(L.largeurBarre(undefined)).toBeNull();
  });
});

describe('favoris', () => {
  test('favorisDeChantiers : seulement le genre chantier avec une clé texte', () => {
    const r = [{ genre: 'chantier', cle: 'c1' }, { genre: 'entreprise', cle: 'e1' }, { genre: 'chantier', cle: '' }, null, { genre: 'chantier', cle: 5 }];
    expect(F.favorisDeChantiers(r)).toEqual([{ genre: 'chantier', cle: 'c1' }]);
    expect(F.favorisDeChantiers({})).toEqual([]);
  });
  test('libellé de l’étoile = l’action du prochain clic', () => {
    expect(F.libelleEtoile(false)).toBe('Mettre en favori');
    expect(F.libelleEtoile(true)).toBe('Retirer des favoris');
  });
  test('basculer : étoile tout de suite, réponse du serveur fixe la clé', async () => {
    const m = F.creerMagasinFavoris(async () => true);
    const vus = [];
    m.abonner(() => vus.push(m.est('chantier', 'c1')));
    await m.basculer('chantier', 'c1');
    expect(vus[0]).toBe(true);
    expect(m.est('chantier', 'c1')).toBe(true);
  });
  test('basculer : un échec n’annule que sa clé et dit pourquoi', async () => {
    const m = F.creerMagasinFavoris(async (g, c) => { if (c === 'c2') throw new Error('x'); return true; });
    m.charger([{ genre: 'chantier', cle: 'c2' }]);
    await m.basculer('chantier', 'c1');
    await m.basculer('chantier', 'c2');
    expect(m.est('chantier', 'c1')).toBe(true);
    expect(m.est('chantier', 'c2')).toBe(true);
    expect(m.lireErreur().message).toBe(F.MESSAGE_ERREUR_FAVORI);
    m.effacerErreur();
    expect(m.lireErreur()).toBeNull();
  });
  test('charger n’écrase pas une clé dont le clic attend sa réponse', async () => {
    let fin; const attente = new Promise((r) => { fin = r; });
    const m = F.creerMagasinFavoris(() => attente);
    const p = m.basculer('chantier', 'c1');
    m.charger([]);
    expect(m.est('chantier', 'c1')).toBe(true);
    fin(true); await p;
    expect(m.est('chantier', 'c1')).toBe(true);
  });
  test('se désabonner', async () => {
    const m = F.creerMagasinFavoris(async () => true);
    const f = espion();
    const quitter = m.abonner(f);
    quitter();
    await m.basculer('chantier', 'c1');
    expect(f).toHaveBeenCalledTimes(0);
  });
});

describe('export CSV', () => {
  test('cellules : formules protégées, guillemets doublés, nombres à virgule', () => {
    expect(C.protegerFormule('=SOMME(A1)')).toBe('\'=SOMME(A1)');
    expect(C.protegerFormule('-5')).toBe('\'-5');
    expect(C.protegerFormule('Dupont')).toBe('Dupont');
    expect(C.formaterCellule('a;b')).toBe('"a;b"');
    expect(C.formaterCellule('dit "oui"')).toBe('"dit ""oui"""');
    expect(C.formaterCellule(-100)).toBe('-100,00');
    expect(C.formaterCellule(null)).toBe('');
    expect(C.formaterCellule(Number.NaN)).toBe('');
  });
  test('chantiersCsv : BOM, en-têtes, une ligne par chantier, fin de ligne Windows', () => {
    const t = C.chantiersCsv([ch({ adresse: 'rue; X', archive: true }), ch({ id: 'c2', code: null, client: null, budget_ht: null, date_debut: null, date_fin_prevue: null })]);
    expect(t.startsWith(C.BOM + 'Code;Nom;Client;Statut;Budget HT')).toBe(true);
    const lignes = t.split('\r\n');
    expect(lignes.length).toBe(4);
    expect(lignes[1]).toBe('CH-1;Villa Dupont;Dupont;En cours;12500,50;01/03/2026;30/09/2026;;"rue; X";Oui');
    expect(lignes[2]).toBe(';Villa Dupont;;En cours;;;;;12 rue des Lilas, 83560 Vinon-sur-Verdon;Non');
  });
  test('nom du fichier', () => {
    expect(C.nomFichierExport('2026-11-24')).toBe('chantiers-2026-11-24.csv');
  });
});

describe('données (faux réseau)', () => {
  const faux = () => {
    const client = { lire: espion(async () => ({ lignes: [ch()], tronque: false, message: '' })), appeler: espion(async () => []) };
    const actions = { appelerActionMetier: espion(async () => ({ ok: true })) };
    return { client, actions, d: creerDonnees({ client, actions }) };
  };
  test('lecture : table et colonnes nommées, tri obligatoire', async () => {
    const { client, d } = faux();
    const r = await d.chargerChantiers();
    expect(r.chantiers.length).toBe(1);
    expect(client.lire.appels[0]).toEqual([TABLE_CHANTIERS, { colonnes: COLONNES_CHANTIERS, tri: ['nom', 'id'] }]);
    expect(COLONNES_CHANTIERS).not.toContain('*');
  });
  test('chiffres : lus dans la vue, indexés', async () => {
    const client = { lire: espion(async () => ({ lignes: [{ chantier_id: 'c1', budget_ht: 5 }], tronque: true, message: 'Plafond' })), appeler: espion() };
    const d = creerDonnees({ client, actions: {} });
    const r = await d.chargerChiffres();
    expect(client.lire.appels[0][0]).toBe(VUE_CHIFFRES);
    expect(r.chiffres.get('c1').budget_ht).toBe(5);
    expect(r.tronque).toBe(true);
    expect(r.message).toBe('Plafond');
  });
  test('favoris : par les deux fonctions de la base', async () => {
    const client = { lire: espion(), appeler: espion(async (nom) => (nom === 'lister_favoris_os' ? [{ genre: 'chantier', cle: 'c1' }, { genre: 'agence', cle: 'a' }] : true)) };
    const d = creerDonnees({ client, actions: {} });
    expect(await d.chargerFavoris()).toEqual([{ genre: 'chantier', cle: 'c1' }]);
    expect(await d.basculerFavori('chantier', 'c1')).toBe(true);
    expect(client.appeler.appels[1]).toEqual(['basculer_favori_os', { p_genre: 'chantier', p_cle: 'c1' }]);
  });
  test('création : action métier avec le corps à plat', async () => {
    const { actions, d } = faux();
    await d.creerChantier(champs({ nom: 'Neuf', budget_ht: '100' }));
    expect(actions.appelerActionMetier.appels[0]).toEqual(['creer_chantier', { nom: 'Neuf', statut: 'en_preparation', budget_ht: 100 }]);
  });
  test('modification : rien changé = rien envoyé ; sinon seulement le changement', async () => {
    const { actions, d } = faux();
    const c = ch();
    expect(await d.enregistrerChantier(c, L.champsDepuis(c))).toBe(false);
    expect(actions.appelerActionMetier.appels.length).toBe(0);
    expect(await d.enregistrerChantier(c, { ...L.champsDepuis(c), nom: 'Autre' })).toBe(true);
    expect(actions.appelerActionMetier.appels[0]).toEqual(['modifier_chantier', { id: 'c1', champs: { nom: 'Autre' } }]);
  });
  test('archiver et désarchiver', async () => {
    const { actions, d } = faux();
    await d.archiver('c1');
    await d.desarchiver('c1');
    expect(actions.appelerActionMetier.appels[0]).toEqual(['modifier_chantier', { id: 'c1', champs: { archive: true } }]);
    expect(actions.appelerActionMetier.appels[1]).toEqual(['modifier_chantier', { id: 'c1', champs: { archive: false } }]);
  });
  test('client et actions peuvent être donnés sous forme de fonction (pris au moment de l’appel)', async () => {
    const client = { lire: async () => ({ lignes: [], tronque: false, message: '' }), appeler: async () => [] };
    const d = creerDonnees({ client: () => client, actions: () => ({}) });
    expect((await d.chargerChantiers()).chantiers).toEqual([]);
  });
});

describe('verrous du module', () => {
  test('aucun appel réseau ni adresse https dans les fichiers du module', () => {
    for (const f of ['logique', 'favoris', 'export-csv', 'donnees', 'composants', 'fenetre', 'ecran', 'export', 'index']) {
      const t = readFileSync(new URL(`../js/modules/achatschantiers/${f}.js`, import.meta.url), 'utf8');
      if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(t)) throw new Error(`réseau dans ${f}.js`);
      if (/https?:\/\//.test(t)) throw new Error(`adresse dans ${f}.js`);
    }
  });
});
