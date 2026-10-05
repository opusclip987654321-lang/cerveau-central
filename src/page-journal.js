// Page « Journal » : ce qui a été fait chaque jour, projet par projet.
import { gabarit } from './page.js';
import { journee, bilanSemaine } from './journal.js';
import { jourParis } from './questions.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NOMS_TYPES = { video: 'vidéo(s)', publication: 'publication(s)', mail: 'mail(s)', rdv: 'rendez-vous', client: 'client(s)', note: 'note(s)', autre: 'action(s)' };

function titreJour(jour, aujourdhui) {
  const hier = jourParis(new Date(new Date(`${aujourdhui}T12:00:00Z`) - 86_400_000));
  const date = new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  return jour === aujourdhui ? `Aujourd'hui · ${date}` : jour === hier ? `Hier · ${date}` : date.charAt(0).toUpperCase() + date.slice(1);
}

export function pageJournal(config, journal, { jour = jourParis(), jours = 7, projet = null, message, aRepondre = 0 } = {}) {
  const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  const bilan = bilanSemaine(journal, config, jour);
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

  const contenu = `${message ? `<p class="message">${e(message)}</p>` : ''}
${puces}
<h3 class="titre-semaine">7 derniers jours</h3>
${semaine ? `<div class="tuiles">${semaine}</div>` : '<p class="vide">Encore rien cette semaine. Le journal se remplira dès que n8n sera branché.</p>'}
<details class="ajout"><summary>+ Ajouter une note</summary>
<form method="post" action="/journal" class="formulaire">
<label>Projet<select name="projet">${options}</select></label>
<label>Type<select name="type">${types}</select></label>
<label class="large">Ce qui a été fait<input name="titre" required maxlength="200" placeholder="ex. Appel avec un restaurateur de Lyon, intéressé"></label>
<label class="large">Lien (facultatif)<input name="lien" type="url" placeholder="https://…"></label>
<button type="submit">Ajouter</button>
</form></details>
${blocsJours.join('\n')}
${jours < 30 ? `<p><a href="/journal?jours=30${projet ? `&projet=${e(projet)}` : ''}">Voir les 30 derniers jours</a></p>` : ''}
<style>
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
