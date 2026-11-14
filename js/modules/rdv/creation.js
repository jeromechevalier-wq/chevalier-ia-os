// Écran « Nouveau rendez-vous » : le chantier (objet, adresse multiligne), les participants (fiches Personnes du socle), 1 à 3 créneaux, aperçu des deux premiers SMS.
// Rien ne part tant que l'envoi des SMS n'est pas branché : « Envoyer les propositions » reste grisé avec une phrase, « Enregistrer sans envoyer » crée le rendez-vous.
import { h, icone, remplir, toast, demanderTexte, champIntelligent } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as CRM from '../crm/donnees.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';
import * as R from './logique.js';
import { bulleSms, compteurSms } from './composants.js';
import { cheminRdv } from './liste.js';

export const MESSAGE_ENVOI_NON_BRANCHE = 'L’envoi des SMS n’est pas encore branché sur cet espace : enregistre le rendez-vous, il partira dès que ce sera prêt.';

/** « 2026-11-17T10:00 » (champ date et heure, heure de Paris) -> instant ISO, ou '' si vide ou illisible. */
export function creneauDepuisChamp(valeur) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(valeur || ''));
  if (!m) return '';
  return R.versISO(R.instantDepuisParis(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])));
}

const elementsPersonnes = () => CRM.etat.personnes.filter((p) => !p.archive).map((p) => ({ id: p.id, libelle: p.nom, sousTitre: premierMobile(p) ? R.afficherTelephone(premierMobile(p)) : '', extra: (p.telephones || []).map((t) => t.valeur) }));
/** Premier numéro de mobile valide d'une fiche, au format international, ou ''. */
export function premierMobile(personne) {
  for (const t of personne?.telephones || []) { const r = R.normaliserTelephone(t.valeur); if (r.ok) return r.telephone; }
  return '';
}

