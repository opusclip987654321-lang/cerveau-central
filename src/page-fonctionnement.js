// Page « Comment ça marche » d'un projet : le guide au format du PDF v4 de louis
// (journée type, circuits en schémas, règles, alertes et quoi faire, ton rôle).
import { gabarit } from './page.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TYPES = { auto: 'automatique', toi: 'toi', securite: 'contrôle de sécurité' };

// Demande de louis (08/10, croquis « Trouver et contacter ») : chaque étape est une
// case à gauche, reliée par un trait à une bulle à droite qui nomme l'outil qui la
// fait et à quoi il sert (repris de la liste « Outils et API » du guide).
function bulle(et, outils) {
  if (et.outil) {
    const o = outils.find((x) => x.nom === et.outil);
    return `<div class="bulle"><b>${e(et.outil)}</b>${o ? `<span>${e(o.role)}</span>` : ''}</div>`;
  }
  if ((et.type ?? 'auto') === 'toi') return '<div class="bulle toi"><b>Toi</b><span>Tu fais cette étape toi-même</span></div>';
  return '';
}

function circuit(c, i, outils) {
  const etapes = (c.etapes ?? [])
    .map((et) => {
      const b = bulle(et, outils);
      return `<div class="pas"><div class="etape ${e(et.type ?? 'auto')}">${e(et.texte)}${et.sinon ? `<span class="sinon">si non : ${e(et.sinon)}</span>` : ''}</div>${b ? `<div class="trait"></div>${b}` : ''}</div>`;
    })
    .join('<div class="pas fleche"><div>↓</div></div>');
  return `<section class="bloc circuit" id="circuit-${i + 1}">
<h3>${e(c.titre)} <small>circuit ${i + 1}</small></h3>
${c.note ? `<p class="note">${e(c.note)}</p>` : ''}
<div class="flux">${etapes}</div>
<p class="legende-circuit"><i class="auto"></i> automatique <i class="toi"></i> toi <i class="securite"></i> contrôle de sécurité <i class="ovale"></i> outil qui le fait</p>
</section>`;
}

const liste = (points) => `<ul>${(points ?? []).map((p) => `<li>${e(p)}</li>`).join('')}</ul>`;

