// Factures : louis les dépose sur la page, le cerveau les lit avec Claude et les
// rapproche de la liste des dépenses pour voir si tout est à jour.
import Anthropic from '@anthropic-ai/sdk';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { jourParis } from './questions.js';

export const TYPES = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
export const TAILLE_MAX = 10 * 1024 * 1024;
export const MODELE = 'claude-sonnet-5-5';
// Prix de Claude Sonnet 5.5 en dollars par million de jetons (entrée, sortie).
const PRIX = { entree: 2, sortie: 10 };

// Enregistre le fichier déposé et l'ajoute à la liste, encore non lu.
export async function deposerFacture(donnees, dossier, { nom, type, base64 }) {
  const ext = TYPES[type];
  if (!ext) return { erreur: 'Format non pris en charge : envoie un PDF ou une photo (PNG, JPG, WebP).' };
  const contenu = Buffer.from(String(base64 ?? ''), 'base64');
  if (!contenu.length) return { erreur: 'Fichier vide.' };
  if (contenu.length > TAILLE_MAX) return { erreur: 'Fichier trop lourd (10 Mo au plus).' };
  const id = randomBytes(6).toString('hex');
  await mkdir(dossier, { recursive: true });
  await writeFile(path.join(dossier, `${id}.${ext}`), contenu, { mode: 0o600 });
  const facture = { id, nom: String(nom ?? 'facture').slice(0, 120), type, ajoutee: new Date().toISOString(), lecture: null, erreur: null };
  (donnees.factures ??= []).unshift(facture);
  return { facture };
}

export async function supprimerFacture(donnees, dossier, id) {
  const f = donnees.factures?.find((x) => x.id === id);
  if (!f) return false;
  donnees.factures = donnees.factures.filter((x) => x.id !== id);
  await unlink(path.join(dossier, `${id}.${TYPES[f.type]}`)).catch(() => {});
  return true;
}

export const fichierFacture = (dossier, f) => path.join(dossier, `${f.id}.${TYPES[f.type]}`);

// Ce que Claude doit renvoyer pour chaque facture.
const SCHEMA = {
  type: 'object',
  properties: {
    estUneFacture: { type: 'boolean' },
    fournisseur: { type: 'string' },
    montant: { type: 'number' },
    devise: { type: 'string', enum: ['€', '$', 'autre'] },
    date: { type: 'string', description: 'Date de la facture, AAAA-MM-JJ' },
    periode: { type: 'string', description: 'Période couverte si indiquée (ex. « octobre 2026 »), sinon vide' },
    ligne: { type: 'string', description: 'id de la ligne de la liste qui correspond, ou vide' },
    frequence: { type: 'string', enum: ['mois', 'an', 'une-fois'], description: 'abonnement mensuel, annuel, ou paiement ponctuel (recharge, achat)' },
    projet: { type: 'string', description: 'id du projet concerné, « commun » si plusieurs ou incertain' },
  },
  required: ['estUneFacture', 'fournisseur', 'montant', 'devise', 'date', 'periode', 'ligne', 'frequence', 'projet'],
  additionalProperties: false,
};

export const coutDollars = (usage) =>
  ((usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)) * (PRIX.entree / 1e6) +
  (usage.output_tokens ?? 0) * (PRIX.sortie / 1e6);

// Dépense IA du mois en cours, pour respecter le plafond mensuel.
export const depenseIaDuMois = (donnees, jour = jourParis()) => donnees.ia?.[jour.slice(0, 7)] ?? 0;

