// Identité de la page chez un client (chantier 6) : titre d'onglet, description, icône, nom de l'appli installée, couleur d'accent.
// index.html porte l'identité de Jérôme (titre « Chevalier IA OS », baguette, manifeste) : chez un client, tout cela est remplacé
// par la marque lue dans marques/<client>. Le CRM de Jérôme n'appelle jamais ce fichier. La logique pure est dans marque.js (testée seule).
import { MARQUE_NEUTRE, feuilleAccent, iconeInitiale, manifesteClient } from './marque.js';

function balise(selecteur, creer) {
  let el = document.head.querySelector(selecteur);
  if (!el && creer) { el = creer(); document.head.append(el); }
  return el;
}

function lien(rel, href, type) {
  const el = balise(`link[rel="${rel}"]`, () => Object.assign(document.createElement('link'), { rel }));
  el.setAttribute('href', href);
  if (type) el.setAttribute('type', type); else el.removeAttribute('type');
  return el;
}

/**
 * Remplace l'identité de Jérôme par celle du client : titre, description, nom de l'appli iOS, icône (logo ou initiale),
 * manifeste (nom et adresse de départ du client), puis l'accent de l'interface (feuille de style + attribut `data-marque`).
 * `client` = identifiant du client ; sans lui, seuls les éléments sans adresse sont mis à jour.
 */
export function appliquerIdentite(marque, client = null) {
  const m = marque || MARQUE_NEUTRE;
  document.title = m.nom;
  balise('meta[name="description"]')?.setAttribute('content', m.nom);
  balise('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', [...m.nom].slice(0, 12).join(''));
  if (m.logo) {
    lien('icon', m.logo);
    lien('apple-touch-icon', m.logo);
  } else {
    lien('icon', iconeInitiale(m), 'image/svg+xml');
    balise('link[rel="apple-touch-icon"]')?.remove(); // l'icône de Jérôme ne reste jamais
  }
  if (client) {
    try {
      const blob = new Blob([JSON.stringify(manifesteClient(m, client, location.origin))], { type: 'application/manifest+json' });
      lien('manifest', URL.createObjectURL(blob));
    } catch {
      balise('link[rel="manifest"]')?.remove();
    }
  } else {
    balise('link[rel="manifest"]')?.remove();
  }
  let feuille = document.getElementById('accent-marque');
  if (!feuille) { feuille = document.createElement('style'); feuille.id = 'accent-marque'; document.head.append(feuille); }
  feuille.textContent = feuilleAccent(m.couleur);
  document.documentElement.setAttribute('data-marque', client || 'neutre');
}
