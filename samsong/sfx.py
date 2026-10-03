import numpy as np, wave, subprocess
SR=48000;DUR=284.6;N=int(SR*DUR);rs=np.random.RandomState(9)
sfx=np.zeros(N)
def add(t,s,g=1):
    i=int(t*SR);j=min(N,i+len(s))
    if 0<=i<N: sfx[i:j]+=s[:j-i]*g
def whoosh(t,d=.55,g=.4):
    n=int(d*SR);x=rs.randn(n);o=np.zeros(n);lp=0;a=np.linspace(.02,.3,n)
    for q in range(n): lp+=a[q]*(x[q]-lp);o[q]=lp
    add(t-d/2,o*np.sin(np.pi*np.arange(n)/n)**2,g)
def impact(t,g=.5):
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
whoosh(.2,.7,.5);impact(.6,.6);pop(2.0);[pop(t) for t in (3.6,4.0,4.4)];impact(6.2,.5)
ticks(9.8,11.6);ding(11.6,.2);pop(9.2);pop(12.8);whoosh(15.6,.6,.45)
pop(30.9);impact(35.2,.4);pop(40.9)
for t in (43.3,73.6,91.9,116.7,190.1,212.0,227.3,250.5): whoosh(t,.5,.3)
for t in (120.4,121.6,123.8,197.9,201.1,203.1,205.2,215.4,217.7,218.5,219.8,220.8,251.0,260.4,268.6): pop(t)
impact(229.6,.4);pop(263.0,.3,1200);pop(263.5,.2,900)
sfx=np.clip(sfx,-1,1)
o=wave.open('sfx.wav','wb');o.setnchannels(1);o.setsampwidth(2);o.setframerate(SR);o.writeframes((sfx*32767).astype('<i2').tobytes());o.close()
