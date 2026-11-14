// Fiche d'un rendez-vous : le chantier, le tableau « qui peut quand » (coche verte, croix rouge, point d'interrogation, triangle rouge), les bandeaux,
// les boutons (Confirmer, Proposer d'autres créneaux, Annuler, Prévenir de la pluie) et l'historique des SMS en bulles.
// Aucune règle métier ici (logique.js) ; les écritures sont dans donnees.js. Rien ne part par SMS tant que l'envoi n'est pas branché (PR 4) : les fenêtres de SMS gardent « Envoyer » grisé.
import { h, icone, remplir, dialogue, toast, ouvrirMenu } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as CRM from '../crm/donnees.js';
import { planifier, badgeTest } from '../crm/composants.js';
import * as D from './donnees.js';
import * as R from './logique.js';
import { bulleSms, compteurSms, infoTelephone } from './composants.js';
import { creneauDepuisChamp, MESSAGE_ENVOI_NON_BRANCHE } from './creation.js';

const SYMBOLES = {
  oui: { icone: 'check', libelle: 'Peut' },
  non: { icone: 'x', libelle: 'Ne peut pas' },
  inconnu: { icone: 'circle-help', libelle: 'Pas de réponse' },
  incompris: { icone: 'triangle-alert', libelle: 'Réponse non comprise' },
};

/** Grosse coche verte, grosse croix rouge, point d'interrogation gris ou triangle rouge. */
export function symbole(nom) {
  const s = SYMBOLES[nom];
  return h('span', { class: `rdv-symbole rdv-symbole-${nom}`, role: 'img', 'aria-label': s.libelle, title: s.libelle, dataset: { symbole: nom } }, icone(s.icone, { taille: 28 }));
}

const ETATS_FICHE = { en_attente: 'En attente', a_valider: 'À valider', confirme: 'Confirmé', a_reprendre: 'À reprendre' };
const nomEtat = (r) => (r.annule ? 'Annulé' : ETATS_FICHE[r.etat || 'en_attente']);

/** Saisie de la réponse d'un participant par la professionnelle : une case par créneau, ou « Aucun créneau ne convient ». */
async function saisirReponse(rdv, participant) {
  const cases = (rdv.creneaux || []).map((c, i) => h('label', { class: 'rdv-case' }, h('input', { type: 'checkbox', value: String(i + 1), 'aria-label': R.libelleCreneau(i, c), checked: (participant.creneauxOk || []).includes(i + 1) }), R.libelleCreneau(i, c)));
  const aucun = h('label', { class: 'rdv-case' }, h('input', { type: 'checkbox', 'data-role': 'aucun', 'aria-label': 'Aucun créneau ne convient' }), 'Aucun créneau ne convient');
  aucun.querySelector('input').addEventListener('change', (e) => { if (e.target.checked) cases.forEach((c) => { c.querySelector('input').checked = false; }); });
  cases.forEach((c) => c.querySelector('input').addEventListener('change', (e) => { if (e.target.checked) aucun.querySelector('input').checked = false; }));
  const erreur = h('p', { class: 'erreur', role: 'alert' });
  const r = await dialogue({
    titre: `Réponse de ${participant.nom || 'cette personne'}`, classe: 'dialogue-formulaire',
    contenu: h('div', { class: 'pile' },
      participant.reponse ? h('p', { class: 'aide' }, 'Sa réponse exacte : ', h('strong', {}, `« ${participant.reponse} »`)) : null,
      h('p', {}, 'Quels créneaux lui conviennent ?'), ...cases, aucun, erreur),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Enregistrer sa réponse', valeur: true, style: 'principal',
      avantFermeture: async () => {
        const choisis = cases.map((c) => c.querySelector('input')).filter((i) => i.checked).map((i) => Number(i.value));
        if (!choisis.length && !aucun.querySelector('input').checked) { erreur.textContent = 'Coche au moins un créneau, ou « Aucun créneau ne convient ».'; return false; }
        try { await D.saisirReponseParticipant(participant.id, choisis); toast('Réponse enregistrée'); return true; } catch (e) { console.warn(e); erreur.textContent = D.messageErreur(e, 'Enregistrement impossible, réessaie.'); return false; }
      },
    }],
  });
  return r === true;
}

