// Réglages du module Rendez-vous, dans la page Réglages de la coque (sections `reglages-rdv-…`, déclarées dans le registre) :
// relances, rappel la veille, plage d'envoi, numéros d'alerte, nom dans les SMS, rôles, modèles de SMS, sauvegarde.
// Chaque réglage s'enregistre tout seul à chaque changement (journal commun) ; un refus ou une panne affiche un message.
import { h, icone, remplir, dialogue, toast, demanderTexte } from '../../os/ui.js';
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
        const nom = L.nettoyerEspaces(e.target.value).slice(0, R.NOM_ENTREPRISE_MAX);
        if (nom && R.compterSms(R.mentionStop({ nomEntreprise: nom })).encodage !== 'gsm7') { toast('Ce nom contient un caractère qui ne peut pas être envoyé par SMS : retire-le.', { type: 'erreur' }); e.target.value = p.nomEntreprise; return; }
        enregistrer({ nomEntreprise: nom }); // vide : « Chevalier IA » est repris tout seul à l'affichage
      } })),
    h('p', { class: 'aide' }, `Chaque SMS envoyé à un participant se termine par « ${R.mentionStop(p)} » : le nom de l’entreprise et le moyen de se désabonner. Si quelqu’un répond STOP, il ne reçoit plus aucun SMS et tu es prévenue.`)];
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

  redessins.push(carte(page, 'reglages-rdv-modeles', 'Modèles de SMS', () => {
    const p = D.parametres();
    const lignes = R.apercuModeles(p).map((m) => h('div', { class: 'rdv-modele', dataset: { modele: m.type } },
      h('div', { class: 'rdv-modele-tete' }, h('strong', {}, m.libelle), h('span', { class: 'rdv-modele-compte' }, `${m.caracteres} caractères · ${m.segments} SMS`),
        h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': `modifier-modele-${m.type}`, onclick: () => modifierModele(m.type) }, 'Modifier')),
      h('pre', { class: 'rdv-modele-texte' }, m.texte)));
    return [h('div', { class: 'pile' }, lignes),
      h('p', { class: 'aide', dataset: { role: 'explication-accents' } }, EXPLICATION_ACCENTS),
      h('p', { class: 'aide' }, `Variables : ${R.VARIABLES_SMS.map((v) => `{${v}}`).join(', ')}. Les exemples ci-dessus utilisent des données fictives. La dernière ligne (nom de l’entreprise et « Répondez STOP ») est ajoutée toute seule à chaque SMS envoyé à un participant.`)];
  }));

  async function modifierModele(type) {
    const p = D.parametres();
    const champ = h('textarea', { class: 'champ rdv-champ-multiligne', rows: '6', 'aria-label': `Modèle : ${R.LIBELLES_MODELES[type]}` });
    champ.value = R.modeleDe(type, p);
    const compteur = compteurSms('');
    const maj = () => {
      const sms = R.construireSms(type, R.EXEMPLE_SMS, { modeles: { [type]: champ.value }, nomEntreprise: p.nomEntreprise });
      compteur.maj(sms.texte);
    };
    champ.addEventListener('input', maj);
    maj();
    const r = await dialogue({
      titre: R.LIBELLES_MODELES[type], classe: 'dialogue-formulaire',
      contenu: h('div', { class: 'pile' }, champ, compteur.element, h('p', { class: 'aide' }, `Variables : ${R.VARIABLES_SMS.map((v) => `{${v}}`).join(', ')}.`), h('p', { class: 'aide' }, EXPLICATION_ACCENTS)),
      boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Rétablir le modèle de départ', valeur: 'defaut' }, { libelle: 'Enregistrer', valeur: true, style: 'principal',
        avantFermeture: () => { const inconnues = R.variablesInconnues(champ.value); if (inconnues.length) { toast(`Variable inconnue : {${inconnues[0]}}`, { type: 'erreur' }); return false; } return champ.value.trim() ? true : (toast('Le modèle ne peut pas être vide.', { type: 'erreur' }), false); } }],
    });
    if (r === true) await enregistrer({ modeles: { ...D.parametres().modeles, [type]: R.normaliserSms(champ.value) } });
    if (r === 'defaut') { const m = { ...D.parametres().modeles }; delete m[type]; await enregistrer({ modeles: m }, 'Modèle rétabli'); }
  }

  reglagesExportRdv(page);
  const arret = D.surChangement(() => redessins.forEach((f) => f()));
  return () => arret();
}
