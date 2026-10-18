"""Recompute benchmark metrics from saved API answers, without network or database access."""
import json, csv, hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'benchmarks/phrase-hunt-pomegranate'
p=root/'optimization-v2'
spec=json.loads((root/'prompt-comparison-v1/spec.json').read_text())
names=['choiceConciseFa2','choiceConciseFa2-repeat2','choiceConciseFa2-repeat3']
prompt_bytes=(p/(names[0]+'-prompt.json')).read_bytes()
runs=[]
for name in names:
 assert (p/(name+'-prompt.json')).read_bytes()==prompt_bytes
 data=json.loads((p/(name+'-runs.json')).read_text())
 assert len(data)==50 and len({r['phrase'] for r in data})==50
 assert all('error' not in r for r in data)
 runs.extend(data)
means={q:sum(r['score'] for r in runs if r['phrase']==q)/3 for q,_ in spec['entries']}
errors=[abs(means[q]-y) for q,y in spec['entries']]
checks=[dict(r,aScore=means[r['a']],bScore=means[r['b']],passed=means[r['a']]<means[r['b']] if r['type']=='less' else abs(means[r['a']]-means[r['b']])<=5) for r in spec['relations']]
baseline=json.loads((root/'prompt-comparison-v1/baseline-summary.json').read_text())
per_run=[json.loads((p/(n+'-summary.json')).read_text()) for n in names]
variants=[]
for f in sorted(p.glob('*-summary.json')):
 if '-repeat' in f.name:continue
 d=json.loads(f.read_text());variants.append({'variant':f.name.removesuffix('-summary.json'),'MAE':d['MAE'],'within5':d['within5'],'relationsPassed':d['relationsPassed']})
result={'target':spec['target'],'winner':'choiceConciseFa2','promptSha256':hashlib.sha256(prompt_bytes).hexdigest(),'referenceSha256':hashlib.sha256((root/'prompt-comparison-v1/spec.json').read_bytes()).hexdigest(),'repetitions':3,'calls':len(runs),'MAE':sum(errors)/50,'score':100-sum(errors)/50,'within5':sum(e<=5 for e in errors),'total':50,'relationsPassed':sum(c['passed'] for c in checks),'relationsTotal':len(checks),'checks':checks,'perRun':[{'MAE':d['MAE'],'within5':d['within5'],'relationsPassed':d['relationsPassed']} for d in per_run],'baseline':{k:baseline[k] for k in ['MAE','score','within5','relationsPassed','relationsTotal']},'variants':variants,'limitations':['Exploratory optimization on a single known target; all 50 samples used for development, no held-out estimate.','Reference scores are subjective assistant-authored game-design judgments.','Winner changes output primitive from score to choice and uses discrete score bands. Improvements are not attributable to wording alone.','Few-shot examples use different targets but were selected while inspecting this benchmark.','No production judge, cache, or game state was changed.']}
assert result['MAE']<5 and result['within5']>=40 and result['relationsPassed']>=22
assert all(d['MAE']<5 and d['within5']>=40 and d['relationsPassed']>=22 for d in per_run)
(p/'final-summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
(p/'selected-prompt.json').write_bytes(prompt_bytes)
with (p/'final-comparison.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.writer(f);w.writerow(['حدس','مرجع','میانگین پرامپت فعلی','اجرای اول منتخب','اجرای دوم منتخب','اجرای سوم منتخب','میانگین منتخب','خطای منتخب'])
 for q,y in spec['entries']:
  vals=[next(r['score'] for r in json.loads((p/(n+'-runs.json')).read_text()) if r['phrase']==q) for n in names]
  w.writerow([q,y,round(baseline['means'][q],2),*vals,round(means[q],2),round(abs(means[q]-y),2)])
print(json.dumps({k:v for k,v in result.items() if k not in ['checks','variants','limitations']},ensure_ascii=False,indent=2))
print('Distinct candidate variants:',len(variants))
for q in ['باغ','باغ میوه','باغ انار','باغ سیب','باغ گلابی','انارستان','بستان انار','garden of pomegranates','راز باغ','راز باغ میوه','راز انارستان']:
 print(q,baseline['means'][q],round(means[q],2))
