# Backend Build Commands (Reference Only)

These commands are for building the full backend architecture. **Do not run automatically** - review and adapt for your backend repo.

---

## 1. Directory Structure

```bash
# Run in your backend repo root
mkdir -p collectors normalizers analyzers engine routers workers database/migrations models scripts

# Collector modules
touch collectors/__init__.py
touch collectors/cloudtrail_collector.py
touch collectors/flowlogs_collector.py
touch collectors/s3_access_collector.py
touch collectors/config_collector.py

# Normalizer modules
touch normalizers/__init__.py
touch normalizers/observations.py
touch normalizers/allowed_state.py

# Analyzer modules
touch analyzers/__init__.py
touch analyzers/iam_analyzer.py
touch analyzers/sg_analyzer.py
touch analyzers/nacl_analyzer.py
touch analyzers/s3_analyzer.py

# Engine
touch engine/__init__.py
touch engine/gap_engine.py

# Routers
touch routers/__init__.py
touch routers/issues.py
touch routers/simulate.py
touch routers/remediate.py

# Workers
touch workers/__init__.py
touch workers/ingestion_worker.py
touch workers/analysis_worker.py

# Database
touch database/__init__.py
touch models/__init__.py
touch models/schema.py
```

---

## 2. Requirements (append to requirements.txt)

```bash
cat >> requirements.txt << 'EOF'

# PostgreSQL + TimescaleDB
psycopg2-binary>=2.9.9
asyncpg>=0.29.0

# SQLAlchemy ORM
sqlalchemy>=2.0.23
alembic>=1.13.0

# APScheduler for workers
apscheduler>=3.10.4

# AWS SDK (if not already present)
boto3>=1.34.0
EOF
```

---

## 3. Database Schema Migration

```sql
-- File: database/migrations/001_initial_schema.sql

-- Enable TimescaleDB extension (optional, comment out if not using)
-- CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Systems table
CREATE TABLE IF NOT EXISTS systems (
    system_id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    tags JSONB,
    env VARCHAR(50),
    region VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Resources table
CREATE TABLE IF NOT EXISTS resources (
    resource_id VARCHAR(512) PRIMARY KEY,
    resource_arn VARCHAR(512),
    type VARCHAR(100) NOT NULL,
    system_id VARCHAR(255) REFERENCES systems(system_id),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resources_system ON resources(system_id);
CREATE INDEX idx_resources_type ON resources(type);

-- Telemetry coverage tracking
CREATE TABLE IF NOT EXISTS telemetry_coverage (
    system_id VARCHAR(255) NOT NULL,
    plane VARCHAR(50) NOT NULL,
    coverage_pct DECIMAL(5,2),
    last_seen TIMESTAMPTZ,
    details JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (system_id, plane)
);

-- Observations (core event table)
CREATE TABLE IF NOT EXISTS observations (
    id BIGSERIAL,
    ts TIMESTAMPTZ NOT NULL,
    system_id VARCHAR(255) NOT NULL,
    resource_id VARCHAR(512) NOT NULL,
    plane VARCHAR(50) NOT NULL,
    direction VARCHAR(50),
    action VARCHAR(255) NOT NULL,
    actor_type VARCHAR(50),
    actor_id VARCHAR(512),
    target_id VARCHAR(512),
    count INTEGER DEFAULT 1,
    evidence JSONB,
    PRIMARY KEY (id, ts)
);

-- Convert to hypertable (TimescaleDB only)
-- SELECT create_hypertable('observations', 'ts', if_not_exists => TRUE);

CREATE INDEX idx_obs_system_resource_plane_ts ON observations(system_id, resource_id, plane, ts);
CREATE INDEX idx_obs_system_plane_action_ts ON observations(system_id, plane, action, ts);
CREATE INDEX idx_obs_actor_ts ON observations(actor_id, ts) WHERE actor_id IS NOT NULL;

-- Snapshots table
CREATE TABLE IF NOT EXISTS snapshots (
    snapshot_id VARCHAR(255) PRIMARY KEY,
    system_id VARCHAR(255) NOT NULL,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_versions JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snapshots_system ON snapshots(system_id);
CREATE INDEX idx_snapshots_ts ON snapshots(ts DESC);

-- Allowed entries (expanded policy/rules)
CREATE TABLE IF NOT EXISTS allowed_entries (
    entry_id SERIAL PRIMARY KEY,
    snapshot_id VARCHAR(255) NOT NULL REFERENCES snapshots(snapshot_id),
    system_id VARCHAR(255) NOT NULL,
    resource_id VARCHAR(512) NOT NULL,
    plane VARCHAR(50) NOT NULL,
    direction VARCHAR(50),
    action VARCHAR(255) NOT NULL,
    scope_type VARCHAR(50),
    scope_value TEXT,
    port_from INTEGER,
    port_to INTEGER,
    raw JSONB,
    hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_allowed_snapshot ON allowed_entries(snapshot_id, system_id, resource_id, plane);
CREATE INDEX idx_allowed_lookup ON allowed_entries(system_id, resource_id, plane, action);
CREATE INDEX idx_allowed_hash ON allowed_entries(hash);

-- Issues table
CREATE TABLE IF NOT EXISTS issues (
    issue_id VARCHAR(255) PRIMARY KEY,
    system_id VARCHAR(255) NOT NULL,
    resource_id VARCHAR(512) NOT NULL,
    type VARCHAR(100) NOT NULL,
    severity VARCHAR(50),
    confidence DECIMAL(5,2),
    status VARCHAR(50) DEFAULT 'OPEN',
    allowed JSONB,
    observed_summary JSONB,
    recommendation JSONB,
    stable_key VARCHAR(512) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_issues_system_status ON issues(system_id, status);
CREATE INDEX idx_issues_type_severity ON issues(type, severity);
CREATE INDEX idx_issues_stable_key ON issues(stable_key);

-- Executions table (for tracking remediations)
CREATE TABLE IF NOT EXISTS executions (
    execution_id VARCHAR(255) PRIMARY KEY,
    issue_id VARCHAR(255) REFERENCES issues(issue_id),
    snapshot_id VARCHAR(255) REFERENCES snapshots(snapshot_id),
    status VARCHAR(50) DEFAULT 'PENDING',
    action_taken JSONB,
    result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_executions_issue ON executions(issue_id);
CREATE INDEX idx_executions_status ON executions(status);
```

