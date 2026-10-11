// DEEPLO 4.5 extras: site-domain isolation, DB slug claims, plans, audit, admin, abuse reports,
// editor/rollback API, project-delete cleanup, Cloudflare custom hostnames, mail. Everything here is best-effort
// code that has NOT been run against live Cloudflare/Supabase — test with disposable accounts first.
export type H = { authenticate:(r:Request,e:any)=>Promise<any>; fail:(m:string,s?:number,o?:string)=>Response; jsonHeaders:(o:string)=>Record<string,string>; safeSlug:(s:string)=>boolean; safePath:(s:string)=>boolean; mime:(p:string,t?:string)=>string };

export const PLANS:Record<string,{sites:number,bytes:number}>={ free:{sites:3,bytes:10*1024*1024}, pro:{sites:15,bytes:10*1024*1024} };
const TEXT=/\.(html?|css|m?js|json|txt|svg)$/i;
const inv=()=>String(9999999999999-Date.now()).padStart(13,"0")+"-"+crypto.randomUUID().slice(0,8);

// ---------- Supabase REST (runs as the signed-in user; RLS enforces access) ----------
const sb=(env:any,path:string,token:string,init:any={})=>fetch(`${env.SUPABASE_URL.replace(/\/+$/,"")}/rest/v1/${path}`,{...init,headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(init.headers||{})}});
export async function getProfile(env:any,a:any){
  try{const r=await sb(env,`profiles?id=eq.${a.id}&select=plan,is_admin,suspended`,a.token);const p:any=r.ok?((await r.json())[0]||{}):{};
   return {plan:PLANS[p.plan]?p.plan:"free",isAdmin:!!p.is_admin,suspended:!!p.suspended}}catch{return {plan:"free",isAdmin:false,suspended:false}}
}
export async function claimSite(env:any,a:any,slug:string,projectId:string):Promise<"mine"|"new"|"taken"|"error">{
  try{
   const own=await sb(env,`sites?slug=eq.${slug}&select=slug`,a.token);
   if(!own.ok)return "error"; if((await own.json()).length)return "mine";
   const ins=await sb(env,"sites",a.token,{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({slug,owner_id:a.id,project_id:projectId})});
   if(ins.ok)return "new"; return ins.status===409?"taken":"error";
  }catch{return "error"}
}
export async function countSites(env:any,a:any){try{const r=await sb(env,`sites?owner_id=eq.${a.id}&select=slug`,a.token);return r.ok?(await r.json()).length:0}catch{return 0}}
export async function dropSite(env:any,a:any,slug:string){try{await sb(env,`sites?slug=eq.${slug}`,a.token,{method:"DELETE"})}catch{}}

// ---------- audit, mail, urls ----------
export async function audit(env:any,ownerId:string,action:string,detail:any={}){
  try{const e=JSON.stringify({at:new Date().toISOString(),ownerId,action,detail});const k=inv();
   await env.SITES.put(`_audit/${ownerId}/${k}.json`,e);await env.SITES.put(`_auditall/${k}.json`,e)}catch{}
}
export async function mail(env:any,to:string|undefined,subject:string,text:string){
  if(!env.RESEND_API_KEY||!env.MAIL_FROM||!to)return;
  try{await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:env.MAIL_FROM,to:[to],subject,text})})}catch{}
}
export const siteUrl=(env:any,slug:string,origin:string)=>env.SITE_DOMAIN?`https://${slug}.${env.SITE_DOMAIN}/`:`${origin}/s/${slug}/`;

