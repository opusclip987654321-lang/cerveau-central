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

const TYPES_FICHE = { blocage: ['Blocage', 'panne'], amelioration: ['Amélioration', 'or'], donnee_manquante: ['Donnée manquante', 'doux'] };

export function pageAnalyses(donnees, { aRepondre = 0, plafond = 10, actif = false, nomProjet = (id) => id } = {}) {
  const [dernier, ...anciens] = donnees.bilans ?? [];
  const ficheHtml = (f) => {
    const [nomType, classe] = TYPES_FICHE[f.type] ?? TYPES_FICHE.amelioration;
    return `<article class="fiche-b ${classe}"><p class="tete-b"><span class="type-b ${classe}">${nomType}</span>${f.projet ? `<b>${e(nomProjet(f.projet))}</b>` : '<b>Ensemble des projets</b>'}</p>
<p class="constat-b">${e(f.constat)}</p>
${f.consequence ? `<p class="csq-b">${e(f.consequence)}</p>` : ''}
${f.proposition ? `<p class="prop-b"><b>Proposition :</b> ${e(f.proposition)}</p>` : ''}
${f.action ? `<p class="lien-b"><a href="/action?id=${e(f.action)}">Ouvrir l’action ›</a></p>` : ''}</article>`;
  };
  const bloc = (b) =>
    b.fiches?.length
      ? `<div class="fiches-b">${b.fiches.map(ficheHtml).join('')}</div>`
      : b.texte
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
.fiches-b { display:grid; gap:10px; }
.fiche-b { background:var(--carte2); border:1px solid var(--bord); border-radius:10px; padding:12px 14px; }
.fiche-b.panne { border-left:4px solid var(--panne); }
.fiche-b.or { border-left:4px solid var(--or); }
.fiche-b.doux { border-left:4px solid var(--bord); }
.tete-b { margin:0 0 6px; display:flex; align-items:center; gap:10px; }
.type-b { font-size:11px; font-weight:650; padding:2px 9px; border-radius:999px; background:var(--carte); border:1px solid var(--bord); color:var(--doux); }
.type-b.panne { color:var(--panne); border-color:color-mix(in srgb, var(--panne) 45%, transparent); }
.type-b.or { color:var(--or); border-color:color-mix(in srgb, var(--or) 45%, transparent); }
.constat-b { margin:0 0 6px; font-weight:600; }
.csq-b { margin:0 0 6px; color:var(--doux); }
.prop-b { margin:0; }
.lien-b { margin:6px 0 0; } .lien-b a { font-size:13px; font-weight:600; text-decoration:none; }
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
