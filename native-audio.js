// 등록된 MP3를 재생하고 MP3가 없는 교과서 문장은 기기의 영어 음성으로 읽습니다.
'use strict';
let nativePlayer=null;
let nativeRequest=0;
let nativeUtterance=null;
function voiceStatus(message){const box=document.querySelector('#voiceStatus');if(!box)return;box.hidden=!message;document.querySelector('#voiceMessage').textContent=message;}
function stopNativeAudio(){
 nativeRequest++;
 if(nativePlayer){nativePlayer.onended=null;nativePlayer.onerror=null;nativePlayer.pause();nativePlayer.removeAttribute('src');nativePlayer.load();}
 if(window.speechSynthesis)window.speechSynthesis.cancel();
 nativeUtterance=null;
 voiceStatus('');
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
function speakDeviceEnglish(text,rate,onEnd,request){
 const synth=window.speechSynthesis;
 if(!synth||!window.SpeechSynthesisUtterance){voiceStatus('이 브라우저는 기기 영어 음성 읽기를 지원하지 않습니다.');return;}
 const utterance=new window.SpeechSynthesisUtterance(text);
 const voices=synth.getVoices();
 const voice=voices.find(v=>v.lang.toLowerCase()==='en-us'&&v.localService)
  ||voices.find(v=>v.lang.toLowerCase()==='en-us')
  ||voices.find(v=>v.lang.toLowerCase().startsWith('en'));
 if(voice)utterance.voice=voice;
 utterance.lang=voice?.lang||'en-US';
 utterance.rate=rate;
 utterance.onend=()=>{if(request===nativeRequest){nativeUtterance=null;voiceStatus('');onEnd?.();}};
 utterance.onerror=()=>{if(request===nativeRequest){nativeUtterance=null;voiceStatus('기기 영어 음성이 재생되지 않았어요. 영어 음성 설정을 확인하고 다시 눌러 주세요.');}};
 nativeUtterance=utterance;
 voiceStatus('기기의 영어 음성 재생 중');
 synth.speak(utterance);
}
function speakNative(text,rate,onEnd){
 stopNativeAudio();const request=nativeRequest;
 const clip=window.NATIVE_AUDIO?.[text];
 if(clip){playNativeClip(clip,rate,onEnd,request);return;}
 speakDeviceEnglish(text,rate,onEnd,request);
}
