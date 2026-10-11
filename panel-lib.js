/* Shared helpers for admin / editor / report pages. Uses the Supabase session + Worker URL saved by the dashboard. */
window.DL={
 cfg(){try{return JSON.parse(localStorage.getItem('deeplo2_config')||'{}')}catch{return{}}},
 api(){return (localStorage.getItem('deeplo2_api')||(window.DEEPLO_PUBLIC&&window.DEEPLO_PUBLIC.api)||'').replace(/\/+$/,'')},
 esc:s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 say(el,m,bad){el.textContent=m;el.style.color=bad?'#ff8a8a':'#49e98a'},
 async token(){const c=this.cfg();if(!c.url||!c.key||!window.supabase)throw new Error('Connect Supabase on the dashboard first.');
  const {data}=await window.supabase.createClient(c.url,c.key).auth.getSession();if(!data.session)throw new Error('Sign in on the dashboard first.');return data.session.access_token},
 async call(path,opt={}){if(!this.api())throw new Error('Save your Worker API URL in dashboard Settings first.');const t=await this.token();
  const r=await fetch(this.api()+path,{...opt,headers:{'Content-Type':'application/json',Authorization:'Bearer '+t,...(opt.headers||{})}});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('Request failed ('+r.status+')'));return d}
};
