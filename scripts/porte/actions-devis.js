// Actions de la porte pour le module Devis : « Préparer l'e-mail » (un workflow n8n crée un BROUILLON Gmail avec le PDF ; personne n'envoie rien tant que le client n'a pas cliqué dans Gmail).
//  - devis.lireEmail         : le workflow relit ce qu'il doit mettre dans le brouillon (adresses, sujet, message, lien du PDF valable 10 minutes). Aucun prix d'achat, aucune marge,
//                              aucun chemin de stockage, aucune empreinte : la liste des champs est écrite dans coeur/devis-email.js ;
//  - devis.noterEmailPrepare : le workflow dit « fait » (avec l'identifiant du brouillon Gmail) ou « raté » : le serveur écrit `emailPrepare` sur le devis et clôt la ligne de la demande.
//                              Il n'écrit JAMAIS l'historique des envois (`envois`) et ne change JAMAIS le statut du devis.
// Une action n'agit que sur les devis de l'espace de la clé (`base` : '' chez Jérôme, « clients/<id> » chez un client) et seulement pour une demande (`demandeId`) faite à l'écran
// il y a moins de 15 minutes (lecture) ou 1 heure (note). Le travail est fait par le service `devis` que la fonction donne à la porte (functions/src/coeur/devis-email.js) :
// ce fichier valide et traduit les erreurs, rien de plus. Le journal de la porte ne reçoit jamais le résultat (adresses, lien du PDF).
import { ErreurAction } from './actions-veille.js';

const CODES_STATUT = { introuvable: 404, demande_inconnue: 404, demande_invalide: 400 };

/** Erreur métier du service (code, message lisible) -> erreur de la porte. Une panne inattendue n'est pas traduite (réponse 500 neutre). */
function enErreurAction(e) {
  if (e?.name === 'ErreurDevis') return new ErreurAction(e.code, e.message, CODES_STATUT[e.code] ?? 409);
  return e;
}

function service(ctx) {
  const s = ctx.services?.devis?.(ctx.base);
  if (!s) throw new ErreurAction('devis_non_branche', 'Le module Devis n\'est pas branché sur cette porte.', 503);
  return s;
}

/** ctx : { base, donnees, auteur, maintenant, services }. */
export const ACTIONS_DEVIS = Object.freeze({
  'devis.lireEmail': {
    ecrit: false,
    schema: {
      devisId: { type: 'id', requis: true },
      demandeId: { type: 'idsur', requis: true },
    },
    async executer(ctx, d) {
      try { return await service(ctx).lireEmail(d); } catch (e) { throw enErreurAction(e); }
    },
  },

  'devis.noterEmailPrepare': {
    ecrit: true,
    schema: {
      devisId: { type: 'id', requis: true },
      demandeId: { type: 'idsur', requis: true },
      brouillonGmailId: { type: 'id' },
      statut: { type: 'choix', valeurs: ['ok', 'echec'], requis: true },
      message: { type: 'libre', max: 200 },
    },
    async executer(ctx, d) {
      try {
        const r = await service(ctx).noterEmailPrepare(d, ctx.auteur);
        return { devisId: d.devisId, demandeId: d.demandeId, statut: d.statut, deja: r.deja === true };
      } catch (e) { throw enErreurAction(e); }
    },
  },
});
