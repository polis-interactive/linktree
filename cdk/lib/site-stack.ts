import * as cdk from 'aws-cdk-lib';
import {
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_s3 as s3,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { basicAuthCode } from './basic-auth';
import { siteBucketName, stageTag } from './project-config';

export interface SiteStackProps extends cdk.StackProps {
  readonly stage: 'beta' | 'prod';
  readonly hostedZoneId: string;
  readonly betaUsername?: string;
  readonly betaPassword?: string;
}

export class SiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);
    cdk.Tags.of(this).add(stageTag, props.stage);
    const domain =
      props.stage === 'beta' ? 'beta.linktree.polis.tv' : 'linktree.polis.tv';
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: 'polis.tv',
    });
    const bucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: siteBucketName(props.stage, this.account),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      // The beta teardown command empties all versions before stack deletion.
      removalPolicy:
        props.stage === 'beta'
          ? cdk.RemovalPolicy.DESTROY
          : cdk.RemovalPolicy.RETAIN,
    });
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: domain,
      validation: acm.CertificateValidation.fromDns(zone),
    });
    const auth =
      props.stage === 'beta'
        ? new cloudfront.Function(this, 'BetaAuth', {
            functionName: 'polis-linktree-beta-auth',
            runtime: cloudfront.FunctionRuntime.JS_2_0,
            code: cloudfront.FunctionCode.fromInline(
              basicAuthCode(props.betaUsername ?? '', props.betaPassword ?? ''),
            ),
          })
        : undefined;
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: [domain],
      certificate,
      defaultRootObject: 'index.html',
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket, {
          originAccessControl:
            cloudfront.S3OriginAccessControl.fromOriginAccessControlId(
              this,
              'OriginAccess',
              cdk.Fn.importValue(
                `PolisLinktree-${props.stage}-OriginAccessControlId`,
              ),
            ),
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy:
          cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        compress: true,
        functionAssociations: auth
          ? [
              {
                eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
                function: auth,
              },
            ]
          : undefined,
      },
    });
    new route53.ARecord(this, 'Alias', {
      zone,
      recordName: domain,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution),
      ),
    });
    new route53.AaaaRecord(this, 'AliasIpv6', {
      zone,
      recordName: domain,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution),
      ),
    });
    new cdk.CfnOutput(this, 'Url', { value: `https://${domain}` });
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
    });
  }
}
