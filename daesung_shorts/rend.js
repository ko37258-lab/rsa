const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright');
const {spawn}=require('child_process');const [a,b,out]=[+process.argv[2],+process.argv[3],process.argv[4]];
(async()=>{const br=await chromium.launch();const p=await br.newPage({viewport:{width:1080,height:1920}});
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('file://'+__dirname+'/index.html?render');await p.evaluate(()=>document.fonts.ready);
const ff=spawn('ffmpeg',['-loglevel','error','-y','-f','image2pipe','-framerate','30','-c:v','mjpeg','-i','-','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p',out]);
for(let f=a;f<b;f++){await p.evaluate(t=>frame(t),f/30);const buf=await p.screenshot({type:'jpeg',quality:92});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));}
ff.stdin.end();await new Promise(r=>ff.on('close',r));await br.close();console.log('done',out)})();
