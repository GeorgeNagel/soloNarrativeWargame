# CLAUDE.md

## Branching and PRs

- Each approved change: new branch off `main`, new PR. Never reuse a merged branch.
- Branch from `origin/main`, not a prior feature branch.
- No destructive git ops (force-push, reset --hard) to revive a merged branch — just start fresh.
- Only commit details explicitly approved in conversation.

## Compatibility

- Backwards compatibility is not a goal. Rename or reshape freely; no shims or fallbacks for old checkpoints, saved files or options.
