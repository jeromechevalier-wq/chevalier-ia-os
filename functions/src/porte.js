// La porte des workflows n8n pour le CRM de Jérôme (base 1) : assemble la logique partagée (functions/partage/porte/, copie de scripts/porte/)
// avec l'accès Firestore, la clé d'API n8n (lue dans Secret Manager au moment d'un appel, comme MCP_JETONS) et un journal sans donnée sensible.
// Ce fichier n'est branché à aucune fonction tant que Jérôme n'a pas préparé le compte de service dédié et déposé la clé n8n (docs/porte-cles.md).
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { creerAdaptateur } from '../partage/porte/adaptateur.js';
import { creerPorte, creerGestionnaireHttp } from '../partage/porte/porte.js';
import { creerLecteurWorkflows, ErreurN8n } from '../partage/porte/n8n.js';
import { lireSecretJetons } from './securite/secret.js';
import { creerAccesFirestore, avecBase } from './coeur/donnees.js';
import { creerServiceDevisPorte } from './coeur/devis-email.js';
import { cheminAppartientALEspace } from './devis/stockage.js';
import { stockageDuProjet } from './devis/stockage-projet.js';

export const NOM_SECRET_N8N = 'N8N_API_KEY';
const DUREE_CLE_EN_MEMOIRE_MS = 5 * 60_000;
const CHAMPS_JOURNAL = ['idCourt', 'proprietaire', 'module', 'action', 'workflowId', 'statut', 'code', 'dureeMs'];

/** Une ligne de journal : liste blanche de champs, valeurs courtes. Jamais la clé, les données reçues ni les réponses. */
export function ligneDeJournal(entree) {
  const ligne = { severity: entree.statut >= 500 ? 'ERROR' : 'INFO', message: 'porte' };
  for (const c of CHAMPS_JOURNAL) {
    const v = entree[c];
    if (v === undefined || v === null) continue;
    ligne[c] = typeof v === 'string' ? v.slice(0, 80) : v;
  }
  return JSON.stringify(ligne);
}

/** Le lecteur n8n, créé avec la clé d'API lue dans Secret Manager (gardée 5 minutes en mémoire). Clé absente ou illisible : la porte se ferme (503). */
export function creerN8nDepuisSecret({ lireSecret, urlN8n, fetchImpl, maintenant = Date.now } = {}) {
  let cache = null;
  async function lecteur() {
    if (cache && cache.expire > maintenant()) return cache.lecteur;
    let cle;
    try { cle = (await lireSecret()).trim(); } catch { throw new ErreurN8n('refuse', 'clé d\'API n8n illisible'); }
    const l = creerLecteurWorkflows({ cle, ...(urlN8n ? { url: urlN8n } : {}), ...(fetchImpl ? { fetchImpl } : {}) }); // urlN8n : réservé aux essais (faux n8n)
    cache = { lecteur: l, expire: maintenant() + DUREE_CLE_EN_MEMOIRE_MS };
    return l;
  }
  return { async lireWorkflow(id) { return (await lecteur()).lireWorkflow(id); } };
}

/** Durée du lien de lecture du PDF donné à n8n (devis.lireEmail) : le temps de le télécharger et de le joindre au brouillon. */
export const DUREE_LIEN_PDF_N8N_MINUTES = 10;

/**
 * Service « devis » de la porte : lecture de l'e-mail à préparer et note du résultat (functions/src/coeur/devis-email.js). `base` : '' (Jérôme) ou 'clients/<id>'.
 * Le lien du PDF n'est signé que si le chemin lu sur le devis est bien dans le dossier des devis de CET espace.
 */
export function creerServiceDevis({ db, acces: accesBrut = null, stockage = stockageDuProjet, maintenant = () => new Date() } = {}) {
  return (base) => {
    const acces = accesBrut ?? creerAccesFirestore({ db });
    const donnees = base ? avecBase(acces, base) : acces;
    const espace = base ? `${base}/` : '';
    return creerServiceDevisPorte({
      donnees, maintenant,
      pdf: async ({ chemin, nom }) => {
        if (!cheminAppartientALEspace(chemin, espace)) throw new Error('Stockage : ce PDF n\'est pas accessible.');
        const rangement = stockage();
        if (!rangement) throw new Error('Stockage : espace de stockage introuvable.');
        return { lienSigne: await rangement.lienSigne(chemin, { minutes: DUREE_LIEN_PDF_N8N_MINUTES, nomAffiche: nom }), octets: await rangement.taille(chemin) };
      },
    });
  };
}

/** Passerelle HTTP de la porte pour le CRM (propriétaire « interne », données à la racine). */
export function creerGestionnairePorteCrm({ db, lireSecret = lireSecretJetons({ nom: NOM_SECRET_N8N }), urlN8n, sortie = (ligne) => process.stdout.write(`${ligne}\n`) } = {}) {
  if (!db) {
    if (!getApps().length) initializeApp();
    db = getFirestore();
  }
  const porte = creerPorte({
    contexte: 'crm',
    donnees: creerAdaptateur({ db }),
    n8n: creerN8nDepuisSecret({ lireSecret, urlN8n }),
    modulesActifs: async () => ['veille', 'automatisations', 'devis'],
    services: { devis: creerServiceDevis({ db }) },
    journal: (entree) => sortie(ligneDeJournal(entree)),
  });
  return creerGestionnaireHttp(porte);
}
