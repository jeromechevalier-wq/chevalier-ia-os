// Fenêtre unique « Association » de l'écran Articles : vérifier une suggestion de l'IA, créer une association à partir d'articles cochés, ou modifier une association validée.
// Une association relie au moins DEUX articles de fournisseurs ; elle porte un article interne, nommé librement. Une ligne par article : case cochée à l'ouverture,
// fournisseur, ville(s) d'achat, référence exacte, désignation, dernier prix et coefficient (propre à la ligne).
//
// Deux boutons seulement : « Annuler » et « Enregistrer ». « Enregistrer » écrit dans un ordre unique : (a) renomme l'article interne (ou le crée), (b) valide chaque article coché
// (un appel par article, ceux qui ne changent pas ne sont pas renvoyés), (c) EN DERNIER fait sortir les articles liés décochés : un lien validé est dissocié, une suggestion de l'IA est refusée
// (le bandeau « Annuler » de l'écran remet tout). Association de 2 : décocher un ou deux articles la défait ; alors (a) et (b) sont sautés (on ne valide jamais ce qui va être dissocié).
//
// NE PAS ÉCRASER LE TRAVAIL D'UN COLLÈGUE : la liste est relue à l'ouverture et juste avant chaque écriture ; si un article n'est plus celui que la personne a vu, rien n'est envoyé.
// Panne en route : la fenêtre reste ouverte, ce qui est écrit le reste et n'est jamais renvoyé. Entrée n'envoie jamais rien (seuls les boutons agissent).
//
// La fenêtre est construite UNE fois ; `actualiser()` met à jour les textes, les états grisés et les libellés sans refaire les champs (le focus ne saute jamais).
import { h, icone, dialogue } from '../../os/ui.js';
import {
  confirmationPrete, eurosPrix, executerEnSerie, memeNom, messageErreur, nomPropre, normaliserUnite, TEXTE_NOM_DEJA_PRIS, UNITES_PROPOSEES,
  verifierNomReferenceGroupe, verifierNouvelleReference,
} from './logique.js';
import { articlesChanges, messageArticlesChanges, messageRegroupementInterrompu, TEXTE_RELECTURE_IMPOSSIBLE } from './selection.js';
import {
  comparerPrix, estLienValide, estMembre, etatAssociation, texteComparaison, TEXTE_BADGE_MOINS_CHER, messageFinal, nomPropose, renommerSiBesoin, saisiesDepart, planEnregistrement,
  resumeDejaFait, texteConfirmationEnregistrement, TEXTE_PRIX_VILLES_INDISPONIBLES, TEXTE_AJOUT_A_ASSOCIATION_VALIDEE, TEXTE_CORRECTION_PRIX, TEXTE_CORRECTION_PRIX_PLURIEL,
  TEXTE_REFERENCE_ENREGISTREE_RELECTURE, TEXTE_RIEN_A_ENREGISTRER, uniteDeCreation, vocabulaireAssociation,
} from './association.js';

let compteur = 0;

/**
 * @param {object} o
 *  depart      : articles de la fenêtre à l'ouverture (membres de l'association et, au besoin, articles libres cochés) ;
 *  reference   : l'article interne de l'association ; null = création (nom à saisir) ;
 *  occupees    : identifiants des articles internes qui ont déjà des articles (un nouveau nom ne peut pas être l'un d'eux) ;
 *  references  : tous les articles internes ;
 *  relire(ids) : relit la liste sur le serveur et renvoie ces articles dans leur état du moment (lève une erreur si la lecture échoue) ;
 *  lireVilles(ids), renommer(id, nom), creerReference(nom, unite) -> id, relireReferences() -> références, valider(id, refId, coefficient) ;
 *  sortir(sortants, apres) : fait sortir les articles (dissocier / refuser) puis ferme ; renvoie un message si une sortie a échoué (la fenêtre reste ouverte) ;
 *  surFerme()  : la fenêtre est fermée sans tout enregistrer ; surTermine(message, ids) : tout est enregistré.
 * @returns {{ fermer: () => void }}
 */
