#!/bin/bash
# protect-tests.sh - hook PreToolUse: blokir perubahan berkas test saat fase fix (.claude/sdlc-phase berisi "fix"); pasang di .claude/hooks/ project.
# Cakupan: Edit/Write/MultiEdit/NotebookEdit lewat file_path relatif project, dan Bash yang menulis ke path test (redirect bertarget test, sed -i/tee/mv/cp/rm/patch/git checkout|restore/truncate beracuan path test); prasyarat python3; lapis kedua tetap verifikator play test.
PHASE_FILE="${CLAUDE_PROJECT_DIR:-.}/.claude/sdlc-phase"
[ -f "$PHASE_FILE" ] && [ "$(cat "$PHASE_FILE")" = "fix" ] || exit 0
IN=$(cat)
SCRIPT=$(cat <<'PY'
import sys, json, re, datetime
root = sys.argv[1].rstrip('/') + '/'
d = json.load(sys.stdin)
pola = re.compile(r'(^|[^A-Za-z0-9_.-])(test|tests|__tests__|spec)/|_test\.|\.test\.|\.spec\.|_spec\.|(^|[^A-Za-z0-9_.-])test_|(^|[^A-Za-z0-9_.-])conftest\.py')
def rel(p):
    return p[len(root):] if p.startswith(root) else p
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
            fh.write('%s %s protect-tests %s %s\n' % (datetime.datetime.now().astimezone().isoformat(timespec='seconds'), putusan, tool or '-', ' '.join(saring(target).split())[:120] or '-'))
    except Exception:
        pass
if tool == 'Bash':
    cmd = ti.get('command', '')
    targets = [m.group(1).strip('\'"') for m in re.finditer(r'(?<!&)>{1,2}\s*([^\s&|;]+)', cmd)]
    for verb in ('sed -i', 'tee', 'mv', 'cp', 'rm', 'patch', 'git checkout', 'git restore', 'truncate'):
        for m in re.finditer(r'(^|[;&|]\s*|\s)' + re.escape(verb) + r'\s+([^;&|]*)', cmd):
            targets += [t.strip('\'"') for t in m.group(2).split()]
    hit = [t for t in targets if pola.search(rel(t))]
    if hit:
        catat('block', ','.join(hit))
        print('protect-tests: fase fix - perintah shell ini menulis ke berkas test. Perbaiki kode sumbernya; test yang menurutmu salah dilaporkan di notes, bukan diubah.', file=sys.stderr); sys.exit(2)
    catat('allow', cmd)
    sys.exit(0)
f = ti.get('file_path') or ti.get('notebook_path') or ''
if pola.search(rel(f)):
    catat('block', rel(f))
    print(f'protect-tests: fase fix - berkas test tidak boleh diubah ({rel(f)}). Perbaiki kode sumbernya; test yang menurutmu salah dilaporkan di notes, bukan diubah.', file=sys.stderr); sys.exit(2)
catat('allow', rel(f))
sys.exit(0)
PY
)
printf '%s' "$IN" | python3 -c "$SCRIPT" "${CLAUDE_PROJECT_DIR:-$PWD}"
