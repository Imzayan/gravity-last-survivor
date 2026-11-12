/* ============================================================
   GRAVITY: LAST SURVIVOR — game.js
   موتور بازی Roguelike Survival آفلاین | Vanilla JS + Canvas 2D
   نسخه 1.0.0 | هدف: Android WebView 7+ و مرورگرهای مدرن
   ------------------------------------------------------------
   فهرست بخش‌ها:
     ۱) هسته: ابزارها، تنظیمات تعادل، ذخیره‌سازی، صدا، داستان
     ۲) نهادها: بوم، ورودی، دوربین، ذرات، گلوله‌ها، بازیکن
     ۳) دشمنان: ۱۰ نوع با هوش مصنوعی متمایز
     ۴) باس‌ها: ۵ باس چندفازی
     ۵) گیم‌پلی: Director رویه‌ای، رویدادها، مهارت‌ها، ارتقا
     ۶) متا: درخت حافظه، فروشگاه، اسکین، مأموریت، دستاورد، تبلیغ
     ۷) رابط کاربری: همه صفحه‌ها و HUD
     ۸) حلقه اصلی: رندر، مرگ سینمایی، راه‌اندازی
   ============================================================ */
(function(){
'use strict';

/* ════════════════ ۱) هسته ════════════════ */

var VERSION=(typeof window.__GV==='string'&&window.__GV)?window.__GV:'1.5.0';
var SAVE_KEY='gravity_last_survivor_save';
var SNAP_KEY='gravity_last_survivor_snapshot';
var TAU=Math.PI*2;
var WORLD_R=1150;              // شعاع میدان گرانشی (محدوده مبارزه)

/* وضعیت سراسری */
var cvs=null,ctx=null,W=0,H=0,DPR=1;
var state='boot';              // boot|menu|playing|paused|levelup|dead|over|ending
var profile=null;              // پیشرفت دائمی
var run=null;                  // وضعیت دور جاری
var player=null,boss=null;
var cam={x:0,y:0,shake:0};
var enemies=[],bullets=[],ebullets=[],parts=[],gems=[],coins=[],hearts=[],floats=[];
var zones=[],meteors=[],lasers=[],trail=[],orbs=[],obstacles=[],pendingBooms=[];
var adOpen=false;
var frameT=0;

/* ─── ابزارهای پایه ─── */
function $(id){return document.getElementById(id);}
var FA_D=['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
function faNum(n){
  var s=String(n),o='';
  for(var i=0;i<s.length;i++){var c=s.charAt(i);o+=(c>='0'&&c<='9')?FA_D[+c]:c;}
  return o;
}
function faGroup(n){return faNum(String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g,'،'));}
function fmtTime(sec){
  var m=Math.floor(sec/60),s=Math.floor(sec%60);
  return (m<10?'0':'')+m+':'+(s<10?'0':'')+s;
}
function faTime(sec){return faNum(fmtTime(sec));}
function rand(a,b){return a+Math.random()*(b-a);}
function randi(a,b){return Math.floor(rand(a,b+1));}
function pick(arr){return arr[(Math.random()*arr.length)|0];}
function chance(p){return Math.random()<p;}
function clamp(v,a,b){return v<a?a:(v>b?b:v);}
function lerp(a,b,t){return a+(b-a)*t;}
function d2(ax,ay,bx,by){var dx=bx-ax,dy=by-ay;return dx*dx+dy*dy;}
function dist(ax,ay,bx,by){return Math.sqrt(d2(ax,ay,bx,by));}
function nrm(x,y){var l=Math.sqrt(x*x+y*y)||1;return {x:x/l,y:y/l};}
function angTo(ax,ay,bx,by){return Math.atan2(by-ay,bx-ax);}
function angDiff(a,b){var d=(a-b)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d;}
function mulberry32(seed){
  var a=seed>>>0;
  return function(){
    a|=0;a=(a+0x6D2B79F5)|0;
    var t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
/* مولد تصادفی وابسته به Seed هر دور (تولید رویه‌ای واقعی) */
var runRng=Math.random;
function sr(a,b){return a+runRng()*(b-a);}
function sPick(arr){return arr[(runRng()*arr.length)|0];}
function sChance(p){return runRng()<p;}

function hexA(hex,a){
  var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return 'rgba('+r+','+g+','+b+','+a+')';
}

/* ─── تنظیمات تعادل بازی ─── */
var CFG={
  player:{hp:100,speed:235,r:13,rate:2.4,dmg:10,bspd:540,range:400,pickup:70,
          crit:0.05,critMul:2,dashSpd:950,dashDur:0.22,dashCd:2.6},
  xpBase:12,xpPow:1.35,
  spawnStart:1.15,spawnMin:0.24,spawnRamp:0.0011,
  hpRamp:0.0078,dmgRamp:0.0009,spdRamp:0.00028,
  maxEnemies:64,maxBullets:180,maxEB:150,
  bossTimes:[120,300,480,660,840],bossEvery:200,
  eventFirst:70,eventGapMin:50,eventGapMax:75,
  eliteChance:0.045,eliteFrom:150,
  coinChance:0.08,
  scoreKill:12,scoreTime:2,scoreBoss:300,scoreLevel:15,
  reviveMax:2,
  partCap:[150,350,700],
  gemLife:26,coinLife:22,heartLife:20
};

/* ─── حافظه‌ی glow (اسپرایت‌های پیش‌ساخته برای عملکرد) ─── */
var glowCache={};
function glowSprite(col,r){
  r=Math.round(r);
  var key=col+'_'+r;
  if(glowCache[key])return glowCache[key];
  var s=r*2,c=document.createElement('canvas');c.width=s;c.height=s;
  var g=c.getContext('2d');
  var gr=g.createRadialGradient(r,r,0,r,r,r);
  gr.addColorStop(0,hexA(col,0.55));
  gr.addColorStop(0.45,hexA(col,0.18));
  gr.addColorStop(1,hexA(col,0));
  g.fillStyle=gr;g.fillRect(0,0,s,s);
  glowCache[key]=c;
  return c;
}
function drawGlow(x,y,col,r,alpha){
  var s=glowSprite(col,r);
  ctx.globalAlpha=alpha===undefined?1:alpha;
  ctx.drawImage(s,x-r,y-r);
  ctx.globalAlpha=1;
}

/* ════════════════ ذخیره‌سازی (نسخه‌بندی + اعتبارسنجی) ════════════════ */

function defaultProfile(){
  return {
    v:3,
    coins:150,shards:0,
    best:{score:0,time:0,kills:0,level:0},
    totals:{kills:0,boss:0,runs:0,time:0,deaths:0,dash:0,coins:0,xp:0,expl:0,energy:0,
            crystals:0,elites:0,revives:0,buys:0,tree:0,sniper:0,achN:0,bossTitan:0,bossMemory:0,cleanBoss:0},
    skins:{owned:['nova'],eq:'nova'},
    fx:{owned:['plasma'],eq:'plasma'},
    tree:{},
    missions:{day:-1,daily:[],prog:{},claimed:{}},
    ach:{unlocked:{},prog:{}},
    inv:{revive:0,shield:0,xp2:0,coin2:0},
    spec:{},
    set:{music:true,sfx:true,vib:true,quality:1,lang:'fa'},
    tutorial:false,
    sawIntro:false,
    snapshot:null
  };
}
function sanNum(v,min,max,d){
  v=+v;
  if(!isFinite(v))v=d;
  return Math.floor(clamp(v,min,max));
}
function sanObj(v){return (v&&typeof v==='object'&&!Array.isArray(v))?v:{};}
/* اعتبارسنجی کامل در زمان بارگذاری — هر خرابی به پیش‌فرض امن برمی‌گردد */
function validateProfile(p){
  var d=defaultProfile();
  if(!p||typeof p!=='object')return d;
  d.coins=sanNum(p.coins,0,1e9,d.coins);
  d.shards=sanNum(p.shards,0,1e6,d.shards);
  if(p.best&&typeof p.best==='object'){
    d.best.score=sanNum(p.best.score,0,1e9,0);
    d.best.time=sanNum(p.best.time,0,86400,0);
    d.best.kills=sanNum(p.best.kills,0,1e8,0);
    d.best.level=sanNum(p.best.level,0,200,0);
  }
  if(p.totals&&typeof p.totals==='object'){
    for(var k in d.totals)d.totals[k]=sanNum(p.totals[k],0,1e9,0);
  }
  if(p.skins&&Array.isArray(p.skins.owned)&&p.skins.owned.length){
    d.skins.owned=p.skins.owned.filter(function(x){return typeof x==='string';});
    if(d.skins.owned.indexOf('nova')<0)d.skins.owned.push('nova');
    d.skins.eq=(typeof p.skins.eq==='string')?p.skins.eq:'nova';
  }
  if(p.fx&&Array.isArray(p.fx.owned)&&p.fx.owned.length){
    d.fx.owned=p.fx.owned.filter(function(x){return typeof x==='string';});
    if(d.fx.owned.indexOf('plasma')<0)d.fx.owned.push('plasma');
    d.fx.eq=(typeof p.fx.eq==='string')?p.fx.eq:'plasma';
  }
  var t=sanObj(p.tree);for(var tk in t)d.tree[tk]=sanNum(t[tk],0,5,0);
  d.sawIntro=!!p.sawIntro;
  var m=sanObj(p.missions);
  d.missions.day=sanNum(m.day,-1,1e9,-1);
  if(Array.isArray(m.daily))d.missions.daily=m.daily.filter(function(x){return typeof x==='string';});
  var mp=sanObj(m.prog);for(var mk in mp)d.missions.prog[mk]=sanNum(mp[mk],0,1e9,0);
  var mc=sanObj(m.claimed);for(var ck in mc)d.missions.claimed[ck]=1;
  var a=sanObj(p.ach),au=sanObj(a.unlocked),ap=sanObj(a.prog);
  for(var uk in au)d.ach.unlocked[uk]=1;
  for(var pk in ap)d.ach.prog[pk]=sanNum(ap[pk],0,1e9,0);
  var iv=sanObj(p.inv);
  d.inv.revive=sanNum(iv.revive,0,9,0);d.inv.shield=sanNum(iv.shield,0,9,0);
  d.inv.xp2=sanNum(iv.xp2,0,9,0);d.inv.coin2=sanNum(iv.coin2,0,9,0);
  var sp=sanObj(p.spec);for(var sk in sp)d.spec[sk]=1;
  if(p.set&&typeof p.set==='object'){
    d.set.music=p.set.music!==false;
    d.set.sfx=p.set.sfx!==false;
    d.set.vib=p.set.vib!==false;
    d.set.quality=clamp(sanNum(p.set.quality,0,2,1),0,2);
    d.set.lang='fa';
  }
  d.tutorial=p.tutorial===true;
  if(p.snapshot&&typeof p.snapshot==='object'&&sanNum(p.snapshot.t,0,86400,0)>15)d.snapshot=p.snapshot;
  return d;
}
function saveGame(){
  try{
    localStorage.setItem(SAVE_KEY,JSON.stringify(profile));
    /* پل ذخیره‌سازی اندروید (پشتیبان خارج از WebView) */
    if(window.AndroidBridge&&window.AndroidBridge.saveData){
      try{window.AndroidBridge.saveData(JSON.stringify(profile));}catch(e){}
    }
  }catch(e){/* حالت خصوصی مرورگر: بی‌صدا ادامه */}
}
function loadGame(){
  var raw=null;
  try{raw=localStorage.getItem(SAVE_KEY);}catch(e){}
  if(!raw&&window.AndroidBridge&&window.AndroidBridge.loadData){
    try{raw=window.AndroidBridge.loadData();}catch(e){}
  }
  if(!raw)return defaultProfile();
  try{return validateProfile(JSON.parse(raw));}catch(e){return defaultProfile();}
}
function resetGame(){
  try{localStorage.removeItem(SAVE_KEY);localStorage.removeItem(SNAP_KEY);}catch(e){}
  profile=defaultProfile();
  saveGame();
}
function snapshotRun(){
  if(!run||state==='menu')return;
  profile.snapshot={
    t:Math.floor(run.t),level:run.level,xp:run.xp,xpNext:run.xpNext,
    score:run.score,kills:run.kills,bossKills:run.bossKills,
    skills:run.skills,combos:run.combos,coinsGot:run.coinsGot
  };
  try{localStorage.setItem(SNAP_KEY,'1');}catch(e){}
  saveGame();
}
function clearSnapshot(){
  profile.snapshot=null;
  try{localStorage.removeItem(SNAP_KEY);}catch(e){}
  saveGame();
}

/* ════════════════ صدا (Web Audio — کاملاً رویه‌ای) ════════════════ */

var AudioSys=(function(){
  var ac=null,master=null,sfxG=null,musG=null,started=false;
  var musicOn=true,sfxOn=true;
  var musTimer=null,nextNote=0,step=0;
  var MUS_ROOT=1;
  var noiseBuf=null;
  var chordProg=[110,87.31,130.81,98]; /* Am F C G — ریشه‌ها */

  function init(){
    if(started)return;
    try{
      var AC=window.AudioContext||window.webkitAudioContext;
      if(!AC)return;
      ac=new AC();
      master=ac.createGain();master.gain.value=0.9;master.connect(ac.destination);
      sfxG=ac.createGain();sfxG.connect(master);
      musG=ac.createGain();musG.gain.value=0.4;musG.connect(master);
      started=true;
      applySettings();
      nextNote=ac.currentTime+0.1;
      musTimer=setInterval(scheduler,60);
    }catch(e){}
  }
  function resume(){if(ac&&ac.state==='suspended'){try{ac.resume();}catch(e){}}}
  function suspend(){if(ac&&ac.state==='running'){try{ac.suspend();}catch(e){}}}
  function applySettings(){
    if(!profile)return;
    musicOn=!!profile.set.music;
    sfxOn=!!profile.set.sfx;
    if(musG)musG.gain.value=musicOn?(state==='playing'?0.42:0.3):0;
    if(sfxG)sfxG.gain.value=sfxOn?1:0;
  }
  function tone(f,dur,type,vol,slideTo,delay){
    if(!ac||!sfxOn)return;
    try{
      var t0=ac.currentTime+(delay||0);
      var o=ac.createOscillator(),g=ac.createGain();
      o.type=type||'sine';
      o.frequency.setValueAtTime(Math.max(20,f),t0);
      if(slideTo)o.frequency.exponentialRampToValueAtTime(Math.max(25,slideTo),t0+dur);
      g.gain.setValueAtTime(vol||0.15,t0);
      g.gain.exponentialRampToValueAtTime(0.001,t0+dur);
      o.connect(g);g.connect(sfxG);
      o.start(t0);o.stop(t0+dur+0.03);
    }catch(e){}
  }
  function noiz(dur,vol,fLow){
    if(!ac||!sfxOn)return;
    try{
      if(!noiseBuf){
        noiseBuf=ac.createBuffer(1,Math.floor(ac.sampleRate*0.5),ac.sampleRate);
        var d=noiseBuf.getChannelData(0);
        for(var i=0;i<d.length;i++)d[i]=Math.random()*2-1;
      }
      var t0=ac.currentTime;
      var src=ac.createBufferSource();src.buffer=noiseBuf;src.loop=true;
      var g=ac.createGain();g.gain.setValueAtTime(vol,t0);
      g.gain.exponentialRampToValueAtTime(0.001,t0+dur);
      var f=ac.createBiquadFilter();f.type='lowpass';f.frequency.value=fLow||1200;
      src.connect(f);f.connect(g);g.connect(sfxG);
      src.start(t0);src.stop(t0+dur+0.03);
    }catch(e){}
  }
  function mtone(f,dur,type,vol,t0,slideTo){
    try{
      var o=ac.createOscillator(),g=ac.createGain();
      o.type=type;o.frequency.setValueAtTime(f,t0);
      if(slideTo)o.frequency.exponentialRampToValueAtTime(Math.max(25,slideTo),t0+dur);
      g.gain.setValueAtTime(0.0001,t0);
      g.gain.linearRampToValueAtTime(vol,t0+0.02);
      g.gain.exponentialRampToValueAtTime(0.001,t0+dur);
      o.connect(g);g.connect(musG);
      o.start(t0);o.stop(t0+dur+0.05);
    }catch(e){}
  }
  /* موسیقی رویه‌ای: بیس + آرپژ + هت — بدون هیچ فایل صوتی */
  function scheduler(){
    if(!ac||!musicOn)return;
    if(state!=='playing'&&state!=='menu')return;
    var spb=60/112/2; /* نت‌های یک‌هشتم */
    while(nextNote<ac.currentTime+0.18){
      scheduleStep(step,nextNote);
      nextNote+=spb;
      step=(step+1)%16;
    }
  }
  function scheduleStep(st,t0){
    var bar=Math.floor(t0/3.85)%4;
    var root=chordProg[bar]*MUS_ROOT;
    var bossActive=(typeof boss!=='undefined'&&boss);
    if(st%4===0)mtone(root,0.5,'triangle',bossActive?0.32:0.22,t0);
    if(st%2===0){
      var arp=[220,261.63,293.66,329.63,392,440,329.63,261.63];
      var n=arp[(Math.floor(st/2)+bar*2)%8]*MUS_ROOT;
      mtone(bossActive?n*2:n,0.16,'square',0.045,t0);
    }
    if(bossActive&&(st%2===1))mtone(root*3,0.1,'sawtooth',0.05,t0);
    if(st%8===4&&noiseBuf){
      try{
        var src=ac.createBufferSource();src.buffer=noiseBuf;
        var g=ac.createGain();g.gain.setValueAtTime(0.05,t0);
        g.gain.exponentialRampToValueAtTime(0.001,t0+0.06);
        var f=ac.createBiquadFilter();f.type='highpass';f.frequency.value=6000;
        src.connect(f);f.connect(g);g.connect(musG);
        src.start(t0);src.stop(t0+0.08);
      }catch(e){}
    }
  }
  function sfx(name,opts){
    if(!ac||!sfxOn)return;
    opts=opts||{};
    switch(name){
      case 'shoot':
        if(opts.fx==='electric'){tone(1100,0.05,'square',0.05,300);}
        else if(opts.fx==='laser'){tone(1500,0.08,'sawtooth',0.045,400);}
        else if(opts.fx==='fire'){tone(340,0.07,'sawtooth',0.05,140);}
        else if(opts.fx==='crystal'){tone(1350,0.06,'triangle',0.05,900);}
        else if(opts.fx==='cosmic'){tone(880,0.08,'sine',0.05,1400);}
        else{tone(740,0.05,'square',0.045,500);}
        break;
      case 'hit':noiz(0.04,0.07,2600);break;
      case 'kill':tone(320,0.16,'sawtooth',0.11,70);noiz(0.08,0.05,900);break;
      case 'boom':noiz(0.3,0.2,700);tone(100,0.3,'sine',0.22,40);break;
      case 'bigboom':noiz(0.55,0.28,500);tone(80,0.55,'sine',0.28,30);tone(160,0.4,'sawtooth',0.1,40);break;
      case 'xp':tone(760,0.06,'sine',0.06,1050);break;
      case 'levelup':
        tone(523,0.1,'square',0.1);tone(659,0.1,'square',0.1,0,0.1);
        tone(784,0.12,'square',0.1,0,0.2);tone(1046,0.18,'triangle',0.12,0,0.3);break;
      case 'pick':tone(880,0.08,'triangle',0.12,1320);break;
      case 'dash':noiz(0.12,0.09,3200);tone(280,0.14,'sine',0.08,900);break;
      case 'hurt':tone(200,0.16,'sawtooth',0.17,80);noiz(0.08,0.09,800);break;
      case 'warn':tone(440,0.12,'square',0.09);tone(440,0.12,'square',0.09,0,0.2);break;
      case 'bossin':tone(70,0.9,'sawtooth',0.24,45);noiz(0.6,0.1,300);break;
      case 'bossdie':
        noiz(0.8,0.28,450);tone(90,0.8,'sine',0.28,28);
        tone(300,0.7,'sawtooth',0.12,50);break;
      case 'die':tone(220,1.1,'sawtooth',0.2,40);noiz(0.8,0.13,420);break;
      case 'coin':tone(1180,0.05,'square',0.07);tone(1560,0.08,'square',0.07,0,0.05);break;
      case 'buy':tone(660,0.09,'triangle',0.12);tone(990,0.12,'triangle',0.12,0,0.1);break;
      case 'click':tone(620,0.035,'square',0.045);break;
      case 'heal':tone(520,0.14,'sine',0.1,780);break;
      case 'revive':
        tone(392,0.12,'triangle',0.12);tone(523,0.12,'triangle',0.12,0,0.12);
        tone(659,0.12,'triangle',0.12,0,0.24);tone(880,0.24,'triangle',0.14,0,0.36);break;
      case 'shield':tone(980,0.12,'sine',0.1,640);break;
      case 'zap':tone(1250,0.05,'square',0.055,220);noiz(0.03,0.04,4200);break;
      case 'laser':tone(1600,0.16,'sawtooth',0.065,380);break;
      case 'charge':tone(120,0.5,'sawtooth',0.12,440);break;
      case 'hole':tone(60,0.8,'sine',0.2,180);break;
    }
  }
  return {init:init,resume:resume,suspend:suspend,applySettings:applySettings,sfx:sfx,setEnv:function(i){MUS_ROOT=[1,1.1225,0.9439,1.0595,0.8909][((i%5)+5)%5]||1;}};
})();

function vib(ms){
  if(profile&&profile.set.vib&&navigator.vibrate){try{navigator.vibrate(ms);}catch(e){}}
}

/* ════════════════ متن‌های داستانی کوتاه ════════════════ */

var STORY={
  intro:[
    'زمین در مُرد. گرانش، آخرین چیزی بود که باقی ماند.',
    'آنها از شکاف آمدند. تو تنها بازمانده‌ای.',
    'هر سیگنال خاموش، یک خاطره‌ی فراموش‌شده است...',
    'هسته‌ی تاریکی در عمق میدان، منتظر توست.'
  ],
  goal:'هدف: هر فصل یک نگهبانِ شکاف را دارد — هر ۵ نگهبان را نابود کن تا هسته‌ی گرانش دوباره روشن شود.',
  chapter:[
    'شهر کاسمیک: آخرین کلان‌شهر زنده. نخستین نگهبان در میان آسمان‌خراش‌ها بیدار می‌شود...',
    'بعد نئونی: نورها دروغ می‌گویند و خاطره‌ها را می‌بلعند. نگهبان دوم در پسِ رنگ‌ها کمین کرده.',
    'منطقه آتشین: جایی که گرمای مذاب، خودِ گرانش را ذوب می‌کند. سومین نگهبان در چشمه‌های آتش خفته است.',
    'سیاره یخ‌زده: بر یخِ خاموشی، فقط صدای قدم‌های توست. چهارمین نگهبان زیر یخنفس می‌کشد.',
    'مینای گرانش: تهِ شکاف. اینجا هسته‌ی تاریکی نفس می‌کشد... و آخرین خاطره‌ات منتظر توست.'
  ],
  boss:[
    'از تاریکی، سنگین‌تر از گرانش می‌آید...',
    'منظومه‌ای از خشم بیدار شد.',
    'آنچه شکسته می‌شود، دوباره برمی‌گردد.',
    'جاذبه، این‌بار رو در روی توست.',
    'این... خودِ تویی. آخرین خاطره‌ات.'
  ],
  bosskill:[
    'تایتان فروپاشید. حافظه‌ای بازگشت.',
    'سحابی خاموش شد. سکوت... فقط برای لحظه‌ای.',
    'شکست، به هزاران تکه تبدیل شد.',
    'داس جاذبه افتاد. راز نزدیک‌تر است.',
    'آخرین خاطره آرام گرفت. تو آماده‌ای.'
  ],
  death:[
    'هر مرگ، آغاز تکامل است.',
    'این پایان نبود؛ تمرین بود.',
    'حافظه‌ات قوی‌تر از پیش، بازخواهد گشت.',
    'دوباره برخیز، بازمانده.'
  ],
  mem:[
    'قطعه‌ای از خاطره بازیابی شد.',
    'قدرت گذشته‌ات بازمی‌گردد.',
    'هسته‌ی تاریکی، ترسید.'
  ],
  mid:[
    'یک دقیقه گذشت. شکاف هنوز گرسنه است...',
    'ناوگانِ خاطره‌ها از راه می‌رسد؛ سه دقیقه دوام آوردی.',
    'هفت دقیقه... زمین زیر پایت، صدای تو را می‌شنود.',
    'دوازده دقیقه دوام آوردی. هسته‌ی تاریکی چشمانش را به تو دوخته است.',
    'دیگر تمرین نیست. این آخرین راهِ خانه است.'
  ],
  ending:[
    'پنجمین نگهبان فروپاشید.',
    'از دل غبار، صدایی آمد — صدای زمین.',
    '"بازگشتی. حالا تو هستی که گرانش را نگه می‌داری."',
    'فصل اول کامل شد — اما شکاف، بسته نشده است...'
  ]
};

/* ════════════════ ۲) نهادها: بوم، ورودی، دوربین، ذرات، گلوله‌ها، بازیکن ════════════════ */

/* ─── بوم و اندازه‌ها (پشتیبانی Device Pixel Ratio) ─── */
function setupCanvas(){
  cvs=$('game');
  ctx=cvs.getContext('2d');
  resize();
  window.addEventListener('resize',resize);
}
function resize(){
  DPR=Math.min(window.devicePixelRatio||1,2);
  W=window.innerWidth;H=window.innerHeight;
  cvs.width=Math.round(W*DPR);
  cvs.height=Math.round(H*DPR);
  cvs.style.width=W+'px';
  cvs.style.height=H+'px';
  if(ctx)ctx.setTransform(DPR,0,0,DPR,0,0);
  buildStars();
  buildVignette();
}

/* ─── پس‌زمینه فضایی: ستاره‌ها، سحابی‌ها، خطوط انرژی ─── */
var stars=[],nebulas=[],elines=[],vigCv=null;
function buildStars(){
  stars.length=0;nebulas.length=0;elines.length=0;
  var R=WORLD_R+260,i;
  for(i=0;i<130;i++)stars.push({x:sr(-R,R),y:sr(-R,R),s:rand(0.6,1.6),p:rand(0,TAU),layer:0});
  for(i=0;i<70;i++)stars.push({x:sr(-R,R),y:sr(-R,R),s:rand(1.2,2.4),p:rand(0,TAU),layer:1});
  for(i=0;i<34;i++)stars.push({x:sr(-R,R),y:sr(-R,R),s:rand(1.8,3.2),p:rand(0,TAU),layer:2});
  var nCols=['#1b2a6b','#3a1b6b','#0e3a5a','#2a1040','#12345c'];
  for(i=0;i<6;i++)nebulas.push({x:sr(-R,R),y:sr(-R,R),r:sr(200,430),col:nCols[i%nCols.length],p:rand(0,TAU)});
  for(i=0;i<14;i++)elines.push({x:sr(-R,R),y:sr(-R,R),len:sr(90,240),ang:rand(0,TAU),spd:sr(14,40),p:rand(0,TAU)});
}
function buildVignette(){
  vigCv=document.createElement('canvas');
  vigCv.width=Math.max(2,Math.round(W/2));
  vigCv.height=Math.max(2,Math.round(H/2));
  var g=vigCv.getContext('2d');
  var r=(vigCv.width+vigCv.height)/2;
  var gr=g.createRadialGradient(vigCv.width/2,vigCv.height/2,r*0.42,vigCv.width/2,vigCv.height/2,r);
  gr.addColorStop(0,'rgba(0,0,0,0)');
  gr.addColorStop(1,'rgba(2,3,10,0.55)');
  g.fillStyle=gr;g.fillRect(0,0,vigCv.width,vigCv.height);
}
var darkSprite=null;
function buildDarkSprite(){
  if(darkSprite)return darkSprite;
  darkSprite=document.createElement('canvas');
  darkSprite.width=1200;darkSprite.height=1200;
  var g=darkSprite.getContext('2d');
  var gr=g.createRadialGradient(600,600,150,600,600,600);
  gr.addColorStop(0,'rgba(2,3,10,0)');
  gr.addColorStop(0.45,'rgba(2,3,10,0.55)');
  gr.addColorStop(1,'rgba(1,2,8,0.97)');
  g.fillStyle=gr;g.fillRect(0,0,1200,1200);
  return darkSprite;
}

/* ─── ورودی لمسی + موس + کیبورد ─── */
var input={id:null,sx:0,sy:0,cx:0,cy:0,mx:0,my:0,down:false,moveDist:0,keys:{}};
function initInput(){
  cvs.addEventListener('touchstart',onTS,{passive:false});
  cvs.addEventListener('touchmove',onTM,{passive:false});
  cvs.addEventListener('touchend',onTE,{passive:false});
  cvs.addEventListener('touchcancel',onTE,{passive:false});
  cvs.addEventListener('mousedown',onMD);
  window.addEventListener('mousemove',onMM);
  window.addEventListener('mouseup',onMU);
  window.addEventListener('keydown',onKD);
  window.addEventListener('keyup',onKU);
  document.addEventListener('contextmenu',function(e){e.preventDefault();});
  document.addEventListener('gesturestart',function(e){e.preventDefault();});
  /* فعال‌سازی AudioContext با اولین تعامل کاربر (محدودیت مرورگرهای موبایل) */
  var wake=function(){AudioSys.init();AudioSys.resume();};
  document.addEventListener('touchstart',wake,{passive:true});
  document.addEventListener('mousedown',wake,{passive:true});
  document.addEventListener('touchmove',function(e){e.preventDefault();},{passive:false});
}
function tsPos(t){return {x:t.clientX,y:t.clientY};}
function onTS(e){
  if(state!=='playing')return;
  e.preventDefault();
  if(input.id!==null)return;
  var t=e.changedTouches[0];
  input.id=t.identifier;
  var p=tsPos(t);
  input.sx=p.x;input.sy=p.y;input.cx=p.x;input.cy=p.y;
  input.down=true;
}
function onTM(e){
  if(state!=='playing')return;
  e.preventDefault();
  for(var i=0;i<e.changedTouches.length;i++){
    var t=e.changedTouches[i];
    if(t.identifier===input.id){
      var p=tsPos(t);
      input.moveDist+=Math.abs(p.x-input.cx)+Math.abs(p.y-input.cy);
      input.cx=p.x;input.cy=p.y;
      var dx=p.x-input.sx,dy=p.y-input.sy;
      var l=Math.sqrt(dx*dx+dy*dy);
      if(l>64){dx=dx/l*64;dy=dy/l*64;}
      input.mx=dx/64;input.my=dy/64;
    }
  }
}
function onTE(e){
  for(var i=0;i<e.changedTouches.length;i++){
    if(e.changedTouches[i].identifier===input.id){
      input.id=null;input.down=false;input.mx=0;input.my=0;
    }
  }
}
function onMD(e){
  if(state!=='playing')return;
  input.id='mouse';input.down=true;
  input.sx=e.clientX;input.sy=e.clientY;input.cx=e.clientX;input.cy=e.clientY;
}
function onMM(e){
  if(state!=='playing'||input.id!=='mouse')return;
  input.moveDist+=Math.abs(e.clientX-input.cx)+Math.abs(e.clientY-input.cy);
  input.cx=e.clientX;input.cy=e.clientY;
  var dx=e.clientX-input.sx,dy=e.clientY-input.sy;
  var l=Math.sqrt(dx*dx+dy*dy);
  if(l>64){dx=dx/l*64;dy=dy/l*64;}
  input.mx=dx/64;input.my=dy/64;
}
function onMU(){if(input.id==='mouse'){input.id=null;input.down=false;input.mx=0;input.my=0;}}
function onKD(e){
  input.keys[e.key]=true;
  if((e.key===' '||e.key==='Shift')&&state==='playing'){e.preventDefault();tryDash();}
  if((e.key==='p'||e.key==='P'||e.key==='Escape')&&state==='playing')pauseGame();
}
function onKU(e){input.keys[e.key]=false;}

/* ─── دوربین ─── */
function updateCam(dt){
  var k=1-Math.exp(-6*dt);
  cam.x=lerp(cam.x,player.x,k);
  cam.y=lerp(cam.y,player.y,k);
  cam.shake=Math.max(0,cam.shake-dt*14);
}
function addShake(m){cam.shake=Math.min(14,cam.shake+m);}
function shakeX(){return cam.shake>0?rand(-cam.shake,cam.shake):0;}
function shakeY(){return cam.shake>0?rand(-cam.shake,cam.shake):0;}
/* سایه‌ی نرم زیر موجودیت‌ها — عمق و جابه‌جایی حس زمین */
function drawShadow(x,y,rr,a){
  ctx.fillStyle='rgba(0,0,12,'+(a||0.34)+')';
  ctx.beginPath();ctx.ellipse(x,y,rr,rr*0.42,0,0,TAU);ctx.fill();
}

/* ─── کیفیت تطبیقی: افت واقعی فرِیم → کاهش بی‌صدای بار گرافیکی ───
   AUTOQ لایه‌ای روی انتخاب کاربر است و هرگز گیم‌پلی را تغییر نمی‌دهد. */
var AUTOQ=0;
function effQ(){var q=(profile?profile.set.quality:1)-AUTOQ;return q<0?0:(q>2?2:q);}
var PERF={acc:0,n:0,cool:0};
function perfGovernor(dt){
  if(state!=='playing')return;
  PERF.acc+=dt;PERF.n++;PERF.cool-=dt;
  if(PERF.n<40)return;
  var avg=PERF.acc/PERF.n;PERF.acc=0;PERF.n=0;
  if(PERF.cool>0)return;
  var q=profile?profile.set.quality:1;
  if(avg>0.027&&AUTOQ<2&&(q-AUTOQ)>0){AUTOQ++;PERF.cool=5;}
  else if(avg<0.0145&&AUTOQ>0){AUTOQ--;PERF.cool=9;}
}
/* ─── سیستم ذرات (Object Pool سبک با سقف کیفیت) ─── */
function partCap(){return CFG.partCap[effQ()];}
function addPart(x,y,vx,vy,life,col,size){
  if(parts.length>=partCap())return;
  parts.push({x:x,y:y,vx:vx,vy:vy,life:life,max:life,col:col,size:size});
}
function burst(x,y,col,n,spd,life){
  n=effQ()===0?Math.ceil(n*0.5):n;
  for(var i=0;i<n;i++){
    var a=rand(0,TAU),s=rand(spd*0.3,spd);
    addPart(x,y,Math.cos(a)*s,Math.sin(a)*s,rand(life*0.5,life),col,rand(1.5,3.5));
  }
}
function updateParts(dt){
  for(var i=parts.length-1;i>=0;i--){
    var p=parts[i];
    p.life-=dt;
    if(p.life<=0){parts[i]=parts[parts.length-1];parts.pop();continue;}
    p.x+=p.vx*dt;p.y+=p.vy*dt;
    p.vx*=Math.pow(0.15,dt);p.vy*=Math.pow(0.15,dt);
  }
}
function drawParts(){
  for(var i=0;i<parts.length;i++){
    var p=parts[i];
    ctx.globalAlpha=Math.max(0,p.life/p.max);
    ctx.fillStyle=p.col;
    ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);
  }
  ctx.globalAlpha=1;
}

/* ─── متن‌های شناور (آسیب و ...) ─── */
function addFloat(x,y,txt,col,size){
  if(floats.length>36)floats.shift();
  floats.push({x:x+rand(-8,8),y:y,txt:txt,col:col||'#e8f1ff',size:size||11,life:0.75,max:0.75});
}
function updateFloats(dt){
  for(var i=floats.length-1;i>=0;i--){
    var f=floats[i];f.life-=dt;f.y-=46*dt;
    if(f.life<=0){floats[i]=floats[floats.length-1];floats.pop();}
  }
}
function drawFloats(){
  ctx.textAlign='center';
  for(var i=0;i<floats.length;i++){
    var f=floats[i];
    ctx.globalAlpha=Math.max(0,f.life/f.max);
    ctx.font='800 '+f.size+'px sans-serif';
    ctx.fillStyle=f.col;
    ctx.fillText(f.txt,f.x,f.y);
  }
  ctx.globalAlpha=1;
}

/* ─── آیتم‌های جمع‌آوری: XP، سکه، قلب ─── */
function dropGem(x,y,val){gems.push({x:x,y:y,vx:rand(-50,50),vy:rand(-50,50),val:val,life:CFG.gemLife});}
function dropCoin(x,y,val){coins.push({x:x,y:y,vx:rand(-55,55),vy:rand(-55,55),val:val,life:CFG.coinLife});}
function dropHeart(x,y){hearts.push({x:x,y:y,vx:rand(-40,40),vy:rand(-40,40),life:CFG.heartLife});}
function updatePickups(dt){
  var st=player.st,pr=st.pickup*((dir.event&&dir.event.id==='magnet')?4:1);
  var pr2=pr*pr,fr=Math.pow(0.05,dt),i,o,dx,dy,l,dd;
  for(i=gems.length-1;i>=0;i--){
    o=gems[i];o.life-=dt;
    if(o.life<=0){gems.splice(i,1);continue;}
    dx=player.x-o.x;dy=player.y-o.y;dd=dx*dx+dy*dy;
    if(dd<pr2){
      l=Math.sqrt(dd)||1;
      o.vx+=dx/l*1500*dt;o.vy+=dy/l*1500*dt;
    }else{o.vx*=fr;o.vy*=fr;}
    o.x+=o.vx*dt;o.y+=o.vy*dt;
    if(dd<19*19){gainXP(o.val);sfxQuiet('xp');gems.splice(i,1);}
  }
  for(i=coins.length-1;i>=0;i--){
    o=coins[i];o.life-=dt;
    if(o.life<=0){coins.splice(i,1);continue;}
    dx=player.x-o.x;dy=player.y-o.y;dd=dx*dx+dy*dy;
    if(dd<pr2){l=Math.sqrt(dd)||1;o.vx+=dx/l*1500*dt;o.vy+=dy/l*1500*dt;}
    else{o.vx*=fr;o.vy*=fr;}
    o.x+=o.vx*dt;o.y+=o.vy*dt;
    if(dd<19*19){run.coinsGot+=o.val;AudioSys.sfx('coin');spawnFX('ring',o.x,o.y,30);coins.splice(i,1);}
  }
  for(i=hearts.length-1;i>=0;i--){
    o=hearts[i];o.life-=dt;
    if(o.life<=0){hearts.splice(i,1);continue;}
    dx=player.x-o.x;dy=player.y-o.y;dd=dx*dx+dy*dy;
    if(dd<pr2){l=Math.sqrt(dd)||1;o.vx+=dx/l*1300*dt;o.vy+=dy/l*1300*dt;}
    else{o.vx*=fr;o.vy*=fr;}
    o.x+=o.vx*dt;o.y+=o.vy*dt;
    if(dd<20*20){
      player.hp=Math.min(player.st.maxhp,player.hp+25);
      addFloat(player.x,player.y-24,'+۲۵','#8cff96',14);
      AudioSys.sfx('heal');hearts.splice(i,1);
    }
  }
}
function sfxQuiet(n){if(chance(0.35))AudioSys.sfx(n);}
function drawPickups(){
  var i,o,a;
  for(i=0;i<gems.length;i++){
    o=gems[i];
    a=o.life<3?Math.max(0.3,Math.abs(Math.sin(o.life*8))):1;
    drawGlow(o.x,o.y,'#54f0e0',10,0.6*a);
    ctx.globalAlpha=a;
    ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.life*3);
    ctx.fillStyle='#54f0e0';
    ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(4,0);ctx.lineTo(0,5);ctx.lineTo(-4,0);ctx.closePath();ctx.fill();
    ctx.restore();ctx.globalAlpha=1;
  }
  for(i=0;i<coins.length;i++){
    o=coins[i];
    a=o.life<3?Math.max(0.3,Math.abs(Math.sin(o.life*8))):1;
    drawGlow(o.x,o.y,'#ffd254',9,0.55*a);
    ctx.globalAlpha=a;
    ctx.fillStyle='#ffd254';
    ctx.beginPath();ctx.arc(o.x,o.y,5,0,TAU);ctx.fill();
    ctx.fillStyle='#fff6d8';
    ctx.beginPath();ctx.arc(o.x-1.5,o.y-1.5,1.8,0,TAU);ctx.fill();
    ctx.globalAlpha=1;
  }
  for(i=0;i<hearts.length;i++){
    o=hearts[i];
    a=o.life<3?Math.max(0.3,Math.abs(Math.sin(o.life*8))):1;
    drawGlow(o.x,o.y,'#ff6e82',11,0.6*a);
    ctx.globalAlpha=a;ctx.fillStyle='#ff6e82';
    ctx.fillRect(o.x-2,o.y-6,4,12);
    ctx.fillRect(o.x-6,o.y-2,12,4);
    ctx.globalAlpha=1;
  }
}

/* ─── گلوله‌های بازیکن ─── */
var uidSeq=1;
function spawnBullet(x,y,ang,dmg,opts){
  if(bullets.length>=CFG.maxBullets)return;
  opts=opts||{};
  var st=player.st;
  var spd=st.bspd;
  bullets.push({
    x:x,y:y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,
    dmg:dmg,r:opts.r||5,pierce:opts.pierce||0,
    homing:opts.homing||0,explosive:opts.explosive||0,
    life:st.range/spd,ang:ang,crit:chance(st.crit),hit:[],tt:0
  });
}
function nearestEnemy(x,y,maxD){
  var best=null,bd=maxD*maxD,i,e,dd;
  for(i=0;i<enemies.length;i++){
    e=enemies[i];
    dd=d2(x,y,e.x,e.y);
    if(dd<bd){bd=dd;best=e;}
  }
  if(boss&&!boss.dead){
    dd=d2(x,y,boss.x,boss.y);
    if(dd<bd){best=boss;}
  }
  return best;
}
function updateBullets(dt){
  var i,j,b,e,st=player.st;
  for(i=bullets.length-1;i>=0;i--){
    b=bullets[i];
    b.life-=dt;
    if(b.life<=0){bullets.splice(i,1);continue;}
    /* گلوله دنبال‌کننده */
    if(b.homing>0){
      var t=nearestEnemy(b.x,b.y,320);
      if(t){
        var want=angTo(b.x,b.y,t.x,t.y);
        var cur=Math.atan2(b.vy,b.vx);
        var turn=(3+2.5*b.homing)*dt;
        var diff=angDiff(want,cur);
        cur+=clamp(diff,-turn,turn);
        b.vx=Math.cos(cur)*st.bspd;b.vy=Math.sin(cur)*st.bspd;
        b.ang=cur;
      }
    }
    b.x+=b.vx*dt;b.y+=b.vy*dt;
    b.tt+=dt;
    /* رد افکت شلیک (آتشین/فضایی) */
    if(b.tt>0.03&&chance(0.5)){
      var fx=profile.fx.eq;
      var tc=fx==='fire'?'#ff7a3d':(fx==='cosmic'?'#ffd254':(fx==='crystal'?'#bfeaff':(fx==='electric'?'#c8f0ff':'#5ec8ff')));
      addPart(b.x,b.y,rand(-15,15),rand(-15,15),0.25,tc,2);
      b.tt=0;
    }
    /* برخورد با کریستال‌های موانع */
    var died=false;
    for(j=0;j<obstacles.length;j++){
      var ob=obstacles[j];
      if(d2(b.x,b.y,ob.x,ob.y)<(ob.r+b.r)*(ob.r+b.r)){
        ob.hp-=b.dmg;
        burst(b.x,b.y,'#54f0e0',4,120,0.3);
        AudioSys.sfx('hit');
        if(ob.hp<=0){destroyObstacle(ob);}
        bullets.splice(i,1);died=true;break;
      }
    }
    if(died)continue;
    /* برخورد با دشمنان */
    for(j=0;j<enemies.length;j++){
      e=enemies[j];
      if(e.dead)continue;
      if(b.hit.indexOf(e.uid)>=0)continue;
      if(d2(b.x,b.y,e.x,e.y)<(e.r+b.r)*(e.r+b.r)){
        e.vx+=b.vx*0.06*e.kbr;e.vy+=b.vy*0.06*e.kbr;
        damageEnemy(e,b.dmg,b.crit,Math.atan2(b.vy,b.vx),'bullet');
        if(b.explosive>0)explosionAt(b.x,b.y,34+10*b.explosive,b.dmg*0.6*(1+0.25*(b.explosive-1)),0);
        b.hit.push(e.uid);
        if(b.pierce>0){b.pierce--;}
        else{bullets.splice(i,1);died=true;}
        break;
      }
    }
    if(died)continue;
    /* برخورد با باس */
    if(boss&&!boss.dead&&d2(b.x,b.y,boss.x,boss.y)<(boss.r+b.r)*(boss.r+b.r)){
      damageBoss(b.dmg,b.crit);
      if(b.explosive>0)explosionAt(b.x,b.y,34+10*b.explosive,b.dmg*0.5,0);
      burst(b.x,b.y,'#ffd254',5,140,0.3);
      if(b.pierce>0)b.pierce--;
      else{bullets.splice(i,1);died=true;}
    }
  }
}
function drawBullets(){
  var fx=profile.fx.eq,i,b;
  for(i=0;i<bullets.length;i++){
    b=bullets[i];
    var col=fx==='fire'?'#ff7a3d':(fx==='electric'?'#9fd8ff':(fx==='crystal'?'#bfeaff':(fx==='cosmic'?'#ffd254':(fx==='laser'?'#ff5470':'#5ec8ff'))));
    drawGlow(b.x,b.y,col,13,0.75);
    ctx.save();ctx.translate(b.x,b.y);
    if(fx==='electric'){
      ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();
      var px=b.ang;
      ctx.moveTo(Math.cos(px)*-6,Math.sin(px)*-6);
      ctx.lineTo(Math.cos(px+0.5)*2,Math.sin(px+0.5)*2);
      ctx.lineTo(Math.cos(px)*6,Math.sin(px)*6);
      ctx.stroke();
    }else if(fx==='crystal'){
      ctx.rotate(frameT*0.02);
      ctx.fillStyle=col;
      ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(4,0);ctx.lineTo(0,6);ctx.lineTo(-4,0);ctx.closePath();ctx.fill();
    }else if(fx==='cosmic'){
      ctx.rotate(frameT*0.015);
      ctx.fillStyle=col;
      ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(2,-2);ctx.lineTo(7,0);ctx.lineTo(2,2);ctx.lineTo(0,7);ctx.lineTo(-2,2);ctx.lineTo(-7,0);ctx.lineTo(-2,-2);ctx.closePath();ctx.fill();
    }else if(fx==='laser'){
      ctx.rotate(b.ang);
      ctx.fillStyle=col;
      ctx.fillRect(-11,-1.6,22,3.2);
      ctx.fillStyle='#ffdde4';
      ctx.fillRect(-11,-0.7,22,1.4);
    }else if(fx==='fire'){
      ctx.rotate(b.ang);
      ctx.fillStyle=col;
      ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(-4,-4);ctx.lineTo(-1,0);ctx.lineTo(-4,4);ctx.closePath();ctx.fill();
    }else{
      ctx.rotate(b.ang);
      ctx.fillStyle=col;
      ctx.beginPath();
      ctx.ellipse?ctx.ellipse(0,0,8,3,0,0,TAU):ctx.arc(0,0,4,0,TAU);
      ctx.fill();
      ctx.fillStyle='#eaffff';
      ctx.beginPath();ctx.arc(2,0,1.6,0,TAU);ctx.fill();
    }
    ctx.restore();
  }
}

/* ─── گلوله‌های دشمن ─── */
function spawnEB(x,y,ang,spd,dmg,col,r){
  if(ebullets.length>=CFG.maxEB)return;
  ebullets.push({x:x,y:y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,dmg:dmg,r:r||6,col:col||'#ff5470',life:5});
}
function updateEBullets(dt){
  var sp=1*((dir.event&&dir.event.id==='storm')?1.3:1);
  for(var i=ebullets.length-1;i>=0;i--){
    var b=ebullets[i];
    b.life-=dt;
    b.x+=b.vx*dt*sp;b.y+=b.vy*dt*sp;
    if(b.life<=0){ebullets.splice(i,1);continue;}
    if(d2(b.x,b.y,player.x,player.y)<(b.r+player.r-2)*(b.r+player.r-2)){
      damagePlayer(b.dmg);
      burst(b.x,b.y,b.col,5,120,0.3);
      ebullets.splice(i,1);
    }
  }
}
function drawEBullets(){
  for(var i=0;i<ebullets.length;i++){
    var b=ebullets[i];
    drawGlow(b.x,b.y,b.col,13,0.8);
    ctx.fillStyle=b.col;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,TAU);ctx.fill();
    ctx.fillStyle='#fff';
    ctx.beginPath();ctx.arc(b.x,b.y,b.r*0.4,0,TAU);ctx.fill();
  }
}

/* ─── انفجار (با پشتیبانی ترکیب انفجار زنجیره‌ای) ─── */
function explosionAt(x,y,r,dmg,depth){
  zones.push({kind:'boomfx',x:x,y:y,r:r,t:0.32,max:0.32});
  addShake(depth>0?1:2.5);
  burst(x,y,'#ff9a3d',10,240,0.5);
  burst(x,y,'#ffd254',6,160,0.4);
  AudioSys.sfx(depth>0?'boom':'kill');
  var i,e;
  for(i=0;i<enemies.length;i++){
    e=enemies[i];
    if(e.dead)continue;
    if(d2(x,y,e.x,e.y)<(r+e.r)*(r+e.r))damageEnemy(e,dmg,false,null,'explosion');
  }
  if(boss&&!boss.dead&&d2(x,y,boss.x,boss.y)<(r+boss.r)*(r+boss.r))damageBoss(dmg*0.6,false);
  /* ترکیب: انفجار زنجیره‌ای */
  if(depth<2&&run&&run.combos.indexOf('c1')>=0&&chance(0.35)&&pendingBooms.length<8){
    pendingBooms.push({x:x+rand(-70,70),y:y+rand(-70,70),r:r*0.75,dmg:dmg*0.7,t:0.13,depth:depth+1});
  }
}
function updatePendingBooms(dt){
  for(var i=pendingBooms.length-1;i>=0;i--){
    var b=pendingBooms[i];
    b.t-=dt;
    if(b.t<=0){
      explosionAt(b.x,b.y,b.r,b.dmg,b.depth);
      pendingBooms.splice(i,1);
    }
  }
}

/* ─── بازیکن ─── */
function initPlayer(){
  var _skin=SKINS_BY_ID[profile.skins.eq]||SKINS[0];
  player={
    x:0,y:0,vx:0,vy:0,r:CFG.player.r,hp:100,
    st:null,shieldReady:false,shieldT:0,
    fireT:0,fireAnimT:0,laserT:1.5,repelT:2,trailT:0,
    dashT:0,dashCdT:0,dashDir:{x:1,y:0},
    stillT:0,inv:1.5,orbAng:0,noDmgT:0,animT:0,hurtT:0,alive:true,
    anim:(typeof Anim==='function')?new Anim(_skin.an):null
  };
}
function recalcStats(){
  var k=run?run.skills:{},t=profile.tree,spec=profile.spec;
  var lv=function(id){return k[id]||0;};
  var tr=function(id){return t[id]||0;};
  var armorRed=1-(1-0.12*lv('armor'))*(1-0.04*tr('t_armor'));
  var st={
    maxhp:100+25*lv('hp_up')+12*tr('t_hp'),
    speed:CFG.player.speed*(1+0.08*lv('speed'))*(1+0.03*tr('t_spd')),
    rate:CFG.player.rate*(1+0.05*tr('t_rate')),
    dmg:CFG.player.dmg*(1+0.25*lv('dmg_up'))*(1+0.06*tr('t_dmg')),
    bspd:CFG.player.bspd*(1+0.2*lv('bspd'))*(1+0.08*tr('t_bspd')),
    range:CFG.player.range*(1+0.1*lv('bspd')),
    proj:lv('dbl_shot')+2*lv('triple'),
    pierce:lv('pierce'),homing:lv('homing'),explosive:lv('explosive'),
    chain:lv('chain'),laser:lv('laser'),deathboom:lv('deathboom'),
    laserDmg:24+16*lv('laser'),
    laserCd:lv('laser')?Math.max(1.6,3.8-0.6*lv('laser')):0,
    crit:CFG.player.crit+0.07*lv('crit')+0.04*tr('t_crit'),
    armor:clamp(armorRed,0,0.7),
    regen:0.8*lv('regen')+0.4*tr('t_regen'),
    pickup:CFG.player.pickup+60*lv('magnet'),
    shieldCd:lv('shield')?Math.max(5,12-2*lv('shield'))*(1-0.08*tr('t_shield')):0,
    repelCd:lv('repel')?Math.max(4.5,8-1.2*lv('repel')):0,
    dashCd:CFG.player.dashCd*Math.max(0.45,(1-0.15*lv('dashcd'))*(1-0.06*tr('t_dashcd'))),
    dashDistMul:1+0.08*tr('t_dashd'),
    dashDmg:lv('dashpw')>0?25+15*lv('dashpw'):0,
    dashRes:0.15*tr('t_dashres'),
    trail:lv('trail'),trailDps:12+8*lv('trail'),
    orbs:lv('orbs'),orbDmg:8+4*lv('orbs'),
    lifesteal:0.5*lv('lifesteal'),
    greed:1+0.15*lv('greed'),
    luck:0.06*tr('t_luck'),
    bossMul:1+0.15*tr('t_boss'),
    xpMul:(1+0.08*tr('t_xp'))*(spec.spec_xp15?1.15:1)*((run&&run.xp2)?1.5:1),
    coinMul:(1+0.08*tr('t_coin'))*(spec.spec_coin10?1.1:1)*((run&&run.coin2)?2:1),
    reviveMax:CFG.reviveMax+(spec.spec_slot?1:0)
  };
  player.st=st;
  if(player.hp>st.maxhp)player.hp=st.maxhp;
  /* بازسازی سنگ‌های مداری */
  orbs.length=0;
  for(var i=0;i<st.orbs;i++)orbs.push({a:i*TAU/st.orbs});
  if(run&&typeof UI!=='undefined'&&UI.refreshSkillChips)UI.refreshSkillChips();
}
function tryDash(){
  if(state!=='playing'||!player.alive)return;
  if(player.dashCdT>0||player.dashT>0)return;
  var dx=input.mx,dy=input.my;
  var kb=input.keys;
  if(kb['a']||kb['A']||kb['ArrowLeft'])dx=-1;
  if(kb['d']||kb['D']||kb['ArrowRight'])dx=1;
  if(kb['w']||kb['W']||kb['ArrowUp'])dy=-1;
  if(kb['s']||kb['S']||kb['ArrowDown'])dy=1;
  var l=Math.sqrt(dx*dx+dy*dy);
  if(l<0.15){dx=Math.cos(player.aimAng||0);dy=Math.sin(player.aimAng||0);l=1;}
  player.dashDir={x:dx/l,y:dy/l};
  player.dashT=CFG.player.dashDur;
  player.dashCdT=player.st.dashCd;
  player.inv=Math.max(player.inv,CFG.player.dashDur+0.08);
  run.dashes++;
  AudioSys.sfx('dash');vib(20);
  spawnFX('slash',player.x,player.y,50,{rot:Math.atan2(player.dashDir.y,player.dashDir.x)});
  burst(player.x,player.y,'#5ec8ff',10,180,0.35);
}
function updatePlayer(dt){
  if(!player.alive)return;
  var st=player.st;
  player.animT+=dt;
  /* هم‌گامی سرعت دویدن با سرعت پخش انیمیشن */
  var _spdP=Math.sqrt(player.vx*player.vx+player.vy*player.vy);
  if(player.anim)player.anim.update(dt*(1+Math.min(0.65,_spdP/520)));
  /* حرکت */
  var mx=input.mx,my=input.my,kb=input.keys;
  if(kb['a']||kb['A']||kb['ArrowLeft'])mx=-1;
  if(kb['d']||kb['D']||kb['ArrowRight'])mx=1;
  if(kb['w']||kb['W']||kb['ArrowUp'])my=-1;
  if(kb['s']||kb['S']||kb['ArrowDown'])my=1;
  var ml=Math.sqrt(mx*mx+my*my);
  if(ml>1){mx/=ml;my/=ml;}
  var spd=st.speed*((dir.event&&dir.event.id==='grav')?0.82:1);
  var tvx=mx*spd,tvy=my*spd;
  var k=1-Math.exp(-11*dt);
  if(player.dashT>0){
    var ds=CFG.player.dashSpd*st.dashDistMul;
    player.vx=player.dashDir.x*ds;player.vy=player.dashDir.y*ds;
    player.dashT-=dt;
    /* آسیب مسیر جهش */
    if(st.dashDmg>0){
      for(var i=0;i<enemies.length;i++){
        var e=enemies[i];
        if(!e.dead&&!e.dashHit&&d2(player.x,player.y,e.x,e.y)<(e.r+26)*(e.r+26)){
          e.dashHit=true;
          damageEnemy(e,st.dashDmg,false,null,'dash');
        }
      }
    }
    if(chance(0.7))addPart(player.x,player.y,rand(-30,30),rand(-30,30),0.3,'#5ec8ff',3);
  }else{
    player.vx=lerp(player.vx,tvx,k);
    player.vy=lerp(player.vy,tvy,k);
  }
  player.x+=player.vx*dt;player.y+=player.vy*dt;
  /* گرد و غبار قدم — متصل به حرکت واقعی بازیکن */
  if(player.dashT<=0&&_spdP>52){
    player.stepT=(player.stepT||0)+dt;
    if(player.stepT>=(effQ()===0?0.2:0.13)){
      player.stepT=0;
      addPart(player.x+rand(-5,5),player.y+15,rand(-14,14),rand(-26,-6),rand(0.25,0.5),'#8fb0e8',rand(1.5,3));
    }
  }
  player.dashCdT=Math.max(0,player.dashCdT-dt);
  if(player.dashT<=0){
    for(i=0;i<enemies.length;i++)enemies[i].dashHit=false;
  }
  /* محدود به میدان گرانشی */
  var dc=Math.sqrt(player.x*player.x+player.y*player.y);
  if(dc>WORLD_R-24){
    var nn=nrm(player.x,player.y);
    player.x=nn.x*(WORLD_R-24);player.y=nn.y*(WORLD_R-24);
  }
  /* توقف برای هدف‌گیری */
  var sp2=Math.sqrt(player.vx*player.vx+player.vy*player.vy);
  if(sp2<10)player.stillT+=dt;else player.stillT=0;
  /* بازیابی */
  if(st.regen>0)player.hp=Math.min(st.maxhp,player.hp+st.regen*dt);
  player.inv=Math.max(0,player.inv-dt);
  player.hurtT=Math.max(0,(player.hurtT||0)-dt);
  player.noDmgT+=dt;
  run.noDmgT=player.noDmgT;
  /* سپر */
  if(st.shieldCd>0){
    player.shieldT-=dt;
    if(player.shieldT<=0&&!player.shieldReady){
      player.shieldReady=true;
      addFloat(player.x,player.y-26,'سپر آماده','#5ec8ff',12);
    }
  }
  /* شلیک خودکار */
  player.fireT-=dt;
  player.fireAnimT=Math.max(0,(player.fireAnimT||0)-dt);
  var target=nearestEnemy(player.x,player.y,st.range*1.15);
  if(target)player.aimAng=angTo(player.x,player.y,target.x,target.y);
  var aimBonus=player.stillT>0.4?1.3:1;
  var stormMul=(dir.event&&dir.event.id==='storm')?1.5:1;
  if(target&&player.fireT<=0){
    player.fireT=1/(st.rate*aimBonus*stormMul);
    var n=1+st.proj;
    var spr=0.15;
    for(var bi=0;bi<n;bi++){
      var a=player.aimAng+(bi-(n-1)/2)*spr;
      spawnBullet(player.x+Math.cos(a)*16,player.y+Math.sin(a)*16,a,st.dmg,
        {pierce:st.pierce,homing:st.homing,explosive:st.explosive});
    }
    AudioSys.sfx('shoot',{fx:profile.fx.eq});
    player.fireAnimT=0.2;
    addPart(player.x+Math.cos(player.aimAng)*18,player.y+Math.sin(player.aimAng)*18,
      Math.cos(player.aimAng)*60,Math.sin(player.aimAng)*60,0.12,'#cfeaff',3);
    spawnFX('muzzle',player.x+Math.cos(player.aimAng)*20,player.y+Math.sin(player.aimAng)*20,24,{rot:player.aimAng});
  }
  /* لیزر دوره‌ای */
  if(st.laserCd>0){
    player.laserT-=dt;
    if(player.laserT<=0&&target){
      player.laserT=st.laserCd;
      fireLaserBeam(target);
    }
  }
  /* دفع دشمنان */
  if(st.repelCd>0){
    player.repelT-=dt;
    if(player.repelT<=0){
      player.repelT=st.repelCd;
      var rl=run.skills.repel||0;
      var rr=130+25*rl;
      for(i=0;i<enemies.length;i++){
        e=enemies[i];
        var ddx=e.x-player.x,ddy=e.y-player.y,dl=Math.sqrt(ddx*ddx+ddy*ddy);
        if(dl<rr&&dl>0.1){
          e.vx+=ddx/dl*380*e.kbr;e.vy+=ddy/dl*380*e.kbr;
          damageEnemy(e,5+3*rl,false,null,'repel');
        }
      }
      zones.push({kind:'nova',x:player.x,y:player.y,r:rr,t:0.35,max:0.35,col:'#5ec8ff'});
      AudioSys.sfx('dash');
    }
  }
  /* سنگ‌های مداری */
  if(orbs.length){
    player.orbAng+=2.6*dt;
    for(i=0;i<orbs.length;i++){
      var o=orbs[i];
      o.x=player.x+Math.cos(player.orbAng+o.a)*52;
      o.y=player.y+Math.sin(player.orbAng+o.a)*52;
      for(var j=0;j<enemies.length;j++){
        e=enemies[j];
        if(e.dead||e.orbCdT>0)continue;
        if(d2(o.x,o.y,e.x,e.y)<(e.r+9)*(e.r+9)){
          e.orbCdT=0.35;
          damageEnemy(e,st.orbDmg,false,null,'orb');
        }
      }
    }
  }
  /* رد انرژی */
  if(st.trail>0&&sp2>30){
    player.trailT-=dt;
    if(player.trailT<=0){
      player.trailT=0.05;
      trail.push({x:player.x,y:player.y,life:2.0,max:2.0});
    }
  }
  /* ترکیب: میدان الکتریکی کشنده (شعاع جذب می‌سوزاند) */
  if(run.combos.indexOf('c2')>=0){
    var zr=st.pickup;
    for(i=0;i<enemies.length;i++){
      e=enemies[i];
      if(!e.dead&&d2(player.x,player.y,e.x,e.y)<zr*zr){
        damageEnemy(e,20*dt,false,null,'energy');
        if(chance(0.08))addPart(e.x,e.y,rand(-40,40),rand(-40,40),0.2,'#c8f0ff',2);
      }
    }
  }
  /* برخورد با کریستال‌ها: هل دادن */
  for(i=0;i<obstacles.length;i++){
    var ob=obstacles[i];
    var odx=player.x-ob.x,ody=player.y-ob.y,od=Math.sqrt(odx*odx+ody*ody);
    var min=ob.r+player.r;
    if(od<min&&od>0.01){player.x=ob.x+odx/od*min;player.y=ob.y+ody/od*min;}
  }
}
function fireLaserBeam(target){
  var st=player.st;
  var a=angTo(player.x,player.y,target.x,target.y);
  var len=st.range*1.25;
  lasers.push({x:player.x,y:player.y,ang:a,len:len,t:0.2,max:0.2});
  AudioSys.sfx('laser');
  addShake(1.5);
  var i,e;
  for(i=0;i<enemies.length;i++){
    e=enemies[i];
    if(e.dead)continue;
    /* فاصله نقطه از پاره‌خط */
    var dx=e.x-player.x,dy=e.y-player.y;
    var proj=dx*Math.cos(a)+dy*Math.sin(a);
    if(proj<0||proj>len)continue;
    var px=player.x+Math.cos(a)*proj,py=player.y+Math.sin(a)*proj;
    if(d2(px,py,e.x,e.y)<(13+e.r)*(13+e.r))damageEnemy(e,st.laserDmg,false,null,'laser');
  }
  if(boss&&!boss.dead){
    var bx=boss.x-player.x,by=boss.y-player.y;
    var bp=bx*Math.cos(a)+by*Math.sin(a);
    if(bp>0&&bp<len){
      var qx=player.x+Math.cos(a)*bp,qy=player.y+Math.sin(a)*bp;
      if(d2(qx,qy,boss.x,boss.y)<(13+boss.r)*(13+boss.r))damageBoss(st.laserDmg,false);
    }
  }
}
function damagePlayer(dmg,src){
  if(!player.alive||state!=='playing'||player.inv>0)return;
  var st=player.st;
  dmg*=(1-st.armor);
  if(player.dashT>0)dmg*=(1-st.dashRes);
  /* سپر انرژی */
  if(st.shieldCd>0&&player.shieldReady){
    player.shieldReady=false;
    player.shieldT=st.shieldCd;
    AudioSys.sfx('shield');
    addFloat(player.x,player.y-28,'سپر!','#5ec8ff',15);
    zones.push({kind:'nova',x:player.x,y:player.y,r:110,t:0.3,max:0.3,col:'#5ec8ff'});
    /* ترکیب: سپر انفجاری */
    if(run.combos.indexOf('c3')>=0)explosionAt(player.x,player.y,140,40,1);
    player.inv=0.3;
    return;
  }
  player.hp-=dmg;
  player.inv=0.4;
  player.hurtT=0.3;
  player.noDmgT=0;
  addShake(3.5);vib(35);
  AudioSys.sfx('hurt');
  burst(player.x,player.y,'#ff4d6b',8,180,0.4);
  addFloat(player.x,player.y-26,'-'+faNum(Math.round(dmg)),'#ff6e82',13);
  if(player.hp<=0){
    player.hp=0;
    playerDie();
  }
}
/* ─── ترسیم بازیکن با اسکین فعال — انیمیشن فریمی واقعی DEVKIT ─── */
function drawPlayer(){
  var skin=SKINS_BY_ID[profile.skins.eq]||SKINS[0];
  if(!player.alive){
    /* انیمیشن مرگ طی حالت dead */
    if(state==='dead'&&player.anim&&ANIMS.ready){
      drawShadow(player.x,player.y+26,20,0.3);
      player.anim.play('death');
      player.anim.draw(ctx,player.x,player.y+7,74,{});
    }
    return;
  }
  var st=player.st;
  var blink=player.inv>0&&Math.floor(frameT/90)%2===0;
  var _mvP=Math.sqrt(player.vx*player.vx+player.vy*player.vy)>26;
  var _bobP=_mvP?Math.sin(frameT*0.022)*1.8:Math.sin(frameT*0.007)*0.8;
  drawShadow(player.x,player.y+player.r*0.92,player.r*0.95,0.4);
  drawGlow(player.x,player.y,skin.glow,52,0.55);
  if(player.anim&&ANIMS.ready){
    /* انیمیشن فریمی واقعی متصل به وضعیت واقعی بازیکن + تکانه‌ی دویدن و خم‌شدن جهت‌دار */
    /* اولویت واقعی وضعیت‌ها: مرگ > ضربه > حمله > دویدن > ایست */
    var _st='idle';
    if(_mvP)_st='run';
    if(player.fireAnimT>0)_st='attack';
    if(player.hurtT>0.08)_st='hit';
    player.anim.play(_st);
    var _lean=clamp(player.vx*0.0011,-0.1,0.1);
    player.anim.draw(ctx,player.x,player.y+7+_bobP,80,{
      flip:(Math.cos(player.aimAng||0)<0),
      rot:_lean,
      alpha:blink?0.4:1
    });
  }else{
    if(blink)ctx.globalAlpha=0.35;
    ctx.save();
    ctx.translate(player.x,player.y);
    ctx.rotate(player.aimAng||0);
    drawShip(skin,1);
    ctx.restore();
    ctx.globalAlpha=1;
  }
  /* سپر */
  if(st.shieldCd>0&&player.shieldReady){
    ctx.strokeStyle='rgba(94,200,255,'+(0.55+0.2*Math.sin(frameT*0.008))+')';
    ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(player.x,player.y,player.r+8,0,TAU);ctx.stroke();
  }
  /* هاله هدف‌گیری */
  if(player.stillT>0.4){
    ctx.strokeStyle='rgba(255,210,84,0.35)';
    ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(player.x,player.y,player.r+13,0,TAU);ctx.stroke();
  }
  drawOrbs();
}
function drawShip(skin,sc){
  ctx.save();
  ctx.scale(sc,sc);
  var c=skin.col,g=skin.glow;
  ctx.fillStyle=c;
  ctx.strokeStyle=hexA('#ffffff',0.75);
  ctx.lineWidth=1.2;
  ctx.beginPath();
  if(skin.shape===0){
    ctx.moveTo(16,0);ctx.lineTo(-10,-10);ctx.lineTo(-5,0);ctx.lineTo(-10,10);
  }else if(skin.shape===1){
    ctx.moveTo(18,0);ctx.lineTo(-8,-7);ctx.lineTo(-12,0);ctx.lineTo(-8,7);
  }else if(skin.shape===2){
    ctx.moveTo(14,-2);ctx.lineTo(-4,-13);ctx.lineTo(-9,-3);ctx.lineTo(-5,0);ctx.lineTo(-9,3);ctx.lineTo(-4,13);
  }else{
    ctx.moveTo(15,0);ctx.lineTo(0,-12);ctx.lineTo(-11,0);ctx.lineTo(0,12);
  }
  ctx.closePath();
  ctx.fill();ctx.stroke();
  /* هسته درخشان */
  ctx.fillStyle=hexA(g,0.9);
  ctx.beginPath();ctx.arc(1,0,3.4+Math.sin(frameT*0.01)*0.8,0,TAU);ctx.fill();
  ctx.fillStyle='#fff';
  ctx.beginPath();ctx.arc(1,0,1.4,0,TAU);ctx.fill();
  ctx.restore();
}
function drawOrbs(){
  for(var i=0;i<orbs.length;i++){
    var o=orbs[i];
    if(o.x===undefined)continue;
    drawGlow(o.x,o.y,'#54f0e0',12,0.7);
    ctx.fillStyle='#54f0e0';
    ctx.beginPath();ctx.arc(o.x,o.y,5.5,0,TAU);ctx.fill();
    ctx.fillStyle='#eafffb';
    ctx.beginPath();ctx.arc(o.x,o.y,2.2,0,TAU);ctx.fill();
  }
}
function drawTrail(){
  for(var i=0;i<trail.length;i++){
    var t=trail[i];
    var a=t.life/t.max;
    drawGlow(t.x,t.y,'#54f0e0',26,0.3*a);
    ctx.fillStyle=hexA('#54f0e0',0.25*a);
    ctx.beginPath();ctx.arc(t.x,t.y,14*a,0,TAU);ctx.fill();
  }
}
function updateTrail(dt){
  for(var i=trail.length-1;i>=0;i--){
    var t=trail[i];
    t.life-=dt;
    if(t.life<=0){trail.splice(i,1);continue;}
    if(player.st.trail>0){
      for(var j=0;j<enemies.length;j++){
        var e=enemies[j];
        if(!e.dead&&d2(t.x,t.y,e.x,e.y)<(26+e.r)*(26+e.r)){
          damageEnemy(e,player.st.trailDps*dt,false,null,'energy');
        }
      }
    }
  }
}

/* ════════════════ ۳) دشمنان — ۱۰ نوع با هوش مصنوعی متمایز ════════════════ */

var ETYPES={
  chaser:{fa:'تعقیب‌کننده',hp:24,spd:62,dmg:10,r:13,xp:2,col:'#7fd0ff',unlock:0,w:10,kbr:1,an:'enemy_01'},
  fast:{fa:'سرعتی',hp:12,spd:132,dmg:7,r:10,xp:2,col:'#c084fc',unlock:0,w:6,kbr:1,an:'enemy_02'},
  zig:{fa:'زیگزاگی',hp:20,spd:72,dmg:8,r:12,xp:2,col:'#ff5470',unlock:40,w:5,kbr:1,an:'enemy_03'},
  bomb:{fa:'انفجاری',hp:22,spd:88,dmg:24,r:14,xp:3,col:'#ff7a3d',unlock:80,w:4,kbr:1,an:'enemy_04'},
  tank:{fa:'تانک',hp:95,spd:33,dmg:18,r:20,xp:6,col:'#9d7bff',unlock:90,w:4,kbr:0.15,an:'enemy_05'},
  split:{fa:'تقسیم‌شونده',hp:30,spd:58,dmg:9,r:15,xp:3,col:'#54ff9f',unlock:140,w:4,kbr:1,an:'enemy_06'},
  shield:{fa:'سپردار',hp:42,spd:46,dmg:12,r:14,xp:3,col:'#ffd700',unlock:150,w:4,kbr:0.4,an:'enemy_07'},
  sniper:{fa:'تک‌تیرانداز',hp:18,spd:55,dmg:12,r:12,xp:4,col:'#ffd254',unlock:200,w:3,kbr:1,an:'enemy_08'},
  heal:{fa:'احیاگر',hp:26,spd:50,dmg:6,r:12,xp:5,col:'#54ff9f',unlock:260,w:3,kbr:1,an:'enemy_09'},
  hunter:{fa:'شکارچی',hp:30,spd:78,dmg:11,r:13,xp:4,col:'#ff3860',unlock:320,w:3,kbr:1,an:'enemy_10'}
};
var nearCount=0;

function spawnPoint(){
  /* نقطه‌ای بیرون از دید اما داخل میدان گرانشی */
  var viewR=Math.max(W,H)*0.68+70;
  for(var i=0;i<8;i++){
    var a=rand(0,TAU);
    var x=player.x+Math.cos(a)*viewR,y=player.y+Math.sin(a)*viewR;
    var dc=Math.sqrt(x*x+y*y);
    if(dc<WORLD_R-50)return {x:x,y:y};
  }
  var a2=rand(0,TAU),r2=sr(480,WORLD_R-80);
  return {x:Math.cos(a2)*r2,y:Math.sin(a2)*r2};
}
function spawnEnemy(type,opts){
  opts=opts||{};
  var def=ETYPES[type];
  if(!def)return null;
  var p=opts.pos||spawnPoint();
  var dm={hp:1+run.t*CFG.hpRamp,dmg:1+run.t*CFG.dmgRamp,spd:1+Math.min(0.35,run.t*CFG.spdRamp)};
  var e={
    uid:uidSeq++,type:type,
    x:p.x,y:p.y,vx:0,vy:0,
    hp:def.hp*dm.hp*(opts.hpMul||1),maxhp:def.hp*dm.hp*(opts.hpMul||1),
    r:def.r*(opts.rMul||1),
    spd:def.spd*dm.spd*(opts.spdMul||1),
    dmg:def.dmg*dm.dmg,
    xp:opts.xp!=null?opts.xp:def.xp,
    col:opts.col||def.col,
    elite:!!opts.elite,mini:!!opts.mini,kbr:def.kbr,
    face:0,t:rand(0,10),phase:0,state:0,aim:0,shootT:rand(1.5,3),
    encA:(uidSeq*2.399963)%TAU,side:chance(0.5)?1:-1,
    flash:0,orbCdT:0,dashHit:false,dead:false,noReward:false,
    blinkT:0,healT:rand(0,1),healFx:0,zigF:rand(1.6,3.2),zigA:rand(45,95),
    seed:rand(0,TAU),
    anim:(typeof Anim==='function')?new Anim(def.an):null
  };
  if(e.elite){e.hp*=3.2;e.maxhp*=3.2;e.r*=1.25;e.spd*=0.92;e.dmg*=1.3;e.xp*=4;}
  enemies.push(e);
  return e;
}
function diffSpdMul(){
  /* هوشمندی بیشتر وقتی بازیکن کم‌جان است */
  return (player.hp<player.st.maxhp*0.3)?1.15:1;
}
function moveToward(e,tx,ty,dt,mul){
  var dx=tx-e.x,dy=ty-e.y,l=Math.sqrt(dx*dx+dy*dy)||1;
  var s=e.spd*(mul||1)*diffSpdMul();
  e.vx=lerp(e.vx,dx/l*s,1-Math.exp(-5*dt));
  e.vy=lerp(e.vy,dy/l*s,1-Math.exp(-5*dt));
}
function updateEnemies(dt){
  /* شمارش دشمنان نزدیک برای رفتار محاصره */
  nearCount=0;
  var i,j,e;
  for(i=0;i<enemies.length;i++){
    if(d2(enemies[i].x,enemies[i].y,player.x,player.y)<280*280)nearCount++;
  }
  for(i=0;i<enemies.length;i++){
    e=enemies[i];
    if(e.dead)continue;
    e.t+=dt;e.flash=Math.max(0,e.flash-dt);
    if(e.anim)e.anim.update(dt);
    e.orbCdT=Math.max(0,e.orbCdT-dt);
    var d=dist(e.x,e.y,player.x,player.y);
    var toP=angTo(e.x,e.y,player.x,player.y);
    e.face=toP;
    switch(e.type){
      case 'chaser':{
        if(nearCount>6&&d<260){
          /* محاصره: اشغال موقعیت روی حلقه دور بازیکن */
          var ra=e.encA+frameT*0.00018;
          moveToward(e,player.x+Math.cos(ra)*95,player.y+Math.sin(ra)*95,dt,1);
        }else moveToward(e,player.x,player.y,dt,1);
        break;
      }
      case 'fast':{
        moveToward(e,player.x+Math.sin(e.t*6)*30,player.y+Math.cos(e.t*5.2)*30,dt,1);
        break;
      }
      case 'zig':{
        moveToward(e,player.x,player.y,dt,1);
        e.vx+=Math.cos(e.face+Math.PI/2)*Math.sin(e.t*e.zigF)*e.zigA;
        e.vy+=Math.sin(e.face+Math.PI/2)*Math.sin(e.t*e.zigF)*e.zigA;
        break;
      }
      case 'tank':moveToward(e,player.x,player.y,dt,1);break;
      case 'bomb':{
        moveToward(e,player.x,player.y,dt,1.08);
        e.blinkT=clamp(1-d/220,0,1);
        if(d<38){
          /* انفجار خودخواه — بدون پاداش */
          e.noReward=true;e.dead=true;
          explosionAt(e.x,e.y,90,e.dmg,0);
          damagePlayer(e.dmg*0.8);
          burst(e.x,e.y,'#ff7a3d',18,300,0.6);
          AudioSys.sfx('boom');
        }
        break;
      }
      case 'shield':moveToward(e,player.x,player.y,dt,1);break;
      case 'sniper':{
        if(e.aim>0){
          e.vx*=0.8;e.vy*=0.8;
          e.aim-=dt;
          if(e.aim<=0){
            var lead=nrm(player.vx,player.vy);
            spawnEB(e.x,e.y,angTo(e.x,e.y,player.x+lead.x*90,player.y+lead.y*90),300,e.dmg,'#c084fc',7);
            AudioSys.sfx('zap');
            e.shootT=rand(2.4,3.6);
          }
        }else{
          if(d>380)moveToward(e,player.x,player.y,dt,1);
          else if(d<230)moveToward(e,e.x-Math.cos(toP)*140,e.y-Math.sin(toP)*140,dt,1); /* عقب‌نشینی */
          else moveToward(e,player.x+Math.cos(toP+Math.PI/2)*e.side*160,player.y+Math.sin(toP+Math.PI/2)*e.side*160,dt,0.7);
          e.shootT-=dt;
          if(e.shootT<=0&&d<520){e.aim=0.55;AudioSys.sfx('click');}
        }
        break;
      }
      case 'split':moveToward(e,player.x,player.y,dt,1);break;
      case 'heal':{
        /* حفظ فاصله + درمان هم‌تیمی‌ها */
        if(d>270)moveToward(e,player.x,player.y,dt,1);
        else if(d<170)moveToward(e,e.x-Math.cos(toP)*160,e.y-Math.sin(toP)*160,dt,1);
        else moveToward(e,player.x+Math.cos(toP+Math.PI/2)*e.side*140,player.y+Math.sin(toP+Math.PI/2)*e.side*140,dt,0.7);
        e.healT-=dt;
        if(e.healT<=0){
          e.healT=1.2;e.healFx=0.5;
          for(j=0;j<enemies.length;j++){
            var o=enemies[j];
            if(o.dead||o===e)continue;
            if(d2(e.x,e.y,o.x,o.y)<150*150&&o.hp<o.maxhp){
              o.hp=Math.min(o.maxhp,o.hp+o.maxhp*0.06);
              o.healFx=0.4;
            }
          }
        }
        e.healFx=Math.max(0,e.healFx-dt);
        break;
      }
      case 'hunter':{
        /* پیش‌بینی مسیر بازیکن و بستن راه */
        var tt=clamp(d/Math.max(40,e.spd),0,0.85);
        if(e.state===1){
          e.vx*=Math.pow(0.4,dt);e.vy*=Math.pow(0.4,dt);
          e.phase-=dt;
          if(e.phase<=0){e.state=2;e.phase=1.1;}
        }else if(e.state===2){
          e.phase-=dt;
          moveToward(e,player.x,player.y,dt,0.4);
          if(e.phase<=0)e.state=0;
        }else{
          moveToward(e,player.x+player.vx*tt,player.y+player.vy*tt,dt,1);
          if(d<150){e.state=1;e.phase=0.5;
            var lunge=nrm(player.x-e.x,player.y-e.y);
            e.vx=lunge.x*e.spd*2.4;e.vy=lunge.y*e.spd*2.4;
          }
        }
        break;
      }
    }
    e.x+=e.vx*dt;e.y+=e.vy*dt;
    /* ماندن در میدان */
    var dc=Math.sqrt(e.x*e.x+e.y*e.y);
    if(dc>WORLD_R-14){
      var nn2=nrm(e.x,e.y);
      e.x=nn2.x*(WORLD_R-14);e.y=nn2.y*(WORLD_R-14);
    }
    /* هل دادن از کریستال‌ها */
    for(j=0;j<obstacles.length;j++){
      var ob=obstacles[j];
      var odx=e.x-ob.x,ody=e.y-ob.y,od=Math.sqrt(odx*odx+ody*ody);
      var mn=ob.r+e.r;
      if(od<mn&&od>0.01){e.x=ob.x+odx/od*mn;e.y=ob.y+ody/od*mn;}
    }
    /* تماس با بازیکن */
    if(d2(e.x,e.y,player.x,player.y)<(e.r+player.r-3)*(e.r+player.r-3)){
      damagePlayer(e.dmg);
      var push=nrm(e.x-player.x,e.y-player.y);
      e.vx+=push.x*140;e.vy+=push.y*140;
    }
  }
  /* جداسازی دشمنان (جلوگیری از هم‌پوشانی) */
  for(i=0;i<enemies.length;i++){
    var a=enemies[i];
    if(a.dead)continue;
    for(j=i+1;j<enemies.length;j++){
      var b2=enemies[j];
      if(b2.dead)continue;
      var ddx=b2.x-a.x,ddy=b2.y-a.y;
      var dds=ddx*ddx+ddy*ddy;
      var rs=(a.r+b2.r)*0.9;
      if(dds<rs*rs&&dds>0.01){
        var dl=Math.sqrt(dds),ov=(rs-dl)*0.5;
        var px=ddx/dl,py=ddy/dl;
        a.x-=px*ov*0.6;a.y-=py*ov*0.6;
        b2.x+=px*ov*0.6;b2.y+=py*ov*0.6;
      }
    }
  }
  /* حذف مُرده‌ها */
  for(i=enemies.length-1;i>=0;i--){
    if(enemies[i].dead){enemies[i]=enemies[enemies.length-1];enemies.pop();}
  }
}
function damageEnemy(e,dmg,crit,srcAng,src){
  if(e.dead)return;
  if(e.type==='shield'&&srcAng!=null){
    /* سپردار: فقط از پشت آسیب می‌بیند */
    if(Math.abs(angDiff(srcAng,e.face+Math.PI))<1.15){
      dmg*=0.15;
      addFloat(e.x,e.y-e.r-8,'سپر!','#9fd8ff',11);
      AudioSys.sfx('shield');
    }
  }
  e.hp-=dmg;
  e.flash=0.08;
  if(crit){addShake(1.6);slowMo(0.45,0.05);}
  addFloat(e.x,e.y-e.r-4,faNum(Math.max(1,Math.round(dmg))),crit?'#ffd254':'#e8f1ff',crit?15:11);
  burst(e.x,e.y,crit?'#ffd254':'#cfeaff',crit?6:3,150,0.28);
  if(crit||FXQ.n<Math.round(FXQ.cap*0.35))spawnFX('impact',e.x+rand(-4,4),e.y+rand(-4,4),crit?26:17);
  AudioSys.sfx('hit');
  if(e.hp<=0)killEnemy(e,src);
}
function killEnemy(e,src){
  if(e.dead)return;
  e.dead=true;
  var st=player.st;
  run.kills++;
  run.score+=CFG.scoreKill*(e.elite?3:1)*(run.scoreMul||1);
  /* انیمیشن مرگ فریمی واقعی به‌جای محو شدن فوری */
  if(ANIMS.ready&&ETYPES[e.type]&&ETYPES[e.type].an){
    addCorpse(ETYPES[e.type].an,e.x,e.y,e.r*(e.elite?4.9:4.1),(player.x<e.x));
  }
  /* کمبو زنجیره‌ی کشتن — کشتن‌های پشت‌سرهم پاداش می‌گیرند */
  run.combo=(run.combo||0)+1;
  run.comboT=2.5;
  run.comboPop=0.25;
  if(run.combo>0&&run.combo%10===0){
    var _cb=run.combo/10;
    for(var _ci=0;_ci<_cb*2;_ci++)dropCoin(player.x+rand(-30,30),player.y+rand(-30,30),1);
    addFloat(player.x,player.y-40,'زنجیره ×'+faNum(run.combo)+'!','#ffd254',17);
    AudioSys.sfx('powerup');
  }
  /* شمارش مأموریت‌ها */
  if(src==='explosion')run.expl++;
  if(src==='energy'||src==='orb'||src==='repel')run.energy++;
  if(e.type==='sniper')run.sniper++;
  if(e.elite)run.elites++;
  if(player.st.lifesteal>0)player.hp=Math.min(st.maxhp,player.hp+st.lifesteal);
  /* انفجاری: انفجار هنگام مرگ */
  if(e.type==='bomb'&&!e.noReward){
    explosionAt(e.x,e.y,64,e.dmg*0.7,0);
    spawnFX('explosion',e.x,e.y,96);
  }else if(e.type==='bomb'&&e.noReward){
    /* از قبل منفجر شده */
  }else{
    burst(e.x,e.y,e.col,e.elite?22:9,e.elite?260:170,0.5);
    zones.push({kind:'boomfx',x:e.x,y:e.y,r:e.r*1.6,t:0.25,max:0.25,col:e.col});
    spawnFX('explosion',e.x,e.y,e.r*(e.elite?6.5:4.6));
  }
  if(e.type==='tank'||e.elite){
    AudioSys.sfx('boom');addShake(e.elite?5:2);
    if(e.elite){slowMo(0.4,0.13);flashScreen('#ffd254',0.1);}
  }
  else AudioSys.sfx('kill');
  /* تقسیم‌شونده */
  if(e.type==='split'&&!e.mini&&!e.noReward){
    for(var i=0;i<2;i++){
      var m=spawnEnemy('split',{pos:{x:e.x+rand(-24,24),y:e.y+rand(-24,24)},hpMul:0.28,rMul:0.62,spdMul:1.3,xp:1});
      if(m)m.mini=true;
    }
  }
  /* پاداش‌ها */
  if(!e.noReward){
    var xv=Math.round(e.xp*(e.elite?1.5:1));
    dropGem(e.x,e.y,Math.ceil(xv/2));
    if(xv>2)dropGem(e.x+rand(-10,10),e.y+rand(-10,10),Math.floor(xv/2));
    if(e.elite){
      for(i=0;i<3;i++)dropCoin(e.x+rand(-14,14),e.y+rand(-14,14),2);
      if(chance(0.3))dropHeart(e.x,e.y);
      storyMaybe('mem');
    }else if(chance(CFG.coinChance+st.luck)){
      dropCoin(e.x,e.y,1);
    }
    if(chance(st.luck*0.5))dropHeart(e.x,e.y);
  }
  /* مهارت: انفجار مرگ */
  if(!e.noReward&&st.deathboom>0){
    explosionAt(e.x,e.y,50+12*st.deathboom,15+10*st.deathboom,1);
  }
}
function drawEnemies(){
  var i,e;
  for(i=0;i<enemies.length;i++){
    e=enemies[i];
    var sc=e.elite?1.25:1;
    drawGlow(e.x,e.y,e.col,e.r*2.4,e.elite?0.6:0.4);
    var _an=e.anim&&ANIMS.ready?e.anim:null;
    if(_an){
      /* انیمیشن فریمی واقعی متصل به وضعیت واقعی دشمن — بدون save/translate (مختصات جهانی) */
      var _d=Math.sqrt((player.x-e.x)*(player.x-e.x)+(player.y-e.y)*(player.y-e.y));
      var _st='move';
      if(e.type==='sniper'&&e.aim>0)_st='attack';
      else if(e.type==='bomb'&&e.blinkT>0)_st='attack';
      else if(e.type==='heal'&&(e.healFx>0.05||e.healT<0.35))_st='attack';
      else if(_d<e.r+player.r+46)_st='attack';
      _an.play(_st);
      drawShadow(e.x,e.y+e.r*0.95,e.r*1.02,e.elite?0.42:0.32);
      var _sd=e.seed||0;
      var _bobE=_st==='move'?Math.sin(e.t*7+_sd)*1.7:Math.sin(e.t*3+_sd)*0.7;
      var _sq=e.flash>0?(1+clamp(e.flash*2.4,0,0.16)):1;
      _an.draw(ctx,e.x,e.y+_bobE,e.r*4.1*_sq,{
        flip:(player.x<e.x),
        tint:e.flash>0?clamp(e.flash*9,0,1):0
      });
      if(e.type==='shield'){
        ctx.strokeStyle='#bfeaff';ctx.lineWidth=3;
        ctx.beginPath();ctx.arc(e.x,e.y,e.r+6,e.face-1.1,e.face+1.1);ctx.stroke();
      }
      if(e.type==='sniper'&&e.aim>0){
        ctx.strokeStyle='rgba(255,80,80,'+(0.3+0.5*Math.abs(Math.sin(frameT*0.02)))+')';
        ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(e.x,e.y);
        ctx.lineTo(player.x,player.y);ctx.stroke();
      }
      if(e.elite){
        ctx.strokeStyle='rgba(255,210,84,0.85)';
        ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(e.x,e.y,e.r+6+Math.sin(frameT*0.006)*2,0,TAU);ctx.stroke();
      }
      if(e.type==='heal'){
        ctx.strokeStyle='rgba(84,255,159,'+(0.25+0.2*Math.sin(e.t*4))+')';
        ctx.lineWidth=1.5;
        ctx.beginPath();ctx.arc(e.x,e.y,150,0,TAU);ctx.stroke();
      }
      if(e.healFx>0){
        ctx.strokeStyle='rgba(84,255,159,'+e.healFx+')';
        ctx.lineWidth=1;
        ctx.beginPath();ctx.arc(e.x,e.y,e.r+8+(0.5-e.healFx)*30,0,TAU);ctx.stroke();
      }
      if(e.hp<e.maxhp){
        var _w=e.r*2.2;
        ctx.fillStyle='rgba(8,12,26,0.8)';
        ctx.fillRect(e.x-_w/2,e.y-e.r-9,_w,3);
        ctx.fillStyle=e.elite?'#ffd254':'#ff4d6b';
        ctx.fillRect(e.x-_w/2,e.y-e.r-9,_w*clamp(e.hp/e.maxhp,0,1),3);
      }
      continue;
    }
    ctx.save();
    ctx.translate(e.x,e.y);
    var rr=e.r;
    var c=e.flash>0?'#ffffff':e.col;
    ctx.fillStyle=c;
    ctx.strokeStyle=hexA('#ffffff',0.4);
    ctx.lineWidth=1;
    switch(e.type){
      case 'chaser':
        ctx.rotate(e.face);
        ctx.beginPath();
        ctx.moveTo(rr,0);ctx.lineTo(-rr*0.7,-rr*0.75);ctx.lineTo(-rr*0.25,0);ctx.lineTo(-rr*0.7,rr*0.75);
        ctx.closePath();ctx.fill();
        break;
      case 'fast':
        ctx.rotate(e.face);
        ctx.beginPath();
        ctx.moveTo(rr*1.3,0);ctx.lineTo(-rr*0.6,-rr*0.5);ctx.lineTo(-rr*0.6,rr*0.5);
        ctx.closePath();ctx.fill();
        break;
      case 'zig':
        ctx.rotate(e.t*2);
        ctx.beginPath();
        ctx.moveTo(0,-rr);ctx.lineTo(rr*0.75,0);ctx.lineTo(0,rr);ctx.lineTo(-rr*0.75,0);
        ctx.closePath();ctx.fill();
        break;
      case 'tank':
        ctx.rotate(e.t*0.5);
        ctx.beginPath();
        for(var k=0;k<6;k++){
          var a2=k/6*TAU;
          if(k===0)ctx.moveTo(Math.cos(a2)*rr,Math.sin(a2)*rr);
          else ctx.lineTo(Math.cos(a2)*rr,Math.sin(a2)*rr);
        }
        ctx.closePath();ctx.fill();
        ctx.strokeStyle=hexA('#0a0f24',0.6);ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(0,0,rr*0.55,0,TAU);ctx.stroke();
        break;
      case 'bomb':{
        var bl=0.45+0.55*Math.abs(Math.sin(e.t*(3+e.blinkT*12)));
        drawGlow(0,0,'#ff7a3d',rr*3,bl*sc);
        ctx.fillStyle=e.flash>0?'#fff':hexA('#ff7a3d',0.9);
        ctx.beginPath();ctx.arc(0,0,rr,0,TAU);ctx.fill();
        ctx.fillStyle='#fff2d0';
        ctx.beginPath();ctx.arc(0,0,rr*0.4*bl+2,0,TAU);ctx.fill();
        break;
      }
      case 'shield':
        ctx.beginPath();ctx.arc(0,0,rr,0,TAU);ctx.fill();
        /* صفحه سپر سمت بازیکن */
        ctx.strokeStyle='#bfeaff';ctx.lineWidth=4;
        ctx.beginPath();ctx.arc(0,0,rr+5,e.face-1.15,e.face+1.15);ctx.stroke();
        break;
      case 'sniper':
        ctx.rotate(e.face);
        ctx.fillRect(rr*0.4,-2,rr*1.3,4);
        ctx.beginPath();ctx.rect(-rr*0.8,-rr*0.8,rr*1.6,rr*1.6);ctx.fill();
        if(e.aim>0){
          ctx.strokeStyle='rgba(255,80,80,'+(0.3+0.5*Math.abs(Math.sin(frameT*0.02)))+')';
          ctx.lineWidth=1.5;
          ctx.beginPath();ctx.moveTo(0,0);
          ctx.lineTo((player.x-e.x),(player.y-e.y));ctx.stroke();
        }
        break;
      case 'split':
        ctx.beginPath();ctx.arc(-rr*0.35,0,rr*0.72,0,TAU);ctx.fill();
        ctx.beginPath();ctx.arc(rr*0.35,0,rr*0.72,0,TAU);ctx.fill();
        break;
      case 'heal':
        ctx.beginPath();ctx.arc(0,0,rr,0,TAU);ctx.fill();
        ctx.fillStyle='#062d18';
        ctx.fillRect(-rr*0.55,-rr*0.18,rr*1.1,rr*0.36);
        ctx.fillRect(-rr*0.18,-rr*0.55,rr*0.36,rr*1.1);
        break;
      case 'hunter':
        ctx.rotate(Math.atan2(e.vy,e.vx));
        ctx.beginPath();
        ctx.moveTo(rr*1.2,0);ctx.lineTo(-rr*0.5,-rr*0.9);ctx.lineTo(-rr*0.1,0);ctx.lineTo(-rr*0.5,rr*0.9);
        ctx.closePath();ctx.fill();
        ctx.fillStyle='#fff';
        ctx.beginPath();ctx.arc(rr*0.3,0,2.2,0,TAU);ctx.fill();
        break;
    }
    ctx.restore();
    /* حلقه یاقوتی (elite) */
    if(e.elite){
      ctx.strokeStyle='rgba(255,210,84,0.85)';
      ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(e.x,e.y,e.r+6+Math.sin(frameT*0.006)*2,0,TAU);ctx.stroke();
    }
    /* هاله درمان احیاگر */
    if(e.type==='heal'){
      ctx.strokeStyle='rgba(84,255,159,'+(0.25+0.2*Math.sin(e.t*4))+')';
      ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(e.x,e.y,150,0,TAU);ctx.stroke();
    }
    if(e.healFx>0){
      ctx.strokeStyle='rgba(84,255,159,'+e.healFx+')';
      ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(e.x,e.y,e.r+8+(0.5-e.healFx)*30,0,TAU);ctx.stroke();
    }
    /* نوار جان کوچک */
    if(e.hp<e.maxhp){
      var w=e.r*2.2;
      ctx.fillStyle='rgba(8,12,26,0.8)';
      ctx.fillRect(e.x-w/2,e.y-e.r-9,w,3);
      ctx.fillStyle=e.elite?'#ffd254':'#ff4d6b';
      ctx.fillRect(e.x-w/2,e.y-e.r-9,w*clamp(e.hp/e.maxhp,0,1),3);
    }
  }
}

/* ════════════════ ۴) باس‌ها — ۵ باس چندفازی ════════════════ */

var BOSSES=[
  {id:'titan',en:'VOID TITAN',fa:'تایتان تهی',lore:'زندانیِ گرانش، نگهبانِ تهی‌بودن.',hp:520,r:46,spd:44,dmg:22,col:'#8f6bff',an:'boss_01'},
  {id:'nebula',en:'NEBULA',fa:'سحابی',lore:'سحابی‌ای که خاطره‌ها را می‌بلعد.',hp:430,r:40,spd:62,dmg:18,col:'#ff6bd6',an:'boss_02'},
  {id:'shatter',en:'SHATTER',fa:'شکننده',lore:'هر بازتابش، هزار تکه‌ی سرد.',hp:480,r:44,spd:66,dmg:20,col:'#54e0ff',an:'boss_03'},
  {id:'reaper',en:'GRAVITY REAPER',fa:'داس جاذبه',lore:'داسی که نور را هم درو می‌کند.',hp:520,r:42,spd:52,dmg:20,col:'#a86bff',an:'boss_04'},
  {id:'memory',en:'THE LAST MEMORY',fa:'آخرین خاطره',lore:'آخرین چیزی که از تو باقی مانده است.',hp:640,r:40,spd:70,dmg:24,col:'#5ec8ff',an:'boss_05'}
];
/* جملات پایانی دور — روح داستانی بازی */
var EPITAPHS=[
  'هر مرگ، آغاز تکامل است.',
  'گرانش تو را رها کرد، اما خاطره‌ها نه.',
  'ستاره‌ها شاهد بودند؛ دوباره برخیز.',
  'این پایان نیست؛ سیاره تو را به یاد دارد.',
  'خاطره‌ی تو این‌بار عمیق‌تر شد.'
];
var waveSeq=1;
function spawnBoss(idx){
  var def=BOSSES[idx%BOSSES.length];
  var scale=(1+idx*0.8)*(1+run.t/900);
  var ang=rand(0,TAU);
  var sd=clamp(Math.max(W,H)*0.55,360,540);
  var sx=player.x+Math.cos(ang)*sd;
  var sy=player.y+Math.sin(ang)*sd;
  var dc=Math.sqrt(sx*sx+sy*sy);
  if(dc>WORLD_R-120){sx=sx/dc*(WORLD_R-120);sy=sy/dc*(WORLD_R-120);}
  boss={
    idx:idx,def:def,id:def.id,
    x:sx,y:sy,vx:0,vy:0,
    hp:def.hp*scale,maxhp:def.hp*scale,
    r:def.r,spd:def.spd*(1+idx*0.04),
    dmg:def.dmg*(1+run.t*CFG.dmgRamp),
    phase:1,t:0,entry:1.3,inv:0,flash:0,
    atk1T:2.6,atk2T:4.6,atk3T:6.5,spiralT:0,spiralA:0,
    patT:0,pattern:0,chargeT:0,chargeAng:0,
    s1:false,s2:false,dead:false,warnT:0,
    anim:(typeof Anim==='function')?new Anim(def.an):null
  };
  $('bossname').textContent=def.en+' — '+def.fa;
  $('bossbar').classList.remove('hidden');
  AudioSys.sfx('bossin');
  addShake(6);vib(80);
  storyMsg(STORY.boss[idx%BOSSES.length]);
  if(!run.tutorial)showChapterCard(idx%5, true);
  spawnFX('bossin',sx,sy,def.r*5.4);
  spawnFX('ring',sx,sy,def.r*3.6);
  if(run.tutorial)showBanner(def.en,def.lore||def.fa,'boss');
}
function damageBoss(d,crit){
  if(!boss||boss.dead||boss.inv>0||boss.entry>0)return;
  boss.hp-=d;
  boss.flash=0.07;
  addFloat(boss.x+rand(-16,16),boss.y-boss.r-6,faNum(Math.round(d)),crit?'#ffd254':'#fff',crit?16:12);
  if(boss.hp<=0)bossDie();
}
function updateBoss(dt){
  if(!boss)return;
  boss.t+=dt;
  boss.flash=Math.max(0,boss.flash-dt);
  boss.inv=Math.max(0,boss.inv-dt);
  if(boss.anim)boss.anim.update(dt);
  var d=dist(boss.x,boss.y,player.x,player.y);
  var toP=angTo(boss.x,boss.y,player.x,player.y);
  /* ورود باس — با سرعت دوبرابر برای آمدن سریع و دراماتیک */
  if(boss.entry>0){
    boss.entry-=dt;
    moveTowardB(player.x,player.y,dt,1.75);
    boss.x+=boss.vx*dt;boss.y+=boss.vy*dt;
    return;
  }
  /* تغییر فاز */
  if(boss.id==='memory'){
    if(boss.phase===1&&boss.hp<boss.maxhp*0.66){boss.phase=2;phaseShift();}
    else if(boss.phase===2&&boss.hp<boss.maxhp*0.33){boss.phase=3;phaseShift();}
  }else if(boss.phase===1&&boss.hp<boss.maxhp*0.5){boss.phase=2;phaseShift();}
  var P=boss.phase;
  switch(boss.id){
    /* ─── VOID TITAN: تعقیب + ضربه زمینی + موج انرژی + حمله سریع ─── */
    case 'titan':{
      moveTowardB(player.x,player.y,dt,P===2?1.25:1);
      boss.atk1T-=dt;
      if(boss.atk1T<=0){
        boss.atk1T=P===2?3.6:5;
        zones.push({kind:'slamwarn',x:boss.x,y:boss.y,r:150,t:0.9,dmg:boss.dmg});
        AudioSys.sfx('charge');
      }
      boss.atk2T-=dt;
      if(boss.atk2T<=0){
        boss.atk2T=P===2?4:5.6;
        var n=P===2?16:12;
        for(var i=0;i<n;i++)spawnEB(boss.x,boss.y,i/n*TAU,190,boss.dmg*0.5,'#a98bff',8);
        AudioSys.sfx('zap');
      }
      if(P===2){
        boss.atk3T-=dt;
        if(boss.atk3T<=0){
          boss.atk3T=6;
          boss.warnT=0.65;boss.chargeAng=toP;
          AudioSys.sfx('charge');
        }
      }
      if(boss.warnT>0){
        boss.warnT-=dt;
        if(boss.warnT<=0)boss.chargeT=0.55;
      }
      if(boss.chargeT>0){
        boss.chargeT-=dt;
        boss.vx=Math.cos(boss.chargeAng)*640;
        boss.vy=Math.sin(boss.chargeAng)*640;
        if(chance(0.6))addPart(boss.x,boss.y,rand(-40,40),rand(-40,40),0.3,'#8f6bff',4);
      }
      break;
    }
    /* ─── NEBULA: تیرانداز — شلیک چندجهته، باران گلوله، انفجار منطقه‌ای ─── */
    case 'nebula':{
      if(d>360)moveTowardB(player.x,player.y,dt,1);
      else if(d<250)moveTowardB(boss.x-Math.cos(toP)*200,boss.y-Math.sin(toP)*200,dt,1);
      else moveTowardB(player.x+Math.cos(toP+Math.PI/2)*180,player.y+Math.sin(toP+Math.PI/2)*180,dt,0.8);
      boss.atk1T-=dt;
      if(boss.atk1T<=0){
        boss.atk1T=P===2?2.6:3.4;
        var n2=P===2?10:8,off=rand(0,TAU);
        for(var i2=0;i2<n2;i2++){
          spawnEB(boss.x,boss.y,off+i2/n2*TAU,210,boss.dmg*0.45,'#ff6bd6',7);
          spawnEB(boss.x,boss.y,off+(i2+0.5)/n2*TAU,150,boss.dmg*0.45,'#ff6bd6',7);
        }
        AudioSys.sfx('zap');
      }
      boss.atk2T-=dt;
      if(boss.atk2T<=0){
        boss.atk2T=4.2;
        for(var i3=0;i3<3;i3++)
          spawnEB(boss.x,boss.y,angTo(boss.x,boss.y,player.x,player.y)+ (i3-1)*0.22,280,boss.dmg*0.5,'#ff9ae0',8);
      }
      if(P===2){
        boss.atk3T-=dt;
        if(boss.atk3T<=0){
          boss.atk3T=5.5;
          for(var i4=0;i4<8;i4++){
            var wx=player.x+rand(-260,260),wy=player.y+rand(-260,260);
            zones.push({kind:'rainwarn',x:wx,y:wy,r:62,t:0.85,dmg:boss.dmg*0.4});
          }
          AudioSys.sfx('warn');
        }
      }
      break;
    }
    /* ─── SHATTER: تقسیم‌شونده + حمله ناگهانی ─── */
    case 'shatter':{
      moveTowardB(player.x,player.y,dt,P===2?1.2:1);
      boss.atk1T-=dt;
      if(boss.atk1T<=0){
        boss.atk1T=P===2?3.4:4.6;
        boss.warnT=0.6;boss.chargeAng=toP;
        AudioSys.sfx('charge');
      }
      if(boss.warnT>0){boss.warnT-=dt;if(boss.warnT<=0)boss.chargeT=0.5;}
      if(boss.chargeT>0){
        boss.chargeT-=dt;
        boss.vx=Math.cos(boss.chargeAng)*700;
        boss.vy=Math.sin(boss.chargeAng)*700;
      }
      var hr=boss.hp/boss.maxhp;
      if(!boss.s1&&hr<0.66){boss.s1=true;shatterSplit();}
      if(!boss.s2&&hr<0.33){boss.s2=true;shatterSplit();}
      break;
    }
    /* ─── GRAVITY REAPER: کشیدن بازیکن + سیاه‌چاله + میدان خطرناک ─── */
    case 'reaper':{
      /* چرخش مداری دور بازیکن */
      boss.orbA=(boss.orbA||0)+dt*0.55*boss.phase;
      var tx=player.x+Math.cos(boss.orbA)*230;
      var ty=player.y+Math.sin(boss.orbA)*230;
      moveTowardB(tx,ty,dt,1);
      /* کشیدن بازیکن */
      var pull=nrm(boss.x-player.x,boss.y-player.y);
      player.vx+=pull.x*95*dt;player.vy+=pull.y*95*dt;
      if(chance(0.25))addPart(player.x-pull.x*10,player.y-pull.y*10,pull.x*70,pull.y*70,0.25,'#b0ff54',2);
      boss.atk1T-=dt;
      if(boss.atk1T<=0){
        boss.atk1T=P===2?3.8:5;
        for(var i5=0;i5<3;i5++){
          var hx=player.x+rand(-200,200),hy=player.y+rand(-200,200);
          zones.push({kind:'hazardwarn',x:hx,y:hy,r:74,t:0.9,dur:4,dps:14});
        }
        AudioSys.sfx('warn');
      }
      if(P===2){
        boss.atk2T-=dt;
        if(boss.atk2T<=0){
          boss.atk2T=7;
          zones.push({kind:'hole',x:player.x+rand(-160,160),y:player.y+rand(-160,160),r:380,t:6,dps:12});
          AudioSys.sfx('hole');
          storyMsg('سیاه‌چاله باز شد!');
        }
        boss.atk3T-=dt;
        if(boss.atk3T<=0){
          boss.atk3T=6.4;boss.spiralT=2;boss.spiralA=rand(0,TAU);
        }
      }
      if(boss.spiralT>0){
        boss.spiralT-=dt;
        boss.spiralA+=0.34;
        if(frameT%70<18)spawnEB(boss.x,boss.y,boss.spiralA,220,boss.dmg*0.4,'#d8ff9e',6);
      }
      break;
    }
    /* ─── THE LAST MEMORY: تقلید بازیکن + حملات باس‌های قبلی + فازها ─── */
    case 'memory':{
      var mm=Math.sin(boss.t*1.6)*140;
      moveTowardB(player.x+mm*Math.cos(boss.t),player.y+mm*Math.sin(boss.t),dt,P===3?1.3:1);
      /* تقلید شلیک بازیکن */
      boss.atk1T-=dt;
      if(boss.atk1T<=0){
        boss.atk1T=P===3?1.8:2.8;
        var np=1+player.st.proj;
        for(var i6=0;i6<np;i6++){
          var aa=angTo(boss.x,boss.y,player.x,player.y)+(i6-(np-1)/2)*0.15;
          spawnEB(boss.x,boss.y,aa,player.st.bspd*0.72,player.st.dmg*0.6,'#ffd254',6);
        }
        AudioSys.sfx('shoot',{fx:'cosmic'});
      }
      /* چرخه حملات باس‌های قبلی */
      if(P>=2){
        boss.patT-=dt;
        if(boss.patT<=0){
          boss.patT=P===3?3.4:4.6;
          boss.pattern=(boss.pattern+1)%3;
          if(boss.pattern===0){
            zones.push({kind:'slamwarn',x:boss.x,y:boss.y,r:170,t:0.9,dmg:boss.dmg});
          }else if(boss.pattern===1){
            for(var i7=0;i7<12;i7++)spawnEB(boss.x,boss.y,i7/12*TAU+rand(0,0.4),210,boss.dmg*0.45,'#ffb454',7);
          }else{
            zones.push({kind:'hole',x:player.x+rand(-140,140),y:player.y+rand(-140,140),r:340,t:5,dps:11});
            AudioSys.sfx('hole');
          }
        }
      }
      if(P===3){
        boss.spiralT=Math.max(boss.spiralT,0.01);
        boss.spiralA+=0.42;
        if(frameT%60<16)spawnEB(boss.x,boss.y,boss.spiralA,240,boss.dmg*0.4,'#ffe9b0',6);
      }
      break;
    }
  }
  boss.x+=boss.vx*dt;boss.y+=boss.vy*dt;
  boss.vx=lerp(boss.vx,0,1-Math.exp(-3*dt));
  boss.vy=lerp(boss.vy,0,1-Math.exp(-3*dt));
  var dc2=Math.sqrt(boss.x*boss.x+boss.y*boss.y);
  if(dc2>WORLD_R-40){var nn3=nrm(boss.x,boss.y);boss.x=nn3.x*(WORLD_R-40);boss.y=nn3.y*(WORLD_R-40);}
  /* تماس با بازیکن */
  if(d2(boss.x,boss.y,player.x,player.y)<(boss.r+player.r)*(boss.r+player.r)){
    damagePlayer(boss.dmg*0.6);
    var psh=nrm(player.x-boss.x,player.y-boss.y);
    player.vx+=psh.x*300;player.vy+=psh.y*300;
  }
}
function moveTowardB(tx,ty,dt,mul){
  var dx=tx-boss.x,dy=ty-boss.y,l=Math.sqrt(dx*dx+dy*dy)||1;
  boss.vx=lerp(boss.vx,dx/l*boss.spd*(mul||1),1-Math.exp(-4*dt));
  boss.vy=lerp(boss.vy,dy/l*boss.spd*(mul||1),1-Math.exp(-4*dt));
}
function phaseShift(){
  boss.inv=0.8;
  addShake(5);
  AudioSys.sfx('warn');
  burst(boss.x,boss.y,boss.def.col,26,300,0.7);
  zones.push({kind:'nova',x:boss.x,y:boss.y,r:200,t:0.5,max:0.5,col:boss.def.col});
  addFloat(boss.x,boss.y-boss.r-16,'فاز '+faNum(boss.phase)+'!','#ff6e82',16);
}
function shatterSplit(){
  boss.inv=1;
  burst(boss.x,boss.y,'#54e0ff',24,320,0.6);
  for(var i=0;i<2;i++){
    var ec=spawnEnemy('chaser',{elite:true,hpMul:Math.max(0.14,boss.maxhp*0.0035),col:'#54e0ff',spdMul:1.6});
    if(ec){ec.hp=ec.maxhp=boss.maxhp*0.15;}
  }
  /* جابجایی ناگهانی */
  var a=rand(0,TAU);
  boss.x=player.x+Math.cos(a)*280;boss.y=player.y+Math.sin(a)*280;
  addFloat(boss.x,boss.y-boss.r-14,'تقسیم!','#54e0ff',15);
  AudioSys.sfx('warn');
}
function bossDie(){
  boss.dead=true;
  var idx=boss.idx;
  /* انیمیشن مرگ: رشته انفجارها */
  for(var i=0;i<6;i++){
    pendingBooms.push({x:boss.x+rand(-60,60),y:boss.y+rand(-60,60),r:80,dmg:25,t:0.15+i*0.16,depth:1});
  }
  zones.push({kind:'nova',x:boss.x,y:boss.y,r:260,t:0.7,max:0.7,col:boss.def.col});
  spawnFX('deathexp',boss.x,boss.y,240);
  spawnFX('ring',boss.x,boss.y,270);
  setEnv((run.envIdx||0)+1);
  AudioSys.sfx('bossdie');
  addShake(12);vib(150);
  slowMo(0.3,0.9);
  /* پاداش ارزشمند */
  var st=player.st;
  var cval=Math.round((40+idx*15)*st.coinMul*st.bossMul);
  for(i=0;i<6;i++)dropCoin(boss.x+rand(-30,30),boss.y+rand(-30,30),Math.round(cval/6));
  for(i=0;i<16;i++)dropGem(boss.x+rand(-40,40),boss.y+rand(-40,40),3);
  dropHeart(boss.x+rand(-30,30),boss.y+rand(-30,30));
  dropHeart(boss.x+rand(-30,30),boss.y+rand(-30,30));
  run.shardsGot+=Math.max(1,Math.round((2+idx)*st.bossMul));
  run.bossKills++;
  updateKeepers();
  run.score+=CFG.scoreBoss*(run.scoreMul||1);
  if(run.reviveUsed===0)run.bossCleanCount++;
  if(boss.id==='titan')run.bossTitanKilled=true;
  if(boss.id==='memory')run.bossMemoryKilled=true;
  storyMsg(STORY.bosskill[idx%BOSSES.length]);
  if(idx%5<4)setTimeout(function(){if(run&&state==='playing')storyMsg(STORY.chapter[(idx%5)+1]);},4200);
  $('bossbar').classList.add('hidden');
  /* انیمیشن مرگ باس به‌صورت جسد فریمی که در صحنه می‌ماند */
  if(ANIMS.ready&&boss.def.an)addCorpse(boss.def.an,boss.x,boss.y,boss.r*4.4,(player.x<boss.x));
  boss=null;
  flashScreen('#ffffff',0.22);
  /* پایان فصل: کشتن باس پنجم — حتی اگر کارت ارتقا باز باشد منتظر می‌ماند */
  if(idx%5===4&&!run.ended){
    run.ended=true;
    waitEnding(900);
  }
}
function waitEnding(delay){
  setTimeout(function(){
    if(state==='playing'){showEnding();return;}
    /* پشت کارت ارتقا/توقف — دوباره تلاش می‌کند */
    waitEnding(500);
  },delay||400);
}
/* ─── پایان فصل اول: سکانس پایانی ─── */
function showEnding(){
  if(state!=='playing')return;
  state='ending';
  slowMo(0.4,1.4);
  flashScreen('#ffe9b0',0.3);
  AudioSys.sfx('bossdie');
  var box=$('end-lines');
  box.innerHTML='';
  for(var i=0;i<STORY.ending.length;i++){
    var d=document.createElement('div');
    d.className='ic-line'+(i===2?' key':'');
    d.textContent=STORY.ending[i];
    box.appendChild(d);
    (function(el,k){setTimeout(function(){el.classList.add('show');},420+k*1050);})(d,i);
  }
  UI.showScreen('scr-ending');
  UI.setHud(false);
}
function closeEnding(){
  UI.showScreen(null);
  UI.setHud(true);
  state='playing';
  setEnv(0,true);
  showBanner('نبرد بی‌پایان','فصل‌ها دوباره می‌چرخند — اما این‌بار تو نگهبانِ گرانشی','chapter');
  updateKeepers();
  storyMsg('نبرد بی‌پایان آغاز شد — امتیاز ×۱.۵ از این لحظه');
  run.scoreMul=1.5;
}
/* ─── هشدار ورود باس: پوشش قرمز لبه‌ها ─── */
var bossAlertRef=null;
function setBossAlert(on){
  if(!bossAlertRef){
    bossAlertRef=document.createElement('div');
    bossAlertRef.className='boss-alert';
    document.body.appendChild(bossAlertRef);
  }
  bossAlertRef.classList.toggle('on',!!on);
}
/* ─── نمایش کمبو زنجیره‌ی کشتن کنار بازیکن ─── */
function drawCombo(){
  if(!run||!(run.combo>=3)||!(run.comboT>0))return;
  var a=clamp(run.comboT/1.2,0,1);
  var pop=run.comboPop>0?1+run.comboPop*1.4:1;
  var cy=player.y-42-Math.sin(frameT*0.006)*2;
  ctx.save();
  ctx.globalAlpha=a*0.95;
  ctx.translate(player.x,cy);
  ctx.scale(pop,pop);
  ctx.font='bold 15px Vazirmatn,Tahoma,sans-serif';
  ctx.textAlign='center';
  ctx.strokeStyle='rgba(0,0,16,0.8)';
  ctx.lineWidth=3;
  ctx.strokeText('×'+faNum(run.combo),0,0);
  ctx.fillStyle=run.combo>=20?'#ff9d3d':'#ffd254';
  ctx.fillText('×'+faNum(run.combo),0,0);
  ctx.restore();
}
function drawBoss(){
  if(!boss)return;
  var b=boss,def=b.def;
  var sc=b.entry>0?clamp(1-b.entry/1.3,0.2,1):1;
  drawShadow(b.x,b.y+b.r*0.98,b.r*1.05,0.45);
  drawGlow(b.x,b.y,def.col,b.r*3.4,0.55);
  if(b.anim&&ANIMS.ready){
    /* انیمیشن فریمی واقعی متصل به فاز واقعی باس */
    var _st='move';
    if(b.dead)_st='death';
    else if(b.entry>0)_st='idle';
    else if(b.pattern>0||b.chargeT>0||b.warnT>0)_st='attack';
    b.anim.play(_st);
    b.anim.draw(ctx,b.x,b.y,b.r*3.9,{alpha:sc,tint:b.flash>0?clamp(b.flash*9,0,1):0});
  }else{
    /* جایگزین برداری هماهنگ (پیش از بارگذاری) */
    ctx.save();
    ctx.translate(b.x,b.y);
    ctx.scale(sc,sc);
    ctx.fillStyle=b.flash>0?'#ffffff':def.col;
    ctx.strokeStyle=hexA('#ffffff',0.5);
    ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(0,0,b.r,0,TAU);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff';
    ctx.beginPath();ctx.arc(0,0,b.r*0.3,0,TAU);ctx.fill();
    ctx.restore();
  }
  /* تلگراف حمله شارژ */
  if(b.warnT>0){
    ctx.strokeStyle='rgba(255,60,60,'+(0.25+0.45*Math.abs(Math.sin(frameT*0.02)))+')';
    ctx.lineWidth=5;
    ctx.beginPath();
    ctx.moveTo(b.x,b.y);
    ctx.lineTo(b.x+Math.cos(b.chargeAng)*430,b.y+Math.sin(b.chargeAng)*430);
    ctx.stroke();
  }
  /* هاله فاز دوم */
  if(b.phase>=2&&!b.dead){
    ctx.strokeStyle=hexA(def.col,0.35+0.15*Math.sin(frameT*0.01));
    ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r+14,0,TAU);ctx.stroke();
  }
}

