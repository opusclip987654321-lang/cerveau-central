// La page « À coller » (revue du système du 20/10, proposition n°1 acceptée par louis) :
// tous les messages que louis doit coller dans ses autres projets Claude (3_PETITES
// HISTOIRES, Leviaro, VégéBudget, 12_Prospection sponsors), au même endroit, au lieu
// d'être éparpillés dans les fils. Deux sources :
// - config/a-coller.json, rempli par les fils par PR (le site se met à jour seul) ;
// - POST /api/a-coller (jeton des relevés), gardé dans data/a-coller.json.
// louis coche « fait » sur la page ; la coche est gardée dans data/a-coller.json.
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { sauverEtat as sauverJson } from './etat.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const txt = (v, max) => String(v ?? '').trim().slice(0, max);
const jour = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null);

export async function chargerACollerConfig(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8')).messages ?? [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function chargerAColler(fichier) {
  try {
    const d = JSON.parse(await readFile(fichier, 'utf8'));
    return { messages: d.messages ?? [], faits: d.faits ?? {} };
  } catch (err) {
    if (err.code === 'ENOENT') return { messages: [], faits: {} };
    throw err;
  }
}
export const sauverAColler = sauverJson;

// Un message reçu par l'API. Même `id` qu'un message déjà là = mise à jour (pas de doublon).
export function ajouterMessage(donnees, brut, maintenant = new Date()) {
  const projet = txt(brut?.projet, 80);
  const texte = txt(brut?.texte, 20_000);
  if (!projet) return { erreur: 'Projet cible manquant.' };
  if (!texte) return { erreur: 'Texte vide.' };
  const id = /^[a-z0-9][a-z0-9-]{2,79}$/.test(String(brut?.id ?? '')) ? brut.id : randomBytes(6).toString('hex');
  const message = {
    id,
    projet,
    fil: txt(brut?.fil, 120) || undefined,
    date: jour(brut?.date) ?? maintenant.toISOString().slice(0, 10),
    sujet: txt(brut?.sujet, 160) || undefined,
    texte,
    note: txt(brut?.note, 400) || undefined,
    depuis: txt(brut?.depuis, 160) || undefined,
  };
  const i = donnees.messages.findIndex((m) => m.id === id);
  if (i >= 0) donnees.messages[i] = message;
  else donnees.messages.push(message);
  donnees.messages = donnees.messages.slice(-300);
  return { message };
}

export function cocher(donnees, id, fait, maintenant = new Date()) {
  if (!id) return { erreur: 'Message introuvable.' };
  if (fait) donnees.faits[id] = maintenant.toISOString();
  else donnees.faits[id] = null; // décoché à la main : l'emporte sur un « fait » écrit dans la config
  return { ok: true };
}

// Config + API, avec l'état fait / à faire. Un message de l'API remplace celui de la config au même id.
export function tousLesMessages(config, donnees) {
  const parId = new Map();
  for (const m of [...config, ...(donnees?.messages ?? [])]) if (m?.id && m?.texte) parId.set(m.id, m);
  return [...parId.values()].map((m) => {
    const coche = donnees?.faits?.[m.id];
    const fait = coche === null ? null : coche ?? m.fait ?? null;
    return { ...m, fait };
  });
}

export const nombreAFaire = (messages) => messages.filter((m) => !m.fait).length;

const dateCourte = (j) => (j ? new Date(`${j.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }) : '');

function carte(m) {
  const ou = m.fil ? `projet « ${m.projet} », fil « ${m.fil} »` : `projet « ${m.projet} »`;
  return `<article class="ac ${m.fait ? 'fait' : ''}" id="m-${e(m.id)}">
<header><div><b>${e(m.sujet ?? 'Message')}</b><span class="ou">À coller dans le ${e(ou)} · ${e(dateCourte(m.date))}</span></div>
<form method="post" action="/a-coller/fait"><input type="hidden" name="id" value="${e(m.id)}"><input type="hidden" name="fait" value="${m.fait ? '0' : '1'}"><button>${m.fait ? '↺ Remettre à faire' : '✓ Fait'}</button></form></header>
${m.note ? `<p class="note">${e(m.note)}</p>` : ''}
<pre>${e(m.texte)}</pre>
<p class="bas"><button type="button" class="copier" data-id="${e(m.id)}">Copier le message</button>${m.fait ? `<small>Collé le ${e(dateCourte(m.fait))}</small>` : ''}</p>
</article>`;
}

export function htmlAColler(messages, { message } = {}) {
  const aFaire = messages.filter((m) => !m.fait).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const faits = messages.filter((m) => m.fait).sort((a, b) => String(b.fait).localeCompare(String(a.fait)));
  const projets = [...new Set(aFaire.map((m) => m.projet))];
  const blocs = projets
    .map((p) => {
      const liste = aFaire.filter((m) => m.projet === p);
      return `<h3>${e(p)} <small>${liste.length} message${liste.length > 1 ? 's' : ''}</small></h3>${liste.map(carte).join('')}`;
    })
    .join('');
  return `${message ? `<p class="message">${e(message)}</p>` : ''}
<p class="intro">Les messages pour tes autres projets Claude, que je ne peux pas atteindre d'ici. Colle chacun <b>une seule fois</b> dans le projet indiqué, dans l'ordre, puis clique « Fait ».</p>
${aFaire.length ? blocs : '<p class="calme">🟢 Rien à coller : tout est fait.</p>'}
${faits.length ? `<details class="faits"><summary>Déjà collés (${faits.length})</summary>${faits.map(carte).join('')}</details>` : ''}
<style>
.intro { color:var(--doux); margin:0 0 6px; }
h3 small { font-weight:400; color:var(--doux); font-size:13px; margin-left:6px; }
.ac { background:var(--carte); border:1px solid var(--bord); border-left:4px solid var(--or); border-radius:12px; padding:12px 16px; margin-bottom:12px; }
.ac.fait { border-left-color:var(--ok); opacity:.8; }
.ac header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
.ac header div { display:flex; flex-direction:column; }
.ac .ou { color:var(--doux); font-size:13px; }
.ac form { margin:0; flex-shrink:0; }
.ac .note { margin:8px 0 0; font-size:13px; color:var(--attention); }
.ac pre { white-space:pre-wrap; word-break:break-word; font:13px/1.5 ui-monospace, Menlo, Consolas, monospace; background:var(--carte2); border:1px solid var(--bord); border-radius:8px; padding:10px 12px; margin:10px 0 8px; max-height:340px; overflow:auto; }
.ac .bas { display:flex; align-items:center; gap:12px; margin:0; }
.ac .bas small { color:var(--doux); }
.calme { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:12px 16px; }
.faits { margin-top:24px; } .faits summary { cursor:pointer; font-weight:600; margin-bottom:10px; }
</style>
<script>
document.querySelectorAll('.copier').forEach((b) => b.onclick = async () => {
  const pre = document.getElementById('m-' + b.dataset.id).querySelector('pre');
  try { await navigator.clipboard.writeText(pre.textContent); }
  catch { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy'); }
  b.textContent = 'Copié ✓'; setTimeout(() => (b.textContent = 'Copier le message'), 2000);
});
</script>`;
}
