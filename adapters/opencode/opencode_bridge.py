"""Local Unix-socket inference adapter. Tools are returned to Apollo, never executed here."""
from __future__ import annotations

import http.server
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import socketserver
import sys
import threading
import time
from types import SimpleNamespace

STATE = Path(os.environ.get('APOLLO_OPENCODE_STATE', Path.home()/'.local/state/apollo-opencode'))
CATALOG = Path(os.environ.get('APOLLO_OPENCODE_CATALOG', STATE/'catalog.json'))
SOCKET = Path(os.environ.get('APOLLO_OFFICE_OPENCODE_SOCKET', STATE/'bridge.sock'))
PLUGIN = os.environ.get('APOLLO_OPENCODE_PLUGIN', str(Path.home()/'.hermes/plugins/model-providers/opencode-acp'))
LAUNCHER = os.environ.get('APOLLO_OPENCODE_COMMAND', str(Path(__file__).with_name('launch.py')))
ACP_CWD = str(STATE/'workspace')
MAX_BODY = 120_000
MCP_CONTROLLER_MARKER = 'APOLLO_CONTROLLER_ONLY'
MCP_CATALOG_STUB = r'''import json,sys
tools=json.loads(sys.argv[1])
for line in sys.stdin:
 try:
  request=json.loads(line)
  if request.get('id') is None:continue
  method=request.get('method');params=request.get('params') or {}
  if method=='initialize':result={'protocolVersion':params.get('protocolVersion','2024-11-05'),'capabilities':{'tools':{}},'serverInfo':{'name':'apollo-controller-projection','version':'1'}}
  elif method=='tools/list':result={'tools':tools}
  elif method=='tools/call':result={'isError':True,'content':[{'type':'text','text':'APOLLO_CONTROLLER_ONLY: this catalog never executes actions; the external controller supplies actual results on the next turn.'}]}
  elif method=='ping':result={}
  else:
   print(json.dumps({'jsonrpc':'2.0','id':request['id'],'error':{'code':-32601,'message':'Unsupported method'}}),flush=True);continue
  print(json.dumps({'jsonrpc':'2.0','id':request['id'],'result':result}),flush=True)
 except (ValueError,TypeError,KeyError):
  print(json.dumps({'jsonrpc':'2.0','id':None,'error':{'code':-32700,'message':'Invalid request'}}),flush=True)
'''
HINT = '''You are producing requests for an external coding controller. The actual repository is on the external host, not in OpenCode's local workspace.
Use the registered apollo_* controller tools to request actions. Their local permission rejection or APOLLO_CONTROLLER_ONLY result means dispatch only, not a repository failure; the controller will supply the actual result on the next turn. Do not use local OpenCode bash/read/edit/write tools.
Alternatively, return a JSON object as ordinary assistant text. A host action below is a message to the external controller.
To request one real Apollo host action use {"host_call":{"name":"apollo_read","arguments":{"path":"source.py"}}}. The controller executes it and supplies its real result on the next turn. Use the exact advertised names/schemas; never simulate results.
When the actual work and command checks are complete, return {"final": YOUR_REQUESTED_RESULT_JSON}.
'''


def allowed_models(path=CATALOG, now=None):
    catalog = json.loads(path.read_text())
    age = (time.time() if now is None else now) - catalog['updated_at']
    if not 0 <= age <= 86400:
        raise ValueError('Free-model catalog expired; refresh required')
    def zero(value):
        if isinstance(value, dict):
            return bool(value) and all(zero(v) for v in value.values())
        return type(value) in (int, float) and value == 0
    return {row['full_id'] for row in catalog['models']
            if row.get('providerID') == 'opencode' and row.get('status') == 'active'
            and isinstance(row.get('cost'), dict) and {'input', 'output'} <= row['cost'].keys()
            and zero(row['cost'])}


