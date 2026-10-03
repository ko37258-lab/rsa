// Data-driven motion-graphics overlay. Inputs (injected before load):
//   window.PLAN  – plan.json (see reference/plan_schema.md)
//   window.FMT   – '16x9' or '9x16'
//   window.META  – {dur, vy, vh}  source duration; 9:16 video box top/height
(()=>{
const PL=window.PLAN,FMT=window.FMT,META=window.META||{},V=FMT==='9x16';
const W=V?1080:1920,H=V?1920:1080;
for(const e of [document.documentElement,document.body]){e.style.width=W+'px';e.style.height=H+'px'}
const THEMES={
 'navy-gold':{gold:'#E2BC62',gold2:'#FFEDB0',goldD:'#A57C2A',panel:'rgba(9,18,40,.84)',line:'rgba(226,188,98,.8)',ink:'#1d1504',hi:'#FFE066',accent:'#c8102e',dim:'5,10,24'},
 'red':{gold:'#FF5A5F',gold2:'#FFD6D8',goldD:'#B3122E',panel:'rgba(24,8,12,.84)',line:'rgba(255,90,95,.85)',ink:'#2a0508',hi:'#FFE066',accent:'#c8102e',dim:'20,6,10'},
 'mint':{gold:'#3DDBB4',gold2:'#C9FFF0',goldD:'#138A70',panel:'rgba(6,24,28,.84)',line:'rgba(61,219,180,.85)',ink:'#04211b',hi:'#7CFFDF',accent:'#E8384F',dim:'4,18,20'},
 'blue':{gold:'#4DA3FF',gold2:'#D6EBFF',goldD:'#1F5FBF',panel:'rgba(8,16,36,.84)',line:'rgba(77,163,255,.85)',ink:'#061a33',hi:'#FFE066',accent:'#E8384F',dim:'6,12,30'}};
const th=THEMES[PL.theme]||THEMES['navy-gold'];
for(const k in th)document.documentElement.style.setProperty('--'+k,th[k]);
const $=id=>document.getElementById(id),cl=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),P=(t,a,b)=>cl((t-a)/(b-a)),Lr=(a,b,x)=>a+(b-a)*x;
const oE=x=>x>=1?1:1-Math.pow(2,-10*x),ioC=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
const oB=x=>{const c1=1.9,c3=c1+1;return x<=0?0:1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2)};
const brand=PL.brand||{},title=PL.title||{};
const vlen=s=>String(s||'').replace(/<[^>]+>/g,'').length;

// ---------- timeline ----------
let SEGS=null,ST=[],VEND,END,M,segEnd;
if(V){SEGS=PL.shorts.segments;let s=0;for(const [a,b] of SEGS){ST.push(s);s+=b-a}VEND=s;END=VEND+((PL.shorts.tail||{}).dur??1.8);
  const idx=o=>SEGS.findIndex(([a,b])=>o>=a-.01&&o<=b+.01);
  M=o=>{if(o==='end')return END;const i=idx(o);if(i<0){console.log('WARN time outside segments',o);return o>SEGS[SEGS.length-1][1]?END:0}return ST[i]+cl(o-SEGS[i][0],0,SEGS[i][1]-SEGS[i][0])};
  segEnd=o=>{const i=idx(o);return i<0?END:ST[i]+SEGS[i][1]-SEGS[i][0]};
}else{VEND=END=META.dur||1e4;M=o=>o==='end'?END:o;segEnd=o=>o+6}
const vy=META.vy||600,vh=META.vh||608,CAPY=vy+vh+102,CARDY=vy+vh+312;

// ---------- item registry ----------
const IT=[],SFX=[],FL=[],SW=[];let uid=0;
function A(t,tout,x,y,html,anim='pop',sfx=null){const d=document.createElement('div');d.className='a';d.innerHTML=html;$('L').appendChild(d);const it={t,tout,x,y,el:d,anim};IT.push(it);if(sfx){SFX.push([t,sfx]);if(sfx==='impact')FL.push(t)}return it}
const row=(ic,txt,st='')=>`<div class="row" style="${st}"><div class="ic">${ic}</div><span>${txt}</span></div>`;
const DEF16={card:[330,430],stamp:[1590,430],chip:[1590,600],row:[1660,480],quote:[960,250],counter:[960,720],cta:[1560,420],subscribe:[1540,780],text:[960,540],rows:[1620,300]};
const ANIM={card:V?'pop':null,stamp:'stamp',chip:'pop',row:V?'pop':'slideR',quote:'slam',counter:'pop',cta:V?'pop':'slideR',subscribe:'pop',text:'pop'};
const COUNTERS=[],CTAS=[],SUBS=[];

