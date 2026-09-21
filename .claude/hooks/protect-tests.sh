#!/bin/bash
# protect-tests.sh - hook PreToolUse: blokir perubahan berkas test saat fase fix (.claude/sdlc-phase berisi "fix"); pasang di .claude/hooks/ project.
# Cakupan: Edit/Write/MultiEdit/NotebookEdit lewat file_path, dan Bash yang menulis ke path test (sed -i, redirect, tee, mv, cp, rm, patch, git checkout/restore); lapis kedua tetap verifikator play test.
IN=$(cat)
PHASE_FILE="${CLAUDE_PROJECT_DIR:-.}/.claude/sdlc-phase"
[ -f "$PHASE_FILE" ] && [ "$(cat "$PHASE_FILE")" = "fix" ] || exit 0
TOOL=$(printf '%s' "$IN" | jq -r '.tool_name // ""')
POLA='(^|/)(test|tests|__tests__|spec)/|_test\.|\.test\.|\.spec\.|_spec\.|(^|/)test_|(^|/)conftest\.py'
if [ "$TOOL" = "Bash" ]; then
  CMD=$(printf '%s' "$IN" | jq -r '.tool_input.command // ""')
  if printf '%s' "$CMD" | grep -Eq "$POLA" && printf '%s' "$CMD" | grep -Eq 'sed -i|>>?|\btee\b|\bmv\b|\bcp\b|\brm\b|\bpatch\b|git (checkout|restore)|truncate'; then
    echo "protect-tests: fase fix - perintah shell ini menulis ke berkas test. Perbaiki kode sumbernya; test yang menurutmu salah dilaporkan di notes, bukan diubah." >&2
    exit 2
  fi
  exit 0
fi
FILE=$(printf '%s' "$IN" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""')
if printf '%s' "$FILE" | grep -Eq "$POLA"; then
  echo "protect-tests: fase fix - berkas test tidak boleh diubah ($FILE). Perbaiki kode sumbernya; test yang menurutmu salah dilaporkan di notes, bukan diubah." >&2
  exit 2
fi
exit 0
