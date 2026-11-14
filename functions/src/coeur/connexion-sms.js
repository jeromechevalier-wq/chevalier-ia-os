// Connexion ClickSend d'un espace saisie depuis Réglages > Rendez-vous (décision de Jérôme du 14/11/2026) : l'écran ne fait que demander ; ce fichier vérifie la clé auprès de ClickSend,
// puis range { identifiant, cle, jeton, expediteur? } dans Secret Manager (secret CLICKSEND_RDV[_client], lu par coeur/sms-direct.js). La clé n'est JAMAIS renvoyée, ni journalisée, ni écrite ailleurs.
// Le jeton de l'adresse des réponses est fabriqué ici (aléatoire, 43 caractères) et gardé tant qu'on ne demande pas de le changer : la règle « SMS entrants » de ClickSend reste valable.
// Seul Jérôme peut appeler ces fonctions (contrôle d'identité côté serveur, dans rdv-connexion-appel.js et functions-plateforme/src/rdv.js). La réponse contient l'adresse complète des réponses
// (avec le jeton) : elle n'est rendue qu'à lui.
import { randomBytes } from 'node:crypto';
import { nomDuSecret, lireConnexion, MOTIF_EXPEDITEUR, ESPACE_JEROME } from './sms-direct.js';
import { ErreurEcritureSecret } from '../securite/ecrire-secret.js';

const SANS_CONTROLE = /[\u0000-\u001f\u007f]/;

/** Erreur « métier » : code stable (invalid-argument, failed-precondition) et message lisible. */
export class ErreurConnexionSms extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ErreurConnexionSms';
    this.code = code;
  }
}

/**
 * `lireSecret(nom)` / `ecrireSecret(nom, texte)` : Secret Manager ; `verifier({ identifiant, cle })` : verifierConnexion de sms-direct.js ;
 * `adresseDe(espace, jeton)` : l'adresse complète des réponses ; `espaceRacine` : voir creerSmsDirect.
 */
