"""AP182 CAPTURE (scratch checkout of 262d21bc only; never committed). Backend-produced bodies for the FE lifecycle
fixtures, each printed between CAPTURE markers as the serving route would encode it (fastapi jsonable_encoder)."""
import json

from fastapi.encoders import jsonable_encoder

from tests.cyntro_data.test_c4_x5_roundtrip import (  # noqa: F401 -- the X5 world and its fixtures
    P2, _HELD, _activate, _governed_all, _held_catalog_for, cohort, env, moto_cycle, world, x5,
)


def _emit(name, body):
    print(f"<<<CAPTURE {name}>>>" + json.dumps(jsonable_encoder(body), sort_keys=True) + "<<<END>>>")


def test_capture_all_resolved(x5, monkeypatch):
    assert x5.cycle()["state"] == "PROJECTED" and _activate()["state"] == "ACTIVATED"
    _emit("all-resolved", _governed_all(monkeypatch, x5.store))


def test_capture_all_lifecycle_held(x5, monkeypatch):
    x5.state["fetch"]["authored_system:ord"] = {P2: "omit"}
    x5.state["rows"][P2] = dict(_HELD)
    assert x5.cycle()["state"] == "PROJECTED" and _activate()["state"] == "ACTIVATED"
    _emit("all-lifecycle-held", _governed_all(monkeypatch, x5.store))


def test_capture_all_record_missing(x5, monkeypatch):
    _held_catalog_for(monkeypatch, "authored_system:pay")
    assert x5.cycle()["state"] == "PROJECTED" and _activate()["state"] == "ACTIVATED"
    _emit("all-record-missing", _governed_all(monkeypatch, x5.store))


def test_capture_target_catalog_section(tmp_path):
    """The READY section the report cycle publishes (``ready_catalog_section``) over the REAL frozen mapping of the S1
    world: a mixed target (1 eligible + 2 held), an all-held target, a zero-path evaluated target, RDS targets whose
    coverage the stage receipt withheld, and the rest with no manifest entry."""
    from tests.cyntro_data import test_target_catalog_activated as S1
    from unified.attack_map import target_catalog_activated as tca
    from unified.materialization.phase3_attack_paths import TERMINAL_ENI_BINDING_UNKNOWN as REASON

    world_s1 = S1._world(tmp_path)
    membership = S1._membership(world_s1, None)
    stage, rows = S1._stage(vector=S1._vector(world_s1.pointer), record=S1._record(membership),
                            jewels=[("bucket-1", 3), ("empty-bucket", 1), ("orders", 0)],
                            withheld={"RDSCluster": REASON})
    rollup = [
        {**S1._rollup("arn:aws:s3:::bucket-1", kind="S3Bucket", paths=1, observed=1, sev=80), "held_path_count": 2},
        {**S1._rollup("arn:aws:s3:::empty-bucket", kind="S3Bucket", paths=0, sev=0), "held_path_count": 1},
        S1._rollup(S1._rds("cluster", "aurora-a"), kind="RDSCluster", paths=1, observed=1, sev=70),
    ]
    inputs = {**S1._inputs(world_s1, stage=stage, membership=membership, rollup=rollup), "manifest_rows": rows}
    mapping = tca.map_frozen_targets(**inputs)
    assert mapping.mapped, mapping.refusal
    section = tca.ready_catalog_section(mapping, system_name="Orders", admitted=S1.ADMITTED,
                                        computed_at="2026-10-16T00:00:00+00:00")
    _emit("target-catalog-section", section)
