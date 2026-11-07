/* CL Control Media: Glass presentation adapted from the user supplied CL Glass 1.0.1. */
export class CLControlMediaCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity?.startsWith('media_player.')) throw new Error('Specificare una entità media_player');
    this._config = {...config};
    if (!this.shadowRoot) this.attachShadow({mode:'open'});
    this._render();
    if (this._hass) this._update();
  }
  set hass(hass) { this._hass=hass; if(this._config) this._update(); }
  getCardSize() { return 4; }
  getGridOptions() { return {columns:12,rows:4,min_columns:6,min_rows:4}; }
  _render() {
    this.shadowRoot.innerHTML=`
    <style>
    :host{display:block;min-width:0;--accent-a:#39adff;--accent-b:#bd65f3}
    *{box-sizing:border-box}
    ha-card{position:relative;isolation:isolate;height:224px;width:100%;max-width:820px;margin:auto;overflow:hidden;border-radius:25px;border:1px solid rgba(178,218,255,.4);background:radial-gradient(ellipse at 22% 0%,#253e5d88,transparent 68%),radial-gradient(ellipse at 96% 80%,#542f7366,transparent 65%),linear-gradient(115deg,#18222b,#121721 60%,#201a23);color:#f6f7fb;box-shadow:0 9px 25px #0004,inset 0 1px 2px #e7f7ff55;font-family:var(--paper-font-body1_-_font-family,Arial,sans-serif)}
    .blur{position:absolute;inset:-24px;background-position:center;background-size:cover;filter:blur(17px);opacity:.22;z-index:-2;pointer-events:none}
    .veil{position:absolute;inset:0;background:linear-gradient(90deg,#0e17234d,#12162066);z-index:-1;pointer-events:none}
    button{appearance:none;border:0;color:inherit;font:inherit;cursor:pointer;display:grid;place-items:center;background:#ffffff0c;transition:background .15s,transform .15s;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    button[hidden]{display:none!important}button:hover:not(:disabled){background:#ffffff20}button:active:not(:disabled){transform:scale(.94)}button:disabled{opacity:.27;cursor:default}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #67c5ff;outline-offset:3px}
    ha-icon{--mdc-icon-size:24px;display:block}
    .device{position:absolute;top:22px;left:24px;width:35px;--mdc-icon-size:30px;color:#fff;filter:drop-shadow(0 0 4px #8b8fff)}
    .text{position:absolute;top:21px;left:80px;right:175px;min-width:0}
    .name{font-size:18px;font-weight:650;line-height:25px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.3px}
    .subtitle{font-size:13px;line-height:20px;color:#c6c8d0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .more{position:absolute;top:14px;right:14px;width:32px;height:36px;border-radius:12px;background:transparent}
    .cover{position:absolute;right:65px;top:30px;width:116px;height:99px;border-radius:19px;background:linear-gradient(140deg,#60b6f4,#323456 50%,#8a47c6);box-shadow:inset 0 1px 2px #fff5,0 6px 18px #0004;overflow:hidden;display:grid;place-items:center;border:1px solid #c9b1ff33}
    .cover ha-icon{--mdc-icon-size:55px;color:#bbacffbb;filter:drop-shadow(0 3px 8px #15123a77)}
    .cover img{width:100%;height:100%;object-fit:cover;position:absolute;inset:0}
    .cover img[hidden]{display:none}
    .transport{position:absolute;left:26px;top:88px;display:flex;align-items:center;gap:22px}
    .round{width:44px;height:44px;border-radius:50%}
    .primary{width:55px;height:55px;border-radius:50%;padding:3px;background:linear-gradient(145deg,var(--accent-b),#b68aff 35%,var(--accent-a));box-shadow:0 0 12px #9577ff66}
    .primary:hover:not(:disabled){background:linear-gradient(145deg,#d29bff,#52c6ff)}
    .primary span{width:100%;height:100%;display:grid;place-items:center;border-radius:50%;background:#262b38;box-shadow:inset 0 0 7px #d9c9ff33}
    .primary ha-icon{--mdc-icon-size:31px}
    .bottom{position:absolute;bottom:19px;left:22px;right:20px;height:41px;display:flex;align-items:center;gap:12px}
    .mute{width:37px;height:37px;border-radius:50%;background:transparent;flex:none}
    .volume{flex:1;min-width:45px;margin-right:26px}
    input[type=range]{appearance:none;-webkit-appearance:none;display:block;width:100%;height:7px;border-radius:8px;cursor:pointer;outline-offset:7px;background:#ffffff28}
    input[type=range]::-webkit-slider-thumb{appearance:none;width:19px;height:19px;border-radius:50%;background:#fff;border:0;box-shadow:0 2px 6px #0004}
    input[type=range]::-moz-range-thumb{width:19px;height:19px;border-radius:50%;background:#fff;border:0}
    .volume-step{display:flex;gap:12px;align-items:center}
    .volume-step button{width:44px;height:35px;border-radius:12px}
    .volume-step[hidden],.slider-wrap[hidden]{display:none}
    .tools{display:flex;align-items:center;gap:13px;margin-left:auto}
    .tool{position:relative;width:42px;height:39px;border-radius:13px;background:#ffffff0d}
    .tool select{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;color-scheme:dark}
    .power{position:absolute;right:18px;top:105px;width:30px;height:30px;border-radius:50%;background:#ffffff0d}
    .power ha-icon{--mdc-icon-size:20px}
    .notice{position:absolute;left:24px;top:150px;font-size:11px;color:#bfc7d4;right:165px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
    .error{position:absolute;inset:0;z-index:5;background:#17202df2;display:grid;place-items:center;padding:24px;text-align:center;font-size:13px}
    .error[hidden]{display:none}
    @media(prefers-reduced-motion:reduce){button{transition:none}}
    .more,.mute,.tool,.power,.round{min-width:44px;min-height:44px}.volume-step button{min-height:44px}input[type=range]{height:24px;background-size:100% 7px!important;background-repeat:no-repeat!important;background-position:center!important}
    @media(max-width:480px){.text{left:65px;right:116px;top:22px}.name{font-size:16px}.device{left:20px;width:28px}.cover{right:22px;top:67px;width:82px;height:78px;border-radius:17px}.cover ha-icon{--mdc-icon-size:44px}.transport{left:22px;top:88px;gap:16px}.round{width:38px;height:38px}.primary{width:50px;height:50px}.volume{margin-right:3px}.bottom{left:16px;right:16px;gap:6px}.tools{gap:7px}.tool{width:36px}.notice{left:22px;top:148px;right:112px;font-size:10px}.power{top:18px;right:49px;width:27px;height:27px}.more{right:10px;top:14px}.text{right:95px}.cover{top:72px}}
    .more,.mute,.tool,.power,.round{min-width:44px;min-height:44px}.bottom{bottom:14px;height:44px}.power{right:52px;top:8px}.more{right:8px;top:8px}@media(max-width:360px){.transport{left:16px;gap:10px}.cover{right:16px;width:70px}.text{left:60px;right:103px}.notice{left:16px;right:95px}}
    </style>
    <ha-card>
      <div class="blur"></div><div class="veil"></div>
      <ha-icon class="device"></ha-icon>
      <div class="text"><div class="name"></div><div class="subtitle"></div></div>
      <button class="more" aria-label="Informazioni dispositivo" title="Informazioni dispositivo"><ha-icon icon="mdi:dots-vertical"></ha-icon></button>
      <div class="cover"><ha-icon icon="mdi:music-note"></ha-icon><img hidden alt="Copertina multimediale"></div>
      <div class="transport">
        <button class="round prev" aria-label="Precedente" title="Precedente"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
        <button class="primary play" aria-label="Riproduci o pausa" title="Riproduci o pausa"><span><ha-icon icon="mdi:play"></ha-icon></span></button>
        <button class="round next" aria-label="Successivo" title="Successivo"><ha-icon icon="mdi:skip-next"></ha-icon></button>
      </div>
      <button class="power" aria-label="Accensione" title="Accensione"><ha-icon icon="mdi:power"></ha-icon></button>
      <div class="notice"></div>
      <div class="bottom">
        <button class="mute" aria-label="Attiva o disattiva audio" title="Audio"><ha-icon icon="mdi:volume-high"></ha-icon></button>
        <div class="volume"><div class="slider-wrap"><input type="range" min="0" max="100" step="1" aria-label="Volume"></div><div class="volume-step" hidden><button class="minus" aria-label="Diminuisci volume"><ha-icon icon="mdi:minus"></ha-icon></button><button class="plus" aria-label="Aumenta volume"><ha-icon icon="mdi:plus"></ha-icon></button></div></div>
        <div class="tools"><button class="tool sources" aria-label="Sorgenti e app" title="Sorgenti e app"><ha-icon icon="mdi:play-box-multiple-outline"></ha-icon><select aria-label="Seleziona sorgente" hidden></select></button><button class="tool remote" aria-label="Apri telecomando completo" title="Telecomando completo"><ha-icon icon="mdi:remote-tv"></ha-icon></button></div>
      </div>
      <div class="error" hidden role="alert"></div>
    </ha-card>`;
    const q=s=>this.shadowRoot.querySelector(s);
    q('.more').onclick=()=>this._more();
    q('.remote').onclick=()=>this._navigate();
    q('.cover').onclick=()=>this._navigate();
    q('.sources').onclick=e=>{if(e.target.tagName!=='SELECT' && !this._sources?.length) this._more();};
    q('select').onchange=e=>{if(e.target.value) this._call('media_player','select_source',{source:e.target.value});};
    q('.prev').onclick=()=>this._call('media_player','media_previous_track');
    q('.next').onclick=()=>this._call('media_player','media_next_track');
    q('.play').onclick=()=>this._call('media_player',this._state?.state==='playing'?'media_pause':'media_play');
    q('.mute').onclick=()=>this._config.volume_remote?this._remoteKey('MUTE'):this._call('media_player','volume_mute',{is_volume_muted:!this._state?.attributes.is_volume_muted});
    q('.minus').onclick=()=>this._config.volume_remote?this._remoteKey('VOLUME_DOWN'):this._call('media_player','volume_down');
    q('.plus').onclick=()=>this._config.volume_remote?this._remoteKey('VOLUME_UP'):this._call('media_player','volume_up');
    q('input').oninput=e=>this._paintVolume(Number(e.target.value));
    q('input').onchange=e=>this._call('media_player','volume_set',{volume_level:Number(e.target.value)/100});
    q('.power').onclick=()=>{
      if(this._online) this._call('media_player','turn_off');
      else if(this._config.wake_entity) this._call('button','press',{},this._config.wake_entity,true);
      else if(this._features&128) this._call('media_player','turn_on',{},null,true);
    };
    q('img').onerror=()=>{q('img').hidden=true;q('.blur').style.backgroundImage='none';};
  }
  _update() {
    const q=s=>this.shadowRoot.querySelector(s),s=this._hass.states[this._config.entity];
    this._state=s;this._features=Number(s?.attributes.supported_features||0);
    this._online=!!s && !['off','unavailable','unknown'].includes(s.state);
    this.shadowRoot.querySelectorAll('dialog div button').forEach(b=>b.disabled=!this._online||!!this._busy);
    const a=s?.attributes||{},f=this._features;
    q('.name').textContent=this._config.name||a.friendly_name||this._config.entity; q('.name').title=q('.name').textContent;
    q('.device').setAttribute('icon',this._config.icon||'mdi:speaker');
    const stateNames={off:'Spento',unavailable:'Non raggiungibile',unknown:'Stato non disponibile',paused:'In pausa',idle:'Pronto',on:'Acceso',playing:'In riproduzione'};
    q('.subtitle').textContent=this._online?(a.media_title||a.source||this._config.subtitle||stateNames[s.state]):(stateNames[s?.state]||'Non disponibile');
    q('.notice').textContent=this._online?(this._config.subtitle||''):(!this._config.wake_entity && !(f&128)?'Accensione non configurata':'');
    q('.play ha-icon').setAttribute('icon',s?.state==='playing'?'mdi:pause':'mdi:play');
    q('.play').setAttribute('aria-label',s?.state==='playing'?'Pausa':'Riproduci');
    q('.play').disabled=!this._online||!(f&(s?.state==='playing'?1:16384));
    q('.prev').disabled=!this._online||!(f&16);q('.next').disabled=!this._online||!(f&32);
    q('.mute').disabled=!this._online||(!this._config.volume_remote&&!(f&8));
    q('.mute ha-icon').setAttribute('icon',a.is_volume_muted?'mdi:volume-off':'mdi:volume-high');
    const slider=!!(f&4)&&Number.isFinite(a.volume_level);
    q('.slider-wrap').hidden=!slider;q('.volume-step').hidden=slider;
    q('input').disabled=!this._online;
    q('.minus').disabled=q('.plus').disabled=!this._online||(!this._config.volume_remote&&!(f&(4|1024)));
    if(slider&&this.shadowRoot.activeElement!==q('input')){q('input').value=Math.round(a.volume_level*100);this._paintVolume(Number(q('input').value));}
    const canPower=this._config.show_power!==false && (!!this._config.wake_entity||!!(f&(128|256)));
    q('.power').hidden=!canPower;q('.power').disabled=this._online?!(f&256):(!this._config.wake_entity&&!(f&128));
    q('.power').title=this._online?'Spegni':'Accendi';
    const sources=Array.isArray(a.source_list)?a.source_list.filter(x=>typeof x==='string'):[];
    if(JSON.stringify(this._sources)!==JSON.stringify(sources)){
      this._sources=sources;const select=q('select');select.replaceChildren();
      const empty=document.createElement('option');empty.value='';empty.textContent='Sorgenti e app';select.append(empty);
      for(const source of sources){const opt=document.createElement('option');opt.value=source;opt.textContent=source;select.append(opt);}
    }
    q('select').hidden=!sources.length||!(f&2048);q('select').disabled=!this._online;if(this.shadowRoot.activeElement!==q('select'))q('select').value=a.source||'';
    q('.sources').disabled=!this._online;
    const remoteAvailable=!!this._config.remote_path || (this._config.remote_type==='webostv' && !!this._hass.services?.webostv?.button);
    q('.remote').title=remoteAvailable?'Telecomando completo':'Dettagli dispositivo'; q('.remote').setAttribute('aria-label',q('.remote').title);
    q('.remote ha-icon').setAttribute('icon',remoteAvailable?'mdi:remote-tv':'mdi:information-outline');
    const picture=typeof a.entity_picture==='string'&&a.entity_picture.startsWith('/')&&!a.entity_picture.startsWith('//')?a.entity_picture:'';
    if(picture!==this._picture){this._picture=picture;q('img').hidden=!picture;if(picture){q('img').src=picture;q('.blur').style.backgroundImage=`url(${JSON.stringify(picture)})`;}else{q('img').removeAttribute('src');q('.blur').style.backgroundImage='none';}}
  }
  _paintVolume(value){const pct=Math.max(0,Math.min(100,value));const input=this.shadowRoot.querySelector('input');input.style.background=`linear-gradient(90deg,#39adff 0%,#9b83ff ${pct/2}%,#bd65f3 ${pct}%,#ffffff28 ${pct}%,#ffffff28 100%)`;input.setAttribute('aria-valuetext',`${pct}%`);}
  _more(){this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:this._config.entity},bubbles:true,composed:true}));}
  _navigate(){
    if(!this._config.remote_path && this._config.remote_type==='webostv' && this._hass.services?.webostv?.button)return this._showRemote();
    const path=this._config.remote_path;
    // Optional explicit local dashboard route; never infer a device remote.
    if(typeof path==='string' && /^\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_/-]+$/.test(path)){
      history.pushState(null,'',path);window.dispatchEvent(new Event('location-changed'));
    }else this._more();
  }
  _showRemote(){
    if(this.shadowRoot.querySelector('dialog'))return;
    const dialog=document.createElement('dialog');
    dialog.setAttribute('aria-label','Telecomando LG');
    dialog.style.cssText='border:1px solid #9b83ff;border-radius:25px;background:#18222b;color:#f5f7fc;padding:20px;width:min(340px,calc(100vw - 24px));max-height:85vh;overflow:auto';
    const heading=document.createElement('h2');heading.textContent='Telecomando LG';dialog.append(heading);
    const state=document.createElement('p');state.textContent=this._online?'Navigazione TV':'TV spenta o non disponibile';dialog.append(state);
    const close=document.createElement('button');close.textContent='Chiudi';close.style.cssText='min-height:44px;width:100%;border-radius:12px;margin-bottom:12px';close.onclick=()=>dialog.close();dialog.append(close);
    const keys=[['HOME','Home'],['UP','Su'],['MENU','Menu'],['LEFT','Sinistra'],['ENTER','OK'],['RIGHT','Destra'],['BACK','Indietro'],['DOWN','Giù'],['EXIT','Esci'],['VOLUMEDOWN','Volume −'],['MUTE','Muto'],['VOLUMEUP','Volume +'],['CHANNELDOWN','Canale −'],['GUIDE','Guida TV'],['CHANNELUP','Canale +']];
    const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:10px';dialog.append(grid);
    const error=document.createElement('p');error.setAttribute('role','status');
    for(const [key,label] of keys){
      const button=document.createElement('button');button.textContent=label;button.style.cssText='min-height:48px;border-radius:12px;padding:6px';button.disabled=!this._online;
      button.onclick=async()=>{
        if(!this._online || this._busy || !this._hass.services?.webostv?.button)return;
        this._busy=true;grid.querySelectorAll('button').forEach(b=>b.disabled=true);error.textContent='';
        try{await this._hass.callService('webostv','button',{entity_id:this._config.entity,button:key});}
        catch(e){error.textContent='Comando non riuscito. Verifica la connessione della TV.';}
        finally{this._busy=false;grid.querySelectorAll('button').forEach(b=>b.disabled=!this._online);}
      };grid.append(button);
    }
    dialog.append(error);dialog.addEventListener('close',()=>{dialog.remove();this.shadowRoot.querySelector('.remote')?.focus();},{once:true});
    this.shadowRoot.append(dialog);dialog.showModal();close.focus();
  }
  _remoteKey(command){return this._call('remote','send_command',{command},this._config.volume_remote);}
  async _call(domain,service,data={},entity=null,allowOff=false){
    if(this._busy||!this._hass||(!this._online&&!allowOff))return;
    this._busy=true; this.setAttribute('aria-busy','true');
    try{await this._hass.callService(domain,service,{...data,entity_id:entity||this._config.entity});}
    catch(e){const error=this.shadowRoot.querySelector('.error');error.textContent='Comando non riuscito. Verifica la connessione del dispositivo.';error.hidden=false;error.onclick=()=>{error.hidden=true;};}
    finally{this._busy=false;this.removeAttribute('aria-busy');}
  }
}
if(!customElements.get('cl-control-media-card'))customElements.define('cl-control-media-card',CLControlMediaCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(x=>x.type==='cl-control-media-card'))window.customCards.push({type:'cl-control-media-card',name:'CL Glass Media',description:'Widget multimediale scuro con copertina, riproduzione, volume e telecomando.'});
