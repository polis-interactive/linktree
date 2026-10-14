import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { basicAuthCode } from '../lib/basic-auth';
import { SiteStack } from '../lib/site-stack';
import { GithubStack } from '../lib/github-stack';
import { bootstrap, project } from '../lib/project-config';

const env = { account: '111111111111', region: 'us-east-1' };

for (const stage of ['beta', 'prod'] as const) {
  test(`${stage}: private S3, OAC, TLS, DNS, and correct auth association`, () => {
    const template = Template.fromStack(
      new SiteStack(new App(), `Test-${stage}`, {
        env,
        stage,
        hostedZoneId: 'ZEXAMPLE',
        betaUsername: 'tester',
        betaPassword: 'test-password',
      }),
    );
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      VersioningConfiguration: { Status: 'Enabled' },
    });
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
          Match.objectLike({
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Condition: { StringEquals: { 'AWS:SourceArn': Match.anyValue() } },
          }),
        ]),
      },
    });
    const bucket = Object.values(template.findResources('AWS::S3::Bucket'))[0];
    assert.equal(bucket.DeletionPolicy, stage === 'beta' ? 'Delete' : 'Retain');
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 0);
    template.resourceCountIs('AWS::IAM::Role', 0);
    template.resourceCountIs('AWS::Lambda::Function', 0);
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: `polis-linktree-${stage}-${env.account}`,
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        Origins: Match.arrayWith([
          Match.objectLike({
            OriginAccessControlId: {
              'Fn::ImportValue': `PolisLinktree-${stage}-OriginAccessControlId`,
            },
          }),
        ]),
      },
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        Aliases: [
          stage === 'beta' ? 'beta.linktree.polis.tv' : 'linktree.polis.tv',
        ],
        DefaultCacheBehavior: {
          ViewerProtocolPolicy: 'redirect-to-https',
          FunctionAssociations:
            stage === 'beta'
              ? Match.arrayWith([
                  Match.objectLike({ EventType: 'viewer-request' }),
                ])
              : Match.absent(),
        },
        ViewerCertificate: Match.objectLike({
          MinimumProtocolVersion: 'TLSv1.2_2021',
        }),
      },
    });
    template.resourceCountIs(
      'AWS::CloudFront::Function',
      stage === 'beta' ? 1 : 0,
    );
    template.resourceCountIs('AWS::Route53::RecordSet', 2);
  });
}

test('beta auth denies missing/wrong credentials and strips valid credentials before origin', () => {
  const code = basicAuthCode('tester', 'test-password');
  assert.ok(!code.includes('test-password'));
  const handler = runInNewContext(`${code}; handler`, {
    require: () => ({ createHash }),
  });
  assert.equal(handler({ request: { headers: {} } }).statusCode, 401);
  assert.equal(
    handler({
      request: { headers: { authorization: { value: 'Basic wrong' } } },
    }).statusCode,
    401,
  );
  const request = {
    uri: '/assets/main.wasm',
    headers: {
      authorization: {
        value: `Basic ${Buffer.from('tester:test-password').toString('base64')}`,
      },
    },
  };
  assert.equal(handler({ request }), request);
  assert.equal('authorization' in request.headers, false);
  assert.throws(() => basicAuthCode('', 'password'));
  assert.throws(() => basicAuthCode('user:name', 'password'));
  assert.throws(() => basicAuthCode('user', ''));
});

test('OIDC trust requires main for beta and the prod environment for production', () => {
  const template = Template.fromStack(
    new GithubStack(new App(), 'Permissions', {
      env,
      repository: project.repository,
      oidcRepository: project.oidcRepository,
      providerArn: project.githubProviderArn,
    }),
  );
  for (const stage of ['beta', 'prod']) {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub':
                  stage === 'beta'
                    ? `repo:${project.oidcRepository}:ref:refs/heads/main`
                    : `repo:${project.oidcRepository}:environment:prod`,
              },
            },
          }),
        ]),
      },
    });
  }
  template.resourceCountIs('AWS::IAM::OIDCProvider', 0);
});

test('each GitHub role can assume only its own deployment and publishing roles', () => {
  const template = Template.fromStack(
    new GithubStack(new App(), 'PermissionsScope', {
      env,
      repository: project.repository,
      oidcRepository: project.oidcRepository,
      providerArn: project.githubProviderArn,
    }),
  );
  const policies = template.findResources('AWS::IAM::Policy');
  assert.equal(Object.keys(policies).length, 2);
  for (const [stage, { qualifier }] of Object.entries(bootstrap)) {
    const policy = Object.entries(policies).find(([id]) =>
      id.startsWith(`${stage}DeployRole`),
    )?.[1];
    assert.ok(policy);
    const statements = policy.Properties.PolicyDocument.Statement;
    const assume = statements.find(
      (s: { Action: string }) => s.Action === 'sts:AssumeRole',
    );
    assert.ok(assume);
    assert.equal(assume.Resource.length, 2);
    const serialized = JSON.stringify(statements);
    assert.ok(serialized.includes(`cdk-${qualifier}-deploy-role-`));
    assert.ok(serialized.includes(`cdk-${qualifier}-file-publishing-role-`));
    assert.ok(!serialized.includes('hnb659fds'));
    assert.ok(!serialized.includes('lookup-role'));
    const other =
      stage === 'beta' ? bootstrap.prod.qualifier : bootstrap.beta.qualifier;
    assert.ok(!serialized.includes(other));
  }
});
