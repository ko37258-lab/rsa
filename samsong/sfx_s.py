"""SFX for the 9:16 Short, mixed onto the cut original audio -> audio_s.wav"""
import numpy as np, wave, subprocess
SEGS=[[30.45,38.15],[43.3,56.98],[57.6,72.45],[120.5,126.85],[195.8,212.1],[227.6,231.95],[256.85,260.35]]
ST=list(np.cumsum([0]+[b-a for a,b in SEGS])[:-1]);VEND=sum(b-a for a,b in SEGS)
def M(o):
    for s,(a,b) in zip(ST,SEGS):
        if a-.01<=o<=b+.01: return s+o-a
SR=48000
subprocess.run(['ffmpeg','-loglevel','error','-y','-i','base_s.mkv','-vn','-ac','2','-ar','48000','base_s.wav'],check=True)
w=wave.open('base_s.wav');v=np.frombuffer(w.readframes(w.getnframes()),'<i2').astype(np.float32).reshape(-1,2)/32767
N=len(v);rs=np.random.RandomState(9);sfx=np.zeros(N)
def add(t,s,g=1):
    i=int(t*SR);j=min(N,i+len(s))
    if 0<=i<N: sfx[i:j]+=s[:j-i]*g
def whoosh(t,d=.5,g=.35):
    n=int(d*SR);x=rs.randn(n);o=np.zeros(n);lp=0;a=np.linspace(.02,.3,n)
    for q in range(n): lp+=a[q]*(x[q]-lp);o[q]=lp
    add(t-d/2,o*np.sin(np.pi*np.arange(n)/n)**2,g)
def impact(t,g=.45):
    n=int(.7*SR);ti=np.arange(n)/SR
    add(t,(np.sin(2*np.pi*(40*ti+6*(1-np.exp(-ti*10))))*np.exp(-ti*5)+rs.randn(n)*np.exp(-ti*35)*.3),g)
    add(t+.04,(np.sin(2*np.pi*2637*ti)+np.sin(2*np.pi*3951*ti))*np.exp(-ti*6)*.05)
def pop(t,g=.15,f=850):
    n=int(.1*SR);tp=np.arange(n)/SR;add(t,np.sin(2*np.pi*(f*tp-f*2.5*tp*tp))*np.exp(-tp*38),g)
def ding(t,g=.14):
    n=int(1.0*SR);tp=np.arange(n)/SR;add(t,(np.sin(2*np.pi*1568*tp)+.5*np.sin(2*np.pi*2349*tp))*np.exp(-tp*4),g)
def ticks(a,b,g=.06):
    t=a
    while t<b: pop(t,g,1500); t+=0.06+0.12*((t-a)/(b-a))
impact(.25,.4)
for s in ST[1:]: whoosh(s)
impact(M(35.0));ticks(M(47.8),M(49.9));ding(M(49.9),.2);impact(M(51.25),.4)
for o in (57.8,63.4,120.6,121.7,123.4,198.1,201.7,203.3,205.3,256.9): pop(M(o))
impact(M(66.3),.35);impact(M(229.7),.4);impact(VEND+.05,.4);pop(VEND+.4,.2,1200)
mix=v+np.clip(sfx,-1,1)[:,None]*.55
o=wave.open('mix_s_raw.wav','wb');o.setnchannels(2);o.setsampwidth(2);o.setframerate(SR);o.writeframes((np.clip(mix,-1,1)*32767).astype('<i2').tobytes());o.close()
subprocess.run(['ffmpeg','-loglevel','error','-y','-i','mix_s_raw.wav','-af','loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.89','-ar','48000','audio_s.wav'],check=True)
print('ok',round(VEND,2),[round(x,2) for x in ST])
