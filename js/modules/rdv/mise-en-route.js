// Carte « Mise en route de l'envoi des SMS » (Réglages > Rendez-vous) : quatre étapes dépliables, dans l'ordre, qui disent quoi faire chez ClickSend et dans la console Google.
// Texte seulement : rien n'est appelé ici, aucune clé n'est lue ni gardée. Même carte chez Jérôme et chez les clients ; l'étape 2 (console Google) ne se déplie que pour le compte
// qui peut régler la connexion, les autres lisent « réglée par l'administrateur de la plateforme ». Aucun nom de projet ni de compte de service n'est écrit ici (dépôt public).
import { h, icone } from '../../os/ui.js';
import { lirePlage } from './logique.js';

const heure = (m) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;

/**
 * Une étape : titre avec un voyant (`etat` : 'vert' fait, 'gris' à faire ou inconnu), corps dépliable.
 * `ouverte` : l'étape à faire en premier reste dépliée.
 */
const choix = {}; // étapes que la personne a ouvertes ou fermées : la carte se redessine (connexion enregistrée, numéro réglé), son choix reste
function etape(numero, titre, etat, ouverte, ...contenu) {
  const bloc = h('details', { class: `rdv-mise-etape ${etat}`, dataset: { role: `mise-etape-${numero}`, etat } },
    h('summary', {}, icone(etat === 'vert' ? 'circle-check' : 'circle-help', { taille: 18 }), h('span', {}, `Étape ${numero} : ${titre}`)),
    h('div', { class: 'rdv-mise-corps' }, ...contenu));
  bloc.open = numero in choix ? choix[numero] : !!ouverte;
  let connu = bloc.open; // seul un vrai clic change l'état connu : le « toggle » déclenché par l'ouverture d'office ne compte pas comme un choix
  bloc.addEventListener('toggle', () => { if (bloc.open === connu) return; connu = bloc.open; choix[numero] = connu; });
  return bloc;
}

/**
 * @param {{ peutConfigurer: boolean|null, branche: boolean|null, numeroTest: string, plage: object|null }} etat
 *   `peutConfigurer` : le compte peut régler la connexion (le serveur le dit) ; `branche` : l'envoi est branché (la connexion est enregistrée) ;
 *   `numeroTest` : le « numéro des SMS de test » réglé (chaîne vide sinon) ; `plage` : la plage d'envoi réglée.
 */
