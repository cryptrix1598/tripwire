// The Chrome Web Store package: a release build with NO App Check debug token.
//   npm run zip:store
// App Check then comes from a real reCAPTCHA Enterprise check on Tripwire's hosted site
// (src/firebase/attest.ts). The script refuses to finish if the token is anywhere in the build.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const token = (/^WXT_APPCHECK_DEBUG_TOKEN=(.+)$/m.exec(env)?.[1] ?? '').trim();
if (!/^WXT_DASHBOARD_URL=\S+/m.test(env)) throw new Error('Set WXT_DASHBOARD_URL in .env: release builds get App Check from that site.');

// .env.store (committed, no secrets) blanks the debug token for this mode.
execSync('npx wxt zip --mode store', { stdio: 'inherit' });

const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
if (token) {
  const leaks = files('.output/chrome-mv3-store').filter((f) => readFileSync(f).includes(token));
  if (leaks.length) throw new Error(`The debug token is in the release build: ${leaks.join(', ')}`);
}
const zip = readdirSync('.output').filter((f) => f.endsWith('-chrome-store.zip')).map((f) => join('.output', f));
console.log(`\nRelease package: ${zip.join(', ')}\nChecked: no App Check debug token in the build. Run "npm run build" again before the automated tests, which use the debug token.`);
