import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
import subprocess
import sys

spec = importlib.util.spec_from_file_location('bridge', Path(__file__).with_name('opencode_bridge.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


class BoundaryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.catalog = Path(self.tmp.name) / 'catalog.json'
        self.catalog.write_text(json.dumps({'updated_at': b.time.time(), 'models': [
            {'full_id': 'opencode/beam-free', 'providerID': 'opencode', 'status': 'active', 'cost': {'input': 0, 'output': 0, 'cache': {'read': 0, 'write': 0}}},
            {'full_id': 'opencode/paid', 'providerID': 'opencode', 'status': 'active', 'cost': {'input': 0.01, 'output': 0}},
            {'full_id': 'opencode/missing', 'providerID': 'opencode', 'status': 'active', 'cost': {'input': 0}},
            {'full_id': 'opencode/boolean', 'providerID': 'opencode', 'status': 'active', 'cost': {'input': False, 'output': 0}},
        ]}))
        self.request = {'model': 'opencode/beam-free', 'messages': [{'role': 'user', 'content': 'task'}]}
        self.addCleanup(self.tmp.cleanup)

    def test_shell_observation_tolerates_nullable_and_malformed_call_entries(self):
        self.assertFalse(b.shell_observed([{'role': 'assistant', 'tool_calls': None}]))
        self.assertFalse(b.shell_observed([{'role': 'assistant', 'tool_calls': [None, 1, {'function': None}, {'function': ['bad']}]}]))
        self.assertTrue(b.shell_observed([{'role': 'assistant', 'tool_calls': [{'id': 's1', 'function': {'name': 'apollo_sh'}}]}, {'role': 'tool', 'tool_call_id': 's1'}]))

    def test_free_catalog_rejects_paid_unknown_stale_and_invalid_prices(self):
        self.assertEqual(b.allowed_models(self.catalog), {'opencode/beam-free'})
        for model in ['opencode/paid', 'opencode/missing', 'opencode/boolean', 'opencode/unknown']:
            with self.assertRaises(ValueError):
                b.request_args({**self.request, 'model': model}, b.allowed_models(self.catalog))
        with self.assertRaises(ValueError):
            b.allowed_models(self.catalog, now=b.time.time() + 86401)

    def test_rate_limit_cools_down_without_another_provider_call(self):
        calls, closed = [], []
        def create(**args):
            calls.append(args)
            raise RuntimeError('HTTP 429: secret-provider-message')
        client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)), close=lambda: closed.append(True))
        bridge = b.Bridge(lambda: client, self.catalog)
        first = bridge.complete(self.request)
        second = bridge.complete(self.request)
        self.assertEqual(first[0], 429)
        self.assertEqual(first[2], 60)
        self.assertEqual(second[0], 429)
        self.assertEqual(len(calls), 1)
        self.assertEqual(closed, [True])
        self.assertNotIn('secret-provider-message', json.dumps(first))

    def test_host_function_returned_never_executed_and_history_preserved(self):
        seen, closed = [], []
        call = types.SimpleNamespace(id='t1', function=types.SimpleNamespace(name='apollo_read', arguments='{"path":"source.py"}'))
        out = types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content='', tool_calls=[call]))], usage=None)
        def create(**args):
            seen.append(args)
            return out
        client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)), close=lambda: closed.append(True))
        request = {**self.request, 'tools': [{'type': 'function', 'function': {'name': 'read', 'parameters': {'type': 'object'}}}],
                   'messages': [*self.request['messages'], {'role': 'assistant', 'tool_calls': [{'id': 'old'}]}, {'role': 'tool', 'tool_call_id': 'old', 'content': 'context-marker'}]}
        status, result, _ = b.Bridge(lambda: client, self.catalog).complete(request)
        self.assertEqual(status, 200)
        self.assertEqual(result['choices'][0]['message']['tool_calls'][0]['function']['name'], 'read')
        self.assertEqual(seen[0]['messages'][:-1], request['messages'])
        self.assertEqual(seen[0]['messages'][-1]['role'], 'user')
        self.assertEqual(closed, [True])

    def test_one_bounded_format_correction_counts_both_responses(self):
        calls = []
        usage = types.SimpleNamespace(prompt_tokens=3, completion_tokens=2, total_tokens=5)
        out = types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content='', tool_calls=[]))], usage=usage)
        def create(**args):
            calls.append(args)
            if len(calls) == 2:
                return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content='{"final":{"ok":true}}', tool_calls=[]))], usage=usage)
            return out
        client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)), close=lambda: None)
        request = {**self.request, 'tools': [{'type': 'function', 'function': {'name': 'read'}}]}
        status, result, _ = b.Bridge(lambda: client, self.catalog).complete(request)
        self.assertEqual(status, 200)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0]['tools'], [])
        self.assertIn('apollo_read', calls[0]['messages'][-1]['content'])
        self.assertIn('apollo_read', calls[1]['messages'][-1]['content'])
        self.assertEqual(result['usage']['total_tokens'], 10)

    def test_empty_responses_return_bounded_protocol_error_not_json_traceback(self):
        calls, closed = [], []
        out = types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content='', tool_calls=[]))], usage=None)
        def create(**args):
            calls.append(args)
            return out
        client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)), close=lambda: closed.append(True))
        request = {**self.request, 'tools': [{'type': 'function', 'function': {'name': 'read'}}]}
        status, result, retry = b.Bridge(lambda: client, self.catalog).complete(request)
        self.assertEqual(status, 502)
        self.assertEqual(result['error']['type'], 'controller_protocol_error')
        self.assertNotIn('JSONDecodeError', json.dumps(result))
        self.assertEqual(len(calls), 2)
        self.assertEqual(closed, [True])
        self.assertIsNone(retry)

    def test_invalid_reply_after_real_host_observation_is_corrected(self):
        calls = []
        usage = types.SimpleNamespace(prompt_tokens=5, completion_tokens=2, total_tokens=7)
        def create(**args):
            calls.append(args)
            text = 'I have completed the task, trust me' if len(calls) == 1 else '{"host_call":{"name":"apollo_sh","arguments":{"cmd":"bash t/run.sh"}}}'
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=text, tool_calls=[]))], usage=usage)
        client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)), close=lambda: None)
        request = {**self.request, 'tools': [{'type': 'function', 'function': {'name': 'sh', 'parameters': {'type': 'object'}}}],
                   'messages': [*self.request['messages'], {'role': 'tool', 'tool_call_id': 'old', 'content': 'real host observation: file edited'}]}
        status, result, _ = b.Bridge(lambda: client, self.catalog).complete(request)
        self.assertEqual(status, 200)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[1]['messages'][:len(request['messages'])], request['messages'])
        self.assertEqual(calls[1]['messages'][-1]['role'], 'user')
        self.assertIn('apollo_sh', calls[1]['messages'][-1]['content'])
        self.assertEqual(result['usage']['total_tokens'], 14)
        self.assertEqual(result['choices'][0]['message']['tool_calls'][0]['function']['name'], 'sh')

    def test_repeated_invalid_text_after_tool_cannot_become_final_success(self):
        calls = []
        def create(**args):
            calls.append(args)
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content='secret unparseable reply', tool_calls=[]))], usage=None)
        client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)), close=lambda: None)
        request = {**self.request, 'tools': [{'type': 'function', 'function': {'name': 'read'}}],
                   'messages': [*self.request['messages'], {'role': 'tool', 'content': 'actual result'}]}
        status, result, _ = b.Bridge(lambda: client, self.catalog).complete(request)
        self.assertEqual(status, 502)
        self.assertEqual(len(calls), 2)
        self.assertNotIn('secret unparseable reply', json.dumps(result))
        self.assertNotIn('choices', result)

    def test_task_session_reuses_client_and_passes_latest_real_observation(self):
        created, closed, seen = [], [], []
        def factory():
            created.append(True)
            def create(**args):
                seen.append(args)
                texts = ['{"host_call":{"name":"apollo_read","arguments":{"path":"add.sh"}}}',
                         '{"host_call":{"name":"apollo_sh","arguments":{"cmd":"bash t/run.sh"}}}',
                         '{"final":{"ok":true}}']
                return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=texts[len(seen)-1], tool_calls=[]))], usage=None)
            return types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)), close=lambda: closed.append(True))
        bridge = b.Bridge(factory, self.catalog)
        request = {**self.request, 'conversation_id': 'a'*32, 'messages': [{'role': 'system', 'content': 'original task role'}, *self.request['messages']],
                   'tools': [{'type': 'function', 'function': {'name': name}} for name in ['read', 'sh']]}
        original_head = request['messages'][:]
        for observation in ['actual source text', 'actual shell test output']:
            status, response, _ = bridge.complete(request)
            self.assertEqual(status, 200)
            message = response['choices'][0]['message']
            request['messages'] = [*request['messages'], message, {'role':'tool', 'tool_call_id': message['tool_calls'][0]['id'], 'content': observation}]
        status, response, _ = bridge.complete(request)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(response['choices'][0]['message']['content']), {'ok':True})
        self.assertEqual(len(created), 1)
        self.assertEqual(closed, [True])
        self.assertIsNone(bridge.session)
        self.assertEqual(request['messages'][:2], original_head)
        self.assertIn('actual shell test output', seen[-1]['messages'][-1]['content'])
        self.assertIn('actual source text', seen[-1]['messages'][-1]['content'])
        self.assertIn('original task role', seen[-1]['messages'][-1]['content'])

    def test_different_task_or_schema_evicts_idle_session(self):
        for change in ['conversation_id','messages','tools']:
            with self.subTest(change=change):
                closed, created = [], []
                def factory():
                    created.append(True)
                    out = types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content='{"host_call":{"name":"apollo_read","arguments":{"path":"a"}}}', tool_calls=[]))], usage=None)
                    return types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=lambda **_:out)), close=lambda:closed.append(True))
                bridge=b.Bridge(factory,self.catalog)
                req={**self.request,'conversation_id':'a'*32,'tools':[{'type':'function','function':{'name':'read'}}]}
                self.assertEqual(bridge.complete(req)[0],200)
                if change=='conversation_id':req={**req,change:'b'*32}
                elif change=='messages':req={**req,change:[{'role':'user','content':'another task'}]}
                else:req={**req,change:[{'type':'function','function':{'name':'read','description':'changed schema'}}]}
                self.assertEqual(bridge.complete(req)[0],200)
                self.assertEqual(len(created),2)
                self.assertEqual(len(closed),1)
                bridge.session_timer.cancel()
                bridge.expire_session(bridge.session)
                self.assertIsNone(bridge.session)
                self.assertEqual(len(closed),2)

    def test_final_after_read_only_is_not_a_claim_of_executed_test(self):
        calls=[]
        def create(**args):
            calls.append(args)
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content='{"final":{"ok":true}}',tool_calls=[]))],usage=None)
        client=types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)),close=lambda:None)
        req={**self.request,'tools':[{'type':'function','function':{'name':'sh'}},{'type':'function','function':{'name':'read'}}],
             'messages':[*self.request['messages'],{'role':'assistant','tool_calls':[{'id':'read1','function':{'name':'read','arguments':'{}'}}]},{'role':'tool','tool_call_id':'read1','content':'read-only observation'}]}
        status,result,_=b.Bridge(lambda:client,self.catalog).complete(req)
        self.assertEqual(status,502)
        self.assertEqual(result['error']['type'],'controller_protocol_error')
        self.assertEqual(len(calls),2)
        self.assertIn('No external shell command has been observed',calls[-1]['messages'][-1]['content'])

    def test_failed_native_invalid_tool_retains_controller_message_without_execution(self):
        handled, creates, closed = [], [], []
        event={'method':'session/update','params':{'update':{'sessionUpdate':'tool_call_update','status':'failed','title':'invalid',
               'rawInput':{'host_call':'{"name":"apollo_read","arguments":{"path":"add.sh"}}'}}}}
        class Upstream:
            def __init__(self):
                self._acp_cwd='/isolated'
                self.chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=self._create_chat_completion))
            def _handle_server_message(self,msg,**kwargs):
                handled.append(msg['method'])
                return True
            def _create_chat_completion(self,**kwargs):
                creates.append(kwargs)
                self._handle_server_message({'method':'session/request_permission'})
                self._handle_server_message(event)
                return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content='',tool_calls=[]))],usage=None)
            def close(self):closed.append(True)
        req={**self.request,'tools':[{'type':'function','function':{'name':'read'}}]}
        status,result,_=b.Bridge(b.controller_client_class(Upstream),self.catalog).complete(req)
        self.assertEqual(status,200)
        call=result['choices'][0]['message']['tool_calls'][0]['function']
        self.assertEqual(call['name'],'read')
        self.assertEqual(json.loads(call['arguments']),{'path':'add.sh'})
        self.assertEqual(handled,['session/request_permission','session/update'])
        self.assertEqual(len(creates),1)
        self.assertEqual(closed,[True])

    def test_native_command_relay_requires_upstream_permission_rejection(self):
        for rejected in [True,False]:
            with self.subTest(rejected=rejected):
                class Upstream:
                    def _create_chat_completion(self,**kwargs):
                        self._acp_cwd='/isolated'
                        self._handle_server_message({'method':'session/update','params':{'update':{
                            'sessionUpdate':'tool_call_update','toolCallId':'native1','rawInput':{'cwd':'/isolated'}}}})
                        self._handle_server_message({'method':'session/request_permission','params':{'toolCall':{
                            'toolCallId':'native1','kind':'execute','rawInput':{'command':'bash t/run.sh'}}}})
                        self._handle_server_message({'method':'session/update','params':{'update':{
                            'sessionUpdate':'tool_call_update','toolCallId':'native1','status':'failed' if rejected else 'completed',
                            'rawOutput':{'error':'The user rejected permission to use this specific tool call.' if rejected else ''}}}})
                        return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content='',tool_calls=[]))],usage=None)
                    def _handle_server_message(self,msg,**kwargs):return True
                result=b.controller_client_class(Upstream)()._create_chat_completion()
                recovered=b.recovered_controller_completion(result,{'apollo_sh'})
                self.assertEqual(recovered is not None,rejected)
                if rejected:
                    call=recovered['choices'][0]['message']['tool_calls'][0]['function']
                    self.assertEqual(json.loads(call['arguments']),{'cmd':'bash t/run.sh'})
                    self.assertIsNone(b.recovered_controller_completion(result,{'apollo_read'}))

    def test_native_file_intents_are_confined_and_arguments_preserved(self):
        def intent(kind,args):
            return b.native_host_intent({'method':'session/request_permission','params':{'toolCall':{'kind':kind,'rawInput':args}}},'/isolated')
        read=intent('read',{'filePath':'/isolated/add.sh','offset':2,'limit':4})
        self.assertEqual(read['host_call']['arguments'],{'path':'add.sh','from':3,'n':4})
        edit=intent('edit',{'filePath':'add.sh','oldString':'a - b','newString':'a + b','replaceAll':False})
        self.assertEqual(edit['host_call']['arguments'],{'path':'add.sh','old':'a - b','new':'a + b','all':False})
        write=intent('edit',{'filePath':'t/test.sh','content':'exact\nsource\n'})
        self.assertEqual(write['host_call']['arguments'],{'path':'t/test.sh','text':'exact\nsource\n'})
        for path in ['/etc/passwd','../outside','/isolated/../outside','a\\..\\outside','bad\x00path']:
            self.assertIsNone(intent('read',{'filePath':path}))
        self.assertIsNone(intent('execute',{'command':'command','cwd':'/other'}))
        self.assertIsNone(intent('execute',{'command':'command','workdir':'/other'}))
        self.assertIsNone(intent('read',{'filePath':'a','offset':True}))
        self.assertIsNone(intent('other',{'tool':'unknown','arguments':{}}))
        def at_worker(path):
            return b.native_host_intent({'method':'session/request_permission','params':{'toolCall':{
                'kind':'edit','rawInput':{'filePath':path,'oldString':'a - b','newString':'a + b'}}}},'/isolated','/worker/repo')
        self.assertEqual(at_worker('/worker/repo/add.sh')['host_call']['arguments']['path'],'add.sh')
        self.assertIsNone(at_worker('/worker/repo-other/add.sh'))
        self.assertIsNone(at_worker('/worker/repo/../outside'))

    def test_native_recovery_requires_complete_failed_explicit_controller_envelope(self):
        base={'sessionUpdate':'tool_call_update','status':'failed','title':'invalid','rawInput':{'host_call':{'name':'apollo_read','arguments':{'path':'a'}}}}
        def msg(update):return {'method':'session/update','params':{'update':update}}
        self.assertIsNotNone(b.failed_controller_envelope(msg(base)))
        for update in [{**base,'status':'completed'},{**base,'title':'bash'},{**base,'rawInput':{'command':'arbitrary native command'}},
                       {**base,'rawInput':{'tool':'apollo_read','error':'missing arguments'}},{**base,'rawInput':{'host_call':'bad JSON'}},
                       {**base,'rawInput':{'host_call':{},'final':{}}}]:
            self.assertIsNone(b.failed_controller_envelope(msg(update)))
        out=types.SimpleNamespace(controller_messages=[{'host_call':{'name':'unadvertised','arguments':{}}}],usage=None)
        self.assertIsNone(b.recovered_controller_completion(out,{'apollo_read'}))
        self.assertEqual(b.failed_controller_envelope(msg({**base,'rawInput':{'tool':'apollo_write','path':'t/a.sh','text':'exact\n'}})),
                         {'host_call':{'name':'apollo_write','arguments':{'path':'t/a.sh','text':'exact\n'}}})
        self.assertEqual(b.failed_controller_envelope(msg({**base,'rawInput':{'tool':'apollo_read','name':'apollo_read','arguments':'{"path":"a"}'}})),
                         {'host_call':{'name':'apollo_read','arguments':{'path':'a'}}})
        self.assertIsNone(b.failed_controller_envelope(msg({**base,'rawInput':{'tool':'apollo_read','name':'apollo_sh','arguments':'{"path":"a"}'}})))

    def test_denied_native_write_uses_exact_final_input_not_permission_diff(self):
        for actual_path in ['t/add_test.sh','other.sh']:
            with self.subTest(actual_path=actual_path):
                class Upstream:
                    def _create_chat_completion(self,**kwargs):
                        self._acp_cwd='/isolated'
                        self._handle_server_message({'method':'session/request_permission','params':{'toolCall':{
                            'toolCallId':'write1','kind':'edit','rawInput':{'filepath':'/isolated/t/add_test.sh','diff':'rendered diff, not source'}}}})
                        self._handle_server_message({'method':'session/update','params':{'update':{
                            'sessionUpdate':'tool_call_update','toolCallId':'write1','status':'failed','kind':'edit',
                            'rawInput':{'filePath':actual_path,'content':'actual requested source\n'},
                            'rawOutput':{'error':'The user rejected permission to use this specific tool call.'}}}})
                        return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content='',tool_calls=[]))],usage=None)
                    def _handle_server_message(self,msg,**kwargs):return True
                out=b.controller_client_class(Upstream)()._create_chat_completion()
                recovered=b.recovered_controller_completion(out,{'apollo_write'})
                self.assertEqual(recovered is not None,actual_path=='t/add_test.sh')
                if recovered:
                    args=json.loads(recovered['choices'][0]['message']['tool_calls'][0]['function']['arguments'])
                    self.assertEqual(args,{'path':'t/add_test.sh','text':'actual requested source\n'})

    def test_cancelled_permission_rpc_error_preserves_intent_and_unknown_usage(self):
        class Upstream:
            def _create_chat_completion(self,**kwargs):
                self._acp_cwd='/isolated'
                self._handle_server_message({'method':'session/request_permission','params':{'toolCall':{
                    'toolCallId':'cmd1','kind':'execute','rawInput':{'cwd':'/isolated','command':'bash t/run.sh'}}}})
                raise RuntimeError('OpenCode ACP session/prompt failed: Internal error: The user rejected permission to use this specific tool call.')
            def _handle_server_message(self,msg,**kwargs):return True
        out=b.controller_client_class(Upstream)()._create_chat_completion()
        response=b.recovered_controller_completion(out,{'apollo_sh'})
        self.assertEqual(response['choices'][0]['message']['tool_calls'][0]['function']['name'],'apollo_sh')
        self.assertTrue(response['usage_unavailable'])
        self.assertEqual(response['usage']['total_tokens'],0)

    def test_provider_error_is_not_misclassified_as_permission_cancellation(self):
        class Upstream:
            def _create_chat_completion(self,**kwargs):
                self._acp_cwd='/isolated'
                self._handle_server_message({'method':'session/request_permission','params':{'toolCall':{
                    'toolCallId':'cmd1','kind':'execute','rawInput':{'cwd':'/isolated','command':'bash t/run.sh'}}}})
                raise RuntimeError('HTTP 429 provider quota')
            def _handle_server_message(self,msg,**kwargs):return True
        with self.assertRaisesRegex(RuntimeError,'429'):
            b.controller_client_class(Upstream)()._create_chat_completion()

    def test_format_retry_replaces_cancelled_acp_session(self):
        created,closed=[],[]
        def factory():
            n=len(created);created.append(n)
            text='' if n==0 else '{"host_call":{"name":"apollo_read","arguments":{"path":"a"}}}'
            out=types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=text,tool_calls=[]))],usage=None,controller_cancelled=n==0)
            return types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=lambda **_:out)),close=lambda:closed.append(n))
        req={**self.request,'tools':[{'type':'function','function':{'name':'read'}}]}
        status,result,_=b.Bridge(factory,self.catalog).complete(req)
        self.assertEqual(status,200)
        self.assertEqual(created,[0,1])
        self.assertEqual(closed,[0,1])
        self.assertEqual(result['choices'][0]['message']['tool_calls'][0]['function']['name'],'read')

    def test_cancelled_session_is_not_cached_after_recovered_host_action(self):
        closed=[]
        out=types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content='{"host_call":{"name":"apollo_read","arguments":{"path":"a"}}}',tool_calls=[]))],usage=None,controller_cancelled=True)
        client=types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=lambda **_:out)),close=lambda:closed.append(True))
        req={**self.request,'conversation_id':'a'*32,'tools':[{'type':'function','function':{'name':'read'}}]}
        bridge=b.Bridge(lambda:client,self.catalog)
        self.assertEqual(bridge.complete(req)[0],200)
        self.assertIsNone(bridge.session)
        self.assertEqual(closed,[True])

    def test_controller_mcp_catalog_is_advertised_but_never_executes_actions(self):
        sent=[]
        class Upstream:
            def _send_request(self,method,*args,**kwargs):
                sent.append((method,args))
                return {'sessionId':'test'}
        client=b.controller_client_class(Upstream)()
        client.controller_tools=[{'function':{'name':'apollo_sh','description':'External host shell','parameters':{'type':'object','properties':{'cmd':{'type':'string'}},'required':['cmd']}}}]
        existing={'name':'existing','command':'existing-command','args':[],'env':[]}
        client._send_request('session/new',{'cwd':'/isolated','mcpServers':[existing]})
        servers=sent[0][1][0]['mcpServers'];self.assertEqual(servers[0],existing)
        projection=servers[1];self.assertEqual(projection['name'],'apollo');self.assertEqual(projection['command'],'/usr/bin/python3')
        marker=Path(self.tmp.name)/'must-not-exist'
        requests=[{'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2024-11-05'}},
                  {'jsonrpc':'2.0','id':2,'method':'tools/list'},
                  {'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'sh','arguments':{'cmd':f'touch {marker}'}}}]
        proc=subprocess.run([sys.executable,*projection['args']],input='\n'.join(map(json.dumps,requests))+'\n',capture_output=True,text=True,check=True)
        responses=[json.loads(line) for line in proc.stdout.splitlines()]
        self.assertEqual(responses[1]['result']['tools'][0]['name'],'sh')
        self.assertEqual(responses[1]['result']['tools'][0]['inputSchema']['required'],['cmd'])
        self.assertTrue(responses[2]['result']['isError'])
        self.assertIn(b.MCP_CONTROLLER_MARKER,responses[2]['result']['content'][0]['text'])
        self.assertFalse(marker.exists())

    def test_only_advertised_mcp_controller_result_becomes_host_request(self):
        for name in ['apollo_write','unadvertised_write']:
            with self.subTest(name=name):
                class Upstream:
                    def _create_chat_completion(self,**kwargs):
                        self._acp_cwd='/isolated'
                        self._handle_server_message({'method':'session/update','params':{'update':{
                            'sessionUpdate':'tool_call','toolCallId':'mcp1','title':name,'status':'pending','rawInput':{'path':'a','text':'exact source'}}}})
                        self._handle_server_message({'method':'session/update','params':{'update':{
                            'sessionUpdate':'tool_call_update','toolCallId':'mcp1','title':name,'status':'completed','rawInput':{'path':'a','text':'exact source'},
                            'rawOutput':{'output':b.MCP_CONTROLLER_MARKER}}}})
                        return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content='',tool_calls=[]))],usage=None)
                    def _handle_server_message(self,msg,**kwargs):return True
                client=b.controller_client_class(Upstream)();client.controller_tools=[{'function':{'name':'apollo_write'}}]
                out=client._create_chat_completion()
                recovered=b.recovered_controller_completion(out,{'apollo_write'})
                self.assertEqual(recovered is not None,name=='apollo_write')
                if recovered:
                    self.assertEqual(json.loads(recovered['choices'][0]['message']['tool_calls'][0]['function']['arguments']),{'path':'a','text':'exact source'})

    def test_json_host_envelope_and_cache_usage_are_preserved(self):
        def output(text):
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=text, tool_calls=[]))],
                usage=types.SimpleNamespace(prompt_tokens=71, completion_tokens=10, total_tokens=6884,
                    prompt_tokens_details=types.SimpleNamespace(cached_tokens=6803)))
        result = b.host_completion(output('{"host_call":{"name":"apollo_read","arguments":{"path":"x.py"}}}'), {'apollo_read'})
        self.assertEqual(result['choices'][0]['message']['tool_calls'][0]['function']['name'], 'apollo_read')
        self.assertEqual(result['usage']['prompt_tokens'], 6874)
        self.assertEqual(result['usage']['prompt_tokens_details']['cached_tokens'], 6803)
        result = b.host_completion(output('{"final":{"ok":true}}'), {'apollo_read'})
        self.assertEqual(json.loads(result['choices'][0]['message']['content']), {'ok': True})
        with self.assertRaises(ValueError):
            b.host_completion(output('{"host_call":{"name":"unadvertised","arguments":{}}}'), {'apollo_read'})

    def test_unadvertised_or_malformed_tool_call_is_refused(self):
        def output(name, args):
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content='', tool_calls=[types.SimpleNamespace(id='x', function=types.SimpleNamespace(name=name, arguments=args))]))])
        for name, arguments in [('shell', '{}'), ('read', '[]'), ('read', '{bad')]:
            with self.assertRaises((ValueError, json.JSONDecodeError)):
                b.completion_json(output(name, arguments), {'read'})

    def test_bad_schema_refused_before_client_start(self):
        bridge = b.Bridge(lambda: self.fail('must not start'), self.catalog)
        for invalid in [{'messages': []}, {'tools': [{'type': 'builtin'}]}, {'timeout_seconds': True}, {'conversation_id':'invalid'},
                        {'workspace_root':'../outside'},{'workspace_root':'/'},{'workspace_root':'/worker/../outside'}]:
            with self.assertRaises(ValueError):
                bridge.complete({**self.request, **invalid})


if __name__ == '__main__':
    unittest.main()
