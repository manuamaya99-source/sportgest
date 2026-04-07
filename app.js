
// ============================================================
// PWA INITIALIZATION
// ============================================================
var _appJsContent='';
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').catch(function(e){console.log('SW reg failed:',e);});
}
// Store app.js content for guardarHTML export
(function(){
  var x=new XMLHttpRequest();
  x.open('GET','./app.js',true);
  x.onload=function(){if(x.status===200)_appJsContent=x.responseText;};
  x.send();
})();
// PWA install prompt
var _deferredPrompt=null;
window.addEventListener('beforeinstallprompt',function(e){
  e.preventDefault();
  _deferredPrompt=e;
  var bar=document.getElementById('pwa-install');
  if(bar)bar.classList.add('show');
});
function pwaInstall(){
  if(!_deferredPrompt)return;
  _deferredPrompt.prompt();
  _deferredPrompt.userChoice.then(function(r){
    document.getElementById('pwa-install').classList.remove('show');
    _deferredPrompt=null;
    if(r.outcome==='accepted')toast('App instalada!');
  });
}
function pwaDismiss(){
  document.getElementById('pwa-install').classList.remove('show');
}
// Check if already installed
if(window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone){
  // Already installed as PWA
  document.addEventListener('DOMContentLoaded',function(){
    var bar=document.getElementById('pwa-install');
    if(bar)bar.remove();
  });
}

// ============================================================
// ESTADO
// ============================================================
var events=[],nextId=1,cfg={},editId=null;
var lunes=(function(){var d=new Date(),w=d.getDay();return new Date(d.getFullYear(),d.getMonth(),d.getDate()+(w===0?-6:1-w));})();
var dia=(function(){var d=new Date().getDay();return d===0?6:d-1;})();
var _del=[],_mod=[],_add=[];

// ============================================================
// FECHA UTILS
// ============================================================
function ISO(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function addD(d,n){return new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);}
function monOf(d){var w=d.getDay();return new Date(d.getFullYear(),d.getMonth(),d.getDate()+(w===0?-6:1-w));}
function toM(t){var p=t.split(':');return +p[0]*60+ +p[1];}
function fM(m){return ('0'+Math.floor(m/60)).slice(-2)+':'+('0'+(m%60)).slice(-2);}
function npal(s){return s.trim()===''?0:s.trim().split(/\s+/).length;}
function dHoy(){return ISO(addD(lunes,dia));}

// ============================================================
// CARGA — seed siempre presente, delta encima
// ============================================================
function load(){
  try{
    var full=localStorage.getItem(_STORE+'_full');
    if(full){
      var d=JSON.parse(full);
      events=d.events||[];
      nextId=d.nextId||1;
      cfg=d.cfg||JSON.parse(JSON.stringify(_CFG));
      _touched=d.touched||d.deleted||[];
      _dirty=false;
      return;
    }
  }catch(e){}
  events=_EV.map(function(e){return Object.assign({},e);});
  nextId=_NID;
  cfg=JSON.parse(JSON.stringify(_CFG));
  _touched=(typeof _DELETED!=='undefined'&&_DELETED)?_DELETED.slice():[];
  try{
    var raw=localStorage.getItem(_STORE);
    if(raw){
      var delta=JSON.parse(raw);
      if(delta.del&&delta.del.length){var ds={};delta.del.forEach(function(id){ds[id]=1;});events=events.filter(function(e){return !ds[e.id];});}
      if(delta.mod&&delta.mod.length){delta.mod.forEach(function(m){var i=events.findIndex(function(e){return e.id===m.id;});if(i>=0)events[i]=m;});}
      if(delta.add&&delta.add.length){delta.add.forEach(function(e){events.push(e);});if(delta.nid)nextId=delta.nid;}
    }
  }catch(e){}
  try{var rc=localStorage.getItem(_STORE+'c');if(rc)cfg=JSON.parse(rc);}catch(e){}
  autoSave();
}

var _dirty=false;
var _autoSaveTimer=null;
var _touched=[];
function autoSave(){
  try{
    localStorage.setItem(_STORE+'_full',JSON.stringify({events:events,nextId:nextId,cfg:cfg,touched:_touched,savedAt:new Date().toISOString()}));
    bkSaved();
    _dirty=false;
  }catch(e){
    try{localStorage.removeItem(_STORE);localStorage.removeItem(_STORE+'c');}catch(x){}
    try{localStorage.setItem(_STORE+'_full',JSON.stringify({events:events,nextId:nextId,cfg:cfg,touched:_touched,savedAt:new Date().toISOString()}));bkSaved();_dirty=false;}catch(x){bkErr();}
  }
}
function scheduleAutoSave(){
  _dirty=true;
  if(_autoSaveTimer)clearTimeout(_autoSaveTimer);
  _autoSaveTimer=setTimeout(autoSave,500);
}

function saveDelta(){scheduleAutoSave();}
function saveCfg(){scheduleAutoSave();}

function _slotKey(date,s,e,act,center){return date+'|'+s+'|'+e+'|'+act+'|'+center;}
function _touchSlot(date,s,e,act,center){
  var key=_slotKey(date,s,e,act,center);
  if(_touched.indexOf(key)<0)_touched.push(key);
}

function markDel(id){
  if(_del.indexOf(id)<0)_del.push(id);
  _mod=_mod.filter(function(m){return m.id!==id;});
  _add=_add.filter(function(a){return a.id!==id;});
  saveDelta();
}
function markMod(ev,oldEv){
  if(oldEv){
    var ok=_slotKey(oldEv.date,oldEv.s,oldEv.e,oldEv.act,oldEv.center);
    var nk=_slotKey(ev.date,ev.s,ev.e,ev.act,ev.center);
    if(ok!==nk)_touchSlot(oldEv.date,oldEv.s,oldEv.e,oldEv.act,oldEv.center);
  }
  var i=_mod.findIndex(function(m){return m.id===ev.id;});
  if(i>=0)_mod[i]=ev;else _mod.push(ev);
  saveDelta();
}
function markAdd(ev){_add.push(ev);saveDelta();}

function seedWeek(mon){
  _TMPL.forEach(function(t){
    var date=ISO(addD(mon,t.d));
    var key=_slotKey(date,t.s,t.e,t.act,t.center);
    if(_touched.indexOf(key)>=0)return;
    var dup=events.find(function(e){return e.date===date&&e.s===t.s&&e.e===t.e&&e.act===t.act&&e.center===t.center;});
    if(!dup){var nv={id:nextId++,date:date,s:t.s,e:t.e,act:t.act,center:t.center,worker:t.worker,note:t.note||'',rec:true};events.push(nv);markAdd(nv);}
  });
  checkDuplicates(mon);
}
function checkDuplicates(mon){
  var found=[];
  for(var di=0;di<7;di++){
    var date=ISO(addD(mon,di));
    var dayEvs=events.filter(function(e){return e.date===date;});
    var seen={};
    dayEvs.forEach(function(e){
      var key=e.s+'|'+e.e+'|'+e.act+'|'+e.center;
      if(seen[key]){
        if(found.indexOf(key+'@'+date)<0)found.push(key+'@'+date);
      }else{seen[key]=e;}
    });
  }
  if(found.length>0){
    var dn=['Lun','Mar','Mie','Jue','Vie','Sab','Dom'];
    var msg=found.length+' duplicado'+(found.length>1?'s':'')+' detectado'+(found.length>1?'s':'')+':\n\n';
    found.forEach(function(f){
      var parts=f.split('@');
      var slot=parts[0].split('|');
      var d=new Date(parts[1]+'T00:00:00');
      msg+=dn[d.getDay()===0?6:d.getDay()-1]+' '+parts[1]+': '+slot[2]+' '+slot[0]+'-'+slot[1]+'\n';
    });
    msg+='\n¿Eliminar duplicados? (se conserva el primero)';
    if(confirm(msg)){
      var removed=0;
      for(var di=0;di<7;di++){
        var date=ISO(addD(mon,di));
        var dayEvs=events.filter(function(e){return e.date===date;});
        var seen={};
        dayEvs.forEach(function(e){
          var key=e.s+'|'+e.e+'|'+e.act+'|'+e.center;
          if(seen[key]){events=events.filter(function(x){return x.id!==e.id;});removed++;}
          else{seen[key]=e;}
        });
      }
      scheduleAutoSave();
      toast(removed+' duplicados eliminados');
    }
  }
}