/** Nouvelle série : 1 à 3 nouveaux créneaux ; l'historique des SMS est gardé. */
async function proposerAutresCreneaux(rdv) {
  const champs = [0, 1, 2].map((i) => h('input', { class: 'champ', type: 'datetime-local', 'aria-label': `Nouveau créneau ${i + 1}` }));
  const erreur = h('p', { class: 'erreur', role: 'alert' });
  const r = await dialogue({
    titre: 'Proposer d’autres créneaux', classe: 'dialogue-formulaire',
    contenu: h('div', { class: 'pile' }, h('p', { class: 'aide' }, 'Les réponses de chacun repartent à zéro ; l’historique des SMS est gardé. Une réponse tardive à l’ancienne série ne compte pas.'),
      ...champs.map((c, i) => h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, `Créneau ${i + 1}`), c)), erreur),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Enregistrer la nouvelle série', valeur: true, style: 'principal',
      avantFermeture: async () => {
        try { await D.nouvelleSerie(rdv.id, champs.map((c) => creneauDepuisChamp(c.value)).filter(Boolean)); toast('Nouvelle série enregistrée'); return true; } catch (e) { console.warn(e); erreur.textContent = D.messageErreur(e, 'Enregistrement impossible, réessaie.'); return false; }
      },
    }],
  });
  return r === true;
}

/**
 * Fenêtre de SMS écrit à la main (pluie ou annulation) : texte prérempli MODIFIABLE, compteur, « Envoyer ». Rien ne part sans ce clic.
 * « Envoyer » est grisé tant que le serveur ne dit pas que l'envoi des SMS est branché pour cet espace (phrase affichée dans ce cas). Rend 'envoye', 'sans' (annulé sans prévenir), ou une autre valeur si fermée.
 */
async function fenetreSmsManuel(rdv, type, { titre, bouton2 = null } = {}) {
  const champ = h('textarea', { class: 'champ rdv-champ-multiligne', rows: '5', 'aria-label': 'Texte du SMS' });
  champ.value = R.texteSmsManuel(type, rdv, D.parametres());
  const compteur = compteurSms(champ.value);
  champ.addEventListener('input', () => compteur.maj(champ.value));
  const erreur = h('p', { class: 'erreur', role: 'alert' });
  const phrase = h('p', { class: 'aide', dataset: { role: 'envoi-non-branche' } }, MESSAGE_ENVOI_NON_BRANCHE);
  const boutons = [{ libelle: 'Fermer', valeur: false }];
  if (bouton2) boutons.push(bouton2);
  boutons.push({
    libelle: 'Envoyer', valeur: 'envoye', style: 'principal', desactive: true,
    avantFermeture: async () => {
      try {
        const r = await D.envoyerSmsManuel(rdv.id, type, champ.value);
        toast(r.declenche ? 'SMS en cours d’envoi' : 'SMS enregistré : il partira dans quelques minutes');
        return true;
      } catch (e) { console.warn(e); erreur.textContent = D.messageErreur(e, 'Envoi impossible, réessaie.'); return false; }
    },
  });
  // « Envoyer » suit la réponse du serveur (« l'envoi est branché ? ») même si elle arrive après l'ouverture de la fenêtre.
  let arret = () => {};
  const resultat = await dialogue({
    titre, classe: 'dialogue-formulaire',
    contenu: h('div', { class: 'pile' }, h('p', { class: 'aide' }, 'Ce texte est celui que recevront tous les participants. Tu peux le modifier : rien ne part sans ton clic sur « Envoyer ».'),
      champ, compteur.element, erreur, phrase),
    boutons,
    auMontage: ({ boutons: elements }) => {
      const envoyer = elements.at(-1);
      const maj = () => { const ok = D.envoiBranche() === true; envoyer.disabled = !ok; phrase.hidden = ok; };
      arret = D.surChangement(maj);
      maj();
    },
  });
  arret();
  return resultat;
}