---

## 4. Database Connection Module

```python
# File: database/__init__.py

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool

DATABASE_URL = os.getenv('DATABASE_URL') or os.getenv('POSTGRES_URL')

engine = None
SessionLocal = None

if DATABASE_URL:
    # Fix for SQLAlchemy 2.0
    if DATABASE_URL.startswith('postgres://'):
        DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)

    engine = create_engine(
        DATABASE_URL,
        poolclass=QueuePool,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
else:
    print("⚠️  DATABASE_URL not set")

def get_db():
    """FastAPI dependency for database sessions"""
    if SessionLocal is None:
        raise RuntimeError("Database not configured")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

---

## 5. SQLAlchemy Models

```python
# File: models/schema.py

from sqlalchemy import Column, String, Integer, DECIMAL, DateTime, JSON, BigInteger, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func

Base = declarative_base()

class System(Base):
    __tablename__ = 'systems'
    system_id = Column(String(255), primary_key=True)
    name = Column(String(255), nullable=False)
    tags = Column(JSON)
    env = Column(String(50))
    region = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Resource(Base):
    __tablename__ = 'resources'
    resource_id = Column(String(512), primary_key=True)
    resource_arn = Column(String(512))
    type = Column(String(100), nullable=False)
    system_id = Column(String(255))
    metadata = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Observation(Base):
    __tablename__ = 'observations'
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    ts = Column(DateTime(timezone=True), nullable=False, index=True)
    system_id = Column(String(255), nullable=False)
    resource_id = Column(String(512), nullable=False)
    plane = Column(String(50), nullable=False)  # IAM|NETWORK|DATA
    direction = Column(String(50))  # INGRESS|EGRESS|NONE
    action = Column(String(255), nullable=False)
    actor_type = Column(String(50))  # principal|ip|eni
    actor_id = Column(String(512))
    target_id = Column(String(512))
    count = Column(Integer, default=1)
    evidence = Column(JSON)

