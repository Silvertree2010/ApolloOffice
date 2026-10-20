import base64
import importlib.util
import json
import os
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

HERE = pathlib.Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE/(name+'.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class QualityIntegration(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = pathlib.Path(self.temp.name)
        self.previous = pathlib.Path.cwd()
        os.chdir(self.repo)
        self.addCleanup(os.chdir, self.previous)
        self.git('init', '-q')
        self.git('config', 'user.name', 'Fixture')
        self.git('config', 'user.email', 'fixture@localhost')

    def git(self, *args):
        return subprocess.check_output(['git', *args], text=True).strip()

    def commit(self):
        self.git('add', '.')
        self.git('commit', '-qm', 'fixture')
        return self.git('rev-parse', 'HEAD')

    def test_preflight_uses_committed_manifest_and_ignores_symlink(self):
        (self.repo/'build.gradle').write_text('android { defaultConfig { minSdkVersion 17 } }')
        (self.repo/'README.md').symlink_to('/etc/hostname')
        base = self.commit()
        (self.repo/'build.gradle').write_text('minSdkVersion 99')
        facts = load('preflight').scan(base, '')
        self.assertEqual(facts['min_sdk'][0]['value'], 17)
        self.assertFalse(any(f['path']=='README.md' for f in facts['files']))

    def test_pinned_submodule_manifest_is_resolved_at_gitlink_not_main(self):
        dependency = self.commit_empty()
        self.git('update-index', '--add', '--cacheinfo', '160000', dependency, 'SharedModules')
        (self.repo/'.gitmodules').write_text('[submodule "SharedModules"]\npath=SharedModules\nurl=https://github.com/example/dependency\n')
        self.git('add', '.gitmodules')
        self.git('commit', '-qm', 'pinned dependency')
        base = self.git('rev-parse', 'HEAD')
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, maximum): return b'minSdkVersion = 17'
        urls = []
        def fetch(req, **kwargs):
            urls.append(req.full_url)
            return Response()
        module = load('preflight')
        with patch.object(module.urllib.request, 'urlopen', fetch):
            facts = module.scan(base, '')
        self.assertIn('/'+dependency+'/constants.gradle', urls[0])
        self.assertEqual(facts['min_sdk'][0]['revision'], dependency)

    def commit_empty(self):
        (self.repo/'base.txt').write_text('fixture')
        return self.commit()

    def test_frozen_verifier_exercises_real_original_and_candidate_without_switching_author_tree(self):
        source = self.repo/'maths.py'
        source.write_text('def add(a,b): return a-b\n')
        base = self.commit()
        source.write_text('def add(a,b): return a+b\n')
        candidate = self.commit()
        script = '''import os,pathlib,runpy
m=runpy.run_path(str(pathlib.Path(os.environ['APOLLO_SOURCE_ROOT'])/'maths.py'))
ok=m['add'](-2,3)==1
print('APOLLO_CHECK:negative_addition:'+('PASS' if ok else 'FAIL'))
raise SystemExit(0 if ok else 1)
'''
        encoded = base64.b64encode(json.dumps({'checks':['negative_addition'], 'script':script}).encode()).decode()
        runner = load('run_acceptance')
        red = runner.run(base, encoded)
        green = runner.run(candidate, encoded)
        self.assertEqual(red['exit'], 1)
        self.assertIn('negative_addition:FAIL', red['output'])
        self.assertEqual(green['exit'], 0)
        self.assertTrue(green['source_clean'])
        self.assertEqual(self.git('rev-parse','HEAD'), candidate)
        self.assertEqual(red['script_sha256'], green['script_sha256'])
        self.assertEqual(self.git('status','--porcelain'), '')
        self.assertEqual(len(self.git('worktree','list').splitlines()), 1)

    def test_stdlib_shadow_cannot_replace_trusted_runner(self):
        (self.repo/'json.py').write_text("raise RuntimeError('stdlib shadow executed')")
        base = self.commit()
        script = "import os\nassert os.environ['APOLLO_SOURCE_ROOT']\nprint('APOLLO_CHECK:runner_isolated:PASS')"
        encoded = base64.b64encode(json.dumps({'script':script}).encode()).decode()
        result = subprocess.run(['python3', '-I', str(HERE/'run_acceptance.py'), base, encoded], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['exit'], 0)

    def test_verifier_source_mutation_is_reported(self):
        (self.repo/'maths.py').write_text('pass\n')
        base = self.commit()
        script="import pathlib,os\np=pathlib.Path(os.environ['APOLLO_SOURCE_ROOT'])/'maths.py'\np.write_text('changed')\nprint('APOLLO_CHECK:mutation:PASS')"
        encoded = base64.b64encode(json.dumps({'script':script}).encode()).decode()
        result = load('run_acceptance').run(base, encoded)
        self.assertFalse(result['source_clean'])
        self.assertEqual((self.repo/'maths.py').read_text(),'pass\n')


if __name__ == '__main__': unittest.main()
