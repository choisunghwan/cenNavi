// Each exported function is injected independently; only page-local state is shared.
function showVerifiedTargets(ids, labels, snapshot, targets) {
  const old=document.getElementById('__guide_overlay');old?.__stop?.();old?.remove();
  const state=window.__guideState;
  if(!state||state.snapshot!==snapshot||window.__guideSnapshot!==snapshot)return {shown:0,reason:'stale',ids:[]};
  const accepted=(ids||[]).slice(0,2).map((id,i)=>({id,target:targets?.[i],label:labels?.[i]})).filter(x=>state.resolve(x.id,x.target).ok);
  if(!accepted.length)return {shown:0,reason:'unverified',ids:[]};
  const root=document.createElement('div');root.id='__guide_overlay';
  root.style.cssText='all:initial!important;position:fixed!important;inset:0!important;width:0!important;height:0!important;overflow:visible!important;pointer-events:none!important;z-index:2147483646!important;';
  const shadow=root.attachShadow({mode:'open'});
  shadow.innerHTML='<style>.guide-box{position:fixed;box-sizing:border-box;border:2px solid #e99a23;border-radius:6px;box-shadow:0 0 0 3px #f59e0b22;pointer-events:none}.guide-caption{position:absolute;left:0;max-width:210px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:3px 7px;border-radius:5px;background:#ffeed0;color:#684114;font:600 11px/1.5 system-ui}</style>';
  const boxes=accepted.map(item=>{const box=document.createElement('div');box.className='guide-box';const text=document.createElement('span');text.className='guide-caption';text.textContent=item.label||item.target;box.appendChild(text);shadow.appendChild(box);return {...item,box,text};});
  document.documentElement.appendChild(root);let raf,timer;
  const dispose=()=>{cancelAnimationFrame(raf);clearTimeout(timer);removeEventListener('click',clicked,true);root.remove();};
  const clicked=e=>{if(boxes.some(x=>state.resolve(x.id,x.target).element?.contains(e.target)))dispose();};
  const update=()=>{
    let count=0;
    for(const item of boxes){const found=state.resolve(item.id,item.target);item.box.hidden=!found.ok;if(!found.ok)continue;count++;const r=found.rect;Object.assign(item.box.style,{left:(r.left-4)+'px',top:(r.top-4)+'px',width:(r.width+8)+'px',height:(r.height+8)+'px'});item.text.style.top=r.top>34?'-28px':(r.height+10)+'px';}
    if(!count){dispose();return;}raf=requestAnimationFrame(update);
  };
  root.__stop=dispose;addEventListener('click',clicked,true);timer=setTimeout(dispose,20000);update();
  return {shown:accepted.length,ids:accepted.map(x=>x.id),focused:false};
}

