const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const cleanId = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,64);
const quoteYaml = s => JSON.stringify(String(s));
const domainFor = c => c==='light_candidate'?'light':c==='switch_candidate'?'switch':null;

export function buildKnxPreview(data, edits = {}) {
  const allowed = new Set((data?.group_addresses || []).map(x=>x.address));
  const config = {light:[], switch:[]};
  const warnings = [];
  const assigned = new Set();
  for (const candidate of data?.pairs || []) {
    const cmd = candidate.command;
    const edit = edits[cmd] || {};
    if (edit.include === false) continue;
    const domain = edit.domain || domainFor(candidate.category);
    if (['access_control_review','unassigned','hvac_load','unknown_review'].includes(candidate.category)) continue;
    if (!['light','switch'].includes(domain)) continue;
    const address = edit.state === undefined ? candidate.state : edit.state;
    if (!allowed.has(cmd) || (address && !allowed.has(address))) {warnings.push('Indirizzi non validi: '+cmd);continue;}
    if (assigned.has(cmd)) {warnings.push('Duplicato: '+cmd);continue;}
    assigned.add(cmd);
    const entity = {name: edit.name || candidate.name, address: cmd};
    if (address) entity.state_address = address;
    else warnings.push('Stato non associato: '+cmd);
    config[domain].push(entity);
  }
  const lines=['# CL Discovery: bozza non applicata. Verificare DPT, flag ETS, collegamenti e categoria.','knx:'];
  for (const domain of ['light','switch']) {
    if (!config[domain].length) continue;
    lines.push('  '+domain+':');
    for (const c of config[domain]) {
      lines.push('    - name: '+quoteYaml(c.name));
      lines.push('      address: '+quoteYaml(c.address));
      if(c.state_address) lines.push('      state_address: '+quoteYaml(c.state_address));
    }
  }
  if (!config.light.length&&!config.switch.length) lines.push('  {}');
  return {yaml:lines.join('\n')+'\n',warnings,counts:{light:config.light.length,switch:config.switch.length}};
}

