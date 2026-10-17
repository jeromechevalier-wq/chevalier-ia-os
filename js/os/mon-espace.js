// Réglages > « Mon espace » et « Membres et rôles » chez un client (2.9.0). Un ÉDITEUR règle lui-même le nom, la couleur, le logo, les images, le texte d'accueil
// et les membres de son espace ; un lecteur voit les mêmes valeurs, désactivées. Les modules actifs restent à l'administrateur (affichage seul : reglages.js).
// Tout passe par la fonction serveur « espaceReglages » (mon-espace-donnees.js) : les règles Firestore et Storage interdisent d'écrire depuis le navigateur.
// Un seul formulaire (nom, couleur, texte d'accueil, logo choisi) avec UN bouton « Enregistrer » ; les images et les membres agissent tout de suite.
// Un retrait (logo, image, membre) : confirmation, puis « Retiré · Annuler » pendant 8 secondes (retrait.js). Seuls les éditeurs sont proposés les gestes ; le serveur revérifie.
import { h, icone, remplir, toast, confirmer } from './ui.js';
import { accentPourTheme, SURFACES_THEME, initialeMarque, normaliserCouleur, MARQUE_NEUTRE } from './marque.js';
import { lireMarqueEspace, lireMembresEspace, appelerEspace } from './mon-espace-donnees.js';
import { verifierFichier, preparerImage, enBase64 } from './mon-espace-images.js';
import { retirerAvecAnnulation, retirerEnDifferant, validerRetraitsEnAttente } from './retrait.js';

export const MAX_ACCUEIL = 500;
export const MAX_IMAGES = 4;
export const MAX_MEMBRES = 20;
const TYPES_ACCEPTES = 'image/png,image/jpeg,image/webp'; // pas de « capture » : sur un téléphone, le choix ouvre la photothèque (ou les fichiers)
const LIBELLES_ROLE = Object.freeze({ editeur: 'Éditeur', lecteur: 'Lecteur' });
const AIDE_PUBLIC = 'Le nom, le logo, les images et le texte d’accueil sont visibles par tout le monde sur la page de connexion, même sans compte. N’y mets rien de confidentiel.';
const caracteres = (t) => [...String(t ?? '')].length;

/** Charge puis affiche : indicateur de chargement, puis le contenu ; échec = « Chargement impossible, réessaie » et « Réessayer ». */
function chargerPuisAfficher(zone, etat, charger, rendre) {
  const lancer = async () => {
    remplir(zone, h('div', { class: 'chargement-bloc', role: 'status', dataset: { etat: 'chargement' } }, h('span', { class: 'rond-chargement' }), h('span', { class: 'aide' }, 'Chargement…')));
    let donnees;
    try {
      donnees = await charger();
    } catch (e) {
      console.warn('Mon espace : chargement impossible', e?.code ?? e?.message);
      if (!etat.vivant) return;
      remplir(zone, h('div', { class: 'mon-espace-erreur', role: 'alert', dataset: { etat: 'erreur' } },
        icone('triangle-alert', { taille: 16 }), h('p', {}, 'Chargement impossible, réessaie'),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: lancer }, 'Réessayer')));
      return;
    }
    if (etat.vivant) rendre(donnees);
  };
  lancer();
}

function section(id, titre, nomIcone, ...enfants) {
  return h('section', { class: 'carte-section', id }, h('h2', {}, icone(nomIcone, { taille: 18 }), titre), ...enfants);
}

// ---------------------------------------------------------------- Mon espace

/** Aperçu de la couleur dans les deux thèmes, avec le calcul de l'interface (accentPourTheme : le même que celui qui s'applique vraiment). */
function apercuCouleur(couleur) {
  const c = normaliserCouleur(couleur) || MARQUE_NEUTRE.couleur;
  return h('div', { class: 'mon-espace-apercus', dataset: { role: 'apercu-couleur' } }, ['sombre', 'clair'].map((theme) => {
    const a = accentPourTheme(c, theme);
    const sombre = theme === 'sombre';
    return h('div', { class: 'mon-espace-apercu', dataset: { apercu: theme, accent: a.accent, trait: a.trait }, style: { background: SURFACES_THEME[theme], color: sombre ? '#ffffff' : '#29292c' } },
      h('span', { class: 'mon-espace-apercu-titre' }, sombre ? 'Thème sombre' : 'Thème clair'),
      h('span', { class: 'mon-espace-apercu-bouton', style: { background: a.accent, color: a.surAccent } }, 'Bouton'),
      h('span', { class: 'mon-espace-apercu-lien', style: { color: a.trait } }, 'Lien et menu actif'));
  }));
}

