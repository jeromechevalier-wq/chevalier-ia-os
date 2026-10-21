// Factures d'un projet (version 2.2) : section de la fiche projet, fenêtres de paiement et de sortie « impayé ».
// Aucune règle métier ici : les règles sont dans logique.js (plans), exécutés par donnees.js.
import { h, icone, remplir, dialogue, confirmer, ouvrirMenu, toast } from '../../os/ui.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import { sectionRepliable, ligneAjouter } from '../crm/composants.js';
import { celebrerPaiement } from '../../os/celebrations.js';
import * as L from '../crm/logique.js';
import * as CRM from '../crm/donnees.js';
import * as D from './donnees.js';
import * as P from './logique.js';

const aujourdhui = () => CRM.ctx().aujourdhui;
const messageErreur = (e, defaut) => (e?.saisie ? e.message : defaut);
const premiereErreur = (erreurs) => Object.values(erreurs)[0];

async function ou(action, defaut) {
  try { return await action(); } catch (e) { console.warn(e); toast(messageErreur(e, defaut), { type: 'erreur' }); return null; }
}

/** Chiffre d'affaires encaissé du mois courant (avant/après un paiement : compteur de la célébration). */
const encaisseDuMois = () => L.CALCULS.ca_encaisse.calculer({ affaires: CRM.etat.affaires, projets: D.etat.projets }, L.moisCourant());

/** Marque une facture payée (date proposée, modifiable ; une facture se paie en entier) puis célèbre le paiement. Rend true quand c'est fait. */
export async function marquerPayee(p, f) {
  const date = h('input', { class: 'champ', type: 'date', 'aria-label': 'Date du paiement', value: aujourdhui(), autofocus: true });
  const erreur = h('p', { class: 'erreur', role: 'alert' });
  let reussi = false;
  const avant = encaisseDuMois();
  const r = await dialogue({
    titre: `Facture payée : ${P.libelleFacture(f)}`,
    contenu: h('div', { class: 'pile' },
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Date du paiement'), date),
      h('p', { class: 'aide' }, `Montant de la facture : ${L.formatEuros(f.montant)}. Une facture se paie en entier.`),
      erreur),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Encaisser', valeur: true, style: 'principal',
      avantFermeture: async () => {
        const plan = await ou(() => D.marquerFacturePayee(p.id, f.id, { datePaiement: date.value }), 'Paiement impossible');
        if (!plan) return false;
        if (Object.keys(plan.erreurs || {}).length) { erreur.textContent = premiereErreur(plan.erreurs); return false; }
        reussi = true;
        return true;
      },
    }],
    auMontage: ({ boutons }) => [date].forEach((c) => c.addEventListener('keydown', (e) => { if (e.key === 'Enter') boutons.at(-1).click(); })),
  });
  if (!r || !reussi) return false;
  toast('Paiement enregistré');
  const apres = encaisseDuMois();
  if (apres > avant) celebrerPaiement(avant, apres, (n) => L.formatEuros(Math.round(n)));
  return true;
}

async function modifier(p, f) {
  const libelle = h('input', { class: 'champ', type: 'text', 'aria-label': 'Libellé de la facture', value: f.libelle || '', autofocus: true });
  const montant = h('input', { class: 'champ', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', 'aria-label': 'Montant en euros', value: f.montant });
  const envoi = h('input', { class: 'champ', type: 'date', 'aria-label': 'Date d’envoi', value: f.dateEnvoi || '' });
  const paiement = f.statut === 'payee' ? h('input', { class: 'champ', type: 'date', 'aria-label': 'Date du paiement', value: f.datePaiement || '' }) : null;
  const erreur = h('p', { class: 'erreur', role: 'alert' });
  await dialogue({
    titre: 'Modifier la facture',
    contenu: h('div', { class: 'pile' },
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Libellé'), libelle),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Montant (€)'), montant),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Date d’envoi'), envoi),
      paiement ? h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Date du paiement'), paiement) : null,
      erreur),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Enregistrer', valeur: true, style: 'principal',
      avantFermeture: async () => {
        const plan = await ou(() => D.modifierFacture(p.id, f.id, { libelle: libelle.value, montant: montant.value, dateEnvoi: envoi.value, ...(paiement ? { datePaiement: paiement.value } : {}) }), 'Modification impossible');
        if (!plan) return false;
        if (Object.keys(plan.erreurs || {}).length) { erreur.textContent = premiereErreur(plan.erreurs); return false; }
        return true;
      },
    }],
  });
}

/** Demande la raison d'un abandon. Rend la raison, ou null si on annule. */
async function demanderRaison(titre, message) {
  const champ = h('input', { class: 'champ', type: 'text', 'aria-label': 'Raison', placeholder: 'Ex. client injoignable, geste commercial', autofocus: true });
  const erreur = h('p', { class: 'erreur', role: 'alert' });
  let raison = null;
  await dialogue({
    titre,
    contenu: h('div', { class: 'pile' }, h('p', {}, message), h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Raison'), champ), erreur),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Abandonner', valeur: true, style: 'danger',
      avantFermeture: () => {
        if (!champ.value.trim()) { erreur.textContent = 'Dis en quelques mots pourquoi.'; champ.classList.add('invalide'); return false; }
        raison = champ.value.trim();
        return true;
      },
    }],
    auMontage: ({ boutons }) => champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') boutons.at(-1).click(); }),
  });
  return raison;
}

