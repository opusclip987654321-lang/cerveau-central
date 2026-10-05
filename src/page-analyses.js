// Page « Analyses » : le bilan du lundi (écrit par Claude chaque lundi matin) et ses archives.
import { gabarit } from './page.js';
import { depenseBilansDuMois } from './bilan.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dateLisible = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
const paragraphes = (t) => String(t).split(/\n{2,}/).map((p) => `<p>${e(p).replace(/\n/g, '<br>')}</p>`).join('');

export function pageAnalyses(donnees, { aRepondre = 0, plafond = 10 } = {}) {
  const [dernier, ...anciens] = donnees.bilans ?? [];
  const bloc = (b) =>
    b.texte
      ? paragraphes(b.texte)
      : `<p class="vide">Pas de bilan cette semaine-là : ${e(b.erreur ?? 'raison inconnue')}</p>`;

  const contenu = `${
    dernier
      ? `<section class="bilan"><h3>Bilan du ${dateLisible(dernier.semaine)}</h3>${bloc(dernier)}
<p class="note">Ce sont des propositions : c'est toi qui décides, rien ne se change tout seul.</p></section>`
      : `<p class="vide">Pas encore de bilan : le premier s'écrira lundi matin (vers 8 h), à partir de tout ce que le cerveau sait de la semaine (chiffres, journal, tes réponses aux questions, objectifs).</p>`
  }
${
    anciens.length
      ? `<h3>Bilans précédents</h3>${anciens
          .map((b) => `<details class="bilan-ancien"><summary>Bilan du ${dateLisible(b.semaine)}${b.texte ? '' : ' · pas écrit'}</summary>${bloc(b)}</details>`)
          .join('')}`
      : ''
  }
<p class="note">Budget de ces analyses ce mois-ci : ${depenseBilansDuMois(donnees).toFixed(2)} $ sur ${plafond} $ maximum, séparé du budget factures et Discuter. L'espace concurrence (3 à 5 références par projet) n'est pas encore branché.</p>
<style>
.bilan { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:16px 20px; }
.bilan h3 { margin:0 0 10px; }
.bilan p, .bilan-ancien p { margin:0 0 10px; max-width:70ch; }
.note { color:var(--doux); font-size:13px; }
.bilan .note { margin:4px 0 0; }
.bilan-ancien { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:10px 16px; margin-bottom:10px; }
.bilan-ancien summary { cursor:pointer; font-weight:600; }
.bilan-ancien p:first-of-type { margin-top:10px; }
.vide { color:var(--doux); }
h3 { font-size:16px; margin:24px 0 10px; }
</style>`;
  return gabarit({ onglet: 'analyses', aRepondre, contenu });
}
