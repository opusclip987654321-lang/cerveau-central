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
  },
  required: ['estUneFacture', 'fournisseur', 'montant', 'devise', 'date', 'periode', 'ligne'],
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
export async function lireFacture(donnees, dossier, facture, { client, plafondDollars = 10 } = {}) {
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
Si le document n'est pas une facture ou un reçu, mets estUneFacture à false.

Sa liste de dépenses :
${liste}`;

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
  const lues = (donnees.factures ?? []).filter((f) => f.lecture?.estUneFacture);
  const depuis = (jours) => jourParis(new Date(new Date(`${jour}T12:00:00Z`) - jours * 86_400_000));
  const lignes = donnees.lignes.map((l) => {
    const siennes = lues.filter((f) => f.lecture.ligne === l.id).sort((a, b) => b.lecture.date.localeCompare(a.lecture.date));
    const derniere = siennes[0] ?? null;
    const fenetre = l.frequence === 'mois' ? depuis(35) : l.frequence === 'an' ? depuis(366) : null;
    const aJour = l.frequence === 'une-fois' ? Boolean(derniere) : Boolean(derniere && derniere.lecture.date >= fenetre);
    const ecart = derniere && derniere.lecture.devise === l.devise && Math.abs(derniere.lecture.montant - l.montant) > Math.max(1, l.montant * 0.05);
    return { ligne: l, derniere, aJour, ecart };
  });
  const orphelines = lues.filter((f) => !f.lecture.ligne);
  return { lignes, orphelines, enAttente: (donnees.factures ?? []).filter((f) => !f.lecture && !f.erreur).length };
}