class Snapshot(Base):
    __tablename__ = 'snapshots'
    snapshot_id = Column(String(255), primary_key=True)
    system_id = Column(String(255), nullable=False)
    ts = Column(DateTime(timezone=True), server_default=func.now())
    source_versions = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AllowedEntry(Base):
    __tablename__ = 'allowed_entries'
    entry_id = Column(Integer, primary_key=True, autoincrement=True)
    snapshot_id = Column(String(255), nullable=False)
    system_id = Column(String(255), nullable=False)
    resource_id = Column(String(512), nullable=False)
    plane = Column(String(50), nullable=False)
    direction = Column(String(50))
    action = Column(String(255), nullable=False)
    scope_type = Column(String(50))  # cidr|principal|any|sg|prefixlist
    scope_value = Column(Text)
    port_from = Column(Integer)
    port_to = Column(Integer)
    raw = Column(JSON)
    hash = Column(String(64))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Issue(Base):
    __tablename__ = 'issues'
    issue_id = Column(String(255), primary_key=True)
    system_id = Column(String(255), nullable=False)
    resource_id = Column(String(512), nullable=False)
    type = Column(String(100), nullable=False)
    severity = Column(String(50))
    confidence = Column(DECIMAL(5,2))
    status = Column(String(50), default='OPEN')
    allowed = Column(JSON)
    observed_summary = Column(JSON)
    recommendation = Column(JSON)
    stable_key = Column(String(512), unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Execution(Base):
    __tablename__ = 'executions'
    execution_id = Column(String(255), primary_key=True)
    issue_id = Column(String(255))
    snapshot_id = Column(String(255))
    status = Column(String(50), default='PENDING')
    action_taken = Column(JSON)
    result = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))
```

---

## 6. Gap Engine Core

```python
# File: engine/gap_engine.py

from typing import List, Dict, Set, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text
import hashlib

