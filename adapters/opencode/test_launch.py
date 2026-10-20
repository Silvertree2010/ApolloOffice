import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
import launch
from refresh_catalog import parse_models


class MetadataAndLauncher(unittest.TestCase):
    def test_verbose_metadata_parser_handles_nested_objects(self):
        row = {'id': 'new-stealth', 'providerID': 'opencode',
               'cost': {'input': 0, 'output': 0, 'cache': {'read': 0}}}
        parsed = parse_models('opencode/new-stealth\n' + json.dumps(row) + '\n')
        self.assertEqual(parsed[0]['full_id'], 'opencode/new-stealth')
        self.assertEqual(parsed[0]['cost'], row['cost'])
        for malformed in ('', 'opencode/model\n{invalid'):
            with self.assertRaises(ValueError):
                parse_models(malformed)

    def test_acp_keeps_keys_and_project_outside_sandbox(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)/'state'
            binary = Path(tmp)/'opencode'
            binary.write_text('#!/bin/sh\nexit 0\n')
            binary.chmod(0o700)
            catalog = Path(tmp)/'catalog.json'
            catalog.write_text(json.dumps({'updated_at': time.time(),
                'models': [{'providerID': 'opencode', 'full_id': 'opencode/test-free',
                            'status': 'active', 'cost': {'input': 0, 'output': 0}}]}))
            captured = []
            def execute(path, args, env):
                captured.append((path, args, env))
            with patch.object(launch, 'STATE', state), patch.object(launch, 'CATALOG', catalog), \
                 patch.dict(os.environ, {'APOLLO_OPENCODE_BINARY': str(binary), 'SECRET_API_KEY': 'must-not-inherit', 'OPENCODE_MODEL': 'test-free'}, clear=True), \
                 patch('sys.argv', ['launch.py', 'acp']), \
                 patch.object(launch.shutil, 'which', return_value='/usr/bin/bwrap'), \
                 patch.object(launch.os, 'execve', side_effect=execute):
                launch.main()
            _, args, env = captured[0]
            self.assertNotIn('SECRET_API_KEY', env)
            self.assertNotIn('--bind ' + os.getcwd(), ' '.join(args))
            self.assertIn('--unshare-all', args)
            self.assertEqual(json.loads(env['OPENCODE_CONFIG_CONTENT'])['permission'], {'*': 'ask'})
            self.assertEqual(json.loads(env['OPENCODE_CONFIG_CONTENT'])['model'], 'opencode/test-free')

    def test_unknown_model_and_configuration_override_are_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            binary = Path(tmp)/'opencode'
            binary.write_text('#!/bin/sh\nexit 0\n');binary.chmod(0o700)
            for args in (['acp', '--model', 'paid'], ['acp', '--config=/tmp/user.json']):
                with patch.dict(os.environ, {'APOLLO_OPENCODE_BINARY': str(binary)}, clear=True), \
                     patch('sys.argv', ['launch.py', *args]), \
                     patch.object(launch, 'allowed_models', return_value={'opencode/free'}), \
                     patch.object(launch.os, 'execve') as execute:
                    with self.assertRaises(SystemExit):
                        launch.main()
                    execute.assert_not_called()

    def test_no_bubblewrap_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            binary = Path(tmp)/'opencode'
            binary.write_text('#!/bin/sh\nexit 0\n');binary.chmod(0o700)
            with patch.dict(os.environ, {'APOLLO_OPENCODE_BINARY': str(binary)}, clear=True), \
                 patch.object(launch, 'STATE', Path(tmp)/'state'), \
                 patch.object(launch, 'allowed_models', return_value={'opencode/free'}), \
                 patch('sys.argv', ['launch.py', 'acp']), \
                 patch.object(launch.shutil, 'which', return_value=None):
                with self.assertRaisesRegex(SystemExit, 'bubblewrap'):
                    launch.main()


if __name__ == '__main__':
    unittest.main()
