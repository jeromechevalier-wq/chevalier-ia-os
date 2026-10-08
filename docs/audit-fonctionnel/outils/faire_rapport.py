#!/usr/bin/env python3
"""Lit docs/audit-fonctionnel/*.md, compte les constats et écrit 99-rapport.html (un seul fichier autonome)."""
import re, html, json, sys, os

DOSSIER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FICHIERS = [
    ('A', 'Projets et factures', '10-projets-et-factures.md'),
    ('B', 'Serveur MCP', '20-serveur-mcp.md'),
    ('C', 'Ventes et CRM', '30-ventes-crm.md'),
    ('D', 'Journal et restauration', '40-journal-et-restauration.md'),
    ('E', 'Accueil et chiffres', '50-accueil-objectifs-statistiques.md'),
    ('F', 'Parcours dans l’appli', '60-parcours-utilisateur.md'),
    ('G', 'Tests et qualité', '70-tests-et-qualite.md'),
    ('H', 'Documentation et point projet', '80-point-projet.md'),
]
ORDRE = {'BLOQUANT': 0, 'GÊNANT': 1, 'MINEUR': 2}

def lire(fichier):
    return open(os.path.join(DOSSIER, fichier), encoding='utf-8').read()

def parser(lettre, texte):
    constats, cur, label = [], None, None
    for ligne in texte.split('\n'):
        m = re.match(r'^### (%s-\d\d) · (.*)$' % lettre, ligne)
        if m:
            cur = {'id': m.group(1), 'titre': m.group(2).strip(), 'champs': {}}
            constats.append(cur); label = None
            continue
        if ligne.startswith('## ') or (ligne.startswith('### ') and not m):
            cur = None; label = None
            continue
        if cur is None:
            continue
        b = re.match(r'^- \*\*(.+?)\*\*\s*:\s*(.*)$', ligne)
        if b:
            label = b.group(1).strip()
            cur['champs'][label] = b.group(2).strip()
        elif label and ligne.strip():
            cur['champs'][label] += ' ' + ligne.strip()
    for c in constats:
        g = next((v for k, v in c['champs'].items() if k.startswith('Gravité')), '')
        cf = next((v for k, v in c['champs'].items() if k.startswith('Confiance')), '')
        c['gravite'] = next((x for x in ORDRE if g.startswith(x)), '?')
        c['confiance_txt'] = cf
        c['confiance'] = 'CONFIRMÉ' if cf.startswith('CONFIRMÉ') else ('PLAUSIBLE' if cf.startswith('PLAUSIBLE') else '?')
    return constats

def md(s):
    s = html.escape(s)
    s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'\*([^*\n]+)\*', r'<em>\1</em>', s)
    return s

tous, par_module = [], {}
for lettre, nom, f in FICHIERS:
    cs = parser(lettre, lire(f))
    for c in cs:
        c['module'] = lettre
        c['module_nom'] = nom
    par_module[lettre] = cs
    tous += cs

# ---- vérifications
manque = [c['id'] for c in tous if c['gravite'] == '?' or c['confiance'] == '?']
if manque:
    print('ATTENTION gravité ou confiance non lues :', manque, file=sys.stderr)

compte_g = {g: sum(1 for c in tous if c['gravite'] == g) for g in ORDRE}
compte_c = {k: sum(1 for c in tous if c['confiance'] == k) for k in ('CONFIRMÉ', 'PLAUSIBLE')}
croise = {(g, k): sum(1 for c in tous if c['gravite'] == g and c['confiance'] == k) for g in ORDRE for k in ('CONFIRMÉ', 'PLAUSIBLE')}
par_mod_g = {l: {g: sum(1 for c in par_module[l] if c['gravite'] == g) for g in ORDRE} for l in par_module}

stats = {'total': len(tous), 'gravite': compte_g, 'confiance': compte_c,
         'croise': {f'{g}/{k}': v for (g, k), v in croise.items()},
         'modules': {l: {'total': len(par_module[l]), **par_mod_g[l]} for l in par_module}}