function pastilleLogo(marque, logoUrl) {
  return logoUrl
    ? h('img', { class: 'mon-espace-logo', src: logoUrl, alt: 'Logo de l’espace', dataset: { role: 'logo-image' } })
    : h('span', { class: 'mon-espace-logo mon-espace-initiale', dataset: { role: 'logo-initiale' }, style: { background: marque.couleur } }, initialeMarque(marque));
}

function formulaireMonEspace(zone, base, ctx, etat) {
  const modifiable = ctx.editeur;
  const courant = { ...base, images: [...base.images] }; // ce que le serveur a (mis à jour après chaque réponse)
  let logoNouveau = null; // { blob, type, url, largeur, hauteur } : choisi, pas encore enregistré
  let logoRetire = false; // retrait confirmé en attente (8 s)
  const retirees = new Set(); // images dont le retrait est en attente (8 s)

  const nom = h('input', { type: 'text', class: 'champ', id: 'mon-espace-nom', name: 'nom', value: base.nom, maxlength: '80', autocomplete: 'off', 'aria-label': 'Nom', dataset: { champ: 'nom' } });
  const erreurNom = h('p', { class: 'mon-espace-erreur-champ', role: 'alert', hidden: true });
  const couleur = h('input', { type: 'color', class: 'champ-couleur mon-espace-couleur', id: 'mon-espace-couleur', name: 'couleur', value: base.couleur, 'aria-label': 'Couleur', dataset: { champ: 'couleur' } });
  const valeurCouleur = h('code', { class: 'mon-espace-code', dataset: { role: 'valeur-couleur' } }, base.couleur);
  const zoneApercu = h('div', {});
  const accueil = h('textarea', { class: 'champ', id: 'mon-espace-accueil', name: 'accueil', rows: '3', 'aria-label': 'Texte d’accueil', placeholder: 'Un petit mot de bienvenue (facultatif)', dataset: { champ: 'accueil' } });
  accueil.value = base.accueil;
  const compteur = h('span', { class: 'mon-espace-compteur', dataset: { role: 'compteur' }, 'aria-live': 'polite' });
  const zoneLogo = h('div', { class: 'mon-espace-logo-bloc' });
  const messageLogo = h('p', { class: 'mon-espace-erreur-champ', role: 'alert', hidden: true, dataset: { role: 'message-logo' } });
  const fichierLogo = h('input', { type: 'file', accept: TYPES_ACCEPTES, hidden: true, dataset: { role: 'fichier-logo' }, 'aria-label': 'Fichier du logo' });
  const zoneImages = h('div', {});
  const messageImages = h('p', { class: 'mon-espace-erreur-champ', role: 'alert', hidden: true, dataset: { role: 'message-images' } });
  const fichierImage = h('input', { type: 'file', accept: TYPES_ACCEPTES, hidden: true, dataset: { role: 'fichier-image' }, 'aria-label': 'Fichier de l’image' });
  const message = h('p', { class: 'mon-espace-message', role: 'status', dataset: { role: 'message-enregistrement' } });
  const boutonEnregistrer = h('button', { type: 'submit', class: 'bouton bouton-principal', dataset: { action: 'enregistrer' } }, 'Enregistrer');

  const montrer = (el, texte) => { el.textContent = texte ?? ''; el.hidden = !texte; };

  function majApercu() {
    const c = normaliserCouleur(couleur.value) || MARQUE_NEUTRE.couleur;
    valeurCouleur.textContent = c;
    remplir(zoneApercu, apercuCouleur(c), h('p', { class: 'aide' }, 'Ta couleur est éclaircie ou assombrie automatiquement pour rester lisible.'));
  }
  function majCompteur() {
    const n = caracteres(accueil.value);
    if (n > MAX_ACCUEIL) accueil.value = [...accueil.value].slice(0, MAX_ACCUEIL).join(''); // le compteur bloque : jamais plus de 500 caractères
    const total = caracteres(accueil.value);
    compteur.textContent = `${total} / ${MAX_ACCUEIL}`;
    compteur.dataset.limite = String(total >= MAX_ACCUEIL);
    compteur.title = total >= MAX_ACCUEIL ? `Limite de ${MAX_ACCUEIL} caractères atteinte` : '';
    if (n > MAX_ACCUEIL) montrer(message, `Limite de ${MAX_ACCUEIL} caractères atteinte : le texte a été raccourci.`);
  }

  function majLogo() {
    const url = logoNouveau ? logoNouveau.url : (logoRetire ? null : courant.logo);
    const marqueAffichee = { nom: nom.value.trim() || courant.nom, couleur: normaliserCouleur(couleur.value) || courant.couleur };
    remplir(zoneLogo,
      pastilleLogo(marqueAffichee, url),
      h('div', { class: 'mon-espace-logo-actions' },
        url ? null : h('span', { class: 'aide', dataset: { role: 'pas-de-logo' } }, 'Pas de logo'),
        logoNouveau ? h('span', { class: 'aide', dataset: { role: 'logo-apercu' } }, `Aperçu : ${logoNouveau.largeur} × ${logoNouveau.hauteur} px. Il sera enregistré avec le bouton « Enregistrer ».`) : null,
        h('div', { class: 'mon-espace-boutons' },
          modifiable ? h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'choisir-logo' }, onclick: () => fichierLogo.click() }, icone('upload', { taille: 16 }), 'Choisir un logo') : null,
          modifiable && url ? h('button', { type: 'button', class: 'bouton bouton-discret', dataset: { action: 'retirer-logo' }, onclick: retirerLogo }, icone('trash-2', { taille: 16 }), 'Retirer') : null),
        h('span', { class: 'aide' }, 'PNG, JPG ou WebP, 2 Mo au plus. Une image plus large que 512 px est réduite avant l’envoi.')));
  }

  async function choisirLogo() {
    const fichier = fichierLogo.files?.[0];
    fichierLogo.value = '';
    montrer(messageLogo, '');
    if (!fichier) return;
    const verdict = await verifierFichier(fichier, 'logo');
    if (!verdict.ok) { montrer(messageLogo, verdict.message); return; }
    const prepare = await preparerImage(fichier, 'logo', verdict.type);
    if (prepare.message) { montrer(messageLogo, prepare.message); return; }
    if (logoNouveau) URL.revokeObjectURL(logoNouveau.url);
    logoNouveau = { ...prepare, url: URL.createObjectURL(prepare.blob) };
    etat.nettoyages.push(() => { if (logoNouveau) URL.revokeObjectURL(logoNouveau.url); });
    majLogo();
  }

  async function retirerLogo() {
    if (logoNouveau) { // un logo choisi mais pas encore enregistré : on abandonne simplement le choix
      URL.revokeObjectURL(logoNouveau.url);
      logoNouveau = null;
      majLogo();
      return;
    }
    await retirerEnDifferant({
      titre: 'Retirer le logo ?', message: 'Les initiales de ton espace s’afficheront à la place.', libelleOk: 'Retirer',
      masquer: () => { logoRetire = true; majLogo(); },
      remettre: () => { logoRetire = false; majLogo(); },
      valider: async () => {
        const r = await appelerEspace(ctx.client, 'enregistrer', { logo: null });
        courant.logo = r.marque.logo;
        logoRetire = false;
        majLogo();
        ctx.surMarque(r.marque);
      },
      messageErreur: 'Le logo n’a pas pu être retiré. Vérifie ta connexion internet, puis réessaie.',
    });
  }

  // ---- images de la page de connexion : elles agissent tout de suite
  const visibles = () => courant.images.filter((u) => !retirees.has(u));

  function majImages() {
    const liste = visibles();
    remplir(zoneImages,
      liste.length
        ? h('ul', { class: 'mon-espace-images', dataset: { role: 'liste-images' } }, liste.map((url, i) => h('li', { class: 'mon-espace-image', dataset: { image: String(i) } },
          h('img', { src: url, alt: `Image ${i + 1}`, class: 'mon-espace-miniature', loading: 'lazy' }),
          h('div', { class: 'mon-espace-image-actions' },
            i === 0 ? h('span', { class: 'badge badge-actif', dataset: { role: 'image-fond' } }, 'Première : sert de fond') : null,
            modifiable && i > 0 ? h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'image-premiere' }, onclick: () => mettreEnPremiere(url) }, 'Mettre en première') : null,
            modifiable ? h('button', { type: 'button', class: 'bouton bouton-discret', dataset: { action: 'retirer-image' }, 'aria-label': `Retirer l’image ${i + 1}`, onclick: () => retirerImage(url) }, icone('trash-2', { taille: 16 }), 'Retirer') : null))))
        : h('p', { class: 'aide', dataset: { role: 'aucune-image' } }, 'Aucune image'),
      modifiable ? h('div', { class: 'mon-espace-boutons' },
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'ajouter-image' }, onclick: () => { montrer(messageImages, ''); fichierImage.click(); } }, icone('plus', { taille: 16 }), 'Ajouter une image')) : null,
      h('p', { class: 'aide' }, `${MAX_IMAGES} images au plus, PNG, JPG ou WebP, 1,5 Mo au plus chacune (réduite à 1600 px de large). La première sert de fond à la page de connexion.`));
  }

  async function ajouterImage() {
    const fichier = fichierImage.files?.[0];
    fichierImage.value = '';
    montrer(messageImages, '');
    if (!fichier) return;
    if (visibles().length >= MAX_IMAGES) { montrer(messageImages, `Tu as déjà ${MAX_IMAGES} images : retire-en une avant d’en ajouter une autre.`); return; }
    const verdict = await verifierFichier(fichier, 'image');
    if (!verdict.ok) { montrer(messageImages, verdict.message); return; }
    const prepare = await preparerImage(fichier, 'image', verdict.type);
    if (prepare.message) { montrer(messageImages, prepare.message); return; }
    try {
      await validerRetraitsEnAttente();
      const r = await appelerEspace(ctx.client, 'image-ajouter', { image: { donnees: await enBase64(prepare.blob) } });
      courant.images = r.marque.images;
      majImages();
      ctx.surMarque(r.marque);
      toast('Image ajoutée');
    } catch (e) {
      montrer(messageImages, e.message);
    }
  }

  async function mettreEnPremiere(url) {
    montrer(messageImages, '');
    try {
      await validerRetraitsEnAttente();
      const r = await appelerEspace(ctx.client, 'image-premiere', { url });
      courant.images = r.marque.images;
      majImages();
      ctx.surMarque(r.marque);
      toast('Image mise en première');
    } catch (e) {
      montrer(messageImages, e.message);
    }
  }

  async function retirerImage(url) {
    montrer(messageImages, '');
    await retirerEnDifferant({
      titre: 'Retirer cette image ?', message: 'Elle ne s’affichera plus sur la page de connexion.', libelleOk: 'Retirer',
      masquer: () => { retirees.add(url); majImages(); },
      remettre: () => { retirees.delete(url); majImages(); },
      valider: async () => {
        const r = await appelerEspace(ctx.client, 'image-retirer', { url });
        retirees.delete(url);
        courant.images = r.marque.images;
        majImages();
        ctx.surMarque(r.marque);
      },
      messageErreur: 'L’image n’a pas pu être retirée. Vérifie ta connexion internet, puis réessaie.',
    });
  }

  // ---- enregistrement : seulement ce qui a changé (deux éditeurs : le dernier gagne, champ par champ)
  async function enregistrer(e) {
    e.preventDefault();
    if (!modifiable) return;
    montrer(message, '');
    montrer(erreurNom, '');
    const demande = {};
    const nomPropre = nom.value.replace(/\s+/g, ' ').trim();
    if (!nomPropre) { montrer(erreurNom, 'Écris le nom de ton espace : il ne peut pas rester vide.'); nom.focus(); return; }
    if (nomPropre !== courant.nom) demande.nom = nomPropre;
    const couleurChoisie = normaliserCouleur(couleur.value);
    if (couleurChoisie && couleurChoisie !== courant.couleur) demande.couleur = couleurChoisie;
    if (accueil.value !== courant.accueil) demande.accueil = accueil.value;
    if (logoNouveau) demande.logo = { donnees: await enBase64(logoNouveau.blob) };
    if (!Object.keys(demande).length) { toast('Rien n’a changé'); montrer(message, 'Rien n’a changé : rien à enregistrer.'); return; }
    boutonEnregistrer.disabled = true;
    montrer(message, 'Enregistrement…');
    try {
      await validerRetraitsEnAttente();
      const r = await appelerEspace(ctx.client, 'enregistrer', demande);
      Object.assign(courant, r.marque);
      if (logoNouveau) { URL.revokeObjectURL(logoNouveau.url); logoNouveau = null; }
      nom.value = courant.nom;
      majLogo();
      ctx.surMarque(r.marque);
      toast('Enregistré');
      montrer(message, 'Enregistré');
    } catch (err) {
      montrer(message, `${err.message}`); // saisies conservées, rien d'affiché comme enregistré
      message.dataset.etat = 'erreur';
      boutonEnregistrer.disabled = false;
      return;
    }
    message.dataset.etat = 'ok';
    boutonEnregistrer.disabled = false;
  }

  couleur.addEventListener('input', () => { majApercu(); majLogo(); });
  accueil.addEventListener('input', majCompteur);
  nom.addEventListener('input', () => { montrer(erreurNom, ''); if (!logoNouveau && !courant.logo) majLogo(); });
  fichierLogo.addEventListener('change', choisirLogo);
  fichierImage.addEventListener('change', ajouterImage);

  majApercu();
  majCompteur();
  majLogo();
  majImages();

  const champ = (etiquette, id, ...contenu) => h('div', { class: 'bloc-champ mon-espace-champ' }, h('label', { class: 'etiquette', for: id }, etiquette), ...contenu);
  const formulaire = h('form', { class: 'mon-espace-formulaire', novalidate: true, dataset: { role: 'mon-espace' }, onsubmit: enregistrer },
    h('fieldset', { class: 'mon-espace-champs', disabled: !modifiable },
      champ('Nom', 'mon-espace-nom', nom, h('p', { class: 'aide' }, 'Il s’affiche dans le menu, dans l’onglet et sur la page de connexion. L’adresse de ton espace ne change jamais.'), erreurNom),
      h('div', { class: 'bloc-champ mon-espace-champ' }, h('label', { class: 'etiquette', for: 'mon-espace-couleur' }, 'Couleur'),
        h('div', { class: 'mon-espace-ligne' }, couleur, valeurCouleur), zoneApercu),
      h('div', { class: 'bloc-champ mon-espace-champ' }, h('span', { class: 'etiquette' }, 'Logo'), zoneLogo, fichierLogo, messageLogo),
      champ('Texte d’accueil', 'mon-espace-accueil', accueil,
        h('div', { class: 'mon-espace-ligne mon-espace-ligne-espacee' }, h('span', { class: 'aide' }, 'Il s’affiche sous le nom, sur la page de connexion. Tu peux le laisser vide.'), compteur)),
      h('div', { class: 'bloc-champ mon-espace-champ' }, h('span', { class: 'etiquette' }, 'Images de la page de connexion'), zoneImages, fichierImage, messageImages),
      h('p', { class: 'aide mon-espace-public', dataset: { role: 'public' } }, icone('info', { taille: 14 }), AIDE_PUBLIC)),
    modifiable
      ? h('div', { class: 'mon-espace-pied' }, boutonEnregistrer, message)
      : h('p', { class: 'aide reglages-lecture', role: 'status', dataset: { role: 'lecture-seule' } }, icone('info', { taille: 14 }), 'Seul un éditeur peut modifier'));
  remplir(zone, formulaire);
}

