// Onglet Argent : ce que coûtent les projets. Abonnements (par mois, par an) et
// recharges ponctuelles, saisis à la main pour l'instant ; les API viendront ensuite.
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { sauverEtat as sauverJson } from './etat.js';
import { jourParis } from './questions.js';

export const FREQUENCES = { mois: 'par mois', an: 'par an', 'une-fois': 'une fois' };
export const DEVISES = ['€', '$'];
const nouvelId = () => randomBytes(6).toString('hex');

// Lit data/argent.json ; au premier démarrage, part du récap de config/argent.json.
export async function chargerArgent(fichier, fichierDepart) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    const depart = JSON.parse(await readFile(fichierDepart, 'utf8'));
    return { lignes: depart.lignes.map((l) => ({ id: nouvelId(), date: null, ...l })), rappels: {} };
  }
}

export const sauverArgent = sauverJson;

// Vérifie un formulaire et renvoie la ligne à ajouter, ou un message d'erreur.
export function lireLigne(champs, projets) {
  const libelle = String(champs.libelle ?? '').trim().slice(0, 80);
  const montant = Number(String(champs.montant ?? '').replace(',', '.'));
  const { devise, frequence, projet } = champs;
  const date = champs.date || null;
  if (!libelle) return { erreur: 'Donne un nom à la dépense.' };
  if (!(montant > 0) || montant > 100_000) return { erreur: 'Le montant doit être un nombre positif.' };
  if (!DEVISES.includes(devise)) return { erreur: 'Devise inconnue.' };
  if (!FREQUENCES[frequence]) return { erreur: 'Fréquence inconnue.' };
  if (!projets.some((p) => p.id === projet)) return { erreur: 'Projet inconnu.' };
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { erreur: 'Date invalide.' };
  if (frequence === 'une-fois' && !date) return { erreur: 'Indique la date de la dépense.' };
  return { ligne: { id: nouvelId(), libelle, projet, montant: Math.round(montant * 100) / 100, devise, frequence, date } };
}

// Additionne des montants par devise : { '€': 12, '$': 50 }.
function ajouter(total, devise, montant) {
  total[devise] = Math.round(((total[devise] ?? 0) + montant) * 100) / 100;
  return total;
}

export const parMois = (l) => (l.frequence === 'mois' ? l.montant : l.frequence === 'an' ? l.montant / 12 : 0);

// Les chiffres de l'onglet : coût fixe par mois, dépenses ponctuelles du mois
// en cours et des 30 derniers jours, et le même découpage par projet.
export function bilan(lignes, jour = jourParis()) {
  const mois = jour.slice(0, 7);
  const il30j = jourParis(new Date(new Date(`${jour}T12:00:00Z`) - 30 * 86_400_000));
  const fixe = {};
  const ceMois = {};
  const trenteJours = {};
  const projets = {};
  for (const l of lignes) {
    const p = (projets[l.projet] ??= { fixe: {}, ceMois: {} });
    if (l.frequence !== 'une-fois') {
      ajouter(fixe, l.devise, parMois(l));
      ajouter(ceMois, l.devise, parMois(l));
      ajouter(p.fixe, l.devise, parMois(l));
      ajouter(p.ceMois, l.devise, parMois(l));
      continue;
    }
    if (l.date?.startsWith(mois)) {
      ajouter(ceMois, l.devise, l.montant);
      ajouter(p.ceMois, l.devise, l.montant);
    }
    if (l.date && l.date > il30j && l.date <= jour) ajouter(trenteJours, l.devise, l.montant);
  }
  return { fixe, ceMois, trenteJours, projets };
}

// Prochaine échéance d'un abonnement dont on connaît une date de paiement.
export function prochaineEcheance(ligne, jour = jourParis()) {
  if (ligne.frequence === 'une-fois' || !ligne.date) return null;
  const [a, m, j] = ligne.date.split('-').map(Number);
  const pas = ligne.frequence === 'mois' ? 1 : 12;
  for (let k = 0; k < 1200; k += pas) {
    const d = new Date(Date.UTC(a, m - 1 + k, 1));
    const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(j, fin));
    const iso = d.toISOString().slice(0, 10);
    if (iso >= jour) return iso;
  }
  return null;
}

// Abonnements qui se renouvellent dans les `joursAvant` prochains jours et pour
// lesquels aucun rappel n'a encore été envoyé. Marque ceux qu'il renvoie.
export function rappelsARenvoyer(donnees, { jour = jourParis(), joursAvant = 3 } = {}) {
  const limite = jourParis(new Date(new Date(`${jour}T12:00:00Z`).getTime() + joursAvant * 86_400_000));
  const aRappeler = [];
  donnees.rappels ??= {};
  for (const l of donnees.lignes) {
    const echeance = prochaineEcheance(l, jour);
    if (!echeance || echeance > limite || donnees.rappels[l.id] === echeance) continue;
    donnees.rappels[l.id] = echeance;
    aRappeler.push({ ...l, echeance });
  }
  return aRappeler;
}

const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const montantLisible = (montant, devise) =>
  `${montant.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(montant) ? 0 : 2, maximumFractionDigits: 2 })} ${devise}`;
export const totalLisible = (total) => {
  const parties = Object.entries(total).filter(([, m]) => m > 0).map(([d, m]) => montantLisible(m, d));
  return parties.length ? parties.join(' + ') : '0 €';
};

export function messageRappels(rappels) {
  const date = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  return ['💶 <b>Renouvellements à venir</b>', ...rappels.map((r) => `• ${echapper(r.libelle)} : ${montantLisible(r.montant, r.devise)} le ${date(r.echeance)}`)].join('\n');
}

// Historique mois par mois, depuis la plus ancienne dépense datée : recharges du
// mois + abonnements (domaines annuels lissés sur 12 mois). Un abonnement compte
// depuis son mois `depuis` s'il est connu, sinon depuis le début de l'historique.
export function historique(lignes, jour = jourParis()) {
  const courant = jour.slice(0, 7);
  const dates = lignes.filter((l) => l.frequence === 'une-fois' && l.date).map((l) => l.date.slice(0, 7));
  let mois = [courant, ...dates].sort()[0];
  const liste = [];
  while (mois <= courant) {
    const abonnements = {};
    const recharges = {};
    const total = {};
    for (const l of lignes) {
      if (l.frequence === 'une-fois') {
        if (l.date?.startsWith(mois)) (ajouter(recharges, l.devise, l.montant), ajouter(total, l.devise, l.montant));
      } else if (!l.depuis || l.depuis.slice(0, 7) <= mois) (ajouter(abonnements, l.devise, parMois(l)), ajouter(total, l.devise, parMois(l)));
    }
    liste.push({ mois, abonnements, recharges, total });
    const [a, m] = mois.split('-').map(Number);
    mois = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
  }
  liste.reverse();
  const annees = {};
  const depuisLeDebut = {};
  for (const x of liste)
    for (const [d, v] of Object.entries(x.total)) {
      ajouter((annees[x.mois.slice(0, 4)] ??= {}), d, v);
      ajouter(depuisLeDebut, d, v);
    }
  return { mois: liste, annees, depuisLeDebut, debut: liste.at(-1).mois };
}

export const moisLisible = (m) => {
  const t = new Date(`${m}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  return t[0].toUpperCase() + t.slice(1);
};
