// Module Achats « Tableau de bord 2 » (PR 9) : verrous du code (lecture seule, aucun réseau écrit, colonnes nommées, pas d'import de Pilotage, ECharts du dépôt),
// CSV sans donnée bancaire, conversion des lignes lues (portée de lire.test.ts), déclaration dans le registre, Réglages > Sauvegarde, et les textes de chaque état de l'écran.
// Les écrans sont aussi vus dans un navigateur : tests/e2e/tableauachats.spec.js.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { moduleDeclare, reglagesDesModules } from '../js/os/registre.js';
import * as C from '../js/modules/tableauachats/colonnes.js';
import { BOM, construireCsv, csvDe, echapper, fichierArticles, fichierChantiers, fichierFactures, fichierFournisseurs, fichierLignesAchat, formaterCellule, nomFichier, nombreCsv, protegerFormule } from '../js/modules/tableauachats/csv.js';
import { ORDRE_PRIX_LIGNES } from '../js/modules/tableauachats/prix.js';

const RACINE = new URL('..', import.meta.url).pathname;
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const sansComm = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const DOSSIER = 'js/modules/tableauachats';
const FICHIERS = readdirSync(join(RACINE, DOSSIER)).filter((f) => f.endsWith('.js')).map((f) => `${DOSSIER}/${f}`);
const NOM_VALIDE = /^[a-z_][a-z0-9_]*$/;

