// Page d'état : une page simple qui montre si tout tourne.

import { expliquerAncien } from './sens.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PASTILLE = { ok: '🟢', attention: '🟠', panne: '🔴', ignore: '⚪' };
const LIBELLE = { ok: 'OK', attention: 'À surveiller', panne: 'En panne', ignore: 'Pas encore branché' };
const heure = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '—');

// Un bouton Pause / Reprendre par projet business (voir src/pauses.js).
function blocProjets(projets, pauses, horsN8n) {
  if (!projets?.length) return '';
  const lignes = projets
    .map((p) => {
      const pause = pauses?.projets?.[p.id];
      const action = pause ? 'reprendre' : 'pause';
      const detail = pause
        ? `en pause depuis le ${heure(pause.depuis)}${pause.workflows.length ? ` · ${pause.workflows.length} automatisation(s) n8n arrêtée(s)` : ''} · alertes coupées`
        : 'actif';
      const note = horsN8n[p.id] ? `<small>${e(horsN8n[p.id])}</small>` : '';
      const confirmer = pause ? 'Relancer ce projet ?' : 'Mettre ce projet en pause ? Ses automatisations n8n seront arrêtées et ses alertes coupées.';
      return `<li class="${pause ? 'pause' : ''}"><div><b>${pause ? '⏸️' : '▶️'} ${e(p.nom)}</b><span class="detail">${detail}</span>${note}</div>
<form method="post" action="/projets/${action}" onsubmit="return confirm('${confirmer.replace(/'/g, '’')}')"><input type="hidden" name="projet" value="${e(p.id)}"><button>${pause ? 'Reprendre' : 'Pause'}</button></form></li>`;
    })
    .join('');
  return `<h3>Tes projets</h3><ul class="projets">${lignes}</ul>`;
}

export function pageEtat(config, etat, aRepondre = 0, { projets = [], pauses = null, horsN8n = {}, message } = {}) {
  const toutes = Object.values(etat.verifications);
  const pannes = toutes.filter((v) => v.etat === 'panne').length;
  const attentions = toutes.filter((v) => v.etat === 'attention').length;
  const resume = !etat.derniereVerification
    ? 'Première vérification en cours…'
    : pannes
      ? `${pannes} panne(s) en cours`
      : attentions
        ? `Tout tourne, ${attentions} point(s) à surveiller`
        : 'Tout tourne';
  const ton = pannes ? 'panne' : attentions ? 'attention' : 'ok';

  const cartes = config.projets
    .map((p) => {
      const lignes = toutes.filter((v) => v.projet === p.id);
      const pire = lignes.some((v) => v.etat === 'panne') ? 'panne' : lignes.some((v) => v.etat === 'attention') ? 'attention' : 'ok';
      return `<section class="carte ${pire}">
  <h2>${PASTILLE[pire]} ${e(p.nom)}</h2>
  <ul>${lignes
    .map(
      (v) => `<li class="${v.etat}"><span class="nom">${PASTILLE[v.etat]} ${e(v.nom)}</span>${v.sens ? `<span class="sens">${e(v.sens)}</span>` : ''}<span class="detail">${e(v.detail)}</span>${
        v.etat === 'panne' || v.etat === 'attention' ? `<span class="depuis">depuis ${heure(v.depuis)}</span>` : ''
      }</li>`,
    )
    .join('')}</ul>
</section>`;
    })
    .join('\n');

  // Les retours à la normale (vert) ne sont pas des incidents : on ne liste que les problèmes.
  const historique = etat.historique.filter((h) => h.type !== 'retabli').slice(0, 30);
  const journal = historique.length
    ? `<ul class="journal">${historique
        .map((h) => {
          const { pour, texte } = h.sens ? { pour: h.pour, texte: h.sens } : expliquerAncien(h);
          return `<li><time>${heure(h.date)}</time> ${PASTILLE[h.type === 'retabli' ? 'ok' : h.type === 'evenement' ? 'attention' : h.type]} <b>${e(pour)}</b> · ${e(texte)}<small class="technique">${e(h.verification)} : ${e(h.detail)}</small></li>`;
        })
        .join('')}</ul>`
    : '<p class="vide">Aucun incident enregistré pour l’instant.</p>';

  const contenu = `${message ? `<p class="message">${e(message)}</p>` : ''}<div class="actions"><button id="verifier">Vérifier maintenant</button></div>
<div class="resume" style="border-left-color:var(--${ton})">${PASTILLE[ton]} ${e(resume)}<small>Dernière vérification : ${heure(etat.derniereVerification)} · prochaine dans ${frequence(config.intervalleMinutes ?? 180)} au plus</small></div>
<div class="grille">
${cartes}
</div>
${blocProjets(projets, pauses, horsN8n)}
<h3>Derniers incidents</h3>
${journal}
<script>
document.getElementById('verifier').onclick = async (ev) => {
  ev.target.disabled = true; ev.target.textContent = 'Vérification…';
  try { await fetch('/api/verifier', { method: 'POST' }); } finally { location.reload(); }
};
</script>`;
  return gabarit({ onglet: 'etat', aRepondre, contenu });
}

