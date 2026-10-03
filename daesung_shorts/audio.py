import numpy as np, wave
SR=48000; DUR=60.0; N=int(SR*DUR); rs=np.random.RandomState(5); tt=np.arange(N)/SR
def add(b,s,t,g=1):
    i=int(t*SR);j=min(len(b),i+len(s))
    if 0<=i<len(b): b[i:j]+=s[:j-i]*g
mus=np.zeros(N); beat=60/92
chords=[[220,277.18,329.63,415.3],[185,233.08,277.18,369.99],[164.81,207.65,246.94,329.63],[196,246.94,293.66,369.99]]
kn=int(.3*SR);tk=np.arange(kn)/SR;kick=np.sin(2*np.pi*(46*tk+2.4*(1-np.exp(-tk*22))))*np.exp(-tk*9)
hn=int(.05*SR);hat=np.diff(rs.randn(hn+1))*np.exp(-np.arange(hn)/SR*90)*.2
t=0;b=0
while t<DUR:
    bar=(b//4)%4
    if b>=8 and not 49.6<t<50.6:
        if b%4 in (0,2): add(mus,kick,t,.55)
        add(mus,hat,t+beat/2,.45)
    if b%4==0:
        n=int(4*beat*SR);ts=np.arange(n)/SR;env=np.minimum(1,ts/.03)*np.exp(-ts*.7)
        for k,f in enumerate(chords[bar]): add(mus,(np.sin(2*np.pi*f*ts)+.3*np.sin(4*np.pi*f*ts))*env*.03,t+k*.03)
        add(mus,np.sin(2*np.pi*chords[bar][0]/2*ts)*np.exp(-ts*.6)*.12,t)
    for k in range(2):  # arpeggio pluck
        f=chords[bar][(b*2+k)%4]*2;n=int(.4*SR);ts=np.arange(n)/SR
        add(mus,np.sin(2*np.pi*f*ts)*np.exp(-ts*9)*.03,t+k*beat/2)
    t+=beat;b+=1
mus*=np.minimum(1,tt/1.5)*np.clip((DUR-tt)/2.0,0,1)
sfx=np.zeros(N)
def whoosh(t,d=.6,g=.5):
    n=int(d*SR);x=rs.randn(n);o=np.zeros(n);lp=0;a=np.linspace(.02,.3,n)
    for q in range(n): lp+=a[q]*(x[q]-lp);o[q]=lp
    add(sfx,o*np.sin(np.pi*np.arange(n)/n)**2*g,t-d/2)
def impact(t,g=.6):
    n=int(.8*SR);ti=np.arange(n)/SR
    add(sfx,(np.sin(2*np.pi*(38*ti+6*(1-np.exp(-ti*10))))*np.exp(-ti*4)+rs.randn(n)*np.exp(-ti*35)*.3)*g,t)
    add(sfx,(np.sin(2*np.pi*2637*ti)+np.sin(2*np.pi*3951*ti))*np.exp(-ti*5)*.04,t+.05)
def pop(t,g=.18,f=800):
    n=int(.1*SR);tp=np.arange(n)/SR;add(sfx,np.sin(2*np.pi*(f*tp-f*2.5*tp*tp))*np.exp(-tp*38)*g,t)
def ding(t,g=.16):
    n=int(1.0*SR);tp=np.arange(n)/SR;add(sfx,(np.sin(2*np.pi*1568*tp)+.5*np.sin(2*np.pi*2349*tp))*np.exp(-tp*4)*g,t)
def riser(a,b_,g=.18):
    n=int((b_-a)*SR);tr=np.arange(n)/SR;ph=2*np.pi*np.cumsum(np.linspace(300,1600,n))/SR
    add(sfx,(np.sin(ph)*.4+rs.randn(n)*.2)*(tr/(b_-a))**2*g,a)
def ticks(a,b_,g=.08):
    t=a
    while t<b_: pop(t,g,1500); t+=0.07+0.13*(1-(t-a)/(b_-a))
for s in (5,20,35,50): whoosh(s)
for s,g in ((0.6,.7),(21.0,.5),(50.3,.7)): impact(s,g)
for s in (2.6,7.0,9.2,22.2,23.2,27.8,29.9,31.6,35.5,38.0,54.5): pop(s)
ding(6.9);ticks(11.5,15.5);riser(11.5,15.5);ding(15.5,.22);impact(15.6,.35)
ticks(41.5,45.5);riser(41.5,45.5);ding(45.5,.22);impact(45.6,.35)
pop(58.2,.35,1200);pop(58.8,.25,900)
mix=mus*.9+sfx*.7;mix/=np.abs(mix).max();mix*=.9
st=np.clip(np.stack([mix+mus*.05,mix-mus*.05],1),-1,1)
o=wave.open('bgm_sfx.wav','wb');o.setnchannels(2);o.setsampwidth(2);o.setframerate(SR);o.writeframes((st*32767).astype('<i2').tobytes());o.close()