/* ════════════════ ۵) گیم‌پلی: Director رویه‌ای، رویدادها، مهارت‌ها، ارتقا ════════════════ */

var dir={spawnT:1.5,bossIdx:0,eventT:70,event:null,evPhase:'',evT:0,metT:0,lastEvent:''};
function resetDirector(){
  dir.spawnT=1.6;dir.bossIdx=0;
  dir.eventT=CFG.eventFirst*sr(0.85,1.25);
  dir.event=null;dir.evPhase='';dir.lastEvent='';dir.metT=0;
}
function nextBossTime(idx){
  if(idx<CFG.bossTimes.length)return CFG.bossTimes[idx];
  return CFG.bossTimes[CFG.bossTimes.length-1]+(idx-CFG.bossTimes.length+1)*CFG.bossEvery;
}
function bossesPassedCount(t){
  var n=0;
  for(var i=0;i<CFG.bossTimes.length;i++)if(t>=CFG.bossTimes[i])n++;
  if(t>=CFG.bossTimes[4])n+=Math.floor((t-CFG.bossTimes[4])/CFG.bossEvery);
  return n;
}
function pickEnemyType(){
  if(run.tutorial)return 'chaser';
  var keys=[],ws=[],tot=0,i;
  for(var k in ETYPES){
    var d=ETYPES[k];
    if(d.unlock<=run.t){keys.push(k);ws.push(d.w);tot+=d.w;}
  }
  var r=runRng()*tot;
  for(i=0;i<keys.length;i++){r-=ws[i];if(r<=0)return keys[i];}
  return keys[0];
}
function updateDirector(dt){
  /* برنامه‌ی باس‌ها */
  if(!run.tutorial&&!boss&&run.t>=nextBossTime(dir.bossIdx)){
    spawnBoss(dir.bossIdx);
    dir.bossIdx++;
  }
  /* رویدادهای تصادفی */
  if(!dir.event){
    dir.eventT-=dt;
    if(dir.eventT<=0&&run.t>45)startEvent();
  }else tickEvent(dt);
  /* اسپاون دشمنان */
  var interval=Math.max(CFG.spawnMin,CFG.spawnStart-run.t*CFG.spawnRamp)*sr(0.85,1.2);
  if(boss)interval*=2.2;
  if(run.tutorial)interval*=2.6;
  dir.spawnT-=dt;
  if(dir.spawnT<=0){
    dir.spawnT=interval;
    if(enemies.length<CFG.maxEnemies){
      var batch=run.tutorial?1:Math.min(6,1+Math.floor(run.t/80));
      for(var i=0;i<batch;i++){
        var type=pickEnemyType();
        var e=spawnEnemy(type,{});
        if(e&&run.t>CFG.eliteFrom&&sChance(CFG.eliteChance))e.elite=true,e.hp*=3.2,e.maxhp*=3.2,e.r*=1.25,e.xp*=4;
      }
    }
  }
}

