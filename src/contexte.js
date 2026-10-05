// Résumé texte de tout ce que sait le cerveau, donné à Claude pour l'onglet Discuter.
import { bilan, historique, totalLisible, montantLisible, FREQUENCES, moisLisible } from './argent.js';
import { bilanSemaine } from './journal.js';
import { analyser, parProjet, goLisible } from './serveurs.js';
import { jourParis } from './questions.js';

export function contexteCerveau({ etat, argent, journal, serveurs, configServeurs, configJournal, pauses, business, reponses, jour = jourParis() }) {
  const parties = [];
  const nomProjet = (id) => configJournal.projets.find((p) => p.id === id)?.nom ?? id;

  const verifs = Object.values(etat?.verifications ?? {});
  parties.push(
    `## État (vérifications techniques)\n${verifs.map((v) => `- [${v.projet}] ${v.nom} : ${v.etat}, ${v.detail}`).join('\n') || 'aucune vérification encore'}`,
  );

  if (argent) {
    const b = bilan(argent.lignes, jour);
    const h = historique(argent.lignes, jour);
    parties.push(
      `## Argent (dépenses ; les revenus ne sont pas encore branchés)\nCe mois-ci : ${totalLisible(b.ceMois)} · fixe par mois : ${totalLisible(b.fixe)} · recharges 30 derniers jours : ${totalLisible(b.trenteJours)}\n` +
        `Par mois : ${h.mois.slice(0, 6).map((x) => `${moisLisible(x.mois)} ${totalLisible(x.total)}`).join(' ; ')}\n` +
        `Lignes :\n${argent.lignes.map((l) => `- ${l.libelle} (${nomProjet(l.projet)}) : ${montantLisible(l.montant, l.devise)} ${FREQUENCES[l.frequence]}${l.date ? `, ${l.date}` : ''}`).join('\n')}`,
    );
  }

  if (journal) {
    const semaine = bilanSemaine(journal, configJournal, jour);
    const lignes = Object.entries(semaine).map(([p, t]) => {
      const types = Object.entries(t.types).map(([ty, n]) => `${n} ${ty}`).join(', ');
      return `- ${nomProjet(p)} : ${types || 'aucun événement noté'} ; automatisations : ${t.executions} exécutions réussies, ${t.erreurs} en erreur`;
    });
    const recents = journal.evenements.slice(0, 15).map((e) => `- ${e.jour} [${nomProjet(e.projet)}] ${e.titre}${e.lien ? ` (${e.lien})` : ''}`);
    parties.push(`## Journal, 7 derniers jours\n${lignes.join('\n') || 'rien'}\nDerniers événements :\n${recents.join('\n') || 'aucun'}`);
  }

  if (serveurs && configServeurs) {
    const l = configServeurs.serveurs.map((s) => {
      const d = serveurs.serveurs?.[s.id];
      if (!d?.dernier) return `- ${s.nom} (${s.prix}) : pas de relevé`;
      const a = analyser(d, configServeurs);
      const projets = Object.entries(parProjet(d.dernier, configServeurs)).map(([p, x]) => `${p} ${goLisible(x.disque ?? 0)}`).join(', ');
      return `- ${s.nom} (${s.prix}, ${s.role}) : disque ${a.pctDisque} %, mémoire ${a.pctMemoire} %${a.joursAvantPlein !== null ? `, plein dans ~${a.joursAvantPlein} j` : ''} ; projets : ${projets}`;
    });
    parties.push(`## Serveurs\n${l.join('\n')}`);
  }

  if (business?.objectifs && Object.keys(business.objectifs).length) {
    const obj = Object.entries(business.objectifs).map(([p, o]) => `- ${nomProjet(p)} : ${o?.valide ?? o} par semaine`);
    parties.push(`## Objectifs hebdomadaires validés par louis\n${obj.join('\n')}`);
  }

  if (reponses?.reponses?.length) {
    const recentes = reponses.reponses.slice(-30).map((r) => `- ${r.jour} [${nomProjet(r.projet)}] ${r.texte} → ${r.reponse}`);
    parties.push(`## Réponses de louis aux questions du jour (les plus récentes)\n${recentes.join('\n')}`);
  }

  const enPause = Object.entries(pauses?.projets ?? {}).map(([p, x]) => `${nomProjet(p)} (depuis ${x.depuis.slice(0, 10)})`);
  parties.push(`## Projets en pause\n${enPause.join(', ') || 'aucun'}\nNote : Petites histoires vraies, la fabrication automatique est arrêtée, louis fait les vidéos à la main.`);
  return parties.join('\n\n');
}
