// Page « Journal » : ce qui a été fait chaque jour, projet par projet.
import { gabarit } from './page.js';
import { journee, bilanSemaine } from './journal.js';
import { jourParis } from './questions.js';
import { tableauDeBord } from './business.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NOMS_TYPES = { video: 'vidéo(s)', publication: 'publication(s)', mail: 'mail(s)', rdv: 'rendez-vous', client: 'client(s)', note: 'note(s)', autre: 'action(s)' };

function titreJour(jour, aujourdhui) {
  const hier = jourParis(new Date(new Date(`${aujourdhui}T12:00:00Z`) - 86_400_000));
  const date = new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  return jour === aujourdhui ? `Aujourd'hui · ${date}` : jour === hier ? `Hier · ${date}` : date.charAt(0).toUpperCase() + date.slice(1);
}

export const PASTILLES = { vert: '🟢', orange: '🟠', rouge: '🔴', pause: '⏸️', gris: '⚪' };
const jourCourt = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Paris' });

// Petit graphique en barres (SVG) : série principale, et une seconde série en surimpression.
function graphique(periode, serie, secondaire) {
  const max = Math.max(1, ...serie, ...(secondaire?.serie ?? []));
  const l = 300 / periode.length;
  const barres = periode
    .map((j, i) => {
      const h = Math.round((serie[i] / max) * 70);
      const h2 = secondaire ? Math.round((secondaire.serie[i] / max) * 70) : 0;
      return `<g><title>${jourCourt(j)} : ${serie[i]}${secondaire ? ` · ${secondaire.titre.toLowerCase()} : ${secondaire.serie[i]}` : ''}</title><rect x="${(i * l + l * 0.15).toFixed(1)}" y="${78 - h}" width="${(l * 0.7).toFixed(1)}" height="${h}" rx="2" class="b1"/>${h2 ? `<rect x="${(i * l + l * 0.3).toFixed(1)}" y="${78 - h2}" width="${(l * 0.4).toFixed(1)}" height="${h2}" rx="2" class="b2"/>` : ''}</g>`;
    })
    .join('');
  return `<svg viewBox="0 0 300 92" class="graphe" role="img" aria-label="Évolution par jour">${barres}<line x1="0" y1="78.5" x2="300" y2="78.5" class="axe"/><text x="0" y="90">${jourCourt(periode[0])}</text><text x="300" y="90" text-anchor="end">${jourCourt(periode.at(-1))}</text></svg>`;
}

export function carteProjet(c, jours) {
  const p = c.principal;
  // Projet pas encore branché et sans aucune note : une carte courte.
  if (c.couleur === 'gris')
    return `<article class="bd gris"><h3>${PASTILLES.gris} <a href="/projet?projet=${e(c.id)}">${e(c.nom)}</a></h3><p class="manque">Pas encore branché : ${e(c.manque.join(', '))}. En attendant, tu peux noter ce que tu fais avec « Ajouter une note ».</p></article>`;
  const evolution = p.precedent || p.total ? (p.total >= p.precedent ? `▲ ${p.total - p.precedent}` : `▼ ${p.precedent - p.total}`) : '';
  const objectif = c.objectif.valide
    ? `<p class="obj">Objectif : ${c.objectif.valide} par semaine${p.objectif ? ` · ${Math.min(100, Math.round((p.total / p.objectif) * 100))} % atteint` : ''}</p>`
    : `<form method="post" action="/journal/objectif" class="obj"><input type="hidden" name="projet" value="${e(c.id)}"><span>Objectif proposé, par semaine :</span><input name="valeur" type="number" min="1" value="${c.objectif.propose}"><button type="submit">Valider</button></form>`;
  return `<article class="bd ${c.couleur}">
<h3>${PASTILLES[c.couleur]} <a href="/projet?projet=${e(c.id)}">${e(c.nom)}</a> <span class="fleche">›</span></h3>
<div class="chiffres">
<div class="principal"><b>${p.total}</b><span>${e(p.titre)} · ${jours} j</span>${evolution ? `<small>${evolution} vs ${jours} j avant</small>` : ''}</div>
${c.chiffres.map((x) => `<div><b>${x.valeur}</b><span>${e(x.titre)}</span>${x.detail ? `<small>${e(x.detail)}</small>` : ''}</div>`).join('')}
</div>
${p.total || c.secondaire?.serie.some(Boolean) ? graphique(c.periode, p.serie, c.secondaire) : ''}
${c.secondaire && (p.total || c.secondaire.serie.some(Boolean)) ? `<p class="legende"><i class="l1"></i>${e(p.titre)} <i class="l2"></i>${e(c.secondaire.titre)}</p>` : ''}
${c.aDecider.length ? `<div class="decider"><b>À décider</b><ul>${c.aDecider.map((t) => `<li>${e(t)}</li>`).join('')}</ul></div>` : ''}
${objectif}
${c.manque.length ? `<p class="manque">Pas encore branché : ${e(c.manque.join(', '))}</p>` : ''}
</article>`;
}

