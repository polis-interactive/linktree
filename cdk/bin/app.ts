import * as cdk from 'aws-cdk-lib';
import { SiteStack } from '../lib/site-stack';
import { GithubStack } from '../lib/github-stack';
import { bootstrap, project, SiteStage } from '../lib/project-config';
import { BootstrapStack } from '../lib/bootstrap-stack';

const app = new cdk.App();
const preview = app.node.tryGetContext('preview') === 'true';
const stage: string = app.node.tryGetContext('stage') ?? 'beta';
if (!['beta', 'prod', 'permissions'].includes(stage))
  throw new Error('stage must be beta, prod, or permissions');
function required(name: string, sample: string): string {
  const value = process.env[name];
  if (!value && !preview)
    throw new Error(
      `Set ${name}; use cargo make infra-synth for offline preview`,
    );
  return value || sample;
}
const env = {
  account: preview ? '111111111111' : project.account,
  region: project.region,
};
if (
  !preview &&
  process.env.CDK_DEFAULT_ACCOUNT &&
  process.env.CDK_DEFAULT_ACCOUNT !== project.account
)
  throw new Error('AWS account does not match cdk/lib/project-config.ts');
if (stage === 'permissions') {
  const permissions = new GithubStack(app, 'PolisLinktreePermissions', {
    env,
    repository: project.repository,
    oidcRepository: project.oidcRepository,
    providerArn: preview
      ? `arn:aws:iam::${env.account}:oidc-provider/token.actions.githubusercontent.com`
      : project.githubProviderArn,
  });
  for (const siteStage of ['beta', 'prod'] as SiteStage[]) {
    const resources = new BootstrapStack(app, bootstrap[siteStage].stackName, {
      env,
      stage: siteStage,
      hostedZoneId: preview ? 'Z000000000000EXAMPLE' : project.hostedZoneId,
      terminationProtection: true,
    });
    permissions.addStackDependency(resources);
  }
} else {
  new SiteStack(app, `PolisLinktree-${stage}`, {
    env,
    stage: stage as SiteStage,
    synthesizer: new cdk.DefaultStackSynthesizer({
      qualifier: bootstrap[stage as SiteStage].qualifier,
      // Reuse the stage deploy role for lookups; never assume the shared bootstrap.
      lookupRoleArn: `arn:aws:iam::${env.account}:role/cdk-${bootstrap[stage as SiteStage].qualifier}-deploy-role-${env.account}-${env.region}`,
    }),
    hostedZoneId: preview ? 'Z000000000000EXAMPLE' : project.hostedZoneId,
    betaUsername:
      stage === 'beta'
        ? required('BETA_BASIC_AUTH_USERNAME', 'preview')
        : undefined,
    betaPassword:
      stage === 'beta'
        ? required(
            'BETA_BASIC_AUTH_PASSWORD',
            'preview-only-not-for-deployment',
          )
        : undefined,
    terminationProtection: stage === 'prod',
  });
}
