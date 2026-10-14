# First deployment

Nothing in this repository has been deployed by scaffolding it. AWS account access,
GitHub environments, and DNS ownership are external prerequisites.

## Human bootstrap identity

Use an IAM Identity Center login or a temporary assumed role for the initial setup.
Keep the root account for root-only account administration. Prefer short-lived sessions
over creating another IAM user with long-lived access keys. Proposed local profile:
`polis-bootstrap`; region: `us-east-1`.

The bootstrap identity needs permission to create the CDK bootstrap resources and initial
OIDC roles. CDK deployment roles then handle CI/CD. Pick an approved CloudFormation
execution policy before bootstrapping; the task deliberately requires its ARN instead
of silently choosing AdministratorAccess.

## Configure AWS

1. Authenticate your chosen human identity and set its profile/account:

   ```sh
   export AWS_PROFILE=polis-bootstrap
   export CDK_DEFAULT_ACCOUNT=YOUR_12_DIGIT_ACCOUNT_ID
   export HOSTED_ZONE_ID=YOUR_POLIS_TV_PUBLIC_HOSTED_ZONE_ID
   export GITHUB_REPOSITORY=YOUR_ORG/YOUR_REPO
   export CDK_EXECUTION_POLICY_ARN=arn:aws:iam::YOUR_ACCOUNT:policy/YOUR_APPROVED_POLICY
   ```

2. Run `cargo make bootstrap`. The execution policy needs the services used by the
   hosting stack (S3, CloudFront, ACM, Route53, and IAM/Lambda/logging for CDK asset
   deployment). Scope resources and permissions boundaries to your account policy.

3. If the account already has a GitHub OIDC provider, set `GITHUB_OIDC_PROVIDER_ARN`
   to its ARN. Otherwise the permissions stack creates it. Run
   `cargo make permissions-deploy` and record its beta/prod role ARN outputs.

## Configure GitHub

Create GitHub environments named `beta` and `prod`. Each environment needs:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `AWS_ACCOUNT_ID` | Target AWS account ID |
| Variable | `AWS_DEPLOY_ROLE_ARN` | Corresponding permissions-stack role ARN |
| Variable | `HOSTED_ZONE_ID` | Existing public hosted zone ID for `polis.tv` |
| Beta secret | `BETA_BASIC_AUTH_USERNAME` | Nonempty username without `:` or newlines |
| Beta secret | `BETA_BASIC_AUTH_PASSWORD` | Long random password without newlines |

Restrict beta environment deployments to `main`. Restrict production deployments to
your release tag pattern (for example `v*`), and configure required reviewers if desired.
OIDC environment subjects do not themselves restrict branches, so these restrictions
are part of the trust configuration. Protect `main` with the `CI / check` required check.

The production trigger is exactly `release: created`, as requested. GitHub does not
emit this workflow event for draft releases; create a non-draft, non-prerelease release
directly. If your process starts with draft releases, change the trigger to `published`.
See [GitHub's release event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release).

## Local deployment and verification

With the same account and zone variables, set beta credentials in your shell for a beta
deploy (never commit them). Run `cargo make deploy-beta` or `cargo make deploy-prod`.
Each command builds the app, synthesizes, and shows a diff before CDK deployment.
GitHub jobs deploy without an interactive prompt inside the configured environment.

After the first beta deployment, verify HTTP redirects to HTTPS, unauthenticated HTTPS
returns `401`, and authenticated HTTPS loads the page and WASM assets. Check production
loads without an auth prompt. These are live smoke checks; offline tests cannot verify
certificate issuance, DNS delegation, IAM execution policy, or actual CloudFront behavior.
