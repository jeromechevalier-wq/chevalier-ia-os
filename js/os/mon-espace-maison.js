// Réglages > « Mon espace » dans une MAISON de client (27/11/2026, chantier « applications dans la coque ») : le nom de l'espace et son logo.
// Le nom est affiché en haut à gauche (menu, barre du haut), dans l'onglet et sur la page de connexion ; le logo à gauche du nom et sur la page de connexion.
// Les deux vivent dans reglages_maison/public (lu avant la connexion, par tout le monde) : rien de confidentiel. UN bouton « Enregistrer » pour les deux.
// Qui peut enregistrer (27/11/2026, accord de Jérôme) : tout compte de la maison qui peut écrire, plus seulement le titulaire (règles Firestore : compteAutorise et
// identiteMaisonValide ; js/os/identite-maison.js : identiteMaisonModifiable). Chaque changement est noté dans le journal (qui, quand, ancien et nouveau nom ; « logo changé »,
// jamais l'image). Un compte en lecture seule ne voit pas ce formulaire (Mon espace en lecture seule, js/os/reglages.js) ; un refus du serveur est dit clairement, rien n'est perdu.
// Chez Jérôme (maison sans nom_espace ni connexion_neutre) cet écran n'existe pas : l'identité de la coque y reste en lecture seule (js/os/reglages.js).
import { h, icone, remplir, toast } from './ui.js';
import { LONGUEUR_NOM_MAX, nomRange, nomEspaceMaison, logoMaison, connexionNeutreDemandee, retenirPublic, nomAfficheMaison } from './identite-maison.js';
import { preparerLogoMaison, TYPES_LOGO_MAISON, AIDE_LOGO_MAISON } from './logo-maison.js';
import { enregistrerIdentiteMaison } from './mon-espace-maison-donnees.js';

const AIDE_PUBLIC = 'Le nom et le logo sont visibles par tout le monde sur la page de connexion, même sans compte. N’y mets rien de confidentiel. Chaque changement est noté dans le journal.';

