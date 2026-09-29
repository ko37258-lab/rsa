const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1920,height:1080}});
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('file://'+__dirname+'/index.html');await p.evaluate(()=>document.fonts.ready);
const out=process.argv[2];const ts=process.argv.slice(3).map(Number);
for(const t of ts){await p.evaluate(t=>frame(t),t);await p.screenshot({path:`${out}/f_${t.toFixed(1).padStart(6,'0')}.jpg`,type:'jpeg',quality:75});}
await b.close()})();