async function abandonner(p, f) {
  const raison = await demanderRaison('Abandonner la facture', `${P.libelleFacture(f)} (${L.formatEuros(f.montant)}) ne sera jamais payée. Elle ne comptera pas dans l’encaissé.`);
  if (!raison) return;
  const plan = await ou(() => D.abandonnerFacture(p.id, f.id, raison), 'Abandon impossible');
  if (plan?.erreurs && Object.keys(plan.erreurs).length) toast(premiereErreur(plan.erreurs), { type: 'erreur' });
  else if (plan) toast('Facture abandonnée');
}

async function retirer(p, f) {
  const avant = p.factures || [];
  await retirerAvecAnnulation({
    titre: 'Supprimer la facture ?', message: `${P.libelleFacture(f)} (${L.formatEuros(f.montant)}) sera retirée du projet.`, libelleOk: 'Supprimer', danger: true, messageErreur: 'Suppression impossible',
    faire: () => D.supprimerFacture(p.id, f.id), defaire: () => D.restaurerFactures(p.id, avant), messageFait: 'Facture supprimée',
  });
}

async function remettre(p, f) {
  const plan = await ou(() => D.remettreFactureAPayer(p.id, f.id), 'Changement impossible');
  if (!plan) return;
  if (Object.keys(plan.erreurs || {}).length) { toast(premiereErreur(plan.erreurs), { type: 'erreur' }); return; }
  toast('Facture remise à payer');
}

function menuFacture(p, f) {
  return [
    ...(f.statut === 'a_payer' ? [{ libelle: 'Marquer payée…', icone: 'circle-check', action: () => marquerPayee(p, f) }] : []),
    ...(f.statut !== 'abandonnee' ? [{ libelle: 'Modifier…', icone: 'pencil', action: () => modifier(p, f) }] : []),
    ...(f.statut === 'a_payer' ? [{ libelle: 'Abandonner…', icone: 'ban', action: () => abandonner(p, f) }] : []),
    ...(f.statut !== 'a_payer' ? [{ libelle: 'Remettre à payer', icone: 'rotate-ccw', action: () => remettre(p, f) }] : []),
    { libelle: 'Supprimer…', icone: 'trash-2', danger: true, action: () => retirer(p, f) },
  ];
}

const pastilleFacture = (f) => {
  const s = P.STATUTS_FACTURE.find((x) => x.id === f.statut);
  return h('span', { class: `pastille-statut statut-facture-${f.statut}`, style: { '--couleur': s?.couleur || '#8d8993' } }, P.libelleStatutFacture(f.statut));
};

