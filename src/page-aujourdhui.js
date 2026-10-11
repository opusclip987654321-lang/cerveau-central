// Page « Aujourd'hui » : l'accueil du cerveau. Trois priorités, une ligne par
// projet, ce qui a changé depuis hier. Tout vient de src/aujourdhui.js.
import { gabarit } from './page.js';
import { PASTILLES } from './page-journal.js';
import { jourParis } from './questions.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const STATUTS = { vert: 'avance', orange: 'à surveiller', rouge: 'à débloquer', pause: 'en pause', gris: 'pas branché' };
const TYPES_PRIO = { panne: '⛔ Panne', arret: '🔴 À l’arrêt', fiche: '✋ Ta décision', souci: '🟠 À surveiller' };
const ICONES = { video: '🎬', publication: '📣', mail: '✉️', rdv: '📅', client: '💶', note: '📝', autre: '•' };

const nombre = (v) => (typeof v === 'number' ? v.toLocaleString('fr-FR') : String(v));

export function pageAujourdhui({ lignes, priorites, autres = 0, changements = [], fraicheur = {}, jour = jourParis(), aFaire = 0, message }) {
  const dateLongue = new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  const maj = fraicheur.derniere
    ? `Données relues ${fraicheur.retard ? `il y a ${fraicheur.retard} jour(s)` : `aujourd’hui à ${new Date(fraicheur.derniere).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}`}`
    : 'Aucune source lue pour l’instant';

  const blocPriorites = priorites.length
    ? `<div class="prios">${priorites
        .map(
          (p, i) => `<article class="prio ${e(p.type)}">
<header><span class="rang">${i + 1}</span><span class="genre">${TYPES_PRIO[p.type] ?? ''}</span><span class="projet">${e(p.projet)}</span></header>
<h3>${e(p.titre)}</h3>
${p.preuve ? `<p class="preuve">${e(p.preuve)}</p>` : ''}
<p class="attendu"><b>Ce qu’on attend :</b> ${e(p.attendu)}</p>
<a href="${e(p.href)}">Ouvrir ›</a>
</article>`,
        )
        .join('')}</div>${autres ? `<p class="autres"><a href="/actions">${autres} autre(s) point(s) attendent dans Actions ›</a></p>` : ''}`
    : '<p class="calme">🟢 Rien d’urgent ce matin : pas de panne, aucun projet à l’arrêt, aucune décision en attente.</p>';

  const ligne = (l) => {
    const chiffres = l.chiffres
      .map((c) => {
        if (c.valeur === null || c.valeur === undefined)
          return `<div class="chiffre indispo"><b>indisponible</b><span>${e(c.nom)}</span></div>`;
        const fleche = c.fleche === null ? '' : c.fleche > 0 ? `<em class="haut">▲ ${nombre(c.fleche)}</em>` : c.fleche < 0 ? `<em class="bas">▼ ${nombre(-c.fleche)}</em>` : '<em class="egal">= hier</em>';
        return `<div class="chiffre"><b>${nombre(c.valeur)}${fleche}</b><span>${e(c.nom)}${c.periode ? ` <small>${e(c.periode)}</small>` : ''}</span></div>`;
      })
      .join('');
    const objectif = l.objectif
      ? `<span class="objectif">Objectif ${nombre(l.objectif.valeur)} ${e(l.objectif.unite)}s/semaine${l.objectif.atteint !== null ? ` · ${l.objectif.atteint} %` : ''}</span>`
      : `<a class="objectif a-fixer" href="/journal">Objectif à fixer ›</a>`;
    return `<article class="ligne ${e(l.couleur)}">
<div class="qui"><a href="/projet?projet=${e(l.id)}"><b>${PASTILLES[l.couleur] ?? ''} ${e(l.nom)}</b></a><span class="etat">${STATUTS[l.couleur] ?? ''}</span>${objectif}</div>
<div class="chiffres">${chiffres}</div>
<p class="phrase ${l.phraseIa ? 'ia' : ''}">${l.phraseIa ? '🧠 ' : ''}${e(l.phrase)}</p>
</article>`;
  };

  const blocChangements = changements.length
    ? `<ul class="hier">${changements
        .map(
          (c) => `<li><b>${e(c.nom)}</b>${c.chiffres.length ? ` : ${c.chiffres.map(e).join(', ')}` : ''}${
            c.evenements.length ? `<ul>${c.evenements.map((ev) => `<li>${ICONES[ev.type] ?? '•'} ${ev.lien ? `<a href="${e(ev.lien)}" target="_blank" rel="noopener">${e(ev.titre)}</a>` : e(ev.titre)}</li>`).join('')}</ul>` : ''
          }</li>`,
        )
        .join('')}</ul>`
    : '<p class="vide">Rien d’enregistré hier.</p>';

  const contenu = `${message ? `<p class="message">${e(message)}</p>` : ''}
<p class="entete"><span class="date">${dateLongue.charAt(0).toUpperCase() + dateLongue.slice(1)}</span><span class="maj">${maj} · <a href="/surveillance">surveillance</a></span></p>
<section class="section"><h2>Priorités du jour</h2>${blocPriorites}</section>
<section class="section"><h2>Tes projets</h2><div class="lignes">${lignes.map(ligne).join('')}</div>
<p class="legende">Chiffres du jour comparés à hier (▲ ▼) ; « 7 jours » quand le jour n’a rien ; « indisponible » quand la donnée n’est pas branchée, jamais 0.</p></section>
<section class="section"><details class="hier-bloc"><summary>Ce qui a changé depuis hier</summary>${blocChangements}</details></section>
<style>
.entete { display:flex; flex-wrap:wrap; justify-content:space-between; gap:6px 14px; margin:-8px 0 16px; color:var(--doux); font-size:13px; }
.entete .date { font-size:15px; color:var(--texte); font-weight:600; }
.section { margin-bottom:22px; }
.section h2 { font-size:15px; margin:0 0 10px; color:var(--doux); font-weight:600; text-transform:uppercase; letter-spacing:.05em; }
.prios { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px; }
.prio { background:var(--carte); border:1px solid var(--bord); border-left:4px solid var(--or); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:6px; }
.prio.panne { border-left-color:var(--panne); } .prio.arret { border-left-color:var(--panne); } .prio.souci { border-left-color:var(--attention); }
.prio header { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--doux); }
.prio .rang { width:20px; height:20px; border-radius:50%; background:var(--or-doux); color:var(--or); display:grid; place-items:center; font-weight:700; }
.prio .projet { margin-left:auto; }
.prio h3 { margin:0; font-size:15px; line-height:1.3; }
.prio .preuve { margin:0; font-size:13px; color:var(--doux); }
.prio .attendu { margin:0; font-size:13px; }
.prio a { font-size:13px; font-weight:600; text-decoration:none; margin-top:auto; }
.autres { margin:8px 0 0; font-size:13px; }
.calme { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:12px 14px; margin:0; }
.lignes { display:flex; flex-direction:column; gap:10px; }
.ligne { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:12px 16px; display:grid; grid-template-columns:200px minmax(0,1fr); gap:6px 18px; align-items:center; }
.ligne.rouge { border-left:4px solid var(--panne); } .ligne.orange { border-left:4px solid var(--attention); } .ligne.vert { border-left:4px solid var(--ok); } .ligne.pause, .ligne.gris { border-left:4px solid var(--bord); }
.qui { display:flex; flex-direction:column; gap:2px; }
.qui a { color:inherit; text-decoration:none; font-size:15px; } .qui a:hover { text-decoration:underline; }
.qui .etat { font-size:12px; color:var(--doux); }
.objectif { font-size:12px; color:var(--doux); } .objectif.a-fixer { color:var(--or); text-decoration:none; font-weight:600; }
.chiffres { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px; }
.chiffre { display:flex; flex-direction:column; }
.chiffre b { font-size:22px; line-height:1.1; letter-spacing:-.4px; font-variant-numeric:tabular-nums; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
.chiffre b em { font-style:normal; font-size:12px; font-weight:600; }
.chiffre .haut { color:var(--ok); } .chiffre .bas { color:var(--panne); } .chiffre .egal { color:var(--doux); }
.chiffre span { font-size:12px; color:var(--doux); }
.chiffre span small { font-size:11px; }
.chiffre.indispo b { font-size:13px; color:var(--doux); font-weight:500; font-style:italic; }
.phrase { grid-column:1 / -1; margin:0; font-size:14px; padding-top:6px; border-top:1px solid var(--bord); }
.phrase.ia { color:var(--texte); }
.legende { font-size:12px; color:var(--doux); margin:10px 0 0; }
.hier-bloc { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:10px 16px; }
.hier-bloc summary { cursor:pointer; font-weight:600; font-size:14px; }
.hier { margin:8px 0 0; padding-left:18px; font-size:14px; }
.hier ul { padding-left:16px; margin:2px 0 6px; color:var(--doux); }
.vide { color:var(--doux); font-size:14px; margin:8px 0 0; }
.message { background:var(--carte); border:1px solid var(--bord); border-left:4px solid var(--ok); border-radius:8px; padding:10px 12px; }
@media (max-width:760px) {
  .ligne { grid-template-columns:1fr; }
  .chiffres { grid-template-columns:repeat(3, minmax(0,1fr)); gap:4px; }
  .chiffre b { font-size:18px; }
}
</style>`;
  return gabarit({ onglet: 'aujourdhui', aFaire, contenu, titre: 'Aujourd’hui' });
}
