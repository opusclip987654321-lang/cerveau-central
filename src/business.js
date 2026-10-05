// Tableau de bord business du Journal : les chiffres qui servent à décider,
// projet par projet. Les chiffres viennent des vraies données (tableaux de
// prospection n8n, journal, vidéos…) ; ce qui n'est pas encore branché est dit.
import { readFile } from 'node:fs/promises';
import { sauverEtat as sauverJson } from './etat.js';
import { jourParis } from './questions.js';
import { projetDuWorkflow } from './journal.js';

export async function chargerBusiness(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { sources: {}, objectifs: {} };
    throw err;
  }
}
export const sauverBusiness = sauverJson;

// « 2026-10-05T08:12:00Z », « 2026-10-05 08:12 », « 05/10/2026 » → jour (Paris), sinon null.
export function jourDe(valeur) {
  if (valeur == null || valeur === '') return null;
  const t = String(valeur).trim();
  const fr = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (fr) return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d/.test(t) ? t.replace(' ', 'T') : t);
  return Number.isNaN(+d) ? null : jourParis(d);
}

// Lit toutes les lignes d'un tableau de données n8n (API publique, lecture seule).
export async function lireTableau(appel, id, maxPages = 40) {
  const lignes = [];
  let curseur = null;
  for (let page = 0; page < maxPages; page++) {
    const rep = await appel(`/api/v1/data-tables/${encodeURIComponent(id)}/rows?limit=250${curseur ? `&cursor=${encodeURIComponent(curseur)}` : ''}`);
    lignes.push(...(rep.data ?? []));
    if (!rep.nextCursor) break;
    curseur = rep.nextCursor;
  }
  return lignes;
}

// Va chercher la prospection Nūr Meet (tableaux np_*) et n'en garde que l'utile.
export async function synchroniserProspection(business, { url, cle, delaiMs = 20_000, appel, maintenant = new Date() } = {}) {
  if (!appel && (!url || !cle)) return { ignore: true };
  appel ??= (chemin) =>
    fetch(new URL(chemin, url), { headers: { 'X-N8N-API-KEY': cle, accept: 'application/json' }, signal: AbortSignal.timeout(delaiMs) }).then(async (r) => {
      if (!r.ok) throw new Error(`n8n répond ${r.status}`);
      return r.json();
    });
  const tableaux = (await appel('/api/v1/data-tables?limit=100')).data ?? [];
  const id = (nom) => tableaux.find((t) => t.name === nom)?.id;
  const lire = async (nom) => (id(nom) ? lireTableau(appel, id(nom)) : null);
  const [prospects, envois, ouvertures] = [await lire('np_prospects'), await lire('np_envois'), await lire('np_ouvertures')];
  if (!prospects) throw new Error('tableau np_prospects introuvable dans n8n');
  const pasTest = (l) => l.statut !== 'test';
  business.sources.prospection = {
    maj: maintenant.toISOString(),
    prospects: prospects.filter(pasTest).map((l) => ({
      statut: l.statut ?? null,
      email: Boolean(l.email),
      decouvert: jourDe(l.date_decouverte),
      premier: jourDe(l.date_premier_envoi),
      dernier: jourDe(l.date_dernier_envoi),
      reponse: jourDe(l.date_reponse),
    })),
    envois: (envois ?? []).filter(pasTest).map((l) => ({ statut: l.statut ?? null, jour: jourDe(l.date_decision) ?? jourDe(l.date_proposition) })),
    // Un même mail peut être ouvert plusieurs fois : on garde la première ouverture de chaque envoi.
    ouvertures: [...new Map((ouvertures ?? []).map((l) => [String(l.envoi_id), jourDe(l.date)]).reverse()).values()].filter(Boolean),
  };
  return { prospects: business.sources.prospection.prospects.length };
}

// Les `n` jours qui finissent à `jour`, du plus ancien au plus récent.
export function joursJusqua(jour, n) {
  return Array.from({ length: n }, (_, i) => jourParis(new Date(new Date(`${jour}T12:00:00Z`) - (n - 1 - i) * 86_400_000)));
}

