// La porte du TABLEAU DE BORD : ce que les scripts GitHub appellent pour écrire leurs relevés (indicateurs et historique) dans la base. Voir docs/tableau-de-bord.md.
// Même construction que la porte des workflows n8n (porte.js), sans la vérification d'un workflow n8n : l'appelant est un script GitHub, identifié par sa clé seule.
// Logique pure : tout ce qui touche l'extérieur (base, modules actifs, journal) est injecté. Copiée dans functions/partage/porte/ avant les tests et le déploiement.
//
// Ordre des contrôles (le premier qui échoue arrête tout ; jusqu'à la validation des données incluse, rien n'est écrit) :
//   1. méthode POST, aucune origine de navigateur, corps JSON de taille raisonnable (couche HTTP, creerGestionnaireHttp) ;
//   2. clé du tableau de bord valide, active, d'usage « tableaudebord », étiquette = propriétaire  → 401 « cle_refusee » (toujours la même réponse) ;
//   3. plafond de requêtes par clé                                                                  → 429 ;
//   4. forme de la requête, action connue                                                            → 400 ;
//   5. module « tableaudebord » actif pour ce propriétaire                                            → 403 ;
//   6. validation stricte des données, puis l'action (tables tableaudebord_* du propriétaire seulement).
// L'écriture d'une liste n'est PAS atomique : document après document, une panne au milieu laisse un état mixte (une partie écrite) et répond 500.
// Rejouer le même appel est sans danger : un relevé déjà écrit est ignoré (indicateurs) ou déjà présent (historique).
import { extraireBearer, doitNoterUsage } from './cles.js';
import { verifierCleTableau } from './cles-tableau.js';
import { ErreurAction, lancerAction } from './actions-veille.js';
import { ACTIONS_TABLEAU } from './actions-tableaudebord.js';
import { ErreurValidation } from './validation.js';
import { ErreurPorte, creerLimiteurMemoire } from './porte.js';

export const MODULE_TABLEAU = 'tableaudebord';

/**
 * `contexte` : 'crm' (base 1, propriétaire « interne », données à la racine) ou 'plateforme' (base 2, `clients/<propriétaire>`).
 * `donnees` : { lireCle, majCle, majDoc, creerSiAbsent } (adaptateur.js). `modulesActifs(propriétaire)` : liste des modules actifs.
 * Renvoie `traiter({ methode, authorization, corps })` -> { statut, corps }.
 */
export function creerPorteTableau({ contexte, donnees, modulesActifs, limiteur = creerLimiteurMemoire(), journal = () => {}, maintenant = Date.now }) {
  async function executer({ methode, authorization, corps }, infos) {
    if (methode !== 'POST') throw new ErreurPorte('methode_refusee', 'Seule la méthode POST est acceptée.', 405);
    const cle = extraireBearer(authorization);
    const verif = await verifierCleTableau(cle, (e) => donnees.lireCle(e));
    if (!verif.ok) { infos.code = `cle_${verif.raison}`; throw new ErreurPorte('cle_refusee', 'Clé refusée.', 401); }
    if (contexte === 'crm' && verif.proprietaire !== 'interne') { infos.code = 'proprietaire_inconnu'; throw new ErreurPorte('cle_refusee', 'Clé refusée.', 401); }
    infos.idCourt = verif.idCourt;
    infos.proprietaire = verif.proprietaire;
    if (doitNoterUsage({ dernierUsage: verif.dernierUsage }, maintenant())) {
      try { await donnees.majCle(verif.empreinte, { dernierUsage: new Date(maintenant()) }); } catch { /* la date de dernier usage n'est jamais une raison de refuser un appel */ }
    }
    limiteur.requete(verif.idCourt);

    if (corps === null || typeof corps !== 'object' || Array.isArray(corps)) throw new ErreurPorte('requete_invalide', 'Le corps doit être un objet JSON.', 400);
    for (const k of Object.keys(corps)) if (!['action', 'donnees'].includes(k)) throw new ErreurPorte('requete_invalide', `Champ inconnu : « ${k} ».`, 400);
    const { action: nomAction } = corps;
    if (typeof nomAction !== 'string' || !/^[a-zA-Z.]{1,40}$/.test(nomAction)) throw new ErreurPorte('requete_invalide', '« action » est obligatoire.', 400);
    const action = Object.hasOwn(ACTIONS_TABLEAU, nomAction) ? ACTIONS_TABLEAU[nomAction] : null;
    if (!action) throw new ErreurPorte('action_inconnue', 'Action inconnue.', 400);
    infos.module = MODULE_TABLEAU;
    infos.action = nomAction;

    const actifs = await modulesActifs(verif.proprietaire);
    if (!actifs.includes(MODULE_TABLEAU)) throw new ErreurPorte('module_non_actif', `Le module « ${MODULE_TABLEAU} » n'est pas actif pour cette clé.`, 403);

    const base = contexte === 'crm' ? '' : `clients/${verif.proprietaire}`;
    try {
      const resultat = await lancerAction(action, corps.donnees, { base, donnees, auteur: `github:${verif.idCourt}`, maintenant, proprietaire: verif.proprietaire });
      return { statut: 200, corps: { ok: true, resultat } };
    } catch (e) {
      if (e instanceof ErreurValidation) throw new ErreurPorte(e.code, e.message, 400);
      if (e instanceof ErreurAction) throw new ErreurPorte(e.code, e.message, e.statut);
      throw e;
    }
  }

  return async function traiter(requete) {
    const debut = maintenant();
    const infos = {};
    let statut;
    let reponse;
    try {
      reponse = await executer(requete, infos);
      statut = reponse.statut;
    } catch (e) {
      if (e instanceof ErreurPorte) {
        statut = e.statut;
        reponse = { statut, corps: { ok: false, erreur: e.code, message: e.message } };
      } else {
        statut = 500;
        infos.code = `erreur_${String(e?.name ?? 'inconnue').slice(0, 30)}`;
        reponse = { statut, corps: { ok: false, erreur: 'erreur_interne', message: 'Une erreur est survenue.' } };
      }
    }
    try { journal({ ...infos, statut, dureeMs: maintenant() - debut }); } catch { /* le journal ne casse jamais un appel */ }
    return reponse;
  };
}
