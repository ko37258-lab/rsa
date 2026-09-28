import numpy as np, json, wave
gaps=[(0.0,1.26),(3.96,4.4),(7.64,8.1),(8.14,8.8),(10.66,10.92),(11.38,11.76),(14.36,14.7),(15.22,15.44),(18.06,18.34),(18.36,18.66),(21.4,21.64),(23.4,23.58),(26.54,26.8),(26.9,27.18),(29.88,30.06),(37.24,37.86),(45.84,46.18),(49.48,49.76),(51.4,52.26),(52.74,53.4),(53.42,53.94),(54.18,57.0)]
a=np.fromfile('voice48.f32',dtype=np.float32);sr=48000;T=len(a)/sr
PAD=0.05
keep=[];cur=0.0
for g0,g1 in gaps:
    e=g0+PAD
    if e>cur+0.02: keep.append((cur,e))
    cur=max(g1-PAD,0)
if cur<T and gaps[-1][1]<T-0.1: keep.append((cur,T))
# merge tiny
keep=[(s,e) for s,e in keep if e-s>0.03]
out=[];f=int(0.008*sr);ramp=np.linspace(0,1,f,dtype=np.float32)
for s,e in keep:
    seg=a[int(s*sr):int(e*sr)].copy()
    seg[:f]*=ramp;seg[-f:]*=ramp[::-1];out.append(seg)
y=np.concatenate(out)
# normalize to -1 dBFS peak
y=y/np.abs(y).max()*0.89
pcm=(np.clip(y,-1,1)*32767).astype('<i2')
w=wave.open('voice_cut.wav','wb');w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr);w.writeframes(pcm.tobytes());w.close()
json.dump(keep,open('keep.json','w'))
def mp(t):
    acc=0
    for s,e in keep:
        if t<s: return acc
        if t<=e: return acc+(t-s)
        acc+=e-s
    return acc
d=json.load(open('tr_word.json'))
words=[{'w':c['text'].strip(),'s':round(mp(c['timestamp'][0]),3),'e':round(mp(c['timestamp'][1]),3)} for c in d['chunks']]
json.dump(words,open('words_cut.json','w'),ensure_ascii=False)
print('orig',round(T,2),'cut',round(len(y)/sr,2),'segments',len(keep))
print(' '.join(f"{x['w']}@{x['s']:.2f}" for x in words))
