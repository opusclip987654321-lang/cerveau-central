// Page « Serveurs » : chaque VPS, ce qui tourne dessus, la place qui reste.
import { gabarit } from './page.js';
import { analyser, conseilsEntreServeurs, parProjet, disquePrincipal, goLisible } from './serveurs.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PASTILLE = { panne: '🔴', attention: '🟠', info: '💡' };
const ilYa = (iso, maintenant) => {
  const min = Math.round((maintenant - new Date(iso)) / 60_000);
  return min < 60 ? `il y a ${min} min` : min < 48 * 60 ? `il y a ${Math.round(min / 60)} h` : `il y a ${Math.round(min / 1440)} jours`;
};
const jauge = (titre, pct, detail) => {
  const ton = pct >= 90 ? 'panne' : pct >= 80 ? 'attention' : 'ok';
  return `<div class="jauge"><div class="jauge-titre"><span>${titre}</span><b>${pct ?? '—'} %</b></div><div class="barre"><i style="width:${Math.min(100, pct ?? 0)}%;background:var(--${ton})"></i></div><small>${detail}</small></div>`;
};

export function pageServeurs(config, donnees, { maintenant = new Date(), aRepondre = 0 } = {}) {
  const analyses = Object.fromEntries(config.serveurs.map((s) => [s.id, analyser(donnees.serveurs[s.id], config, maintenant)]));
  const entre = conseilsEntreServeurs(config, donnees, analyses);

  const cartes = config.serveurs
    .map((s) => {
      const etat = donnees.serveurs[s.id];
      const a = analyses[s.id];
      const tete = `<h2>${e(s.nom)}</h2><p class="role">${e(s.role)} · ${e(s.prix)}</p>`;
      if (!etat?.dernier)
        return `<section class="serveur">${tete}<p class="doux">⚪ Pas encore branché : il faut installer le petit relevé sur ce serveur (voir le guide).</p></section>`;
      const r = etat.dernier;
      const d = disquePrincipal(r);
      const projets = Object.entries(parProjet(r, config)).sort((x, y) => y[1].disque - x[1].disque);
      const plein = a.joursAvantPlein !== null ? `plein dans ~${a.joursAvantPlein} jours au rythme actuel` : a.pente != null && a.pente <= 0 ? 'la place ne diminue pas' : 'tendance connue après 1 jour de relevés';
      return `<section class="serveur${a.enRetard ? ' retard' : ''}">
${tete}
<p class="doux petit">Dernier relevé ${ilYa(etat.recu, maintenant)}${r.hote ? ` · ${e(r.hote)}` : ''}</p>
<div class="jauges">
${d ? jauge('Disque', a.pctDisque, `${goLisible(d.total - d.utilise)} libres sur ${goLisible(d.total)} · ${plein}`) : ''}
${jauge('Mémoire', a.pctMemoire, `${goLisible(r.memoire.dispo)} disponibles sur ${goLisible(r.memoire.total)}`)}
${jauge('Processeur', Math.round((r.charge / r.coeurs) * 100), `charge moyenne sur 15 min, ${r.coeurs} cœur(s)`)}
</div>
${a.conseils.length ? `<ul class="conseils">${a.conseils.map((c) => `<li>${PASTILLE[c.niveau]} ${e(c.texte)}</li>`).join('')}</ul>` : '<p class="ok">🟢 Rien à signaler.</p>'}
<h3>Ce qui tourne dessus</h3>
<div class="defile"><table><thead><tr><th>Projet</th><th class="num">Disque</th><th class="num">Mémoire</th><th class="num">Processeur</th></tr></thead><tbody>
${projets
  .map(
    ([nom, p]) => `<tr><td><b>${e(nom)}</b><small>${p.conteneurs.map((c) => `${e(c.nom)}${c.enMarche ? '' : ' (arrêté)'}`).join(', ')}${p.dossiers.map((x) => e(x.chemin)).join(', ')}</small></td><td class="num">${p.disque ? goLisible(p.disque) : '—'}</td><td class="num">${p.memoire ? goLisible(p.memoire) : '—'}</td><td class="num">${p.conteneurs.some((c) => c.enMarche) ? `${Math.round(p.cpu)} %` : '—'}</td></tr>`,
  )
  .join('')}
</tbody></table></div>
<details><summary>Détail de la place</summary>
<ul class="detail-place">
${['images', 'cache', 'volumes', 'conteneurs'].filter((k) => r.docker[k]).map((k) => `<li>Docker ${{ images: 'images', cache: 'cache de construction', volumes: 'volumes (données)', conteneurs: 'conteneurs' }[k]} : ${goLisible(r.docker[k].taille)}${r.docker[k].recuperable ? ` (dont ${goLisible(r.docker[k].recuperable)} récupérables)` : ''}</li>`).join('')}
${r.dossiers.slice(0, 8).map((x) => `<li>${e(x.chemin)} : ${goLisible(x.taille)}</li>`).join('')}
</ul></details>
</section>`;
    })
    .join('\n');

  const contenu = `${entre.length ? `<div class="resume">${entre.map((c) => `${PASTILLE[c.niveau]} ${e(c.texte)}`).join('<br>')}</div>` : ''}
<div class="grille-serveurs">
${cartes}
</div>
<style>
.grille-serveurs { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap:16px; }
.serveur { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:14px 16px; min-width:0; }
.serveur.retard { border-color:var(--panne); }
.serveur h2 { font-size:17px; margin:0; }
.serveur h3 { font-size:14px; margin:16px 0 6px; }
.role { color:var(--doux); margin:2px 0 0; font-size:14px; }
.petit { font-size:13px; margin:4px 0 12px; }
.doux { color:var(--doux); } .ok { color:var(--ok); }
.jauges { display:grid; gap:10px; }
.jauge-titre { display:flex; justify-content:space-between; font-size:14px; }
.barre { height:8px; background:var(--bord); border-radius:4px; overflow:hidden; margin:4px 0 2px; }
.barre i { display:block; height:100%; border-radius:4px; }
.jauge small { color:var(--doux); font-size:12px; }
.conseils { list-style:none; padding:0; margin:12px 0 0; font-size:14px; }
.conseils li { padding:6px 0; border-top:1px solid var(--bord); }
.defile { overflow-x:auto; }
table { width:100%; border-collapse:collapse; font-size:14px; }
th { text-align:left; color:var(--doux); font-weight:500; font-size:13px; padding:6px 8px; border-bottom:1px solid var(--bord); }
td { padding:8px; border-top:1px solid var(--bord); vertical-align:top; }
td small { display:block; color:var(--doux); font-size:12px; word-break:break-word; }
.num { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
details { margin-top:10px; font-size:14px; } summary { cursor:pointer; color:var(--doux); }
.detail-place { margin:6px 0 0; padding-left:18px; }
</style>`;
  return gabarit({ onglet: 'serveurs', aRepondre, contenu });
}