const parJour = (jours, dates) => {
  const c = Object.fromEntries(jours.map((j) => [j, 0]));
  for (const d of dates) if (d in c) c[d]++;
  return jours.map((j) => c[j]);
};
const somme = (t) => t.reduce((a, b) => a + b, 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const nombre = (n) => n.toLocaleString('fr-FR');

// Dernier jour où quelque chose a eu lieu, et combien de jours depuis.
const joursDepuis = (dates, jour) => {
  const dernier = dates.filter((d) => d && d <= jour).sort().at(-1);
  return dernier ? Math.round((new Date(`${jour}T12:00:00Z`) - new Date(`${dernier}T12:00:00Z`)) / 86_400_000) : null;
};

// Objectif hebdomadaire proposé : un peu au-dessus de la moyenne des 4 dernières semaines.
export function proposerObjectif(datesSur28Jours) {
  return Math.max(1, Math.ceil((datesSur28Jours / 4) * 1.2));
}

// Couleur d'un projet : 🔴 rien depuis trop longtemps, 🟠 en dessous de l'objectif
// ou souci à régler, 🟢 sinon. Projet en pause : ⏸.
function couleur({ enPause, silence, joursMax, atteint, souci, branche }) {
  if (enPause) return 'pause';
  if (!branche && silence === null) return 'gris';
  if (silence === null || silence > joursMax) return 'rouge';
  if (souci || (atteint !== null && atteint < 0.7)) return 'orange';
  return 'vert';
}

// Exécutions réussies des automatisations d'un projet dont le nom correspond à `motif`.
function executions(journal, configJournal, projet, motif, jours) {
  const re = new RegExp(motif, 'i');
  return jours.map((j) =>
    Object.entries(journal.n8n?.jours?.[j] ?? {})
      .filter(([nom]) => re.test(nom) && projetDuWorkflow(nom, configJournal, journal.n8n.instances?.[nom]) === projet)
      .reduce((a, [, c]) => a + c.ok, 0),
  );
}
const evenements = (journal, projet, types) => journal.evenements.filter((e) => e.projet === projet && types.includes(e.type)).map((e) => e.jour);

// Construit le tableau : une carte par projet.
export function tableauDeBord({ business, journal, configJournal, pauses = { projets: {} }, jour = jourParis(), jours = 7 }) {
  const periode = joursJusqua(jour, jours);
  const avant = joursJusqua(jourParis(new Date(new Date(`${periode[0]}T12:00:00Z`) - 86_400_000)), jours);
  const mois = joursJusqua(jour, 28);
  const reglages = configJournal.tableau ?? {};
  const objectifs = business.objectifs ?? {};
  const cartes = [];

  // Une carte « simple » : une série principale (ce qui est publié ou envoyé).
  // `branche` : la source principale est lue automatiquement (sinon seules les notes comptent).
  const carte = (id, { titre, dates, unite, extra = [], aDecider = [], manque = [], souci = false, joursMax, branche = true }) => {
    const p = configJournal.projets.find((x) => x.id === id);
    const serie = parJour(periode, dates);
    const total = somme(serie);
    const precedent = somme(parJour(avant, dates));
    const obj = objectifs[id];
    const objectif = obj?.valide ? Math.round((obj.valeur * jours) / 7) : null;
    const silence = joursDepuis(dates, jour);
    const max = joursMax ?? reglages[id]?.joursMax ?? 3;
    const c = {
      id,
      nom: p?.nom ?? id,
      couleur: couleur({ enPause: Boolean(pauses.projets?.[id]), silence, joursMax: max, atteint: objectif ? total / objectif : null, souci, branche }),
      principal: { titre, unite, total, precedent, objectif, serie },
      chiffres: extra,
      aDecider: [...aDecider],
      manque,
      objectif: { propose: proposerObjectif(somme(parJour(mois, dates))), valide: obj?.valide ? obj.valeur : null, unite },
      silence,
    };
    if (c.couleur !== 'pause' && c.couleur !== 'gris' && (silence === null || silence > max))
      c.aDecider.unshift(silence === null ? `Aucun ${unite} enregistré pour l'instant.` : `Plus aucun ${unite} depuis ${silence} jours : relancer ou mettre en pause ?`);
    cartes.push(c);
    return c;
  };

  // Nūr Meet : prospection des restaurants.
  const pr = business.sources?.prospection;
  if (pr) {
    const envoyes = pr.envois.filter((e) => e.statut === 'envoye').map((e) => e.jour);
    const echecs = pr.envois.filter((e) => e.statut === 'echec');
    const reponses = pr.prospects.map((x) => x.reponse).filter(Boolean);
    const sansEmail = pr.prospects.filter((x) => x.statut === 'sans_email').length;
    const aValider = pr.prospects.filter((x) => x.statut === 'propose').length;
    const enRelance = pr.prospects.filter((x) => /^relance/.test(x.statut ?? '')).length;
    const repPeriode = somme(parJour(periode, reponses));
    const echecsPeriode = somme(parJour(periode, echecs.map((e) => e.jour)));
    const envPeriode = somme(parJour(periode, envoyes));
    const aDecider = [];
    if (aValider) aDecider.push(`${nombre(aValider)} mail(s) attendent ta validation sur Telegram.`);
    if (sansEmail > pr.prospects.length / 3)
      aDecider.push(`${nombre(sansEmail)} restaurants trouvés n'ont pas d'email (${pct(sansEmail, pr.prospects.length)} %) : chercher leur email autrement, ou les appeler ?`);
    const tauxEchec = pct(echecsPeriode, envPeriode + echecsPeriode);
    if (tauxEchec >= 10) aDecider.push(`${tauxEchec} % des envois échouent cette période : vérifier l'adresse d'envoi des mails.`);
    const c = carte('nour-meet', {
      titre: 'Mails envoyés aux restaurants',
      dates: envoyes,
      unite: 'mail envoyé',
      souci: tauxEchec >= 10,
      aDecider,
      extra: [
        { titre: 'Réponses', valeur: repPeriode, detail: `${pct(reponses.length, envoyes.length) ?? 0} % de réponse depuis le début (${nombre(reponses.length)} sur ${nombre(envoyes.length)})` },
        { titre: 'Mails ouverts', valeur: somme(parJour(periode, pr.ouvertures)) },
        { titre: 'Restaurants trouvés', valeur: somme(parJour(periode, pr.prospects.map((x) => x.decouvert))), detail: `${nombre(enRelance)} en relance` },
      ],
      manque: ['rendez-vous / démos', 'abonnements payés (Stripe)'],
    });
    c.secondaire = { titre: 'Réponses', serie: parJour(periode, reponses) };
  } else {
    carte('nour-meet', { titre: 'Mails envoyés aux restaurants', dates: [], unite: 'mail envoyé', branche: false, manque: ['prospection (lecture n8n pas encore faite)'] });
  }

  // Impacteur : invités contactés. Tant que la source n'est pas branchée, on compte
  // les mails notés dans le journal.
  carte('impacteur', { titre: 'Invités contactés', dates: evenements(journal, 'impacteur', ['mail']), unite: 'invité contacté', branche: false, manque: ['liste des invités contactés'] });

  // L'extrait politique : vidéos publiées (automatisation PUBLICATION + notes).
  const motifPub = reglages['extrait-politique']?.publication ?? 'publi';
  const pubAuto = executions(journal, configJournal, 'extrait-politique', motifPub, mois);
  const pubDates = [...mois.flatMap((j, i) => Array(pubAuto[i]).fill(j)), ...evenements(journal, 'extrait-politique', ['video', 'publication'])];
  carte('extrait-politique', { titre: 'Vidéos publiées', dates: pubDates, unite: 'vidéo publiée', manque: ['vues', 'abonnés gagnés', 'revenus YouTube'] });

  // Petites histoires vraies : vidéos (programme + vidéos faites à la main notées).
  carte('histoires-vraies', {
    titre: 'Vidéos publiées',
    dates: evenements(journal, 'histoires-vraies', ['video', 'publication']),
    unite: 'vidéo publiée',
    joursMax: reglages['histoires-vraies']?.joursMax ?? 7,
    manque: ['vues (Facebook, Instagram, YouTube)'],
  });

  // Leviaro et Cambodge : pas encore de source, seulement les notes.
  // Leviaro : sa base (leviaro-agent), lue chaque heure.
  const lv = business.sources?.leviaro;
  if (lv) {
    const premiers = lv.envois.filter((m) => m.etape === 0).map((m) => m.jour);
    const relances = lv.envois.filter((m) => m.etape > 0).map((m) => m.jour);
    const reponses = lv.reponses.map((r) => r.jour);
    const aTraiter = lv.reponses.filter((r) => !r.traitee).length;
    const echecsPeriode = somme(parJour(periode, lv.echecs));
    const aDecider = [];
    if (aTraiter) aDecider.push(`${nombre(aTraiter)} réponse(s) de prospect pas encore traitée(s).`);
    if (lv.aValider) aDecider.push(`${nombre(lv.aValider)} mail(s) attendent ta validation.`);
    if (lv.recommandations) aDecider.push(`${nombre(lv.recommandations)} recommandation(s) de l'agent à accepter ou refuser.`);
    if (echecsPeriode) aDecider.push(`${nombre(echecsPeriode)} mail(s) en échec définitif cette période : vérifier les adresses.`);
    const c = carte('leviaro', {
      titre: 'Prospects contactés',
      dates: premiers,
      unite: 'prospect contacté',
      joursMax: reglages.leviaro?.joursMax,
      souci: echecsPeriode > 0,
      aDecider,
      extra: [
        { titre: 'Réponses', valeur: somme(parJour(periode, reponses)), detail: `${pct(reponses.length, premiers.length) ?? 0} % de réponse depuis le début (${nombre(reponses.length)} sur ${nombre(premiers.length)})` },
        { titre: 'Relances envoyées', valeur: somme(parJour(periode, relances)) },
        { titre: 'Entreprises trouvées', valeur: somme(parJour(periode, lv.entreprises)), detail: `${nombre(lv.enDiscussion)} en discussion · coût IA du mois ${lv.coutMois.toLocaleString('fr-FR')} €` },
      ],
      manque: ['clients signés'],
    });
    c.secondaire = { titre: 'Réponses', serie: parJour(periode, reponses) };
  } else {
    carte('leviaro', { titre: 'Prospects contactés', dates: evenements(journal, 'leviaro', ['mail']), unite: 'prospect contacté', branche: false, manque: ['prospects de leviaro.db'] });
  }
  carte('cambodge', { titre: 'Candidatures envoyées', dates: evenements(journal, 'cambodge', ['mail']), unite: 'candidature', joursMax: 7, branche: false, manque: ['candidatures'] });

  return { periode, cartes, maj: pr?.maj ?? null };
}

// Lignes d'alerte du matin : projets en rouge (rien envoyé/publié depuis trop longtemps).
export function messageSilences(tableau) {
  const rouges = tableau.cartes.filter((c) => c.couleur === 'rouge' && c.silence !== null);
  if (!rouges.length) return null;
  return ['🔴 <b>À relancer</b>', ...rouges.map((c) => `${c.nom} : aucun ${c.principal.unite} depuis ${c.silence} jours`)].join('\n');
}

// louis valide (ou change) l'objectif hebdomadaire d'un projet.
export function validerObjectif(business, projet, valeur, maintenant = new Date()) {
  const n = Math.round(Number(String(valeur).replace(',', '.')));
  if (!Number.isFinite(n) || n < 1 || n > 100_000) return { erreur: 'Objectif invalide.' };
  (business.objectifs ??= {})[projet] = { valeur: n, valide: maintenant.toISOString() };
  return { ok: true };
}
