// Réglages du module Devis : nom du bordereau, marge, TVA, durée de validité, étapes liées, mention d'émetteur.
// Aucune règle ici : le contrôle (validerReglagesDevis) est dans articles.js, l'écriture dans donnees.js. On modifie un brouillon ; « Enregistrer » contrôle tout, puis écrit.
import { h, icone, remplir, toast, iconeInfo } from '../../os/ui.js';
import { ajouterGardeSortie } from '../../os/router.js';
import * as CRM from '../crm/donnees.js';
import * as D from './donnees.js';
import * as A from './articles.js';
import { reglagesFamilles } from './reglages-familles.js';
import { MODES_MARGE, REGIMES_TVA, TAUX_TVA_DEFAUT } from './logique.js';

const ERREUR_ECRITURE = 'Enregistrement impossible : réessaie dans un instant, ou demande à un éditeur de l’espace.';

/** Le brouillon part des réglages enregistrés ; les nombres restent du texte tant qu'on tape. */
const brouillonDe = (r) => ({
  nomBordereau: r.nomBordereau, modeMarge: r.modeMarge, marge: String(r.marge).replace('.', ','), regimeTva: r.regimeTva, tauxProposes: [...r.tauxProposes],
  tauxTvaDefaut: r.tauxTvaDefaut, dureeValiditeJours: String(r.dureeValiditeJours), etapeAFaire: r.etapeAFaire, etapeEnvoye: r.etapeEnvoye, mentionEmetteur: r.mentionEmetteur,
});

export function reglages(page) {
  const sec = h('section', { class: 'carte-section', id: 'reglages-devis' },
    h('h2', {}, icone('file-text', { taille: 18 }), 'Réglages des devis'),
    h('p', { class: 'aide' }, 'Le nom de ton bordereau de prix, la marge, la TVA, la durée de validité et les étapes de tes affaires liées aux devis. « Enregistrer » s’allume dès que tu changes quelque chose.'));
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

  function rendre() {
    const etapes = CRM.etat.config.etapes.filter((e) => e.actif);
    const optionsEtapes = [{ valeur: '', libelle: 'Aucune' }, ...etapes.map((e) => ({ valeur: e.id, libelle: e.libelle }))];
    // Une étape enregistrée mais disparue reste visible (et sera refusée à l'enregistrement avec un message).
    for (const cle of ['etapeAFaire', 'etapeEnvoye']) {
      if (brouillon[cle] && !optionsEtapes.some((o) => o.valeur === brouillon[cle])) optionsEtapes.push({ valeur: brouillon[cle], libelle: `${brouillon[cle]} (étape disparue)` });
    }
    const taux = h('div', { class: 'cases', dataset: { champ: 'tauxProposes' } }, TAUX_TVA_DEFAUT.map((t) => h('label', { class: 'case' },
      h('input', { type: 'checkbox', checked: brouillon.tauxProposes.includes(t), dataset: { taux: String(t) }, 'aria-label': `Proposer le taux ${A.formaterTaux(t)}`,
        onchange: (e) => { changer({ tauxProposes: TAUX_TVA_DEFAUT.filter((x) => (x === t ? e.target.checked : brouillon.tauxProposes.includes(x))) }); } }), A.formaterTaux(t))));
    remplir(zone,
      bloc('nomBordereau', 'Nom du bordereau de prix', liste('nomBordereau', A.NOMS_BORDEREAU.map((n) => ({ valeur: n, libelle: n })), brouillon.nomBordereau, (v) => changer({ nomBordereau: v })),
        'C’est le titre de l’écran où tu ranges tes articles et leurs prix d’achat.'),
      h('div', { class: 'ligne-champs' },
        bloc('modeMarge', 'Mode de marge par défaut', liste('modeMarge', MODES_MARGE.map((m) => ({ valeur: m.id, libelle: m.libelle })), brouillon.modeMarge, (v) => changer({ modeMarge: v })),
          'Majoration : le prix d’achat est multiplié (20 % sur 100 € donne 120 €). Marge sur le prix de vente : le calcul du comptable (20 % sur 100 € donne 125 €).'),
        bloc('marge', 'Marge par défaut (%)', texte('marge', brouillon.marge, { inputmode: 'decimal' }))),
      h('div', { class: 'ligne-champs' },
        bloc('regimeTva', 'Régime de TVA', liste('regimeTva', REGIMES_TVA.map((r) => ({ valeur: r.id, libelle: r.libelle })), brouillon.regimeTva, (v) => changer({ regimeTva: v })),
          'Franchise en base : pas de TVA sur les devis (mention « article 293 B du CGI »). Assujetti : la TVA est calculée. À faire valider par ton comptable.'),
        bloc('dureeValiditeJours', 'Durée de validité d’un devis (jours)', texte('dureeValiditeJours', brouillon.dureeValiditeJours, { inputmode: 'numeric' }))),
      bloc('tauxProposes', 'Taux de TVA proposés', taux),
      bloc('tauxTvaDefaut', 'Taux de TVA par défaut', liste('tauxTvaDefaut', TAUX_TVA_DEFAUT.map((t) => ({ valeur: t, libelle: A.formaterTaux(t) })), brouillon.tauxTvaDefaut, (v) => changer({ tauxTvaDefaut: Number(v) }))),
      h('div', { class: 'ligne-champs' },
        bloc('etapeAFaire', 'Étape où un devis est à faire', liste('etapeAFaire', optionsEtapes, brouillon.etapeAFaire, (v) => changer({ etapeAFaire: v })),
          'L’étape de tes affaires où il faut préparer un devis (par exemple après le rendez-vous). Rien ne change tout seul pour l’instant.'),
        bloc('etapeEnvoye', 'Étape où il a été envoyé', liste('etapeEnvoye', optionsEtapes, brouillon.etapeEnvoye, (v) => changer({ etapeEnvoye: v })),
          'L’étape de tes affaires une fois le devis envoyé au client.')),
      bloc('mentionEmetteur', 'Mention d’émetteur (facultatif)', h('textarea', { class: 'champ', id: 'devis-mentionEmetteur', rows: 3, maxlength: '500', dataset: { champ: 'mentionEmetteur' }, value: brouillon.mentionEmetteur,
        oninput: (e) => changer({ mentionEmetteur: e.target.value }) }), 'Un texte libre qui accompagne tes devis (par exemple une mention légale). Il n’est pas encore envoyé nulle part.'));
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
  return () => arrets.forEach((f) => f());
}
