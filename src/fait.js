// « J'ai fait aujourd'hui » (demande de louis du 23/10) : tout ce que les automatisations
// et les fils Claude ont fait pour lui pendant qu'il avait le dos tourné, projet par projet.
// Sans IA. Deux sortes de sources :
// - ce que le cerveau lit déjà (prospection Nūr Meet, Leviaro, Impacteur, vidéos YouTube,
//   posts du grand public, boîtes mail, décisions des loops, journal, exécutions n8n) ;
// - la table Notion « ✅ Fait pour Walid », où chaque fil Claude, tâche programmée ou loop
//   sur l'abonnement écrit une ligne par tour (les fils n'ont pas le jeton du cerveau, mais
//   ils ont tous Notion). Le cerveau la relit toutes les 10 minutes (data/fait-notion.json).
import { readFile } from 'node:fs/promises';
import { sauverEtat as sauverJson } from './etat.js';
import { jourParis } from './questions.js';
import { projetDuWorkflow } from './journal.js';
import { chainesYoutube } from './youtube.js';
import { LOOPS } from './decisions.js';

// La table Notion « ✅ Fait pour Walid », sous « Loops des projets » (créée le 23/10).
export const SOURCE_FAIT = '42ba9598-5222-4a19-8868-805d96950346';
export const LIEN_FAIT = 'https://app.notion.com/p/f82d8065e5ee4f369504cdfef77078b2';

// Le choix « Projet » de la table → l'identifiant du projet dans config/journal.json.
export const PROJETS_NOTION = {
  'Nūr Meet': 'nour-meet',
  Leviaro: 'leviaro',
  Impacteur: 'impacteur',
  'Petites histoires vraies': 'histoires-vraies',
  VégéBudget: 'vegebudget',
  Cambodge: 'cambodge',
  "L'extrait politique": 'extrait-politique',
  Cerveau: 'cerveau',
  Autre: 'autre',
};

export async function chargerFaitNotion(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return { lignes: [], maj: null };
  }
}
export const sauverFaitNotion = sauverJson;

const texteDe = (prop) => (prop?.title ?? prop?.rich_text ?? []).map((t) => t.plain_text ?? t.text?.content ?? '').join('').trim();

// Une ligne de la table, ou null si elle n'a ni texte ni date lisible.
export function ligneNotion(p) {
  const pr = p.properties ?? {};
  const quoi = texteDe(pr.Quoi).slice(0, 300);
  const debut = pr.Date?.date?.start ?? p.created_time ?? null;
  if (!quoi || !debut || Number.isNaN(Date.parse(debut))) return null;
  // Une date sans heure (« 2026-10-23 ») reste ce jour-là, quel que soit le fuseau.
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(debut) ? debut : jourParis(new Date(debut));
  const nombre = typeof pr.Nombre?.number === 'number' ? pr.Nombre.number : null;
  const lien = /^https?:\/\//.test(pr.Lien?.url ?? '') ? pr.Lien.url : null;
  const nomProjet = pr.Projet?.select?.name ?? null;
  return { id: p.id, quand: debut.length > 10 ? new Date(debut).toISOString() : null, jour, projet: PROJETS_NOTION[nomProjet] ?? 'autre', quoi, nombre, lien, par: texteDe(pr.Par).slice(0, 80) || null };
}