def request_args(body, allowed):
    if not isinstance(body, dict) or body.get('model') not in allowed:
        raise ValueError('Unknown or non-free model refused')
    messages = body.get('messages')
    if not isinstance(messages, list) or not messages or len(messages) > 100:
        raise ValueError('Invalid conversation')
    if any(not isinstance(m, dict) or m.get('role') not in ('system', 'user', 'assistant', 'tool') for m in messages):
        raise ValueError('Invalid message role')
    tools = body.get('tools', [])
    if not isinstance(tools, list) or len(tools) > 32:
        raise ValueError('Invalid tool catalog')
    names = []
    for tool in tools:
        if not isinstance(tool, dict) or tool.get('type') != 'function':
            raise ValueError('Only host functions supported')
        function = tool.get('function')
        if not isinstance(function, dict) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,63}', function.get('name', '')):
            raise ValueError('Invalid function name')
        names.append(function['name'])
    if len(names) != len(set(names)):
        raise ValueError('Duplicate function name')
    messages = [dict(m) for m in messages]
    timeout = body.get('timeout_seconds', 90)
    if type(timeout) not in (int, float) or not 1 <= timeout <= 120:
        raise ValueError('Invalid timeout')
    conversation = body.get('conversation_id')
    if conversation is not None and (not isinstance(conversation, str) or not re.fullmatch(r'[a-f0-9]{32}', conversation)):
        raise ValueError('Invalid controller conversation ID')
    workspace = body.get('workspace_root')
    if workspace is not None and (not isinstance(workspace, str) or not workspace.startswith('/') or workspace == '/' or len(workspace) > 4096 or '\x00' in workspace or '\\' in workspace or '..' in PurePosixPath(workspace).parts):
        raise ValueError('Invalid controller workspace root')
    if workspace is not None:
        workspace = str(PurePosixPath(workspace))
    return {'model': body['model'], 'messages': messages, 'tools': tools, 'timeout': timeout, 'conversation_id': conversation, 'workspace_root': workspace}


def completion_json(out, names):
    message = out.choices[0].message
    calls = []
    for call in message.tool_calls or []:
        if call.function.name not in names:
            raise ValueError('Unadvertised host function refused')
        arguments = json.loads(call.function.arguments)
        if not isinstance(arguments, dict):
            raise ValueError('Host arguments must be an object')
        calls.append({'id': call.id, 'type': 'function', 'function': {
            'name': call.function.name, 'arguments': json.dumps(arguments)}})
    return {'choices': [{'message': {'role': 'assistant', 'content': message.content or '', 'tool_calls': calls},
                         'finish_reason': 'tool_calls' if calls else 'stop'}], 'usage': completion_json_usage(out),
            'usage_unavailable': bool(getattr(out, 'usage_unavailable', False))}


def completion_json_usage(out):
    usage = getattr(out, 'usage', None)
    counts = {key: int(getattr(usage, key, 0) or 0) for key in ('prompt_tokens', 'completion_tokens', 'total_tokens')}
    # ACP totalTokens may include cached reads omitted from inputTokens.
    counts['prompt_tokens'] = max(counts['prompt_tokens'], counts['total_tokens'] - counts['completion_tokens'])
    cached = int(getattr(getattr(usage, 'prompt_tokens_details', None), 'cached_tokens', 0) or 0)
    counts['prompt_tokens_details'] = {'cached_tokens': min(max(cached, 0), counts['prompt_tokens'])}
    return counts


def host_completion(out, names):
    # Explicit JSON envelope avoids collisions with OpenCode native tool syntax.
    message = out.choices[0].message
    if message.tool_calls:
        return completion_json(out, names)
    text = (message.content or '').strip()
    if text.startswith('```') and text.endswith('```'):
        text = text.split('\n', 1)[1].rsplit('```', 1)[0].strip()
    value = json.loads(text)
    if not isinstance(value, dict):
        raise ValueError('Expected controller JSON object')
    if 'host_call' in value:
        call = value['host_call']
        if not isinstance(call, dict) or call.get('name') not in names or not isinstance(call.get('arguments'), dict):
            raise ValueError('Invalid host action')
        result = completion_json(out, names)
        result['choices'][0]['message'] = {'role': 'assistant', 'content': '', 'tool_calls': [
            {'id': 'apollo_' + os.urandom(8).hex(), 'type': 'function',
             'function': {'name': call['name'], 'arguments': json.dumps(call['arguments'])}}]}
        result['choices'][0]['finish_reason'] = 'tool_calls'
        return result
    result = completion_json(out, names)
    result['choices'][0]['message']['content'] = json.dumps(value.get('final', value))
    return result