export function ouvrirAssociation({ depart, reference, occupees, references, relire, lireVilles, renommer, creerReference, relireReferences, valider, sortir, surFerme, surTermine }) {
  const uid = `assoc${compteur += 1}`;
  const photo = depart; // la fenêtre travaille sur CETTE photo (la liste derrière peut se relire)
  const ids = photo.map((x) => x.article.id);
  let saisies = saisiesDepart(photo);
  let vus = photo;
  let refs = references;
  let idCree = null;
  let nom = reference?.nom ?? nomPropose(photo);
  let nomEnregistre = reference?.nom ?? '';
  let nomRefuse = null;
  const depuisCreation = uniteDeCreation(photo);
  let unite = depuisCreation.unite;
  let faits = [];
  let renommeFait = false;
  let enCours = false;
  let erreur = null;
  let info = null;
  let confirmer = false;
  let perime = false;
  let relecture = 'en_cours'; // 'en_cours' | 'faite' | 'echec'
  let villes = null; // null (en cours) | 'erreur' | { id: [villes] }
  let envoi = false;
  let actif = true;
  let depuis = 0;
  let etaitEnConfirmation = false;
  let fermerFenetre = () => {};

  // ---------------------------------------------------------------- éléments (construits une fois)
  const champNom = h('input', { class: 'champ', type: 'text', autocomplete: 'off', maxlength: 200, value: nom, 'aria-describedby': `${uid}-nom-message`, dataset: { role: 'assoc-nom' },
    oninput: (e) => { nom = e.target.value; erreur = null; info = null; confirmer = false; actualiser(); } });
  const champUnite = h('input', { class: 'champ', type: 'text', autocomplete: 'off', list: `${uid}-unites`, maxlength: 60, placeholder: 'sac, kg, m2, u…', value: unite, dataset: { role: 'assoc-unite' },
    oninput: (e) => { unite = e.target.value; erreur = null; actualiser(); } });
  const listeUnites = h('datalist', { id: `${uid}-unites` }, UNITES_PROPOSEES.map((u) => h('option', { value: u })));
  const blocUnite = h('label', { class: 'dg-champ-nom' }, h('span', { class: 'etiquette' }, 'Unité de l’article interne'), champUnite, listeUnites);
  const messageNom = h('p', { id: `${uid}-nom-message`, class: 'aide' });
  const messageExistante = h('p', { class: 'aide', role: 'status' });
  const champs = h('fieldset', { class: 'champs-figes' });
  const blocComparaison = h('p', { class: 'bandeau-comparaison', role: 'status', hidden: true });
  const blocVilles = h('p', { class: 'aide', role: 'status', hidden: true }, TEXTE_PRIX_VILLES_INDISPONIBLES);
  const blocMessage = h('p', { class: 'aide fa-message', 'aria-live': 'polite' });
  const blocConfirmation = h('p', { class: 'avertissement avertissement-fort', role: 'alert', hidden: true });
  const blocRelecture = h('p', { class: 'aide', role: 'status', hidden: true }, 'La liste n’a pas pu être relue à l’ouverture : elle le sera au moment d’enregistrer.');
  const blocInfo = h('p', { class: 'aide', role: 'status', hidden: true });
  const blocErreur = h('p', { class: 'erreur', role: 'alert', hidden: true });
  const boutonRetour = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'assoc-retour' }, onclick: () => { if (confirmer) { confirmer = false; actualiser(); } else fermerFenetre(); } }, 'Annuler');
  const boutonEnregistrer = h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'assoc-enregistrer' }, onclick: () => { void enregistrer(); } }, 'Enregistrer');

  const lignes = new Map();
  const qui = (x) => `${x.article.designation}, ${x.fournisseur}`;
  const majSaisie = (id, morceau) => { erreur = null; info = null; confirmer = false; saisies = { ...saisies, [id]: { ...(saisies[id] ?? { coche: true, coefficient: '' }), ...morceau } }; actualiser(); };
  for (const x of photo) {
    const id = x.article.id;
    const coche = h('input', { type: 'checkbox', checked: true, 'aria-label': `Garder dans l’association : ${qui(x)}`, dataset: { role: 'assoc-coche' }, onchange: (e) => majSaisie(id, { coche: e.target.checked }) });
    const coef = h('input', { class: 'champ champ-court', type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': `Coefficient de : ${qui(x)}`, value: saisies[id].coefficient, dataset: { role: 'assoc-coef' }, oninput: (e) => majSaisie(id, { coefficient: e.target.value }) });
    const etiquetteCoef = h('label', { class: 'dg-champ' }, h('span', { class: 'etiquette' }, 'Coef.'), coef);
    const lieu = h('span', { class: 'aide dg-lieu' });
    const etats = h('span', { class: 'dg-etats' });
    const prix = h('div', { class: 'dg-prix' });
    const err = h('span', { class: 'erreur', role: 'alert', hidden: true });
    const li = h('li', { class: 'dg-ligne', dataset: { article: id } },
      h('label', { class: 'dg-coche' }, coche),
      h('div', { class: 'dg-corps' },
        h('div', { class: 'dg-haut' },
          h('div', { class: 'dg-id' },
            h('span', { class: 'dg-fournisseur' }, x.fournisseur, lieu, etats),
            h('span', { class: 'aide dg-refe' }, x.article.reference ? `Réf. ${x.article.reference}` : 'Sans référence'),
            h('span', { class: 'dg-facture', title: 'Texte écrit par le fournisseur sur sa facture' }, `« ${x.article.designation} »`)),
          prix),
        err));
    lignes.set(id, { x, li, coche, coef, etiquetteCoef, lieu, etats, prix, err });
  }
  const liste = h('ul', { class: 'dg-lignes', 'aria-label': 'Articles de l’association' }, [...lignes.values()].map((l) => l.li));

  champs.append(
    h('div', { class: 'dg-nom' },
      h('div', { class: 'groupe-deux' }, h('label', { class: 'dg-champ-nom' }, h('span', { class: 'etiquette' }, 'Nom de l’article interne'), champNom), blocUnite),
      messageNom, messageExistante),
    h('span', { class: 'etiquette dg-titre-section' }, 'Articles rapprochés (décoche pour en sortir un)'),
    liste);
  const formulaire = h('form', { class: 'fenetre-association formulaire-rapprochement', onsubmit: (e) => e.preventDefault(),
    // Entrée n'envoie JAMAIS rien : pas de bouton d'envoi dans le formulaire, et l'envoi implicite est neutralisé. Seuls les boutons agissent.
    onkeydown: (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); } },
  champs, blocComparaison, blocVilles, blocMessage, blocConfirmation, blocRelecture, blocInfo, blocErreur);

  // ---------------------------------------------------------------- calculs (reprennent ceux du code d'origine)
  function calculer() {
    const refId = reference?.id ?? idCree;
    const etat = etatAssociation(photo, saisies, faits, vus);
    const comparaison = villes === 'erreur' ? null : comparerPrix(photo, saisies);
    const erreurNom = vocabulaireAssociation(verifierNomReferenceGroupe(nom));
    const nomPris = nomRefuse !== null && memeNom(nomRefuse, nom);
    // Création : nom déjà porté par un article interne qui a des articles = refusé ; porté par un article interne sans article = réutilisé (son unité fait foi).
    const verifNouvelle = !reference && !idCree ? verifierNouvelleReference(nom, unite, refs) : null;
    const existante = verifNouvelle?.existante ?? null;
    const existantePrise = !!existante && occupees.includes(existante.id);
    const problemeCreation = vocabulaireAssociation(verifNouvelle?.erreur ?? (existantePrise ? TEXTE_NOM_DEJA_PRIS : null));
    const uniteRef = reference?.unite_reference ?? existante?.unite_reference ?? (idCree ? refs.find((r) => r.id === idCree)?.unite_reference : undefined) ?? unite.trim();
    const uniteEditable = !reference && !idCree && !existante && !depuisCreation.commune;
    const ajoutAGroupeValide = photo.some(estLienValide) && photo.some((x) => !estMembre(x) && saisies[x.article.id]?.coche);
    const sortie = etat.sortants.length > 0;
    const confirmationRequise = sortie || (!etat.defaite && (etat.coefficientsChanges.length > 0 || ajoutAGroupeValide));
    const enConfirmation = confirmationRequise && confirmer;
    const pret = relecture !== 'en_cours' && !perime;
    const bloque = enCours || !pret;
    // Rien à écrire : association existante, nom inchangé, aucun article à valider, aucun coefficient changé, personne ne sort.
    const rienAEcrire = !!refId && etat.aEnvoyer.length === 0 && !sortie && nomPropre(nom) === nomEnregistre;
    // Association défaite : le nom ne compte pas (rien n'est renommé ni créé).
    const peutEnregistrer = !bloque && etat.enregistrerPossible && (etat.defaite || (erreurNom === null && !nomPris && !problemeCreation)) && !rienAEcrire;
    const texteValidation = etat.defaite ? '' : etat.coefficientsChanges.length > 1 ? TEXTE_CORRECTION_PRIX_PLURIEL : etat.coefficientsChanges.length === 1 ? TEXTE_CORRECTION_PRIX : ajoutAGroupeValide ? TEXTE_AJOUT_A_ASSOCIATION_VALIDEE : '';
    const texteConfirmation = [sortie ? texteConfirmationEnregistrement(etat.sortants, etat.defaite, etat.defaite ? 0 : etat.aEnvoyer.filter((a) => a.suggestion).length) : '', texteValidation].filter(Boolean).join(' ');
    return { refId, etat, comparaison, erreurNom, nomPris, verifNouvelle, existante, existantePrise, problemeCreation, uniteRef, uniteEditable, sortie, confirmationRequise, enConfirmation, pret, rienAEcrire, peutEnregistrer, texteConfirmation };
  }

  // ---------------------------------------------------------------- affichage
  function actualiser() {
    if (!actif) return;
    const c = calculer();
    const { etat, comparaison } = c;
    champs.disabled = enCours || c.enConfirmation;
    const nomEnErreur = c.nomPris || (c.erreurNom && nom.trim());
    champNom.classList.toggle('invalide', !!nomEnErreur);
    if (nomEnErreur) champNom.setAttribute('aria-invalid', 'true'); else champNom.removeAttribute('aria-invalid');
    blocUnite.hidden = !c.uniteEditable;
    messageNom.className = nomEnErreur || c.problemeCreation ? 'erreur' : 'aide';
    if (c.nomPris) messageNom.setAttribute('role', 'alert'); else messageNom.removeAttribute('role');
    messageNom.textContent = c.nomPris ? TEXTE_NOM_DEJA_PRIS : c.problemeCreation ?? (c.erreurNom && nom.trim() ? c.erreurNom : c.uniteRef ? `Unité : ${c.uniteRef}.` : '');
    messageExistante.hidden = !(c.existante && !c.existantePrise);
    messageExistante.textContent = c.existante ? `« ${c.existante.nom} » existe déjà, sans article : il sera réutilisé (unité : ${c.existante.unite_reference}).` : '';

    for (const [id, l] of lignes) {
      const s = saisies[id] ?? { coche: true, coefficient: '' };
      const fait = faits.includes(id);
      const err = etat.erreurs[id];
      const lieux = villes && villes !== 'erreur' ? villes[id] : undefined;
      l.li.classList.toggle('sortie', !s.coche);
      l.li.classList.toggle('moins-cher', !!comparaison?.moinsChers.includes(id));
      l.coche.checked = !!s.coche;
      l.coche.disabled = enCours || fait || perime;
      l.lieu.textContent = lieux && lieux.length > 0 ? ` · ${lieux.join(', ')}` : '';
      l.etats.replaceChildren(...[
        comparaison?.moinsChers.includes(id) ? h('span', { class: 'badge badge-succes dg-etat' }, TEXTE_BADGE_MOINS_CHER) : null,
        fait ? h('span', { class: 'badge badge-succes dg-etat' }, 'Enregistré')
          : estLienValide(l.x) ? h('span', { class: 'badge badge-succes dg-etat' }, 'validé')
            : estMembre(l.x) ? h('span', { class: 'badge badge-attention dg-etat' }, icone('sparkles', { taille: 12 }), 'suggéré par l’IA') : null,
      ].filter(Boolean));
      l.prix.replaceChildren(...[
        ...(l.x.stats.dernierPrix === null
          ? [h('span', { class: 'aide' }, 'Pas encore de prix')]
          : [h('span', { class: 'dg-prix-fourn' }, h('b', {}, eurosPrix(l.x.stats.dernierPrix)), ' HT'), l.x.article.unite?.trim() ? h('span', { class: 'aide' }, `par ${l.x.article.unite.trim()}`) : null]),
        fait ? null : l.etiquetteCoef,
      ].filter(Boolean));
      l.coef.disabled = enCours || !s.coche;
      l.coef.classList.toggle('invalide', !!(err && s.coefficient.trim()));
      if (err && s.coefficient.trim()) l.coef.setAttribute('aria-invalid', 'true'); else l.coef.removeAttribute('aria-invalid');
      l.err.hidden = !(s.coche && err);
      l.err.textContent = s.coche && err ? err : '';
    }

    blocComparaison.hidden = !comparaison;
    blocComparaison.textContent = comparaison ? texteComparaison(comparaison, c.uniteRef) : '';
    blocVilles.hidden = villes !== 'erreur';
    blocMessage.textContent = etat.message || (c.rienAEcrire && etat.enregistrerPossible ? TEXTE_RIEN_A_ENREGISTRER : etat.aide);
    blocConfirmation.hidden = !c.enConfirmation;
    blocConfirmation.replaceChildren(...(c.enConfirmation ? [icone('triangle-alert', { taille: 16 }), `${c.texteConfirmation} Tu confirmes ?`] : []));
    blocRelecture.hidden = !(relecture === 'echec' && !erreur);
    blocInfo.hidden = !info; blocInfo.textContent = info ?? '';
    blocErreur.hidden = !erreur; blocErreur.textContent = erreur ?? '';

    boutonRetour.disabled = enCours;
    boutonRetour.textContent = c.enConfirmation ? 'Retour' : faits.length > 0 ? 'Fermer' : 'Annuler';
    boutonEnregistrer.disabled = !c.peutEnregistrer;
    boutonEnregistrer.className = `bouton ${c.enConfirmation && c.sortie ? 'bouton-danger' : 'bouton-principal'}`;
    if (enCours || relecture === 'en_cours') boutonEnregistrer.setAttribute('aria-busy', 'true'); else boutonEnregistrer.removeAttribute('aria-busy');
    boutonEnregistrer.textContent = enCours ? 'Enregistrement…' : relecture === 'en_cours' ? 'Relecture…' : c.enConfirmation ? (c.sortie ? 'Oui, enregistrer' : etat.coefficientsChanges.length > 0 ? 'Oui, corriger' : 'Oui, ajouter') : 'Enregistrer';
    // Focus : pendant la confirmation le bouton cliqué change de rôle ; le focus va sur « Retour », puis revient sur « Enregistrer ».
    if (c.enConfirmation && !etaitEnConfirmation) { etaitEnConfirmation = true; boutonRetour.focus(); }
    else if (!c.enConfirmation && etaitEnConfirmation) { etaitEnConfirmation = false; boutonEnregistrer.focus(); }
  }

  /** Relit juste avant d'écrire : renvoie false (et dit pourquoi) si un article a changé. */
  async function relireAvantEcrire() {
    let fraiches;
    try { fraiches = await relire(ids); } catch { throw new Error(TEXTE_RELECTURE_IMPOSSIBLE); }
    if (!actif) return false;
    const changes = articlesChanges(vus, fraiches, faits);
    if (changes.length > 0) { erreur = messageArticlesChanges(changes.length); confirmer = false; perime = true; return false; }
    return true;
  }

  async function enregistrer() {
    const c0 = calculer();
    if (!c0.peutEnregistrer || envoi) return;
    if (c0.confirmationRequise && !confirmer) { depuis = Date.now(); confirmer = true; actualiser(); return; }
    if (c0.confirmationRequise && !confirmationPrete(depuis, Date.now())) return;
    envoi = true;
    enCours = true; erreur = null; info = null;
    actualiser();
    let renomme = renommeFait;
    try {
      if (!(await relireAvantEcrire())) return;
      // Plan sur l'état RELU (vus) et les articles déjà écrits (faits), jamais sur la photo d'ouverture.
      const plan = planEnregistrement(photo, saisies, faits, vus, !!c0.refId && nomPropre(nom) !== nomEnregistre);
      let tousFaits = faits;
      let nbEcrits = 0;
      if (!plan.defaite) {
        // (a) Le nom : renommer l'article interne (rien d'autre ne part si le nom est pris), ou le créer.
        let id = c0.refId;
        if (id) {
          const rn = await renommerSiBesoin(renommer, id, nom, nomEnregistre);
          if (rn === 'nom_pris') { nomRefuse = nom; confirmer = false; setTimeout(() => champNom.focus(), 0); return; }
          if (rn === 'renomme') { nomEnregistre = nomPropre(nom); renommeFait = true; renomme = true; }
        } else if (c0.verifNouvelle) {
          const voulu = c0.verifNouvelle.ok ?? (c0.existante ? { nom: c0.existante.nom, unite_reference: c0.existante.unite_reference } : null);
          if (!voulu) throw new Error(c0.problemeCreation ?? 'Écris un nom pour l’article interne.');
          id = await creerReference(voulu.nom, voulu.unite_reference);
          let relues;
          try { relues = await relireReferences(); } catch { throw new Error(TEXTE_REFERENCE_ENREGISTREE_RELECTURE); }
          if (!actif) return;
          refs = relues;
          const creee = relues.find((r) => r.id === id);
          idCree = id; nomEnregistre = voulu.nom;
          // La base renvoie l'article interne existant si le nom était déjà pris : son unité peut être différente, les coefficients seraient faux.
          if (creee && normaliserUnite(creee.unite_reference) !== normaliserUnite(voulu.unite_reference)) {
            confirmer = false;
            info = `« ${creee.nom} » existait déjà avec l’unité « ${creee.unite_reference} » : vérifie les coefficients, puis enregistre.`;
            return;
          }
        }
        if (!id) throw new Error('Écris un nom pour l’article interne.');
        // (b) Les articles cochés, un appel chacun (les liens validés inchangés ne sont pas renvoyés).
        const r = await executerEnSerie(plan.valider, (l) => valider(l.id, id, l.coefficient));
        if (!actif) return;
        tousFaits = [...faits, ...r.faits.map((l) => l.id)];
        nbEcrits = plan.valider.length;
        if (r.echecs.length > 0) {
          faits = tousFaits; confirmer = false;
          // Ce qui vient d'être écrit change l'aspect des autres lignes : on repart de l'état relu.
          try { const f = await relire(ids); if (actif) vus = f; } catch { /* la prochaine écriture relira */ }
          erreur = messageRegroupementInterrompu(tousFaits.length, tousFaits.length + r.echecs.length + r.nonTentes.length, r.echecs[0].element.designation, messageErreur(r.echecs[0].erreur));
          return;
        }
      }
      const message = renomme || nbEcrits > 0 ? messageFinal(renomme, nom, nbEcrits) : null;
      // (c) EN DERNIER, la sortie des articles décochés (la fenêtre se ferme, les bandeaux « Annuler » prennent le relais).
      if (plan.sortir.length > 0) {
        faits = tousFaits;
        const echec = await sortir(plan.sortir, { message, ids: tousFaits, dejaFait: resumeDejaFait(renomme, nbEcrits, nom) });
        if (echec !== null && actif) {
          confirmer = false; erreur = echec;
          // Certains articles sont sortis : on repart de l'état relu.
          try { const f = await relire(ids); if (actif) vus = f; } catch { /* la prochaine écriture relira */ }
        }
        return;
      }
      actif = false;
      fermerFenetre(true);
      surTermine(messageFinal(renomme, nom, nbEcrits), tousFaits);
    } catch (e) {
      if (actif) { erreur = messageErreur(e); confirmer = false; }
    } finally {
      envoi = false;
      if (actif) { enCours = false; actualiser(); }
    }
  }

  // ---------------------------------------------------------------- ouverture
  const pied = [boutonRetour, boutonEnregistrer];
  dialogue({
    titre: 'Association',
    contenu: formulaire,
    boutons: [],
    classe: 'dialogue-formulaire dialogue-association',
    peutFermer: () => !enCours,
    auMontage: ({ boite, fermer }) => {
      fermerFenetre = (force = false) => fermer(null, force);
      boite.querySelector('.dialogue-pied').append(...pied);
      actualiser();
    },
  }).then(() => { const encore = actif; actif = false; if (encore) surFerme?.(); });

  void (async () => {
    try {
      const fraiches = await relire(ids);
      if (!actif) return;
      const changes = articlesChanges(photo, fraiches);
      if (changes.length > 0) { perime = true; erreur = messageArticlesChanges(changes.length); }
      relecture = 'faite';
    } catch { if (actif) relecture = 'echec'; }
    if (actif) actualiser();
  })();
  Promise.resolve().then(() => lireVilles(ids)).then((v) => { if (actif) { villes = v; actualiser(); } }).catch(() => { if (actif) { villes = 'erreur'; actualiser(); } });

  return { fermer: () => { if (actif) { actif = false; fermerFenetre(true); } } };
}
