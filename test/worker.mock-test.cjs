const worker=require(process.env.BUILD+"/index.js").default;
// ---------- fake R2 ----------
class R2{constructor(){this.m=new Map()}
 async put(k,v){const b=typeof v==="string"?Buffer.from(v):Buffer.from(v instanceof ArrayBuffer?new Uint8Array(v):v);this.m.set(k,{b,etag:require("crypto").createHash("md5").update(b).digest("hex")})}
 _o(k){const e=this.m.get(k);if(!e)return null;return {key:k,size:e.b.length,etag:e.etag,httpMetadata:{},body:new Uint8Array(e.b),json:async()=>JSON.parse(e.b.toString()),text:async()=>e.b.toString(),arrayBuffer:async()=>new Uint8Array(e.b).buffer,writeHttpMetadata(h){h.set("Content-Type",k.endsWith(".html")?"text/html":"text/plain")}}}
 async get(k){return this._o(k)} async head(k){return this._o(k)}
 async list({prefix=""}={}){return {objects:[...this.m.keys()].filter(k=>k.startsWith(prefix)).sort().map(k=>this._o(k)),truncated:false}}
 async delete(k){for(const x of Array.isArray(k)?k:[k])this.m.delete(x)}}
// ---------- fake Supabase ----------
const profiles={A:{id:"A",email:"a@x",plan:"free",is_admin:true,suspended:false},B:{id:"B",email:"b@x",plan:"free",is_admin:false,suspended:false},C:{id:"C",email:"c@x",plan:"free",is_admin:false,suspended:false}};
let sites=[];const projOwner={"11111111-1111-1111-1111-111111111111":"B","22222222-2222-2222-2222-222222222222":"C","33333333-3333-3333-3333-333333333333":"B"};
const SUPA="https://supa.test";
globalThis.fetch=async(u,init={})=>{u=String(u);if(!u.startsWith(SUPA+"/rest/v1/"))return Response.json({ok:true,success:true,result:{}});
 const uid=(init.headers.Authorization||"").slice(7).split("|")[0];const isAdm=!!profiles[uid]?.is_admin;
 const [tbl,qs]=u.slice((SUPA+"/rest/v1/").length).split("?");const q=new URLSearchParams(qs);const f=(row)=>{for(const [k,v] of q){if(v.startsWith("eq.")&&String(row[k])!==v.slice(3))return false}return true};
 const M=init.method||"GET";
 if(tbl==="projects")return Response.json(projOwner[q.get("id").slice(3)]===uid?[{id:q.get("id").slice(3)}]:[]);
 if(tbl==="profiles"){if(M==="PATCH"){if(!isAdm)return new Response("[]",{status:403});const r=Object.values(profiles).filter(f);r.forEach(x=>Object.assign(x,JSON.parse(init.body)));return new Response(null,{status:204})}
  return Response.json(Object.values(profiles).filter(r=>(isAdm||r.id===uid)&&f(r)))}
 if(tbl==="sites"){if(M==="POST"){const b=JSON.parse(init.body);if(sites.some(s=>s.slug===b.slug))return new Response("{}",{status:409});sites.push(b);return new Response(null,{status:201})}
  if(M==="DELETE"){sites=sites.filter(s=>!(f(s)&&(isAdm||s.owner_id===uid)));return new Response(null,{status:204})}
  return Response.json(sites.filter(s=>(isAdm||s.owner_id===uid)&&f(s)))}
 return new Response("[]",{status:404})};
