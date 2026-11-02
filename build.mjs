// 학습 앱의 공개 파일만 골라 배포 폴더에 복사합니다.
import { mkdir, copyFile, rm, cp } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of ['index.html','style.css','app.js','dashboard.js','content.js','learning-data.js','vocabulary-extra.js','learning.js','translations.js','audio-manifest.js','native-audio.js','voice-worker.js','AUDIO_LICENSE.txt','icon.svg','manifest.webmanifest','.nojekyll']) {
  await copyFile(file, `dist/${file}`);
}
console.log('영어하루 배포 파일 생성 완료');

await cp('audio','dist/audio',{recursive:true});
