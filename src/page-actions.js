// Page « Actions » : chaque problème a sa fiche, et tout ce qui attend une
// décision ou un geste de louis est au même endroit.
import { gabarit } from './page.js';
import { STATUTS_ACTION } from './actions.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const heure = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '—');
const court = (t, n = 140) => (t.length > n ? `${t.slice(0, n)}…` : t);

// Les statuts où c'est à louis de jouer passent devant.
const A_TOI = new Set(['question_posee', 'proposition_a_valider', 'a_transmettre', 'resultat_a_verifier']);

export function pageActions({ configJournal, actions = [], cartes = [], idees = [], aRepondre = 0 }) {
  const nomBusiness = (id) => configJournal.projets.find((p) => p.id === id)?.nom ?? id;

  const ouvertes = actions
    .filter((a) => a.statut !== 'resolu')
    .sort((x, y) => (A_TOI.has(y.statut) ? 1 : 0) - (A_TOI.has(x.statut) ? 1 : 0) || y.maj.localeCompare(x.maj));
  const resolues = actions.filter((a) => a.statut === 'resolu').slice(0, 10);
  const objectifs = cartes.filter((c) => c.couleur !== 'gris' && !c.objectif?.valide);
  const proposees = (idees ?? []).filter((i) => i.statut === 'proposee');

  const ligne = ({ texte, detail, href, action, aToi }) =>
    `<li${aToi ? ' class="a-toi"' : ''}><div><b>${texte}</b>${detail ? `<small>${detail}</small>` : ''}</div><a href="${href}">${action} ›</a></li>`;
  const bloc = (titre, lignes) => (lignes.length ? `<section class="bloc-actions"><h3>${titre} <small>(${lignes.length})</small></h3><ul class="liste-actions">${lignes.join('')}</ul></section>` : '');

  const ficheLigne = (a) =>
    ligne({
      texte: e(court(a.titre)),
      detail: `${e(a.projet || 'Cerveau central')} · ${e(STATUTS_ACTION[a.statut]?.nom ?? a.statut)} · ${heure(a.maj)}`,
      href: `/action?id=${e(a.id)}`,
      action: 'Ouvrir',
      aToi: A_TOI.has(a.statut),
    });

  const blocs = [
    bloc('Problèmes ouverts, une fiche chacun', ouvertes.map(ficheLigne)),
    bloc('Objectifs à valider', objectifs.map((c) => ligne({ texte: `${e(c.nom)} : ${c.objectif.propose} par semaine (proposé)`, href: '/journal', action: 'Valider' }))),
    bloc('Questions du jour', aRepondre ? [ligne({ texte: `${aRepondre} question(s) attendent tes réponses`, href: '/questions', action: 'Répondre' })] : []),
    bloc('Tes idées, pas encore traitées', proposees.map((i) => ligne({ texte: e(court(i.texte)), detail: `${e(nomBusiness(i.projet))} · proposée le ${heure(i.cree)}`, href: `/projet?projet=${e(i.projet)}`, action: 'Ouvrir' }))),
  ].filter(Boolean);

  const contenu = `${blocs.length ? blocs.join('\n') : '<p class="vide">Rien n’attend ta décision pour l’instant : pas de problème ouvert, pas de question, pas d’idée en attente.</p>'}
${resolues.length ? `<details class="resolues"><summary>Fiches résolues récentes (${resolues.length})</summary><ul class="liste-actions">${resolues.map(ficheLigne).join('')}</ul></details>` : ''}
<style>
.bloc-actions { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:14px 18px; margin-bottom:14px; }
.bloc-actions h3 { margin:0 0 6px; font-size:15px; }
.bloc-actions h3 small { color:var(--doux); font-weight:400; }
.liste-actions { list-style:none; margin:0; padding:0; }
.liste-actions li { display:flex; justify-content:space-between; align-items:center; gap:14px; padding:9px 0; border-top:1px solid var(--bord); }
.liste-actions li:first-child { border-top:0; }
.liste-actions li div { display:flex; flex-direction:column; min-width:0; }
.liste-actions b { font-weight:600; font-size:14px; }
.liste-actions li.a-toi b::before { content:'●'; color:var(--or); margin-right:7px; font-size:11px; }
.liste-actions small { color:var(--doux); font-size:12px; }
.liste-actions a { white-space:nowrap; font-size:13px; font-weight:600; text-decoration:none; }
.resolues { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:10px 18px; }
.resolues summary { cursor:pointer; font-weight:600; font-size:14px; }
.vide { color:var(--doux); }
</style>`;
  return gabarit({ onglet: 'actions', aRepondre, contenu });
}