/** Section « Identité de l'espace » d'un client : formulaire modifiable (éditeur) ou valeurs désactivées (lecteur). */
export function sectionMonEspace(ctx, etat) {
  const zone = h('div', { class: 'mon-espace', dataset: { role: 'zone-mon-espace' } });
  chargerPuisAfficher(zone, etat, () => lireMarqueEspace(ctx.client), (base) => formulaireMonEspace(zone, base, ctx, etat));
  return section('reglages-identite', 'Identité de l’espace', 'house', zone);
}

// ---------------------------------------------------------------- Membres et rôles (éditeurs)

function formulaireMembres(zone, membres, ctx) {
  let liste = membres;
  const moi = String(ctx.compte?.email ?? '').toLowerCase();
  const erreur = h('p', { class: 'mon-espace-erreur-champ', role: 'alert', hidden: true, dataset: { role: 'erreur-membres' } });
  const montrer = (texte) => { erreur.textContent = texte ?? ''; erreur.hidden = !texte; };
  const nbEditeurs = () => liste.filter((m) => m.role === 'editeur').length;
  const conteneur = h('div', {});

  const apresAction = (equipe, base = liste) => {
    liste = equipe.map((m) => ({ ...(base.find((x) => x.email === m.email) ?? { nom: '' }), email: m.email, role: m.role }));
    afficher();
  };

  async function appeler(action, donnees) {
    montrer('');
    try {
      return await appelerEspace(ctx.client, action, donnees);
    } catch (e) {
      montrer(e.message);
      afficher(); // remet les listes déroulantes dans l'état réel
      return null;
    }
  }

  async function changerRole(m, role) {
    if (role === m.role) return;
    if (m.role === 'editeur' && nbEditeurs() === 1) { montrer('Il faut garder au moins un éditeur.'); afficher(); return; }
    const soiMeme = m.email === moi;
    if (soiMeme && !(await confirmer('Changer ton propre rôle ?', 'Tu vas perdre l’accès de ce compte à l’espace tel qu’il est aujourd’hui : tu devras te reconnecter.', { libelleOk: 'Changer mon rôle', danger: true }))) { afficher(); return; }
    const r = await appeler('membre-role', { email: m.email, role });
    if (!r) return;
    apresAction(r.equipe);
    toast(`${m.email} est maintenant ${LIBELLES_ROLE[role].toLowerCase()}`);
    if (soiMeme) { toast('Ton rôle a changé : reconnecte-toi pour continuer.'); setTimeout(() => ctx.surDeconnexion?.(), 1200); }
  }

  async function retirer(m) {
    montrer('');
    if (m.role === 'editeur' && nbEditeurs() === 1) { montrer('Il faut garder au moins un éditeur.'); return; }
    if (m.email === moi) {
      if (!(await confirmer('Te retirer de cet espace ?', 'Tu vas perdre l’accès de ce compte à l’espace. Un autre éditeur devra te réinviter pour y revenir.', { libelleOk: 'Me retirer', danger: true }))) return;
      const r = await appeler('membre-retirer', { email: m.email });
      if (!r) return;
      toast('Tu as quitté cet espace');
      setTimeout(() => ctx.surDeconnexion?.(), 1200);
      return;
    }
    let retire = null;
    await retirerAvecAnnulation({
      titre: 'Retirer ce membre ?', message: `${m.email} n’aura plus accès à l’espace.`, libelleOk: 'Retirer', danger: true,
      faire: async () => {
        const r = await appelerEspace(ctx.client, 'membre-retirer', { email: m.email });
        retire = r.retire ?? { email: m.email, role: m.role, nom: m.nom };
        apresAction(r.equipe);
      },
      defaire: async () => {
        const r = await appelerEspace(ctx.client, 'membre-ajouter', { email: retire.email, role: retire.role, nom: retire.nom });
        liste = r.equipe.map((x) => ({ email: x.email, role: x.role, nom: x.email === retire.email ? retire.nom : (liste.find((y) => y.email === x.email)?.nom ?? '') }));
        afficher();
      },
      messageErreur: 'Ce membre n’a pas pu être retiré : il est toujours dans l’espace. Réessaie.',
    });
  }

  const adresse = h('input', { type: 'email', class: 'champ', id: 'membre-adresse', name: 'adresse', 'aria-label': 'Adresse Google du nouveau membre', placeholder: 'prenom@gmail.com', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, maxlength: '120', dataset: { champ: 'adresse-membre' } });
  const role = h('select', { class: 'champ', id: 'membre-role', 'aria-label': 'Rôle du nouveau membre', dataset: { champ: 'role-nouveau-membre' } },
    h('option', { value: 'editeur' }, 'Éditeur : consulte et modifie'), h('option', { value: 'lecteur', selected: true }, 'Lecteur : consulte seulement'));
  const boutonAjout = h('button', { type: 'submit', class: 'bouton bouton-principal', dataset: { action: 'ajouter-membre' } }, icone('plus', { taille: 16 }), 'Ajouter un membre');
  const ajout = h('form', { class: 'mon-espace-ajout', novalidate: true, dataset: { role: 'ajout-membre' }, onsubmit: async (e) => {
    e.preventDefault();
    boutonAjout.disabled = true;
    try {
      const r = await appeler('membre-ajouter', { email: adresse.value, role: role.value });
      if (!r) return;
      apresAction(r.equipe);
      toast(`${adresse.value.trim().toLowerCase()} a été ajouté·e`);
      adresse.value = '';
    } finally { boutonAjout.disabled = false; }
  } },
  h('div', { class: 'bloc-champ mon-espace-champ' }, h('label', { class: 'etiquette', for: 'membre-adresse' }, 'Adresse Google'), adresse),
  h('div', { class: 'bloc-champ mon-espace-champ' }, h('label', { class: 'etiquette', for: 'membre-role' }, 'Rôle'), role),
  boutonAjout,
  h('p', { class: 'aide mon-espace-ajout-aide' }, 'La personne doit se connecter avec le compte Google de cette adresse.'));

  function afficher() {
    remplir(conteneur,
      h('ul', { class: 'reglages-membres', dataset: { role: 'liste-membres' } }, liste.length
        ? liste.map((m) => h('li', { class: 'reglages-membre mon-espace-membre', dataset: { membre: m.email } },
          h('span', { class: 'reglages-membre-nom' }, m.email, m.email === moi ? ' (toi)' : ''),
          h('span', { class: 'mon-espace-membre-actions' },
            h('select', { class: 'champ champ-court', 'aria-label': `Rôle de ${m.email}`, dataset: { role: 'role-membre' }, onchange: (e) => changerRole(m, e.target.value) },
              ['editeur', 'lecteur'].map((r) => h('option', { value: r, selected: r === m.role }, LIBELLES_ROLE[r]))),
            h('button', { type: 'button', class: 'bouton bouton-discret', dataset: { action: 'retirer-membre' }, 'aria-label': `Retirer ${m.email}`, onclick: () => retirer(m) }, icone('trash-2', { taille: 16 }), 'Retirer'))))
        : h('li', { class: 'aide', dataset: { role: 'aucun-membre' } }, 'Aucun membre trouvé.')),
      h('p', { class: 'aide' }, `${liste.length} membre${liste.length > 1 ? 's' : ''} sur ${MAX_MEMBRES} au plus.`));
  }
  afficher();
  remplir(zone, conteneur, erreur, ajout);
}

/** Section « Membres et rôles » (éditeurs seulement : le menu ne la propose pas à un lecteur). */
export function sectionMembresEditable(ctx, etat) {
  const zone = h('div', { class: 'mon-espace', dataset: { role: 'zone-membres' } });
  chargerPuisAfficher(zone, etat, () => lireMembresEspace(ctx.client), (membres) => formulaireMembres(zone, membres, ctx));
  return section('reglages-membres', 'Membres et rôles', 'users',
    h('p', { class: 'aide' }, 'Les personnes qui ont accès à cet espace. Un éditeur consulte et modifie, un lecteur consulte seulement. Il faut toujours garder au moins un éditeur.'), zone);
}

