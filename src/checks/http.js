// Vérifie qu'une adresse web répond correctement.

export async function verifierSite(verif, seuils, { tentatives = 2, pauseMs = 30_000, delaiMs = 15_000 } = {}) {
  let dernier;
  for (let essai = 1; essai <= tentatives; essai++) {
    dernier = await unAppel(verif, seuils, delaiMs);
    if (dernier.etat !== 'panne') return dernier;
    if (essai < tentatives) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return dernier;
}

async function unAppel(verif, seuils, delaiMs) {
  const debut = Date.now();
  let reponse;
  try {
    reponse = await fetch(verif.url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(delaiMs),
      headers: { 'user-agent': 'cerveau-central/0.1 (surveillance)' },
    });
  } catch (err) {
    const raison = err.name === 'TimeoutError' ? `pas de réponse après ${delaiMs / 1000} s` : `injoignable (${err.cause?.code ?? err.message})`;
    return { etat: 'panne', detail: raison };
  }
  const ms = Date.now() - debut;
  const attendus = verif.statuts ?? [200, 301, 302, 303, 307, 308];
  if (!attendus.includes(reponse.status)) {
    await reponse.body?.cancel();
    return { etat: 'panne', detail: `répond ${reponse.status}`, ms };
  }
  if (verif.json) {
    let corps;
    try {
      corps = await reponse.json();
    } catch {
      return { etat: 'panne', detail: 'réponse illisible', ms };
    }
    for (const [cle, valeur] of Object.entries(verif.json)) {
      if (corps?.[cle] !== valeur) return { etat: 'panne', detail: `${cle} = ${JSON.stringify(corps?.[cle])}`, ms };
    }
  } else {
    await reponse.body?.cancel();
  }
  if (ms > seuils.lenteurMs) return { etat: 'attention', detail: `lent (${(ms / 1000).toFixed(1)} s)`, ms };
  return { etat: 'ok', detail: `répond en ${ms} ms`, ms };
}