/* ─── رویدادهای تصادفی با هشدار تصویری ─── */
var EVENTS=[
  {id:'meteor',fa:'باران شهاب‌سنگ',icon:'☄',dur:13},
  {id:'storm',fa:'طوفان انرژی',icon:'⚡',dur:12},
  {id:'grav',fa:'افزایش جاذبه',icon:'◍',dur:12},
  {id:'dark',fa:'تاریکی محیط',icon:'●',dur:14},
  {id:'swarm',fa:'هجوم دشمنان',icon:'☠',dur:5},
  {id:'magnet',fa:'میدان مغناطیسی',icon:'◎',dur:12},
  {id:'blast',fa:'موج انفجاری',icon:'✷',dur:6},
  {id:'rare',fa:'دشمنان نادر',icon:'★',dur:0}
];
function startEvent(forceId){
  var pool=EVENTS.filter(function(e){return e.id!==dir.lastEvent;});
  var ev=forceId?EVENTS.filter(function(e){return e.id===forceId;})[0]:sPick(pool);
  if(!ev)return;
  dir.lastEvent=ev.id;
  dir.event=ev;
  dir.evPhase='warn';
  dir.evT=3.2;
  UI.eventWarn(ev);
  AudioSys.sfx('warn');
  addFloat(player.x,player.y-60,ev.icon+' '+ev.fa,'#ff6e82',16);
}
function beginEventRun(){
  dir.evPhase='run';
  dir.evT=dir.event.dur;
  UI.hideEventWarn();
  var id=dir.event.id;
  if(id==='swarm'){
    for(var i=0;i<22;i++){
      var a=i/22*TAU;
      var x=player.x+Math.cos(a)*470,y=player.y+Math.sin(a)*470;
      var dc=Math.sqrt(x*x+y*y);
      if(dc>WORLD_R-60){x=x/dc*(WORLD_R-60);y=y/dc*(WORLD_R-60);}
      spawnEnemy('chaser',{pos:{x:x,y:y}});
    }
    AudioSys.sfx('bossin');
  }else if(id==='blast'){
    zones.push({kind:'wave',x:0,y:0,r:30,spd:310,band:26,dmg:30,t:6.5,wid:waveSeq++});
    AudioSys.sfx('boom');
  }else if(id==='rare'){
    for(var i2=0;i2<3;i2++){
      var e=spawnEnemy(pickEnemyType(),{elite:true});
      if(e){e.hp*=3.2;e.maxhp*=3.2;}
    }
    storyMsg('دشمنان نادر ظاهر شدند!');
  }
}
function tickEvent(dt){
  if(dir.evPhase==='warn'){
    dir.evT-=dt;
    if(dir.evT<=0)beginEventRun();
    return;
  }
  var id=dir.event.id;
  if(id==='meteor'){
    dir.metT-=dt;
    if(dir.metT<=0){
      dir.metT=0.45;
      zones.push({kind:'warn-meteor',x:player.x+rand(-430,430),y:player.y+rand(-430,430),r:62,t:0.9});
    }
  }else if(id==='grav'){
    for(var i=0;i<enemies.length;i++){
      var e=enemies[i];
      var dx=player.x-e.x,dy=player.y-e.y,l=Math.sqrt(dx*dx+dy*dy)||1;
      e.vx+=dx/l*42*dt;e.vy+=dy/l*42*dt;
    }
    var pc=Math.sqrt(player.x*player.x+player.y*player.y);
    if(pc<700){var pn=nrm(player.x,player.y);player.vx+=pn.x*70*dt;player.vy+=pn.y*70*dt;}
  }else if(id==='blast'||id==='swarm'||id==='rare'){
    /* افکت‌ها در zones اعمال می‌شوند */
  }
  dir.evT-=dt;
  if(dir.evT<=0){
    dir.event=null;
    dir.eventT=sr(CFG.eventGapMin,CFG.eventGapMax);
  }
}

