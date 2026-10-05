// Page « Journal » : ce qui a été fait chaque jour, projet par projet.
import { gabarit } from './page.js';
import { journee, bilanSemaine } from './journal.js';
import { jourParis } from './questions.js';
import { tableauDeBord } from './business.js';
import { expliquerAncien, tacheEnClair } from './sens.js';
import { schemaParcours, etapeBloquee, PROJETS_TOUCHES, PARCOURS, CSS_PARCOURS } from './parcours.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NOMS_TYPES = { video: 'vidéo(s)', publication: 'publication(s)', mail: 'mail(s)', rdv: 'rendez-vous', client: 'client(s)', note: 'note(s)', autre: 'action(s)' };

function titreJour(jour, aujourdhui) {
  const hier = jourParis(new Date(new Date(`${aujourdhui}T12:00:00Z`) - 86_400_000));
  const date = new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  return jour === aujourdhui ? `Aujourd'hui · ${date}` : jour === hier ? `Hier · ${date}` : date.charAt(0).toUpperCase() + date.slice(1);
}

export const PASTILLES = { vert: '🟢', orange: '🟠', rouge: '🔴', pause: '⏸️', gris: '⚪' };
// Le statut en mots sur les cartes : pas de rouge pour une pause voulue, pas de vert par défaut.
const STATUTS = { vert: 'avance', orange: 'à surveiller', rouge: 'à débloquer', pause: 'en pause', gris: 'données manquantes' };
const jourCourt = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Paris' });

// Styles de la carte projet, partagés entre le tableau de bord et la page projet.
export const CSS_CARTE = `.bd { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:16px 18px; display:flex; flex-direction:column; gap:10px; min-width:0; }
.bd.gris { gap:8px; }
.tete { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; flex-wrap:wrap; }
.tete h3 { margin:0; font-size:16px; }
.tete h3 a { color:inherit; text-decoration:none; }
.tete h3 a:hover { text-decoration:underline; }
.statut { font-size:11px; font-weight:600; padding:3px 9px; border-radius:999px; white-space:nowrap; background:var(--carte2); color:var(--doux); border:1px solid var(--bord); }
.statut.vert { color:var(--ok); border-color:color-mix(in srgb, var(--ok) 45%, transparent); }
.statut.orange { color:var(--attention); border-color:color-mix(in srgb, var(--attention) 45%, transparent); }
.statut.rouge { color:var(--panne); border-color:color-mix(in srgb, var(--panne) 45%, transparent); }
.statut.pause, .statut.gris { background:var(--or-doux); color:var(--or); border-color:transparent; }
.principal { display:flex; flex-direction:column; }
.principal b { font-size:30px; line-height:1.1; letter-spacing:-.5px; }
.principal span { font-size:13px; color:var(--doux); }
.principal small { font-size:12px; color:var(--doux); }
.secondaires { display:flex; flex-wrap:wrap; gap:4px 18px; font-size:13px; color:var(--doux); }
.secondaires b { color:var(--texte); font-size:15px; }
.secondaires small { display:block; font-size:12px; }
.graphe { width:100%; height:auto; }
.graphe .b1 { fill:var(--or); opacity:.65; } .graphe .b2 { fill:var(--texte); opacity:.85; }
.graphe .axe { stroke:var(--bord); } .graphe text { font-size:9px; fill:var(--doux); }
.legende { margin:0; font-size:12px; color:var(--doux); display:flex; gap:6px; align-items:center; }
.legende i { width:10px; height:10px; border-radius:2px; display:inline-block; } .legende .l1 { background:var(--or); opacity:.65; } .legende .l2 { background:var(--texte); margin-left:8px; }
.decider { background:var(--or-doux); border-radius:8px; padding:8px 10px; font-size:14px; }
.decider ul { margin:4px 0 0; padding-left:18px; }
.obj { margin:0; font-size:13px; color:var(--doux); display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.obj input[type=number] { width:70px; font:inherit; padding:4px 6px; border-radius:6px; border:1px solid var(--bord); background:var(--fond); color:var(--texte); }
.obj button { padding:4px 10px; font-size:13px; }
.manque { margin:0; font-size:12px; color:var(--doux); font-style:italic; }
.pied { margin-top:auto; display:flex; justify-content:space-between; align-items:center; gap:8px; padding-top:10px; border-top:1px solid var(--bord); }
.pied a { font-size:13px; font-weight:600; text-decoration:none; color:var(--or); }
.pied a:hover { text-decoration:underline; }
.pied small { font-size:12px; color:var(--doux); }`;

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
  const statut = `<span class="statut ${c.couleur}">${STATUTS[c.couleur] ?? c.couleur}</span>`;
  const pied = `<footer class="pied"><a href="/projet?projet=${e(c.id)}">Ouvrir le projet ›</a><small>${jours} derniers jours</small></footer>`;
  // Projet pas encore branché et sans aucune note : une carte courte.
  if (c.couleur === 'gris')
    return `<article class="bd gris"><header class="tete"><h3><a href="/projet?projet=${e(c.id)}">${e(c.nom)}</a></h3>${statut}</header><p class="manque">Pas encore branché : ${e(c.manque.join(', '))}. En attendant, tu peux noter ce que tu fais avec « Ajouter une note ».</p>${pied}</article>`;
  const evolution = p.precedent || p.total ? (p.total >= p.precedent ? `▲ ${p.total - p.precedent}` : `▼ ${p.precedent - p.total}`) : '';
  const objectif = c.objectif.valide
    ? `<p class="obj">Objectif : ${c.objectif.valide} par semaine${p.objectif ? ` · ${Math.min(100, Math.round((p.total / p.objectif) * 100))} % atteint` : ''}</p>`
    : `<form method="post" action="/journal/objectif" class="obj"><input type="hidden" name="projet" value="${e(c.id)}"><span>Objectif proposé, par semaine :</span><input name="valeur" type="number" min="1" value="${c.objectif.propose}"><button type="submit">Valider</button></form>`;
  return `<article class="bd ${c.couleur}">
<header class="tete"><h3><a href="/projet?projet=${e(c.id)}">${e(c.nom)}</a></h3>${statut}</header>
<div class="principal"><b>${p.total}</b><span>${e(p.titre)}</span>${evolution ? `<small>${evolution} vs ${jours} j avant</small>` : ''}</div>
${c.chiffres.length ? `<div class="secondaires">${c.chiffres.map((x) => `<span><b>${x.valeur}</b> ${e(x.titre)}${x.detail ? `<small>${e(x.detail)}</small>` : ''}</span>`).join('')}</div>` : ''}
${p.total || c.secondaire?.serie.some(Boolean) ? graphique(c.periode, p.serie, c.secondaire) : ''}
${c.secondaire && (p.total || c.secondaire.serie.some(Boolean)) ? `<p class="legende"><i class="l1"></i>${e(p.titre)} <i class="l2"></i>${e(c.secondaire.titre)}</p>` : ''}
${c.aDecider.length ? `<div class="decider"><b>À décider</b><ul>${c.aDecider.map((t) => `<li>${e(t)}</li>`).join('')}</ul></div>` : ''}
${objectif}
${c.manque.length ? `<p class="manque">Pas encore branché : ${e(c.manque.join(', '))}</p>` : ''}
${pied}
</article>`;
}