function addItem(o){
  const type=o.type||'card',t0=o.t??(o.rows&&o.rows.length?o.rows[0][0]:0),t=M(t0),tout=o.out!=null?M(o.out):segEnd(t0);
  const [x,y]=o.pos||(V?[540,CARDY]:DEF16[type]||[960,540]);
  let anim=o.anim||ANIM[type]||(x<W/2?'slideL':'slideR'),sfx=o.sfx||(['stamp','quote'].includes(type)||anim==='slam'?'impact':'pop'),html='';
  const sz=o.size;
  if(type==='card')html=`<div class="glass" style="${o.style||''}">${o.title?`<div class="ttl">${o.title}</div>`:''}${(o.lines||[]).map(l=>`<div class="sm">${l}</div>`).join('')}${o.big?`<div class="gold" style="font-weight:900;font-size:${sz||64}px;line-height:1.15">${o.big}</div>`:''}</div>`;
  else if(type==='stamp')html=`<div class="stamp" style="font-size:${sz||70}px;transform:rotate(${o.rot||0}deg)">${o.text}</div>`;
  else if(type==='chip')html=`<div class="chip" style="font-size:${sz||40}px">${o.text}</div>`;
  else if(type==='row')html=row(o.icon||'✔',o.text);
  else if(type==='quote')html=`<div class="glass" style="padding:20px 54px"><div class="sm" style="font-size:38px">${o.small||''}</div><div class="gold" style="font-size:${sz||76}px;font-weight:900">${o.big||''}</div></div>`;
  else if(type==='text')html=o.html;
  else if(type==='counter'){const id='cnt'+(uid++);html=`<div class="glass" style="padding:14px 60px"><div class="sm">${o.label||''}</div><div style="font-weight:900;font-size:${sz||100}px;line-height:1.05"><span class="gold" id="${id}">${(o.from??0).toLocaleString()}</span><span style="font-size:${Math.round((sz||100)*.54)}px">${o.unit||''}</span></div></div>`;
    const [ca,cb]=(o.count||[o.t+.4,o.t+2.2]).map(M);COUNTERS.push({id,from:o.from??0,to:o.to??0,ca,cb});SFX.push([ca,'ticks:'+(cb-ca).toFixed(2)]);SFX.push([cb,'ding'])}
  else if(type==='cta'){const id='cta'+(uid++),ph=o.phone||brand.phone||'',lab=o.title||'상담 문의',nm=o.name||brand.name||'';
    html=V?`<div class="glass" id="${id}" style="display:flex;align-items:center;gap:26px;padding:18px 44px;text-align:left"><div style="font-size:70px">☎</div><div><div class="sm" style="font-size:30px">${lab}${nm?' · '+nm:''}</div><div class="gold" style="font-size:84px;font-weight:900">${ph}</div></div></div>`
          :`<div class="glass" id="${id}" style="padding:24px 40px"><div class="ttl">${lab}</div><div style="font-size:62px">☎</div><div class="gold" style="font-size:66px;font-weight:900">${ph}</div>${nm?`<div class="sm" style="font-size:30px;margin-top:6px">${nm}</div>`:''}</div>`;CTAS.push(id)}
  else if(type==='subscribe'){const id='sub'+(uid++);html=`<div style="display:flex;gap:18px"><div id="${id}S" style="background:#FF0033;font-weight:900;font-size:40px;padding:14px 36px;border-radius:14px">구독</div><div id="${id}L" style="background:#fff;color:#111;font-weight:900;font-size:40px;padding:14px 26px;border-radius:14px">👍</div><div id="${id}B" style="background:#fff;color:#111;font-weight:900;font-size:40px;padding:14px 26px;border-radius:14px">🔔</div></div>`;
    const k=o.click!=null?M(o.click):t+2.6;const cur=A(t,tout,x,y,'<svg width="60" height="75" viewBox="0 0 24 30"><path d="M2 2 L2 24 L8 18 L12 28 L16 26 L12 17 L20 17 Z" fill="#fff" stroke="#111" stroke-width="1.6"/></svg>','none');
    SUBS.push({id,k,t,tout,x,y,cur});SFX.push([k,'click'])}
  else if(type==='rows'){
    const rows=o.rows||[],n=rows.length,end=o.out!=null?M(o.out):segEnd(rows[0][0]);
    if(V){const grid=n>3;rows.forEach(([rt,ic,tx],k)=>{const px=grid?(k%2?790:290):(n===1?540:[200,540,880][k]||540),py=grid?CARDY-50+Math.floor(k/2)*110:CARDY;A(M(rt),end,px,py,row(ic,tx,grid?'font-size:36px':''),'pop','pop')});
      if(o.title&&!grid)A(M(rows[0][0])-.2,end,540,CARDY-90,`<div class="ttl">${o.title}</div>`,'rise')}
    else{const [rx,ry]=o.pos||DEF16.rows,gap=o.gap||(n>4?90:96);if(o.title)A(M(rows[0][0])-.3,end,rx,ry,`<div class="ttl">${o.title}</div>`,'rise');
      rows.forEach(([rt,ic,tx],k)=>A(M(rt),end,rx,ry+80+k*gap,row(ic,tx),'slideR','pop'))}
    return}
  A(t,tout,x,y,html,anim,sfx);
}

