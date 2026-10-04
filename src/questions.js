// Questions du jour : quelques questions par projet, pour que le cerveau comprenne
// comment chaque projet avance et où il peut progresser.
import { readFile } from 'node:fs/promises';
import { sauverEtat as sauverJson } from './etat.js';

export const jourParis = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

export const heureParis = (date = new Date()) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date).find((p) => p.type === 'hour').value);

export async function chargerReponses(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { jours: {}, reponses: [], rappels: [] };
    throw err;
  }
}

export const sauverReponses = sauverJson;

// Petit hachage stable pour varier l'ordre d'un jour à l'autre sans hasard.
function hacher(texte) {
  let h = 2166136261;
  for (const c of texte) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}

const joursEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 86_400_000);

// Choisit les questions d'un projet pour un jour donné :
// la question quotidienne d'abord, puis celles jamais posées, puis les plus anciennes,
// en laissant reposer une question pendant `pauseJours` après qu'elle a été posée.
export function choisirQuestions(projet, historique, jour, { parJour = 2, pauseJours = 14 } = {}) {
  const dernierePose = new Map();
  for (const [j, parProjet] of Object.entries(historique.jours)) {
    if (j >= jour) continue;
    for (const id of parProjet[projet.id] ?? []) if (!dernierePose.has(id) || dernierePose.get(id) < j) dernierePose.set(id, j);
  }
  const quotidiennes = projet.questions.filter((q) => q.quotidienne);
  const autres = projet.questions
    .filter((q) => !q.quotidienne)
    .filter((q) => !dernierePose.has(q.id) || joursEntre(dernierePose.get(q.id), jour) >= pauseJours);
  const reserve = projet.questions.filter((q) => !q.quotidienne && !autres.includes(q));
  const tri = (a, b) =>
    (dernierePose.get(a.id) ?? '').localeCompare(dernierePose.get(b.id) ?? '') || hacher(jour + a.id) - hacher(jour + b.id);
  // Si toutes les questions reposent encore, on reprend les plus anciennes.
  return [...quotidiennes, ...autres.sort(tri), ...reserve.sort(tri)].slice(0, parJour).map((q) => q.id);
}

// Questions du jour, figées une fois choisies pour qu'elles ne changent pas dans la journée.
export function questionsDuJour(config, historique, jour = jourParis()) {
  historique.jours[jour] ??= {};
  const duJour = historique.jours[jour];
  return config.projets.map((projet) => {
    duJour[projet.id] ??= choisirQuestions(projet, historique, jour, config);
    const questions = duJour[projet.id]
      .map((id) => projet.questions.find((q) => q.id === id))
      .filter(Boolean)
      .map((q) => ({ ...q, reponse: historique.reponses.find((r) => r.jour === jour && r.projet === projet.id && r.question === q.id)?.reponse }));
    return { projet, questions };
  });
}

export function enAttente(config, historique, jour = jourParis()) {
  return questionsDuJour(config, historique, jour).reduce((n, p) => n + p.questions.filter((q) => q.reponse === undefined).length, 0);
}

// Enregistre les réponses envoyées par la page (champs « projet:question »).
export function enregistrerReponses(config, historique, champs, maintenant = new Date()) {
  const jour = jourParis(maintenant);
  const permises = new Map(questionsDuJour(config, historique, jour).flatMap(({ projet, questions }) => questions.map((q) => [`${projet.id}:${q.id}`, { projet, q }])));
  let n = 0;
  for (const [cle, brute] of Object.entries(champs)) {
    const trouve = permises.get(cle);
    const valeur = String(brute ?? '').trim().slice(0, 4000);
    if (!trouve || !valeur) continue;
    let reponse = valeur;
    if (trouve.q.type === 'note') {
      reponse = Number(valeur);
      if (!Number.isInteger(reponse) || reponse < 1 || reponse > 5) continue;
    } else if (trouve.q.type === 'nombre') {
      reponse = Number(valeur.replace(',', '.'));
      if (!Number.isFinite(reponse) || reponse < 0) continue;
    } else if (trouve.q.type === 'choix' && !trouve.q.choix.includes(valeur)) continue;
    historique.reponses = historique.reponses.filter((r) => !(r.jour === jour && r.projet === trouve.projet.id && r.question === trouve.q.id));
    historique.reponses.push({ jour, date: maintenant.toISOString(), projet: trouve.projet.id, question: trouve.q.id, texte: trouve.q.texte, reponse });
    n++;
  }
  return n;
}

// Rappel du matin : une fois par jour, après l'heure choisie, s'il reste des questions.
export function rappelAEnvoyer(config, historique, { heure = 9, maintenant = new Date() } = {}) {
  const jour = jourParis(maintenant);
  if (heureParis(maintenant) < heure || historique.rappels.includes(jour)) return null;
  const n = enAttente(config, historique, jour);
  historique.rappels = [jour, ...historique.rappels].slice(0, 30);
  if (!n) return null;
  return `🧠 <b>Questions du jour</b>\n${n} petite(s) question(s) sur tes projets t'attendent sur ta page, onglet « Questions du jour ». Deux minutes suffisent.`;
}
