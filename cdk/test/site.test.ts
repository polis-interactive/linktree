import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { basicAuthCode } from '../lib/basic-auth';
import { SiteStack } from '../lib/site-stack';
import { GithubStack } from '../lib/github-stack';

const sitePath = mkdtempSync(join(tmpdir(), 'polis-site-test-'));
writeFileSync(join(sitePath, 'index.html'), 'Hello, Polis.');
const env = { account: '111111111111', region: 'us-east-1' };

for (const stage of ['beta', 'prod'] as const) {
  test(`${stage}: private S3, OAC, TLS, DNS, and correct auth association`, () => {
    const template = Template.fromStack(
      new SiteStack(new App(), `Test-${stage}`, {
        env,
        stage,
        sitePath,
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
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
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

test('OIDC trust is limited to the repository and named GitHub environments', () => {
  const template = Template.fromStack(
    new GithubStack(new App(), 'Permissions', {
      env,
      repository: 'polis/linktree',
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
                'token.actions.githubusercontent.com:sub': `repo:polis/linktree:environment:${stage}`,
              },
            },
          }),
        ]),
      },
    });
  }
});
