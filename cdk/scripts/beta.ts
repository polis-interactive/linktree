import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AwsCall, destroyBeta, setBetaState } from '../lib/beta-control';
import { bootstrap, project } from '../lib/project-config';

function caller(env: NodeJS.ProcessEnv = process.env): AwsCall {
  return <T>(args: string[]): T => {
    // A version batch can exceed the OS limit for one command-line argument.
    const deleteIndex = args.indexOf('--delete');
    const directory =
      deleteIndex >= 0
        ? mkdtempSync(join(tmpdir(), 'linktree-beta-delete-'))
        : undefined;
    const actualArgs = [...args];
    if (directory) {
      const file = join(directory, 'objects.json');
      writeFileSync(file, args[deleteIndex + 1], { mode: 0o600 });
      actualArgs[deleteIndex + 1] = `file://${file}`;
    }
    try {
      const result = spawnSync(
        'aws',
        [
          ...actualArgs,
          '--region',
          project.region,
          '--output',
          'json',
          '--no-cli-pager',
        ],
        { env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
      );
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(result.stderr || `AWS ${args[0]} ${args[1]} failed`);
      return (
        result.stdout.trim() ? JSON.parse(result.stdout) : undefined
      ) as T;
    } finally {
      if (directory) rmSync(directory, { recursive: true, force: true });
    }
  };
}
const aws = caller();
if (process.argv[2] === 'destroy') {
  destroyBeta(aws, () => {
    const { Arn } = aws<{ Arn: string }>(['sts', 'get-caller-identity']);
    // Root is permitted only for the already-authorized local bootstrap session.
    if (Arn === `arn:aws:iam::${project.account}:root`) return aws;
    const { Credentials } = aws<{
      Credentials: {
        AccessKeyId: string;
        SecretAccessKey: string;
        SessionToken: string;
      };
    }>([
      'sts',
      'assume-role',
      '--role-arn',
      `arn:aws:iam::${project.account}:role/cdk-${bootstrap.beta.qualifier}-deploy-role-${project.account}-${project.region}`,
      '--role-session-name',
      'linktree-beta-teardown',
    ]);
    return caller({
      ...process.env,
      AWS_ACCESS_KEY_ID: Credentials.AccessKeyId,
      AWS_SECRET_ACCESS_KEY: Credentials.SecretAccessKey,
      AWS_SESSION_TOKEN: Credentials.SessionToken,
    });
  });
} else if (process.argv[2] === 'state') {
  const enabled = setBetaState(aws, process.env.BETA_REQUEST ?? 'status');
  console.log(`Beta desired state: ${enabled ? 'enabled' : 'disabled'}`);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `enabled=${enabled}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Beta desired state: **${enabled ? 'enabled' : 'disabled'}**. See the deployment/teardown step for its result.\n`,
    );
} else {
  throw new Error('Expected state or destroy');
}