function startControlOverlay(snapshot, token) {
  if(!token||snapshot!==window.__guideSnapshot||window.__guideState?.snapshot!==snapshot)return {ok:false,reason:'stale'};
  if(window.__cenNaviControl&&!window.__cenNaviControl.cancelled)return {ok:false,reason:'busy'};
  const guide=document.getElementById('__guide_overlay');guide?.__stop?.();guide?.remove();
  const root=document.createElement('div');root.id='__cennavi_control';root.dataset.phase='starting';
  root.style.cssText='all:initial!important;display:block!important;position:fixed!important;inset:0!important;margin:0!important;padding:0!important;border:0!important;width:100vw!important;height:100vh!important;background:transparent!important;pointer-events:none!important;overflow:visible!important;z-index:2147483647!important;';
  const shadow=root.attachShadow({mode:'open'});
  shadow.innerHTML=`<style>
    *{box-sizing:border-box}.control-frame{position:fixed;inset:2px;border:2px solid #f5a12d;border-radius:10px;box-shadow:inset 0 0 20px #ff9b264d,0 0 12px #ff9b2666;pointer-events:none;animation:glow 1.8s ease-in-out infinite}
    @keyframes glow{50%{box-shadow:inset 0 0 28px #ff9b2670,0 0 15px #ff9b2690}}
    .control-status{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:12px;max-width:calc(100vw - 30px);padding:7px 8px 7px 13px;border:1px solid #ffb457;border-radius:12px;background:#fff7eb;color:#743b0a;box-shadow:0 3px 18px #50300025;font:12px/1.5 system-ui;pointer-events:none}
    button{pointer-events:auto;cursor:pointer;border:1px solid #d6a364;border-radius:7px;background:#fff;color:#743b0a;font:600 12px system-ui;padding:6px 11px;white-space:nowrap}button:focus-visible{outline:2px solid #743b0a;outline-offset:2px}
    .control-cursor{position:fixed;left:0;top:0;pointer-events:none;filter:drop-shadow(0 2px 3px #0006);will-change:transform}.control-cursor[hidden]{display:none}.control-cursor span{position:absolute;left:23px;top:23px;border-radius:6px;padding:3px 7px;background:#a8510b;color:white;font:600 11px/1.5 system-ui;white-space:nowrap}
    .control-target{position:fixed;border:2px solid #ed9c2b;border-radius:6px;box-shadow:0 0 0 4px #f59e0b25;pointer-events:none}.control-target[hidden]{display:none}.control-ripple{position:fixed;width:24px;height:24px;border:2px solid #d87909;border-radius:50%;pointer-events:none}
    @media(prefers-reduced-motion:reduce){.control-frame{animation:none}}
  </style><div class="control-frame"></div><div class="control-target" hidden></div><div class="control-cursor" hidden><svg width="30" height="34" viewBox="0 0 30 34" aria-hidden="true"><path d="M3 2v25l7-7 5 11 5-2-5-11 10-1Z" fill="#20252d" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg><span>CenNavi</span></div><div class="control-status" role="status"><span>CenNavi 실행 중 · Esc로 중지</span><button type="button" aria-label="CenNavi 실행 중지">중지</button></div>`;
  document.documentElement.appendChild(root);
  if(root.showPopover){try{root.popover='manual';root.showPopover();}catch{/* fixed overlay remains available */}}
  const cursor=shadow.querySelector('.control-cursor'),targetBox=shadow.querySelector('.control-target');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer,animation,observer,disposed=false,position={x:Math.max(24,innerWidth-100),y:80};
  const dispose=()=>{if(disposed)return;disposed=true;clearTimeout(timer);observer?.disconnect();animation?.cancel();removeEventListener('keydown',key,true);if(root.hidePopover){try{root.hidePopover();}catch{}}root.remove();if(window.__cenNaviControl?.token===token)delete window.__cenNaviControl;};
  const cancel=()=>{control.cancelled=true;dispose();};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}};
  const control={token,snapshot,cancelled:false,dispose,
    async moveTo(found){
      if(control.cancelled||disposed)return;
      const {x,y,rect}=found;cursor.hidden=false;targetBox.hidden=false;
      Object.assign(targetBox.style,{left:(rect.left-4)+'px',top:(rect.top-4)+'px',width:(rect.width+8)+'px',height:(rect.height+8)+'px'});
      const from=`translate3d(${position.x-3}px,${position.y-2}px,0)`,to=`translate3d(${x-3}px,${y-2}px,0)`;
      root.dataset.phase='moving';cursor.style.transform=to;
      animation=cursor.animate([{transform:from},{transform:to}],{duration:reduced?0:380,easing:'cubic-bezier(.2,.7,.3,1)'});
      await animation.finished.catch(()=>{});position={x,y};root.dataset.phase='pointing';
    },
    async press(found){
      if(control.cancelled||disposed)return;
      root.dataset.phase='pressing';const ring=document.createElement('div');ring.className='control-ripple';ring.style.left=(found.x-12)+'px';ring.style.top=(found.y-12)+'px';shadow.appendChild(ring);
      animation=ring.animate([{transform:'scale(.5)',opacity:1},{transform:'scale(2.2)',opacity:0}],{duration:reduced?0:240});
      await animation.finished.catch(()=>{});ring.remove();
    }
  };
  window.__cenNaviControl=control;shadow.querySelector('button').onclick=cancel;addEventListener('keydown',key,true);
  observer=new MutationObserver(()=>{if(!root.isConnected)cancel();});observer.observe(document,{childList:true,subtree:true});
  timer=setTimeout(cancel,9000);return {ok:true};
}

function stopControlOverlay(token) {
  const control=window.__cenNaviControl;
  if(!control||control.token!==token)return {stopped:false};
  control.cancelled=true;control.dispose();return {stopped:true};
}
