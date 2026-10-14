#!/usr/bin/env bash
set -euo pipefail
stage="${1:?Expected beta or prod}"
case "$stage" in beta|prod) ;; *) echo 'Expected beta or prod' >&2; exit 1 ;; esac
: "${CDK_DEFAULT_ACCOUNT:?Set CDK_DEFAULT_ACCOUNT}"
: "${HOSTED_ZONE_ID:?Set HOSTED_ZONE_ID for polis.tv}"
if [[ "$stage" == beta ]]; then
  : "${BETA_BASIC_AUTH_USERNAME:?Set the beta username}"
  : "${BETA_BASIC_AUTH_PASSWORD:?Set the beta password}"
fi
cd "$(dirname "${BASH_SOURCE[0]}")/.."
test -s ../ui/dist/index.html
# Never use an offline preview assembly for deployment.
npm run cdk -- synth --quiet --strict -c "stage=$stage" --output "cdk.out.$stage"
npm run cdk -- diff --app "cdk.out.$stage"
approval=broadening
if [[ "${GITHUB_ACTIONS:-false}" == true ]]; then approval=never; fi
npm run cdk -- deploy --app "cdk.out.$stage" --require-approval "$approval"
