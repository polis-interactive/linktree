# First deployment

AWS access and DNS ownership are verified. Beta uses a manual Actions checkbox and
repository secrets; it does not need a GitHub Environment. Production still uses
the `prod` GitHub Environment.

## Verified account configuration

`cdk/lib/project-config.ts` records public identifiers verified on 2026-10-14:

| Setting | Value |
| --- | --- |
| Repository | `polis-interactive/linktree` |
| AWS account / region | `066540957026` / `us-east-1` |
| Existing public `polis.tv` zone | `Z36FM6PW250QWX` |
| Existing GitHub OIDC provider | `arn:aws:iam::066540957026:oidc-provider/token.actions.githubusercontent.com` |

The `default` AWS profile is authenticated as root for initial setup. The existing
`CDKToolkit` stack uses qualifier `hnb659fds` and its CloudFormation execution role
has AdministratorAccess. Do not give application workflows access to those roles.
The app checks that the CLI account matches the configured target account.

## AWS permissions setup

All three setup stacks were deployed successfully on 2026-10-14. Both bootstrap
stacks have termination protection enabled. The first beta site deployment failed
on ACM certificate creation and CloudFront function tagging, leaving the site stack
in `ROLLBACK_COMPLETE`. No site resources survived that rollback.

The IAM correction was applied to all three setup stacks on 2026-10-14 using the
privileged local AWS session, after the account owner explicitly approved its
broader CloudFront initial-tagging authority. See the scope exception in
[architecture](architecture.md#permissions). The post-update CDK diff is empty.
Live verification passed all 160 IAM simulation decisions and reported zero Access
Analyzer findings on deployed inline policies. Account-wide console reads remain
allowed. These checks validate policies, not successful site provisioning.
Retry the site through the Beta GitHub Actions pipeline; no site deployment was
retried locally.

Initial setup verification passed: 148 IAM simulation decisions, zero Access
Analyzer findings on deployed inline policies, and zero CDK differences across all
three stacks. Those simulations supplied assumed tag context and did not establish
that creation would work. `cargo make check` passed, including 16 infrastructure tests.

`cargo make bootstrap-plan` synthesizes and shows a read-only diff of all three
setup stacks. `cargo make bootstrap` (also `permissions-deploy`) deploys them:

- `PolisLinktreeBootstrap-beta`: isolated CDK roles, asset bucket, and OAC.
- `PolisLinktreeBootstrap-prod`: the equivalent production resources.
- `PolisLinktreePermissions`: GitHub OIDC roles using the existing provider.

All new roles have account-wide AWS-managed ReadOnlyAccess so console listing and
inspection work, including `s3:ListAllMyBuckets`, `s3:ListBucket`, and
`s3:GetBucketLocation`. Writes are scoped to their environment. The CloudFormation
execution roles cannot create IAM identities. These stacks do not modify the
existing administrator bootstrap. See [architecture](architecture.md#permissions).

Run `cargo make permissions-verify` with a privileged inspection identity to validate
live policies and simulate the allowed/denied actions. `cargo make check` runs all
offline checks without AWS credentials. `CDK_APPROVAL=never cargo make bootstrap`
is available for an explicitly reviewed, noninteractive setup deployment.

Ongoing non-root local access remains separate work. These are automation roles;
no new human login, IAM access key, or console password is created. GitHub uses
temporary OIDC credentials and needs no AWS access-key secret.

## Beta: one control in Actions

1. Push these workflow changes to `main`; manual workflows must exist on the default
   branch before GitHub shows **Run workflow**.
2. Add repository Actions secrets `BETA_BASIC_AUTH_USERNAME` and
   `BETA_BASIC_AUTH_PASSWORD`. Use a nonempty username without `:` or newlines and a
   long random password without newlines. No beta environment or role-ARN variable
   is required.
3. Open **Actions → Beta → Run workflow**, select `main`, and check **Enable beta**.
   This saves the enabled setting and immediately runs validation and deployment.
4. To turn beta off, run the same workflow with **Enable beta unchecked**. It saves
   the disabled setting, empties every version/delete marker in beta's site bucket,
   and deletes the beta site stack. Allow approximately 5–15 minutes for CloudFront
   deployment/deletion; the workflow waits for AWS to finish deleting the stack.

Beta starts **disabled**. Once enabled, every push to `main` deploys the current main
revision. Once disabled, pushes keep it absent. The checkbox is an instruction for
that run, not a display of the stored state; the run summary shows the chosen state.
Changing an Actions variable alone cannot trigger deployment or teardown.

The saved setting lives in SSM Parameter Store at `/polis/linktree/beta/enabled`,
owned by the beta bootstrap stack. It survives site deletion. IAM roles, OAC,
bootstrap assets, and the existing hosted zone remain so beta can be recreated.
Production resources are not touched. Beta bucket deletion is intentional: the site
is rebuildable from the repository. Production's bucket retains its versions.

All beta runs share a concurrency group with `queue: max`, so pending manual toggles
are not replaced by arriving pushes. GitHub queues by the time a run starts waiting;
wait for a toggle to complete before issuing the opposite toggle. Each push reads
the current saved state after entering the queue. Failed enables remain enabled for
retry on the next push; failed deletions remain disabled and retry on the next run.
No beta credentials or UI build are needed for teardown.

`cargo make beta-state` reads the saved state. `BETA_REQUEST=enable` or `disable`
changes it; this internal task only saves the setting. The workflow applies it via
`cargo make deploy-beta` or `cargo make destroy-beta`. For local maintenance, apply
the corresponding command after changing state and do not overlap an active workflow.
The destroy command refuses an enabled beta or the wrong AWS account.

See [manual workflow runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
and [GitHub concurrency queues](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency).
Actionlint 1.7.12 predates `concurrency.queue`; validation suppresses only that known
syntax warning while retaining its other workflow checks.

## Production configuration

Create a GitHub environment named `prod` with variable `AWS_DEPLOY_ROLE_ARN` set to
`arn:aws:iam::066540957026:role/PolisLinktree-prod-github`. Restrict deployments to your
release tag pattern (for example `v*`) and configure reviewers if desired. Protect
`main` with the `CI / check` required check.

Beta's OIDC trust uses the exact repository and `refs/heads/main`. Production's trust
uses the exact repository and `prod` environment. Both use GitHub's immutable
owner/repository IDs, required by the default subject format for repositories created
after July 15, 2026. See [GitHub's OIDC reference](https://docs.github.com/en/actions/reference/security/oidc).

The production trigger is `release: created`. GitHub does not emit this workflow event
for draft releases; create a non-draft, non-prerelease release directly. If your process
starts with drafts, change the trigger to `published`. See
[GitHub's release event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release).

## Local deployment and verification

Use an authenticated profile for the configured account. Set beta credentials in your
shell for a beta deploy (never commit them). Run `cargo make deploy-beta` or `cargo make deploy-prod`.
Each command builds the app, synthesizes, shows a diff, deploys infrastructure,
uploads assets with `index.html` last, and requests a CloudFront invalidation. Old
hashed assets remain available for open browser sessions. Local deployment currently
requires a privileged identity; the bootstrap trusts only its GitHub environment role.
GitHub jobs deploy without an interactive prompt.

After the first beta deployment, verify HTTP redirects to HTTPS, unauthenticated HTTPS
returns `401`, and authenticated HTTPS loads the page and WASM assets. Check production
loads without an auth prompt. These are live smoke checks; offline tests cannot verify
certificate issuance, DNS delegation, IAM execution policy, or actual CloudFront behavior.
