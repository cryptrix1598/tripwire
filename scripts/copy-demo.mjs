// Runs after the dashboard build:
//  1. ships the practice scam pages next to the hosted dashboard, at /demo/;
//  2. refuses to finish if the App Check debug token is anywhere in the output,
//     because dashboard/dist is deployed to public hosting.
import { cpSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

cpSync('demo', 'dashboard/dist/demo', { recursive: true });
console.log('Copied demo/ to dashboard/dist/demo');

const token = existsSync('.env') ? (/^WXT_APPCHECK_DEBUG_TOKEN=(.+)$/m.exec(readFileSync('.env', 'utf8'))?.[1] ?? '').trim() : '';
if (token) {
  const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
  const leaks = walk('dashboard/dist').filter((file) => readFileSync(file).includes(token));
  if (leaks.length > 0) {
    console.error(`\nSTOP: the App Check debug token is inside the dashboard build:\n  ${leaks.join('\n  ')}\nDo not deploy this build.`);
    process.exit(1);
  }
  console.log('Checked: no App Check debug token in dashboard/dist');
}