/** Section « Factures » de la fiche projet : totaux, une ligne par facture, formulaire d'ajout. `majListe` redessine la liste seule (pendant une saisie ailleurs). */
export function sectionFactures(p) {
  const zoneListe = h('div', { class: 'factures-liste' });
  const champLibelle = h('input', { class: 'champ', type: 'text', 'aria-label': 'Libellé de la facture', placeholder: 'Libellé (ex. Acompte 30 %)' });
  const champMontant = h('input', { class: 'champ champ-court', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', 'aria-label': 'Montant de la facture en euros', placeholder: 'Montant (€)' });
  const champEnvoi = h('input', { class: 'champ champ-court', type: 'date', 'aria-label': 'Date d’envoi de la facture', value: '' });
  // « Factures  + Ajouter » : le formulaire n'apparaît qu'après le clic (une facture à la fois), et se referme dès qu'elle est ajoutée.
  const ouvrirAjout = () => { ajout.hidden = false; ligneOuvrir.hidden = true; champLibelle.focus(); };
  const fermerAjout = () => { ajout.hidden = true; ligneOuvrir.hidden = false; };
  const ligneOuvrir = ligneAjouter({ libelle: 'Factures', libelleAria: 'Ajouter une facture', surClic: ouvrirAjout, action: 'ouvrir-ajout-facture' });
  const sec = sectionRepliable({ id: 'projet-factures', titre: 'Factures', compteur: P.facturesDe(p).length, contenu: h('div', { class: 'pile' }, ligneOuvrir, zoneListe) });

  function ligne(courant, f) {
    return h('li', { class: `ligne-facture statut-${f.statut}`, dataset: { facture: f.id, statut: f.statut } },
      h('div', { class: 'facture-texte' },
        h('strong', {}, P.libelleFacture(f)),
        h('span', { class: 'aide' }, [
          f.dateEnvoi ? `envoyée le ${L.formatJourCourt(f.dateEnvoi, aujourdhui())}` : 'pas encore envoyée',
          f.statut === 'payee' && f.datePaiement ? `payée le ${L.formatJourCourt(f.datePaiement, aujourdhui())}` : null,
          f.statut === 'abandonnee' && f.raison ? `raison : ${f.raison}` : null,
        ].filter(Boolean).join(' · '))),
      h('span', { class: 'facture-montant' }, L.formatEuros(f.montant)),
      pastilleFacture(f),
      f.statut === 'a_payer' ? h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'payer-facture', onclick: () => marquerPayee(courant, f) }, 'Marquer payée') : null,
      h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Actions de la facture ${P.libelleFacture(f)}`, 'data-action': 'menu-facture',
        onclick: (e) => ouvrirMenu(e.currentTarget, menuFacture(courant, f)) }, icone('ellipsis', { taille: 18 })));
  }

  async function ajouter() {
    const courant = D.projet(p.id);
    if (!courant) return;
    const plan = await ou(() => D.ajouterFacture(courant.id, { libelle: champLibelle.value, montant: champMontant.value, dateEnvoi: champEnvoi.value }), 'Ajout impossible');
    if (!plan) return;
    if (Object.keys(plan.erreurs || {}).length) {
      toast(premiereErreur(plan.erreurs), { type: 'erreur' });
      if (plan.erreurs.montant) champMontant.classList.add('invalide');
      return;
    }
    champLibelle.value = '';
    champMontant.value = '';
    champEnvoi.value = '';
    champMontant.classList.remove('invalide');
    fermerAjout();
    toast('Facture ajoutée');
    majListe();
  }
  const ajout = h('div', { class: 'ligne-ajout ligne-ajout-facture', hidden: true }, champLibelle, champMontant, champEnvoi,
    h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'ajouter-facture', onclick: ajouter }, 'Ajouter'),
    h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'data-action': 'annuler-ajout-facture', onclick: fermerAjout }, 'Annuler'));
  [champLibelle, champMontant, champEnvoi].forEach((c) => c.addEventListener('keydown', (e) => { if (e.key === 'Enter') ajouter(); else if (e.key === 'Escape') fermerAjout(); }));
  sec.corps.append(ajout);

  function majListe() {
    const courant = D.projet(p.id) ?? p;
    const factures = P.facturesDe(courant);
    const t = P.totauxFactures(courant);
    sec.element.querySelector('.section-compteur')?.replaceChildren(String(factures.length));
    remplir(zoneListe,
      factures.length
        ? h('div', { class: 'pile' },
          h('p', { class: 'factures-totaux', dataset: { role: 'totaux-factures' } },
            `Facturé ${L.formatEuros(t.facture)} · payé ${L.formatEuros(t.paye)} · reste à payer ${L.formatEuros(t.aPayer)}`,
            t.abandonne ? ` · abandonné ${L.formatEuros(t.abandonne)}` : ''),
          h('ul', { class: 'liste-simple liste-factures' }, factures.map((f) => ligne(courant, f))))
        : h('p', { class: 'aide' }, 'Aucune facture. Ajoute une ligne par échéance (acompte, jalon, solde) : la clôture attendra qu’elles soient payées.'));
  }
  majListe();
  return { element: sec.element, majListe };
}

/**
 * Clôture bloquée : explique, nomme les factures et propose les deux sorties.
 *  1. marquer la facture payée (puis la clôture est retentée) ;
 *  2. clôturer avec impayé (la raison est demandée ; les factures restantes passent à « Abandonnée »).
 * Rend 'paye' (une facture vient d'être payée), 'impaye' (le projet est clôturé avec impayé) ou null (annulé).
 */
export async function proposerSorties(p, bloquantes) {
  let facturePayee = null;
  let fermerDialogue = () => {};
  const lignes = bloquantes.map((f) => h('li', { class: 'ligne-simple', dataset: { facture: f.id } },
    h('span', {}, `${P.libelleFacture(f)} : ${L.formatEuros(f.montant)}`),
    h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'sortie-payer',
      onclick: () => { facturePayee = f; fermerDialogue('payer'); } }, 'Marquer payée…')));
  const r = await dialogue({
    titre: 'Clôture bloquée',
    contenu: h('div', { class: 'pile' },
      h('p', {}, bloquantes.length > 1 ? 'Ces factures ne sont pas encore payées. Le projet ne peut pas être clôturé tant qu’elles sont à payer.' : 'Cette facture n’est pas encore payée. Le projet ne peut pas être clôturé tant qu’elle est à payer.'),
      h('ul', { class: 'liste-simple' }, lignes),
      h('p', { class: 'aide' }, 'Deux sorties : marquer la facture payée, ou clôturer avec impayé (la facture sera abandonnée).')),
    boutons: [
      { libelle: 'Annuler', valeur: 'annuler' },
      { libelle: 'Clôturer avec impayé…', valeur: 'impaye', style: 'danger' },
    ],
    auMontage: ({ fermer }) => { fermerDialogue = fermer; },
  });
  if (r === 'payer' && facturePayee) return (await marquerPayee(p, facturePayee)) ? 'paye' : null;
  if (r === 'impaye') {
    const raison = await demanderRaison('Clôturer avec impayé', `${bloquantes.length > 1 ? 'Les factures restantes seront abandonnées' : 'La facture restante sera abandonnée'} et ne compteront pas dans l’encaissé. Le projet gardera une pastille « Impayé ».`);
    return raison ? { impaye: { raison } } : null;
  }
  return null;
}
