"""Real official SDK + Node runtime; only the external HTTP provider is simulated.

ANBAN_TEST_DSH=1 python3 -m unittest backend.tests.test_dsh_runtime -v
"""
import base64
import io
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from email.parser import BytesParser
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from backend import harness
from backend.providers import Providers, ModelRoute
from backend.main import create_app
import tempfile


@unittest.skipUnless(os.getenv('ANBAN_TEST_DSH') == '1', 'requires installed DSH and loopback sockets')
class DSHRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.requests=[];self.files=[];self.response='这是模型返回的通俗说明。';self.status=200;self.finish='end_turn';self.files_status=200
        owner=self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_POST(self):
                raw=self.rfile.read(int(self.headers['Content-Length']))
                if self.path.endswith('/files'):
                    owner.files.append(raw)
                    mime=BytesParser().parsebytes(('Content-Type: '+self.headers['Content-Type']+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+raw)
                    file=next(p for p in mime.walk() if p.get_filename())
                    body={'id':'file-api-test','type':'file','mime_type':'image/jpeg','size_bytes':len(file.get_payload(decode=True)),'created_at':datetime.now(timezone.utc).isoformat(),'filename':file.get_filename()}
                    self.send_response(owner.files_status);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(body).encode());return
                data=json.loads(raw)
                owner.requests.append((self.path,data))
                if owner.status!=200:
                    self.send_response(owner.status);self.end_headers();self.wfile.write(b'{"error":{"type":"authentication_error","message":"private upstream detail"}}');return
                self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
                events=[('message_start',{'message':{'id':'msg-test','type':'message','role':'assistant','model':'deepseek-flash','content':[],'stop_reason':None,'stop_sequence':None,'usage':{'input_tokens':20,'output_tokens':0}}}),
                        ('content_block_start',{'index':0,'content_block':{'type':'text','text':''}}),
                        ('content_block_delta',{'index':0,'delta':{'type':'text_delta','text':owner.response}}),
                        ('content_block_stop',{'index':0}),
                        ('message_delta',{'delta':{'stop_reason':owner.finish,'stop_sequence':None},'usage':{'output_tokens':20}}),
                        ('message_stop',{})]
                for event,body in events:
                    self.wfile.write(('event: '+event+'\ndata: '+json.dumps({'type':event,**body},ensure_ascii=False)+'\n\n').encode())
                self.wfile.flush()
        self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        threading.Thread(target=self.server.serve_forever,daemon=True).start()
        self.addCleanup(self.server.server_close);self.addCleanup(self.server.shutdown)
        self.p=Providers();self.p.engine='dsh'
        base=f'http://127.0.0.1:{self.server.server_port}/anthropic'
        self.p.chat=ModelRoute('deepseek','deepseek-flash','DEEPSEEK_API_KEY','local-fixture-key',base,base)
        self.p.vision=ModelRoute('deepseek','deepseek-flash','DEEPSEEK_API_KEY','local-fixture-key',base,base)

    def test_real_runtime_text_history_and_no_tools(self):
        answer=self.p.complete('只回答大白话。',[{'role':'user','content':'/goal 这是普通用户文字'},{'role':'assistant','content':'前次回答'},{'role':'user','content':'继续刚才的对话'}])
        self.assertEqual(answer,self.response);self.assertEqual(len(self.requests),1)
        path,request=self.requests[0]
        self.assertEqual(path,'/anthropic/v1/messages')
        self.assertFalse(request.get('tools'))
        self.assertIn('前次回答',json.dumps(request,ensure_ascii=False))
        self.assertIn('只回答大白话',json.dumps(request,ensure_ascii=False))

    def test_chat_api_two_turns_run_through_dsh(self):
        with tempfile.TemporaryDirectory() as tmp,TestClient(create_app(tmp,self.p,allowed_hosts={'testserver'})) as client:
            client.headers['X-CSRF-Token']=client.post('/api/v1/session',json={}).json()['csrf']
            cid=client.get('/api/v1/conversation').json()['id']
            for i,text in enumerate(['请记住测试代号松树。','刚才的测试代号是什么？']):
                result=client.post('/api/v1/conversations/'+cid+'/messages',json={'text':text,'request_id':f'dsh-test-{i}'})
                self.assertEqual(result.status_code,200,result.text)
                self.assertEqual(result.json()['mode'],'dsh')
                self.assertEqual(result.json()['text'],self.response)
            self.assertEqual(len(client.get('/api/v1/conversation').json()['messages']),4)
        self.assertEqual(len(self.requests),2)
        self.assertIn('松树',json.dumps(self.requests[1][1],ensure_ascii=False))
        self.assertIn(self.response,json.dumps(self.requests[1][1],ensure_ascii=False))
        self.assertTrue(all(not data.get('tools') for _,data in self.requests))

    def test_report_api_uses_dsh_and_keeps_original_values(self):
        self.response=json.dumps({'indicators':[{'name':'测试指标','value':'8.8','unit':'测试单位','reference':'1.0-7.0','flag':'high'}],'unreadable':False},ensure_ascii=False)
        out=io.BytesIO();Image.new('RGB',(80,100),'white').save(out,'JPEG')
        url='data:image/jpeg;base64,'+base64.b64encode(out.getvalue()).decode()
        with tempfile.TemporaryDirectory() as tmp,TestClient(create_app(tmp,self.p,allowed_hosts={'testserver'})) as client:
            client.headers['X-CSRF-Token']=client.post('/api/v1/session',json={}).json()['csrf']
            upload=client.post('/api/v1/uploads',json={'kind':'report','data_url':url}).json()
            report=client.post('/api/v1/reports',json={'upload_id':upload['id']})
            self.assertEqual(report.status_code,200,report.text)
            self.assertEqual(report.json()['fields']['indicators'][0]['value'],'8.8')
            self.assertEqual(report.json()['fields']['indicators'][0]['flag'],'high')
        self.assertEqual(len(self.requests),1)

    def test_real_vision_api_draft_preserves_confirmation_gate(self):
        self.response=json.dumps({'name':'照片候选药','specification':'测试规格','manufacturer':'测试厂家','label_directions':'原图文字','uncertain':True},ensure_ascii=False)
        out=io.BytesIO();Image.new('RGB',(80,100),'white').save(out,'JPEG')
        url='data:image/jpeg;base64,'+base64.b64encode(out.getvalue()).decode()
        with tempfile.TemporaryDirectory() as tmp,TestClient(create_app(tmp,self.p,allowed_hosts={'testserver'})) as client:
            client.headers['X-CSRF-Token']=client.post('/api/v1/session',json={}).json()['csrf']
            upload=client.post('/api/v1/uploads',json={'data_url':url}).json()
            result=client.post('/api/v1/uploads/'+upload['id']+'/analyze',json={})
            self.assertEqual(result.status_code,200,result.text)
            self.assertEqual(result.json()['fields']['name'],'照片候选药')
            draft=client.post('/api/v1/drafts',json={}).json()
            draft=client.post('/api/v1/drafts/'+draft['id']+'/uploads/'+upload['id'],json={}).json()
            self.assertFalse(draft['meds'][0]['ok']);self.assertEqual(draft['meds'][0]['dose'],'')
            self.assertEqual(draft['meds'][0]['name'],'照片候选药')
        request=self.requests[0][1]
        self.assertFalse(request.get('tools'))
        parts=[part for message in request['messages'] for part in message['content'] if isinstance(message['content'],list)]
        self.assertTrue(any(p.get('type')=='image' for p in parts))
        self.assertEqual(len(self.files),1)
        self.assertIn(b'3600',self.files[0])
        self.assertTrue(any(p.get('source',{}).get('file_id')=='file-api-test' for p in parts))

    def test_files_failure_falls_back_to_inline_image(self):
        self.files_status=404
        out=io.BytesIO();Image.new('RGB',(80,100),'white').save(out,'JPEG')
        result=self.p.complete('读图',[{'role':'user','content':'读图'}],out.getvalue())
        self.assertEqual(result,self.response)
        parts=[part for msg in self.requests[0][1]['messages'] for part in msg['content']]
        self.assertTrue(any(p.get('source',{}).get('type')=='base64' for p in parts))
        self.assertFalse(self.requests[0][1].get('tools'))

    def test_upstream_error_is_sanitized_and_not_retried(self):
        self.status=401
        with self.assertRaises(HTTPException) as raised:self.p.complete('测试',[{'role':'user','content':'你好'}])
        self.assertEqual(raised.exception.status_code,502)
        self.assertNotIn('private',raised.exception.detail);self.assertEqual(len(self.requests),1)

    def test_truncated_completion_is_rejected(self):
        self.finish='max_tokens'
        with self.assertRaises(HTTPException):self.p.complete('测试',[{'role':'user','content':'你好'}])
        self.assertEqual(len(self.requests),1)

    def test_external_deadline_cleans_worker(self):
        with self.assertRaises(HTTPException) as raised:
            harness.complete(key='local-fixture-key',base=self.p.chat.dsh_base,model='deepseek-flash',system='测试',messages=[],timeout=0.01)
        self.assertEqual(raised.exception.status_code,504)
