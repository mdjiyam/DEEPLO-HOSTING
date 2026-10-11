// Runs the Worker against in-memory fakes of R2 + Supabase (no network). Needs `npm install` (typescript).
const ts=require("typescript"),fs=require("fs"),os=require("os"),path=require("path"),{spawnSync}=require("child_process");
const out=fs.mkdtempSync(path.join(os.tmpdir(),"deeplo-"));
fs.mkdirSync(path.join(out,"node_modules/jose"),{recursive:true});
fs.writeFileSync(path.join(out,"node_modules/jose/index.js"),'exports.createRemoteJWKSet=()=>null;exports.jwtVerify=async t=>{const [sub,email]=String(t).split("|");if(!sub||sub==="bad")throw new Error("bad token");return {payload:{sub,email}}};');
for(const f of ["index","extras"])fs.writeFileSync(path.join(out,f+".js"),ts.transpileModule(fs.readFileSync(path.join(__dirname,"../backend/src",f+".ts"),"utf8"),{compilerOptions:{module:"commonjs",target:"es2022"}}).outputText);
const r=spawnSync(process.execPath,[path.join(__dirname,"worker.mock-test.cjs")],{stdio:"inherit",env:{...process.env,BUILD:out,NODE_PATH:path.join(out,"node_modules")}});
process.exit(r.status??1);
