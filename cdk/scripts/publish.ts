import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { project, siteBucketName } from '../lib/project-config';

const stage = process.argv[2];
if (stage !== 'beta' && stage !== 'prod')
  throw new Error('Expected beta or prod');
const output = JSON.parse(
  readFileSync(`cdk.out.${stage}/outputs.json`, 'utf8'),
)[`PolisLinktree-${stage}`];
if (
  output?.BucketName !== siteBucketName(stage, project.account) ||
  !/^[A-Z0-9]+$/.test(output?.DistributionId ?? '')
) {
  throw new Error('Deployment outputs do not match the expected site');
}
function aws(args: string[]): void {
  const result = spawnSync('aws', [...args, '--region', project.region], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`AWS ${args[0]} ${args[1]} failed`);
}
// Publish the entry point last; retain old hashed assets for already-open pages.
const destination = `s3://${output.BucketName}`;
aws([
  's3',
  'sync',
  '../ui/dist/',
  destination,
  '--exclude',
  'index.html',
  '--cache-control',
  'max-age=0,must-revalidate',
  '--only-show-errors',
]);
aws([
  's3',
  'cp',
  '../ui/dist/index.html',
  `${destination}/index.html`,
  '--cache-control',
  'max-age=0,must-revalidate',
  '--content-type',
  'text/html',
  '--only-show-errors',
]);
aws([
  'cloudfront',
  'create-invalidation',
  '--distribution-id',
  output.DistributionId,
  '--paths',
  '/*',
]);
