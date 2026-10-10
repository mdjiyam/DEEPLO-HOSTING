import { createRemoteJWKSet, jwtVerify } from "jose";

interface Env {
  APP_NAME?: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_JWKS_URL?: string;
  SITES: R2Bucket;
  ALLOWED_ORIGIN: string;
  MAX_SITE_BYTES?: string;
  MAX_SITES_PER_ACCOUNT?: string;
}
const jsonHeaders = (origin:string) => ({
  "Content-Type":"application/json; charset=utf-8",
  "Access-Control-Allow-Origin":origin,
  "Access-Control-Allow-Methods":"GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type, Authorization",
  "Vary":"Origin",
  "X-Content-Type-Options":"nosniff"
});
const fail=(message:string,status=400,origin="null")=>Response.json({error:message},{status,headers:jsonHeaders(origin)});
const safeSlug=(s:string)=>/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(s);
const safePath=(s:string)=>!!s && s.length<=180 && !s.startsWith("/") && !s.includes("\\") && !s.split("/").some(x=>!x || x==="." || x===".." || x.startsWith("."));

async function authenticate(request:Request,env:Env){
  const auth=request.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer ")) throw new Error("Sign in first.");
  const token=auth.slice(7);
  const jwksUrl=env.SUPABASE_JWKS_URL || `${env.SUPABASE_URL.replace(/\/+$/,"")}/auth/v1/.well-known/jwks.json`;
  const jwks=createRemoteJWKSet(new URL(jwksUrl));
  const {payload}=await jwtVerify(token,jwks,{issuer:`${env.SUPABASE_URL.replace(/\/+$/,"")}/auth/v1`});
  if(typeof payload.sub!=="string") throw new Error("Invalid account token.");
  return {id:payload.sub,token};
}
function mime(path:string,provided?:string){
  const ext=path.split(".").pop()?.toLowerCase();
  const map:Record<string,string>={html:"text/html; charset=utf-8",htm:"text/html; charset=utf-8",css:"text/css; charset=utf-8",js:"text/javascript; charset=utf-8",mjs:"text/javascript; charset=utf-8",json:"application/json; charset=utf-8",txt:"text/plain; charset=utf-8",svg:"image/svg+xml",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",gif:"image/gif",ico:"image/x-icon",woff:"font/woff",woff2:"font/woff2"};
  return map[ext||""] || (provided && /^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(provided) ? provided : "application/octet-stream");
}
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);
  const origin=request.headers.get("Origin")||"";
  const allowed=env.ALLOWED_ORIGIN||"";
  const corsOrigin=origin===allowed?allowed:"null";
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:jsonHeaders(corsOrigin)});
  if(url.pathname==="/api/health" && request.method==="GET") return Response.json({app:env.APP_NAME||"DEEPLO HOSTING",status:"configured-code",publishing:"R2 static publishing endpoint available; configure secrets and bucket"},{headers:jsonHeaders(corsOrigin)});
  // Domain ownership verification scaffold. Verification proves DNS control only; it does not attach a hostname to Cloudflare routing/TLS.
  if(url.pathname==="/api/domains/request" && request.method==="POST"){
   if(origin && origin!==allowed) return fail("Origin not allowed.",403,corsOrigin);
   let account:{id:string,token:string};
   try{account=await authenticate(request,env)}catch(e){return fail(e instanceof Error?e.message:"Authentication failed.",401,corsOrigin)}
   let body:any;try{body=await request.json()}catch{return fail("Invalid JSON body.",400,corsOrigin)}
   const slug=typeof body?.slug==="string"?body.slug:"";
   const domain=typeof body?.domain==="string"?body.domain.trim().toLowerCase().replace(/\.$/,""):"";
   if(!safeSlug(slug))return fail("Invalid site name.",400,corsOrigin);
   if(domain.length>253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) || domain.includes(".."))return fail("Enter a valid domain name, without https:// or a path.",400,corsOrigin);
   const registry=await env.SITES.get(`_registry/${slug}.json`);if(!registry)return fail("Published site not found.",404,corsOrigin);
   let meta:any;try{meta=await registry.json()}catch{return fail("Site registry is invalid.",500,corsOrigin)}
   if(meta?.ownerId!==account.id)return fail("Site not found or you do not own it.",403,corsOrigin);
   const domainKey=`_domains/${domain}.json`;
   const previous=await env.SITES.get(domainKey);let previousMeta:any=null;if(previous){try{previousMeta=await previous.json()}catch{}}
   if(previousMeta && previousMeta.ownerId!==account.id)return fail("That domain is already claimed by another account.",409,corsOrigin);
   const token=previousMeta?.ownerId===account.id && previousMeta?.token ? previousMeta.token : `deeplo-verify=${Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b=>b.toString(16).padStart(2,"0")).join("")}`;
   const keepVerified=previousMeta?.ownerId===account.id && previousMeta?.token===token && previousMeta?.slug===slug && previousMeta?.status==="verified";
   const record={domain,slug,ownerId:account.id,token,status:keepVerified?"verified":"pending",createdAt:previousMeta?.createdAt||new Date().toISOString(),checkedAt:previousMeta?.checkedAt||null};
   await env.SITES.put(domainKey,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
   return Response.json({ok:true,domain,slug,status:"pending",dns:{type:"TXT",name:`_deeplo.${domain}`,value:token},verifyUrl:`${url.origin}/api/domains/verify?domain=${encodeURIComponent(domain)}`,note:"DNS ownership verification only; routing and TLS must be configured separately."},{headers:jsonHeaders(corsOrigin)});
  }
  if(url.pathname==="/api/domains/verify" && request.method==="GET"){
   if(origin && origin!==allowed)return fail("Origin not allowed.",403,corsOrigin);
   let account:{id:string,token:string};
   try{account=await authenticate(request,env)}catch(e){return fail(e instanceof Error?e.message:"Authentication failed.",401,corsOrigin)}
   const domain=(url.searchParams.get("domain")||"").trim().toLowerCase().replace(/\.$/,"");
   if(domain.length>253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))return fail("Invalid domain.",400,corsOrigin);
   const key=`_domains/${domain}.json`;const obj=await env.SITES.get(key);if(!obj)return fail("Request a domain challenge first.",404,corsOrigin);
   let record:any;try{record=await obj.json()}catch{return fail("Domain record is invalid.",500,corsOrigin)}
   if(record?.ownerId!==account.id)return fail("Domain not found or you do not own it.",403,corsOrigin);
   try{
    const dns=await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(`_deeplo.${domain}`)}&type=TXT`,{headers:{accept:"application/dns-json"}});
    if(!dns.ok)return fail("DNS lookup is temporarily unavailable. Try again later.",502,corsOrigin);
    const result:any=await dns.json();const answers=Array.isArray(result?.Answer)?result.Answer:[];
    const found=answers.some((a:any)=>typeof a.data==="string" && a.data.replace(/^"|"$/g,"").replace(/\\"/g,'"').includes(record.token));
    record.status=found?"verified":"pending";record.checkedAt=new Date().toISOString();
    await env.SITES.put(key,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
    return Response.json({ok:true,domain,status:record.status,verified:found,routingActive:false,message:found?"DNS ownership verified. Domain routing and TLS are not yet activated.":"TXT challenge not found yet. Check the exact TXT name/value and wait for DNS propagation."},{headers:jsonHeaders(corsOrigin)});
   }catch{return fail("DNS verification failed. Retry after checking DNS settings.",502,corsOrigin)}
  }
  // List only the authenticated account’s domain records.
  if(url.pathname==="/api/domains/list" && request.method==="GET") {
   if(origin && origin!==allowed) return fail("Origin not allowed.",403,corsOrigin);
   let account:{id:string,token:string};
   try{account=await authenticate(request,env)}catch(e){return fail(e instanceof Error?e.message:"Authentication failed.",401,corsOrigin)}
   const listed=await env.SITES.list({prefix:"_domains/",limit:1000});
   const domains:any[]=[];
   for(const item of listed.objects){const obj=await env.SITES.get(item.key);if(!obj)continue;try{const r:any=await obj.json();if(r?.ownerId===account.id)domains.push({domain:r.domain,slug:r.slug,status:r.status||"pending",createdAt:r.createdAt||null,checkedAt:r.checkedAt||null,routingActive:false,sslStatus:"not-configured"})}catch{}}
   domains.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
   return Response.json({ok:true,domains,note:"SSL and hostname routing status require separate Cloudflare configuration."},{headers:jsonHeaders(corsOrigin)});
  }
  if(url.pathname==="/api/domains/remove" && request.method==="DELETE") {
   if(origin && origin!==allowed) return fail("Origin not allowed.",403,corsOrigin);
   let account:{id:string,token:string};
   try{account=await authenticate(request,env)}catch(e){return fail(e instanceof Error?e.message:"Authentication failed.",401,corsOrigin)}
   const domain=(url.searchParams.get("domain")||"").trim().toLowerCase().replace(/\.$/,"");
   if(domain.length>253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))return fail("Invalid domain.",400,corsOrigin);
   const key=`_domains/${domain}.json`;const obj=await env.SITES.get(key);if(!obj)return fail("Domain not found.",404,corsOrigin);
   let r:any;try{r=await obj.json()}catch{return fail("Domain record is invalid.",500,corsOrigin)}
   if(r?.ownerId!==account.id)return fail("Domain not found or you do not own it.",403,corsOrigin);
   await env.SITES.delete(key);
   return Response.json({ok:true,domain,message:"Domain mapping removed from DEEPLO. Remove any external DNS/Cloudflare hostname configuration separately."},{headers:jsonHeaders(corsOrigin)});
  }
  // Authenticated site removal. Registry ownership and project ownership are both checked.
  if(url.pathname==="/api/publish" && request.method==="DELETE"){
   if(origin && origin!==allowed) return fail("Origin not allowed.",403,corsOrigin);
   let account:{id:string,token:string};
   try{account=await authenticate(request,env)}catch(e){return fail(e instanceof Error?e.message:"Authentication failed.",401,corsOrigin)}
   const slug=url.searchParams.get("slug")||"";
   if(!safeSlug(slug)) return fail("Invalid site name.",400,corsOrigin);
   const registryKey=`_registry/${slug}.json`;
   const registry=await env.SITES.get(registryKey);
   if(!registry) return fail("Published site not found.",404,corsOrigin);
   let meta:any; try{meta=await registry.json()}catch{return fail("Site registry is invalid.",500,corsOrigin)}
   if(meta?.ownerId!==account.id || typeof meta?.projectId!=="string") return fail("Site not found or you do not own it.",403,corsOrigin);
   const check=await fetch(`${env.SUPABASE_URL.replace(/\/+$/ ,"")}/rest/v1/projects?id=eq.${encodeURIComponent(meta.projectId)}&select=id`,{headers:{"apikey":env.SUPABASE_ANON_KEY,"Authorization":`Bearer ${account.token}`}});
   if(!check.ok) return fail("Could not verify project ownership.",403,corsOrigin);
   const owned:any=await check.json();
   if(!Array.isArray(owned)||!owned.length) return fail("Project not found or you do not own it.",403,corsOrigin);
   try{
    let cursor:string|undefined;
    do {
     const page=await env.SITES.list({prefix:`sites/${slug}/`,cursor,limit:1000});
     if(page.objects.length) await env.SITES.delete(page.objects.map(o=>o.key));
     cursor=page.truncated?page.cursor:undefined;
    } while(cursor);
    await env.SITES.delete(registryKey);
   }catch{return fail("Could not fully remove site files. Retry or inspect the R2 bucket.",502,corsOrigin)}
   return Response.json({ok:true,removed:slug},{headers:jsonHeaders(corsOrigin)});
  }
  if(url.pathname==="/api/publish" && request.method==="POST"){
   if(origin && origin!==allowed) return fail("Origin not allowed.",403,corsOrigin);
   let account:{id:string,token:string};
   try{account=await authenticate(request,env)}catch(e){return fail(e instanceof Error?e.message:"Authentication failed.",401,corsOrigin)}
   let body:any;
   try{body=await request.json()}catch{return fail("Invalid JSON body.",400,corsOrigin)}
   const {projectId,slug,files}=body||{};
   if(typeof projectId!=="string" || !/^[0-9a-f-]{36}$/i.test(projectId)) return fail("Choose a valid project.",400,corsOrigin);
   if(typeof slug!=="string" || !safeSlug(slug)) return fail("Site name must be 3–40 lowercase letters, numbers or hyphens.",400,corsOrigin);
   if(!Array.isArray(files)||files.length<1||files.length>100) return fail("Choose 1–100 website files.",400,corsOrigin);
   // Supabase REST uses the user's JWT, so project RLS enforces ownership.
   const check=await fetch(`${env.SUPABASE_URL.replace(/\/+$/,"")}/rest/v1/projects?id=eq.${encodeURIComponent(projectId)}&select=id`,{headers:{"apikey":env.SUPABASE_ANON_KEY,"Authorization":`Bearer ${account.token}`}});
   if(!check.ok) return fail("Could not verify project ownership.",403,corsOrigin);
   const owned:any=await check.json();
   if(!Array.isArray(owned)||!owned.length) return fail("Project not found or you do not own it.",403,corsOrigin);
   const registryKey=`_registry/${slug}.json`;
   const existing=await env.SITES.get(registryKey);
   let existingMeta:any=null;
   if(existing){try{existingMeta=await existing.json()}catch{}if(existingMeta?.ownerId!==account.id||existingMeta?.projectId!==projectId)return fail("That site name is already taken.",409,corsOrigin)}
   // Basic per-account site quota. This is a guardrail, not a substitute for production rate limiting.
   if(!existingMeta){
    const quota=Math.max(1,Math.min(25,Number(env.MAX_SITES_PER_ACCOUNT||"3")||3));
    let count=0, cursor:string|undefined;
    try{
     do {
      const page=await env.SITES.list({prefix:"_registry/",cursor,limit:1000});
      for(const item of page.objects){
       const obj=await env.SITES.get(item.key);
       if(!obj)continue;
       try{const meta:any=await obj.json();if(meta?.ownerId===account.id)count++}catch{}
       if(count>=quota)return fail(`Your account site limit is ${quota}. Unpublish a site before creating another.`,429,corsOrigin);
      }
      cursor=page.truncated?page.cursor:undefined;
     }while(cursor);
    }catch{return fail("Could not check your account site quota. Try again.",503,corsOrigin)}
   }
   let total=0, normalized:any[]=[];
   for(const f of files){
    if(!f||typeof f.path!=="string"||!safePath(f.path)||typeof f.contentBase64!=="string") return fail("Unsafe file path or content.",400,corsOrigin);
    if(f.path.split("/").some((part:string)=>part.startsWith("."))||f.path.length>180)return fail("Hidden or unsafe paths are not allowed.",400,corsOrigin);
    let raw:string;try{raw=atob(f.contentBase64)}catch{return fail("Invalid file encoding.",400,corsOrigin)}
    const bytes=raw.length; total+=bytes;
    if(bytes>2*1024*1024)return fail("Each file must be 2 MB or smaller.",413,corsOrigin);
    normalized.push({path:f.path,raw,contentType:mime(f.path,f.contentType)});
   }
   const max=Number(env.MAX_SITE_BYTES||"10485760");
   if(total>max)return fail(`Site exceeds ${Math.round(max/1024/1024)} MB total limit.`,413,corsOrigin);
   if(!normalized.some(f=>f.path==="index.html"))return fail("Include an index.html file at the site root.",400,corsOrigin);
   // Re-publish replaces this project's own existing site. Upload first, then registry metadata.
   try{
    for(const f of normalized){
      const binary=Uint8Array.from(f.raw,(c:string)=>c.charCodeAt(0));
      await env.SITES.put(`sites/${slug}/${f.path}`,binary,{httpMetadata:{contentType:f.contentType,cacheControl:"public, max-age=300"}});
    }
    await env.SITES.put(registryKey,JSON.stringify({slug,ownerId:account.id,projectId,files:normalized.length,bytes:total,updatedAt:new Date().toISOString()}),{httpMetadata:{contentType:"application/json"}});
   }catch{return fail("Publishing storage failed. Check the R2 bucket binding.",502,corsOrigin)}
   return Response.json({ok:true,slug,url:`${url.origin}/s/${slug}/`,files:normalized.length,bytes:total},{headers:jsonHeaders(corsOrigin)});
  }
  if(request.method==="GET" && (url.pathname.startsWith("/s/") || !url.pathname.startsWith("/api/"))){
   let slug=""; let path="index.html";
   if(url.pathname.startsWith("/s/")){
    const parts=url.pathname.slice(3).split("/"); slug=parts.shift()||""; path=parts.join("/")||"index.html";
   } else {
    // Custom-domain routing works only after the hostname is attached to this Worker in Cloudflare.
    // DNS TXT verification alone is not enough; only server-side verified records are routed.
    const hostname=url.hostname.toLowerCase().replace(/\.$/,"");
    if(!hostname || hostname.includes(".workers.dev") || hostname==="localhost") return fail("Not found.",404,corsOrigin);
    const domainObj=await env.SITES.get(`_domains/${hostname}.json`);
    if(!domainObj) return fail("Not found.",404,corsOrigin);
    let domainRecord:any; try{domainRecord=await domainObj.json()}catch{return fail("Domain record is invalid.",500,corsOrigin)}
    if(domainRecord?.status!=="verified" || !safeSlug(domainRecord?.slug)) return fail("Domain is not verified.",404,corsOrigin);
    const registry=await env.SITES.get(`_registry/${domainRecord.slug}.json`);
    if(!registry) return fail("Published site not found.",404,corsOrigin);
    let siteMeta:any; try{siteMeta=await registry.json()}catch{return fail("Site registry is invalid.",500,corsOrigin)}
    if(siteMeta?.ownerId!==domainRecord.ownerId) return fail("Domain mapping is invalid.",404,corsOrigin);
    slug=domainRecord.slug; path=url.pathname.replace(/^\//,"")||"index.html";
   }
   if(!safeSlug(slug))return new Response("Not found",{status:404});
   try{path=decodeURIComponent(path)}catch{return new Response("Bad path",{status:400})}
   if(!safePath(path))return new Response("Not found",{status:404});
   const obj=await env.SITES.get(`sites/${slug}/${path}`);
   if(!obj)return new Response("Not found",{status:404,headers:{"Content-Type":"text/plain; charset=utf-8","X-Content-Type-Options":"nosniff"}});
   const h=new Headers(); obj.writeHttpMetadata(h);
   h.set("X-Content-Type-Options","nosniff"); h.set("Referrer-Policy","strict-origin-when-cross-origin");
   h.set("Content-Security-Policy","default-src 'self' data: blob: https:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
   return new Response(obj.body,{headers:h});
  }
  return fail("Not found.",404,corsOrigin);
 }
};