describe('S1 lecture seule : tout passe par la couche d\'accès, rien n\'est écrit', () => {
  test('S1 le module compte tous ses fichiers : six onglets, aucun onglet Pareto, un fichier par rôle', () => {
    assert.ok(FICHIERS.length >= 18, `${FICHIERS.length} fichiers`);
    const ecran = lire(`${DOSSIER}/ecran.js`);
    assert.deepEqual([...ecran.matchAll(/\{ cle: '(\w+)', libelle: '([^']+)' \}/g)].map((m) => m[1]), ['dirigeant', 'pilotage', 'liste', 'prix', 'lignes', 'fournisseurs']);
    assert.doesNotMatch(sansComm(ecran), /pareto/i, 'l\'onglet Pareto 80/20 n\'existe plus dans l\'appli d\'origine');
  });
  test('S1 aucun appel réseau, aucune écriture (ni action métier, ni appel de fonction de la base), aucune adresse https écrite', () => {
    for (const f of FICHIERS) {
      const t = lire(f);
      assert.doesNotMatch(t, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket\b|\bEventSource\b/, f);
      const code = sansComm(t);
      assert.doesNotMatch(code, /actionsBase|\.appeler\s*\(|\.lienPdf\s*\(|\.demanderTicket\s*\(|method:\s*'(POST|PATCH|PUT|DELETE)'|firebase|firestore|localStorage|sessionStorage/i, f);
      assert.doesNotMatch(code, /https?:\/\//, f);
      assert.doesNotMatch(code, /Chevalier|Jérôme|Jerome|Charles|Hermes|Claude Code/, f);
    }
  });
  test('S1 seul donnees.js parle à la base, par clientBase().lire ; il n\'importe que la couche d\'accès de la coque', () => {
    for (const f of FICHIERS) {
      const code = sansComm(lire(f));
      if (f.endsWith('/donnees.js')) continue;
      if (f.endsWith('/ecran.js')) { assert.doesNotMatch(code, /clientBase/, f); continue; } // l'écran ne fait que vérifier l'accès (verifierAcces), comme les autres écrans Achats
      assert.doesNotMatch(code, /acces-base|clientBase/, `${f} ne lit pas la base`);
    }
    const d = sansComm(lire(`${DOSSIER}/donnees.js`));
    assert.deepEqual([...d.matchAll(/base\.(\w+)\(/g)].map((m) => m[1]), ['lire', 'lire', 'lire', 'lire', 'lire', 'lire', 'lire', 'lire']);
    assert.deepEqual([...d.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]).sort(), ['../../os/acces-base.js', './colonnes.js', './formats.js', './fournisseurs.js', './prix.js']);
  });
  test('S1 aucune importation d\'un autre module : ni Pilotage, ni un autre module Achats ; seulement achatscommun, la barre commune des listes et la coque', () => {
    for (const f of FICHIERS) {
      const t = lire(f);
      assert.doesNotMatch(t, /modules\/pilotage|from '[^']*\/pilotage\//, f);
      for (const m of t.matchAll(/from '([^']+)'/g)) {
        if (!m[1].startsWith('.')) continue;
        const resolu = join('/', DOSSIER, m[1]).slice(1);
        if (resolu.startsWith('js/modules/')) assert.ok(resolu.startsWith(`${DOSSIER}/`) || resolu.startsWith('js/modules/achatscommun/') || resolu === 'js/modules/crm/barre-liste.js', `${f} importe ${m[1]}`);
      }
    }
  });
});

describe('S2 les lectures : vues et colonnes nommées, tri stable, plafond dit à l\'écran', () => {
  const COLS = Object.entries(C).filter(([k]) => k.startsWith('COLONNES_'));
  const VUES = Object.entries(C).filter(([k]) => k.startsWith('VUE_'));
  test('S2 huit vues, toutes en v_td_*, huit listes de colonnes valides (aucune étoile, aucun doublon)', () => {
    assert.equal(VUES.length, 8);
    assert.equal(COLS.length, 8);
    for (const [k, v] of VUES) assert.match(v, /^v_td_[a-z_]+$/, k);
    for (const [k, cols] of COLS) {
      assert.ok(cols.length > 0, k);
      assert.equal(new Set(cols).size, cols.length, `${k} : doublon`);
      for (const c of cols) assert.match(c, NOM_VALIDE, `${k} : ${c}`);
    }
  });
  test('S2 les colonnes lues par chaque conversion existent dans la liste lue (rien n\'est lu sans être nommé)', () => {
    const lignes = C.enLignePrix(Object.fromEntries(C.COLONNES_PRIX_LIGNES.map((c) => [c, null])));
    assert.deepEqual(Object.keys(lignes).sort(), [...C.COLONNES_PRIX_LIGNES].sort());
    const attrs = C.enAttributs(Object.fromEntries(C.COLONNES_PRIX_ARTICLES.map((c) => [c, null])));
    assert.deepEqual(Object.keys(attrs).sort(), [...C.COLONNES_PRIX_ARTICLES].sort());
    const pont = C.enPont(Object.fromEntries(C.COLONNES_PRIX_PONTS.map((c) => [c, null])));
    assert.deepEqual(Object.keys(pont).sort(), [...C.COLONNES_PRIX_PONTS].sort());
  });
  test('S2 les tris sont donnés (la base le demande pour paginer sans doublon) ; les lignes d\'achat : plus récentes d\'abord', () => {
    const d = lire(`${DOSSIER}/donnees.js`);
    assert.equal([...d.matchAll(/tri: /g)].length, 8);
    assert.deepEqual(ORDRE_PRIX_LIGNES, [{ col: 'date_prix', asc: false }, { col: 'ligne_id', asc: true }]);
    assert.doesNotMatch(d, /filtres: \[/, 'aucun filtre « ou » : la couche d\'accès n\'en a pas, le tri des refusées archivées se fait ici');
  });
  test('S2 (portée de lire.test.ts) : une facture refusée puis archivée est absente, une acceptée archivée est présente, les autres restent', () => {
    assert.equal(C.factureVisible({ statut: 'refusee', archivee_le: '2026-11-24T10:00:00Z' }), false);
    assert.equal(C.factureVisible({ statut: 'acceptee', archivee_le: '2026-11-24T10:00:00Z' }), true);
    assert.equal(C.factureVisible({ statut: 'refusee', archivee_le: null }), true);
    assert.equal(C.factureVisible({ statut: 'a_valider', archivee_le: null }), true);
    assert.equal(C.factureVisible({ statut: 'acceptee', archivee_le: null }), true);
    assert.equal(C.factureVisible({ statut: 'refusee' }), true, 'colonne absente = non archivée');
  });
  test('S2 les messages de plafond de plusieurs lectures se réunissent sans doublon ni vide', () => {
    assert.equal(C.messages({ message: '' }, { message: 'A' }, { message: 'A' }, { message: 'B' }), 'A B');
    assert.equal(C.messages({ message: '' }, { message: '' }), '');
  });
  test('S2 les nombres lus (texte ou nombre) deviennent des nombres ; un illisible devient nul ; les booléens ne sont vrais que s\'ils le sont', () => {
    const f = C.enFactureTableau({ montant_ht: '12.5', nb_alertes: null, jours_attente: 'abc', acceptee_malgre_alerte: undefined, sans_chantier: 'oui', date_future: true, chantier: null });
    assert.equal(f.montant_ht, 12.5);
    assert.equal(f.nb_alertes, 0);
    assert.equal(f.jours_attente, null);
    assert.equal(f.acceptee_malgre_alerte, null);
    assert.equal(f.sans_chantier, false);
    assert.equal(f.date_future, true);
    assert.equal(f.chantier, '');
  });
});

describe('S3 export : un fichier par tableau, jamais de donnée bancaire', () => {
  test('S3 virgule décimale, point-virgule, BOM, fin de ligne Excel ; formules neutralisées ; guillemets doublés', () => {
    assert.equal(nombreCsv(1234.5), '1234,50');
    assert.equal(protegerFormule('=SOMME(A1)'), '\'=SOMME(A1)');
    assert.equal(protegerFormule('-12'), '\'-12');
    assert.equal(echapper('a;b'), '"a;b"');
    assert.equal(echapper('il dit "oui"'), '"il dit ""oui"""');
    assert.equal(formaterCellule(null), '');
    assert.equal(formaterCellule(NaN), '');
    assert.equal(formaterCellule(3), '3,00');
    const t = construireCsv(['A', 'B'], [['x', 1.5], ['y;z', null]]);
    assert.ok(t.startsWith(BOM));
    assert.equal(t, `${BOM}A;B\r\nx;1,50\r\n"y;z";\r\n`);
  });
  test('S3 les six fichiers : colonnes fixes, une ligne par ligne affichée, aucun IBAN, aucune adresse e-mail, aucune colonne bancaire', () => {
    const f = [{ date_ref: '2026-11-03', fournisseur: 'Aciers Essai SAS', numero: 'F-1', chantier: 'Maison Essai', statut_fr: 'Acceptée', montant_ht: 120.5, nb_alertes: 2 }];
    const fichiers = [fichierFactures(f), fichierChantiers([{ chantier: 'M', client: 'C', budget_ht: 10, accepte_ht: 5, en_attente_ht: 1, pct_budget_consomme: 50 }]),
      fichierArticles([{ fournisseur: 'F', reference_fournisseur: 'R', designation: 'D', depense: 1, prix_premier: 1, prix_dernier: 2, variation_pct: 100, nb_achats: 2 }]),
      fichierLignesAchat([{ date_prix: '2026-11-03', fournisseur: 'F', agence: 'A', chantier: 'C', designation: 'D', quantite: 1, prix_net: 2, montant_ht: 2, rapprochement: 'Aucun' }]),
      fichierFournisseurs([{ nom: 'F', siren: '999000111', nb_agences: 1, nb_factures: 2, total_ht: 3, nb_lignes: 4, derniere_facture: '2026-11-03', part_pct: 5 }])];
    assert.equal(fichiers.length, 5);
    for (const fi of fichiers) {
      assert.equal(fi.lignes.length, 1);
      for (const l of fi.lignes) assert.equal(l.length, fi.entetes.length, fi.nom);
      assert.doesNotMatch(csvDe(fi), /iban|@|\bbic\b|rib/i, fi.nom);
      assert.match(nomFichier(fi.nom, '2026-11-25'), /^tableau-achats-[a-z-]+-2026-11-25\.csv$/);
    }
    assert.equal(csvDe(fichiers[0]), `${BOM}Date;Fournisseur;Numéro;Chantier;Statut;Montant HT;Alertes\r\n03/11/2026;Aciers Essai SAS;F-1;Maison Essai;Acceptée;120,50;2,00\r\n`);
  });
});

describe('S4 déclaration, Réglages > Sauvegarde et textes de l\'écran', () => {
  test('S4 le registre déclare la section « reglages-export-tableauachats » ; elle apparaît dans l\'élément « Achats » des Réglages', () => {
    const m = moduleDeclare('tableauachats');
    assert.deepEqual(m.reglages.sections, [{ id: 'reglages-export-tableauachats', libelle: 'Sauvegarde du tableau de bord' }]);
    const [item] = reglagesDesModules(['tableauachats']);
    assert.ok(item.sections.some((s) => s.id === 'reglages-export-tableauachats'));
    assert.match(lire(`${DOSSIER}/export.js`), /id: 'reglages-export-tableauachats'/);
    assert.match(lire(`${DOSSIER}/index.js`), /export function reglages\(page\)/);
  });
  test('S4 la ligne du tableau de bord 2 n\'est plus dans « Bouton Exporter à faire » du fichier A-FAIRE', () => {
    const a = lire('.github/A-FAIRE.md').split('\n').find((l) => l.includes('Exporter mes données') && l.includes('Fournisseurs fait'));
    assert.ok(a);
    assert.match(a, /Tableau de bord 2 fait/);
    assert.doesNotMatch(a.replace(/Tableau de bord 2 fait/, ''), /Tableau de bord 2/);
  });
  test('S4 les états de l\'écran sont tous prévus : accès à régler, chargement, erreur de lecture avec « Réessayer », plafond dit, plein écran, export', () => {
    const e = lire(`${DOSSIER}/ecran.js`);
    assert.match(e, /dataset: \{ role: 'achats-etat', etat \}/);
    assert.match(e, /dataset: \{ etat: 'chargement' \}/);
    assert.match(e, /dataset: \{ etat: 'erreur' \}/);
    assert.match(e, /dataset: \{ action: 'reessayer' \}/);
    assert.match(e, /dataset: \{ role: 'plafond' \}/);
    assert.match(e, /dataset: \{ action: 'plein-ecran' \}/);
    assert.match(e, /dataset: \{ action: 'exporter' \}/);
    assert.match(e, /Les chiffres n’ont pas pu être lus\. Réessaie dans un instant\./);
    assert.match(e, /Les fournisseurs n’ont pas pu être lus\./);
  });
  test('S4 les graphiques : ECharts du dépôt chargé à la demande, thème lu dans les variables CSS, aucun réseau', () => {
    const c = lire(`${DOSSIER}/composants.js`);
    assert.match(c, /import\('\.\.\/\.\.\/\.\.\/assets\/vendor\/echarts\/echarts\.esm\.min\.js'\)/);
    assert.match(c, /getComputedStyle/);
    assert.doesNotMatch(c, /cdn|unpkg|jsdelivr|cloudflare/i);
    const e = lire(`${DOSSIER}/ecran.js`);
    assert.match(e, /attributeFilter: \['data-theme'\]/, 'le thème clair ou sombre redessine les graphiques');
  });
  test('S4 la feuille de style n\'a aucune couleur écrite en dur (clair ET sombre par les variables) et garde le téléphone sans défilement horizontal', () => {
    const css = sansComm(lire('css/tableauachats.css'));
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    assert.match(css, /@media \(max-width: 767px\)/);
    assert.match(css, /display: block; width: 100%; box-sizing: border-box/);
  });
});
