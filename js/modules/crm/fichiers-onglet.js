// Onglet « Documents » d'une affaire ou d'un projet : les fichiers rangés chez nous (Cloud Storage), visibles de tous les membres de l'espace.
// (L'onglet « G-Drive » garde les liens et documents Google Drive : il n'est pas touché.)
// - la liste, du plus récent au plus ancien : icône de type, nom (un clic ouvre le fichier dans un nouvel onglet), taille, date, qui l'a déposé, croix pour retirer ;
// - « Ajouter un fichier » (sélecteur) ou glisser-déposer ; un contrôle immédiat de la taille et du type (les mêmes règles que le serveur, qui revérifie tout) ;
// - retirer = fenêtre de confirmation, puis le fichier va à la corbeille (le journal des modifications peut le restaurer) ;
// - un lecteur d'un espace client voit et ouvre les fichiers, sans bouton d'ajout ni croix.
// Le composant est créé une fois par fiche (`creerOngletFichiers`) et fournit l'onglet à `panneauActivite` par `onglet()` (même forme que les onglets des autres modules : { id, libelle, icone, element, compteur }).
import { h, icone, remplir, toast, confirmer } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { ecouterFichiers, deposerFichier, lienFichier, supprimerFichier, lireEnBase64, MESSAGE_RESEAU_FICHIERS } from './fichiers-donnees.js';
import {
  ACCEPT_HTML, TYPES_ACCEPTES_TEXTE, PLAFOND_APPEL_MO, controlerFichier, familleDe, libelleTaille, limiteEffectiveMo, limiteReglageMo,
} from './fichiers-regles.js';

export const ID_ONGLET_FICHIERS = 'fichiers';
const ICONES = { pdf: 'file-text', texte: 'file-text', office: 'file-text', image: 'image', archive: 'file-archive', fichier: 'file-text' };
const GENRE = { affaire: 'cette affaire', projet: 'ce projet' };

const reglageTaille = () => D.etat.reglages?.tailleMaxFichierMo;
const peutEcrire = () => D.compteCourant()?.ecrit !== false;

/** Phrase qui dit la taille maximale (et pourquoi elle peut être plus basse que le réglage). */
export function phraseTailleMax(reglage) {
  const mo = String(limiteEffectiveMo(reglage)).replace('.', ',');
  const bridee = limiteReglageMo(reglage) > PLAFOND_APPEL_MO;
  return `Taille maximale : ${mo} Mo${bridee ? ' (limite actuelle de l’envoi)' : ''}.`;
}

/**
 * `cibleType` : 'affaire' | 'projet' ; `cibleId` : l'identifiant de la fiche ; `surChangement()` : appelée quand la liste change (la fiche redessine alors le compteur de l'onglet).
 * Rend { onglet(), arreter() }.
 */
