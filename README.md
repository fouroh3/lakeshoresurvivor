# Lakeshore Holiday Spirit Survivor

The staff-facing game site for the annual Lakeshore Holiday Spirit Survivor.

## Stack

- Next.js App Router on Netlify
- Netlify Database (PostgreSQL) for shared season, registration, draw, audit, and prize data
- GitHub `main` as the production source branch
- Organizer-recorded filmed hat draws, with a separate cryptographic random-draw option

## Run locally

```sh
npm ci
npm run dev
```

To use the production data locally, link the Netlify project and use `netlify dev`. For an isolated in-memory test database, run `SURVIVOR_TEST=true npm run dev`.

## Deployments

Netlify builds `main` and publishes each successful production build. Deploy previews use Netlify's database branch integration when enabled.

## Database migrations

SQL migrations live in `netlify/database/migrations`. Netlify applies them during deployment.

## Required production environment variables

- `ORGANIZER_PASSWORD_SALT`
- `ORGANIZER_PASSWORD_HASH`
- `SESSION_SECRET`

The database connection is supplied by Netlify Database. Never commit production secrets.
