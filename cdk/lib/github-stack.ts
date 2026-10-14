import * as cdk from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface GithubStackProps extends cdk.StackProps {
  readonly repository: string;
  readonly providerArn?: string;
}

/** Deploy once using a human bootstrap identity, not from application CD. */
export class GithubStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GithubStackProps) {
    super(scope, id, props);
    if (!/^[\w.-]+\/[\w.-]+$/.test(props.repository))
      throw new Error('GITHUB_REPOSITORY must be OWNER/REPO');
    const provider = props.providerArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
          this,
          'GithubProvider',
          props.providerArn,
        )
      : new iam.OpenIdConnectProvider(this, 'GithubProvider', {
          url: 'https://token.actions.githubusercontent.com',
          clientIds: ['sts.amazonaws.com'],
        });
    for (const stage of ['beta', 'prod']) {
      const role = new iam.Role(this, `${stage}DeployRole`, {
        assumedBy: new iam.WebIdentityPrincipal(
          provider.openIdConnectProviderArn,
          {
            StringEquals: {
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              'token.actions.githubusercontent.com:sub': `repo:${props.repository}:environment:${stage}`,
            },
          },
        ),
        maxSessionDuration: cdk.Duration.hours(1),
      });
      role.addToPolicy(
        new iam.PolicyStatement({
          actions: ['sts:AssumeRole'],
          resources: ['deploy', 'file-publishing', 'lookup'].map((kind) =>
            this.formatArn({
              service: 'iam',
              region: '',
              resource: 'role',
              resourceName: `cdk-hnb659fds-${kind}-role-${this.account}-${this.region}`,
            }),
          ),
        }),
      );
      new cdk.CfnOutput(this, `${stage}RoleArn`, { value: role.roleArn });
    }
  }
}