export function creerConnexionSms({ lireSecret, ecrireSecret, verifier, adresseDe, espaceRacine = ESPACE_JEROME, aleatoire = () => randomBytes(32).toString('base64url') }) {
  // Seule une ABSENCE vraie (secret ou version introuvable, version désactivée) ou un contenu illisible veut dire « pas de connexion ». Toute autre panne de lecture (réseau, droits) est une erreur :
  // rien n'est écrit (sinon un nouveau jeton serait fabriqué et l'adresse collée dans ClickSend ne marcherait plus) et l'écran ne dit pas « pas enregistrée » à tort.
  const existant = async (espace) => {
    let texte;
    try { texte = await lireSecret(nomDuSecret(espace, espaceRacine)); } catch (e) {
      if (e?.code === 5 || e?.code === 9) return null; // NOT_FOUND, FAILED_PRECONDITION (version désactivée ou détruite)
      throw new ErreurConnexionSms('failed-precondition', e?.code === 7
        ? 'Le serveur n’a pas le droit de lire la connexion : voir docs/rdv-sms-clicksend.md (droits Secret Manager). Rien n’a été modifié.'
        : 'La lecture de la connexion n’a pas abouti. Réessaie dans un instant : rien n’a été modifié.');
    }
    return lireConnexion(texte);
  };
  const ecrire = async (espace, contenu) => {
    try { await ecrireSecret(nomDuSecret(espace, espaceRacine), JSON.stringify(contenu)); } catch (e) {
      if (e instanceof ErreurEcritureSecret && e.genre === 'permission') throw new ErreurConnexionSms('failed-precondition', 'Le serveur n’a pas le droit d’enregistrer la connexion : voir docs/rdv-sms-clicksend.md (droits Secret Manager).');
      throw new ErreurConnexionSms('failed-precondition', 'L’enregistrement n’a pas abouti. Réessaie dans un instant.');
    }
  };
  const texteSur = (v, max) => (typeof v === 'string' && v.trim() && v.trim().length <= max && !SANS_CONTROLE.test(v) ? v.trim() : null);

  return {
    /** { enregistre, expediteur } : jamais la clé, jamais l'adresse des réponses (elle n'est rendue que sur demande : `adresse`). */
    async etat(espace) {
      const c = await existant(espace);
      return { enregistre: c !== null, expediteur: c?.expediteur ?? '' };
    },

    /** L'adresse des réponses (avec son jeton secret), sur demande. Rend { adresse } ; « pas encore enregistrée » si la connexion n'existe pas. */
    async adresse(espace) {
      const c = await existant(espace);
      if (!c) throw new ErreurConnexionSms('failed-precondition', 'La connexion n’est pas encore enregistrée.');
      return { adresse: adresseDe(espace, c.jeton) };
    },

    /** Enregistre l'identifiant et la clé (vérifiés auprès de ClickSend). Le jeton existant est gardé, sauf `regenererAdresse`. Rend { ok, adresse, adresseChangee }. */
    async enregistrer(espace, { identifiant, cle, expediteur = '', regenererAdresse = false } = {}) {
      const id = texteSur(identifiant, 200);
      const k = texteSur(cle, 200);
      if (!id) throw new ErreurConnexionSms('invalid-argument', 'Écris l’identifiant ClickSend.');
      if (!k) throw new ErreurConnexionSms('invalid-argument', 'Écris la clé d’API ClickSend.');
      if (expediteur !== undefined && expediteur !== null && typeof expediteur !== 'string') throw new ErreurConnexionSms('invalid-argument', 'Le nom d’expéditeur doit être un texte.');
      const exp = typeof expediteur === 'string' ? expediteur.trim() : '';
      if (exp && !MOTIF_EXPEDITEUR.test(exp)) throw new ErreurConnexionSms('invalid-argument', 'Le nom d’expéditeur doit faire 11 caractères au plus (lettres et chiffres), ou être un numéro.');
      const verdict = await verifier({ identifiant: id, cle: k });
      if (!verdict.ok) {
        throw new ErreurConnexionSms('failed-precondition', verdict.raison === 'refusee'
          ? 'ClickSend refuse cet identifiant ou cette clé. Rien n’a été enregistré.'
          : 'ClickSend ne répond pas pour l’instant. Rien n’a été enregistré : réessaie dans un moment.');
      }
      const avant = await existant(espace);
      const changee = !avant || regenererAdresse === true;
      const jeton = changee ? aleatoire() : avant.jeton;
      await ecrire(espace, { identifiant: id, cle: k, jeton, ...(exp ? { expediteur: exp } : {}) });
      return { ok: true, adresse: adresseDe(espace, jeton), adresseChangee: changee };
    },

    /** Change seulement le jeton de l'adresse des réponses (fuite, doute) : il faudra mettre à jour la règle « SMS entrants » de ClickSend. Rend { ok, adresse, adresseChangee: true }. */
    async regenererAdresse(espace) {
      const avant = await existant(espace);
      if (!avant) throw new ErreurConnexionSms('failed-precondition', 'La connexion n’est pas encore enregistrée.');
      const jeton = aleatoire();
      await ecrire(espace, { identifiant: avant.identifiant, cle: avant.cle, jeton, ...(avant.expediteur ? { expediteur: avant.expediteur } : {}) });
      return { ok: true, adresse: adresseDe(espace, jeton), adresseChangee: true };
    },
  };
}

export const REFUS_NEUTRE = 'Action non autorisée.';

/** Exécute une demande de connexion DÉJÀ autorisée (le contrôle d'identité est fait par l'appelant) : rend le résultat, ou lève ErreurConnexionSms. */
export async function executerConnexion(connexion, espace, d) {
  if (d.action === 'etat') return connexion.etat(espace);
  if (d.action === 'adresse') return connexion.adresse(espace);
  if (d.action === 'enregistrer') return connexion.enregistrer(espace, { identifiant: d.identifiant, cle: d.cle, expediteur: d.expediteur, regenererAdresse: d.regenererAdresse === true });
  if (d.action === 'regenerer') return connexion.regenererAdresse(espace);
  throw new ErreurConnexionSms('invalid-argument', 'Action inconnue.');
}