class GapEngine:
    """Core gap analysis engine - finds unused allowed entries"""

    def __init__(self, db: Session):
        self.db = db

    def analyze_resource(
        self,
        system_id: str,
        resource_id: str,
        plane: str,
        lookback_days: int = 90
    ) -> List[Dict]:
        """
        Find unused allowed entries for a resource.
        Returns list of issues (unused rules/permissions).
        """
        cutoff = datetime.utcnow() - timedelta(days=lookback_days)

        # Get latest snapshot for this system
        snapshot = self.db.execute(text("""
            SELECT snapshot_id FROM snapshots
            WHERE system_id = :system_id
            ORDER BY ts DESC LIMIT 1
        """), {"system_id": system_id}).fetchone()

        if not snapshot:
            return []

        snapshot_id = snapshot[0]

        # Get all allowed entries for this resource
        allowed = self.db.execute(text("""
            SELECT entry_id, action, scope_type, scope_value,
                   port_from, port_to, direction, raw, hash
            FROM allowed_entries
            WHERE snapshot_id = :snapshot_id
              AND system_id = :system_id
              AND resource_id = :resource_id
              AND plane = :plane
        """), {
            "snapshot_id": snapshot_id,
            "system_id": system_id,
            "resource_id": resource_id,
            "plane": plane
        }).fetchall()

        # Get observed actions in the lookback window
        observed = self.db.execute(text("""
            SELECT DISTINCT action, actor_id, direction
            FROM observations
            WHERE system_id = :system_id
              AND resource_id = :resource_id
              AND plane = :plane
              AND ts >= :cutoff
        """), {
            "system_id": system_id,
            "resource_id": resource_id,
            "plane": plane,
            "cutoff": cutoff
        }).fetchall()

        observed_set = set()
        for obs in observed:
            observed_set.add((obs.action, obs.actor_id, obs.direction))

        # Find unused allowed entries
        unused = []
        for entry in allowed:
            if not self._entry_was_used(entry, observed_set, plane):
                unused.append({
                    "entry_id": entry.entry_id,
                    "action": entry.action,
                    "scope_type": entry.scope_type,
                    "scope_value": entry.scope_value,
                    "port_from": entry.port_from,
                    "port_to": entry.port_to,
                    "direction": entry.direction,
                    "raw": entry.raw,
                    "hash": entry.hash
                })

        return unused

    def _entry_was_used(self, entry, observed_set: Set, plane: str) -> bool:
        """Check if an allowed entry was used by any observation"""

        if plane == "NETWORK":
            # For network, check port range + direction + source
            for action, actor_id, direction in observed_set:
                if self._network_rule_matches(entry, action, actor_id, direction):
                    return True
            return False

        elif plane == "IAM":
            # For IAM, check action match
            for action, actor_id, direction in observed_set:
                if self._iam_action_matches(entry.action, action):
                    return True
            return False

        elif plane == "DATA":
            # For S3/data, check action + principal
            for action, actor_id, direction in observed_set:
                if self._data_entry_matches(entry, action, actor_id):
                    return True
            return False

        return False

    def _network_rule_matches(self, entry, action: str, actor_id: str, direction: str) -> bool:
        """Check if a network observation matches an allowed rule"""
        # action format: "tcp:443" or "udp:53"
        if entry.direction and entry.direction != direction:
            return False

        parts = action.split(":")
        if len(parts) != 2:
            return False

        proto, port_str = parts
        try:
            port = int(port_str)
        except ValueError:
            return False

        # Check port range
        if entry.port_from and entry.port_to:
            if not (entry.port_from <= port <= entry.port_to):
                return False

        # Check scope (CIDR match)
        if entry.scope_type == "cidr" and entry.scope_value:
            if not self._ip_in_cidr(actor_id, entry.scope_value):
                return False

        return True

    def _iam_action_matches(self, allowed_action: str, observed_action: str) -> bool:
        """Check if observed IAM action matches allowed (with wildcards)"""
        if allowed_action == "*":
            return True
        if allowed_action.endswith(":*"):
            service = allowed_action[:-2]
            return observed_action.startswith(service + ":")
        return allowed_action.lower() == observed_action.lower()

    def _data_entry_matches(self, entry, action: str, actor_id: str) -> bool:
        """Check if observed data action matches allowed entry"""
        if not self._iam_action_matches(entry.action, action):
            return False
        if entry.scope_type == "principal" and entry.scope_value:
            if entry.scope_value != "*" and entry.scope_value != actor_id:
                return False
        return True

    def _ip_in_cidr(self, ip: str, cidr: str) -> bool:
        """Check if IP is in CIDR range"""
        import ipaddress
        try:
            return ipaddress.ip_address(ip) in ipaddress.ip_network(cidr, strict=False)
        except ValueError:
            return False

    def generate_stable_key(self, system_id: str, resource_id: str,
                           issue_type: str, entry_hash: str) -> str:
        """Generate stable key for issue deduplication"""
        raw = f"{system_id}:{resource_id}:{issue_type}:{entry_hash}"
        return hashlib.sha256(raw.encode()).hexdigest()[:32]
```

---

## 7. Security Group Analyzer

```python
# File: analyzers/sg_analyzer.py

from typing import List, Dict
from sqlalchemy.orm import Session
from engine.gap_engine import GapEngine
import uuid
from datetime import datetime

