// Page d'état : une page simple qui montre si tout tourne.

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
      (v) => `<li class="${v.etat}"><span class="nom">${PASTILLE[v.etat]} ${e(v.nom)}</span><span class="detail">${e(v.detail)}</span>${
        v.etat === 'panne' || v.etat === 'attention' ? `<span class="depuis">depuis ${heure(v.depuis)}</span>` : ''
      }</li>`,
    )
    .join('')}</ul>
</section>`;
    })
    .join('\n');

  const historique = etat.historique.slice(0, 30);
  const journal = historique.length
    ? `<ul class="journal">${historique
        .map((h) => `<li><time>${heure(h.date)}</time> ${PASTILLE[h.type === 'retabli' ? 'ok' : h.type === 'evenement' ? 'attention' : h.type]} <b>${e(h.projet)}</b> · ${e(h.verification)} : ${e(h.detail)}</li>`)
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
  const lien = (id, href, texte) => `<a href="${href}" class="${onglet === id ? 'actif' : ''}">${texte}</a>`;
  const badge = aRepondre ? ` <span class="badge">${aRepondre}</span>` : '';
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${onglet === 'etat' ? '<meta http-equiv="refresh" content="300">' : ''}
<title>Cerveau central</title>
<style>
:root { --fond:#f6f5f2; --carte:#fff; --texte:#1d1d1b; --doux:#6b6a66; --bord:#e4e2dc; --ok:#1f8a4c; --attention:#c27a00; --panne:#c2332b; }
@media (prefers-color-scheme: dark) { :root { --fond:#151514; --carte:#1f1f1d; --texte:#ecebe7; --doux:#9b9a95; --bord:#33322f; --ok:#4cc27e; --attention:#f0a72a; --panne:#f06a5f; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--fond); color:var(--texte); font:15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width:960px; margin:0 auto; padding:24px 16px 48px; }
header { display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; margin-bottom:20px; }
h1 { font-size:22px; margin:0; }
.resume { font-size:18px; font-weight:600; padding:14px 16px; border-radius:12px; background:var(--carte); border:1px solid var(--bord); border-left:6px solid var(--ok); margin-bottom:20px; }
.resume small { display:block; font-weight:400; color:var(--doux); font-size:13px; margin-top:2px; }
button { font:inherit; padding:8px 14px; border-radius:8px; border:1px solid var(--bord); background:var(--carte); color:var(--texte); cursor:pointer; }
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
time { color:var(--doux); font-variant-numeric:tabular-nums; margin-right:4px; }
.vide { color:var(--doux); }
nav { display:flex; gap:6px; flex-wrap:wrap; }
nav a { color:var(--texte); text-decoration:none; padding:7px 12px; border-radius:8px; border:1px solid transparent; }
nav a.actif { background:var(--carte); border-color:var(--bord); font-weight:600; }
.badge { display:inline-block; min-width:20px; padding:0 6px; border-radius:10px; background:var(--panne); color:#fff; font-size:12px; text-align:center; }
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
</style>
</head>
<body>
<main>
<header><h1>🧠 Cerveau central</h1><nav>${lien('etat', '/', 'État')}${lien('journal', '/journal', 'Journal')}${lien('questions', '/questions', 'Questions du jour' + badge)}${lien('argent', '/argent', 'Argent')}${lien('serveurs', '/serveurs', 'Serveurs')}${lien('discuter', '/discuter', 'Discuter')}</nav></header>
${contenu}
</main>
</body>
</html>`;
}
