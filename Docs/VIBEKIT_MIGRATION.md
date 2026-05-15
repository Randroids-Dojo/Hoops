# VibeKit Migration Notes

## Completed

- Hoops now builds through Vite with TypeScript enabled.
- Hoops consumes `@randroids-dojo/vibekit` for shared math, RNG, storage, rim scoring, and swipe gesture helpers.
- The ordered rim scoring sensor was upstreamed to VibeKit and released in `v0.2.1`.
- The swipe gesture classifier was upstreamed to VibeKit and released in `v0.2.2`.
- VibeKit server KV now accepts both `KV_REST_API_*` and `UPSTASH_REDIS_REST_*` env names as of `v0.2.3`.
- Distance and endless mode rules are extracted into Hoops-local pure TypeScript with tests.

## Keep Local For Now

- `api/leaderboard.js`: the sorted-set mechanics are reusable, but Hoops' mode-specific score ordering, bounds, metadata, and Vercel API runtime make a full VibeKit server import premature.
- `src/updateBanner.js`: small and useful, but not enough surface area yet to justify a VibeKit module. Revisit if another app needs the same version polling UI.
- `src/particles.js`: overlaps with VibeKit's existing confetti module. Keep Hoops' fire, score burst, and edge pulse emitters local unless VibeKit grows a broader generic 2D particle system.