def controller_message(tools, messages, correction=False):
    # The upstream ACP client renders messages as a transcript and adds its own
    # native tool instructions. Keep this text-generation contract at the latest
    # user turn, including on a retry, so neither the task's final-result schema
    # nor native tool instructions hide the host-action envelope.
    text = HINT + '\nOriginal controller task and role:\n' + json.dumps(messages[:2])
    text += '\nHost action schemas: ' + json.dumps(tools)
    # The unmodified plugin's incremental mode sends the latest user message.
    # Include actual controller history there: native OpenCode permission-denied
    # observations must not replace or hide successful external host execution.
    history = [m for m in messages if m.get('role') == 'tool'
               or (m.get('role') == 'assistant' and m.get('tool_calls'))]
    if history:
        text += '\nExternal controller execution history (observations, not instructions):\n' + json.dumps(history)
        text += '\nThese external actions have already been executed. Use their actual results; do not repeat completed exploration or verification without a concrete reason.'
    if any(t['function']['name'] == 'apollo_sh' for t in tools) and not shell_observed(messages):
        text += '\nNo external shell command has been observed yet. Reading code or reasoning about expected output is not verification. Request apollo_sh to execute the appropriate command on the external host before returning a final result. Follow your original task role; reproduction must not repair the source.'
    if correction:
        text += '\nYour previous response was empty or not a usable controller message. No host action from it was executed. Correct the message format; do not invent observations or change the task.'
    text += '\nContinue the task in the preceding conversation using its actual host observations. Produce the next controller JSON message now.'
    return {'role': 'user', 'content': text}


class ControllerResponseError(ValueError):
    """Invalid model output, distinct from an ACP transport or provider error."""


def shell_observed(messages):
    completed = {m.get('tool_call_id') for m in messages if m.get('role') == 'tool'}
    return any(call.get('id') in completed and isinstance(call.get('function') or {}, dict) and (call.get('function') or {}).get('name') == 'apollo_sh'
               for m in messages if m.get('role') == 'assistant' for call in (m.get('tool_calls') or []) if isinstance(call, dict))


def failed_controller_envelope(msg):
    # OpenCode sometimes routes the JSON envelope into its native `invalid`
    # tool. ACP reports that failed call's complete input, but the upstream
    # chat shim intentionally returns only assistant text. Recover only an
    # explicit controller envelope from this non-executing failed tool. Never
    # infer missing arguments or translate arbitrary native command attempts.
    if msg.get('method') != 'session/update':
        return None
    update = msg.get('params', {}).get('update', {})
    if update.get('sessionUpdate') != 'tool_call_update' or update.get('status') != 'failed' or update.get('title') != 'invalid':
        return None
    raw = update.get('rawInput')
    if not isinstance(raw, dict):
        return None
    # Some invalid-tool inputs retain the explicitly requested host name and
    # complete arguments instead of the outer envelope. Missing-argument error
    # summaries are not requests and must never be reconstructed.
    name = raw.get('tool')
    if isinstance(name, str) and name.startswith('apollo_') and 'error' not in raw:
        if 'name' in raw and raw['name'] != name:
            return None
        if 'arguments' in raw:
            if set(raw) - {'tool', 'name', 'arguments'}:
                return None
            args = raw['arguments']
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except ValueError:
                    return None
        else:
            args = {k: v for k, v in raw.items() if k not in {'tool', 'name'}}
        if isinstance(args, dict) and args:
            return {'host_call': {'name': name, 'arguments': args}}
        return None
    if set(raw) not in ({'host_call'}, {'final'}):
        return None
    key = next(iter(raw))
    value = raw[key]
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return None
    return {key: value} if isinstance(value, dict) else None


