/* Carrier Companion — site behavior. Built by hand at Champion Digital Media. */
(function(){
  const nav=document.querySelector('.nav');
  const toggle=document.querySelector('.nav-toggle');
  if(toggle){toggle.addEventListener('click',()=>{nav.classList.toggle('open');toggle.setAttribute('aria-expanded',nav.classList.contains('open'));});}
  const onScroll=()=>{if(!nav)return;nav.classList.toggle('is-scrolled',window.scrollY>8);};
  onScroll();window.addEventListener('scroll',onScroll,{passive:true});


  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Product moments: each plays its moment from the film once, as it scrolls into view, then rests on the finished frame
  const moments=document.querySelectorAll('video.moment');
  if(!reduce&&'IntersectionObserver' in window){
    const mo=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;const v=e.target;mo.unobserve(v);const p=v.play();if(p)p.catch(()=>{}); /* if playback is blocked the finished-frame poster stays */}),{threshold:.6});
    moments.forEach(v=>mo.observe(v));
  }

  // Call-to-action loop: only runs while on screen, never for reduced motion
  document.querySelectorAll('.cta-bg').forEach(v=>{
    if(reduce){v.removeAttribute('autoplay');v.pause();return;}
    if('IntersectionObserver' in window){new IntersectionObserver(([e])=>{if(e.isIntersecting){const p=v.play();if(p)p.catch(()=>{});}else v.pause();}).observe(v);}
  });

  // Film theater: custom play, native controls once playing
  document.querySelectorAll('[data-theater]').forEach(t=>{
    const v=t.querySelector('video'),b=t.querySelector('.theater-play');
    b.addEventListener('click',()=>{v.controls=true;t.classList.add('playing');const p=v.play();if(p)p.catch(()=>{});});
    v.addEventListener('ended',()=>{t.classList.remove('playing');v.controls=false;v.load();});
  });

  // No widows: keep the last two words of headings and paragraphs together
  const glue=el=>{const tw=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const ns=[];let n;while((n=tw.nextNode()))ns.push(n);
    for(let i=ns.length-1;i>=0;i--){const t=ns[i].nodeValue;if(!/\S/.test(t))continue;const m=t.match(/^([\s\S]*\S)\s+(\S+\s*)$/);
      if(m){ns[i].nodeValue=m[1]+'\u00a0'+m[2];return;}
      for(let j=i-1;j>=0;j--){if(/\s$/.test(ns[j].nodeValue)){ns[j].nodeValue=ns[j].nodeValue.replace(/\s+$/,'\u00a0');return;}if(/\S/.test(ns[j].nodeValue))return;}
      return;}};
  document.querySelectorAll('h1,h2,h3,p,.faq .a,.person figcaption span').forEach(glue);

  // Reveal on scroll
  const els=document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){
    const io=new IntersectionObserver((entries)=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{rootMargin:'0px 0px -10% 0px',threshold:.1});
    els.forEach(el=>io.observe(el));
  }else{els.forEach(el=>el.classList.add('in'));}

  // FAQ: only one open at a time
  const faqs=document.querySelectorAll('.faq details');
  faqs.forEach(d=>d.addEventListener('toggle',()=>{if(d.open)faqs.forEach(o=>{if(o!==d)o.open=false;});}));

  // Demo form: posts to the Apps Script web app in apps-script/Code.gs, which appends a row to the Google Sheet.
  const DEMO_ENDPOINT='';
  const form=document.querySelector('#demo-form');
  if(form){
    const note=document.querySelector('#form-note'),btn=form.querySelector('button[type=submit]'),label=btn.innerHTML;
    form.addEventListener('submit',async(e)=>{
      e.preventDefault();
      note.className='form-note';note.textContent='';
      if(!form.reportValidity())return;
      if(!DEMO_ENDPOINT){note.className='form-note error';note.textContent='The form is not connected yet. Call us at +1 (888) 232-0075.';return;}
      const data=new URLSearchParams(new FormData(form));
      data.set('page_url',location.href);
      btn.disabled=true;btn.textContent='Sending...';
      try{
        // Apps Script doesn't send CORS headers, so the response can't be read; a network error still throws.
        await fetch(DEMO_ENDPOINT,{method:'POST',mode:'no-cors',body:data});
        form.style.display='none';document.querySelector('#form-done').classList.add('show');
        window.scrollTo({top:form.getBoundingClientRect().top+window.scrollY-120,behavior:'smooth'});
      }catch(err){
        note.className='form-note error';note.textContent='Something went wrong. Please try again, or call +1 (888) 232-0075.';
      }finally{btn.disabled=false;btn.innerHTML=label;}
    });
  }
})();
