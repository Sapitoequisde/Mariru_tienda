"""Build, dependency, static and read-only deployment checks. No cloud writes."""
import json, re, subprocess, urllib.request, urllib.error
from html.parser import HTMLParser
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'reports/full-test-2026-10-25';OUT.mkdir(parents=True,exist_ok=True)
RESULTS=[]
def case(ident,title,fn,environment='LOCAL_STATIC',pending=None):
    try:
        detail=fn();RESULTS.append(dict(id=ident,title=title,status='PASS',environment=environment,detail=detail))
    except Exception as error:RESULTS.append(dict(id=ident,title=title,status='FAIL',environment=environment,pending=pending,detail=str(error)[:800]))
def check(value,message='Assertion failed'):
    if not value:raise AssertionError(message)
def run(command,cwd=ROOT):
    return subprocess.run(command,cwd=cwd,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=180)
def build():
    result=run(['npm.cmd','run','build']);(OUT/'build.log').write_text(result.stdout+result.stderr,encoding='utf-8');check(result.returncode==0,'Build failed');return 'Production build completed'
case('R01','Production build',build)
case('R02','Backend syntax',lambda:check(run(['node','--check','functions/index.js']).returncode==0))
class HTML(HTMLParser):
    def __init__(self):super().__init__();self.refs=[];self.ids=[]
    def handle_starttag(self,tag,attrs):
        attributes=dict(attrs)
        if 'id'in attributes:self.ids.append(attributes['id'])
        for key in ['src','href']:
            if attributes.get(key):self.refs.append(attributes[key])
def links():
    from urllib.parse import urlsplit
    issues=[]
    for file in (ROOT/'dist').glob('*.html'):
        parser=HTML();parser.feed(file.read_text(encoding='utf-8'))
        if len(parser.ids)!=len(set(parser.ids)):issues.append(file.name+': duplicate IDs')
        for ref in parser.refs:
            url=urlsplit(ref)
            if url.scheme or url.netloc or not url.path:continue
            target=(ROOT/'dist'/url.path.lstrip('/')) if url.path.startswith('/') else file.parent/url.path
            if not target.exists():issues.append(file.name+': missing '+ref)
    check(not issues,str(issues));return '14 built HTML pages; local asset/link paths exist'
case('R03','Built HTML references and unique IDs',links)
def lockfiles():
    for folder in [ROOT,ROOT/'functions']:
        package=json.loads((folder/'package.json').read_text());lock=json.loads((folder/'package-lock.json').read_text())
        for key in ['dependencies','devDependencies']:
            check(package.get(key,{})==lock['packages'][''].get(key,{}),'Lockfile differs from package declarations')
case('R04','Root and functions dependency lock declarations match',lockfiles)
case('R05','Seed utility excluded from production build',lambda:check(not (ROOT/'dist/seed.html').exists()))
case('R06','Environment file ignored by Git',lambda:check(run(['git','check-ignore','.env']).returncode==0))
ENV={}
for line in (ROOT/'.env').read_text(encoding='utf-8-sig').splitlines():
    if '='in line and not line.strip().startswith('#'):
        key,value=line.split('=',1);ENV[key.strip()]=value.strip().strip('"').strip("'")
PROJECT=ENV['VITE_FIREBASE_PROJECT_ID'];DB=f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/'
case('R07','App Check configured for local production build',lambda:check(bool(ENV.get('VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY')),'Public App Check site key is absent'),'LOCAL_CONFIG','P01')
def get(url):
    try:
        with urllib.request.urlopen(url,timeout=20)as response:return response.status,dict(response.headers),response.read()
    except urllib.error.HTTPError as error:return error.code,dict(error.headers),error.read()
def public_schema():
    status,_,body=get(DB+'productos?pageSize=100');check(status==200,'Public product read unavailable')
    docs=json.loads(body).get('documents',[])
    for doc in docs:
        fields=doc.get('fields',{});check(all(key in fields for key in ['nombre','categoria','precio','stock']),'Product missing required fields')
        check('integerValue'in fields['stock'] and int(fields['stock']['integerValue'])>=0,'Invalid stock')
    return f'{len(docs)} public product(s), compatible required fields'
case('R08','Live public product schema',public_schema,'LIVE_READONLY')
for ident,resource in [('R09','usuarios'),('R10','pedidos')]:
    case(ident,'Anonymous access denied: '+resource,lambda resource=resource:check(get(DB+resource+'/qa-nonexistent-20261025')[0]==403),'LIVE_READONLY')
case('R11','Current callable route is present',lambda:check(get(f'https://us-central1-{PROJECT}.cloudfunctions.net/submitWhatsAppOrder')[0]!=404,'Current callable GET returned 404'),'LIVE_READONLY','P01')
case('R12','Unused legacy endpoint no longer exposed',lambda:check(get(f'https://us-central1-{PROJECT}.cloudfunctions.net/placeOrder')[0]==404,'Legacy callable still responds'),'LIVE_READONLY','P02')
def headers():
    status,received,_=get('https://mariru-bazar.web.app/inicio.html');check(status==200)
    lowered={key.lower():value for key,value in received.items()}
    required=['content-security-policy','x-content-type-options','x-frame-options','permissions-policy']
    check(all(key in lowered for key in required),'Missing headers: '+','.join(key for key in required if key not in lowered))
case('R13','Configured security headers active on checked Firebase hosting',headers,'LIVE_READONLY','P09')
for ident,name,folder in [('R14','frontend',ROOT),('R15','backend',ROOT/'functions')]:
    def audit(name=name,folder=folder):
        result=run(['npm.cmd','audit','--json'],folder);data=json.loads(result.stdout)
        (OUT/(name+'-audit.json')).write_text(json.dumps(data,indent=2),encoding='utf-8')
        counts=data.get('metadata',{}).get('vulnerabilities',{})
        check(counts.get('high',0)==0 and counts.get('critical',0)==0,'Unresolved high/critical advisories: '+json.dumps(counts))
    case(ident,'Dependency security audit: '+name,audit,'NPM_REGISTRY','P07')
(OUT/'checks-results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'suite':'checks','passed':sum(r['status']=='PASS'for r in RESULTS),'failed':[r for r in RESULTS if r['status']=='FAIL']},ensure_ascii=True,indent=2))
