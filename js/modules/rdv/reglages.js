// Réglages du module Rendez-vous, dans la page Réglages de la coque (sections `reglages-rdv-…`, déclarées dans le registre) :
// relances, rappel la veille, plage d'envoi, numéros d'alerte, nom dans les SMS, nom de l'entreprise, connexion SMS (Jérôme seul), rôles, prix d'un SMS, modèles de SMS (participants et alertes), sauvegarde.
// Chaque réglage s'enregistre tout seul à chaque changement (journal commun) ; un refus ou une panne affiche un message.
import { h, icone, remplir, dialogue, toast, demanderTexte, confirmer } from '../../os/ui.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';
import * as R from './logique.js';
import { interrupteur, champNombre, compteurSms, EXPLICATION_ACCENTS } from './composants.js';
import { reglagesExportRdv } from './export.js';

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
      const libelle = await demanderTexte('Ajouter un numéro', { libelle: 'Nom (ex. Mon mobile, Collègue)' });
      if (!libelle) return;
      const saisie = await demanderTexte('Ajouter un numéro', { libelle: 'Numéro de mobile' });
      if (!saisie) return;
      const t = R.normaliserTelephone(saisie);
      if (!t.ok) { toast(t.message, { type: 'erreur' }); return; }
      maj([...frais(), { id: L.idAleatoire().slice(0, 6), libelle: L.nettoyerEspaces(libelle), numero: t.telephone, actif: true }]);
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
        enregistrer({ nomEntreprise: nom }); // vide : « Chevalier IA » est repris tout seul
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
        h('p', { class: 'aide' }, 'La connexion au service d’envoi (ClickSend) est réglée par l’administrateur de la plateforme.')];
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
      h('div', { class: 'ligne-boutons rdv-boutons-fiche' }, enregistrerConnexion, ...boutonsAdresse), blocAdresse];
  }, { aide: '' });
  redessins.push(redessinerConnexion);

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
        const n = Number(String(e.target.value).replace(',', '.').replace(/\s/g, ''));
        if (!Number.isFinite(n) || n <= 0 || n > 5) { toast('Écris un prix en euros entre 0,001 et 5 (ex. 0,0685).', { type: 'erreur' }); e.target.value = String(R.prixSmsDe(D.parametres())).replace('.', ','); return; }
        enregistrer({ prixSms: n });
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
      m.aLien && m.sansLien ? h('p', { class: 'aide rdv-modele-sanslien' }, `Sans le lien : ${m.sansLien.caracteres} caractères · ${m.sansLien.segments} SMS. Avec le lien (adresse d’exemple ; chez un client elle est un peu plus longue) : ${m.caracteres} caractères · ${m.segments} SMS.`) : null,
      h('p', { class: 'aide rdv-modele-cout' }, cout));
  };

  redessins.push(carte(page, 'reglages-rdv-modeles', 'Modèles de SMS', () => {
    const p = D.parametres();
    return [h('div', { class: 'pile' }, R.apercuModeles(p).map(ligneModele)),
      h('p', { class: 'aide', dataset: { role: 'explication-accents' } }, EXPLICATION_ACCENTS),
      h('p', { class: 'aide' }, `Variables : ${R.VARIABLES_SMS.map((v) => `{${v}}`).join(', ')}. Les exemples ci-dessus utilisent des données fictives. La dernière ligne (nom de l’entreprise et « Répondez STOP ») est ajoutée toute seule à chaque SMS envoyé à un participant.`),
      h('h3', {}, 'Alertes que tu reçois'),
      h('p', { class: 'aide' }, 'Ces SMS vont à tes numéros d’alerte, jamais aux participants : ils ne portent pas la ligne « Répondez STOP ». Chaque alerte accepte seulement ses propres variables (indiquées dans « Modifier »). {lien} est l’adresse du rendez-vous dans l’appli : supprime-la du texte si tu n’en veux pas.'),
      h('div', { class: 'pile' }, R.apercuAlertes(p).map(ligneModele))];
  }));

  async function modifierModele(type) {
    const p = D.parametres();
    const variables = R.variablesDuModele(type);
    const alerte = R.estModeleAlerte(type);
    const champ = h('textarea', { class: 'champ rdv-champ-multiligne', rows: '6', 'aria-label': `Modèle : ${R.libelleModele(type)}` });
    champ.value = R.modeleDe(type, p);
    const compteur = compteurSms('');
    const sansLien = h('p', { class: 'aide', dataset: { role: 'sans-lien' }, hidden: true });
    const cout = h('p', { class: 'aide', dataset: { role: 'cout' } });
    const maj = () => {
      const etatP = { modeles: { [type]: champ.value }, nomEntreprise: p.nomEntreprise, prixSms: p.prixSms, tarifsAu: p.tarifsAu };
      const texte = alerte ? R.texteAlerte(type.slice('alerte-'.length), R.EXEMPLE_ALERTE, etatP).texte : R.construireSms(type, R.EXEMPLE_SMS, etatP).texte;
      compteur.maj(texte);
      cout.textContent = R.libelleCout(texte, etatP);
      const aLien = alerte && /\{lien\}/.test(champ.value);
      sansLien.hidden = !aLien;
      if (aLien) { const c = R.texteAlerte(type.slice('alerte-'.length), { ...R.EXEMPLE_ALERTE, lien: '' }, etatP); sansLien.textContent = `Sans le lien : ${c.caracteres} caractères · ${c.segments} SMS (le lien ci-dessus est une adresse d’exemple).`; }
    };
    champ.addEventListener('input', maj);
    maj();
    const r = await dialogue({
      titre: R.libelleModele(type), classe: 'dialogue-formulaire',
      contenu: h('div', { class: 'pile' }, champ, compteur.element, sansLien, cout, h('p', { class: 'aide' }, `Variables : ${variables.map((v) => `{${v}}`).join(', ')}.`), h('p', { class: 'aide' }, EXPLICATION_ACCENTS)),
      boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Rétablir le modèle de départ', valeur: 'defaut' }, { libelle: 'Enregistrer', valeur: true, style: 'principal',
        avantFermeture: () => { const inconnues = R.variablesInconnues(champ.value, type); if (inconnues.length) { toast(`Variable inconnue ici : {${inconnues[0]}}. Variables permises : ${variables.map((v) => `{${v}}`).join(', ')}`, { type: 'erreur' }); return false; } return champ.value.trim() ? true : (toast('Le modèle ne peut pas être vide.', { type: 'erreur' }), false); } }],
    });
    if (r === true) await enregistrer({ modeles: { ...D.parametres().modeles, [type]: R.normaliserSms(champ.value) } });
    if (r === 'defaut') { const m = { ...D.parametres().modeles }; delete m[type]; await enregistrer({ modeles: m }, 'Modèle rétabli'); }
  }

  reglagesExportRdv(page);
  const arret = D.surChangement(() => redessins.forEach((f) => f()));
  return () => arret();
}
