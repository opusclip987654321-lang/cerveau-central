#!/bin/sh
# Relevé « grand public » de Nūr Meet pour le cerveau central (loop du 19/10) :
# comptes de particuliers, candidatures, places payées, soirées à venir, posts
# Instagram / Facebook de l'article du jour, origine des visiteurs et tunnel (visiteurs →
# exploration → soirée ouverte → compte → candidature → place payée).
# Lancé chaque heure par cron sur le VPS Nūr ; LECTURE SEULE dans la base du site
# (conteneur nour-v2-postgres-1), puis envoi du résumé au cerveau.
# Réglages dans ~/.cerveau-releve (le même fichier que scripts/releve.sh) :
#   CERVEAU_URL=https://cerveau.nourmeet.com
#   RELEVE_JETON=...      (le même que dans le .env du cerveau)
set -eu
. "$HOME/.cerveau-releve"
CONTENEUR="${NOUR_PG_CONTENEUR:-nour-v2-postgres-1}"

docker exec -i "$CONTENEUR" sh -c 'psql -U "$POSTGRES_USER" -d "${POSTGRES_DB:-nour_meet}" -At -v ON_ERROR_STOP=1' <<'SQL' |
WITH particuliers AS (
  SELECT * FROM "User" WHERE role = 'PARTICIPANT' AND NOT "isDemo" AND "deletedAt" IS NULL
), visiteurs AS (
  -- Tunnel grand public (axes de louis du 20/10) : visiteurs hors équipe et restaurateurs, 30 jours.
  SELECT "anonId", count(DISTINCT path) pages, bool_or(path LIKE '/events/%') soiree FROM "PageView"
  WHERE "createdAt" > now() - interval '30 days' AND coalesce("userRole", 'PARTICIPANT') = 'PARTICIPANT' GROUP BY 1
), confirmes AS (
  SELECT "eventId", count(*) n FROM "Reservation" WHERE "confirmedAt" IS NOT NULL AND "cancelledAt" IS NULL GROUP BY 1
)
SELECT json_build_object(
  'comptesTotal', (SELECT count(*) FROM particuliers),
  'tunnel', json_build_object('visiteurs', (SELECT count(*) FROM visiteurs),
      'explorent', (SELECT count(*) FROM visiteurs WHERE pages >= 2),
      'soirees', (SELECT count(*) FROM visiteurs WHERE soiree)),
  'comptes', (SELECT coalesce(json_agg(json_build_object('jour', j, 'n', n) ORDER BY j), '[]') FROM (
      SELECT to_char("createdAt" AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') j, count(*) n FROM particuliers
      WHERE "createdAt" > now() - interval '90 days' GROUP BY 1) t),
  'candidatures', (SELECT coalesce(json_agg(json_build_object('jour', j, 'n', n) ORDER BY j), '[]') FROM (
      SELECT to_char(a."createdAt" AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') j, count(*) n FROM "Application" a JOIN particuliers u ON u.id = a."userId"
      WHERE a."createdAt" > now() - interval '90 days' GROUP BY 1) t),
  'places', (SELECT coalesce(json_agg(json_build_object('jour', j, 'n', n) ORDER BY j), '[]') FROM (
      SELECT to_char("confirmedAt" AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') j, count(*) n FROM "Reservation"
      WHERE "confirmedAt" > now() - interval '90 days' GROUP BY 1) t),
  'soirees', (SELECT coalesce(json_agg(json_build_object(
      'titre', e.title, 'lieu', e.district, 'quand', to_char(e."startsAt" AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI'),
      'places', e.capacity, 'inscrits', coalesce(c.n, 0), 'minimum', e."minParticipants", 'demo', e."isDemo") ORDER BY e."startsAt"), '[]')
      FROM "Event" e LEFT JOIN confirmes c ON c."eventId" = e.id
      WHERE e.status IN ('PUBLISHED', 'FULL') AND e."startsAt" > now()),
  'posts', (SELECT coalesce(json_agg(json_build_object(
      'jour', coalesce("autoPublishDay", to_char("publishedAt" AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD')),
      'insta', "instagramMediaId" IS NOT NULL, 'instaErreur', left("instagramError", 200),
      'fb', "facebookPostId" IS NOT NULL, 'fbErreur', left("facebookError", 200),
      'portee', "instagramInsights"->>'reach', 'abonnes', "instagramInsights"->>'follows',
      'profil', "instagramInsights"->>'profile_visits', 'format', "instagramVariant"->>'format') ORDER BY "publishedAt"), '[]')
      FROM "Article" WHERE status = 'PUBLISHED' AND "publishedAt" > now() - interval '45 days'),
  'origines', (SELECT coalesce(json_agg(json_build_object('source', s, 'n', n) ORDER BY n DESC), '[]') FROM (
      SELECT coalesce(nullif("utmSource", ''), "referrerHost", 'direct') s, count(DISTINCT "anonId") n FROM "PageView"
      WHERE "createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 10) t)
);
SQL
curl -fsS -m 60 -X POST -H "Authorization: Bearer $RELEVE_JETON" -H 'content-type: application/json' \
  --data-binary @- "$CERVEAU_URL/api/nour-public"
