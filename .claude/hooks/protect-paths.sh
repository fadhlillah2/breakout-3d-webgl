#!/bin/bash
# protect-paths.sh - hook PreToolUse: blokir perubahan ke path yang terdaftar di <project>/.claude/protected-paths (satu glob per baris, relatif root, # komentar); selalu aktif, tanpa marker fase.
# Cakupan: Edit/Write/MultiEdit/NotebookEdit lewat file_path, dan Bash yang menulis ke path itu (redirect bertarget, sed -i/tee/mv/cp/rm/patch/git checkout|restore/truncate); prasyarat python3.
ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
LIST="$ROOT/.claude/protected-paths"
[ -f "$LIST" ] || exit 0
IN=$(cat)
SCRIPT=$(cat <<'PY'
import sys, json, re, fnmatch, datetime
root = sys.argv[1].rstrip('/') + '/'
globs = [l.strip() for l in open(sys.argv[2], encoding='utf-8') if l.strip() and not l.startswith('#')]
d = json.load(sys.stdin)
def rel(p):
    return p[len(root):] if p.startswith(root) else p
def kena(p):
    p = rel(p); p = p[2:] if p.startswith('./') else p
    return any(fnmatch.fnmatch(p, g) or fnmatch.fnmatch(p, g.rstrip('/') + '/*') or (g.endswith('/**') and p.startswith(g[:-3] + '/')) for g in globs)
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
            fh.write('%s %s protect-paths %s %s\n' % (datetime.datetime.now().astimezone().isoformat(timespec='seconds'), putusan, tool or '-', ' '.join(saring(target).split())[:120] or '-'))
    except Exception:
        pass
if tool == 'Bash':
    cmd = ti.get('command', '')
    targets = [m.group(1).strip('\'"') for m in re.finditer(r'(?<!&)>{1,2}\s*([^\s&|;]+)', cmd)]
    for verb in ('sed -i', 'tee', 'mv', 'cp', 'rm', 'patch', 'git checkout', 'git restore', 'truncate'):
        for m in re.finditer(r'(^|[;&|]\s*|\s)' + re.escape(verb) + r'\s+([^;&|]*)', cmd):
            targets += [t.strip('\'"') for t in m.group(2).split()]
    hit = [t for t in targets if kena(t)]
    if hit:
        catat('block', ','.join(hit))
        print(f'protect-paths: path terlindungi tidak boleh diubah lewat shell ({", ".join(hit)}). Daftar: .claude/protected-paths; ubah daftarnya lewat lead bila memang perlu.', file=sys.stderr); sys.exit(2)
    catat('allow', cmd)
    sys.exit(0)
f = ti.get('file_path') or ti.get('notebook_path') or ''
if f and kena(f):
    catat('block', rel(f))
    print(f'protect-paths: {rel(f)} terlindungi (.claude/protected-paths) - artefak yang sudah ditutup atau path yang dibekukan; ubah daftarnya lewat lead bila memang perlu.', file=sys.stderr); sys.exit(2)
catat('allow', rel(f))
sys.exit(0)
PY
)
printf '%s' "$IN" | python3 -c "$SCRIPT" "$ROOT" "$LIST"