class SGAnalyzer:
    """Analyzes Security Groups for unused inbound rules"""

    def __init__(self, db: Session):
        self.db = db
        self.engine = GapEngine(db)

    def analyze(self, system_id: str, sg_id: str, lookback_days: int = 90) -> List[Dict]:
        """
        Analyze a security group for unused inbound rules.
        Returns list of issues to upsert.
        """
        unused_entries = self.engine.analyze_resource(
            system_id=system_id,
            resource_id=sg_id,
            plane="NETWORK",
            lookback_days=lookback_days
        )

        issues = []
        for entry in unused_entries:
            stable_key = self.engine.generate_stable_key(
                system_id, sg_id, "SG_UNUSED_INBOUND_RULE", entry["hash"]
            )

            issue = {
                "issue_id": f"issue-{uuid.uuid4().hex[:12]}",
                "system_id": system_id,
                "resource_id": sg_id,
                "type": "SG_UNUSED_INBOUND_RULE",
                "severity": self._calculate_severity(entry),
                "confidence": 0.85,
                "status": "OPEN",
                "allowed": entry,
                "observed_summary": {
                    "lookback_days": lookback_days,
                    "hits": 0,
                    "message": f"No traffic observed for this rule in {lookback_days} days"
                },
                "recommendation": {
                    "action": "remove_rule",
                    "description": f"Remove unused inbound rule: {entry['action']} from {entry['scope_value']}"
                },
                "stable_key": stable_key,
                "created_at": datetime.utcnow()
            }
            issues.append(issue)

        return issues

    def _calculate_severity(self, entry: Dict) -> str:
        """Calculate severity based on rule scope"""
        scope = entry.get("scope_value", "")

        # 0.0.0.0/0 or ::/0 = CRITICAL
        if scope in ["0.0.0.0/0", "::/0"]:
            return "CRITICAL"

        # /8 or larger = HIGH
        if "/" in scope:
            try:
                prefix = int(scope.split("/")[1])
                if prefix <= 16:
                    return "HIGH"
                elif prefix <= 24:
                    return "MEDIUM"
            except (ValueError, IndexError):
                pass

        return "LOW"
```

---

## 8. VPC Flow Logs Collector

```python
# File: collectors/flowlogs_collector.py

import boto3
from datetime import datetime, timedelta
from typing import List, Dict, Generator
import gzip
import json

class FlowLogsCollector:
    """Collects VPC Flow Logs and converts to observations"""

    def __init__(self, region: str = None):
        self.logs_client = boto3.client('logs', region_name=region)
        self.ec2_client = boto3.client('ec2', region_name=region)
        self._eni_to_sg_cache = {}

    def collect(
        self,
        log_group: str,
        start_time: datetime,
        end_time: datetime = None
    ) -> Generator[Dict, None, None]:
        """
        Collect flow logs and yield observation records.
        """
        end_time = end_time or datetime.utcnow()

        # Query CloudWatch Logs
        paginator = self.logs_client.get_paginator('filter_log_events')

        for page in paginator.paginate(
            logGroupName=log_group,
            startTime=int(start_time.timestamp() * 1000),
            endTime=int(end_time.timestamp() * 1000)
        ):
            for event in page.get('events', []):
                parsed = self._parse_flow_log(event['message'])
                if parsed and parsed['action'] == 'ACCEPT':
                    observations = self._to_observations(parsed)
                    for obs in observations:
                        yield obs

    def _parse_flow_log(self, message: str) -> Dict:
        """Parse a VPC flow log line"""
        # Format: version account-id interface-id srcaddr dstaddr srcport dstport protocol packets bytes start end action log-status
        parts = message.split()
        if len(parts) < 14:
            return None

        return {
            'interface_id': parts[2],
            'src_addr': parts[3],
            'dst_addr': parts[4],
            'src_port': int(parts[5]) if parts[5] != '-' else None,
            'dst_port': int(parts[6]) if parts[6] != '-' else None,
            'protocol': self._protocol_name(parts[7]),
            'packets': int(parts[8]) if parts[8] != '-' else 0,
            'bytes': int(parts[9]) if parts[9] != '-' else 0,
            'start': datetime.fromtimestamp(int(parts[10])),
            'end': datetime.fromtimestamp(int(parts[11])),
            'action': parts[12],  # ACCEPT or REJECT
        }

    def _protocol_name(self, proto_num: str) -> str:
        """Convert protocol number to name"""
        mapping = {'6': 'tcp', '17': 'udp', '1': 'icmp'}
        return mapping.get(proto_num, proto_num)

    def _to_observations(self, flow: Dict) -> List[Dict]:
        """Convert a flow log to observation records"""
        observations = []

        # Get security groups for this ENI
        sg_ids = self._get_sg_for_eni(flow['interface_id'])

        for sg_id in sg_ids:
            obs = {
                'ts': flow['start'],
                'resource_id': sg_id,
                'plane': 'NETWORK',
                'direction': 'INGRESS',  # Simplified - you'd need to determine this
                'action': f"{flow['protocol']}:{flow['dst_port']}",
                'actor_type': 'ip',
                'actor_id': flow['src_addr'],
                'count': flow['packets'],
                'evidence': {
                    'eni': flow['interface_id'],
                    'bytes': flow['bytes'],
                    'src_port': flow['src_port']
                }
            }
            observations.append(obs)

        return observations

    def _get_sg_for_eni(self, eni_id: str) -> List[str]:
        """Get security group IDs for an ENI (cached)"""
        if eni_id not in self._eni_to_sg_cache:
            try:
                response = self.ec2_client.describe_network_interfaces(
                    NetworkInterfaceIds=[eni_id]
                )
                groups = response['NetworkInterfaces'][0]['Groups']
                self._eni_to_sg_cache[eni_id] = [g['GroupId'] for g in groups]
            except Exception:
                self._eni_to_sg_cache[eni_id] = []

        return self._eni_to_sg_cache[eni_id]
