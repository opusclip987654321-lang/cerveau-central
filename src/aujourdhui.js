// La page « Aujourd'hui » : ce que louis regarde en premier le matin. Trois
// priorités au plus, puis une ligne par projet (chiffres du jour, flèche par
// rapport à hier, phrase du cerveau), puis ce qui a changé depuis hier.
// Tout vient des données déjà lues ; une donnée absente est « indisponible ».
import { tableauDeBord } from './business.js';
import { STATUTS_ACTION } from './actions.js';
import { journee } from './journal.js';
import { jourParis } from './questions.js';

const veille = (jour) => jourParis(new Date(new Date(`${jour}T12:00:00Z`) - 86_400_000));
const joursEntre = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86_400_000);

// Les trois chiffres de chaque projet (liste de louis, 11/10) : le titre exact
// tel que la carte le nomme, dans l'ordre voulu. Un chiffre que la carte n'a pas
// s'affiche « indisponible », jamais 0.
export const CHIFFRES = {
  'nour-meet': ['Mails envoyés aux restaurants', 'Mails ouverts', 'Réponses'],
  leviaro: ['Prospects contactés', 'Mails ouverts', 'Réponses'],
  impacteur: ['Invités contactés', 'Mails ouverts', 'Réponses'],
  vegebudget: ['Inscrits', 'Abonnements payés', 'Semaines composées'],
  'extrait-politique': ['Vidéos publiées', 'Vues gagnées', 'Abonnés'],
  'histoires-vraies': ['Vidéos publiées', 'Vues YouTube gagnées', 'Abonnés YouTube'],
  cambodge: ['Candidatures envoyées', 'Réponses reçues'],
};
const NOMS_COURTS = { 'Mails envoyés aux restaurants': 'Mails envoyés', 'Vues YouTube gagnées': 'Vues gagnées', 'Abonnés YouTube': 'Abonnés', 'Candidatures envoyées': 'Candidatures' };

// Un chiffre tel que la carte le porte (principal ou secondaire), ou null.
function chiffreDeCarte(carte, titre) {
  if (!carte) return null;
  if (carte.principal.titre === titre) return { valeur: carte.principal.total, precedent: carte.principal.precedent, detail: null };
  const x = carte.chiffres.find((c) => c.titre === titre);
  if (!x) return null;
  const n = typeof x.valeur === 'number' ? x.valeur : Number(String(x.valeur).replace(/\s/g, '').replace(',', '.'));
  return { valeur: x.valeur === '—' ? null : Number.isFinite(n) ? n : x.valeur, precedent: null, detail: x.detail ?? null };
}

// Une ligne par projet : chiffres du jour (comparés à hier) et, à défaut, sur 7 jours.
export function lignesProjets({ business, journal, configJournal, pauses, jour = jourParis(), analyses = {} }) {
  const aujourdhui = tableauDeBord({ business, journal, configJournal, pauses, jour, jours: 1 });
  const semaine = tableauDeBord({ business, journal, configJournal, pauses, jour, jours: 7 });
  const abonnesVB = business.sources?.vegebudget?.totaux?.abonnes;
  return semaine.cartes.map((c7) => {
    const c1 = aujourdhui.cartes.find((c) => c.id === c7.id);
    const chiffres = (CHIFFRES[c7.id] ?? [c7.principal.titre, ...c7.chiffres.slice(0, 2).map((x) => x.titre)]).map((titre) => {
      const nom = NOMS_COURTS[titre] ?? titre;
      // Projet pas branché : rien n'est mesuré, donc rien n'est affiché (pas de faux 0).
      if (c7.couleur === 'gris') return { nom, valeur: null, periode: null, fleche: null };
      if (titre === 'Abonnements payés' && c7.id === 'vegebudget') return { nom, valeur: abonnesVB ?? null, periode: 'en tout', fleche: null };
      const jourX = chiffreDeCarte(c1, titre);
      if (jourX && jourX.valeur !== null && typeof jourX.valeur === 'number' && (jourX.precedent !== null || jourX.valeur > 0))
        return { nom, valeur: jourX.valeur, periode: 'aujourd’hui', fleche: jourX.precedent === null ? null : jourX.valeur - jourX.precedent };
      const sem = chiffreDeCarte(c7, titre);
      if (sem && sem.valeur !== null) return { nom, valeur: sem.valeur, periode: sem.precedent === null && /abonn/i.test(titre) ? 'en tout' : '7 jours', fleche: sem.precedent === null ? null : sem.valeur - sem.precedent };
      return { nom, valeur: null, periode: null, fleche: null };
    });
    const analyse = analyses[c7.id];
    return {
      id: c7.id,
      nom: c7.nom,
      couleur: c7.couleur,
      chiffres,
      objectif: c7.objectif.valide ? { valeur: c7.objectif.valide, unite: c7.objectif.unite, atteint: c7.principal.objectif ? Math.min(100, Math.round((c7.principal.total / c7.principal.objectif) * 100)) : null } : null,
      phrase: analyse?.phrase ?? phraseParDefaut(c7, c1),
      phraseIa: Boolean(analyse?.phrase),
      silence: c7.silence,
      manque: c7.manque,
    };
  });
}

