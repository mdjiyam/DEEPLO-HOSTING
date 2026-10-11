/* DEEPLO 4.2 — publish from a .zip. Unzips in the browser, then feeds the existing folder-publish flow. */
(function(){
 const zipEl=document.getElementById('publishZip'),folderEl=document.getElementById('publishFiles');
 if(!zipEl||!folderEl)return;
 const info=document.getElementById('publishFileNames');
 const OK=/\.(html?|css|m?js|json|txt|svg|png|jpe?g|webp|gif|ico|woff2?)$/i;
 const MAX_FILES=100,MAX_FILE=2*1024*1024,MAX_TOTAL=10*1024*1024;
 const say=m=>{if(info)info.textContent=m};
 zipEl.addEventListener('change',async()=>{
  const f=zipEl.files&&zipEl.files[0];if(!f)return;
  if(typeof JSZip==='undefined')return say('ZIP library failed to load. Check your connection and try again.');
  if(f.size>MAX_TOTAL*2)return say('ZIP is too large.');
  try{
   say('Reading ZIP…');
   const zip=await JSZip.loadAsync(f);
   let entries=Object.values(zip.files).filter(e=>!e.dir&&!/(^|\/)(__MACOSX|\.)/.test(e.name)&&!e.name.split('/').some(p=>p.startsWith('.')));
   if(!entries.length)return say('ZIP is empty.');
   /* strip a single wrapping folder so index.html ends up at the site root */
   const tops=new Set(entries.map(e=>e.name.split('/')[0]));
   const strip=tops.size===1&&entries.every(e=>e.name.includes('/'))?1:0;
   const out=[];let total=0;
   for(const e of entries){
    const path=e.name.split('/').slice(strip).join('/');
    if(!path||path.split('/').some(p=>!p||p==='..'))return say('Unsafe path in ZIP: '+e.name);
    if(!OK.test(path))continue; /* skip unsupported types silently; reported below */
    const blob=await e.async('blob');
    if(blob.size>MAX_FILE)return say('"'+path+'" is over 2 MB.');
    total+=blob.size;if(total>MAX_TOTAL)return say('Site exceeds 10 MB.');
    const file=new File([blob],path.split('/').pop(),{type:blob.type});
    /* app.js drops the first path segment, so add a dummy root folder */
    Object.defineProperty(file,'webkitRelativePath',{value:'site/'+path});
    out.push(file);
   }
   if(out.length>MAX_FILES)return say('Too many files (max '+MAX_FILES+').');
   if(!out.some(x=>x.webkitRelativePath==='site/index.html'))return say('ZIP must contain index.html at its root.');
   const dt=new DataTransfer();out.forEach(x=>dt.items.add(x));
   folderEl.files=dt.files;
   say('ZIP ready: '+out.length+' file(s) · '+(total/1024/1024).toFixed(2)+' MB. Now press Publish website.'+(entries.length>out.length?' ('+(entries.length-out.length)+' unsupported file(s) skipped)':''));
  }catch(err){say('Could not read ZIP: '+(err&&err.message||'invalid file'))}
 });
})();