// ============================================================
// BACKUP AUTOMATICO
// ============================================================
var _bkCount=0,_bkLastSave=null;

function bkSaved(){
  _bkCount++;_bkLastSave=new Date();
  document.getElementById('bk-dot').className='bk-dot ok';
  document.getElementById('bk-txt').textContent='Auto-guardado OK';
  document.getElementById('bk-last').textContent=_bkLastSave.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  document.getElementById('bk-count').textContent=events.length+' actividades · '+_bkCount+' guardados';
  var p=document.getElementById('bk-prog');
  p.className='bk-prog saving';
  setTimeout(function(){p.className='bk-prog done';},400);
  setTimeout(function(){p.className='bk-prog';},900);
}
function bkWarn(){
  document.getElementById('bk-dot').className='bk-dot warn';
  document.getElementById('bk-txt').textContent='Guardando...';
  scheduleAutoSave();
}
function bkErr(){
  document.getElementById('bk-dot').className='bk-dot err';
  document.getElementById('bk-txt').textContent='ERROR al guardar — almacenamiento lleno?';
}
window.addEventListener('beforeunload',function(e){
  if(_dirty)autoSave();
});

// ============================================================
// HELPERS
// ============================================================
function aSt(id){var a=cfg.activities.find(function(x){return x.id===id;});return a?'background:'+a.color+';border-left-color:'+a.border+';color:'+a.text:'background:#f3f4f6;border-left-color:#9ca3af;color:#374151';}
function mSt(n){var m=cfg.monitors.find(function(x){return x.name===n;})||cfg.monitors.find(function(x){return x.name===n.toUpperCase();});return m?'background:'+m.color+';color:#1a1a1a':'background:#e5e7eb;color:#374151';}
function cLbl(id){var c=cfg.centers.find(function(x){return x.id===id;});return c?c.label:id;}

// ============================================================
// NAVEGACION
// ============================================================
var DIAS=['Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo'];
function semana(d){lunes=addD(lunes,d*7);seedWeek(lunes);all();}
function hoy(){lunes=monOf(new Date());var d=new Date().getDay();dia=d===0?6:d-1;seedWeek(lunes);all();}
function setDia(i){dia=i;tabs();render();}
function all(){wlbl();tabs();filtros();render();}

function wlbl(){var f=addD(lunes,6);document.getElementById('wlbl').textContent=lunes.getDate()+'/'+(lunes.getMonth()+1)+' - '+f.getDate()+'/'+(f.getMonth()+1)+' '+lunes.getFullYear();}
function tabs(){
  document.getElementById('tabs').innerHTML=DIAS.map(function(n,i){
    var iso=ISO(addD(lunes,i)),hv=events.some(function(e){return e.date===iso;}),es_hoy=iso===ISO(new Date());
    return '<button class="tab'+(i===dia?' on':'')+(hv?' hv':'')+'" onclick="setDia('+i+')">'+n.slice(0,3)+(es_hoy?' *':'')+'</button>';
  }).join('');
}
function filtros(){
  document.getElementById('fce').innerHTML='<option value="">Todos centros</option>'+cfg.centers.map(function(c){return '<option value="'+c.id+'">'+c.label+'</option>';}).join('');
  document.getElementById('fmo').innerHTML='<option value="">Todos monitores</option>'+cfg.monitors.map(function(m){return '<option value="'+m.name+'">'+m.name+'</option>';}).join('');
  document.getElementById('lbar').innerHTML='<span style="font-size:10px;font-weight:700;color:#aaa">ACT:</span>'+cfg.activities.slice(0,11).map(function(a){return '<div class="li"><div class="ld" style="background:'+a.color+';border:1px solid '+a.border+'"></div>'+a.label+'</div>';}).join('');
}

// ============================================================
// RENDER
// ============================================================
var PPM=1.4;
function render(){
  var fecha=dHoy(),cf=document.getElementById('fce').value,wf=document.getElementById('fmo').value;
  var sf=document.getElementById('sbx').value.toLowerCase().trim();
  var de=events.filter(function(ev){
    if(ev.date!==fecha)return false;
    if(cf&&ev.center!==cf)return false;
    if(wf&&ev.worker!==wf)return false;
    if(sf&&ev.act.toLowerCase().indexOf(sf)<0&&ev.worker.toLowerCase().indexOf(sf)<0&&(ev.note||'').toLowerCase().indexOf(sf)<0)return false;
    return true;
  });
  var cub=de.filter(function(ev){return ev.worker.toUpperCase().indexOf('CUBRIR')>=0;});
  var rw=[];de.forEach(function(ev){var u=ev.worker.toUpperCase();if(rw.indexOf(ev.worker)<0&&u.indexOf('INF')<0&&u.indexOf('AD.')<0&&u.indexOf('AD ')<0&&u.indexOf('GRUP')<0&&u.indexOf('ATENCION')<0&&u.indexOf('ATENCIO')<0&&u.indexOf('CUBRIR')<0&&u.indexOf('PREPAR')<0)rw.push(ev.worker);});
  document.getElementById('stats').innerHTML=
    '<div class="sc"><div class="scl">Actividades</div><div class="scv">'+de.length+'</div><div class="scs">'+DIAS[dia]+'</div></div>'+
    '<div class="sc"><div class="scl">Monitores</div><div class="scv">'+rw.length+'</div><div class="scs">asignados</div></div>'+
    '<div class="sc"><div class="scl">A cubrir</div><div class="scv" style="color:'+(cub.length?'#d97706':'#16a34a')+'">'+cub.length+'</div><div class="scs">'+(cub.length?'pend':'ok')+'</div></div>'+
    '<div class="sc"><div class="scl">Semana</div><div class="scv" style="font-size:13px">'+lunes.getDate()+'/'+(lunes.getMonth()+1)+'-'+addD(lunes,6).getDate()+'/'+(addD(lunes,6).getMonth()+1)+'</div><div class="scs">'+lunes.getFullYear()+'</div></div>';
  if(!de.length){document.getElementById('cal').innerHTML='<div class="emday">No hay actividades &mdash; '+DIAS[dia]+' '+fecha+'<br><button class="btn bp" style="margin-top:10px" onclick="oModal()">+ Anadir actividad</button></div>';return;}
  var allM=[];de.forEach(function(ev){allM.push(toM(ev.s),toM(ev.e));});
  var sH=Math.floor(Math.min.apply(null,allM)/60),eH=Math.ceil(Math.max.apply(null,allM)/60);
  var sM=sH*60,spanM=(eH-sH)*60,tPx=spanM*PPM;
  var cols={},colArr=[];de.forEach(function(ev){var k=ev.center+'|'+ev.act;if(!cols[k]){cols[k]=1;colArr.push({cen:ev.center,act:ev.act});}});
  var h='<div class="cgrid"><div class="chead"><div class="cht"></div>';
  colArr.forEach(function(c){h+='<div class="chc"><div class="chs">'+cLbl(c.cen)+'</div>'+c.act+'</div>';});
  h+='</div><div class="cbody" style="height:'+tPx+'px"><div class="cax" style="height:'+tPx+'px">';
  for(var hr=sH;hr<=eH;hr++)h+='<div class="tl" style="top:'+((hr*60-sM)*PPM)+'px">'+('0'+hr).slice(-2)+':00</div>';
  h+='</div>';
  colArr.forEach(function(col){
    h+='<div class="ccol" style="height:'+tPx+'px">';
    for(var m=0;m<=spanM;m+=15)h+='<div class="hl '+(m%60===0?'mj':'mn')+'" style="top:'+(m*PPM)+'px"></div>';
    h+='<div style="position:absolute;inset:0;z-index:1;cursor:pointer" onclick="oModal(null,null,\''+col.cen+'\',\''+col.act+'\')"></div>';
    de.filter(function(ev){return ev.center===col.cen&&ev.act===col.act;}).forEach(function(ev){
      var top=(toM(ev.s)-sM)*PPM,ht=(toM(ev.e)-toM(ev.s))*PPM-2;
      h+='<div class="ev" style="top:'+top+'px;height:'+ht+'px;'+aSt(ev.act)+'" onclick="event.stopPropagation();oModal('+ev.id+')">';
      if(ev.rec)h+='<span style="position:absolute;top:2px;right:3px;font-size:8px;opacity:.3">&#8635;</span>';
      h+='<div class="evn">'+ev.act+'</div>';
      if(ht>30)h+='<div class="evt">'+ev.s+'-'+ev.e+'</div>';
      if(ht>46)h+='<span class="evw" style="'+mSt(ev.worker)+'">'+ev.worker+'</span>';
      if(ht>60&&ev.note)h+='<div class="evno">'+ev.note+'</div>';
      h+='</div>';
    });
    h+='</div>';
  });
  h+='</div></div>';
  document.getElementById('cal').innerHTML=h;
}

