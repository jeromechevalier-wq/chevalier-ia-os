// Fabrique le HTML des CGV (type mixte) et l'écrit sur la sortie en JSON { html }. Lancé par devis-cgv.spec.js dans un processus Node.
import { cgvHtml } from '../../js/modules/devis/cgv.js';

const html = cgvHtml({
  typePrestations: 'travaux_fournitures',
  professionnel: { nom: 'Atelier Exemple', email: 'contact@exemple.test' },
  mediateur: { nom: 'Médiateur Test', email: 'mediation@exemple.test', site: 'https://mediation.exemple.test' },
  tribunal: 'le tribunal judiciaire de Ville',
  penalitesRetard: true, couleur: '#1f4e79',
});
process.stdout.write(JSON.stringify({ html }));
