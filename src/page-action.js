// La fiche d'une action : le problème, les faits, la discussion avec le cerveau
// et la décision. C'est ici que louis règle un problème, pas sur la page projet.
import { gabarit } from './page.js';
import { STATUTS_ACTION } from './actions.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const heure = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '—');

// À qui la main, pour colorer la pastille : doré quand louis doit agir.
const A_TOI = new Set(['question_posee', 'proposition_a_valider', 'a_transmettre', 'resultat_a_verifier']);
const TYPES_HISTO = { ouverture: 'Fiche ouverte', occurrence: 'Nouvelle occurrence', statut: 'Statut', reponse: 'Ta réponse', note: 'Ta note' };

export function pageAction(action, { aRepondre = 0, actif = false, depenseIa = 0, plafondIa = 10, message } = {}) {
  const statut = STATUTS_ACTION[action.statut] ?? { nom: action.statut, qui: '' };
  const classe = action.statut === 'resolu' ? 'ok' : A_TOI.has(action.statut) ? 'toi' : 'cerveau';

  const histo = [...action.historique]
    .reverse()
    .map((h) => `<li><time>${heure(h.quand)}</time> <b>${TYPES_HISTO[h.type] ?? h.type}</b> · ${e(h.texte)}</li>`)
    .join('');

  const discussion = action.discussion.length
    ? action.discussion.map((m) => `<div class="echange ${m.role === 'louis' ? 'louis' : 'cerveau'}"><small>${m.role === 'louis' ? 'Toi' : 'Le cerveau'} · ${heure(m.quand)}</small><p>${e(m.texte).replace(/\n/g, '<br>')}</p></div>`).join('')
    : '<p class="vide">Pas encore d’échange sur cette fiche. Pose ta question ou donne ta décision ci-dessous.</p>';

  const question = action.statut === 'question_posee' || action.statut === 'proposition_a_valider';
  const formDiscussion = actif
    ? `<form method="post" action="/action/discuter" class="form-discuter">
<input type="hidden" name="id" value="${e(action.id)}">
${question ? '<div class="rapide"><button type="button" data-v="Oui, vas-y.">Oui</button><button type="button" data-v="Non, laisse comme ça.">Non</button></div>' : ''}
<textarea name="question" rows="3" maxlength="2000" required placeholder="${question ? 'Ta réponse ou ta décision…' : 'Ta question ou ta remarque sur ce problème…'}"></textarea>
<div class="envoi"><small>Compté dans le plafond IA du mois : ${depenseIa.toFixed(2)} $ sur ${plafondIa} $.</small><button>Envoyer</button></div>
</form>
<script>
for (const b of document.querySelectorAll('.rapide button')) b.onclick = () => { const t = document.querySelector('.form-discuter textarea'); t.value = b.dataset.v; t.focus(); };
</script>`
    : '<p class="vide">La clé Claude n’est pas branchée sur le cerveau : la discussion de fiche est indisponible.</p>';

  const options = Object.entries(STATUTS_ACTION)
    .filter(([s]) => s !== 'resolu')
    .map(([s, v]) => `<option value="${s}"${s === action.statut ? ' selected' : ''}>${v.nom}</option>`)
    .join('');

  const contenu = `<p class="retour"><a href="/actions">‹ Toutes les actions</a></p>
${message ? `<p class="message">${e(message)}</p>` : ''}
<section class="fiche-tete">
<h2>${e(action.titre)}</h2>
<p class="meta"><span class="statut-a ${classe}">${e(statut.nom)}</span> ${e(action.projet || 'Cerveau central')} · ouverte le ${heure(action.cree)} · dernier mouvement ${heure(action.maj)}</p>
<p class="qui"><b>Qui doit agir :</b> ${e(statut.qui)}</p>
</section>
<section class="bloc-fiche"><h3>Le problème</h3>
<p>${e(action.constat)}</p>
${action.consequence ? `<p class="consequence"><b>Ce que ça change pour le projet :</b> ${e(action.consequence)}</p>` : ''}
</section>
<section class="bloc-fiche"><h3>Discussion avec le cerveau</h3>
${discussion}
${formDiscussion}
</section>
<section class="bloc-fiche"><h3>Historique</h3>
<ul class="histo">${histo}</ul>
</section>
<section class="bloc-fiche decisions"><h3>Décision</h3>
<div class="barre-decisions">
<form method="post" action="/action/statut"><input type="hidden" name="id" value="${e(action.id)}"><select name="statut">${options}</select><button>Changer le statut</button></form>
${action.statut === 'resolu' ? '' : `<form method="post" action="/action/statut" onsubmit="return confirm('Marquer ce problème comme résolu ? Toi seul peux le faire.')"><input type="hidden" name="id" value="${e(action.id)}"><input type="hidden" name="statut" value="resolu"><button class="resoudre">Marquer résolu</button></form>`}
<a class="dossier" href="/action/dossier?id=${e(action.id)}" download>Préparer pour Claude ↓</a>
</div>
<p class="note">« Préparer pour Claude » télécharge le dossier du problème (faits, dates, échanges, pistes) à coller dans ton projet Claude. Rien ne se corrige tout seul : le cerveau propose, tu décides.</p>
</section>
<style>
.retour { margin:0 0 10px; } .retour a { text-decoration:none; color:var(--doux); }
.fiche-tete { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:16px 20px; margin-bottom:14px; }
.fiche-tete h2 { margin:0 0 8px; font-size:19px; letter-spacing:-.3px; }
.meta { margin:0 0 6px; color:var(--doux); font-size:13px; }
.statut-a { display:inline-block; padding:2px 10px; border-radius:999px; font-size:12px; font-weight:650; margin-right:6px; }
.statut-a.toi { background:var(--or-doux); color:var(--or); }
.statut-a.cerveau { background:var(--carte2); color:var(--doux); border:1px solid var(--bord); }
.statut-a.ok { background:color-mix(in srgb, var(--ok) 16%, transparent); color:var(--ok); }
.qui { margin:0; font-size:14px; }
.bloc-fiche { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:14px 20px; margin-bottom:14px; }
.bloc-fiche h3 { margin:0 0 10px; font-size:15px; }
.bloc-fiche p { max-width:75ch; }
.consequence { color:var(--doux); }
.echange { border-left:3px solid var(--bord); padding:2px 0 2px 12px; margin:0 0 12px; }
.echange.louis { border-left-color:var(--or); }
.echange small { color:var(--doux); font-size:12px; }
.echange p { margin:2px 0 0; }
.form-discuter textarea { width:100%; font:inherit; padding:10px; border-radius:8px; border:1px solid var(--bord); background:var(--fond); color:var(--texte); resize:vertical; }
.form-discuter .envoi { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:8px; }
.form-discuter .envoi small { color:var(--doux); }
.rapide { display:flex; gap:8px; margin-bottom:8px; }
.histo { list-style:none; margin:0; padding:0; }
.histo li { padding:7px 0; border-top:1px solid var(--bord); font-size:13px; }
.histo li:first-child { border-top:0; }
.barre-decisions { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
.barre-decisions form { display:flex; gap:8px; margin:0; }
.barre-decisions select { font:inherit; padding:8px 10px; border-radius:8px; border:1px solid var(--bord); background:var(--fond); color:var(--texte); }
button.resoudre { background:var(--bouton); color:var(--sur-bouton); border-color:var(--bouton); font-weight:650; }
.dossier { font-size:13px; font-weight:600; text-decoration:none; }
.decisions .note { color:var(--doux); font-size:13px; margin:10px 0 0; }
.message { background:var(--carte); border:1px solid var(--bord); border-left:4px solid var(--ok); padding:10px 14px; border-radius:8px; }
.vide { color:var(--doux); }
</style>`;
  return gabarit({ onglet: 'actions', aRepondre, contenu, titre: 'Fiche d’action' });
}
