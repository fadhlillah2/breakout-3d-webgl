#!/bin/bash
# protect-tests.sh - hook PreToolUse: blokir edit berkas test saat fase fix (.claude/sdlc-phase berisi "fix"); pasang di .claude/hooks/ project.
IN=$(cat)
PHASE_FILE="${CLAUDE_PROJECT_DIR:-.}/.claude/sdlc-phase"
[ -f "$PHASE_FILE" ] && [ "$(cat "$PHASE_FILE")" = "fix" ] || exit 0
FILE=$(printf '%s' "$IN" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""')
case "$FILE" in
  */test/*|*/tests/*|*/__tests__/*|*/spec/*|*_test.*|*.test.*|*.spec.*|*/test_*)
    echo "protect-tests: fase fix - berkas test tidak boleh diubah ($FILE). Perbaiki kode sumbernya; test yang menurutmu salah dilaporkan di notes, bukan diubah." >&2
    exit 2;;
esac
exit 0