export function miseEnRoute({ peutConfigurer = null, branche = null, numeroTest = '', plage = null } = {}) {
  const admin = peutConfigurer === true; // tant que le serveur n'a pas répondu, on ne montre pas le détail de la console Google
  const { debut, fin } = lirePlage(plage);
  const fait2 = branche === true;
  const fait4 = fait2 && !!numeroTest;
  const premiere = !fait2 && admin ? 1 : (!fait4 ? 4 : 0); // l'étape à faire en premier reste ouverte
  return [
    h('p', { class: 'aide' }, 'Quatre étapes, dans l’ordre. Chaque étape se déplie. Le voyant vert veut dire « fait ».'),
    etape(1, 'le compte ClickSend', fait2 ? 'vert' : 'gris', premiere === 1,
      !admin ? h('p', { class: 'aide' }, 'Le compte ClickSend et sa clé sont gérés par l’administrateur de la plateforme.') : h('ol', { class: 'rdv-aide-etapes' },
        h('li', {}, 'Ouvre le compte ClickSend de l’entreprise (dashboard.clicksend.com). C’est avec lui que partent les SMS.'),
        h('li', {}, 'Regarde le crédit : « Balance » en haut de la page. Un compte neuf a peu de crédit d’essai ; recharge-le si besoin.'),
        h('li', {}, 'Note le « Username » (le nom d’utilisateur de l’API, souvent l’adresse e-mail du compte) et repère la clé d’API : menu « Developers » puis « API Credentials », ou « Account settings » puis « Subaccounts », colonne « API key » (bouton œil).'),
        h('li', {}, 'Copie la clé avec son bouton de copie. Le mot de passe du compte ne sert à rien ici : ne le saisis nulle part dans l’application.'),
        h('li', {}, 'Ne montre la clé à personne : ni par e-mail, ni dans une conversation, ni sur une capture d’écran.'))),
    etape(2, 'brancher la connexion', fait2 ? 'vert' : 'gris', premiere === 2,
      !admin
        ? h('p', { class: 'aide' }, 'La connexion au service d’envoi est réglée par l’administrateur de la plateforme.')
        : h('ol', { class: 'rdv-aide-etapes' },
          h('li', {}, 'Une seule fois par espace, dans la console Google (', 'Secret Manager', ') : vérifie le nom du projet en haut de la page, puis « Créer un secret ». Nom : « CLICKSEND_RDV » (pour l’espace d’un client : « CLICKSEND_RDV_ » suivi de l’identifiant de l’espace). Valeur : « a » (provisoire, elle sera remplacée).'),
          h('li', {}, 'Ouvre ce secret, onglet « Autorisations », « Accorder l’accès » : choisis le compte de service qui exécute les fonctions du serveur (chez un client : « Compute Engine par défaut », adresse qui se termine par « -compute@developer.gserviceaccount.com » ; pour l’espace de l’administrateur : le compte dédié aux fonctions du serveur) avec deux rôles seulement : « Accesseur de secrets » et « Ajouteur de versions de secret ». Jamais « Administrateur », ni au niveau du projet. Enregistre.'),
          h('li', {}, 'Reviens à la carte « Connexion SMS (ClickSend) » plus bas : écris l’identifiant, colle la clé, puis « Enregistrer la connexion ». La clé est vérifiée auprès de ClickSend avant d’être rangée ; une mauvaise clé n’est jamais enregistrée.'),
          h('li', {}, 'Si l’écran répond « Le serveur n’a pas le droit… », un des deux premiers gestes manque : rien n’a été modifié, recolle la clé et réessaie. Le bouton « Envoyer » met jusqu’à une minute à s’activer.'))),
    etape(3, 'les réponses et les STOP', 'gris', false,
      !admin ? h('p', { class: 'aide' }, 'L’adresse des réponses et la règle chez ClickSend sont réglées par l’administrateur de la plateforme. Ton test : réponds au SMS des créneaux, puis « STOP » (voir l’étape 4).') : h('ol', { class: 'rdv-aide-etapes' },
        h('li', {}, 'Dans la carte « Connexion SMS (ClickSend) », clique sur « Afficher l’adresse des réponses ». Cette adresse est un secret de fait : son code est sa seule protection. Ne la colle que dans ClickSend.'),
        h('li', {}, 'Ouvre ', 'dashboard.clicksend.com', ' (menu « SMS », puis « Inbound Rules »).'),
        h('li', {}, 'Désactive les deux règles que ClickSend crée d’office pour le mot « stop » : « Send to messenger » et « Opt-out contact ». Ouvre chacune et décoche « Enabled ». Sinon le STOP reste chez ClickSend et n’arrive jamais ici.'),
        h('li', {}, 'Crée une règle (ou transforme la « Default rule ») : « Dedicated number » = ANY, « Action » = URL, méthode POST, « Action address » = l’adresse des réponses, « Match for » vide, « Enabled » coché. Enregistre.'))),
    etape(4, 'le premier test', fait4 ? 'vert' : 'gris', premiere === 4,
      h('ol', { class: 'rdv-aide-etapes' },
        h('li', {}, 'Règle « Numéro des SMS de test » (carte « Numéros qui reçoivent les alertes ») avec ton mobile : un rendez-vous de test envoie tous ses SMS à ce numéro seulement, jamais aux participants.'),
        h('li', {}, 'Allume le mode test de l’application, crée un rendez-vous (il porte alors « test »), puis « Envoyer les propositions ». Les SMS partent dans la plage d’envoi réglée (' + heure(debut) + ' à ' + heure(fin) + ', heure de Paris) : hors plage, la fiche dit à quelle heure ils partiront. Chaque participant du rendez-vous de test envoie un SMS à ton mobile : deux participants, deux SMS identiques.'),
        h('li', {}, 'Réponds au SMS des créneaux (par exemple « 1 ») : la réponse doit apparaître dans l’historique de la fiche en quelques secondes.'),
        h('li', {}, 'Réponds ensuite « STOP » : le numéro doit apparaître dans la carte « Numéros désinscrits (STOP) ». Le bouton « Réautoriser » le remet en circuit ; ClickSend peut aussi bloquer de son côté, il faut alors vider aussi sa liste d’opt-out chez lui.'))),
  ];
}
