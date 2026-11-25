// Module Achats « Factures » (25/11/2026, PR 8a) : couche de données avec un FAUX réseau (aucun appel réel) et verrous statiques du module.
// La couche lit avec le client de la base (colonnes nommées, tri obligatoire) et n'écrit que par les actions métier ; ces tests le verrouillent.
// Remplace les tests « repli avant la migration 011 » et « arrêt des tranches » de l'appli d'origine, sans objet ici : le client de la base fait lui-même le découpage en pages et dit `tronque`.
import { test, describe } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { expect, espion } from './_expect-achatsfactures.js';
import { PREFIXE_SIRET_EXCEPTION } from '../js/modules/achatsfactures/controles.js';
import {
  creerDonnees, fusionnerExtractions, rattacher, COLONNES_FACTURES, COLONNES_ANALYSES, COLONNES_CHANTIERS, COLONNES_AGENCES, COLONNES_LIGNES, PAQUET_LIGNES, TABLE_FACTURES, TABLE_CHANTIERS, TABLE_AGENCES, TABLE_LIGNES, TABLE_IBANS,
} from '../js/modules/achatsfactures/donnees.js';

/** Faux client : `reponses` donne, par table (et « analyses » pour la 2e lecture des factures), ce que `lire` rend ; tout est noté dans `appels`. */
function fauxClient(reponses = {}) {
  const appels = [];
  const lire = async (table, opts) => {
    appels.push({ table, ...opts });
    const cle = table === TABLE_FACTURES && opts.colonnes === COLONNES_ANALYSES ? 'analyses' : table;
    const r = reponses[cle];
    if (r instanceof Error) throw r;
    if (typeof r === 'function') return r(opts);
    return r ?? { lignes: [], tronque: false, message: '' };
  };
  const rpc = [];
  const appeler = async (nom, args) => { rpc.push([nom, args]); const r = reponses[`rpc:${nom}`]; if (r instanceof Error) throw r; return r; };
  return { client: { lire, appeler }, appels, rpc };
}
const ok = (lignes, extra = {}) => ({ lignes, tronque: false, message: '', ...extra });
const fact = (o = {}) => ({ id: 'f1', fournisseur: 'Point Q', statut: 'acceptee', chantier_id: null, etablissement_id: null, ...o });
const erreur = (code) => Object.assign(new Error('lecture'), { code });
const resultat = (promesse) => promesse.then(() => 'ok', (e) => e.code);

