#!/bin/bash
set -euo pipefail

# Parallel task merges can change package manifests and the lockfile separately.
pnpm install --no-frozen-lockfile

# Apply additive schema updates; never force destructive migration decisions.
pnpm --filter @workspace/db --fail-if-no-match run push
