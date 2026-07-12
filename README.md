# F1 26 Telemetry Dashboard

Dashboard de télémétrie temps réel pour F1 26 : un pont Node écoute le flux UDP émis par le jeu, le relaie en WebSocket vers un frontend React (dashboard "pit wall" en direct), et persiste chaque session en base MySQL pour pouvoir la retrouver plus tard et comparer des tours entre eux sur des courbes filtrables.

## Architecture

```
┌─────────────────┐        UDP:20777         ┌──────────────────────┐
│                  │   paquets binaires       │                      │
│   F1 26 (jeu)    │ ─────────────────────▶   │     apps/bridge      │
│                  │                          │  Node · dgram + ws   │
└─────────────────┘                          │  + API REST express  │
     Réseau local / même PC                   └──────┬────────┬──────┘
                                                       │        │
                                     WebSocket:8787    │        │  MySQL:3307
                                     JSON état courant │        │  sessions + télémétrie
                                                        ▼        ▼
                                          ┌──────────────────┐ ┌──────────────┐
                                          │     apps/web      │ │ docker-compose│
                                          │  React · Vite     │ │  mysql + adminer│
                                          │ Direct + Historique│ └──────────────┘
                                          └────────┬───────────┘
                                                    │
                                              déployé sur
                                                    ▼
                                            ┌───────────────┐
                                            │    Vercel     │
                                            └───────────────┘
```

Le jeu diffuse ses paquets de télémétrie en UDP sur le réseau local. `apps/bridge` les écoute, les parse, republie un état JSON en continu à tous les clients WebSocket connectés (page **Direct**), et enregistre en parallèle des échantillons dans MySQL, regroupés automatiquement par session (détection via le Session UID des paquets F1 26). La page **Historique** du frontend interroge l'API REST du bridge pour retrouver une session par nom ou par date, choisir les tours à comparer et les métriques à tracer.

