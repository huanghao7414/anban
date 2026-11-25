import json
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo
from unittest.mock import patch
from fastapi import HTTPException
from backend.regimen import active_on, next_med_occurrence, recurrence_rule, validate_regimen
from backend.services import collect_due, REMINDER_WINDOW
from backend.tests import test_api


def rule(**changes):
    return dict(frequency='daily', course='fixed', start_date='2026-11-25', end_date='2026-11-29', interval_days=2, weekdays=[], **{}) | changes


def stamp(value):
    return datetime.fromisoformat(value).replace(tzinfo=ZoneInfo('Asia/Shanghai')).timestamp()


class RegimenDates(unittest.TestCase):
    def test_interval_weekly_and_inclusive_end(self):
        m={'regimen':rule(frequency='interval')}
        self.assertEqual([active_on(m,f'2026-11-{d}') for d in range(24,31)],[False,True,False,True,False,True,False])
        self.assertEqual(next_med_occurrence('08:00','Asia/Shanghai',stamp('2026-11-25T08:01'),m),stamp('2026-11-27T08:00'))
        self.assertIsNone(next_med_occurrence('08:00','Asia/Shanghai',stamp('2026-11-29T08:01'),m))
        m={'regimen':rule(frequency='weekly',weekdays=[1,5],course='long_term',end_date=None)}
        self.assertEqual(next_med_occurrence('08:00','Asia/Shanghai',stamp('2026-11-27T08:01'),m),stamp('2026-11-30T08:00'))
        self.assertEqual(recurrence_rule(m,{},'Asia/Shanghai'),'FREQ=WEEKLY;BYDAY=MO,FR')
        self.assertIn('INTERVAL=2;UNTIL=20261129T155959Z',recurrence_rule({'regimen':rule(frequency='interval')},{},'Asia/Shanghai'))

    def test_future_course_and_unknown_fields(self):
        m={'regimen':rule(start_date='2027-01-01',end_date='2027-01-05')}
        self.assertEqual(next_med_occurrence('08:00','Asia/Shanghai',stamp('2026-11-25T09:00'),m),stamp('2027-01-01T08:00'))
        for invalid in [rule(frequency='unknown'),rule(course='unknown'),rule(end_date=None),rule(frequency='weekly'),rule(end_date='2026-11-24')]:
            with self.assertRaises(HTTPException):validate_regimen(invalid)


class RegimenAPI(unittest.TestCase):
    setUp=test_api.APITests.setUp
    bootstrap=test_api.APITests.bootstrap
    req=test_api.APITests.req
    create_real=test_api.APITests.create_real

    def confirmed(self):
        d=self.create_real()
        meds=[]
        for i,m in enumerate(d['meds']):
            meds.append(dict(id=m['id'],name='验收药'+str(i),dose='1片',time='08:00',meal='',ok=True,regimen=rule(frequency='interval' if i==0 else 'weekly',weekdays=[] if i==0 else [1,5])))
        d=self.req('PUT','/drafts/'+d['id'],dict(revision=d['revision'],phase='summary',meds=meds))
        return self.req('POST','/cards',dict(draft_id=d['id'],revision=d['revision'])),d

    def test_roundtrip_and_unknown_rejected(self):
        card,d=self.confirmed()
        self.assertEqual(card['meds'][0]['regimen']['frequency'],'interval')
        self.assertEqual(self.req('GET','/cards')['items'][0]['meds'],card['meds'])
        meds=d['meds'];meds[0]['regimen']['course']='unknown'
        self.req('PUT','/drafts/'+d['id'],dict(revision=d['revision'],phase='summary',meds=[{k:v for k,v in m.items() if k in {'id','name','dose','time','meal','ok','regimen'}} for m in meds]),422)

    def test_reminders_calendar_and_final_event(self):
        card,_=self.confirmed()
        with patch('backend.main.time.time',return_value=stamp('2026-11-25T07:00')):
            rows=sorted(self.req('POST','/reminders',dict(card_id=card['id'],times=['08:00','08:00']))['items'],key=lambda r:r['med_index'])
        self.assertEqual(rows[0]['next_at'],stamp('2026-11-25T08:00'))
        self.assertEqual(rows[1]['next_at'],stamp('2026-11-27T08:00'))
        ics=self.req('GET','/reminders/calendar.ics').text
        self.assertIn('FREQ=DAILY;INTERVAL=2;UNTIL=',ics)
        self.assertIn('FREQ=WEEKLY;BYDAY=MO,FR;UNTIL=',ics)
        now=stamp('2026-11-29T08:00:30')
        with self.app.state.store.db() as db:
            db.execute('UPDATE reminders SET next_at=? WHERE med_index=0',(now-30,))
        with patch('backend.main.time.time',return_value=now):
            events=self.req('GET','/reminder-events')['items']
            self.assertEqual(len(events),1)
            self.assertTrue(self.req('POST','/reminder-events/'+events[0]['id']+'/present',{})['present'])
        with self.app.state.store.db() as db:
            self.assertEqual(db.execute('SELECT enabled FROM reminders WHERE med_index=0').fetchone()[0],0)
            before=db.execute('SELECT count(*) FROM reminder_events').fetchone()[0]
        collect_due(self.app.state.store,now+86400)
        with self.app.state.store.db() as db:self.assertEqual(db.execute('SELECT count(*) FROM reminder_events').fetchone()[0],before)
        with patch('backend.main.time.time',return_value=now+86400):
            self.req('PATCH','/reminders/'+rows[0]['id'],{'enabled':True},422)
