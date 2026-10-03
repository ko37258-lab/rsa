const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1920,height:1080}});
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('file://'+__dirname+'/overlay.html');await p.evaluate(()=>document.fonts.ready);
const out=process.argv[2];for(const t of process.argv.slice(3).map(Number)){await p.evaluate(t=>frame(t),t);await p.screenshot({path:`${out}/o_${t.toFixed(1).padStart(5,'0')}.png`,omitBackground:true});}
await b.close()})();