describe('lecture de la liste', () => {
  test('lit les factures, les chantiers et les agences par colonnes nommées, avec un tri, puis rattache le nom du chantier et le SIRET de l’agence', async () => {
    const { client, appels } = fauxClient({
      factures: ok([fact({ id: 'f1', chantier_id: 'c1', etablissement_id: 'e1' }), fact({ id: 'f2' })]),
      chantiers: ok([{ id: 'c1', nom: 'Villa' }]),
      etablissements_fournisseur: ok([{ id: 'e1', siret: '50000000500008' }]),
    });
    const r = await creerDonnees({ client, actions: {} }).chargerFactures();
    expect(r.complete).toBe(true); expect(r.analysesLues).toBe(true)
    expect(r.liste.map((f) => f.id)).toEqual(['f1', 'f2'])
    expect(r.liste[0].chantiers).toEqual({ nom: 'Villa' }); expect(r.liste[0].etablissements_fournisseur).toEqual({ siret: '50000000500008' })
    expect(r.liste[1].chantiers).toBeNull(); expect(r.liste[1].archivee_le).toBeNull(); expect(r.liste[1].extraction).toBeNull()
    expect(appels[0].table).toBe(TABLE_FACTURES); expect(appels[0].colonnes).toEqual(COLONNES_FACTURES); expect(appels[0].tri).toBeTruthy()
    expect(COLONNES_FACTURES).not.toContain('extraction'); expect(COLONNES_FACTURES).not.toContain('texte_brut')
    expect(appels.map((a) => a.table)).toEqual([TABLE_FACTURES, TABLE_CHANTIERS, TABLE_AGENCES, TABLE_FACTURES])
    expect(appels.every((a) => Array.isArray(a.tri) && a.tri.length > 0)).toBe(true)
    expect(appels[1].colonnes).toEqual(COLONNES_CHANTIERS); expect(appels[2].colonnes).toEqual(COLONNES_AGENCES)
  })
  test('les analyses ne sont lues que pour les factures à valider, et rangées par identifiant', async () => {
    const { client, appels } = fauxClient({
      factures: ok([fact({ id: 'a', statut: 'a_valider' }), fact({ id: 'b' })]),
      analyses: ok([{ id: 'a', extraction: { numero: 'X' } }]),
    });
    const r = await creerDonnees({ client, actions: {} }).chargerFactures();
    const lecture = appels[appels.length - 1];
    expect(lecture.colonnes).toEqual(COLONNES_ANALYSES); expect(lecture.filtres).toEqual([['statut', 'eq', 'a_valider']])
    expect(r.liste[0].extraction.numero).toBe('X'); expect(r.liste[1].extraction).toBeNull()
  })
  test('lecture des analyses en échec ou incomplète : la liste reste, sans analyses, avec analysesLues faux', async () => {
    for (const analyses of [new Error('boum'), ok([], { tronque: true })]) {
      const { client } = fauxClient({ factures: ok([fact({ id: 'a', statut: 'a_valider' })]), analyses });
      const r = await creerDonnees({ client, actions: {} }).chargerFactures();
      expect(r.analysesLues).toBe(false); expect(r.liste).toHaveLength(1); expect(r.liste[0].extraction).toBeNull(); expect(r.complete).toBe(true)
    }
  })
  test('lecture tronquée : liste dite incomplète, avec le message du client', async () => {
    const { client } = fauxClient({ factures: ok([fact()], { tronque: true, message: 'Liste coupée à 20 000 lignes.' }) });
    const r = await creerDonnees({ client, actions: {} }).chargerFactures();
    expect(r.complete).toBe(false); expect(r.message).toContain('coupée')
  })
  test('lecture des factures ou des chantiers impossible : l’erreur est relancée (jamais une liste vide à tort)', async () => {
    expect(await resultat(creerDonnees({ client: fauxClient({ factures: erreur('x') }).client, actions: {} }).chargerFactures())).toBe('x')
    expect(await resultat(creerDonnees({ client: fauxClient({ factures: ok([fact()]), chantiers: erreur('y') }).client, actions: {} }).chargerFactures())).toBe('y')
  })
  test('les agences illisibles ne bloquent pas la liste (seulement les étoiles des fournisseurs)', async () => {
    const { client } = fauxClient({ factures: ok([fact({ etablissement_id: 'e1' })]), etablissements_fournisseur: new Error('refus') });
    const r = await creerDonnees({ client, actions: {} }).chargerFactures();
    expect(r.liste).toHaveLength(1); expect(r.liste[0].etablissements_fournisseur).toBeNull()
  })
  test('rattacher et fusionnerExtractions : fonctions pures', () => {
    expect(rattacher([fact({ chantier_id: 'zz' })], [], [])[0].chantiers).toBeNull()
    expect(fusionnerExtractions([{ id: 'a', extraction: null }, { id: 'b', extraction: null }], { a: { n: 1 } })[0].extraction).toEqual({ n: 1 })
    expect(fusionnerExtractions([{ id: 'b', extraction: null }], { a: { n: 1 } })[0].extraction).toBeNull()
  })
})

