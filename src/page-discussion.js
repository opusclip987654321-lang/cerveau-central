// Onglet « Discuter » : poser une question au cerveau.
import { gabarit } from './page.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const heure = (iso) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function pageDiscussion(donnees, { aRepondre = 0, depenseIa = 0, plafondIa = 10 } = {}) {
  const messages = donnees.messages.slice(-60);
  const fil = messages.length
    ? messages.map((m) => `<div class="bulle ${m.role}${m.erreur ? ' erreur' : ''}"><div>${e(m.texte).replace(/\n/g, '<br>')}</div><time>${m.role === 'louis' ? 'Toi' : '🧠 Cerveau'} · ${heure(m.quand)}</time></div>`).join('\n')
    : '<p class="vide">Pose ta première question : « Qu’est-ce qui me coûte le plus ce mois-ci ? », « Où en est Nūr Meet ? »…</p>';
  const contenu = `<section class="discussion">
<div class="fil" id="fil">${fil}</div>
<form method="post" action="/discuter" class="ecrire" onsubmit="const b=this.querySelector('button');b.disabled=true;b.textContent='Le cerveau réfléchit…'">
<textarea name="question" required maxlength="2000" rows="3" placeholder="Écris au cerveau…"></textarea>
<button type="submit">Envoyer</button>
</form>
<p class="doux">Le cerveau répond avec Claude à partir de tes données (état, argent, serveurs, journal). Il ne modifie rien. Dépense IA ce mois : ${depenseIa.toFixed(2).replace('.', ',')} $ sur ${plafondIa} $.</p>
</section>
<style>
.fil { display:flex; flex-direction:column; gap:10px; margin-bottom:14px; }
.bulle { max-width:85%; padding:10px 14px; border-radius:12px; background:var(--carte); border:1px solid var(--bord); }
.bulle.louis { align-self:flex-end; background:var(--fond); }
.bulle.erreur { border-color:var(--panne); }
.bulle time { display:block; color:var(--doux); font-size:12px; margin-top:4px; }
.ecrire { display:flex; gap:8px; align-items:flex-end; }
.ecrire textarea { flex:1; font:inherit; padding:10px; border-radius:10px; border:1px solid var(--bord); background:var(--carte); color:var(--texte); resize:vertical; }
.doux { color:var(--doux); font-size:13px; }
</style>
<script>document.getElementById('fil').lastElementChild?.scrollIntoView();</script>`;
  return gabarit({ onglet: 'discuter', aRepondre, contenu });
}