// Lit une facture avec Claude, sans rien modifier : renvoie { lecture, erreur, cout }.
// La lecture prend quelques secondes, d'où l'application séparée (appliquerLecture).
// `client` est injectable pour les tests.
export async function lireFacture(donnees, dossier, facture, { client, plafondDollars = 10, projets = [{ id: 'commun', nom: 'Commun' }] } = {}) {
  if (!client) return { lecture: null, erreur: null, cout: 0 };
  if (depenseIaDuMois(donnees) >= plafondDollars)
    return { lecture: null, erreur: `Plafond IA du mois atteint (${plafondDollars} $) : lecture reportée au mois prochain.`, cout: 0 };
  const base64 = (await readFile(fichierFacture(dossier, facture))).toString('base64');
  const piece =
    facture.type === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: facture.type, data: base64 } };
  const liste = donnees.lignes.map((l) => `- id ${l.id} : ${l.libelle}, ${l.montant} ${l.devise} (${l.frequence})`).join('\n');
  const consigne = `Voici une facture de louis. Relève le fournisseur, le montant TTC total, la devise, la date de la facture et la période couverte.
Puis indique quelle ligne de sa liste de dépenses elle concerne (même service, le montant peut varier un peu), ou laisse « ligne » vide si aucune ne correspond.
Indique aussi s'il s'agit d'un abonnement mensuel, annuel ou d'un paiement ponctuel, et le projet concerné (aide-toi des lignes existantes du même genre).
Si le document n'est pas une facture ou un reçu, mets estUneFacture à false.

Sa liste de dépenses :
${liste}

Ses projets :
${projets.map((p) => `- id ${p.id} : ${p.nom}`).join('\n')}`;

  let cout = 0;
  try {
    const reponse = await client.beta.messages.create({
      model: MODELE,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: [piece, { type: 'text', text: consigne }] }],
    });
    cout = coutDollars(reponse.usage);
    if (reponse.stop_reason === 'refusal') throw new Error('Claude a refusé de lire ce document.');
    const lu = JSON.parse(reponse.content.find((b) => b.type === 'text')?.text ?? '');
    if (!donnees.lignes.some((l) => l.id === lu.ligne)) lu.ligne = '';
    if (!projets.some((p) => p.id === lu.projet)) lu.projet = 'commun';
    return { lecture: { ...lu, lueLe: new Date().toISOString() }, erreur: null, cout };
  } catch (err) {
    return { lecture: null, erreur: `Lecture impossible : ${err.message}`, cout };
  }
}

export function appliquerLecture(donnees, id, { lecture, erreur, cout }, jour = jourParis()) {
  if (cout) {
    donnees.ia ??= {};
    const mois = jour.slice(0, 7);
    donnees.ia[mois] = Math.round(((donnees.ia[mois] ?? 0) + cout) * 10_000) / 10_000;
  }
  const f = donnees.factures?.find((x) => x.id === id);
  if (!f) return null;
  f.lecture = lecture;
  f.erreur = erreur;
  return f;
}

export const creerClient = (cle) => (cle ? new Anthropic({ apiKey: cle }) : null);

// Rapproche factures et dépenses : pour chaque ligne, la dernière facture reçue et
// si elle couvre la période en cours ; plus les factures qui ne collent à aucune ligne.
export function rapprochement(donnees, jour = jourParis()) {
  const lues = (donnees.factures ?? []).filter((f) => f.lecture?.estUneFacture && !f.doublonDe);
  const depuis = (jours) => jourParis(new Date(new Date(`${jour}T12:00:00Z`) - jours * 86_400_000));
  const lignes = donnees.lignes.map((l) => {
    const siennes = lues.filter((f) => f.lecture.ligne === l.id).sort((a, b) => b.lecture.date.localeCompare(a.lecture.date));
    const derniere = siennes[0] ?? null;
    const fenetre = l.frequence === 'mois' ? depuis(35) : l.frequence === 'an' ? depuis(366) : null;
    const aJour = l.frequence === 'une-fois' ? Boolean(derniere) : Boolean(derniere && derniere.lecture.date >= fenetre);
    const ecart = Boolean(derniere) && (derniere.lecture.devise !== l.devise || Math.abs(derniere.lecture.montant - l.montant) > Math.max(1, l.montant * 0.05));
    return { ligne: l, derniere, aJour, ecart };
  });
  const orphelines = lues.filter((f) => !f.lecture.ligne);
  return { lignes, orphelines, enAttente: (donnees.factures ?? []).filter((f) => !f.lecture && !f.erreur).length };
}

