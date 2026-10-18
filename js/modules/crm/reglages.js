// Réglages du CRM : étapes, phases, options, modèles d'affaires, offres, secteurs, sources, étiquettes, filtres enregistrés, début d'activité, Google Drive : sous-dossiers (si l'option est allumée ; le dossier parent est sous la case, dans les options), export.
import { h, icone, vider, remplir, toast, confirmer, demanderTexte, dialogue } from '../../os/ui.js';
import * as D from './donnees.js';
import * as PD from '../projets/donnees.js';
import { sectionsConfiguration } from './reglages-config.js';
import * as L from './logique.js';
import { exporterToutesLesDonnees } from './export.js';
import { googleDisponible } from '../../os/google-picker.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import { nettoyerSousDossiers } from '../../os/google-drive.js';

function section(id, titre, nomIcone, aide) {
  return h('section', { class: 'carte-section', id },
    h('h2', {}, icone(nomIcone, { taille: 18 }), titre),
    aide ? h('p', { class: 'aide' }, aide) : null);
}

function boutonIcone(nom, libelle, onclick, disabled = false) {
  return h('button', { type: 'button', class: 'bouton-icone', 'aria-label': libelle, title: libelle, disabled, onclick }, icone(nom, { taille: 16 }));
}

function formulaireAjout(placeholder, libelleBouton, surAjout) {
  const champ = h('input', { type: 'text', class: 'champ', placeholder, 'aria-label': placeholder });
  return h('form', { class: 'ligne-ajout', onsubmit: async (e) => {
    e.preventDefault();
    const v = champ.value.trim();
    if (!v) { champ.focus(); return; }
    await surAjout(v);
    champ.value = '';
  } }, champ, h('button', { type: 'submit', class: 'bouton bouton-secondaire' }, icone('plus', { taille: 16 }), libelleBouton));
}

