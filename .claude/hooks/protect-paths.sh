#!/bin/bash
# protect-paths.sh - hook PreToolUse: blokir perubahan ke path yang terdaftar di <project>/.claude/protected-paths (satu glob per baris, relatif root, # komentar); selalu aktif, tanpa marker fase.
# Cakupan: Edit/Write/MultiEdit/NotebookEdit lewat file_path, dan Bash yang menulis ke path itu (redirect bertarget, sed -i/tee/mv/cp/rm/patch/git checkout|restore/truncate); prasyarat python3.
ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
LIST="$ROOT/.claude/protected-paths"
[ -f "$LIST" ] || exit 0
IN=$(cat)
SCRIPT=$(cat <<'PY'
import sys, json, re, fnmatch
root = sys.argv[1].rstrip('/') + '/'
globs = [l.strip() for l in open(sys.argv[2], encoding='utf-8') if l.strip() and not l.startswith('#')]
d = json.load(sys.stdin)
def rel(p):
    return p[len(root):] if p.startswith(root) else p
def kena(p):
    p = rel(p).lstrip('./')
    return any(fnmatch.fnmatch(p, g) or fnmatch.fnmatch(p, g.rstrip('/') + '/*') or (g.endswith('/**') and p.startswith(g[:-3] + '/')) for g in globs)
tool = d.get('tool_name', ''); ti = d.get('tool_input') or {}
if tool == 'Bash':
    cmd = ti.get('command', '')
    targets = [m.group(1) for m in re.finditer(r'(?<![0-9&])>{1,2}\s*([^\s&|;]+)', cmd)]
    for verb in ('sed -i', 'tee', 'mv', 'cp', 'rm', 'patch', 'git checkout', 'git restore', 'truncate'):
        for m in re.finditer(r'(^|[;&|]\s*|\s)' + re.escape(verb) + r'\s+([^;&|]*)', cmd):
            targets += m.group(2).split()
    hit = [t for t in targets if kena(t)]
    if hit:
        print(f'protect-paths: path terlindungi tidak boleh diubah lewat shell ({", ".join(hit)}). Daftar: .claude/protected-paths; ubah daftarnya lewat lead bila memang perlu.', file=sys.stderr); sys.exit(2)
    sys.exit(0)
f = ti.get('file_path') or ti.get('notebook_path') or ''
if f and kena(f):
    print(f'protect-paths: {rel(f)} terlindungi (.claude/protected-paths) - artefak yang sudah ditutup atau path yang dibekukan; ubah daftarnya lewat lead bila memang perlu.', file=sys.stderr); sys.exit(2)
sys.exit(0)
PY
)
printf '%s' "$IN" | python3 -c "$SCRIPT" "$ROOT" "$LIST"
