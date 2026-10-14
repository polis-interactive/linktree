import { aws_iam as iam } from 'aws-cdk-lib';
import {
  bootstrap,
  betaStateParameter,
  SiteStage,
  siteBucketName,
  stageTag,
} from './project-config';

export function betaControlStatements(
  account: string,
  region: string,
): iam.PolicyStatement[] {
  return [
    new iam.PolicyStatement({
      sid: 'SetBetaEnabled',
      actions: ['ssm:PutParameter'],
      resources: [
        `arn:aws:ssm:${region}:${account}:parameter${betaStateParameter}`,
      ],
    }),
    new iam.PolicyStatement({
      sid: 'EmptyOnlyBetaSiteBucket',
      actions: ['s3:DeleteObject', 's3:DeleteObjectVersion'],
      resources: [`arn:aws:s3:::${siteBucketName('beta', account)}/*`],
    }),
  ];
}

export function siteWriteStatements(
  stage: SiteStage,
  account: string,
  region: string,
  zoneId: string,
): iam.PolicyStatement[] {
  const domain =
    stage === 'beta' ? 'beta.linktree.polis.tv' : 'linktree.polis.tv';
  const tagged = {
    StringEquals: {
      'aws:ResourceTag/aws:cloudformation:stack-name': `PolisLinktree-${stage}`,
    },
  };
  const onCreate = { StringEquals: { [`aws:RequestTag/${stageTag}`]: stage } };
  return [
    new iam.PolicyStatement({
      sid: 'ManageOnlyThisSiteBucket',
      actions: [
        's3:CreateBucket',
        's3:DeleteBucket',
        's3:PutBucketPolicy',
        's3:DeleteBucketPolicy',
        's3:PutBucketPublicAccessBlock',
        's3:PutEncryptionConfiguration',
        's3:PutBucketVersioning',
        's3:PutBucketTagging',
        's3:PutLifecycleConfiguration',
        's3:PutBucketOwnershipControls',
      ],
      resources: [`arn:aws:s3:::${siteBucketName(stage, account)}`],
    }),
    new iam.PolicyStatement({
      sid: 'CreateTaggedCloudFrontResources',
      // CreateDistributionWithTags is authorized by CreateDistribution + TagResource.
      actions: ['cloudfront:CreateDistribution', 'cloudfront:CreateFunction'],
      resources: ['*'],
      conditions: onCreate,
    }),
    new iam.PolicyStatement({
      sid: 'ManageTaggedCloudFrontResources',
      actions: [
        'cloudfront:UpdateDistribution',
        'cloudfront:DeleteDistribution',
        'cloudfront:UpdateFunction',
        'cloudfront:PublishFunction',
        'cloudfront:DeleteFunction',
        'cloudfront:TagResource',
        'cloudfront:UntagResource',
      ],
      resources: [
        `arn:aws:cloudfront::${account}:distribution/*`,
        `arn:aws:cloudfront::${account}:function/*`,
      ],
      conditions: tagged,
    }),
    new iam.PolicyStatement({
      sid: 'TagCloudFrontOnCreationOnly',
      actions: ['cloudfront:TagResource'],
      resources: ['*'],
      // AWS-reserved tags cannot be forged or changed by application identities.
      conditions: {
        StringEquals: {
          'aws:RequestTag/aws:cloudformation:stack-name': `PolisLinktree-${stage}`,
        },
      },
    }),
    new iam.PolicyStatement({
      sid: 'RequestOnlyThisDomainCertificate',
      actions: ['acm:RequestCertificate'],
      resources: ['*'],
      conditions: {
        ...onCreate,
        'ForAllValues:StringEquals': { 'acm:DomainNames': [domain] },
        Null: { 'acm:DomainNames': 'false' },
      },
    }),
    new iam.PolicyStatement({
      sid: 'ManageTaggedCertificates',
      actions: [
        'acm:DeleteCertificate',
        'acm:UpdateCertificateOptions',
        'acm:AddTagsToCertificate',
        'acm:RemoveTagsFromCertificate',
      ],
      resources: [`arn:aws:acm:${region}:${account}:certificate/*`],
      conditions: tagged,
    }),
    new iam.PolicyStatement({
      sid: 'ChangeOnlySiteDns',
      actions: ['route53:ChangeResourceRecordSets'],
      resources: [`arn:aws:route53:::hostedzone/${zoneId}`],
      conditions: {
        'ForAllValues:StringLike': {
          'route53:ChangeResourceRecordSetsNormalizedRecordNames': [
            domain,
            `_*.${domain}`,
          ],
        },
        'ForAllValues:StringEquals': {
          'route53:ChangeResourceRecordSetsRecordTypes': ['A', 'AAAA', 'CNAME'],
        },
        Null: {
          'route53:ChangeResourceRecordSetsNormalizedRecordNames': 'false',
          'route53:ChangeResourceRecordSetsRecordTypes': 'false',
        },
      },
    }),
    // IAM StringLike '*' spans labels; prevent the prod validation pattern from
    // matching beta's nested name. This does not affect account-wide reads.
    ...(stage === 'prod'
      ? [
          new iam.PolicyStatement({
            sid: 'NeverChangeBetaDnsFromProd',
            effect: iam.Effect.DENY,
            actions: ['route53:ChangeResourceRecordSets'],
            resources: [`arn:aws:route53:::hostedzone/${zoneId}`],
            conditions: {
              'ForAnyValue:StringLike': {
                'route53:ChangeResourceRecordSetsNormalizedRecordNames': [
                  'beta.linktree.polis.tv',
                  '*.beta.linktree.polis.tv',
                ],
              },
            },
          }),
        ]
      : []),
  ];
}

