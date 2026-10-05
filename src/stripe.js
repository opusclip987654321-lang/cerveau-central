// Stripe : l'argent qui rentre vraiment (clé restreinte en lecture seule,
// STRIPE_CLE dans le .env). On lit les encaissements et les abonnements actifs.
import { jourDe } from './business.js';

const appelParDefaut = (cle, delaiMs) => (chemin, params = {}) => {
  const url = new URL(`https://api.stripe.com/v1/${chemin}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return fetch(url, { headers: { authorization: `Bearer ${cle}` }, signal: AbortSignal.timeout(delaiMs) }).then(async (r) => {
    if (!r.ok) throw new Error(`Stripe répond ${r.status}${r.status === 401 ? ' (clé refusée)' : r.status === 403 ? ' (il manque une autorisation de lecture sur la clé)' : ''}`);
    return r.json();
  });
};

// Suit les pages de résultats Stripe (au plus `maxPages`).
async function lister(appel, chemin, params, maxPages = 5) {
  const tout = [];
  let apres = null;
  for (let page = 0; page < maxPages; page++) {
    const rep = await appel(chemin, { limit: '100', ...params, ...(apres ? { starting_after: apres } : {}) });
    tout.push(...(rep.data ?? []));
    if (!rep.has_more || !rep.data?.length) break;
    apres = rep.data.at(-1).id;
  }
  return tout;
}

export async function synchroniserStripe(business, { cle, delaiMs = 20_000, appel, maintenant = new Date() } = {}) {
  if (!appel && !cle) return { ignore: true };
  appel ??= appelParDefaut(cle, delaiMs);
  const depuis = Math.floor((maintenant - 90 * 86_400_000) / 1000);

  // L'argent réellement encaissé (après remboursements), net de frais Stripe.
  const mouvements = await lister(appel, 'balance_transactions', { 'created[gte]': String(depuis) });
  const encaissements = mouvements
    .filter((t) => ['charge', 'payment', 'refund', 'payment_refund'].includes(t.type))
    .map((t) => ({ jour: jourDe(new Date(t.created * 1000).toISOString()), montant: Math.round(t.net) / 100, devise: String(t.currency ?? 'eur').toUpperCase() }));

  const abonnements = await lister(appel, 'subscriptions', { status: 'active' });
  const parMois = (s) =>
    (s.items?.data ?? []).reduce((a, it) => {
      const p = it.price ?? {};
      const mensuel = p.recurring?.interval === 'year' ? (p.unit_amount ?? 0) / 12 : p.recurring?.interval === 'month' ? (p.unit_amount ?? 0) / (p.recurring?.interval_count ?? 1) : 0;
      return a + mensuel * (it.quantity ?? 1);
    }, 0);

  business.sources.stripe = {
    maj: maintenant.toISOString(),
    encaissements,
    abonnements: {
      actifs: abonnements.length,
      parMois: Math.round(abonnements.reduce((a, s) => a + parMois(s), 0)) / 100,
      essais: abonnements.filter((s) => s.status === 'trialing' || s.trial_end * 1000 > +maintenant).length,
    },
  };
  return { encaissements: encaissements.length, abonnements: abonnements.length };
}

// Total encaissé sur une période (la devise la plus fréquente fait foi, les autres sont comptées à part).
export function encaissePeriode(stripe, periode) {
  const dedans = (stripe?.encaissements ?? []).filter((t) => t.jour >= periode[0] && t.jour <= periode.at(-1));
  const parDevise = {};
  for (const t of dedans) parDevise[t.devise] = Math.round(((parDevise[t.devise] ?? 0) + t.montant) * 100) / 100;
  return parDevise;
}
