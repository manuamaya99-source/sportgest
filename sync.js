// ============================================================
// SYNC EN LA NUBE (Supabase) + LOGIN
// ------------------------------------------------------------
// Sincroniza la foto JSON local {events,nextId,cfg,touched,savedAt}
// con una fila por cuenta en Supabase. Una sola cuenta compartida.
// Si se abre como file:// o sin configurar -> modo local sin login
// (los exports "Guardar HTML" siguen funcionando igual que siempre).
// ============================================================

// >>> DATOS DE SUPABASE (Project Settings -> API) <<<
var SB_URL  = 'https://jtikmovmxzcasncjtdmz.supabase.co';        // Project URL
var SB_ANON = 'sb_publishable_Ku6x0YacIBgY2KzDt7uGaQ_oCOFC0ir';  // publishable key (pública: segura bajo RLS)

var _sbClient=null, _sbSession=null, _sbPushTimer=null, _sbChannel=null;
var _sgPushedAt=null;   // savedAt de la última foto que ESTE dispositivo subió/conoce de la nube

function _sgConfigured(){return SB_URL.indexOf('TU-PROYECTO')<0 && SB_ANON.indexOf('TU_ANON')<0;}

// --- Indicador de estado en la barra (#sg-cloud) ---
function _sgCloud(state){
  var el=document.getElementById('sg-cloud'); if(!el)return;
  var m={ok:['☁ Sincronizado','#16a34a'],saving:['☁ Sincronizando…','#ca8a04'],
         off:['☁ Sin conexión','#dc2626'],local:['💾 Solo local','#64748b']};
  var v=m[state]||m.off; el.textContent=v[0]; el.style.color=v[1];
}
function _sgToast(msg){try{if(typeof toast==='function')toast(msg);}catch(e){}}

// --- Carga perezosa del SDK (mismo idiom que lxls para XLSX) ---
function _sgLoadSDK(cb){
  if(window.supabase){cb();return;}
  var s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  s.onload=function(){cb();};
  s.onerror=function(){cb('error');};
  document.head.appendChild(s);
}

// --- Foto actual (la misma que escribe autoSave en localStorage) ---
function _sgSnapshot(){
  try{var raw=localStorage.getItem(_STORE+'_full'); if(raw)return JSON.parse(raw);}catch(e){}
  return {events:events,nextId:nextId,cfg:cfg,touched:_touched,savedAt:new Date().toISOString()};
}

// --- Adoptar foto remota SIN disparar autoSave (evita bucle de push) ---
function _sgAdopt(remote){
  events=(remote.events||[]).map(function(e){return Object.assign({},e);});
  nextId=remote.nextId||1;
  if(remote.cfg)cfg=remote.cfg;
  _touched=remote.touched||remote.deleted||[];
  _dirty=false;
  try{localStorage.setItem(_STORE+'_full',JSON.stringify(
    {events:events,nextId:nextId,cfg:cfg,touched:_touched,savedAt:remote.savedAt}));}catch(e){}
  localStorage.setItem('sg_lastSyncAt',remote.savedAt||'');
  _sgPushedAt=remote.savedAt||'';
  if(typeof all==='function')all();
}

// --- Reconciliar local <-> remoto (last-write-wins por savedAt) ---
function _sgReconcile(remote){
  var local=_sgSnapshot();
  var rAt=remote&&remote.savedAt||'', lAt=local.savedAt||'';
  var base=localStorage.getItem('sg_lastSyncAt')||'';
  var hasRemote=remote && remote.events && remote.events.length;
  // Dispositivo que NUNCA ha sincronizado: la nube manda (lo local es solo la
  // semilla por defecto). Evita que un arranque limpio pise los datos buenos.
  if(hasRemote && !base){ _sgAdopt(remote); _sgCloud('ok'); return; }
  if(rAt && rAt>lAt){
    // La nube es más nueva -> adoptar. Si lo local también cambió desde el
    // último sync común, avisar (puede haberse perdido algo sin subir).
    if(lAt>base) _sgToast('⚠ Se aplicaron cambios desde otro dispositivo. Si editaste sin conexión, revisa (tienes Backup JSON).');
    _sgAdopt(remote);
    _sgCloud('ok');
  }else{
    // Lo local es igual o más nuevo -> subir para que la nube se ponga al día.
    _sgPush(true);
  }
}

// --- PULL inicial ---
function _sgPull(){
  if(!_sbClient||!_sbSession)return;
  _sgCloud('saving');
  _sbClient.from('snapshots').select('data').eq('user_id',_sbSession.user.id).maybeSingle()
    .then(function(res){
      if(res.error){_sgCloud('off');return;}
      var remote=res.data&&res.data.data;
      if(!remote){_sgPush(true);return;}   // nube vacía -> subir lo local
      _sgReconcile(remote);
    },function(){_sgCloud('off');});
}

