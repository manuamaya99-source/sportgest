
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
// Duración en MINUTOS -> "1h 30min" / "8h" / "15min" / "0h"
function fHm(min){var s=min<0?'-':'';min=Math.abs(Math.round(min));var h=Math.floor(min/60),m=min%60;var o=h&&m?h+'h '+m+'min':h?h+'h':m?m+'min':'0h';return s+o;}
// Duración en HORAS decimales -> mismo formato
function fH(h){return fHm(Math.round((h||0)*60));}
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
    if(typeof sgSync!=='undefined'&&sgSync.push)sgSync.push();
  }catch(e){
    try{localStorage.removeItem(_STORE);localStorage.removeItem(_STORE+'c');}catch(x){}
    try{localStorage.setItem(_STORE+'_full',JSON.stringify({events:events,nextId:nextId,cfg:cfg,touched:_touched,savedAt:new Date().toISOString()}));bkSaved();_dirty=false;if(typeof sgSync!=='undefined'&&sgSync.push)sgSync.push();}catch(x){bkErr();}
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
  // No re-sembrar semanas que ya tienen actividades (evita reinyectar recurrentes y duplicar horas)
  for(var _gi=0;_gi<7;_gi++){if(events.some(function(e){return e.date===ISO(addD(mon,_gi));}))return;}
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
  var _atr=function(s){return (''+(s||'')).replace(/&/g,'&amp;').replace(/"/g,'&quot;');};
  document.getElementById('lm').innerHTML=cfg.monitors.map(function(m,i){
    if(i===_editMon){
      return '<div class="ci" style="gap:6px;align-items:center"><div class="cd" style="background:'+m.color+'"></div>'
        +'<input id="em-name" value="'+_atr(m.name)+'" placeholder="Nombre y apellidos" onkeydown="if(event.key===\'Enter\')eMonSave('+i+');if(event.key===\'Escape\')eMonCancel()" style="flex:2;min-width:0;padding:5px 7px;border:1px solid #0891b2;border-radius:5px;font-size:12px">'
        +'<input id="em-role" value="'+_atr(m.role)+'" placeholder="Rol" onkeydown="if(event.key===\'Enter\')eMonSave('+i+');if(event.key===\'Escape\')eMonCancel()" style="flex:1;min-width:0;padding:5px 7px;border:1px solid #ddd;border-radius:5px;font-size:12px">'
        +'<button class="cx" onclick="eMonSave('+i+')" title="Guardar" style="color:#15803d;font-weight:700">&#10003;</button>'
        +'<button class="cx" onclick="eMonCancel()" title="Cancelar">&#215;</button></div>';
    }
    return '<div class="ci"><div class="cd" style="background:'+m.color+'"></div><span class="cn">'+m.name+'</span><span class="csb">'+m.role+'</span>'
      +'<button class="cx" onclick="eMon('+i+')" title="Renombrar" style="color:#0891b2;font-weight:700">&#9998;</button>'
      +'<button class="cx" onclick="dMon('+i+')" title="Eliminar">&#215;</button></div>';
  }).join('');
  document.getElementById('lc').innerHTML=cfg.centers.map(function(c,i){return '<div class="ci"><span class="cn">'+c.label+'</span><span class="csb">'+c.id+'</span><button class="cx" onclick="dCen('+i+')">&#215;</button></div>';}).join('');
}
function aAct(){var n=document.getElementById('na').value.trim().toUpperCase(),col=document.getElementById('nac').value;if(!n){alert('Escribe el nombre.');return;}if(cfg.activities.find(function(a){return a.id===n;})){alert('Ya existe.');return;}cfg.activities.push({id:n,label:n.charAt(0)+n.slice(1).toLowerCase(),color:col,border:col,text:'#1a1a1a'});saveCfg();document.getElementById('na').value='';rCfg();toast('"'+n+'" anadida');}
function dAct(i){if(!confirm('Eliminar?'))return;cfg.activities.splice(i,1);saveCfg();rCfg();}
function aMon(){var n=document.getElementById('nm').value.trim(),r=document.getElementById('nmr').value.trim()||'Monitor';if(!n){alert('Escribe el nombre.');return;}if(cfg.monitors.find(function(m){return m.name===n;})){alert('Ya existe.');return;}cfg.monitors.push({name:n,role:r,color:BCOLS[cfg.monitors.length%BCOLS.length]});saveCfg();document.getElementById('nm').value='';document.getElementById('nmr').value='';rCfg();toast('"'+n+'" anadido');}
function dMon(i){if(!confirm('Eliminar?'))return;cfg.monitors.splice(i,1);saveCfg();rCfg();}
// --- Renombrar trabajador (nombre y apellidos) migrando las actividades antiguas ---
var _editMon=-1;
function eMon(i){_editMon=i;rCfg();var el=document.getElementById('em-name');if(el){el.focus();el.select();}}
function eMonCancel(){_editMon=-1;rCfg();}
function eMonSave(i){
  var m=cfg.monitors[i];if(!m)return;
  var nn=document.getElementById('em-name').value.trim();
  var nr=document.getElementById('em-role').value.trim()||'Monitor';
  if(!nn){alert('Escribe el nombre.');return;}
  if(cfg.monitors.some(function(x,j){return j!==i&&x.name===nn;})){alert('Ya existe un trabajador con ese nombre.');return;}
  var oldName=m.name,n=0;
  if(nn!==oldName){
    n=events.filter(function(e){return e.worker===oldName;}).length;
    if(n>0&&!confirm('Renombrar "'+oldName+'" → "'+nn+'".\nSe actualizarán '+n+' actividades antiguas para mantenerlas asignadas a este trabajador.\n\n¿Continuar?'))return;
    events.forEach(function(e){if(e.worker===oldName)e.worker=nn;});
    if(typeof _nmManual!=='undefined'&&_nmManual[oldName]!=null){_nmManual[nn]=_nmManual[oldName];delete _nmManual[oldName];}
  }
  m.name=nn;m.role=nr;
  _editMon=-1;
  autoSave();
  rCfg();
  toast(n>0?'Renombrado · '+n+' actividades actualizadas':'Trabajador actualizado');
}
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
  var wb='';allW.forEach(function(w){var wev=[];days.forEach(function(d){d.ev.filter(function(ev){return ev.worker===w;}).forEach(function(ev){wev.push(Object.assign({},ev,{dn:d.n}));});});if(!wev.length)return;var tot=wev.reduce(function(s,ev){return s+(toM(ev.e)-toM(ev.s));},0);wb+='<div class="db"><h2>'+w+' <em>'+fHm(tot)+'</em></h2><table><tr><th>Dia</th><th>Inicio</th><th>Fin</th><th>Actividad</th><th>Centro</th><th>Nota</th><th>Horas</th></tr>';wev.forEach(function(ev){var h=fHm(toM(ev.e)-toM(ev.s));wb+='<tr><td>'+ev.dn+'</td><td>'+ev.s+'</td><td>'+ev.e+'</td><td>'+ev.act+'</td><td>'+cLbl(ev.center)+'</td><td class="nt">'+(ev.note||'')+'</td><td>'+h+'</td></tr>';});wb+='</table></div>';});
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
      var mn=d.ev.filter(function(ev){return ev.worker===w;}).reduce(function(s,ev){return s+(toM(ev.e)-toM(ev.s));},0);
      sh+='<td'+(mn>0?'':' style="color:#ddd"')+'>'+fHm(mn)+'</td>';
      rowTotal+=mn;totalsRow[di]+=mn;
    });
    grandTotal+=rowTotal;
    sh+='<td style="background:#eff6ff;font-weight:700">'+fHm(rowTotal)+'</td></tr>';
  });
  sh+='<tr style="font-weight:800;background:#f0f0f0"><td>TOTAL</td>';
  totalsRow.forEach(function(t){sh+='<td>'+fHm(t)+'</td>';});
  sh+='<td style="background:#dbeafe">'+fHm(grandTotal)+'</td></tr></table>';
  // Build page
  var win=window.open('','_blank','width=900,height=700');
  if(!win){toast('⚠ El navegador bloqueó la ventana. Permite ventanas emergentes para este sitio.');return;}
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
      var mn=weeks[wk].filter(function(ev){return ev.worker===w;}).reduce(function(s,ev){return s+(toM(ev.e)-toM(ev.s));},0);
      sh+='<td'+(mn>0?'':' style="color:#ddd"')+'>'+fHm(mn)+'</td>';
      rowTotal+=mn;colTotals[wi]+=mn;
    });
    grandTotal+=rowTotal;
    sh+='<td style="background:#eff6ff;font-weight:700">'+fHm(rowTotal)+'</td></tr>';
  });
  sh+='<tr style="font-weight:800;background:#f0f0f0"><td>TOTAL</td>';
  colTotals.forEach(function(t){sh+='<td>'+fHm(t)+'</td>';});
  sh+='<td style="background:#dbeafe">'+fHm(grandTotal)+'</td></tr></table>';
  // ---- SECTION 2: Detalle por monitor ----
  var wb='';
  allW.forEach(function(w){
    var wev=mev.filter(function(ev){return ev.worker===w;});
    if(!wev.length)return;
    var tot=wev.reduce(function(s,ev){return s+(toM(ev.e)-toM(ev.s));},0);
    wb+='<div class="db"><h2>'+w+' <em>'+fHm(tot)+'</em></h2><table><tr><th>Fecha</th><th>Dia</th><th>Inicio</th><th>Fin</th><th>Actividad</th><th>Centro</th><th>Nota</th><th>Horas</th></tr>';
    // Group by week for subtotals
    wkKeys.forEach(function(wk){
      var wkEvs=wev.filter(function(ev){var ewk=ISO(monOf(new Date(ev.date+'T00:00:00')));return ewk===wk;});
      if(!wkEvs.length)return;
      var wkTot=0;
      wkEvs.forEach(function(ev){
        var dw=new Date(ev.date+'T00:00:00').getDay();
        var dn=DNF7[dw===0?6:dw-1];
        var mn=toM(ev.e)-toM(ev.s);
        wkTot+=mn;
        var dd=ev.date.split('-');
        wb+='<tr><td>'+dd[2]+'/'+dd[1]+'</td><td>'+dn.slice(0,3)+'</td><td>'+ev.s+'</td><td>'+ev.e+'</td><td>'+ev.act+'</td><td>'+cLbl(ev.center)+'</td><td class="nt">'+(ev.note||'')+'</td><td>'+fHm(mn)+'</td></tr>';
      });
      var m=new Date(wk+'T00:00:00');
      wb+='<tr style="background:#f0f4ff;font-weight:600"><td colspan="7" style="text-align:right;font-size:9px">Semana '+m.getDate()+'/'+(m.getMonth()+1)+'</td><td>'+fHm(wkTot)+'</td></tr>';
    });
    wb+='<tr style="background:#dbeafe;font-weight:700"><td colspan="7" style="text-align:right">TOTAL '+w+'</td><td>'+fHm(tot)+'</td></tr>';
    wb+='</table></div>';
  });
  // ---- BUILD PAGE ----
  var css='*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;font-size:11px;padding:18px}h1{font-size:16px;font-weight:700;margin-bottom:3px}.su{font-size:11px;color:#888;margin-bottom:16px}.se{font-size:13px;font-weight:700;margin:20px 0 8px;border-bottom:2px solid #222;padding-bottom:4px}.db{margin-bottom:14px;break-inside:avoid}h2{font-size:12px;font-weight:700;margin-bottom:4px;color:#7c3aed}h2 em{font-style:normal;font-weight:400;color:#aaa;font-size:10px;margin-left:4px}table{width:100%;border-collapse:collapse}th{background:#f0f0f0;text-align:left;padding:4px 6px;font-size:10px;font-weight:700;border:1px solid #ddd}td{padding:4px 6px;border:1px solid #ddd;font-size:10px}tr:nth-child(even){background:#fafafa}.nt{font-style:italic;color:#888}.np{margin-bottom:12px}@media print{.np{display:none}body{padding:6px}}';
  var win=window.open('','_blank','width=960,height=700');
  if(!win){toast('⚠ El navegador bloqueó la ventana. Permite ventanas emergentes para este sitio.');return;}
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
// JORNADA POR TRABAJADOR
// ============================================================
function openJornada(){
  var now=new Date(),yr=now.getFullYear(),mo=now.getMonth();
  var d1=yr+'-'+String(mo+1).padStart(2,'0')+'-01';
  var lastDay=new Date(yr,mo+1,0).getDate();
  var d2=yr+'-'+String(mo+1).padStart(2,'0')+'-'+String(lastDay).padStart(2,'0');
  var opts=cfg.monitors.map(function(m){var n=m.name.replace(/"/g,'&quot;');return '<option value="'+n+'">'+m.name+(m.role?' — '+m.role:'')+'</option>';}).join('');
  var ist='width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px';
  var lst='font-size:11px;font-weight:600;color:#666;display:block;margin-bottom:4px';
  var html='<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:32px 16px;overflow-y:auto" id="jt-overlay" onclick="if(event.target===this)this.remove()">';
  html+='<div style="background:#fff;border-radius:12px;padding:24px 28px;width:680px;max-width:100%;box-shadow:0 12px 40px rgba(0,0,0,.2)">';
  html+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><h3 style="margin:0;font-size:16px">👤 Jornada por trabajador</h3><button onclick="document.getElementById(\'jt-overlay\').remove()" style="padding:6px 14px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:12px">Cerrar</button></div>';
  html+='<div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:14px">';
  html+='<div style="flex:2"><label style="'+lst+'">Trabajador</label><select id="jt-mon" style="'+ist+'">'+opts+'</select></div>';
  html+='<div style="flex:1"><label style="'+lst+'">Desde</label><input type="date" id="jt-desde" value="'+d1+'" style="'+ist+'"></div>';
  html+='<div style="flex:1"><label style="'+lst+'">Hasta</label><input type="date" id="jt-hasta" value="'+d2+'" style="'+ist+'"></div>';
  html+='<button onclick="jornadaTrab()" style="padding:9px 18px;border:none;border-radius:6px;background:#0891b2;color:#fff;cursor:pointer;font-weight:600;font-size:13px;white-space:nowrap">Ver jornada</button>';
  html+='</div>';
  // --- Planificacion semanal: rejilla de toda la plantilla (dias x actividades) ---
  html+='<div style="border-top:1px solid #e2e8f0;margin-top:16px;padding-top:14px">';
  html+='<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Planificacion semanal · rejilla dias × actividades</div>';
  html+='<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">';
  html+='<div style="flex:1;min-width:170px"><label style="'+lst+'">Trabajador</label><select id="jt-planmon" style="'+ist+'">'+_planMonOpts()+'</select></div>';
  html+='<div style="flex:1;min-width:150px"><label style="'+lst+'">Semana del</label><input type="date" id="jt-semana" value="'+ISO(lunes)+'" onchange="_jtSemLbl()" style="'+ist+'"></div>';
  html+='<div style="display:flex;align-items:center;gap:6px;padding-bottom:1px">';
  html+='<button onclick="jtSemShift(-1)" title="Semana anterior" style="width:30px;height:34px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:14px">&lsaquo;</button>';
  html+='<span id="jt-semlbl" style="font-size:12px;font-weight:600;color:#0f172a;min-width:118px;text-align:center"></span>';
  html+='<button onclick="jtSemShift(1)" title="Semana siguiente" style="width:30px;height:34px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:14px">&rsaquo;</button>';
  html+='</div>';
  html+='<button onclick="planSemana()" style="padding:9px 18px;border:none;border-radius:6px;background:#7c3aed;color:#fff;cursor:pointer;font-weight:600;font-size:13px;white-space:nowrap">&#128197; Planificacion semanal</button>';
  html+='</div></div>';
  html+='<div id="jt-res"></div>';
  html+='</div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
  _jtSemLbl();
}
// Opciones del selector de trabajador de la planificacion: todos + los de Config
// + los que solo aparecen en actividades (grupos, "A CUBRIR"...).
function _planMonOpts(){
  var esc=function(s){return (''+s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');};
  var inCfg={},opt='<option value="">Todos los trabajadores</option>';
  var mons=cfg.monitors.map(function(m){inCfg[m.name]=1;return '<option value="'+esc(m.name)+'">'+esc(m.name)+(m.role?' — '+esc(m.role):'')+'</option>';});
  if(mons.length)opt+='<optgroup label="Trabajadores">'+mons.join('')+'</optgroup>';
  var otros=[];
  events.forEach(function(e){if(!inCfg[e.worker]&&otros.indexOf(e.worker)<0)otros.push(e.worker);});
  otros.sort();
  if(otros.length)opt+='<optgroup label="Otros (grupos, a cubrir)">'+otros.map(function(w){return '<option value="'+esc(w)+'">'+esc(w)+'</option>';}).join('')+'</optgroup>';
  return opt;
}
// Etiqueta "Lun/M – Dom/M AAAA" de la semana elegida en el selector de planificacion.
function _jtSemLbl(){
  var el=document.getElementById('jt-semana'),lb=document.getElementById('jt-semlbl');
  if(!el||!lb)return;
  if(!el.value){lb.textContent='—';return;}
  var m=monOf(new Date(el.value+'T00:00:00')),f=addD(m,6);
  lb.textContent=m.getDate()+'/'+(m.getMonth()+1)+' – '+f.getDate()+'/'+(f.getMonth()+1)+' '+m.getFullYear();
}
function jtSemShift(n){
  var el=document.getElementById('jt-semana');
  if(!el||!el.value)return;
  el.value=ISO(addD(monOf(new Date(el.value+'T00:00:00')),n*7));
  _jtSemLbl();
}
// Construye los datos de la jornada de un trabajador en un rango. Devuelve null si no hay nada.
function _jornadaData(worker,desde,hasta){
  var DNF7=['Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo'];
  var wev=events.filter(function(e){return e.worker===worker&&e.date>=desde&&e.date<=hasta;}).sort(function(a,b){return a.date.localeCompare(b.date)||toM(a.s)-toM(b.s);});
  if(!wev.length)return null;
  var weeks={};wev.forEach(function(ev){var wk=ISO(monOf(new Date(ev.date+'T00:00:00')));if(!weeks[wk])weeks[wk]=[];weeks[wk].push(ev);});
  var wkKeys=Object.keys(weeks).sort();
  var dias={};wev.forEach(function(ev){dias[ev.date]=1;});
  var totMin=wev.reduce(function(s,ev){return s+(toM(ev.e)-toM(ev.s));},0);
  return {worker:worker,evs:wev,weeks:weeks,wkKeys:wkKeys,DNF7:DNF7,totH:totMin/60,nDias:Object.keys(dias).length};
}
// CSS compartida entre el panel y el PDF (clases .jt-*).
function _jornadaCss(){
  return '.jt-wk{margin:14px 0 6px;font-size:11px;font-weight:700;color:#0e7490;text-transform:uppercase;letter-spacing:.05em}'
    +'.jt-day{border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;overflow:hidden;background:#fff}'
    +'.jt-dayh{display:flex;align-items:baseline;gap:8px;padding:7px 12px;background:#f1f5f9;border-bottom:1px solid #e2e8f0}'
    +'.jt-dow{font-weight:700;font-size:13px;color:#0f172a}'
    +'.jt-date{font-size:11px;color:#64748b}'
    +'.jt-dh{margin-left:auto;font-size:12px;font-weight:700;color:#0891b2}'
    +'.jt-sh{display:flex;align-items:center;gap:10px;padding:6px 12px;border-top:1px solid #f1f5f9;border-left:4px solid transparent}'
    +'.jt-sh:first-of-type{border-top:none}'
    +'.jt-time{font-weight:600;font-size:12px;color:#0f172a;white-space:nowrap;min-width:104px;font-variant-numeric:tabular-nums}'
    +'.jt-act{font-weight:600;font-size:12px;color:#1e293b}'
    +'.jt-cen{font-size:11px;color:#64748b}'
    +'.jt-note{font-size:11px;font-style:italic;color:#94a3b8}'
    +'.jt-hrs{margin-left:auto;font-size:12px;font-weight:700;color:#475569;white-space:nowrap}'
    +'@media print{.jt-day{break-inside:avoid}}';
}
// Devuelve la jornada agrupada por semana y por día (markup con clases .jt-*).
function _jornadaTable(d){
  var actColor=function(id){var a=cfg.activities.find(function(x){return x.id===id;});return a?a.border:'#94a3b8';};
  var out='';
  d.wkKeys.forEach(function(wk){
    var wkEvs=d.weeks[wk];
    var wkTot=(wkEvs.reduce(function(s,ev){return s+(toM(ev.e)-toM(ev.s));},0)/60);
    var m=new Date(wk+'T00:00:00'),mf=addD(m,6);
    out+='<div class="jt-wk">Semana '+m.getDate()+'/'+(m.getMonth()+1)+' – '+mf.getDate()+'/'+(mf.getMonth()+1)+' · '+fH(wkTot)+'</div>';
    var byDay={},order=[];
    wkEvs.forEach(function(ev){if(!byDay[ev.date]){byDay[ev.date]=[];order.push(ev.date);}byDay[ev.date].push(ev);});
    order.forEach(function(date){
      var evs=byDay[date];
      var dw=new Date(date+'T00:00:00').getDay();
      var dn=d.DNF7[dw===0?6:dw-1];
      var dd=date.split('-');
      var dayTot=(evs.reduce(function(s,ev){return s+(toM(ev.e)-toM(ev.s));},0)/60);
      out+='<div class="jt-day"><div class="jt-dayh"><span class="jt-dow">'+dn+'</span><span class="jt-date">'+dd[2]+'/'+dd[1]+'</span><span class="jt-dh">'+fH(dayTot)+'</span></div>';
      evs.forEach(function(ev){
        var h=fHm(toM(ev.e)-toM(ev.s));
        out+='<div class="jt-sh" style="border-left-color:'+actColor(ev.act)+'"><span class="jt-time">'+ev.s+'–'+ev.e+'</span><span class="jt-act">'+ev.act+'</span><span class="jt-cen">'+cLbl(ev.center)+'</span>'+(ev.note?'<span class="jt-note">'+ev.note+'</span>':'')+'<span class="jt-hrs">'+h+'</span></div>';
      });
      out+='</div>';
    });
  });
  return out;
}
// Pinta la jornada dentro del panel (#jt-res).
function jornadaTrab(){
  var worker=document.getElementById('jt-mon').value;
  var desde=document.getElementById('jt-desde').value;
  var hasta=document.getElementById('jt-hasta').value;
  var res=document.getElementById('jt-res');
  if(!worker){res.innerHTML='<p style="color:#dc2626;font-size:13px">Selecciona un trabajador.</p>';return;}
  if(!desde||!hasta){res.innerHTML='<p style="color:#dc2626;font-size:13px">Selecciona ambas fechas.</p>';return;}
  if(desde>hasta){res.innerHTML='<p style="color:#dc2626;font-size:13px">La fecha "Desde" debe ser anterior a "Hasta".</p>';return;}
  var d=_jornadaData(worker,desde,hasta);
  if(!d){res.innerHTML='<p style="color:#999;font-size:13px">No hay actividades de '+worker+' en el periodo seleccionado.</p>';return;}
  var media=d.nDias?fH(d.totH/d.nDias):'0h';
  var stat=function(v,l){return '<div style="flex:1;min-width:88px;background:#ecfeff;border:1px solid #a5f3fc;border-radius:10px;padding:9px 10px;text-align:center"><div style="font-size:18px;font-weight:800;color:#0891b2;line-height:1">'+v+'</div><div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-top:3px">'+l+'</div></div>';};
  var html='<style>'+_jornadaCss()+'</style>';
  html+='<div style="display:flex;align-items:center;gap:10px;margin:14px 0 10px"><div style="width:32px;height:32px;border-radius:50%;background:#0891b2;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px">'+worker.charAt(0).toUpperCase()+'</div><div style="font-size:15px;font-weight:700;color:#0f172a">'+worker+'</div></div>';
  html+='<div style="display:flex;gap:8px;flex-wrap:wrap">'+stat(fH(d.totH),'Horas')+stat(d.nDias,'Días')+stat(media,'Media/día')+stat(d.evs.length,'Activid.')+'</div>';
  html+='<div style="text-align:right;margin:12px 0 4px"><button onclick="jornadaPrint()" style="padding:8px 18px;border:none;border-radius:6px;background:#0891b2;color:#fff;cursor:pointer;font-weight:600;font-size:12px">🖶 Imprimir / PDF</button></div>';
  html+=_jornadaTable(d);
  res.innerHTML=html;
  res.dataset.worker=worker;res.dataset.desde=desde;res.dataset.hasta=hasta;
}
// Abre la versión imprimible de la jornada mostrada en el panel.
function jornadaPrint(){
  var res=document.getElementById('jt-res');
  var worker=res.dataset.worker,desde=res.dataset.desde,hasta=res.dataset.hasta;
  var d=_jornadaData(worker,desde,hasta);
  if(!d)return;
  var fd=new Date(desde+'T00:00:00'),fh=new Date(hasta+'T00:00:00');
  var titulo=fd.getDate()+'/'+(fd.getMonth()+1)+'/'+fd.getFullYear()+' - '+fh.getDate()+'/'+(fh.getMonth()+1)+'/'+fh.getFullYear();
  var media=d.nDias?fH(d.totH/d.nDias):'0h';
  var css='*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;color:#0f172a;padding:22px}'
    +'.hd{display:flex;align-items:center;gap:12px;margin-bottom:14px}'
    +'.av{width:42px;height:42px;border-radius:50%;background:#0891b2;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;flex-shrink:0}'
    +'h1{font-size:19px;font-weight:800}.su{font-size:11px;color:#888;margin-top:2px}'
    +'.kpis{display:flex;gap:10px;margin-bottom:18px}'
    +'.kpi{flex:1;border:1px solid #a5f3fc;background:#ecfeff;border-radius:10px;padding:10px;text-align:center}'
    +'.kpi b{display:block;font-size:18px;color:#0891b2}.kpi span{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}'
    +_jornadaCss()
    +'.np{margin-bottom:14px}@media print{.np{display:none}body{padding:8px}}';
  var win=window.open('','_blank','width=900,height=760');
  if(!win){toast('⚠ El navegador bloqueó la ventana. Permite ventanas emergentes para este sitio.');return;}
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Jornada '+d.worker+' '+titulo+'</title><style>'+css+'</style></head><body>');
  win.document.write('<div class="np"><button onclick="window.print()" style="padding:7px 16px;background:#0891b2;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-right:6px;font-size:12px">Imprimir/PDF</button><button onclick="window.close()" style="padding:7px 16px;background:#fff;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:12px">Cerrar</button></div>');
  win.document.write('<div class="hd"><div class="av">'+d.worker.charAt(0).toUpperCase()+'</div><div><h1>'+d.worker+'</h1><div class="su">SportGest Alzira · Jornada '+titulo+'</div></div></div>');
  win.document.write('<div class="kpis"><div class="kpi"><b>'+fH(d.totH)+'</b><span>Horas totales</span></div><div class="kpi"><b>'+d.nDias+'</b><span>Días trabajados</span></div><div class="kpi"><b>'+media+'</b><span>Media/día</span></div><div class="kpi"><b>'+d.evs.length+'</b><span>Actividades</span></div></div>');
  win.document.write(_jornadaTable(d));
  win.document.write('</body></html>');
  win.document.close();
}

// ============================================================
// PLANIFICACION SEMANAL (rejilla: columnas = dias, filas = actividades)
// ============================================================
// Datos de la semana que contiene `fecha` (ISO). Sin `worker` -> toda la plantilla.
function _planSemanaData(fecha,worker){
  var mon=monOf(new Date(fecha+'T00:00:00'));
  var days=[];
  for(var i=0;i<7;i++){
    var dd=addD(mon,i);
    days.push({iso:ISO(dd),n:DIAS[i],lbl:dd.getDate()+'/'+(dd.getMonth()+1),hoy:ISO(dd)===ISO(new Date())});
  }
  var wev=events.filter(function(e){
    if(e.date<days[0].iso||e.date>days[6].iso)return false;
    return worker?e.worker===worker:true;
  });
  if(!wev.length)return null;
  // Filas ordenadas como en Config; las actividades sueltas (ya borradas de cfg) van al final.
  var order=cfg.activities.map(function(a){return a.id;});
  var acts=[];
  wev.forEach(function(e){if(acts.indexOf(e.act)<0)acts.push(e.act);});
  acts.sort(function(a,b){
    var ia=order.indexOf(a),ib=order.indexOf(b);
    if(ia<0)ia=9999;if(ib<0)ib=9999;
    return ia-ib||a.localeCompare(b);
  });
  var grid={};
  acts.forEach(function(a){grid[a]=[[],[],[],[],[],[],[]];});
  wev.forEach(function(e){
    for(var di=0;di<7;di++){if(days[di].iso===e.date){grid[e.act][di].push(e);break;}}
  });
  acts.forEach(function(a){grid[a].forEach(function(c){c.sort(function(x,y){return toM(x.s)-toM(y.s);});});});
  var dayMin=days.map(function(d,i){
    return acts.reduce(function(s,a){
      return s+grid[a][i].reduce(function(t,e){return t+(toM(e.e)-toM(e.s));},0);
    },0);
  });
  var wk=[],cub=0,dias={};
  wev.forEach(function(e){
    if(wk.indexOf(e.worker)<0)wk.push(e.worker);
    if(e.worker.toUpperCase().indexOf('CUBRIR')>=0)cub++;
    dias[e.date]=1;
  });
  return {mon:mon,days:days,acts:acts,grid:grid,dayMin:dayMin,n:wev.length,nWork:wk.length,nCub:cub,
          worker:worker||null,nDias:Object.keys(dias).length,
          totMin:dayMin.reduce(function(s,m){return s+m;},0)};
}
function _planSemanaCss(){
  return 'table.ps{width:100%;border-collapse:collapse;table-layout:fixed}'
    +'.ps th,.ps td{border:1px solid #dbe2ea;vertical-align:top;padding:4px}'
    +'.ps thead th{background:#f1f5f9;text-align:center;font-size:11px;font-weight:700;color:#0f172a;padding:6px 4px}'
    +'.ps thead th span{display:block;font-weight:400;font-size:9px;color:#64748b;margin-top:1px}'
    +'.ps th.ps-rh{width:104px;background:#f8fafc;text-align:left;font-size:11px;font-weight:700;color:#0f172a;vertical-align:middle}'
    +'.ps thead th.ps-hoy,.ps td.ps-hoy{background:#fffbeb}'
    +'.ps td.ps-vac{background:#fcfcfd}'
    +'.ps-ev{border-left:3px solid #94a3b8;border-radius:5px;padding:3px 5px;margin-bottom:3px;font-size:9.5px;line-height:1.28;break-inside:avoid}'
    +'.ps-ev:last-child{margin-bottom:0}'
    +'.ps-t{font-weight:700;font-variant-numeric:tabular-nums}'
    +'.ps-w{font-weight:600}'
    +'.ps-c{font-size:9px;opacity:.72}'
    +'.ps-n{font-size:9px;font-style:italic;opacity:.6}'
    +'.ps-ev.cub{box-shadow:inset 0 0 0 2px #f59e0b}'
    +'.ps tfoot th,.ps tfoot td{background:#f1f5f9;font-size:10px;font-weight:700;text-align:center;color:#0f172a;vertical-align:middle}';
}
// Rejilla HTML: una fila por actividad, una columna por dia, sesiones apiladas en la celda.
function _planSemanaHtml(d){
  var info=function(id){
    return cfg.activities.find(function(x){return x.id===id;})||{label:id,color:'#f3f4f6',border:'#9ca3af',text:'#374151'};
  };
  var h='<table class="ps"><thead><tr><th class="ps-rh">Actividad</th>';
  d.days.forEach(function(day){h+='<th'+(day.hoy?' class="ps-hoy"':'')+'>'+day.n.slice(0,3)+'<span>'+day.lbl+'</span></th>';});
  h+='</tr></thead><tbody>';
  d.acts.forEach(function(act){
    var a=info(act);
    h+='<tr><th class="ps-rh" style="border-left:5px solid '+a.border+'">'+a.label+'</th>';
    for(var i=0;i<7;i++){
      var evs=d.grid[act][i];
      h+='<td class="'+(d.days[i].hoy?'ps-hoy':(evs.length?'':'ps-vac'))+'">';
      evs.forEach(function(ev){
        var cub=ev.worker.toUpperCase().indexOf('CUBRIR')>=0;
        h+='<div class="ps-ev'+(cub?' cub':'')+'" style="background:'+a.color+';border-left-color:'+a.border+';color:'+(a.text||'#1a1a1a')+'">'
          +'<div class="ps-t">'+ev.s+'–'+ev.e+'</div>'
          // Con un solo trabajador seleccionado, repetir su nombre en cada celda sobra.
          +(d.worker?'':'<div class="ps-w">'+ev.worker+'</div>')
          +'<div class="ps-c">'+cLbl(ev.center)+'</div>'
          +(ev.note?'<div class="ps-n">'+ev.note+'</div>':'')
          +'</div>';
      });
      h+='</td>';
    }
    h+='</tr>';
  });
  h+='</tbody><tfoot><tr><th class="ps-rh">TOTAL</th>';
  d.dayMin.forEach(function(m){h+='<td>'+(m?fHm(m):'—')+'</td>';});
  h+='</tr></tfoot></table>';
  return h;
}
// Abre la planificacion de la semana elegida en el panel de Jornada.
function planSemana(){
  var el=document.getElementById('jt-semana');
  var ws=document.getElementById('jt-planmon');
  var worker=ws?ws.value:'';
  var fecha=el?el.value:ISO(lunes);
  if(!fecha){alert('Selecciona la semana.');return;}
  var d=_planSemanaData(fecha,worker);
  var m=monOf(new Date(fecha+'T00:00:00')),f=addD(m,6);
  var titulo=m.getDate()+'/'+(m.getMonth()+1)+' - '+f.getDate()+'/'+(f.getMonth()+1)+'/'+m.getFullYear();
  if(!d){alert(worker?('No hay actividades de '+worker+' en la semana '+titulo+'.'):('No hay actividades en la semana '+titulo+'.'));return;}
  var css='*{box-sizing:border-box;margin:0;padding:0}'
    +'body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;color:#0f172a;padding:18px}'
    +'h1{font-size:18px;font-weight:800}.su{font-size:11px;color:#888;margin:2px 0 14px}'
    +'.kpis{display:flex;gap:10px;margin-bottom:14px}'
    +'.kpi{flex:1;border:1px solid #ddd6fe;background:#f5f3ff;border-radius:10px;padding:9px;text-align:center}'
    +'.kpi b{display:block;font-size:17px;color:#7c3aed}'
    +'.kpi span{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}'
    +_planSemanaCss()
    +'.hd{display:flex;align-items:center;gap:12px;margin-bottom:12px}'
    +'.av{width:40px;height:40px;border-radius:50%;background:#7c3aed;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px;flex-shrink:0}'
    +'.lg{margin-top:10px;font-size:9px;color:#94a3b8}'
    +'.np{margin-bottom:14px}'
    +'@page{size:A4 landscape;margin:8mm}'
    +'@media print{.np{display:none}body{padding:0}.ps-ev{font-size:8.5px}}';
  var win=window.open('','_blank','width=1200,height=800');
  if(!win){toast('⚠ El navegador bloqueó la ventana. Permite ventanas emergentes para este sitio.');return;}
  var ttl='Planificacion '+(worker?worker+' ':'')+titulo;
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+ttl+'</title><style>'+css+'</style></head><body>');
  win.document.write('<div class="np"><button onclick="window.print()" style="padding:7px 16px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-right:6px;font-size:12px">Imprimir/PDF</button><button onclick="window.close()" style="padding:7px 16px;background:#fff;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:12px">Cerrar</button></div>');
  if(worker){
    win.document.write('<div class="hd"><div class="av">'+worker.charAt(0).toUpperCase()+'</div><div><h1>'+worker+'</h1>'
      +'<p class="su" style="margin:2px 0 0">SportGest Alzira · Planificacion semanal '+titulo+'</p></div></div>');
  }else{
    win.document.write('<h1>Planificacion semanal</h1>');
    win.document.write('<p class="su">SportGest Alzira · Semana '+titulo+' · todos los trabajadores</p>');
  }
  var kpis='<div class="kpis"><div class="kpi"><b>'+d.n+'</b><span>Actividades</span></div>'
    +'<div class="kpi"><b>'+d.acts.length+'</b><span>Tipos de actividad</span></div>'
    +(worker?'<div class="kpi"><b>'+d.nDias+'</b><span>Dias con actividad</span></div>'
            :'<div class="kpi"><b>'+d.nWork+'</b><span>Trabajadores</span></div>')
    +'<div class="kpi"><b>'+fHm(d.totMin)+'</b><span>Horas totales</span></div>';
  if(!worker)kpis+='<div class="kpi"><b'+(d.nCub?' style="color:#d97706"':'')+'>'+d.nCub+'</b><span>A cubrir</span></div>';
  win.document.write(kpis+'</div>');
  win.document.write(_planSemanaHtml(d));
  win.document.write('<p class="lg">Cada celda: horario · '+(worker?'':'trabajador · ')+'centro'
    +(d.nCub&&!worker?' — el borde naranja marca las sesiones sin cubrir.':'.')+'</p>');
  win.document.write('</body></html>');
  win.document.close();
}

// ============================================================
// CÁLCULO DE NÓMINA (estimación)
// ============================================================
function openNomina(){
  var now=new Date(),yr=now.getFullYear(),mo=now.getMonth();
  var d1=yr+'-'+String(mo+1).padStart(2,'0')+'-01';
  var lastDay=new Date(yr,mo+1,0).getDate();
  var d2=yr+'-'+String(mo+1).padStart(2,'0')+'-'+String(lastDay).padStart(2,'0');
  var opts=cfg.monitors.map(function(m){var n=m.name.replace(/"/g,'&quot;');return '<option value="'+n+'">'+m.name+(m.role?' — '+m.role:'')+'</option>';}).join('');
  var ist='width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px';
  var lst='font-size:11px;font-weight:600;color:#666;display:block;margin-bottom:4px';
  var fld=function(lbl,inner){return '<div><label style="'+lst+'">'+lbl+'</label>'+inner+'</div>';};
  var html='<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:32px 16px;overflow-y:auto" id="nm-overlay" onclick="if(event.target===this)this.remove()">';
  html+='<div style="background:#fff;border-radius:12px;padding:24px 28px;width:720px;max-width:100%;box-shadow:0 12px 40px rgba(0,0,0,.2)">';
  html+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><h3 style="margin:0;font-size:16px">💶 Cálculo de nómina <span style="font-size:11px;font-weight:500;color:#999">(estimación)</span></h3><button onclick="document.getElementById(\'nm-overlay\').remove()" style="padding:6px 14px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:12px">Cerrar</button></div>';
  html+='<div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:12px;flex-wrap:wrap">';
  html+='<div style="flex:2;min-width:160px">'+fld('Trabajador','<select id="nm-mon" style="'+ist+'">'+opts+'</select>')+'</div>';
  html+='<div style="flex:1;min-width:120px">'+fld('Desde','<input type="date" id="nm-desde" value="'+d1+'" style="'+ist+'">')+'</div>';
  html+='<div style="flex:1;min-width:120px">'+fld('Hasta','<input type="date" id="nm-hasta" value="'+d2+'" style="'+ist+'">')+'</div>';
  html+='</div>';
  html+='<div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:14px;flex-wrap:wrap;border-top:1px dashed #e2e8f0;padding-top:12px">';
  html+='<div style="flex:2;min-width:200px">'+fld('Lote — trabajadores <span style="color:#bbb;font-weight:400">(ninguno = todos)</span>','<select id="nm-lote" multiple size="4" style="'+ist+'">'+opts+'</select>')+'</div>';
  html+='<div style="flex:1;min-width:170px"><button onclick="calcNominaLote()" style="width:100%;padding:9px 16px;border:none;border-radius:6px;background:#0e7490;color:#fff;cursor:pointer;font-weight:600;font-size:13px">📋 Todas las nóminas del mes</button></div>';
  html+='<div style="flex:1;min-width:150px"><button onclick="openPactos()" style="width:100%;padding:9px 16px;border:1px solid #a5f3fc;border-radius:6px;background:#ecfeff;color:#0e7490;cursor:pointer;font-weight:600;font-size:13px">🤝 Pactos salariales</button></div>';
  html+='</div>';
  html+='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:6px">';
  html+=fld('SMI anual € <span style="color:#bbb;font-weight:400">(2026)</span>','<input type="number" id="nm-smi" value="17094" step="0.01" style="'+ist+'">');
  html+=fld('Horas/año jornada completa <span style="color:#bbb;font-weight:400">(convenio)</span>','<input type="number" id="nm-hmes" value="1752" step="1" style="'+ist+'">');
  html+=fld('Precio hora extra €','<input type="number" id="nm-extra" value="9" step="0.01" style="'+ist+'">');
  html+=fld('Horas de contrato/semana','<input type="number" id="nm-hcontrato" placeholder="vacío = todas a contrato" step="0.5" style="'+ist+'">');
  html+='<div><label style="'+lst+';display:flex;align-items:center;gap:6px"><input type="checkbox" id="nm-transon" checked style="width:auto;margin:0"> Plus transporte € / 8 h</label><input type="number" id="nm-trans" value="3" step="0.01" style="'+ist+'"></div>';
  html+=fld('Cotización empresa %','<input type="number" id="nm-cemp" value="33.65" step="0.01" style="'+ist+'">');
  html+=fld('Cotización trabajador %','<input type="number" id="nm-ctrab" value="6.50" step="0.01" style="'+ist+'">');
  html+='<div><label style="'+lst+';display:flex;align-items:center;gap:6px"><input type="checkbox" id="nm-irpfon" style="width:auto;margin:0"> Aplicar IRPF %</label><input type="number" id="nm-irpf" value="2" step="0.01" style="'+ist+'"></div>';
  html+='</div>';
  html+='<div style="text-align:right;margin:14px 0 4px"><button onclick="calcNomina()" style="padding:9px 20px;border:none;border-radius:6px;background:#15803d;color:#fff;cursor:pointer;font-weight:600;font-size:13px">Calcular nómina</button></div>';
  html+='<div id="nm-res"></div>';
  html+='</div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
}
// ============================================================
// PACTOS SALARIALES (precio/hora pactado por trabajador)
// ============================================================
function openPactos(){
  var ist='width:100%;padding:7px;border:1px solid #ddd;border-radius:6px;font-size:13px';
  var th='padding:6px 8px;font-size:10px;font-weight:700;text-align:left;border-bottom:2px solid #cbd5e1';
  var rows=cfg.monitors.map(function(m,i){return _pactoRow(m,i,ist);}).join('');
  if(!cfg.monitors.length)rows='<tr><td colspan="3" style="padding:14px;text-align:center;color:#999;font-size:12px">No hay monitores. Añádelos en ⚙ Config.</td></tr>';
  var html='<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:10001;display:flex;align-items:flex-start;justify-content:center;padding:32px 16px;overflow-y:auto" id="pk-overlay" onclick="if(event.target===this)this.remove()">';
  html+='<div style="background:#fff;border-radius:12px;padding:24px 28px;width:560px;max-width:100%;box-shadow:0 12px 40px rgba(0,0,0,.2)">';
  html+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px"><h3 style="margin:0;font-size:16px">🤝 Pactos salariales</h3><button onclick="document.getElementById(\'pk-overlay\').remove()" style="padding:6px 14px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:12px">Cerrar</button></div>';
  html+='<p style="font-size:11.5px;color:#64748b;margin:0 0 14px;line-height:1.5">Precio/hora pactado con un trabajador. Al calcular su nómina se usa este precio en lugar de la estimación por SMI. <b>Sin pacto</b> = estimación normal.</p>';
  html+='<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%"><thead><tr><th style="'+th+'">Trabajador</th><th style="'+th+'">Tipo de pacto</th><th style="'+th+'">€ / hora</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  html+='<div style="text-align:right;margin-top:14px"><span id="pk-saved" style="font-size:11px;color:#16a34a;margin-right:10px"></span><button onclick="document.getElementById(\'pk-overlay\').remove()" style="padding:8px 18px;border:none;border-radius:6px;background:#0e7490;color:#fff;cursor:pointer;font-weight:600;font-size:13px">Hecho</button></div>';
  html+='</div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
}
function _pactoRow(m,i,ist){
  var td='padding:6px 8px;border-bottom:1px solid #eef2f7;vertical-align:middle';
  var p=m.pacto||{},tipo=p.tipo||'',precio=(p.precio!=null?p.precio:'');
  var opt=function(v,l){return '<option value="'+v+'"'+(tipo===v?' selected':'')+'>'+l+'</option>';};
  return '<tr><td style="'+td+';font-weight:600;font-size:12px">'+m.name+(m.role?' <span style="font-weight:400;color:#94a3b8;font-size:10px">'+m.role+'</span>':'')+'</td>'
    +'<td style="'+td+'"><select id="pk-tipo-'+i+'" onchange="savePacto('+i+')" style="'+ist+'">'+opt('','Sin pacto (estimación)')+opt('neto','Precio/hora neto')+opt('bruto','Precio/hora bruto')+'</select></td>'
    +'<td style="'+td+';width:110px"><input type="number" id="pk-precio-'+i+'" value="'+precio+'" step="0.01" min="0" placeholder="€/h" oninput="savePacto('+i+')" style="'+ist+'"></td></tr>';
}
function savePacto(i){
  var m=cfg.monitors[i]; if(!m)return;
  var tipo=document.getElementById('pk-tipo-'+i).value;
  var precio=parseFloat(document.getElementById('pk-precio-'+i).value);
  if((tipo==='neto'||tipo==='bruto')&&!isNaN(precio)&&precio>0){
    m.pacto={tipo:tipo,precio:precio};
  }else{
    delete m.pacto;
  }
  saveCfg();
  var s=document.getElementById('pk-saved'); if(s){s.textContent='Guardado ✓';setTimeout(function(){if(s)s.textContent='';},1500);}
}
function _nominaParams(){
  var num=function(id,def){var v=parseFloat(document.getElementById(id).value);return isNaN(v)?def:v;};
  return {smi:num('nm-smi',17094),hmes:num('nm-hmes',1752),pExtra:num('nm-extra',9),cEmp:num('nm-cemp',33.65),cTrab:num('nm-ctrab',6.50),pTrans:num('nm-trans',3),transOn:document.getElementById('nm-transon').checked,irpfPct:num('nm-irpf',0),irpfOn:document.getElementById('nm-irpfon').checked,semanal:parseFloat(document.getElementById('nm-hcontrato').value)};
}
// Pacto salarial del trabajador (precio/hora neto o bruto). null = sin pacto -> estimación SMI.
function _monPacto(name){
  var m=cfg.monitors.find(function(x){return x.name===name;});
  if(m&&m.pacto&&m.pacto.precio>0&&(m.pacto.tipo==='neto'||m.pacto.tipo==='bruto'))return m.pacto;
  return null;
}
function _nominaCalc(worker,desde,hasta,P){
  var d=_jornadaData(worker,desde,hasta);
  var hManual=(_nmManual[worker]>0)?_nmManual[worker]:0;   // horas fuera de planilla -> salario base
  var horasPlan=d?d.totH:0;
  if(horasPlan<=0&&hManual<=0)return null;
  var horas=horasPlan+hManual;
  // --- Pacto salarial: precio/hora fijo pactado (sobre horas reales), sin reparto contrato/extra ni SMI ---
  var pacto=_monPacto(worker);
  if(pacto){
    var brutoP;
    if(pacto.tipo==='bruto'){
      brutoP=horas*pacto.precio;
    }else{ // neto pactado -> escalar a bruto (gross-up) revirtiendo cotización trabajador (+ IRPF si aplica)
      var factor=1-P.cTrab/100-(P.irpfOn?P.irpfPct/100:0);
      brutoP=factor>0?(horas*pacto.precio)/factor:horas*pacto.precio;
    }
    var cotEmpP=brutoP*P.cEmp/100,cotTrabP=brutoP*P.cTrab/100;
    var irpfP=P.irpfOn?brutoP*P.irpfPct/100:0;
    return {worker:worker,horas:horas,horasPlan:horasPlan,horasManual:hManual,nDias:d?d.nDias:0,nSem:d?d.wkKeys.length:0,
      hContrato:horas,hExtra:0,pContrato:horas>0?brutoP/horas:0,brutoC:brutoP,brutoE:0,brutoSal:brutoP,plusT:0,bruto:brutoP,
      cotEmp:cotEmpP,cotTrab:cotTrabP,irpf:irpfP,costeEmpresa:brutoP+cotEmpP,neto:brutoP-cotTrabP-irpfP,
      pacto:pacto};
  }
  var pContrato=P.hmes>0?P.smi/P.hmes:0;
  var semanal=isNaN(P.semanal)?Infinity:P.semanal;
  var hContrato=0,hExtra=0;
  if(d)d.wkKeys.forEach(function(wk){var wh=d.weeks[wk].reduce(function(s,ev){return s+(toM(ev.e)-toM(ev.s));},0)/60;var c=Math.min(semanal,wh);hContrato+=c;hExtra+=wh-c;});
  hContrato+=hManual;                              // las horas manuales van íntegras al salario base
  var plusT=P.transOn?(horasPlan/8)*P.pTrans:0;    // transporte solo por jornada real de planilla
  var brutoC=hContrato*pContrato,brutoE=hExtra*P.pExtra,brutoSal=brutoC+brutoE,bruto=brutoSal+plusT;
  var cotEmp=bruto*P.cEmp/100,cotTrab=bruto*P.cTrab/100;
  var irpf=P.irpfOn?bruto*P.irpfPct/100:0;
  var costeEmpresa=bruto+cotEmp,neto=bruto-cotTrab-irpf;
  return {worker:worker,horas:horas,horasPlan:horasPlan,horasManual:hManual,nDias:d?d.nDias:0,nSem:d?d.wkKeys.length:0,hContrato:hContrato,hExtra:hExtra,pContrato:pContrato,brutoC:brutoC,brutoE:brutoE,brutoSal:brutoSal,plusT:plusT,bruto:bruto,cotEmp:cotEmp,cotTrab:cotTrab,irpf:irpf,costeEmpresa:costeEmpresa,neto:neto};
}
function _eurES(n){return n.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';}
function _hES(n){return fH(n);}
function calcNomina(){
  var res=document.getElementById('nm-res');
  var worker=document.getElementById('nm-mon').value;
  var desde=document.getElementById('nm-desde').value;
  var hasta=document.getElementById('nm-hasta').value;
  if(!worker||!desde||!hasta){res.innerHTML='<p style="color:#dc2626;font-size:13px">Selecciona trabajador y ambas fechas.</p>';return;}
  if(desde>hasta){res.innerHTML='<p style="color:#dc2626;font-size:13px">La fecha "Desde" debe ser anterior a "Hasta".</p>';return;}
  var P=_nominaParams();
  var r=_nominaCalc(worker,desde,hasta,P);
  if(!r){res.innerHTML='<p style="color:#999;font-size:13px">No hay horas registradas de '+worker+' en el periodo.</p>';return;}
  var smi=P.smi,hmes=P.hmes,pExtra=P.pExtra,cEmp=P.cEmp,cTrab=P.cTrab,pTrans=P.pTrans,transOn=P.transOn,irpfPct=P.irpfPct,irpfOn=P.irpfOn;
  var semanal=isNaN(P.semanal)?Infinity:P.semanal;
  var horas=r.horas,hContrato=r.hContrato,hExtra=r.hExtra,pContrato=r.pContrato,brutoC=r.brutoC,brutoE=r.brutoE,plusT=r.plusT,bruto=r.bruto,cotEmp=r.cotEmp,cotTrab=r.cotTrab,irpf=r.irpf,costeEmpresa=r.costeEmpresa,neto=r.neto;
  var eur=_eurES;
  var hh=_hES;
  var card=function(v,l,col){return '<div style="flex:1;min-width:120px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;text-align:center"><div style="font-size:19px;font-weight:800;color:'+(col||'#15803d')+';line-height:1">'+v+'</div><div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-top:4px">'+l+'</div></div>';};
  var row=function(l,v,strong){return '<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid #f1f5f9'+(strong?';font-weight:700;color:#0f172a':'')+'"><span style="color:#475569">'+l+'</span><span style="white-space:nowrap">'+v+'</span></div>';};
  var pactoBadge=r.pacto?'<span style="font-size:10px;font-weight:700;color:#0e7490;background:#ecfeff;border:1px solid #a5f3fc;border-radius:20px;padding:2px 9px">🤝 Pacto: '+eur(r.pacto.precio)+'/h '+r.pacto.tipo+'</span>':'';
  var html='<div style="display:flex;align-items:center;gap:10px;margin:14px 0 10px"><div style="width:32px;height:32px;border-radius:50%;background:#15803d;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px">'+worker.charAt(0).toUpperCase()+'</div><div style="font-size:15px;font-weight:700;color:#0f172a">'+worker+'</div>'+pactoBadge+'</div>';
  html+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'+card(eur(bruto),'Bruto total')+card(eur(costeEmpresa),'Coste empresa','#b45309')+card(eur(neto),'Neto estimado','#0891b2')+'</div>';
  html+='<div style="background:#fafafa;border:1px solid #eee;border-radius:10px;padding:10px 14px;font-size:12px">';
  html+=row('Horas reales del periodo',hh(horas)+' · '+r.nDias+' días · '+r.nSem+' sem.'+(r.horasManual>0?' · incl. '+hh(r.horasManual)+' manuales':''));
  if(r.pacto){
    if(r.pacto.tipo==='bruto'){
      html+=row('Precio pactado: '+hh(horas)+' × '+eur(r.pacto.precio)+'/h bruto',eur(bruto));
    }else{
      html+=row('Neto pactado: '+hh(horas)+' × '+eur(r.pacto.precio)+'/h',eur(horas*r.pacto.precio));
      html+=row('Bruto equivalente (revirtiendo cotización'+(irpfOn?' + IRPF':'')+')',eur(bruto));
    }
  }else{
    html+=row('Salario base ('+hh(hContrato)+' contrato × '+eur(pContrato)+'/h)',eur(brutoC));
    html+=row('Horas extra × '+eur(pExtra)+'/h',hh(hExtra)+' → '+eur(brutoE));
    if(transOn)html+=row('Plus transporte ('+hh(horas)+' ÷ 8 × '+eur(pTrans)+')',eur(plusT));
  }
  html+=row('BRUTO TOTAL',eur(bruto),true);
  html+=row('Cotización empresa ('+cEmp+'%)','+ '+eur(cotEmp));
  html+=row('COSTE EMPRESA TOTAL',eur(costeEmpresa),true);
  html+=row('Cotización trabajador ('+cTrab+'%)','− '+eur(cotTrab));
  if(irpfOn)html+=row('IRPF ('+irpfPct+'%)','− '+eur(irpf));
  html+=row('NETO ESTIMADO'+(irpfOn?'':' (antes de IRPF)'),eur(neto),true);
  html+=row('Precio/hora bruto',eur(bruto/horas)+'/h');
  html+=row('Precio/hora neto',eur(neto/horas)+'/h');
  html+='</div>';
  if(r.pacto){
    html+='<p style="font-size:10.5px;color:#94a3b8;margin-top:10px;line-height:1.5">Estimación con <b>pacto salarial</b>: '+eur(r.pacto.precio)+'/h '+r.pacto.tipo+' × horas reales (sin reparto contrato/extra ni plus transporte). '+(r.pacto.tipo==='neto'?'El neto pactado se escala a bruto revirtiendo la cotización del trabajador ('+cTrab+'%)'+(irpfOn?' y el IRPF ('+irpfPct+'%)':'')+'. ':'')+'Cotización empresa '+cEmp+'%, trabajador '+cTrab+'%. '+(irpfOn?'IRPF '+irpfPct+'%.':'Sin IRPF.')+' No incluye prorrata de pagas extra.</p>';
  }else{
    html+='<p style="font-size:10.5px;color:#94a3b8;margin-top:10px;line-height:1.5">Estimación orientativa. Reparto por semana ('+(isFinite(semanal)?semanal+' h/sem a contrato, exceso → extra':'todas a contrato')+'). Precio/hora contrato = SMI 17.094 €/año ÷ '+hmes+' h = '+eur(pContrato)+'/h. Cotización empresa 33,65% (CC 23,60 + MEI 0,75 + AT/EP 3,00 + desempleo 5,50 + FP 0,60 + FOGASA 0,20); trabajador 6,50% (CC 4,70 + MEI 0,15 + FP 0,10 + desempleo 1,55), según nómina de la gestoría — AT/EP y desempleo varían por actividad/contrato. El IRPF se aplica solo si marcas la casilla. No incluye prorrata de pagas extra.</p>';
  }
  res.innerHTML=html;
}

// ============================================================
// NÓMINA POR LOTES (todas las del mes)
// ============================================================
var _loteCache=null;
var _nmManual={};   // horas manuales fuera de planilla por trabajador {nombre:horas} -> se suman al salario base
function calcNominaLote(){
  var res=document.getElementById('nm-res');
  var desde=document.getElementById('nm-desde').value;
  var hasta=document.getElementById('nm-hasta').value;
  if(!desde||!hasta){res.innerHTML='<p style="color:#dc2626;font-size:13px">Selecciona ambas fechas.</p>';return;}
  if(desde>hasta){res.innerHTML='<p style="color:#dc2626;font-size:13px">La fecha "Desde" debe ser anterior a "Hasta".</p>';return;}
  var P=_nominaParams();
  var sel=document.getElementById('nm-lote'),lista=[];
  if(sel){for(var i=0;i<sel.options.length;i++){if(sel.options[i].selected)lista.push(sel.options[i].value);}}
  if(!lista.length)lista=cfg.monitors.map(function(m){return m.name;});
  var rows=lista.map(function(w){return _nominaCalc(w,desde,hasta,P);}).filter(Boolean);
  rows.sort(function(a,b){return b.bruto-a.bruto;});
  if(!rows.length){res.innerHTML='<p style="color:#999;font-size:13px">No hay horas registradas en el periodo para los trabajadores seleccionados.</p>';return;}
  var tot={horas:0,hContrato:0,hExtra:0,brutoC:0,brutoE:0,brutoSal:0,plusT:0,bruto:0,costeEmpresa:0,cotTrab:0,irpf:0,neto:0};
  rows.forEach(function(r){for(var k in tot)tot[k]+=r[k];});
  _loteCache={rows:rows,total:tot,desde:desde,hasta:hasta,P:P};
  res.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:14px 0 8px;flex-wrap:wrap"><div style="font-size:14px;font-weight:700;color:#0f172a">📋 Nóminas del periodo '+desde+' → '+hasta+' <span style="font-weight:500;color:#999">('+rows.length+' trab.)</span></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button onclick="nominaGestoriaPrint()" style="padding:8px 16px;border:1px solid #b45309;border-radius:6px;background:#fff;color:#b45309;cursor:pointer;font-weight:600;font-size:12px">🧾 Nóminas gestoría</button><button onclick="nominaLotePrint()" style="padding:8px 16px;border:1px solid #0e7490;border-radius:6px;background:#fff;color:#0e7490;cursor:pointer;font-weight:600;font-size:12px">🖶 Imprimir / PDF</button></div></div>'+_loteTablaHTML(rows,tot,P)+_nmManualPanel()+_loteNotaHTML(P);
}
function _loteTablaHTML(rows,tot,P){
  var eur=_eurES,hh=_hES;
  var th='padding:6px 8px;font-size:10px;font-weight:700;text-align:right;border-bottom:2px solid #cbd5e1;white-space:nowrap';
  var thL='padding:6px 8px;font-size:10px;font-weight:700;text-align:left;border-bottom:2px solid #cbd5e1';
  var td='padding:5px 8px;font-size:11px;text-align:right;border-bottom:1px solid #eef2f7;white-space:nowrap';
  var tdL='padding:5px 8px;font-size:11px;text-align:left;border-bottom:1px solid #eef2f7;font-weight:600';
  var tdt='padding:7px 8px;font-size:11px;text-align:right;border-top:2px solid #cbd5e1;font-weight:800;white-space:nowrap';
  var h='<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;min-width:900px"><thead><tr>';
  h+='<th style="'+thL+'">Trabajador</th><th style="'+th+'">Horas</th><th style="'+th+'">H.Contr.</th><th style="'+th+'">H.Extra</th><th style="'+th+'">Salario base</th><th style="'+th+'">Extra €</th><th style="'+th+'">Transporte</th><th style="'+th+';color:#15803d">BRUTO</th><th style="'+th+';color:#b45309">Coste empresa</th><th style="'+th+'">Cotiz. trab.</th><th style="'+th+'">IRPF</th><th style="'+th+';color:#0891b2">NETO</th>';
  h+='</tr></thead><tbody>';
  rows.forEach(function(r){
    var pk=r.pacto?' <span style="font-size:9px;font-weight:700;color:#0e7490;background:#ecfeff;border:1px solid #a5f3fc;border-radius:10px;padding:1px 5px;white-space:nowrap">🤝 '+eur(r.pacto.precio)+'/h '+r.pacto.tipo+'</span>':'';
    var man=(r.horasManual>0)?' <span style="font-weight:600;color:#d97706;font-size:9px;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:1px 4px;white-space:nowrap">+'+_hES(r.horasManual)+' man.</span>':'';
    h+='<tr><td style="'+tdL+'">'+r.worker+pk+man+'</td><td style="'+td+'">'+hh(r.horas)+'</td><td style="'+td+'">'+hh(r.hContrato)+'</td><td style="'+td+'">'+hh(r.hExtra)+'</td><td style="'+td+'">'+eur(r.brutoC)+'</td><td style="'+td+'">'+eur(r.brutoE)+'</td><td style="'+td+'">'+eur(r.plusT)+'</td><td style="'+td+';font-weight:700;color:#15803d">'+eur(r.bruto)+'</td><td style="'+td+';color:#b45309">'+eur(r.costeEmpresa)+'</td><td style="'+td+'">'+eur(r.cotTrab)+'</td><td style="'+td+'">'+eur(r.irpf)+'</td><td style="'+td+';font-weight:700;color:#0891b2">'+eur(r.neto)+'</td></tr>';
  });
  h+='<tr style="background:#f8fafc"><td style="'+tdt+';text-align:left">TOTAL ('+rows.length+')</td><td style="'+tdt+'">'+hh(tot.horas)+'</td><td style="'+tdt+'">'+hh(tot.hContrato)+'</td><td style="'+tdt+'">'+hh(tot.hExtra)+'</td><td style="'+tdt+'">'+eur(tot.brutoC)+'</td><td style="'+tdt+'">'+eur(tot.brutoE)+'</td><td style="'+tdt+'">'+eur(tot.plusT)+'</td><td style="'+tdt+';color:#15803d">'+eur(tot.bruto)+'</td><td style="'+tdt+';color:#b45309">'+eur(tot.costeEmpresa)+'</td><td style="'+tdt+'">'+eur(tot.cotTrab)+'</td><td style="'+tdt+'">'+eur(tot.irpf)+'</td><td style="'+tdt+';color:#0891b2">'+eur(tot.neto)+'</td></tr>';
  h+='</tbody></table></div>';
  return h;
}
function _loteNotaHTML(P){
  var eur=_eurES,pContrato=P.hmes>0?P.smi/P.hmes:0;
  return '<p style="font-size:10.5px;color:#94a3b8;margin-top:10px;line-height:1.5">Estimación orientativa, mismos parámetros para todos. Reparto por semana ('+(isNaN(P.semanal)?'todas a contrato':P.semanal+' h/sem a contrato, exceso → extra')+'). Precio/hora contrato = SMI '+eur(P.smi)+'/año ÷ '+P.hmes+' h = '+eur(pContrato)+'/h. Hora extra '+eur(P.pExtra)+'/h. '+(P.transOn?'Plus transporte '+eur(P.pTrans)+'/8 h. ':'Sin plus transporte. ')+'Cotización empresa '+P.cEmp+'%, trabajador '+P.cTrab+'%. '+(P.irpfOn?'IRPF '+P.irpfPct+'%.':'Sin IRPF.')+' No incluye prorrata de pagas extra.</p>';
}
function nominaLotePrint(){
  if(!_loteCache){toast('Primero calcula el lote.');return;}
  var c=_loteCache;
  var win=window.open('','_blank','width=1000,height=760');
  if(!win){toast('⚠ El navegador bloqueó la ventana. Permite ventanas emergentes para este sitio.');return;}
  var css='*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;padding:20px;color:#0f172a}h1{font-size:17px;margin-bottom:2px}.su{font-size:11px;color:#888;margin-bottom:14px}.np{margin-bottom:14px}@media print{.np{display:none}body{padding:6px}}';
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Nóminas '+c.desde+' a '+c.hasta+'</title><style>'+css+'</style></head><body>');
  win.document.write('<div class="np"><button onclick="window.print()" style="padding:6px 14px;background:#0e7490;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-right:6px;font-size:12px">Imprimir/PDF</button><button onclick="window.close()" style="padding:6px 14px;background:#fff;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:12px">Cerrar</button></div>');
  win.document.write('<h1>SportGest Alzira — Nóminas estimadas</h1><p class="su">Periodo '+c.desde+' a '+c.hasta+' · '+c.rows.length+' trabajadores</p>');
  win.document.write(_loteTablaHTML(c.rows,c.total,c.P));
  win.document.write(_loteNotaHTML(c.P));
  win.document.write('</body></html>');
  win.document.close();
}

// --- Horas manuales (fuera de planilla) que se suman al salario base ---
function _nmManualPanel(){
  var ist='padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px';
  var opts=cfg.monitors.map(function(m){var n=m.name.replace(/"/g,'&quot;');return '<option value="'+n+'">'+m.name+'</option>';}).join('');
  var keys=Object.keys(_nmManual).filter(function(w){return _nmManual[w]>0;});
  var chips='';
  if(keys.length){
    chips='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">'+keys.map(function(w){
      return '<span style="display:inline-flex;align-items:center;gap:7px;background:#fff;border:1px solid #fcd34d;border-radius:20px;padding:3px 5px 3px 11px;font-size:11px;font-weight:600;color:#92400e">'+w+' · +'+_hES(_nmManual[w])
        +'<button onclick="nmDelManual(\''+w.replace(/\\/g,'\\\\').replace(/'/g,"\\'")+'\')" title="Quitar" style="border:none;background:#fde68a;color:#92400e;border-radius:50%;width:18px;height:18px;cursor:pointer;font-weight:700;line-height:1">×</button></span>';
    }).join('')+'</div>';
  }
  return '<div style="border:1px dashed #fcd34d;border-radius:10px;padding:12px 14px;margin-top:14px;background:#fffbeb">'
    +'<div style="font-weight:700;font-size:12px;color:#92400e;margin-bottom:9px">➕ Añadir horas manuales (fuera de planilla) <span style="font-weight:400;color:#b45309">— se suman al salario base</span></div>'
    +'<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">'
    +'<div style="flex:2;min-width:160px"><select id="nm-man-mon" style="width:100%;box-sizing:border-box;'+ist+'">'+opts+'</select></div>'
    +'<div style="flex:1;min-width:110px"><input type="number" id="nm-man-h" step="0.5" min="0" placeholder="Horas" style="width:100%;box-sizing:border-box;'+ist+'"></div>'
    +'<button onclick="nmAddManual()" style="padding:9px 16px;border:none;border-radius:6px;background:#d97706;color:#fff;cursor:pointer;font-weight:600;font-size:13px;white-space:nowrap">Añadir / actualizar</button>'
    +'</div>'+chips+'</div>';
}
function nmAddManual(){
  var w=document.getElementById('nm-man-mon').value;
  var h=parseFloat(document.getElementById('nm-man-h').value);
  if(!w){toast('Selecciona un trabajador.');return;}
  if(isNaN(h)||h<0){toast('Introduce un nº de horas válido.');return;}
  if(h===0)delete _nmManual[w]; else _nmManual[w]=h;
  toast(h>0?'+'+_hES(h)+' a '+w:'Horas manuales de '+w+' eliminadas');
  calcNominaLote();
}
function nmDelManual(w){delete _nmManual[w];calcNominaLote();}

// --- Resumen para la gestoría: solo horas totales, plus transporte y salario bruto ---
function nominaGestoriaPrint(){
  if(!_loteCache){toast('Primero calcula el lote.');return;}
  var c=_loteCache,eur=_eurES,hh=_hES;
  var win=window.open('','_blank','width=820,height=760');
  if(!win){toast('⚠ El navegador bloqueó la ventana. Permite ventanas emergentes para este sitio.');return;}
  var css='*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;padding:22px;color:#0f172a}'
    +'h1{font-size:17px;margin-bottom:2px}.su{font-size:11px;color:#888;margin-bottom:16px}'
    +'table{border-collapse:collapse;width:100%}'
    +'th{font-size:11px;font-weight:700;padding:7px 10px;border-bottom:2px solid #cbd5e1}'
    +'td{font-size:12px;padding:6px 10px;border-bottom:1px solid #eef2f7}'
    +'.l{text-align:left}.r{text-align:right;white-space:nowrap}'
    +'tfoot td{font-weight:800;border-top:2px solid #cbd5e1;border-bottom:none}'
    +'.np{margin-bottom:14px}@media print{.np{display:none}body{padding:8px}}';
  var rowsH=c.rows.map(function(r){
    return '<tr><td class="l">'+r.worker+'</td><td class="r">'+hh(r.horas)+'</td><td class="r">'+eur(r.plusT)+'</td><td class="r">'+eur(r.brutoSal)+'</td></tr>';
  }).join('');
  var t=c.total;
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Nóminas gestoría '+c.desde+' a '+c.hasta+'</title><style>'+css+'</style></head><body>');
  win.document.write('<div class="np"><button onclick="window.print()" style="padding:6px 14px;background:#b45309;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-right:6px;font-size:12px">Imprimir/PDF</button><button onclick="window.close()" style="padding:6px 14px;background:#fff;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:12px">Cerrar</button></div>');
  win.document.write('<h1>SportGest Alzira — Resumen para gestoría</h1><p class="su">Periodo '+c.desde+' a '+c.hasta+' · '+c.rows.length+' trabajadores</p>');
  win.document.write('<table><thead><tr><th class="l">Trabajador</th><th class="r">Horas totales</th><th class="r">Plus transporte</th><th class="r">Salario bruto</th></tr></thead><tbody>'+rowsH+'</tbody>'
    +'<tfoot><tr><td class="l">TOTAL ('+c.rows.length+')</td><td class="r">'+hh(t.horas)+'</td><td class="r">'+eur(t.plusT)+'</td><td class="r">'+eur(t.brutoSal)+'</td></tr></tfoot></table>');
  win.document.write('<p style="font-size:10.5px;color:#94a3b8;margin-top:14px;line-height:1.5">Salario bruto = salario base + horas extra (el plus transporte se detalla aparte y no está incluido en esa cifra). Las horas totales incluyen las horas manuales añadidas fuera de planilla.</p>');
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

function sgBoot(){
  load();

  // Si semana actual no tiene datos, ir a primera semana con datos
  (function(){
    var ok=false;
    for(var i=0;i<7;i++){var d=ISO(addD(lunes,i));if(events.some(function(e){return e.date===d;})){ok=true;break;}}
    if(!ok&&events.length){var first=new Date(events.slice().sort(function(a,b){return a.date.localeCompare(b.date);})[0].date+'T00:00:00');lunes=monOf(first);dia=Math.min(first.getDay()===0?6:first.getDay()-1,5);}
  })();

  all();

  // Sincronización en la nube (si está disponible)
  if(typeof sgSync!=='undefined'&&sgSync.start)sgSync.start();
}

// Arranque: exige login + sync si está configurado; si no, modo local directo
if(typeof sgRequireAuth==='function')sgRequireAuth(sgBoot); else sgBoot();