// Tant que l'analyse du matin n'existe pas (étape 3 de la refonte), la phrase
// vient de ce que la carte sait déjà : la première chose à décider, ou l'état.
function phraseParDefaut(c7, c1) {
  if (c7.couleur === 'pause') return 'En pause, à ta demande.';
  if (c7.couleur === 'gris') return `Pas encore branché : ${c7.manque.join(', ')}.`;
  if (c7.aDecider.length) return c7.aDecider[0];
  const p = c7.principal;
  const jourN = c1?.principal.total ?? 0;
  if (jourN) return `${jourN} ${p.unite}${jourN > 1 ? 's' : ''} aujourd’hui, ${p.total} sur 7 jours.`;
  if (p.total) return `Rien aujourd’hui pour l’instant ; ${p.total} ${p.unite}${p.total > 1 ? 's' : ''} sur 7 jours.`;
  return `Aucun ${p.unite} sur 7 jours.`;
}

// Les priorités du jour : pannes, projets à l'arrêt, fiches qui attendent louis.
// Chacune dit pourquoi elle est là, la preuve, et ce qu'on attend de lui.
export function priorites({ etat, cartes, actions = [], config, max = 3 }) {
  const nomSurveillance = (id) => config?.projets?.find((p) => p.id === id)?.nom ?? id;
  const fiche = (cle) => actions.find((a) => a.cle === cle && a.statut !== 'resolu');
  const candidats = [];

  for (const [k, v] of Object.entries(etat?.verifications ?? {})) {
    if (v.etat !== 'panne') continue;
    const f = fiche(`panne:${k}`);
    candidats.push({
      score: 100,
      projet: nomSurveillance(v.projet),
      titre: v.sens ?? `${v.nom} ne répond plus`,
      preuve: `${v.nom} : ${v.detail}${v.depuis ? `, depuis le ${new Date(v.depuis).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' })}` : ''}`,
      attendu: f ? STATUTS_ACTION[f.statut]?.qui ?? '' : 'Le cerveau ouvre la fiche à la prochaine visite de la page Actions.',
      href: f ? `/action?id=${f.id}` : '/actions',
      ficheId: f?.id ?? null,
      type: 'panne',
    });
  }

  for (const c of cartes) {
    if (c.couleur !== 'rouge') continue;
    const texte = c.aDecider[0] ?? `Plus aucun ${c.principal.unite} depuis ${c.silence} jours.`;
    const f = actions.find((a) => a.source?.projet === c.id && a.source?.type === 'decider' && a.statut !== 'resolu' && a.titre === texte);
    candidats.push({
      score: 80,
      projet: c.nom,
      titre: `${c.nom} est à l’arrêt`,
      preuve: c.silence === null ? `aucun ${c.principal.unite} enregistré` : `aucun ${c.principal.unite} depuis ${c.silence} jours`,
      attendu: f ? STATUTS_ACTION[f.statut]?.qui ?? '' : 'Décider : relancer, ou mettre en pause si c’est voulu.',
      href: f ? `/action?id=${f.id}` : `/projet?projet=${c.id}`,
      ficheId: f?.id ?? null,
      type: 'arret',
    });
  }

  const POIDS = { question_posee: 60, proposition_a_valider: 60, resultat_a_verifier: 45, a_transmettre: 50 };
  for (const a of actions) {
    if (!(a.statut in POIDS) || candidats.some((c) => c.ficheId === a.id)) continue;
    candidats.push({
      score: POIDS[a.statut],
      projet: a.projet || 'Cerveau central',
      titre: a.titre,
      preuve: a.constat !== a.titre ? a.constat : (a.historique?.at(-1)?.texte ?? ''),
      attendu: STATUTS_ACTION[a.statut]?.qui ?? '',
      href: `/action?id=${a.id}`,
      ficheId: a.id,
      type: 'fiche',
    });
  }

  for (const c of cartes) {
    if (c.couleur !== 'orange') continue;
    const texte = c.aDecider[0];
    if (!texte || candidats.some((x) => x.projet === c.nom)) continue;
    const f = actions.find((a) => a.source?.projet === c.id && a.statut !== 'resolu' && a.titre === texte);
    candidats.push({ score: 40, projet: c.nom, titre: texte, preuve: `${c.nom} : ${c.principal.total} ${c.principal.unite}(s) sur la période`, attendu: f ? STATUTS_ACTION[f.statut]?.qui ?? '' : 'À regarder.', href: f ? `/action?id=${f.id}` : `/projet?projet=${c.id}`, ficheId: f?.id ?? null, type: 'souci' });
  }

  // Un projet n'occupe qu'une priorité ; les autres passent après.
  const retenues = [];
  const projetsVus = new Set();
  for (const c of candidats.sort((a, b) => b.score - a.score)) {
    if (projetsVus.has(c.projet)) continue;
    retenues.push(c);
    projetsVus.add(c.projet);
  }
  return { priorites: retenues.slice(0, max), autres: Math.max(0, candidats.length - Math.min(max, retenues.length)) };
}

// Ce qui a changé depuis hier : la veille, projet par projet (chiffre principal
// et événements notés), sans les exécutions techniques.
export function changementsDepuisHier({ business, journal, configJournal, pauses, jour = jourParis() }) {
  const hier = veille(jour);
  const tableau = tableauDeBord({ business, journal, configJournal, pauses, jour: hier, jours: 1 });
  const notes = journee(journal, configJournal, hier);
  return tableau.cartes
    .map((c) => {
      const evenements = (notes.find((x) => x.projet.id === c.id)?.evenements ?? []).map((ev) => ({ type: ev.type, titre: ev.titre, lien: ev.lien }));
      const chiffres = [
        ...(c.principal.total ? [`${c.principal.total} ${c.principal.unite}${c.principal.total > 1 ? 's' : ''}`] : []),
        ...c.chiffres.filter((x) => typeof x.valeur === 'number' && x.valeur > 0 && /réponse|ouvert|inscrit|encaiss/i.test(x.titre)).map((x) => `${x.valeur} ${x.titre.toLowerCase()}`),
      ];
      return { id: c.id, nom: c.nom, chiffres, evenements };
    })
    .filter((x) => x.chiffres.length || x.evenements.length);
}

// Dernière lecture de chaque source et sources jamais lues, pour l'en-tête.
export function fraicheur(business, jour = jourParis()) {
  const dates = Object.values(business.sources ?? {}).map((s) => s?.maj).filter(Boolean).sort();
  const derniere = dates.at(-1) ?? null;
  const retard = derniere ? joursEntre(jourParis(new Date(derniere)), jour) : null;
  return { derniere, retard };
}
