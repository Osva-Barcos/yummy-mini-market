#!/usr/bin/env bash
# Corre la suite e2e (test/**/*.e2e-spec.ts vía jest) antes de cualquier `git push`
# ejecutado por Claude Code. Si falla, bloquea el push devolviendo permissionDecision: deny.
output=$(npm test 2>&1)
code=$?

if [ $code -ne 0 ]; then
  tail_output=$(printf '%s' "$output" | tail -c 4000)
  node -e "
    const reason = process.argv[1];
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'Los tests automatizados (npm test) fallaron. Push bloqueado hasta corregirlos.\n\n' + reason
      }
    }));
  " "$tail_output"
fi

exit 0
