import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const errors = [];
for (const file of ['index.html','app.js','style.css','backend/src/index.ts','wrangler.toml','supabase/schema.sql']) {
  if (!existsSync(resolve(root,file))) errors.push(`Missing required file: ${file}`);
}
const config = readFileSync(resolve(root,'wrangler.toml'),'utf8');
if (!config.includes('bucket_name = "deeplo-hosting-sites"')) errors.push('R2 bucket_name is missing or differs from the documented default.');
if (/YOUR-FRONTEND-DOMAIN\.example/.test(config)) errors.push('Replace ALLOWED_ORIGIN placeholder with the exact deployed frontend origin.');
if (/^\s*(?!#)(?:export\s+)?SUPABASE_SERVICE_ROLE_KEY\s*=/m.test(readFileSync(resolve(root,'.env.example'),'utf8'))) errors.push('Do not define SUPABASE_SERVICE_ROLE_KEY in frontend/example environment files.');
if (errors.length) {
  console.error('DEEPLO HOSTING preflight failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Preflight passed: required files exist and basic config placeholders are resolved.');
  console.log('This does not verify deployed services, DNS, SSL, R2 access, or Supabase credentials.');
}