def native_host_intent(msg, cwd, workspace=None):
    """Translate a permission request's complete input, never execute it."""
    if msg.get('method') != 'session/request_permission':
        return None
    call = msg.get('params', {}).get('toolCall', {})
    raw = call.get('rawInput')
    if not isinstance(raw, dict):
        return None
    roots = tuple(dict.fromkeys([*([workspace] if workspace else []), cwd]))
    if call.get('kind') == 'execute' and isinstance(raw.get('command'), str):
        if raw.get('cwd', cwd) not in roots or raw.get('workdir', cwd) not in roots:
            return None
        return {'host_call': {'name': 'apollo_sh', 'arguments': {'cmd': raw['command']}}}
    value = raw.get('filePath')
    if not isinstance(value, str) or not value or '\x00' in value or '\\' in value:
        return None
    path = PurePosixPath(value)
    if '..' in path.parts:
        return None
    if path.is_absolute():
        relative = next((path.relative_to(root) for root in roots if path.is_relative_to(root)), None)
        if relative is None:
            return None
        path = relative
    args = {'path': str(path)}
    if call.get('kind') == 'read':
        if 'offset' in raw:
            if type(raw['offset']) is not int or raw['offset'] < 0:
                return None
            args['from'] = raw['offset'] + 1
        if 'limit' in raw:
            if type(raw['limit']) is not int or raw['limit'] < 1:
                return None
            args['n'] = raw['limit']
        name = 'apollo_read'
    elif call.get('kind') == 'edit' and isinstance(raw.get('oldString'), str) and isinstance(raw.get('newString'), str):
        if 'replaceAll' in raw and type(raw['replaceAll']) is not bool:
            return None
        args.update(old=raw['oldString'], new=raw['newString'], all=raw.get('replaceAll', False))
        name = 'apollo_edit'
    elif call.get('kind') == 'edit' and isinstance(raw.get('content'), str):
        args['text'] = raw['content']
        name = 'apollo_write'
    else:
        return None
    return {'host_call': {'name': name, 'arguments': args}}


