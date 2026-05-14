# Hoops

Set a high score in this arcade-style basketball shooter.

A browser-based arcade basketball game with neon aesthetics, streak-based fire effects, and stage progression. Swipe to throw, chase the target score, beat the clock.

## Tech Stack

- HTML5 Canvas + Vanilla JavaScript
- Web Audio API (procedural sound)
- Vercel (hosting + serverless)

## Development

```bash
npm install
npm run dev      # Vercel dev server
npm run start    # Local static server
```

## VibeKit

The optional `/api/vibekit` endpoint lets maintainers run VibeKit commands in an
E2B sandbox. It is disabled unless the VibeKit environment variables are set and
requires `Authorization: Bearer $VIBEKIT_ADMIN_TOKEN`.

Required variables:

- `VIBEKIT_ADMIN_TOKEN`
- `E2B_API_KEY`
- `VIBEKIT_MODEL`
- `VIBEKIT_AGENT_API_KEY` or the provider-specific key, such as `OPENAI_API_KEY`

Example:

```bash
curl -X POST "$APP_URL/api/vibekit" \
  -H "Authorization: Bearer $VIBEKIT_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":"node --version"}'
```

## Deployment

Auto-deploys to Vercel on push to `main`.

## Docs

- [Game Design Document](Docs/GDD.md)
