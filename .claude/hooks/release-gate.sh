#!/bin/bash
# release-gate.sh - hook PreToolUse: blokir push, PR, release, tag bernama, dan perintah bertoken deploy dari dalam sesi; rute otorisasi = env SDLC_RELEASE_APPROVAL yang ter-export di sesi yang melahirkan hook ini.
# Cakupan: hanya tool Bash; keputusan dicatat ke <project>/.claude/sdlc-hook.log seperti hook lain; prasyarat python3; lapis kedua tetap gate BERHENTI di brief dan status run.
ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
IN=$(cat)
SCRIPT=$(cat <<'PY'
import sys, json, re, os, datetime
root = sys.argv[1].rstrip('/') + '/'
d = json.load(sys.stdin)
tool = d.get('tool_name', ''); ti = d.get('tool_input') or {}
def saring(s):
    # Rahasia inline (header Authorization, VAR=token, -u user:pass, URL user:pass@) tidak boleh mengendap di log hook.
    s = re.sub(r'(?i)((?<![\w-])(?:bearer|basic|token)\s+|(?:authorization|token|api[_-]?key|secret|password|passwd)\s*[:=]\s*(?:(?:bearer|basic|token)\s+)?)\S+', r'\1<REDACTED>', str(s))
    s = re.sub(r'((?:^|\s)(?:-u|-U|--user|--proxy-user)[\s=])\S+', r'\1<REDACTED>', s)
    s = re.sub(r'(//[^\s/@:]+:)[^\s@/]+@', r'\1<REDACTED>@', s)
    return re.sub(r'\b([A-Za-z_]*(?:TOKEN|KEY|SECRET|PASSWORD|PASSWD)[A-Za-z_]*)=\S+', r'\1=<REDACTED>', s)
def catat(putusan, target):
    # Kegagalan menulis log tidak boleh mengubah keputusan hook.
    try:
        with open(root + '.claude/sdlc-hook.log', 'a', encoding='utf-8') as fh:
            fh.write('%s %s release-gate %s %s\n' % (datetime.datetime.now().astimezone().isoformat(timespec='seconds'), putusan, tool or '-', ' '.join(saring(target).split())[:120] or '-'))
    except Exception:
        pass
if tool != 'Bash':
    sys.exit(0)
cmd = ti.get('command', '')
# Prefiks opsi global git ikut dilangkahi: `git -C . push`, `git --no-pager push`, `git -c k=v push` tetap kena.
GITOPT = r'(?:\s+(?:-[cC]\s+\S+|--?[\w-]+(?:=\S+)?))*'
POLA = [(r'\bgit' + GITOPT + r'\s+push\b', 'git push'), (r'\bgh\s+pr\s+(create|merge)\b', 'gh pr create/merge'), (r'\bgh\s+release\b', 'gh release'), (r'\bgit' + GITOPT + r'\s+tag\s+(?!-l\b|--list\b|-n)', 'git tag <nama>'), (r'(^|[^\w-])deploy([^\w-]|$)', 'perintah deploy')]
hit = [nama for pola, nama in POLA if re.search(pola, cmd)]
if not hit:
    catat('allow', cmd); sys.exit(0)
# Otorisasi bernama: env itu ter-export di sesi yang melahirkan hook, jadi terbaca dari os.environ proses ini.
siapa = os.environ.get('SDLC_RELEASE_APPROVAL', '').strip()
if siapa:
    catat('allow', 'otorisasi:' + siapa + ':' + ','.join(hit)); sys.exit(0)
catat('block', ','.join(hit) + '::' + cmd)
print(f'release-gate: {",".join(hit)} adalah gate manusia (PR, push, tag, deploy). Rute otorisasi: release manager bernama meng-export SDLC_RELEASE_APPROVAL=<nama> di sesi yang melahirkan hook ini (mis. jalankan `SDLC_RELEASE_APPROVAL=<nama> claude`, atau export sebelum sesi dibuka) - prefiks env di dalam string perintah tidak dibaca hook; agent tidak melepasnya sendiri.', file=sys.stderr)
sys.exit(2)
PY
)
printf '%s' "$IN" | python3 -c "$SCRIPT" "$ROOT"
