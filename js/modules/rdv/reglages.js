// Réglages du module Rendez-vous, dans la page Réglages de la coque (sections `reglages-rdv-…`, déclarées dans le registre) :
// relances, rappel la veille, plage d'envoi, numéros d'alerte, nom dans les SMS, nom de l'entreprise, connexion SMS (Jérôme seul), rôles, prix d'un SMS, modèles de SMS (participants et alertes), sauvegarde.
// Chaque réglage s'enregistre tout seul à chaque changement (journal commun) ; un refus ou une panne affiche un message.
import { h, icone, remplir, dialogue, toast, demanderTexte, confirmer } from '../../os/ui.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';
import * as R from './logique.js';
import { interrupteur, champNombre, compteurSms, EXPLICATION_ACCENTS } from './composants.js';
import { reglagesExportRdv } from './export.js';
import { miseEnRoute } from './mise-en-route.js';
import * as CRM from '../crm/donnees.js';
import { modeTestAllume, surModeTest } from '../../os/mode-test.js';

const LIEN_REGLES_SMS_ENTRANTS = 'https://dashboard.clicksend.com/messaging-settings/sms/inbound-sms';
// Page de recharge du compte ClickSend : affichée comme lien (nouvel onglet) et comptée dans l'aperçu de l'alerte « solde bas », jamais appelée. Adresse à faire vérifier par Jérôme (15/11/2026).
const LIEN_RECHARGE_CLICKSEND = 'https://dashboard.clicksend.com/portal/billing#add-credit';

/**
 * Bloc repliable « Comment configurer ClickSend pour recevoir les réponses et les STOP » : même texte chez Jérôme et chez les clients. L'adresse des réponses n'est écrite que si elle est
 * déjà affichée dans la carte (`adresse`, rendue par le serveur, jamais en dur ici) : c'est un secret de fait, son code est la seule protection.
 */
let aideOuverte = false; // le bloc reste ouvert quand la carte se redessine (adresse affichée, enregistrement)
export function aideClickSend(adresse = '', peutConfigurer = true, connexionEnregistree = true) {
  const bloc = h('details', { class: 'rdv-aide-clicksend', dataset: { role: 'aide-clicksend' } },
    h('summary', {}, 'Comment configurer ClickSend pour recevoir les réponses et les STOP'),
    h('ol', { class: 'rdv-aide-etapes' },
      h('li', {}, 'Ouvre ', h('a', { href: LIEN_REGLES_SMS_ENTRANTS, target: '_blank', rel: 'noopener noreferrer' }, LIEN_REGLES_SMS_ENTRANTS), ' (menu « SMS », puis « Inbound Rules »).'),
      h('li', {}, 'Désactive les deux règles que ClickSend crée d’office pour le mot « stop » : « Send to messenger » (action SEND_TO_MESSENGER) et « Opt-out contact » (action MOVE_CONTACT). Ouvre chacune et décoche « Enabled ». Sinon ClickSend garde le STOP pour lui et il n’arrive jamais chez nous.'),
      h('li', {}, 'Crée une règle, ou transforme la « Default rule » : « Dedicated number » = ANY, « Action » = URL, méthode POST, « Action address » = l’adresse des réponses de cette carte, « Match for » vide, « Enabled » coché. Enregistre.',
        adresse ? h('div', { class: 'rdv-aide-adresse', dataset: { role: 'aide-adresse' } }, 'Adresse à coller : ', h('code', {}, adresse)) : h('div', { class: 'aide', dataset: { role: 'aide-adresse-absente' } }, !peutConfigurer ? 'L’administrateur de la plateforme te donne cette adresse.' : connexionEnregistree ? 'Pour la voir ici, clique sur « Afficher l’adresse des réponses ».' : 'Enregistre d’abord la connexion : l’adresse des réponses apparaîtra ensuite.')),
      h('li', {}, 'Vérifie : envoie-toi un SMS puis réponds-y ; la réponse doit apparaître dans l’historique de la fiche en quelques secondes. Réponds ensuite STOP : le numéro doit apparaître désinscrit.')),
    h('p', { class: 'aide' }, 'L’adresse des réponses est un secret de fait : son code est la seule protection. Ne la partage avec personne.'));
  bloc.open = aideOuverte;
  bloc.addEventListener('toggle', () => { aideOuverte = bloc.open; });
  return bloc;
}

/** Une seule fenêtre « Nom + Numéro de mobile » : une erreur de numéro s'écrit dans la fenêtre, qui reste ouverte. Un numéro déjà dans la liste est refusé de la même façon. Rend { libelle, numero } ou null (annulé). */
async function fenetreAjoutNumero(existants = []) {
  const nom = h('input', { type: 'text', class: 'champ', 'aria-label': 'Nom (ex. Mon mobile, Collègue)', maxlength: '40', autocomplete: 'off', autofocus: true });
  const tel = h('input', { type: 'tel', class: 'champ', 'aria-label': 'Numéro de mobile', placeholder: '06 00 00 00 00', autocomplete: 'off' });
  const erreur = h('p', { class: 'erreur', role: 'alert' });
  const effacer = () => { erreur.textContent = ''; };
  nom.addEventListener('input', effacer); tel.addEventListener('input', effacer);
  let resultat = null;
  await dialogue({
    titre: 'Ajouter un numéro', classe: 'dialogue-formulaire',
    contenu: h('div', { class: 'pile' },
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Nom (ex. Mon mobile, Collègue)'), nom),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Numéro de mobile'), tel), erreur),
    boutons: [
      { libelle: 'Annuler', valeur: null },
      { libelle: 'Enregistrer', valeur: true, style: 'principal', avantFermeture: () => {
        const libelle = L.nettoyerEspaces(nom.value);
        if (!libelle) { erreur.textContent = 'Écris un nom pour retrouver ce numéro.'; nom.focus(); return false; }
        if (!tel.value.trim()) { erreur.textContent = 'Écris le numéro de mobile.'; tel.focus(); return false; }
        const t = R.normaliserTelephone(tel.value);
        if (!t.ok) { erreur.textContent = t.message; tel.focus(); return false; }
        const deja = existants.find((n) => n && R.normaliserTelephone(n.numero).telephone === t.telephone); // le numéro déjà rangé est normalisé comme la saisie (06, +33, 0033…)
        if (deja) { erreur.textContent = `Ce numéro est déjà dans la liste${deja.libelle ? ` (${deja.libelle})` : ''}.`; tel.focus(); return false; }
        resultat = { libelle, numero: t.telephone };
        return true;
      } },
    ],
    auMontage: ({ boutons }) => { [nom, tel].forEach((c) => c.addEventListener('keydown', (e) => { if (e.key === 'Enter') boutons.at(-1).click(); })); },
  });
  return resultat;
}

