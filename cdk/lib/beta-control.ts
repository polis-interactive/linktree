import { betaStateParameter, project, siteBucketName } from './project-config';

export type AwsCall = <T>(args: string[]) => T;
export type BetaRequest = 'enable' | 'disable' | 'status';
const stackName = 'PolisLinktree-beta';
const hasError = (error: unknown, code: string) =>
  error instanceof Error && error.message.includes(`(${code})`);

export function verifyAccount(aws: AwsCall): void {
  const identity = aws<{ Account: string }>(['sts', 'get-caller-identity']);
  if (identity.Account !== project.account)
    throw new Error('Wrong AWS account');
}

export function betaEnabled(aws: AwsCall): boolean {
  const { Parameter } = aws<{ Parameter: { Value: string } }>([
    'ssm',
    'get-parameter',
    '--name',
    betaStateParameter,
  ]);
  if (!['true', 'false'].includes(Parameter.Value))
    throw new Error('Beta enabled parameter must be true or false');
  return Parameter.Value === 'true';
}

export function setBetaState(aws: AwsCall, request: string): boolean {
  if (!['enable', 'disable', 'status'].includes(request))
    throw new Error('Expected enable, disable, or status');
  verifyAccount(aws);
  if (request !== 'status') {
    aws([
      'ssm',
      'put-parameter',
      '--name',
      betaStateParameter,
      '--type',
      'String',
      '--value',
      String(request === 'enable'),
      '--overwrite',
    ]);
  }
  return betaEnabled(aws);
}

export function destroyBeta(aws: AwsCall, deployment: () => AwsCall): void {
  verifyAccount(aws);
  if (betaEnabled(aws)) throw new Error('Disable beta before tearing it down');
  let status: string;
  try {
    const { Stacks } = aws<{
      Stacks: { StackName: string; StackStatus: string }[];
    }>(['cloudformation', 'describe-stacks', '--stack-name', stackName]);
    if (Stacks[0]?.StackName !== stackName)
      throw new Error('Unexpected stack returned by AWS');
    status = Stacks[0].StackStatus;
  } catch (error) {
    if (
      hasError(error, 'ValidationError') &&
      (error as Error).message.includes(
        `Stack with id ${stackName} does not exist`,
      )
    ) {
      console.log('Beta is disabled; its site stack is already absent.');
      return;
    }
    throw error;
  }
  if (status.endsWith('_IN_PROGRESS') && status !== 'DELETE_IN_PROGRESS')
    throw new Error(
      `Beta stack is ${status}; retry after that operation finishes`,
    );
  // Acquire the deploy session before deleting files, so a trust failure is harmless.
  const deploy = deployment();
  if (status !== 'DELETE_IN_PROGRESS') {
    const bucket = siteBucketName('beta', project.account);
    const { StackResourceSummaries } = aws<{
      StackResourceSummaries: {
        ResourceType: string;
        PhysicalResourceId?: string;
      }[];
    }>(['cloudformation', 'list-stack-resources', '--stack-name', stackName]);
    const buckets = StackResourceSummaries.filter(
      (r) => r.ResourceType === 'AWS::S3::Bucket',
    );
    if (
      buckets.some(
        (r) => r.PhysicalResourceId && r.PhysicalResourceId !== bucket,
      )
    )
      throw new Error('Refusing to empty an unexpected beta bucket');
    if (buckets.some((r) => r.PhysicalResourceId === bucket)) {
      // Re-read the first page after deleting it: handles every version and delete
      // marker without invalidating pagination markers as the bucket changes.
      for (;;) {
        let page: {
          Versions?: { Key: string; VersionId: string }[];
          DeleteMarkers?: { Key: string; VersionId: string }[];
          IsTruncated?: boolean;
        };
        try {
          page = aws([
            's3api',
            'list-object-versions',
            '--bucket',
            bucket,
            '--expected-bucket-owner',
            project.account,
            '--max-keys',
            '1000',
            '--no-paginate',
          ]);
        } catch (error) {
          if (hasError(error, 'NoSuchBucket')) break;
          throw error;
        }
        const objects = [
          ...(page.Versions ?? []),
          ...(page.DeleteMarkers ?? []),
        ].map(({ Key, VersionId }) => ({ Key, VersionId }));
        if (!objects.length) {
          if (page.IsTruncated)
            throw new Error('AWS returned an empty truncated version page');
          break;
        }
        const result = aws<{ Errors?: unknown[] }>([
          's3api',
          'delete-objects',
          '--bucket',
          bucket,
          '--expected-bucket-owner',
          project.account,
          '--delete',
          JSON.stringify({ Objects: objects, Quiet: true }),
        ]);
        if (result.Errors?.length)
          throw new Error(
            `Beta object deletion failed: ${JSON.stringify(result.Errors)}`,
          );
      }
    }
    deploy(['cloudformation', 'delete-stack', '--stack-name', stackName]);
  }
  console.log(
    'Waiting for beta stack deletion (CloudFront can take several minutes).',
  );
  deploy([
    'cloudformation',
    'wait',
    'stack-delete-complete',
    '--stack-name',
    stackName,
  ]);
  console.log(
    'Beta site stack deleted. Future main pushes will not deploy it.',
  );
}
