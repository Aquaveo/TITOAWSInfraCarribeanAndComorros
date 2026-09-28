#!/bin/bash
# Tests for tito-task.sh with stubs.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TASK="$HERE/../tito-task.sh"
PASS=0
FAIL=0

setup() {
    T=$(mktemp -d)
    mkdir -p "$T/app/EF5/bin" "$T/app/tito_utils/qpe_utils/STREAM-Sat-realtime/extension/realtime/state" "$T/bin"
    printf '#!/bin/bash\n' > "$T/app/EF5/bin/ef5"
    echo 'ef5_max_workers = None' > "$T/app/Caribbean_Comoros_config.py"
    echo 'imerg_pps_email: ""' > "$T/app/tito_utils/qpe_utils/STREAM-Sat-realtime/extension/config_caribbean.yaml"
    cat > "$T/bin/python" <<EOF
#!/bin/bash
echo "\$* latest=\${TITO_UPDATE_LATEST:-unset}" >> "$T/python.log"
EOF
    cat > "$T/bin/entrypoint" <<EOF
#!/bin/bash
echo "\$*" >> "$T/entrypoint.log"
sleep "\${STUB_SLEEP:-0}"
exit "\${STUB_RC:-0}"
EOF
    chmod +x "$T/app/EF5/bin/ef5" "$T/bin/python" "$T/bin/entrypoint"
    touch "$T/python.log" "$T/entrypoint.log"
    export TITO_REGION=Guatemala TITO_S3_BUCKET=b TITO_STATIC_PREFIX=s TITO_OUTPUT_PREFIX=o
    export TITO_APP_DIR="$T/app" TITO_PYTHON="$T/bin/python" TITO_TASK_DIR="$T"
    export TITO_ENTRYPOINT="$T/bin/entrypoint" TITO_LOCK_FILE="$T/cycle.lock"
    export EF5_RUNTIME=local TITO_GPM_EMAIL=ops@example.org EF5_MAX_WORKERS=4
    export TITO_USES_STREAMSAT=0 TITO_STRICT_CHECKS=1
    unset STUB_SLEEP STUB_RC TITO_CYCLE_TIMEOUT_S
}

run_task() {
    OUT=$(bash "$TASK" "$@" 2>&1)
    RC=$?
}

expect() {
    local name="$1" cond="$2"
    if eval "$cond"; then
        PASS=$((PASS + 1))
    else
        FAIL=$((FAIL + 1))
        echo "FAIL: $name"
        echo "  condition: $cond"
        echo "  rc=$RC output:"
        echo "$OUT" | sed 's/^/    /'
    fi
}

setup
run_task
expect "normal cycle succeeds" '[ "$RC" -eq 0 ] && grep -q TITO_CYCLE_OK <<<"$OUT"'
expect "runs operational" 'grep -qx "operational --regions Guatemala" "$T/entrypoint.log"'
expect "fetches then publishes" '[ "$(cut -d" " -f2 "$T/python.log" | tr "\n" " ")" = "fetch-static publish-outputs " ]'
expect "hourly run updates latest" 'grep -q "publish-outputs latest=1" "$T/python.log"'
rm -rf "$T"

setup
flock "$TITO_LOCK_FILE" sleep 5 &
holder=$!
sleep 0.5
run_task
expect "held lock skips" '[ "$RC" -eq 0 ] && grep -q TITO_CYCLE_SKIPPED <<<"$OUT"'
expect "skip runs nothing" '[ ! -s "$T/entrypoint.log" ]'
kill "$holder" 2>/dev/null
wait "$holder" 2>/dev/null
rm -rf "$T"

setup
echo 'ef5_max_workers = 2' > "$T/app/Caribbean_Comoros_config.py"
run_task
expect "strict precondition fails" '[ "$RC" -eq 1 ] && grep -q "TITO_TASK_FAILED: precondition: ef5_max_workers" <<<"$OUT"'
expect "strict failure runs nothing" '[ ! -s "$T/entrypoint.log" ]'
TITO_STRICT_CHECKS=0 run_task
expect "non-strict warns and runs" '[ "$RC" -eq 0 ] && grep -q "WARNING precondition" <<<"$OUT"'
rm -rf "$T"

setup
STUB_SLEEP=5 TITO_CYCLE_TIMEOUT_S=1 run_task
expect "hung run times out" '[ "$RC" -eq 1 ] && grep -q "timed out after 1s" <<<"$OUT"'
expect "timeout skips publish" '! grep -q publish-outputs "$T/python.log"'
rm -rf "$T"

setup
STUB_RC=3 run_task
expect "orchestrator failure reported" '[ "$RC" -eq 1 ] && grep -q "orchestrator exit 3" <<<"$OUT"'
rm -rf "$T"

setup
run_task hindcast "2026-07-22 00:00" "2026-07-22 06:00"
expect "hindcast args pass through" 'grep -qx "hindcast 2026-07-22 00:00 2026-07-22 06:00 --regions Guatemala" "$T/entrypoint.log"'
expect "hindcast keeps latest" 'grep -q "publish-outputs latest=0" "$T/python.log"'
rm -rf "$T"

setup
TITO_USES_STREAMSAT=1 run_task
expect "missing state is cold start" '[ "$RC" -eq 0 ] && grep -q "STREAMSAT_COLD_START: no state file" <<<"$OUT"'
touch "$T/app/tito_utils/qpe_utils/STREAM-Sat-realtime/extension/realtime/state/state_caribbean.pkl"
TITO_USES_STREAMSAT=1 run_task
expect "fresh state is no cold start" '[ "$RC" -eq 0 ] && ! grep -q STREAMSAT_COLD_START <<<"$OUT"'
touch -d "-7 hours" "$T/app/tito_utils/qpe_utils/STREAM-Sat-realtime/extension/realtime/state/state_caribbean.pkl"
TITO_USES_STREAMSAT=1 run_task
expect "stale state is cold start" 'grep -q "STREAMSAT_COLD_START: state older" <<<"$OUT"'
echo 'imerg_pps_email: "someone@example.org"' > "$T/app/tito_utils/qpe_utils/STREAM-Sat-realtime/extension/config_caribbean.yaml"
TITO_USES_STREAMSAT=1 run_task
expect "hardcoded PPS email fails" '[ "$RC" -eq 1 ] && grep -q "imerg_pps_email is hardcoded" <<<"$OUT"'
rm -rf "$T"

echo "tito-task.sh tests: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