// --- PUSH (upsert) con debounce ~1s ---
function _sgPush(now){
  if(!_sbClient||!_sbSession)return;
  if(_sbPushTimer)clearTimeout(_sbPushTimer);
  if(now){_sgDoPush();return;}
  _sbPushTimer=setTimeout(_sgDoPush,1000);
}
function _sgDoPush(){
  if(!_sbClient||!_sbSession)return;
  var snap=_sgSnapshot();
  if(snap.savedAt && snap.savedAt===_sgPushedAt){_sgCloud('ok');return;} // nada nuevo
  _sgCloud('saving');
  _sbClient.from('snapshots').upsert({user_id:_sbSession.user.id,data:snap,
      updated_at:new Date().toISOString()}).then(function(res){
    if(res.error){_sgCloud('off');return;}
    _sgPushedAt=snap.savedAt||'';
    localStorage.setItem('sg_lastSyncAt',_sgPushedAt);
    _sgCloud('ok');
  },function(){_sgCloud('off');});
}

// --- Realtime: aplicar cambios de otro dispositivo en vivo ---
function _sgSubscribe(){
  if(!_sbClient||!_sbSession||_sbChannel)return;
  _sbChannel=_sbClient.channel('snap-'+_sbSession.user.id)
    .on('postgres_changes',{event:'*',schema:'public',table:'snapshots',
        filter:'user_id=eq.'+_sbSession.user.id},function(payload){
      var remote=payload['new']&&payload['new'].data;
      if(remote)_sgReconcile(remote);
    }).subscribe();
}

// ============================================================
// API pública usada por app.js
// ============================================================
var sgSync={
  start:function(){ if(!_sbClient||!_sbSession)return; _sgPull(); _sgSubscribe(); },
  push :function(){ _sgPush(false); }
};

// Llamado desde la cola de arranque de app.js (en lugar de load();...;all();)
function sgRequireAuth(onReady){
  // file:// o sin configurar -> modo local, sin login
  if(location.protocol==='file:'||!_sgConfigured()){ _sgCloud('local'); onReady(); return; }
  _sgLoadSDK(function(err){
    if(err||!window.supabase){ _sgCloud('off'); onReady(); return; } // offline -> arrancar local
    _sbClient=window.supabase.createClient(SB_URL,SB_ANON);
    _sbClient.auth.getSession().then(function(res){
      var sess=res.data&&res.data.session;
      if(sess){ _sbSession=sess; _sgCloud('ok'); onReady(); }
      else { _sgShowLogin(onReady); }
    },function(){ _sgCloud('off'); onReady(); });
  });
}

function sgLogout(){
  if(_sbClient&&_sbClient.auth){ _sbClient.auth.signOut().then(function(){location.reload();}); }
  else location.reload();
}

// --- Pantalla de login (overlay) ---
function _sgShowLogin(onReady){
  _sgCloud('off');
  var ov=document.createElement('div'); ov.id='sg-login';
  ov.style.cssText='position:fixed;inset:0;z-index:99999;background:#0f172a;display:flex;'
    +'align-items:center;justify-content:center;font-family:system-ui,Arial,sans-serif';
  ov.innerHTML='<div style="background:#fff;padding:28px;border-radius:14px;width:320px;max-width:90vw;box-shadow:0 10px 40px rgba(0,0,0,.4)">'
    +'<div style="font-size:22px;font-weight:700;margin-bottom:4px;color:#1e293b">Sport<span style="color:#2563eb">Gest</span></div>'
    +'<div style="font-size:13px;color:#64748b;margin-bottom:18px">Inicia sesión para sincronizar tus horarios</div>'
    +'<input id="sg-email" type="email" placeholder="Email" autocomplete="username" style="width:100%;box-sizing:border-box;padding:10px;margin-bottom:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px">'
    +'<input id="sg-pass" type="password" placeholder="Contraseña" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:10px;margin-bottom:14px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px">'
    +'<button id="sg-enter" style="width:100%;padding:11px;background:#2563eb;color:#fff;border:0;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">Entrar</button>'
    +'<div id="sg-err" style="color:#dc2626;font-size:12px;margin-top:10px;min-height:14px"></div>'
    +'</div>';
  document.body.appendChild(ov);
  function doLogin(){
    var em=document.getElementById('sg-email').value.trim();
    var pw=document.getElementById('sg-pass').value;
    var errEl=document.getElementById('sg-err'), btn=document.getElementById('sg-enter');
    if(!em||!pw){errEl.textContent='Introduce email y contraseña.';return;}
    btn.disabled=true; btn.textContent='Entrando…'; errEl.textContent='';
    _sbClient.auth.signInWithPassword({email:em,password:pw}).then(function(res){
      if(res.error){errEl.textContent='Email o contraseña incorrectos.';btn.disabled=false;btn.textContent='Entrar';return;}
      _sbSession=res.data.session; ov.remove(); _sgCloud('ok'); onReady();
    },function(){errEl.textContent='Sin conexión. Inténtalo de nuevo.';btn.disabled=false;btn.textContent='Entrar';});
  }
  document.getElementById('sg-enter').addEventListener('click',doLogin);
  document.getElementById('sg-pass').addEventListener('keydown',function(e){if(e.key==='Enter')doLogin();});
  document.getElementById('sg-email').focus();
}
