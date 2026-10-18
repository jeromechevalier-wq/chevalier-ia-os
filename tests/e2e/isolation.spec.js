// A5 : deux workers qui écrivent un document DIFFÉRENT au même chemin, chacun dans son projet, ne voient jamais celui de l'autre.
import { test, expect, PROJET, FIRESTORE, ecrireDocument, lireDocument, connecter } from './outils.js';

test.describe.configure({ mode: 'parallel' });

for (const nom of ['A', 'B']) {
  test(`I-A5 isolation des workers : le document écrit par « ${nom} » au chemin commun reste celui de son projet`, { tag: '@sans-telephone' }, async ({ page }, info) => {
    const valeur = `${nom}-${PROJET}`;
    await ecrireDocument('essais/isolation', { valeur });
    // Pendant ~2 s (l'autre worker écrit au même chemin dans son propre projet), notre lecture ne change jamais.
    for (let i = 0; i < 20; i++) {
      expect((await lireDocument('essais/isolation'))?.valeur).toBe(valeur);
      await new Promise((ok) => setTimeout(ok, 100));
    }
    // L'appli parle au projet de ce worker (window.__emulateurs posé avant le chargement).
    await connecter(page);
    const emu = await page.evaluate(() => window.__emulateurs);
    expect(emu.projet).toBe(PROJET);
    // Le même chemin, dans le projet voisin, n'a jamais la valeur de ce worker.
    const autre = PROJET.endsWith('-w0') ? PROJET.replace(/-w0$/, '-w1') : PROJET.replace(/-w\d+$/, '-w0');
    if (autre !== PROJET) {
      const r = await fetch(`${FIRESTORE}/v1/projects/${autre}/databases/(default)/documents/essais/isolation`, { headers: { Authorization: 'Bearer owner' } });
      if (r.status === 200) expect((await r.json()).fields.valeur.stringValue).not.toBe(valeur);
    }
    info.annotations.push({ type: 'projet', description: PROJET });
  });
}
