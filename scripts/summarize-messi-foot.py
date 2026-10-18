import json,csv,hashlib
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'benchmarks/phrase-hunt-messi-foot-v1'
s=json.loads((p/'spec.json').read_text());runs=json.loads((p/'runs.json').read_text());v=dict(s['entries'])
assert len(runs)==200 and all('error' not in r for r in runs)
bad=[r for r in s['relations'] if (r['type']=='less' and not v[r['a']]<v[r['b']]) or (r['type']=='equal' and abs(v[r['a']]-v[r['b']])>5)]
s['excludedRelations']=bad;s['relations']=[r for r in s['relations'] if r not in bad];s['auditNote']='One directionally inconsistent relation excluded based solely on reference-label consistency. All 50 numeric reference labels unchanged. Audit disclosed while calls were running. Original 30-check output preserved separately.'
assert hashlib.sha256(json.dumps(s['entries'],ensure_ascii=False,separators=(',',':')).encode()).hexdigest()=='669ea8dd739ebfd6a211de57c978d1f808bce1b02ad3e713cf371f98f2d4bac3'
(p/'audited-spec.json').write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n')
result={}
for name in ['baseline','selected']:
 data=[r for r in runs if r['variant']==name];assert len(data)==100
 means={q:sum(r['score'] for r in data if r['phrase']==q)/2 for q,y in s['entries']};errors=[abs(means[q]-y) for q,y in s['entries']]
 checks=[dict(r,aScore=means[r['a']],bScore=means[r['b']],passed=means[r['a']]<means[r['b']] if r['type']=='less' else abs(means[r['a']]-means[r['b']])<=5) for r in s['relations']]
 result[name]={'MAE':sum(errors)/50,'score':100-sum(errors)/50,'within5':sum(x<=5 for x in errors),'total':50,'relationsPassed':sum(r['passed'] for r in checks),'relationsTotal':len(checks),'means':means,'checks':checks}
(p/'audited-comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
with (p/'comparison.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.writer(f);w.writerow(['حدس','مرجع','پرامپت فعلی','پرامپت پیشنهادی','خطای فعلی','خطای پیشنهادی'])
 for q,y in s['entries']:w.writerow([q,y,round(result['baseline']['means'][q],2),round(result['selected']['means'][q],2),round(abs(result['baseline']['means'][q]-y),2),round(abs(result['selected']['means'][q]-y),2)])
for k,d in result.items():print(k,{a:b for a,b in d.items() if a not in ['means','checks']})
for q,y in s['entries']:
 print(q,y,round(result['baseline']['means'][q],2),round(result['selected']['means'][q],2))
