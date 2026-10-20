#!/usr/bin/env python3
"""Free-only OpenCode process: isolated home, no project mount or inherited keys."""
import json,os,pathlib,shutil,sys
from opencode_bridge import CATALOG,STATE,allowed_models

def main():
 args=sys.argv[1:]
 if not args or args[0] not in ('acp','models','--version','-v'):raise SystemExit('Only ACP, model metadata and version are supported')
 binary=pathlib.Path(os.environ.get('APOLLO_OPENCODE_BINARY') or shutil.which('opencode') or '').resolve()
 if not binary.is_file() or not os.access(binary,os.X_OK) or binary==pathlib.Path(__file__).resolve():raise SystemExit('Set APOLLO_OPENCODE_BINARY to the installed OpenCode executable')
 if args[0] in ('--version','-v'):
  os.execve(str(binary),[str(binary),*args],{'PATH':'/usr/bin:/bin'})
 if any(a.startswith(('--config','--dir','--attach','--agent','--port','--hostname')) or a in ('-f','--file') for a in args[1:]):raise SystemExit('Project, server and configuration overrides are not allowed')
 config={'enabled_providers':['opencode'],'permission':{'*':'ask'},'share':'disabled','autoupdate':False}
 if args[0]=='acp':
  allowed=allowed_models(CATALOG)
  if not allowed:raise SystemExit('No fresh, explicitly zero-price OpenCode models; refresh the catalog')
  requested=os.environ.get('OPENCODE_MODEL','').strip()
  if requested and not requested.startswith('opencode/'):requested='opencode/'+requested
  for i,arg in enumerate(args):
   if arg in ('-m','--model'):
    if i+1>=len(args):raise SystemExit('Missing model')
    requested=args[i+1]
   elif arg.startswith('--model='):requested=arg.split('=',1)[1]
  if requested and requested not in allowed:raise SystemExit('Unknown or non-free model refused')
  default=requested or ('opencode/beam-free' if 'opencode/beam-free' in allowed else sorted(allowed)[0])
  config.update(model=default,small_model=default,provider={'opencode':{'whitelist':[m.split('/',1)[1] for m in sorted(allowed)]}})
 home=STATE/'home';home.mkdir(parents=True,exist_ok=True,mode=0o700)
 env={'PATH':'/usr/bin:/bin','HOME':'/opencode-home','XDG_CONFIG_HOME':'/opencode-home/.config','XDG_DATA_HOME':'/opencode-home/.local/share','XDG_CACHE_HOME':'/opencode-home/.cache','OPENCODE_CONFIG_CONTENT':json.dumps(config),'OPENCODE_DISABLE_PROJECT_CONFIG':'true','OPENCODE_DISABLE_EXTERNAL_PLUGINS':'true','OPENCODE_DISABLE_CLAUDE_CODE':'true','OPENCODE_DISABLE_AUTOUPDATE':'true'}
 cwd=os.getcwd();sandbox=shutil.which('bwrap')
 if not sandbox:raise SystemExit('bubblewrap is required for the isolated adapter')
 command=[sandbox,'--unshare-all','--share-net','--die-with-parent','--new-session','--ro-bind','/usr','/usr','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--dir','/etc']
 for path in ('/etc/ssl/certs','/etc/resolv.conf','/etc/hosts','/etc/nsswitch.conf'):
  if pathlib.Path(path).exists():command.extend(['--ro-bind',path,path])
 command.extend(['--ro-bind',str(binary),'/opencode-bin/opencode','--bind',str(home),'/opencode-home','--dir',cwd,'--chdir',cwd,'--','/opencode-bin/opencode',*args])
 os.execve(sandbox,command,env)
if __name__=='__main__':main()