describe('nombre de lignes par facture à valider', () => {
  test('par paquets d’identifiants, pour les factures à valider seulement', async () => {
    const liste = [...Array.from({ length: PAQUET_LIGNES + 5 }, (_, i) => fact({ id: `a${i}`, statut: 'a_valider' })), fact({ id: 'dec', statut: 'acceptee' })];
    // Le faux réseau rend deux lignes pour la première facture de chaque paquet.
    const { client, appels } = fauxClient({ lignes_facture: (o) => { const id = o.filtres[0][2][0]; return ok([{ facture_id: id, position: 1 }, { facture_id: id, position: 2 }]); } });
    const n = await creerDonnees({ client, actions: {} }).chargerNombreLignes(liste);
    expect(appels).toHaveLength(2)
    expect(appels[0].table).toBe(TABLE_LIGNES); expect(appels[0].colonnes).toEqual(COLONNES_LIGNES); expect(appels[0].filtres[0].slice(0, 2)).toEqual(['facture_id', 'in'])
    expect(appels[0].filtres[0][2]).toHaveLength(PAQUET_LIGNES); expect(appels[1].filtres[0][2]).toHaveLength(5)
    expect(n.a0).toBe(2); expect(n[`a${PAQUET_LIGNES}`]).toBe(2); expect(n.dec).toBeUndefined()
  })
  test('lecture en échec ou incomplète : null (la pastille écarte le contrôle « Lignes »)', async () => {
    const liste = [fact({ id: 'a', statut: 'a_valider' })];
    expect(await creerDonnees({ client: fauxClient({ lignes_facture: new Error('x') }).client, actions: {} }).chargerNombreLignes(liste)).toBeNull()
    expect(await creerDonnees({ client: fauxClient({ lignes_facture: ok([], { tronque: true }) }).client, actions: {} }).chargerNombreLignes(liste)).toBeNull()
  })
  test('aucune facture à valider : aucune lecture', async () => {
    const { client, appels } = fauxClient();
    expect(await creerDonnees({ client, actions: {} }).chargerNombreLignes([fact()])).toEqual({})
    expect(appels).toHaveLength(0)
  })
})

describe('IBAN confirmés, favoris et actions', () => {
  test('IBAN confirmés : les lignes, ou null si la lecture échoue ou est incomplète (jamais de vert)', async () => {
    const lignes = [{ id: 'i1', iban: 'FR76', siren: '500000021' }];
    const { client, appels } = fauxClient({ ibans_confirmes: ok(lignes) });
    expect(await creerDonnees({ client, actions: {} }).chargerIbansConfirmes()).toEqual(lignes)
    expect(appels[0].table).toBe(TABLE_IBANS); expect(appels[0].tri).toBeTruthy()
    expect(await creerDonnees({ client: fauxClient({ ibans_confirmes: ok([], { tronque: true }) }).client, actions: {} }).chargerIbansConfirmes()).toBeNull()
    expect(await creerDonnees({ client: fauxClient({ ibans_confirmes: new Error('x') }).client, actions: {} }).chargerIbansConfirmes()).toBeNull()
  })
  test('favoris : lister_favoris_os (chantier et entreprise seulement) et basculer_favori_os (genre et clé tels quels, renvoie l’état après)', async () => {
    const { client, rpc } = fauxClient({
      'rpc:lister_favoris_os': [{ genre: 'entreprise', cle: '500000021' }, { genre: 'chantier', cle: 'abc' }, { genre: 'agence', cle: '5000000210001' }, { genre: 'autre', cle: 'x' }, { genre: 'entreprise', cle: 5 }],
      'rpc:basculer_favori_os': true,
    });
    const d = creerDonnees({ client, actions: {} });
    expect(await d.chargerFavoris()).toEqual([{ genre: 'entreprise', cle: '500000021' }, { genre: 'chantier', cle: 'abc' }])
    expect(await d.basculerFavori('entreprise', '500000021')).toBe(true)
    expect(rpc).toEqual([['lister_favoris_os', {}], ['basculer_favori_os', { p_genre: 'entreprise', p_cle: '500000021' }]])
    const retire = creerDonnees({ client: fauxClient({ 'rpc:basculer_favori_os': false }).client, actions: {} });
    expect(await retire.basculerFavori('chantier', 'abc')).toBe(false)
  })
  test('archiver et désarchiver : seulement par les actions métier, avec la seule clé facture_id', async () => {
    const appelerActionMetier = espion(async () => ({ ok: true }));
    const d = creerDonnees({ client: fauxClient().client, actions: { appelerActionMetier } });
    await d.archiver('f9'); await d.desarchiver('f9')
    expect(appelerActionMetier.appels).toEqual([['archiver', { facture_id: 'f9' }], ['desarchiver', { facture_id: 'f9' }]])
  })
})