/** Section « Mon espace » d'une maison. `ctx` : { editeur, surMarque({ nom, logo }) } ; `etat` : { vivant } (plus rien ne s'affiche après avoir quitté la page). */
export function sectionMonEspaceMaison(ctx, etat) {
  const modifiable = ctx.editeur !== false;
  let logoCourant = logoMaison(); // ce qui est enregistré
  let logoChoisi; // undefined = inchangé ; null = retrait demandé ; texte = nouveau logo choisi, pas encore enregistré
  const nom = h('input', { type: 'text', class: 'champ', id: 'mon-espace-nom', name: 'nom', value: nomEspaceMaison(), maxlength: String(LONGUEUR_NOM_MAX), autocomplete: 'off', 'aria-label': 'Nom', dataset: { champ: 'nom' } });
  const erreurNom = h('p', { class: 'mon-espace-erreur-champ', role: 'alert', hidden: true, dataset: { role: 'erreur-nom' } });
  const zoneLogo = h('div', { class: 'mon-espace-logo-bloc' });
  const messageLogo = h('p', { class: 'mon-espace-erreur-champ', role: 'alert', hidden: true, dataset: { role: 'message-logo' } });
  const fichierLogo = h('input', { type: 'file', accept: TYPES_LOGO_MAISON, hidden: true, dataset: { role: 'fichier-logo' }, 'aria-label': 'Fichier du logo' });
  const message = h('p', { class: 'mon-espace-message', role: 'status', dataset: { role: 'message-enregistrement' } });
  const boutonEnregistrer = h('button', { type: 'submit', class: 'bouton bouton-principal', dataset: { action: 'enregistrer' } }, 'Enregistrer');
  const montrer = (el, texte) => { el.textContent = texte ?? ''; el.hidden = !texte; };
  const logoAffiche = () => (logoChoisi === undefined ? logoCourant : logoChoisi);

  // « Retirer » : un logo choisi mais pas encore enregistré est simplement abandonné (le logo enregistré revient) ; sinon le retrait du logo enregistré est demandé
  // et ne part qu'avec « Enregistrer » (rien n'est perdu avant).
  function majLogo() {
    const url = logoAffiche();
    remplir(zoneLogo,
      url
        ? h('img', { class: 'mon-espace-logo', src: url, alt: 'Logo de l’espace', dataset: { role: 'logo-image' } })
        : h('span', { class: 'mon-espace-logo mon-espace-logo-vide', dataset: { role: 'logo-vide' }, 'aria-hidden': 'true' }, icone('image', { taille: 24 })),
      h('div', { class: 'mon-espace-logo-actions' },
        url ? null : h('span', { class: 'aide', dataset: { role: 'pas-de-logo' } }, 'Pas de logo : le logo par défaut est affiché.'),
        logoChoisi !== undefined ? h('span', { class: 'aide', dataset: { role: 'logo-apercu' } }, logoChoisi ? 'Aperçu : il sera enregistré avec le bouton « Enregistrer ».' : 'Le logo sera retiré avec le bouton « Enregistrer ».') : null,
        h('div', { class: 'mon-espace-boutons' },
          modifiable ? h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'choisir-logo' }, onclick: () => fichierLogo.click() }, icone('upload', { taille: 16 }), 'Choisir un logo') : null,
          modifiable && url ? h('button', { type: 'button', class: 'bouton bouton-discret', dataset: { action: 'retirer-logo' }, onclick: () => { logoChoisi = typeof logoChoisi === 'string' ? undefined : (logoCourant ? null : undefined); montrer(messageLogo, ''); majLogo(); } }, icone('trash-2', { taille: 16 }), 'Retirer') : null),
        h('span', { class: 'aide' }, AIDE_LOGO_MAISON)));
  }

  async function choisirLogo() {
    const fichier = fichierLogo.files?.[0];
    fichierLogo.value = '';
    montrer(messageLogo, '');
    if (!fichier) return;
    let verdict;
    try {
      verdict = preparerLogoMaison(new Uint8Array(await fichier.arrayBuffer()));
    } catch {
      verdict = { ok: false, message: 'Ce fichier n’a pas pu être lu. Choisis-en un autre.' };
    }
    if (!etat.vivant) return;
    if (!verdict.ok) { montrer(messageLogo, verdict.message); return; }
    logoChoisi = verdict.logo;
    majLogo();
  }
  fichierLogo.addEventListener('change', choisirLogo);

  async function enregistrer(e) {
    e.preventDefault();
    montrer(erreurNom, '');
    montrer(message, '');
    const nomPropre = nomRange(nom.value);
    if (!nomPropre) { montrer(erreurNom, 'Écris un nom : il est affiché en haut à gauche et sur la page de connexion.'); nom.focus(); return; }
    boutonEnregistrer.disabled = true;
    try {
      await enregistrerIdentiteMaison({ nom: nomPropre, logo: logoChoisi });
      if (logoChoisi !== undefined) logoCourant = logoChoisi || '';
      logoChoisi = undefined;
      retenirPublic({ nom_espace: nomPropre, connexion_neutre: connexionNeutreDemandee(), logo: logoCourant || undefined }); // la mémoire de la page suit ce qui vient d'être enregistré
      ctx.surMarque?.({ nom: nomAfficheMaison(), logo: logoMaison() });
      if (!etat.vivant) return;
      nom.value = nomPropre;
      majLogo();
      montrer(message, 'Enregistré. Les autres appareils le verront au prochain chargement de la page.');
      toast('Enregistré');
    } catch (err) {
      if (etat.vivant) montrer(message, err.message);
    } finally {
      boutonEnregistrer.disabled = false;
    }
  }

  majLogo();
  const champs = h('fieldset', { class: 'mon-espace-champs', disabled: !modifiable },
    h('div', { class: 'mon-espace-champ' },
      h('label', { class: 'etiquette-champ', for: 'mon-espace-nom' }, 'Nom'),
      nom, erreurNom,
      h('p', { class: 'aide' }, 'Affiché en haut à gauche, dans l’onglet et sur la page de connexion. Un nom court se lit mieux.')),
    h('div', { class: 'mon-espace-champ' },
      h('span', { class: 'etiquette-champ' }, 'Logo'),
      zoneLogo, messageLogo, fichierLogo,
      h('p', { class: 'aide' }, 'Affiché à gauche du nom, et sur la page de connexion.')),
    modifiable ? h('div', { class: 'mon-espace-boutons' }, boutonEnregistrer) : null,
    message);
  return h('section', { class: 'carte-section', id: 'reglages-mon-espace', dataset: { role: 'mon-espace-maison' } },
    h('h2', {}, icone('house', { taille: 18 }), 'Mon espace'),
    h('p', { class: 'aide', dataset: { role: 'aide-public' } }, AIDE_PUBLIC),
    h('form', { class: 'mon-espace-formulaire', novalidate: true, onsubmit: enregistrer }, champs));
}
