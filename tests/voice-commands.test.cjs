const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const ctx=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('shared/speech.js','utf8'),ctx);
test('standalone Korean voice commands and Enter aliases are recognized',()=>{
 for(const text of ['메시지 전송','메시지 전송.','엔터','엔터키','엔터 키'])assert.equal(ctx.window.EnvSpeech.command(text),'send');
 for(const [text,cmd] of [['입력 지우기','clear'],['읽기 중지','stopReading'],['실행 확인','confirm'],['실행 취소','cancelPlan'],['결과 확인','next'],['음성 입력 중지','stopMic']])assert.equal(ctx.window.EnvSpeech.command(text),cmd);
});
test('dictated sentences never trigger embedded or ambiguous commands',()=>{
 for(const text of ['메시지 전송 방법 알려줘','엔터키가 안 돼','실행 확인이라는 글을 입력해줘','실행해','전송','이 페이지 요약해줘 메시지 전송',''])assert.equal(ctx.window.EnvSpeech.command(text),null);
});
