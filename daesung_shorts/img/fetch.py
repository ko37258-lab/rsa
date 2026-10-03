import json,urllib.request,urllib.parse,time,re,os,sys
UA={'User-Agent':'ko-video-research/1.0 (scko@mrhomes.co.kr)'}
C=json.load(open('credits.json')) if os.path.exists('credits.json') else {}
def api(params):
    for k in range(8):
        try: return json.load(urllib.request.urlopen(urllib.request.Request('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(params),headers=UA)))
        except Exception as e: print('retry',e,flush=True); time.sleep(45+30*k)
def get(title,name,w=900):
    if name in C and os.path.exists(name): return
    r=api({'action':'query','format':'json','titles':title,'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':w})
    p=list(r['query']['pages'].values())[0];ii=p['imageinfo'][0];m=ii['extmetadata']
    artist=re.sub('<[^>]+>','',m.get('Artist',{}).get('value','')).strip()
    time.sleep(20)
    for k in range(6):
        try: data=urllib.request.urlopen(urllib.request.Request(ii['thumburl'],headers=UA)).read();break
        except Exception as e: print('dl retry',e,flush=True); time.sleep(40+30*k)
    open(name,'wb').write(data)
    C[name]={'title':title,'artist':artist,'license':m.get('LicenseShortName',{}).get('value'),'page':ii['descriptionurl']}
    json.dump(C,open('credits.json','w'),ensure_ascii=False,indent=1); print('OK',name,C[name]['license'],flush=True); time.sleep(30)
def search(s,n=6):
    r=api({'action':'query','format':'json','generator':'search','gsrsearch':s,'gsrnamespace':6,'gsrlimit':n,'prop':'imageinfo','iiprop':'size|extmetadata'})
    time.sleep(30)
    return [(p['title'],p['imageinfo'][0]['extmetadata'].get('LicenseShortName',{}).get('value')) for p in (r.get('query',{}).get('pages',{}) or {}).values()]
C.setdefault('daesung.jpg',{'title':'File:Daesung 2012.jpg','artist':'nicole voon','license':'CC BY 2.0','page':'https://commons.wikimedia.org/wiki/File:Daesung_2012.jpg'})
C.setdefault('hyunbin.jpg',{'title':'File:20240620 Hyun Bin (현빈) 01.jpg','artist':'K-POPIT 케이팝잇','license':'CC BY 3.0','page':'https://commons.wikimedia.org/wiki/File:20240620_Hyun_Bin_(%ED%98%84%EB%B9%88)_01.jpg'})
json.dump(C,open('credits.json','w'),ensure_ascii=False,indent=1)
get('File:Yuna Kim 2024.jpg','kimyuna.jpg')
get('File:Heukseok-dong, A waterfront city.jpg','heukseok.jpg',1280)
for s in ['Jang Dong-gun','Ko So-young','Dosan-daero','Apgujeong Rodeo street']:
    print('==',s,search(s),flush=True)
print('DONE')
