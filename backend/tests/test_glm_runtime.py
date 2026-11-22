"""Actual DSH/pi-ai runtime against a local OpenAI-compatible GLM fixture."""
import base64
import io
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from backend.main import create_app
from backend.providers import Providers, ModelRoute


@unittest.skipUnless(os.getenv('ANBAN_TEST_DSH') == '1', 'requires installed DSH and loopback sockets')
class GLMRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.requests=[];self.response='您好，我们一起整理已有信息。';self.status=200;self.finish='stop'
        owner=self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_POST(self):
                payload=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                owner.requests.append((self.path,self.headers.get('Authorization'),payload))
                if owner.status!=200:
                    self.send_response(owner.status);self.send_header('Content-Type','application/json');self.end_headers()
                    self.wfile.write(b'{"error":{"code":"1000","message":"private-key upstream detail"}}');return
                self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
                chunks=[{'delta':{'role':'assistant','content':owner.response},'finish_reason':None},
                        {'delta':{},'finish_reason':owner.finish}]
                for chunk in chunks:
                    data={'id':'glm-fixture','object':'chat.completion.chunk','created':1,'model':payload['model'],
                          'choices':[{'index':0,**chunk}]}
                    self.wfile.write(('data: '+json.dumps(data,ensure_ascii=False)+'\n\n').encode())
                self.wfile.write(b'data: [DONE]\n\n');self.wfile.flush()
        self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        threading.Thread(target=self.server.serve_forever,daemon=True).start()
        self.addCleanup(self.server.server_close);self.addCleanup(self.server.shutdown)
        base=f'http://127.0.0.1:{self.server.server_port}/api/paas/v4'
        self.p=Providers();self.p.engine='dsh'
        self.p.chat=ModelRoute('glm','glm-4.7','GLM_API_KEY','chat-fixture-key',base,base)
        self.p.vision=ModelRoute('glm','glm-4.6v','GLM_API_KEY','vision-fixture-key',base,base)

    def bootstrap(self,c):
        c.headers['X-CSRF-Token']=c.post('/api/v1/session',json={}).json()['csrf']

    def assert_wire(self,request,vision=False):
        path,authorization,payload=request
        self.assertEqual(path,'/api/paas/v4/chat/completions')
        self.assertEqual(authorization,'Bearer '+('vision' if vision else 'chat')+'-fixture-key')
        self.assertEqual(payload['model'],'glm-4.6v' if vision else 'glm-4.7')
        self.assertTrue(payload['stream']);self.assertEqual(payload['max_tokens'],2200)
        self.assertEqual(payload['thinking'],{'type':'disabled'})
        self.assertFalse(payload.get('tools'))
        self.assertNotIn('store',payload);self.assertNotIn('max_completion_tokens',payload)
        self.assertIn('system',[m['role'] for m in payload['messages']])
        self.assertNotIn('deepseek',payload['model'])

    def test_two_chat_turns_with_history_and_glm_auth(self):
        with tempfile.TemporaryDirectory() as tmp,TestClient(create_app(tmp,self.p,allowed_hosts={'testserver'})) as c:
            self.bootstrap(c);cid=c.get('/api/v1/conversation').json()['id']
            for i,text in enumerate(['测试代号是松树，请和我打招呼。','刚才的测试代号是什么？']):
                result=c.post('/api/v1/conversations/'+cid+'/messages',json={'text':text,'request_id':f'glm-chat-{i}'})
                self.assertEqual(result.status_code,200,result.text)
                self.assertEqual(result.json()['text'],self.response);self.assertEqual(result.json()['mode'],'dsh')
            self.assertEqual(len(c.get('/api/v1/conversation').json()['messages']),4)
        self.assertEqual(len(self.requests),2)
        for request in self.requests:self.assert_wire(request)
        self.assertIn('松树',json.dumps(self.requests[1][2],ensure_ascii=False))
        self.assertIn(self.response,json.dumps(self.requests[1][2],ensure_ascii=False))

    def test_two_medicine_images_and_report_use_vision_route(self):
        out=io.BytesIO();Image.new('RGB',(90,100),'white').save(out,'JPEG')
        photo='data:image/jpeg;base64,'+base64.b64encode(out.getvalue()).decode()
        with tempfile.TemporaryDirectory() as tmp,TestClient(create_app(tmp,self.p,allowed_hosts={'testserver'})) as c:
            self.bootstrap(c);draft=c.post('/api/v1/drafts',json={}).json()
            for name in ['测试药甲','测试药乙']:
                self.response=json.dumps({'name':name,'specification':'原图规格','manufacturer':'原图厂家','label_directions':'不能作为个人医嘱','uncertain':False},ensure_ascii=False)
                upload=c.post('/api/v1/uploads',json={'data_url':photo}).json()
                result=c.post('/api/v1/uploads/'+upload['id']+'/analyze',json={})
                self.assertEqual(result.status_code,200,result.text);self.assertEqual(result.json()['fields']['name'],name)
                draft=c.post('/api/v1/drafts/'+draft['id']+'/uploads/'+upload['id'],json={}).json()
            self.assertEqual(len(draft['meds']),2)
            self.assertTrue(all(not m['ok'] and not m['dose'] and not m['time'] for m in draft['meds']))
            self.response=json.dumps({'indicators':[{'name':'测试指标','value':'8.8','unit':'原单位','reference':'1.0-7.0','flag':'high'}],'unreadable':False})
            upload=c.post('/api/v1/uploads',json={'data_url':photo,'kind':'report'}).json()
            result=c.post('/api/v1/reports',json={'upload_id':upload['id']})
            self.assertEqual(result.status_code,200,result.text)
            self.assertEqual(result.json()['fields']['indicators'][0]['value'],'8.8')
        self.assertEqual(len(self.requests),3)
        for request in self.requests:
            self.assert_wire(request,True)
            parts=[part for m in request[2]['messages'] if isinstance(m['content'],list) for part in m['content']]
            images=[p['image_url']['url'] for p in parts if p['type']=='image_url']
            self.assertEqual(len(images),1);self.assertTrue(images[0].startswith('data:image/'))

    def test_auth_failure_not_retried_or_leaked(self):
        self.status=401
        with self.assertRaises(HTTPException) as raised:self.p.complete('规则',[{'role':'user','content':'您好'}])
        self.assertEqual(raised.exception.status_code,502)
        self.assertNotIn('private-key',raised.exception.detail);self.assertEqual(len(self.requests),1)

    def test_truncated_stream_and_invalid_json_rejected(self):
        self.finish='length'
        with self.assertRaises(HTTPException):self.p.complete('规则',[{'role':'user','content':'您好'}])
        self.finish='stop';self.response='不是 JSON'
        out=io.BytesIO();Image.new('RGB',(90,100),'white').save(out,'JPEG')
        with self.assertRaises(HTTPException) as raised:self.p.analyze(out.getvalue(),'medicine')
        self.assertEqual(raised.exception.status_code,502)
