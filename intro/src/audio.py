import numpy as np, wave
SR=48000; DUR=49.8; N=int(SR*DUR)
rs=np.random.RandomState(1)
def env(n,a=0.005,r=0.2):
    t=np.arange(n)/SR; return np.minimum(1,t/a)*np.exp(-t/r)
# voice
w=wave.open('voice_cut.wav');v=np.frombuffer(w.readframes(w.getnframes()),'<i2').astype(np.float32)/32767
voice=np.zeros(N,np.float32);voice[:len(v)]=v
# music 120bpm, A minor-ish: Am F C G
bpm=120;beat=60/bpm;mus=np.zeros(N)
def add(buf,sig,t,g=1):
    i=int(t*SR);j=min(len(buf),i+len(sig));
    if i<len(buf): buf[i:j]+=sig[:j-i]*g
kn=int(.35*SR);tk=np.arange(kn)/SR
kick=np.sin(2*np.pi*(45*tk+ (120/25)*(1-np.exp(-tk*25))))*np.exp(-tk*9)
hn=int(.06*SR);hat=np.diff(rs.randn(hn+1))*np.exp(-np.arange(hn)/SR*70)*.3
sn=int(.2*SR);snare=(rs.randn(sn)*.6+np.sin(2*np.pi*190*np.arange(sn)/SR))*np.exp(-np.arange(sn)/SR*18)
roots=[110,87.31,130.81,98]  # A2 F2 C3 G2
chords=[[220,261.63,329.63],[174.61,220,261.63],[261.63,329.63,392],[196,246.94,293.66]]
start=0.0; t=start; bi=0
while t<DUR-1.5:
    bar=int(bi//4)%4
    if not (46.3<t<46.5):
        add(mus,kick,t,.9)
    if bi%2==1: add(mus,snare,t,.35)
    add(mus,hat,t+beat/2,.5); add(mus,hat,t+beat/4,.2); add(mus,hat,t+3*beat/4,.2)
    # bass 8ths
    for k in range(2):
        bn=int(beat/2*SR);tb=np.arange(bn)/SR;f=roots[bar]
        sq=np.sign(np.sin(2*np.pi*f*tb))*.5+np.sin(2*np.pi*f*tb)
        add(mus,sq*np.exp(-tb*6)*.18,t+k*beat/2)
    # pluck arp
    f=chords[bar][bi%3]*2;pn=int(.25*SR);tp=np.arange(pn)/SR
    add(mus,(np.sin(2*np.pi*f*tp)+.3*np.sin(4*np.pi*f*tp))*np.exp(-tp*14)*.08,t+beat/2)
    t+=beat;bi+=1
# pad
tt=np.arange(N)/SR;pad=np.zeros(N)
for b in range(int(DUR/(4*beat))+1):
    ch=chords[b%4];i0=int(b*4*beat*SR);i1=min(N,int((b+1)*4*beat*SR))
    seg=tt[i0:i1]
    for f in ch: pad[i0:i1]+=np.sin(2*np.pi*f*seg)*.03+np.sin(2*np.pi*f*1.003*seg)*.03
    fade=np.minimum(1,np.minimum((seg-seg[0])/.3,(seg[-1]-seg+1e-9)/.3))
    pad[i0:i1]*=fade
mus+=pad
# final chord hit & tail
fin=np.zeros(int(3.5*SR));tf=np.arange(len(fin))/SR
for f in [110,220,261.63,329.63,440]: fin+=np.sin(2*np.pi*f*tf)*np.exp(-tf*1.2)*.12
add(mus,fin,46.46)
# fade in/out
mus*=np.minimum(1,tt/0.4)*np.clip((DUR-tt)/1.2,0,1)
# sidechain duck by voice envelope
e=np.abs(voice);k=int(.12*SR);e=np.convolve(e,np.ones(k)/k,'same');e=e/e.max()
duck=1-0.55*np.clip(e*4,0,1)
mus=mus*duck
# SFX
sfx=np.zeros(N)
def whoosh(t,d=.45,g=.5):
    n=int(d*SR);x=rs.randn(n);tw=np.arange(n)/SR
    # sweep bandpass via simple resonator approximation: moving average diff
    out=np.zeros(n);lp=0;
    a=np.linspace(.02,.35,n)
    for i in range(n): lp+=a[i]*(x[i]-lp); out[i]=lp
    shape=np.sin(np.pi*tw/d)**2
    add(sfx,out*shape*g,t-d/2)
def impact(t,g=.8):
    n=int(.6*SR);ti=np.arange(n)/SR
    boom=np.sin(2*np.pi*(38*ti+ (90/12)*(1-np.exp(-ti*12))))*np.exp(-ti*5)
    add(sfx,(boom+rs.randn(n)*np.exp(-ti*40)*.4)*g,t)
def pop(t,g=.3,f=900):
    n=int(.12*SR);tp=np.arange(n)/SR
    add(sfx,np.sin(2*np.pi*(f*tp+ f*2*tp*tp*-3))*np.exp(-tp*35)*g,t)
def riser(t0,t1,g=.25):
    n=int((t1-t0)*SR);tr=np.arange(n)/SR;x=rs.randn(n)
    ph=2*np.pi*np.cumsum(np.linspace(200,1400,n))/SR
    add(sfx,(np.sin(ph)*.3+x*.25)*(tr/(t1-t0))**2*g,t0)
for c in [3.18,8.58,11.83,15.48,23.12,28.32,35.95,39.52,46.42]: whoosh(c,.5,.55)
whoosh(0.25,.4,.4)
riser(0.8,1.96,.3); riser(18.2,18.9,.25); riser(44.1,44.84,.2)
for t_,g in [(1.96,1),(3.86,.6),(5.68,.8),(7.68,.8),(12.94,.5),(15.52,.6),(18.4,.6),(18.9,1),(21.58,.5),(25.92,.6),(31.22,.6),(33.34,.6),(38.3,.8),(42.24,.4),(43.54,.5),(44.84,.9),(46.46,.9)]: impact(t_,g*.55)
for t_ in [2.35,2.48,2.61,9.48,9.62,9.76,9.9,10.04,10.18,10.9,17.52,20.0,20.18,20.36,29.08,29.74,29.98,32.54,34.64,39.7]+[43.54+i*.09 for i in range(9)]+[4.2+i*.12 for i in range(12)]: pop(t_,.18,700+ (int(t_*100)%5)*120)
pop(48.25,.35,1200);pop(49.0,.25,900)
mix=voice*1.0+mus*0.30+sfx*0.30
mix=mix/np.abs(mix).max()*0.95
st=np.stack([mix,mix],1)
# slight stereo on music/sfx
st[:,0]+= (mus*0.03); st[:,1]-= (mus*0.03)
st=np.clip(st,-1,1)
o=wave.open('mix.wav','wb');o.setnchannels(2);o.setsampwidth(2);o.setframerate(SR);o.writeframes((st*32767).astype('<i2').tobytes());o.close()
print('ok')
