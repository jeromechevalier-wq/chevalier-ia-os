// Outil « marquer un client de démonstration » : pose `demo: true` sur la fiche clients/<identifiant> d'un client EXISTANT de la plateforme.
// Sans cette marque, scripts/donnees-demo.js refuse d'écrire. Simulation par défaut ; --ecrire pour poser la marque.
// N'écrit QUE le champ demo (fusion, jamais d'écrasement). Refuse le projet de Jérôme (chevalier-ia-os) et un client qui n'existe pas.
// Lancé À LA MAIN par Jérôme (scripts/marquer-demo.js) avec ses identifiants Google. Voir docs/donnees-demo.md.
import { ErreurOutil, exigerIdentifiant, lireArguments, cible, ouvrir, traduireErreur, PROJET_PLATEFORME, PROJETS_INTERDITS } from './commun.js';

export const AIDE = `Outil « marquer un client de démonstration » : simule par défaut ; ajouter --ecrire pour écrire vraiment.

  node scripts/marquer-demo.js --client <identifiant> [--ecrire]

Pose la marque « demo: true » sur la fiche du client (rien d'autre n'est écrit). Sans elle, l'outil de démonstration refuse d'écrire.
Ne marquez JAMAIS un vrai client : on ne transforme pas un client réel en client de démonstration.`;

export async function executerMarquerDemo(argv, ctx) {
  try {
    const { positionnels, options } = lireArguments(argv, { valeurs: ['client'], drapeaux: ['ecrire', 'aide'] });
    if (options.aide) { ctx.out(AIDE); return 0; }
    if (positionnels.length) throw new ErreurOutil(`Argument en trop : « ${positionnels.join(' ')} ». Écrivez --client <identifiant>.`);
    if (options.client === undefined) { ctx.out(AIDE); return 1; }
    const id = exigerIdentifiant(options.client);
    ctx.cible = cible({}, ctx.env || process.env);
    if (PROJETS_INTERDITS.includes(ctx.cible.projet) || (!ctx.cible.emulateur && ctx.cible.projet !== PROJET_PLATEFORME)) {
      throw new ErreurOutil(`Projet « ${ctx.cible.projet} » refusé : cet outil n'écrit que dans le projet des clients « ${PROJET_PLATEFORME} ».`);
    }
    const ecrire = Boolean(options.ecrire);
    ctx.out(`Base visée : ${ctx.cible.projet} ${ctx.cible.emulateur ? '(ÉMULATEUR de test)' : '(VRAIE base)'}${ecrire ? '' : ' ; SIMULATION'}`);
    const { db } = ctx.base ?? ouvrir(ctx.cible);
    const ref = db.doc(`clients/${id}`);
    const snap = await ref.get();
    if (!snap.exists) throw new ErreurOutil(`Le client « ${id} » n'existe pas (pas de fiche clients/${id}). Rien n'a été modifié.`);
    if (snap.data().demo === true) { ctx.out(`Le client « ${id} » est déjà marqué comme client de démonstration : rien à changer.`); return 0; }
    ctx.out(`Client « ${id} »${snap.data().nom ? ` (${snap.data().nom})` : ''} : la marque « demo: true » serait posée sur clients/${id} (aucun autre champ n'est touché).`);
    if (!ecrire) { ctx.out("SIMULATION : rien n'a été écrit. Relancez la même commande avec --ecrire si c'est bien un client de démonstration."); return 0; }
    await ref.set({ demo: true }, { merge: true });
    ctx.out(`✔ Marque « demo: true » posée sur clients/${id}. Seul ce champ a été écrit.`);
    return 0;
  } catch (e) {
    for (const l of e instanceof ErreurOutil ? e.messages : traduireErreur(e)) ctx.out(`✖ ${l}`);
    ctx.out("Rien n'a été écrit.");
    return 1;
  }
}