/* ─── ناحیه‌های خطر و افکت‌ها (تلگراف + اعمال) ─── */
function updateZones(dt){
  var i,z,j,e;
  for(i=zones.length-1;i>=0;i--){
    z=zones[i];
    if(z.kind==='warn-meteor'){
      z.t-=dt;
      if(z.t<=0){
        /* برخورد شهاب‌سنگ */
        burst(z.x,z.y,'#ff9a3d',14,260,0.5);
        zones.push({kind:'boomfx',x:z.x,y:z.y,r:60,t:0.3,max:0.3,col:'#ff9a3d'});
        AudioSys.sfx('boom');addShake(2);
        for(j=0;j<enemies.length;j++){
          e=enemies[j];
          if(!e.dead&&d2(z.x,z.y,e.x,e.y)<(z.r+e.r)*(z.r+e.r))damageEnemy(e,45,false,null,'explosion');
        }
        if(d2(z.x,z.y,player.x,player.y)<(z.r+player.r)*(z.r+player.r))damagePlayer(26);
        zones.splice(i,1);
      }
      continue;
    }
    if(z.kind==='rainwarn'){
      z.t-=dt;
      if(z.t<=0){
        for(j=0;j<6;j++)spawnEB(z.x,z.y,j/6*TAU+rand(0,0.5),180,z.dmg,'#ff9ae0',6);
        zones.push({kind:'boomfx',x:z.x,y:z.y,r:40,t:0.25,max:0.25,col:'#ff6bd6'});
        zones.splice(i,1);
      }
      continue;
    }
    if(z.kind==='slamwarn'){
      z.t-=dt;
      if(z.t<=0){
        zones.push({kind:'wave',x:z.x,y:z.y,r:26,spd:330,band:24,dmg:z.dmg,t:2.4,wid:waveSeq++,fromBoss:true});
        AudioSys.sfx('boom');addShake(4);
        zones.splice(i,1);
      }
      continue;
    }
    if(z.kind==='hazardwarn'){
      z.t-=dt;
      if(z.t<=0){
        zones.push({kind:'hazard',x:z.x,y:z.y,r:z.r,t:z.dur,dps:z.dps});
        zones.splice(i,1);
      }
      continue;
    }
    if(z.kind==='wave'){
      z.t-=dt;z.r+=z.spd*dt;
      if(z.t<=0||z.r>WORLD_R*2.2){zones.splice(i,1);continue;}
      /* آسیب به هر موجود فقط یک‌بار در هر موج */
      var pd=Math.abs(dist(z.x,z.y,player.x,player.y)-z.r);
      if(player._wv!==z.wid&&pd<z.band){player._wv=z.wid;damagePlayer(z.dmg);}
      for(j=0;j<enemies.length;j++){
        e=enemies[j];
        if(e.dead)continue;
        if(e._wv!==z.wid&&Math.abs(dist(z.x,z.y,e.x,e.y)-z.r)<z.band){
          e._wv=z.wid;
          damageEnemy(e,z.fromBoss?12:40,false,null,'explosion');
        }
      }
      continue;
    }
    if(z.kind==='hazard'){
      z.t-=dt;
      if(z.t<=0){zones.splice(i,1);continue;}
      if(d2(z.x,z.y,player.x,player.y)<(z.r+player.r)*(z.r+player.r))damagePlayer(z.dps*dt);
      continue;
    }
    if(z.kind==='hole'){
      z.t-=dt;
      if(z.t<=0){zones.splice(i,1);continue;}
      /* کشیدن بازیکن، دشمنان و آیتم‌ها */
      var dx2=z.x-player.x,dy2=z.y-player.y,l2=Math.sqrt(dx2*dx2+dy2*dy2)||1;
      if(l2<z.r){player.vx+=dx2/l2*260*dt;player.vy+=dy2/l2*260*dt;}
      if(l2<60)damagePlayer(z.dps*dt);
      for(j=0;j<enemies.length;j++){
        e=enemies[j];
        var ex=z.x-e.x,ey=z.y-e.y,el=Math.sqrt(ex*ex+ey*ey)||1;
        if(el<z.r){e.vx+=ex/el*200*dt;e.vy+=ey/el*200*dt;}
      }
      if(chance(0.3))addPart(z.x+rand(-40,40),z.y+rand(-40,40),0,0,0.4,'#a86bff',3);
      continue;
    }
    if(z.kind==='boomfx'||z.kind==='nova'){
      z.t-=dt;
      if(z.t<=0)zones.splice(i,1);
      continue;
    }
  }
}
function drawZones(){
  var i,z,p;
  for(i=0;i<zones.length;i++){
    z=zones[i];
    if(z.kind==='warn-meteor'){
      p=1-z.t/0.9;
      ctx.strokeStyle='rgba(255,77,107,0.85)';
      ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,TAU);ctx.stroke();
      ctx.fillStyle='rgba(255,77,107,0.12)';
      ctx.fill();
      /* خط سقوط */
      ctx.strokeStyle='rgba(255,154,61,0.8)';
      ctx.lineWidth=3;
      ctx.beginPath();
      ctx.moveTo(z.x+(1-p)*150,z.y-(1-p)*210);
      ctx.lineTo(z.x,z.y);ctx.stroke();
    }else if(z.kind==='rainwarn'||z.kind==='slamwarn'||z.kind==='hazardwarn'){
      p=0.5+0.5*Math.abs(Math.sin(frameT*0.012));
      ctx.strokeStyle=z.kind==='hazardwarn'?'rgba(255,154,61,0.85)':'rgba(255,77,107,0.85)';
      ctx.lineWidth=2.5;
      ctx.beginPath();ctx.arc(z.x,z.y,z.r*(0.9+0.1*p),0,TAU);ctx.stroke();
      ctx.fillStyle=hexA(z.kind==='hazardwarn'?'#ff9a3d':'#ff4d6b',0.12);
      ctx.fill();
    }else if(z.kind==='hazard'){
      ctx.fillStyle='rgba(255,120,50,0.14)';
      ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,TAU);ctx.fill();
      ctx.strokeStyle='rgba(255,154,61,0.6)';
      ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,TAU);ctx.stroke();
    }else if(z.kind==='hole'){
      drawGlow(z.x,z.y,'#a86bff',z.r*0.9,0.28);
      ctx.fillStyle='rgba(5,2,12,0.85)';
      ctx.beginPath();ctx.arc(z.x,z.y,46,0,TAU);ctx.fill();
      ctx.strokeStyle='rgba(168,107,255,0.8)';
      ctx.lineWidth=2.5;
      ctx.setLineDash([14,10]);
      ctx.lineDashOffset=-frameT*0.03;
      ctx.beginPath();ctx.arc(z.x,z.y,z.r*0.35,0,TAU);ctx.stroke();
      ctx.setLineDash([]);
    }else if(z.kind==='wave'){
      var a=clamp(z.t/1.5,0,1);
      ctx.strokeStyle='rgba(255,120,60,'+(0.7*a)+')';
      ctx.lineWidth=8;
      ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,TAU);ctx.stroke();
      ctx.strokeStyle='rgba(255,210,84,'+(0.35*a)+')';
      ctx.lineWidth=16;
      ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,TAU);ctx.stroke();
    }else if(z.kind==='boomfx'||z.kind==='nova'){
      p=1-z.t/z.max;
      var col=z.col||'#ffd254';
      ctx.strokeStyle=hexA(col,(1-p)*0.9);
      ctx.lineWidth=z.kind==='nova'?5:3;
      ctx.beginPath();ctx.arc(z.x,z.y,z.r*(z.kind==='nova'?p:0.4+p*0.6),0,TAU);ctx.stroke();
    }
  }
}

