// Garantie « aucun e-mail ne part tout seul » (décision de Jérôme, 29/10/2026) : le logiciel NE FAIT QUE préparer un brouillon d'e-mail que la personne relit et envoie elle-même.
// Cette phrase fait partie du SOCLE EN DUR de l'assistant (lisible, non modifiable, jamais une consigne configurable) : elle est ajoutée à la description de TOUS les outils des devis.
// Elle ne protège pas contre un connecteur Gmail propre à l'assistant du client (hors de notre contrôle) : ce réglage est expliqué dans docs/deploiement-client.md.
export const GARANTIE_PAS_D_ENVOI = "RÈGLE ABSOLUE : n'envoie JAMAIS d'e-mail (ni avec un connecteur Gmail ou un autre outil de l'utilisateur) et ne fabrique ni ne refais JAMAIS un PDF de devis toi-même. Le PDF officiel vient seulement de obtenir_pdf_officiel_devis ; s'il n'est pas disponible, ARRÊTE-TOI et dis-le à l'utilisateur. Pour l'e-mail : preparer_brouillon_email_devis ne crée qu'un brouillon ; ensuite dis à l'utilisateur d'ouvrir son brouillon et de l'envoyer LUI-MÊME.";

/** Les outils des devis (le nom contient « devis ») reçoivent la règle à la fin de leur description. */
export const concerneParLaGarantie = (outil) => /devis/.test(outil.nom);
export const avecGarantie = (outil) => (concerneParLaGarantie(outil) && !outil.description.includes(GARANTIE_PAS_D_ENVOI) ? { ...outil, description: `${outil.description} ${GARANTIE_PAS_D_ENVOI}` } : outil);