// ---------- 16:9 ----------
if(!V){
  const L=PL.landscape||{},I=L.intro;
  if(I){const e=I.end||15.8,k=e/15.8,mlen=vlen(title.main);
    $('dim').style.cssText=`position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(${th.dim},.55),rgba(${th.dim},.92));opacity:0`;
    if(title.kicker)A(.2*k,e-.4,960,250,`<div style="font-weight:800;font-size:34px;letter-spacing:.5em;color:#e9dcb8">${title.kicker}</div>`,'rise','whoosh');
    A(.6*k,e-.4,960,380,`<div class="gold" style="font-weight:900;font-size:${Math.min(150,Math.floor(1750/Math.max(1,mlen)))}px;letter-spacing:-.03em">${title.main||''}</div>`,'slam','impact');
    if(title.sub)A(2.0*k,e-.4,960,530,`<div style="font-weight:900;font-size:84px">${title.sub}</div>`,'rise');
    const chips=I.chips||[],sp=chips.length>3?360:400,hasMid=I.counter||brand.phone;
    chips.forEach((c,i)=>A((3.6+.4*i)*k,hasMid?8.8*k:e-.4,960+(i-(chips.length-1)/2)*sp,680,`<div class="chip">${c}</div>`,'pop','pop'));
    if(I.stamp)A(6.2*k,hasMid?8.8*k:e-.4,960,820,`<div class="stamp">${I.stamp}</div>`,'stamp','impact');
    let pt=9.2*k;
    if(I.counter){const c=I.counter;addItem({type:'counter',t:9.2*k,out:12.6*k,pos:[960,720],label:c.label,from:c.from,to:c.to,unit:c.unit,count:[9.8*k,11.6*k],size:110});pt=12.8*k}
    if(brand.phone)A(pt,e-.4,960,760,`<div class="glass" style="display:flex;align-items:center;gap:26px;padding:22px 48px;text-align:left"><div style="font-size:64px">☎</div><div><div class="sm" style="font-size:32px">상담 문의${brand.name?' · '+brand.name:''}</div><div class="gold" style="font-size:76px;font-weight:900">${brand.phone}</div></div></div>`,'pop','pop');
    SW.push([1.2*k,2.2*k],[e-2.6,e-1.6]);SFX.push([e-.2,'whoosh']);
    window.__dimEnd=e;
  }
  (L.chapters||[]).forEach(([a,b,s])=>A(a,b,960,62,`<div style="font-weight:800;font-size:30px;padding:8px 26px;border-radius:999px;background:var(--panel);border:2px solid var(--line);color:var(--gold2)">${s}</div>`,'drop','whoosh'));
  (L.items||[]).forEach(addItem);
  $('flash').style.cssText='position:absolute;inset:0;background:#fff3cc;opacity:0;mix-blend-mode:screen';
  $('sweep').style.cssText+=';top:-10%;height:120%';
}
// ---------- 9:16 ----------
else{
  const S=PL.shorts,mlen=vlen(title.main),slen=vlen(title.sub);
  $('BG').innerHTML=`<div style="position:absolute;left:0;top:0;width:1080px;height:${vy}px;background:linear-gradient(180deg,rgba(${th.dim},.9),rgba(${th.dim},.7) 70%,rgba(${th.dim},.35))"></div>
   <div style="position:absolute;left:0;top:${vy+vh}px;width:1080px;height:${H-vy-vh}px;background:linear-gradient(0deg,rgba(${th.dim},.92),rgba(${th.dim},.72) 60%,rgba(${th.dim},.45))"></div>
   <div class="ln" style="top:${vy-2}px;width:1080px"></div><div class="ln" style="top:${vy+vh-2}px;width:1080px"></div>`;
  $('flash').style.cssText=`position:absolute;left:0;top:${vy}px;width:1080px;height:${vh}px;background:#fff6dc;opacity:0`;
  $('dim').style.cssText=`position:absolute;left:0;top:${vy}px;width:1080px;height:${vh}px;background:rgba(${th.dim},.72);opacity:0`;
  $('sweep').style.cssText+=`;height:${vy}px`;
  if(brand.name||brand.phone)A(0,END,540,46,`<div style="font-weight:800;font-size:26px;color:#e9dcb8;letter-spacing:.06em">${[brand.name,brand.phone&&'☎ '+brand.phone].filter(Boolean).join(' · ')}</div>`,'rise');
  if(title.kicker)A(.1,END,540,130,`<div style="font-weight:800;font-size:30px;letter-spacing:.45em;color:#e9dcb8">${title.kicker}</div>`,'rise');
  A(.25,END,540,238,`<div class="gold" style="font-weight:900;font-size:${Math.min(112,Math.floor(1000/Math.max(1,mlen)))}px;letter-spacing:-.03em">${title.main||''}</div>`,'slam','impact');
  if(title.sub)A(.6,END,540,352,`<div style="font-weight:900;font-size:${Math.min(72,Math.floor(1000/Math.max(1,slen)))}px">${title.sub}</div>`,'rise');
  (S.chapters||[]).forEach((s,i)=>{if(s&&i<ST.length)A(ST[i]+.15,(i+1<ST.length?ST[i+1]:END)-.05,540,vy-112,`<div class="chip" style="font-size:42px">${s}</div>`,'drop')});
  (S.captions||[]).forEach(([a,b,s])=>A(M(a),M(b)-.02,540,CAPY,`<div class="cap">${s}</div>`,'cap'));
  (S.items||[]).forEach(addItem);
  const tl=S.tail||{};
  if((tl.dur??1.8)>0){A(VEND+.05,END,540,vy+230,`<div class="chip" style="font-size:52px;background:linear-gradient(135deg,#fff,var(--gold2))">${tl.text||'구독 · 좋아요 부탁드려요!'}</div>`,'slam','impact');
    A(VEND+.4,END,540,vy+390,'<div style="display:flex;gap:18px"><div style="background:#FF0033;font-weight:900;font-size:44px;padding:14px 38px;border-radius:14px">구독</div><div style="background:#fff;color:#111;font-weight:900;font-size:44px;padding:14px 28px;border-radius:14px">👍 좋아요</div></div>','pop','pop')}
  ST.slice(1).forEach(s=>{FL.push(s);SFX.push([s,'whoosh'])});
  ST.forEach((s,i)=>{if(i%2===0)SW.push([s+.3,s+1.2])});
}

