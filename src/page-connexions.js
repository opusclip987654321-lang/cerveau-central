// Page « Connexions » : d'où viennent les chiffres. Une fiche par source, avec
// son état, sa dernière lecture et, si elle n'est pas branchée, quoi faire.
import { gabarit } from './page.js';
import { A_BRANCHER, resumeConnexions } from './connexions.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const heure = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '—');
const PASTILLE = { ok: '🟢', silence: '🟠', erreur: '🔴', 'pas-branche': '⚪' };
const LIBELLE = { ok: 'branchée', silence: 'silencieuse', erreur: 'en erreur', 'pas-branche': 'pas branchée' };
const ORDRE = { erreur: 0, silence: 1, 'pas-branche': 2, ok: 3 };

export function pageConnexions(connexions, { nomProjet = (id) => id, message } = {}) {
  const r = resumeConnexions(connexions);
  const resume = r.erreur
    ? `🔴 ${r.erreur} connexion(s) en erreur`
    : r.silence
      ? `🟠 ${r.silence} connexion(s) silencieuse(s)`
      : `🟢 ${r.ok} connexion(s) branchée(s)${r.pasBranche ? `, ${r.pasBranche} à brancher` : ''}`;
  const fiches = [...connexions]
    .sort((a, b) => ORDRE[a.etat] - ORDRE[b.etat])
    .map(
      (c) => `<article class="connexion ${e(c.etat)}">
<header><h3>${PASTILLE[c.etat]} ${e(c.nom)}</h3><span class="etat-c">${LIBELLE[c.etat]}</span></header>
<p class="projets">${c.projets.map((p) => `<a href="/projet?projet=${e(p)}">${e(nomProjet(p))}</a>`).join(' · ')}</p>
<p class="lit">${e(c.lit)}</p>
<p class="detail">${e(c.detail)}${c.derniere ? ` Dernière lecture : ${heure(c.derniere)}.` : ''}${c.tentative && c.etat !== 'ok' ? ` Dernière tentative : ${heure(c.tentative)}.` : ''}</p>
${c.etat === 'ok' ? '' : `<p class="faire"><b>${c.etat === 'erreur' ? 'À regarder' : c.etat === 'silence' ? 'À vérifier' : 'Pour la brancher'} :</b> ${e(c.besoin)}</p>`}
</article>`,
    )
    .join('');

  const aBrancher = A_BRANCHER.map((x) => `<li><b>${e(x.nom)}</b><span>${e(x.pourquoi)}</span><small>${e(x.comment)}</small></li>`).join('');

  const contenu = `${message ? `<p class="message">${e(message)}</p>` : ''}
<div class="resume-c">${resume}<small>Les sources sont relues toutes les heures ; une clé absente se voit ici, jamais sa valeur.</small></div>
<div class="connexions">${fiches}</div>
<section class="bloc-c"><h3>Reste à brancher</h3><ul class="a-brancher">${aBrancher}</ul></section>
<style>
.resume-c { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:12px 16px; margin-bottom:14px; font-weight:600; display:flex; flex-wrap:wrap; justify-content:space-between; gap:6px 14px; }
.resume-c small { color:var(--doux); font-weight:400; }
.connexions { display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:12px; margin-bottom:16px; }
.connexion { background:var(--carte); border:1px solid var(--bord); border-left:4px solid var(--bord); border-radius:12px; padding:12px 16px; display:flex; flex-direction:column; gap:4px; }
.connexion.ok { border-left-color:var(--ok); } .connexion.silence { border-left-color:var(--attention); } .connexion.erreur { border-left-color:var(--panne); }
.connexion header { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
.connexion h3 { margin:0; font-size:15px; }
.etat-c { font-size:12px; color:var(--doux); white-space:nowrap; }
.connexion p { margin:0; font-size:13px; }
.connexion .projets a { color:var(--doux); text-decoration:none; font-size:12px; } .connexion .projets a:hover { text-decoration:underline; }
.connexion .lit { color:var(--texte); }
.connexion .detail { color:var(--doux); }
.connexion .faire { margin-top:4px; padding-top:6px; border-top:1px solid var(--bord); }
.bloc-c { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:12px 16px; }
.bloc-c h3 { margin:0 0 8px; font-size:15px; }
.a-brancher { list-style:none; margin:0; padding:0; }
.a-brancher li { display:flex; flex-direction:column; padding:8px 0; border-top:1px solid var(--bord); font-size:13px; }
.a-brancher li:first-child { border-top:0; }
.a-brancher span { color:var(--texte); } .a-brancher small { color:var(--doux); }
.message { background:var(--carte); border:1px solid var(--bord); border-left:4px solid var(--ok); border-radius:8px; padding:10px 12px; }
</style>`;
  return gabarit({ onglet: 'connexions', contenu, titre: 'Connexions' });
}
