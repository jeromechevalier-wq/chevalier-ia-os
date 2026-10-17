// La porte du tableau de bord pour le CRM de Jérôme (base 1) : assemble la logique partagée (functions/partage/porte/, copie de scripts/porte/) avec l'accès Firestore
// et un journal sans donnée sensible. Les scripts GitHub (surveillance des clés, des sauvegardes) l'appellent par https://chevalier-ia-os.web.app/tableau-de-bord.
// Pas de secret Google à lire : la clé du script (cle-tdb.interne.…) est vérifiée par son empreinte dans plateforme_cles. Voir docs/tableau-de-bord.md.
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { creerAdaptateur } from '../partage/porte/adaptateur.js';
import { creerGestionnaireHttp } from '../partage/porte/porte.js';
import { creerPorteTableau, MODULE_TABLEAU } from '../partage/porte/porte-tableau.js';

const CHAMPS_JOURNAL = ['idCourt', 'proprietaire', 'module', 'action', 'statut', 'code', 'dureeMs'];

/** Une ligne de journal : liste blanche de champs, valeurs courtes. Jamais la clé, les données reçues ni les réponses. */
export function ligneDeJournalTableau(entree) {
  const ligne = { severity: entree.statut >= 500 ? 'ERROR' : 'INFO', message: 'tableaudebord' };
  for (const c of CHAMPS_JOURNAL) {
    const v = entree[c];
    if (v === undefined || v === null) continue;
    ligne[c] = typeof v === 'string' ? v.slice(0, 80) : v;
  }
  return JSON.stringify(ligne);
}

/** Passerelle HTTP de la porte du tableau de bord pour le CRM (propriétaire « interne », données à la racine). */
export function creerGestionnaireTableauCrm({ db, sortie = (ligne) => process.stdout.write(`${ligne}\n`) } = {}) {
  if (!db) {
    if (!getApps().length) initializeApp();
    db = getFirestore();
  }
  const porte = creerPorteTableau({
    contexte: 'crm',
    donnees: creerAdaptateur({ db }),
    modulesActifs: async () => [MODULE_TABLEAU],
    journal: (entree) => sortie(ligneDeJournalTableau(entree)),
  });
  return creerGestionnaireHttp(porte, { chemins: ['/', '/tableau-de-bord'] });
}