export function pageJournal(config, journal, { jour = jourParis(), jours = 7, projet = null, message, aRepondre = 0, business = { sources: {}, objectifs: {} }, pauses } = {}) {
  const tableau = tableauDeBord({ business, journal, configJournal: config, pauses, jour, jours });
  const cartes = tableau.cartes
    .filter((c) => !projet || c.id === projet)
    .sort((a, b) => (a.couleur === 'gris') - (b.couleur === 'gris')).map((c) => carteProjet({ ...c, periode: tableau.periode }, jours));
  const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  const bilan = bilanSemaine(journal, config, jour, jours);
  const nom = (id) => config.projets.find((p) => p.id === id)?.nom ?? id;

  const puces = `<nav class="puces"><a href="/journal" class="${projet ? '' : 'actif'}">Tous</a>${config.projets
    .map((p) => `<a href="/journal?projet=${e(p.id)}" class="${projet === p.id ? 'actif' : ''}">${e(p.nom)}</a>`)
    .join('')}</nav>`;

  const semaine = Object.entries(bilan)
    .filter(([id]) => !projet || id === projet)
    .sort(([a], [b]) => config.projets.findIndex((p) => p.id === a) - config.projets.findIndex((p) => p.id === b))
    .map(([id, t]) => {
      const parts = Object.entries(t.types).map(([type, n]) => `${config.types[type] ?? '•'} ${n} ${NOMS_TYPES[type] ?? type}`);
      if (t.executions || t.erreurs) parts.push(`⚙️ ${t.executions} exécution(s)${t.erreurs ? ` · <span class="erreur">${t.erreurs} en erreur</span>` : ''}`);
      return `<div class="tuile"><b>${e(nom(id))}</b><span>${parts.join('<br>')}</span></div>`;
    })
    .join('');

  const blocsJours = [];
  for (let i = 0; i < jours; i++) {
    const j = jourParis(new Date(new Date(`${jour}T12:00:00Z`) - i * 86_400_000));
    const contenu = journee(journal, config, j, projet);
    const corps = contenu.length
      ? contenu
          .map(
            (x) => `<div class="projet"><h4>${e(x.projet.nom)}</h4><ul>
${x.evenements
  .map(
    (ev) =>
      `<li><span class="type">${config.types[ev.type] ?? '•'}</span><span><time>${heure(ev.date)}</time> ${ev.lien ? `<a href="${e(ev.lien)}" target="_blank" rel="noopener">${e(ev.titre)}</a>` : e(ev.titre)}${ev.details ? `<small>${e(ev.details)}</small>` : ''}</span></li>`,
  )
  .join('')}
${x.automatisations
  .map((a) => `<li class="auto"><span class="type">⚙️</span><span>${e(a.nom)} : ${a.ok} réussie(s)${a.erreur ? ` · <span class="erreur">${a.erreur} en erreur</span>` : ''}</span></li>`)
  .join('')}
</ul></div>`,
          )
          .join('')
      : '<p class="vide">Rien d’enregistré ce jour-là.</p>';
    blocsJours.push(`<section class="jour"><h3>${titreJour(j, jour)}</h3>${corps}</section>`);
  }

  const options = config.projets.map((p) => `<option value="${e(p.id)}"${p.id === projet ? ' selected' : ''}>${e(p.nom)}</option>`).join('');
  const types = Object.keys(config.types).map((t) => `<option value="${t}"${t === 'note' ? ' selected' : ''}>${config.types[t]} ${NOMS_TYPES[t]}</option>`).join('');

  const lienPeriode = (n) => `<a href="/journal?jours=${n}${projet ? `&projet=${e(projet)}` : ''}" class="${jours === n ? 'actif' : ''}">${n} jours</a>`;
  const contenu = `${message ? `<p class="message">${e(message)}</p>` : ''}
${puces}
<div class="entete-bd"><h3>Tableau de bord</h3><nav class="puces periode">${lienPeriode(7)}${lienPeriode(30)}</nav></div>
<div class="bds">${cartes.join('')}</div>
${tableau.maj ? `<p class="maj">Prospection Nūr Meet relue à ${new Date(tableau.maj).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}.</p>` : ''}
<details class="ajout"><summary>+ Ajouter une note</summary>
<form method="post" action="/journal" class="formulaire">
<label>Projet<select name="projet">${options}</select></label>
<label>Type<select name="type">${types}</select></label>
<label class="large">Ce qui a été fait<input name="titre" required maxlength="200" placeholder="ex. Appel avec un restaurateur de Lyon, intéressé"></label>
<label class="large">Lien (facultatif)<input name="lien" type="url" placeholder="https://…"></label>
<button type="submit">Ajouter</button>
</form></details>
<details class="technique"><summary>Détail technique, jour par jour (automatisations)</summary>
<h3 class="titre-semaine">${jours} derniers jours</h3>
${semaine ? `<div class="tuiles">${semaine}</div>` : '<p class="vide">Rien sur la période.</p>'}
${blocsJours.join('\n')}
</details>
<style>
.entete-bd { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; margin:4px 0 10px; }
.entete-bd h3 { margin:0; }
.periode { margin:0; }
.bd.gris { gap:4px; }
.bds { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:12px; }
.bd { background:var(--carte); border:1px solid var(--bord); border-top:4px solid var(--bord); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:8px; min-width:0; }
.bd.vert { border-top-color:var(--ok); } .bd.orange { border-top-color:var(--attention); } .bd.rouge { border-top-color:var(--panne); }
.bd h3 { margin:0; font-size:16px; }
.bd h3 a { color:inherit; text-decoration:none; }
.bd h3 a:hover { text-decoration:underline; }
.bd h3 .fleche { color:var(--doux); font-weight:400; }
.chiffres { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px; }
.chiffres div { display:flex; flex-direction:column; }
.chiffres b { font-size:22px; line-height:1.1; }
.chiffres .principal b { font-size:28px; }
.chiffres span { font-size:13px; color:var(--doux); }
.chiffres small { font-size:12px; color:var(--doux); }
.graphe { width:100%; height:auto; }
.graphe .b1 { fill:var(--ok); opacity:.55; } .graphe .b2 { fill:var(--texte); opacity:.85; }
.graphe .axe { stroke:var(--bord); } .graphe text { font-size:9px; fill:var(--doux); }
.legende { margin:0; font-size:12px; color:var(--doux); display:flex; gap:6px; align-items:center; }
.legende i { width:10px; height:10px; border-radius:2px; display:inline-block; } .legende .l1 { background:var(--ok); opacity:.55; } .legende .l2 { background:var(--texte); margin-left:8px; }
.decider { background:var(--fond); border-radius:8px; padding:8px 10px; font-size:14px; }
.decider ul { margin:4px 0 0; padding-left:18px; }
.obj { margin:0; font-size:13px; color:var(--doux); display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.obj input[type=number] { width:70px; font:inherit; padding:4px 6px; border-radius:6px; border:1px solid var(--bord); background:var(--fond); color:var(--texte); }
.obj button { padding:4px 10px; font-size:13px; }
.manque { margin:0; font-size:12px; color:var(--doux); font-style:italic; }
.maj { font-size:12px; color:var(--doux); margin:6px 0 0; }
.technique { margin-top:18px; }
.technique > summary { cursor:pointer; font-weight:600; padding:8px 0; color:var(--doux); }
.puces { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px; }
.puces a { text-decoration:none; color:var(--texte); font-size:14px; padding:5px 11px; border-radius:16px; border:1px solid var(--bord); background:var(--carte); }
.puces a.actif { background:var(--texte); color:var(--fond); border-color:var(--texte); }
.titre-semaine { margin:0 0 10px; }
.tuiles { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px; margin-bottom:12px; }
.tuile { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:10px 14px; display:flex; flex-direction:column; gap:4px; font-size:14px; }
.tuile span { color:var(--doux); }
.jour { margin-top:22px; }
.jour h3 { font-size:15px; margin:0 0 8px; }
.projet { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:10px 14px; margin-bottom:8px; }
.projet h4 { margin:0 0 4px; font-size:14px; }
.projet ul { list-style:none; margin:0; padding:0; }
.projet li { display:flex; gap:8px; padding:5px 0; border-top:1px solid var(--bord); font-size:14px; }
.projet li:first-child { border-top:0; }
.projet li small { display:block; color:var(--doux); }
.projet li.auto { color:var(--doux); }
.type { width:20px; flex:none; text-align:center; }
.projet a { color:var(--texte); }
.erreur { color:var(--panne); }
.vide { color:var(--doux); font-size:14px; }
.ajout summary { cursor:pointer; font-weight:600; margin:6px 0; }
.formulaire { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:10px; align-items:end; margin:8px 0; }
.formulaire label { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--doux); }
.formulaire .large { grid-column:1 / -1; }
.formulaire input, .formulaire select { font:inherit; padding:7px 9px; border-radius:8px; border:1px solid var(--bord); background:var(--fond); color:var(--texte); }
.message { background:var(--carte); border:1px solid var(--bord); border-left:4px solid var(--ok); border-radius:8px; padding:10px 12px; }
</style>`;
  return gabarit({ onglet: 'journal', aRepondre, contenu });
}
