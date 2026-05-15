# Dependency Ledger

## Watch List

### `@randroids-dojo/vibekit`

- **Why watched**: internally maintained, pre-1.0, breaking changes possible on every release.
- **Source**: https://github.com/Randroids-Dojo/VibeKit/releases
- **Pin format**: `github:Randroids-Dojo/VibeKit#vX.Y.Z` (tag-pinned).
- **Currently pinned**: `v0.2.3`
- **Detect-new**: `gh api repos/Randroids-Dojo/VibeKit/releases/latest --jq .tag_name`
- **Migration notes**: pre-1.0 means any release may break callers. Read the kit's CHANGELOG.md between pinned and target tag. Hoops currently has no bundler/transpiler, so root client imports from the kit's TypeScript source are not runtime-safe until the app gains a build step or the kit ships compiled JavaScript.
