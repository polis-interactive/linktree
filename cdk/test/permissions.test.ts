import assert from 'node:assert/strict';
import { test } from 'node:test';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { BootstrapStack } from '../lib/bootstrap-stack';
import { GithubStack } from '../lib/github-stack';
import { bootstrap, githubRoleName, project } from '../lib/project-config';
import { deploymentStatements, siteWriteStatements } from '../lib/policies';

const env = { account: '111111111111', region: 'us-east-1' };
for (const stage of ['beta', 'prod'] as const) {
  test(`${stage}: bootstrap roles are readable, stage-scoped, and cannot create IAM identities`, () => {
    const template = Template.fromStack(
      new BootstrapStack(new App(), `Bootstrap-${stage}`, {
        env,
        stage,
        hostedZoneId: 'ZEXAMPLE',
      }),
    );
    const roles = template.findResources('AWS::IAM::Role');
    assert.equal(Object.keys(roles).length, 3);
    for (const role of Object.values(roles)) {
      assert.match(
        JSON.stringify(role.Properties.ManagedPolicyArns),
        /policy\/ReadOnlyAccess/,
      );
      assert.doesNotMatch(JSON.stringify(role), /AdministratorAccess/);
    }
    for (const kind of ['DeploymentRole', 'FilePublishingRole']) {
      const role = Object.entries(roles).find(([id]) =>
        id.startsWith(kind),
      )?.[1];
      assert.ok(role);
      assert.match(
        JSON.stringify(role.Properties.AssumeRolePolicyDocument),
        new RegExp(githubRoleName(stage)),
      );
      assert.match(
        JSON.stringify(role.Properties.AssumeRolePolicyDocument),
        /aws:PrincipalArn/,
      );
    }
    const writes = siteWriteStatements(
      stage,
      env.account,
      env.region,
      'ZEXAMPLE',
    ).map((s) => s.toStatementJson());
    const actions = writes.flatMap((s) => s.Action);
    assert.ok(
      actions.every(
        (action: string) =>
          !action.startsWith('iam:') && !action.startsWith('lambda:'),
      ),
    );
    const deploy = deploymentStatements(stage, env.account, env.region).map(
      (s) => s.toStatementJson(),
    );
    const pass = deploy.find((s) => s.Action === 'iam:PassRole');
    assert.equal(
      pass?.Resource,
      `arn:aws:iam::${env.account}:role/cdk-${bootstrap[stage].qualifier}-cfn-exec-role-${env.account}-${env.region}`,
    );
    assert.deepEqual(pass?.Condition, {
      StringEquals: { 'iam:PassedToService': 'cloudformation.amazonaws.com' },
    });
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: `/cdk-bootstrap/${bootstrap[stage].qualifier}/version`,
      Value: '8',
    });
  });
}

test('GitHub roles retain AWS console discovery access', () => {
  const template = Template.fromStack(
    new GithubStack(new App(), 'Github', {
      env,
      repository: project.repository,
      oidcRepository: project.oidcRepository,
      providerArn: project.githubProviderArn,
    }),
  );
  for (const stage of ['beta', 'prod'] as const) {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: githubRoleName(stage),
      ManagedPolicyArns: Match.arrayWith([
        Match.objectLike({ 'Fn::Join': Match.anyValue() }),
      ]),
    });
  }
  for (const role of Object.values(template.findResources('AWS::IAM::Role'))) {
    assert.match(
      JSON.stringify(role.Properties.ManagedPolicyArns),
      /policy\/ReadOnlyAccess/,
    );
  }
});

test('CloudFront and ACM write scope uses unforgeable CloudFormation ownership tags', () => {
  const writes = siteWriteStatements(
    'beta',
    env.account,
    env.region,
    'ZEXAMPLE',
  ).map((s) => s.toStatementJson());
  for (const sid of [
    'ManageTaggedCloudFrontResources',
    'ManageTaggedCertificates',
  ]) {
    const statement = writes.find((s) => s.Sid === sid);
    assert.equal(
      statement?.Condition.StringEquals[
        'aws:ResourceTag/aws:cloudformation:stack-name'
      ],
      'PolisLinktree-beta',
    );
  }
  const tag = writes.find((s) => s.Sid === 'TagCloudFrontOnCreationOnly');
  assert.deepEqual(tag?.Condition, {
    StringEquals: {
      'aws:RequestTag/aws:cloudformation:stack-name': 'PolisLinktree-beta',
    },
  });
  const prod = siteWriteStatements(
    'prod',
    env.account,
    env.region,
    'ZEXAMPLE',
  ).map((s) => s.toStatementJson());
  assert.equal(
    prod.find((s) => s.Sid === 'NeverChangeBetaDnsFromProd')?.Effect,
    'Deny',
  );
});
