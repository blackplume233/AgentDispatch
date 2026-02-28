#!/usr/bin/env bash
set -euo pipefail

# Multi-Worker E2E Integration Test
# 3 workers, 12 tasks, full lifecycle with real artifacts

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TEST_DIR=$(mktemp -d -t dispatch-e2e-XXXXXX)
PORT=$(( RANDOM % 10000 + 20000 ))
LOG_DIR="$PROJECT_ROOT/.trellis/tasks/qa-e2e-multiworker"
RESULTS_FILE="$LOG_DIR/all-results.json"

echo "=== Multi-Worker E2E Test ==="
echo "Project: $PROJECT_ROOT"
echo "TestDir: $TEST_DIR"
echo "Port:    $PORT"
echo "Log:     $LOG_DIR"
echo ""

cleanup() {
  echo ""
  echo "=== Cleanup ==="
  kill "$SERVER_PID" 2>/dev/null || true
  sleep 1
  pkill -P "$SERVER_PID" 2>/dev/null || true
  rm -rf "$TEST_DIR"
  echo "Done."
}
trap cleanup EXIT

# Phase 0: Start Server
echo "--- Phase 0: Starting Server ---"
mkdir -p "$TEST_DIR/data"
DISPATCH_DATA_DIR="$TEST_DIR/data" DISPATCH_SERVER_PORT="$PORT" \
  node "$PROJECT_ROOT/packages/server/dist/index.js" &
SERVER_PID=$!

for i in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/api/v1/tasks" >/dev/null 2>&1; then
    echo "Server ready (attempt $i)"
    break
  fi
  sleep 0.5
done

BASE="http://localhost:$PORT/api/v1"

# Phase 1: Register 3 Worker Clients
echo ""
echo "--- Phase 1: Register 3 Workers ---"