function T(it,x,y,s,o,b=0){const d=it.el;d.style.display=o>0.003?'block':'none';d.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%) scale(${s})`;d.style.opacity=o;d.style.filter=b>.3?`blur(${b}px)`:'none'}
function frame(t){
  if(window.__dimEnd)$('dim').style.opacity=t<window.__dimEnd?.82*cl(t/0.4)*(1-P(t,window.__dimEnd-.5,window.__dimEnd)):0;
  if(V)$('dim').style.opacity=P(t,VEND,VEND+.4);
  for(const it of IT){
    if(t<it.t-0.05||t>it.tout+0.5){it.el.style.display='none';continue}
    const p=t-it.t;let out=1-P(t,it.tout,it.tout+.3),x=it.x,y=it.y,s=1,o=1,b=0;
    if(it.anim==='pop'){const q=P(p,0,.4);s=oB(q);o=cl(q*4)}
    else if(it.anim==='rise'){const q=oE(P(p,0,.6));y+=Lr(40,0,q);o=q;b=Lr(8,0,q)}
    else if(it.anim==='slam'){const q=oE(P(p,0,.35));s=Lr(2.0,1,q);o=cl(q*4);b=Lr(16,0,q)}
    else if(it.anim==='stamp'){const q=oE(P(p,0,.25));s=Lr(2.6,1,q);o=cl(q*5);b=Lr(12,0,q)}
    else if(it.anim==='slideR'){const q=oE(P(p,0,.55));x+=Lr(420,0,q);o=q}
    else if(it.anim==='slideL'){const q=oE(P(p,0,.55));x+=Lr(-420,0,q);o=q}
    else if(it.anim==='drop'){const q=oE(P(p,0,.45));y+=Lr(-50,0,q);o=q}
    else if(it.anim==='cap'){const q=oE(P(p,0,.22));s=Lr(.85,1,q);o=q;out=1-P(t,it.tout-.06,it.tout)}
    else if(it.anim==='none'){o=1}
    T(it,x,y,s,o*out,b);
  }
  document.querySelectorAll('.gold').forEach(g=>g.style.backgroundPosition=`${(t*45)%200}% 0`);
  for(const c of COUNTERS){const e=$(c.id);if(!e)continue;e.textContent=Math.round(Lr(c.from,c.to,ioC(P(t,c.ca,c.cb)))).toLocaleString();e.parentNode.parentNode.style.transform=`scale(${t>c.cb?1+.12*Math.exp(-(t-c.cb)*6):1})`}
  for(const id of CTAS){const e=$(id);if(e)e.style.boxShadow=`0 0 ${20+30*Math.abs(Math.sin(t*3))}px ${th.line}`}
  for(const u of SUBS){const k=u.k,q=ioC(P(t,u.t+.6,k));T(u.cur,Lr(u.x-40,u.x-65,q),Lr(u.y+120,u.y+10,q),t>k&&t<k+.15?.8:1,(t>u.t+.6&&t<u.tout)?1:0);
    const bS=$(u.id+'S');if(bS){bS.textContent=t>k?'구독중 ✓':'구독';bS.style.background=t>k?'#555':'#FF0033';bS.style.transform=`scale(${t>k?1+.15*Math.exp(-(t-k)*8):1})`;
    $(u.id+'L').style.transform=`scale(${t>k+.5?1+.3*Math.exp(-(t-k-.5)*6):1})`;$(u.id+'B').style.transform=`rotate(${t>k+1?Math.sin((t-k-1)*30)*18*Math.exp(-(t-k-1)*3):0}deg)`}}
  let sw=0,sx=0;SW.forEach(([a,b])=>{if(t>=a&&t<=b){sw=1;sx=Lr(-400,W+300,ioC(P(t,a,b)))}});$('sweep').style.opacity=sw*.8;$('sweep').style.left=sx+'px';
  let f=0;FL.forEach(s=>{const d=t-s;if(d>=0&&d<.24)f=Math.max(f,(1-d/.24)*(V?.55:.35))});$('flash').style.opacity=f;
}
window.frame=frame;
window.INFO={END,VEND,ST,SEGS,SFX:SFX.filter(([t])=>t>=0&&t<=END+.5).sort((a,b)=>a[0]-b[0])};
})();
