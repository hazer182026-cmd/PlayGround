(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const escapeHTML = (text) => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const weapons = [
    { name:'Wayfarer’s Blade', type:'Sword · Balanced', damage:12, speed:1, reach:70, style:'blade' },
    { name:'Ashen Greatsword', type:'Greatsword · Heavy', damage:20, speed:.7, reach:82, style:'blade' },
    { name:'Twin Briar Knives', type:'Dual blades · Swift', damage:9, speed:1.55, reach:62, style:'swift' },
    { name:'Longbow of Cinders', type:'Bow · Ranged', damage:15, speed:.9, reach:600, style:'ranged' },
    { name:'Pilgrim’s Spear', type:'Spear · Reach', damage:14, speed:.92, reach:105, style:'reach' },
    { name:'Gravebound Maul', type:'Hammer · Stagger', damage:23, speed:.62, reach:76, style:'heavy' },
    { name:'Witchglass Staff', type:'Staff · Arcane', damage:13, speed:.9, reach:100, style:'arcane' },
    { name:'Hook & Chain', type:'Chain · Control', damage:11, speed:1.05, reach:95, style:'control' }
  ];
  const offhands = [
    { name:'Buckler', type:'Shield · +4 armor', armor:4, parry:1 },
    { name:'Ashwood Focus', type:'Focus · +12 focus', armor:0, focus:12 },
    { name:'Twin Knife', type:'Off-hand · +4 attack', armor:0, damage:4 },
    { name:'Iron Kite Shield', type:'Shield · +8 armor', armor:8, parry:1.2 },
    { name:'Empty Hand', type:'Open · +10% dodge', armor:0, dodge:.1 }
  ];
  const armors = [
    { name:'Worn Leathers', type:'Light · +2 armor', armor:2 },
    { name:'Mossweave Mantle', type:'Cloth · +4 focus', armor:1, focus:4 },
    { name:'Ranger’s Jack', type:'Medium · +5 armor', armor:5 },
    { name:'Blackroot Plate', type:'Heavy · +9 armor', armor:9 }
  ];
  const areas = [
    { name:'The Briarpath', label:'THE VEILWOOD · EASTERN REACH', note:'A path through the old forest. Something stirs beneath the roots.', enemy:'Hollow Stalker', hp:58, damage:12, xp:55, color:'#b95c4a' },
    { name:'Moonmoss Glade', label:'THE VEILWOOD · LOST GLADE', note:'Silver moss drinks the moonlight. A watcher circles the pool.', enemy:'Veilbound Wisp', hp:50, damage:10, xp:50, color:'#79b7ae' },
    { name:'The Sunken Shrine', label:'THE VEILWOOD · OLD SANCTUM', note:'The roots part around a shrine, warm with an ember that should be dead.', enemy:'Rootbound Warden', hp:105, damage:16, xp:95, color:'#bd9160' }
  ];
  const skills = [
    { id:'parry', name:'Parry', icon:'◈', key:'F', cost:'20 ST', discipline:'Guard', description:'Raise your guard. Deflect a strike at the last instant to stun and counter for 2× damage.' },
    { id:'cleave', name:'Cleave', icon:'⚔', key:'1', cost:'18 ST', discipline:'Blade', description:'A sweeping, committed blow dealing 1.8× weapon damage and staggering your foe.' },
    { id:'dodge', name:'Quickstep', icon:'↗', key:'2', cost:'14 ST', discipline:'Guard', description:'Slip through danger and become untouchable for a brief moment.' },
    { id:'ember', name:'Ember Bolt', icon:'✧', key:'3', cost:'14 FP', discipline:'Wildcraft', description:'A seeking spark that strikes at range for will-scaled arcane damage.' },
    { id:'mend', name:'Mend', icon:'❋', key:'4', cost:'20 FP', discipline:'Wildcraft', description:'Call on living roots to restore vitality.' }
  ];
  const freshSave = () => ({ name:'Ashen Wanderer', level:1, xp:0, points:0, stats:{might:5,finesse:5,will:5,ward:5}, hp:100, mp:60, st:100,
    main:0, off:0, body:0, area:0, visited:[true,false,false], kills:[false,false,false], moss:0, blade:0, guard:0, wild:0,
    log:['The old road called. You answered.','A stranger’s words linger: “Find the ember before it finds you.”'] });
  function loadSave() {
    try {
      const saved = JSON.parse(localStorage.getItem('emberwake-save') || 'null');
      const base = freshSave();
      if (!saved) return base;
      return {...base, ...saved, stats:{...base.stats,...saved.stats}, visited:base.visited.map((v,i)=>!!(saved.visited||[])[i] || v), kills:base.kills.map((v,i)=>!!(saved.kills||[])[i] || v)};
    } catch { return freshSave(); }
  }
  const state = loadSave();
  const player = {x:0,y:0,dir:0,parry:0,invulnerable:0,dodge:0,attack:0};
  let enemies=[], particles=[], keys={}, size={w:800,h:390,dpr:1}, tick=0, last=0, swingCooldown=0, cooldown={};
  let sound=false, audioContext=null;

  function maxHP(){return 100+(state.level-1)*12+(state.stats.ward-5)*4}
  function maxMP(){return 60+(state.stats.will-5)*8+(offhands[state.off].focus||0)+(armors[state.body].focus||0)}
  function maxST(){return 100+(state.stats.finesse-5)*3}
  function attackPower(){return weapons[state.main].damage+(state.stats.might-5)*2+(state.stats.finesse-5)*.6+(offhands[state.off].damage||0)}
  function armor(){return armors[state.body].armor+offhands[state.off].armor+state.stats.ward-5}
  function save(){state.x=player.x;state.y=player.y;try{localStorage.setItem('emberwake-save',JSON.stringify(state));$('#saveText').textContent='AUTOSAVE ON'}catch{$('#saveText').textContent='SAVE UNAVAILABLE'}}
  function log(message){state.log.unshift(message);state.log=state.log.slice(0,6);renderLog()}
  function renderLog(){$('#logList').innerHTML=state.log.slice(0,4).map((text,i)=>`<div class="log-entry"><i>${i?'·':'✦'}</i><span>${escapeHTML(text)}</span></div>`).join('')}
  function rank(value){return value>=100?'III':value>=30?'II':'I'}
  function render(){
    const weapon=weapons[state.main], off=offhands[state.off], body=armors[state.body], area=areas[state.area];
    $('#heroName').textContent=state.name; $('#heroTitle').textContent=`Wayfarer · Level ${state.level}`;
    $('#xpText').textContent=`${state.xp} / ${state.level*100}`; $('#xpBar').style.width=`${Math.min(100,state.xp/(state.level*100)*100)}%`;
    [['hp',state.hp,maxHP()],['mp',state.mp,maxMP()],['st',state.st,maxST()]].forEach(([id,value,max])=>{$(`#${id}Text`).textContent=`${Math.ceil(value)} / ${max}`;$(`#${id}Bar`).style.width=`${clamp(value/max*100,0,100)}%`});
    Object.entries(state.stats).forEach(([id,value])=>{$(`#${id}Stat`).textContent=value});
    $('#attackVal').textContent=Math.round(attackPower()); $('#armorVal').textContent=armor(); $('#critVal').textContent=`${5+state.stats.finesse}%`;
    $('#levelBtn').hidden=state.points<1; $('#statPoints').textContent=state.points;
    $('#mainWeapon').textContent=weapon.name;$('#mainType').textContent=weapon.type;$('#offWeapon').textContent=off.name;$('#offType').textContent=off.type;$('#bodyArmor').textContent=body.name;$('#bodyType').textContent=body.type;
    $('#weaponStatus').textContent=`${weapon.name.toUpperCase()} & ${off.name.toUpperCase()}`;
    $('#areaName').textContent=area.name;$('.eyebrow').innerHTML=`<span class="live-dot"></span> ${area.label}`;$('#locationText').textContent=area.note;
    $('#questTitle').textContent=['The Ember in the Roots','The Moonlit Witness','The Hollow Crown'][state.area];
    $('#questDesc').textContent=['Find the source of the red glow beneath the Briarpath.','Follow the witness deeper into the Veilwood.','Reach the heart of the old shrine.'][state.area];
    const defeated=state.kills[state.area];$('#questObjective').textContent=defeated?'The guardian has fallen':'Defeat the '+area.enemy;$('#questCheck').textContent=defeated?'✓':'○';$('#questProgress').style.width=defeated?'100%':'0%';$('#questCount').textContent=defeated?'1 / 1':'0 / 1';
    $('#mossCount').textContent=`${state.moss}/3`;$('#mossProgress').style.width=`${Math.min(100,state.moss/3*100)}%`;
    $('#bladeRank').textContent=`Rank ${rank(state.blade)} · ${state.blade} mastery`;$('#guardRank').textContent=`Rank ${rank(state.guard)} · ${state.guard} mastery`;$('#wildRank').textContent=`Rank ${rank(state.wild)} · ${state.wild} mastery`;
    $('#actionRow').innerHTML=[{id:'attack',name:'Attack',icon:'⚔',key:'SPACE'},...skills].map(s=>`<button class="action-card ${s.id==='parry'?'parry-action':''}" data-skill="${s.id}"><span class="action-key">${s.key}</span><span class="action-icon">${s.icon}</span><span class="action-name">${s.name}</span><span class="action-cost">${s.cost||''}</span></button>`).join('');
    document.querySelectorAll('.action-card').forEach(button=>button.onclick=()=>use(button.dataset.skill));
    renderLog();
  }
  function resize(){const rect=canvas.getBoundingClientRect();size={w:rect.width,h:rect.height,dpr:Math.min(devicePixelRatio||1,2)};canvas.width=Math.round(size.w*size.dpr);canvas.height=Math.round(size.h*size.dpr);ctx.setTransform(size.dpr,0,0,size.dpr,0,0);if(!player.x){player.x=size.w*.4;player.y=size.h*.54}else{player.x=clamp(player.x,24,size.w-24);player.y=clamp(player.y,40,size.h-25)}}
  new ResizeObserver(resize).observe(canvas); resize();
  function spawnEnemy(){const area=areas[state.area];enemies=[{x:size.w*.68,y:size.h*.49,hp:area.hp,max:area.hp,damage:area.damage,name:area.enemy,color:area.color,state:'idle',timer:2.2,flash:0,dead:false}];}
  if(!state.kills[state.area])spawnEnemy();
  if(Number.isFinite(state.x))player.x=state.x;if(Number.isFinite(state.y))player.y=state.y;

  function tell(text){$('#combatMessage').textContent=text;}
  function floatText(text,x,y,color='#f2d18a'){
    const layer=$('#floatLayer'), node=document.createElement('span');node.className='float-text';node.textContent=text;node.style.left=`${x}px`;node.style.top=`${y}px`;node.style.color=color;layer.append(node);setTimeout(()=>node.remove(),1050);
  }
  function burst(x,y,color,count=9){for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=18+Math.random()*65;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-12,life:.45+Math.random()*.55,color,size:2+Math.random()*3})}}
  function soundFX(freq=180,duration=.08){if(!sound)return;try{audioContext ||= new (window.AudioContext||window.webkitAudioContext)();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.frequency.value=freq;gain.gain.setValueAtTime(.055,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration)}catch{}}
  function draw(){
    const {w,h}=size;ctx.clearRect(0,0,w,h);
    const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,['#26382f','#263a36','#34352b'][state.area]);bg.addColorStop(.52,['#1d302b','#1d3432','#302f27'][state.area]);bg.addColorStop(1,['#172821','#1a2c2b','#252820'][state.area]);ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    for(let i=0;i<8;i++){const x=((i*193+state.area*83)%w),y=((i*97+30)%h),g=ctx.createRadialGradient(x,y,0,x,y,70);g.addColorStop(0,state.area===1?'#91bda51a':'#d6a95714');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-70,y-70,140,140)}
    ctx.beginPath();for(let x=-10;x<=w+10;x+=12){const y=h*.53+Math.sin((x/w)*Math.PI*2+state.area)*h*.105;if(x===-10)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.lineWidth=Math.min(105,w*.2);ctx.strokeStyle='#555447';ctx.stroke();ctx.lineWidth=Math.min(92,w*.18);ctx.strokeStyle='#6b6852';ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle='#c0ac7440';ctx.stroke();
    for(let i=0;i<110;i++){const x=(i*83+19)%w,y=(i*149+33)%h;ctx.fillStyle=i%4?'#a6a47b28':'#d8c68b40';ctx.fillRect(x,y,1+(i%3),1+(i%2))}
    // Ancient trees frame the traversable clearing.
    for(let i=0;i<13;i++){const x=(i*137+34)%w,y=i%2?18+((i*39)%56):h-22-((i*31)%62),r=17+(i*7%14);ctx.fillStyle='#111f1b';ctx.beginPath();ctx.ellipse(x,y+5,r*1.12,r*.8,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=['#304239','#35433a','#293a34'][i%3];ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#71806425';ctx.beginPath();ctx.arc(x-r*.25,y-r*.35,r*.55,0,Math.PI*2);ctx.fill();ctx.fillStyle='#171d17';ctx.fillRect(x-3,y+r*.5,6,17)}
    // Shrine stones and glade pool give each region its own silhouette.
    if(state.area===1){const g=ctx.createRadialGradient(w*.73,h*.42,3,w*.73,h*.42,68);g.addColorStop(0,'#83b9aa50');g.addColorStop(1,'#4e8d7950');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(w*.72,h*.42,68,31,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#a5d6b146';ctx.stroke()}
    if(state.area===2){ctx.fillStyle='#80785e';ctx.fillRect(w*.62,h*.25,8,h*.27);ctx.fillRect(w*.78,h*.25,8,h*.27);ctx.fillStyle='#a59b78';ctx.fillRect(w*.6,h*.25,22,7);ctx.fillRect(w*.75,h*.25,22,7)}
    // Moonmoss is visible and collectable.
    if(state.area===1){for(let i=state.moss;i<3;i++){const x=w*(.28+i*.17),y=h*(.34+(i%2)*.24);ctx.shadowBlur=14;ctx.shadowColor='#9ce1bc';ctx.fillStyle='#9de0b6';ctx.beginPath();ctx.arc(x,y,4+Math.sin(tick*3+i)*1.2,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0}}
    enemies.forEach(e=>{if(!e.dead)drawEnemy(e)});
    drawPlayer();
    particles.forEach(p=>{ctx.globalAlpha=clamp(p.life,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size)});ctx.globalAlpha=1;
    $('.map-enemy').style.opacity=enemies.some(e=>!e.dead)?'1':'0';
  }
  function drawEnemy(e){
    const bob=Math.sin(tick*4)*2, r=state.area===2?24:19;
    ctx.save();ctx.translate(e.x,e.y+bob);ctx.shadowBlur=e.state==='windup'?24:12;ctx.shadowColor=e.state==='windup'?'#ff785a':e.color;
    if(state.area===1){ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d5fff2';ctx.beginPath();ctx.arc(-5,-2,3,0,Math.PI*2);ctx.arc(5,-2,3,0,Math.PI*2);ctx.fill()}
    else{ctx.fillStyle=e.flash>0?'#fff0ce':e.color;ctx.beginPath();ctx.moveTo(0,-r-6);ctx.lineTo(r,0);ctx.lineTo(0,r+5);ctx.lineTo(-r,0);ctx.closePath();ctx.fill();ctx.fillStyle='#251c18';ctx.fillRect(-7,-3,4,3);ctx.fillRect(4,-3,4,3);if(state.area===2){ctx.strokeStyle='#d2b778';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-17,-18);ctx.lineTo(-28,-28);ctx.moveTo(17,-18);ctx.lineTo(28,-28);ctx.stroke()}}
    ctx.restore();
    const bw=54;ctx.fillStyle='#101414';ctx.fillRect(e.x-bw/2,e.y-r-19,bw,5);ctx.fillStyle='#bd6555';ctx.fillRect(e.x-bw/2,e.y-r-19,bw*clamp(e.hp/e.max,0,1),5);ctx.fillStyle='#ece4cf';ctx.font='9px DM Mono,monospace';ctx.textAlign='center';ctx.fillText(e.name,e.x,e.y-r-24);
    if(e.state==='windup'){ctx.strokeStyle='#e8755d';ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,r+10,0,Math.PI*2*(1-e.timer/.85));ctx.stroke()}
  }
  function drawPlayer(){
    const r=13;ctx.save();ctx.translate(player.x,player.y);ctx.globalAlpha=player.invulnerable>0?.55+Math.sin(tick*32)*.3:1;
    ctx.fillStyle='#070d0c77';ctx.beginPath();ctx.ellipse(0,9,16,8,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=player.dodge>0?'#b4d7bf':'#d0b77d';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#26332f';ctx.beginPath();ctx.arc(0,-3,8,Math.PI,0);ctx.fill();
    const angle=Math.atan2(player.dir.y||0,player.dir.x||1);ctx.rotate(angle);ctx.fillStyle=state.main===3?'#d9b36f':'#9b7950';ctx.fillRect(7,-2,20,4);ctx.fillStyle='#ded0a7';ctx.fillRect(22,-1,7,2);ctx.fillStyle='#725c3e';ctx.fillRect(5,-5,4,10);
    if(player.parry>0){ctx.strokeStyle='#f0d283';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,22,-1.2,1.2);ctx.stroke()}
    if(player.attack>0){ctx.strokeStyle='#f5d894aa';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,31,-.9,.9);ctx.stroke()}
    ctx.restore();
  }
  function gainMastery(kind,amount){state[kind]=Math.min(120,state[kind]+amount);render();save()}
  function hitEnemy(amount,kind='blade',color='#f3d795',stagger=.5){
    const e=enemies.find(enemy=>!enemy.dead);if(!e)return false;
    e.hp=Math.max(0,e.hp-amount);e.flash=.16;e.state='stagger';e.timer=stagger;burst(e.x,e.y,e.color,8);floatText(`-${Math.round(amount)}`,e.x,e.y-25,color);soundFX(130,.07);
    if(kind==='blade')gainMastery('blade',2);if(kind==='wild')gainMastery('wild',3);if(kind==='guard')gainMastery('guard',2);
    if(e.hp<=0)defeatEnemy(e);return true;
  }
  function defeatEnemy(e){
    if(e.dead)return;e.dead=true;state.kills[state.area]=true;state.xp+=areas[state.area].xp;state.moss=state.area===1?Math.min(3,state.moss+1):state.moss;
    burst(e.x,e.y,'#e3b968',22);log(`${e.name} falls. The forest remembers.`);tell(`${e.name} defeated · +${areas[state.area].xp} XP`);floatText('VICTORY',e.x,e.y-28,'#f1d08a');soundFX(420,.24);
    let levelled=0;while(state.xp>=state.level*100){state.xp-=state.level*100;state.level++;state.points++;levelled++}
    if(levelled){state.hp=maxHP();state.mp=maxMP();state.st=maxST();log(`Level ${state.level}. A stat point is yours to shape.`);tell(`Level up! Spend ${state.points} stat point${state.points===1?'':'s'}.`)}
    if(state.area===0&&!state.visited[1]){log('A pale light drifts north, toward the Moonmoss Glade.');tell('The northern path is open. The glade is waiting.')}
    if(state.area===1){state.moss=Math.min(3,state.moss+1);if(state.moss===3)log('Three moonmoss gathered. A whisper names the Sunken Shrine.')}
    if(state.area===2){log('The ember blooms. You have found the Hollow Crown—and left it sleeping.');setTimeout(()=>showEnding(),900)}
    render();save();
  }
  function attack(){
    if(swingCooldown>0)return;const weapon=weapons[state.main],e=enemies.find(enemy=>!enemy.dead);if(!e){tell('The clearing is quiet. Choose another path from the map.');return}
    swingCooldown=.42/weapon.speed;player.attack=.2;player.dir={x:e.x-player.x,y:e.y-player.y};
    if(weapon.style==='ranged'||distance(player,e)<=weapon.reach+16){let damage=attackPower()*(weapon.style==='heavy'?1.25:1);if(Math.random()<(.05+state.stats.finesse*.01)){damage*=1.65;floatText('CRITICAL',e.x,e.y-40,'#f4cb73')}hitEnemy(damage,'blade',weapon.style==='arcane'?'#9dd2ce':'#f3d795',weapon.style==='heavy'?.8:.48);if(weapon.style==='ranged'){burst(e.x,e.y,'#dfa85f',5)}}else{tell('Move closer to strike.');floatText('TOO FAR',player.x,player.y-24,'#c4c6ad')}
  }
  function use(id){
    if(id==='attack'){attack();return}
    const now=tick;if((cooldown[id]||0)>now){tell('Gather your strength…');return}
    if(id==='parry'){
      if(state.st<20){tell('Not enough stamina to parry.');return}state.st-=20;player.parry=.48;cooldown.parry=now+.65;gainMastery('guard',1);tell('Guard raised — meet the strike now.');soundFX(300,.06);render();return;
    }
    if(id==='cleave'){
      if(state.st<18){tell('Not enough stamina.');return}state.st-=18;cooldown.cleave=now+1.1;player.attack=.35;const e=enemies.find(x=>!x.dead);if(e&&distance(player,e)<=weapons[state.main].reach+24)hitEnemy(attackPower()*1.8,'blade','#f3d795',1);else tell('Cleave into empty air. Close the distance.');render();return;
    }
    if(id==='dodge'){
      if(state.st<14){tell('Not enough stamina to quickstep.');return}state.st-=14;player.dodge=.48;player.invulnerable=.48;cooldown.dodge=now+.9;const speed=145;if(Math.hypot(player.dir.x,player.dir.y)<.1)player.dir={x:1,y:0};player.x=clamp(player.x+player.dir.x/Math.hypot(player.dir.x,player.dir.y)*speed,20,size.w-20);player.y=clamp(player.y+player.dir.y/Math.hypot(player.dir.x,player.dir.y)*speed,35,size.h-20);gainMastery('guard',1);tell('Quickstep — you are untouchable.');render();return;
    }
    if(id==='ember'){
      if(state.mp<14){tell('Not enough focus.');return}state.mp-=14;cooldown.ember=now+.85;player.attack=.25;const e=enemies.find(x=>!x.dead);if(e){const damage=13+state.stats.will*2+Math.floor(state.wild/20)*2;burst(e.x,e.y,'#f4a85d',14);hitEnemy(damage,'wild','#f4ac69',.65);tell('Ember Bolt finds its mark.')}else tell('The spark fades into the quiet.');soundFX(520,.13);render();return;
    }
    if(id==='mend'){
      if(state.mp<20){tell('Not enough focus.');return}if(state.hp>=maxHP()){tell('Your vitality is already full.');return}state.mp-=20;const healed=Math.min(maxHP()-state.hp,30+state.stats.will*2);state.hp+=healed;cooldown.mend=now+1.1;floatText(`+${Math.round(healed)} VIT`,player.x,player.y-24,'#90d4a0');burst(player.x,player.y,'#83bd8c',12);gainMastery('wild',2);tell('Living roots answer your call.');render();save();return;
    }
  }
  function advanceArea(index){
    if(index<0||index>=areas.length)return;if(index>0&&!state.kills[index-1]){tell('The path is sealed. Defeat the guardian first.');return}
    if(index===1&&!state.kills[0]){tell('The glade is hidden beyond the Briarpath guardian.');return}if(index===2&&!state.kills[1]){tell('The shrine opens only to those who follow the wisp.');return}
    if(index===state.area){closeModal();return}state.area=index;state.visited[index]=true;enemies=[];if(!state.kills[index])spawnEnemy();player.x=size.w*.38;player.y=size.h*.56;log(`Entered ${areas[index].name}.`);tell(areas[index].note);$('#areaToast').textContent=areas[index].name.toUpperCase();$('#areaToast').classList.add('show');setTimeout(()=>$('#areaToast').classList.remove('show'),1800);render();save();closeModal();
  }
  function update(dt){
    tick+=dt;swingCooldown=Math.max(0,swingCooldown-dt);Object.keys(cooldown).forEach(k=>{cooldown[k]=Math.max(0,cooldown[k]-dt)});
    player.parry=Math.max(0,player.parry-dt);player.attack=Math.max(0,player.attack-dt);player.dodge=Math.max(0,player.dodge-dt);player.invulnerable=Math.max(0,player.invulnerable-dt);
    state.st=Math.min(maxST(),state.st+dt*12);state.mp=Math.min(maxMP(),state.mp+dt*2.2);
    let dx=0,dy=0;if(keys.KeyA||keys.ArrowLeft||keys.touchLeft)dx--;if(keys.KeyD||keys.ArrowRight||keys.touchRight)dx++;if(keys.KeyW||keys.ArrowUp||keys.touchUp)dy--;if(keys.KeyS||keys.ArrowDown||keys.touchDown)dy++;
    if(dx||dy){const n=Math.hypot(dx,dy);player.x=clamp(player.x+dx/n*125*dt,16,size.w-16);player.y=clamp(player.y+dy/n*125*dt,30,size.h-18);player.dir={x:dx,y:dy}}
    const e=enemies.find(x=>!x.dead);
    if(e){e.flash=Math.max(0,e.flash-dt);const d=distance(player,e);if(e.state==='idle'){if(d<190){e.state='approach';e.timer=.3}}else if(e.state==='approach'){
        if(d>45){e.x+=((player.x-e.x)/d)*Math.min(40*dt,d-42);e.y+=((player.y-e.y)/d)*Math.min(40*dt,d-42)}if(d<69){e.state='windup';e.timer=.85;$('#battleBanner').classList.add('show');$('#combatState').textContent='INCOMING'}
      }else if(e.state==='windup'){e.timer-=dt;if(e.timer<=0){if(player.parry>0){e.state='stagger';e.timer=1.1;player.parry=0;floatText('PARRY!',player.x,player.y-28,'#f4d276');tell('Perfect deflection — strike now!');hitEnemy(attackPower()*2,'guard','#f4d276',1.1);gainMastery('guard',5);soundFX(650,.18)}else if(player.invulnerable>0||player.dodge>0){e.state='approach';tell('You evade the strike.');gainMastery('guard',1)}else{const damage=Math.max(2,e.damage-armor()*.55);state.hp=Math.max(0,state.hp-damage);floatText(`-${Math.ceil(damage)} VIT`,player.x,player.y-24,'#e77b6c');burst(player.x,player.y,'#cf6c58',7);e.state='recover';e.timer=1.05;$('#combatState').textContent='RECOVER';tell(`${e.name} strikes for ${Math.ceil(damage)}.`);soundFX(90,.18);if(state.hp<=0)playerDown()}}
      }else if(e.state==='recover'||e.state==='stagger'){e.timer-=dt;if(e.timer<=0){e.state='approach';e.timer=.4;$('#combatState').textContent='READY'}}
    }else{$('#battleBanner').classList.remove('show');$('#combatState').textContent='READY'}
    if(state.area===1&&state.moss<3){const moss=[0,1,2].filter(i=>state.moss<=i);for(const i of moss){const p={x:size.w*(.28+i*.17),y:size.h*(.34+(i%2)*.24)};if(distance(player,p)<23){state.moss++;floatText('MOONMOSS',p.x,p.y-12,'#9de0b6');log(`Gathered moonmoss (${state.moss}/3).`);render();save();break}}}
    particles=particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=38*dt;return p.life>0});
  }
  function playerDown(){state.hp=maxHP();state.mp=maxMP()*.6;state.st=maxST();player.x=size.w*.38;player.y=size.h*.55;enemies=[];if(!state.kills[state.area])spawnEnemy();log('The Veilwood returns you to the last safe path.');tell('You were overcome. The forest gives you another chance.');render();save()}
  function frame(time){const dt=Math.min(.04,(time-last)/1000||0);last=time;update(dt);draw();requestAnimationFrame(frame)}
  function rest(){if(enemies.some(e=>!e.dead)){tell('There is no rest while danger lingers.');return}state.hp=maxHP();state.mp=maxMP();state.st=maxST();log('You rest beneath the old trees. Your strength returns.');tell('Rested. Your vitality, focus, and stamina are restored.');render();save()}
  function openModal(html){$('#modalContent').innerHTML=html;$('#modalBackdrop').hidden=false}
  function closeModal(){$('#modalBackdrop').hidden=true}
  function showMap(){
    const nodes=areas.map((a,i)=>`<button class="choice-btn" data-area="${i}" ${i>0&&!state.kills[i-1]?'disabled':''}><b>${i+1}. ${a.name}</b><span>${state.visited[i]?'Discovered':'Uncharted'} · ${state.kills[i]?'Guardian defeated':i>0&&!state.kills[i-1]?'Path sealed':'Path open'}</span></button>`).join('');
    openModal(`<h2>Paths through the Veilwood</h2><p class="modal-sub">A hand-drawn map, more remembered than made. Each path opens when its guardian falls.</p><div class="map-modal"><span>BRIARPATH　·　MOONMOSS　·　SHRINE</span></div><h3>KNOWN WAYPOINTS</h3><div class="choice-list">${nodes}</div>`);
    document.querySelectorAll('[data-area]').forEach(btn=>{btn.onclick=()=>advanceArea(Number(btn.dataset.area));if(btn.disabled){btn.style.opacity='.45';btn.style.cursor='not-allowed'}})
  }
  function showLevel(){
    const statInfo={might:['Might','Increase weapon damage and physical force.'],finesse:['Finesse','Improve critical chance, stamina, and swift weapon damage.'],will:['Will','Increase focus and improve Ember Bolt and Mend.'],ward:['Ward','Increase maximum vitality and reduce incoming damage.']};
    openModal(`<h2>Shape your wayfarer</h2><p class="modal-sub">You have <b>${state.points}</b> stat point${state.points===1?'':'s'}. Choose what the forest will teach you.</p><div class="choice-list">${Object.entries(statInfo).map(([id,[label,desc]])=>`<button class="choice-btn" data-stat="${id}"><b>${label} · ${state.stats[id]}</b><span>${desc}</span></button>`).join('')}</div>`);
    document.querySelectorAll('[data-stat]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.stat;state.points--;state.stats[id]++;if(id==='ward')state.hp+=4;if(id==='will')state.mp+=8;log(`${id[0].toUpperCase()+id.slice(1)} strengthened to ${state.stats[id]}.`);render();save();if(state.points)showLevel();else closeModal()})
  }
  function showInventory(){
    const slots=[['main','Main hand',weapons],['off','Off hand',offhands],['body','Armor',armors]];
    openModal(`<h2>Loadout</h2><p class="modal-sub">Eight weapons, five off-hands, and four armor sets. Build for the way you want to fight.</p>${slots.map(([key,label,list])=>`<h3>${label.toUpperCase()}</h3><div class="choice-list">${list.map((item,i)=>`<button class="choice-btn" data-equip="${key}" data-index="${i}"><b>${item.name}${state[key]===i?'　✓':''}</b><span>${item.type}${key==='main'?` · ${item.damage} base damage · ${item.reach>200?'ranged':item.reach+' reach'}`:''}</span></button>`).join('')}</div>`).join('')}`);
    document.querySelectorAll('[data-equip]').forEach(btn=>btn.onclick=()=>{state[btn.dataset.equip]=Number(btn.dataset.index);render();save();showInventory()})
  }
  function showSkills(){openModal(`<h2>Disciplines & skills</h2><p class="modal-sub">Practice shapes your mastery. Blade mastery raises physical force, Guard teaches survival, and Wildcraft amplifies living magic.</p>${skills.map(s=>`<h3>${s.discipline.toUpperCase()} · ${s.name.toUpperCase()}</h3><p class="modal-sub">${s.description} <b>Key: ${s.key}</b> · Cost: ${s.cost}</p>`).join('')}<h3>MASTERY</h3><p class="modal-sub">Blade ${state.blade} · Guard ${state.guard} · Wildcraft ${state.wild}. Mastery ranks improve at 30 and 100.</p>`)}
  function showJournal(){openModal(`<h2>Field journal</h2><p class="modal-sub">The Veilwood does not tell its stories in order. Follow what catches the light.</p><h3>THE HOLLOW CROWN · MAIN THREAD</h3><div class="choice-list">${areas.map((a,i)=>`<div class="choice-btn"><b>${i+1}. ${['The Ember in the Roots','The Moonlit Witness','The Hollow Crown'][i]} ${state.kills[i]?'✓':''}</b><span>${['Find the source of the red glow beneath the Briarpath.','Follow the witness deeper into the Veilwood.','Reach the heart of the old shrine.'][i]}</span></div>`).join('')}</div><h3>WHISPER IN THE WOOD · ${state.moss}/3</h3><p class="modal-sub">Gather three moonmoss from the glade. ${state.moss>=3?'The whisper is answered.':'Pale growths glimmer around the pool.'}</p><h3>RECENT NOTES</h3>${state.log.map(line=>`<p class="modal-sub">✦ ${escapeHTML(line)}</p>`).join('')}`)}
  function showHelp(){openModal(`<h2>How to play</h2><p class="modal-sub">Explore the clearings, learn each guardian’s rhythm, and decide what the ember should become.</p><h3>CONTROLS</h3><p class="modal-sub"><b>WASD / arrows</b> move · <b>Space</b> attack · <b>F</b> parry just before a blow lands · <b>Shift</b> quickstep · <b>1</b> cleave · <b>2</b> dodge · <b>3</b> Ember Bolt · <b>4</b> Mend. Touch controls appear on smaller screens.</p><h3>COMBAT</h3><p class="modal-sub">Watch the red wind-up ring. Parry at the instant of impact to stun and counter. Armor reduces damage; a quickstep avoids it entirely. Cycle your loadout to find a style that suits you.</p><h3>PROGRESSION</h3><p class="modal-sub">Guardians grant experience and levels. Spend stat points with the button under your attributes. The next clearing opens when the current guardian is defeated. Progress saves automatically in this browser.</p>`)}
  function showEnding(){
    openModal(`<h2>The Crown that would not close</h2><p class="modal-sub">The ember opens like an eye beneath the roots. In its light, you see a crown with no king—and the forest holding its breath.</p><div class="story-quote">“It was never meant to be worn,” says the witness. “Only carried, until someone could choose what it remembers.”</div><h3>WHAT WILL YOU DO?</h3><div class="choice-list"><button class="choice-btn" data-ending="carry"><b>Carry the ember onward</b><span>Let the unfinished story travel with you. The Veilwood remains open to wander.</span></button><button class="choice-btn" data-ending="return"><b>Return it to the roots</b><span>Give the old forest its warmth, and let its ghosts sleep.</span></button><button class="choice-btn" data-ending="keep"><b>Keep the crown unclaimed</b><span>Leave the choice open. Some stories are safer unfinished.</span></button></div>`);
    document.querySelectorAll('[data-ending]').forEach(btn=>btn.onclick=()=>{state.ending=btn.dataset.ending;const words={carry:'You carry a coal into the unlit world. The road goes on.',return:'The roots drink the ember. At last, the forest exhales.',keep:'The crown stays beneath the earth, waiting for no one.'};log(words[state.ending]);tell(words[state.ending]);save();openModal(`<h2>The road goes on</h2><p class="modal-sub">${words[state.ending]} Your story is saved. The Veilwood remains yours to explore.</p><button class="modal-primary" id="endingClose">RETURN TO THE VEILWOOD</button>`);$('#endingClose').onclick=closeModal})
  }
  function rename(){openModal(`<h2>Name your wayfarer</h2><p class="modal-sub">What name will the wood remember?</p><input id="nameInput" maxlength="24" value="${escapeHTML(state.name)}" style="width:100%;padding:11px;background:#0d1416;border:1px solid #46514a;color:#eee;font:14px var(--sans);margin-bottom:14px"><button class="modal-primary" id="nameSave">KEEP THIS NAME</button>`);const input=$('#nameInput');input.focus();input.select();$('#nameSave').onclick=()=>{state.name=input.value.trim().slice(0,24)||'Ashen Wanderer';render();save();closeModal()};input.onkeydown=e=>{if(e.key==='Enter')$('#nameSave').click()}}
  function bind(){
    $('#modalClose').onclick=closeModal;$('#modalBackdrop').addEventListener('click',e=>{if(e.target===$('#modalBackdrop'))closeModal()});
    $('#helpBtn').onclick=showHelp;$('#mapBtn').onclick=showMap;$('#restBtn').onclick=rest;$('#renameBtn').onclick=rename;$('#levelBtn').onclick=showLevel;$('#journalBtn').onclick=showJournal;$('#skillsBtn').onclick=showSkills;
    document.querySelectorAll('[data-cycle]').forEach(btn=>btn.onclick=()=>{const key=btn.dataset.cycle,lists={main:weapons,off:offhands,body:armors};state[key]=(state[key]+1)%lists[key].length;render();save();tell(`${lists[key][state[key]].name} equipped.`)});
    document.querySelectorAll('[data-move]').forEach(btn=>{const key={up:'touchUp',down:'touchDown',left:'touchLeft',right:'touchRight'}[btn.dataset.move];btn.addEventListener('pointerdown',e=>{e.preventDefault();keys[key]=true;btn.setPointerCapture(e.pointerId)});['pointerup','pointercancel','lostpointercapture'].forEach(type=>btn.addEventListener(type,()=>keys[key]=false))});
    document.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('pointerdown',e=>{e.preventDefault();use(btn.dataset.action)}));
    canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0){const r=canvas.getBoundingClientRect();const x=e.clientX-r.left,y=e.clientY-r.top;player.dir={x:x-player.x,y:y-player.y};use('attack')}});
    window.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();return}if(e.target instanceof HTMLInputElement)return;const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(e.code==='Space'){use('attack');return}if(k==='f'){use('parry');return}if(k==='shift'){use('dodge');return}if(k==='1'){use('cleave');return}if(k==='2'){use('dodge');return}if(k==='3'){use('ember');return}if(k==='4'){use('mend');return}if(k==='m'){showMap();return}keys[e.code]=true});
    window.addEventListener('keyup',e=>{keys[e.code]=false});window.addEventListener('blur',()=>keys={});
    $('#soundBtn').onclick=()=>{sound=!sound;$('#soundBtn').textContent=sound?'♫':'♩';$('#soundBtn').title=sound?'Mute sound':'Enable sound';soundFX(440,.1)};
    window.addEventListener('beforeunload',save);
  }
  render();bind();save();requestAnimationFrame(frame);
})();