// ---------- R2 helpers ----------
async function listAll(env:any,prefix:string,max=5000){const out:any[]=[];let cursor:string|undefined;do{const p=await env.SITES.list({prefix,cursor,limit:1000});out.push(...p.objects);cursor=p.truncated&&out.length<max?p.cursor:undefined}while(cursor);return out}
async function deletePrefix(env:any,prefix:string){const ks=(await listAll(env,prefix)).map((o:any)=>o.key);for(let i=0;i<ks.length;i+=1000)await env.SITES.delete(ks.slice(i,i+1000))}
async function copyPrefix(env:any,from:string,to:string){for(const o of await listAll(env,from)){const g=await env.SITES.get(o.key);if(!g)continue;await env.SITES.put(to+o.key.slice(from.length),await g.arrayBuffer(),{httpMetadata:g.httpMetadata})}}
export async function archiveSite(env:any,slug:string){await deletePrefix(env,`versions/${slug}/prev/`);await copyPrefix(env,`sites/${slug}/`,`versions/${slug}/prev/`)}
async function removeSite(env:any,slug:string){await deletePrefix(env,`sites/${slug}/`);await deletePrefix(env,`versions/${slug}/`);await env.SITES.delete([`_registry/${slug}.json`,`_suspended/${slug}`])}
async function registry(env:any,slug:string){const o=await env.SITES.get(`_registry/${slug}.json`);if(!o)return null;try{return await o.json() as any}catch{return null}}
async function refreshRegistry(env:any,slug:string,meta:any){const l=await listAll(env,`sites/${slug}/`);await env.SITES.put(`_registry/${slug}.json`,JSON.stringify({...meta,files:l.length,bytes:l.reduce((n:number,o:any)=>n+o.size,0),updatedAt:new Date().toISOString()}),{httpMetadata:{contentType:"application/json"}})}

// ---------- serving a published site (path or subdomain or verified custom domain) ----------
export async function serveSite(env:any,slug:string,path:string,h:H):Promise<Response>{
  const nf=(m="Not found",s=404)=>new Response(m,{status:s,headers:{"Content-Type":"text/plain; charset=utf-8","X-Content-Type-Options":"nosniff"}});
  if(!h.safeSlug(slug))return nf();
  try{path=decodeURIComponent(path)}catch{return nf("Bad path",400)}
  if(path.endsWith("/"))path+="index.html";
  if(!h.safePath(path))return nf();
  if(await env.SITES.head(`_suspended/${slug}`))return nf("This site has been suspended.",403);
  let obj=await env.SITES.get(`sites/${slug}/${path}`),status=200;
  if(!obj&&!/\.[a-z0-9]+$/i.test(path))obj=await env.SITES.get(`sites/${slug}/${path}/index.html`);
  if(!obj){obj=await env.SITES.get(`sites/${slug}/404.html`);status=404;if(!obj)return nf()}
  try{env.ANALYTICS?.writeDataPoint({blobs:[slug,path,String(status)],indexes:[slug]})}catch{}
  const hd=new Headers();obj.writeHttpMetadata(hd);
  hd.set("X-Content-Type-Options","nosniff");hd.set("Referrer-Policy","strict-origin-when-cross-origin");
  hd.set("X-Frame-Options","DENY");hd.set("Permissions-Policy","camera=(), microphone=(), geolocation=(), payment=()");
  hd.set("Cross-Origin-Opener-Policy","same-origin");hd.set("Cross-Origin-Resource-Policy","same-origin");hd.set("Strict-Transport-Security","max-age=31536000");
  hd.set("Content-Security-Policy","default-src 'self' data: blob: https:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  return new Response(obj.body,{status,headers:hd});
}


// ---------- publish safety: scan, stale cleanup, failure recovery ----------
export function scanFiles(files:{path:string,raw:string}[]):{reject?:string,flag?:string}{
  let flag="";
  for(const f of files){
    const r=f.raw;
    if(r.startsWith("MZ")||r.startsWith("\x7fELF")||r.startsWith("PK\u0003\u0004")||r.startsWith("#!"))return {reject:`"${f.path}" looks like an executable or archive, which is not allowed.`};
    if(/\.(html?|m?js|svg)$/i.test(f.path)){
      if(/coinhive|coin-hive|cryptonight|webminepool|jsecoin|minero\.cc/i.test(r))return {reject:`"${f.path}" contains cryptocurrency-miner code, which is not allowed.`};
      if(/\.html?$/i.test(f.path)&&/type\s*=\s*["']?password/i.test(r)&&/paypal|facebook|instagram|gmail|bkash|nagad|rocket|bank|apple\s*id|microsoft/i.test(r))flag=`Password form with brand keywords in ${f.path} (possible phishing)`;
    }
  }
  return flag?{flag}:{};
}
export async function flagReport(env:any,slug:string,reason:string){try{await env.SITES.put(`_reports/${inv()}.json`,JSON.stringify({at:new Date().toISOString(),url:`auto-scan:${slug}`,reason,email:""}))}catch{}}
export async function pruneStale(env:any,slug:string,keep:string[]){const k=new Set(keep.map(x=>`sites/${slug}/${x}`));const stale=(await listAll(env,`sites/${slug}/`)).map((o:any)=>o.key).filter((x:string)=>!k.has(x));for(let i=0;i<stale.length;i+=1000)await env.SITES.delete(stale.slice(i,i+1000))}
export async function restoreSite(env:any,slug:string){await deletePrefix(env,`sites/${slug}/`);await copyPrefix(env,`versions/${slug}/prev/`,`sites/${slug}/`)}

// ---------- scheduled: backups + monitoring ----------
async function alertOps(env:any,msg:string){if(!env.ALERT_WEBHOOK)return;try{await fetch(env.ALERT_WEBHOOK,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:`[DEEPLO] ${msg}`,text:`[DEEPLO] ${msg}`})})}catch{}}
export async function runScheduled(env:any){
  const problems:string[]=[];
  try{await env.SITES.head("_healthcheck")}catch(e){problems.push("R2 unreachable")}
  try{const r=await fetch(`${env.SUPABASE_URL.replace(/\/+$/,"")}/auth/v1/health`,{headers:{apikey:env.SUPABASE_ANON_KEY}});if(!r.ok)problems.push("Supabase auth health "+r.status)}catch{problems.push("Supabase unreachable")}
  try{
    const day=new Date().toISOString().slice(0,10);
    for(const pre of ["_registry/","_domains/","_suspended/"]){for(const o of await listAll(env,pre,5000)){const g=await env.SITES.get(o.key);if(g)await env.SITES.put(`_backups/${day}/${o.key}`,await g.arrayBuffer())}}
    const cutoff=new Date(Date.now()-7*864e5).toISOString().slice(0,10);
    const old=(await listAll(env,"_backups/",20000)).map((o:any)=>o.key).filter((k:string)=>k.split("/")[1]<cutoff);
    for(let i=0;i<old.length;i+=1000)await env.SITES.delete(old.slice(i,i+1000));
    if(env.BACKUP){let n=0;for(const o of await listAll(env,"sites/",20000)){if(n>=2000)break;const h=await env.BACKUP.head(o.key);if(h&&h.etag===o.etag)continue;const g=await env.SITES.get(o.key);if(g){await env.BACKUP.put(o.key,await g.arrayBuffer(),{httpMetadata:g.httpMetadata});n++}}}
  }catch(e){problems.push("Backup failed: "+(e instanceof Error?e.message:"error"))}
  if(problems.length)await alertOps(env,problems.join("; "));
}