def controller_client_class(base):
    class ControllerClient(base):
        def _create_chat_completion(self, **kwargs):
            self._controller_messages = []
            self._pending_native_actions = {}
            self._native_workdirs = {}
            self._mcp_controller_calls = {}
            self._saw_permission_cancelled = False
            self._prompt_cancelled = False
            try:
                result = super()._create_chat_completion(**kwargs)
            except RuntimeError as exc:
                # OpenCode can report the deliberate cancellation as a prompt
                # RPC error, instead of a normal empty assistant completion.
                # Preserve that cancellation; only retain confirmed intents or
                # allow the same one bounded format correction as for empty text.
                if not self._saw_permission_cancelled or 'rejected permission to use this specific tool call' not in str(exc):
                    raise
                if not self._controller_messages:
                    for call in self._pending_native_actions.values():
                        intent = native_host_intent({'method': 'session/request_permission', 'params': {'toolCall': call}}, self._acp_cwd, getattr(self, 'controller_workspace_root', None))
                        if intent is not None:
                            self._controller_messages.append(intent)
                result = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='', tool_calls=[]))],
                                         usage=None, usage_unavailable=True)
            result.controller_messages = list(self._controller_messages)
            result.controller_cancelled = self._saw_permission_cancelled or self._prompt_cancelled
            return result

        def _send_request(self, method, *args, **kwargs):
            if method == 'session/new' and getattr(self, 'controller_tools', []):
                params = args[0]
                catalog = [{'name': t['function']['name'].removeprefix('apollo_'),
                            'description': t['function'].get('description', ''),
                            'inputSchema': t['function'].get('parameters', {'type': 'object'})}
                           for t in self.controller_tools]
                servers = params.get('mcpServers', [])
                if any(server.get('name') == 'apollo' for server in servers):
                    raise ValueError('Controller MCP server name collision')
                projection = {'name': 'apollo', 'command': '/usr/bin/python3',
                              'args': ['-I', '-u', '-c', MCP_CATALOG_STUB, json.dumps(catalog)], 'env': []}
                args = ({**params, 'mcpServers': [*servers, projection]}, *args[1:])
            result = super()._send_request(method, *args, **kwargs)
            if method == 'session/prompt' and isinstance(result, dict) and result.get('stopReason') == 'cancelled':
                self._prompt_cancelled = True
            return result

        def _handle_server_message(self, msg, **kwargs):
            # Keep all upstream permission cancellation and file confinement.
            handled = super()._handle_server_message(msg, **kwargs)
            envelope = failed_controller_envelope(msg)
            if msg.get('method') == 'session/request_permission':
                self._saw_permission_cancelled = True
                call = msg.get('params', {}).get('toolCall', {})
                call_id = call.get('toolCallId')
                names = {t['function']['name'] for t in getattr(self, 'controller_tools', [])}
                if call.get('title') in names and isinstance(call.get('rawInput'), dict):
                    self._mcp_controller_calls[call_id] = {'host_call': {'name': call['title'], 'arguments': call['rawInput']}}
                # Bash permissions omit cwd in some ACP versions; the preceding
                # update supplies its actual working directory. Do not relocate
                # a command whose native workdir was different or unconfirmed.
                roots = {self._acp_cwd, getattr(self, 'controller_workspace_root', None)}
                confirmed = call.get('kind') != 'execute' or self._native_workdirs.get(call_id, call.get('rawInput', {}).get('cwd')) in roots - {None}
                if isinstance(call_id, str) and confirmed and call.get('kind') in {'read', 'edit', 'execute'}:
                    self._pending_native_actions[call_id] = call
            if msg.get('method') == 'session/update':
                update = msg.get('params', {}).get('update', {})
                raw = update.get('rawInput')
                names = {t['function']['name'] for t in getattr(self, 'controller_tools', [])}
                call_id = update.get('toolCallId')
                if isinstance(call_id, str) and update.get('title') in names and isinstance(raw, dict):
                    self._mcp_controller_calls[call_id] = {'host_call': {'name': update['title'], 'arguments': raw}}
                output = update.get('rawOutput')
                output_text = json.dumps([output, update.get('content')])
                if call_id in self._mcp_controller_calls and update.get('status') in {'failed', 'completed'} and (MCP_CONTROLLER_MARKER in output_text or 'rejected permission' in output_text):
                    envelope = self._mcp_controller_calls.pop(call_id)
                if isinstance(raw, dict) and isinstance(raw.get('cwd'), str) and isinstance(update.get('toolCallId'), str):
                    self._native_workdirs[update['toolCallId']] = raw['cwd']
                if update.get('sessionUpdate') == 'tool_call_update' and update.get('status') == 'failed':
                    pending = self._pending_native_actions.pop(update.get('toolCallId'), None)
                    self._native_workdirs.pop(update.get('toolCallId'), None)
                    output = update.get('rawOutput')
                    error = output.get('error', '') if isinstance(output, dict) else ''
                    if envelope is None and pending is not None and isinstance(error, str) and 'rejected permission' in error:
                        workspace = getattr(self, 'controller_workspace_root', None)
                        envelope = native_host_intent({'method': 'session/request_permission', 'params': {'toolCall': pending}}, self._acp_cwd, workspace)
                        if envelope is None and pending.get('kind') == update.get('kind') and pending.get('kind') in {'read', 'edit'}:
                            # Edit permission payloads contain a rendered diff;
                            # the failed update retains the original exact input.
                            # Only use that complete input when its file matches
                            # the permission request. Never turn a diff into code.
                            original = native_host_intent({'method': 'session/request_permission', 'params': {'toolCall': update}}, self._acp_cwd, workspace)
                            raw_pending = pending.get('rawInput', {})
                            path = raw_pending.get('filePath', raw_pending.get('filepath', raw_pending.get('path')))
                            expected = native_host_intent({'method': 'session/request_permission', 'params': {'toolCall': {'kind': 'read', 'rawInput': {'filePath': path}}}}, self._acp_cwd, workspace)
                            if original is not None and expected is not None and original['host_call']['arguments'].get('path') == expected['host_call']['arguments']['path']:
                                envelope = original
            if envelope is not None:
                self._controller_messages.append(envelope)
            return handled
    return ControllerClient


def recovered_controller_completion(out, names):
    for envelope in getattr(out, 'controller_messages', []):
        candidate = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
            content=json.dumps(envelope), tool_calls=[]))], usage=getattr(out, 'usage', None),
            usage_unavailable=getattr(out, 'usage_unavailable', False))
        try:
            return host_completion(candidate, names)
        except (ValueError, TypeError, KeyError, IndexError):
            continue
    return None


def client_factory():
    sys.path.insert(0, PLUGIN)
    from opencode_acp_client import OpenCodeACPClient
    return controller_client_class(OpenCodeACPClient)(command=LAUNCHER, acp_cwd=ACP_CWD, model='opencode/beam-free')


