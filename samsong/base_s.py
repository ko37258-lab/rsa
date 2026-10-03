"""Cut highlight segments from original.mp4 and lay them out 9:16 (blurred fill + full-width video)."""
import subprocess
SEGS=[[30.45,38.15],[43.3,56.98],[57.6,72.45],[120.5,126.85],[195.8,212.1],[227.6,231.95],[256.85,260.35]]
fc=''
for i,(a,b) in enumerate(SEGS):
    d=b-a
    fc+=f'[0:v]trim={a}:{b},setpts=PTS-STARTPTS[v{i}];[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st={d-.04:.3f}:d=0.04[a{i}];'
fc+=''.join(f'[v{i}][a{i}]' for i in range(len(SEGS)))+f'concat=n={len(SEGS)}:v=1:a=1[cv][ca];'
fc+=('[cv]fps=30000/1001,tpad=stop_mode=clone:stop_duration=1.8,eq=contrast=1.05:saturation=1.12:gamma=1.02,split[x][y];'
     '[x]scale=-2:1920,crop=1080:1920,boxblur=30:3,eq=brightness=-0.12[bg];'
     '[y]scale=1080:608:flags=lanczos,unsharp=5:5:0.7[fg];[bg][fg]overlay=0:600,format=yuv420p,setsar=1[v];[ca]apad=pad_dur=1.8[a]')
subprocess.run(['ffmpeg','-loglevel','error','-y','-i','original.mp4','-filter_complex',fc,'-map','[v]','-map','[a]','-c:v','libx264','-crf','14','-preset','fast','-c:a','pcm_s16le','-ar','48000','base_s.mkv'],check=True)