json.dump(stats, open('/tmp/audit-stats.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps(stats, ensure_ascii=False))

# listes par gravité et confiance (pour 00-avancement.md)
with open('/tmp/audit-listes.md', 'w', encoding='utf-8') as out:
    for g in ORDRE:
        for k in ('CONFIRMÉ', 'PLAUSIBLE'):
            ids = [c['id'] for c in tous if c['gravite'] == g and c['confiance'] == k]
            out.write(f"- **{g} · {k}** ({len(ids)}) : {', '.join(ids) if ids else 'aucun'}\n")

# ---- priorités (section 4 du fichier H)
h = lire('80-point-projet.md')
m = re.search(r'## 4\. Priorités proposées.*?\n(.*?)\n---\n', h, re.S)
prio_md = m.group(1) if m else ''
prio_html, niveau_ouvert, liste_ouverte = '', False, False
for ligne in prio_md.split('\n'):
    if ligne.startswith('### '):
        if liste_ouverte: prio_html += '</ol>'; liste_ouverte = False
        prio_html += f'<h3>{md(ligne[4:])}</h3>'
    elif re.match(r'^\d+\. ', ligne):
        if not liste_ouverte: prio_html += '<ol>'; liste_ouverte = True
        prio_html += f'<li>{md(re.sub(r"^\d+\. ", "", ligne))}</li>'
if liste_ouverte: prio_html += '</ol>'

# ---- HTML
def pastille(g):
    cl = {'BLOQUANT': 'bloquant', 'GÊNANT': 'genant', 'MINEUR': 'mineur'}.get(g, 'mineur')
    return f'<span class="pastille {cl}">{html.escape(g)}</span>'

lignes_tab = ''
for c in sorted(tous, key=lambda c: (ORDRE.get(c['gravite'], 9), c['id'])):
    lignes_tab += (f'<tr data-module="{c["module"]}" data-gravite="{c["gravite"]}" data-confiance="{c["confiance"]}">'
                   f'<td data-l="Numéro"><a href="#{c["id"]}">{c["id"]}</a></td>'
                   f'<td data-l="Gravité">{pastille(c["gravite"])}</td>'
                   f'<td data-l="Titre">{md(c["titre"])}</td>'
                   f'<td data-l="Module">{html.escape(c["module_nom"])}</td>'
                   f'<td data-l="Confiance">{html.escape(c["confiance"].capitalize())}</td></tr>\n')

ordre_champs = ['Ce qui se passe', 'Ce que ça change pour Jérôme', 'Où dans le code', 'Règle ou décision concernée', 'Preuve']
detail = ''
for lettre, nom, f in FICHIERS:
    cs = par_module[lettre]
    detail += f'<section class="module" id="module-{lettre}"><h3>{lettre}. {html.escape(nom)} <small>({len(cs)} constat{"s" if len(cs) > 1 else ""})</small></h3>'
    if not cs:
        detail += '<p class="note">Aucun constat écrit pour ce module : l’essai dans l’appli n’a pas été fait (voir « Ce qui n’a pas été couvert »).</p>'
    detail += f'<p class="note">Fichier source : <code>docs/audit-fonctionnel/{f}</code></p>'
    for c in sorted(cs, key=lambda c: (ORDRE.get(c['gravite'], 9), c['id'])):
        detail += f'<details class="constat" id="{c["id"]}" data-module="{lettre}" data-gravite="{c["gravite"]}"><summary>{pastille(c["gravite"])} <b>{c["id"]}</b> · {md(c["titre"])}</summary><dl>'
        detail += f'<dt>Confiance</dt><dd>{md(c["confiance_txt"])}</dd>'
        for k in ordre_champs:
            v = next((val for key, val in c['champs'].items() if key.startswith(k.split(' ')[0] + ' ') or key == k), None)
            if k.startswith('Règle'):
                v = next((val for key, val in c['champs'].items() if key.startswith('Règle')), None)
            if k.startswith('Où'):
                v = next((val for key, val in c['champs'].items() if key.startswith('Où')), None)
            if v:
                detail += f'<dt>{html.escape(k)}</dt><dd>{md(v)}</dd>'
        detail += '</dl></details>\n'
    detail += '</section>'

options_modules = '<option value="">Tous les modules</option>' + ''.join(
    f'<option value="{l}">{l}. {html.escape(n)} ({len(par_module[l])})</option>' for l, n, _ in FICHIERS)

cg = compte_g
doc = f'''<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audit fonctionnel Chevalier IA OS</title>
<style>
:root{{--bg:#fafaf7;--carte:#fff;--texte:#1d1d1b;--doux:#5d5d58;--ligne:#e2e1da;--lien:#7a5a00;--bloquant:#b3261e;--genant:#a65a00;--mineur:#5d5d58;--pbloq:#fde7e5;--pgen:#fff0d6;--pmin:#ececE6}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#161614;--carte:#201f1c;--texte:#efeee8;--doux:#b0afa6;--ligne:#38372f;--lien:#f1c34a;--bloquant:#ff8f86;--genant:#ffb457;--mineur:#b0afa6;--pbloq:#4a2320;--pgen:#4a3416;--pmin:#33322c}}}}
:root[data-theme="dark"]{{--bg:#161614;--carte:#201f1c;--texte:#efeee8;--doux:#b0afa6;--ligne:#38372f;--lien:#f1c34a;--bloquant:#ff8f86;--genant:#ffb457;--mineur:#b0afa6;--pbloq:#4a2320;--pgen:#4a3416;--pmin:#33322c}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--texte);font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}}
main{{max-width:980px;margin:0 auto;padding:16px}}
h1{{font-size:1.6rem;margin:.6em 0 .2em}} h2{{font-size:1.25rem;margin:1.8em 0 .6em;border-bottom:1px solid var(--ligne);padding-bottom:.3em}} h3{{font-size:1.05rem;margin:1.2em 0 .4em}}
a{{color:var(--lien)}} code{{background:var(--pmin);padding:.05em .3em;border-radius:4px;font-size:.88em;word-break:break-word}}
.sous{{color:var(--doux);margin:0 0 1em}}
.cartes{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0}}
.carte{{background:var(--carte);border:1px solid var(--ligne);border-radius:10px;padding:12px}}
.carte b{{display:block;font-size:1.8rem;line-height:1.1}} .carte span{{color:var(--doux);font-size:.9rem}}
.carte.bloquant b{{color:var(--bloquant)}} .carte.genant b{{color:var(--genant)}}
.cinq{{counter-reset:n;list-style:none;padding:0;margin:0}}
.cinq li{{counter-increment:n;background:var(--carte);border:1px solid var(--ligne);border-radius:10px;padding:12px 12px 12px 48px;margin:10px 0;position:relative}}
.cinq li::before{{content:counter(n);position:absolute;left:12px;top:10px;width:26px;height:26px;border-radius:50%;background:var(--lien);color:var(--bg);font-weight:700;text-align:center;line-height:26px}}
.pastille{{display:inline-block;font-size:.72rem;font-weight:700;border-radius:999px;padding:.1em .6em;white-space:nowrap}}
.pastille.bloquant{{background:var(--pbloq);color:var(--bloquant)}} .pastille.genant{{background:var(--pgen);color:var(--genant)}} .pastille.mineur{{background:var(--pmin);color:var(--mineur)}}
.filtres{{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}}
select,input{{font:inherit;padding:8px;border-radius:8px;border:1px solid var(--ligne);background:var(--carte);color:var(--texte);min-height:44px;max-width:100%}}
table{{width:100%;border-collapse:collapse;background:var(--carte);border:1px solid var(--ligne);border-radius:10px;overflow:hidden}}
th,td{{text-align:left;padding:8px 10px;border-bottom:1px solid var(--ligne);vertical-align:top;font-size:.93rem}} th{{background:var(--pmin)}}
tr.cache,details.cache,section.cache{{display:none}}
details.constat{{background:var(--carte);border:1px solid var(--ligne);border-radius:10px;margin:8px 0;padding:8px 12px}}
summary{{cursor:pointer;min-height:32px}} dl{{margin:.6em 0 .2em}} dt{{font-weight:700;margin-top:.7em;color:var(--doux);font-size:.85rem;text-transform:uppercase;letter-spacing:.03em}} dd{{margin:.1em 0 0;overflow-wrap:anywhere}}
.note{{color:var(--doux);font-size:.9rem}}
.bandeau{{background:var(--pgen);border-radius:10px;padding:10px 12px;margin:12px 0}}
#compteur{{color:var(--doux);margin:.3em 0}}
@media (max-width:640px){{
 table,thead,tbody,tr,td{{display:block}} thead{{display:none}}
 tr{{border-bottom:1px solid var(--ligne);padding:8px 10px}} td{{border:0;padding:2px 0;font-size:.95rem}} td::before{{content:attr(data-l) " : ";color:var(--doux);font-size:.8rem}}
}}
</style></head><body><main>
<h1>Audit fonctionnel de Chevalier IA OS</h1>
<p class="sous">Version de l’appli : 2.3.3 · audit du 8 octobre 2026 · branche <code>claude/fervent-mayer-gme1rw</code> · rien n’a été modifié dans l’appli, on ne fait que constater.</p>

<div class="cartes">
 <div class="carte"><b>{len(tous)}</b><span>constats au total</span></div>
 <div class="carte bloquant"><b>{cg['BLOQUANT']}</b><span>bloquants</span></div>
 <div class="carte genant"><b>{cg['GÊNANT']}</b><span>gênants</span></div>
 <div class="carte"><b>{cg['MINEUR']}</b><span>mineurs</span></div>
</div>
<p class="note">Sur {len(tous)} constats : {compte_c['CONFIRMÉ']} confirmés (reproduits par un test ou un essai), {compte_c['PLAUSIBLE']} plausibles (lus dans le code, à vérifier). Les chiffres sont comptés par un script à partir des fichiers de l’audit, pas estimés.</p>

<div class="bandeau"><b>Ce que cet audit n’a pas fait :</b> l’essai de l’appli comme un utilisateur (étape F) n’a pas été réalisé : aucun constat n’en est issu. Les étapes A, C, D, E, G et H sont marquées « partielles » : voir la fin de la page.</div>

<h2>Les 5 choses à savoir</h2>
<ol class="cinq">
<li><b>Supprimer une fiche peut effacer des notes et des activités qui ne lui appartiennent plus.</b> Si tu supprimes une ancienne organisation ou une ancienne personne, l’appli supprime aussi les notes et activités qui portent encore son nom, même quand elles appartiennent maintenant à une autre fiche vivante (<a href="#C-01">C-01</a>, <a href="#C-02">C-02</a>). Et une grosse suppression faite depuis l’écran peut s’arrêter à moitié alors que le Journal affiche « succès » (<a href="#D-03">D-03</a>).</li>
<li><b>La règle « une facture se paie en entier » n’est pas tenue partout.</b> On peut marquer payée une facture de 1 000 € avec 700 € et le reste disparaît (<a href="#A-05">A-05</a>, <a href="#B-04">B-04</a>) ; une facture « à payer » peut revenir sur un projet déjà terminé (<a href="#A-01">A-01</a>) ; l’outil MCP peut créer une affaire déjà « gagnée » sans projet d’extraction (<a href="#B-01">B-01</a>). La migration 2.2 a trois défauts à connaître avant de l’appliquer dans Réglages (<a href="#A-02">A-02</a>, <a href="#A-03">A-03</a>, <a href="#A-04">A-04</a>).</li>
<li><b>Certains chiffres de l’accueil peuvent être faux.</b> Une facture payée sans date de paiement disparaît du chiffre d’affaires (<a href="#E-01">E-01</a>) ; « Affaires par étape » oublie des affaires (<a href="#E-04">E-04</a>) ; le chiffre d’affaires peut être compté deux fois (<a href="#E-06">E-06</a>) ; une affaire gagnée sans activité reste indéfiniment dans « Sans action prévue » (<a href="#E-02">E-02</a>).</li>
<li><b>Le Journal et « Défaire » ont des trous.</b> Les réglages et les objectifs saisis n’y laissent aucune trace (<a href="#D-01">D-01</a>, <a href="#D-02">D-02</a>) ; défaire la création d’une affaire laisse les notes rattachées depuis (<a href="#D-04">D-04</a>) ; plusieurs textes parlent encore de « 90 jours » alors que rien ne s’efface plus (<a href="#D-15">D-15</a> à <a href="#D-17">D-17</a>).</li>
<li><b>Les tests passent presque tous, mais un test est en désaccord avec la règle, et la documentation a pris du retard.</b> Suite complète : 744 réussis, 2 échecs sur un même test (<a href="#G-01">G-01</a>), 2 sautés volontairement. Aucun test ne se lance avant le déploiement (<a href="#G-02">G-02</a>). Un prompt de reprise dit encore « rien n’est construit » pour l’écran Projets (<a href="#H-01">H-01</a>). Le « 44 outils » est exact pour Hermes : le serveur en expose 51 en tout (13 lecteur, 44 bibliothécaire, 51 Claude Code).</li>
</ol>

<h2>Tous les constats</h2>
<div class="filtres">
 <label>Module <select id="f-module">{options_modules}</select></label>
 <label>Gravité <select id="f-gravite"><option value="">Toutes</option><option>BLOQUANT</option><option>GÊNANT</option><option>MINEUR</option></select></label>
 <label>Confiance <select id="f-confiance"><option value="">Toutes</option><option value="CONFIRMÉ">Confirmé</option><option value="PLAUSIBLE">Plausible</option></select></label>
 <label>Mot <input id="f-mot" type="search" placeholder="ex. facture"></label>
</div>
<p id="compteur"></p>
<table id="tableau"><thead><tr><th>N°</th><th>Gravité</th><th>Titre</th><th>Module</th><th>Confiance</th></tr></thead><tbody>
{lignes_tab}</tbody></table>

<h2>Le détail, module par module</h2>
<p class="note">Touche un constat pour l’ouvrir. Le filtre « Module » du tableau s’applique aussi ici.</p>
{detail}

<h2>Priorités proposées</h2>
<p class="note">Reprises de l’étape H (<code>80-point-projet.md</code>). Elles sont des propositions : c’est toi qui décides.</p>
{prio_html}

<h2>Ce qui n’a pas été couvert</h2>
<ul>
<li><b>Étape F, essai de l’appli comme un utilisateur (ordinateur 1440 × 900 et téléphone 390 × 844) : non faite.</b> Vérifié seulement : les émulateurs Firebase et le navigateur de test démarrent dans cet environnement. Les parcours (créer une personne, une affaire, la gagner, projet, tâches, facture, encaissement, clôture, perdre une affaire, favoris) n’ont pas été rejoués à l’écran par cet audit ; les tests de parcours existants (204 réussis sur 206 exécutés, voir G) en couvrent une grande partie.</li>
<li><b>Étape G, partielle :</b> la liste complète des règles qu’aucun test ne couvre n’a pas été consolidée ; la couverture par module n’est pas vérifiée.</li>
<li>Les étapes A, C, D, E ont été faites par lecture du code et par des essais purs ; les constats qui dépendent de l’écran sont « plausibles » quand ils n’ont pas été rejoués dans un navigateur.</li>
<li>Non regardé : le serveur réellement déployé, les vraies données de Jérôme (la migration 2.2 est-elle déjà appliquée ? non vérifié), les consoles Google, Firebase et Backblaze, Hermes et le VPS, l’autre dépôt <code>_JEROME_OS_onGIT</code>, la sécurité.</li>
</ul>
<p class="note">Détails : <code>docs/audit-fonctionnel/00-avancement.md</code> et un fichier par étape dans le même dossier.</p>
</main>
<script>
(function(){{
 var m=document.getElementById('f-module'),g=document.getElementById('f-gravite'),c=document.getElementById('f-confiance'),w=document.getElementById('f-mot');
 var lignes=[].slice.call(document.querySelectorAll('#tableau tbody tr'));
 var details=[].slice.call(document.querySelectorAll('details.constat'));
 var sections=[].slice.call(document.querySelectorAll('section.module'));
 function maj(){{
  var n=0,mot=w.value.trim().toLowerCase();
  var visibles={{}};
  lignes.forEach(function(l){{
   var ok=(!m.value||l.dataset.module===m.value)&&(!g.value||l.dataset.gravite===g.value)&&(!c.value||l.dataset.confiance===c.value)&&(!mot||l.textContent.toLowerCase().indexOf(mot)>-1);
   l.classList.toggle('cache',!ok);
   if(ok){{n++;visibles[l.querySelector('a').textContent]=1;}}
  }});
  details.forEach(function(d){{d.classList.toggle('cache',!visibles[d.id]);}});
  sections.forEach(function(s){{s.classList.toggle('cache',!!m.value&&s.id!=='module-'+m.value);}});
  document.getElementById('compteur').textContent=n+' constat'+(n>1?'s':'')+' affiché'+(n>1?'s':'')+' sur {len(tous)}';
 }}
 [m,g,c].forEach(function(e){{e.addEventListener('change',maj);}});
 w.addEventListener('input',maj);
 window.addEventListener('hashchange',function(){{var d=document.getElementById(location.hash.slice(1));if(d&&d.tagName==='DETAILS'){{d.classList.remove('cache');d.open=true;}}}});
 maj();
}})();
</script></body></html>
'''
open(os.path.join(DOSSIER, '99-rapport.html'), 'w', encoding='utf-8').write(doc)
print('taille HTML (octets) :', len(doc.encode('utf-8')))
