# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Branching and PRs

- Each new piece of approved work gets its **own new branch**, cut from the latest `main`, and its own PR into `main`.
- Do not reuse a branch whose PR has already been merged. After a merge, GitHub deletes the branch remotely; branching off `main` again for the next PR avoids stale-branch and force-push situations entirely.
- Before starting a new branch, fetch and branch from `origin/main` (not from a previous feature branch), so the base is always current.
- Avoid destructive git operations (`reset --hard`, `checkout -B` over an existing branch, forced rebases) to "fix up" an already-merged branch. If a branch's PR merged, just start a fresh branch instead of trying to reuse or rewrite it.
- Only commit details that the user has explicitly approved in conversation — do not add invented specifics, examples, or filler beyond what was discussed.
