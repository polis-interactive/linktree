import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  bootstrap,
  betaStateParameter,
  githubRoleName,
  project,
  siteBucketName,
  stageTag,
} from '../lib/project-config';

// Read-only AWS checks. Requires an identity allowed to inspect and simulate IAM roles.
function aws(args: string[]) {
  return JSON.parse(
    execFileSync(
      'aws',
      [...args, '--region', project.region, '--output', 'json'],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    ),
  );
}
assert.equal(
  aws(['sts', 'get-caller-identity']).Account,
  project.account,
  'Wrong AWS account',
);
const arn = (name: string) => `arn:aws:iam::${project.account}:role/${name}`;
let simulations = 0;
function simulate(
  role: string,
  actions: string[],
  resource: string,
  expected: 'allowed' | 'denied',
  context: Record<string, string | string[]> = {},
) {
  const args = [
    'iam',
    'simulate-principal-policy',
    '--policy-source-arn',
    arn(role),
    '--action-names',
    ...actions,
    '--resource-arns',
    resource,
  ];
  if (Object.keys(context).length)
    args.push(
      '--context-entries',
      JSON.stringify(
        Object.entries(context).map(([ContextKeyName, value]) => ({
          ContextKeyName,
          ContextKeyValues: Array.isArray(value) ? value : [value],
          ContextKeyType: Array.isArray(value) ? 'stringList' : 'string',
        })),
      ),
    );
  const results = aws(args).EvaluationResults;
  assert.equal(results.length, actions.length);
  for (const result of results) {
    assert.equal(
      result.EvalDecision === 'allowed',
      expected === 'allowed',
      `${role}: ${result.EvalActionName} on ${resource}: expected ${expected}, got ${result.EvalDecision}; missing context ${JSON.stringify(result.MissingContextValues)}`,
    );
    simulations++;
  }
}

