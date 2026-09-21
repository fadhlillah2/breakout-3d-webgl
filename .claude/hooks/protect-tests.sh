#!/bin/bash
# protect-tests.sh - hook PreToolUse: blokir perubahan berkas test saat fase fix (.claude/sdlc-phase berisi "fix"); pasang di .claude/hooks/ project.
# Cakupan: Edit/Write/MultiEdit/NotebookEdit lewat file_path relatif project, dan Bash yang menulis ke path test (redirect bertarget test, sed -i/tee/mv/cp/rm/patch/git checkout|restore/truncate beracuan path test); prasyarat python3; lapis kedua tetap verifikator play test.
PHASE_FILE="${CLAUDE_PROJECT_DIR:-.}/.claude/sdlc-phase"
[ -f "$PHASE_FILE" ] && [ "$(cat "$PHASE_FILE")" = "fix" ] || exit 0
IN=$(cat)
SCRIPT=$(cat <<'PY'
import sys, json, re
root = sys.argv[1].rstrip('/') + '/'
d = json.load(sys.stdin)
pola = re.compile(r'(^|[^A-Za-z0-9_.-])(test|tests|__tests__|spec)/|_test\.|\.test\.|\.spec\.|_spec\.|(^|[^A-Za-z0-9_.-])test_|(^|[^A-Za-z0-9_.-])conftest\.py')
def rel(p):
    return p[len(root):] if p.startswith(root) else p
tool = d.get('tool_name', ''); ti = d.get('tool_input') or {}
if tool == 'Bash':
    cmd = ti.get('command', '')
    targets = [m.group(1) for m in re.finditer(r'(?<![0-9&])>{1,2}\s*([^\s&|;]+)', cmd)]
    for verb in ('sed -i', 'tee', 'mv', 'cp', 'rm', 'patch', 'git checkout', 'git restore', 'truncate'):
        for m in re.finditer(r'(^|[;&|]\s*|\s)' + re.escape(verb) + r'\s+([^;&|]*)', cmd):
            targets += m.group(2).split()
    if any(pola.search(rel(t)) for t in targets):
        print('protect-tests: fase fix - perintah shell ini menulis ke berkas test. Perbaiki kode sumbernya; test yang menurutmu salah dilaporkan di notes, bukan diubah.', file=sys.stderr); sys.exit(2)
    sys.exit(0)
f = ti.get('file_path') or ti.get('notebook_path') or ''
if pola.search(rel(f)):
    print(f'protect-tests: fase fix - berkas test tidak boleh diubah ({rel(f)}). Perbaiki kode sumbernya; test yang menurutmu salah dilaporkan di notes, bukan diubah.', file=sys.stderr); sys.exit(2)
sys.exit(0)
PY
)
printf '%s' "$IN" | python3 -c "$SCRIPT" "${CLAUDE_PROJECT_DIR:-$PWD}"
