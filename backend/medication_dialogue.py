"""Schema-bound collection; the model proposes facts, deterministic code asks/validates."""
import copy
import hashlib
import json
import re
import time
import unicodedata
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from .providers import skill
from .services import validate_med
from .store import dump, new_id


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')


class DoseUpdate(Strict):
    index: int = Field(ge=0, le=3)
    dose: str | None = Field(default=None, max_length=40)
    time: str | None = Field(default=None, pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    meal: str | None = Field(default=None, max_length=80)


class FactUpdates(Strict):
    name: str | None = Field(default=None, max_length=80)
    frequency: Literal['daily', 'interval', 'weekly'] | None = None
    interval_days: int | None = Field(default=None, ge=2, le=30)
    weekdays: list[int] | None = Field(default=None, max_length=7)
    daily_count: int | None = Field(default=None, ge=1, le=4)
    course: Literal['fixed', 'long_term'] | None = None
    start_date: date | None = None
    end_date: date | None = None
    duration_days: int | None = Field(default=None, ge=1, le=366)
    food_notes: str | None = Field(default=None, max_length=120)
    dose_updates: list[DoseUpdate] = Field(default_factory=list, max_length=4)


class Extraction(Strict):
    intent: Literal['record', 'uncertain', 'medical_question', 'other']
    updates: FactUpdates
    evidence: dict[str, str] = Field(default_factory=dict, max_length=32)


class Turn(Strict):
    revision: int = Field(ge=0)
    medication_id: str = Field(default='', max_length=64)
    request_id: str = Field(min_length=8, max_length=64)
    action: Literal['start', 'message', 'confirm'] = 'message'
    text: str = Field(default='', max_length=1200)


def seed(m):
    if m.get('dialogue'):
        return copy.deepcopy(m['dialogue']['facts'])
    r = m.get('regimen') or {}
    return dict(name=m.get('name', ''), frequency=r.get('frequency', 'unknown'),
                interval_days=r.get('interval_days'), weekdays=r.get('weekdays', []),
                daily_count=1+len(m.get('extra_doses', [])) if r.get('frequency') in {'daily','interval','weekly'} else None,
                course=r.get('course', 'unknown'), start_date=r.get('start_date'), end_date=r.get('end_date'), duration_days=None,
                food_notes=m.get('food_notes', ''),
                doses=[{k:m.get(k, '') for k in ('time','dose','meal')}, *copy.deepcopy(m.get('extra_doses', []))])


def candidate(m, facts):
    rows=(facts['doses'] + [{}]*4)[:facts.get('daily_count') or 1]
    administrations=[{k:row.get(k) or '' for k in ('time','dose','meal')} for row in rows]
    return {**m, 'name':facts.get('name') or '', **administrations[0], 'extra_doses':administrations[1:],
            'food_notes':facts.get('food_notes') or '', 'regimen':{
                'frequency':facts.get('frequency') or 'unknown', 'interval_days':facts.get('interval_days') or 2,
                'weekdays':facts.get('weekdays') or [], 'course':facts.get('course') or 'unknown',
                'start_date':facts.get('start_date'), 'end_date':facts.get('end_date')},
            'ok':False, 'confirmed_at':None}


def assess(m, f):
    if f.get('_unresolved'):return 'uncertain','您现在拿不准的是哪一项？确认后再告诉我，或先保存，稍后继续。',[]
    if not f.get('name'):return 'name', '这盒药叫什么名字？可以直接说药盒上的名称。', []
    if f.get('frequency') not in {'daily','interval','weekly'}:
        return 'frequency','这盒药是每天服用，还是隔几天、每周指定日期服用？',['每天服用']
    if f['frequency']=='interval' and not f.get('interval_days'):
        return 'interval_days','从开始那天算起，每几天服用一次？',[]
    if f['frequency']=='weekly' and not f.get('weekdays'):
        return 'weekdays','每周哪几天服用这盒药？',[]
    if not f.get('daily_count'):return 'daily_count','服用当天要吃几次？',[]
    for i in range(f['daily_count']):
        row=(f['doses']+[{}]*4)[i]
        if not row.get('dose') or not row.get('time'):
            question=f'第 {i+1} 次几点服用，每次用多少？请带上片、粒等单位。' if not row.get('dose') and not row.get('time') else f'第 {i+1} 次每次用多少？请带上片、粒等单位。' if not row.get('dose') else f'第 {i+1} 次具体几点服用？'
            return 'dose_'+str(i),question,[]
    if f.get('course') not in {'fixed','long_term'}:
        return 'course','这盒药有固定疗程，还是医生交代长期服用？',['固定疗程','遵医嘱长期服用']
    if not f.get('start_date'):return 'start_date','从哪一天开始服用？',['今天开始','明天开始']
    if f['course']=='fixed' and not f.get('end_date'):
        return 'end_date','这盒药吃到哪一天，或者一共吃多少天？',[]
    try:validate_med(candidate(m,f))
    except HTTPException as exc:return 'validation',exc.detail,[]
    return 'confirm','我整理好了，请核对下面的吃法；需要修改的地方可以直接告诉我。',[]


def extract(provider, text, f, question):
    prompt={'today_shanghai':datetime.now(ZoneInfo('Asia/Shanghai')).date().isoformat(),
            'current_facts':{k:v for k,v in f.items() if not k.startswith('_')},'last_question':question,'current_user_message':text}
    raw=provider.complete(skill('medication-dialogue')+'\nJSON Schema:\n'+dump(Extraction.model_json_schema()),
                          [{'role':'user','content':dump(prompt)}],json_output=True)
    try:
        value=Extraction.model_validate_json(re.sub(r'^```(?:json)?\s*|\s*```$', '', raw.strip()))
        if any(not 1<=d<=7 for d in value.updates.weekdays or []):raise ValueError()
        if len({d.index for d in value.updates.dose_updates}) != len(value.updates.dose_updates):raise ValueError()
        return value
    except (ValidationError, ValueError, TypeError):
        raise HTTPException(502,'这句话还没整理清楚，请重试或分开说。已有信息没有改变。') from None


def dose_in_quote(value, quote):
    def normalize(text):return re.sub(r"\s+", "", unicodedata.normalize("NFKC", text)).lower()
    pattern=r"([0-9]+(?:\.[0-9]+)?|[零〇一二两三四五六七八九十半]+)(毫升|毫克|微克|千克|片|粒|丸|袋|包|滴|克|支|喷|揿|贴|勺|瓶|枚|锭|ml|mg|g)"
    digits={c:i for i,c in enumerate('零一二三四五六七八九')};digits.update({'〇':0,'两':2})
    def amount(raw):
        if raw=='半':return .5
        try:return float(raw)
        except ValueError:
            if '十' in raw:
                left,_,right=raw.partition('十');return digits.get(left,1)*10+digits.get(right,0)
            return digits.get(raw,-1)
    value=normalize(value);match=re.fullmatch(r'(?:每次|一次)?'+pattern,value)
    if not match:return False
    expected=(amount(match[1]),match[2])
    if expected[0]<0:return False
    return any((amount(m[1]),m[2])==expected for m in re.finditer(pattern,normalize(quote)))


def clock_in_quote(value, quote):
    digits={c:i for i,c in enumerate('零一二三四五六七八九')};digits['两']=2
    def number(raw):
        if not raw:return 0
        if raw.isdigit():return int(raw)
        if '十' in raw:
            left,_,right=raw.partition('十');return digits.get(left,1)*10+digits.get(right,0)
        return digits.get(raw,-1)
    pattern=r'(?:(早上|早晨|上午|凌晨|下午|晚上|晚间|中午|早|晚)\s*)?([零一二两三四五六七八九十\d]{1,3})(?:[:：]([0-5]?\d)|点(?:(半)|([零一二两三四五六七八九十\d]{1,3})分?)?)'
    for tag,h,colon,half,minute in re.findall(pattern,unicodedata.normalize('NFKC',quote)):
        hour=number(h);mins=30 if half else number(colon or minute)
        if tag in {'下午','晚上','晚间','晚','中午'} and hour<12:hour+=12
        if tag=='凌晨' and hour==12:hour=0
        if f'{hour:02d}:{mins:02d}'==value:return True
    return False


def apply_updates(facts, proposal, text):
    f=copy.deepcopy(facts)
    if proposal.intent not in {'record','uncertain'}:return f
    updates=proposal.updates.model_dump(mode='json',exclude_unset=True)
    def supported(key, value):
        quote=proposal.evidence.get(key, '').strip()
        if not quote or quote not in text:return False
        if proposal.intent=='uncertain' and value is not None:return False
        if key in {'start_date','end_date'} and value and not re.search(r'今天|明天|后天|昨天|前天|周|星期|\d{4}[-/年]|[\d一二三四五六七八九十]+月',quote):return False
        if key=='duration_days' and value and not re.search(r'天|周',quote):return False
        if key=='daily_count' and value and not re.search(r'次|早晚|早中晚',quote):return False
        if key=='course' and value=='long_term' and not re.search(r'长期|一直|持续',quote):return False
        if key=='frequency' and value=='daily' and not re.search(r'每天|每日|天天|一天|一日',quote):return False
        if key=='frequency' and value=='weekly' and not re.search(r'周|星期',quote):return False
        if key=='frequency' and value=='interval' and not re.search(r'隔|每.{0,5}天',quote):return False
        if key.endswith('.time') and value and not clock_in_quote(value,quote):return False
        if key.endswith('.dose') and value and not dose_in_quote(value,quote):return False
        if key=='name' and value and value not in quote:return False
        return True
    accepted={k:v for k,v in updates.items() if k!='dose_updates' and supported(k,v)}
    f.update(accepted)
    changed=bool(accepted)
    if 'frequency' in accepted:
        if f['frequency']!='weekly':f['weekdays']=[]
        if f['frequency']!='interval':f['interval_days']=None
    f['weekdays']=sorted(set(f.get('weekdays') or []))
    if f.get('course')=='long_term':f['end_date']=f['duration_days']=None
    elif 'end_date' in accepted:f['duration_days']=None
    if f.get('course')=='fixed' and f.get('start_date') and f.get('duration_days'):
        f['end_date']=(date.fromisoformat(f['start_date'])+timedelta(days=f['duration_days']-1)).isoformat()
    if 'start_date' in accepted and not f.get('start_date') and f.get('duration_days'):f['end_date']=None
    count=f.get('daily_count') or max(1,len(f['doses']))
    f['doses']=(f['doses']+[{'dose':'','time':'','meal':''} for _ in range(4)])[:count]
    for change in updates.get('dose_updates',[]):
        i=change['index']
        if i>=len(f['doses']):continue
        for key,value in change.items():
            if key!='index' and supported(f'doses.{i}.{key}',value):
                f['doses'][i][key]=value or '';changed=True
    if proposal.intent=='uncertain':f['_unresolved']=not changed
    elif changed:f['_unresolved']=False
    return f


def register_dialogue(app,store,current,provider,locks,limit):
    @app.get('/api/v1/medication-dialogue/schema', tags=['用药核对'])
    def schema(auth=Depends(current)):
        return Extraction.model_json_schema()

    @app.post('/api/v1/drafts/{draft_id}/dialogue', tags=['用药核对'])
    def dialogue(draft_id:str,body:Turn,request:Request,auth=Depends(current)):
        signature=hashlib.sha256(dump(body.model_dump()).encode()).hexdigest()
        with locks['dialogue:'+draft_id]:
            with store.db() as db:
                row=store.owned(db,'drafts',draft_id,auth['user_id'])
                previous=db.execute('SELECT * FROM medication_dialogue_requests WHERE user_id=? AND draft_id=? AND request_id=?',(auth['user_id'],draft_id,body.request_id)).fetchone()
                if previous:
                    if previous['signature']!=signature:raise HTTPException(409,'这次消息的编号已被使用，请重新发送。')
                    result=json.loads(previous['response'])
                    if result['draft']['revision']!=row['revision']:raise HTTPException(409,'草稿已有后续更新，请刷新后继续。')
                    return result
                if row['revision']!=body.revision:raise HTTPException(409,'草稿已更新，请刷新后继续核对。')
                d=store.draft(row)
            text=body.text.strip()
            if body.action=='message' and not text:raise HTTPException(422,'请先说一句这盒药的吃法。')
            if body.medication_id:
                index=next((i for i,m in enumerate(d['meds']) if m['id']==body.medication_id),None)
                if index is None:raise HTTPException(404,'这盒药已不在当前草稿中。')
            else:
                if body.action=='confirm':raise HTTPException(422,'请选择要确认的药。')
                if len(d['meds'])>=5:raise HTTPException(422,'一次最多登记五种药。')
                d['meds'].append({'id':new_id(),'name':'','dose':'','time':'','meal':'','ok':False})
                index=len(d['meds'])-1
            m=d['meds'][index];f=seed(m);turns=copy.deepcopy(m.get('dialogue',{}).get('turns',[]));mode='schema';notice=''
            if body.action=='message':
                limit(request,'medication-dialogue',45)
                proposal=extract(provider,text,f,assess(m,f)[1])
                f=apply_updates(f,proposal,text)
                if proposal.intent=='medical_question':notice='我可以记录已经确认的医嘱，不能替您决定用量、疗程或调整处方。'
                elif proposal.intent=='uncertain':notice='不清楚的部分先留着，核对药袋或问过医生、药师后再补。'
                elif proposal.intent=='other':notice='我们正在核对这盒药；其他问题可以切到「聊一聊」。'
                turns.append({'role':'user','text':text});mode=provider.engine
            step,question,choices=assess(m,f)
            if body.action=='confirm':
                if step!='confirm':raise HTTPException(422,question)
                updated=candidate(m,f);validate_med(updated);updated['ok']=True;updated['confirmed_at']=time.time()
                turns.append({'role':'assistant','text':'这盒药的吃法已确认。'})
            else:
                updated=candidate(m,f)
                reply=(notice+'\n' if notice else '')+('已更新，请核对下面的吃法。' if not notice and body.action=='message' and step=='confirm' and m.get('dialogue',{}).get('ready') else question)
                if not turns or turns[-1].get('text')!=reply:turns.append({'role':'assistant','text':reply})
            updated['dialogue']={'facts':f,'turns':turns[-40:],'step':step,'question':question,'choices':choices,'ready':step=='confirm'}
            d['meds'][index]=updated;d['index']=index;d['phase']='review'
            if body.action=='confirm':
                next_index=next((i for i,x in enumerate(d['meds']) if not x.get('ok')),None)
                if next_index is None:d['phase']='summary'
                else:d['index']=next_index
            d['revision']+=1
            result={'draft':d,'mode':mode}
            with store.db() as db:
                db.execute('BEGIN IMMEDIATE')
                latest=store.owned(db,'drafts',draft_id,auth['user_id'])
                if latest['revision']!=body.revision:raise HTTPException(409,'核对期间草稿有更新，请刷新后继续。')
                db.execute('UPDATE drafts SET data=?,revision=?,updated=? WHERE id=?',(dump(d),d['revision'],time.time(),draft_id))
                db.execute('INSERT INTO medication_dialogue_requests VALUES(?,?,?,?,?,?)',(auth['user_id'],draft_id,body.request_id,signature,dump(result),time.time()))
            return result