**Point important** : le bridge doit tourner sur une machine qui reçoit effectivement les paquets UDP du jeu (donc sur le même PC, ou sur le même réseau local avec l'IP du bridge renseignée dans les réglages du jeu). Vercel n'héberge que le frontend — il ne peut pas recevoir de flux UDP, faire tourner un socket persistant, ni se connecter à une base MySQL locale. La page Historique doit donc pointer (via `VITE_API_URL`) vers le bridge accessible depuis le poste qui consulte le dashboard.

## Structure du repo

```
.
├── apps/
│   ├── web/            # Frontend React (Vite) — déployé sur Vercel
│   └── bridge/         # Pont UDP -> WebSocket + API REST + persistance MySQL
├── docker/
│   └── mysql/init.sql  # Schéma (sessions, telemetry_samples)
├── docker-compose.yml   # MySQL + Adminer en local
├── pnpm-workspace.yaml
├── package.json
├── eslint.config.js
├── .prettierrc
├── commitlint.config.js
├── .husky/
├── .github/workflows/ci.yml
└── vercel.json
```

## Configuration du jeu

Dans F1 26 : `Game Options > Settings > Telemetry Settings`

| Paramètre      | Valeur                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| UDP Telemetry  | On                                                                                                    |
| UDP IP Address | `127.0.0.1` si le bridge tourne sur le même PC, sinon l'IP locale de la machine qui héberge le bridge |
| UDP Port       | `20777`                                                                                               |
| UDP Send Rate  | 60Hz                                                                                                  |
| UDP Format     | 2026                                                                                                  |

## Installation

```bash
pnpm install
cp .env.example .env                     # secrets MySQL pour docker-compose
cp apps/bridge/.env.example apps/bridge/.env   # connexion du bridge à MySQL
cp apps/web/.env.example apps/web/.env         # URL du WebSocket et de l'API REST
```

## Lancer en local

```bash
pnpm db:up        # démarre MySQL (port 3307 par défaut) + Adminer sur http://localhost:8080
pnpm dev:bridge    # écoute l'UDP du jeu, sert le WebSocket (8787) et l'API REST (8788)
pnpm dev:web       # lance le frontend sur http://localhost:5173
```

`pnpm db:down` arrête les conteneurs (les données restent dans le volume Docker `mysql_data`).

Le port MySQL par défaut est `3307` (et non `3306`) pour éviter les conflits avec une instance MySQL déjà installée en local — ajustable via `MYSQL_PORT` dans `.env`.

## Persistance et historique des sessions

- À chaque nouveau Session UID détecté dans le flux UDP, `apps/bridge` crée automatiquement une ligne `sessions` (nommée par défaut `Session <date> <heure>`, renommable depuis la page Historique) et y rattache les échantillons de télémétrie (au maximum 10 par seconde) tant que le Session UID ne change pas.
- La page **Historique** du frontend permet de :
  - retrouver une session par nom (recherche partielle) ou par plage de dates ;
  - choisir les tours à afficher (case à cocher par tour, couleur stable par numéro de tour) ;
  - choisir les métriques à tracer (vitesse, régime moteur, accélérateur, frein, direction, rapport, température moteur, températures pneus) — un graphique par métrique, les tours sélectionnés superposés sur un axe "temps dans le tour" ;
  - basculer en vue tableau (min / moyenne / max par tour et par métrique).

## Coach IA

Le panneau **Coach IA** (page Historique) compare un tour choisi à un tour de référence (le meilleur tour de la session par défaut) : le bridge détecte les virages par minima locaux de vitesse, calcule pour chacun le point de freinage, la vitesse d'apex, le délai de réaccélération et l'écart avec le tour de référence, puis envoie ce résumé compact (jamais la télémétrie brute) à une API LLM compatible OpenAI pour obtenir un commentaire de coaching en français.

Configuration dans `apps/bridge/.env` :

| Variable       | Description                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_BASE_URL` | URL de base de l'API (compatible `/chat/completions` façon OpenAI) — fonctionne avec OpenAI, OpenRouter, Groq, DeepSeek, Together, Ollama local, etc. |
| `LLM_API_KEY`  | Clé API du fournisseur choisi                                                                                                                         |
| `LLM_MODEL`    | Nom du modèle à utiliser                                                                                                                              |

## Déploiement du frontend sur Vercel

Le `vercel.json` à la racine du repo pilote le build directement depuis la racine du monorepo (Root Directory Vercel = `.`) :

- Install Command : `pnpm install --frozen-lockfile`
- Build Command : `pnpm build:web`
- Output Directory : `apps/web/dist`

Variables d'environnement à ajouter dans le projet Vercel :

- `VITE_WS_URL` : laissée à `ws://localhost:8787` si tu regardes toujours le dashboard depuis le PC qui héberge le bridge (les navigateurs autorisent le WebSocket non chiffré vers `localhost` même depuis une page HTTPS), sinon une URL `wss://...` pointant vers un tunnel (Tailscale, Cloudflare Tunnel, ngrok) exposant le bridge en HTTPS/WSS pour consulter le dashboard depuis un autre appareil
- `VITE_API_URL` : même logique, pointant vers l'API REST du bridge (`http://localhost:8788` en local, ou son équivalent `https://...` via tunnel)

Le pont (`apps/bridge`) et la base MySQL ne sont pas déployés — ils continuent de tourner en local à chaque session de jeu.

## Conventions du projet

- Code en anglais, commentaires et messages de commit en français
- [Conventional Commits](https://www.conventionalcommits.org/fr/) imposés via commitlint + Husky (`feat:`, `fix:`, `chore:`, `docs:`, ...)
- pnpm workspaces pour le monorepo
- ESLint + Prettier
- CI GitHub Actions : lint + build sur chaque push/PR

## Scripts disponibles

| Commande          | Description                                       |
| ----------------- | ------------------------------------------------- |
| `pnpm dev:bridge` | Lance le pont UDP → WebSocket + API REST en local |
| `pnpm dev:web`    | Lance le frontend en mode développement           |
| `pnpm build:web`  | Build de production du frontend                   |
| `pnpm db:up`      | Démarre MySQL + Adminer via Docker Compose        |
| `pnpm db:down`    | Arrête les conteneurs Docker Compose              |
| `pnpm lint`       | Lint de tout le monorepo                          |
| `pnpm format`     | Formatage avec Prettier                           |
