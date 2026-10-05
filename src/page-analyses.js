// Page « Analyses » : le bilan du lundi (écrit par Claude chaque lundi matin) et ses archives.
import { gabarit } from './page.js';
import { depenseBilansDuMois } from './bilan.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dateLisible = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

// Mise en forme minimale du texte du bilan : on échappe tout, puis on ne reconnaît
// que les titres (#), le gras (**) et les listes (-), au cas où Claude en glisse malgré la consigne.
const gras = (t) => t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const paragraphes = (texte) =>
  String(texte)
    .split(/\n{2,}/)
    .map((bloc) => {
      const morceaux = [];
      let liste = [];
      const finListe = () => {
        if (liste.length) morceaux.push(`<ul>${liste.map((x) => `<li>${x}</li>`).join('')}</ul>`);
        liste = [];
      };
      for (const brut of bloc.split('\n')) {
        const l = gras(e(brut));
        const titre = l.match(/^#{1,6}\s+(.*)$/);
        const puce = l.match(/^[-•*]\s+(.*)$/);
        if (titre) { finListe(); morceaux.push(`<h4>${titre[1]}</h4>`); }
        else if (puce) liste.push(puce[1]);
        else { finListe(); if (l.trim()) morceaux.push(`<p>${l}</p>`); }
      }
      finListe();
      return morceaux.join('');
    })
    .join('');

export function pageAnalyses(donnees, { aRepondre = 0, plafond = 10, actif = false } = {}) {
  const [dernier, ...anciens] = donnees.bilans ?? [];
  const bloc = (b) =>
    b.texte
      ? paragraphes(b.texte)
      : `<p class="vide">Pas de bilan cette semaine-là : ${e(b.erreur ?? 'raison inconnue')}</p>`;

  const contenu = `${
    dernier
      ? `<section class="bilan"><h3>Bilan du ${dateLisible(dernier.semaine)}</h3>${bloc(dernier)}
<p class="note">Ce sont des propositions : c'est toi qui décides, rien ne se change tout seul.</p>${
          actif
            ? `
<form class="refaire" method="post" action="/analyses/refaire" onsubmit="return confirm('Réécrire le bilan de cette semaine ? L’actuel sera remplacé.')"><button>Refaire le bilan de cette semaine</button></form>`
            : ''
        }</section>`
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
.bilan h4, .bilan-ancien h4 { margin:14px 0 6px; font-size:14px; }
.bilan ul, .bilan-ancien ul { margin:0 0 10px; padding-left:20px; max-width:70ch; }
.bilan li, .bilan-ancien li { margin:0 0 4px; }
.refaire { margin-top:12px; }
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