async function enregistrer(patch, message = 'Enregistré') {
  try { await D.majParametres(patch); if (message) toast(message); return true; } catch (e) { console.warn(e); toast(D.messageErreur(e, e?.message || 'Enregistrement impossible'), { type: 'erreur' }); return false; }
}

/** Une carte de réglages : `corps()` est redessiné quand les données changent (sauf si on tape dedans). */
function carte(page, id, titre, corps, { aide = '' } = {}) {
  const zone = h('div', { class: 'pile' });
  const el = h('section', { class: 'carte-section', id }, h('h2', {}, titre), aide ? h('p', { class: 'aide' }, aide) : null, zone);
  // On ne redessine pas pendant qu'on tape dans un champ de cette carte ; un clic sur un bouton ne bloque rien.
  const dessiner = () => { const a = document.activeElement; if (!(a && zone.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) remplir(zone, corps()); };
  remplir(zone, corps());
  page.append(el);
  return dessiner;
}

const ligne = (libelle, ...controles) => h('div', { class: 'rdv-reglage-ligne' }, h('span', { class: 'etiquette' }, libelle), ...controles);

export function reglages(page) {
  const redessins = [];

  // ── Bilan « Prêt à passer en vrai ? » : six vérifications, en lecture seule (n'enregistre rien, n'envoie aucun SMS). Le solde est demandé au serveur (jamais gardé ici), « Actualiser » le relit (le serveur garde 60 s).
  const solde = { etat: 'attente', valeur: null }; // etat : attente | chargement | ok | indisponible
  let redessinerBilan = () => {};
  function chargerSolde() {
    if (solde.etat === 'chargement') return;
    solde.etat = 'chargement';
    D.lireSoldeSms().then((v) => { solde.valeur = v; solde.etat = typeof v === 'number' ? 'ok' : 'indisponible'; })
      .catch((e) => { console.warn(e); solde.valeur = null; solde.etat = 'indisponible'; })
      .finally(() => redessinerBilan());
  }
  const lecteur = () => CRM.compteCourant()?.ecrit === false; // un lecteur chez un client ne peut lire ni « branché » ni le solde : ces cases restent grises
  const caseBilan = (id, etat, texte, ...extra) => h('li', { class: `rdv-bilan-ligne ${etat}`, dataset: { role: `bilan-${id}`, etat } },
    icone(etat === 'vert' ? 'circle-check' : etat === 'rouge' ? 'circle-x' : 'circle-help', { taille: 18 }), h('span', {}, texte, ...extra));
  const lienExterne = (adresse, texte, role) => h('a', { href: adresse, target: '_blank', rel: 'noopener noreferrer', dataset: { role } }, texte);
  redessinerBilan = carte(page, 'reglages-rdv-bilan', 'Prêt à passer en vrai ?', () => {
    const p = D.parametres();
    const peutLire = !lecteur();
    const branche = D.envoiBranche();
    const panne = peutLire && D.etatEnvoiEnErreur(); // la question « branché ? » a échoué : on ne sait pas (ce n'est PAS « pas branché »)
    const seuilHaut = R.seuilsSoldeDe(p)[0];
    const grise = 'Indisponible avec ton compte (lecture seule).';
    const impossible = 'Vérification impossible pour le moment. Clique sur « Actualiser ».';
    const manque = D.peutConfigurerConnexion() === false ? 'La connexion ClickSend n’est pas encore enregistrée : l’administrateur de la plateforme doit la saisir.' : 'Enregistre d’abord la connexion ClickSend.';
    if (peutLire && !panne && branche === true && solde.etat === 'attente') chargerSolde();
    const cases = [];
    const enAttente = []; // cases en cours de lecture : pas de décompte provisoire
    // 1. connexion
    if (!peutLire) cases.push(caseBilan('connexion', 'gris', 'Connexion ClickSend : ', grise));
    else if (panne) cases.push(caseBilan('connexion', 'gris', 'Connexion ClickSend : ', impossible));
    else if (branche === null) { enAttente.push('connexion'); cases.push(caseBilan('connexion', 'gris', 'Connexion ClickSend : ', 'vérification…')); }
    else cases.push(branche ? caseBilan('connexion', 'vert', 'Connexion ClickSend : ', 'enregistrée.') : caseBilan('connexion', 'rouge', 'Connexion ClickSend : ', manque));
    // 2. adresse des réponses : se déduit de « branché » et ne vérifie RIEN de plus (elle se contrôle chez ClickSend) : jamais verte, ne compte pas dans « tout est vert ». Elle n'est jamais écrite ici (elle contient un code secret).
    if (!peutLire) cases.push(caseBilan('adresse', 'gris', 'Adresse des réponses : ', grise));
    else if (panne) cases.push(caseBilan('adresse', 'gris', 'Adresse des réponses : ', impossible));
    else if (branche === null) { enAttente.push('adresse'); cases.push(caseBilan('adresse', 'gris', 'Adresse des réponses : ', 'vérification…')); }
    else if (branche) cases.push(caseBilan('adresse', 'gris', 'Adresse des réponses : ', 'à vérifier chez ClickSend (elle est créée avec la connexion ; elle doit être collée dans la règle « SMS entrants »). ', lienExterne(LIEN_REGLES_SMS_ENTRANTS, 'Ouvrir les règles de ClickSend', 'bilan-lien-reponses')));
    else cases.push(caseBilan('adresse', 'rouge', 'Adresse des réponses : ', manque));
    // 3. numéro de test
    cases.push(p.numeroTest ? caseBilan('numero-test', 'vert', 'Numéro de test : ', `renseigné (${R.afficherTelephone(p.numeroTest)}).`)
      : caseBilan('numero-test', 'rouge', 'Numéro de test : ', 'aucun, un rendez-vous de test n’enverrait rien. Renseigne-le dans « Numéros qui reçoivent les alertes ».'));
    // 4. mode test (celui de toute l'appli, par navigateur)
    cases.push(modeTestAllume()
      ? caseBilan('mode-test', 'rouge', 'Mode test : ', 'allumé. Les rendez-vous créés pendant le mode test envoient leurs SMS vers ton numéro de test. Éteins-le pour de vrais rendez-vous. Les rendez-vous déjà marqués « test » restent en test ; les anciens rendez-vous non test envoient toujours aux vrais participants.')
      : caseBilan('mode-test', 'vert', 'Mode test : ', 'éteint. Les nouveaux rendez-vous envoient aux vrais participants. Les rendez-vous déjà marqués « test » le restent.'));
    // 5. solde
    if (!peutLire) cases.push(caseBilan('solde', 'gris', 'Solde : ', grise));
    else if (panne) cases.push(caseBilan('solde', 'gris', 'Solde : ', impossible));
    else if (branche === null || (branche && (solde.etat === 'attente' || solde.etat === 'chargement') && solde.valeur === null)) { enAttente.push('solde'); cases.push(caseBilan('solde', 'gris', 'Solde : ', 'lecture chez ClickSend…')); }
    else if (!branche) cases.push(caseBilan('solde', 'rouge', 'Solde : ', manque));
    else if (solde.etat === 'indisponible' || typeof solde.valeur !== 'number') cases.push(caseBilan('solde', 'gris', 'Solde : ', 'indisponible pour le moment (ClickSend n’a pas répondu, ou le compte n’est pas en euros). Regarde-le sur ton compte ClickSend.'));
    else if (solde.valeur >= seuilHaut) cases.push(caseBilan('solde', 'vert', 'Solde : ', `${R.formaterEuros(solde.valeur)} chez ClickSend, au-dessus de ton seuil le plus haut (${R.formaterSeuil(seuilHaut)} €).`));
    else cases.push(caseBilan('solde', 'rouge', 'Solde : ', `${R.formaterEuros(solde.valeur)} chez ClickSend, sous ton seuil le plus haut (${R.formaterSeuil(seuilHaut)} €). Recharge ton compte : `, lienExterne(LIEN_RECHARGE_CLICKSEND, 'Recharger sur ClickSend', 'bilan-lien-recharge')));
    // 6. numéro d'alerte (même définition qu'au serveur : un numéro est actif tant que son interrupteur n'est pas coupé)
    const nbAlertes = p.numerosAlerte.filter((n) => n && n.actif !== false && n.numero).length;
    cases.push(nbAlertes ? caseBilan('alertes', 'vert', 'Alertes : ', `${nbAlertes === 1 ? 'un numéro les reçoit' : `${nbAlertes} numéros les reçoivent`}.`)
      : caseBilan('alertes', 'rouge', 'Alertes : ', 'aucun numéro actif, tu ne recevras aucune alerte (réponse non comprise, STOP, solde bas…).'));
    const etatDe = (c) => c.dataset.etat;
    const verts = cases.filter((c) => etatDe(c) === 'vert').length;
    const rouges = cases.filter((c) => etatDe(c) === 'rouge').length;
    const grises = cases.filter((c) => etatDe(c) === 'gris').length;
    const grisesHorsAdresse = cases.filter((c) => etatDe(c) === 'gris' && c.dataset.role !== 'bilan-adresse').length;
    let resume;
    if (enAttente.length) resume = 'Vérification en cours…';
    else if (!rouges && !grisesHorsAdresse) resume = 'Tout est vert : tu peux passer en vrai. Il reste à vérifier chez ClickSend l’adresse des réponses.';
    else if (!rouges) resume = `Rien de rouge, mais ${grisesHorsAdresse} vérification${grisesHorsAdresse > 1 ? 's' : ''} impossible${grisesHorsAdresse > 1 ? 's' : ''} pour le moment.`;
    else resume = `${verts} sur ${cases.length - grises} vérifications au vert.`;
    const actualiser = peutLire && (branche === true || panne)
      ? h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'actualiser-bilan', disabled: solde.etat === 'chargement', onclick: () => {
        if (D.etatEnvoiEnErreur()) D.reverifierEnvoi(); // après une panne : « branché ? » est redemandé au serveur
        solde.etat = 'attente'; solde.valeur = null; redessinerBilan();
      } }, icone('refresh-cw', { taille: 16 }), 'Actualiser') : null;
    return [h('p', { dataset: { role: 'bilan-resume' } }, resume), h('ul', { class: 'rdv-bilan' }, cases), actualiser,
      h('p', { class: 'aide' }, 'Cette liste ne change rien et n’envoie aucun SMS. Le solde est lu chez ClickSend (au plus une fois par minute).')];
  });
  redessins.push(redessinerBilan);
  const arretModeTest = surModeTest(() => redessinerBilan());

  // ── Mise en route : quatre étapes dépliables (texte seulement ; le voyant lit « branché » et le numéro de test déjà connus de l'écran)
  redessins.push(carte(page, 'reglages-rdv-mise-en-route', 'Mise en route de l’envoi des SMS', () => miseEnRoute({
    peutConfigurer: D.peutConfigurerConnexion(), branche: D.envoiBranche(), numeroTest: D.parametres().numeroTest || '',
  })));

  redessins.push(carte(page, 'reglages-rdv-relances', 'Relances', () => {
    const p = D.parametres();
    const delai = h('input', { class: 'champ rdv-champ-nombre', type: 'number', min: '1', max: '240', step: '1', value: String(p.relances.delaiHeures), 'aria-label': 'Délai entre deux relances, en heures',
      onchange: (e) => { const n = Math.floor(Number(e.target.value)); if (n >= 1 && n <= 240) enregistrer({ relances: { ...D.parametres().relances, delaiHeures: n } }); else e.target.classList.add('invalide'); } });
    const nombre = champNombre({ valeur: p.relances.nombre, min: 0, max: 10, libelle: 'Nombre de relances', surChangement: (n) => enregistrer({ relances: { ...D.parametres().relances, nombre: n } }) });
    return [ligne('Délai entre deux relances (heures)', delai), ligne('Nombre de relances', nombre.element),
      h('p', { class: 'aide' }, 'Après la dernière relance sans réponse, tu reçois une alerte 24 h plus tard.')];
  }));

  redessins.push(carte(page, 'reglages-rdv-rappel', 'Rappel la veille', () => {
    const p = D.parametres();
    const heure = h('input', { class: 'champ rdv-champ-heure', type: 'time', value: p.rappel.heure, disabled: !p.rappel.actif, 'aria-label': 'Heure du rappel',
      onchange: (e) => { if (/^\d{2}:\d{2}$/.test(e.target.value)) enregistrer({ rappel: { ...D.parametres().rappel, heure: e.target.value } }); } });
    const ligneHeure = ligne('Heure du rappel', heure);
    ligneHeure.classList.toggle('grisee', !p.rappel.actif);
    const montrer = (actif) => { heure.disabled = !actif; ligneHeure.classList.toggle('grisee', !actif); }; // tout de suite, sans attendre la base
    const bascule = interrupteur({ valeur: p.rappel.actif, libelle: 'Envoyer un rappel la veille', surChangement: async (v) => {
      montrer(v);
      const ok = await enregistrer({ rappel: { ...D.parametres().rappel, actif: v } });
      if (!ok) { bascule.definir(!v); montrer(!v); }
    } });
    return [ligne('Envoyer un rappel la veille', bascule.element), ligneHeure,
      h('p', { class: 'aide' }, 'Heure de Paris. Le rappel part la veille du rendez-vous confirmé, dans la plage d’envoi.')];
  }));

  redessins.push(carte(page, 'reglages-rdv-plage', 'Plage d’envoi', () => {
    const p = D.parametres();
    const champ = (cle, libelle) => h('input', { class: 'champ rdv-champ-heure', type: 'time', value: p.plage[cle], 'aria-label': libelle,
      onchange: (e) => {
        const prochain = { ...D.parametres().plage, [cle]: e.target.value };
        if (!/^\d{2}:\d{2}$/.test(prochain.debut) || !/^\d{2}:\d{2}$/.test(prochain.fin) || prochain.fin <= prochain.debut) { toast('La fin doit être après le début.', { type: 'erreur' }); e.target.value = p.plage[cle]; return; }
        enregistrer({ plage: prochain });
      } });
    return [ligne('Pas de SMS avant', champ('debut', 'Début de la plage d’envoi')), ligne('Pas de SMS après', champ('fin', 'Fin de la plage d’envoi')),
      h('p', { class: 'aide' }, 'Un SMS qui tombe en dehors de cette plage (heure de Paris) attend l’ouverture suivante. La confirmation et les SMS écrits à la main partent tout de suite.')];
  }));

  redessins.push(carte(page, 'reglages-rdv-alertes', 'Numéros qui reçoivent les alertes', () => {
    const p = D.parametres();
    const numeros = p.numerosAlerte;
    const frais = () => D.parametres().numerosAlerte; // la liste au moment du clic, jamais celle du dessin (deux clics de suite ne se défont pas)
    const maj = (liste, extra = {}) => enregistrer({ numerosAlerte: liste, ...extra });
    const lignes = numeros.map((n) => {
      const bascule = interrupteur({ valeur: n.actif, libelle: `Alerter ${n.libelle || R.afficherTelephone(n.numero)}`, surChangement: async (v) => { if (!(await maj(frais().map((x) => (x.id === n.id ? { ...x, actif: v } : x))))) bascule.definir(!v); } });
      return h('div', { class: 'rdv-numero', dataset: { numero: n.id } },
        h('span', { class: 'rdv-numero-nom' }, n.libelle || 'Numéro'), h('span', { class: 'rdv-numero-tel' }, R.afficherTelephone(n.numero)), bascule.element,
        h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Supprimer le numéro ${n.libelle || R.afficherTelephone(n.numero)}`,
          onclick: () => maj(frais().filter((x) => x.id !== n.id), D.parametres().numeroAffiche === n.id ? { numeroAffiche: '' } : {}) }, icone('trash-2', { taille: 16 })));
    });
    const choix = h('select', { class: 'champ', 'aria-label': 'Numéro donné aux participants', onchange: (e) => enregistrer({ numeroAffiche: e.target.value }) },
      h('option', { value: '' }, numeros.length ? 'Le premier numéro actif' : 'Ajoute d’abord un numéro'),
      numeros.map((n) => h('option', { value: n.id, selected: n.id === p.numeroAffiche }, `${n.libelle || 'Numéro'} · ${R.afficherTelephone(n.numero)}`)));
    const ajouter = h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'ajouter-numero', onclick: async () => {
      const ajout = await fenetreAjoutNumero(frais());
      if (!ajout) return;
      maj([...frais(), { id: L.idAleatoire().slice(0, 6), libelle: ajout.libelle, numero: ajout.numero, actif: true }]);
    } }, icone('plus', { taille: 16 }), 'Ajouter un numéro');
    return [numeros.length ? h('div', { class: 'pile' }, lignes) : h('p', { class: 'aide', dataset: { role: 'aucun-numero' } }, 'Aucun numéro pour l’instant : tu ne recevras aucune alerte.'),
      ajouter, ligne('Numéro donné aux participants', choix),
      h('p', { class: 'aide' }, 'Vacances, téléphone perdu, collègue : coupe le numéro concerné avec son interrupteur.'),
      ligne('Numéro des SMS de test', h('input', { class: 'champ', type: 'tel', value: p.numeroTest ? R.afficherTelephone(p.numeroTest) : '', 'aria-label': 'Numéro des SMS de test', placeholder: '06 00 00 00 00',
        onchange: (e) => {
          const saisie = e.target.value.trim();
          if (!saisie) { enregistrer({ numeroTest: '' }); return; }
          const t = R.normaliserTelephone(saisie);
          if (!t.ok) { toast(t.message, { type: 'erreur' }); e.target.value = p.numeroTest ? R.afficherTelephone(p.numeroTest) : ''; return; }
          enregistrer({ numeroTest: t.telephone });
        } })),
      h('p', { class: 'aide' }, 'Un rendez-vous marqué comme test n’envoie ses SMS qu’à ce numéro, jamais à un participant. Sans ce numéro, un rendez-vous de test n’envoie rien.')];
  }));

  redessins.push(carte(page, 'reglages-rdv-nom', 'Ton nom dans les SMS', () => {
    const p = D.parametres();
    return [ligne('Nom signé dans les SMS', h('input', { class: 'champ', type: 'text', maxlength: '40', value: p.nomDansLesSms, 'aria-label': 'Ton nom dans les SMS', placeholder: 'Ex. Mme Martin',
      onchange: (e) => enregistrer({ nomDansLesSms: L.nettoyerEspaces(e.target.value).slice(0, 40) }) })),
    h('p', { class: 'aide' }, 'Il remplace {nom_pro} dans les modèles. Écris-le court : chaque caractère compte dans un SMS.')];
  }));

  redessins.push(carte(page, 'reglages-rdv-entreprise', 'Nom de l’entreprise dans les SMS', () => {
    const p = D.parametres();
    return [ligne('Nom de l’entreprise', h('input', { class: 'champ', type: 'text', maxlength: String(R.NOM_ENTREPRISE_MAX), value: p.nomEntreprise, 'aria-label': 'Nom de l’entreprise dans les SMS', placeholder: R.NOM_ENTREPRISE_DEFAUT,
      onchange: (e) => {
        const saisi = L.nettoyerEspaces(e.target.value);
        const nom = R.preparerSms(saisi).texte.replace(/\s+/g, ' ').trim().slice(0, R.NOM_ENTREPRISE_MAX).trim(); // le nom enregistré est celui qui sera écrit dans les SMS
        if (saisi && (!nom || R.compterSms(R.mentionStop({ nomEntreprise: nom })).encodage !== 'gsm7')) { toast('Ce nom contient un caractère qui ne peut pas être envoyé par SMS : retire-le.', { type: 'erreur' }); e.target.value = D.parametres().nomEntreprise; return; }
        e.target.value = nom || R.NOM_ENTREPRISE_DEFAUT;
        enregistrer({ nomEntreprise: nom }); // vide : « Mon entreprise » est repris tout seul
      } })),
    h('p', { class: 'aide' }, `Chaque SMS envoyé à un participant se termine par « ${R.mentionStop(p)} » : le nom de l’entreprise et le moyen de se désabonner. Si quelqu’un répond STOP, il ne reçoit plus aucun SMS et tu es prévenue.`)];
  }));

  // Connexion ClickSend : la saisie n'est montrée qu'à Jérôme (le serveur le dit : rdvEtat.peutConfigurer ; il refuse de toute façon tout autre compte). La clé part vers le serveur
  // et n'est jamais gardée ici : le champ est vidé dès l'enregistrement, et le serveur ne la rend jamais. L'adresse des réponses (avec son jeton secret) n'est montrée que sur demande.
  // `brouillon` garde l'identifiant et l'expéditeur déjà tapés quand la carte se redessine (jamais la clé).
  const connexion = { etat: null, charge: false, enCours: false, adresse: '', erreur: '', brouillon: { identifiant: '', expediteur: undefined } };
  let redessinerConnexion = () => {};
  function chargerConnexion() {
    if (connexion.charge || connexion.enCours) return;
    connexion.enCours = true;
    D.connexionSms('etat').then((e) => { connexion.etat = e; connexion.erreur = ''; }).catch((e) => { connexion.erreur = e?.message || ''; }).finally(() => { connexion.charge = true; connexion.enCours = false; redessinerConnexion(); });
  }
  const copier = async (texte) => { try { await navigator.clipboard.writeText(texte); toast('Adresse copiée'); } catch (e) { console.warn(e); toast('Copie impossible : sélectionne l’adresse et copie-la à la main.', { type: 'erreur' }); } };
  redessinerConnexion = carte(page, 'reglages-rdv-connexion', 'Connexion SMS (ClickSend)', () => {
    const peut = D.peutConfigurerConnexion();
    if (peut === null) return [h('p', { class: 'aide', 'data-role': 'connexion-chargement' }, 'Chargement…')];
    if (!peut) {
      return [h('p', { 'data-role': 'connexion-etat' }, D.envoiBranche() ? 'L’envoi des SMS est branché sur cet espace.' : 'L’envoi des SMS n’est pas encore branché sur cet espace.'),
        h('p', { class: 'aide' }, 'La connexion au service d’envoi (ClickSend) est réglée par l’administrateur de la plateforme.'), aideClickSend('', false)];
    }
    chargerConnexion();
    const e = connexion.etat;
    const identifiant = h('input', { class: 'champ', type: 'text', maxlength: '200', autocomplete: 'off', 'aria-label': 'Identifiant ClickSend', placeholder: 'Ton nom d’utilisateur ClickSend', value: connexion.brouillon.identifiant, oninput: (ev) => { connexion.brouillon.identifiant = ev.target.value; } });
    const cle = h('input', { class: 'champ', type: 'password', maxlength: '200', autocomplete: 'new-password', 'aria-label': 'Clé d’API ClickSend', placeholder: e?.enregistre ? '•••••••• (enregistrée : colle une clé pour la remplacer)' : 'Colle ici la clé d’API' });
    const expediteur = h('input', { class: 'champ', type: 'text', maxlength: '15', autocomplete: 'off', 'aria-label': 'Nom d’expéditeur (facultatif)', placeholder: 'Facultatif', value: connexion.brouillon.expediteur ?? e?.expediteur ?? '', oninput: (ev) => { connexion.brouillon.expediteur = ev.target.value; } });
    const enregistrerConnexion = h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'enregistrer-connexion' }, 'Enregistrer la connexion');
    enregistrerConnexion.onclick = async () => {
      enregistrerConnexion.disabled = true;
      try {
        const r = await D.connexionSms('enregistrer', { identifiant: identifiant.value, cle: cle.value, expediteur: expediteur.value });
        cle.value = ''; identifiant.value = ''; // la clé ne reste pas dans la page
        connexion.brouillon = { identifiant: '', expediteur: undefined };
        connexion.etat = { enregistre: true, expediteur: expediteur.value.trim() };
        connexion.adresse = r.adresseChangee ? r.adresse : '';
        connexion.erreur = '';
        toast(r.adresseChangee ? 'Connexion enregistrée : copie maintenant l’adresse des réponses dans ClickSend (le bouton « Envoyer » s’active d’ici une minute)' : 'Connexion enregistrée (le bouton « Envoyer » peut mettre une minute à s’activer)');
        redessinerConnexion();
      } catch (err) { console.warn(err); toast(D.messageErreur(err, 'Enregistrement impossible'), { type: 'erreur' }); enregistrerConnexion.disabled = false; }
    };
    const blocAdresse = connexion.adresse
      ? h('div', { class: 'pile', 'data-role': 'adresse-reponses' },
        h('p', { class: 'aide' }, 'À coller dans ClickSend : règle « SMS entrants », action « envoyer vers une adresse » (méthode POST). Garde cette adresse pour toi : elle sert de mot de passe.'),
        h('input', { class: 'champ', type: 'text', readonly: 'true', value: connexion.adresse, 'aria-label': 'Adresse des réponses', onfocus: (ev) => ev.target.select() }),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'copier-adresse', onclick: () => copier(connexion.adresse) }, 'Copier l’adresse'))
      : null;
    const boutonsAdresse = e?.enregistre ? [
      h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'afficher-adresse', onclick: async () => {
        if (connexion.adresse) { connexion.adresse = ''; redessinerConnexion(); return; }
        try { connexion.adresse = (await D.connexionSms('adresse')).adresse; redessinerConnexion(); } catch (err) { console.warn(err); toast(D.messageErreur(err, 'Lecture impossible'), { type: 'erreur' }); }
      } }, connexion.adresse ? 'Cacher l’adresse des réponses' : 'Afficher l’adresse des réponses'),
      h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'changer-adresse', onclick: async () => {
        if (!(await confirmer('Changer l’adresse des réponses ?', 'L’ancienne adresse ne marchera plus : il faudra coller la nouvelle dans la règle « SMS entrants » de ClickSend.', { libelleOk: 'Changer l’adresse' }))) return;
        try { const r = await D.connexionSms('regenerer'); connexion.adresse = r.adresse; connexion.erreur = ''; toast('Adresse changée : colle-la dans ClickSend'); redessinerConnexion(); } catch (err) { console.warn(err); toast(D.messageErreur(err, 'Changement impossible'), { type: 'erreur' }); }
      } }, 'Changer l’adresse des réponses')] : [];
    return [h('p', { 'data-role': 'connexion-etat' }, connexion.erreur ? connexion.erreur : e?.enregistre ? 'Connexion enregistrée.' : 'Pas encore enregistrée : les SMS ne partent pas.'),
      ligne('Identifiant ClickSend', identifiant), ligne('Clé d’API ClickSend', cle), ligne('Nom d’expéditeur', expediteur),
      connexion.erreur ? h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'reessayer-connexion', onclick: () => { connexion.charge = false; connexion.erreur = ''; redessinerConnexion(); } }, 'Réessayer') : null,
      h('p', { class: 'aide' }, 'La clé est vérifiée auprès de ClickSend, puis rangée dans un coffre protégé du serveur : elle n’est jamais affichée ni gardée dans cette page (si la carte se redessine avant que tu enregistres, il faudra la recoller). Le nom d’expéditeur est facultatif : laisse vide tant que ClickSend n’a pas validé le tien.'),
      h('div', { class: 'ligne-boutons rdv-boutons-fiche' }, enregistrerConnexion, ...boutonsAdresse), blocAdresse, aideClickSend(connexion.adresse, true, !!e?.enregistre)];
  }, { aide: '' });
  redessins.push(redessinerConnexion);

  redessins.push(carte(page, 'reglages-rdv-solde', 'Solde ClickSend', () => {
    const p = D.parametres();
    const seuils = R.seuilsSoldeDe(p);
    const ro = lecteur();
    const champs = seuils.map((v, i) => h('input', { class: 'champ rdv-champ-nombre', type: 'text', inputmode: 'decimal', disabled: ro, value: String(v).replace('.', ','), dataset: { seuil: String(i + 1) },
      'aria-label': ['Premier seuil du solde, en euros (le plus haut)', 'Deuxième seuil du solde, en euros', 'Troisième seuil du solde, en euros (le plus bas)'][i] }));
    const relire = () => { champs.forEach((c, i) => { c.value = String(R.seuilsSoldeDe(D.parametres())[i]).replace('.', ','); c.classList.remove('invalide'); }); };
    champs.forEach((c) => c.addEventListener('change', () => {
      const valeurs = champs.map((x) => R.lireSeuilSolde(x.value));
      const v = valeurs.some((n) => n === null) ? { ok: false, message: 'Écris trois seuils en euros, entre 0 et 1 000 (ex. 10, 5 et 2).' } : R.validerSeuilsSolde(valeurs); // les trois ensemble
      if (!v.ok) { toast(`${v.message} Pour tout baisser, change d’abord le dernier seuil ; pour tout monter, le premier.`, { type: 'erreur' }); relire(); return; }
      enregistrer({ seuilsSolde: valeurs }).then((ok) => { if (!ok) relire(); }); // refus ou panne : le champ reprend la valeur enregistrée
    }));
    return [ligne('Premier seuil (€)', champs[0]), ligne('Deuxième seuil (€)', champs[1]), ligne('Troisième seuil (€)', champs[2]),
      h('p', { class: 'aide' }, 'Quand le solde de ton compte ClickSend passe sous un de ces seuils, tes numéros d’alerte reçoivent un SMS (un seul par seuil franchi). Le solde est vérifié toutes les 15 minutes. Le texte du SMS se règle dans « Modèles de SMS » (« Alerte : solde ClickSend bas »).'),
      h('p', {}, lienExterne(LIEN_RECHARGE_CLICKSEND, 'Recharger mon compte ClickSend', 'lien-recharge'))];
  }));

  redessins.push(carte(page, 'reglages-rdv-desinscrits', 'Numéros désinscrits (STOP)', () => {
    // Lecture seule des données déjà chargées : cette carte n'appelle aucune fonction du serveur à l'affichage.
    const numeros = D.desinscrits();
    const peutReautoriser = D.peutEcrire();
    const nomDe = (n) => D.etat.participants.find((p) => p.telephone === n)?.nom || '';
    const reautoriser = async (numero, nom, bouton) => {
      const ok = await dialogue({
        titre: 'Réautoriser ce numéro ?',
        contenu: h('div', { class: 'pile' }, h('p', {}, nom || R.masquerTelephone(numero)), h('p', {}, 'Cette personne a demandé de ne plus recevoir de SMS : ne la réautorise que si elle te l’a demandé.')),
        boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Réautoriser', valeur: true, style: 'principal' }],
      });
      if (ok !== true) return;
      bouton.disabled = true;
      try { await D.reautoriserNumero(numero); toast('Numéro réautorisé : les SMS automatiques encore dus lui partiront au prochain passage du serveur (toutes les 15 minutes, dans la plage d’envoi)'); } catch (e) { console.warn(e); toast(D.messageErreur(e, 'Réautorisation impossible'), { type: 'erreur' }); bouton.disabled = false; }
    };
    const liste = numeros.length
      ? h('div', { class: 'pile', dataset: { role: 'desinscrits' } }, numeros.map((n) => {
        const nom = nomDe(n);
        const bouton = peutReautoriser ? h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'reautoriser', 'aria-label': `Réautoriser ${nom || R.masquerTelephone(n)}`, onclick: (e) => reautoriser(n, nom, e.currentTarget) }, 'Réautoriser') : null;
        return h('div', { class: 'rdv-reglage-ligne rdv-desinscrit', dataset: { role: 'desinscrit' } }, h('span', {}, nom ? `${nom} · ` : '', h('span', { class: 'rdv-tel-masque' }, R.masquerTelephone(n))), bouton);
      }))
      : h('p', { class: 'aide', dataset: { role: 'desinscrits-vide' } }, 'Aucun numéro désinscrit');
    return [liste,
      h('p', { class: 'aide' }, 'Ces personnes ont répondu STOP : plus aucun SMS ne leur part. « Réautoriser » les remet dans la liste des personnes qui reçoivent des SMS ; rien n’est envoyé tout de suite. Les SMS écrits à la main (pluie, annulation) qui ont été bloqués ne repartent jamais ; les SMS automatiques du calendrier encore dus (propositions, relances) partiront au prochain passage du serveur (toutes les 15 minutes, dans la plage d’envoi).'),
      h('p', { class: 'aide', dataset: { role: 'desinscrits-clicksend' } }, 'Attention : ClickSend garde aussi sa propre liste de désinscriptions et bloque de son côté les numéros qui y figurent. Après avoir réautorisé un numéro ici, ouvre ton compte ClickSend, cherche la liste des désinscriptions (« Opt-out ») et retire-y aussi ce numéro, sinon ClickSend refusera encore les SMS.')];
  }));

  redessins.push(carte(page, 'reglages-rdv-roles', 'Rôles des participants', () => {
    const p = D.parametres();
    const lignes = p.roles.map((r) => {
      const n = R.usageRole(r, D.etat.participants);
      return h('div', { class: 'rdv-role', dataset: { role: 'role', nom: r } }, h('span', {}, r),
        n > 0
          ? h('span', { class: 'rdv-role-utilise', title: `Utilisé par ${n} ${n > 1 ? 'participants' : 'participant'} : il ne peut pas être supprimé` }, icone('lock', { taille: 14 }), String(n))
          : h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Supprimer le rôle ${r}`, onclick: () => {
            const res = R.retirerRole(D.parametres().roles, r, D.etat.participants);
            if (!res.ok) toast(res.message, { type: 'erreur' }); else enregistrer({ roles: res.roles }, 'Rôle supprimé');
          } }, icone('x', { taille: 16 })));
    });
    const ajouter = h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'ajouter-role', onclick: async () => {
      const nom = await demanderTexte('Ajouter un rôle', { libelle: 'Nom du rôle' });
      if (!nom) return;
      const res = R.ajouterRole(D.parametres().roles, nom);
      if (!res.ok) toast(res.message, { type: 'erreur' }); else enregistrer({ roles: res.roles }, 'Rôle ajouté');
    } }, icone('plus', { taille: 16 }), 'Ajouter un rôle');
    return [h('div', { class: 'pile' }, lignes), ajouter, h('p', { class: 'aide' }, 'Un rôle ne peut être supprimé que si aucun participant ne l’utilise, rendez-vous archivés compris (cadenas).')];
  }));

  redessins.push(carte(page, 'reglages-rdv-tarif', 'Prix d’un SMS', () => {
    const p = D.parametres();
    const prix = h('input', { class: 'champ rdv-champ-nombre', type: 'text', inputmode: 'decimal', value: String(R.prixSmsDe(p)).replace('.', ','), 'aria-label': 'Prix d’un SMS, en euros',
      onchange: (e) => {
        const n = R.lirePrixSms(e.target.value);
        if (n === null) { toast('Écris un prix en euros entre 0,001 et 5 (ex. 0,0685).', { type: 'erreur' }); e.target.value = String(R.prixSmsDe(D.parametres())).replace('.', ','); return; }
        enregistrer({ prixSms: n }).then((ok) => { if (!ok) e.target.value = String(R.prixSmsDe(D.parametres())).replace('.', ','); });
      } });
    const date = h('input', { class: 'champ', type: 'text', maxlength: '40', value: R.tarifsAuDe(p), 'aria-label': 'Date de ces tarifs', placeholder: R.TARIFS_AU_DEFAUT,
      onchange: (e) => { const t = L.nettoyerEspaces(e.target.value).slice(0, 40); e.target.value = t || R.TARIFS_AU_DEFAUT; enregistrer({ tarifsAu: t || R.TARIFS_AU_DEFAUT }); } });
    return [ligne('Prix d’un SMS (en euros)', prix), ligne('Tarifs de ClickSend au', date),
      h('p', { class: 'aide' }, 'Sert seulement à estimer ce que coûte un SMS dans l’aperçu des modèles (prix × nombre de SMS). Ce n’est jamais une facture : le prix réel est celui de ton compte ClickSend. Rien n’est enregistré par SMS.')];
  }));

  const ligneModele = (m) => {
    const cout = R.libelleCout(m.texte, D.parametres());
    return h('div', { class: 'rdv-modele', dataset: { modele: m.type } },
      h('div', { class: 'rdv-modele-tete' }, h('strong', {}, m.libelle), h('span', { class: 'rdv-modele-compte' }, `${m.caracteres} caractères · ${m.segments} SMS`),
        h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': `modifier-modele-${m.type}`, onclick: () => modifierModele(m.type) }, 'Modifier')),
      h('pre', { class: 'rdv-modele-texte' }, m.texte),
      m.aLien && m.sansLien ? h('p', { class: 'aide rdv-modele-sanslien' }, `Sans le lien : ${m.sansLien.caracteres} caractères · ${m.sansLien.segments} SMS. Avec le lien (${m.sousType === 'solde-bas' ? 'la page de recharge de ClickSend' : 'l’adresse de ton espace'}) : ${m.caracteres} caractères · ${m.segments} SMS.`) : null,
      h('p', { class: 'aide rdv-modele-cout' }, cout));
  };

  redessins.push(carte(page, 'reglages-rdv-modeles', 'Modèles de SMS', () => {
    const p = D.parametres();
    return [h('div', { class: 'pile' }, R.apercuModeles(p).map(ligneModele)),
      h('p', { class: 'aide', dataset: { role: 'explication-accents' } }, EXPLICATION_ACCENTS),
      h('p', { class: 'aide' }, `Variables : ${R.VARIABLES_SMS.map((v) => `{${v}}`).join(', ')}. Les exemples ci-dessus utilisent des données fictives. La dernière ligne (nom de l’entreprise et « Répondez STOP ») est ajoutée toute seule à chaque SMS envoyé à un participant.`),
      h('h3', {}, 'Alertes que tu reçois'),
      h('p', { class: 'aide' }, 'Ces SMS vont à tes numéros d’alerte, jamais aux participants : ils ne portent pas la ligne « Répondez STOP ». Chaque alerte accepte seulement ses propres variables (indiquées dans « Modifier »). {lien} est l’adresse du rendez-vous dans l’appli (pour « solde ClickSend bas » : la page de recharge de ClickSend) : supprime-la du texte si tu n’en veux pas.'),
      h('div', { class: 'pile' }, R.apercuAlertes(p, { client: D.clientCourant(), lienRecharge: LIEN_RECHARGE_CLICKSEND }).map(ligneModele))];
  }));

  async function modifierModele(type) {
    const p = D.parametres();
    const variables = R.variablesDuModele(type);
    const alerte = R.estModeleAlerte(type);
    const exempleAlerte = { ...R.EXEMPLE_ALERTE, lien: type === 'alerte-solde-bas' ? LIEN_RECHARGE_CLICKSEND : R.lienExempleRdv(D.clientCourant()) };
    const champ = h('textarea', { class: 'champ rdv-champ-multiligne', rows: '6', 'aria-label': `Modèle : ${R.libelleModele(type)}` });
    champ.value = R.modeleDe(type, p);
    const compteur = compteurSms('');
    const sansLien = h('p', { class: 'aide', dataset: { role: 'sans-lien' }, hidden: true });
    const cout = h('p', { class: 'aide', dataset: { role: 'cout' } });
    const maj = () => {
      const etatP = { modeles: { [type]: champ.value }, nomEntreprise: p.nomEntreprise, prixSms: p.prixSms, tarifsAu: p.tarifsAu };
      const texte = alerte ? R.texteAlerte(type.slice('alerte-'.length), exempleAlerte, etatP).texte : R.construireSms(type, R.EXEMPLE_SMS, etatP).texte;
      compteur.maj(texte);
      cout.textContent = R.libelleCout(texte, etatP);
      const aLien = alerte && R.variablesDuModele(type).includes('lien') && /\{lien\}/.test(champ.value);
      sansLien.hidden = !aLien;
      if (aLien) { const c = R.texteAlerte(type.slice('alerte-'.length), { ...exempleAlerte, lien: '' }, etatP); sansLien.textContent = `Sans le lien, ce texte ferait ${c.caracteres} caractères · ${c.segments} SMS (le compteur ci-dessus compte avec ${type === 'alerte-solde-bas' ? 'la page de recharge de ClickSend' : 'l’adresse de ton espace'}).`; }
    };
    champ.addEventListener('input', maj);
    maj();
    const r = await dialogue({
      titre: R.libelleModele(type), classe: 'dialogue-formulaire',
      contenu: h('div', { class: 'pile' }, champ, compteur.element, sansLien, cout, h('p', { class: 'aide' }, `Variables : ${variables.map((v) => `{${v}}`).join(', ')}.`), h('p', { class: 'aide' }, EXPLICATION_ACCENTS)),
      boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Rétablir le modèle de départ', valeur: 'defaut' }, { libelle: 'Enregistrer', valeur: true, style: 'principal',
        avantFermeture: () => { const v = R.validerModele(champ.value, type); if (!v.ok) toast(v.message, { type: 'erreur' }); return v.ok; } }],
    });
    if (r === true) await enregistrer({ modeles: { ...D.parametres().modeles, [type]: R.normaliserSms(champ.value) } });
    if (r === 'defaut') { const m = { ...D.parametres().modeles }; delete m[type]; await enregistrer({ modeles: m }, 'Modèle rétabli'); }
  }

  reglagesExportRdv(page);
  const arret = D.surChangement(() => redessins.forEach((f) => f()));
  return () => { arret(); arretModeTest(); };
}
