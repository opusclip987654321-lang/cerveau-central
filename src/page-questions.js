// Page « Questions du jour » : d'abord ce qui attend une réponse, puis le répondu
// du jour (modifiable), puis l'historique des jours précédents, par date.
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
  const nom = (id) => config.projets.find((p) => p.id === id)?.nom ?? id;

  // D'abord : seulement les questions encore sans réponse enregistrée.
  const cartes = parProjet
    .map(({ projet, questions }) => ({ projet, aFaire: questions.filter((q) => q.reponse === undefined) }))
    .filter((p) => p.aFaire.length)
    .map(({ projet, aFaire }) => {
      const notes = historique.reponses.filter((r) => r.projet === projet.id && projet.questions.find((q) => q.id === r.question)?.quotidienne).slice(-14);
      const tendance = notes.length ? `<span class="tendance" title="Tes dernières notes">${notes.map((r) => r.reponse).join(' · ')}</span>` : '';
      return `<section class="carte">
  <h2>${e(projet.nom)} ${tendance}</h2>
  ${aFaire.map((q) => `<div class="question"><p>${e(q.texte)}</p>${champ(projet, q)}</div>`).join('')}
</section>`;
    })
    .join('\n');

  // Le répondu du jour reste modifiable : ré-enregistrer remplace la réponse du jour.
  const faites = parProjet
    .map(({ projet, questions }) => ({ projet, deja: questions.filter((q) => q.reponse !== undefined) }))
    .filter((p) => p.deja.length);
  const blocFaites = faites.length
    ? `<details class="faites"><summary>Répondu aujourd'hui (${total - restantes}) — clique pour relire ou modifier</summary>
<div class="grille">${faites
        .map(
          ({ projet, deja }) => `<section class="carte">
  <h2>${e(projet.nom)}</h2>
  ${deja.map((q) => `<div class="question faite"><p>✓ ${e(q.texte)}</p>${champ(projet, q)}</div>`).join('')}
</section>`,
        )
        .join('\n')}</div></details>`
    : '';

  // Historique des jours précédents, du plus récent au plus ancien.
  const parJour = new Map();
  for (const r of historique.reponses) {
    if (r.jour === jour) continue;
    if (!parJour.has(r.jour)) parJour.set(r.jour, []);
    parJour.get(r.jour).push(r);
  }
  const joursTries = [...parJour.keys()].sort().reverse().slice(0, 14);
  const blocHistorique = joursTries.length
    ? `<h3>Historique de tes réponses</h3>
${joursTries
        .map(
          (j) => `<details class="hist"><summary>${jourLisible(j)} <small>(${parJour.get(j).length} réponse(s))</small></summary><ul>${parJour
            .get(j)
            .map((r) => `<li><small>${e(nom(r.projet))}</small><b>${e(r.texte)}</b><span>${e(r.reponse)}</span></li>`)
            .join('')}</ul></details>`,
        )
        .join('\n')}`
    : '';

  const contenu = `<form method="post" action="/questions">
<div class="resume">${restantes ? '✍️' : '✅'} ${restantes ? `${restantes} question(s) sur ${total} pour ${jourLisible(jour)}` : `Tout est répondu pour ${jourLisible(jour)}, merci !`}
<small>${message ? `<b class="confirmation">✓ ${e(message)}</b> · ` : ''}Réponds seulement à ce que tu veux, tu peux laisser vide. Le cerveau s'en servira pour comprendre où chaque projet peut progresser.</small></div>
<div class="grille">
${cartes}
</div>
${blocFaites}
${restantes || faites.length ? '<div class="envoyer"><button type="submit">Enregistrer mes réponses</button></div>' : ''}
</form>
${blocHistorique}
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
.confirmation { color:var(--ok); }
.faites { margin-top:18px; }
.faites > summary { cursor:pointer; font-weight:600; padding:8px 0; color:var(--doux); }
.faites .grille { margin-top:10px; }
.hist { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:10px 16px; margin-bottom:10px; }
.hist summary { cursor:pointer; font-weight:600; }
.hist summary small { color:var(--doux); font-weight:400; }
.hist ul { list-style:none; margin:8px 0 2px; padding:0; }
.hist li { display:flex; flex-direction:column; padding:7px 0; border-top:1px solid var(--bord); font-size:14px; }
.hist li small { color:var(--doux); font-size:12px; }
.hist li span { color:var(--doux); }
.envoyer { position:sticky; bottom:0; padding:14px 0; background:linear-gradient(transparent, var(--fond) 40%); display:flex; justify-content:flex-end; }
.envoyer button { background:var(--texte); color:var(--fond); border-color:var(--texte); font-weight:600; padding:10px 18px; }
</style>`;
  return gabarit({ onglet: 'questions', aRepondre: restantes, contenu });
}
