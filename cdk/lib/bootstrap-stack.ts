import * as cdk from 'aws-cdk-lib';
import {
  aws_cloudfront as cloudfront,
  aws_iam as iam,
  aws_s3 as s3,
  aws_ssm as ssm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  betaStateParameter,
  bootstrap,
  githubRoleName,
  SiteStage,
} from './project-config';
import { deploymentStatements, siteWriteStatements } from './policies';

export interface BootstrapStackProps extends cdk.StackProps {
  readonly stage: SiteStage;
  readonly hostedZoneId: string;
}

/** File-only CDK bootstrap: no Docker publishing, IAM creation, or Lambda helpers. */
export class BootstrapStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BootstrapStackProps) {
    super(scope, id, props);
    const qualifier = bootstrap[props.stage].qualifier;
    const readOnly =
      iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess');
    const githubArn = this.formatArn({
      service: 'iam',
      region: '',
      resource: 'role',
      resourceName: githubRoleName(props.stage),
    });
    // Account principal + exact ARN permits creating the bootstrap before the
    // GitHub role; it does not trust arbitrary identities in the account.
    const githubTrust = new iam.AccountPrincipal(this.account).withConditions({
      ArnEquals: { 'aws:PrincipalArn': githubArn },
    });
    const assets = new s3.Bucket(this, 'Assets', {
      bucketName: `cdk-${qualifier}-assets-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const execution = new iam.Role(this, 'ExecutionRole', {
      roleName: `cdk-${qualifier}-cfn-exec-role-${this.account}-${this.region}`,
      assumedBy: new iam.ServicePrincipal('cloudformation.amazonaws.com'),
      managedPolicies: [readOnly],
      inlinePolicies: {
        SiteWrites: new iam.PolicyDocument({
          statements: siteWriteStatements(
            props.stage,
            this.account,
            this.region,
            props.hostedZoneId,
          ),
        }),
      },
    });
    const deployment = new iam.Role(this, 'DeploymentRole', {
      roleName: `cdk-${qualifier}-deploy-role-${this.account}-${this.region}`,
      assumedBy: githubTrust,
      managedPolicies: [readOnly],
      inlinePolicies: {
        Deployment: new iam.PolicyDocument({
          statements: deploymentStatements(
            props.stage,
            this.account,
            this.region,
          ),
        }),
      },
    });
    const publisher = new iam.Role(this, 'FilePublishingRole', {
      roleName: `cdk-${qualifier}-file-publishing-role-${this.account}-${this.region}`,
      assumedBy: githubTrust,
      managedPolicies: [readOnly],
    });
    assets.grantPut(publisher);
    if (props.stage === 'beta') {
      // CloudFormation initializes this only; workflow runs own its runtime value.
      new ssm.StringParameter(this, 'BetaEnabled', {
        parameterName: betaStateParameter,
        stringValue: 'false',
        description:
          'Whether pushes to main should deploy the Linktree beta site',
      });
    }
    // Version 8 of the used contract: file assets, SSM version, deploy/execution
    // roles, and a read-capable lookup role. Image assets are intentionally absent.
    new ssm.StringParameter(this, 'Version', {
      parameterName: `/cdk-bootstrap/${qualifier}/version`,
      stringValue: '8',
    });
    const oac = new cloudfront.S3OriginAccessControl(this, 'OriginAccess', {
      originAccessControlName: `polis-linktree-${props.stage}`,
    });
    new cdk.CfnOutput(this, 'OriginAccessControlId', {
      value: oac.originAccessControlId,
      exportName: `PolisLinktree-${props.stage}-OriginAccessControlId`,
    });
    new cdk.CfnOutput(this, 'BucketName', { value: assets.bucketName });
    new cdk.CfnOutput(this, 'BucketDomainName', {
      value: assets.bucketRegionalDomainName,
    });
    new cdk.CfnOutput(this, 'BootstrapVersion', { value: '8' });
    new cdk.CfnOutput(this, 'ExecutionRoleArn', { value: execution.roleArn });
    new cdk.CfnOutput(this, 'DeploymentRoleArn', { value: deployment.roleArn });
  }
}