const frequence = (min) => (min % 60 === 0 ? `${min / 60} h` : `${min} min`);

export function gabarit({ onglet, aRepondre = 0, contenu }) {
  const badge = aRepondre ? ` <span class="badge">${aRepondre}</span>` : '';
  const TITRES = { etat: 'Surveillance', journal: 'Pilotage', actions: 'Actions', activite: 'Activité', analyses: 'Analyses', questions: 'Questions du jour', argent: 'Argent', serveurs: 'Serveurs', discuter: 'Discuter' };
  const lien = (id, href, symbole, texte) => `<a href="${href}" class="${onglet === id ? 'actif' : ''}" data-s="${symbole}">${texte}</a>`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${onglet === 'etat' ? '<meta http-equiv="refresh" content="300">' : ''}
<title>Cerveau central</title>
<style>
/* Palette « pilotage premium » (maquette validée par louis le 05/10/2026) :
   les anciens noms de variables sont gardés pour que toutes les pages suivent. */
:root { color-scheme:light dark;
  --fond:light-dark(#f5f3ee,#121214); --carte:light-dark(#ffffff,#1b1b1e); --carte2:light-dark(#faf8f3,#232326);
  --texte:light-dark(#202025,#f2f0ea); --doux:light-dark(#66636b,#b2afb5); --bord:light-dark(#e3dfd5,#343337);
  --or:light-dark(#80601d,#dfbd75); --or-doux:light-dark(#f5ecd6,#342d21);
  --bouton:light-dark(#25232a,#ead1a0); --sur-bouton:light-dark(#ffffff,#242019);
  --ok:light-dark(#256348,#7fc29b); --attention:light-dark(#8b551d,#ebbf82); --panne:light-dark(#993b37,#eba8a2);
}
* { box-sizing:border-box; }
body { margin:0; background:var(--fond); color:var(--texte); font:14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
a { color:var(--or); text-underline-offset:3px; }
button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible { outline:3px solid var(--or); outline-offset:3px; }
.coquille { display:grid; grid-template-columns:214px minmax(0,1fr); max-width:1540px; margin:auto; min-height:100vh; }
.menu { border-right:1px solid var(--bord); padding:22px 14px; background:var(--carte); display:flex; flex-direction:column; gap:22px; }
.logo { display:flex; align-items:center; gap:10px; color:var(--texte); text-decoration:none; padding:0 8px; }
.logo .mono { border:1px solid var(--or); width:34px; height:34px; display:grid; place-items:center; border-radius:10px; font-size:18px; flex-shrink:0; }
.logo .marque { font-size:15px; font-weight:650; letter-spacing:-.3px; }
.logo .marque small { display:block; font-size:10px; font-weight:400; letter-spacing:.05em; color:var(--doux); }
.menu nav { display:flex; flex-direction:column; gap:4px; }
.menu nav a { display:flex; align-items:center; gap:10px; padding:9px 11px; border-radius:8px; color:var(--doux); text-decoration:none; font-size:13px; }
.menu nav a::before { content:attr(data-s); width:18px; text-align:center; font-size:14px; }
.menu nav a:hover { background:var(--carte2); color:var(--texte); }
.menu nav a.actif { background:var(--or-doux); color:var(--or); font-weight:650; }
.menu-pied { margin-top:auto; padding:16px 8px 0; border-top:1px solid var(--bord); font-size:12px; }
.menu-pied a { color:var(--doux); text-decoration:none; }
main { min-width:0; padding:0 30px 44px; max-width:1280px; }
.titre { padding:20px 0 0; }
.titre h1 { font-size:26px; letter-spacing:-.6px; margin:0 0 18px; }
h1 { font-size:22px; margin:0; }
.resume { font-size:17px; font-weight:600; padding:14px 16px; border-radius:12px; background:var(--carte); border:1px solid var(--bord); border-left:5px solid var(--ok); margin-bottom:20px; }
.resume small { display:block; font-weight:400; color:var(--doux); font-size:13px; margin-top:2px; }
button { font:inherit; padding:8px 14px; border-radius:8px; border:1px solid var(--bord); background:var(--carte); color:var(--texte); cursor:pointer; }
button:hover { border-color:var(--or); }
button:disabled { opacity:.6; cursor:wait; }
.grille { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:14px; }
.carte { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:14px 16px; }
.carte.panne { border-color:var(--panne); } .carte.attention { border-color:var(--attention); }
.carte h2 { font-size:16px; margin:0 0 10px; }
.carte ul { list-style:none; margin:0; padding:0; }
.carte li { padding:7px 0; border-top:1px solid var(--bord); display:flex; flex-direction:column; }
.carte li:first-child { border-top:0; }
.detail, .depuis { color:var(--doux); font-size:13px; margin-left:24px; }
li.panne .detail { color:var(--panne); } li.attention .detail { color:var(--attention); }
h3 { font-size:16px; margin:28px 0 10px; }
.journal { list-style:none; padding:0; margin:0; background:var(--carte); border:1px solid var(--bord); border-radius:12px; }
.journal li { padding:8px 14px; border-top:1px solid var(--bord); font-size:14px; }
.journal li:first-child { border-top:0; }
.journal small.technique { display:block; color:var(--doux); font-size:12px; margin-top:2px; }
.carte .sens { margin-left:24px; font-size:14px; }
time { color:var(--doux); font-variant-numeric:tabular-nums; margin-right:4px; }
.vide { color:var(--doux); }
.badge { display:inline-block; min-width:20px; padding:0 6px; border-radius:10px; background:var(--panne); color:light-dark(#fff,#1b1b1e); font-size:12px; text-align:center; margin-left:auto; }
.projets { list-style:none; padding:0; margin:0; background:var(--carte); border:1px solid var(--bord); border-radius:12px; }
.projets li { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 14px; border-top:1px solid var(--bord); }
.projets li:first-child { border-top:0; }
.projets li div { display:flex; flex-direction:column; }
.projets li .detail { margin-left:0; }
.projets li small { color:var(--doux); font-size:12px; }
.projets li.pause { background:var(--fond); }
.projets form { margin:0; }
.message { background:var(--carte); border:1px solid var(--bord); border-left:4px solid var(--ok); padding:10px 14px; border-radius:8px; }
.actions { display:flex; justify-content:flex-end; margin:-8px 0 12px; }
@media (max-width:700px) {
  .coquille { display:block; min-height:0; }
  .menu { border-right:0; border-bottom:1px solid var(--bord); padding:14px; }
  .menu nav { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); }
  .menu nav a { justify-content:center; text-align:center; min-height:42px; font-size:12px; padding:8px 4px; }
  .menu nav a::before { display:none; }
  .menu nav a .badge { margin-left:4px; }
  .menu-pied { display:none; }
  main { padding:0 16px 30px; }
}
</style>
</head>
<body>
<div class="coquille">
<aside class="menu">
<a class="logo" href="/journal"><span class="mono">🧠</span><span class="marque">Cerveau central<small>le pilotage de tes projets</small></span></a>
<nav>${lien('journal', '/journal', '◆', 'Pilotage')}${lien('actions', '/actions', '✓', 'Actions')}${lien('activite', '/journal?vue=activite', '☰', 'Activité')}${lien('analyses', '/analyses', '◈', 'Analyses')}${lien('questions', '/questions', '✎', 'Questions du jour' + badge)}${lien('argent', '/argent', '€', 'Argent')}${lien('serveurs', '/serveurs', '▤', 'Serveurs')}${lien('etat', '/', '●', 'Surveillance')}${lien('discuter', '/discuter', '✦', 'Discuter')}</nav>
<div class="menu-pied"><a href="/deconnexion">Se déconnecter</a></div>
</aside>
<main>
<div class="titre"><h1>${TITRES[onglet] ?? 'Cerveau central'}</h1></div>
${contenu}
</main>
</div>
</body>
</html>`;
}
