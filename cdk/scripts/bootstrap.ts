import { spawnSync } from 'node:child_process';
import { project } from '../lib/project-config';

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: command === 'aws' ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(result.stderr || `${command} failed`);
  return result.stdout;
}

// Synthesize once: the reviewed assembly is the one that gets deployed.
const output = 'cdk.out.permissions';
const identity = JSON.parse(
  run('aws', ['sts', 'get-caller-identity', '--output', 'json']),
);
if (identity.Account !== project.account) throw new Error('Wrong AWS account');
run('npm', [
  'run',
  'cdk',
  '--',
  'synth',
  '--all',
  '--quiet',
  '--strict',
  '-c',
  'stage=permissions',
  '--output',
  output,
]);
run('npm', [
  'run',
  'cdk',
  '--',
  'diff',
  '--all',
  '--no-change-set',
  '--app',
  output,
]);
if (!process.argv.includes('--plan')) {
  run('npm', [
    'run',
    'cdk',
    '--',
    'deploy',
    '--all',
    '--app',
    output,
    '--require-approval',
    process.env.CDK_APPROVAL === 'never' ? 'never' : 'broadening',
    '--outputs-file',
    `${output}/outputs.json`,
  ]);
}
