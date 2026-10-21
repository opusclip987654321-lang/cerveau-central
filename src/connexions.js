// Les connexions du cerveau : d'où viennent les chiffres, une fiche par source.
// Pour chacune : branchée ou pas, dernière lecture, dernière erreur, et ce qu'il
// faut faire pour la brancher. Aucune clé ne s'affiche : seulement « présente »
// ou « absente ». Ce qui reste à brancher (plan validé par louis le 11/10) est
// listé à part.
import { jourParis } from './questions.js';

// Chaque source : ce qu'elle lit, pour quels projets, où se trouve sa dernière
// lecture, et ce qu'il faut pour la brancher.
export const CONNEXIONS = [
  { id: 'n8n-principal', nom: 'n8n Nūr Meet', projets: ['nour-meet', 'impacteur', 'cambodge', 'histoires-vraies'], lit: 'Les exécutions des automatisations (réussies ou en erreur) sur n8n.nourmeet.com, pour le Journal et la Surveillance.', besoin: 'N8N_URL et N8N_API_KEY dans le .env du serveur.' },
  { id: 'n8n-actualite', nom: 'n8n L’extrait politique', projets: ['extrait-politique'], lit: 'Les exécutions des automatisations sur n8n.actualitevideo.fr.', besoin: 'N8N_ACTUALITE_API_KEY dans le .env.' },
  { id: 'prospection', nom: 'Prospection Nūr Meet', projets: ['nour-meet'], lit: 'Les tableaux np_* du n8n principal : restaurants trouvés, mails envoyés, ouvertures, réponses.', besoin: 'Le n8n Nūr Meet branché (même clé).' },
  { id: 'leviaro', nom: 'Agent Leviaro', projets: ['leviaro'], lit: 'La base leviaro.db de l’agent (entreprises, mails, réponses) et son diagnostic (budget, mode, erreurs), montés en lecture seule.', besoin: 'Le dossier data/ de l’agent monté dans le conteneur (LEVIARO_DOSSIER).' },
  { id: 'impacteur', nom: 'Sheet Impacteur', projets: ['impacteur'], lit: 'Les fiches du Google Sheet (auteurs, statut, envoi, ouverture, compte d’envoi), via le workflow n8n « CERVEAU - lecture Impacteur ».', besoin: 'Le n8n Nūr Meet branché et le jeton RELEVE_JETON.' },
  { id: 'youtube', nom: 'YouTube (chaînes)', projets: ['extrait-politique', 'histoires-vraies'], lit: 'Abonnés, vues et dernières vidéos (avec leur durée) des chaînes, par l’API publique.', besoin: 'YOUTUBE_API_KEY dans le .env et les chaînes dans config/youtube.json.' },
  { id: 'youtube-flux', nom: 'YouTube (flux public des chaînes)', projets: ['extrait-politique', 'histoires-vraies', 'impacteur'], lit: 'Les 15 dernières vidéos de chaque chaîne (date de sortie, vues), par le flux RSS public, sans clé ni quota : les vidéos publiées restent justes même si l’API refuse.', besoin: 'Rien : les chaînes de config/youtube.json suffisent.' },
  { id: 'youtube-revenus', nom: 'Revenus YouTube', projets: ['extrait-politique', 'histoires-vraies'], lit: 'Les revenus estimés par chaîne (YouTube Analytics), avec 2 à 3 jours de retard.', besoin: 'L’autorisation Google donnée une fois (page /oauth/youtube) : YT_OAUTH_* dans le .env.' },
  { id: 'stripe', nom: 'Stripe', projets: ['nour-meet'], lit: 'Les encaissements et abonnements payants de Nūr Meet.', besoin: 'STRIPE_CLE dans le .env (clé de lecture seule).' },
  { id: 'cambodge', nom: 'Gmail Cambodge', projets: ['cambodge'], lit: 'Les mails étiquetés « Cambodge » (candidatures, réponses), via le workflow n8n « CERVEAU - lecture Cambodge ».', besoin: 'Le n8n Nūr Meet branché et le jeton RELEVE_JETON.' },
  { id: 'boites', nom: 'Boîtes Gmail de louis', projets: ['impacteur', 'cambodge'], lit: 'Les mails des 3 derniers jours de 6 boîtes (opusclip, walidvideos12, impacteurmedia, gougamwalid, Impacteur Frexit et Afrique), triés par règles pour repérer les urgents, via le workflow n8n « CERVEAU - lecture des boîtes ».', besoin: 'Le workflow créé par scripts/boites-n8n.py, un compte Google choisi sur chacun de ses 6 nœuds Gmail, puis allumé.' },
  { id: 'vegebudget', nom: 'VégéBudget', projets: ['vegebudget'], lit: 'Les statistiques du site (visiteurs, semaines composées, inscrits, abonnés) et le parcours des visites.', besoin: 'VEGEBUDGET_STATS_JETON dans le .env, le même que sur le site.' },
  { id: 'histoires', nom: 'Petites histoires vraies (fabrication)', projets: ['histoires-vraies'], lit: 'Le dossier data/ du programme de fabrication (vidéos publiées sur Instagram et Facebook), monté en lecture seule.', besoin: 'Le dossier monté dans le conteneur (HISTOIRES_DOSSIER). La fabrication est en pause depuis le 05/10.' },
  { id: 'visites', nom: 'Visites des sites (Umami)', projets: ['nour-meet', 'leviaro', 'vegebudget'], lit: 'Visiteurs, visites, pages vues, rebonds, pages les plus vues et provenance, sur 30 jours, pour chaque site déclaré dans config/visites.json.', besoin: 'Umami installé sur le VPS Nūr (docs/visites-umami.md), UMAMI_URL et UMAMI_UTILISATEUR + UMAMI_MOT_DE_PASSE (ou UMAMI_CLE_API) dans le .env, et la ligne de suivi posée sur chaque site.' },
  { id: 'serveurs', nom: 'Relevé des serveurs', projets: ['nour-meet', 'leviaro', 'extrait-politique'], lit: 'Disque et mémoire des deux VPS, envoyés par scripts/releve.sh (cron sur chaque serveur).', besoin: 'Le cron de relevé en place sur chaque VPS, avec RELEVE_JETON.' },
];

