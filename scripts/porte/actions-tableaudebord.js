// Actions de la porte du tableau de bord. Une action n'agit QUE sur les tables tableaudebord_indicateurs et tableaudebord_releves du propriétaire de la clé
// (`base` : '' chez Jérôme, « clients/<id> » chez un client) : le nom des tables est écrit ici, jamais reçu. Aucune suppression.
//  - indicateurs.ecrire : la situation ACTUELLE de chaque indicateur (un document par indicateur, remplacé à chaque relevé) ;
//  - releves.ajouter    : un point d'HISTORIQUE par relevé (créé seulement s'il n'existe pas : un appel répété ne change rien), avec l'objectif en vigueur ce mois-là.
// Le propriétaire n'est jamais dans le corps : il vient de la clé. Les textes libres refusent tout ce qui ressemble à une clé ou à un secret.
import { valider } from './validation.js';
import { ErreurAction } from './actions-veille.js';

export const TABLES_TABLEAU = Object.freeze({ indicateurs: 'tableaudebord_indicateurs', releves: 'tableaudebord_releves' });
export const MAX_INDICATEURS_PAR_APPEL = 100;
export const MAX_RELEVES_PAR_APPEL = 200;
export const TABLEAUX = ['general', 'technique', 'finance', 'stocks'];
export const NIVEAUX = ['vert', 'orange', 'rouge'];

const chemin = (base, table, id) => `${base ? `${base}/` : ''}${table}/${id}`;
const sansIndefini = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const dateCompacte = (d) => d.toISOString().replace(/[-:]/g, '').slice(0, 15); // 20261017T101500

const CHAMPS_FACULTATIFS = Object.freeze({ niveau: null, message: null, valeur: null, unite: null, objectif: null, echeance: null, perimeApresMinutes: null, source: null, procedure: null });

const SCHEMA_INDICATEUR = {
  id: { type: 'id', requis: true },
  tableau: { type: 'choix', valeurs: TABLEAUX, requis: true },
  famille: { type: 'etiquette', requis: true },
  nom: { type: 'libre', max: 120, min: 1, requis: true },
  type: { type: 'choix', valeurs: ['etat', 'mesure'], requis: true },
  niveau: { type: 'choix', valeurs: NIVEAUX },
  message: { type: 'libre', max: 200 },
  valeur: { type: 'nombre', min: -1e12, max: 1e12 },
  unite: { type: 'libre', max: 20 },
  objectif: { type: 'nombre', min: -1e12, max: 1e12 },
  echeance: { type: 'echeance' },
  releveLe: { type: 'date', requis: true },
  perimeApresMinutes: { type: 'nombre', min: 1, max: 525600 },
  methode: { type: 'choix', valeurs: ['auto', 'semi', 'manuel'], requis: true },
  source: { type: 'libre', max: 80 },
  procedure: { type: 'libre', max: 120 },
};

const SCHEMA_RELEVE = {
  indicateurId: { type: 'id', requis: true },
  releveLe: { type: 'date', requis: true },
  valeur: { type: 'nombre', min: -1e12, max: 1e12 },
  objectif: { type: 'nombre', min: -1e12, max: 1e12 },
  niveau: { type: 'choix', valeurs: NIVEAUX },
  message: { type: 'libre', max: 200 },
};

function sansDoublon(liste, cle, intitule) {
  const vus = new Set();
  for (const x of liste) {
    const k = cle(x);
    if (vus.has(k)) throw new ErreurAction('requete_invalide', `${intitule} en double dans la liste : « ${k} ».`);
    vus.add(k);
  }
}

/** ctx : { base, donnees, auteur, maintenant(), proprietaire }. `donnees` : voir adaptateur.js (majDoc, creerSiAbsent). */
export const ACTIONS_TABLEAU = Object.freeze({
  'indicateurs.ecrire': {
    ecrit: true,
    schema: { indicateurs: { type: 'liste', max: MAX_INDICATEURS_PAR_APPEL, item: SCHEMA_INDICATEUR, requis: true } },
    async executer({ base, donnees, auteur, maintenant, proprietaire }, { indicateurs }) {
      sansDoublon(indicateurs, (i) => i.id, 'Identifiant');
      let ecrits = 0;
      for (const i of indicateurs) {
        if (i.type === 'etat' && !i.niveau) throw new ErreurAction('requete_invalide', `L'indicateur « ${i.id} » est un état : « niveau » est obligatoire.`);
        if (i.type === 'mesure' && i.valeur === undefined) throw new ErreurAction('requete_invalide', `L'indicateur « ${i.id} » est une mesure : « valeur » est obligatoire.`);
        // Tous les champs facultatifs sont écrits (à `null` quand le relevé ne les donne pas) : une mise à jour ne laisse donc jamais un champ d'un relevé précédent
        // (une échéance disparue, une valeur d'avant). L'adaptateur ne sait que créer et mettre à jour : jamais de remplacement ni de suppression.
        const doc = { ...CHAMPS_FACULTATIFS, ...sansIndefini(i), proprietaire, ecritPar: auteur, modifieLe: new Date(maintenant()) };
        const chem = chemin(base, TABLES_TABLEAU.indicateurs, i.id);
        if (!(await donnees.majDoc(chem, doc)) && !(await donnees.creerSiAbsent(chem, doc))) {
          // Créé entre-temps par un autre appel : une seule nouvelle tentative de mise à jour.
          if (!(await donnees.majDoc(chem, doc))) throw new ErreurAction('ecriture_impossible', 'Écriture impossible.', 500);
        }
        ecrits++;
      }
      return { ecrits };
    },
  },

  'releves.ajouter': {
    ecrit: true,
    schema: { releves: { type: 'liste', max: MAX_RELEVES_PAR_APPEL, item: SCHEMA_RELEVE, requis: true } },
    async executer({ base, donnees, auteur, maintenant, proprietaire }, { releves }) {
      for (const r of releves) if (r.indicateurId.length > 80) throw new ErreurAction('requete_invalide', 'Un identifiant d\'indicateur fait 80 caractères au plus pour l\'historique.');
      const lignes = releves.map((r) => ({ ...r, id: `${r.indicateurId}_${dateCompacte(r.releveLe)}` }));
      sansDoublon(lignes, (r) => r.id, 'Relevé');
      let crees = 0;
      for (const { id, ...r } of lignes) {
        const doc = { ...sansIndefini(r), proprietaire, saisiPar: auteur, creeLe: new Date(maintenant()) };
        if (await donnees.creerSiAbsent(chemin(base, TABLES_TABLEAU.releves, id), doc)) crees++;
      }
      return { crees, dejaPresents: lignes.length - crees };
    },
  },
});