// Relit les lignes des 14 derniers jours. Sans NOTION_TOKEN, rien ne change.
export async function lireFaitNotion(donnees, { jeton, source = SOURCE_FAIT, fetch: f = fetch, maintenant = new Date(), jours = 14 } = {}) {
  if (!jeton) return { ignore: true };
  const depuis = jourParis(new Date(maintenant - jours * 86_400_000));
  const entetes = { authorization: `Bearer ${jeton}`, 'notion-version': '2025-09-03', 'content-type': 'application/json' };
  const lignes = [];
  let curseur;
  do {
    const r = await f(`https://api.notion.com/v1/data_sources/${source}/query`, {
      method: 'POST',
      headers: entetes,
      body: JSON.stringify({ page_size: 100, filter: { property: 'Date', date: { on_or_after: depuis } }, ...(curseur ? { start_cursor: curseur } : {}) }),
    });
    if (!r.ok) throw new Error(`Notion ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const rep = await r.json();
    for (const p of rep.results ?? []) {
      const l = ligneNotion(p);
      if (l) lignes.push(l);
    }
    curseur = rep.has_more ? rep.next_cursor : null;
  } while (curseur && lignes.length < 2000);
  donnees.lignes = lignes.sort((a, b) => (a.quand ?? a.jour).localeCompare(b.quand ?? b.jour));
  donnees.maj = maintenant.toISOString();
  donnees.erreur = null;
  return { lignes: lignes.length };
}

const n = (x) => x.toLocaleString('fr-FR');
const pluriel = (x, un, plusieurs = `${un}s`) => `${n(x)} ${x > 1 ? plusieurs : un}`;
const noms = (l, max = 5) => {
  const propres = l.filter(Boolean);
  return propres.length ? `${propres.slice(0, max).join(', ')}${propres.length > max ? ` et ${propres.length - max} autre(s)` : ''}` : null;
};

// Tout ce qui a été fait le jour `jour`, rangé par projet. Chaque ligne dit qui l'a fait
// (`par`) : une automatisation, une loop ou un fil Claude.
export function faitDuJour({ business = {}, journal = { evenements: [], n8n: { jours: {} } }, configJournal, decisions = { decisions: [] }, faitNotion = { lignes: [] }, jour = jourParis() }) {
  const s = business.sources ?? {};
  const groupes = new Map();
  const ajouter = (projet, ligne) => {
    if (!groupes.has(projet)) groupes.set(projet, { lignes: [], automatisations: [] });
    groupes.get(projet).lignes.push(ligne);
  };

  // Nūr Meet restaurateurs (n8n « Nour Meet 1, 3, 4 »).
  const pr = s.prospection;
  if (pr) {
    const trouves = pr.prospects.filter((x) => x.decouvert === jour);
    if (trouves.length) ajouter('nour-meet', { icone: '🔎', texte: `${pluriel(trouves.length, 'restaurant trouvé', 'restaurants trouvés')} et leur adresse mail cherchée (${pluriel(trouves.filter((x) => x.email).length, 'adresse trouvée', 'adresses trouvées')})`, par: 'n8n Nour Meet 1' });
    const envoyes = pr.envois.filter((x) => x.statut === 'envoye' && x.jour === jour);
    if (envoyes.length) ajouter('nour-meet', { icone: '✉️', texte: `${pluriel(envoyes.length, 'mail de prospection envoyé', 'mails de prospection envoyés')} aux restaurants (premiers mails et relances)`, detail: noms(envoyes.map((x) => x.nom)), par: 'n8n Nour Meet 1 et 3' });
    const reponses = (pr.reponses ?? []).filter((x) => x.jour === jour);
    if (reponses.length) ajouter('nour-meet', { icone: '📥', texte: `${pluriel(reponses.length, 'réponse de restaurant lue et rangée', 'réponses de restaurants lues et rangées')}`, detail: noms(reponses.map((x) => x.nom ?? x.de)), par: 'n8n Nour Meet 4' });
  }
  // Nūr Meet grand public : les posts publiés par la loop.
  for (const p of (s.nourPublic?.posts ?? []).filter((x) => x.jour === jour)) {
    const reseaux = [p.fb && 'Facebook', p.insta && 'Instagram'].filter(Boolean);
    if (reseaux.length) ajouter('nour-meet', { icone: '📣', texte: `Post publié sur ${reseaux.join(' et ')}${p.format ? ` (${p.format})` : ''}`, par: 'loop grand public' });
  }

  // Leviaro (agent ~/leviaro-agent).
  const lv = s.leviaro;
  if (lv) {
    const trouvees = (lv.entreprises ?? []).filter((j) => j === jour).length;
    if (trouvees) ajouter('leviaro', { icone: '🔎', texte: `${pluriel(trouvees, 'entreprise trouvée', 'entreprises trouvées')} comme prospects`, par: 'agent Leviaro' });
    const env = (lv.envois ?? []).filter((x) => x.jour === jour);
    const premiers = env.filter((x) => x.etape === 0).length;
    if (env.length) ajouter('leviaro', { icone: '✉️', texte: `${pluriel(env.length, 'mail de prospection envoyé', 'mails de prospection envoyés')}${env.length - premiers ? ` (${n(premiers)} premiers contacts, ${n(env.length - premiers)} relances)` : ''}`, par: 'agent Leviaro' });
    const rep = (lv.reponses ?? []).filter((x) => x.jour === jour).length;
    if (rep) ajouter('leviaro', { icone: '📥', texte: `${pluriel(rep, 'réponse lue', 'réponses lues')}`, par: 'agent Leviaro' });
  }

  // Impacteur : invitations (n8n IMPACTEUR C) et réponses lues (CERVEAU - réponses Impacteur).
  const im = s.impacteur;
  if (im) {
    const invites = im.fiches.filter((f) => f.envoi === jour);
    if (invites.length) ajouter('impacteur', { icone: '✉️', texte: `${pluriel(invites.length, 'invitation envoyée', 'invitations envoyées')} à des auteurs`, detail: noms(invites.map((f) => f.auteur)), par: 'n8n IMPACTEUR C' });
    const lues = im.fiches.filter((f) => f.reponse === jour);
    if (lues.length) ajouter('impacteur', { icone: '📥', texte: `${pluriel(lues.length, 'réponse d’invité lue et classée', 'réponses d’invités lues et classées')}`, detail: noms(lues.map((f) => f.auteur)), par: 'CERVEAU - réponses Impacteur' });
  }

  // Vidéos publiées sur les chaînes YouTube suivies.
  for (const c of chainesYoutube(business)) {
    for (const v of c.videos.filter((x) => x.jour === jour)) ajouter(c.projet, { icone: '🎬', texte: `Vidéo publiée : ${v.titre ?? 'sans titre'}`, lien: v.id ? `https://youtu.be/${v.id}` : null, par: c.titre ?? 'YouTube' });
  }

  // Les 6 boîtes mail : relues chaque heure, mails importants mis de côté.
  const bo = s.boites;
  if (bo?.maj && jourParis(new Date(bo.maj)) === jour) {
    const lues = Object.values(bo.etat ?? {}).filter((x) => x.lue).length;
    const reperes = (bo.mails ?? []).filter((m) => m.jour === jour);
    ajouter('cerveau', { icone: '📬', texte: `${pluriel(lues, 'boîte mail relue', 'boîtes mail relues')} chaque heure${reperes.length ? `, ${pluriel(reperes.length, 'mail important repéré', 'mails importants repérés')} pour toi` : ', rien d’important'}`, par: 'n8n CERVEAU - boîtes' });
  }

  // Décisions des loops du jour (recopiées dans Notion « Décisions des loops »).
  for (const d of decisions.decisions.filter((x) => x.date === jour)) {
    const loop = LOOPS[d.loop];
    const t = `${d.type} : ${d.quoi}`;
    ajouter(loop?.projet ?? 'autre', { icone: '🧭', texte: t.length > 160 ? `${t.slice(0, 159)}…` : t, par: `loop ${loop?.nom ?? d.loop}${d.notion ? ', noté dans Notion' : ''}` });
  }

  // Ce que n8n ou un script a noté dans le journal, et les notes de la page Journal.
  for (const e of journal.evenements.filter((x) => x.jour === jour)) {
    ajouter(e.projet, { icone: configJournal?.types?.[e.type] ?? '•', texte: e.titre, detail: e.details, lien: e.lien, par: e.source === 'page' ? 'note ajoutée sur la page' : e.source === 'n8n' ? 'automatisation' : e.source });
  }

  // Ce que les fils Claude et les loops sur l'abonnement ont déclaré dans Notion.
  for (const l of faitNotion.lignes.filter((x) => x.jour === jour)) {
    ajouter(l.projet, { icone: '🤖', texte: l.nombre !== null && !l.quoi.includes(String(l.nombre)) ? `${l.quoi} (${n(l.nombre)})` : l.quoi, lien: l.lien, par: l.par ?? 'un fil Claude', heure: l.quand });
  }

  // Les exécutions n8n du jour, rangées dans leur projet.
  for (const [nom, c] of Object.entries(journal.n8n?.jours?.[jour] ?? {})) {
    const brut = projetDuWorkflow(nom, configJournal, journal.n8n.instances?.[nom]);
    // Les automatisations du cerveau lui-même (« CERVEAU - boîtes »…) vont avec ce qu'il fait pour louis.
    const id = brut === 'autre' && /cerveau/i.test(nom) ? 'cerveau' : brut;
    if (!groupes.has(id)) groupes.set(id, { lignes: [], automatisations: [] });
    groupes.get(id).automatisations.push({ nom, ...c });
  }

  const ordre = [...(configJournal?.projets ?? []).map((p) => p.id).filter((id) => id !== 'autre'), 'cerveau', 'autre'];
  const nomDe = (id) => (id === 'cerveau' ? 'Cerveau (pour toi)' : configJournal?.projets?.find((p) => p.id === id)?.nom ?? id);
  const projets = [...groupes.entries()]
    .map(([id, g]) => ({ id, nom: nomDe(id), lignes: g.lignes, automatisations: g.automatisations.sort((a, b) => b.ok + b.erreur - (a.ok + a.erreur)) }))
    .sort((a, b) => (ordre.indexOf(a.id) + 1 || 99) - (ordre.indexOf(b.id) + 1 || 99));
  return {
    jour,
    projets,
    total: projets.reduce((t, p) => t + p.lignes.length, 0),
    executions: projets.reduce((t, p) => t + p.automatisations.reduce((a, c) => a + c.ok, 0), 0),
    erreurs: projets.reduce((t, p) => t + p.automatisations.reduce((a, c) => a + c.erreur, 0), 0),
    notionLu: faitNotion.maj ?? null,
    notionErreur: faitNotion.erreur ?? null,
  };
}

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

// Le bloc HTML (page Aujourd'hui et page /fait).
export function htmlFait(fait) {
  const projets = fait.projets.filter((p) => p.lignes.length || p.automatisations.length);
  const corps = projets.length
    ? `<div class="fait-projets">${projets
        .map((p) => {
          const ok = p.automatisations.reduce((a, c) => a + c.ok, 0);
          const ko = p.automatisations.reduce((a, c) => a + c.erreur, 0);
          const lignes = p.lignes
            .map((l) => `<li><span class="ic">${e(l.icone)}</span><span>${l.lien ? `<a href="${e(l.lien)}" target="_blank" rel="noopener">${e(l.texte)}</a>` : e(l.texte)}${l.detail ? `<small class="det">${e(l.detail)}</small>` : ''}<small class="par">${l.heure ? `${heure(l.heure)} · ` : ''}${e(l.par)}</small></span></li>`)
            .join('');
          const auto = p.automatisations.length
            ? `<details class="fait-auto"><summary>⚙️ ${pluriel(ok, 'exécution réussie', 'exécutions réussies')} d’automatisations${ko ? ` · <b class="ko">${n(ko)} en erreur</b>` : ''}</summary><ul>${p.automatisations.map((a) => `<li>${e(a.nom)} : ${n(a.ok)}${a.erreur ? ` <b class="ko">(${n(a.erreur)} en erreur)</b>` : ''}</li>`).join('')}</ul></details>`
            : '';
          return `<article class="fait-projet"><h3>${e(p.nom)}</h3>${lignes ? `<ul>${lignes}</ul>` : ''}${auto}</article>`;
        })
        .join('')}</div>`
    : '<p class="vide">Rien d’enregistré pour l’instant ce jour-là.</p>';
  const notion = fait.notionErreur
    ? `table Notion illisible (${e(fait.notionErreur)})`
    : fait.notionLu
      ? `ce que les fils Claude déclarent dans <a href="${LIEN_FAIT}" target="_blank" rel="noopener">✅ Fait pour Walid</a> (relu à ${heure(fait.notionLu)})`
      : `les fils Claude écrivent dans <a href="${LIEN_FAIT}" target="_blank" rel="noopener">✅ Fait pour Walid</a> (pas encore relue par le cerveau)`;
  return `${corps}<p class="legende fait-legende">Lu sans IA : automatisations n8n, agent Leviaro, vidéos YouTube, boîtes mail, décisions des loops, journal, et ${notion}.</p>
<style>
.fait-projets { display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:10px; }
.fait-projet { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:10px 14px; }
.fait-projet h3 { margin:0 0 6px; font-size:15px; }
.fait-projet ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; font-size:14px; }
.fait-projet li { display:flex; gap:8px; }
.fait-projet .ic { flex:none; width:20px; text-align:center; }
.fait-projet small { display:block; font-size:12px; color:var(--doux); }
.fait-projet small.det { color:var(--texte); opacity:.8; }
.fait-auto { margin-top:8px; font-size:13px; color:var(--doux); }
.fait-auto summary { cursor:pointer; }
.fait-auto ul { margin-top:6px; padding-left:4px; gap:2px; font-size:13px; }
.fait-auto .ko { color:var(--panne); }
.fait-legende { font-size:12px; color:var(--doux); margin:8px 0 0; }
</style>`;
}
