// Ships the practice scam pages next to the hosted dashboard, at /demo/.
import { cpSync } from 'node:fs';

cpSync('demo', 'dashboard/dist/demo', { recursive: true });
console.log('Copied demo/ to dashboard/dist/demo');
