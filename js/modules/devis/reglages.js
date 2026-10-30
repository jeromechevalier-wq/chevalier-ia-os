// Réglages du module Devis : nom du bordereau, marge, TVA, durée de validité, mention d'émetteur, et « Mon entreprise » (le bloc en haut à gauche du devis).
// Aucune règle ici : le contrôle (validerReglagesDevis) est dans articles.js, l'écriture dans donnees.js. On modifie un brouillon ; « Enregistrer » contrôle tout, puis écrit.
import { h, icone, remplir, toast, iconeInfo } from '../../os/ui.js';
import { ajouterGardeSortie } from '../../os/router.js';
import * as CRM from '../crm/donnees.js';
import * as D from './donnees.js';
import * as A from './articles.js';
import { reglagesFamilles } from './reglages-familles.js';
import { reglagesExportDevis } from './export.js';
import { MODES_MARGE, REGIMES_TVA, TAUX_TVA_DEFAUT, erreursEmetteur } from './logique.js';

const ERREUR_ECRITURE = 'Enregistrement impossible : réessaie dans un instant, ou demande à un éditeur de l’espace.';

/** Le brouillon part des réglages enregistrés ; les nombres restent du texte tant qu'on tape. */
const brouillonDe = (r) => ({
  nomBordereau: r.nomBordereau, modeMarge: r.modeMarge, marge: String(r.marge).replace('.', ','), margeDevis: String(r.margeDevis).replace('.', ','), regimeTva: r.regimeTva, tauxProposes: [...r.tauxProposes],
  tauxTvaDefaut: r.tauxTvaDefaut, dureeValiditeJours: String(r.dureeValiditeJours), mentionEmetteur: r.mentionEmetteur, etapeAffaireCreee: r.etapeAffaireCreee,
  entreprise: entrepriseBrouillon(r.entreprise),
});

/** « Mon entreprise » en brouillon : tous les champs existent (texte vide = non renseigné), pour que les champs se remplissent et se comparent simplement. */
const entrepriseBrouillon = (e = {}) => ({
  nom: e.nom ?? '', forme: e.forme ?? '', siret: e.siret ?? '', tva: e.tva ?? '', telephone: e.telephone ?? '', email: e.email ?? '', site: e.site ?? '', registreMetiers: e.registreMetiers ?? '',
  couleur: e.couleur ?? '',
  adresse: { ligne1: e.adresse?.ligne1 ?? '', codePostal: e.adresse?.codePostal ?? '', ville: e.adresse?.ville ?? '' },
  assurance: { garantie: e.assurance?.garantie ?? '', assureur: e.assurance?.assureur ?? '', adresse: e.assurance?.adresse ?? '', zone: e.assurance?.zone ?? '' },
  mediateur: { nom: e.mediateur?.nom ?? '', email: e.mediateur?.email ?? '', site: e.mediateur?.site ?? '' },
  // Les méthodes proposées par l'écran sont cochées ; les autres (ancienne donnée ou texte libre) vont ensemble dans « Autre ». `iban` et `delaiJours` ne sont pas saisis ici mais voyagent pour ne pas être perdus.
  paiement: {
    modes: (e.paiement?.modes ?? []).filter((m) => A.MODES_PAIEMENT.includes(m)),
    autre: (e.paiement?.modes ?? []).filter((m) => !A.MODES_PAIEMENT.includes(m)).join(', '),
    ...(e.paiement?.iban ? { iban: e.paiement.iban } : {}), ...(e.paiement?.delaiJours !== undefined ? { delaiJours: e.paiement.delaiJours } : {}),
  },
});

