// Le journal des décisions des loops (demande de louis du 20/10) : chaque loop note déjà
// ce qu'elle change quelque part (revues et leçons de la loop restaurateurs, journal du
// site VégéBudget, compte rendu de Petites histoires vraies, leçons du grand public).
// Le cerveau rassemble tout ça toutes les 10 minutes dans un historique daté qui ne
// s'efface jamais (data/decisions-loops.json), y compris les semaines où la loop garde
// sa méthode et dit pourquoi : c'est la preuve qu'elle se remet en question. Puis il
// recopie chaque nouvelle ligne dans la table Notion « Décisions des loops », sans IA.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sauverEtat as sauverJson } from './etat.js';
import { jourParis } from './questions.js';

export const LOOPS = {
  'nm-resto': { nom: 'Nūr Meet restaurateurs', projet: 'nour-meet' },
  'nm-public': { nom: 'Nūr Meet grand public', projet: 'nour-meet' },
  vege: { nom: 'VégéBudget', projet: 'vegebudget' },
  phv: { nom: 'Petites histoires vraies', projet: 'histoires-vraies' },
};
export const TYPES = ['Changé', 'Gardé', 'Leçon', 'Question à louis', 'Geste de louis'];
// La table Notion « 📜 Décisions des loops », sous la page « Loops des projets » (créée le 20/10).
export const SOURCE_NOTION = '3ab0687a-1696-4c73-b14a-64b3c328d37f';
export const LIEN_NOTION = 'https://app.notion.com/p/1d6b9e2267e94c41b05a5a2a39b1f7e2';

const empreinte = (t) => createHash('sha256').update(String(t)).digest('hex').slice(0, 12);
const jour = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? '')) ? String(v).slice(0, 10) : null);
const jourDe = (iso) => (Number.isNaN(Date.parse(iso)) ? null : jourParis(new Date(iso)));
const txt = (v, max = 1900) => String(v ?? '').trim().slice(0, max);

// Le type donné par une loop venue d'ailleurs (« gardé », « arrêté »…), ramené aux cinq de la table.
export function typeDe(brut) {
  const t = String(brut ?? '').toLowerCase();
  if (/gard|maint|rien chang/.test(t)) return 'Gardé';
  if (/le[cç]on|arr[eê]t|abandon/.test(t)) return 'Leçon';
  if (/question/.test(t)) return 'Question à louis';
  if (/louis/.test(t)) return 'Geste de louis';
  return 'Changé';
}

// Toutes les décisions visibles aujourd'hui dans les loops ; `date` vide = « vue ce jour ».
export function collecterDecisions({ loopNour, business, loopHistoires } = {}) {
  const d = [];
  const ajouter = (loop, cle, date, type, quoi, pourquoi = '') => {
    if (txt(quoi)) d.push({ cle: `${loop}:${cle}`, loop, date: jour(date), type, quoi: txt(quoi), pourquoi: txt(pourquoi) });
  };

  // Nūr Meet restaurateurs : chaque revue du lundi (changée, gardée ou question), les gestes de louis, les leçons.
  for (const r of loopNour?.revues ?? []) {
    if (r.erreur && !r.question) continue;
    const date = jourDe(r.quand) ?? r.semaine;
    if (r.question) ajouter('nm-resto', `revue:${r.semaine}`, date, 'Question à louis', `Propose : ${r.changements.join(' ')} — ${r.question}`, r.pourquoi);
    else if (r.changer) ajouter('nm-resto', `revue:${r.semaine}`, date, 'Changé', `Version ${r.version} : ${r.changements.join(' ')}`, r.pourquoi);
    else ajouter('nm-resto', `revue:${r.semaine}`, date, 'Gardé', `Méthode v${(loopNour.historique ?? []).filter((h) => jourDe(h.quand) <= date).at(-1)?.version ?? '?'} gardée cette semaine${r.changements?.length ? ` (${r.changements.join(' ')})` : ''}`, r.pourquoi);
  }
  for (const h of loopNour?.historique ?? []) {
    if (h.par === 'départ' || h.par === 'la loop (revue du lundi)') continue;
    ajouter('nm-resto', `v${h.version}`, jourDe(h.quand), /louis/.test(h.par) ? 'Geste de louis' : 'Changé', `Version ${h.version} (${h.par}) : ${(h.changements ?? []).join(' ')}`, h.pourquoi);
  }
  for (const l of loopNour?.lecons ?? []) ajouter('nm-resto', `lecon:${empreinte(l.texte)}`, l.semaine, 'Leçon', l.texte);

  // Nūr Meet grand public : décisions et leçons envoyées par le relevé du site.
  const np = business?.sources?.nourPublic;
  for (const x of np?.decisions ?? []) ajouter('nm-public', `${x.date}:${empreinte(x.quoi)}`, x.date, typeDe(x.type), x.quoi, x.pourquoi);
  for (const l of np?.lecons ?? []) ajouter('nm-public', `lecon:${empreinte(l)}`, null, 'Leçon', l);

  // VégéBudget : le journal de la loop du site (une entrée sans changement = version gardée).
  for (const j of business?.sources?.vegebudget?.loop?.journal ?? []) {
    const changements = (j.changements ?? []).filter(Boolean);
    const pourquoi = [j.pourquoi, j.mesure ? `Mesure : ${j.mesure}` : ''].filter(Boolean).join(' ');
    ajouter('vege', `${j.date}:v${j.version}:${empreinte(changements.join('|'))}`, j.date, changements.length ? 'Changé' : 'Gardé', changements.length ? `Version ${j.version} : ${changements.join(' ')}` : `Version ${j.version} gardée`, pourquoi);
  }

  // Petites histoires vraies : le compte rendu poussé par le projet 3_PETITES HISTOIRES.
  if (loopHistoires && !loopHistoires.erreur) {
    for (const x of loopHistoires.decisions ?? []) ajouter('phv', `${x.date}:${empreinte(x.quoi)}`, x.date, typeDe(x.type), x.quoi, x.pourquoi);
    for (const l of loopHistoires.lecons ?? []) {
      const texte = typeof l === 'string' ? l : l?.texte;
      ajouter('phv', `lecon:${empreinte(texte)}`, typeof l === 'string' ? null : l?.date, 'Leçon', texte);
    }
  }
  return d;
}