async function annuler(rdv) {
  const r = await fenetreSmsManuel(rdv, 'annulation', {
    titre: 'Annuler le rendez-vous',
    bouton2: { libelle: 'Annuler sans prévenir', valeur: 'sans', style: 'danger', avantFermeture: async () => { try { await D.annulerRendezVous(rdv.id); toast('Rendez-vous annulé'); return true; } catch (e) { console.warn(e); toast(D.messageErreur(e, 'Annulation impossible'), { type: 'erreur' }); return false; } } },
  });
  if (r === 'sans' || r === 'envoye') naviguer('rdv/archives');
}

let confirmationEnCours = false;
/** Confirmer un créneau est un acte qui prévient tout le monde par SMS (PR 4) : une fenêtre demande confirmation, avec ce que disent les réponses. */
async function confirmerAvecFenetre(rdv, numero, bilan, bouton) {
  if (confirmationEnCours) return;
  const n = bilan.parCreneau[numero - 1];
  const ok = await dialogue({
    titre: `Confirmer le créneau ${numero} ?`,
    contenu: h('div', { class: 'pile' }, h('p', {}, R.libelleCreneau(numero - 1, rdv.creneaux[numero - 1])),
      h('p', { class: 'aide' }, `Il convient à ${n} ${n > 1 ? 'personnes' : 'personne'} sur ${bilan.total}. Une fois confirmé, tout le monde sera prévenu par SMS.`)),
    boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: `Confirmer le créneau ${numero}`, valeur: true, style: 'principal' }],
  });
  if (ok !== true) return;
  confirmationEnCours = true;
  bouton.disabled = true;
  try { await D.confirmerCreneau(rdv.id, numero); toast(`Créneau ${numero} confirmé`); } catch (e) { console.warn(e); toast(D.messageErreur(e, 'Confirmation impossible'), { type: 'erreur' }); bouton.disabled = false; } finally { confirmationEnCours = false; }
}

