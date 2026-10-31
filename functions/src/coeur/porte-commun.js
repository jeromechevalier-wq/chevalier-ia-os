// Partie de la porte des workflows n8n commune au CRM de Jérôme (functions/src/porte.js) et aux espaces clients (functions-plateforme/src/porte.js) :
// journal sans donnée sensible, lecteur n8n (clé d'API lue dans Secret Manager) et service « devis ». Ce dossier (coeur/) est copié chez les clients :
// aucun import des comptes ou du stockage propres à Jérôme ici (devis/stockage-projet.js, devis/pdf-appel.js) ; le stockage est toujours fourni par l'appelant.
import { creerLecteurWorkflows, ErreurN8n } from '../../partage/porte/n8n.js';
import { creerAccesFirestore, avecBase } from './donnees.js';
import { creerServiceDevisPorte } from './devis-email.js';
import { cheminAppartientALEspace } from '../devis/stockage.js';

const DUREE_CLE_EN_MEMOIRE_MS = 5 * 60_000;
export const CHAMPS_JOURNAL = ['idCourt', 'proprietaire', 'module', 'action', 'workflowId', 'statut', 'code', 'dureeMs'];

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
 * `stockage` est obligatoire (fonction qui rend le rangement) : chaque fonction fournit le sien. Le lien du PDF n'est signé que si le chemin lu sur le devis est bien dans le dossier des devis de CET espace.
 */
export function creerServiceDevis({ db, acces: accesBrut = null, stockage, maintenant = () => new Date() } = {}) {
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
