// Page « Actions » : tout ce qui attend une décision ou un geste de louis, au même endroit.
import { gabarit } from './page.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const heure = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '—');

export function pageActions({ config, configJournal, etat, cartes = [], idees = [], aRepondre = 0 }) {
  const nomSurveillance = (id) => config.projets.find((p) => p.id === id)?.nom ?? id;
  const nomBusiness = (id) => configJournal.projets.find((p) => p.id === id)?.nom ?? id;

  const pannes = Object.values(etat.verifications ?? {}).filter((v) => v.etat === 'panne');
  const aDecider = cartes.flatMap((c) => (c.aDecider ?? []).map((t) => ({ id: c.id, nom: c.nom, texte: t })));
  const objectifs = cartes.filter((c) => c.couleur !== 'gris' && !c.objectif?.valide);
  const proposees = (idees ?? []).filter((i) => i.statut === 'proposee');

  const ligne = ({ texte, detail, href, action }) => `<li><div><b>${texte}</b>${detail ? `<small>${detail}</small>` : ''}</div><a href="${href}">${action} ›</a></li>`;
  const bloc = (titre, lignes) => (lignes.length ? `<section class="bloc-actions"><h3>${titre} <small>(${lignes.length})</small></h3><ul class="liste-actions">${lignes.join('')}</ul></section>` : '');

  const blocs = [
    bloc('En panne, à régler', pannes.map((v) => ligne({ texte: `${e(nomSurveillance(v.projet))} : ${e(v.sens ?? v.detail)}`, detail: `depuis ${heure(v.depuis)}`, href: '/', action: 'Voir' }))),
    bloc('À décider', aDecider.map((d) => ligne({ texte: e(d.texte), detail: e(d.nom), href: `/projet?projet=${e(d.id)}`, action: 'Ouvrir' }))),
    bloc('Objectifs à valider', objectifs.map((c) => ligne({ texte: `${e(c.nom)} : ${c.objectif.propose} par semaine (proposé)`, href: '/journal', action: 'Valider' }))),
    bloc('Questions du jour', aRepondre ? [ligne({ texte: `${aRepondre} question(s) attendent tes réponses`, href: '/questions', action: 'Répondre' })] : []),
    bloc('Tes idées, pas encore traitées', proposees.map((i) => ligne({ texte: e(i.texte.length > 140 ? `${i.texte.slice(0, 140)}…` : i.texte), detail: `${e(nomBusiness(i.projet))} · proposée le ${heure(i.cree)}`, href: `/projet?projet=${e(i.projet)}`, action: 'Ouvrir' }))),
  ].filter(Boolean);

  const contenu = `${blocs.length ? blocs.join('\n') : '<p class="vide">Rien n’attend ta décision pour l’instant : pas de panne, pas de question ouverte, pas d’idée en attente.</p>'}
<style>
.bloc-actions { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:14px 18px; margin-bottom:14px; }
.bloc-actions h3 { margin:0 0 6px; font-size:15px; }
.bloc-actions h3 small { color:var(--doux); font-weight:400; }
.liste-actions { list-style:none; margin:0; padding:0; }
.liste-actions li { display:flex; justify-content:space-between; align-items:center; gap:14px; padding:9px 0; border-top:1px solid var(--bord); }
.liste-actions li:first-child { border-top:0; }
.liste-actions li div { display:flex; flex-direction:column; min-width:0; }
.liste-actions b { font-weight:600; font-size:14px; }
.liste-actions small { color:var(--doux); font-size:12px; }
.liste-actions a { white-space:nowrap; font-size:13px; font-weight:600; text-decoration:none; }
.vide { color:var(--doux); }
</style>`;
  return gabarit({ onglet: 'actions', aRepondre, contenu });
}