export function reglages(page) {
  const sec = h('section', { class: 'carte-section', id: 'reglages-devis' },
    h('h2', {}, icone('file-text', { taille: 18 }), 'Général'),
    h('p', { class: 'aide' }, 'Le nom de ton catalogue de prix, la marge, la TVA, la durée de validité et les informations de ton entreprise (pastille « Mon entreprise » en haut de la page). « Enregistrer » s’allume dès que tu changes quelque chose.'));
  const zone = h('div', { class: 'pile reglages-devis' });
  const erreurGenerale = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'general' } });
  let brouillon = brouillonDe(D.etat.reglages);
  let reference = JSON.stringify(brouillon);
  let enCours = false;
  let boutonEnregistrer = null;
  let boutonAnnuler = null;

  const modifie = () => JSON.stringify(brouillon) !== reference;
  function majBoutons() {
    if (!boutonEnregistrer) return;
    boutonEnregistrer.disabled = !modifie() || enCours;
    boutonAnnuler.disabled = !modifie() || enCours;
  }
  const changer = (patch) => { Object.assign(brouillon, patch); majBoutons(); };

  const bloc = (cle, libelle, controle, aide = null) => h('div', { class: 'bloc-champ', dataset: { reglage: cle } },
    h('label', { class: 'etiquette', for: `devis-${cle}` }, libelle, aide ? iconeInfo(aide, libelle) : null), controle,
    h('p', { class: 'erreur erreur-champ', role: 'alert', dataset: { erreur: cle } }));
  const liste = (cle, options, valeur, surChoix) => h('select', { class: 'champ', id: `devis-${cle}`, dataset: { champ: cle }, onchange: (e) => surChoix(e.target.value) },
    options.map((o) => h('option', { value: String(o.valeur), selected: String(o.valeur) === String(valeur) }, o.libelle)));
  const texte = (cle, valeur, attrs = {}) => h('input', { type: 'text', class: 'champ', id: `devis-${cle}`, value: valeur, autocomplete: 'off', dataset: { champ: cle }, oninput: (e) => changer({ [cle]: e.target.value }), ...attrs });

  // « Mon entreprise » : `chemin` = ['assurance', 'garantie'] ou ['nom']. Le champ s'écrit dans le brouillon sans redessiner l'écran (le curseur reste en place).
  const lireEnt = (chemin) => chemin.reduce((o, k) => o[k], brouillon.entreprise);
  const ecrireEnt = (chemin, valeur) => { chemin.slice(0, -1).reduce((o, k) => o[k], brouillon.entreprise)[chemin.at(-1)] = valeur; majMentions(); majBoutons(); };
  const cleEnt = (chemin) => `entreprise.${chemin.join('.')}`;
  const champEnt = (chemin, libelle, { aide = null, attrs = {} } = {}) => {
    const cle = cleEnt(chemin);
    return h('div', { class: 'bloc-champ', dataset: { reglage: cle } },
      h('label', { class: 'etiquette', for: `devis-${cle}` }, libelle, aide ? iconeInfo(aide, libelle) : null),
      h('input', { type: 'text', class: 'champ', id: `devis-${cle}`, value: lireEnt(chemin), autocomplete: 'off', dataset: { champ: cle }, oninput: (e) => ecrireEnt(chemin, e.target.value), ...attrs }),
      h('p', { class: 'erreur erreur-champ', role: 'alert', dataset: { erreur: cle } }));
  };
  const listeMentions = h('ul', { class: 'aide', dataset: { zone: 'mentions-manquantes' } });
  const titreMentions = h('p', { class: 'etiquette', dataset: { zone: 'titre-mentions' } }, 'Mentions manquantes');
  /** Les mentions manquantes se recalculent à chaque frappe ; elles n'empêchent jamais d'enregistrer. */
  function majMentions() {
    const e = brouillon.entreprise;
    const sortie = A.validerEntreprise(e).entreprise; // les champs vides disparaissent : erreursEmetteur lit la même forme que le document
    const { mentions } = erreursEmetteur(sortie);
    remplir(listeMentions, mentions.map((m) => h('li', {}, m)));
    titreMentions.hidden = !mentions.length;
    listeMentions.hidden = !mentions.length;
    blocEntreprise?.toggleAttribute('data-alerte', mentions.length > 0); // le raccourci « Mon entreprise » en haut de la page affiche alors un point d'alerte
  }
  const couleurAffichee = () => brouillon.entreprise.couleur || '#666666';
  function blocCouleur() {
    const cle = 'entreprise.couleur';
    const choix = h('input', { type: 'color', class: 'champ champ-couleur', id: `devis-${cle}`, value: couleurAffichee(), dataset: { champ: cle },
      oninput: (e) => { ecrireEnt(['couleur'], e.target.value); etat.textContent = 'Couleur choisie.'; } });
    const etat = h('span', { class: 'discret' }, brouillon.entreprise.couleur ? 'Couleur choisie.' : 'Couleur par défaut (gris).');
    const defaut = h('button', { type: 'button', class: 'bouton', dataset: { action: 'couleur-par-defaut' },
      onclick: () => { ecrireEnt(['couleur'], ''); choix.value = '#666666'; etat.textContent = 'Couleur par défaut (gris).'; } }, 'Remettre la couleur par défaut');
    return h('div', { class: 'bloc-champ', dataset: { reglage: cle } },
      h('label', { class: 'etiquette', for: `devis-${cle}` }, 'Couleur du tableau', iconeInfo('La couleur des titres et des traits du tableau de ton devis. Sans choix, le devis reste gris.', 'Couleur du tableau')),
      h('div', { class: 'ligne-boutons' }, choix, etat, defaut),
      h('p', { class: 'erreur erreur-champ', role: 'alert', dataset: { erreur: cle } }));
  }
  /** Les méthodes de paiement acceptées : des cases (dans l'ordre fixe de la liste) et une ligne libre « Autre ». Rien n'est coché par défaut. */
  function blocPaiement() {
    const cases = h('fieldset', { class: 'cases', dataset: { champ: 'entreprise.paiement.modes' } }, h('legend', { class: 'sr-only' }, 'Méthodes de paiement acceptées'), A.MODES_PAIEMENT.map((m) => h('label', { class: 'case' },
      h('input', { type: 'checkbox', checked: brouillon.entreprise.paiement.modes.includes(m), dataset: { mode: m },
        onchange: (e) => ecrireEnt(['paiement', 'modes'], A.MODES_PAIEMENT.filter((x) => (x === m ? e.target.checked : brouillon.entreprise.paiement.modes.includes(x)))) }), m)));
    return h('div', { class: 'pile', dataset: { zone: 'methodes-paiement' } },
      h('h4', {}, 'Méthodes de paiement acceptées'),
      h('p', { class: 'aide' }, 'Cochées, elles s’impriment sur tes devis. Tu pourras les changer pour un devis précis, dans l’éditeur.'),
      cases,
      champEnt(['paiement', 'autre'], 'Autre (facultatif)', { aide: 'Une autre méthode, par exemple : Paiement en trois fois.' }));
  }
  let blocEntreprise = null;
  function sectionEntreprise() {
    const interieur = h('div', { class: 'pile', id: 'mon-entreprise', dataset: { zone: 'mon-entreprise' } },
      h('h3', {}, icone('building-2', { taille: 18 }), 'Mon entreprise'),
      h('p', { class: 'aide' }, 'Ces informations s’affichent en haut à gauche de tes devis (aperçu et impression). Tous les champs sont facultatifs : un champ vide n’apparaît pas.'),
      champEnt(['nom'], 'Nom de l’entreprise'),
      h('div', { class: 'ligne-champs' }, champEnt(['forme'], 'Forme juridique', { aide: 'Par exemple : SARL au capital de 5 000 €, SAS, entreprise individuelle.' }), champEnt(['siret'], 'SIRET', { attrs: { inputmode: 'numeric' } })),
      champEnt(['tva'], 'Numéro de TVA intracommunautaire'),
      champEnt(['adresse', 'ligne1'], 'Adresse (rue)'),
      h('div', { class: 'ligne-champs' }, champEnt(['adresse', 'codePostal'], 'Code postal', { attrs: { inputmode: 'numeric' } }), champEnt(['adresse', 'ville'], 'Ville')),
      h('div', { class: 'ligne-champs' }, champEnt(['telephone'], 'Téléphone', { attrs: { inputmode: 'tel' } }), champEnt(['email'], 'E-mail', { attrs: { inputmode: 'email' } })),
      champEnt(['site'], 'Site web'),
      champEnt(['registreMetiers'], 'Registre des métiers', { aide: 'Par exemple : RM 123 456 789 Paris. Écris la mention telle que tu veux la voir sur le devis.' }),
      blocCouleur(),
      blocPaiement(),
      h('h4', {}, 'Assurance professionnelle'),
      champEnt(['assurance', 'garantie'], 'Garantie', { aide: 'Par exemple : garantie décennale n° 123456.' }),
      h('div', { class: 'ligne-champs' }, champEnt(['assurance', 'assureur'], 'Assureur'), champEnt(['assurance', 'adresse'], 'Adresse de l’assureur')),
      champEnt(['assurance', 'zone'], 'Zone de couverture', { aide: 'Par exemple : France entière.' }),
      h('h4', {}, 'Médiateur de la consommation'),
      champEnt(['mediateur', 'nom'], 'Nom du médiateur'),
      h('div', { class: 'ligne-champs' }, champEnt(['mediateur', 'email'], 'E-mail du médiateur'), champEnt(['mediateur', 'site'], 'Site du médiateur')),
      titreMentions, listeMentions);
    blocEntreprise = h('div', { id: 'reglages-entreprise', 'data-raccourci': '' }, interieur); // l'enveloppe porte le raccourci de la page et son point d'alerte
    return blocEntreprise;
  }

  function rendre() {
    // Étape de départ des affaires créées depuis un devis : les étapes actives, dans l'ordre du pipeline. Une valeur enregistrée mais disparue reste visible et n'est jamais effacée.
    const etapes = CRM.etat.config.etapes.filter((e) => e.actif);
    const optionsEtapes = [{ valeur: '', libelle: 'Non réglée (je choisis à chaque fois)' }, ...etapes.map((e) => ({ valeur: e.id, libelle: e.libelle }))];
    if (brouillon.etapeAffaireCreee && !optionsEtapes.some((o) => o.valeur === brouillon.etapeAffaireCreee)) {
      const eteinte = CRM.etat.config.etapes.find((e) => e.id === brouillon.etapeAffaireCreee); // l'étape existe encore mais elle est désactivée : on garde son nom
      optionsEtapes.push({ valeur: brouillon.etapeAffaireCreee, libelle: eteinte ? `${eteinte.libelle} (étape désactivée)` : `${brouillon.etapeAffaireCreee} (étape disparue)` });
    }
    const taux = h('div', { class: 'cases', dataset: { champ: 'tauxProposes' } }, TAUX_TVA_DEFAUT.map((t) => h('label', { class: 'case' },
      h('input', { type: 'checkbox', checked: brouillon.tauxProposes.includes(t), dataset: { taux: String(t) }, 'aria-label': `Proposer le taux ${A.formaterTaux(t)}`,
        onchange: (e) => { changer({ tauxProposes: TAUX_TVA_DEFAUT.filter((x) => (x === t ? e.target.checked : brouillon.tauxProposes.includes(x))) }); } }), A.formaterTaux(t))));
    remplir(zone,
      bloc('nomBordereau', 'Nom du catalogue de prix', liste('nomBordereau', A.NOMS_BORDEREAU.map((n) => ({ valeur: n, libelle: n })), brouillon.nomBordereau, (v) => changer({ nomBordereau: v })),
        'C’est le titre de l’écran où tu ranges tes articles et leurs prix d’achat.'),
      h('div', { class: 'ligne-champs' },
        bloc('modeMarge', 'Mode de calcul de la marge', liste('modeMarge', MODES_MARGE.map((m) => ({ valeur: m.id, libelle: `${m.libelle} : ${m.explication} (${m.exemple})` })), brouillon.modeMarge, (v) => changer({ modeMarge: v })),
          'Calcul artisan (par défaut) : le pourcentage s’ajoute au prix d’achat, 25 % sur 100 € donnent 125 €. Calcul comptable : le pourcentage est pris sur le prix de vente, 25 % sur 100 € donnent 133,33 €. L’assistant applique ce choix sans le demander.'),
        bloc('marge', 'Marge de revente (%)', texte('marge', brouillon.marge, { inputmode: 'decimal' }),
          'Marge par défaut des articles du catalogue, sur le prix d’achat de chaque article. Ce n’est pas la marge d’un devis.')),
      bloc('margeDevis', 'Marge par défaut des nouveaux devis (%)', texte('margeDevis', brouillon.margeDevis, { inputmode: 'decimal' }),
        'Appliquée à chaque nouveau devis, modifiable devis par devis (bouton « Marge et ajustement »). 0 : aucune marge. Les devis déjà créés ne changent pas.'),
      h('div', { class: 'ligne-champs' },
        bloc('regimeTva', 'Régime de TVA', liste('regimeTva', REGIMES_TVA.map((r) => ({ valeur: r.id, libelle: r.libelle })), brouillon.regimeTva, (v) => changer({ regimeTva: v })),
          'Franchise en base : pas de TVA sur les devis (mention « article 293 B du CGI »). Assujetti : la TVA est calculée. À faire valider par ton comptable.'),
        bloc('dureeValiditeJours', 'Durée de validité d’un devis (jours)', texte('dureeValiditeJours', brouillon.dureeValiditeJours, { inputmode: 'numeric' }))),
      bloc('tauxProposes', 'Taux de TVA proposés', taux),
      bloc('tauxTvaDefaut', 'Taux de TVA par défaut', liste('tauxTvaDefaut', TAUX_TVA_DEFAUT.map((t) => ({ valeur: t, libelle: A.formaterTaux(t) })), brouillon.tauxTvaDefaut, (v) => changer({ tauxTvaDefaut: Number(v) }))),
      h('div', { class: 'pile', dataset: { zone: 'etape-affaire-creee' } },
        bloc('etapeAffaireCreee', 'Étape des affaires créées depuis un devis', liste('etapeAffaireCreee', optionsEtapes, brouillon.etapeAffaireCreee, (v) => changer({ etapeAffaireCreee: v })),
          'L’étape où est placée l’affaire que l’application crée quand tu finalises un devis sans affaire.'),
        etapes.length ? null : h('p', { class: 'aide', dataset: { zone: 'etape-affaire-creee-vide' } }, 'Aucune étape dans le pipeline')),
      bloc('mentionEmetteur', 'Mention d’émetteur (facultatif)', h('textarea', { class: 'champ', id: 'devis-mentionEmetteur', rows: 3, maxlength: '500', dataset: { champ: 'mentionEmetteur' }, value: brouillon.mentionEmetteur,
        oninput: (e) => changer({ mentionEmetteur: e.target.value }) }), 'Un texte libre qui accompagne tes devis (par exemple une mention légale). Il n’est pas encore envoyé nulle part.'),
      sectionEntreprise());
    majMentions();
    majBoutons();
  }

  async function enregistrer() {
    zone.querySelectorAll('[data-erreur]').forEach((p) => { p.textContent = ''; });
    erreurGenerale.textContent = '';
    enCours = true;
    majBoutons();
    try {
      const r = await D.enregistrerReglages(brouillon);
      const cles = Object.keys(r.erreurs);
      if (cles.length) {
        for (const cle of cles) { const p = zone.querySelector(`[data-erreur="${cle}"]`); if (p) p.textContent = r.erreurs[cle]; else erreurGenerale.textContent = r.erreurs[cle]; }
        toast('Corrige les erreurs avant d’enregistrer', { type: 'erreur' });
        return;
      }
      brouillon = brouillonDe(r.reglages);
      reference = JSON.stringify(brouillon);
      toast('Réglages des devis enregistrés');
      rendre();
    } catch (e) {
      console.warn(e);
      erreurGenerale.textContent = ERREUR_ECRITURE; // le brouillon reste modifié : le bouton reste jaune
      toast('Enregistrement impossible', { type: 'erreur' });
    } finally { enCours = false; majBoutons(); }
  }

  boutonEnregistrer = h('button', { type: 'button', class: 'bouton bouton-principal', disabled: true, dataset: { action: 'enregistrer-reglages-devis' }, onclick: enregistrer }, icone('check', { taille: 16 }), 'Enregistrer');
  boutonAnnuler = h('button', { type: 'button', class: 'bouton bouton-secondaire', disabled: true, dataset: { action: 'annuler-reglages-devis' },
    onclick: () => { brouillon = brouillonDe(D.etat.reglages); reference = JSON.stringify(brouillon); erreurGenerale.textContent = ''; rendre(); } }, 'Annuler les changements');
  sec.append(zone, erreurGenerale, h('div', { class: 'ligne-boutons' }, boutonEnregistrer, boutonAnnuler));
  page.append(sec);
  ajouterGardeSortie(() => sec.isConnected && modifie(), { message: 'Les réglages des devis ne sont pas enregistrés.' });
  rendre();

  // Un brouillon en cours n'est jamais écrasé par un changement venu d'ailleurs.
  function rafraichir() {
    if (modifie() || sec.contains(document.activeElement)) return;
    brouillon = brouillonDe(D.etat.reglages);
    reference = JSON.stringify(brouillon);
    rendre();
  }
  const arrets = [D.surChangement(rafraichir), CRM.surChangement(rafraichir), reglagesFamilles(page)]; // la section « Familles d'articles » vient sous les réglages
  reglagesExportDevis(page); // puis « Sauvegarde », tout en bas
  return () => arrets.forEach((f) => f());
}