export async function chargerDecisions(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return { decisions: [] };
  }
}
export const sauverDecisions = sauverJson;

// Ajoute à l'historique ce qui est nouveau ; rien n'est jamais réécrit ni effacé
// (une loop qui oublie ses vieilles lignes ne les fait pas disparaître d'ici).
export function fusionnerDecisions(archive, trouvees, maintenant = new Date()) {
  const connues = new Set(archive.decisions.map((x) => x.cle));
  const neuves = [];
  for (const x of trouvees) {
    if (connues.has(x.cle)) continue;
    connues.add(x.cle);
    const ligne = { ...x, date: x.date ?? jourParis(maintenant), vu: maintenant.toISOString(), notion: false };
    archive.decisions.push(ligne);
    neuves.push(ligne);
  }
  archive.decisions.sort((a, b) => (a.date === b.date ? a.vu.localeCompare(b.vu) : a.date.localeCompare(b.date)));
  archive.decisions = archive.decisions.slice(-3000);
  return neuves;
}

const texteNotion = (t) => [{ type: 'text', text: { content: txt(t, 1990) } }];
export const pageNotion = (x, source = SOURCE_NOTION) => ({
  parent: { type: 'data_source_id', data_source_id: source },
  properties: {
    Décision: { title: texteNotion(x.quoi) },
    Date: { date: { start: x.date } },
    Loop: { select: { name: LOOPS[x.loop]?.nom ?? x.loop } },
    Type: { select: { name: TYPES.includes(x.type) ? x.type : 'Changé' } },
    Pourquoi: { rich_text: texteNotion(x.pourquoi || '—') },
    Source: { rich_text: texteNotion('cerveau central') },
    Clé: { rich_text: texteNotion(x.cle) },
  },
});

// Recopie dans Notion les lignes pas encore envoyées (30 par tour au plus). Les clés déjà
// présentes dans la table (ajoutées à la main ou par un tour coupé) ne sont pas recréées.
export async function envoyerNotion(archive, { jeton, source = SOURCE_NOTION, fetch: f = fetch, max = 30 } = {}) {
  const enAttente = archive.decisions.filter((x) => !x.notion);
  if (!jeton || !enAttente.length) return { envoyees: 0, attente: enAttente.length };
  const entetes = { authorization: `Bearer ${jeton}`, 'notion-version': '2025-09-03', 'content-type': 'application/json' };
  const appel = async (chemin, corps) => {
    const r = await f(`https://api.notion.com/v1/${chemin}`, { method: 'POST', headers: entetes, body: JSON.stringify(corps) });
    if (!r.ok) throw new Error(`Notion ${r.status} : ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };
  const presentes = new Set();
  let curseur;
  do {
    const r = await appel(`data_sources/${source}/query`, { page_size: 100, ...(curseur ? { start_cursor: curseur } : {}) });
    for (const p of r.results ?? []) {
      const cle = (p.properties?.['Clé']?.rich_text ?? []).map((t) => t.plain_text ?? t.text?.content ?? '').join('');
      if (cle) presentes.add(cle);
    }
    curseur = r.has_more ? r.next_cursor : null;
  } while (curseur);
  let envoyees = 0;
  for (const x of enAttente.slice(0, max)) {
    if (!presentes.has(x.cle)) {
      await appel('pages', pageNotion(x, source));
      envoyees += 1;
    }
    x.notion = true;
  }
  return { envoyees, attente: archive.decisions.filter((x) => !x.notion).length };
}

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const date = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
const ICONES = { Changé: '🔧', Gardé: '✋', Leçon: '📘', 'Question à louis': '❓', 'Geste de louis': '👤' };

// Le bloc « Historique des décisions » d'une page projet : les 15 dernières, les plus récentes en haut.
export function htmlDecisions(archive, projet) {
  const lignes = (archive?.decisions ?? []).filter((x) => LOOPS[x.loop]?.projet === projet).slice(-15).reverse();
  if (!lignes.length) return '';
  const plusieurs = new Set(lignes.map((x) => x.loop)).size > 1;
  return `<section class="bloc"><h3>📜 Historique des décisions de la loop</h3>
<ul>${lignes.map((x) => `<li>${date(x.date)} · ${ICONES[x.type] ?? ''} <b>${e(x.type)}</b>${plusieurs ? ` (${e(LOOPS[x.loop].nom)})` : ''} : ${e(x.quoi)}${x.pourquoi ? `<br><small>${e(x.pourquoi)}</small>` : ''}</li>`).join('')}</ul>
<p class="vide petit-texte">Tout l'historique, daté et jamais effacé, est recopié dans Notion : <a href="${LIEN_NOTION}">Décisions des loops</a>.</p></section>`;
}
