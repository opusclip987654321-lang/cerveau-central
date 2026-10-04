// Rédige les messages d'alerte envoyés à louis.

const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function redigerAlerte(type, projet, verif, resultat, avant) {
  const qui = `<b>${echapper(projet.nom)}</b> · ${echapper(verif.nom)}`;
  const detail = echapper(resultat.detail);
  switch (type) {
    case 'panne':
      return `🔴 ${qui}\nEn panne : ${detail}`;
    case 'attention':
      return `🟠 ${qui}\nÀ surveiller : ${detail}`;
    case 'retabli': {
      const duree = avant?.depuis ? ` après ${dureeLisible(Date.now() - new Date(avant.depuis))}` : '';
      return `🟢 ${qui}\nRétabli${duree} : ${detail}`;
    }
    case 'evenement': {
      const lignes = resultat.erreurs.slice(0, 10).map((e) => `• ${echapper(e.workflow)}`);
      const reste = resultat.erreurs.length > 10 ? `\n… et ${resultat.erreurs.length - 10} autre(s)` : '';
      return `🟠 ${qui}\n${resultat.erreurs.length} exécution(s) en erreur :\n${lignes.join('\n')}${reste}`;
    }
  }
}

export function dureeLisible(ms) {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${String(min % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)} jours`;
}
