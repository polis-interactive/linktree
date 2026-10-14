import * as cdk from 'aws-cdk-lib';
import * as path from 'node:path';
import { SiteStack } from '../lib/site-stack';
import { GithubStack } from '../lib/github-stack';

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
  account: required('CDK_DEFAULT_ACCOUNT', '111111111111'),
  region: 'us-east-1',
};
if (stage === 'permissions') {
  new GithubStack(app, 'PolisLinktreePermissions', {
    env,
    repository: required('GITHUB_REPOSITORY', 'example/linktree'),
    providerArn: process.env.GITHUB_OIDC_PROVIDER_ARN,
  });
} else {
  new SiteStack(app, `PolisLinktree-${stage}`, {
    env,
    stage: stage as 'beta' | 'prod',
    hostedZoneId: required('HOSTED_ZONE_ID', 'Z000000000000EXAMPLE'),
    sitePath: path.resolve(__dirname, '../../ui/dist'),
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
