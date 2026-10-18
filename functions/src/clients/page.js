// Écran « Autoriser … à accéder à … » d'un client : la page de Jérôme (oauth/page.js) avec le nom, le logo et la couleur du client.
// La marque arrive déjà nettoyée (js/os/marque.js : couleur #rrggbb, logo en https seulement) ; rien d'autre n'entre dans la feuille de style.
import { pageAutorisation, echapper } from '../oauth/page.js';
import { CONFIG_FIREBASE_PLATEFORME, adressesClient, assistantDeRedirection } from './config.js';
import { texteSur } from '../../partage/marque.js';

/** `demande` : demande OAuth déjà validée ; `espace` : { client, marque }. */
export function pageAutorisationClient(demande, espace) {
  const { marque, client } = espace;
  const assistant = assistantDeRedirection(demande.redirect_uri);
  const c = marque.couleur;
  const style = `main{border-top:6px solid ${c}}button.principal{background:${c};border-color:${c};color:${texteSur(c)}}`;
  const logo = marque.logo ? `<p><img src="${echapper(marque.logo)}" alt="" style="max-height:48px;max-width:100%"></p>` : '';
  return pageAutorisation(demande, {
    titre: `Autoriser ${assistant.nom} à accéder à ${marque.nom} ?`,
    titreOnglet: `Autoriser ${assistant.nom} · ${marque.nom}`,
    entete: logo,
    styleEnPlus: style,
    urlApprouver: adressesClient(client).approuver,
    configFirebase: CONFIG_FIREBASE_PLATEFORME,
    droits: `<p><strong>Cette application va pouvoir, selon ton rôle dans cet espace :</strong></p>
    <p>si tu es <strong>lecteur</strong> : consulter les fiches, notes et projets ;<br>si tu es <strong>éditeur</strong> : les consulter, en créer, les modifier et les <strong>supprimer</strong> (récupérable).</p>`,
    pied: `Pour couper cet accès, retire le connecteur dans ${assistant.nom}, ou demande à la personne qui gère ton espace de le couper.`,
  });
}
