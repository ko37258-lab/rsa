// usage: node rend_s.js startFrame endFrame out.mp4  (base_s.mkv + overlay_s.html)
const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright');
const {spawn}=require('child_process');
const FPS=30000/1001;const [a,b,out]=[+process.argv[2],+process.argv[3],process.argv[4]];
(async()=>{const br=await chromium.launch();const p=await br.newPage({viewport:{width:1080,height:1920}});
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('file://'+__dirname+'/overlay_s.html');await p.evaluate(()=>document.fonts.ready);
const ff=spawn('ffmpeg',['-loglevel','error','-y','-ss',(a/FPS).toFixed(5),'-i','base_s.mkv','-f','image2pipe','-framerate','30000/1001','-c:v','png','-i','-','-filter_complex','[1:v]format=rgba[ov];[0:v][ov]overlay=0:0:format=auto,format=yuv420p[v]','-map','[v]','-frames:v',''+(b-a),'-an','-c:v','libx264','-preset','medium','-crf','19',out],{cwd:__dirname});
ff.stderr.on('data',d=>process.stderr.write(d));
for(let f=a;f<b;f++){await p.evaluate(t=>frame(t),f/FPS);const buf=await p.screenshot({type:'png',omitBackground:true});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));}
ff.stdin.end();await new Promise(r=>ff.on('close',r));await br.close();console.log('done',out)})();
