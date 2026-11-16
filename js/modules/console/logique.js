// Règles du module Console (sans Firebase ni DOM : testables seules).
// Phase 0 : le Filet de sécurité, une liste de vérifications que Jérôme fait à la main et date ici. Chaque ligne a un délai ; passé ce délai
// (ou si elle n'a jamais été faite), elle est rouge. Rien dans ce fichier ne décrit l'infrastructure (le dépôt est public) : ce sont des
// vérifications génériques, les détails vivent dans le second cerveau.

/** Vérifications du filet : id (clé du document `console_filet/<id>`), titre, aide, délai en jours avant qu'elle soit trop ancienne. */
export const LIGNES_FILET = Object.freeze([
  { id: 'sauvegarde-clients', titre: 'Sauvegarde de la base des clients constatée', aide: 'Ouvrir la console Google : la copie quotidienne et le retour à la minute sont actifs.', delai: 30 },
  { id: 'restauration', titre: 'Restauration d\'une sauvegarde essayée pour de vrai', aide: 'Restaurer une copie dans une base d\'essai et ouvrir un espace dessus.', delai: 90 },
  { id: 'retour-arriere', titre: 'Retour arrière essayé (site, fonctions, règles)', aide: 'Revenir à la version précédente de chaque élément, puis vérifier que tout marche.', delai: 90 },
  { id: 'second-proprietaire', titre: 'Second propriétaire du projet des clients', aide: 'Une personne de confiance peut gérer le projet si Jérôme est indisponible.', delai: 90 },
  { id: 'budget', titre: 'Budget et alertes de facturation des clients', aide: 'Un budget est fixé et les alertes arrivent bien.', delai: 90 },
  { id: 'guide-indisponible', titre: 'Guide « Jérôme indisponible » relu', aide: 'Le document dit qui fait quoi, où sont les accès et comment couper un service.', delai: 90 },
  { id: 'controle-deploiement', titre: 'Contrôle après déploiement essayé', aide: 'Après une publication, un test vérifie qu\'un espace s\'ouvre encore.', delai: 30 },
]);

const JOUR = 86_400_000;

/** Date d'un champ Firestore ou ISO (Timestamp avec toDate, Date, texte ISO), ou null si illisible. */
export function dateDe(valeur) {
  if (!valeur) return null;
  const d = typeof valeur.toDate === 'function' ? valeur.toDate() : valeur instanceof Date ? valeur : new Date(valeur);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * État d'une ligne : 'jamais' (aucune vérification enregistrée), 'ok' (dans le délai) ou 'ancien' (délai dépassé).
 * `fiche` = document `console_filet/<id>` ({ verifieLe, note }) ou undefined.
 */
export function etatLigne(ligne, fiche, maintenant = new Date()) {
  const date = dateDe(fiche?.verifieLe);
  if (!date) return { etat: 'jamais', jours: null };
  const jours = Math.max(0, Math.floor((maintenant.getTime() - date.getTime()) / JOUR));
  return { etat: jours > ligne.delai ? 'ancien' : 'ok', jours };
}

/** Les lignes du filet avec leur état : [{ ...ligne, etat, jours, note }] dans l'ordre de LIGNES_FILET. `fiches` = tableau de documents (champ `id`). */
export function lignesAvecEtat(fiches, maintenant = new Date()) {
  const parId = new Map((fiches ?? []).map((f) => [f.id, f]));
  return LIGNES_FILET.map((l) => ({ ...l, ...etatLigne(l, parId.get(l.id), maintenant), note: typeof parId.get(l.id)?.note === 'string' ? parId.get(l.id).note : '' }));
}

/** Résumé du filet : { total, ok, aRefaire } (aRefaire = jamais faites ou trop anciennes). */
export function resumeFilet(lignes) {
  const ok = lignes.filter((l) => l.etat === 'ok').length;
  return { total: lignes.length, ok, aRefaire: lignes.length - ok };
}

/** Phrase lue sous une ligne : « Jamais vérifié », « Vérifié aujourd'hui », « Vérifié il y a 12 jours ». */
export function texteEtat(l) {
  if (l.etat === 'jamais') return 'Jamais vérifié';
  if (l.jours === 0) return 'Vérifié aujourd\'hui';
  return `Vérifié il y a ${l.jours} jour${l.jours > 1 ? 's' : ''}`;
}

/** Plateformes du sélecteur : « Toutes » en premier (critère C8). Phase 0 : seule la plateforme de Jérôme est lisible. */
export const PLATEFORMES = Object.freeze([
  { id: 'toutes', libelle: 'Toutes les plateformes' },
  { id: 'jerome', libelle: 'Chevalier IA OS (Jérôme)' },
  { id: 'clients', libelle: 'Plateforme des clients' },
]);

/** Plateforme demandée dans l'adresse (« console/vue?plateforme=clients » ou segment) : inconnue -> « toutes ». */
export function plateformeValide(id) {
  return PLATEFORMES.some((p) => p.id === id) ? id : 'toutes';
}