// Ce qui reste à brancher, et par qui (plan de la refonte, choix de louis du 11/10).
export const A_BRANCHER = [
  { nom: 'TikTok, Instagram, Facebook', pourquoi: 'Abonnés et vues des comptes, gains Facebook si une page est monétisée.', comment: 'Via n8n (fil Cahier des charges) ; attend la liste des comptes.' },
  { nom: 'OVH (factures des serveurs)', pourquoi: 'Avoir les vraies factures des VPS dans Argent sans les déposer à la main.', comment: 'API OVH, à brancher plus tard.' },
  { nom: 'Dépenses d’API (Anthropic, ElevenLabs…)', pourquoi: 'Voir ce que chaque automatisation coûte vraiment.', comment: 'Relevé des consoles, à brancher plus tard.' },
];

const joursEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 86_400_000);

// La dernière lecture de chaque source, d'après les données en place.
function derniereLecture(id, { business, journal, serveurs }) {
  const s = business?.sources ?? {};
  switch (id) {
    case 'n8n-principal':
    case 'n8n-actualite': {
      const instance = id === 'n8n-principal' ? 'principal' : 'actualite';
      const noms = Object.entries(journal?.n8n?.instances ?? {}).filter(([, i]) => i === instance).map(([n]) => n);
      if (!noms.length) return null;
      const jours = Object.entries(journal?.n8n?.jours ?? {}).filter(([, autos]) => noms.some((n) => autos[n]));
      return journal?.n8n?.maj ?? (jours.length ? `${jours.map(([j]) => j).sort().at(-1)}T12:00:00Z` : null);
    }
    case 'prospection':
      return s.prospection?.maj ?? null;
    case 'leviaro':
      return s.leviaro?.maj ?? null;
    case 'impacteur':
      return s.impacteur?.maj ?? null;
    case 'youtube':
      return s.youtube?.maj ?? null;
    case 'youtube-flux':
      return s.youtube?.flux?.maj ?? null;
    case 'youtube-revenus':
      return s.youtube?.revenus?.maj ?? null;
    case 'stripe':
      return s.stripe?.maj ?? null;
    case 'cambodge':
      return s.cambodge?.maj ?? null;
    case 'vegebudget':
      return s.vegebudget?.maj ?? null;
    case 'boites':
      return s.boites?.maj ?? null;
    case 'visites':
      return s.visites?.maj ?? null;
    case 'histoires':
      return journal?.histoires?.maj ?? null;
    case 'serveurs': {
      const dates = Object.values(serveurs?.serveurs ?? {}).map((x) => x.recu).filter(Boolean).sort();
      return dates.at(-1) ?? null;
    }
    default:
      return null;
  }
}

// L'état de chaque connexion : branchée (lue récemment), silencieuse (plus lue
// depuis plus d'un jour), en erreur (la dernière tentative a échoué), ou pas
// branchée (clé absente ou jamais lue). `tentatives` vient de business.connexions,
// écrit par le serveur à chaque passage ({ quand, erreur, ignore }).
export function etatConnexions({ business, journal, serveurs, tentatives = business?.connexions ?? {}, maintenant = new Date() }) {
  return CONNEXIONS.map((c) => {
    const t = tentatives[c.id] ?? null;
    // Faute de date dans les données, une tentative réussie vaut lecture.
    const derniere = derniereLecture(c.id, { business, journal, serveurs }) ?? (t && !t.erreur && !t.ignore ? t.quand : null);
    const retard = derniere ? joursEntre(derniere, maintenant) : null;
    let etat;
    let detail;
    if (t?.erreur) {
      etat = 'erreur';
      detail = `Dernière tentative ratée : ${t.erreur}`;
    } else if (t?.ignore && !derniere) {
      etat = 'pas-branche';
      detail = 'Rien à lire : clé ou accès absent.';
    } else if (!derniere) {
      etat = 'pas-branche';
      detail = 'Jamais lue pour l’instant.';
    } else if (retard > 1) {
      etat = 'silence';
      detail = `Plus rien de lu depuis ${retard} jours.`;
    } else {
      etat = 'ok';
      detail = 'Lue normalement.';
    }
    return { ...c, etat, detail, derniere, retard, tentative: t?.quand ?? null };
  });
}

// Note la tentative de lecture d'une source dans business.connexions.
export function noterTentative(business, id, { erreur = null, ignore = false, maintenant = new Date() } = {}) {
  business.connexions ??= {};
  business.connexions[id] = { quand: maintenant.toISOString(), erreur: erreur ? String(erreur).slice(0, 300) : null, ignore: Boolean(ignore) };
  return business.connexions[id];
}

export const resumeConnexions = (liste, jour = jourParis()) => {
  void jour;
  const n = (etat) => liste.filter((c) => c.etat === etat).length;
  return { ok: n('ok'), silence: n('silence'), erreur: n('erreur'), pasBranche: n('pas-branche'), total: liste.length };
};