export function pageFonctionnement(configJournal, id, guide, { aRepondre = 0 } = {}) {
  const projet = configJournal.projets.find((p) => p.id === id);
  if (!projet || !guide) return null;
  const g = guide;

  const journee = g.journee?.length
    ? `<section class="bloc"><h3>La journée type</h3><table>
<tr><th>Quand</th><th>Ce qui se passe</th><th>Tu dois faire quelque chose ?</th></tr>
${g.journee.map((l) => `<tr><td><b>${e(l.quand)}</b></td><td>${e(l.quoi)}</td><td>${e(l.toi)}</td></tr>`).join('')}
</table></section>`
    : '';

  const circuits = (g.circuits ?? []).map((c, i) => circuit(c, i, g.outils ?? [])).join('');

  const apprentissage = g.apprentissage
    ? `<section class="bloc"><h3>L'apprentissage</h3><div class="deux">
<div class="carte-mini appris"><h4>Ce qu'il apprend déjà</h4>${liste(g.apprentissage.appris)}</div>
<div class="carte-mini pas-branche"><h4>Pas encore branché</h4>${liste(g.apprentissage.manque)}</div>
</div></section>`
    : '';

  const regles = g.regles?.length
    ? `<section class="bloc"><h3>Les règles appliquées</h3><div class="deux">${g.regles
        .map((r) => `<div class="carte-mini regle"><h4>${e(r.titre)}</h4>${liste(r.points)}</div>`)
        .join('')}</div></section>`
    : '';

  // Demande de louis (06/10) : les logiciels et API que le projet utilise,
  // seulement ce qui est vérifié ; le reste va dans « Pour compléter ce guide ».
  const outils = g.outils?.length
    ? `<section class="bloc"><h3>Outils et API</h3><table>
<tr><th>Outil</th><th>À quoi il sert</th></tr>
${g.outils.map((o) => `<tr><td><b>${e(o.nom)}</b></td><td>${e(o.role)}</td></tr>`).join('')}
</table></section>`
    : '';

  const alertes = g.alertes?.length
    ? `<section class="bloc"><h3>Alertes et quoi faire</h3><table>
<tr><th>Message</th><th>Ce que ça veut dire</th><th>Quoi faire</th></tr>
${g.alertes
  .map(
    (a) =>
      `<tr><td><b>${e(a.message)}</b>${a.niveau ? ` <span class="niveau">${e(a.niveau)}</span>` : ''}</td><td>${e(a.sens)}</td><td>${e(a.faire)}</td></tr>`,
  )
  .join('')}
</table></section>`
    : '';

  const role = g.role
    ? `<section class="bloc"><h3>Ton rôle</h3><div class="deux">
${g.role.quotidien?.length ? `<div class="carte-mini toi-carte"><h4>Au quotidien</h4>${liste(g.role.quotidien)}</div>` : ''}
${g.role.parfois?.length ? `<div class="carte-mini toi-carte"><h4>De temps en temps</h4>${liste(g.role.parfois)}</div>` : ''}
${g.role.ameliorations?.length ? `<div class="carte-mini pas-branche"><h4>Prochaines améliorations</h4>${liste(g.role.ameliorations)}</div>` : ''}
</div></section>`
    : '';

  const vigilance = g.vigilance?.length
    ? `<section class="bloc"><h3>Dates et points de vigilance</h3><table>
${g.vigilance.map((v) => `<tr><td><b>${e(v.sujet)}</b></td><td>${e(v.detail)}</td></tr>`).join('')}
</table></section>`
    : '';

  const aCompleter = g.aCompleter?.length
    ? `<section class="bloc a-completer"><h3>⚠️ Pour compléter ce guide</h3>${liste(g.aCompleter)}</section>`
    : '';

  const contenu = `<p class="retour"><a href="/projet?projet=${e(id)}">‹ Retour à ${e(projet.nom)}</a></p>
<h2 class="titre-guide">Comment fonctionne <b>${e(projet.nom)}</b></h2>
${g.intro ? `<p class="intro">${e(g.intro)}</p>` : ''}
${aCompleter}
${journee}
${circuits}
${apprentissage}
${regles}
${outils}
${alertes}
${role}
${vigilance}
<p class="maj">${g.source ? `${e(g.source)} · ` : ''}Mis à jour le ${e(new Date(`${g.maj}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }))}.</p>
<style>
.retour { margin:0 0 10px; } .retour a { color:var(--doux); text-decoration:none; }
.titre-guide { margin:0 0 6px; font-size:22px; font-weight:400; } .titre-guide b { font-weight:700; }
.intro { margin:0 0 16px; color:var(--doux); max-width:640px; }
.bloc { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:12px 14px; margin-bottom:14px; overflow-x:auto; }
.bloc h3 { margin:0 0 10px; font-size:16px; } .bloc h3 small { color:var(--panne); font-weight:600; text-transform:uppercase; font-size:11px; letter-spacing:.5px; }
.bloc table { border-collapse:collapse; width:100%; font-size:14px; }
.bloc th { text-align:left; color:var(--doux); font-weight:500; padding:4px 10px 4px 0; border-bottom:1px solid var(--bord); font-size:12px; text-transform:uppercase; letter-spacing:.4px; }
.bloc td { padding:7px 10px 7px 0; border-bottom:1px solid var(--bord); vertical-align:top; }
.bloc tr:last-child td { border-bottom:0; }
.note { margin:0 0 10px; color:var(--doux); font-size:14px; }
.flux { max-width:820px; margin:0 auto; }
.pas { display:grid; grid-template-columns:minmax(0,11fr) 56px minmax(0,8fr); align-items:center; }
.etape { grid-column:1; border:1.5px solid var(--bord); border-radius:4px; padding:12px 14px; font-size:13px; text-align:center; min-height:44px; display:flex; flex-direction:column; justify-content:center; }
.etape.auto { background:color-mix(in srgb, var(--ok) 12%, var(--carte)); border-color:color-mix(in srgb, var(--ok) 40%, var(--bord)); }
.etape.toi { background:color-mix(in srgb, var(--attention) 14%, var(--carte)); border-color:color-mix(in srgb, var(--attention) 45%, var(--bord)); }
.etape.securite { background:color-mix(in srgb, var(--panne) 12%, var(--carte)); border-color:color-mix(in srgb, var(--panne) 40%, var(--bord)); }
.etape .sinon { display:block; margin-top:4px; font-size:12px; color:var(--panne); }
.trait { height:2px; background:var(--texte); opacity:.7; }
.bulle { border:1.5px solid var(--texte); border-radius:50%; min-height:110px; padding:16px 36px; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; font-size:12px; background:var(--carte2); }
.bulle b { font-size:13px; } .bulle span { color:var(--doux); margin-top:3px; }
.bulle.toi { border-color:var(--attention); }
.pas.fleche { min-height:30px; } .pas.fleche div { grid-column:1; text-align:center; color:var(--texte); font-size:20px; line-height:1; }
@media (max-width:620px) {
  .pas { grid-template-columns:1fr; }
  .trait { width:2px; height:12px; justify-self:center; }
  .bulle { border-radius:999px; min-height:0; padding:8px 18px; }
}
.legende-circuit { margin:10px 0 0; font-size:12px; color:var(--doux); display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:center; }
.legende-circuit i { width:10px; height:10px; border-radius:2px; display:inline-block; margin-right:4px; }
.legende-circuit .ovale { width:16px; border-radius:50%; border:1.5px solid var(--texte); box-sizing:border-box; }
.legende-circuit .auto { background:var(--ok); } .legende-circuit .toi { background:var(--attention); } .legende-circuit .securite { background:var(--panne); }
.deux { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:10px; }
.carte-mini { border:1px solid var(--bord); border-radius:10px; padding:10px 12px; border-top:3px solid var(--bord); }
.carte-mini h4 { margin:0 0 6px; font-size:12px; text-transform:uppercase; letter-spacing:.4px; color:var(--doux); }
.carte-mini ul { margin:0; padding-left:18px; font-size:14px; } .carte-mini li { margin:4px 0; }
.carte-mini.appris { border-top-color:var(--ok); } .carte-mini.pas-branche { border-top-color:var(--doux); }
.carte-mini.regle { border-top-color:var(--panne); } .carte-mini.toi-carte { border-top-color:var(--attention); }
.niveau { background:color-mix(in srgb, var(--attention) 25%, var(--carte)); border-radius:8px; padding:1px 7px; font-size:11px; }
.a-completer { border-color:var(--attention); } .a-completer ul { margin:0; padding-left:18px; font-size:14px; }
.maj { color:var(--doux); font-size:13px; }
</style>`;
  return gabarit({ onglet: 'journal', aRepondre, contenu });
}