// Corrige la liste d'après les factures lues : vrai montant et vraie devise, date du
// paiement pour caler les rappels, et repère les doublons (reçu + facture d'un même
// paiement). Chaque correction est notée, une seule fois par facture, et peut être annulée.
export function corrigerDepuisFactures(donnees, jour = jourParis(), maintenant = new Date()) {
  donnees.corrections ??= [];
  const vues = new Map();
  for (const f of [...(donnees.factures ?? [])].reverse()) {
    const l = f.lecture;
    if (!l?.estUneFacture) continue;
    const cle = `${l.fournisseur.trim().toLowerCase()}|${l.montant}|${l.devise}|${l.date}`;
    if (vues.has(cle)) f.doublonDe = vues.get(cle);
    else {
      vues.set(cle, f.nom);
      delete f.doublonDe;
    }
  }

  const traitees = new Set(donnees.corrections.flatMap((c) => [c.facture, ...(c.rattachees ?? [])]));
  const nouvelles = [];
  for (const { ligne, derniere, ecart } of rapprochement(donnees, jour).lignes) {
    if (!derniere || traitees.has(derniere.id)) continue;
    const lu = derniere.lecture;
    if (!['€', '$'].includes(lu.devise) || !(lu.montant > 0)) continue;
    const avant = { montant: ligne.montant, devise: ligne.devise, date: ligne.date ?? null };
    const apres = { ...avant };
    if (ecart) Object.assign(apres, { montant: lu.montant, devise: lu.devise });
    const dateValide = /^\d{4}-\d{2}-\d{2}$/.test(lu.date ?? '');
    if (dateValide && (ligne.frequence === 'une-fois' ? ecart : !ligne.date)) apres.date = lu.date;
    if (apres.montant === avant.montant && apres.devise === avant.devise && apres.date === avant.date) continue;
    Object.assign(ligne, apres);
    const c = { id: randomBytes(6).toString('hex'), quand: maintenant.toISOString(), ligne: ligne.id, libelle: ligne.libelle, facture: derniere.id, avant, apres };
    donnees.corrections.unshift(c);
    nouvelles.push(c);
  }

  // Factures qui ne collent à aucune ligne : le cerveau ajoute la dépense lui-même
  // (la plus récente d'un fournisseur crée la ligne, les autres s'y rattachent).
  const creees = new Map();
  const orphelines = rapprochement(donnees, jour).orphelines.sort((a, b) => b.lecture.date.localeCompare(a.lecture.date));
  for (const f of orphelines) {
    const lu = f.lecture;
    if (traitees.has(f.id) || !FREQUENCES_LUES.includes(lu.frequence)) continue;
    if (!['€', '$'].includes(lu.devise) || !(lu.montant > 0)) continue;
    const cle = lu.fournisseur.trim().toLowerCase();
    if (creees.has(cle)) {
      const c = creees.get(cle);
      lu.ligne = c.ligne;
      c.rattachees.push(f.id);
      continue;
    }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(lu.date ?? '') ? lu.date : null;
    if (lu.frequence === 'une-fois' && !date) continue;
    const ligne = { id: randomBytes(6).toString('hex'), libelle: lu.fournisseur.trim().slice(0, 80) || 'Dépense', projet: lu.projet || 'commun', montant: Math.round(lu.montant * 100) / 100, devise: lu.devise, frequence: lu.frequence, date };
    donnees.lignes.push(ligne);
    lu.ligne = ligne.id;
    const { id: _id, libelle: _l, ...apres } = ligne;
    const c = { id: randomBytes(6).toString('hex'), quand: maintenant.toISOString(), ligne: ligne.id, libelle: ligne.libelle, facture: f.id, rattachees: [], cree: true, avant: null, apres };
    creees.set(cle, c);
    donnees.corrections.unshift(c);
    nouvelles.push(c);
  }

  donnees.corrections = donnees.corrections.slice(0, 200);
  return nouvelles;
}

// Factures lues avant que le cerveau sache créer des lignes : sans fréquence ni
// projet, elles sont relues une fois pour pouvoir ajouter la dépense.
export function marquerOrphelinesARelire(donnees) {
  let n = 0;
  for (const f of donnees.factures ?? [])
    if (f.lecture?.estUneFacture && !f.lecture.ligne && !f.lecture.frequence && !f.doublonDe) {
      f.lecture = null;
      n++;
    }
  return n;
}

export function annulerCorrection(donnees, id) {
  const c = donnees.corrections?.find((x) => x.id === id && !x.annulee);
  if (!c) return false;
  if (c.cree) {
    donnees.lignes = donnees.lignes.filter((l) => l.id !== c.ligne);
    for (const f of donnees.factures ?? []) if (f.lecture?.ligne === c.ligne) f.lecture.ligne = '';
  } else {
    const ligne = donnees.lignes.find((l) => l.id === c.ligne);
    if (ligne) Object.assign(ligne, c.avant);
  }
  c.annulee = true;
  return true;
}

const echapperHtml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FREQUENCES_LUES = ['mois', 'an', 'une-fois'];
const RYTHME = { mois: 'par mois', an: 'par an', 'une-fois': 'payé une fois' };
export function decrireCorrection(c) {
  if (c.cree) return `${c.libelle} : dépense ajoutée, ${c.apres.montant} ${c.apres.devise} ${RYTHME[c.apres.frequence]}`;
  const parts = [];
  if (c.avant.montant !== c.apres.montant || c.avant.devise !== c.apres.devise) parts.push(`${c.avant.montant} ${c.avant.devise} → ${c.apres.montant} ${c.apres.devise}`);
  if (c.avant.date !== c.apres.date) parts.push(`date de paiement : ${new Date(`${c.apres.date}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })}`);
  return `${c.libelle} : ${parts.join(', ')}`;
}
export const messageCorrections = (liste) =>
  ['✏️ <b>Liste des dépenses mise à jour d’après tes factures</b>', ...liste.map((c) => `• ${echapperHtml(decrireCorrection(c))}`), 'Tu peux annuler depuis l’onglet Argent.'].join('\n');