export function pageJournal(config, journal, { jour = jourParis(), jours = 7, projet = null, vue = 'pilotage', message, aRepondre = 0, business = { sources: {}, objectifs: {} }, pauses, etat = null, actions = [] } = {}) {
  // Deux vues sur la même page : « pilotage » (les cartes) et « activite » (le jour par jour).
  const activite = vue === 'activite';
  const chemin = (prm = {}) => {
    const parts = activite ? ['vue=activite'] : [];
    for (const [k, v] of Object.entries(prm)) if (v) parts.push(`${k}=${encodeURIComponent(v)}`);
    return `/journal${parts.length ? `?${parts.join('&')}` : ''}`;
  };
  const tableau = activite ? null : tableauDeBord({ business, journal, configJournal: config, pauses, jour, jours });
  const cartes = activite
    ? []
    : tableau.cartes
        .filter((c) => !projet || c.id === projet)
        .sort((a, b) => (a.couleur === 'gris') - (b.couleur === 'gris')).map((c) => carteProjet({ ...c, periode: tableau.periode }, jours));
  const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  const bilan = bilanSemaine(journal, config, jour, jours);
  const nom = (id) => config.projets.find((p) => p.id === id)?.nom ?? id;

  const puces = `<nav class="puces"><a href="${chemin()}" class="${projet ? '' : 'actif'}">Tous</a>${config.projets
    .map((p) => `<a href="${chemin({ projet: p.id })}" class="${projet === p.id ? 'actif' : ''}">${e(p.nom)}</a>`)
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

  // En vue Activité, les jours sont « les problèmes d'abord » : incidents et
  // erreurs visibles, exécutions réussies repliées, jours vides sautés.
  const blocsJours = [];
  if (activite) {
    const incidentsParJour = {};
    for (const h of etat?.historique ?? []) {
      if (h.type === 'retabli') continue;
      (incidentsParJour[jourParis(new Date(h.date))] ??= []).push(h);
    }
    for (let i = 0; i < jours; i++) {
      const j = jourParis(new Date(new Date(`${jour}T12:00:00Z`) - i * 86_400_000));
      const incidents = (incidentsParJour[j] ?? []).filter((h) => !projet || (PROJETS_TOUCHES[h.projet] ?? [h.projet]).includes(projet));
      const lignesIncidents = incidents.map((h) => {
        const { pour, texte } = h.sens ? { pour: h.pour, texte: h.sens } : expliquerAncien(h);
        return `<div class="incident">⛔ <b>${e(pour)}</b> · ${e(texte)}<small>${e(h.verification)} : ${e(h.detail)}</small></div>`;
      });
      const sections = journee(journal, config, j, projet)
        .map((x) => {
          const erreursAuto = x.automatisations.filter((a) => a.erreur);
          const okAuto = x.automatisations.filter((a) => !a.erreur);
          const lignesErr = erreursAuto.map((a) => {
            const t = tacheEnClair(a.nom);
            return `<li class="auto"><span class="type">⚠️</span><span>${e(a.nom)} : <span class="erreur">${a.erreur} exécution(s) en erreur</span>${a.ok ? ` (${a.ok} réussie(s))` : ''}${t ? `<small>Si ça se répète : ${e(t.consequence)}.</small>` : ''}</span></li>`;
          });
          const lignesEv = x.evenements.map(
            (ev) =>
              `<li><span class="type">${config.types[ev.type] ?? '•'}</span><span><time>${heure(ev.date)}</time> ${ev.lien ? `<a href="${e(ev.lien)}" target="_blank" rel="noopener">${e(ev.titre)}</a>` : e(ev.titre)}${ev.details ? `<small>${e(ev.details)}</small>` : ''}</span></li>`,
          );
          const okRepli = okAuto.length
            ? `<li class="auto"><details class="autos"><summary>⚙️ ${okAuto.length} automatisation(s) ont tourné sans erreur</summary><ul>${okAuto.map((a) => `<li>${e(a.nom)} : ${a.ok} réussie(s)</li>`).join('')}</ul></details></li>`
            : '';
          if (!lignesErr.length && !lignesEv.length && !okRepli) return '';
          return `<div class="projet"><h4>${e(x.projet.nom)}</h4><ul>${lignesErr.join('')}${lignesEv.join('')}${okRepli}</ul></div>`;
        })
        .filter(Boolean);
      if (!lignesIncidents.length && !sections.length) continue;
      blocsJours.push(`<section class="jour"><h3>${titreJour(j, jour)}</h3>${lignesIncidents.join('')}${sections.join('')}</section>`);
    }
  }

  // « Où ça bloque en ce moment » : les pannes en cours, avec le parcours du
  // projet et l'étape en erreur quand on la reconnaît vraiment.
  const pannesVives = Object.entries(etat?.verifications ?? {}).filter(([, v]) => v.etat === 'panne');
  const blocages = pannesVives
    .map(([k, v]) => {
      const texteIncident = `${v.nom} ${v.detail} ${v.sens ?? ''}`;
      const candidats = (PROJETS_TOUCHES[v.projet] ?? [v.projet]).filter((p) => PARCOURS[p] && (!projet || p === projet));
      if (projet && !candidats.length) return '';
      // Le schéma du parcours ne s'affiche que si l'étape bloquée est vraiment reconnue : pas de supposition.
      const trouve = candidats.map((p) => [p, etapeBloquee(p, texteIncident)]).find(([, idx]) => idx !== null);
      const fiche = actions.find((a) => a.cle === `panne:${k}` && a.statut !== 'resolu');
      return `<div class="blocage"><p class="sens-blocage">⛔ ${e(v.sens ?? v.detail)} <a href="${fiche ? `/action?id=${e(fiche.id)}` : '/actions'}">Ouvrir la fiche ›</a></p>${trouve ? schemaParcours(trouve[0], { nom: nom(trouve[0]), etape: trouve[1] }) : ''}</div>`;
    })
    .filter(Boolean);
  const blocBlocage = `<section class="moment"><h3>Où ça bloque en ce moment</h3>${blocages.length ? blocages.join('') : '<p class="ok-blocage">🟢 Rien ne bloque en ce moment. Le détail des contrôles au vert reste sur la page Surveillance.</p>'}</section>`;

  const options = config.projets.map((p) => `<option value="${e(p.id)}"${p.id === projet ? ' selected' : ''}>${e(p.nom)}</option>`).join('');
  const types = Object.keys(config.types).map((t) => `<option value="${t}"${t === 'note' ? ' selected' : ''}>${config.types[t]} ${NOMS_TYPES[t]}</option>`).join('');

  const lienPeriode = (n) => `<a href="${chemin({ jours: n, projet })}" class="${jours === n ? 'actif' : ''}">${n} jours</a>`;
  const entete = (titre, periodes = [7, 30]) => `<div class="entete-bd"><h3>${titre}</h3><nav class="puces periode">${periodes.map(lienPeriode).join('')}</nav></div>`;
  const ajout = `<details class="ajout"><summary>+ Ajouter une note</summary>
<p class="aide-note">Facultatif, rien à remplir chaque jour : note ici ce que le cerveau ne voit pas tout seul (un appel, un accord, une dépense), il s’en sert dans ses bilans. Exemple : « Appel avec un restaurateur de Lyon, intéressé ».</p>
<form method="post" action="/journal" class="formulaire">
${activite ? '<input type="hidden" name="vue" value="activite">' : ''}
<label>Projet<select name="projet">${options}</select></label>
<label>Type<select name="type">${types}</select></label>
<label class="large">Ce qui a été fait<input name="titre" required maxlength="200" placeholder="ex. Appel avec un restaurateur de Lyon, intéressé"></label>
<label class="large">Lien (facultatif)<input name="lien" type="url" placeholder="https://…"></label>
<button type="submit">Ajouter</button>
</form></details>`;
  const corps = activite
    ? `${entete('Ce qui s’est passé, jour par jour', [7, 30, 365])}
${blocBlocage}
${ajout}
${semaine ? `<div class="tuiles">${semaine}</div>` : ''}
${blocsJours.length ? blocsJours.join('\n') : '<p class="vide">Rien sur la période : pas d’incident, pas d’événement noté.</p>'}`
    : `${entete('Tableau de bord')}
<div class="bds">${cartes.join('')}</div>
${tableau.maj ? `<p class="maj">Prospection Nūr Meet relue à ${new Date(tableau.maj).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}.</p>` : ''}
${ajout}
<p class="voir-activite"><a href="/journal?vue=activite${projet ? `&projet=${encodeURIComponent(projet)}` : ''}">Voir l’activité jour par jour ›</a></p>`;
  const contenu = `${message ? `<p class="message">${e(message)}</p>` : ''}
${puces}
${corps}
<style>
.entete-bd { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; margin:4px 0 10px; }
.entete-bd h3 { margin:0; }
.periode { margin:0; }
.bds { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px; }
@media (max-width:900px) { .bds { grid-template-columns:1fr; } }
${CSS_CARTE}
.maj { font-size:12px; color:var(--doux); margin:6px 0 0; }
.voir-activite { margin:14px 0 0; font-size:14px; }
.puces { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px; }
.puces a { text-decoration:none; color:var(--texte); font-size:14px; padding:5px 11px; border-radius:16px; border:1px solid var(--bord); background:var(--carte); }
.puces a.actif { background:var(--texte); color:var(--fond); border-color:var(--texte); }
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
.moment { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:12px 16px; margin-bottom:14px; }
.moment h3 { margin:0 0 8px; font-size:15px; }
.ok-blocage { margin:0; color:var(--doux); }
.blocage { padding:8px 0; border-top:1px solid var(--bord); }
.blocage:first-of-type { border-top:0; }
.sens-blocage { margin:0; font-size:14px; }
.sens-blocage a { font-size:13px; font-weight:600; text-decoration:none; margin-left:6px; }
.incident { background:color-mix(in srgb, var(--panne) 8%, var(--carte)); border:1px solid color-mix(in srgb, var(--panne) 35%, transparent); border-radius:12px; padding:10px 14px; margin-bottom:8px; font-size:14px; }
.incident small { display:block; color:var(--doux); font-size:12px; margin-top:2px; }
.autos summary { cursor:pointer; color:var(--doux); }
.autos ul { list-style:none; margin:4px 0 0; padding-left:18px; }
.autos li { border:0; padding:2px 0; font-size:13px; color:var(--doux); display:block; }
.aide-note { color:var(--doux); font-size:13px; margin:4px 0 8px; max-width:75ch; }
${CSS_PARCOURS}
.ajout summary { cursor:pointer; font-weight:600; margin:6px 0; }
.formulaire { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:10px; align-items:end; margin:8px 0; }
.formulaire label { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--doux); }
.formulaire .large { grid-column:1 / -1; }
.formulaire input, .formulaire select { font:inherit; padding:7px 9px; border-radius:8px; border:1px solid var(--bord); background:var(--fond); color:var(--texte); }
.message { background:var(--carte); border:1px solid var(--bord); border-left:4px solid var(--ok); border-radius:8px; padding:10px 12px; }
</style>`;
  return gabarit({ onglet: activite ? 'activite' : 'journal', aRepondre, contenu });
}