// ---------- helpers ----------
const mk=(over={})=>({SUPABASE_URL:SUPA,SUPABASE_ANON_KEY:"k",ALLOWED_ORIGIN:"https://app.test",SITES:new R2(),MAX_SITES_PER_ACCOUNT:"3",...over});
let pass=0,fail=0;const ok=(n,c)=>{console.log((c?"PASS ":"FAIL ")+n);c?pass++:fail++};
const call=(env,tok,method,path,body,host="api.test")=>worker.fetch(new Request(`https://${host}${path}`,{method,headers:{...(tok?{Authorization:"Bearer "+tok}:{}),"Content-Type":"application/json","CF-Connecting-IP":"1.1.1."+Math.floor(Math.random()*250)},body:body?JSON.stringify(body):undefined}),env);
const b64=s=>Buffer.from(s).toString("base64");
const pub=(env,tok,slug,pid,files)=>call(env,tok,"POST","/api/publish",{projectId:pid,slug,files:files||[{path:"index.html",contentBase64:b64("<h1>hi "+slug+"</h1>"),contentType:"text/html"}]});
const PB="11111111-1111-1111-1111-111111111111",PC="22222222-2222-2222-2222-222222222222",PB2="33333333-3333-3333-3333-333333333333";
(async()=>{
 let env=mk(),r,d;
 r=await pub(env,"B|b@x","bsite",PB);d=await r.json();ok("B publishes",r.ok&&d.url==="https://api.test/s/bsite/");
 r=await call(env,null,"GET","/s/bsite/");ok("site is served",r.status===200&&(await r.text()).includes("hi bsite"));
 ok("security headers on site",r.headers.get("X-Frame-Options")==="DENY");
 r=await pub(env,"B|b@x","bsite",PB,[{path:"index.html",contentBase64:b64("<h1>v2</h1>")},{path:"404.html",contentBase64:b64("custom 404")}]);ok("re-publish ok",r.ok);
 r=await call(env,null,"GET","/s/bsite/nope.html");ok("custom 404 page",r.status===404&&(await r.text())==="custom 404");
 r=await call(env,"B|b@x","POST","/api/sites/rollback",{slug:"bsite"});ok("rollback works",r.ok);
 r=await call(env,null,"GET","/s/bsite/");ok("rollback restored v1",(await r.text()).includes("hi bsite"));
 r=await call(env,null,"GET","/s/bsite/404.html");ok("stale/404 gone after rollback",r.status===404);
 r=await call(env,"B|b@x","PUT","/api/sites/file",{slug:"bsite",path:"index.html",content:"<p>edited</p>"});ok("owner edits file",r.ok);
 r=await call(env,"C|c@x","PUT","/api/sites/file",{slug:"bsite",path:"index.html",content:"pwn"});ok("C cannot edit B",!r.ok);
 r=await call(env,"C|c@x","DELETE","/api/publish?slug=bsite");ok("C cannot unpublish B",r.status===403||r.status===404);
 r=await call(env,"C|c@x","POST","/api/sites/rollback",{slug:"bsite"});ok("C cannot rollback B",!r.ok);
 r=await pub(env,"C|c@x","bsite",PC);ok("C cannot take B slug",r.status===409);
 r=await call(env,"C|c@x","POST","/api/admin/suspend",{slug:"bsite",suspended:true});ok("non-admin cannot suspend",r.status===403);
 r=await call(env,"A|a@x","POST","/api/admin/suspend",{slug:"bsite",suspended:true});ok("admin suspends",r.ok);
 r=await call(env,null,"GET","/s/bsite/");ok("suspended site blocked",r.status===403);
 r=await pub(env,"B|b@x","bsite",PB);ok("owner cannot republish suspended",r.status===403);
 await call(env,"A|a@x","POST","/api/admin/suspend",{slug:"bsite",suspended:false});
 r=await call(env,null,"GET","/s/bsite/");ok("unsuspended serves again",r.status===200);
 // quota
 await pub(env,"B|b@x","site2",PB);await pub(env,"B|b@x","site3",PB);r=await pub(env,"B|b@x","site4",PB);ok("free plan quota (3) enforced",r.status===429);
 ok("quota rollback released slug",!sites.some(s=>s.slug==="site4"));
 // upgrade flow
 r=await call(env,"B|b@x","POST","/api/upgrade-request",{method:"bkash",trxId:"8N7A6D5E4F"});ok("upgrade request",r.ok);
 d=await (await call(env,"A|a@x","GET","/api/admin/overview")).json();ok("admin sees upgrade",d.upgrades.length===1&&d.sites.length===3&&d.users.length===3);
 r=await call(env,"A|a@x","POST","/api/admin/upgrade",{key:d.upgrades[0].key,approve:true});ok("admin approves",r.ok&&profiles.B.plan==="pro");
 r=await pub(env,"B|b@x","site4",PB);ok("pro plan allows 4th site",r.ok);
 r=await call(env,"B|b@x","GET","/api/admin/overview");ok("user cannot open admin overview",r.status===403);
 // scanner
 r=await pub(env,"B|b@x","evil1",PB,[{path:"index.html",contentBase64:b64("<script src='https://coinhive.com/x.js'></script>")}]);ok("miner rejected",r.status===400);
 r=await pub(env,"B|b@x","evil2",PB,[{path:"index.html",contentBase64:b64("<h1>x</h1>")},{path:"a.png",contentBase64:Buffer.from("MZ\x90\x00").toString("base64")}]);ok("executable rejected",r.status===400);
 r=await pub(env,"B|b@x","phish",PB,[{path:"index.html",contentBase64:b64("<h1>PayPal login</h1><input type=password>")}]);d=await (await call(env,"A|a@x","GET","/api/admin/overview")).json();ok("phishing flagged for admin",r.ok&&d.reports.some(x=>x.url==="auto-scan:phish"));
 // by-project cleanup
 r=await call(env,"B|b@x","DELETE","/api/sites/by-project?projectId="+PB);d=await r.json();ok("project delete unpublishes sites",r.ok&&d.removed>=4);
 r=await call(env,null,"GET","/s/bsite/");ok("site gone after project delete",r.status===404);
 // audit
 d=await (await call(env,"B|b@x","GET","/api/audit")).json();ok("audit log has events",d.events.length>3);
 // abuse report
 r=await call(env,null,"POST","/api/reports",{url:"https://x.test/",reason:"phishing page here"});ok("public report accepted",r.ok);
 // SITE_DOMAIN isolation
 env=mk({SITE_DOMAIN:"sites.test"});await pub(env,"B|b@x","iso",PB2);
 r=await call(env,null,"GET","/",null,"iso.sites.test");ok("subdomain serving",r.status===200&&(await r.text()).includes("hi iso"));
 r=await call(env,null,"GET","/s/iso/",null,"api.test");ok("path serving disabled when SITE_DOMAIN set",r.status===404);
 r=await call(env,"B|b@x","GET","/api/sites/list");d=await r.json();ok("list returns subdomain URL",d.sites[0]&&d.sites[0].url==="https://iso.sites.test/");
 // scheduled backup
 const w=require(process.env.BUILD+"/extras.js");await w.runScheduled(env);ok("nightly backup written",[...env.SITES.m.keys()].some(k=>k.startsWith("_backups/")));
 console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
})().catch(e=>{console.error("CRASH",e);process.exit(1)});
