import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AwsCall, destroyBeta, setBetaState } from '../lib/beta-control';
import { project, siteBucketName } from '../lib/project-config';

const bucket = siteBucketName('beta', project.account);
function fake(
  extra: (args: string[]) => unknown = () => undefined,
  enabled = false,
  account: string = project.account,
) {
  const calls: string[][] = [];
  let state = String(enabled);
  const aws: AwsCall = <T>(args: string[]): T => {
    calls.push(args);
    if (args[0] === 'sts') return { Account: account } as T;
    if (args[1] === 'put-parameter') {
      state = args[args.indexOf('--value') + 1];
      return {} as T;
    }
    if (args[1] === 'get-parameter')
      return { Parameter: { Value: state } } as T;
    const result = extra(args);
    if (result !== undefined) return result as T;
    if (args[1] === 'describe-stacks')
      return {
        Stacks: [
          { StackName: 'PolisLinktree-beta', StackStatus: 'CREATE_COMPLETE' },
        ],
      } as T;
    if (args[1] === 'list-stack-resources')
      return {
        StackResourceSummaries: [
          { ResourceType: 'AWS::S3::Bucket', PhysicalResourceId: bucket },
        ],
      } as T;
    throw new Error(`Unexpected AWS call: ${args.join(' ')}`);
  };
  return { aws, calls };
}

test('enable and disable persist state; subsequent pushes only read it', () => {
  const { aws, calls } = fake();
  assert.equal(setBetaState(aws, 'status'), false);
  assert.equal(setBetaState(aws, 'enable'), true);
  assert.equal(setBetaState(aws, 'status'), true);
  assert.equal(setBetaState(aws, 'disable'), false);
  assert.equal(setBetaState(aws, 'status'), false);
  assert.equal(calls.filter((c) => c[1] === 'put-parameter').length, 2);
  assert.throws(() => setBetaState(aws, 'invalid'), /Expected/);
});

test('teardown refuses enabled beta and the wrong AWS account before deleting anything', () => {
  for (const client of [
    fake(undefined, true),
    fake(undefined, false, '999999999999'),
  ]) {
    assert.throws(
      () => destroyBeta(client.aws, () => client.aws),
      /Disable beta|Wrong AWS account/,
    );
    assert.ok(
      !client.calls.some(
        (c) => c[1] === 'delete-objects' || c[1] === 'delete-stack',
      ),
    );
  }
});

test('teardown is idempotent for an absent stack, but does not swallow access errors', () => {
  const absent = fake((args) => {
    if (args[1] === 'describe-stacks')
      throw new Error(
        '(ValidationError) Stack with id PolisLinktree-beta does not exist',
      );
  });
  destroyBeta(absent.aws, () => {
    throw new Error('Must not assume role for absent stack');
  });
  const denied = fake((args) => {
    if (args[1] === 'describe-stacks')
      throw new Error('(AccessDenied) Not authorized');
  });
  assert.throws(
    () => destroyBeta(denied.aws, () => denied.aws),
    /AccessDenied/,
  );
});

test('teardown removes all pages of versions and delete markers before deleting the stack', () => {
  let page = 0;
  const { aws, calls } = fake((args) => {
    if (args[1] === 'list-object-versions') {
      page++;
      if (page === 1)
        return {
          Versions: Array.from({ length: 1000 }, (_, n) => ({
            Key: `file-${n}`,
            VersionId: `v${n}`,
          })),
          IsTruncated: true,
        };
      if (page === 2)
        return {
          Versions: [{ Key: 'index.html', VersionId: 'old' }],
          DeleteMarkers: [{ Key: 'index.html', VersionId: 'marker' }],
        };
      return {};
    }
    if (['delete-objects', 'delete-stack', 'wait'].includes(args[1])) return {};
  });
  destroyBeta(aws, () => aws);
  const deletions = calls.filter((c) => c[1] === 'delete-objects');
  assert.equal(deletions.length, 2);
  assert.equal(
    JSON.parse(deletions[0][deletions[0].indexOf('--delete') + 1]).Objects
      .length,
    1000,
  );
  assert.deepEqual(
    JSON.parse(deletions[1][deletions[1].indexOf('--delete') + 1]).Objects,
    [
      { Key: 'index.html', VersionId: 'old' },
      { Key: 'index.html', VersionId: 'marker' },
    ],
  );
  assert.deepEqual(
    calls.slice(-2).map((c) => c[1]),
    ['delete-stack', 'wait'],
  );
  for (const call of deletions)
    assert.equal(
      call[call.indexOf('--expected-bucket-owner') + 1],
      project.account,
    );
});

test('teardown never empties an unexpected bucket', () => {
  const { aws, calls } = fake((args) =>
    args[1] === 'list-stack-resources'
      ? {
          StackResourceSummaries: [
            {
              ResourceType: 'AWS::S3::Bucket',
              PhysicalResourceId: siteBucketName('prod', project.account),
            },
          ],
        }
      : undefined,
  );
  assert.throws(() => destroyBeta(aws, () => aws), /unexpected beta bucket/);
  assert.ok(!calls.some((c) => c[0] === 's3api' || c[1] === 'delete-stack'));
});

test('partial object deletion errors stop stack deletion and can be retried', () => {
  const { aws, calls } = fake((args) => {
    if (args[1] === 'list-object-versions')
      return { Versions: [{ Key: 'index.html', VersionId: 'old' }] };
    if (args[1] === 'delete-objects')
      return { Errors: [{ Code: 'AccessDenied' }] };
  });
  assert.throws(() => destroyBeta(aws, () => aws), /object deletion failed/);
  assert.ok(!calls.some((c) => c[1] === 'delete-stack'));
});

test('retrying an in-progress deletion waits without deleting files again', () => {
  const { aws, calls } = fake((args) => {
    if (args[1] === 'describe-stacks')
      return {
        Stacks: [
          {
            StackName: 'PolisLinktree-beta',
            StackStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      };
    if (args[1] === 'wait') return {};
  });
  destroyBeta(aws, () => aws);
  assert.equal(calls.at(-1)?.[1], 'wait');
  assert.ok(!calls.some((c) => c[0] === 's3api' || c[1] === 'delete-stack'));
});
