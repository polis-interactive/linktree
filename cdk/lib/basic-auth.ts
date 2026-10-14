import { createHash } from 'node:crypto';

/** Store a digest in the edge function, never the reusable Basic header itself. */
export function basicAuthCode(username: string, password: string): string {
  if (
    !username ||
    username.includes(':') ||
    !password ||
    /[\r\n]/.test(username + password)
  ) {
    throw new Error(
      'Beta requires a nonempty username (without colon) and password, without newlines',
    );
  }
  const header = `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
  const digest = createHash('sha256').update(header).digest('hex');
  return `var crypto = require('crypto');
function handler(event) {
  var request = event.request;
  var authorization = request.headers.authorization;
  if (!authorization || crypto.createHash('sha256').update(authorization.value).digest('hex') !== '${digest}') {
    return {
      statusCode: 401,
      statusDescription: 'Unauthorized',
      headers: {
        'www-authenticate': { value: 'Basic realm="Polis beta", charset="UTF-8"' },
        'cache-control': { value: 'no-store' }
      }
    };
  }
  delete request.headers.authorization;
  return request;
}`;
}
