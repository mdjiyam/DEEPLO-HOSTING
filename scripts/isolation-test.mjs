// Two-account isolation test. Usage (Node 18+):
//   API=https://your-worker.workers.dev ORIGIN=https://your-frontend TOKEN_A=... TOKEN_B=... PROJECT_A=<uuid of A's project> node scripts/isolation-test.mjs
// Uses a disposable slug. A publishes; B must NOT be able to edit, roll back, unpublish or admin-suspend it.
const { API, ORIGIN, TOKEN_A, TOKEN_B, PROJECT_A } = process.env;
if (!API || !TOKEN_A || !TOKEN_B || !PROJECT_A) { console.error('Set API, TOKEN_A, TOKEN_B, PROJECT_A (and ORIGIN).'); process.exit(2); }
const slug = 'iso-' + Math.random().toString(36).slice(2, 8);
const call = (tok, path, method = 'GET', body) => fetch(API + path, { method, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', ...(ORIGIN ? { Origin: ORIGIN } : {}) }, body: body ? JSON.stringify(body) : undefined });
let fails = 0; const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails++; };
const html = Buffer.from('<h1>iso test</h1>').toString('base64');
let r = await call(TOKEN_A, '/api/publish', 'POST', { projectId: PROJECT_A, slug, files: [{ path: 'index.html', contentBase64: html, contentType: 'text/html' }] });
check('A can publish', r.ok);
r = await call(TOKEN_B, '/api/publish?slug=' + slug, 'DELETE'); check('B cannot unpublish A', r.status === 403 || r.status === 404);
r = await call(TOKEN_B, '/api/sites/file', 'PUT', { slug, path: 'index.html', content: 'pwned' }); check('B cannot edit A file', !r.ok);
r = await call(TOKEN_B, '/api/sites/rollback', 'POST', { slug }); check('B cannot roll back A', !r.ok);
r = await call(TOKEN_B, '/api/admin/suspend', 'POST', { slug, suspended: true }); check('B (non-admin) cannot suspend', r.status === 403);
r = await call(TOKEN_B, '/api/publish', 'POST', { projectId: PROJECT_A, slug, files: [{ path: 'index.html', contentBase64: html }] }); check('B cannot overwrite A slug', !r.ok);
r = await call(TOKEN_A, '/api/publish?slug=' + slug, 'DELETE'); check('A can clean up', r.ok);
console.log(fails ? `${fails} check(s) FAILED` : 'All isolation checks passed'); process.exit(fails ? 1 : 0);
