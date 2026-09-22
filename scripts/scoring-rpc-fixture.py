"""Owned fixture seeding/readback/cleanup; refuse every non-local target."""
import json
import os
import re
import sys
import time
from types import SimpleNamespace

if (os.environ.get("GCLOUD_PROJECT") != "demo-aubl-scoring"
        or os.environ.get("FIRESTORE_EMULATOR_HOST") != "127.0.0.1:8188"
        or os.environ.get("FIREBASE_AUTH_EMULATOR_HOST") != "127.0.0.1:9198"):
    raise RuntimeError("Refusing non-local fixture target")

from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client
from scoring_test_application import ScoringTestApplication
from scoring_test_boundary import ScoringTestRegistry

data = json.load(sys.stdin)
run_id = data["runId"]
if not re.fullmatch(r"TEST_RUN_RPC_E2E_[a-f0-9]{32}", run_id):
    raise RuntimeError("Invalid owned fixture ID")
db = Client(project="demo-aubl-scoring", credentials=AnonymousCredentials())
ref = db.collection("scoringTestRuns").document(run_id)
try:
    action = sys.argv[1]
    if action == "seed":
        now = time.time_ns() // 1000000
        run = dict(version=1, runId=run_id, projectId="demo-aubl-scoring", apiOrigin="https://scoring-emulator.invalid",
            status="disabled", createdAtMs=now-1000, approvedAtMs=now-500, expiresAtMs=now+600000,
            approvedByUid="LOCAL_ADMIN", matchIds=["TEST_SCORING_RPC_E2E"],
            participants=[dict(uid="LOCAL_ADMIN", role="admin"), dict(uid=data["uid"], role="scorer")],
            operations=["read", "record", "review"], maxRequests=100)
        manifest = dict(version=1, deploymentVersion="LOCAL_RPC_E2E", stopOwnerUid="LOCAL_ADMIN",
            scenarioByMatch={"TEST_SCORING_RPC_E2E": "full-game"},
            limits=dict(maxRequests=100, maxRequestsPerMinute=100, maxUploadBytes=1048576),
            cleanup=dict(namespace="scoringTestRuns/"+run_id, deleteRunData=True, revokeRunAccess=True, verifyAbsence=True),
            approvalReference="LOCAL_ONLY_AUTOMATED_FIXTURE")
        registry = ScoringTestRegistry(db, project_id="demo-aubl-scoring", api_origin="https://scoring-emulator.invalid")
        ScoringTestApplication(registry).register_from_callable(SimpleNamespace(data=dict(run=run, executionManifest=manifest),
            auth=SimpleNamespace(uid="LOCAL_ADMIN", token=dict(scoringTestOperator=True))))
        ref.update({"status": "active"})
        print(json.dumps({"seeded": True}))
    elif action == "read":
        head_ref = ref.collection("scoringHeads").document("TEST_SCORING_RPC_E2E")
        head = head_ref.get().to_dict()
        manifest = head_ref.collection("manifests").document(head["commitId"]).get().to_dict()
        blocks = {entry["kind"]: ref.collection("uploadBlocks").document(entry["blockId"]).get().to_dict()["body"].decode()
                  for entry in manifest["blocks"]}
        print(json.dumps({"head": head, "blocks": blocks, "receipts": len(list(head_ref.collection("receipts").stream()))}))
    elif action == "stop":
        ref.update({"status": "stopped"}); print(json.dumps({"stopped": True}))
    elif action == "cleanup":
        def remove(document):
            for collection in document.collections():
                for child in collection.stream():
                    remove(child.reference)
            document.delete()
        remove(ref)
        if ref.get().exists or list(ref.collections()):
            raise RuntimeError("Fixture cleanup incomplete")
        print(json.dumps({"cleaned": True}))
    else:
        raise RuntimeError("Unknown fixture operation")
finally:
    db.close()
