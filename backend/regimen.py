"""Project user-confirmed medication courses onto dates and reminder occurrences."""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import HTTPException


def validate_regimen(r):
    if r is None:  # Existing cards and older clients keep their original daily schedule.
        return
    if r.get('frequency') not in {'daily', 'interval', 'weekly'}:
        raise HTTPException(422, '请先核对这盒药的服用频率。')
    if r.get('course') not in {'fixed', 'long_term'} or not r.get('start_date'):
        raise HTTPException(422, '请核对这盒药的开始日期和使用期限。')
    if r['course'] == 'fixed' and not r.get('end_date'):
        raise HTTPException(422, '请填写这盒药的结束日期。')
    if r.get('end_date') and r['end_date'] < r['start_date']:
        raise HTTPException(422, '结束日期不能早于开始日期。')
    if r['course'] == 'long_term' and r.get('end_date'):
        raise HTTPException(422, '长期服用不应同时填写结束日期。')
    if r['frequency'] == 'interval' and not 2 <= r.get('interval_days', 0) <= 30:
        raise HTTPException(422, '请填写每隔几天服用，范围为 2 至 30 天。')
    if r['frequency'] == 'weekly' and not r.get('weekdays'):
        raise HTTPException(422, '请选择每周服用的星期。')


def date_bounds(med, card=None):
    r = med.get('regimen') or {}
    starts = [x for x in [r.get('start_date'), (card or {}).get('start_date')] if x]
    ends = [x for x in [r.get('end_date'), (card or {}).get('end_date')] if x]
    return max(starts, default=None), min(ends, default=None)


def active_on(med, day, card=None):
    day = day.isoformat() if isinstance(day, date) else day
    start, end = date_bounds(med, card)
    if (start and day < start) or (end and day > end):
        return False
    r = med.get('regimen')
    if not r:
        return True
    if r.get('frequency') == 'interval':
        return bool(r.get('start_date')) and (date.fromisoformat(day) - date.fromisoformat(r['start_date'])).days % r['interval_days'] == 0
    if r.get('frequency') == 'weekly':
        return date.fromisoformat(day).isoweekday() in r.get('weekdays', [])
    return r.get('frequency') == 'daily'


def regimen_label(med):
    r = med.get('regimen')
    if not r:
        return ''
    frequency = {'daily': '每天', 'interval': f"每 {r.get('interval_days', 2)} 天", 'weekly': '每周' + '、'.join('一二三四五六日'[d-1] for d in r.get('weekdays', []))}.get(r.get('frequency'), '频率待核对')
    frequency += f"，服用日 {med.get('daily_count', 1)} 次"
    course = f"{r.get('start_date', '')} 至 {r['end_date']}" if r.get('end_date') else f"{r.get('start_date', '')} 起长期服用"
    return frequency + '；' + course


def next_med_occurrence(at, tz, now, med, card=None):
    zone = ZoneInfo(tz)
    local = datetime.fromtimestamp(now, zone)
    start, end = date_bounds(med, card)
    day = max(local.date(), date.fromisoformat(start)) if start else local.date()
    h, minute = map(int, at.split(':'))
    for offset in range(32):
        candidate_day = day + timedelta(days=offset)
        if end and candidate_day.isoformat() > end:
            return None
        candidate = datetime.combine(candidate_day, datetime.min.time(), zone).replace(hour=h, minute=minute)
        if candidate.timestamp() > now and active_on(med, candidate_day, card):
            return candidate.timestamp()
    return None


def recurrence_rule(med, card, tz):
    r = med.get('regimen') or {}
    rule = 'FREQ=WEEKLY;BYDAY=' + ','.join(['MO','TU','WE','TH','FR','SA','SU'][d-1] for d in r.get('weekdays', [])) if r.get('frequency') == 'weekly' else 'FREQ=DAILY'
    if r.get('frequency') == 'interval':
        rule += ';INTERVAL=' + str(r['interval_days'])
    _, end = date_bounds(med, card)
    if end:
        until = datetime.fromisoformat(end).replace(hour=23, minute=59, second=59, tzinfo=ZoneInfo(tz)).astimezone(timezone.utc)
        rule += ';UNTIL=' + until.strftime('%Y%m%dT%H%M%SZ')
    return rule