for (const stage of ['beta', 'prod'] as const) {
  const other = stage === 'beta' ? 'prod' : 'beta';
  const name = (kind: string) =>
    `cdk-${bootstrap[stage].qualifier}-${kind}-role-${project.account}-${project.region}`;
  const exec = name('cfn-exec');
  const deploy = name('deploy');
  const github = githubRoleName(stage);
  const trust = aws(['iam', 'get-role', '--role-name', github]).Role
    .AssumeRolePolicyDocument.Statement;
  assert.equal(trust.length, 1);
  assert.equal(
    trust[0].Condition.StringEquals['token.actions.githubusercontent.com:sub'],
    stage === 'beta'
      ? `repo:${project.oidcRepository}:ref:refs/heads/main`
      : `repo:${project.oidcRepository}:environment:prod`,
  );
  simulate(
    github,
    ['ssm:PutParameter'],
    `arn:aws:ssm:${project.region}:${project.account}:parameter${betaStateParameter}`,
    stage === 'beta' ? 'allowed' : 'denied',
  );
  simulate(
    github,
    ['ssm:PutParameter'],
    `arn:aws:ssm:${project.region}:${project.account}:parameter/unrelated`,
    'denied',
  );
  simulate(
    github,
    ['s3:DeleteObject', 's3:DeleteObjectVersion'],
    `arn:aws:s3:::${siteBucketName('beta', project.account)}/index.html`,
    stage === 'beta' ? 'allowed' : 'denied',
  );
  simulate(
    github,
    ['s3:DeleteObject', 's3:DeleteObjectVersion'],
    `arn:aws:s3:::${siteBucketName('prod', project.account)}/index.html`,
    'denied',
  );

  for (const role of [exec, deploy, name('file-publishing'), github]) {
    const attached = aws([
      'iam',
      'list-attached-role-policies',
      '--role-name',
      role,
    ]).AttachedPolicies;
    assert.deepEqual(
      attached.map((p: { PolicyArn: string }) => p.PolicyArn),
      ['arn:aws:iam::aws:policy/ReadOnlyAccess'],
    );
    const inline = aws([
      'iam',
      'list-role-policies',
      '--role-name',
      role,
    ]).PolicyNames;
    for (const policy of inline) {
      const document = aws([
        'iam',
        'get-role-policy',
        '--role-name',
        role,
        '--policy-name',
        policy,
      ]).PolicyDocument;
      const findings = aws([
        'accessanalyzer',
        'validate-policy',
        '--policy-type',
        'IDENTITY_POLICY',
        '--policy-document',
        JSON.stringify(document),
      ]).findings;
      assert.equal(
        findings.length,
        0,
        `${role}/${policy}: ${JSON.stringify(findings)}`,
      );
    }
    simulate(
      role,
      [
        's3:ListAllMyBuckets',
        'cloudfront:ListDistributions',
        'acm:ListCertificates',
        'route53:ListHostedZones',
        'cloudformation:ListStacks',
        'iam:ListRoles',
        'ec2:DescribeInstances',
        'lambda:ListFunctions',
      ],
      '*',
      'allowed',
    );
    simulate(
      role,
      ['s3:ListBucket', 's3:GetBucketLocation'],
      'arn:aws:s3:::unrelated-console-visibility-check',
      'allowed',
    );
  }
  const ownBucket = `arn:aws:s3:::${siteBucketName(stage, project.account)}`;
  const otherBucket = `arn:aws:s3:::${siteBucketName(other, project.account)}`;
  simulate(
    exec,
    ['s3:CreateBucket', 's3:PutBucketPolicy'],
    ownBucket,
    'allowed',
  );
  simulate(exec, ['s3:PutBucketPolicy'], otherBucket, 'denied');
  simulate(
    exec,
    ['iam:CreateRole', 'iam:PutRolePolicy', 'iam:AttachRolePolicy'],
    arn(github),
    'denied',
  );
  simulate(github, ['s3:PutObject'], `${ownBucket}/index.html`, 'allowed');
  simulate(github, ['s3:PutObject'], `${otherBucket}/index.html`, 'denied');
  simulate(github, ['sts:AssumeRole'], arn(deploy), 'allowed');
  simulate(
    github,
    ['sts:AssumeRole'],
    arn(
      `cdk-${bootstrap[other].qualifier}-deploy-role-${project.account}-${project.region}`,
    ),
    'denied',
  );
  simulate(
    github,
    ['sts:AssumeRole'],
    arn(`cdk-hnb659fds-deploy-role-${project.account}-${project.region}`),
    'denied',
  );
  const stack = `arn:aws:cloudformation:${project.region}:${project.account}:stack/PolisLinktree-${stage}/example`;
  simulate(deploy, ['cloudformation:CreateChangeSet'], stack, 'allowed', {
    'cloudformation:RoleArn': arn(exec),
  });
  simulate(deploy, ['cloudformation:CreateChangeSet'], stack, 'denied');
  simulate(
    deploy,
    ['cloudformation:CreateChangeSet'],
    stack.replace(`-${stage}/`, `-${other}/`),
    'denied',
    { 'cloudformation:RoleArn': arn(exec) },
  );
  simulate(deploy, ['iam:PassRole'], arn(exec), 'allowed', {
    'iam:PassedToService': 'cloudformation.amazonaws.com',
  });
  simulate(
    deploy,
    ['iam:PassRole'],
    arn(`cdk-hnb659fds-cfn-exec-role-${project.account}-${project.region}`),
    'denied',
    { 'iam:PassedToService': 'cloudformation.amazonaws.com' },
  );
  const distribution = `arn:aws:cloudfront::${project.account}:distribution/EXAMPLE`;
  const ownership = 'aws:ResourceTag/aws:cloudformation:stack-name';
  simulate(exec, ['cloudfront:UpdateDistribution'], distribution, 'allowed', {
    [ownership]: `PolisLinktree-${stage}`,
  });
  simulate(exec, ['cloudfront:UpdateDistribution'], distribution, 'denied', {
    [ownership]: `PolisLinktree-${other}`,
  });
  simulate(exec, ['cloudfront:UpdateDistribution'], distribution, 'denied');
  simulate(exec, ['cloudfront:TagResource'], distribution, 'denied', {
    [`aws:RequestTag/${stageTag}`]: stage,
  });
  simulate(github, ['cloudfront:CreateInvalidation'], distribution, 'allowed', {
    [ownership]: `PolisLinktree-${stage}`,
  });
  simulate(github, ['cloudfront:CreateInvalidation'], distribution, 'denied', {
    [ownership]: `PolisLinktree-${other}`,
  });
  const domain =
    stage === 'beta' ? 'beta.linktree.polis.tv' : 'linktree.polis.tv';
  simulate(exec, ['acm:RequestCertificate'], '*', 'allowed', {
    [`aws:RequestTag/${stageTag}`]: stage,
    'acm:DomainNames': [domain],
  });
  simulate(exec, ['acm:RequestCertificate'], '*', 'denied', {
    [`aws:RequestTag/${stageTag}`]: stage,
    'acm:DomainNames': ['unrelated.polis.tv'],
  });
  for (const [record, expected] of [
    [domain, 'allowed'],
    [`_validation.${domain}`, 'allowed'],
    ['unrelated.polis.tv', 'denied'],
    [
      other === 'beta'
        ? '_validation.beta.linktree.polis.tv'
        : 'linktree.polis.tv',
      'denied',
    ],
  ] as const) {
    simulate(
      exec,
      ['route53:ChangeResourceRecordSets'],
      `arn:aws:route53:::hostedzone/${project.hostedZoneId}`,
      expected,
      {
        'route53:ChangeResourceRecordSetsNormalizedRecordNames': [record],
        'route53:ChangeResourceRecordSetsRecordTypes': [
          record.startsWith('_') ? 'CNAME' : 'A',
        ],
      },
    );
  }
  console.log(
    `${stage}: console discovery, policy validation, and write isolation passed`,
  );
}
console.log(
  `${simulations} live IAM simulation decisions passed. No AWS resources were changed.`,
);