export function rendreFiche(conteneur, id) {
  const zone = h('div', { class: 'pile' });
  conteneur.append(h('div', { class: 'page page-rdv page-rdv-fiche' }, h('a', { class: 'lien-retour', href: '#/rdv/liste' }, icone('chevron-left', { taille: 16 }), 'Rendez-vous'), zone));

  function tableau(r, parts, ouvert) {
    const colonnes = (r.creneaux || []).map((c, i) => h('th', { scope: 'col', class: 'rdv-col-creneau', dataset: { creneau: String(i + 1) } }, h('span', { class: 'rdv-col-numero' }, `Créneau ${i + 1}`), h('span', { class: 'rdv-col-date' }, `${R.formaterJourLong(c)} à ${R.formaterHeure(c)}`)));
    const lignes = parts.map((p) => {
      const incompris = p.etatReponse === 'incomprise';
      return h('tr', { class: `rdv-ligne-reponse${incompris ? ' rdv-ligne-incomprise' : ''}`, dataset: { participant: p.id } },
        h('th', { scope: 'row', class: 'rdv-personne' },
          h('div', { class: 'rdv-personne-nom' }, h('span', {}, p.nom || 'Sans nom'), infoTelephone(p.telephone), incompris ? symbole('incompris') : null),
          p.role ? h('div', { class: 'aide rdv-personne-role' }, p.role) : null),
        (r.creneaux || []).map((_, i) => h('td', { class: 'rdv-cellule', dataset: { creneau: String(i + 1) } }, incompris ? null : symbole(R.symboleCellule(p, i)))),
        h('td', { class: 'rdv-sa-reponse' },
          p.reponse ? h('span', { class: 'rdv-reponse-texte', dataset: { role: 'reponse-exacte' } }, `« ${p.reponse} »`) : null,
          p.etatReponse === 'saisie' ? h('span', { class: 'aide', dataset: { role: 'saisie-par-toi' } }, 'Coché par toi') : null,
          ouvert ? h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'saisir-reponse', onclick: () => saisirReponse(r, p) },
            p.etatReponse === 'comprise' || p.etatReponse === 'saisie' ? 'Corriger' : 'Saisir sa réponse') : null));
    });
    return h('div', { class: 'zone-tableau' }, h('table', { class: 'tableau tableau-rdv-reponses', dataset: { role: 'qui-peut-quand' } },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Participant'), colonnes, h('th', { scope: 'col' }, 'Sa réponse'))), h('tbody', {}, lignes)));
  }

  const legende = () => h('ul', { class: 'rdv-legende', dataset: { role: 'legende' } }, ['oui', 'non', 'inconnu', 'incompris'].map((n) => h('li', {}, symbole(n), h('span', {}, SYMBOLES[n].libelle))));

  function historique(r, parts) {
    const msgs = R.historiqueMessages(D.messagesDe(r.id), parts);
    if (!msgs.length) return h('p', { class: 'aide', dataset: { role: 'historique-vide' } }, 'Aucun SMS pour l’instant. Les SMS envoyés et reçus apparaîtront ici.');
    return h('div', { class: 'rdv-historique', dataset: { role: 'historique' } }, msgs.map((m) => bulleSms({
      sens: m.sens === 'entrant' ? 'entrant' : 'sortant', texte: m.texte, qui: m.qui,
      heure: R.formaterCreneau(m.envoyeLe ?? m.recuLe ?? m.creeLe), caracteres: m.sens === 'entrant' ? null : (m.caracteres ?? R.compterSms(m.texte).caracteres), incomprise: m.sens === 'entrant' && m.comprise === false,
    })));
  }

  function rendre() {
    D.envoiBranche(); // la réponse du serveur (« l'envoi est branché ? ») arrive pendant qu'on lit la fiche : elle est connue quand on ouvre une fenêtre de SMS
    if (!(D.estPret() && CRM.estPret())) { remplir(zone, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); return; }
    const r = D.rendezVous(id);
    if (!r) { remplir(zone, h('div', { class: 'etat-vide' }, h('p', {}, 'Ce rendez-vous n’existe pas ou a été supprimé.'), h('a', { class: 'bouton bouton-secondaire', href: '#/rdv/liste' }, 'Retour aux rendez-vous'))); return; }
    const parts = D.participantsDe(id);
    const bilan = R.bilanReponses(parts, (r.creneaux || []).length || R.MAX_CRENEAUX);
    const etat = r.annule ? 'annule' : (r.etat || 'en_attente');
    const confirme = !r.annule && (r.etat === 'confirme' || !!r.creneauChoisi);
    const ouvert = R.estOuvert(r);
    const options = { creneaux: r.creneaux, maintenant: new Date().toISOString() };
    const bandeau = ouvert ? R.bandeauCreneau(bilan, options) : null;
    const propose = ouvert ? R.creneauAConfirmer(bilan, options) : null;
    const modifiable = !r.annule && !r.archive;

    const menu = r.annule ? null : h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Actions du rendez-vous', onclick: (e) => ouvrirMenu(e.currentTarget, [
      { libelle: r.archive ? 'Désarchiver' : 'Archiver', icone: r.archive ? 'archive-restore' : 'archive', action: async () => { try { await D.archiver(r.id, !r.archive); toast(r.archive ? 'Rendez-vous désarchivé' : 'Rendez-vous archivé'); } catch (err) { console.warn(err); toast(D.messageErreur(err, 'Action impossible'), { type: 'erreur' }); } } },
    ]) }, icone('ellipsis', { taille: 18 }));

    const boutons = [];
    const nonEnvoye = ouvert && !r.envoiDemandeLe && parts.length > 0;
    if (nonEnvoye) {
      // Pas encore envoyé : le bouton jaune est « Envoyer les propositions » (grisé tant que l'envoi n'est pas branché) ; « Confirmer » n'a aucun sens avant les premières réponses.
      const branche = D.envoiBranche() === true;
      boutons.push(h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'envoyer-propositions', disabled: !branche, title: branche ? '' : MESSAGE_ENVOI_NON_BRANCHE,
        onclick: async (e) => { e.currentTarget.disabled = true; try { await D.envoyerPropositions(r.id); toast('Propositions envoyées'); } catch (err) { console.warn(err); toast(D.messageErreur(err, 'Envoi impossible'), { type: 'erreur' }); e.currentTarget.disabled = false; } } }, 'Envoyer les propositions'));
      if (!branche) boutons.push(h('span', { class: 'aide', dataset: { role: 'envoi-non-branche' } }, MESSAGE_ENVOI_NON_BRANCHE));
    }
    if (ouvert && !nonEnvoye) {
      boutons.push(h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'confirmer-creneau', disabled: !propose,
        title: propose ? '' : 'Aucun créneau à venir à confirmer pour l’instant', 'aria-describedby': propose ? undefined : 'rdv-raison-confirmer',
        onclick: (e) => confirmerAvecFenetre(r, propose, bilan, e.currentTarget) },
      propose ? `Confirmer le créneau ${propose}` : 'Confirmer un créneau'));
      if (!propose) boutons.push(h('span', { id: 'rdv-raison-confirmer', class: 'aide', dataset: { role: 'raison-confirmer' } }, 'Aucun créneau à venir ne convient encore à quelqu’un : attends des réponses ou propose d’autres créneaux.'));
    }
    if (modifiable) boutons.push(h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'autres-creneaux', onclick: () => proposerAutresCreneaux(r) }, 'Proposer d’autres créneaux'));
    if (confirme) boutons.push(h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'prevenir-pluie', onclick: () => fenetreSmsManuel(r, 'pluie', { titre: 'Prévenir de la pluie' }) }, 'Prévenir de la pluie'));
    if (!r.annule) boutons.push(h('button', { type: 'button', class: 'bouton rdv-bouton-danger', 'data-action': 'annuler-rdv', onclick: () => annuler(r) }, 'Annuler le rendez-vous'));

    remplir(zone,
      h('header', { class: 'page-tete' }, h('div', {}, h('h1', {}, [r.client || 'Rendez-vous', r.commune].filter(Boolean).join(' · '), badgeTest(r)),
        h('p', { class: 'rdv-adresse', dataset: { role: 'adresse' } }, r.adresse || 'Pas d’adresse'), r.objet ? h('p', { class: 'aide' }, r.objet) : null),
      h('div', { class: 'page-actions' }, h('span', { class: `pastille-statut rdv-etat-${etat === 'annule' ? 'a_reprendre' : etat}`, dataset: { role: 'etat' } }, nomEtat(r)), menu)),
      confirme ? h('div', { class: 'rdv-bandeau rdv-bandeau-confirme', dataset: { role: 'bandeau-confirme' } }, `Rendez-vous confirmé : ${R.formaterCreneau(r.creneauChoisi)}.`) : null,
      bilan.incomprises ? h('div', { class: 'rdv-bandeau rdv-bandeau-rouge', role: 'alert', dataset: { role: 'bandeau-incompris' } }, icone('triangle-alert', { taille: 18 }), bilan.incomprises > 1 ? R.TEXTE_REPONSES_INCOMPRISES : R.TEXTE_REPONSE_INCOMPRISE) : null,
      bandeau ? h('div', { class: 'rdv-bandeau rdv-bandeau-violet', role: 'status', dataset: { role: 'bandeau-creneau', type: bandeau.type } }, bandeau.texte) : null,
      h('section', { class: 'carte-section' }, h('h2', {}, 'Qui peut quand'), parts.length ? tableau(r, parts, ouvert) : h('p', { class: 'aide' }, 'Aucun participant.'), legende()),
      h('div', { class: 'ligne-boutons rdv-boutons-fiche' }, boutons),
      h('section', { class: 'carte-section' }, h('h2', {}, 'Historique des SMS'), historique(r, parts)));
  }

  const planifie = planifier(rendre);
  rendre();
  const arrets = [D.surChangement(planifie), CRM.surChangement(planifie)];
  return () => arrets.forEach((f) => f());
}