```

---

## 9. Worker Schedule

```python
# File: workers/scheduler.py

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from workers.ingestion_worker import run_ingestion
from workers.analysis_worker import run_analysis

scheduler = BackgroundScheduler()

def start_workers():
    """Start the background workers"""

    # Fast loop: Ingest new telemetry every 5 minutes
    scheduler.add_job(
        run_ingestion,
        trigger=IntervalTrigger(minutes=5),
        id='ingestion_worker',
        name='Telemetry Ingestion',
        replace_existing=True
    )

    # Slow loop: Run analysis every 2 hours
    scheduler.add_job(
        run_analysis,
        trigger=IntervalTrigger(hours=2),
        id='analysis_worker',
        name='Gap Analysis',
        replace_existing=True
    )

    scheduler.start()
    print("✅ Workers started")

def stop_workers():
    scheduler.shutdown()
```

---

## 10. Main App Integration

```python
# File: main.py (additions)

# Add to imports
from database import engine, get_db
from models.schema import Base
from workers.scheduler import start_workers, stop_workers
from routers import issues, simulate, remediate

# Create tables on startup
@app.on_event("startup")
async def startup():
    # Create database tables
    if engine:
        Base.metadata.create_all(bind=engine)
        print("✅ Database tables created")

    # Start background workers
    start_workers()

@app.on_event("shutdown")
async def shutdown():
    stop_workers()

# Include new routers
app.include_router(issues.router, prefix="/api/v2")
app.include_router(simulate.router, prefix="/api/v2")
app.include_router(remediate.router, prefix="/api/v2")
```

---

## 11. Render Setup Commands

```bash
# 1. Create PostgreSQL database on Render
# Go to Render Dashboard > New > PostgreSQL
# Name: saferemediate-db
# Plan: Starter ($7/mo) or Free (90 day limit)

# 2. Get the Internal Database URL from Render
# Format: postgresql://user:pass@host:5432/dbname

# 3. Add environment variable to your backend service
# Key: DATABASE_URL
# Value: (paste the Internal Database URL)

# 4. Deploy and check logs for:
# ✅ Database tables created
# ✅ Workers started
```

---

## Build Order (Ship Fast)

1. **Week 1**: Flow Logs → SG Unused Rules
   - Deploy Postgres schema
   - Implement `flowlogs_collector.py`
   - Implement `sg_analyzer.py`
   - Connect to existing `/api/findings`

2. **Week 2**: NACL + Shadowed Rules
   - Implement `nacl_analyzer.py`
   - Add shadowing detection

3. **Week 3**: IAM (you have pieces)
   - Migrate existing CloudTrail logic
   - Add to observations table

4. **Week 4**: S3 + Polish
   - Add S3 data events
   - Add coverage warnings to UI

---

## What I Need From You (for exact diffs)

Share these files from your backend:
1. Your current `main.py` (the deployed version)
2. Any existing flow logs or CloudTrail ingestion code
3. Your Neo4j schema/queries for resource→system mapping
4. Current `/api/gap-analysis` or `/api/findings` endpoint code

Then I can provide exact file-level patches in your code style.
