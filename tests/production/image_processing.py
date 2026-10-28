"""Exercise actual browser image module, no admin session or product writes."""
import json,sys,tempfile,base64
from pathlib import Path
sys.path.insert(0,str(Path(tempfile.gettempdir())/'mariru-audit-playwright'))
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'reports/full-test-2026-10-25';OUT.mkdir(parents=True,exist_ok=True)
RESULTS=[]
with sync_playwright()as pw:
    browser=pw.chromium.launch(headless=True,executable_path=str(Path.home()/'AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'))
    page=browser.new_page();page.goto('http://127.0.0.1:4179/inicio.html',wait_until='domcontentloaded')
    for ident,title,operation in [('I01','PNG file name normalization','name'),('I02','Actual JPEG-to-PNG fallback','convert'),('I03','Actual local background removal creates transparent PNG','remove')]:
        try:
            result=page.evaluate('''async operation=>{
              const module=await import('/js/services/image-processing.js');
              if(operation==='name')return {valid:module.nombrePng('FOTO.JPG')==='FOTO.png'};
              const source=await (await fetch('/assets/productos/1.jpg')).blob();
              const file=new File([source],'foto-prueba.jpg',{type:'image/jpeg'});
              const processing=operation==='remove'?module.quitarFondo(file):module.convertirAPng(file);
              const output=await Promise.race([processing,new Promise((_,reject)=>setTimeout(()=>reject(Error('Model processing exceeded 100 seconds')),100000))]);
              const bitmap=await createImageBitmap(output);const canvas=document.createElement('canvas');
              canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);
              const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let transparent=0;
              for(let index=3;index<data.length;index+=4)if(data[index]<250)transparent++;
              return {valid:output.type==='image/png'&&bitmap.width>0,width:bitmap.width,height:bitmap.height,transparentFraction:transparent/(data.length/4),png:operation==='remove'?canvas.toDataURL('image/png').split(',')[1]:null};
            }''',operation)
            assert result['valid']
            if operation=='remove':
                assert result['transparentFraction']>.01,'No significant transparent background'
                (OUT/'background-removal-sample.png').write_bytes(base64.b64decode(result.pop('png')))
            else:result.pop('png',None)
            RESULTS.append(dict(id=ident,title=title,status='PASS',environment='ACTUAL_LOCAL_IMAGE_PROCESSOR',detail=result))
        except Exception as error:RESULTS.append(dict(id=ident,title=title,status='FAIL',environment='ACTUAL_LOCAL_IMAGE_PROCESSOR',pending='P14',detail=str(error)[:900]))
    browser.close()
(OUT/'image-results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(RESULTS,ensure_ascii=True,indent=2))
