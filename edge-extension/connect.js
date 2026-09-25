// Pair only with this app on its dedicated loopback port. No profile data is requested.
if(location.origin==='http://127.0.0.1:4318'){
 (async()=>{try{
  const r=await fetch('/api/edge/bootstrap');if(!r.ok)return;const {token}=await r.json();
  const paired=await fetch('/api/edge/pair',{method:'POST',headers:{'Content-Type':'application/json','X-Career-Token':token},body:JSON.stringify({extensionId:chrome.runtime.id})});
  if(paired.ok)await chrome.runtime.sendMessage({type:'connect',...(await paired.json())});
 }catch{}})();
}