export function publishStatements(
  stage: SiteStage,
  account: string,
): iam.PolicyStatement[] {
  return [
    new iam.PolicyStatement({
      sid: 'PublishOnlyThisSite',
      actions: ['s3:PutObject', 's3:AbortMultipartUpload'],
      resources: [`arn:aws:s3:::${siteBucketName(stage, account)}/*`],
    }),
    new iam.PolicyStatement({
      sid: 'InvalidateOnlyThisSite',
      actions: ['cloudfront:CreateInvalidation'],
      resources: [`arn:aws:cloudfront::${account}:distribution/*`],
      conditions: {
        StringEquals: {
          'aws:ResourceTag/aws:cloudformation:stack-name': `PolisLinktree-${stage}`,
        },
      },
    }),
  ];
}

export function deploymentStatements(
  stage: SiteStage,
  account: string,
  region: string,
): iam.PolicyStatement[] {
  const stack = `arn:aws:cloudformation:${region}:${account}:stack/PolisLinktree-${stage}/*`;
  const execRole = `arn:aws:iam::${account}:role/cdk-${bootstrap[stage].qualifier}-cfn-exec-role-${account}-${region}`;
  return [
    new iam.PolicyStatement({
      sid: 'DeployOnlyThisStack',
      actions: [
        'cloudformation:CreateChangeSet',
        'cloudformation:CreateStack',
        'cloudformation:UpdateStack',
      ],
      resources: [stack],
      conditions: { StringEquals: { 'cloudformation:RoleArn': execRole } },
    }),
    new iam.PolicyStatement({
      sid: 'OperateOnlyThisStack',
      actions: [
        'cloudformation:ExecuteChangeSet',
        'cloudformation:DeleteChangeSet',
        'cloudformation:DeleteStack',
        'cloudformation:ContinueUpdateRollback',
        'cloudformation:RollbackStack',
        'cloudformation:CancelUpdateStack',
        'cloudformation:UpdateTerminationProtection',
      ],
      resources: [stack],
    }),
    new iam.PolicyStatement({
      sid: 'PassOnlyThisExecutionRole',
      actions: ['iam:PassRole'],
      resources: [execRole],
      conditions: {
        StringEquals: { 'iam:PassedToService': 'cloudformation.amazonaws.com' },
      },
    }),
  ];
}