// ============================================================
// MODAL EVENTO
// ============================================================
function fillSel(pa,pc,pm){
  var fa=document.getElementById('fact');fa.innerHTML=cfg.activities.map(function(a){return '<option value="'+a.id+'">'+a.label+'</option>';}).join('');if(pa)fa.value=pa;
  var fc=document.getElementById('fcen');fc.innerHTML=cfg.centers.map(function(c){return '<option value="'+c.id+'">'+c.label+'</option>';}).join('');if(pc)fc.value=pc;
  var fm=document.getElementById('fmon');fm.innerHTML=cfg.monitors.map(function(m){return '<option value="'+m.name+'">'+m.name+(m.role?' - '+m.role:'')+'</option>';}).join('');if(pm)fm.value=pm;
}
function ucc(){var n=npal(document.getElementById('fnot').value);var el=document.getElementById('cc');el.textContent=n+' palabra'+(n!==1?'s':'');el.className='cc'+(n>5?' red':'');}
function oModal(id,pT,pC,pA){
  editId=id||null;document.getElementById('warn').style.display='none';document.getElementById('bdel').style.display=id?'inline-block':'none';
  if(id){var ev=events.find(function(e){return e.id===id;});document.getElementById('mh').innerHTML='Editar actividad'+(ev&&ev.rec?'<span class="rb">&#8635; recurrente</span>':'');fillSel(ev.act,ev.center,ev.worker);document.getElementById('fini').value=ev.s;document.getElementById('ffin').value=ev.e;document.getElementById('fnot').value=ev.note||'';document.getElementById('frep').value=ev.rec?'si':'no';}
  else{document.getElementById('mh').textContent='Nueva actividad';fillSel(pA||null,pC||null,null);document.getElementById('fini').value=pT||'';document.getElementById('ffin').value=pT?fM(toM(pT)+60):'';document.getElementById('fnot').value='';document.getElementById('frep').value='si';}
  ucc();document.getElementById('oev').classList.add('open');
}
function cModal(){document.getElementById('oev').classList.remove('open');editId=null;}
function chk(){
  var w=document.getElementById('fmon').value,ts=document.getElementById('fini').value,te=document.getElementById('ffin').value;
  var warn=document.getElementById('warn');if(!w||!ts||!te){warn.style.display='none';return;}
  var u=w.toUpperCase();if(u.indexOf('CUBRIR')>=0||u.indexOf('GRUPO')>=0||u.indexOf('PREPAR')>=0||u.indexOf('ATENCION')>=0){warn.style.display='none';return;}
  var hit=events.find(function(ev){return ev.date===dHoy()&&ev.id!==editId&&ev.worker===w&&toM(ev.s)<toM(te)&&toM(ev.e)>toM(ts);});
  warn.style.display=hit?'block':'none';
}

// ============================================================
// GUARDAR
// ============================================================
function guardar(){
  var vA=document.getElementById('fact').value;
  var vI=document.getElementById('fini').value;
  var vF=document.getElementById('ffin').value;
  var vC=document.getElementById('fcen').value;
  var vM=document.getElementById('fmon').value;
  var vN=document.getElementById('fnot').value.trim();
  var vR=document.getElementById('frep').value==='si';
  if(!vA||!vI||!vF||!vM){alert('Completa todos los campos.');return;}
  if(toM(vI)>=toM(vF)){alert('La hora fin debe ser posterior al inicio.');return;}
  if(npal(vN)>5){alert('La nota no puede superar 5 palabras.');return;}
  var vD=dHoy();
  if(editId){
    var ix=events.findIndex(function(e){return e.id===editId;});
    if(ix>=0){
      var oldEv=Object.assign({},events[ix]);
      events[ix]={id:editId,date:events[ix].date,s:vI,e:vF,act:vA,center:vC,worker:vM,note:vN,rec:vR};
      markMod(events[ix],oldEv);
      // If recurring and something changed, ask to propagate to future weeks
      if(oldEv.rec&&(oldEv.worker!==vM||oldEv.s!==vI||oldEv.e!==vF||oldEv.act!==vA||oldEv.center!==vC||oldEv.note!==vN)){
        var propagar=confirm('¿Aplicar este cambio tambien a las semanas futuras?\n\nAceptar = cambiar todos los '+['lunes','martes','miercoles','jueves','viernes','sabados','domingos'][new Date(oldEv.date+'T00:00:00').getDay()===0?6:new Date(oldEv.date+'T00:00:00').getDay()-1]+' futuros\nCancelar = solo este dia');
        if(propagar){
          var hd=oldEv.date;
          var editDow=new Date(oldEv.date+'T00:00:00').getDay();
          events.forEach(function(e,i){
            if(i!==ix&&e.date>hd&&e.rec&&e.s===oldEv.s&&e.e===oldEv.e&&e.act===oldEv.act&&e.center===oldEv.center&&e.worker===oldEv.worker){
              // Only propagate to same day of week
              var eDow=new Date(e.date+'T00:00:00').getDay();
              if(eDow!==editDow)return;
              var oldE=Object.assign({},events[i]);
              events[i]={id:e.id,date:e.date,s:vI,e:vF,act:vA,center:vC,worker:vM,note:vN,rec:true};
              markMod(events[i],oldE);
            }
          });
        }
      }
    }
  }else{
    var e0={id:nextId++,date:vD,s:vI,e:vF,act:vA,center:vC,worker:vM,note:vN,rec:vR};
    events.push(e0);markAdd(e0);
    if(vR){var base=addD(lunes,dia);for(var sw=1;sw<=11;sw++){var ef={id:nextId++,date:ISO(addD(base,sw*7)),s:vI,e:vF,act:vA,center:vC,worker:vM,note:vN,rec:true};events.push(ef);markAdd(ef);}}
    saveDelta();
  }
  cModal();tabs();render();bkWarn();
  toast(vR?'Guardado en 12 semanas':'Guardado');
}

