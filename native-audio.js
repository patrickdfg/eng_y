// 기본 자료는 MP3, 직접 입력한 문장은 기기 안에서 같은 미국식 AI 음성으로 생성합니다.
'use strict';
let nativePlayer=null;
let nativeWorker=null;
let nativeRequest=0;
let nativePending=null;
const nativeClips=new Map();
function voiceStatus(message){const box=document.querySelector('#voiceStatus');if(!box)return;box.hidden=!message;document.querySelector('#voiceMessage').textContent=message;}
function stopNativeAudio(){
 nativeRequest++;nativePending=null;
 if(nativePlayer){nativePlayer.onended=null;nativePlayer.onerror=null;nativePlayer.pause();nativePlayer.removeAttribute('src');nativePlayer.load();}
 nativeWorker?.postMessage({type:'cancel',id:nativeRequest});voiceStatus('');
}
function playNativeClip(url,rate,onEnd,request){
 if(request!==nativeRequest)return;
 nativePlayer||=new Audio();const player=nativePlayer;
 player.src=url;player.playbackRate=rate;player.preservesPitch=true;
 player.onended=()=>{if(request===nativeRequest){voiceStatus('');onEnd?.();}};
 player.onerror=()=>{if(request===nativeRequest)voiceStatus('음성을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 눌러 주세요.');};
 voiceStatus('미국식 영어 · AI 음성 재생 중');
 player.play().catch(e=>{if(request===nativeRequest&&e.name!=='AbortError')voiceStatus('재생을 시작하려면 듣기 버튼을 다시 눌러 주세요.');});
}
function speakNative(text,rate,onEnd){
 stopNativeAudio();const request=nativeRequest;
 const clip=window.NATIVE_AUDIO?.[text]||nativeClips.get(text);
 if(clip){playNativeClip(clip,rate,onEnd,request);return;}
 // 클릭 시 미디어 요소를 준비해 휴대폰에서도 생성 후 재생할 수 있게 합니다.
 nativePlayer||=new Audio();nativePlayer.src='data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQIAAAAAAA==';nativePlayer.play().catch(()=>{});
 voiceStatus('미국식 영어 음성 준비 중 · 처음에는 약 90MB를 내려받아요. 본문은 전송하지 않아요.');
 nativePending={request,text,rate,onEnd};
 if(!nativeWorker){
  nativeWorker=new Worker('voice-worker.js?v=2542a2b433a7',{type:'module'});
  nativeWorker.onmessage=({data})=>{
   const pending=nativePending;if(!pending||data.id!==pending.request)return;
   if(data.type==='progress'){voiceStatus('미국식 영어 음성 준비 중 · '+data.message);return;}
   if(data.type==='error'){voiceStatus('음성을 준비하지 못했어요. 인터넷 연결과 브라우저를 확인한 뒤 다시 눌러 주세요.');nativePending=null;return;}
   if(data.type==='audio'){
    const url=URL.createObjectURL(data.blob);nativeClips.set(pending.text,url);
    if(nativeClips.size>30){const first=nativeClips.keys().next().value;URL.revokeObjectURL(nativeClips.get(first));nativeClips.delete(first);}
    nativePending=null;playNativeClip(url,pending.rate,pending.onEnd,pending.request);
   }
  };
  nativeWorker.onerror=()=>{nativeWorker.terminate();nativeWorker=null;if(nativePending){nativePending=null;voiceStatus('이 브라우저에서 음성을 준비하지 못했어요. 최신 브라우저에서 다시 시도해 주세요.');}};
 }
 nativeWorker.postMessage({type:'speak',id:request,text});
}
