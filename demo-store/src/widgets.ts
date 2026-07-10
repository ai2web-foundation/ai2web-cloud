// ChatGPT Apps SDK UI widgets. Each is a self-contained HTML template served as an MCP
// resource with MIME text/html+skybridge. ChatGPT renders it in an iframe and injects
// window.openai; the widget reads window.openai.toolOutput.structuredContent (populated
// via the openai:set_globals event). The refund widget calls the tool back with
// confirm:true when the user approves - an in-ChatGPT confirm button.

const BASE_CSS = `
  :root{color-scheme:light dark}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#111;background:transparent}
  @media(prefers-color-scheme:dark){body{color:#f3f3f3}}
  .card{border:1px solid rgba(128,128,128,.28);border-radius:14px;padding:16px;max-width:420px}
  .muted{color:#7a7a7a;font-size:13px}
  h2{font-size:16px;margin:0 0 4px}
  .steps{display:flex;gap:6px;margin:12px 0}
  .steps .s{flex:1;height:6px;border-radius:99px;background:rgba(128,128,128,.25)}
  .steps .s.on{background:currentColor}
  button{font:inherit;font-weight:600;padding:10px 16px;border-radius:10px;border:1px solid #111;background:#111;color:#fff;cursor:pointer}
  @media(prefers-color-scheme:dark){button{background:#f3f3f3;color:#111;border-color:#f3f3f3}}
  button.sec{background:transparent;color:inherit;border-color:rgba(128,128,128,.4)}
  .row{display:flex;gap:8px;margin-top:12px}
`;

const READ = `
  function data(){ try{ var o=window.openai; return (o&&(o.toolOutput&&(o.toolOutput.structuredContent||o.toolOutput)))||{}; }catch(e){ return {}; } }
  window.addEventListener('openai:set_globals', render);
`;

export const TRACKING_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
<body><div class="card" id="root"><div class="muted">Loading tracking…</div></div>
<script>
${READ}
var ORDER=["ordered","shipped","in_transit","delivered"];
function render(){
  var d=data(); var el=document.getElementById('root');
  if(!d.order_id){ el.innerHTML='<div class="muted">No tracking data.</div>'; return; }
  var idx=Math.max(0,ORDER.indexOf(d.status||'in_transit'));
  var steps=ORDER.map(function(_,i){return '<div class="s'+(i<=idx?' on':'')+'"></div>'}).join('');
  el.innerHTML=
    '<h2>Order '+esc(d.order_id)+'</h2>'+
    '<div class="muted">'+esc(d.carrier||'Carrier')+' · '+esc((d.status||'').replace(/_/g,' '))+'</div>'+
    '<div class="steps">'+steps+'</div>'+
    '<div><strong>'+esc(d.last_event||'In transit')+'</strong></div>'+
    (d.eta?'<div class="muted">ETA '+esc(d.eta)+'</div>':'');
}
function esc(s){return String(s==null?'':s).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
render();
</script></body></html>`;

export const REFUND_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
<body><div class="card" id="root"><div class="muted">Loading…</div></div>
<script>
${READ}
function render(){
  var d=data(); var el=document.getElementById('root');
  if(d && d.status==='refunded'){
    el.innerHTML='<h2>Refunded</h2><div>'+esc(d.currency||'GBP')+' '+esc(d.amount||'')+' to '+esc(d.method||'original payment')+'</div>'+
      '<div class="muted">Order '+esc(d.order_id)+' · audit '+esc(d.audit_ref||'')+'</div>';
    return;
  }
  if(d && d.preview){
    var order=(d.proposed&&d.proposed.order_id)||d.order_id||'';
    el.innerHTML='<h2>Approve refund?</h2>'+
      '<div>Refund for order <strong>'+esc(order)+'</strong>. This moves money, so it needs your approval.</div>'+
      '<div class="row"><button id="ok">Approve refund</button><button class="sec" id="no">Not now</button></div>';
    document.getElementById('ok').onclick=function(){ approve(order); };
    document.getElementById('no').onclick=function(){ el.innerHTML='<div class="muted">Refund cancelled.</div>'; };
    return;
  }
  el.innerHTML='<div class="muted">Nothing to confirm.</div>';
}
function approve(order){
  var el=document.getElementById('root'); el.innerHTML='<div class="muted">Processing refund…</div>';
  try{
    window.openai.callTool('request_refund',{order_id:order,confirm:true}).then(function(res){
      var out=res&&(res.structuredContent||(res.content&&res.content[0]&&safe(res.content[0].text)));
      if(out){ window.openai.toolOutput={structuredContent:out}; }
      render();
    }).catch(function(){ el.innerHTML='<div class="muted">Could not process the refund.</div>'; });
  }catch(e){ el.innerHTML='<div class="muted">Approval requires ChatGPT.</div>'; }
}
function safe(t){try{return JSON.parse(t)}catch(e){return null}}
function esc(s){return String(s==null?'':s).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
render();
</script></body></html>`;

// action id -> widget resource URI
export const WIDGETS: Record<string, string> = {
  track_order: "ui://widget/tracking.html",
  request_refund: "ui://widget/refund.html",
};

// resource URI -> { name, html }
export const WIDGET_RESOURCES: Record<string, { name: string; html: string }> = {
  "ui://widget/tracking.html": { name: "order-tracking", html: TRACKING_HTML },
  "ui://widget/refund.html": { name: "refund", html: REFUND_HTML },
};
