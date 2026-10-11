/* DEEPLO 4.2 — animation layer. Cosmetic only; never touches app logic or data. */
(function(){
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const root=document.documentElement;

 /* 1. Particle-network background */
 function network(){
  const c=document.createElement('canvas');c.id='fxCanvas';c.setAttribute('aria-hidden','true');document.body.prepend(c);
  const ctx=c.getContext('2d');let W,H,dpr,pts=[],mouse={x:-999,y:-999},raf;
  function size(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;c.width=W*dpr;c.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
   const n=Math.max(28,Math.min(90,Math.floor(W*H/17000)));
   pts=Array.from({length:n},()=>({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.35,vy:(Math.random()-.5)*.35,r:Math.random()*1.6+.6}))}
  function frame(){
   ctx.clearRect(0,0,W,H);const L=125;
   for(let i=0;i<pts.length;i++){const p=pts[i];p.x+=p.vx;p.y+=p.vy;
    if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;
    const dx=p.x-mouse.x,dy=p.y-mouse.y,d=Math.hypot(dx,dy);
    if(d<110){p.x+=dx/d*.9;p.y+=dy/d*.9}
    ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.283);ctx.fillStyle='rgba(73,233,138,.8)';ctx.fill();
    for(let j=i+1;j<pts.length;j++){const q=pts[j],dist=Math.hypot(p.x-q.x,p.y-q.y);
     if(dist<L){ctx.strokeStyle='rgba(53,216,121,'+(.22*(1-dist/L)).toFixed(3)+')';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke()}}}
   raf=requestAnimationFrame(frame)}
  addEventListener('resize',size);
  addEventListener('pointermove',e=>{mouse.x=e.clientX;mouse.y=e.clientY},{passive:true});
  addEventListener('pointerleave',()=>{mouse.x=mouse.y=-999});
  document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(raf);if(!document.hidden)frame()});
  size();frame();
 }

 /* 2. Scroll reveal */
 function reveal(){
  const sel='.welcome,.section-title,.stat-card,.tool-card,.panel,.security-grid article,.project-card,.hero,.grid>*,.help-card';
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.08,rootMargin:'0px 0px -30px 0px'});
  const seen=new WeakSet();
  function scan(){document.querySelectorAll(sel).forEach((el,i)=>{if(seen.has(el))return;seen.add(el);
   el.classList.add('rv');el.style.setProperty('--d',Math.min(i%6,5)*70+'ms');io.observe(el)})}
  root.classList.add('js-anim');scan();
  /* pick up cards the app renders later (projects, domains, sites) */
  new MutationObserver(()=>scan()).observe(document.body,{childList:true,subtree:true});
 }

 /* 3. Cursor glow on cards + button ripple */
 function interactions(){
  document.addEventListener('pointermove',e=>{const t=e.target.closest&&e.target.closest('.tool-card,.stat-card,.panel,.security-grid article,.project-card');
   if(!t)return;t.classList.add('fx-glow');const r=t.getBoundingClientRect();t.style.setProperty('--mx',e.clientX-r.left+'px');t.style.setProperty('--my',e.clientY-r.top+'px')},{passive:true});
  document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('.btn');if(!b)return;
   const r=b.getBoundingClientRect(),s=Math.max(r.width,r.height),sp=document.createElement('span');
   sp.className='fx-ripple';sp.style.cssText='width:'+s+'px;height:'+s+'px;left:'+(e.clientX-r.left-s/2)+'px;top:'+(e.clientY-r.top-s/2)+'px';
   b.appendChild(sp);setTimeout(()=>sp.remove(),650)});
 }

 /* 4. Intro: typed tagline + auto-open after a moment (button still works) */
 function intro(){
  const el=document.getElementById('intro');if(!el)return;
  const p=el.querySelector('p');if(p){const txt=p.textContent;p.textContent='';p.classList.add('typing');let i=0;
   const t=setInterval(()=>{p.textContent=txt.slice(0,++i);if(i>=txt.length){clearInterval(t);p.classList.remove('typing')}},45)}
  setTimeout(()=>{if(!el.classList.contains('hide')){const b=document.getElementById('skipIntro');b?b.click():el.classList.add('hide')}},3200);
 }

 function start(){if(reduce)return;network();reveal();interactions();intro()}
 document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start):start();
})();
