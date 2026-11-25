// Écriture d'un secret NOMMÉ dans Secret Manager (nouvelle version), à l'exécution. Sert à ranger la connexion ClickSend saisie dans Réglages > Rendez-vous
// (coeur/connexion-sms.js) : la clé n'est jamais écrite dans Firestore, dans le dépôt, ni renvoyée à l'écran.
// Droits du compte d'exécution : « Version de secret : ajout » sur le secret (ou « Administrateur Secret Manager » pour que le secret soit aussi créé tout seul).
// Aucune valeur n'est journalisée ni gardée ici ; les erreurs rendues ne contiennent jamais le texte écrit.
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { projetCourant } from './maison.js';

/** genre : permission | indisponible */
export class ErreurEcritureSecret extends Error {
  constructor(genre) {
    super(genre === 'permission' ? 'Le serveur n’a pas le droit d’écrire ce secret.' : 'Secret Manager ne répond pas.');
    this.name = 'ErreurEcritureSecret';
    this.genre = genre;
  }
}
const traduire = (e) => new ErreurEcritureSecret(e?.code === 7 ? 'permission' : 'indisponible'); // 7 = PERMISSION_DENIED

/** `client` : réservé aux essais (faux client Secret Manager). `projet` : celui de la fonction par défaut, lu à l'appel (projet inconnu = refus). Rend `ecrire(nom, texte)`. */
export function creerEcrivainSecrets({ projet = null, client = null } = {}) {
  let c = client;
  return async function ecrire(nom, texte) {
    if (typeof nom !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(nom)) throw new Error('Nom de secret invalide');
    if (typeof texte !== 'string' || !texte) throw new Error('Texte du secret invalide');
    const projetVise = projet ?? projetCourant();
    c ??= new SecretManagerServiceClient();
    const ajouter = () => c.addSecretVersion({ parent: `projects/${projetVise}/secrets/${nom}`, payload: { data: Buffer.from(texte, 'utf8') } });
    try { await ajouter(); return; } catch (e) { if (e?.code !== 5) throw traduire(e); } // 5 = NOT_FOUND : le secret n'existe pas encore
    try { await c.createSecret({ parent: `projects/${projetVise}`, secretId: nom, secret: { replication: { automatic: {} } } }); } catch (e) { if (e?.code !== 6) throw traduire(e); } // 6 = ALREADY_EXISTS : créé entre-temps
    try { await ajouter(); } catch (e) { throw traduire(e); }
  };
}
