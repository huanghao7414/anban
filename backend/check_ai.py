"""DSH preflight, or five real model calls using synthetic, non-personal fixtures."""
import argparse
import base64
import io
import json
import os
from pathlib import Path
import tempfile

from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont
from .main import create_app, ROOT
from .providers import Providers
from . import harness


def test_photo(lines):
    font_path=next((p for p in [os.getenv('ANBAN_FONT_PATH',''),'/System/Library/Fonts/PingFang.ttc','/System/Library/Fonts/STHeiti Medium.ttc',
                              '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'] if p and Path(p).is_file()),None)
    if not font_path:raise RuntimeError('请先配置中文字体 ANBAN_FONT_PATH。')
    image=Image.new('RGB',(1000,500),'white');draw=ImageDraw.Draw(image)
    font=ImageFont.truetype(font_path,44)
    for i,line in enumerate(lines):draw.text((45,35+i*90),line,font=font,fill='black')
    output=io.BytesIO();image.save(output,'JPEG',quality=95)
    return 'data:image/jpeg;base64,'+base64.b64encode(output.getvalue()).decode()


def run_live(provider):
    for route in [provider.chat, provider.vision]:
        if not route.key:raise RuntimeError('尚未填写密钥，请编辑 '+str(ROOT/'.env')+' 中的 '+route.key_name+'。')
    if provider.engine!='dsh':raise RuntimeError('请将 ANBAN_AGENT_ENGINE 设置为 dsh 后再联调。')
    results=[]
    with tempfile.TemporaryDirectory(prefix='anban-live-check-') as tmp,TestClient(create_app(tmp,provider,allowed_hosts={'testserver'})) as c:
        def call(path,data):
            response=c.post('/api/v1'+path,json=data)
            if response.status_code!=200:
                raise RuntimeError(response.json().get('error',{}).get('message','接口请求失败'))
            return response.json()
        c.headers['X-CSRF-Token']=call('/session',{})['csrf']
        cid=c.get('/api/v1/conversation').json()['id']
        for i,text in enumerate(['测试代号是松树。请用一句话和我打招呼。','我刚才说的测试代号是什么？']):
            print(f'正在验证真实对话 {i+1}/2…',flush=True)
            reply=call('/conversations/'+cid+'/messages',{'text':text,'request_id':f'live-chat-{i}'})
            if reply['mode']!='dsh' or not reply['text'].strip() or (i==1 and '松树' not in reply['text']):
                raise RuntimeError('对话或上下文验证未通过，请检查模型返回。')
            results.append('chat' if i==0 else 'chat_history')
        draft=call('/drafts',{})
        for name in ['测试药甲','测试药乙']:
            print('正在验证真实药盒识别：'+name+'…',flush=True)
            photo=call('/uploads',{'data_url':test_photo(['药品名称：'+name,'规格：联调测试规格','生产厂家：测试厂','仅为程序测试制作，无真实患者信息'])})
            recognition=call('/uploads/'+photo['id']+'/analyze',{})
            if name not in recognition.get('fields',{}).get('name',''):
                raise RuntimeError('测试药盒的药名未正确识别。')
            draft=call('/drafts/'+draft['id']+'/uploads/'+photo['id'],{})
            if any(m['ok'] or m['dose'] for m in draft['meds']):raise RuntimeError('识别候选越过了人工核对步骤。')
            results.append('medicine_'+name[-1])
        print('正在验证真实报告识别…',flush=True)
        report=call('/uploads',{'kind':'report','data_url':test_photo(['模拟体检报告（非真实患者）','检查项目：测试指标','结果：8.8  ↑','参考范围：1.0 - 7.0'])})
        parsed=call('/reports',{'upload_id':report['id']})
        if not any('8.8' in row['value'] and row['flag']=='high' for row in parsed.get('fields',{}).get('indicators',[])):
            raise RuntimeError('测试报告的数值或箭头未正确识别。')
        results.append('report')
    return results


def main():
    parser=argparse.ArgumentParser(description='安伴 DSH 本地检查；--live 使用配置密钥发送 5 次合成数据测试请求。')
    parser.add_argument('--live',action='store_true')
    args=parser.parse_args();provider=Providers()
    try:
        for name,route in [('对话',provider.chat),('识图',provider.vision)]:
            result=harness.complete(key='local-startup-probe',base='http://127.0.0.1:9',model=route.model,
                                    system='本机启动检查',messages=[],probe=True,timeout=30,provider=route.provider)
            print(f'DSH {name}启动通过：{route.provider} / {route.model} / {result["version"]}',flush=True)
        if args.live:
            checks=run_live(provider)
            print('真实 API 联调通过：'+', '.join(checks),flush=True)
        else:
            for name,route in [('对话',provider.chat),('识图',provider.vision)]:
                print(f'{name}密钥 {route.key_name}：'+('已配置（未发起真实调用）' if route.key else '未配置'))
            print('配置文件：'+str(ROOT/'.env'))
            print('真实联调命令：python3 -m backend.check_ai --live')
    except (HTTPException,RuntimeError) as exc:
        print('检查未通过：'+(exc.detail if isinstance(exc,HTTPException) else str(exc)),flush=True)
        return 1
    return 0


if __name__=='__main__':raise SystemExit(main())
