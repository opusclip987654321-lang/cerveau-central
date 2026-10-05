// Rédige les messages d'alerte envoyés à louis : d'abord ce que ça change pour le
// projet, en clair ; le détail technique vient en petit, à la fin.
import { expliquer } from './sens.js';

const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function redigerAlerte(type, projet, verif, resultat, avant) {
  const { pour, texte } = expliquer(projet, verif, resultat, type);
  const technique = `<i>${echapper(verif.nom)} : ${echapper(resultat.detail)}</i>`;
  switch (type) {
    case 'panne':
      return `🔴 <b>${echapper(pour)}</b>\n${echapper(texte)}\n${technique}`;
    case 'attention':
      return `🟠 <b>${echapper(pour)}</b>\n${echapper(texte)}\n${technique}`;
    case 'retabli': {
      const duree = avant?.depuis ? ` après ${dureeLisible(Date.now() - new Date(avant.depuis))}` : '';
      return `🟢 <b>${echapper(pour)}</b>\nRevenu à la normale${duree}, rien à faire.\n${technique}`;
    }
    case 'evenement':
      return `🟠 <b>${echapper(pour)}</b>\n${echapper(texte)}\n<i>${echapper(resultat.detail)}</i>`;
  }
}

export function dureeLisible(ms) {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${String(min % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)} jours`;
}