export function rendreCreation(conteneur) {
  const roles = () => D.parametres().roles;
  const lignes = []; // { element, lire() -> { personneId, nom, telephone, role }, retirer }
  const zoneLignes = h('div', { class: 'pile rdv-participants' });
  const erreurs = h('div', { class: 'erreur rdv-erreurs', role: 'alert', hidden: true });

  const champObjet = h('input', { class: 'champ', type: 'text', id: 'rdv-objet', autocomplete: 'off', 'aria-label': 'Objet de la visite', placeholder: 'Ex. visite avant terrassement' });
  const champAdresse = h('textarea', { class: 'champ rdv-champ-multiligne', id: 'rdv-adresse', rows: '3', 'aria-label': 'Adresse du rendez-vous', placeholder: 'Rue\nCode postal et ville', oninput: () => majApercu() });

  function selectRole(valeur = '') {
    const sel = h('select', { class: 'champ', 'aria-label': 'Rôle' });
    const remplirOptions = (choisi) => remplir(sel,
      h('option', { value: '' }, 'Rôle…'),
      roles().map((r) => h('option', { value: r, selected: r === choisi }, r)),
      h('option', { value: '__ajouter' }, '+ Ajouter un rôle'));
    remplirOptions(valeur);
    sel.addEventListener('change', async () => {
      if (sel.value !== '__ajouter') return;
      const nom = await demanderTexte('Ajouter un rôle', { libelle: 'Nom du rôle' });
      const r = nom ? R.ajouterRole(roles(), nom) : null;
      if (r && !r.ok) toast(r.message, { type: 'erreur' });
      if (r?.ok) { try { await D.majParametres({ roles: r.roles }); } catch (e) { console.warn(e); toast(D.messageErreur(e, e?.message || 'Ajout impossible'), { type: 'erreur' }); } }
      remplirOptions(r?.ok ? r.roles.at(-1) : '');
    });
    return sel;
  }

  function ajouterLigne(depart = {}) {
    let choisie = null;
    let prefill = ''; // dernier numéro posé par un choix de fiche : il suit le choix tant qu'on ne l'a pas retouché
    const champTel = h('input', { class: 'champ', type: 'tel', autocomplete: 'off', 'aria-label': 'Téléphone mobile', placeholder: '06 00 00 00 00', value: depart.telephone || '', oninput: () => majApercu() });
    const nom = champIntelligent({
      etiquette: 'Nom', placeholder: 'Nom (contact existant ou nouveau)', icone: 'user', libre: true,
      fournir: (saisie) => L.rechercherSuggestions(saisie, elementsPersonnes(), { creer: false }),
      surChoix: (el) => {
        choisie = el ? CRM.personne(el.id) : null;
        const nouveau = choisie && premierMobile(choisie) ? R.afficherTelephone(premierMobile(choisie)) : '';
        if (!champTel.value.trim() || champTel.value === prefill) { champTel.value = nouveau; prefill = nouveau; }
        majApercu();
      },
    });
    const role = selectRole(depart.role || '');
    const retirer = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Retirer ce participant', onclick: () => { el.remove(); lignes.splice(lignes.indexOf(ligne), 1); majApercu(); } }, icone('trash-2', { taille: 16 }));
    const el = h('div', { class: 'rdv-ligne-participant', dataset: { role: 'participant' } },
      h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Nom'), nom.element),
      h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Téléphone'), champTel),
      h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Rôle'), role), retirer);
    const ligne = { element: el, lire: () => ({ personneId: choisie?.id || null, nom: choisie?.nom || nom.texte(), telephone: champTel.value, role: role.value === '__ajouter' ? '' : role.value }) };
    lignes.push(ligne);
    zoneLignes.append(el);
  }

  // Créneaux : trois champs date et heure, le premier obligatoire.
  const champsCreneaux = [0, 1, 2].map((i) => h('input', { class: 'champ', type: 'datetime-local', id: `rdv-creneau-${i + 1}`, 'aria-label': `Créneau ${i + 1}`, onchange: () => majApercu() }));
  const libellesCreneaux = [0, 1, 2].map(() => h('span', { class: 'aide rdv-libelle-creneau' }));
  const creneaux = () => champsCreneaux.map((c) => creneauDepuisChamp(c.value)).filter(Boolean);

  // Aperçu des deux premiers SMS (exemple de ce que recevra la première personne).
  const zoneApercu = h('div', { class: 'rdv-apercu', dataset: { role: 'apercu-sms' } });
  function majApercu() {
    champsCreneaux.forEach((c, i) => { const iso = creneauDepuisChamp(c.value); libellesCreneaux[i].textContent = iso ? R.libelleCreneau(i, iso) : ''; });
    const c = creneaux();
    const p = D.parametres();
    const participants = lignes.map((l) => l.lire());
    const pro = (p.numerosAlerte.find((n) => n.id === p.numeroAffiche) || p.numerosAlerte.find((n) => n.actif) || p.numerosAlerte[0] || {}).numero;
    const valeurs = { nom_pro: p.nomDansLesSms, client: R.clientDe(participants), creneaux: R.listeCreneauxSms(c), adresse: '', numero_pro: pro ? R.afficherTelephone(pro) : '', date: '', heure: '' };
    remplir(zoneApercu, ['confiance', 'creneaux'].map((type) => {
      const sms = R.construireSms(type, valeurs, p);
      const compteur = compteurSms(sms.texte);
      return h('div', { class: 'rdv-apercu-sms', dataset: { type } }, bulleSms({ sens: 'sortant', texte: sms.texte }), compteur.element);
    }));
  }

  function montrerErreurs(liste) {
    erreurs.hidden = !liste.length;
    remplir(erreurs, liste.map((m) => h('p', {}, m)));
  }

  let enCours = false;
  async function enregistrer({ envoyer = false } = {}) {
    if (enCours) return;
    const nettoyes = lignes.map((l) => l.lire()).map((x) => {
      const nom = L.nettoyerEspaces(x.nom);
      // Un nom tapé sans cliquer la suggestion qui est exactement celui d'une fiche existante : on prend cette fiche (pas de doublon).
      const existante = !x.personneId && nom ? L.trouverDoublonsPersonne(CRM.etat.personnes.filter((p) => !p.archive), { nom })[0] : null;
      return { ...x, nom: existante?.nom || nom, personneId: x.personneId || existante?.id || null };
    }).filter((x) => x.nom || x.telephone);
    const verdict = R.validerNouveauRdv({ participants: nettoyes, creneaux: creneaux(), maintenant: new Date() });
    const problemes = [...verdict.erreurs];
    nettoyes.forEach((x, i) => { if (!x.nom) problemes.push(`Participant ${i + 1} : écris son nom.`); });
    montrerErreurs(problemes);
    if (problemes.length) return;
    enCours = true;
    boutonEnregistrer.disabled = true;
    try {
      const id = await D.creerRendezVous({ objet: champObjet.value, adresse: champAdresse.value, creneaux: creneaux(), participants: verdict.participants });
      if (envoyer) {
        // Le rendez-vous est enregistré d'abord : si l'envoi est refusé, rien n'est perdu et la fiche propose de le renvoyer.
        try { await D.envoyerPropositions(id); toast('Propositions envoyées'); } catch (e) { console.warn(e); toast(`Rendez-vous enregistré, mais l’envoi n’a pas pu partir : ${D.messageErreur(e, 'réessaie depuis la fiche.')}`, { type: 'erreur', duree: 7000 }); }
      } else toast('Rendez-vous enregistré');
      naviguer(cheminRdv(id));
    } catch (e) {
      console.warn(e);
      montrerErreurs([D.messageErreur(e, 'Enregistrement impossible. Vérifie ta connexion, puis réessaie.')]);
      boutonEnregistrer.disabled = false;
    } finally { enCours = false; }
  }

  const boutonEnvoyer = h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'envoyer-propositions', disabled: true, title: MESSAGE_ENVOI_NON_BRANCHE, onclick: () => enregistrer({ envoyer: true }) }, 'Envoyer les propositions');
  const boutonEnregistrer = h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'enregistrer-rdv', onclick: () => enregistrer() }, 'Enregistrer sans envoyer');
  const phraseEnvoi = h('p', { class: 'aide', dataset: { role: 'envoi-non-branche' } }, MESSAGE_ENVOI_NON_BRANCHE);
  /** « Envoyer » n'est actif que si le serveur dit que n8n est branché pour cet espace ; sinon il reste grisé avec sa phrase. */
  function majEnvoi() {
    const branche = D.envoiBranche() === true;
    boutonEnvoyer.disabled = !branche;
    boutonEnvoyer.title = branche ? '' : MESSAGE_ENVOI_NON_BRANCHE;
    phraseEnvoi.hidden = branche;
  }
  const boutonAnnuler = h('button', { type: 'button', class: 'bouton bouton-discret', 'data-action': 'annuler-rdv', onclick: () => naviguer('rdv/liste') }, 'Annuler');

  ajouterLigne();
  const carte = (titre, ...contenu) => h('section', { class: 'carte-section' }, h('h2', {}, titre), ...contenu);
  conteneur.append(h('div', { class: 'page page-rdv page-rdv-creation' },
    h('header', { class: 'page-tete' }, h('div', {}, h('a', { class: 'lien-retour', href: '#/rdv/liste' }, icone('chevron-left', { taille: 16 }), 'Rendez-vous'), h('h1', {}, 'Nouveau rendez-vous'))),
    carte('Le chantier',
      h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: 'rdv-objet' }, 'Objet de la visite'), champObjet),
      h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: 'rdv-adresse' }, 'Adresse du rendez-vous'), champAdresse,
        h('p', { class: 'aide' }, 'Elle sera aussi proposée sur la fiche de la première personne de la liste.'))),
    carte('Participants', zoneLignes,
      h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'ajouter-personne', onclick: () => { ajouterLigne(); majApercu(); } }, icone('plus', { taille: 16 }), 'Ajouter une personne')),
    carte('Tes créneaux (1 à 3)', champsCreneaux.map((c, i) => h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: c.id }, `Créneau ${i + 1}`), c, libellesCreneaux[i]))),
    carte('Ce que chaque personne recevra', zoneApercu),
    erreurs,
    phraseEnvoi,
    h('div', { class: 'ligne-boutons' }, boutonEnvoyer, boutonEnregistrer, boutonAnnuler)));
  majApercu();
  majEnvoi();
  const arret = D.surChangement(() => { majApercu(); majEnvoi(); });
  return () => arret();
}