/* ─── کریستال‌های موانع (تولید رویه‌ای هر دور) ─── */
function genObstacles(){
  obstacles.length=0;
  var n=Math.floor(sr(4,7));
  for(var i=0;i<n;i++){
    var ok=false,x=0,y=0,tries=0;
    while(!ok&&tries<24){
      tries++;
      var a=sr(0,TAU),r=sr(340,880);
      x=Math.cos(a)*r;y=Math.sin(a)*r;
      ok=Math.sqrt(x*x+y*y)>280;
      for(var j=0;j<obstacles.length;j++){
        if(d2(x,y,obstacles[j].x,obstacles[j].y)<180*180){ok=false;break;}
      }
    }
    if(ok){
      var hp=sr(120,210);
      obstacles.push({x:x,y:y,r:sr(22,34),hp:hp,maxhp:hp,rot:sr(0,TAU)});
    }
  }
}
function destroyObstacle(ob){
  var idx=obstacles.indexOf(ob);
  if(idx<0)return;
  obstacles.splice(idx,1);
  burst(ob.x,ob.y,'#54f0e0',16,240,0.6);
  zones.push({kind:'boomfx',x:ob.x,y:ob.y,r:ob.r*1.8,t:0.3,max:0.3,col:'#54f0e0'});
  for(var i=0;i<3;i++)dropGem(ob.x+rand(-16,16),ob.y+rand(-16,16),2);
  dropCoin(ob.x,ob.y,2);
  run.crystals++;
  AudioSys.sfx('boom');
}
function drawObstacles(){
  for(var i=0;i<obstacles.length;i++){
    var o=obstacles[i];
    drawGlow(o.x,o.y,'#54f0e0',o.r*2.2,0.35);
    ctx.save();
    ctx.translate(o.x,o.y);
    ctx.rotate(o.rot+frameT*0.0003);
    var hr=clamp(o.hp/o.maxhp,0.25,1);
    ctx.fillStyle=hexA('#54f0e0',0.35+0.3*hr);
    ctx.strokeStyle=hexA('#bfeaff',0.9);
    ctx.lineWidth=1.5;
    ctx.beginPath();
    for(var k=0;k<6;k++){
      var a2=k/6*TAU;
      var px=Math.cos(a2)*o.r,py=Math.sin(a2)*o.r;
      if(k===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle=hexA('#eafffb',0.5);
    ctx.beginPath();ctx.moveTo(-o.r*0.4,-o.r*0.2);ctx.lineTo(o.r*0.3,o.r*0.4);ctx.stroke();
    ctx.restore();
  }
}

/* ════════════════ مهارت‌ها (۲۴) + ترکیب‌های ویژه ════════════════ */

var CATS=['هجومی','دفاعی','حرکتی','اقتصادی'];
var SKILLS=[
  {id:'dmg_up',fa:'قدرت ضربه',ic:'⚔',max:5,cat:0,desc:'۲۵٪ آسیب بیشتر در هر سطح'},
  {id:'dbl_shot',fa:'شلیک دوتایی',ic:'⁂',max:3,cat:0,desc:'+۱ گلوله در هر شلیک'},
  {id:'triple',fa:'شلیک سه‌تایی',ic:'⋔',max:2,cat:0,req:'dbl_shot',desc:'+۲ گلوله (نیاز به شلیک دوتایی)'},
  {id:'explosive',fa:'گلوله انفجاری',ic:'✷',max:3,cat:0,desc:'انفجار در نقطه برخورد'},
  {id:'homing',fa:'گلوله دنبال‌کننده',ic:'➳',max:3,cat:0,desc:'گلوله‌ها به سمت هدف می‌چرخند'},
  {id:'bspd',fa:'سرعت گلوله',ic:'»',max:3,cat:0,desc:'+۲۰٪ سرعت و +۱۰٪ برد'},
  {id:'chain',fa:'شلیک زنجیره‌ای',ic:'⚡',max:3,cat:0,desc:'قوس الکتریکی پس از برخورد'},
  {id:'laser',fa:'شلیک لیزری',ic:'─',max:3,cat:0,desc:'پرتو دوره‌ای نفوذکننده'},
  {id:'deathboom',fa:'انفجار مرگ',ic:'☄',max:3,cat:0,desc:'دشمنان هنگام مرگ منفجر می‌شوند'},
  {id:'pierce',fa:'گلوله نفوذکننده',ic:'⟶',max:3,cat:0,desc:'عبور از +۱ دشمن در هر سطح'},
  {id:'shield',fa:'سپر انرژی',ic:'◎',max:3,cat:1,desc:'مهار یک ضربه؛ شارژ مجدد سریع‌تر'},
  {id:'hp_up',fa:'جان بیشتر',ic:'✚',max:5,cat:1,desc:'+۲۵ جان بیشینه و ترمیم فوری'},
  {id:'armor',fa:'زره',ic:'⛨',max:4,cat:1,desc:'۱۲٪ کاهش آسیب دریافتی'},
  {id:'regen',fa:'بازیابی تدریجی',ic:'◨',max:3,cat:1,desc:'+۰٫۸ جان در هر ثانیه'},
  {id:'magnet',fa:'میدان مغناطیسی',ic:'◉',max:3,cat:1,desc:'+۶۰ شعاع جذب XP'},
  {id:'repel',fa:'دفع دشمنان',ic:'⇄',max:3,cat:1,desc:'موج دفع دوره‌ای اطراف شما'},
  {id:'speed',fa:'سرعت حرکت',ic:'⇉',max:4,cat:2,desc:'+۸٪ سرعت جابجایی'},
  {id:'dashpw',fa:'جهش برنده',ic:'⟫',max:3,cat:2,desc:'مسیر جهش به دشمنان آسیب می‌زند'},
  {id:'dashcd',fa:'بازیابی جهش',ic:'◷',max:3,cat:2,desc:'۱۵٪ کاهش زمان انتظار جهش'},
  {id:'trail',fa:'رد انرژی',ic:'〰',max:3,cat:2,desc:'ردی که دشمنان را می‌سوزاند'},
  {id:'crit',fa:'ضربه بحرانی',ic:'✦',max:4,cat:0,desc:'+۷٪ شانس ضربه بحرانی'},
  {id:'lifesteal',fa:'خون‌آشامی',ic:'♰',max:3,cat:1,desc:'+۰٫۵ جان به ازای هر کشتار'},
  {id:'orbs',fa:'سنگ‌های مداری',ic:'⊛',max:3,cat:2,desc:'+۱ سنگ مداری آسیب‌زننده'},
  {id:'greed',fa:'طمع',ic:'⛁',max:3,cat:3,desc:'+۱۵٪ سکه و XP'}
];
var SKILLS_BY_ID={};
for(var _si=0;_si<SKILLS.length;_si++)SKILLS_BY_ID[SKILLS[_si].id]=SKILLS[_si];
var COMBOS=[
  {id:'c1',fa:'انفجار زنجیره‌ای',ic:'✸',desc:'گلوله انفجاری + نفوذکننده: انفجارها زنجیره‌ای می‌شوند',
   cond:function(){return (run.skills.explosive||0)>=1&&(run.skills.pierce||0)>=1;}},
  {id:'c2',fa:'میدان الکتریکی کشنده',ic:'⚡',desc:'میدان مغناطیسی + شلیک زنجیره‌ای: شعاع جذب دشمنان را می‌سوزاند',
   cond:function(){return (run.skills.magnet||0)>=2&&(run.skills.chain||0)>=1;}},
  {id:'c3',fa:'سپر انفجاری',ic:'✹',desc:'سپر انرژی + دفع دشمنان: شکستن سپر موج انفجاری می‌سازد',
   cond:function(){return (run.skills.shield||0)>=1&&(run.skills.repel||0)>=1;}}
];

/* ─── XP و Level-Up ─── */
function xpNeed(l){return Math.floor(CFG.xpBase*Math.pow(l,CFG.xpPow)+8);}
function gainXP(v){
  var st=player.st;
  v=Math.round(v*st.xpMul*st.greed);
  run.xp+=v;run.xpTotal+=v;
  while(run.xp>=run.xpNext){
    run.xp-=run.xpNext;
    run.level++;
    run.score+=CFG.scoreLevel*(run.scoreMul||1);
    run.xpNext=xpNeed(run.level);
    openLevelUp();
  }
}
function openLevelUp(){
  if(state!=='playing')return;
  state='levelup';
  run.pendingLv++;
  AudioSys.sfx('levelup');
  spawnFX('ring',player.x,player.y,130);
  spawnFX('lightning',player.x,player.y,110);
  spawnFX('cosmic',player.x,player.y,120);
  vib(40);
  UI.showLevelUp(genCards());
}
function genCards(){
  var cards=[],pool=[],i;
  for(i=0;i<SKILLS.length;i++){
    var s=SKILLS[i],lv=run.skills[s.id]||0;
    if(lv>=s.max)continue;
    if(s.req&&(run.skills[s.req]||0)<1)continue;
    pool.push({type:'skill',id:s.id});
  }
  /* کارت‌های ترکیبی طلایی */
  for(i=0;i<COMBOS.length;i++){
    var c=COMBOS[i];
    if(run.combos.indexOf(c.id)<0&&c.cond())cards.push({type:'combo',id:c.id});
  }
  /* بُر زدن */
  for(i=pool.length-1;i>0;i--){
    var j=(Math.random()*(i+1))|0;
    var tmp=pool[i];pool[i]=pool[j];pool[j]=tmp;
  }
  while(cards.length<3&&pool.length)cards.push(pool.pop());
  var fallbacks=[
    {type:'heal',fa:'ترمیم کامل',ic:'✚',desc:'بازیابی ۴۰٪ جان'},
    {type:'coins',fa:'گنجینه',ic:'◉',desc:'+۲۵ سکه فوری'},
    {type:'shard',fa:'قطعه حافظه',ic:'◈',desc:'+۱ قطعه حافظه'}
  ];
  while(cards.length<3)cards.push(fallbacks[(Math.random()*fallbacks.length)|0]);
  return cards.slice(0,3);
}
function applyCard(card){
  if(card.type==='skill'){
    run.skills[card.id]=(run.skills[card.id]||0)+1;
    run.skillPicks++;
    if(card.id==='hp_up')player.hp+=25;
    recalcStats();
  }else if(card.type==='combo'){
    run.combos.push(card.id);
    profile.totals.combo=(profile.totals.combo||0)+1;
    storyMsg('ترکیب ویژه فعال شد: '+COMBOS.filter(function(c){return c.id===card.id;})[0].fa);
    recalcStats();
    checkAchs();
  }else if(card.type==='heal'){
    player.hp=Math.min(player.st.maxhp,player.hp+player.st.maxhp*0.4);
    addFloat(player.x,player.y-30,'ترمیم!','#8cff96',16);
  }else if(card.type==='coins'){
    run.coinsGot+=25;
    addFloat(player.x,player.y-30,'+۲۵ سکه','#ffd254',14);
  }else if(card.type==='shard'){
    profile.shards++;
    addFloat(player.x,player.y-30,'+۱ ◈','#54f0e0',14);
    saveGame();
  }
}
function chooseCard(card){
  applyCard(card);
  run.pendingLv--;
  AudioSys.sfx('pick');
  UI.showScreen(null);
  state='playing';
  player.inv=Math.max(player.inv,0.6);
  if(run.tutorial&&tutStep===4)finishTutorial();
  else if(run.tutorial)UI.setTut(tutStep);
  else if(run.pendingLv>0){
    setTimeout(function(){
      if(state==='playing')openLevelUp();
    },300);
  }
}

/* ════════════════ ۶) متا: درخت حافظه، اسکین، فروشگاه، مأموریت، دستاورد، تبلیغ ════════════════ */

/* ─── درخت حافظه (۴ شاخه × ۴ گره × ۵ سطح) ─── */
var BRANCHES=[
  {fa:'قدرت هجومی',cls:'b0'},
  {fa:'بقا',cls:'b1'},
  {fa:'حرکت',cls:'b2'},
  {fa:'اقتصاد',cls:'b3'}
];
var TREE=[
  {id:'t_dmg',br:0,fa:'قدرت ضربه',per:'+۶٪ آسیب',cost:3},
  {id:'t_rate',br:0,fa:'سرعت شلیک',per:'+۵٪ سرعت شلیک',cost:3},
  {id:'t_bspd',br:0,fa:'سرعت گلوله',per:'+۸٪ سرعت گلوله',cost:2},
  {id:'t_crit',br:0,fa:'ضربه بحرانی',per:'+۴٪ شانس بحرانی',cost:2},
  {id:'t_hp',br:1,fa:'جان بیشتر',per:'+۱۲ جان اولیه',cost:3},
  {id:'t_armor',br:1,fa:'دفاع',per:'+۴٪ کاهش آسیب',cost:3},
  {id:'t_regen',br:1,fa:'بازیابی جان',per:'+۰٫۴ جان در ثانیه',cost:2},
  {id:'t_shield',br:1,fa:'قدرت سپر',per:'+۸٪ سرعت شارژ سپر',cost:2},
  {id:'t_spd',br:2,fa:'سرعت',per:'+۳٪ سرعت حرکت',cost:2},
  {id:'t_dashcd',br:2,fa:'بازیابی جهش',per:'+۶٪ کاهش زمان جهش',cost:2},
  {id:'t_dashd',br:2,fa:'مسافت جهش',per:'+۸٪ مسافت جهش',cost:2},
  {id:'t_dashres',br:2,fa:'مقاومت جهش',per:'۱۵٪ آسیب کمتر هنگام جهش',cost:2},
  {id:'t_coin',br:3,fa:'طلایابی',per:'+۸٪ سکه دریافتی',cost:2},
  {id:'t_xp',br:3,fa:'جذب XP',per:'+۸٪ XP دریافتی',cost:2},
  {id:'t_luck',br:3,fa:'شانس ویژه',per:'+۶٪ شانس پاداش ویژه',cost:2},
  {id:'t_boss',br:3,fa:'پاداش باس',per:'+۱۵٪ پاداش باس‌ها',cost:3}
];
var TREE_BY_ID={};
for(var _ti=0;_ti<TREE.length;_ti++)TREE_BY_ID[TREE[_ti].id]=TREE[_ti];
function nodeCost(node,cur){return Math.round(node.cost*Math.pow(cur+1,1.7));}
function totalTreeLevels(){
  var n=0;
  for(var k in profile.tree)n+=profile.tree[k];
  return n;
}
function branchMaxed(br){
  var nodes=TREE.filter(function(n){return n.br===br;});
  for(var i=0;i<nodes.length;i++)if((profile.tree[nodes[i].id]||0)<5)return false;
  return true;
}
function buyTree(id){
  var node=TREE_BY_ID[id];
  if(!node)return;
  var cur=profile.tree[id]||0;
  if(cur>=5){UI.toast('این گره کامل است ✓');return;}
  var cost=nodeCost(node,cur);
  if(profile.shards<cost){UI.toast('قطعه حافظه کافی نیست ◈');AudioSys.sfx('click');return;}
  profile.shards-=cost;
  profile.tree[id]=cur+1;
  profile.totals.tree++;
  updateMissionSum('tree',1);
  AudioSys.sfx('buy');
  UI.toast('ارتقا: '+node.fa+' — سطح '+faNum(cur+1));
  saveGame();
  checkAchs();
  UI.buildTree();
}

/* ─── اسکین‌ها (۱۰) ─── */
var SKINS=[
  {id:'nova',en:'NOVA',fa:'نووا',price:0,col:'#5ec8ff',glow:'#37b6ff',shape:0,an:'character_04',desc:'جت استاندارد بازمانده'},
  {id:'phantom',en:'PHANTOM',fa:'فانتوم',price:600,col:'#9d7bff',glow:'#7b5bff',shape:1,an:'character_02',desc:'سایه‌ای از گذشته'},
  {id:'cyber',en:'CYBER',fa:'سایبر',price:800,col:'#54ff9f',glow:'#2bff74',shape:2,an:'character_08',desc:'مدارهای زنده'},
  {id:'inferno',en:'INFERNO',fa:'اینفرنو',price:1000,col:'#ff7a3d',glow:'#ff4d2b',shape:0,an:'character_05',desc:'هسته‌ی آتشین'},
  {id:'frost',en:'FROST',fa:'فراست',price:1200,col:'#bfeaff',glow:'#7fd0ff',shape:3,an:'character_01',desc:'بلورهای یخ'},
  {id:'neon',en:'NEON',fa:'نئون',price:1400,col:'#ff54a8',glow:'#ff2b8a',shape:1,an:'character_03',desc:'پالس نئونی'},
  {id:'void',en:'VOID',fa:'ووید',price:1600,col:'#6b5aa8',glow:'#3b2f66',shape:2,an:'character_06',desc:'غرش خلأ'},
  {id:'cosmic',en:'COSMIC',fa:'کاسمیک',price:1800,col:'#ffd254',glow:'#ffb02b',shape:3,an:'character_07',desc:'ستاره‌ی سرگردان'},
  {id:'shadow',en:'SHADOW',fa:'شادو',price:2200,col:'#4a5266',glow:'#8a2030',shape:0,an:'character_09',desc:'چشم قرمز تاریکی'},
  {id:'legend',en:'LEGEND',fa:'لجند',price:3000,col:'#ffd700',glow:'#ffb300',shape:1,an:'character_10',desc:'افسانه‌ی بازمانده'}
];
var SKINS_BY_ID={};
for(var _sk=0;_sk<SKINS.length;_sk++)SKINS_BY_ID[SKINS[_sk].id]=SKINS[_sk];

/* ─── افکت‌های شلیک قابل خرید (۵) ─── */
var FXS=[
  {id:'plasma',en:'PLASMA',fa:'پلاسما',price:0,col:'#5ec8ff',desc:'پیش‌فرض — پرتو پلاسما'},
  {id:'laser',en:'LASER',fa:'لیزری',price:500,col:'#ff5470',desc:'پرتوهای برشی سرخ'},
  {id:'electric',en:'ELECTRIC',fa:'الکتریکی',price:800,col:'#9fd8ff',desc:'قوس‌های برقی'},
  {id:'fire',en:'FIRE',fa:'آتشین',price:800,col:'#ff7a3d',desc:'گوی‌های آتش و جرقه'},
  {id:'crystal',en:'CRYSTAL',fa:'کریستالی',price:1000,col:'#bfeaff',desc:'تراشه‌های بلوری'},
  {id:'cosmic',en:'COSMIC',fa:'فضایی',price:1500,col:'#ffd254',desc:'ستاره‌های چهارپر'}
];
var FXS_BY_ID={};
for(var _fx=0;_fx<FXS.length;_fx++)FXS_BY_ID[FXS[_fx].id]=FXS[_fx];

/* ─── فروشگاه: آیتم‌های مصرفی و ویژه ─── */
var SHOP_ITEMS=[
  {id:'revive',cat:'item',fa:'توکن احیا',ic:'✚',price:180,max:3,desc:'هنگام مرگ با ۵۰٪ جان زنده می‌شوی (حداکثر ۳)'},
  {id:'shield',cat:'item',fa:'سپر آغاز',ic:'◎',price:90,max:2,desc:'دور بعدی با سپر انرژی فعال شروع می‌شود'},
  {id:'xp2',cat:'item',fa:'جذب XP',ic:'✦',price:120,max:2,desc:'دور بعدی: ۵۰٪ XP بیشتر'},
  {id:'coin2',cat:'item',fa:'طلای دور بعد',ic:'◉',price:120,max:2,desc:'دور بعدی: ۱۰۰٪ سکه‌ی بیشتر از دشمنان'},
  {id:'spec_slot',cat:'spec',fa:'اسلات احیای سوم',ic:'✚',price:2500,once:true,desc:'یک احیای بیشتر در هر دور (دائمی)'},
  {id:'spec_startlvl',cat:'spec',fa:'آغاز توانمند',ic:'▲',price:2000,once:true,desc:'شروع هر دور یک سطح بالاتر (دائمی)'},
  {id:'spec_xp15',cat:'spec',fa:'جذب‌گر XP',ic:'✦',price:1500,once:true,desc:'+۱۵٪ XP دائمی'},
  {id:'spec_coin10',cat:'spec',fa:'طلای بازمانده',ic:'◉',price:1500,once:true,desc:'+۱۰٪ سکه‌ی دائمی'}
];
var IAP_PACKS=[
  {sku:'coins_500',coins:500,fa:'۵۰۰ سکه'},
  {sku:'coins_1200',coins:1200,fa:'۱۲۰۰ سکه'},
  {sku:'coins_3000',coins:3000,fa:'۳۰۰۰ سکه'}
];
function buyShopItem(id){
  var it=null;
  for(var i=0;i<SHOP_ITEMS.length;i++)if(SHOP_ITEMS[i].id===id)it=SHOP_ITEMS[i];
  if(!it)return;
  if(it.once&&profile.spec[id]){UI.toast('قبلاً خریداری شده ✓');return;}
  var have=profile.inv[id]||0;
  if(!it.once&&have>=it.max){UI.toast('حداکثر تعداد ✓');return;}
  if(profile.coins<it.price){UI.toast('سکه کافی نیست ◉');AudioSys.sfx('click');return;}
  profile.coins-=it.price;
  if(it.once)profile.spec[id]=1;
  else profile.inv[id]=have+1;
  profile.totals.buys++;
  updateMissionSum('buys',1);
  AudioSys.sfx('buy');
  UI.toast('خرید شد: '+it.fa);
  saveGame();checkAchs();
  UI.buildShop(UI.shopTab);
}
function buySkin(id){
  var s=SKINS_BY_ID[id];
  if(!s)return;
  if(profile.skins.owned.indexOf(id)>=0){equipSkin(id);return;}
  if(profile.coins<s.price){UI.toast('سکه کافی نیست ◉');AudioSys.sfx('click');return;}
  profile.coins-=s.price;
  profile.skins.owned.push(id);
  profile.totals.buys++;
  updateMissionSum('buys',1);
  AudioSys.sfx('buy');
  UI.toast('اسکین جدید: '+s.fa);
  saveGame();checkAchs();
  UI.buildShop(UI.shopTab);
}
function equipSkin(id){
  profile.skins.eq=id;
  AudioSys.sfx('pick');
  saveGame();
  UI.buildShop(UI.shopTab);
}
function buyFx(id){
  var f=FXS_BY_ID[id];
  if(!f)return;
  if(profile.fx.owned.indexOf(id)>=0){profile.fx.eq=id;AudioSys.sfx('pick');saveGame();UI.buildShop(UI.shopTab);return;}
  if(profile.coins<f.price){UI.toast('سکه کافی نیست ◉');AudioSys.sfx('click');return;}
  profile.coins-=f.price;
  profile.fx.owned.push(id);
  profile.fx.eq=id;
  profile.totals.buys++;
  updateMissionSum('buys',1);
  AudioSys.sfx('buy');
  UI.toast('افکت جدید: '+f.fa);
  saveGame();checkAchs();
  UI.buildShop(UI.shopTab);
}

/* ─── مأموریت‌ها (۲۴) — زمان‌بندی روزانه با ساعت دستگاه ─── */
var MISSIONS=[
  {id:'m1',fa:'کشتن ۵۰ دشمن',key:'kills',mode:'sum',goal:50,coin:60,ic:'☠'},
  {id:'m2',fa:'کشتن ۲۰۰ دشمن',key:'kills',mode:'sum',goal:200,coin:150,ic:'☠'},
  {id:'m3',fa:'کشتن ۵۰۰ دشمن',key:'kills',mode:'sum',goal:500,coin:300,shard:2,ic:'☠'},
  {id:'m4',fa:'زنده ماندن ۱۲۰ ثانیه در یک دور',key:'bestTime',mode:'best',goal:120,coin:80,ic:'◷'},
  {id:'m5',fa:'زنده ماندن ۳۰۰ ثانیه در یک دور',key:'bestTime',mode:'best',goal:300,coin:200,shard:2,ic:'◷'},
  {id:'m6',fa:'شکست دادن ۱ باس',key:'boss',mode:'sum',goal:1,coin:120,shard:2,ic:'▲'},
  {id:'m7',fa:'شکست دادن ۵ باس',key:'boss',mode:'sum',goal:5,coin:350,shard:5,ic:'▲'},
  {id:'m8',fa:'استفاده از ۵ مهارت در یک دور',key:'skillsBest',mode:'best',goal:5,coin:70,ic:'✦'},
  {id:'m9',fa:'انجام ۳ دور',key:'runs',mode:'sum',goal:3,coin:60,ic:'↻'},
  {id:'m10',fa:'جمع‌آوری ۵۰۰ XP در یک دور',key:'xpBest',mode:'best',goal:500,coin:90,ic:'✧'},
  {id:'m11',fa:'کشتن ۲۰ دشمن با شلیک انفجاری',key:'expl',mode:'sum',goal:20,coin:120,ic:'✷'},
  {id:'m12',fa:'کشتن ۱۵ تک‌تیرانداز',key:'sniper',mode:'sum',goal:15,coin:100,ic:'⌖'},
  {id:'m13',fa:'نابودی ۲۰ کریستال',key:'crystals',mode:'sum',goal:20,coin:80,ic:'◈'},
  {id:'m14',fa:'جمع‌آوری ۳۰۰ سکه',key:'coins',mode:'sum',goal:300,coin:100,ic:'◉'},
  {id:'m15',fa:'رسیدن به سطح ۱۰ در یک دور',key:'bestLevel',mode:'best',goal:10,coin:110,ic:'▲'},
  {id:'m16',fa:'۵۰ بار جهش (Dash)',key:'dash',mode:'sum',goal:50,coin:90,ic:'⟫'},
  {id:'m17',fa:'کشتن ۱۰ دشمن با رد انرژی یا میدان',key:'energy',mode:'sum',goal:10,coin:110,ic:'〰'},
  {id:'m18',fa:'خرید ۱ آیتم از فروشگاه',key:'buys',mode:'sum',goal:1,coin:50,ic:'🛒'},
  {id:'m19',fa:'ارتقای ۳ گره درخت حافظه',key:'tree',mode:'sum',goal:3,coin:120,shard:3,ic:'◈'},
  {id:'m20',fa:'باز کردن ۱ دستاورد',key:'achs',mode:'sum',goal:1,coin:80,ic:'★'},
  {id:'m21',fa:'کشتن ۳ دشمن یاقوتی',key:'elites',mode:'sum',goal:3,coin:100,ic:'◎'},
  {id:'m22',fa:'احیا شدن یک بار',key:'revives',mode:'sum',goal:1,coin:70,ic:'✚'},
  {id:'m23',fa:'۶۰ ثانیه بدون دریافت آسیب در یک دور',key:'noDmg',mode:'best',goal:60,coin:150,ic:'⛨'},
  {id:'m24',fa:'شکست باس بدون احیا در همان دور',key:'cleanBoss',mode:'sum',goal:1,coin:250,shard:4,ic:'⚗'}
];
var MISSIONS_BY_ID={};
for(var _mi=0;_mi<MISSIONS.length;_mi++)MISSIONS_BY_ID[MISSIONS[_mi].id]=MISSIONS[_mi];
function dailyRollover(){
  var today=Math.floor(Date.now()/86400000);
  if(profile.missions.day===today)return;
  profile.missions.day=today;
  var pool=MISSIONS.slice(),daily=[];
  for(var i=0;i<3&&pool.length;i++){
    var j=(Math.random()*pool.length)|0;
    daily.push(pool[j].id);
    pool.splice(j,1);
  }
  profile.missions.daily=daily;
  saveGame();
}
function updateMissionSum(key,delta){
  if(!delta)return;
  profile.missions.prog[key]=(profile.missions.prog[key]||0)+delta;
}
function updateMissionBest(key,val){
  if(val<=(profile.missions.prog[key]||0))return;
  profile.missions.prog[key]=val;
}
function claimMission(id){
  var m=MISSIONS_BY_ID[id];
  if(!m)return;
  if(profile.missions.claimed[id])return;
  var prog=profile.missions.prog[m.key]||0;
  if(prog<m.goal){UI.toast('هنوز کامل نشده');return;}
  profile.missions.claimed[id]=1;
  var isDaily=profile.missions.daily.indexOf(id)>=0;
  var mul=isDaily?2:1;
  profile.coins+=m.coin*mul;
  if(m.shard)profile.shards+=m.shard*mul;
  AudioSys.sfx('buy');
  UI.toast(isDaily?'مأموریت روزانه ×۲: '+faNum(m.coin*mul)+' سکه':'پاداش: '+faNum(m.coin)+' سکه');
  saveGame();checkAchs();
  UI.buildMissions();
}

/* ─── دستاوردها (۲۶) ─── */
function A(n){return profile.totals[n]||0;}
var ACHS=[
  {id:'a1',fa:'اولین شکار',ic:'☠',desc:'اولین دشمن را نابود کن',coin:30,chk:function(){return [A('kills'),1];}},
  {id:'a2',fa:'شکارچی مبتدی',ic:'☠',desc:'۱۰۰ دشمن نابود کن',coin:80,chk:function(){return [A('kills'),100];}},
  {id:'a3',fa:'نابودگر',ic:'☠',desc:'۱۰۰۰ دشمن نابود کن',coin:200,shard:2,chk:function(){return [A('kills'),1000];}},
  {id:'a4',fa:'افسانه‌ی نابودی',ic:'☠',desc:'۵۰۰۰ دشمن نابود کن',coin:500,shard:5,chk:function(){return [A('kills'),5000];}},
  {id:'a5',fa:'شکارچی غول‌ها',ic:'▲',desc:'اولین باس را شکست بده',coin:100,shard:2,chk:function(){return [A('boss'),1];}},
  {id:'a6',fa:'قاتل باس',ic:'▲',desc:'۵ باس را شکست بده',coin:250,shard:4,chk:function(){return [A('boss'),5];}},
  {id:'a7',fa:'سقوط تایتان',ic:'▲',desc:'VOID TITAN را شکست بده',coin:150,chk:function(){return [A('bossTitan'),1];}},
  {id:'a8',fa:'فراتر از خاطره',ic:'★',desc:'THE LAST MEMORY را شکست بده',coin:400,shard:10,chk:function(){return [A('bossMemory'),1];}},
  {id:'a9',fa:'بازمانده',ic:'◷',desc:'۵ دقیقه در یک دور زنده بمان',coin:120,chk:function(){return [profile.best.time,300];}},
  {id:'a10',fa:'بی‌مرگ',ic:'◷',desc:'۱۰ دقیقه در یک دور زنده بمان',coin:250,shard:3,chk:function(){return [profile.best.time,600];}},
  {id:'a11',fa:'اسطوره‌ی بقا',ic:'◷',desc:'۱۵ دقیقه در یک دور زنده بمان',coin:400,shard:6,chk:function(){return [profile.best.time,900];}},
  {id:'a12',fa:'ارتقاگر',ic:'✦',desc:'در یک دور به سطح ۱۰ برس',coin:100,chk:function(){return [profile.best.level,10];}},
  {id:'a13',fa:'استاد سطح',ic:'✦',desc:'در یک دور به سطح ۲۰ برس',coin:250,shard:4,chk:function(){return [profile.best.level,20];}},
  {id:'a14',fa:'ثروتمند',ic:'◉',desc:'۲۰۰۰ سکه هم‌زمان داشته باش',coin:150,chk:function(){return [profile.coins,2000];}},
  {id:'a15',fa:'مأمور وفادار',ic:'☑',desc:'۳ مأموریت را کامل و دریافت کن',coin:120,chk:function(){
    var n=0;for(var k in profile.missions.claimed)n++;return [n,3];}},
  {id:'a16',fa:'کلکسیونر',ic:'♛',desc:'۵ اسکین باز کن',coin:200,shard:2,chk:function(){return [profile.skins.owned.length,5];}},
  {id:'a17',fa:'مد نوین',ic:'♛',desc:'همه‌ی ۱۰ اسکین را باز کن',coin:600,shard:8,chk:function(){return [profile.skins.owned.length,10];}},
  {id:'a18',fa:'نورافکن',ic:'✧',desc:'همه‌ی ۶ افکت شلیک را باز کن',coin:400,shard:5,chk:function(){return [profile.fx.owned.length,6];}},
  {id:'a19',fa:'ریشه‌ی حافظه',ic:'◈',desc:'۲۵ سطح درخت حافظه بخر',coin:200,shard:3,chk:function(){return [totalTreeLevels(),25];}},
  {id:'a20',fa:'استاد حافظه',ic:'◈',desc:'یک شاخه‌ی کامل درخت حافظه را پر کن',coin:350,shard:5,chk:function(){
    var n=0;for(var b=0;b<4;b++)if(branchMaxed(b))n++;return [n,1];}},
  {id:'a21',fa:'فلسفه‌ی مرگ',ic:'♰',desc:'۱۰ بار بمیر («هر مرگ، آغاز تکامل است»)',coin:100,chk:function(){return [A('deaths'),10];}},
  {id:'a22',fa:'ترکیب‌ساز',ic:'⚗',desc:'یک ترکیب ویژه باز کن',coin:150,chk:function(){return [A('combo'),1];}},
  {id:'a23',fa:'آتش‌بازی',ic:'✷',desc:'۲۰۰ دشمن با انفجار بکش',coin:200,chk:function(){return [A('expl'),200];}},
  {id:'a24',fa:'جهش‌یافته',ic:'⟫',desc:'۱۰۰ بار Dash کن',coin:120,chk:function(){return [A('dash'),100];}},
  {id:'a25',fa:'شاگرد اول',ic:'✎',desc:'آموزش را کامل کن',coin:80,chk:function(){return [profile.tutorial?1:0,1];}},
  {id:'a26',fa:'قهرمان گرانش',ic:'★',desc:'۲۵ دور بازی کن',coin:200,shard:3,chk:function(){return [A('runs'),25];}}
];
var ACHS_BY_ID={};
for(var _ai=0;_ai<ACHS.length;_ai++)ACHS_BY_ID[ACHS[_ai].id]=ACHS[_ai];
function checkAchs(){
  var i,a,res;
  for(i=0;i<ACHS.length;i++){
    a=ACHS[i];
    if(profile.ach.unlocked[a.id])continue;
    try{res=a.chk();}catch(e){continue;}
    profile.ach.prog[a.id]=Math.min(res[0],res[1]);
    if(res[0]>=res[1]){
      profile.ach.unlocked[a.id]=1;
      profile.coins+=a.coin;
      if(a.shard)profile.shards+=a.shard;
      updateMissionSum('achs',1);
      UI.toast('🏆 دستاورد: '+a.fa+' (+'+faNum(a.coin)+'◉'+(a.shard?' +'+faNum(a.shard)+'◈':'')+')');
      AudioSys.sfx('levelup');
      saveGame();
    }
  }
}

/* ─── تبلیغ جایزه‌دار: window.showRewardedAd(callback) ───
   نسخه آزمایشی: پیام تبلیغ شبیه‌سازی‌شده + امکان لغو.
   نسخه نهایی: اتصال به SDK تبلیغات مایکت از طریق AndroidBridge (README بخش ۷). */
var adActive=false;
function showRewardedAd(cb){
  if(adActive){if(cb)cb(false);return;}
  adActive=true;
  /* پل اندروید: در نسخه منتشرشده مایکت این مسیر اجرا می‌شود */
  if(window.AndroidBridge&&window.AndroidBridge.showRewardedAd){
    window.onAdReward=function(ok){
      adActive=false;
      window.onAdReward=null;
      try{cb(ok===true);}catch(e){}
    };
    try{window.AndroidBridge.showRewardedAd();return;}catch(e){}
  }
  /* نسخه آزمایشی */
  UI.showAdMock(function(ok){
    adActive=false;
    try{cb(ok===true);}catch(e){}
  });
}
window.showRewardedAd=showRewardedAd;

function grantRandomItem(){
  var pool=['revive','shield','xp2','coin2'];
  var id=pick(pool);
  var have=profile.inv[id]||0;
  if(have>=3){profile.coins+=150;UI.toast('جایزه: ۱۵۰ سکه ◉');}
  else{profile.inv[id]=have+1;UI.toast('آیتم تصادفی: '+SHOP_ITEMS.filter(function(s){return s.id===id;})[0].fa);}
  AudioSys.sfx('buy');
  saveGame();
}

/* ─── پرداخت درون‌برنامه‌ای مایکت (فقط با پل اندروید فعال می‌شود) ─── */
function buyIAP(sku){
  if(!(window.AndroidBridge&&window.AndroidBridge.purchase)){
    UI.toast('پرداخت فقط در نسخه مایکت فعال است');return;
  }
  window.onPurchaseResult=function(sku2,ok){
    if(ok&&sku2===sku){
      for(var i=0;i<IAP_PACKS.length;i++){
        if(IAP_PACKS[i].sku===sku){
          profile.coins+=IAP_PACKS[i].coins;
          UI.toast('خرید موفق: +'+faNum(IAP_PACKS[i].coins)+' سکه');
          break;
        }
      }
      saveGame();
      if(state==='menu')UI.refreshMenu();
      UI.buildShop(UI.shopTab);
    }else{
      UI.toast('پرداخت ناموفق');
    }
  };
  try{window.AndroidBridge.purchase(sku);}catch(e){UI.toast('خطا در اتصال به مایکت');}
}

/* ─── متن داستانی تصادفی ─── */
function storyMaybe(key){
  if(chance(0.3))storyMsg(pick(STORY[key]));
}

/* ════════════════ ۷) رابط کاربری — همه صفحه‌ها و HUD ════════════════ */

var SCREENS=['scr-menu','scr-shop','scr-tree','scr-missions','scr-ach','scr-settings','scr-pause','scr-level','scr-over','scr-ad','scr-confirm','scr-tut','scr-ending'];
var UI={
  shopTab:'skins',
  selectedNode:null,
  _hudCache:{},
  _toastT:null,_storyT:null,_adIv:null,_adCb:null,
  showScreen:function(id){
    for(var i=0;i<SCREENS.length;i++){
      $(SCREENS[i]).classList.toggle('hidden',SCREENS[i]!==id);
    }
  },
  setHud:function(v){$('hud').classList.toggle('hidden',!v);},
  toast:function(msg,dur){
    var t=$('toast');
    t.textContent=msg;
    t.classList.remove('hidden');
    clearTimeout(this._toastT);
    this._toastT=setTimeout(function(){t.classList.add('hidden');},dur||2100);
  },
  storyMsg:function(txt){
    /* روایت فقط داخل بازی — هرگز روی منو/فروشگاه نمی‌افتد */
    if(state!=='playing'&&state!=='levelup'&&state!=='dead'&&state!=='ending')return;
    var s=$('story');
    s.textContent=txt;
    s.classList.remove('hidden');
    clearTimeout(this._storyT);
    this._storyT=setTimeout(function(){s.classList.add('hidden');},3800);
  },
  eventWarn:function(ev){
    $('ew-icon').textContent=ev.icon;
    $('ew-text').textContent='هشدار: '+ev.fa;
    $('eventwarn').classList.remove('hidden');
  },
  hideEventWarn:function(){$('eventwarn').classList.add('hidden');},
  /* ── منوی اصلی ── */
  refreshMenu:function(){
    $('m-coins').textContent=faGroup(profile.coins);
    $('m-shards').textContent=faGroup(profile.shards);
    $('m-best').textContent=faGroup(profile.best.score);
    $('shop-coins').textContent=faGroup(profile.coins);
    $('tree-shards').textContent=faGroup(profile.shards);
    var mv=$('menu-ver');
    if(mv)mv.innerHTML='v'+VERSION+' — آفلاین'+(window.__PATCHED?' <span class="upd">بروزرسانی‌شده</span>':'');
  },
  /* ── HUD هر فریم ── */
  updateHUDFrame:function(){
    if(!run||!player||!player.st)return;
    var c=this._hudCache;
    var hp=clamp(player.hp/player.st.maxhp,0,1);
    $('hpfill').style.width=(hp*100)+'%';
    var hv=faNum(Math.ceil(player.hp));
    if(c.hp!==hv){c.hp=hv;$('hptext').textContent=hv;}
    var xp=clamp(run.xp/run.xpNext,0,1);
    $('xpfill').style.width=(xp*100)+'%';
    var sv=faGroup(run.score);
    if(c.score!==sv){c.score=sv;$('st-score').textContent=sv;}
    var tv=faTime(run.t);
    if(c.time!==tv){c.time=tv;$('st-time').textContent=tv;}
    var kv=faNum(run.kills);
    if(c.kills!==kv){c.kills=kv;$('st-kills').textContent='☠ '+kv;}
    var lv='Lv '+faNum(run.level);
    if(c.lvl!==lv){c.lvl=lv;$('st-lvl').textContent=lv;}
    var chv='فصل '+faNum(Math.min(5,(run.bossKills%5===0&&run.bossKills>0&&run.ended)?5:(run.bossKills%5)+1))+'/۵';
    if(c.ch!==chv){c.ch=chv;$('st-chapter').textContent=chv;}
    var cv2='◉ '+faGroup(run.coinsGot||0);
    if(c.coin!==cv2){c.coin=cv2;$('st-coin').textContent=cv2;}
    var dv='◈ '+faNum(run.shardsGot||0);
    if(c.shard!==dv){c.shard=dv;$('st-shard').textContent=dv;}
    var ev2='⬢ '+faNum(aliveEnemies());
    if(c.enemy!==ev2){c.enemy=ev2;$('st-enemy').textContent=ev2;}
    if(boss){
      $('bossfill').style.width=(clamp(boss.hp/boss.maxhp,0,1)*100)+'%';
    }
    var dcd=player.st.dashCd>0?clamp(player.dashCdT/player.st.dashCd,0,1):0;
    $('dashcd').style.height=(dcd*100)+'%';
  },
  refreshSkillChips:function(){
    if(!run)return;
    var html='',id,lv;
    for(var i=0;i<SKILLS.length;i++){
      var s=SKILLS[i];
      lv=run.skills[s.id]||0;
      if(lv>0)html+='<span class="skchip">'+s.ic+'<small>'+faNum(lv)+'</small></span>';
    }
    for(i=0;i<run.combos.length;i++){
      var cb=COMBOS.filter(function(c){return c.id===run.combos[i];})[0];
      if(cb)html+='<span class="skchip combo">'+cb.ic+'</span>';
    }
    $('skills').innerHTML=html;
  },
  /* ── انتخاب مهارت ── */
  showLevelUp:function(cards){
    $('lv-title').textContent='ارتقا به سطح '+faNum(run.level);
    var wrap=$('cards');
    wrap.innerHTML='';
    for(var i=0;i<cards.length;i++){
      var card=cards[i];
      var div=document.createElement('div');
      var cls='card ',info;
      if(card.type==='skill'){
        var s=SKILLS_BY_ID[card.id];
        var lv2=run.skills[card.id]||0;
        cls+='c'+s.cat;
        info={ic:s.ic,nm:s.fa,ds:s.desc,
          pips:'●'.repeat(lv2+1)+'○'.repeat(s.max-lv2-1)};
      }else if(card.type==='combo'){
        var cb2=COMBOS.filter(function(c){return c.id===card.id;})[0];
        cls+='combo';
        info={ic:cb2.ic,nm:cb2.fa,ds:cb2.ds,pips:'ترکیب ویژه'};
      }else{
        cls+='fb';
        info={ic:card.ic,nm:card.fa,ds:card.desc,pips:'پاداش'};
      }
      div.className=cls+' pop';
      div.style.animationDelay=(i*70)+'ms';
      div.innerHTML='<div class="ic">'+info.ic+'</div><div class="nm">'+info.nm+'</div><div class="ds">'+info.ds+'</div><div class="pips">'+info.pips+'</div>';
      div.onclick=function(cc){return function(){chooseCard(cc);};}(card);
      wrap.appendChild(div);
    }
    this.showScreen('scr-level');
  },
  /* ── فروشگاه ── */
  buildShop:function(tab){
    this.shopTab=tab||this.shopTab;
    var tabs=document.querySelectorAll('#shop-tabs .tab');
    for(var i=0;i<tabs.length;i++)tabs[i].classList.toggle('active',tabs[i].getAttribute('data-tab')===this.shopTab);
    $('shop-coins').textContent=faGroup(profile.coins);
    var grid=$('shop-grid');
    grid.innerHTML='';
    var self=this;
    if(this.shopTab==='skins'){
      for(i=0;i<SKINS.length;i++){
        var sk=SKINS[i];
        var owned=profile.skins.owned.indexOf(sk.id)>=0;
        var eq=profile.skins.eq===sk.id;
        var div=this._itemCard();
        var cv=document.createElement('canvas');
        cv.width=84;cv.height=84;
        div.querySelector('.pv').appendChild(cv);
        this._drawSkinPreview(cv,sk);
        div.querySelector('.nm').innerHTML=sk.fa+'<small>'+sk.en+'</small>';
        div.querySelector('.ds').textContent=sk.desc;
        var btn=document.createElement('button');
        btn.className='btn'+(eq?' primary':'');
        btn.textContent=eq?'در حال استفاده ✓':(owned?'استفاده':'◉ '+faNum(sk.price));
        if(eq)btn.disabled=true;
        btn.onclick=function(sid){return function(){buySkin(sid);};}(sk.id);
        div.querySelector('.pr').appendChild(btn);
        if(eq)div.classList.add('equipped');
        else if(owned)div.classList.add('owned');
        grid.appendChild(div);
      }
    }else if(this.shopTab==='fx'){
      for(i=0;i<FXS.length;i++){
        var fx=FXS[i];
        var owned2=profile.fx.owned.indexOf(fx.id)>=0;
        var eq2=profile.fx.eq===fx.id;
        var div2=this._itemCard();
        var cv2=document.createElement('canvas');
        cv2.width=84;cv2.height=84;
        div2.querySelector('.pv').appendChild(cv2);
        this._drawFxPreview(cv2,fx);
        div2.querySelector('.nm').innerHTML=fx.fa+'<small>'+fx.en+'</small>';
        div2.querySelector('.ds').textContent=fx.desc;
        var btn2=document.createElement('button');
        btn2.className='btn'+(eq2?' primary':'');
        btn2.textContent=eq2?'فعال ✓':(owned2?'استفاده':'◉ '+faNum(fx.price));
        if(eq2)btn2.disabled=true;
        btn2.onclick=function(fid){return function(){buyFx(fid);};}(fx.id);
        div2.querySelector('.pr').appendChild(btn2);
        if(eq2)div2.classList.add('equipped');
        else if(owned2)div2.classList.add('owned');
        grid.appendChild(div2);
      }
    }else{
      for(i=0;i<SHOP_ITEMS.length;i++){
        var it=SHOP_ITEMS[i];
        if(it.cat!==this.shopTab)continue;
        var have=profile.inv[it.id]||0;
        var boughtOnce=it.once&&profile.spec[it.id];
        var div3=this._itemCard();
        div3.querySelector('.pv').innerHTML='<div style="font-size:34px;line-height:84px;text-align:center;color:#5ec8ff;text-shadow:0 0 12px rgba(55,182,255,.6)">'+it.ic+'</div>';
        div3.querySelector('.nm').innerHTML=it.fa;
        div3.querySelector('.ds').textContent=it.desc;
        if(!it.once)div3.insertAdjacentHTML('beforeend','<span class="owncnt">'+faNum(have)+'/'+faNum(it.max)+'</span>');
        var btn3=document.createElement('button');
        btn3.className='btn';
        if(boughtOnce){btn3.textContent='خریداری شده ✓';btn3.disabled=true;}
        else if(!it.once&&have>=it.max){btn3.textContent='حداکثر ✓';btn3.disabled=true;}
        else btn3.textContent='◉ '+faNum(it.price);
        btn3.onclick=function(iid){return function(){buyShopItem(iid);};}(it.id);
        div3.querySelector('.pr').appendChild(btn3);
        grid.appendChild(div3);
      }
      /* پرداخت درون‌برنامه‌ای — فقط با پل اندروید مایکت */
      if(this.shopTab==='spec'&&window.AndroidBridge&&window.AndroidBridge.purchase){
        for(i=0;i<IAP_PACKS.length;i++){
          var pk=IAP_PACKS[i];
          var div4=this._itemCard();
          div4.querySelector('.pv').innerHTML='<div style="font-size:34px;line-height:84px;text-align:center;color:#ffd254">◉</div>';
          div4.querySelector('.nm').innerHTML=pk.fa;
          div4.querySelector('.ds').textContent='خرید امن از طریق مایکت';
          var btn4=document.createElement('button');
          btn4.className='btn adbtn';
          btn4.textContent='خرید از مایکت';
          btn4.onclick=function(sku){return function(){buyIAP(sku);};}(pk.sku);
          div4.querySelector('.pr').appendChild(btn4);
          grid.appendChild(div4);
        }
      }
    }
    if(!grid.children.length)grid.innerHTML='<div class="iap-note">آیتمی در این دسته نیست</div>';
  },
  _itemCard:function(){
    var d=document.createElement('div');
    d.className='item-card';
    d.innerHTML='<div class="pv"></div><div class="nm"></div><div class="ds"></div><div class="pr"></div>';
    return d;
  },
  _drawSkinPreview:function(cv,sk){
    var g=cv.getContext('2d');
    g.clearRect(0,0,84,84);
    var gr=g.createRadialGradient(42,42,2,42,42,38);
    gr.addColorStop(0,hexA(sk.glow,0.5));
    gr.addColorStop(1,hexA(sk.glow,0));
    g.fillStyle=gr;g.fillRect(0,0,84,84);
    if(ANIMS.ready&&drawAnimFrame(g,sk.an,'idle',frameT/1000,42,44,80)){
      /* پیش‌نمایش زنده اسکین */
    }else{
      g.save();g.translate(42,42);g.rotate(-0.7);
      this._shipOn(g,sk,1.9);
      g.restore();
    }
  },
  _shipOn:function(g,sk,sc){
    g.scale(sc,sc);
    g.fillStyle=sk.col;
    g.strokeStyle='rgba(255,255,255,.75)';
    g.lineWidth=1;
    g.beginPath();
    if(sk.shape===0){g.moveTo(16,0);g.lineTo(-10,-10);g.lineTo(-5,0);g.lineTo(-10,10);}
    else if(sk.shape===1){g.moveTo(18,0);g.lineTo(-8,-7);g.lineTo(-12,0);g.lineTo(-8,7);}
    else if(sk.shape===2){g.moveTo(14,-2);g.lineTo(-4,-13);g.lineTo(-9,-3);g.lineTo(-5,0);g.lineTo(-9,3);g.lineTo(-4,13);}
    else{g.moveTo(15,0);g.lineTo(0,-12);g.lineTo(-11,0);g.lineTo(0,12);}
    g.closePath();g.fill();g.stroke();
    g.fillStyle=hexA(sk.glow,0.9);
    g.beginPath();g.arc(1,0,3.2,0,TAU);g.fill();
    g.fillStyle='#fff';
    g.beginPath();g.arc(1,0,1.3,0,TAU);g.fill();
  },
  _drawFxPreview:function(cv,fx){
    var g=cv.getContext('2d');
    g.clearRect(0,0,84,84);
    var gr=g.createRadialGradient(42,42,2,42,42,34);
    gr.addColorStop(0,hexA(fx.col,0.55));
    gr.addColorStop(1,hexA(fx.col,0));
    g.fillStyle=gr;g.fillRect(0,0,84,84);
    g.save();g.translate(42,42);
    g.fillStyle=fx.col;g.strokeStyle=fx.col;
    if(fx.id==='plasma'){g.beginPath();g.ellipse(0,0,16,6,0,0,TAU);g.fill();g.fillStyle='#eaffff';g.beginPath();g.arc(6,0,3,0,TAU);g.fill();}
    else if(fx.id==='laser'){g.fillRect(-20,-2,40,4);g.fillStyle='#ffdde4';g.fillRect(-20,-0.8,40,1.6);}
    else if(fx.id==='electric'){g.lineWidth=2.5;g.beginPath();g.moveTo(-18,0);g.lineTo(-6,-6);g.lineTo(4,4);g.lineTo(18,-2);g.stroke();}
    else if(fx.id==='fire'){g.beginPath();g.moveTo(16,0);g.lineTo(-8,-8);g.lineTo(-3,0);g.lineTo(-8,8);g.closePath();g.fill();}
    else if(fx.id==='crystal'){g.rotate(0.6);g.beginPath();g.moveTo(0,-13);g.lineTo(8,0);g.lineTo(0,13);g.lineTo(-8,0);g.closePath();g.fill();}
    else{g.rotate(0.4);g.beginPath();g.moveTo(0,-16);g.lineTo(4,-4);g.lineTo(16,0);g.lineTo(4,4);g.lineTo(0,16);g.lineTo(-4,4);g.lineTo(-16,0);g.lineTo(-4,-4);g.closePath();g.fill();}
    g.restore();
  },
  /* ── درخت حافظه ── */
  buildTree:function(){
    $('tree-shards').textContent=faGroup(profile.shards);
    var cols=$('tree-cols');
    cols.innerHTML='';
    for(var b=0;b<4;b++){
      var col=document.createElement('div');
      col.className='tcol';
      var sum=0;
      var nodes=TREE.filter(function(n){return n.br===b;});
      for(var i=0;i<nodes.length;i++)sum+=profile.tree[nodes[i].id]||0;
      var hdr=document.createElement('div');
      hdr.className='tbr '+BRANCHES[b].cls;
      hdr.textContent=BRANCHES[b].fa+' ('+faNum(sum)+'/۲۰)';
      col.appendChild(hdr);
      for(i=0;i<nodes.length;i++){
        var node=nodes[i];
        var lv3=profile.tree[node.id]||0;
        var el=document.createElement('div');
        el.className='tnode'+(lv3>=5?' max':'')+(this.selectedNode===node.id?' sel':'');
        el.innerHTML=node.fa+'<span class="lv">'+'●'.repeat(lv3)+'○'.repeat(5-lv3)+'</span>';
        el.onclick=function(nid){return function(){UI.selectTreeNode(nid);};}(node.id);
        col.appendChild(el);
      }
      cols.appendChild(col);
    }
    if(this.selectedNode)this.selectTreeNode(this.selectedNode);
  },
  selectTreeNode:function(id){
    this.selectedNode=id;
    var node=TREE_BY_ID[id];
    var lv4=profile.tree[id]||0;
    var els=document.querySelectorAll('#tree-cols .tnode');
    for(var i=0;i<els.length;i++){
      var has=els[i].textContent.indexOf(node.fa)>=0;
      els[i].classList.toggle('sel',has&&lv4<5);
      els[i].classList.toggle('max',has&&lv4>=5);
    }
    $('tp-name').textContent=node.fa;
    $('tp-desc').textContent=node.per+' در هر سطح';
    $('tp-lv').textContent='سطح '+faNum(lv4)+' از ۵ — شاخه: '+BRANCHES[node.br].fa;
    var btn=$('tp-buy');
    if(lv4>=5){btn.textContent='کامل ✓';btn.disabled=true;}
    else{
      var cost=nodeCost(node,lv4);
      btn.textContent='ارتقا — ◈ '+faNum(cost);
      btn.disabled=profile.shards<cost;
    }
    $('tree-panel').classList.remove('hidden');
  },
  /* ── مأموریت‌ها ── */
  buildMissions:function(){
    var list=$('mission-list');
    list.innerHTML='';
    var done=0;
    for(var i=0;i<MISSIONS.length;i++){
      var m=MISSIONS[i];
      var prog=profile.missions.prog[m.key]||0;
      var claimed=!!profile.missions.claimed[m.id];
      var complete=prog>=m.goal;
      if(claimed)done++;
      var isDaily=profile.missions.daily.indexOf(m.id)>=0;
      var row=document.createElement('div');
      row.className='mrow'+(complete?' done':'')+(claimed?' claimed':'')+(isDaily?' daily':'');
      row.innerHTML=
        '<div class="mic">'+m.ic+'</div>'+
        '<div class="mbody"><div class="mnm">'+(isDaily?'<span class="dbadge">روزانه ×۲</span>':'')+m.fa+'</div>'+
        '<div class="mbar"><div class="mfill" style="width:'+clamp(prog/m.goal,0,1)*100+'%"></div></div>'+
        '<div class="mtx">'+faNum(Math.min(prog,m.goal))+' / '+faNum(m.goal)+'</div></div>'+
        '<div class="mact"><div class="rw">◉'+faNum(m.coin)+(m.shard?' ◈'+faNum(m.shard):'')+'</div></div>';
      var act=row.querySelector('.mact');
      if(claimed){
        act.insertAdjacentHTML('beforeend','<div style="color:var(--energy);font-size:14px">✓</div>');
      }else if(complete){
        var btn=document.createElement('button');
        btn.className='btn primary';
        btn.textContent='دریافت';
        btn.onclick=function(mid){return function(){claimMission(mid);};}(m.id);
        act.appendChild(btn);
      }
      list.appendChild(row);
    }
    $('mission-day').textContent='دریافت‌شده: '+faNum(done)+'/'+faNum(MISSIONS.length);
  },
  /* ── دستاوردها ── */
  buildAch:function(){
    var list=$('ach-list');
    list.innerHTML='';
    var unlocked=0;
    for(var i=0;i<ACHS.length;i++){
      var a=ACHS[i];
      var un=!!profile.ach.unlocked[a.id];
      if(un)unlocked++;
      var prog=profile.ach.prog[a.id]||0;
      var res=[prog,a.coin];
      try{res=a.chk();}catch(e){}
      var row=document.createElement('div');
      row.className='mrow'+(un?' ach-done':' ach-locked');
      row.innerHTML=
        '<div class="mic" style="'+(un?'':'filter:grayscale(1);opacity:.5')+'">'+a.ic+'</div>'+
        '<div class="mbody"><div class="mnm">'+a.fa+'</div>'+
        '<div class="mbar"><div class="mfill" style="width:'+clamp(res[0]/(res[1]||1),0,1)*100+'%"></div></div>'+
        '<div class="mtx">'+a.desc+' — '+faNum(Math.min(res[0],res[1]))+'/'+faNum(res[1])+'</div></div>'+
        '<div class="mact"><div class="rw">◉'+faNum(a.coin)+(a.shard?' ◈'+faNum(a.shard):'')+'</div>'+
        (un?'<div style="color:var(--gold);font-size:14px">★</div>':'')+'</div>';
      list.appendChild(row);
    }
    $('ach-progress').textContent=faNum(unlocked)+'/'+faNum(ACHS.length);
  },
  /* ── توقف ── */
  fillPause:function(){
    $('pz-info').innerHTML='امتیاز: <b>'+faGroup(run.score)+'</b> — زمان: <b>'+faTime(run.t)+'</b> — کشتار: <b>'+faNum(run.kills)+'</b> — سطح: <b>'+faNum(run.level)+'</b>';
  },
  /* ── پایان دور ── */
  showGameOver:function(r){
    var er=r.endRewards||r.preview||{coins:0,shards:0};
    var g=$('go-grid');
    g.innerHTML='';
    this._gcell(g,'امتیاز',faGroup(r.score));
    this._gcell(g,'زمان بقا',faTime(r.t));
    this._gcell(g,'دشمنان',faNum(r.kills));
    this._gcell(g,'باس‌ها',faNum(r.bossKills));
    this._gcell(g,'سطح',faNum(r.level));
    this._gcell(g,'سکه‌ی دور',faNum(r.coinsGot));
    var rw=$('go-rewards');
    rw.innerHTML='';
    var ep=document.createElement('div');
    ep.className='mini';
    ep.style.margin='0 auto 10px';
    ep.style.opacity='0.85';
    ep.textContent=EPITAPHS[Math.floor(Math.random()*EPITAPHS.length)];
    rw.appendChild(ep);
    var c1=document.createElement('span');
    c1.className='res-chip gold';
    c1.innerHTML='◉ <b>+'+faGroup(er.coins+(r.doubleUsed?er.coins:0))+'</b>';
    rw.appendChild(c1);
    var c2=document.createElement('span');
    c2.className='res-chip cyan';
    c2.innerHTML='◈ <b>+'+faNum(er.shards+(r.doubleUsed?er.shards:0))+'</b>';
    rw.appendChild(c2);
    $('go-new').classList.toggle('hidden',!(er.newScore||er.newTime));
    $('go-title').textContent=r.reason==='quit'?'پایان داوطلبانه':'پایان دور';
    var rv=$('btn-revive');
    var canRevive=!r.ended&&r.reviveUsed<(player&&player.st?player.st.reviveMax:CFG.reviveMax);
    rv.classList.toggle('hidden',!canRevive);
    if(canRevive){
      rv.textContent=profile.inv.revive>0
        ?'احیا با توکن (✚ '+faNum(profile.inv.revive)+')'
        :'احیا (تبلیغ ▶)';
    }
    $('btn-double').disabled=r.doubleUsed;
    $('btn-double').textContent=r.doubleUsed?'پاداش دوبرابر شد ✓':'▶ دو برابر کردن پاداش';
    $('btn-random-item').disabled=r.itemUsed;
    $('btn-random-item').textContent=r.itemUsed?'دریافت شد ✓':'▶ دریافت آیتم تصادفی';
    this.showScreen('scr-over');
  },
  _gcell:function(g,label,val){
    var d=document.createElement('div');
    d.className='gcell';
    d.innerHTML='<b>'+val+'</b><span>'+label+'</span>';
    g.appendChild(d);
  },
  /* ── تبلیغ آزمایشی ── */
  showAdMock:function(cb){
    this._adCb=cb;
    var t=5;
    $('ad-timer').textContent=faNum(t);
    var claim=$('btn-ad-claim');
    claim.disabled=true;
    this.showScreen('scr-ad');
    clearInterval(this._adIv);
    this._adIv=setInterval(function(){
      t--;
      $('ad-timer').textContent=faNum(Math.max(0,t));
      if(t<=0){
        clearInterval(UI._adIv);
        claim.disabled=false;
        $('ad-timer').textContent='✓';
      }
    },1000);
  },
  _adDone:function(ok){
    clearInterval(this._adIv);
    this.showScreen(run&&run.ended?'scr-over':null);
    var cb=this._adCb;
    this._adCb=null;
    if(cb)cb(ok);
  },
  /* ── تأیید ── */
  confirmBox:function(title,text,cb){
    $('cf-title').textContent=title;
    $('cf-text').textContent=text;
    this._cfCb=cb;
    this.showScreen('scr-confirm');
  },
  _cfAnswer:function(yes){
    this.showScreen(this._cfFrom||'scr-menu');
    var cb=this._cfCb;
    this._cfCb=null;
    if(cb)cb(yes);
  },
  _cfFrom:null,
  /* ── تنظیمات ── */
  syncSettings:function(){
    $('tg-music').classList.toggle('on',profile.set.music);
    $('tg-sfx').classList.toggle('on',profile.set.sfx);
    $('tg-vib').classList.toggle('on',profile.set.vib);
    var segs=document.querySelectorAll('#qual-seg .segb');
    for(var i=0;i<segs.length;i++)segs[i].classList.toggle('on',+segs[i].getAttribute('data-q')===profile.set.quality);
    var t=profile.totals;
    $('set-stats').innerHTML='دورها: '+faNum(t.runs)+' — کل کشتار: '+faGroup(t.kills)+
      ' — باس‌ها: '+faNum(t.boss)+' — مرگ‌ها: '+faNum(t.deaths)+
      '<br>بیشترین امتیاز: '+faGroup(profile.best.score)+' — بیشترین بقا: '+faTime(profile.best.time);
  },
  /* ── آموزش ── */
  setTut:function(step){
    var texts={
      1:'انگشتت را روی صفحه بکش تا حرکت کنی',
      2:'شلیک خودکار فعال است — دشمنان را نابود کن',
      3:'دکمه‌ی جهش (⟫) را بزن تا از خطر جاخالی بدهی',
      4:'با XP ارتقا می‌گیری — یکی از مهارت‌ها را انتخاب کن'
    };
    $('tut-step').textContent=faNum(step)+'/۴';
    $('tut-text').textContent=texts[step]||'';
    this.showScreen('scr-tut');
  },
  hideTut:function(){this.showScreen(null);},
  /* ── پیش‌نمایش اسکین منوی اصلی ── */
  drawMenuSkin:function(){
    var cv=$('menu-skin-cv');
    if(!cv||cv.classList.contains('hidden'))return;
    var g=cv.getContext('2d');
    g.clearRect(0,0,150,150);
    var sk=SKINS_BY_ID[profile.skins.eq]||SKINS[0];
    var gr=g.createRadialGradient(75,75,4,75,75,64);
    gr.addColorStop(0,hexA(sk.glow,0.4));
    gr.addColorStop(1,hexA(sk.glow,0));
    g.fillStyle=gr;g.fillRect(0,0,150,150);
    g.save();
    g.translate(75,75);
    g.rotate(Math.sin(frameT*0.0006)*0.35-0.5);
    this._shipOn(g,sk,3.4);
    g.restore();
  }
};
/* نماینده‌های سراسری برای استفاده در بخش‌های دیگر */
function storyMsg(txt){UI.storyMsg(txt);}

/* ════════════════ ۸) حلقه اصلی: رندر، مرگ سینمایی، راه‌اندازی ════════════════ */

var lastTs=0,deadT=0,slowMoT=0,slowMoF=1,flashT=0,flashMax=1,flashCol='#ffffff',bgGrad=null,bgW=0;
var tutStep=0,tutT=0;
var storyIdx=0;

function slowMo(f,t){slowMoF=f;slowMoT=t;}
function flashScreen(col,a){flashCol=col;flashT=a;flashMax=a;}

/* ─── پس‌زمینه ─── */
function drawBackground(t){
  if(!bgGrad||bgW!==W){
    bgGrad=ctx.createLinearGradient(0,0,0,H);
    bgGrad.addColorStop(0,'#05060f');
    bgGrad.addColorStop(1,'#0a0f24');
    bgW=W;
  }
  ctx.fillStyle=bgGrad;
  ctx.fillRect(0,0,W,H);
  drawEnvTint();
  drawEnvFar(t);
  var i,n,st;
  for(i=0;i<nebulas.length;i++){
    n=nebulas[i];
    var nx=W/2+(n.x-cam.x*0.1)+Math.sin(t*0.0001+n.p)*24;
    var ny=H/2+(n.y-cam.y*0.1)+Math.cos(t*0.00013+n.p)*18;
    if(nx<-500||nx>W+500||ny<-500||ny>H+500)continue;
    drawGlow(nx,ny,n.col,n.r,0.16);
  }
  var par=[0.15,0.35,0.6];
  for(i=0;i<stars.length;i++){
    st=stars[i];
    var sx=W/2+(st.x-cam.x)*par[st.layer];
    var sy=H/2+(st.y-cam.y)*par[st.layer];
    if(sx<-8||sx>W+8||sy<-8||sy>H+8)continue;
    var tw=0.45+0.55*Math.abs(Math.sin(t*0.001+st.p));
    ctx.globalAlpha=tw*(0.35+st.layer*0.25);
    ctx.fillStyle=st.layer===2?'#cfe8ff':'#9fb8e8';
    ctx.fillRect(sx,sy,st.s,st.s);
  }
  ctx.globalAlpha=1;
  drawEnvLayer(t);
  for(i=0;i<elines.length;i++){
    var l=elines[i];
    var lx=W/2+(l.x-cam.x)*0.45+Math.sin(t*0.0002+l.p)*40;
    var ly=H/2+(l.y-cam.y)*0.45+Math.cos(t*0.00017+l.p)*30;
    if(lx<-260||lx>W+260||ly<-260||ly>H+260)continue;
    var la=0.12+0.1*Math.abs(Math.sin(t*0.0009+l.p));
    ctx.strokeStyle='rgba(84,240,224,'+la+')';
    ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(lx,ly);
    ctx.lineTo(lx+Math.cos(l.ang)*l.len,ly+Math.sin(l.ang)*l.len);
    ctx.stroke();
  }
}

/* ─── رندر جهان ─── */
function renderWorld(t){
  ctx.save();
  ctx.translate(W/2-cam.x+shakeX(),H/2-cam.y+shakeY());
  /* مرز میدان گرانشی */
  var envRGB=curEnv().rgb;
  ctx.strokeStyle='rgba('+envRGB+',0.22)';
  ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(0,0,WORLD_R,0,TAU);ctx.stroke();
  for(var seg=0;seg<3;seg++){
    var sa=t*0.0006+seg*TAU/3;
    ctx.strokeStyle='rgba('+envRGB+',0.55)';
    ctx.lineWidth=4;
    ctx.beginPath();ctx.arc(0,0,WORLD_R,sa,sa+1.7);ctx.stroke();
  }
  drawZones();
  drawObstacles();
  drawPickups();
  drawTrail();
  drawEnemies();
  drawCorpses();
  drawBoss();
  drawPlayer();
  drawBullets();
  drawEBullets();
  /* پرتوهای لیزر */
  for(var i=0;i<lasers.length;i++){
    var L=lasers[i];
    var a=clamp(L.t/L.max,0,1);
    ctx.strokeStyle='rgba(255,84,112,'+(0.85*a)+')';
    ctx.lineWidth=22*a;
    ctx.beginPath();
    ctx.moveTo(L.x,L.y);
    ctx.lineTo(L.x+Math.cos(L.ang)*L.len,L.y+Math.sin(L.ang)*L.len);
    ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,'+(0.9*a)+')';
    ctx.lineWidth=5*a;
    ctx.beginPath();
    ctx.moveTo(L.x,L.y);
    ctx.lineTo(L.x+Math.cos(L.ang)*L.len,L.y+Math.sin(L.ang)*L.len);
    ctx.stroke();
  }
  drawFXAll();
  drawParts();
  drawFloats();
  drawCombo();
  ctx.restore();
  /* رویداد تاریکی */
  if(dir.event&&dir.event.id==='dark'){
    var ds=buildDarkSprite();
    var px=W/2+(player.x-cam.x),py=H/2+(player.y-cam.y);
    ctx.drawImage(ds,px-700,py-700);
  }
  /* طوفان انرژی */
  if(dir.event&&dir.event.id==='storm'){
    for(var s2=0;s2<6;s2++){
      var sx2=rand(0,W),sy2=rand(0,H);
      ctx.strokeStyle='rgba(84,240,224,'+rand(0.1,0.35)+')';
      ctx.lineWidth=1.5;
      ctx.beginPath();
      ctx.moveTo(sx2,sy2);
      ctx.lineTo(sx2+rand(-60,60),sy2+rand(80,180));
      ctx.stroke();
    }
  }
  /* وینیت */
  if(vigCv)ctx.drawImage(vigCv,0,0,W,H);
  /* نشانگر لبه برای باس و یاقوت‌ها */
  drawEdgeIndicators();
  /* فلش سینمایی */
  if(flashT>0){
    ctx.globalAlpha=clamp(flashT/flashMax,0,1);
    ctx.fillStyle=flashCol;
    ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=1;
  }
}
function drawEdgeIndicators(){
  var list=[];
  if(boss)list.push({x:boss.x,y:boss.y,col:boss.def.col});
  for(var i=0;i<enemies.length;i++){
    if(enemies[i].elite)list.push({x:enemies[i].x,y:enemies[i].y,col:'#ffd254'});
  }
  for(i=0;i<list.length;i++){
    var e2=list[i];
    var sx=W/2+(e2.x-cam.x),sy=H/2+(e2.y-cam.y);
    if(sx>30&&sx<W-30&&sy>30&&sy<H-30)continue;
    var cx2=clamp(sx,26,W-26),cy2=clamp(sy,26,H-26);
    var a2=Math.atan2(sy-cy2,sx-cx2);
    ctx.save();
    ctx.translate(cx2,cy2);
    ctx.rotate(a2);
    ctx.fillStyle=e2.col;
    ctx.globalAlpha=0.75;
    ctx.beginPath();
    ctx.moveTo(10,0);ctx.lineTo(-6,-6);ctx.lineTo(-6,6);
    ctx.closePath();ctx.fill();
    ctx.restore();
    ctx.globalAlpha=1;
  }
}

/* ─── به‌روزرسانی وضعیت playing ─── */
function update(dt){
  updateFX(dt);
  updateCorpses(dt);
  updateEnvAmbient(dt);
  run.t+=dt;
  /* ضرب‌آهنگ‌های داستانی میانه‌ی دور */
  if(!run.midTold)run.midTold={};
  var MID=[60,180,420,720,1080];
  for(var _mi=0;_mi<MID.length;_mi++){
    if(run.t>=MID[_mi]&&!run.midTold[MID[_mi]]){
      run.midTold[MID[_mi]]=true;
      storyMsg(STORY.mid[_mi]);
      break;
    }
  }
  frameLoopCommon(dt);
  updatePlayer(dt);
  updateEnemies(dt);
  updateBoss(dt);
  updateBullets(dt);
  updateEBullets(dt);
  updatePickups(dt);
  updateDirector(dt);
  /* ذخیره خودکار وضعیت دور */
  run.snapT=(run.snapT||0)+dt;
  if(run.snapT>8){run.snapT=0;snapshotRun();}
  /* تایمر کمبو */
  if(run.comboT>0){run.comboT-=dt;if(run.comboPop>0)run.comboPop-=dt;if(run.comboT<=0)run.combo=0;}
  /* آموزش */
  if(run.tutorial)tutTick(dt);
}
function frameLoopCommon(dt){
  updateZones(dt);
  updatePendingBooms(dt);
  for(var i=lasers.length-1;i>=0;i--){
    lasers[i].t-=dt;
    if(lasers[i].t<=0)lasers.splice(i,1);
  }
  updateTrail(dt);
  updateParts(dt);
  updateFloats(dt);
  updateCam(dt);
  cam.shake=Math.max(0,cam.shake-dt*10);
  flashT=Math.max(0,flashT-dt);
}
function updateAmbient(dt){
  updateParts(dt);
  updateFloats(dt);
  flashT=Math.max(0,flashT-dt);
  cam.shake=Math.max(0,cam.shake-dt*10);
}

/* ─── مرگ سینمایی ─── */
function playerDie(){
  if(state!=='playing'||!player.alive)return;
  player.alive=false;
  state='dead';
  deadT=0;
  AudioSys.sfx('die');
  vib(260);
  addShake(10);
  slowMo(0.25,1.1);
  flashScreen('#ffffff',0.3);
  burst(player.x,player.y,SKINS_BY_ID[profile.skins.eq].glow,40,340,0.9);
  burst(player.x,player.y,'#ffffff',20,220,0.6);
  zones.push({kind:'nova',x:player.x,y:player.y,r:220,t:0.8,max:0.8,col:'#5ec8ff'});
  spawnFX('deathexp',player.x,player.y,200);
  spawnFX('lightning',player.x,player.y,160);
  spawnFX('ring',player.x,player.y,210);
  profile.totals.deaths++;
  storyMsg(pick(STORY.death));
}
function finishDeath(){
  run.preview=endRunCompute();
  state='over';
  UI.setHud(false);
  UI.showGameOver(run);
}

/* ─── شروع و پایان دور ─── */
function clearWorld(){
  enemies.length=0;bullets.length=0;ebullets.length=0;parts.length=0;
  gems.length=0;coins.length=0;hearts.length=0;floats.length=0;
  zones.length=0;meteors.length=0;lasers.length=0;trail.length=0;
  orbs.length=0;obstacles.length=0;pendingBooms.length=0;
  corpses.length=0;
  boss=null;
  $('bossbar').classList.add('hidden');
}
function startRun(){
  clearWorld();
  UI.showScreen(null);
  UI.hideEventWarn();
  UI.setHud(true);
  var seed=((Date.now()%2147483647)^(profile.totals.runs*7919))|0;
  run={
    t:0,score:0,kills:0,bossKills:0,level:1,xp:0,xpNext:xpNeed(1),xpTotal:0,
    skills:{},combos:[],pendingLv:0,skillPicks:0,
    expl:0,energy:0,sniper:0,crystals:0,elites:0,dashes:0,
    coinsGot:0,shardsGot:0,reviveUsed:0,bossCleanCount:0,
    combo:0,comboT:0,comboPop:0,
    bossTitanKilled:false,bossMemoryKilled:false,
    noDmgT:0,seed:seed,ended:false,doubleUsed:false,itemUsed:false,
    tutorial:false,reason:'death'
  };
  /* آیتم‌های مصرفی پیش از دور */
  if(profile.inv.shield>0){profile.inv.shield--;run.startShield=true;}
  if(profile.inv.xp2>0){profile.inv.xp2--;run.xp2=true;}
  if(profile.inv.coin2>0){profile.inv.coin2--;run.coin2=true;}
  saveGame();
  runRng=mulberry32(seed);
  genObstacles();
  resetDirector();
  initPlayer();
  recalcStats();
  player.hp=player.st.maxhp;
  if(run.startShield){player.shieldReady=true;player.shieldT=0;spawnFX('shield',player.x,player.y,110);}
  if(profile.spec.spec_startlvl){run.level=2;run.xpNext=xpNeed(2);}
  cam.x=0;cam.y=0;cam.shake=0;
  state='playing';
  AudioSys.applySettings();
  storyMsg(STORY.intro[profile.totals.runs%STORY.intro.length]);
  setTimeout(function(){if(run&&state==='playing')showChapterCard(0);},1400);
  snapshotRun();
  /* آموزش اولیه */
  if(!profile.tutorial){
    run.tutorial=true;
    setTutStep(1);
  }
  UI.refreshSkillChips();
}
function resumeFromSnapshot(){
  var sn=profile.snapshot;
  startRun();
  if(!sn)return;
  run.t=sn.t||0;
  run.level=sn.level||1;
  run.xp=sn.xp||0;
  run.xpNext=sn.xpNext||xpNeed(run.level);
  run.score=sn.score||0;
  run.kills=sn.kills||0;
  run.bossKills=sn.bossKills||0;
  run.skills=sn.skills||{};
  run.combos=sn.combos||[];
  run.coinsGot=sn.coinsGot||0;
  dir.bossIdx=bossesPassedCount(run.t);
  recalcStats();
  player.hp=player.st.maxhp;
  clearSnapshot();
  storyMsg('دور قبلی بازیابی شد — ادامه بده!');
  UI.refreshSkillChips();
}
function endRunCompute(){
  var mins=run.t/60;
  var st=player.st;
  var prevBest=profile.best.score,prevTime=profile.best.time;
  var endCoins=Math.round((Math.floor(run.score/130)+run.bossKills*25+Math.floor(mins*6))*st.coinMul);
  var endShards=Math.max(1,Math.round(1+mins+run.bossKills*2));
  return {
    coins:run.coinsGot+endCoins,
    shards:run.shardsGot+endShards,
    newScore:run.score>prevBest&&run.score>0,
    newTime:run.t>prevTime
  };
}
function endRun(reason){
  if(!run||run.ended)return;
  run.ended=true;
  run.reason=reason;
  var er=endRunCompute();
  profile.coins+=er.coins;
  profile.shards+=er.shards;
  var t=profile.totals;
  t.kills+=run.kills;t.boss+=run.bossKills;t.runs++;t.time+=run.t;
  t.dash+=run.dashes;t.coins+=er.coins;t.xp+=run.xpTotal;
  t.expl+=run.expl;t.energy+=run.energy;t.sniper+=run.sniper;
  t.crystals+=run.crystals;t.elites+=run.elites;t.revives+=run.reviveUsed;
  t.cleanBoss+=run.bossCleanCount;
  if(run.bossTitanKilled)t.bossTitan++;
  if(run.bossMemoryKilled)t.bossMemory++;
  if(run.score>profile.best.score)profile.best.score=run.score;
  if(run.t>profile.best.time)profile.best.time=run.t;
  if(run.kills>profile.best.kills)profile.best.kills=run.kills;
  if(run.level>profile.best.level)profile.best.level=run.level;
  /* مأموریت‌ها */
  updateMissionSum('kills',run.kills);
  updateMissionSum('boss',run.bossKills);
  updateMissionSum('runs',1);
  updateMissionSum('expl',run.expl);
  updateMissionSum('sniper',run.sniper);
  updateMissionSum('crystals',run.crystals);
  updateMissionSum('coins',er.coins);
  updateMissionSum('dash',run.dashes);
  updateMissionSum('energy',run.energy);
  updateMissionSum('elites',run.elites);
  updateMissionSum('revives',run.reviveUsed);
  updateMissionSum('cleanBoss',run.bossCleanCount);
  updateMissionBest('bestTime',run.t);
  updateMissionBest('bestLevel',run.level);
  updateMissionBest('skillsBest',run.skillPicks);
  updateMissionBest('xpBest',run.xpTotal);
  updateMissionBest('noDmg',run.noDmgT);
  run.endRewards=er;
  if(er.shards>0)storyMsg(pick(STORY.mem));
  clearSnapshot();
  checkAchs();
  saveGame();
}
/* ─── احیا ─── */
function reviveClick(){
  if(!run||run.ended)return;
  if(run.reviveUsed>=player.st.reviveMax){UI.toast('احیای بیشتری در این دور نداری');return;}  if(profile.inv.revive>0){
    profile.inv.revive--;
    saveGame();
    doRevive();
  }else{
    showRewardedAd(function(ok){
      if(ok)doRevive();
      else UI.toast('احیا لغو شد');
    });
  }
}
function doRevive(){
  run.reviveUsed++;
  profile.totals.revives++;
  player.alive=true;
  player.hp=player.st.maxhp*0.5;
  player.inv=2.5;
  player.shieldReady=true;
  player.shieldT=0;
  state='playing';
  deadT=0;
  UI.showScreen(null);
  UI.setHud(true);
  /* دفع دشمنان اطراف */
  for(var i=0;i<enemies.length;i++){
    var e=enemies[i];
    var d=dist(e.x,e.y,player.x,player.y);
    if(d<300){
      var p=nrm(e.x-player.x,e.y-player.y);
      e.vx+=p.x*560;e.vy+=p.y*560;
      damageEnemy(e,25,false,null,'repel');
    }
  }
  zones.push({kind:'nova',x:player.x,y:player.y,r:280,t:0.6,max:0.6,col:'#8cff96'});
  flashScreen('#8cff96',0.25);
  AudioSys.sfx('revive');
  storyMsg('بازگشتی، بازمانده!');
  saveGame();
}
/* ─── پاداش تبلیغی پایان دور ─── */
function doubleReward(){
  if(!run||run.doubleUsed)return;
  if(!run.ended)endRun(run.reason||'death');
  showRewardedAd(function(ok){
    if(ok&&run.endRewards){
      profile.coins+=run.endRewards.coins;
      profile.shards+=run.endRewards.shards;
      run.doubleUsed=true;
      AudioSys.sfx('buy');
      UI.toast('پاداش دو برابر شد!');
      saveGame();checkAchs();
      UI.showGameOver(run);
    }
  });
}
function randomItemAd(){
  if(!run||run.itemUsed)return;
  if(!run.ended)endRun(run.reason||'death');
  showRewardedAd(function(ok){
    if(ok){
      run.itemUsed=true;
      grantRandomItem();
      UI.showGameOver(run);
    }
  });
}

/* ─── توقف و منو ─── */
function pauseGame(){
  if(state!=='playing')return;
  state='paused';
  snapshotRun();
  saveGame();
  UI.fillPause();
  UI.showScreen('scr-pause');
}
function resumeGame(){
  if(state!=='paused')return;
  state='playing';
  UI.showScreen(null);
}
function quitRun(){
  if(state!=='paused')return;
  endRun('quit');
  state='over';
  UI.setHud(false);
  UI.showGameOver(run);
}
function goMenu(){
  state='menu';
  UI.setHud(false);
  UI.showScreen('scr-menu');
  UI.refreshMenu();
  AudioSys.applySettings();
}
/* ─── آموزش ─── */
function setTutStep(n){
  tutStep=n;tutT=0;
  if(n<=4)UI.setTut(n);
  else finishTutorial();
}
function tutTick(dt){
  tutT+=dt;
  if(tutStep===1&&(input.moveDist>160||tutT>12))setTutStep(2);
  else if(tutStep===2&&(run.kills>=1||tutT>14))setTutStep(3);
  else if(tutStep===3&&(run.dashes>=1||tutT>12))setTutStep(4);
  else if(tutStep===4&&tutT>22)setTutStep(5);
}
function finishTutorial(){
  if(!run.tutorial)return;
  run.tutorial=false;
  profile.tutorial=true;
  saveGame();
  UI.hideTut();
  UI.toast('آموزش کامل شد ✓ قطعات حافظه ◈ را در درخت حافظه مصرف کن',3200);
  checkAchs();
}

/* ─── حلقه اصلی ─── */
function loop(ts){
  requestAnimationFrame(loop);
  if(document.hidden)return;
  var dt=Math.min(0.05,(ts-lastTs)/1000||0.016);
  lastTs=ts;
  frameT=ts;
  perfGovernor(dt);
  if(slowMoT>0){slowMoT-=dt;dt*=slowMoF;}
  if(state==='playing'){
    update(dt);
  }else if(state==='dead'){
    deadT+=dt;
    frameLoopCommon(dt*0.3);
    updateCorpses(dt);
    if(deadT>1.25)finishDeath();
  }else if(state==='ending'){
    frameLoopCommon(dt*0.25);
    updateCorpses(dt);
    if(bossAlertRef)bossAlertRef.classList.remove('on');
  }else if(state==='menu'||state==='boot'){
    cam.x=Math.sin(ts*0.00004)*340;
    cam.y=Math.cos(ts*0.00005)*260;
    updateAmbient(dt);
    updateFX(dt);
  }else{
    updateAmbient(dt);
    updateFX(dt);
  }
  render(ts);
  if(state==='playing')setBossAlert(boss&&boss.entry>0);
  else if(bossAlertRef)bossAlertRef.classList.remove('on');
  if(state==='playing'||state==='dead'||state==='paused'||state==='levelup'||state==='ending')UI.updateHUDFrame();
  if(state==='menu'||state==='boot')drawMenuHero();
}
function render(t){
  drawBackground(t);
  if(state==='playing'||state==='dead'||state==='levelup'||state==='paused'||state==='over'||state==='ending'){
    renderWorld(t);
    drawVignette();
  }
}

/* ─── اتصال رویدادهای UI ─── */
function bindUI(){
  var click=function(id,fn){
    $(id).addEventListener('click',function(e){
      AudioSys.sfx('click');
      fn(e);
    });
  };
  click('btn-start',function(){startRun();});
  click('btn-end-continue',function(){closeEnding();});
  click('btn-shop',function(){UI.buildShop('skins');UI.showScreen('scr-shop');});
  click('btn-tree',function(){UI.selectedNode=null;UI.buildTree();$('tree-panel').classList.add('hidden');UI.showScreen('scr-tree');});
  click('btn-missions',function(){UI.buildMissions();UI.showScreen('scr-missions');});
  click('btn-ach',function(){UI.buildAch();UI.showScreen('scr-ach');});
  click('btn-settings',function(){UI.syncSettings();UI.showScreen('scr-settings');});
  var backs=document.querySelectorAll('[data-back]');
  for(var i=0;i<backs.length;i++)backs[i].addEventListener('click',function(){AudioSys.sfx('click');goMenu();});
  var tabs=document.querySelectorAll('#shop-tabs .tab');
  for(i=0;i<tabs.length;i++){
    tabs[i].addEventListener('click',function(e){
      AudioSys.sfx('click');
      UI.buildShop(e.currentTarget.getAttribute('data-tab'));
    });
  }
  click('btn-resume',resumeGame);
  click('btn-quit',quitRun);
  click('btn-again',function(){
    if(run&&!run.ended)endRun(run.reason||'death');
    startRun();
  });
  click('btn-double',doubleReward);
  click('btn-random-item',randomItemAd);
  click('btn-revive',reviveClick);
  click('btn-tomenu',function(){
    if(run&&!run.ended)endRun(run.reason||'death');
    goMenu();
  });
  /* دکمه جهش */
  var dashBtn=$('dashbtn');
  var dashHandler=function(e){
    e.preventDefault();
    e.stopPropagation();
    tryDash();
  };
  dashBtn.addEventListener('touchstart',dashHandler,{passive:false});
  dashBtn.addEventListener('mousedown',dashHandler);
  click('pausebtn',pauseGame);
  /* تبلیغ آزمایشی */
  click('btn-ad-claim',function(){UI._adDone(true);});
  click('btn-ad-close',function(){UI._adDone(false);});
  /* تأیید */
  click('cf-yes',function(){UI._cfAnswer(true);});
  click('cf-no',function(){UI._cfAnswer(false);});
  click('btn-tut-skip',finishTutorial);
  /* تنظیمات */
  var tg=function(id,key){
    $(id).addEventListener('click',function(){
      profile.set[key]=!profile.set[key];
      AudioSys.applySettings();
      UI.syncSettings();
      AudioSys.sfx('click');
      saveGame();
    });
  };
  tg('tg-music','music');tg('tg-sfx','sfx');tg('tg-vib','vib');
  var segs=document.querySelectorAll('#qual-seg .segb');
  for(i=0;i<segs.length;i++){
    segs[i].addEventListener('click',function(e){
      profile.set.quality=+e.currentTarget.getAttribute('data-q');
      UI.syncSettings();
      AudioSys.sfx('click');
      saveGame();
    });
  }
  click('btn-reset',function(){
    UI._cfFrom='scr-settings';
    UI.confirmBox('بازنشانی اطلاعات','همه‌ی پیشرفت، سکه‌ها و خریدها پاک می‌شود. مطمئنی؟',function(yes){
      if(yes){
        resetGame();
        dailyRollover();
        UI.refreshMenu();
        UI.syncSettings();
        UI.toast('اطلاعات بازنشانی شد');
      }
    });
  });
  /* خرید گره درخت حافظه */
  click('tp-buy',function(){
    if(UI.selectedNode)buyTree(UI.selectedNode);
  });
}

/* ════════════════ ۹) دارایی‌های DEVKIT: انیمیشن، VFX، محیط‌ها، هویت بصری ════════════════ */

/* ─── سیستم انیمیشن مرکزی DEVKIT — بارگذاری، رجیستری، پخش‌گر فریمی ───
   هر موجودیت یک Anim دارد؛ وضعیت‌های واقعی بازی (idle/move/attack/hit/death)
   به انیمیشن فریمی واقعی نگاشت می‌شوند. بدون انیمیشن تقلبی.               */
var ANIMS={
  imgs:{},ready:false,loadedN:0,totalN:0,
  load:function(done){
    if(this.totalN>0){if(this.ready&&done)done();return;}
    /* اگر مانیفست به هر دلیلی در دسترس نبود، بدون اسپرایت ادامه بده — لودینگ قفل نمی‌شود */
    if(typeof ANIM_MANIFEST==='undefined'||!ANIM_MANIFEST){
      this.totalN=1;this.loadedN=1;this.ready=true;
      if(window.console&&console.warn)console.warn('[ANIMS] manifest missing — running vector fallback');
      try{buildEnvLayer();}catch(e){}
      if(done)done();
      return;
    }
    var self=this,keys=Object.keys(ANIM_MANIFEST),finished=false;
    this.totalN=keys.length;this.loadedN=0;
    var finishOnce=function(){
      if(finished)return;
      finished=true;
      self.ready=true;
      buildEnvLayer();
      if(done)done();
    };
    var timer=setTimeout(finishOnce,15000); /* محدودیت امن — بازی بدون اسپرایت هم کار می‌کند */
    for(var i=0;i<keys.length;i++){
      (function(spec){
        var im=new Image();
        im.onload=function(){
          self.loadedN++;
          var pr=$('loadfill');
          if(pr)pr.style.width=Math.round(self.loadedN/self.totalN*100)+'%';
          if(self.loadedN>=self.totalN){clearTimeout(timer);finishOnce();}
        };
        im.onerror=function(){
          self.loadedN++;
          if(self.loadedN>=self.totalN){clearTimeout(timer);finishOnce();}
        };
        im.src=spec.file;
        self.imgs[spec.key]=im;
      })(ANIM_MANIFEST[keys[i]]);
    }
  }
};
/* key را داخل spec نگه می‌داریم */
(function(){
  for(var k in ANIM_MANIFEST)ANIM_MANIFEST[k].key=k;
})();
function loadAssets(d){ANIMS.load(d);}
/* دسترسی سازگار به تصویر بارگذاری‌شده بر اساس کلید مانیفست */
function tex(key){
  var im=ANIMS.imgs[key];
  return (im&&im.complete&&im.naturalWidth>0)?im:null;
}

/* رجیستری مجموعه‌انیمیشن‌ها: ANIMSETS['enemy_04']={idle:{...},move:{...},...} */
var ANIMSETS={};
(function(){
  for(var k in ANIM_MANIFEST){
    var i=k.lastIndexOf('_');
    var ent=k.slice(0,i),st=k.slice(i+1);
    (ANIMSETS[ent]=ANIMSETS[ent]||{})[st]=ANIM_MANIFEST[k];
  }
})();

/* ─── پخش‌گر انیمیشن هر موجودیت: Loop/Once، FPS، Flip، فلش سفید ضربه ─── */
function Anim(entId){
  this.set=ANIMSETS[entId]||null;
  this.name='';this.cur=null;this.frame=0;this.t=0;this.done=false;
}
Anim.prototype.play=function(name,force){
  if(!this.set)return;
  var s=this.set[name];
  if(!s)s=this.set.idle||this.set.move;
  if(!s)return;
  if(this.name===name&&!force&&!this.done)return; /* ادامه انیمیشن جاری */
  this.name=name;this.cur=s;this.frame=0;this.t=0;this.done=false;
};
Anim.prototype.update=function(dt){
  if(!this.cur||this.done)return;
  this.t+=dt;
  var sp=this.cur;
  while(this.t>=1/sp.fps){
    this.t-=1/sp.fps;this.frame++;
    if(this.frame>=sp.frames){
      if(sp.loop)this.frame=0;
      else{this.frame=sp.frames-1;this.done=true;break;}
    }
  }
};
Anim.prototype.draw=function(g,x,y,size,o){
  if(!this.cur)return;
  var im=ANIMS.imgs[this.cur.key];
  if(!im||!im.complete||!im.naturalWidth)return;
  o=o||{};
  var sp=this.cur,fw=sp.fw,fh=sp.fh;
  if(sp.ds)size=size*sp.ds; /* نرمال‌سازی اندازه‌ی هنر داخل فریم */
  var alpha=o.alpha!=null?o.alpha:1;
  if(alpha<=0.01)return;
  g.save();
  g.globalAlpha=alpha;
  g.translate(x,y);
  if(o.rot)g.rotate(o.rot);
  g.scale(o.flip?-1:1,1);
  g.drawImage(im,this.frame*fw,0,fw,fh,-size/2,-size/2,size,size);
  if(o.tint>0.02)drawTintFrame(g,im,fw,fh,this.frame,size,o.tint);
  g.restore();
};
/* فلش سفید ضربه: فریم جاری را سفیدرنگ و با آلفا روی اسپرایت می‌کشد */
var TINTCV=document.createElement('canvas');TINTCV.width=TINTCV.height=192;
var TINTCTX=TINTCV.getContext('2d');
function drawTintFrame(g,im,fw,fh,frame,size,amount){
  if(fw>TINTCV.width){TINTCV.width=fw;}
  TINTCTX.clearRect(0,0,fw,fh);
  TINTCTX.globalCompositeOperation='source-over';
  TINTCTX.drawImage(im,frame*fw,0,fw,fh,0,0,fw,fh);
  TINTCTX.globalCompositeOperation='source-in';
  TINTCTX.fillStyle='#ffffff';
  TINTCTX.fillRect(0,0,fw,fh);
  g.save();
  g.globalAlpha=Math.min(0.85,amount);
  g.globalCompositeOperation='lighter';
  g.drawImage(TINTCV,0,0,fw,fh,-size/2,-size/2,size,size);
  g.restore();
}
/* ترسیم ایستای یک فریم برای منو/فروشگاه (پیش‌نمایش زنده با زمان) */
function drawAnimFrame(g,entId,st,t,x,y,size,alpha){
  var set=ANIMSETS[entId];
  if(!set)return false;
  var sp=set[st]||set.idle||set.move;
  if(!sp)return false;
  var im=ANIMS.imgs[sp.key];
  if(!im||!im.complete||!im.naturalWidth)return false;
  if(sp.ds)size=size*sp.ds;
  var f=Math.floor(t*sp.fps)%sp.frames;
  g.save();
  if(alpha!=null)g.globalAlpha=alpha;
  g.drawImage(im,f*sp.fw,0,sp.fw,sp.fh,x-size/2,y-size/2,size,size);
  g.restore();
  return true;
}

/* (drawSpriteC قدیمی حذف شد — جایش Anim فریمی واقعی نشسته است) */

/* ─── VFX: صف انیمیشن‌های فریم‌دار (Sprite Sheet) با Pool و سقف کیفیت — ۱۲ نوع ─── */
var FX_DEFS={
  explosion:{frames:8,fps:16,add:true},
  deathexp:{frames:8,fps:16,add:true},
  cosmic:{frames:8,fps:18,add:true},
  bossin:{frames:8,fps:14,add:true},
  ring:{frames:8,fps:18,add:true},
  portal:{frames:8,fps:14,add:true},
  shield:{frames:8,fps:14,add:true},
  laser:{frames:8,fps:20,add:true},
  lightning:{frames:8,fps:18,add:true},
  slash:{frames:8,fps:22,add:true},
  impact:{frames:8,fps:22,add:true},
  muzzle:{frames:8,fps:26,add:true}
};
var FXQ={pool:[],n:0,cap:64};
function spawnFX(type,x,y,size,opts){
  var def=FX_DEFS[type];
  if(!def)return null;
  var q=effQ();
  var cap=Math.round(FXQ.cap*(q===0?0.4:q===1?0.7:1));
  if(FXQ.n>=cap)return null;
  var f=null;
  for(var i=0;i<FXQ.pool.length;i++){
    if(!FXQ.pool[i].active){f=FXQ.pool[i];break;}
  }
  if(!f){f={active:false};FXQ.pool.push(f);}
  if(f.active)FXQ.n--;
  f.active=true;FXQ.n++;
  f.type=type;f.x=x;f.y=y;f.size=size;f.t=0;
  f.rot=opts&&opts.rot||0;f.alpha=opts&&opts.alpha!=null?opts.alpha:1;
  return f;
}
function updateFX(dt){
  var i,f;
  for(i=0;i<FXQ.pool.length;i++){
    f=FXQ.pool[i];
    if(!f.active)continue;
    f.t+=dt;
    if(f.t*FX_DEFS[f.type].fps>=FX_DEFS[f.type].frames){
      f.active=false;FXQ.n--;
    }
  }
}
function drawFXAll(){
  var i,f,def,img,fr;
  for(i=0;i<FXQ.pool.length;i++){
    f=FXQ.pool[i];
    if(!f.active)continue;
    def=FX_DEFS[f.type];
    img=tex('fx_'+f.type);
    if(!img)continue;
    fr=Math.min(def.frames-1,Math.floor(f.t*def.fps));
    ctx.save();
    if(def.add)ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=f.alpha;
    ctx.translate(f.x,f.y);
    if(f.rot)ctx.rotate(f.rot);
    ctx.drawImage(img,fr*128,0,128,128,-f.size/2,-f.size/2,f.size,f.size);
    ctx.restore();
  }
}

/* باقی‌مانده انیمیشن مرگ موجودیت‌ها (فریم واقعی، یک‌بارپخش) */
var corpses=[];
function addCorpse(entId,x,y,size,flip){
  var q=effQ();
  if(corpses.length>=(q===0?8:q===1?14:22))corpses.shift();
  var a=new Anim(entId);
  a.play('death',true);
  corpses.push({anim:a,x:x,y:y,size:size,flip:flip});
}
function updateCorpses(dt){
  for(var i=corpses.length-1;i>=0;i--){
    corpses[i].anim.update(dt);
    if(corpses[i].anim.done)corpses.splice(i,1);
  }
}
function drawCorpses(){
  for(var i=0;i<corpses.length;i++){
    var c=corpses[i];
    c.anim.draw(ctx,c.x,c.y,c.size,{flip:c.flip});
  }
}

/* ─── محیط‌های بازی (۵) — پارالاکس رویه‌ای + ذرات محیطی + تن موسیقی ─── */
var ENVS=[
  {id:'city',  fa:'شهر کاسمیک',   en:'COSMIC CITY',   tint:'rgba(27,58,107,0.30)', col:'#4aa8ff', rgb:'74,168,255',  amb:'dust'},
  {id:'neon',  fa:'بعد نئونی',    en:'NEON DIMENSION',tint:'rgba(58,21,96,0.34)',  col:'#b054ff', rgb:'176,84,255',  amb:'spark'},
  {id:'inferno',fa:'منطقه آتشین', en:'INFERNO ZONE',  tint:'rgba(90,20,8,0.32)',   col:'#ff6a3d', rgb:'255,106,61',  amb:'ember'},
  {id:'frozen',fa:'سیاره یخ‌زده', en:'FROZEN PLANET', tint:'rgba(18,58,90,0.30)',  col:'#7fd0ff', rgb:'127,208,255', amb:'snow'},
  {id:'abyss', fa:'مینای گرانش',  en:'GRAVITY ABYSS', tint:'rgba(26,16,48,0.36)',  col:'#8a5aff', rgb:'138,90,255',  amb:'wisp'}
];
function curEnv(){
  return ENVS[(run&&run.envIdx||0)%ENVS.length];
}
function aliveEnemies(){
  var n=0;
  for(var i=0;i<enemies.length;i++)if(!enemies[i].dead)n++;
  return n;
}
function setEnv(i,silent){
  if(!run)return;
  run.envIdx=((i%ENVS.length)+ENVS.length)%ENVS.length;
  buildEnvLayer();
  AudioSys.setEnv&&AudioSys.setEnv(run.envIdx);
  if(!silent){
    showChapterCard(run.envIdx);
    AudioSys.sfx('level');
  }
}
/* لایه‌ی سیلوئت پارالاکس — یک‌بار در سوئیچ محیط رندر و کش می‌شود */
var ENV_CANVAS=null,ENV_FAR=null,ENV_T=0;
function buildEnvLayer(){
  ENV_CANVAS=document.createElement('canvas');
  var w=900,h=460;
  ENV_CANVAS.width=w;ENV_CANVAS.height=h;
  var g=ENV_CANVAS.getContext('2d');
  var env=curEnv();
  var i,k;
  /* لایه‌ی دور (افق): سیلوئت‌های بزرگ با رنگ محیط — پارالاکس عمق */
  ENV_FAR=document.createElement('canvas');
  ENV_FAR.width=w;ENV_FAR.height=300;
  var fg=ENV_FAR.getContext('2d');
  var farCol=env.rgb||'120,160,220';
  var fgrd=fg.createLinearGradient(0,0,0,300);
  fgrd.addColorStop(0,'rgba('+farCol+',0)');
  fgrd.addColorStop(1,'rgba('+farCol+',0.34)');
  fg.fillStyle=fgrd;
  fg.beginPath();fg.moveTo(0,300);
  for(i=0;i<=w;i+=36){
    var ph=110+Math.sin(i*0.013)*46+((i*104729)%90);
    fg.lineTo(i,300-ph);
  }
  fg.lineTo(w,300);fg.closePath();fg.fill();
  fg.fillStyle='rgba('+farCol+',0.22)';
  for(i=0;i<5;i++){
    var px2=(i*211+60)%w,ph2=60+((i*7919)%110);
    fg.fillRect(px2,300-ph2-40,26,ph2+40);
  }
  if(env.id==='city'){
    /* دو لایه آسمان‌خراش نئونی */
    for(k=0;k<2;k++){
      var base=h-(k?40:90);
      g.fillStyle=k?'rgba(10,16,38,0.95)':'rgba(14,22,52,0.85)';
      var x=0;
      while(x<w){
        var bw=30+((x*7919)%70),bh=50+((x*104729)%140)+(k?0:40);
        g.fillRect(x,base-bh,bw,bh+100);
        /* پنجره‌های نئونی */
        g.fillStyle='rgba(84,220,255,'+(k?0.5:0.3)+')';
        for(var wy=base-bh+8;wy<base-8;wy+=14){
          for(var wx=x+4;wx<x+bw-6;wx+=10){
            if(((wx*wy)%13)<4)g.fillRect(wx,wy,3,5);
          }
        }
        g.fillStyle=k?'rgba(10,16,38,0.95)':'rgba(14,22,52,0.85)';
        x+=bw+8;
      }
    }
  }else if(env.id==='neon'){
    /* شبکه پرسپکتیو + اشکال شناور */
    g.strokeStyle='rgba(176,84,255,0.35)';
    for(i=0;i<=12;i++){
      var yy=300+i*i*1.1;
      if(yy>h)break;
      g.lineWidth=i%3===0?2:1;
      g.beginPath();g.moveTo(0,yy);g.lineTo(w,yy);g.stroke();
    }
    for(i=0;i<=14;i++){
      g.lineWidth=1;
      g.beginPath();g.moveTo(i*w/14-100,h);g.lineTo(w/2+((i-7)*36),300);g.stroke();
    }
    for(i=0;i<9;i++){
      var fx=(i*173)%w,fy=60+((i*97)%180),fs=14+((i*31)%30);
      g.strokeStyle=i%2?'rgba(255,84,210,0.6)':'rgba(84,240,224,0.6)';
      g.lineWidth=2;
      if(i%2){g.strokeRect(fx,fy,fs,fs);}
      else{g.beginPath();g.arc(fx,fy,fs/2,0,TAU);g.stroke();}
    }
  }else if(env.id==='inferno'){
    /* دیواره‌های آتشفشانی + ترک‌های گدازه */
    g.fillStyle='rgba(40,10,6,0.9)';
    g.beginPath();g.moveTo(0,h);
    for(i=0;i<=w;i+=30)g.lineTo(i,h-70-((i*733)%120));
    g.lineTo(w,h);g.closePath();g.fill();
    g.strokeStyle='rgba(255,106,61,0.75)';
    g.lineWidth=2.5;
    for(i=0;i<14;i++){
      var cx=(i*167)%w,cy=h-60-((i*733)%120);
      g.beginPath();g.moveTo(cx,cy);
      g.lineTo(cx+10,cy+14+((i*53)%20));
      g.lineTo(cx-6,cy+30+((i*89)%24));
      g.stroke();
    }
    g.fillStyle='rgba(255,180,84,0.5)';
    for(i=0;i<20;i++)g.fillRect((i*211)%w,h-58-((i*733)%120),4,2);
  }else if(env.id==='frozen'){
    /* کریستال‌های یخ + شفق */
    for(i=0;i<16;i++){
      var ix=(i*151)%w,iy=h-30-((i*181)%150),isz=16+((i*43)%44);
      g.fillStyle='rgba(120,190,240,0.28)';
      g.strokeStyle='rgba(160,220,255,0.55)';
      g.lineWidth=1.5;
      g.beginPath();
      g.moveTo(ix,iy-isz);g.lineTo(ix+isz*0.42,iy);g.lineTo(ix-isz*0.42,iy);
      g.closePath();g.fill();g.stroke();
    }
    for(k=0;k<3;k++){
      var grd=g.createLinearGradient(0,40+k*36,0,110+k*36);
      grd.addColorStop(0,'rgba(84,220,255,0)');
      grd.addColorStop(0.5,'rgba(84,220,255,0.14)');
      grd.addColorStop(1,'rgba(176,84,255,0)');
      g.fillStyle=grd;
      g.fillRect(0,40+k*36,w,70);
    }
  }else{
    /* مینای گرانش: حلقه‌های گرداب و مونولیت‌ها */
    g.strokeStyle='rgba(138,90,255,0.4)';
    for(i=0;i<6;i++){
      g.lineWidth=1+i%2*1.5;
      g.beginPath();g.arc(w/2,h*0.62,40+i*36,0,TAU);g.stroke();
    }
    for(i=0;i<9;i++){
      var mx=(i*197)%w,my=40+((i*137)%200),mw=10+((i*29)%22),mh=50+((i*71)%90);
      g.fillStyle='rgba(8,4,20,0.92)';
      g.fillRect(mx,my,mw,mh);
      g.strokeStyle='rgba(176,255,84,0.35)';
      g.lineWidth=1;
      g.strokeRect(mx,my,mw,mh);
    }
  }
}
function drawEnvLayer(t){
  if(!ENV_CANVAS)return;
  var env=curEnv();
  ENV_T+=0.00006;
  var w=ENV_CANVAS.width,h=ENV_CANVAS.height;
  var oy=H-h+30;
  var ox=-((cam.x*0.22)%w);
  var drift=Math.sin(t*0.00005)*20;
  ctx.save();
  ctx.globalAlpha=0.85;
  var sc=Math.max(1,W/w)*1.05;
  var dh=h*sc,dw=w*sc;
  for(var b=-1;b<=Math.ceil(W/dw);b++){
    ctx.drawImage(ENV_CANVAS,ox+b*dw+drift,oy+(env.id==='neon'?0:0),dw,dh);
  }
  ctx.restore();
}
/* لایه‌ی دور محیط: قبل از ستاره‌ها کشیده می‌شود (پارالاکس بسیار کند) */
function drawEnvFar(t){
  if(!ENV_FAR)return;
  var w=ENV_FAR.width,h=ENV_FAR.height;
  var sc=Math.max(1,W/w)*1.25;
  var dw=w*sc,dh=h*sc;
  var ox=-((cam.x*0.08)%dw);
  var oy=H-dh-Math.max(0,h*sc*0.14);
  ctx.save();
  ctx.globalAlpha=0.7;
  for(var b=-1;b<=Math.ceil(W/dw);b++){
    ctx.drawImage(ENV_FAR,ox+b*dw,oy+Math.sin(t*0.00004)*6,dw,dh);
  }
  ctx.restore();
}
/* وینیت سینمایی — یک‌بار ساخته و هر فریم کشیده می‌شود */
var VIG_CV=null;
function drawVignette(){
  if(!VIG_CV||VIG_CV.width!==W||VIG_CV.height!==H){
    VIG_CV=document.createElement('canvas');
    VIG_CV.width=W;VIG_CV.height=H;
    var vg=VIG_CV.getContext('2d');
    var gr=vg.createRadialGradient(W/2,H/2,Math.min(W,H)*0.42,W/2,H/2,Math.max(W,H)*0.72);
    gr.addColorStop(0,'rgba(0,0,10,0)');
    gr.addColorStop(1,'rgba(0,0,10,0.42)');
    vg.fillStyle=gr;
    vg.fillRect(0,0,W,H);
  }
  ctx.drawImage(VIG_CV,0,0);
}
function drawEnvTint(){
  ctx.fillStyle=curEnv().tint;
  ctx.fillRect(0,0,W,H);
}
/* ذرات محیطی هر محیط */
var envAmbT=0;
function updateEnvAmbient(dt){
  var env=curEnv();
  envAmbT-=dt;
  if(envAmbT<=0){
    envAmbT=effQ()===0?0.5:0.22;
    var x=cam.x+rand(-W*0.55,W*0.55),y=cam.y+rand(-H*0.6,H*0.6);
    if(env.amb==='ember'){
      addPart(x,y,rand(-14,14),-rand(26,66),rand(1.6,3),'#ff7a3d',rand(1.5,3));
    }else if(env.amb==='snow'){
      addPart(x,y,rand(-20,-6),rand(14,30),rand(2.4,4),'#cfeaff',rand(1.2,2.4));
    }else if(env.amb==='spark'){
      addPart(x,y,rand(-40,40),rand(-40,40),rand(0.7,1.6),chance(0.5)?'#b054ff':'#ff54d2',rand(1,2));
    }else if(env.amb==='wisp'){
      addPart(x,y,rand(-10,10),rand(-10,10),rand(2,3.4),'#8a5aff',rand(1.4,2.6));
    }else{
      addPart(x,y,rand(-6,6),rand(-18,-6),rand(1.8,3),'#54d2ff',rand(1,2));
    }
  }
}

/* ─── بنر سینمایی (ورود باس / تغییر محیط) ─── */
var bannerTO=null;
/* ─── کارت فصل کمپین + ردیاب نگهبانان ─── */
function showChapterCard(chIdx,bossMode){
  var env=ENVS[((chIdx%5)+5)%5];
  var chN=((chIdx%5)+5)%5;
  if(bossMode){
    var def=BOSSES[chIdx%BOSSES.length];
    showBanner(def.fa+' — فصل '+faNum(chN+1),def.en+' • '+def.lore,'chapter boss');
  }else{
    var line=STORY.chapter[chN]||'';
    showBanner('فصل '+faNum(chN+1)+' — '+env.fa,line,'chapter');
    if(chN===0&&run&&!run.goalShown){run.goalShown=true;setTimeout(function(){storyMsg(STORY.goal);},3600);}
  }
  updateKeepers();
}
function updateKeepers(){
  var kp=$('keepers');
  if(!kp)return;
  var dots=kp.getElementsByTagName('i');
  var lit=run?Math.min(5,run.bossKills%100===run.bossKills?run.bossKills:5):0;
  if(run&&run.bossKills>=5)lit=5;
  for(var i=0;i<dots.length;i++)dots[i].classList.toggle('lit',i<lit);
}
function showBanner(main,sub,cls){
  var b=$('banner');
  if(!b)return;
  $('bn-main').textContent=main;
  $('bn-sub').textContent=sub||'';
  b.className=cls||'';
  /* force reflow برای اجرای دوباره انیمیشن */
  void b.offsetWidth;
  b.classList.add('show');
  if(bannerTO)clearTimeout(bannerTO);
  bannerTO=setTimeout(function(){b.classList.remove('show');},b.classList.contains('chapter')?3400:2400);
}

/* ─── نمایش زنده شخصیت در منوی اصلی ─── */
function drawMenuHero(){
  var cv=$('menu-skin-cv');
  if(!cv)return;
  var g=cv.getContext('2d');
  var s=150;
  if(cv.width!==s){cv.width=s;cv.height=s;}
  g.clearRect(0,0,s,s);
  var sk=SKINS_BY_ID[profile.skins.eq]||SKINS[0];
  var t=frameT/1000;
  /* هاله محیطی */
  var gr=g.createRadialGradient(s/2,s*0.56,4,s/2,s*0.56,s*0.48);
  gr.addColorStop(0,hexA(sk.glow,0.5));
  gr.addColorStop(1,hexA(sk.glow,0));
  g.fillStyle=gr;g.fillRect(0,0,s,s);
  var img=ANIMS.ready&&drawAnimFrame(g,sk.an,'idle',t, s/2,s*0.54,Math.round(s*0.62));
  if(img){
    /* بازتاب نور پایه */
    g.save();
    g.globalCompositeOperation='lighter';
    g.globalAlpha=0.35+0.1*Math.sin(t*2.4);
    var rg2=g.createRadialGradient(s/2,s*0.94,2,s/2,s*0.94,44);
    rg2.addColorStop(0,hexA(sk.glow,0.8));
    rg2.addColorStop(1,hexA(sk.glow,0));
    g.fillStyle=rg2;
    g.fillRect(s/2-46,s*0.94-46,92,92);
    g.restore();
  }else{
    /* جایگزین برداری هماهنگ */
    g.save();g.translate(s/2,s*0.52);g.scale(2.4,2.4);
    g.fillStyle=sk.col;
    g.strokeStyle='rgba(255,255,255,.75)';
    g.lineWidth=1;
    g.beginPath();g.moveTo(16,0);g.lineTo(-10,-10);g.lineTo(-5,0);g.lineTo(-10,10);g.closePath();
    g.fill();g.stroke();
    g.restore();
  }
}

/* ─── سینمای آغاز: یک‌بار پس از نصب، پیش‌از‌منو ─── */
function playIntro(){
  if(!profile||profile.sawIntro)return;
  var box=$('ic-lines'),wrap=$('intro-cine');
  if(!box||!wrap)return;
  box.innerHTML='';
  wrap.classList.remove('hidden');
  var done=false;
  var finish=function(){
    if(done)return;
    done=true;
    wrap.classList.add('hidden');
    profile.sawIntro=true;
    saveGame();
  };
  for(var i=0;i<STORY.intro.length;i++){
    var d=document.createElement('div');
    d.className='ic-line'+(i===STORY.intro.length-1?' key':'');
    d.textContent=STORY.intro[i];
    box.appendChild(d);
    (function(el,k){setTimeout(function(){if(!done)el.classList.add('show');},700+k*1500);})(d,i);
  }
  wrap.addEventListener('click',finish);
  setTimeout(finish,700+STORY.intro.length*1500+2800);
}

/* ─── بروزرسانی خودکار از مخزن گیت‌هاب (وقتی آنلاین باشد) ─── */
var updChecked=false;
function cmpVer(a,b){
  var pa=String(a).split('.'),pb=String(b).split('.');
  for(var i=0;i<3;i++){
    var x=parseInt(pa[i]||'0',10)||0,y=parseInt(pb[i]||'0',10)||0;
    if(x!==y)return x-y;
  }
  return 0;
}
function autoUpdate(){
  if(updChecked)return;
  updChecked=true;
  try{
    if(!navigator.onLine)return;
    var bases=['https://raw.githubusercontent.com/Imzayan/gravity-last-survivor/main/',
               'https://cdn.jsdelivr.net/gh/Imzayan/gravity-last-survivor@main/'];
    var bi=0;
    var get=function(path,cb){
      if(bi>=bases.length){cb(null);return;}
      fetch(bases[bi]+path,{cache:'no-store'}).then(function(r){
        if(!r.ok)throw new Error('http '+r.status);
        return r.text();
      }).then(cb).catch(function(){bi++;get(path,cb);});
    };
    get('version.json',function(txt){
      if(!txt)return;
      var j=null;
      try{j=JSON.parse(txt);}catch(e){}
      if(!j||!j.v)return;
      var cur=(typeof window.__GV==='string'&&window.__GV)||VERSION;
      if(cmpVer(j.v,cur)>0){
        get('game.js',function(code){
          if(!code||code.length<50000)return;
          try{localStorage.setItem('gv_up',JSON.stringify({v:j.v,code:code}));}catch(e){return;}
          UI.toast('بروزرسانی '+j.v+' دریافت شد — بازی را یک‌بار ببند و باز کن',4500);
          var mv=$('menu-ver');
          if(mv)mv.innerHTML='v'+j.v+' — <span class="upd">بروزرسانی شد، بازگشایی کن</span>';
        });
      }
    });
  }catch(e){}
}

/* ─── راه‌اندازی ─── */
function init(){
  setupCanvas();
  profile=loadGame();
  loadAssets(function(){
    var lo=$('loading');
    if(lo){lo.classList.add('done');setTimeout(function(){lo.classList.add('gone');},380);}
  });
  dailyRollover();
  initInput();
  bindUI();
  UI.refreshMenu();
  UI.syncSettings();
  UI.showScreen('scr-menu');
  state='menu';
  requestAnimationFrame(loop);
  /* سینمای آغاز + بروزرسانی خودکار */
  setTimeout(function(){try{playIntro();}catch(e){}},700);
  setTimeout(function(){try{autoUpdate();}catch(e){}},2600);
  /* پیشنهاد ادامه‌ی دور قبلی */
  if(profile.snapshot&&profile.snapshot.t>15){
    UI.confirmBox('ادامه‌ی دور قبلی؟',
      'امتیاز، سطح و مهارت‌های دور قبلی بازیابی می‌شود ('+faTime(profile.snapshot.t)+' بقا).',
      function(yes){
        if(yes&&state==='menu')resumeFromSnapshot();
        else clearSnapshot();
      });
  }
  /* مدیریت پس‌زمینه/بازگشت به برنامه */
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){
      if(state==='playing')pauseGame();
      snapshotRun();
      saveGame();
      AudioSys.suspend();
    }else{
      AudioSys.resume();
    }
  });
  window.addEventListener('beforeunload',function(){
    if(state==='playing')snapshotRun();
    saveGame();
  });
  /* API اشکال‌زدایی (برای تست و توسعه) */
  window.GRAVITY={
    v:VERSION,
    p:function(){return profile;},
    r:function(){return run;},
    st:function(s){state=s;},
    addXP:function(v){if(state==='playing')gainXP(v||run.xpNext);},
    boss:function(){if(state==='playing'&&!boss)spawnBoss(dir.bossIdx);},
    bossN:function(n){if(state==='playing'&&!boss){n=((n%5)+5)%5;dir.bossIdx=n;spawnBoss(n);dir.bossIdx=n+1;}},
    killboss:function(){if(state==='playing'&&boss)damageBoss(1e9,false);},
    event:function(id){if(state==='playing')startEvent(id);},
    killAll:function(){for(var i=0;i<enemies.length;i++)if(!enemies[i].dead)killEnemy(enemies[i],'debug');},
    die:function(){if(state==='playing')playerDie();},
    save:saveGame,
    reset:resetGame,
    pp:function(){return {x:Math.round(player.x),y:Math.round(player.y),cx:Math.round(cam.x),cy:Math.round(cam.y),st:state,al:player.alive,hp:Math.round(player.hp)};}
  };
}
try{
  init();
}catch(e){
  /* تضمین: حتی اگر راه‌اندازی خطا داد، لودینگ برداشته می‌شود و منو نمایان می‌ماند */
  if(window.console&&console.error)console.error('[INIT]',e&&e.message);
  try{
    var lo=document.getElementById('loading');
    if(lo){lo.classList.add('done');setTimeout(function(){lo.classList.add('gone');},380);}
    var lt=document.getElementById('loadtext');
    if(lt)lt.textContent='خطا: '+(e&&e.message?e.message:e);
  }catch(e2){}
}

/* هوک آزمایشی داخلی — فقط با پارامتر dbg=1 در آدرس فعال می‌شود */
if(location.search.indexOf('dbg=1')>=0){
  window.__GD={
    get player(){return player;},
    get run(){return run;},
    get boss(){return boss;},
    get enemies(){return enemies;},
    get state(){return state;},
    get profile(){return profile;},
    spawn:function(t,dx,dy){return spawnEnemy(t,{pos:{x:player.x+dx,y:player.y+dy}});},
    bossSpawn:function(i){spawnBoss(i);},
    killBoss:function(){damageBoss(999999);},
    hitPlayer:function(n){damagePlayer(n||12);}
  };
}

})();