// ============================================================
// ELIMINAR
// ============================================================
function delEv(){
  if(!editId)return;
  var ev=events.find(function(e){return e.id===editId;});if(!ev)return;
  var evDow=new Date(ev.date+'T00:00:00').getDay();
  var dnNames=['domingos','lunes','martes','miercoles','jueves','viernes','sabados'];
  var soloHoy=confirm('Eliminar SOLO este dia?\n\nCancelar = eliminar todos los '+dnNames[evDow]+' futuros con esta actividad.');
  if(soloHoy){
    _touchSlot(ev.date,ev.s,ev.e,ev.act,ev.center);
    events=events.filter(function(e){return e.id!==editId;});
    markDel(editId);
  }else{
    var hd=ev.date;
    var targets=events.filter(function(e){
      if(e.s!==ev.s||e.e!==ev.e||e.act!==ev.act||e.center!==ev.center||e.worker!==ev.worker||e.date<hd)return false;
      var eDow=new Date(e.date+'T00:00:00').getDay();
      return eDow===evDow;
    });
    targets.forEach(function(e){_touchSlot(e.date,e.s,e.e,e.act,e.center);});
    var ids=targets.map(function(e){return e.id;});
    ids.forEach(function(id){markDel(id);});
    events=events.filter(function(e){return ids.indexOf(e.id)<0;});
  }
  scheduleAutoSave();
  cModal();tabs();render();toast('Eliminado');
}

// ============================================================
// CONFIG
// ============================================================
var BCOLS=['#bfdbfe','#ddd6fe','#bbf7d0','#fed7aa','#fde68a','#e9d5ff','#a7f3d0','#fca5a5','#d1fae5','#fef08a'];
function oCfg(){rCfg();document.getElementById('ocfg').classList.add('open');}
function cCfg(){document.getElementById('ocfg').classList.remove('open');filtros();render();}
function stab(t){['a','m','c'].forEach(function(x){document.getElementById('cp'+x).style.display=x===t?'block':'none';document.getElementById('ct'+x).classList.toggle('on',x===t);});}
function rCfg(){
  document.getElementById('la').innerHTML=cfg.activities.map(function(a,i){return '<div class="ci"><div class="cd" style="background:'+a.color+';border:1px solid '+a.border+'"></div><span class="cn">'+a.label+'</span><span class="csb">'+a.id+'</span><button class="cx" onclick="dAct('+i+')">&#215;</button></div>';}).join('');
  document.getElementById('lm').innerHTML=cfg.monitors.map(function(m,i){return '<div class="ci"><div class="cd" style="background:'+m.color+'"></div><span class="cn">'+m.name+'</span><span class="csb">'+m.role+'</span><button class="cx" onclick="dMon('+i+')">&#215;</button></div>';}).join('');
  document.getElementById('lc').innerHTML=cfg.centers.map(function(c,i){return '<div class="ci"><span class="cn">'+c.label+'</span><span class="csb">'+c.id+'</span><button class="cx" onclick="dCen('+i+')">&#215;</button></div>';}).join('');
}
function aAct(){var n=document.getElementById('na').value.trim().toUpperCase(),col=document.getElementById('nac').value;if(!n){alert('Escribe el nombre.');return;}if(cfg.activities.find(function(a){return a.id===n;})){alert('Ya existe.');return;}cfg.activities.push({id:n,label:n.charAt(0)+n.slice(1).toLowerCase(),color:col,border:col,text:'#1a1a1a'});saveCfg();document.getElementById('na').value='';rCfg();toast('"'+n+'" anadida');}
function dAct(i){if(!confirm('Eliminar?'))return;cfg.activities.splice(i,1);saveCfg();rCfg();}
function aMon(){var n=document.getElementById('nm').value.trim(),r=document.getElementById('nmr').value.trim()||'Monitor';if(!n){alert('Escribe el nombre.');return;}if(cfg.monitors.find(function(m){return m.name===n;})){alert('Ya existe.');return;}cfg.monitors.push({name:n,role:r,color:BCOLS[cfg.monitors.length%BCOLS.length]});saveCfg();document.getElementById('nm').value='';document.getElementById('nmr').value='';rCfg();toast('"'+n+'" anadido');}
function dMon(i){if(!confirm('Eliminar?'))return;cfg.monitors.splice(i,1);saveCfg();rCfg();}
function aCen(){var id=document.getElementById('nc').value.trim().toUpperCase().replace(/\s+/g,'_'),lbl=document.getElementById('ncl').value.trim()||id;if(!id){alert('Escribe la clave.');return;}if(cfg.centers.find(function(c){return c.id===id;})){alert('Ya existe.');return;}cfg.centers.push({id:id,label:lbl});saveCfg();document.getElementById('nc').value='';document.getElementById('ncl').value='';rCfg();toast('"'+lbl+'" anadido');}
function dCen(i){if(!confirm('Eliminar?'))return;cfg.centers.splice(i,1);saveCfg();rCfg();}

