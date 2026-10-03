// usage: node rend.js startFrame endFrame out.mp4
const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright');
const {spawn}=require('child_process');
const FPS=30000/1001;const [a,b,out]=[+process.argv[2],+process.argv[3],process.argv[4]];
const T0=a/FPS;
const Z=`if(between(t+${T0},16,42.4),1+0.06*min(1,(t+${T0}-16)/26),1)`;
const vf=`[0:v]scale=1920:1080:flags=lanczos,boxblur=22:2:enable='lt(t+${T0},15.85)',crop=w='trunc(iw/(${Z})/2)*2':h='trunc(ih/(${Z})/2)*2':x='(iw-ow)/2':y='(ih-oh)/2',scale=1920:1080:flags=lanczos,eq=contrast=1.05:saturation=1.12:gamma=1.02,unsharp=5:5:0.6,setsar=1[bg];[1:v]format=rgba[ov];[bg][ov]overlay=0:0:format=auto,format=yuv420p[v]`;
(async()=>{const br=await chromium.launch();const p=await br.newPage({viewport:{width:1920,height:1080}});
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('file://'+__dirname+'/overlay.html');await p.evaluate(()=>document.fonts.ready);
const ff=spawn('ffmpeg',['-loglevel','error','-y','-ss',T0.toFixed(5),'-i','original.mp4','-f','image2pipe','-framerate','30000/1001','-c:v','png','-i','-','-filter_complex',vf,'-map','[v]','-frames:v',''+(b-a),'-an','-c:v','libx264','-preset','medium','-crf','19',out],{cwd:__dirname});
ff.stderr.on('data',d=>process.stderr.write(d));
for(let f=a;f<b;f++){await p.evaluate(t=>frame(t),f/FPS);const buf=await p.screenshot({type:'png',omitBackground:true});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));}
ff.stdin.end();await new Promise(r=>ff.on('close',r));await br.close();console.log('done',out)})();
