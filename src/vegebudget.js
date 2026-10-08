// VégéBudget : le site donne lui-même ses chiffres de fréquentation (GET /api/stats,
// protégés par un jeton). On garde les 90 derniers jours : visiteurs, semaines
// composées, inscrits, clics sur « payer », réservations, et d'où viennent les visites.
const entier = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0);

export async function synchroniserVegebudget(business, { url, jeton, delaiMs = 20_000, appel, maintenant = new Date() } = {}) {
  if (!appel && (!url || !jeton)) return { ignore: true };
  appel ??= () =>
    fetch(new URL('/api/stats?jours=90', url), { headers: { authorization: `Bearer ${jeton}` }, signal: AbortSignal.timeout(delaiMs) }).then(async (r) => {
      if (!r.ok) throw new Error(`vegebudget.fr répond ${r.status}`);
      return r.json();
    });
  const rep = await appel();
  if (!Array.isArray(rep?.jours)) throw new Error('réponse de vegebudget.fr illisible');
  const jours = rep.jours
    .filter((j) => /^\d{4}-\d{2}-\d{2}$/.test(j?.jour ?? ''))
    .map((j) => ({
      jour: j.jour,
      visiteurs: entier(j.visiteurs),
      semaines: entier(j.semaines),
      offreVue: entier(j.offreVue),
      connexions: entier(j.connexionsDemandees),
      inscrits: entier(j.inscrits),
      clicsPayer: entier(j.clicsPayer),
      reservations: entier(j.reservations),
    }));
  const t = rep.totaux ?? {};
  business.sources.vegebudget = {
    maj: maintenant.toISOString(),
    jours,
    sources: (Array.isArray(rep.sources) ? rep.sources : []).slice(0, 10).map((s) => ({ source: String(s.source ?? '?').slice(0, 60), n: entier(s.n) })),
    totaux: { membres: entier(t.membres), abonnes: entier(t.abonnes), reservationsFondateur: entier(t.reservationsFondateur), reservationsPremium: entier(t.reservationsPremium) },
    parcours: lireParcours(rep.parcours),
  };
  return { jours: jours.length };
}

// Parcours de chaque visite (pages, temps, lecture, clics) et où les visiteurs décrochent.
// Absent tant que le site n'est pas à jour : la page l'indique.
const texte = (v, max = 80) => String(v ?? '').slice(0, max);
const liste = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
function lireParcours(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.entonnoir)) return null;
  return {
    jours: entier(p.jours), visites: entier(p.visites), rebonds: entier(p.rebonds),
    constats: liste(p.constats, 8).map((c) => texte(c, 300)),
    entonnoir: liste(p.entonnoir, 10).map((x) => ({ libelle: texte(x.libelle), visites: entier(x.visites), perdues: entier(x.perdues), pertePct: entier(x.pertePct) })),
    pages: liste(p.pages, 25).map((x) => ({ page: texte(x.page), vues: entier(x.vues), entrees: entier(x.entrees), sorties: entier(x.sorties), tauxSortie: entier(x.tauxSortie), secondesMoy: entier(x.secondesMoy), luMoyPct: entier(x.luMoyPct) })),
    clics: liste(p.clics, 20).map((x) => ({ page: texte(x.page), texte: texte(x.texte), n: entier(x.n) })),
    dernieres: liste(p.dernieres, 40).map((v) => ({
      jour: texte(v.jour, 10), heure: texte(v.heure, 5), source: texte(v.source, 60), entree: texte(v.entree), sortie: texte(v.sortie),
      pages: entier(v.pages), clics: entier(v.clics), secondes: entier(v.secondes), rebond: !!v.rebond, plusLoin: texte(v.plusLoin),
      parcours: liste(v.parcours, 60).map((x) => ({ heure: texte(x.heure, 5), type: texte(x.type, 5), page: texte(x.page), texte: texte(x.texte), secondes: entier(x.secondes), lu: entier(x.lu) })),
    })),
  };
}

// Les dates d'une étape, une par personne (pour les séries du tableau de bord).
export const datesDe = (vb, cle) => (vb?.jours ?? []).flatMap((j) => Array(j[cle] ?? 0).fill(j.jour));
