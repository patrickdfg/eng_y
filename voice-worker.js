// 입력 문장은 서버로 보내지 않고 이 작업 스레드에서 처리합니다.
let engine;
let latest=0;
let queue=Promise.resolve();
self.onmessage=({data})=>{
 latest=data.id;if(data.type!=='speak')return;
 queue=queue.then(async()=>{
  if(data.id!==latest)return;
  try{
   if(!engine){engine=import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js').then(async({KokoroTTS,TextSplitterStream})=>({tts:await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8',device:'wasm'}),TextSplitterStream}));}
   const {tts,TextSplitterStream}=await engine;if(data.id!==latest)return;
   self.postMessage({type:'progress',id:data.id,message:'문장을 읽을 준비를 하고 있어요.'});
   const chunks=[];let length=0;
   const sentences=new TextSplitterStream();sentences.push(data.text);sentences.close();
   for await(const {audio} of tts.stream(sentences,{voice:'af_heart',speed:1})){if(data.id!==latest)return;chunks.push(audio.audio);length+=audio.audio.length;}
   const buffer=new ArrayBuffer(44+length*2);const view=new DataView(buffer);
   const label=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
   label(0,'RIFF');view.setUint32(4,36+length*2,true);label(8,'WAVE');label(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,24000,true);view.setUint32(28,48000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);label(36,'data');view.setUint32(40,length*2,true);
   let offset=44;for(const chunk of chunks)for(const sample of chunk){view.setInt16(offset,Math.max(-1,Math.min(1,sample))*32767,true);offset+=2;}
   self.postMessage({type:'audio',id:data.id,blob:new Blob([buffer],{type:'audio/wav'})});
  }catch(error){engine=null;if(data.id===latest)self.postMessage({type:'error',id:data.id});}
 });
};
