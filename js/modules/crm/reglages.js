// Réglages du CRM : offres, secteurs, sources, étiquettes, filtres enregistrés, délai de paiement, début d'activité, export.
import { h, icone, vider, remplir, toast, confirmer, demanderTexte, dialogue } from '../../os/ui.js';
import * as D from './donnees.js';
import * as PD from '../projets/donnees.js';
import * as L from './logique.js';
import { exporterToutesLesDonnees } from './export.js';

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

  const sDelai = section('reglages-delai', 'Délai de paiement', 'clock', 'Plus utilisé depuis la 2.2 : la facturation se suit maintenant sur les factures des projets.');
  const delai = h('input', { type: 'number', class: 'champ champ-court', min: '1', max: '365', 'aria-label': 'Délai de paiement en jours',
    onchange: async (e) => {
      const v = Math.max(1, Math.min(365, Number(e.target.value) || 30));
      await D.enregistrerReglages({ delaiPaiementJours: v });
      toast('Délai de paiement enregistré');
    } });
  sDelai.append(h('label', { class: 'ligne-champ' }, delai, h('span', {}, 'jours')));

  const sEtiquettes = section('reglages-etiquettes', 'Étiquettes', 'tag', 'Elles se créent aussi à la volée depuis n’importe quel champ « Étiquettes ».');
  const listeEtiquettes = h('div', { class: 'liste-reglages' });
  sEtiquettes.append(listeEtiquettes, formulaireAjout('Nouvelle étiquette', 'Ajouter', async (v) => { await D.creerEtiquette(v); }));

  const sDebut = section('reglages-debut', 'Début d’activité', 'calendar', 'Le graphique du chiffre d’affaires part de ce mois et ne montre jamais les mois d’avant.');
  const debut = h('input', { type: 'month', class: 'champ champ-court', 'aria-label': 'Mois de début d’activité',
    onchange: async (e) => {
      if (!/^\d{4}-\d{2}$/.test(e.target.value)) { e.target.value = D.etat.reglages.debutActivite; return; }
      await D.enregistrerReglages({ debutActivite: e.target.value });
      toast('Début d’activité enregistré');
    } });
  sDebut.append(debut);

  const sProjets = section('reglages-projets', 'GitHub et dossiers de projets', 'folder-plus', 'Servent aux boutons « Créer le GitHub » et « Créer le répertoire » des fiches : le compte GitHub propriétaire des dépôts, et le dossier de ton Mac où se rangent les projets.');
  const compteGithub = h('input', { type: 'text', class: 'champ', 'aria-label': 'Compte GitHub', autocapitalize: 'off', spellcheck: false,
    onchange: async (e) => {
      const v = e.target.value.trim();
      if (Object.keys(L.validerProprietaireGithub(v)).length) { e.target.value = D.etat.reglages.proprietaireGithub; toast('Nom de compte GitHub invalide', { type: 'erreur' }); return; }
      await D.enregistrerReglages({ proprietaireGithub: v });
      toast('Compte GitHub enregistré');
    } });
  const cheminProjets = h('input', { type: 'text', class: 'champ', 'aria-label': 'Chemin du dossier Projets sur le Mac', autocapitalize: 'off', spellcheck: false,
    onchange: async (e) => {
      const v = L.nettoyerEspaces(e.target.value);
      if (!v) { e.target.value = D.etat.reglages.cheminProjets; return; }
      await D.enregistrerReglages({ cheminProjets: v });
      toast('Chemin enregistré');
    } });
  sProjets.append(h('label', { class: 'ligne-champ' }, h('span', {}, 'Compte GitHub'), compteGithub), h('label', { class: 'ligne-champ' }, h('span', {}, 'Dossier Projets'), cheminProjets));

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

  // Migration 2.2 : visible seulement tant qu'il reste des affaires dans les étapes retirées « Facture envoyée » / « Facture payée ».
  const sMigration = section('reglages-migration', 'Migration de la facturation (2.2)', 'rotate-ccw',
    'Les étapes « Facture envoyée » et « Facture payée » n’existent plus : la facturation se suit sur les projets. Les affaires qui y sont encore passent à « Gagné », sans rien perdre de ton chiffre d’affaires.');
  const zoneMigration = h('div', { class: 'pile' });
  sMigration.append(zoneMigration);

  async function apercuMigration() {
    const apercu = PD.apercuMigrationEtapes();
    const lignes = apercu.migrees.map((m) => h('li', { class: 'ligne-simple', dataset: { affaire: m.affaireId } },
      h('strong', {}, m.titre), h('span', { class: 'aide' }, `${m.de} → Gagné${m.facture ? ` · facture de ${L.formatEuros(m.facture.montant)} ajoutée à son projet` : ''}`)));
    const manuelles = apercu.aTraiterAMain.map((m) => h('li', { class: 'ligne-simple', dataset: { affaire: m.affaireId } }, h('strong', {}, m.titre), h('span', { class: 'aide' }, m.raison)));
    const ok = await dialogue({
      titre: 'Migrer les affaires',
      classe: 'dialogue-large',
      contenu: h('div', { class: 'pile' },
        h('p', {}, `${apercu.migrees.length} ${apercu.migrees.length > 1 ? 'affaires vont être migrées' : 'affaire va être migrée'}. Rien n’est écrit tant que tu n’as pas validé.`),
        h('ul', { class: 'liste-simple', dataset: { role: 'apercu-migrees' } }, lignes),
        manuelles.length ? h('div', { class: 'pile' }, h('h3', {}, 'À traiter à la main'), h('ul', { class: 'liste-simple', dataset: { role: 'apercu-a-la-main' } }, manuelles)) : null,
        h('p', { class: 'aide' }, 'L’opération est écrite dans le journal et se restaure d’un coup.')),
      boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Migrer', valeur: true, style: 'principal' }],
    });
    if (!ok) return;
    try {
      const r = await PD.migrerEtapesRetirees();
      toast(`${r.migrees.length} ${r.migrees.length > 1 ? 'affaires migrées' : 'affaire migrée'}${r.aTraiterAMain.length ? ` · ${r.aTraiterAMain.length} à traiter à la main` : ''}`);
    } catch (e) { console.warn(e); toast('Migration impossible', { type: 'erreur' }); }
  }

  page.append(sMigration, sOffres, sSecteurs, sSources, sEtiquettes, sFiltres, sDelai, sDebut, sProjets, sExport);

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
        boutonIcone('trash-2', `Retirer ${valeur}`, async () => {
          if (await confirmer('Retirer de la liste', `"${valeur}" ne sera plus proposé. Les fiches existantes gardent leur valeur.`, { libelleOk: 'Retirer' })) {
            D.enregistrerListes({ [cle]: liste.filter((x) => x !== valeur) });
          }
        })));
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
        boutonIcone('trash-2', `Retirer ${e.nom}`, async () => {
          if (await confirmer('Retirer l’étiquette', `« ${e.nom} » sera retirée de la liste. Les fiches qui l’utilisent n’affichent plus cette étiquette.`, { libelleOk: 'Retirer' })) {
            D.enregistrerEtiquettes(liste.filter((x) => x.id !== e.id));
          }
        })));
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
        h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', dataset: { action: 'supprimer-filtre' }, onclick: async () => {
          if (!(await confirmer('Supprimer le filtre', `Supprimer le filtre "${f.nom}" ?`, { libelleOk: 'Supprimer', danger: true }))) return;
          await D.enregistrerFiltres(D.etat.filtres.filter((x) => x.id !== f.id));
          toast('Filtre supprimé');
        } }, icone('trash-2', { taille: 14 }), 'Supprimer')));
  }

  function rafraichirMigration() {
    const restantes = D.etat.affaires.filter((a) => a.etape in L.ETAPES_RETIREES);
    sMigration.hidden = !restantes.length;
    remplir(zoneMigration, restantes.length ? h('div', { class: 'pile' },
      h('p', { dataset: { role: 'compte-migration' } }, `${restantes.length} ${restantes.length > 1 ? 'affaires sont encore' : 'affaire est encore'} dans une étape retirée.`),
      h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'migrer-etapes', onclick: apercuMigration }, icone('eye', { taille: 16 }), 'Voir ce qui va changer')) : null);
  }

  function rafraichir() {
    rafraichirMigration();
    if (page.contains(document.activeElement) && document.activeElement.matches('.liste-reglages input')) return;
    remplir(listeOffres, ...D.etat.offres.map((o, i, l) => ligneOffre(o, i, l)));
    remplir(listeSecteurs, ...D.etat.secteurs.map((v, i, l) => ligneValeur('secteurs', v, i, l)));
    remplir(listeSources, ...D.etat.sources.map((v, i, l) => ligneValeur('sources', v, i, l)));
    remplir(listeEtiquettes, ...D.etat.etiquettes.map((e, i, l) => ligneEtiquette(e, i, l)));
    remplir(listeFiltres, ...D.etat.filtres.map(ligneFiltre));
    if (!D.etat.filtres.length) listeFiltres.append(h('p', { class: 'vide-discret' }, 'Aucun filtre enregistré.'));
    if (document.activeElement !== delai) delai.value = String(D.etat.reglages.delaiPaiementJours ?? 30);
    if (document.activeElement !== debut) debut.value = D.etat.reglages.debutActivite || '';
    if (document.activeElement !== compteGithub) compteGithub.value = D.etat.reglages.proprietaireGithub || '';
    if (document.activeElement !== cheminProjets) cheminProjets.value = D.etat.reglages.cheminProjets || '';
    const dc = L.versDate(D.etat.reglages.dernierExportContacts);
    if (document.activeElement !== dateContacts) dateContacts.value = dc ? `${dc.getFullYear()}-${String(dc.getMonth() + 1).padStart(2, '0')}-${String(dc.getDate()).padStart(2, '0')}` : '';
    infoExport.textContent = D.etat.reglages.dernierExport ? `Dernier export : ${L.formatDateHeure(D.etat.reglages.dernierExport)}` : 'Aucun export pour le moment.';
  }
  rafraichir();
  const arrets = [D.surChangement(rafraichir), PD.surChangement(rafraichirMigration)];
  return () => arrets.forEach((f) => f());
}
