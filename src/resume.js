// Résumé quotidien envoyé sur Telegram le matin : état des projets, incidents des
// dernières 24 h et questions du jour qui attendent.

const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function resumeQuotidien(etat, questionsEnAttente, maintenant = new Date()) {
  const toutes = Object.values(etat.verifications);
  const pannes = toutes.filter((v) => v.etat === 'panne');
  const attentions = toutes.filter((v) => v.etat === 'attention');
  const depuis = maintenant - 86_400_000;
  const incidents = etat.historique.filter((h) => new Date(h.date) >= depuis && h.type !== 'retabli');

  const lignes = ['🧠 <b>Résumé du jour</b>'];
  if (!etat.derniereVerification) lignes.push('Pas encore de vérification.');
  else if (pannes.length) lignes.push(`🔴 ${pannes.length} panne(s) en cours :`, ...pannes.map((v) => `• ${echapper(v.nom)} : ${echapper(v.detail)}`));
  else lignes.push('🟢 Tout tourne.');
  if (attentions.length) lignes.push(`🟠 À surveiller :`, ...attentions.map((v) => `• ${echapper(v.nom)} : ${echapper(v.detail)}`));
  lignes.push(incidents.length ? `Dernières 24 h : ${incidents.length} incident(s).` : 'Dernières 24 h : aucun incident.');
  if (questionsEnAttente) lignes.push('', `✍️ ${questionsEnAttente} question(s) du jour t'attendent sur ta page.`);
  return lignes.join('\n');
}