W1_ID=$(curl -sf -X POST "$BASE/clients/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"worker-alpha","host":"localhost:3001","dispatchMode":"tag-auto","agents":[{"id":"claude-a1","type":"worker","status":"idle","capabilities":["code","typescript"]}],"tags":["gpu","fast"]}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "Worker Alpha: $W1_ID"

W2_ID=$(curl -sf -X POST "$BASE/clients/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"worker-beta","host":"localhost:3002","dispatchMode":"tag-auto","agents":[{"id":"claude-b1","type":"worker","status":"idle","capabilities":["docs","analysis"]}],"tags":["cpu","stable"]}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "Worker Beta:  $W2_ID"

W3_ID=$(curl -sf -X POST "$BASE/clients/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"worker-gamma","host":"localhost:3003","dispatchMode":"tag-auto","agents":[{"id":"claude-g1","type":"worker","status":"idle","capabilities":["code","python","ml"]}],"tags":["gpu","ml"]}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "Worker Gamma: $W3_ID"

# Phase 2: Create 12 Diverse Tasks
echo ""
echo "--- Phase 2: Create 12 Tasks ---"

TASK_IDS=()
create_task() {
  local title="$1" desc="$2" tags="$3" prio="$4"
  local id
  id=$(curl -sf -X POST "$BASE/tasks" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"$title\",\"description\":\"$desc\",\"tags\":$tags,\"priority\":\"$prio\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
  TASK_IDS+=("$id")
  echo "  [$prio] $title → $id"
}

create_task "Implement FizzBuzz in TypeScript" "Write a complete FizzBuzz implementation with proper types and unit tests" '["code","typescript"]' "high"
create_task "Write API documentation for /tasks endpoint" "Generate OpenAPI 3.0 spec for all task-related endpoints" '["docs","api"]' "normal"
create_task "Analyze time complexity of sort algorithms" "Compare quicksort, mergesort, heapsort with Big-O analysis and benchmarks" '["analysis","algorithm"]' "normal"
create_task "Create Python data pipeline script" "ETL pipeline: read CSV, transform, output JSON with error handling" '["code","python"]' "high"
create_task "Write unit tests for auth middleware" "Test JWT validation, expiry, role-based access with mocks" '["code","typescript","testing"]' "urgent"
create_task "Design database schema for blog platform" "ERD with users, posts, comments, tags tables and relationships" '["docs","database"]' "normal"
create_task "Implement binary search tree in Python" "BST with insert, delete, search, traversal, and balancing" '["code","python","algorithm"]' "high"
create_task "Write security audit checklist" "OWASP top 10 based checklist for web application review" '["docs","security"]' "low"
create_task "Create React component library starter" "Button, Input, Card components with Storybook stories" '["code","typescript","frontend"]' "normal"
create_task "Benchmark REST vs GraphQL performance" "Load test comparison with 1000 concurrent requests" '["analysis","performance"]' "high"
create_task "Write deployment runbook for Kubernetes" "Step-by-step deployment guide with rollback procedures" '["docs","devops"]' "normal"
create_task "Implement rate limiter with sliding window" "Token bucket rate limiter in TypeScript with Redis backend" '["code","typescript","backend"]' "urgent"

echo ""
echo "Created ${#TASK_IDS[@]} tasks"

# Phase 3: Workers claim and process tasks
echo ""
echo "--- Phase 3: Workers Process Tasks ---"

WORKERS=("$W1_ID:claude-a1:alpha" "$W2_ID:claude-b1:beta" "$W3_ID:claude-g1:gamma")
PROCESSED=0
COMPLETED=0
FAILED=0

echo "[]" > "$RESULTS_FILE"

process_task() {
  local worker_entry="$1" task_id="$2" task_idx="$3"
  local client_id agent_id worker_name
  IFS=: read -r client_id agent_id worker_name <<< "$worker_entry"

  # Step 1: Claim
  local claim_resp
  claim_resp=$(curl -sf -X POST "$BASE/tasks/$task_id/claim" \
    -H "Content-Type: application/json" \
    -d "{\"clientId\":\"$client_id\",\"agentId\":\"$agent_id\"}" 2>&1) || {
    echo "  [$worker_name] SKIP task $task_idx — claim failed"
    return 1
  }
  local title
  title=$(echo "$claim_resp" | python3 -c "import sys,json;print(json.load(sys.stdin).get('title','?'))")
  echo "  [$worker_name] CLAIMED task $task_idx: $title"

  # Step 2: Progress 25%
  curl -sf -X POST "$BASE/tasks/$task_id/progress" \
    -H "Content-Type: application/json" \
    -d "{\"clientId\":\"$client_id\",\"agentId\":\"$agent_id\",\"progress\":25,\"message\":\"Analyzing requirements\"}" >/dev/null

  # Step 3: Progress 50%
  curl -sf -X POST "$BASE/tasks/$task_id/progress" \
    -H "Content-Type: application/json" \
    -d "{\"clientId\":\"$client_id\",\"agentId\":\"$agent_id\",\"progress\":50,\"message\":\"Implementation in progress\"}" >/dev/null

  # Step 4: Progress 75%
  curl -sf -X POST "$BASE/tasks/$task_id/progress" \
    -H "Content-Type: application/json" \
    -d "{\"clientId\":\"$client_id\",\"agentId\":\"$agent_id\",\"progress\":75,\"message\":\"Finalizing and testing\"}" >/dev/null

  # Simulate task 5 failure (test failure path)
  if [ "$task_idx" = "5" ]; then
    curl -sf -X POST "$BASE/tasks/$task_id/cancel" \
      -H "Content-Type: application/json" \
      -d '{"reason":"Simulated failure: auth middleware not available in test env"}' >/dev/null
    echo "  [$worker_name] FAILED task $task_idx (simulated)"
    return 2
  fi

  # Step 5: Create artifacts
  local work_dir="$TEST_DIR/work/$worker_name/$task_id"
  mkdir -p "$work_dir"

  # Create result.json
  cat > "$work_dir/result.json" << EOJSON
{
  "taskId": "$task_id",
  "success": true,
  "summary": "Task '$title' completed by worker $worker_name. Generated output artifacts.",
  "outputs": [
    {
      "name": "main-output",
      "type": "code",
      "path": "output/main.txt",
      "description": "Primary task output for: $title"
    },
    {
      "name": "metadata",
      "type": "report",
      "path": "output/metadata.json",
      "description": "Execution metadata and metrics"
    }
  ],
  "errors": [],
  "metrics": {
    "durationSeconds": $(( RANDOM % 120 + 30 )),
    "filesCreated": $(( RANDOM % 10 + 1 )),
    "linesOfCode": $(( RANDOM % 500 + 50 ))
  }
}
EOJSON

  # Create zip content
  mkdir -p "$work_dir/output"
  echo "# Output for: $title" > "$work_dir/output/main.txt"
  echo "Worker: $worker_name ($agent_id)" >> "$work_dir/output/main.txt"
  echo "Task ID: $task_id" >> "$work_dir/output/main.txt"
  echo "Completed at: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$work_dir/output/main.txt"
  echo "{\"worker\":\"$worker_name\",\"agent\":\"$agent_id\",\"task\":\"$task_id\",\"completedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$work_dir/output/metadata.json"

  # Create zip
  (cd "$work_dir" && zip -rq artifact.zip output/)

  # Step 6: Complete via multipart upload
  local complete_resp
  complete_resp=$(curl -sf -X POST "$BASE/tasks/$task_id/complete" \
    -F "zip=@$work_dir/artifact.zip" \
    -F "result=@$work_dir/result.json" 2>&1) || {
    echo "  [$worker_name] COMPLETE-UPLOAD-FAILED task $task_idx"
    return 3
  }

  local final_status
  final_status=$(echo "$complete_resp" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('status','?'))")
  echo "  [$worker_name] COMPLETED task $task_idx → status=$final_status"

  return 0
}

# Distribute tasks round-robin across 3 workers
for i in $(seq 0 $(( ${#TASK_IDS[@]} - 1 ))); do
  worker_idx=$(( i % 3 ))
  task_id="${TASK_IDS[$i]}"
  task_num=$(( i + 1 ))

  if process_task "${WORKERS[$worker_idx]}" "$task_id" "$task_num"; then
    COMPLETED=$((COMPLETED + 1))
  else
    ret=$?
    if [ "$ret" = "2" ]; then
      FAILED=$((FAILED + 1))
    fi
  fi
  PROCESSED=$((PROCESSED + 1))
done

# Phase 4: Collect All Results
echo ""
echo "--- Phase 4: Collect Results ---"

echo "[" > "$RESULTS_FILE"
first=true
for task_id in "${TASK_IDS[@]}"; do
  resp=$(curl -sf "$BASE/tasks/$task_id")
  if [ "$first" = true ]; then
    first=false
  else
    echo "," >> "$RESULTS_FILE"
  fi
  echo "$resp" >> "$RESULTS_FILE"
done
echo "]" >> "$RESULTS_FILE"

echo "Results saved to: $RESULTS_FILE"

# Phase 5: Summary
echo ""
echo "--- Phase 5: Summary ---"
python3 - "$RESULTS_FILE" << 'PYEOF'
import sys, json

with open(sys.argv[1]) as f:
    tasks = json.load(f)

print(f"Total tasks: {len(tasks)}")
by_status = {}
for t in tasks:
    s = t['status']
    by_status[s] = by_status.get(s, 0) + 1
for s, c in sorted(by_status.items()):
    print(f"  {s}: {c}")

print()
print("| # | Task | Status | Priority | Worker | Progress | Has Artifacts |")
print("|---|------|--------|----------|--------|----------|---------------|")
for i, t in enumerate(tasks, 1):
    worker = t.get('claimedBy', {}).get('agentId', '-')
    progress = t.get('progress', '-')
    has_art = 'yes' if t.get('artifacts') else 'no'
    title = t['title'][:40]
    print(f"| {i} | {title} | {t['status']} | {t['priority']} | {worker} | {progress}% | {has_art} |")

# Print artifact details for completed tasks
print()
print("=== Artifact Details ===")
for t in tasks:
    if t.get('artifacts'):
        a = t['artifacts']
        rj = a.get('resultJson', {})
        print(f"\nTask: {t['title']}")
        print(f"  ZIP: {a['zipSizeBytes']} bytes, SHA256: {a['zipHash'][:16]}...")
        print(f"  Result: success={rj.get('success')}, outputs={len(rj.get('outputs',[]))}")
        print(f"  Summary: {rj.get('summary','')[:80]}")
        if rj.get('metrics'):
            m = rj['metrics']
            print(f"  Metrics: {m.get('durationSeconds',0)}s, {m.get('filesCreated',0)} files, {m.get('linesOfCode',0)} LOC")
PYEOF

echo ""
echo "=== Workers ==="
for w in "${WORKERS[@]}"; do
  IFS=: read -r cid aid wname <<< "$w"
  echo "  $wname ($aid): $(curl -sf "$BASE/clients/$cid" | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'status={d[\"status\"]}, agents={len(d[\"agents\"])}')")"
done

echo ""
echo "=== Test Complete ==="
echo "Processed: $PROCESSED | Completed: $COMPLETED | Failed: $FAILED"
