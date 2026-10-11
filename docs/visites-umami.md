# Compter les visites des sites avec Umami

Umami est un compteur de visites gratuit, sans cookie, qu'on installe soi-même. Il tourne sur le VPS Nūr, à côté de Nūr Meet, derrière Caddy, à l'adresse **stats.nourmeet.com**. Le cerveau le lit toutes les heures et montre, sur la page de chaque projet (Vue d'ensemble), les visiteurs, les pages vues, d'où viennent les visites et combien repartent tout de suite.

Chaque étape se tape une à la fois, sur le VPS Nūr (`ssh ubuntu@57.131.152.36`). Rien ici ne touche aux sites existants tant que la ligne de suivi (étape 5) n'est pas posée.

## 1. Le nom de domaine

Chez OVH, ajouter un enregistrement `A` pour `stats.nourmeet.com` vers l'adresse IP du VPS Nūr (la même que `n8n.nourmeet.com`).

## 2. Le conteneur Umami

Dans `~/nour-v2`, créer le fichier `docker-compose.umami.yml` :

```yaml
services:
  umami:
    image: ghcr.io/umami-software/umami:postgresql-latest
    container_name: umami
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://umami:${UMAMI_DB_MOT_DE_PASSE}@umami-db:5432/umami
      DATABASE_TYPE: postgresql
      APP_SECRET: ${UMAMI_APP_SECRET}
      DISABLE_TELEMETRY: "1"
    depends_on:
      umami-db:
        condition: service_healthy
    networks:
      - default
  umami-db:
    image: postgres:16-alpine
    container_name: umami-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: umami
      POSTGRES_USER: umami
      POSTGRES_PASSWORD: ${UMAMI_DB_MOT_DE_PASSE}
    volumes:
      - umami-db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U umami"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - default

volumes:
  umami-db:
```

Puis ajouter deux lignes au `.env` de `~/nour-v2` (deux mots de passe au hasard, à garder seulement là) :

```
UMAMI_DB_MOT_DE_PASSE=<un mot de passe au hasard>
UMAMI_APP_SECRET=<un autre mot de passe au hasard>
```

(`openssl rand -hex 24` en donne un.)

Lancer :

```
cd ~/nour-v2 && docker compose -f docker-compose.yml -f docker-compose.umami.yml up -d umami umami-db
```

## 3. Caddy

Dans `~/nour-v2/infra/Caddyfile`, ajouter :

```
stats.nourmeet.com {
    reverse_proxy umami:3000
}
```

Puis recharger Caddy : `docker exec nour-v2-caddy-1 caddy reload --config /etc/caddy/Caddyfile`.

## 4. Premier réglage dans Umami

Ouvrir **https://stats.nourmeet.com**. Identifiant `admin`, mot de passe `umami` : le changer tout de suite (Settings › Profile). Puis Settings › Websites › Add website, trois fois :

| Nom | Domaine (exactement) |
|---|---|
| Nūr Meet | `nourmeet.com` |
| Leviaro | `leviaro.fr` |
| VégéBudget | `vegebudget.fr` |

Les domaines doivent être ceux de `config/visites.json` du cerveau : c'est comme ça qu'il retrouve chaque site.

## 5. La ligne de suivi sur chaque site

Pour chaque site, Umami donne (Edit › Tracking code) une ligne du genre :

```html
<script defer src="https://stats.nourmeet.com/script.js" data-website-id="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></script>
```

À poser dans le `<head>` des pages du site (le gabarit principal de Nūr Meet, de Leviaro et de VégéBudget). Dès qu'elle est en place, les visites comptent ; les 30 jours se remplissent au fil du temps.

## 6. Dire au cerveau comment lire

Dans `~/cerveau-central/.env`, ajouter :

```
UMAMI_URL=https://stats.nourmeet.com
UMAMI_UTILISATEUR=admin
UMAMI_MOT_DE_PASSE=<le mot de passe choisi à l'étape 4>
```

Puis `cd ~/cerveau-central && docker compose up -d --build`. À la lecture suivante (toutes les heures), la page **Connexions** passe « Visites des sites (Umami) » en vert, et chaque page projet gagne son bloc « Visites du site ».

## Ce que ça change pour le pilotage

- Nūr Meet et Leviaro : combien de personnes arrivent sur le site (depuis les mails, Google, les réseaux), quelles pages elles regardent, et combien repartent sans rien faire.
- VégéBudget : les mêmes chiffres, en plus de ceux que le site donne déjà (semaines composées, inscrits, abonnés).
- Plus tard : les mêmes chiffres sur Aujourd'hui, et le parcours des visites (où ça décroche) comme pour VégéBudget.
