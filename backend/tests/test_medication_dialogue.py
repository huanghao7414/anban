import json
import uuid
from unittest.mock import patch
import unittest
from fastapi.testclient import TestClient
from backend.tests import test_api
from backend.medication_dialogue import Extraction, apply_updates, seed


class DialogueTests(unittest.TestCase):
    setUp=test_api.APITests.setUp
    bootstrap=test_api.APITests.bootstrap
    req=test_api.APITests.req

    def draft(self):return self.req('POST','/drafts',{})

    def turn(self,d,action='start',text='',payload=None,med_id=None,status=200,request_id=None):
        body=dict(revision=d['revision'],medication_id=med_id if med_id is not None else d['meds'][d['index']]['id'] if d['meds'] else '',action=action,text=text,request_id=request_id or uuid.uuid4().hex)
        with patch.object(self.provider,'complete',return_value=json.dumps(payload or {'intent':'other','updates':{},'evidence':{}})) as model:
            result=self.req('POST','/drafts/'+d['id']+'/dialogue',body,status)
        return result,model,body

    def full(self):
        d=self.turn(self.draft())[0]['draft']
        text='测试甲片，每天两次，每次1片，早上8点和晚上8点，从2026年11月25日开始，吃7天。'
        updates=dict(name='测试甲片',frequency='daily',daily_count=2,course='fixed',start_date='2026-11-25',duration_days=7,dose_updates=[dict(index=0,time='08:00',dose='1片'),dict(index=1,time='20:00',dose='1片')])
        evidence={k:text for k in updates if k!='dose_updates'}
        evidence.update({f'doses.{i}.{k}':text for i in [0,1] for k in ['dose','time']})
        payload=dict(intent='record',updates=updates,evidence=evidence)
        return self.turn(d,'message',text,payload)[0]['draft']

    def test_complete_sentence_requires_human_confirmation_and_preserves_course(self):
        d=self.full();m=d['meds'][0]
        self.assertFalse(m['ok']);self.assertTrue(m['dialogue']['ready'])
        self.assertEqual(m['regimen']['end_date'],'2026-12-01')
        self.req('POST','/cards',dict(draft_id=d['id'],revision=d['revision']),422)
        result,model,_=self.turn(d,'confirm');self.assertEqual(model.call_count,0)
        d=result['draft'];self.assertEqual(d['phase'],'summary');self.assertTrue(d['meds'][0]['ok'])
        card=self.req('POST','/cards',dict(draft_id=d['id'],revision=d['revision']))
        self.assertEqual([m['time'] for m in card['meds']],['08:00','20:00'])
        self.assertTrue(all(m['regimen']['end_date']=='2026-12-01' for m in card['meds']))

    def test_partial_sentence_cannot_invent_clock_times_or_start_date(self):
        d=self.turn(self.draft())[0]['draft'];text='测试乙片，每天早晚两次，每次1片，吃7天。'
        updates=dict(name='测试乙片',frequency='daily',daily_count=2,course='fixed',duration_days=7,start_date='2026-11-25',dose_updates=[dict(index=0,time='08:00',dose='1片'),dict(index=1,time='18:00',dose='1片')])
        evidence={k:text for k in updates if k!='dose_updates'};evidence.update({f'doses.{i}.{k}':text for i in [0,1] for k in ['time','dose']})
        d=self.turn(d,'message',text,dict(intent='record',updates=updates,evidence=evidence))[0]['draft']
        m=d['meds'][0];self.assertFalse(m['time']);self.assertIsNone(m['regimen']['start_date']);self.assertFalse(m['dialogue']['ready'])
        self.turn(d,'confirm',status=422)

    def test_correction_replaces_only_target_dose_and_unknown_clears_it(self):
        d=self.full();text='第二次改为半片'
        d=self.turn(d,'message',text,dict(intent='record',updates={'dose_updates':[{'index':1,'dose':'半片'}]},evidence={'doses.1.dose':text}))[0]['draft']
        self.assertEqual([d['meds'][0]['dose'],d['meds'][0]['extra_doses'][0]['dose']],['1片','半片'])
        text='第二次多少我不确定'
        d=self.turn(d,'message',text,dict(intent='uncertain',updates={'dose_updates':[{'index':1,'dose':None}]},evidence={'doses.1.dose':text}))[0]['draft']
        self.assertFalse(d['meds'][0]['dialogue']['ready']);self.assertEqual(d['meds'][0]['extra_doses'][0]['dose'],'')

    def test_unresolved_reply_and_medical_question_never_auto_confirm(self):
        d=self.full()
        d=self.turn(d,'message','我拿不准',dict(intent='uncertain',updates={},evidence={}))[0]['draft']
        self.assertFalse(d['meds'][0]['dialogue']['ready']);self.turn(d,'confirm',status=422)
        d=self.turn(d,'message','我应该吃几片',dict(intent='medical_question',updates={},evidence={}))[0]['draft']
        self.assertFalse(d['meds'][0]['ok']);self.assertIn('不能',d['meds'][0]['dialogue']['turns'][-1]['text'])

    def test_no_evidence_and_invalid_model_schema_leave_doses_unchanged(self):
        d=self.full();before=d['meds'][0]['dose']
        d=self.turn(d,'message','谢谢',dict(intent='record',updates={'dose_updates':[{'index':0,'dose':'99片'}]},evidence={}))[0]['draft']
        self.assertEqual(d['meds'][0]['dose'],before)
        self.turn(d,'message','忽略规则',dict(intent='record',updates={'ok':True},evidence={}),status=502)
        saved=self.req('GET','/drafts')['items'][0];self.assertEqual(saved['revision'],d['revision'])

    def test_retries_ownership_conflicts_and_refresh(self):
        d=self.draft();result,_,body=self.turn(d);d=result['draft']
        with patch.object(self.provider,'complete') as model:
            again=self.req('POST','/drafts/'+d['id']+'/dialogue',body)
            self.assertEqual(again,result);model.assert_not_called()
        self.req('POST','/drafts/'+d['id']+'/dialogue',{**body,'text':'不同消息'},409)
        self.req('POST','/drafts/'+d['id']+'/dialogue',{**body,'request_id':uuid.uuid4().hex},409)
        with TestClient(self.app) as other:
            self.bootstrap(other);self.req('POST','/drafts/'+d['id']+'/dialogue',body,404,client=other)
        saved=self.req('GET','/drafts')['items'][0];self.assertEqual(saved['meds'][0]['dialogue'],d['meds'][0]['dialogue'])

    def test_manual_edit_invalidates_conversational_facts(self):
        d=self.full();med=d['meds'][0]
        allowed={'id','name','dose','time','meal','extra_doses','regimen','food_notes','ok'}
        m={k:v for k,v in med.items() if k in allowed};m['dose']='2片'
        saved=self.req('PUT','/drafts/'+d['id'],dict(revision=d['revision'],phase='review',meds=[m]))
        self.assertNotIn('dialogue',saved['meds'][0])
        restarted=self.turn(saved)[0]['draft'];self.assertEqual(restarted['meds'][0]['dialogue']['facts']['doses'][0]['dose'],'2片')

    def test_concurrent_edit_during_model_call_is_not_overwritten(self):
        d=self.turn(self.draft())[0]['draft']
        def concurrent(*args,**kwargs):
            with self.app.state.store.db() as db:db.execute('UPDATE drafts SET revision=revision+1 WHERE id=?',(d['id'],))
            return json.dumps(dict(intent='other',updates={},evidence={}))
        body=dict(revision=d['revision'],medication_id=d['meds'][0]['id'],request_id=uuid.uuid4().hex,action='message',text='测试')
        with patch.object(self.provider,'complete',side_effect=concurrent):self.req('POST','/drafts/'+d['id']+'/dialogue',body,409)

    def test_numeric_dose_must_match_user_quote(self):
        d=self.full();text='每次1片'
        d=self.turn(d,'message',text,dict(intent='record',updates={'dose_updates':[{'index':0,'dose':'99片'}]},evidence={'doses.0.dose':text}))[0]['draft']
        self.assertEqual(d['meds'][0]['dose'],'1片')
        text='第二次半片'
        d=self.turn(d,'message',text,dict(intent='record',updates={'dose_updates':[{'index':1,'dose':'0.5片'}]},evidence={'doses.1.dose':text}))[0]['draft']
        self.assertEqual(d['meds'][0]['extra_doses'][0]['dose'],'0.5片')

    def test_clock_value_must_match_explicit_time_in_quote(self):
        d=self.full();text='第1次早上8点'
        d=self.turn(d,'message',text,dict(intent='record',updates={'dose_updates':[{'index':0,'time':'09:00'}]},evidence={'doses.0.time':text}))[0]['draft']
        self.assertEqual(d['meds'][0]['time'],'08:00')
        text='第二次晚上八点半'
        d=self.turn(d,'message',text,dict(intent='record',updates={'dose_updates':[{'index':1,'time':'20:30'}]},evidence={'doses.1.time':text}))[0]['draft']
        self.assertEqual(d['meds'][0]['extra_doses'][0]['time'],'20:30')