class CLDiscoveryCard extends HTMLElement {
  constructor(){
    super();this.attachShadow({mode:'open'});
    this._hass=null;this._state=null;this._data=null;this._edits={};this._filter='';
    this._busy=false;this._error='';this._unlocked=false;this._checked=false;
  }
  setConfig(c){this._config=c||{};this._draw();}
  set hass(h){
    const first=!this._hass;this._hass=h;
    if(first)this._status();
  }
  getCardSize(){return 7;}
  async _status(){
    if(!this._hass?.user?.is_admin)return this._draw();
    try {const result=await this._hass.callWS({type:'cl_control/installer/status'});this._unlocked=!!result.unlocked;}
    catch(_){this._unlocked=false;}
    this._checked=true;this._draw();
  }
  async _import(file){
    if(!file)return;
    this._busy=true;this._error='';this._draw();
    try{
      if(file.size>4*1024*1024)throw Error('Il file XML supera 4 MB');
      const xml=await file.text();
      const result=await this._hass.callWS({type:'cl_control/discovery/knx/import_preview',xml});
      this._data=result;this._edits={};this._filter='';
    }catch(e){this._error=String(e?.message||e);}
    finally{this._busy=false;this._draw();}
  }
  _download(){
    const result=buildKnxPreview(this._data,this._edits);
    const blob=new Blob([result.yaml],{type:'text/yaml;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='cl_discovery_knx_preview.yaml';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  _draw(){
    if(!this.shadowRoot)return;
    const style='<style>:host{display:block;color:var(--primary-text-color)}ha-card{padding:20px;margin-top:14px;border-radius:16px}h3{margin:0 0 8px}.muted{color:var(--secondary-text-color);font-size:13px}.top{display:flex;justify-content:space-between;align-items:center;gap:10px}.pill{border:1px solid var(--divider-color);border-radius:99px;padding:5px 9px;font-size:12px}.tools{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}button,input,select{font:inherit;color:inherit}button{cursor:pointer;background:var(--secondary-background-color);border:1px solid var(--divider-color);border-radius:9px;padding:9px}button.primary{background:var(--primary-color);color:white}.search{padding:10px;width:100%;box-sizing:border-box;border:1px solid var(--divider-color);border-radius:9px;background:var(--card-background-color)}.entry{display:grid;grid-template-columns:1fr minmax(110px,170px) minmax(140px,220px);gap:8px;padding:10px 0;border-bottom:1px solid var(--divider-color);align-items:center}.entry small{display:block;color:var(--secondary-text-color)}.entry select,.entry input[type=text]{width:100%;box-sizing:border-box;border:1px solid var(--divider-color);background:var(--card-background-color);border-radius:8px;padding:7px}.preview{white-space:pre;overflow:auto;max-height:320px;font:12px monospace;padding:12px;border-radius:10px;background:var(--secondary-background-color);border:1px solid var(--divider-color)}.alert{padding:10px;border-radius:9px;background:var(--secondary-background-color)}@media(max-width:760px){.entry{grid-template-columns:1fr}.entry>div{width:100%}}</style>';
    if(!this._hass?.user?.is_admin){this.shadowRoot.innerHTML=style;return;}
    if(!this._checked){this.shadowRoot.innerHTML=style+'<ha-card>Verifica accesso Discovery…</ha-card>';return;}
    if(!this._unlocked){this.shadowRoot.innerHTML=style+'<ha-card><div class="top"><h3>CL Discovery · KNX</h3><span class="pill">Bloccato</span></div><p class="muted">Sblocca il PIN Installatore nella scheda di configurazione e premi Aggiorna accesso.</p><button id="refresh">Aggiorna accesso</button></ha-card>';this.shadowRoot.querySelector('#refresh').onclick=()=>this._status();return;}
    let html=style+'<ha-card><div class="top"><div><h3>CL Discovery · KNX</h3><div class="muted">Importazione ETS XML · sola lettura</div></div><span class="pill">Anteprima</span></div><p class="muted">Seleziona un file esportato da ETS. Nessun telegramma KNX verrà inviato.</p><div class="tools"><input type="file" id="file" accept=".xml,text/xml,application/xml" '+(this._busy?'disabled':'')+'/><button id="refresh">Aggiorna accesso</button></div>';
    if(this._error)html+='<div class="alert" role="alert">'+escapeHtml(this._error)+'</div>';
    if(this._data){
      const summary=this._data.summary||{};
      const matches=(this._data.pairs||[]).filter(x=>[x.name,x.command,x.state,x.category].join(' ').toLowerCase().includes(this._filter));
      html+='<p class="muted">'+escapeHtml(summary.group_addresses)+' indirizzi · '+escapeHtml(summary.matched_command_state)+' coppie · '+escapeHtml(summary.dimmers)+' dimmer · '+escapeHtml(summary.climate_zones)+' zone clima</p>';
      html+='<input class="search" id="search" placeholder="Cerca nome, GA o categoria" value="'+escapeHtml(this._filter)+'"/>';
      html+='<div class="muted" style="margin-top:10px">Seleziona solo luci e carichi verificati. Apriporta, HVAC e indirizzi non assegnati restano esclusi. I dimmer e il clima richiedono revisione specifica.</div>';
      html+='<div id="entries">'+matches.map(c=>{
        const e=this._edits[c.command]||{};
        const blocked=['access_control_review','unassigned','hvac_load','unknown_review'].includes(c.category);
        const domain=blocked?'skip':(e.domain||domainFor(c.category)||'skip');
        const states=(this._data.group_addresses||[]).filter(s=>s.dpts?.some(d=>(this._data.group_addresses||[]).find(x=>x.address===c.command)?.dpts?.includes(d)));
        return '<div class="entry"><div><b>'+escapeHtml(c.name)+'</b><small>'+escapeHtml(c.command)+' → '+escapeHtml(c.state||'nessuno')+' · '+escapeHtml(c.category)+'</small></div><div><select data-domain="'+escapeHtml(c.command)+'"><option value="skip" '+(domain==='skip'?'selected':'')+'>Escludi</option>'+(blocked?'':'<option value="light" '+(domain==='light'?'selected':'')+'>Luce</option><option value="switch" '+(domain==='switch'?'selected':'')+'>Interruttore</option>')+'</select></div><div><select data-state="'+escapeHtml(c.command)+'"><option value="">Senza stato</option>'+states.map(s=>'<option value="'+escapeHtml(s.address)+'" '+((e.state===undefined?c.state:e.state)===s.address?'selected':'')+'>'+escapeHtml(s.address)+' · '+escapeHtml(s.name)+'</option>').join('')+'</select></div></div>';
      }).join('')+'</div>';
      const preview=buildKnxPreview(this._data,this._edits);
      html+='<div class="tools"><span class="pill">'+preview.counts.light+' luci</span><span class="pill">'+preview.counts.switch+' interruttori</span><button class="primary" id="download">Scarica bozza YAML</button></div>';
      if(preview.warnings.length)html+='<div class="alert">'+escapeHtml(preview.warnings.slice(0,8).join(' · '))+'</div>';
      html+='<pre class="preview">'+escapeHtml(preview.yaml)+'</pre>';
      html+='<p class="muted">Attenzione: l’XML degli indirizzi non dimostra il collegamento fisico o la validità degli oggetti ETS. Non caricare il YAML senza verifica tecnica.</p>';
    }
    this.shadowRoot.innerHTML=html+'</ha-card>';
    this.shadowRoot.querySelector('#refresh')?.addEventListener('click',()=>this._status());
    this.shadowRoot.querySelector('#file')?.addEventListener('change',e=>this._import(e.target.files?.[0]));
    this.shadowRoot.querySelector('#search')?.addEventListener('input',e=>{this._filter=e.target.value.toLowerCase();this._draw();this.shadowRoot.querySelector('#search')?.focus();});
    this.shadowRoot.querySelectorAll('[data-domain]').forEach(el=>el.onchange=()=>{const id=el.dataset.domain;this._edits[id]={...(this._edits[id]||{}),domain:el.value};this._draw();});
    this.shadowRoot.querySelectorAll('[data-state]').forEach(el=>el.onchange=()=>{const id=el.dataset.state;this._edits[id]={...(this._edits[id]||{}),state:el.value};this._draw();});
    this.shadowRoot.querySelector('#download')?.addEventListener('click',()=>this._download());
  }
}
if(!customElements.get('cl-control-discovery-card'))customElements.define('cl-control-discovery-card',CLDiscoveryCard);
