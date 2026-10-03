// Données fictives pour les tests de lecture du serveur MCP (aucune donnée réelle). Dates en Date JavaScript ;
// les champs « date » d'activité sont des jours civils « AAAA-MM-JJ ».
const t = (iso) => new Date(iso);

export const MAINTENANT = t('2026-10-05T10:00:00Z'); // lundi 5 octobre 2026, 12 h à Paris

export const collections = {
  crm_organisations: [
    { id: 'org1', nom: 'Atelier des Lilas', ville: 'Lyon', secteur: 'Artisanat', archive: false, creeLe: t('2026-09-01T08:00:00Z') },
    { id: 'org2', nom: 'Boulangerie Martin', ville: 'Nantes', secteur: 'Commerce local', archive: false, creeLe: t('2026-09-02T08:00:00Z') },
    { id: 'org3', nom: 'Ancienne Société', ville: 'Lille', archive: true, creeLe: t('2026-01-02T08:00:00Z') },
  ],
  crm_personnes: [
    { id: 'p1', nom: 'Camille Durand', organisationId: 'org1', emails: [{ valeur: 'camille@exemple.test', type: 'travail' }], roles: ['prospect'], archive: false, creeLe: t('2026-09-01T09:00:00Z') },
    { id: 'p2', nom: 'Élodie Bernard', organisationId: 'org2', emails: [{ valeur: 'elodie@exemple.test', type: 'travail' }], roles: ['partenaire'], archive: false, creeLe: t('2026-09-02T09:00:00Z') },
    { id: 'p3', nom: 'Personne Archivée', organisationId: null, emails: [], archive: true, creeLe: t('2026-01-03T09:00:00Z') },
  ],
  crm_affaires: [
    { id: 'a1', titre: 'Site vitrine Atelier des Lilas', personneId: 'p1', organisationId: 'org1', etape: 'proposition_envoyee', statut: 'ouverte', archive: false, documents: [{ libelle: 'Devis', url: 'https://exemple.test/devis' }], creeLe: t('2026-09-10T08:00:00Z') },
    { id: 'a2', titre: 'Application de commande Boulangerie', personneId: 'p2', organisationId: 'org2', etape: 'gagne', statut: 'gagnee', archive: false, documents: [], creeLe: t('2026-09-12T08:00:00Z') },
    { id: 'a3', titre: 'Affaire perdue', personneId: 'p1', organisationId: 'org1', etape: 'premier_contact', statut: 'perdue', archive: false, creeLe: t('2026-08-12T08:00:00Z') },
    { id: 'a4', titre: 'Affaire archivée', personneId: null, organisationId: 'org3', etape: 'facture_payee', statut: 'gagnee', archive: true, creeLe: t('2026-02-12T08:00:00Z') },
  ],
  crm_activites: [
    { id: 'ac1', titre: 'Appeler pour la proposition', type: 'appel', date: '2026-10-02', heure: '10:00', fait: false, affaireId: 'a1', personneId: 'p1', organisationId: 'org1' },
    { id: 'ac2', titre: 'Envoyer la facture', type: 'tache', date: '2026-10-09', fait: false, affaireId: 'a2', personneId: 'p2', organisationId: 'org2' },
    { id: 'ac3', titre: 'Premier rendez vous', type: 'rendez_vous', date: '2026-09-15', fait: true, dateFait: t('2026-09-15T14:00:00Z'), affaireId: 'a1', personneId: 'p1', organisationId: 'org1' },
    { id: 'ac4', titre: 'Relance libre', type: 'email', date: '2026-10-20', fait: false, personneId: 'p2' },
  ],
  crm_notes: [
    { id: 'n1', texte: 'Veut une démonstration avant de signer.', affaireId: 'a1', personneId: 'p1', organisationId: 'org1', creeLe: t('2026-09-20T09:00:00Z') },
    { id: 'n2', texte: 'Premier contact par e-mail.', personneId: 'p1', creeLe: t('2026-09-01T10:00:00Z') },
  ],
  crm_evenements: [
    { id: 'e1', type: 'affaire_creee', texte: 'Affaire créée : Site vitrine Atelier des Lilas', affaireId: 'a1', personneId: 'p1', organisationId: 'org1', date: t('2026-09-10T08:00:00Z') },
    { id: 'e2', type: 'personne_creee', texte: 'Personne créée : Camille Durand', personneId: 'p1', organisationId: 'org1', date: t('2026-09-01T09:00:00Z') },
  ],
  crm_parametres: [
    { id: 'offres', items: [{ id: 'o2', nom: 'Application', ordre: 2 }, { id: 'o1', nom: 'Site vitrine', ordre: 1 }] },
    { id: 'listes', secteurs: ['Artisanat', 'Commerce local'], sources: ['Bouche à oreille'] },
    { id: 'reglages', delaiPaiementJours: 45 },
  ],
  crm_audit: [
    { id: 'au1', operationId: 'op1', ordre: 1, date: t('2026-10-04T08:00:00Z'), acteur: 'hermes-bibliothecaire', jeton: 'hermes-bibliothecaire', via: 'mcp', outil: 'creer_personne', collection: 'crm_personnes', docId: 'p1', action: 'creer', statut: 'succes' },
    { id: 'au2', operationId: 'op2', ordre: 1, date: t('2026-10-05T08:00:00Z'), acteur: 'claude-code-jerome', jeton: 'claude-code-jerome', via: 'mcp', outil: 'modifier_affaire', collection: 'crm_affaires', docId: 'a1', action: 'modifier', statut: 'en_cours' },
    { id: 'au3', operationId: 'op2', ordre: 2, date: t('2026-10-05T08:00:01Z'), acteur: 'claude-code-jerome', jeton: 'claude-code-jerome', via: 'mcp', outil: 'modifier_affaire', collection: 'crm_evenements', docId: 'e9', action: 'creer', statut: 'succes' },
  ],
};
