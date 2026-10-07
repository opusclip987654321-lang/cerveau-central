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
  };
  return { jours: jours.length };
}

// Les dates d'une étape, une par personne (pour les séries du tableau de bord).
export const datesDe = (vb, cle) => (vb?.jours ?? []).flatMap((j) => Array(j[cle] ?? 0).fill(j.jour));
