"""Bounded, non-executing repository inspection at an exact Git commit."""
import configparser
import hashlib
import json
import pathlib
import os
import re
import shutil
import subprocess
import sys
import urllib.request

MAX_FILES = 32
MAX_BYTES = 56000


def git(*args):
    return subprocess.check_output(['git', *args], timeout=15)


def scan(base, issue):
    if not re.fullmatch(r'[0-9a-f]{40,64}', base):
        raise ValueError('exact base commit required')
    paths = git('ls-tree', '-r', '--name-only', base).decode('utf-8', 'replace').splitlines()
    manifests = {'pyproject.toml', 'package.json', 'Cargo.toml', 'go.mod', 'build.gradle',
                 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts', 'constants.gradle',
                 'gradle.properties', 'Makefile', 'tox.ini', 'pytest.ini', '.gitmodules',
                 'AGENTS.md', 'CONTRIBUTING.md', 'README.md', 'requirements.txt'}
    names = set(re.findall(r'[A-Za-z0-9_.-]+\.(?:java|kt|py|rs|go|js|ts|tsx|c|cpp|h)', issue))
    wanted = [p for p in paths if pathlib.PurePosixPath(p).name in names]
    wanted += sorted((p for p in paths if pathlib.PurePosixPath(p).name in manifests), key=lambda p: (p.count('/'), p))
    wanted += [p for p in paths if p.startswith('.github/workflows/') and p.endswith(('.yml', '.yaml'))][:4]
    files = []
    used = 0
    for path in dict.fromkeys(wanted):
        if len(files) >= MAX_FILES or used >= MAX_BYTES:
            break
        # Reject symlinks/gitlinks; inspect tracked blobs, never local files.
        entry = git('ls-tree', base, '--', path).decode().split()
        if not entry or entry[0] not in ('100644', '100755'):
            continue
        oid = entry[2]
        size = int(git('cat-file', '-s', oid))
        if size > 200000:
            continue
        raw = git('cat-file', 'blob', oid)
        limit = min(20000 if pathlib.PurePosixPath(path).name in names else 4000, MAX_BYTES-used)
        text = raw.decode('utf-8', 'replace')
        location = re.search(re.escape(pathlib.PurePosixPath(path).name)+r':(\d+)', issue)
        if location and len(raw)>limit:
            lines = text.splitlines(keepends=True)
            start = max(0, int(location[1])-65)
            text = ''.join(lines[start:])
        text = text.encode()[:limit].decode('utf-8', 'replace')
        files.append({'path': path, 'content': text, 'sha256': hashlib.sha256(raw).hexdigest(), 'truncated': len(text.encode()) < len(raw)})
        used += len(text.encode())
    unresolved = []
    modules = next((f['content'] for f in files if f['path'] == '.gitmodules'), '')
    parser = configparser.ConfigParser(interpolation=None)
    if modules:
        try:
            parser.read_string(modules)
        except configparser.Error:
            unresolved.append({'reason': 'unreadable or truncated .gitmodules; dependency constraints unresolved'})
            parser = configparser.ConfigParser(interpolation=None)
    # Read constants at the EXACT gitlink commit, not dependency default branch.
    # Credential-free GitHub raw HTTPS only, bounded files and timeouts.
    for section in parser.sections()[:2]:
        path = parser.get(section, 'path', fallback='')
        url = parser.get(section, 'url', fallback='')
        match = re.fullmatch(r'https://github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+?)(?:\.git)?/?', url)
        entry = git('ls-tree', base, '--', path).decode().split() if path else []
        if not match or not entry or entry[0] != '160000':
            continue
        revision = entry[2]
        remote = match[1]
        found = False
        for name in ['constants.gradle']:
            try:
                req = urllib.request.Request(f'https://raw.githubusercontent.com/{remote}/{revision}/{name}')
                with urllib.request.urlopen(req, timeout=5) as res:
                    raw = res.read(8001)
                if len(raw) > 8000:
                    raise ValueError('dependency manifest too large')
                files.append({'path': f'{path}/{name}', 'content': raw.decode(), 'dependency_revision': revision,
                              'sha256': hashlib.sha256(raw).hexdigest(), 'truncated': False})
                found = True
            except Exception:
                pass
        if not found:
            unresolved.append({'path': path, 'revision': revision, 'reason': 'pinned dependency constants unavailable'})
    sdk = []
    desugaring = []
    for f in files:
        for value in re.findall(r'minSdk(?:Version)?\s*(?:[=:]\s*|\(\s*)?(\d+)', f['content']):
            sdk.append({'value': int(value), 'path': f['path'], 'revision': f.get('dependency_revision', base)})
        if re.search(r'coreLibraryDesugaring(?:Enabled)?\s*(?:[=(]\s*)?true|isCoreLibraryDesugaringEnabled\s*=\s*true', f['content']):
            desugaring.append(f['path'])
    tools = {}
    for tool in ['python3', 'java', 'javac', 'node', 'npm', 'cargo', 'go', 'gradle']:
        executable = shutil.which(tool)
        if executable:
            try:
                out = subprocess.run([executable, '-version' if tool in ('java', 'javac') else '--version'], capture_output=True, timeout=3, text=True)
                tools[tool] = (out.stdout+out.stderr).strip()[:180]
            except Exception:
                tools[tool] = 'present; version probe unavailable'
        else:
            tools[tool] = 'missing'
    tools['android_sdk'] = 'present' if any((pathlib.Path(os.environ.get(k, '/nonexistent'))/'platforms').is_dir() for k in ['ANDROID_HOME', 'ANDROID_SDK_ROOT']) else 'missing'
    return {'base': base, 'files': files, 'tools': tools, 'min_sdk': sdk, 'library_desugaring_evidence': desugaring,
            'unresolved_dependencies': unresolved, 'inventory_truncated': len(wanted) > MAX_FILES or used >= MAX_BYTES,
            'test_paths': [p for p in paths if re.search(r'(^|/)(tests?|__tests__)(/|\.)|test_', p)][:60]}


if __name__ == '__main__':
    print(json.dumps(scan(sys.argv[1], sys.argv[2])))