export function creerOngletFichiers({ cibleType, cibleId, surChangement = () => {} }) {
  const etat = { fichiers: [], pret: false, erreur: false, envois: [], message: '' };
  const cible = cibleType === 'affaire' ? { affaireId: cibleId } : { projetId: cibleId };
  const element = h('div', { class: 'pile fichiers-onglet', dataset: { section: 'fichiers', cible: cibleType } });
  const champFichier = h('input', { type: 'file', multiple: true, accept: ACCEPT_HTML, hidden: true, 'aria-label': 'Choisir des fichiers', dataset: { role: 'champ-fichier' },
    onchange: () => { const fichiers = [...champFichier.files]; champFichier.value = ''; deposer(fichiers); } });

  async function ouvrir(fiche) {
    const fenetre = window.open('', '_blank'); // synchrone, au clic : Safari bloque les fenêtres ouvertes après une attente réseau
    try {
      const r = await lienFichier(fiche.id);
      if (typeof r?.url !== 'string' || !/^https:\/\//i.test(r.url)) throw new Error(MESSAGE_RESEAU_FICHIERS);
      if (fenetre) { try { fenetre.opener = null; } catch { /* sans effet */ } fenetre.location = r.url; return; }
      window.open(r.url, '_blank', 'noopener'); // fenêtre bloquée : on retente, le navigateur dira s'il refuse
    } catch (e) {
      try { fenetre?.close(); } catch { /* sans effet */ }
      toast(e?.message || MESSAGE_RESEAU_FICHIERS, { type: 'erreur', duree: 8000 });
    }
  }

  async function retirer(fiche) {
    const oui = await confirmer('Retirer ce fichier ?', `« ${fiche.nom} » va dans la corbeille. Le journal des modifications peut le restaurer.`, { libelleOk: 'Retirer', danger: true });
    if (!oui) return;
    try {
      await supprimerFichier(fiche.id);
      toast('Fichier retiré');
    } catch (e) {
      toast(e?.message || MESSAGE_RESEAU_FICHIERS, { type: 'erreur', duree: 8000 });
    }
  }

  async function deposer(fichiers) {
    if (!peutEcrire() || !fichiers.length) return;
    for (const fichier of fichiers) {
      const controle = controlerFichier({ nom: fichier.name, typeMime: fichier.type, taille: fichier.size }, reglageTaille());
      if (!controle.ok) { etat.message = `« ${fichier.name} » : ${controle.erreur}`; toast(controle.erreur, { type: 'erreur', duree: 8000 }); dessiner(); continue; }
      etat.message = '';
      const envoi = { nom: controle.nom, valeur: 0, etape: 'lecture' };
      etat.envois.push(envoi);
      dessiner();
      try {
        const contenuBase64 = await lireEnBase64(fichier, (v) => { envoi.valeur = v; majProgression(envoi); });
        envoi.etape = 'envoi';
        envoi.valeur = null; // l'envoi vers le serveur n'a pas de pourcentage : la barre est « en cours »
        dessiner();
        await deposerFichier(cible, { nom: fichier.name, contenuBase64, typeMime: fichier.type });
        toast(`« ${controle.nom} » ajouté`);
      } catch (e) {
        etat.message = `« ${fichier.name} » : ${e?.message || MESSAGE_RESEAU_FICHIERS}`;
        toast(e?.message || MESSAGE_RESEAU_FICHIERS, { type: 'erreur', duree: 10000 });
      } finally {
        etat.envois = etat.envois.filter((x) => x !== envoi);
        dessiner();
      }
    }
  }

  const barres = new Map(); // envoi -> <progress> (mis à jour sans tout redessiner)
  function majProgression(envoi) { const b = barres.get(envoi); if (b && envoi.valeur !== null) b.value = envoi.valeur; }

  function ligne(fiche) {
    const date = L.versDate(fiche.creeLe);
    const meta = [libelleTaille(fiche.taille), date ? L.formatDateHeure(date) : '', fiche.creePar ? `par ${fiche.creePar}` : ''].filter(Boolean).join(' · ');
    return h('li', { class: 'ligne-fichier', dataset: { fichier: fiche.id } },
      icone(ICONES[familleDe(fiche.nom)] ?? 'file-text', { taille: 18 }),
      h('div', { class: 'fichier-texte' },
        h('button', { type: 'button', class: 'fichier-nom', title: 'Ouvrir dans un nouvel onglet', 'data-action': 'ouvrir-fichier', onclick: () => ouvrir(fiche) }, fiche.nom),
        h('span', { class: 'fichier-meta' }, meta)),
      peutEcrire() ? h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Retirer le fichier ${fiche.nom}`, title: 'Retirer', 'data-action': 'retirer-fichier', onclick: () => retirer(fiche) }, icone('x', { taille: 16 })) : null);
  }

  function dessiner() {
    barres.clear();
    const ecrit = peutEcrire();
    const tete = h('div', { class: 'onglet-documents-tete' },
      h('h2', { class: 'sous-titre' }, 'Documents'),
      ecrit ? h('button', { type: 'button', class: 'prop-vide', 'data-action': 'ajouter-fichier', onclick: () => champFichier.click() }, icone('plus', { taille: 14 }), 'Ajouter un fichier') : null);
    const aide = ecrit
      ? h('p', { class: 'aide', dataset: { role: 'aide-fichiers' } }, `${TYPES_ACCEPTES_TEXTE}. ${phraseTailleMax(reglageTaille())} Tu peux aussi glisser un fichier ici.`)
      : h('p', { class: 'aide', dataset: { role: 'aide-fichiers' } }, 'Tu peux ouvrir les fichiers ; seul un éditeur peut en ajouter ou en retirer.');
    const envois = etat.envois.map((e) => {
      const barre = h('progress', { class: 'fichiers-progression', max: '1', 'aria-label': `Envoi de ${e.nom}` });
      if (e.valeur !== null) barre.value = e.valeur;
      barres.set(e, barre);
      return h('div', { class: 'fichiers-envoi', role: 'status', dataset: { role: 'envoi-fichier' } }, h('span', {}, e.etape === 'lecture' ? `Préparation de « ${e.nom} »…` : `Envoi de « ${e.nom} »…`), barre);
    });
    const erreur = etat.message ? h('p', { class: 'erreur', role: 'alert', dataset: { role: 'erreur-fichier' } }, etat.message) : null;
    let contenu;
    if (etat.erreur) contenu = h('p', { class: 'vide-discret', dataset: { role: 'erreur-lecture-fichiers' } }, 'Les fichiers ne se chargent pas. Vérifie ta connexion internet, puis recharge la page.');
    else if (!etat.pret) contenu = h('p', { class: 'vide-discret', dataset: { role: 'chargement-fichiers' } }, 'Chargement…');
    else if (!etat.fichiers.length && !etat.envois.length) {
      contenu = h('div', { class: 'vide-fichiers', dataset: { role: 'aucun-fichier' } }, h('p', { class: 'vide-titre' }, 'Aucun fichier'),
        h('p', { class: 'aide' }, ecrit ? `Ajoute ici les PDF, images et documents de ${GENRE[cibleType]} : ils sont rangés chez nous et visibles de toute l’équipe.` : `Aucun fichier n’a encore été ajouté à ${GENRE[cibleType]}.`));
    } else contenu = h('ul', { class: 'liste-fichiers' }, etat.fichiers.map(ligne));
    remplir(element, tete, champFichier, aide, ...envois, erreur, contenu);
  }

  // Glisser-déposer sur tout l'onglet (éditeurs seulement).
  element.addEventListener('dragover', (e) => { if (!peutEcrire() || !e.dataTransfer?.types?.includes('Files')) return; e.preventDefault(); element.classList.add('depot-survol'); });
  element.addEventListener('dragleave', (e) => { if (!element.contains(e.relatedTarget)) element.classList.remove('depot-survol'); });
  element.addEventListener('drop', (e) => {
    element.classList.remove('depot-survol');
    if (!peutEcrire() || !e.dataTransfer?.files?.length) return;
    e.preventDefault();
    deposer([...e.dataTransfer.files]);
  });

  dessiner();
  const arret = ecouterFichiers(cibleType, cibleId,
    (liste) => { etat.fichiers = liste; etat.pret = true; etat.erreur = false; dessiner(); surChangement(); },
    () => { etat.erreur = true; dessiner(); surChangement(); });
  // Les réglages (taille maximale) et le compte peuvent changer : la phrase d'aide suit.
  const arretReglages = D.surChangement(() => { if (!element.contains(document.activeElement)) dessiner(); });

  return {
    onglet: () => ({ id: ID_ONGLET_FICHIERS, libelle: 'Documents', icone: 'file-text', element, compteur: etat.pret ? etat.fichiers.length : null }),
    arreter: () => { arret(); arretReglages(); },
  };
}
