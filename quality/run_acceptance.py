"""Replay controller-held checks against an independent source snapshot."""
import base64
import hashlib
import json
import os
import pathlib
import re
import resource
import shutil
import signal
import subprocess
import sys
import tempfile


def fingerprint(root):
    result = {}
    for path in sorted(root.rglob('*')):
        name = str(path.relative_to(root))
        if path.is_symlink():
            target = os.readlink(path)
            if not path.resolve().is_relative_to(root.resolve()):
                raise ValueError('snapshot symlink escapes source root')
            result[name] = ['symlink', target]
        elif path.is_file():
            result[name] = [path.stat().st_mode & 0o777, hashlib.sha256(path.read_bytes()).hexdigest()]
    return result


def stop_handler(signum, frame):
    raise SystemExit(128+signum)


def child_limits():
    resource.setrlimit(resource.RLIMIT_FSIZE, (16*1024*1024, 16*1024*1024))
    resource.setrlimit(resource.RLIMIT_CPU, (90, 90))


def run(ref, encoded):
    plan = json.loads(base64.b64decode(encoded))
    if not re.fullmatch(r'[0-9a-f]{40,64}', ref):
        raise ValueError('exact candidate commit required')
    with tempfile.TemporaryDirectory(prefix='apollo-accept-') as temporary:
        root = pathlib.Path(temporary)
        source = root/'source'
        environment = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'HOME': str(root/'home'),
                       'TMPDIR': str(root), 'LANG': 'C.UTF-8', 'APOLLO_SOURCE_ROOT': str(source),
                       'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_TERMINAL_PROMPT': '0'}
        (root/'home').mkdir()
        # Copy objects, not hard links or shared gitdirs. No remote credentials.
        subprocess.run(['git', '-c', 'core.hooksPath=/dev/null', 'clone', '--quiet', '--no-checkout', '--no-hardlinks', '.', str(source)], env=environment, check=True, timeout=25, capture_output=True)
        subprocess.run(['git', '-C', str(source), '-c', 'core.hooksPath=/dev/null', 'checkout', '--quiet', '--detach', ref], env=environment, check=True, timeout=15, capture_output=True)
        shutil.rmtree(source/'.git')
        original = fingerprint(source)
        verifier = root/'verify.py'
        verifier.write_text(plan['script'])
        child = None
        with (root/'output').open('w+b') as log:
            try:
                child = subprocess.Popen(['python3', '-I', '-B', str(verifier)], cwd=root, env=environment, stdout=log, stderr=log,
                                         start_new_session=True, preexec_fn=child_limits)
                code = child.wait(timeout=90)
            except subprocess.TimeoutExpired:
                code = 124
            finally:
                if child is not None:
                    try: os.killpg(child.pid, signal.SIGKILL)
                    except ProcessLookupError: pass
                    child.wait()
            log.seek(0, 2)
            size = log.tell()
            log.seek(max(0, size-20000))
            output = log.read().decode('utf-8', 'replace')
        clean = fingerprint(source) == original
        return {'exit': code, 'output': output, 'source_clean': clean, 'revision': ref,
                'script_sha256': hashlib.sha256(plan['script'].encode()).hexdigest()}


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, stop_handler)
    signal.signal(signal.SIGINT, stop_handler)
    print(json.dumps(run(sys.argv[1], sys.argv[2])))
