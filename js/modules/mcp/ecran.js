// Page d'information du module « Accès MCP » (lecture seule, aucun réglage) : lien de connexion à copier, mode d'emploi en trois lignes,
// membres autorisés avec leur rôle, lien vers le Journal des modifications. Texte affiché : toujours en texte simple (h() ne fabrique jamais de HTML).
import { h, icone, remplir, toast } from '../../os/ui.js';
import { lien } from '../../os/router.js';
import * as D from './donnees.js';
import * as L from './logique.js';

async function copier(texte, champ) {
  try {
    await navigator.clipboard.writeText(texte);
    toast('Lien copié.', { type: 'succes' });
  } catch {
    champ.focus();
    champ.select();
    toast('Sélectionne le lien et copie-le (Ctrl+C ou ⌘C).', { type: 'info' });
  }
}

/** Espace de Jérôme (racine) : adresse du MCP, connexion par compte Google, comptes fixés par Jérôme. Aucune lecture dans la base. */
function rendreInfosRacine(conteneur) {
  const adresse = L.lienConnexion(window.location.origin);
  const champ = h('input', { type: 'text', class: 'champ mcp-lien', readonly: true, value: adresse, 'aria-label': 'Adresse de connexion de l’IA', onfocus: (e) => e.target.select() });
  conteneur.append(h('div', { class: 'page page-mcp', dataset: { mcp: 'racine' } },
    h('header', { class: 'page-tete' }, h('h1', {}, 'Connecter l’assistant')),
    h('p', { class: 'aide' }, 'Cette page est informative : rien ne se règle ici.'),
    h('section', { class: 'mcp-bloc' },
      h('h2', {}, 'Adresse de connexion'),
      h('div', { class: 'mcp-copie' }, champ,
        h('button', { type: 'button', class: 'bouton bouton-principal', onclick: () => copier(adresse, champ) }, icone('copy', { taille: 16 }), 'Copier le lien'))),
    h('section', { class: 'mcp-bloc' },
      h('h2', {}, 'Comment l\'utiliser'),
      h('ol', { class: 'mcp-etapes' }, L.MODE_EMPLOI_RACINE.map((e) => h('li', {}, h('strong', {}, e.titre), ' : ', e.texte)))),
    h('section', { class: 'mcp-bloc' },
      h('h2', {}, 'Qui peut se connecter'),
      h('p', { class: 'aide' }, L.PHRASE_COMPTES_RACINE)),
    h('section', { class: 'mcp-bloc' },
      h('h2', {}, 'Suivre ce que fait l\'IA'),
      h('p', { class: 'aide' }, 'Chaque modification faite par l\'IA apparaît dans le Journal des modifications, avec son nom.'),
      h('p', { class: 'aide' }, h('a', { href: lien('crm/journal') }, icone('history', { taille: 14 }), ' Journal des modifications')))));
  return () => {};
}

export function rendreInfos(conteneur) {
  const client = D.clientCourant();
  if (!client) return rendreInfosRacine(conteneur);
  const adresse = L.lienConnexion(window.location.origin, client);
  let ferme = false;

  const champ = h('input', { type: 'text', class: 'champ mcp-lien', readonly: true, value: adresse, 'aria-label': 'Lien de connexion de ton espace', onfocus: (e) => e.target.select() });
  const membres = h('ul', { class: 'mcp-membres' }, h('li', { class: 'aide' }, 'Chargement…'));
  const journal = h('p', { class: 'aide' });

  conteneur.append(h('div', { class: 'page page-mcp' },
    h('header', { class: 'page-tete' }, h('h1', {}, 'Connecter l’assistant')),
    h('p', { class: 'aide' }, 'Cette page est informative : rien ne se règle ici. Le module « Accès MCP » s\'allume ou s\'éteint pour ton espace, il n\'a pas de réglage à toi.'),
    h('section', { class: 'mcp-bloc' },
      h('h2', {}, 'Ton lien de connexion'),
      h('div', { class: 'mcp-copie' }, champ,
        h('button', { type: 'button', class: 'bouton bouton-principal', onclick: () => copier(adresse, champ) }, icone('copy', { taille: 16 }), 'Copier le lien'))),
    h('section', { class: 'mcp-bloc' },
      h('h2', {}, 'Comment l\'utiliser'),
      h('ol', { class: 'mcp-etapes' }, L.MODE_EMPLOI.map((e) => h('li', {}, h('strong', {}, e.titre), ' : ', e.texte)))),
    h('section', { class: 'mcp-bloc' },
      h('h2', {}, 'Qui peut se connecter'),
      h('p', { class: 'aide' }, 'Les membres de ton espace, avec leur rôle. Pour en ajouter ou en retirer, demande à la personne qui gère ton espace.'),
      membres),
    h('section', { class: 'mcp-bloc' },
      h('h2', {}, 'Suivre ce que fait l\'IA'),
      journal)));

  Promise.all([D.lireMembres(), D.lireModulesActifs()]).then(([docs, actifs]) => {
    if (ferme) return;
    const lignes = L.lignesMembres(docs, D.compteCourant()?.email);
    remplir(membres, lignes.length
      ? lignes.map((m) => h('li', { class: 'mcp-membre' },
        h('span', { class: 'mcp-membre-nom' }, m.nom ? `${m.nom} · ${m.email}` : m.email, m.moi ? ' (toi)' : ''),
        h('span', { class: `mcp-role mcp-role-${m.role}` }, m.libelle)))
      : h('li', { class: 'aide' }, 'Aucun membre trouvé.'));
    remplir(journal, actifs.includes('affaires')
      ? [h('span', {}, 'Chaque modification faite par l\'IA apparaît dans le Journal des modifications, avec son nom. '),
        h('a', { href: lien('crm/journal') }, icone('history', { taille: 14 }), ' Ouvrir le Journal des modifications')]
      : 'Le Journal des modifications n\'est pas activé dans ton espace.');
  }).catch((e) => {
    console.warn('Page MCP : lecture impossible', e?.code);
    if (ferme) return;
    remplir(membres, h('li', { class: 'aide' }, 'Impossible de charger la liste pour le moment.'));
    remplir(journal, '');
  });

  return () => { ferme = true; };
}
