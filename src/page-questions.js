// Page « Questions du jour » : quelques questions par projet, et les réponses passées.
import { gabarit } from './page.js';
import { questionsDuJour, jourParis } from './questions.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jourLisible = (jour) => new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

function champ(projet, q) {
  const nom = `${projet.id}:${q.id}`;
  const val = q.reponse;
  if (q.type === 'note')
    return `<div class="notes">${[1, 2, 3, 4, 5]
      .map((n) => `<label><input type="radio" name="${nom}" value="${n}"${val === n ? ' checked' : ''}><span>${n}</span></label>`)
      .join('')}</div>`;
  if (q.type === 'choix')
    return `<div class="choix">${q.choix
      .map((c) => `<label><input type="radio" name="${nom}" value="${e(c)}"${val === c ? ' checked' : ''}><span>${e(c)}</span></label>`)
      .join('')}</div>`;
  if (q.type === 'nombre') return `<input type="number" min="0" step="any" inputmode="decimal" name="${nom}" value="${e(val)}">`;
  return `<textarea name="${nom}" rows="2" placeholder="Ta réponse, en quelques mots">${e(val)}</textarea>`;
}

export function pageQuestions(config, historique, { jour = jourParis(), message } = {}) {
  const parProjet = questionsDuJour(config, historique, jour);
  const restantes = parProjet.reduce((n, p) => n + p.questions.filter((q) => q.reponse === undefined).length, 0);
  const total = parProjet.reduce((n, p) => n + p.questions.length, 0);

  const cartes = parProjet
    .map(({ projet, questions }) => {
      const notes = historique.reponses.filter((r) => r.projet === projet.id && projet.questions.find((q) => q.id === r.question)?.quotidienne).slice(-14);
      const tendance = notes.length ? `<span class="tendance" title="Tes dernières notes">${notes.map((r) => r.reponse).join(' · ')}</span>` : '';
      const passees = historique.reponses
        .filter((r) => r.projet === projet.id && r.jour !== jour && typeof r.reponse === 'string')
        .slice(-3)
        .reverse();
      return `<section class="carte">
  <h2>${e(projet.nom)} ${tendance}</h2>
  ${questions
    .map((q) => `<div class="question${q.reponse !== undefined ? ' faite' : ''}"><p>${q.reponse !== undefined ? '✓ ' : ''}${e(q.texte)}</p>${champ(projet, q)}</div>`)
    .join('')}
  ${passees.length ? `<details><summary>Tes réponses précédentes</summary><ul>${passees.map((r) => `<li><b>${e(r.texte)}</b><br>${e(r.reponse)}</li>`).join('')}</ul></details>` : ''}
</section>`;
    })
    .join('\n');

  const contenu = `<form method="post" action="/questions">
<div class="resume">${restantes ? '✍️' : '✅'} ${restantes ? `${restantes} question(s) sur ${total} pour ${jourLisible(jour)}` : `Tout est répondu pour ${jourLisible(jour)}, merci !`}
<small>${message ? e(message) + ' · ' : ''}Réponds seulement à ce que tu veux, tu peux laisser vide. Le cerveau s'en servira pour comprendre où chaque projet peut progresser.</small></div>
<div class="grille">
${cartes}
</div>
<div class="envoyer"><button type="submit">Enregistrer mes réponses</button></div>
</form>
<style>
.question { padding:10px 0; border-top:1px solid var(--bord); }
.question:first-of-type { border-top:0; padding-top:0; }
.question p { margin:0 0 8px; }
.question.faite p { color:var(--doux); }
textarea, input[type=number] { width:100%; font:inherit; padding:8px 10px; border-radius:8px; border:1px solid var(--bord); background:var(--fond); color:var(--texte); }
.notes, .choix { display:flex; flex-wrap:wrap; gap:6px; }
.notes label, .choix label { cursor:pointer; }
.notes input, .choix input { position:absolute; opacity:0; pointer-events:none; }
.notes span, .choix span { display:inline-block; padding:6px 12px; border-radius:8px; border:1px solid var(--bord); background:var(--fond); font-size:14px; }
.notes span { min-width:40px; text-align:center; }
input:checked + span { background:var(--texte); color:var(--fond); border-color:var(--texte); }
input:focus-visible + span { outline:2px solid var(--attention); }
.tendance { font-weight:400; font-size:13px; color:var(--doux); margin-left:6px; }
details { margin-top:10px; font-size:14px; } summary { cursor:pointer; color:var(--doux); }
details ul { padding-left:18px; margin:8px 0 0; } details li { margin-bottom:6px; }
.envoyer { position:sticky; bottom:0; padding:14px 0; background:linear-gradient(transparent, var(--fond) 40%); display:flex; justify-content:flex-end; }
.envoyer button { background:var(--texte); color:var(--fond); border-color:var(--texte); font-weight:600; padding:10px 18px; }
</style>`;
  return gabarit({ onglet: 'questions', aRepondre: restantes, contenu });
}