// ============================================================
// BACKUP / IMPORTAR / RESET
// ============================================================
function backup(){
  var ts=ISO(new Date())+'_'+('0'+new Date().getHours()).slice(-2)+'h'+('0'+new Date().getMinutes()).slice(-2);
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify({events:events,nextId:nextId,cfg:cfg,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}));
  a.download='sportgest_alzira_'+ts+'.json';
  a.click();
  document.getElementById('bk-dot').className='bk-dot ok';
  document.getElementById('bk-txt').textContent='Copia JSON guardada en Descargas';
  toast('Backup JSON descargado');
}
function guardarHTML(){
  var evJson=JSON.stringify(events);
  var cfgJson=JSON.stringify(cfg);
  var tmpl=[];
  var latestMon=monOf(new Date());
  for(var di=0;di<7;di++){
    var dd=ISO(addD(latestMon,di));
    events.filter(function(ev){return ev.date===dd&&ev.rec;}).forEach(function(ev){
      tmpl.push({d:di,s:ev.s,e:ev.e,act:ev.act,center:ev.center,worker:ev.worker,note:ev.note||'',rec:true});
    });
  }
  var tmplJson=JSON.stringify(tmpl);
  var touchedJson=JSON.stringify(_touched);
  // Collect CSS
  var cssText='';
  try{var ss=document.styleSheets;for(var si=0;si<ss.length;si++){try{var rules=ss[si].cssRules||ss[si].rules;for(var ri=0;ri<rules.length;ri++)cssText+=rules[ri].cssText+'\n';}catch(e){}}}catch(e){}
  // Collect body HTML (exclude scripts)
  var bodyHTML='';
  var ch=document.body.children;
  for(var ci=0;ci<ch.length;ci++){if(ch[ci].tagName!=='SCRIPT')bodyHTML+=ch[ci].outerHTML+'\n';}
  // Build standalone HTML
  var h='<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="UTF-8">\n';
  h+='<meta name="viewport" content="width=device-width,initial-scale=1">\n';
  h+='<title>SportGest Alzira</title>\n<style>\n'+cssText+'\n</style>\n</head>\n<body>\n';
  h+=bodyHTML+'\n';
  h+='<script>\nvar _STORE=\'sg_'+Date.now()+'\';\n';
  h+='var _EV='+evJson+';\n';
  h+='var _CFG='+cfgJson+';\n';
  h+='var _NID='+nextId+';\n';
  h+='var _TMPL='+tmplJson+';\n';
  h+='var _DELETED='+touchedJson+';\n';
  h+='<\/script>\n';
  if(_appJsContent){
    h+='<script>\n'+_appJsContent+'\n<\/script>\n';
  }
  h+='</body>\n</html>';
  var blob=new Blob([h],{type:'text/html'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='horarios_alzira.html';
  a.click();
  document.getElementById('bk-dot').className='bk-dot ok';
  document.getElementById('bk-txt').textContent='HTML exportado con todos los cambios';
  toast('HTML exportado — sustituye el fichero anterior por el nuevo');
}
function importar(e){
  var f=e.target.files[0];if(!f)return;
  var r=new FileReader();
  r.onload=function(ev){
    try{
      var p=JSON.parse(ev.target.result);
      if(p.events){events=p.events;nextId=p.nextId||Math.max.apply(null,p.events.map(function(x){return x.id+1;}));}
      if(p.cfg){cfg=p.cfg;}
      // Save everything
      autoSave();
      all();
      toast(events.length+' actividades importadas');
    }catch(err){alert('Error: '+err.message);}
  };
  r.readAsText(f);e.target.value='';
}
function importarExcel(e){
  var file=e.target.files[0];if(!file)return;e.target.value='';
  var doRead=function(){
    var reader=new FileReader();
    reader.onload=function(ev){
      try{
        var wb=XLSX.read(ev.target.result,{type:'array'});
        var sheetName=wb.SheetNames.indexOf('Horarios semana')>=0?'Horarios semana':wb.SheetNames[0];
        var ws=wb.Sheets[sheetName];
        var rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        if(!rows||rows.length<2){alert('Excel sin datos o formato incorrecto.\nFormato esperado: Dia, Fecha, Inicio, Fin, Actividad, Centro, Monitor, Nota, Horas');return;}
        var header=rows[0].map(function(h){return String(h).trim().toLowerCase();});
        var iFecha=header.indexOf('fecha'),iIni=header.indexOf('inicio'),iFin=header.indexOf('fin');
        var iAct=header.indexOf('actividad'),iCen=header.indexOf('centro'),iMon=header.indexOf('monitor');
        var iNot=header.indexOf('nota');
        if(iFecha<0||iIni<0||iFin<0||iAct<0){alert('Columnas no encontradas.\nNecesita: Fecha, Inicio, Fin, Actividad\nEncontrado: '+rows[0].join(', '));return;}
        var nuevos=[],fechas=new Set();
        rows.slice(1).forEach(function(row){
          if(!row[iFecha]&&!row[iIni])return;
          var rawF=row[iFecha],fecha='';
          if(typeof rawF==='number'){var dd=new Date(Math.round((rawF-25569)*86400*1000));fecha=ISO(dd);}
          else{fecha=String(rawF).trim();if(fecha.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)){var p=fecha.split('/');fecha=p[2]+'-'+('0'+p[1]).slice(-2)+'-'+('0'+p[0]).slice(-2);}}
          if(!fecha.match(/^\d{4}-\d{2}-\d{2}$/))return;
          var nh=function(v){if(!v&&v!==0)return'';if(typeof v==='number'){var tm=Math.round(v*24*60);return('0'+Math.floor(tm/60)).slice(-2)+':'+('0'+(tm%60)).slice(-2);}var s=String(v).trim();return s.match(/^\d{1,2}:\d{2}$/)?('0'+s).slice(-5):s;};
          var ini=nh(row[iIni]),fin=nh(row[iFin]),act=String(row[iAct]||'').trim().toUpperCase();
          var cen=String(row[iCen]||'').trim(),mon=String(row[iMon]||'').trim(),nota=iNot>=0?String(row[iNot]||'').trim():'';
          if(!ini||!fin||!act)return;
          var cenId=cen;cfg.centers.forEach(function(c){if(c.label.toLowerCase()===cen.toLowerCase()||c.id.toLowerCase()===cen.toLowerCase())cenId=c.id;});
          if(!cfg.activities.find(function(a){return a.id===act;}))cfg.activities.push({id:act,label:act.charAt(0)+act.slice(1).toLowerCase(),color:'#f3f4f6',border:'#9ca3af',text:'#374151'});
          fechas.add(fecha);
          nuevos.push({id:null,date:fecha,s:ini,e:fin,act:act,center:cenId,worker:mon,note:nota,rec:true});
        });
        if(!nuevos.length){alert('No se encontraron actividades validas en el Excel.');return;}
        var fa=Array.from(fechas).sort();
        if(!confirm('Reemplazar eventos de:\n\n'+fa.join('\n')+'\n\nNuevos eventos: '+nuevos.length+'\n\nContinuar?'))return;
        fechas.forEach(function(f){var aDel=events.filter(function(ev){return ev.date===f;});aDel.forEach(function(ev){markDel(ev.id);});events=events.filter(function(ev){return ev.date!==f;});});
        nuevos.forEach(function(ev){ev.id=nextId++;events.push(ev);markAdd(ev);});
        saveDelta();saveCfg();
        if(fa.length){var pf=new Date(fa[0]+'T00:00:00');lunes=monOf(pf);dia=Math.min(pf.getDay()===0?6:pf.getDay()-1,5);}
        all();bkWarn();toast('Importados '+nuevos.length+' eventos de '+fa.length+' dias');
      }catch(err){alert('Error al leer Excel: '+err.message);}
    };
    reader.readAsArrayBuffer(file);
  };
  if(typeof XLSX!=='undefined'){doRead();}
  else{var s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=doRead;s.onerror=function(){alert('Error cargando libreria Excel. Necesitas conexion a internet la primera vez.');};document.head.appendChild(s);}
}
function resetear(){
  if(!confirm('Resetear a los datos base (16/3 al 20/6)?\nSe perderan los cambios no exportados.'))return;
  localStorage.removeItem(_STORE);localStorage.removeItem(_STORE+'c');
  _del=[];_mod=[];_add=[];
  events=_EV.map(function(e){return Object.assign({},e);});nextId=_NID;cfg=JSON.parse(JSON.stringify(_CFG));
  all();toast('Datos reiniciados');
}

// ============================================================
// PLANILLA IMPRIMIBLE
// ============================================================
function printWeek(){
  var DNF=['Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo'];
  var days=[0,1,2,3,4,5,6].map(function(i){var d=ISO(addD(lunes,i));return{n:DNF[i],d:d,ev:events.filter(function(e){return e.date===d;}).sort(function(a,b){return toM(a.s)-toM(b.s);})};});
  var wl=lunes.getDate()+'/'+(lunes.getMonth()+1)+'-'+addD(lunes,6).getDate()+'/'+(addD(lunes,6).getMonth()+1)+'/'+lunes.getFullYear();
  // Section: Por dia
  var bd='';days.forEach(function(day){if(!day.ev.length)return;bd+='<div class="db"><h2>'+day.n+' <em>'+day.d+'</em></h2><table><tr><th>Inicio</th><th>Fin</th><th>Actividad</th><th>Centro</th><th>Monitor</th><th>Nota</th></tr>';day.ev.forEach(function(ev){bd+='<tr><td>'+ev.s+'</td><td>'+ev.e+'</td><td><b>'+ev.act+'</b></td><td>'+cLbl(ev.center)+'</td><td>'+ev.worker+'</td><td class="nt">'+(ev.note||'')+'</td></tr>';});bd+='</table></div>';});
  // Collect all named workers (exclude groups, placeholders)
  var allW=[];days.forEach(function(d){d.ev.forEach(function(ev){var u=ev.worker.toUpperCase();if(allW.indexOf(ev.worker)<0&&u.indexOf('CUBRIR')<0&&u.indexOf('PREPAR')<0&&u.indexOf('INF ')<0&&u.indexOf('INF.')<0&&u.indexOf('AD.')<0&&u.indexOf('AD ')<0&&u.indexOf('ATENCION')<0&&u.indexOf('ATENCIO')<0&&u.indexOf('GRUPO')<0)allW.push(ev.worker);});});allW.sort();
  // Section: Per monitor detail
  var wb='';allW.forEach(function(w){var wev=[];days.forEach(function(d){d.ev.filter(function(ev){return ev.worker===w;}).forEach(function(ev){wev.push(Object.assign({},ev,{dn:d.n}));});});if(!wev.length)return;var tot=(wev.reduce(function(s,ev){return s+(toM(ev.e)-toM(ev.s));},0)/60).toFixed(1);wb+='<div class="db"><h2>'+w+' <em>'+tot+' h</em></h2><table><tr><th>Dia</th><th>Inicio</th><th>Fin</th><th>Actividad</th><th>Centro</th><th>Nota</th><th>Horas</th></tr>';wev.forEach(function(ev){var h=((toM(ev.e)-toM(ev.s))/60).toFixed(1);wb+='<tr><td>'+ev.dn+'</td><td>'+ev.s+'</td><td>'+ev.e+'</td><td>'+ev.act+'</td><td>'+cLbl(ev.center)+'</td><td class="nt">'+(ev.note||'')+'</td><td>'+h+'h</td></tr>';});wb+='</table></div>';});
  // Section: Summary table — hours per monitor per day + total
  var allWAll=[];days.forEach(function(d){d.ev.forEach(function(ev){if(allWAll.indexOf(ev.worker)<0)allWAll.push(ev.worker);});});allWAll.sort();
  var activeDays=days.filter(function(d){return d.ev.length>0;});
  var sh='<table><tr><th>Monitor</th>';
  activeDays.forEach(function(d){sh+='<th>'+d.n.slice(0,3)+'</th>';});
  sh+='<th style="background:#dbeafe;font-weight:800">TOTAL</th></tr>';
  var totalsRow=new Array(activeDays.length).fill(0);
  var grandTotal=0;
  allWAll.forEach(function(w){
    sh+='<tr><td style="font-weight:600">'+w+'</td>';
    var rowTotal=0;
    activeDays.forEach(function(d,di){
      var h=+(d.ev.filter(function(ev){return ev.worker===w;}).reduce(function(s,ev){return s+(toM(ev.e)-toM(ev.s));},0)/60).toFixed(1);
      sh+='<td'+(h>0?'':' style="color:#ddd"')+'>'+h+'</td>';
      rowTotal+=h;totalsRow[di]+=h;
    });
    grandTotal+=rowTotal;
    sh+='<td style="background:#eff6ff;font-weight:700">'+rowTotal.toFixed(1)+'</td></tr>';
  });
  sh+='<tr style="font-weight:800;background:#f0f0f0"><td>TOTAL</td>';
  totalsRow.forEach(function(t){sh+='<td>'+t.toFixed(1)+'</td>';});
  sh+='<td style="background:#dbeafe">'+grandTotal.toFixed(1)+'</td></tr></table>';
  // Build page
  var win=window.open('','_blank','width=900,height=700');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Horarios '+wl+'</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;font-size:11px;padding:18px}h1{font-size:16px;font-weight:700;margin-bottom:3px}.su{font-size:11px;color:#888;margin-bottom:16px}.se{font-size:13px;font-weight:700;margin:20px 0 8px;border-bottom:2px solid #222;padding-bottom:4px}.db{margin-bottom:14px;break-inside:avoid}h2{font-size:12px;font-weight:700;margin-bottom:4px;color:#2563eb}h2 em{font-style:normal;font-weight:400;color:#aaa;font-size:10px;margin-left:4px}table{width:100%;border-collapse:collapse}th{background:#f0f0f0;text-align:left;padding:4px 6px;font-size:10px;font-weight:700;border:1px solid #ddd}td{padding:4px 6px;border:1px solid #ddd;font-size:10px}tr:nth-child(even){background:#fafafa}.nt{font-style:italic;color:#888}.np{margin-bottom:12px}@media print{.np{display:none}body{padding:6px}}</style></head><body><div class="np"><button onclick="window.print()" style="padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-right:6px;font-size:12px">Imprimir/PDF</button><button onclick="window.close()" style="padding:6px 14px;background:#fff;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:12px">Cerrar</button></div><h1>SportGest Alzira</h1><p class="su">Semana '+wl+'</p><div class="se">Resumen horas por monitor</div>'+sh+'<div class="se">Por dia</div><div style="columns:2;gap:16px">'+bd+'</div><div class="se">Detalle por monitor</div>'+(wb||'<p style="color:#ccc">Sin monitores nominales.</p>')+'</body></html>');
  win.document.close();
}

// ============================================================
// PLANILLA PERIODO (MENSUAL)
// ============================================================
function openPrintMes(){
  // Default: 1st to last day of current month
  var now=new Date(),yr=now.getFullYear(),mo=now.getMonth();
  var d1=yr+'-'+String(mo+1).padStart(2,'0')+'-01';
  var lastDay=new Date(yr,mo+1,0).getDate();
  var d2=yr+'-'+String(mo+1).padStart(2,'0')+'-'+String(lastDay).padStart(2,'0');
  var html='<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center" id="pm-overlay" onclick="if(event.target===this)this.remove()">';
  html+='<div style="background:#fff;border-radius:12px;padding:24px 28px;min-width:340px;box-shadow:0 12px 40px rgba(0,0,0,.2)">';
  html+='<h3 style="margin:0 0 16px;font-size:16px">Planilla de periodo</h3>';
  html+='<div style="display:flex;gap:12px;margin-bottom:16px">';
  html+='<div style="flex:1"><label style="font-size:11px;font-weight:600;color:#666;display:block;margin-bottom:4px">Desde</label><input type="date" id="pm-desde" value="'+d1+'" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px"></div>';
  html+='<div style="flex:1"><label style="font-size:11px;font-weight:600;color:#666;display:block;margin-bottom:4px">Hasta</label><input type="date" id="pm-hasta" value="'+d2+'" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px"></div>';
  html+='</div>';
  html+='<div style="display:flex;gap:8px;justify-content:flex-end">';
  html+='<button onclick="document.getElementById(\'pm-overlay\').remove()" style="padding:8px 16px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:12px">Cancelar</button>';
  html+='<button onclick="printMes()" style="padding:8px 20px;border:none;border-radius:6px;background:#7c3aed;color:#fff;cursor:pointer;font-weight:600;font-size:12px">Generar planilla</button>';
  html+='</div></div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
}
function printMes(){
  var desde=document.getElementById('pm-desde').value;
  var hasta=document.getElementById('pm-hasta').value;
  document.getElementById('pm-overlay').remove();
  if(!desde||!hasta){alert('Selecciona ambas fechas.');return;}
  if(desde>hasta){alert('La fecha "Desde" debe ser anterior a "Hasta".');return;}
  var DNF7=['Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo'];
  var MN=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  // Build list of dates in range
  var allDates=[];
  var cur=new Date(desde+'T00:00:00');
  var end=new Date(hasta+'T00:00:00');
  while(cur<=end){allDates.push(ISO(cur));cur=addD(cur,1);}
  // Filter events in range
  var mev=events.filter(function(e){return e.date>=desde&&e.date<=hasta;}).sort(function(a,b){return a.date.localeCompare(b.date)||toM(a.s)-toM(b.s);});
  if(!mev.length){alert('No hay actividades en el periodo seleccionado.');return;}
  var fd=new Date(desde+'T00:00:00'),fh=new Date(hasta+'T00:00:00');
  var titulo=fd.getDate()+'/'+(fd.getMonth()+1)+'/'+fd.getFullYear()+' - '+fh.getDate()+'/'+(fh.getMonth()+1)+'/'+fh.getFullYear();
  // Collect all workers (named only)
  var allW=[];mev.forEach(function(ev){var u=ev.worker.toUpperCase();if(allW.indexOf(ev.worker)<0&&u.indexOf('CUBRIR')<0&&u.indexOf('PREPAR')<0&&u.indexOf('INF ')<0&&u.indexOf('INF.')<0&&u.indexOf('AD.')<0&&u.indexOf('AD ')<0&&u.indexOf('ATENCION')<0&&u.indexOf('ATENCIO')<0&&u.indexOf('GRUPO')<0)allW.push(ev.worker);});allW.sort();
  // Collect all workers including groups (for summary)
  var allWAll=[];mev.forEach(function(ev){if(allWAll.indexOf(ev.worker)<0)allWAll.push(ev.worker);});allWAll.sort();
  // Group events by week
  var weeks={};mev.forEach(function(ev){var wk=ISO(monOf(new Date(ev.date+'T00:00:00')));if(!weeks[wk])weeks[wk]=[];weeks[wk].push(ev);});
  var wkKeys=Object.keys(weeks).sort();
  // ---- SECTION 1: Resumen horas por monitor (by week) ----
  var sh='<table><tr><th>Monitor</th>';
  var wkLabels=wkKeys.map(function(wk){var m=new Date(wk+'T00:00:00');var mf=addD(m,6);return m.getDate()+'/'+(m.getMonth()+1)+'-'+mf.getDate()+'/'+(mf.getMonth()+1);});
  wkLabels.forEach(function(l){sh+='<th style="font-size:9px">'+l+'</th>';});
  sh+='<th style="background:#dbeafe;font-weight:800">TOTAL</th></tr>';
  var colTotals=new Array(wkKeys.length).fill(0);
  var grandTotal=0;
  allWAll.forEach(function(w){
    sh+='<tr><td style="font-weight:600;white-space:nowrap">'+w+'</td>';
    var rowTotal=0;
    wkKeys.forEach(function(wk,wi){
      var h=+(weeks[wk].filter(function(ev){return ev.worker===w;}).reduce(function(s,ev){return s+(toM(ev.e)-toM(ev.s));},0)/60).toFixed(1);
      sh+='<td'+(h>0?'':' style="color:#ddd"')+'>'+h+'</td>';
      rowTotal+=h;colTotals[wi]+=h;
    });
    grandTotal+=rowTotal;
    sh+='<td style="background:#eff6ff;font-weight:700">'+rowTotal.toFixed(1)+'</td></tr>';
  });
  sh+='<tr style="font-weight:800;background:#f0f0f0"><td>TOTAL</td>';
  colTotals.forEach(function(t){sh+='<td>'+t.toFixed(1)+'</td>';});
  sh+='<td style="background:#dbeafe">'+grandTotal.toFixed(1)+'</td></tr></table>';
  // ---- SECTION 2: Detalle por monitor ----
  var wb='';
  allW.forEach(function(w){
    var wev=mev.filter(function(ev){return ev.worker===w;});
    if(!wev.length)return;
    var tot=(wev.reduce(function(s,ev){return s+(toM(ev.e)-toM(ev.s));},0)/60).toFixed(1);
    wb+='<div class="db"><h2>'+w+' <em>'+tot+' h</em></h2><table><tr><th>Fecha</th><th>Dia</th><th>Inicio</th><th>Fin</th><th>Actividad</th><th>Centro</th><th>Nota</th><th>Horas</th></tr>';
    // Group by week for subtotals
    wkKeys.forEach(function(wk){
      var wkEvs=wev.filter(function(ev){var ewk=ISO(monOf(new Date(ev.date+'T00:00:00')));return ewk===wk;});
      if(!wkEvs.length)return;
      var wkTot=0;
      wkEvs.forEach(function(ev){
        var dw=new Date(ev.date+'T00:00:00').getDay();
        var dn=DNF7[dw===0?6:dw-1];
        var h=+((toM(ev.e)-toM(ev.s))/60).toFixed(1);
        wkTot+=h;
        var dd=ev.date.split('-');
        wb+='<tr><td>'+dd[2]+'/'+dd[1]+'</td><td>'+dn.slice(0,3)+'</td><td>'+ev.s+'</td><td>'+ev.e+'</td><td>'+ev.act+'</td><td>'+cLbl(ev.center)+'</td><td class="nt">'+(ev.note||'')+'</td><td>'+h.toFixed(1)+'h</td></tr>';
      });
      var m=new Date(wk+'T00:00:00');
      wb+='<tr style="background:#f0f4ff;font-weight:600"><td colspan="7" style="text-align:right;font-size:9px">Semana '+m.getDate()+'/'+(m.getMonth()+1)+'</td><td>'+wkTot.toFixed(1)+'h</td></tr>';
    });
    wb+='<tr style="background:#dbeafe;font-weight:700"><td colspan="7" style="text-align:right">TOTAL '+w+'</td><td>'+tot+'h</td></tr>';
    wb+='</table></div>';
  });
  // ---- BUILD PAGE ----
  var css='*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;font-size:11px;padding:18px}h1{font-size:16px;font-weight:700;margin-bottom:3px}.su{font-size:11px;color:#888;margin-bottom:16px}.se{font-size:13px;font-weight:700;margin:20px 0 8px;border-bottom:2px solid #222;padding-bottom:4px}.db{margin-bottom:14px;break-inside:avoid}h2{font-size:12px;font-weight:700;margin-bottom:4px;color:#7c3aed}h2 em{font-style:normal;font-weight:400;color:#aaa;font-size:10px;margin-left:4px}table{width:100%;border-collapse:collapse}th{background:#f0f0f0;text-align:left;padding:4px 6px;font-size:10px;font-weight:700;border:1px solid #ddd}td{padding:4px 6px;border:1px solid #ddd;font-size:10px}tr:nth-child(even){background:#fafafa}.nt{font-style:italic;color:#888}.np{margin-bottom:12px}@media print{.np{display:none}body{padding:6px}}';
  var win=window.open('','_blank','width=960,height=700');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Planilla '+titulo+'</title><style>'+css+'</style></head><body>');
  win.document.write('<div class="np"><button onclick="window.print()" style="padding:6px 14px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-right:6px;font-size:12px">Imprimir/PDF</button><button onclick="window.close()" style="padding:6px 14px;background:#fff;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:12px">Cerrar</button></div>');
  win.document.write('<h1>SportGest Alzira</h1>');
  win.document.write('<p class="su">Periodo: '+titulo+' ('+mev.length+' actividades)</p>');
  win.document.write('<div class="se">Resumen horas por monitor y semana</div>');
  win.document.write(sh);
  win.document.write('<div class="se">Detalle por monitor</div>');
  win.document.write(wb||'<p style="color:#ccc">Sin monitores nominales.</p>');
  win.document.write('</body></html>');
  win.document.close();
}

// ============================================================
// EXCEL
// ============================================================
function lxls(cb){if(typeof XLSX!=='undefined'){cb();return;}var s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=cb;document.head.appendChild(s);}
var DNF=['Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo'];
function xlsSemana(){
  var wl=lunes.getDate()+'-'+(lunes.getMonth()+1)+'-'+lunes.getFullYear();
  lxls(function(){
    var wb=XLSX.utils.book_new();
    var r1=[['Dia','Fecha','Inicio','Fin','Actividad','Centro','Monitor','Nota','Horas']];
    [0,1,2,3,4,5,6].forEach(function(i){var d=ISO(addD(lunes,i));events.filter(function(e){return e.date===d;}).sort(function(a,b){return toM(a.s)-toM(b.s);}).forEach(function(ev){r1.push([DNF[i],d,ev.s,ev.e,ev.act,cLbl(ev.center),ev.worker,ev.note||'',+((toM(ev.e)-toM(ev.s))/60).toFixed(2)]);});});
    var ws1=XLSX.utils.aoa_to_sheet(r1);ws1['!cols']=[{wch:10},{wch:12},{wch:7},{wch:7},{wch:20},{wch:17},{wch:20},{wch:20},{wch:7}];XLSX.utils.book_append_sheet(wb,ws1,'Horarios semana');
    var aw=[];[0,1,2,3,4,5,6].forEach(function(i){events.filter(function(e){return e.date===ISO(addD(lunes,i));}).forEach(function(e){if(aw.indexOf(e.worker)<0)aw.push(e.worker);});});aw.sort();
    var r2=[['Monitor','Dia','Fecha','Inicio','Fin','Actividad','Centro','Nota','Horas']];
    aw.forEach(function(w){[0,1,2,3,4,5,6].forEach(function(i){var d=ISO(addD(lunes,i));events.filter(function(e){return e.date===d&&e.worker===w;}).sort(function(a,b){return toM(a.s)-toM(b.s);}).forEach(function(ev){r2.push([w,DNF[i],d,ev.s,ev.e,ev.act,cLbl(ev.center),ev.note||'',+((toM(ev.e)-toM(ev.s))/60).toFixed(2)]);});});});
    var ws2=XLSX.utils.aoa_to_sheet(r2);ws2['!cols']=[{wch:20},{wch:10},{wch:12},{wch:7},{wch:7},{wch:20},{wch:17},{wch:20},{wch:7}];XLSX.utils.book_append_sheet(wb,ws2,'Por monitor');
    var r3=[['Monitor','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo','TOTAL']];
    aw.forEach(function(w){var dh=[0,1,2,3,4,5,6].map(function(i){var d=ISO(addD(lunes,i));return +((events.filter(function(e){return e.date===d&&e.worker===w;}).reduce(function(s,e){return s+(toM(e.e)-toM(e.s));},0)/60).toFixed(2));});r3.push([w].concat(dh,[+(dh.reduce(function(s,v){return s+v;},0).toFixed(2))]));});
    var ws3=XLSX.utils.aoa_to_sheet(r3);ws3['!cols']=[{wch:20},{wch:9},{wch:9},{wch:11},{wch:9},{wch:9},{wch:9},{wch:9}];XLSX.utils.book_append_sheet(wb,ws3,'Resumen horas');
    XLSX.writeFile(wb,'horarios_alzira_'+wl+'.xlsx');toast('Excel semana listo');
  });
}
function xlsMes(){
  var yr=lunes.getFullYear(),mo=lunes.getMonth();
  var MN=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var DNF7=['Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo'];
  var dim=new Date(yr,mo+1,0).getDate(),aD=[];for(var dx=1;dx<=dim;dx++)aD.push(ISO(new Date(yr,mo,dx)));
  var mev=events.filter(function(e){return aD.indexOf(e.date)>=0;}).sort(function(a,b){return a.date.localeCompare(b.date)||toM(a.s)-toM(b.s);});
  if(!mev.length){alert('No hay actividades en '+MN[mo]+' '+yr+'.');return;}
  lxls(function(){
    var wb=XLSX.utils.book_new();
    var r1=[['Fecha','Dia','Inicio','Fin','Actividad','Centro','Monitor','Nota','Horas']];
    mev.forEach(function(ev){var dw=new Date(ev.date+'T00:00:00').getDay();r1.push([ev.date,DNF7[dw===0?6:dw-1],ev.s,ev.e,ev.act,cLbl(ev.center),ev.worker,ev.note||'',+((toM(ev.e)-toM(ev.s))/60).toFixed(2)]);});
    var ws1=XLSX.utils.aoa_to_sheet(r1);ws1['!cols']=[{wch:12},{wch:10},{wch:7},{wch:7},{wch:20},{wch:17},{wch:20},{wch:20},{wch:7}];XLSX.utils.book_append_sheet(wb,ws1,'Actividades mes');
    var wm={};mev.forEach(function(ev){var wk=ISO(monOf(new Date(ev.date+'T00:00:00')));if(!wm[wk])wm[wk]={mon:new Date(wk+'T00:00:00'),ev:[]};wm[wk].ev.push(ev);});
    var wks=Object.keys(wm).sort().map(function(k){return wm[k];});
    var r2=[['Sem inicio','Sem fin','Actividades','Horas','Monitores','A cubrir']];
    wks.forEach(function(w){var h=+(w.ev.reduce(function(s,e){return s+(toM(e.e)-toM(e.s));},0)/60).toFixed(2);var cub=w.ev.filter(function(e){return e.worker.toUpperCase().indexOf('CUBRIR')>=0;}).length;var uw=[];w.ev.forEach(function(e){if(uw.indexOf(e.worker)<0)uw.push(e.worker);});r2.push([ISO(w.mon),ISO(addD(w.mon,5)),w.ev.length,h,uw.length,cub]);});
    var ws2=XLSX.utils.aoa_to_sheet(r2);ws2['!cols']=[{wch:12},{wch:12},{wch:13},{wch:9},{wch:11},{wch:9}];XLSX.utils.book_append_sheet(wb,ws2,'Resumen semanas');
    var aw=[];mev.forEach(function(e){if(aw.indexOf(e.worker)<0)aw.push(e.worker);});aw.sort();
    var wks2=Object.keys(wm).sort(),wlbs=wks2.map(function(wk){var wn=new Date(wk+'T00:00:00');return wn.getDate()+'/'+(wn.getMonth()+1)+'-'+addD(wn,5).getDate()+'/'+(addD(wn,5).getMonth()+1);});
    var r3=[['Monitor'].concat(wlbs,['TOTAL MES'])];
    aw.forEach(function(w){var wh=wks2.map(function(wk){var wD=[0,1,2,3,4,5,6].map(function(i){return ISO(addD(new Date(wk+'T00:00:00'),i));});return +(mev.filter(function(e){return wD.indexOf(e.date)>=0&&e.worker===w;}).reduce(function(s,e){return s+(toM(e.e)-toM(e.s));},0)/60).toFixed(2);});r3.push([w].concat(wh,[+(wh.reduce(function(s,v){return s+v;},0).toFixed(2))]));});
    var tr=['TOTAL'];for(var ci=0;ci<=wks2.length;ci++)tr.push(+(r3.slice(1).reduce(function(s,r){return s+(r[ci+1]||0);},0).toFixed(2)));r3.push(tr);
    var ws3=XLSX.utils.aoa_to_sheet(r3);ws3['!cols']=[{wch:20}].concat(wks2.map(function(){return{wch:12};})).concat([{wch:12}]);XLSX.utils.book_append_sheet(wb,ws3,'Horas monitor x semana');
    var r4=[['Monitor','Fecha','Dia','Inicio','Fin','Actividad','Centro','Nota','Horas']];
    aw.forEach(function(w){var we=mev.filter(function(e){return e.worker===w;});we.forEach(function(ev){var dw=new Date(ev.date+'T00:00:00').getDay();r4.push([w,ev.date,DNF7[dw===0?6:dw-1],ev.s,ev.e,ev.act,cLbl(ev.center),ev.note||'',+((toM(ev.e)-toM(ev.s))/60).toFixed(2)]);});if(we.length){var tot=+(we.reduce(function(s,e){return s+(toM(e.e)-toM(e.s));},0)/60).toFixed(2);r4.push(['','','','','','SUBTOTAL '+w,'','',tot]);r4.push(new Array(9).fill(''));}});
    var ws4=XLSX.utils.aoa_to_sheet(r4);ws4['!cols']=[{wch:20},{wch:12},{wch:10},{wch:7},{wch:7},{wch:20},{wch:17},{wch:20},{wch:7}];XLSX.utils.book_append_sheet(wb,ws4,'Detalle monitores');
    XLSX.writeFile(wb,'horarios_'+MN[mo]+'_'+yr+'.xlsx');toast(MN[mo]+' '+yr+' listo');
  });
}

// ============================================================
// TOAST + CERRAR OVERLAYS + INICIO
// ============================================================
function toast(msg){var t=document.getElementById('toast');t.innerHTML=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2200);}
document.getElementById('oev').addEventListener('click',function(e){if(e.target===this)cModal();});
document.getElementById('ocfg').addEventListener('click',function(e){if(e.target===this)cCfg();});

load();

// Si semana actual no tiene datos, ir a primera semana con datos
(function(){
  var ok=false;
  for(var i=0;i<7;i++){var d=ISO(addD(lunes,i));if(events.some(function(e){return e.date===d;})){ok=true;break;}}
  if(!ok&&events.length){var first=new Date(events.slice().sort(function(a,b){return a.date.localeCompare(b.date);})[0].date+'T00:00:00');lunes=monOf(first);dia=Math.min(first.getDay()===0?6:first.getDay()-1,5);}
})();

all();