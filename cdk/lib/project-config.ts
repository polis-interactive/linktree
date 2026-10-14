/** Public deployment identifiers, verified against AWS and the Git remote. */
export const project = {
  account: '066540957026',
  region: 'us-east-1',
  repository: 'polis-interactive/linktree',
  // GitHub's immutable OIDC subject format for repositories created after July 2026.
  oidcRepository: 'polis-interactive@86933915/linktree@1419497400',
  hostedZoneId: 'Z36FM6PW250QWX',
  githubProviderArn:
    'arn:aws:iam::066540957026:oidc-provider/token.actions.githubusercontent.com',
} as const;

// Dedicated bootstrap roles and assets; never grant the shared admin roles to CI.
export const bootstrap = {
  beta: { qualifier: 'polisltb', stackName: 'PolisLinktreeBootstrap-beta' },
  prod: { qualifier: 'polisltp', stackName: 'PolisLinktreeBootstrap-prod' },
} as const;

export type SiteStage = keyof typeof bootstrap;

export const stageTag = 'polis:linktree-stage';
export const betaStateParameter = '/polis/linktree/beta/enabled';
export const siteBucketName = (stage: SiteStage, account: string) =>
  `polis-linktree-${stage}-${account}`;
export const githubRoleName = (stage: SiteStage) =>
  `PolisLinktree-${stage}-github`;