// ---------- router ----------
export async function handleExtras(request:Request,env:any,url:URL,co:string,origin:string,h:H):Promise<Response|null>{
  const host=url.hostname.toLowerCase(),M=request.method,P=url.pathname;
  const json=(d:any,s=200)=>Response.json(d,{status:s,headers:h.jsonHeaders(co)});
  // Origin isolation: customer sites live on *.SITE_DOMAIN; path serving on the dashboard/API host is switched off.
  if(env.SITE_DOMAIN){
   if(host.endsWith("."+env.SITE_DOMAIN)&&(M==="GET"||M==="HEAD")){const sub=host.slice(0,-env.SITE_DOMAIN.length-1);return serveSite(env,sub,P.replace(/^\//,"")||"index.html",h)}
   if(P.startsWith("/s/"))return new Response("Not found",{status:404});
  }
  if(!P.startsWith("/api/"))return null;
  const mine=["/api/reports","/api/me","/api/audit","/api/analytics","/api/upgrade-request","/api/sites/","/api/admin/","/api/domains/attach","/api/domains/status"].some(x=>P===x||P.startsWith(x));
  if(!mine||P==="/api/sites/list")return null;
  if(origin&&origin!==env.ALLOWED_ORIGIN)return h.fail("Origin not allowed.",403,co);

  // Public abuse report (no login).
  if(P==="/api/reports"&&M==="POST"){
   let b:any;try{b=await request.json()}catch{return h.fail("Invalid JSON.",400,co)}
   const u=String(b?.url||"").slice(0,300),reason=String(b?.reason||"").slice(0,2000),email=String(b?.email||"").slice(0,200);
   if(!/^https?:\/\//i.test(u)||reason.length<10)return h.fail("Enter the site URL and a reason (10+ characters).",400,co);
   await env.SITES.put(`_reports/${inv()}.json`,JSON.stringify({at:new Date().toISOString(),url:u,reason,email}));
   return json({ok:true});
  }

  let a:any;try{a=await h.authenticate(request,env)}catch(e){return h.fail(e instanceof Error?e.message:"Sign in first.",401,co)}
  const prof=await getProfile(env,a);
  const owned=async(slug:string)=>h.safeSlug(slug)?(await registry(env,slug)):null;
  const ownMeta=async(slug:string)=>{const m=await owned(slug);return m&&m.ownerId===a.id?m:null};

  if(P==="/api/me"&&M==="GET"){const n=await countSites(env,a);return json({email:a.email||"",plan:prof.plan,isAdmin:prof.isAdmin,suspended:prof.suspended,limits:PLANS[prof.plan],sites:n})}
  if(P==="/api/audit"&&M==="GET"){const l=(await listAll(env,`_audit/${a.id}/`,50)).slice(0,50),out:any[]=[];for(const o of l){const g=await env.SITES.get(o.key);if(g)try{out.push(await g.json())}catch{}}return json({events:out})}

  // Manual payment flow (bKash/Nagad/bank): user submits a transaction ID, an admin verifies it in their wallet app and approves.
  if(P==="/api/upgrade-request"&&M==="POST"){let b:any;try{b=await request.json()}catch{return h.fail("Invalid JSON.",400,co)}
   const method=String(b?.method||"").slice(0,20),trx=String(b?.trxId||"").trim(),note=String(b?.note||"").slice(0,300);
   if(!["bkash","nagad","rocket","bank","other"].includes(method)||!/^[A-Za-z0-9-]{4,40}$/.test(trx))return h.fail("Choose a method and enter a valid transaction ID (4-40 letters/numbers).",400,co);
   await env.SITES.put(`_upgrades/${inv()}.json`,JSON.stringify({at:new Date().toISOString(),userId:a.id,email:a.email||"",method,trxId:trx,note,status:"pending"}));
   await audit(env,a.id,"upgrade-request",{method});await mail(env,env.ADMIN_EMAIL,"New DEEPLO upgrade request",`${a.email||a.id} sent ${method} transaction ${trx}.`);
   return json({ok:true})}
  if(P==="/api/analytics"&&M==="GET"){const s2=url.searchParams.get("slug")||"",days=Math.max(1,Math.min(30,Number(url.searchParams.get("days")||"7")||7));
   if(!await ownMeta(s2))return h.fail("Site not found.",404,co);
   if(!env.CF_ACCOUNT_ID||!env.CF_ANALYTICS_TOKEN)return h.fail("Analytics is not configured on this Worker.",501,co);
   const q=`SELECT toDate(timestamp) AS day, sum(_sample_interval) AS views FROM ${env.ANALYTICS_DATASET||"deeplo_sites"} WHERE index1 = '${s2}' AND timestamp > NOW() - INTERVAL '${days}' DAY GROUP BY day ORDER BY day`;
   const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,{method:"POST",headers:{Authorization:`Bearer ${env.CF_ANALYTICS_TOKEN}`},body:q});
   if(!r.ok)return h.fail("Analytics query failed ("+r.status+").",502,co);const d:any=await r.json().catch(()=>({}));
   return json({days:(d.data||[]).map((x:any)=>({day:x.day,views:Number(x.views)||0}))})}

  // Editor + rollback
  if(P==="/api/sites/files"&&M==="GET"){const s=url.searchParams.get("slug")||"";if(!await ownMeta(s))return h.fail("Site not found.",404,co);
   return json({files:(await listAll(env,`sites/${s}/`,500)).map((o:any)=>({path:o.key.slice(`sites/${s}/`.length),size:o.size}))})}
  if(P==="/api/sites/file"&&M==="GET"){const s=url.searchParams.get("slug")||"",p=url.searchParams.get("path")||"";
   if(!await ownMeta(s)||!h.safePath(p)||!TEXT.test(p))return h.fail("File not found or not editable.",404,co);
   const g=await env.SITES.get(`sites/${s}/${p}`);if(!g)return h.fail("File not found.",404,co);return json({path:p,content:await g.text()})}
  if(P==="/api/sites/file"&&M==="PUT"){let b:any;try{b=await request.json()}catch{return h.fail("Invalid JSON.",400,co)}
   const s=String(b?.slug||""),p=String(b?.path||""),c=b?.content;const meta=await ownMeta(s);
   if(!meta||!h.safePath(p)||!TEXT.test(p)||typeof c!=="string")return h.fail("Invalid site, path or content.",400,co);
   if(prof.suspended||await env.SITES.head(`_suspended/${s}`))return h.fail("This site or account is suspended.",403,co);
   const bytes=new TextEncoder().encode(c);if(bytes.length>2*1024*1024)return h.fail("File must be 2 MB or smaller.",413,co);
   await env.SITES.put(`sites/${s}/${p}`,bytes,{httpMetadata:{contentType:h.mime(p),cacheControl:"public, max-age=60"}});
   await refreshRegistry(env,s,meta);await audit(env,a.id,"edit-file",{slug:s,path:p});return json({ok:true})}
  if(P==="/api/sites/rollback"&&M==="POST"){let b:any;try{b=await request.json()}catch{return h.fail("Invalid JSON.",400,co)}
   const s=String(b?.slug||""),meta=await ownMeta(s);if(!meta)return h.fail("Site not found.",404,co);
   if(!(await listAll(env,`versions/${s}/prev/`)).length)return h.fail("No previous version saved yet (created on the next re-publish).",404,co);
   await deletePrefix(env,`sites/${s}/`);await copyPrefix(env,`versions/${s}/prev/`,`sites/${s}/`);await refreshRegistry(env,s,meta);
   await audit(env,a.id,"rollback",{slug:s});return json({ok:true})}

  // Project deleted -> unpublish its sites.
  if(P==="/api/sites/by-project"&&M==="DELETE"){const pid=url.searchParams.get("projectId")||"";if(!/^[0-9a-f-]{36}$/i.test(pid))return h.fail("Invalid project.",400,co);
   const r=await sb(env,`sites?project_id=eq.${pid}&select=slug`,a.token);const rows:any[]=r.ok?await r.json():[];let n=0;
   for(const x of rows){if(await ownMeta(x.slug)){await removeSite(env,x.slug);await dropSite(env,a,x.slug);await audit(env,a.id,"unpublish",{slug:x.slug,reason:"project-deleted"});n++}}
   return json({ok:true,removed:n})}

  // Cloudflare for SaaS custom hostnames (needs CF_API_TOKEN, CF_ZONE_ID; optional FALLBACK_ORIGIN shown to user).
  if((P==="/api/domains/attach"&&M==="POST")||(P==="/api/domains/status"&&M==="GET")){
   if(!env.CF_API_TOKEN||!env.CF_ZONE_ID)return h.fail("Cloudflare custom hostnames are not configured on this Worker.",501,co);
   let domain="";if(M==="POST"){try{domain=String((await request.json() as any)?.domain||"")}catch{}}else domain=url.searchParams.get("domain")||"";
   domain=domain.trim().toLowerCase().replace(/\.$/,"");const key=`_domains/${domain}.json`,o=await env.SITES.get(key);
   let rec:any=null;if(o)try{rec=await o.json()}catch{}
   if(!rec||rec.ownerId!==a.id)return h.fail("Domain not found.",404,co);
   if(rec.status!=="verified")return h.fail("Verify DNS ownership first.",400,co);
   const cf=(p:string,i:any={})=>fetch(`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/${p}`,{...i,headers:{Authorization:`Bearer ${env.CF_API_TOKEN}`,"Content-Type":"application/json"}});
   if(M==="POST"&&!rec.cfId){const r=await cf("custom_hostnames",{method:"POST",body:JSON.stringify({hostname:domain,ssl:{method:"http",type:"dv",settings:{min_tls_version:"1.2"}}})});const d:any=await r.json().catch(()=>({}));
    if(!d.success)return h.fail("Cloudflare rejected the hostname: "+(d.errors?.[0]?.message||r.status),502,co);
    rec.cfId=d.result.id;rec.attachedAt=new Date().toISOString();await env.SITES.put(key,JSON.stringify(rec),{httpMetadata:{contentType:"application/json"}});await audit(env,a.id,"domain-attach",{domain})}
   if(!rec.cfId)return json({attached:false});
   const r=await cf(`custom_hostnames/${rec.cfId}`);const d:any=await r.json().catch(()=>({}));
   return json({attached:true,status:d.result?.status,ssl:d.result?.ssl?.status,cnameTarget:env.FALLBACK_ORIGIN||null})}

  // Admin (requires profiles.is_admin = true; RLS also protects the data).
  if(P.startsWith("/api/admin/")){
   if(!prof.isAdmin)return h.fail("Admins only.",403,co);
   if(P==="/api/admin/overview"&&M==="GET"){
    const sites:any[]=[];for(const o of (await listAll(env,"_registry/",300))){const g=await env.SITES.get(o.key);if(!g)continue;try{const m:any=await g.json();sites.push({...m,suspended:!!(await env.SITES.head(`_suspended/${m.slug}`))})}catch{}}
    const rd=async(prefix:string)=>{const out:any[]=[];for(const o of (await listAll(env,prefix,50)).slice(0,50)){const g=await env.SITES.get(o.key);if(g)try{out.push({key:o.key,...(await g.json() as any)})}catch{}}return out};
    const ur=await sb(env,"profiles?select=id,email,plan,is_admin,suspended&order=created_at.desc&limit=200",a.token);
    return json({sites,reports:await rd("_reports/"),upgrades:await rd("_upgrades/"),audit:await rd("_auditall/"),users:ur.ok?await ur.json():[]})}
   let b:any={};if(M!=="GET"){try{b=await request.json()}catch{}}
   if(P==="/api/admin/suspend"&&M==="POST"){const s=String(b.slug||""),m=await owned(s);if(!m)return h.fail("Site not found.",404,co);
    if(b.suspended){await env.SITES.put(`_suspended/${s}`,"1");await mail(env,m.ownerEmail,"Your DEEPLO site was suspended",`Your site "${s}" was suspended.\nReason: ${String(b.reason||"policy review").slice(0,300)}`)}else await env.SITES.delete(`_suspended/${s}`);
    await audit(env,a.id,b.suspended?"admin-suspend":"admin-unsuspend",{slug:s,owner:m.ownerId});return json({ok:true})}
   if(P==="/api/admin/site"&&M==="DELETE"){const s=url.searchParams.get("slug")||"",m=await owned(s);if(!m)return h.fail("Site not found.",404,co);
    await removeSite(env,s);await dropSite(env,a,s);await audit(env,a.id,"admin-delete",{slug:s,owner:m.ownerId});return json({ok:true})}
   if(P==="/api/admin/plan"&&M==="POST"){const id=String(b.userId||""),plan=String(b.plan||"");if(!/^[0-9a-f-]{36}$/i.test(id)||!PLANS[plan])return h.fail("Invalid user or plan.",400,co);
    const r=await sb(env,`profiles?id=eq.${id}`,a.token,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({plan})});
    if(!r.ok)return h.fail("Could not update plan.",502,co);await audit(env,a.id,"admin-plan",{userId:id,plan});return json({ok:true})}
   if(P==="/api/admin/upgrade"&&M==="POST"){const k=String(b.key||"");if(!/^_upgrades\/[0-9a-z-]+\.json$/.test(k))return h.fail("Invalid key.",400,co);
    const g=await env.SITES.get(k);if(!g)return h.fail("Request not found.",404,co);const u:any=await g.json();if(u.status!=="pending")return h.fail("Already handled.",409,co);
    if(b.approve){const r=await sb(env,`profiles?id=eq.${u.userId}`,a.token,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({plan:"pro"})});if(!r.ok)return h.fail("Could not update plan.",502,co)}
    u.status=b.approve?"approved":"rejected";u.handledAt=new Date().toISOString();await env.SITES.put(k,JSON.stringify(u));
    await audit(env,a.id,b.approve?"admin-upgrade-approve":"admin-upgrade-reject",{userId:u.userId});
    await mail(env,u.email,b.approve?"Your DEEPLO Pro plan is active":"Your DEEPLO upgrade request",b.approve?"Payment verified — your account is now on the Pro plan.":"We could not verify your payment. Please contact support.");return json({ok:true})}
   if(P==="/api/admin/report"&&M==="DELETE"){const k=url.searchParams.get("key")||"";if(!/^_reports\/[0-9a-z-]+\.json$/.test(k))return h.fail("Invalid key.",400,co);await env.SITES.delete(k);return json({ok:true})}
  }
  return h.fail("Not found.",404,co);
}
