import json, pytest, sys
import tests.test_attack_path_evidence_contract as t

def test_capture(aws, gated):
    t._publish(aws, t.A, t.A_VERSION); t._publish(aws, t.B, t.B_VERSION)
    gated.versions.update({(t.A[0], t.A[1]): t.A_VERSION, (t.B[0], t.B[1]): t.B_VERSION})
    out = {}
    for scope in (t.A, t.B):
        r = gated(scope, "/payments"); assert r.status_code == 200
        out[scope[0]] = r.json()
    open("/private/tmp/claude-501/-Users-admin-Documents-Eltro-Platfrom-saferemediate-backend--claude-worktrees-cf01-semantic-layer-onboarding-1b467f/5a66b874-cefb-416b-bcc8-951ff3d0c785/scratchpad/captured-iap-payments.json", "w").write(json.dumps(out, indent=1, sort_keys=True))