// ---------------------------------------------------------------- verrous du module (dépôt public, aucune écriture hors des actions métier)
const DOSSIER = new URL('../js/modules/achatsfactures/', import.meta.url);
const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith('.js'));
const code = Object.fromEntries(fichiers.map((f) => [f, readFileSync(new URL(f, DOSSIER), 'utf8')]));
const css = readFileSync(new URL('../css/achatsfactures.css', import.meta.url), 'utf8');
const sansCommentaires = (t) => t.replace(/^\s*\/\/.*$/gm, '');

describe('verrous du module', () => {
  test('le module a ses fichiers (logique, contrôles, pastilles, score, favoris, données, export, composants, écran, index)', () => {
    for (const f of ['logique', 'controles', 'pastilles', 'score', 'favoris', 'donnees', 'export-csv', 'export', 'composants', 'ecran', 'index']) expect(fichiers).toContain(`${f}.js`)
  })
  test('aucun appel réseau écrit dans le module (même en commentaire) et aucune adresse https', () => {
    for (const [nom, texte] of Object.entries(code)) {
      expect(/\bfetch\s*\(/.test(texte) ? `${nom} : fetch` : '').toBe('')
      expect(/XMLHttpRequest|sendBeacon|WebSocket|EventSource/.test(texte) ? `${nom} : réseau` : '').toBe('')
      expect(/https?:\/\//.test(texte) ? `${nom} : adresse` : '').toBe('')
    }
  })
  test('aucun mot interdit dans le code et le texte visible (noms de personnes ou d’outils)', () => {
    for (const [nom, texte] of Object.entries(code)) expect(/Jérôme|Chevalier|Charles|Claude Code/.test(texte) ? `${nom} : mot interdit` : '').toBe('')
  })
  test('aucun numéro d’entreprise (SIREN de 9 chiffres, SIRET de 14 chiffres) ni IBAN écrit en dur dans le module : l’identité de l’espace vient toujours de l’appelant', () => {
    for (const [nom, texte] of Object.entries(code)) {
      expect(/(?<![\d.])\d{9}(?![\d])|(?<![\d.])\d{14}(?![\d])/.test(texte.replaceAll(PREFIXE_SIRET_EXCEPTION, '')) ? `${nom} : numéro en dur` : '').toBe('')
      expect(/\bFR\d{2}\s?\d{4}/.test(texte) ? `${nom} : IBAN en dur` : '').toBe('')
    }
  })
  test('le module n’importe que la coque, son dossier, le code commun des Achats et la barre commune des listes', () => {
    for (const [nom, texte] of Object.entries(code)) {
      for (const m of texte.matchAll(/from '([^']+)'/g)) {
        const chemin = m[1];
        const permis = chemin.startsWith('./') || chemin.startsWith('../../os/') || chemin.startsWith('../achatscommun/') || chemin === '../crm/barre-liste.js';
        expect(permis ? '' : `${nom} importe ${chemin}`).toBe('')
      }
    }
  })
  test('les écritures passent seulement par les actions métier : aucune écriture directe, aucun appel de la base hors du fichier des données et de l’écran', () => {
    for (const [nom, texte] of Object.entries(code)) {
      expect(/\.(insert|update|delete|upsert)\s*\(/.test(sansCommentaires(texte)) ? `${nom} : écriture directe` : '').toBe('')
      if (nom !== 'donnees.js' && nom !== 'donnees-examiner.js') expect(/appelerActionMetier|\.appeler\(/.test(sansCommentaires(texte)) ? `${nom} : appel hors des données` : '').toBe('')
    }
  })
  test('la feuille de style n’a aucune couleur écrite en dur', () => {
    expect(/#[0-9a-fA-F]{3,8}\b/.test(css)).toBe(false)
    expect(/rgba?\(/.test(css)).toBe(false)
  })
  test('l’export CSV ne contient jamais de coordonnées bancaires', () => {
    expect(/iban/i.test(sansCommentaires(code['export-csv.js']))).toBe(false)
  })
  test('« Examiner » ouvre la page de la facture (étape 8b) et « + Facture » est dans la barre', () => {
    expect(code['ecran.js']).toContain('achatsfactures/examiner/')
    expect(code['ecran.js']).toContain('ajouter-facture')
    expect(sansCommentaires(code['ecran.js'])).not.toContain('Examiner (bientôt disponible)')
  })
})
