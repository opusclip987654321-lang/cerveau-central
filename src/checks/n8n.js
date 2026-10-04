// Lit dans n8n les exécutions tombées en erreur depuis la dernière vérification.
// Facultatif : sans N8N_API_KEY, la vérification est simplement ignorée.

export async function verifierN8n(_verif, _seuils, { url, cle, depuis, delaiMs = 15_000 } = {}) {
  if (!url || !cle) return { etat: 'ignore', detail: 'clé API n8n pas encore fournie' };
  const appel = (chemin) =>
    fetch(new URL(chemin, url), { headers: { 'X-N8N-API-KEY': cle, accept: 'application/json' }, signal: AbortSignal.timeout(delaiMs) }).then(async (r) => {
      if (!r.ok) throw new Error(`n8n répond ${r.status}`);
      return r.json();
    });
  let executions, workflows;
  try {
    [executions, workflows] = await Promise.all([appel('/api/v1/executions?status=error&limit=50'), appel('/api/v1/workflows?limit=250')]);
  } catch (err) {
    return { etat: 'panne', detail: `API n8n injoignable (${err.message})` };
  }
  const noms = new Map((workflows.data ?? []).map((w) => [String(w.id), w.name]));
  const actifs = (workflows.data ?? []).filter((w) => w.active).length;
  const limite = depuis ? new Date(depuis) : new Date(Date.now() - 86_400_000);
  const recentes = (executions.data ?? []).filter((e) => new Date(e.startedAt) > limite);
  const erreurs = recentes.map((e) => ({ id: e.id, workflow: noms.get(String(e.workflowId)) ?? `workflow ${e.workflowId}`, date: e.startedAt }));
  if (erreurs.length === 0) return { etat: 'ok', detail: `${actifs} automatisations actives, aucune erreur récente` };
  const parWorkflow = [...new Set(erreurs.map((e) => e.workflow))];
  return {
    etat: 'attention',
    detail: `${erreurs.length} exécution(s) en erreur : ${parWorkflow.join(', ')}`,
    erreurs,
  };
}
