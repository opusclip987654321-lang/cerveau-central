// Résumé quotidien envoyé sur Telegram le matin : état des projets et incidents
// des dernières 24 h. Les questions du jour ont disparu (choix de louis du 11/10) :
// le cerveau pose ses questions dans les fiches d'action.

const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function resumeQuotidien(etat, aFaire = 0, maintenant = new Date()) {
  const toutes = Object.values(etat.verifications);
  const pannes = toutes.filter((v) => v.etat === 'panne');
  const depuis = maintenant - 86_400_000;
  const incidents = etat.historique.filter((h) => new Date(h.date) >= depuis && h.type !== 'retabli');

  const lignes = ['🧠 <b>Résumé du jour</b>'];
  if (!etat.derniereVerification) lignes.push('Pas encore de vérification.');
  else if (pannes.length) lignes.push(`🔴 ${pannes.length} panne(s) en cours :`, ...pannes.map((v) => `• ${echapper(v.nom)} : ${echapper(v.detail)}`));
  else lignes.push('Aucune panne en cours.');
  lignes.push(incidents.length ? `Dernières 24 h : ${incidents.length} incident(s).` : 'Dernières 24 h : aucun incident.');
  if (aFaire) lignes.push('', `✋ ${aFaire} fiche(s) attendent ta décision dans Actions.`);
  return lignes.join('\n');
}