export function rendreReglagesCrm(page) {
  const sOffres = section('reglages-offres', 'Offres', 'briefcase', 'Une offre archivée reste lisible sur les anciennes fiches.');
  const listeOffres = h('div', { class: 'liste-reglages' });
  sOffres.append(listeOffres, formulaireAjout('Nom de la nouvelle offre', 'Ajouter une offre', async (nom) => {
    const base = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'offre';
    let id = base;
    let n = 2;
    while (D.etat.offres.some((o) => o.id === id)) id = `${base}_${n++}`;
    await D.enregistrerOffres([...D.etat.offres, { id, nom, actif: true }]);
    toast(`Offre "${nom}" ajoutée`);
  }));

  const sSecteurs = section('reglages-secteurs', 'Secteurs', 'users');
  const listeSecteurs = h('div', { class: 'liste-reglages' });
  sSecteurs.append(listeSecteurs, formulaireAjout('Nouveau secteur', 'Ajouter', async (v) => {
    if (D.etat.secteurs.includes(v)) return;
    await D.enregistrerListes({ secteurs: [...D.etat.secteurs, v] });
  }));

  const sSources = section('reglages-sources', 'Sources', 'sparkles');
  const listeSources = h('div', { class: 'liste-reglages' });
  sSources.append(listeSources, formulaireAjout('Nouvelle source', 'Ajouter', async (v) => {
    if (D.etat.sources.includes(v)) return;
    await D.enregistrerListes({ sources: [...D.etat.sources, v] });
  }));

  const sFiltres = section('reglages-filtres', 'Filtres enregistrés', 'bookmark', 'Crée un filtre depuis une liste (Personnes, Affaires, Projets) avec le bouton « Filtres enregistrés ».');
  const listeFiltres = h('div', { class: 'liste-reglages' });
  sFiltres.append(listeFiltres);

  const sEtiquettes = section('reglages-etiquettes', 'Étiquettes', 'tag', 'Elles se créent aussi à la volée depuis n’importe quel champ « Étiquettes ».');
  const listeEtiquettes = h('div', { class: 'liste-reglages' });
  sEtiquettes.append(listeEtiquettes, formulaireAjout('Nouvelle étiquette', 'Ajouter', async (v) => { await D.creerEtiquette(v); }));

  const sDebut = section('reglages-debut', 'Début d’activité', 'calendar', 'Le graphique du chiffre d’affaires part de ce mois et ne montre jamais les mois d’avant.');
  const debut = h('input', { type: 'month', class: 'champ champ-mois', 'aria-label': 'Mois de début d’activité',
    onchange: async (e) => {
      if (!/^\d{4}-\d{2}$/.test(e.target.value)) { e.target.value = D.etat.reglages.debutActivite; return; }
      await D.enregistrerReglages({ debutActivite: e.target.value });
      toast('Début d’activité enregistré');
    } });
  sDebut.append(debut);

  // Visible seulement si l'option « Créer un dossier dans Google Drive » est allumée : les sous-dossiers que « Créer un dossier dans Google Drive » crée dans chaque dossier de projet.
  const sProjets = section('reglages-projets', 'Dossiers de projets dans Google Drive', 'folder-plus', 'Servent au bouton « Créer un dossier dans Google Drive » des fiches affaire et projet : les sous-dossiers créés dans chaque dossier. Le dossier Drive parent se choisit dans Options du CRM, sous la case.');
  const etatGoogle = h('p', { class: 'aide', 'data-role': 'etat-google' });
  const listeSousDossiers = h('div', { class: 'liste-reglages', 'data-role': 'sous-dossiers' });
  const enregistrerSousDossiers = async (noms) => {
    const { liste, erreur } = nettoyerSousDossiers(noms);
    if (erreur) { toast(erreur, { type: 'erreur' }); return false; }
    await D.enregistrerReglages({ sousDossiersDrive: liste });
    return true;
  };
  sProjets.append(
    etatGoogle,
    h('h3', { class: 'sous-titre' }, 'Sous-dossiers de chaque projet'),
    listeSousDossiers,
    formulaireAjout('Nouveau sous-dossier (ex. Contrat, Livrables)', 'Ajouter', async (v) => { await enregistrerSousDossiers([...(D.etat.reglages.sousDossiersDrive || []), v]); }));

  const sExport = section('reglages-export', 'Sauvegarde', 'download', 'Télécharge toutes tes données (personnes, organisations, affaires, activités, notes, historique) dans un fichier.');
  const infoExport = h('p', { class: 'aide', 'data-role': 'dernier-export' });
  sExport.append(h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'exporter-tout', onclick: () => exporterToutesLesDonnees() }, icone('download', { taille: 16 }), 'Exporter mes données'), infoExport);

  // Date du dernier export des contacts : modifiable (reculer pour renvoyer des contacts, vider pour tout renvoyer).
  const dateContacts = h('input', { type: 'date', class: 'champ', 'aria-label': 'Date du dernier export des contacts', 'data-role': 'date-export-contacts',
    onchange: async (e) => {
      await D.enregistrerReglages({ dernierExportContacts: e.target.value ? new Date(`${e.target.value}T00:00:00`) : null });
      toast(e.target.value ? 'Date enregistrée' : 'Date effacée : le prochain export renverra tous les contacts');
    } });
  const viderDateContacts = h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'vider-date-export-contacts',
    onclick: async () => { await D.enregistrerReglages({ dernierExportContacts: null }); toast('Date effacée : le prochain export renverra tous les contacts'); } }, 'Tout renvoyer');
  sExport.append(
    h('label', { class: 'ligne-export-contacts' }, h('span', {}, 'Dernier export des contacts'), dateContacts, viderDateContacts),
    h('p', { class: 'aide' }, 'Le bouton Exporter de l’écran Personnes envoie les contacts créés ou modifiés depuis cette date. Recule-la pour en renvoyer plus, ou efface-la pour tout renvoyer.'));

  const config = sectionsConfiguration();

  page.append(...config.elements, sOffres, sSecteurs, sSources, sEtiquettes, sFiltres, sDebut, sProjets, sExport);

  function ligneOffre(o, i, liste) {
    const nom = h('input', { type: 'text', class: 'champ', value: o.nom, 'aria-label': `Nom de l'offre ${o.nom}`,
      onchange: (e) => {
        const v = e.target.value.trim();
        if (!v) { e.target.value = o.nom; return; }
        D.enregistrerOffres(liste.map((x) => (x.id === o.id ? { ...x, nom: v } : x)));
      } });
    const deplacer = (j) => {
      const copie = [...liste];
      [copie[i], copie[j]] = [copie[j], copie[i]];
      D.enregistrerOffres(copie);
    };
    return h('div', { class: `ligne-reglage ${o.actif === false ? 'archivee' : ''}`, dataset: { offre: o.id } },
      nom,
      o.actif === false ? h('span', { class: 'badge' }, 'Archivée') : null,
      h('div', { class: 'groupe-boutons' },
        boutonIcone('arrow-up', 'Monter', () => deplacer(i - 1), i === 0),
        boutonIcone('arrow-down', 'Descendre', () => deplacer(i + 1), i === liste.length - 1),
        o.actif === false
          ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => D.enregistrerOffres(liste.map((x) => (x.id === o.id ? { ...x, actif: true } : x))) }, icone('archive-restore', { taille: 14 }), 'Réactiver')
          : h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => D.enregistrerOffres(liste.map((x) => (x.id === o.id ? { ...x, actif: false } : x))) }, icone('archive', { taille: 14 }), 'Archiver')));
  }

  function ligneValeur(cle, valeur, i, liste) {
    const champ = h('input', { type: 'text', class: 'champ', value: valeur, 'aria-label': `Renommer ${valeur}`,
      onchange: (e) => {
        const v = e.target.value.trim();
        if (!v || liste.includes(v)) { e.target.value = valeur; return; }
        D.enregistrerListes({ [cle]: liste.map((x, j) => (j === i ? v : x)) });
      } });
    return h('div', { class: 'ligne-reglage' }, champ,
      h('div', { class: 'groupe-boutons' },
        boutonIcone('trash-2', `Retirer ${valeur}`, () => retirerAvecAnnulation({
          titre: 'Retirer de la liste', message: `"${valeur}" ne sera plus proposé. Les fiches existantes gardent leur valeur.`,
          faire: () => D.enregistrerListes({ [cle]: liste.filter((x) => x !== valeur) }), defaire: () => D.enregistrerListes({ [cle]: liste }), messageFait: `« ${valeur} » retiré` }))));
  }

  function ligneSousDossier(nom, i, liste) {
    const champ = h('input', { type: 'text', class: 'champ', value: nom, 'aria-label': `Renommer le sous-dossier ${nom}`, maxlength: '200',
      onchange: (e) => {
        const v = e.target.value.trim();
        if (!v) { e.target.value = nom; return; }
        enregistrerSousDossiers(liste.map((x, j) => (j === i ? v : x)));
      } });
    const deplacer = (j) => { const copie = [...liste]; [copie[i], copie[j]] = [copie[j], copie[i]]; enregistrerSousDossiers(copie); };
    return h('div', { class: 'ligne-reglage', dataset: { sousDossier: nom } }, champ,
      h('div', { class: 'groupe-boutons' },
        boutonIcone('arrow-up', 'Monter', () => deplacer(i - 1), i === 0),
        boutonIcone('arrow-down', 'Descendre', () => deplacer(i + 1), i === liste.length - 1),
        boutonIcone('trash-2', `Retirer ${nom}`, () => retirerAvecAnnulation({
          titre: 'Retirer ce sous-dossier ?', message: `« ${nom} » ne sera plus créé dans les prochains dossiers. Les dossiers déjà créés ne changent pas.`,
          faire: () => enregistrerSousDossiers(liste.filter((_, j) => j !== i)), defaire: () => enregistrerSousDossiers(liste), messageFait: `« ${nom} » retiré` }))));
  }

  function ligneEtiquette(e, i, liste) {
    const nom = h('input', { type: 'text', class: 'champ', value: e.nom, 'aria-label': `Renommer l'étiquette ${e.nom}`,
      onchange: (ev) => {
        const v = ev.target.value.trim();
        if (!v) { ev.target.value = e.nom; return; }
        D.enregistrerEtiquettes(liste.map((x) => (x.id === e.id ? { ...x, nom: v } : x)));
      } });
    const couleur = h('input', { type: 'color', class: 'champ-couleur', value: e.couleur || '#b98ee0', 'aria-label': `Couleur de l'étiquette ${e.nom}`,
      onchange: (ev) => D.enregistrerEtiquettes(liste.map((x) => (x.id === e.id ? { ...x, couleur: ev.target.value } : x))) });
    return h('div', { class: 'ligne-reglage', dataset: { etiquette: e.id } }, couleur, nom,
      h('div', { class: 'groupe-boutons' },
        boutonIcone('trash-2', `Retirer ${e.nom}`, () => retirerAvecAnnulation({
          titre: 'Retirer l’étiquette', message: `« ${e.nom} » sera retirée de la liste. Les fiches qui l’utilisent n’affichent plus cette étiquette.`,
          faire: () => D.enregistrerEtiquettes(liste.filter((x) => x.id !== e.id)), defaire: () => D.enregistrerEtiquettes(liste), messageFait: `« ${e.nom} » retirée` }))));
  }

  function ligneFiltre(f) {
    return h('div', { class: 'ligne-reglage', dataset: { filtre: f.id } },
      h('span', { class: 'nom-filtre' }, icone('bookmark', { taille: 14 }), f.nom, h('span', { class: 'aide' }, ` · ${{ personnes: 'Personnes', organisations: 'Organisations', projets: 'Projets' }[f.liste] ?? 'Affaires'}`)),
      h('div', { class: 'groupe-boutons' },
        h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', dataset: { action: 'renommer-filtre' }, onclick: async () => {
          const nom = await demanderTexte('Renommer le filtre', { libelle: 'Nom du filtre', valeur: f.nom });
          if (!nom) return;
          await D.enregistrerFiltres(D.etat.filtres.map((x) => (x.id === f.id ? { ...x, nom } : x)));
          toast('Filtre renommé');
        } }, icone('pencil', { taille: 14 }), 'Renommer'),
        h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', dataset: { action: 'supprimer-filtre' }, onclick: () => {
          const avant = D.etat.filtres;
          return retirerAvecAnnulation({ titre: 'Supprimer le filtre', message: `Supprimer le filtre "${f.nom}" ?`, libelleOk: 'Supprimer', danger: true,
            faire: () => D.enregistrerFiltres(avant.filter((x) => x.id !== f.id)), defaire: () => D.enregistrerFiltres(avant), messageFait: 'Filtre supprimé' });
        } }, icone('trash-2', { taille: 14 }), 'Supprimer')));
  }

  function rafraichir() {
    sProjets.hidden = !D.etat.config.options.boutonsDepot;
    config.rafraichir();
    etatGoogle.textContent = googleDisponible() ? 'Google Drive est branché.' : 'Google Drive n’est pas encore branché : l’identifiant client Google manque (guide pas à pas : docs/google-drive.md). Les boutons Google restent cachés sur les fiches.';
    if (page.contains(document.activeElement) && document.activeElement.matches('.liste-reglages input')) return;
    remplir(listeSousDossiers, ...(D.etat.reglages.sousDossiersDrive || []).map((nom, i, liste) => ligneSousDossier(nom, i, liste)));
    if (!(D.etat.reglages.sousDossiersDrive || []).length) listeSousDossiers.append(h('p', { class: 'vide-discret' }, 'Aucun sous-dossier : seul le dossier du projet est créé.'));
    remplir(listeOffres, ...D.etat.offres.map((o, i, l) => ligneOffre(o, i, l)));
    remplir(listeSecteurs, ...D.etat.secteurs.map((v, i, l) => ligneValeur('secteurs', v, i, l)));
    remplir(listeSources, ...D.etat.sources.map((v, i, l) => ligneValeur('sources', v, i, l)));
    remplir(listeEtiquettes, ...D.etat.etiquettes.map((e, i, l) => ligneEtiquette(e, i, l)));
    remplir(listeFiltres, ...D.etat.filtres.map(ligneFiltre));
    if (!D.etat.filtres.length) listeFiltres.append(h('p', { class: 'vide-discret' }, 'Aucun filtre enregistré.'));
    if (document.activeElement !== debut) debut.value = D.etat.reglages.debutActivite || '';
    const dc = L.versDate(D.etat.reglages.dernierExportContacts);
    if (document.activeElement !== dateContacts) dateContacts.value = dc ? `${dc.getFullYear()}-${String(dc.getMonth() + 1).padStart(2, '0')}-${String(dc.getDate()).padStart(2, '0')}` : '';
    infoExport.textContent = D.etat.reglages.dernierExport ? `Dernier export : ${L.formatDateHeure(D.etat.reglages.dernierExport)}` : 'Aucun export pour le moment.';
  }
  rafraichir();
  const arrets = [D.surChangement(rafraichir), PD.surChangement(rafraichir)];
  return () => arrets.forEach((f) => f());
}