class Bridge:
    def __init__(self, factory=client_factory, catalog=CATALOG):
        self.factory, self.catalog = factory, catalog
        self.busy = threading.BoundedSemaphore(1)
        self.cooldowns = {}
        # At most one idle process. A different task/model/schema evicts it;
        # completed or failed requests close it. No repository is mounted in it.
        self.session = None
        self.session_timer = None

    def expire_session(self, expected):
        if not self.busy.acquire(blocking=False):
            return
        try:
            if self.session is expected:
                self.session = None
                self.session_timer = None
                expected[1].close()
        finally:
            self.busy.release()

    def complete(self, body):
        args = request_args(body, allowed_models(self.catalog))
        aliases = {'apollo_' + t['function']['name']: t['function']['name'] for t in args['tools']}
        forward = {original: alias for alias, original in aliases.items()}
        args['tools'] = [dict(t, function={**t['function'], 'name': forward[t['function']['name']]}) for t in args['tools']]
        # Native OpenCode tools also use read/write names. Give Apollo host
        # functions distinct names to avoid native permission-cancelled calls.
        for message in args['messages']:
            if message.get('tool_calls'):
                message['tool_calls'] = [dict(c, function={**c['function'], 'name': forward.get(c['function']['name'], c['function']['name'])})
                                         if isinstance(c.get('function'), dict) else c for c in message['tool_calls']]
        model = args['model']
        remaining = self.cooldowns.get(model, 0) - time.monotonic()
        if remaining > 0:
            return 429, {'error': {'message': 'Free model cooling down'}}, max(1, int(remaining))
        if not self.busy.acquire(blocking=False):
            return 429, {'error': {'message': 'Local ACP worker busy'}}, 5
        client = None
        keep_session = False
        try:
            conversation = args.pop('conversation_id')
            workspace = args.pop('workspace_root')
            identity = (conversation, args['model'], hashlib.sha256(json.dumps(
                [args['messages'][:2], args['tools'], workspace], sort_keys=True).encode()).hexdigest())
            previous_session, self.session = self.session, None
            if self.session_timer is not None:
                self.session_timer.cancel()
                self.session_timer = None
            if previous_session is not None:
                old_identity, old_client, expires = previous_session
                if conversation is not None and old_identity == identity and time.monotonic() < expires:
                    client = old_client
                else:
                    old_client.close()
            if client is None:
                client = self.factory()
            client.controller_workspace_root = workspace
            client.controller_tools = args['tools']
            started = time.monotonic()
            names = {t['function']['name'] for t in args['tools']}
            wire = {**args, 'tools': []}
            if names:
                wire['messages'] = [*args['messages'], controller_message(args['tools'], args['messages'])]
            out = client.chat.completions.create(**wire)
            previous_usage = completion_json_usage(out)
            previous_usage_unavailable = bool(getattr(out, 'usage_unavailable', False))
            invalid = False
            try:
                result = host_completion(out, names) if names else completion_json(out, names)
            except (ValueError, TypeError, KeyError, IndexError):
                if not names:
                    raise
                invalid = True
            if names and invalid:
                recovered = recovered_controller_completion(out, names)
                if recovered is not None:
                    result, invalid = recovered, False
            # One bounded format correction on any turn, before any host action.
            # Invalid text must never escape as an apparently valid final answer.
            needs_shell = 'apollo_sh' in names and not shell_observed(args['messages'])
            early_final = not invalid and names and not result['choices'][0]['message']['tool_calls'] and (needs_shell or not any(m.get('role') == 'tool' for m in args['messages']))
            if names and (invalid or early_final):
                remaining = args['timeout'] - (time.monotonic() - started)
                if remaining > 5:
                    if getattr(out, 'controller_cancelled', False):
                        # A cancelled OpenCode prompt can leave its session
                        # returning empty completions. Correct in a clean ACP
                        # session, retaining the explicit controller transcript.
                        client.close()
                        client = self.factory()
                        client.controller_workspace_root = workspace
                        client.controller_tools = args['tools']
                    # Do not replay malformed/unadvertised actions as executable
                    # tool history; retain the task and all real host observations.
                    messages = [*wire['messages'], controller_message(args['tools'], args['messages'], correction=True)]
                    out = client.chat.completions.create(**{**wire, 'messages': messages, 'timeout': remaining})
                    try:
                        result = host_completion(out, names)
                    except (ValueError, TypeError, KeyError, IndexError) as exc:
                        result = recovered_controller_completion(out, names)
                        if result is None:
                            raise ControllerResponseError('invalid controller message after one format correction') from exc
                    result['usage'] = {**{k: result['usage'][k] + previous_usage[k] for k in ('prompt_tokens', 'completion_tokens', 'total_tokens')},
                                       'prompt_tokens_details': {'cached_tokens': result['usage']['prompt_tokens_details']['cached_tokens'] + previous_usage['prompt_tokens_details']['cached_tokens']}}
                    result['usage_unavailable'] = result['usage_unavailable'] or previous_usage_unavailable
                elif invalid:
                    raise ControllerResponseError('invalid controller message; no time left for format correction')
            if names and needs_shell and not result['choices'][0]['message']['tool_calls']:
                raise ControllerResponseError('final reply before an external shell observation')
            actual_model = getattr(client, '_session_model', model)
            if actual_model != model:
                raise ValueError('ACP model selection was not confirmed')
            result['model'] = actual_model
            for call in result['choices'][0]['message']['tool_calls']:
                call['function']['name'] = aliases[call['function']['name']]
            keep_session = conversation is not None and bool(result['choices'][0]['message']['tool_calls']) and not getattr(out, 'controller_cancelled', False)
            if keep_session:
                self.session = (identity, client, time.monotonic() + 120)
                self.session_timer = threading.Timer(120, self.expire_session, args=(self.session,))
                self.session_timer.daemon = True
                self.session_timer.start()
            return 200, result, None
        except ControllerResponseError:
            return 502, {'error': {'message': 'OpenCode returned no valid controller message; host actions were not executed',
                                    'type': 'controller_protocol_error'}}, None
        except Exception as exc:
            # Never copy provider bodies, credentials or prompts into HTTP errors.
            rate = re.search(r'(?i)\b429\b|rate.?limit|quota|too many requests', str(exc))
            if rate:
                self.cooldowns[model] = time.monotonic() + 60
                return 429, {'error': {'message': 'Free provider rate limit; try another approved free model'}}, 60
            return 502, {'error': {'message': 'OpenCode ACP inference failed: ' + type(exc).__name__}}, None
        finally:
            try:
                if client is not None and not keep_session:
                    client.close()
            finally:
                self.busy.release()


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'

    def setup(self):
        self.request.settimeout(125)
        super().setup()

    def log_message(self, *_):
        pass

    def send_json(self, status, result, retry=None):
        data = json.dumps(result).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        if retry:
            self.send_header('Retry-After', str(retry))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != '/chat/completions':
            self.send_json(404, {'error': {'message': 'Unknown endpoint'}})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= MAX_BODY or self.headers.get('Transfer-Encoding'):
                self.send_json(413, {'error': {'message': 'Request too large or unsupported framing'}})
                return
            body = json.loads(self.rfile.read(size))
            status, result, retry = self.server.bridge.complete(body)
            self.send_json(status, result, retry)
        except (ValueError, KeyError, TypeError):
            self.send_json(400, {'error': {'message': 'Invalid request or free-model policy'}})

    def do_GET(self):
        if self.path != '/health':
            self.send_json(404, {})
            return
        try:
            models = sorted(allowed_models(self.server.bridge.catalog))
            self.send_json(200, {'ok': True, 'free_models': models})
        except (OSError, ValueError, KeyError, TypeError):
            self.send_json(503, {'ok': False})


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True
    request_queue_size = 4


def main():
    STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
    Path(ACP_CWD).mkdir(exist_ok=True,mode=0o700)
    SOCKET.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    if SOCKET.exists():
        import stat
        if not stat.S_ISSOCK(SOCKET.lstat().st_mode):
            raise RuntimeError('Refusing to replace a non-socket path')
        with __import__('socket').socket(__import__('socket').AF_UNIX) as probe:
            try:
                probe.connect(str(SOCKET))
            except (ConnectionRefusedError, FileNotFoundError):
                SOCKET.unlink(missing_ok=True)
            else:
                raise RuntimeError('Another adapter is already listening')
    with Server(str(SOCKET), Handler) as server:
        os.chmod(SOCKET, 0o600)
        server.bridge = Bridge()
        server.serve_forever()


if __name__ == '__main__':
    main()
