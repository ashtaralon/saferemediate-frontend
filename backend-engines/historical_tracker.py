"""
Historical Remediation Tracker
==============================
Tracks remediation outcomes for historical scoring (10% of confidence).

Stores:
- Success/failure rates by resource type
- Rollback statistics
- Time-to-remediation metrics
- Similar finding success patterns

Supports:
- SQLite (default, for development)
- PostgreSQL (recommended for production)
- In-memory (for testing)

Requirements:
    pip install sqlalchemy aiosqlite  # For SQLite
    pip install sqlalchemy asyncpg    # For PostgreSQL
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum
import json
import logging
import os

logger = logging.getLogger(__name__)


class RemediationOutcome(str, Enum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    ROLLED_BACK = "ROLLED_BACK"
    PARTIAL = "PARTIAL"
    PENDING = "PENDING"


@dataclass
class RemediationRecord:
    """Single remediation execution record"""
    id: str
    finding_id: str
    resource_type: str
    resource_id: str
    action_taken: str  # AUTO_REMEDIATE, CANARY, MANUAL
    outcome: RemediationOutcome
    confidence_at_execution: float
    safety_at_execution: float
    started_at: str
    completed_at: Optional[str]
    rolled_back_at: Optional[str]
    error_message: Optional[str]
    metadata: Dict[str, Any]

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class HistoricalMetrics:
    """Aggregated historical metrics for decision engine"""
    total: int
    successes: int
    failures: int
    rollbacks: int
    success_rate: float
    rollback_rate: float
    similar_resource_type_success_rate: float
    last_failure_days_ago: Optional[int]
    avg_time_to_completion_seconds: Optional[float]

    def to_dict(self) -> Dict:
        return {
            "total": self.total,
            "successes": self.successes,
            "failures": self.failures,
            "rollbacks": self.rollbacks,
            "success_rate": round(self.success_rate, 3),
            "rollback_rate": round(self.rollback_rate, 3),
            "similar_resource_type_success_rate": round(self.similar_resource_type_success_rate, 3),
            "last_failure_days_ago": self.last_failure_days_ago,
            "avg_time_to_completion_seconds": self.avg_time_to_completion_seconds,
        }


class HistoricalTracker:
    """
    Tracks and analyzes remediation history.

    Usage:
        tracker = HistoricalTracker()

        # Record a remediation
        tracker.record_start(finding_id, resource_type, resource_id, action, confidence, safety)
        tracker.record_success(finding_id)  # or record_failure / record_rollback

        # Get metrics for decision engine
        metrics = tracker.get_metrics_for_resource_type("IAMRole")
    """

    def __init__(self, storage_backend: str = "sqlite", db_path: str = None):
        """
        Initialize tracker.

        Args:
            storage_backend: "sqlite", "postgres", or "memory"
            db_path: Path to SQLite DB or PostgreSQL connection string
        """
        self.storage_backend = storage_backend
        self.db_path = db_path or os.getenv("HISTORICAL_DB_PATH", "remediation_history.db")

        # In-memory storage for quick access
        self._records: Dict[str, RemediationRecord] = {}
        self._by_resource_type: Dict[str, List[str]] = {}

        # Initialize storage
        self._init_storage()

    def _init_storage(self):
        """Initialize storage backend"""
        if self.storage_backend == "sqlite":
            self._init_sqlite()
        elif self.storage_backend == "postgres":
            self._init_postgres()
        # memory backend uses in-memory dicts only

    def _init_sqlite(self):
        """Initialize SQLite database"""
        import sqlite3

        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row

        # Create table
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS remediation_history (
                id TEXT PRIMARY KEY,
                finding_id TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                resource_id TEXT NOT NULL,
                action_taken TEXT NOT NULL,
                outcome TEXT NOT NULL,
                confidence_at_execution REAL,
                safety_at_execution REAL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                rolled_back_at TEXT,
                error_message TEXT,
                metadata TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create indexes
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_resource_type ON remediation_history(resource_type)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_outcome ON remediation_history(outcome)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_started_at ON remediation_history(started_at)")
        self.conn.commit()

        logger.info(f"SQLite historical DB initialized at {self.db_path}")

    def _init_postgres(self):
        """Initialize PostgreSQL connection (placeholder)"""
        # In production, use asyncpg or psycopg2
        raise NotImplementedError("PostgreSQL backend coming soon")

    # =========================================================================
    # RECORD OPERATIONS
    # =========================================================================

    def record_start(
        self,
        finding_id: str,
        resource_type: str,
        resource_id: str,
        action: str,
        confidence: float,
        safety: float,
        metadata: Dict = None,
    ) -> str:
        """
        Record the start of a remediation.

        Returns:
            Record ID for tracking
        """
        import uuid
        record_id = str(uuid.uuid4())

        record = RemediationRecord(
            id=record_id,
            finding_id=finding_id,
            resource_type=resource_type,
            resource_id=resource_id,
            action_taken=action,
            outcome=RemediationOutcome.PENDING,
            confidence_at_execution=confidence,
            safety_at_execution=safety,
            started_at=datetime.utcnow().isoformat() + "Z",
            completed_at=None,
            rolled_back_at=None,
            error_message=None,
            metadata=metadata or {},
        )

        self._save_record(record)
        logger.info(f"Remediation started: {record_id} for {resource_type}/{resource_id}")

        return record_id

    def record_success(self, record_id: str):
        """Mark remediation as successful"""
        self._update_outcome(record_id, RemediationOutcome.SUCCESS)

    def record_failure(self, record_id: str, error: str = None):
        """Mark remediation as failed"""
        self._update_outcome(record_id, RemediationOutcome.FAILED, error=error)

    def record_rollback(self, record_id: str, reason: str = None):
        """Mark remediation as rolled back"""
        if self.storage_backend == "sqlite":
            self.conn.execute(
                "UPDATE remediation_history SET outcome = ?, rolled_back_at = ?, error_message = ? WHERE id = ?",
                (RemediationOutcome.ROLLED_BACK.value, datetime.utcnow().isoformat() + "Z", reason, record_id)
            )
            self.conn.commit()

        if record_id in self._records:
            self._records[record_id].outcome = RemediationOutcome.ROLLED_BACK
            self._records[record_id].rolled_back_at = datetime.utcnow().isoformat() + "Z"

        logger.info(f"Remediation rolled back: {record_id}")

    def _update_outcome(self, record_id: str, outcome: RemediationOutcome, error: str = None):
        """Update record outcome"""
        completed_at = datetime.utcnow().isoformat() + "Z"

        if self.storage_backend == "sqlite":
            self.conn.execute(
                "UPDATE remediation_history SET outcome = ?, completed_at = ?, error_message = ? WHERE id = ?",
                (outcome.value, completed_at, error, record_id)
            )
            self.conn.commit()

        if record_id in self._records:
            self._records[record_id].outcome = outcome
            self._records[record_id].completed_at = completed_at
            self._records[record_id].error_message = error

        logger.info(f"Remediation {record_id}: {outcome.value}")

    def _save_record(self, record: RemediationRecord):
        """Save record to storage"""
        self._records[record.id] = record

        # Index by resource type
        if record.resource_type not in self._by_resource_type:
            self._by_resource_type[record.resource_type] = []
        self._by_resource_type[record.resource_type].append(record.id)

        if self.storage_backend == "sqlite":
            self.conn.execute("""
                INSERT INTO remediation_history
                (id, finding_id, resource_type, resource_id, action_taken, outcome,
                 confidence_at_execution, safety_at_execution, started_at, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record.id, record.finding_id, record.resource_type, record.resource_id,
                record.action_taken, record.outcome.value, record.confidence_at_execution,
                record.safety_at_execution, record.started_at, json.dumps(record.metadata)
            ))
            self.conn.commit()

    # =========================================================================
    # METRICS & ANALYSIS
    # =========================================================================

    def get_metrics(self, resource_type: str = None, lookback_days: int = 90) -> HistoricalMetrics:
        """
        Get aggregated historical metrics.

        Args:
            resource_type: Filter by resource type (e.g., "IAMRole")
            lookback_days: Only consider remediations within this period

        Returns:
            HistoricalMetrics for decision engine
        """
        cutoff = (datetime.utcnow() - timedelta(days=lookback_days)).isoformat()

        if self.storage_backend == "sqlite":
            return self._get_metrics_sqlite(resource_type, cutoff)
        else:
            return self._get_metrics_memory(resource_type, cutoff)

    def _get_metrics_sqlite(self, resource_type: str, cutoff: str) -> HistoricalMetrics:
        """Get metrics from SQLite"""
        # Overall stats
        query = "SELECT outcome, COUNT(*) as count FROM remediation_history WHERE started_at > ?"
        params = [cutoff]

        if resource_type:
            query += " AND resource_type = ?"
            params.append(resource_type)

        query += " GROUP BY outcome"

        cursor = self.conn.execute(query, params)
        rows = cursor.fetchall()

        total = 0
        successes = 0
        failures = 0
        rollbacks = 0

        for row in rows:
            count = row["count"]
            total += count
            if row["outcome"] == RemediationOutcome.SUCCESS.value:
                successes = count
            elif row["outcome"] == RemediationOutcome.FAILED.value:
                failures = count
            elif row["outcome"] == RemediationOutcome.ROLLED_BACK.value:
                rollbacks = count

        # Success rate
        success_rate = successes / total if total > 0 else 0.0
        rollback_rate = rollbacks / total if total > 0 else 0.0

        # Similar resource type success rate (if filtering by type, same as overall)
        similar_success_rate = success_rate

        # Last failure
        last_failure_days = None
        if failures > 0:
            cursor = self.conn.execute(
                "SELECT started_at FROM remediation_history WHERE outcome = ? ORDER BY started_at DESC LIMIT 1",
                (RemediationOutcome.FAILED.value,)
            )
            row = cursor.fetchone()
            if row:
                last_failure = datetime.fromisoformat(row["started_at"].replace("Z", ""))
                last_failure_days = (datetime.utcnow() - last_failure).days

        # Avg completion time
        cursor = self.conn.execute("""
            SELECT AVG(
                julianday(completed_at) - julianday(started_at)
            ) * 86400 as avg_seconds
            FROM remediation_history
            WHERE completed_at IS NOT NULL AND started_at > ?
        """, (cutoff,))
        row = cursor.fetchone()
        avg_time = row["avg_seconds"] if row else None

        return HistoricalMetrics(
            total=total,
            successes=successes,
            failures=failures,
            rollbacks=rollbacks,
            success_rate=success_rate,
            rollback_rate=rollback_rate,
            similar_resource_type_success_rate=similar_success_rate,
            last_failure_days_ago=last_failure_days,
            avg_time_to_completion_seconds=avg_time,
        )

    def _get_metrics_memory(self, resource_type: str, cutoff: str) -> HistoricalMetrics:
        """Get metrics from in-memory storage"""
        records = list(self._records.values())

        if resource_type:
            records = [r for r in records if r.resource_type == resource_type]

        records = [r for r in records if r.started_at > cutoff]

        total = len(records)
        successes = len([r for r in records if r.outcome == RemediationOutcome.SUCCESS])
        failures = len([r for r in records if r.outcome == RemediationOutcome.FAILED])
        rollbacks = len([r for r in records if r.outcome == RemediationOutcome.ROLLED_BACK])

        success_rate = successes / total if total > 0 else 0.0
        rollback_rate = rollbacks / total if total > 0 else 0.0

        return HistoricalMetrics(
            total=total,
            successes=successes,
            failures=failures,
            rollbacks=rollbacks,
            success_rate=success_rate,
            rollback_rate=rollback_rate,
            similar_resource_type_success_rate=success_rate,
            last_failure_days_ago=None,
            avg_time_to_completion_seconds=None,
        )


# =============================================================================
# HELPER FUNCTIONS FOR BACKEND INTEGRATION
# =============================================================================

# Global tracker instance
_tracker: Optional[HistoricalTracker] = None


def get_tracker() -> HistoricalTracker:
    """Get or create the global tracker instance"""
    global _tracker
    if _tracker is None:
        db_path = os.getenv("HISTORICAL_DB_PATH", "remediation_history.db")
        _tracker = HistoricalTracker(storage_backend="sqlite", db_path=db_path)
    return _tracker


def get_historical_data_for_finding(finding: Dict) -> Dict:
    """
    Get historical data for a security finding.

    This is the main function to call from the simulate endpoint.

    Args:
        finding: Security finding dict with resource_type

    Returns:
        Dict with historical metrics ready for decision engine
    """
    resource_type = finding.get("resource_type", finding.get("resourceType", "Unknown"))

    try:
        tracker = get_tracker()
        metrics = tracker.get_metrics(resource_type=resource_type)
        return metrics.to_dict()
    except Exception as e:
        logger.error(f"Failed to get historical data: {e}")
        return _get_default_historical_metrics()


def record_remediation_start(
    finding_id: str,
    resource_type: str,
    resource_id: str,
    action: str,
    confidence: float,
    safety: float,
) -> str:
    """Record start of remediation, returns record_id"""
    return get_tracker().record_start(
        finding_id, resource_type, resource_id, action, confidence, safety
    )


def record_remediation_success(record_id: str):
    """Record successful remediation"""
    get_tracker().record_success(record_id)


def record_remediation_failure(record_id: str, error: str = None):
    """Record failed remediation"""
    get_tracker().record_failure(record_id, error)


def record_remediation_rollback(record_id: str, reason: str = None):
    """Record rollback"""
    get_tracker().record_rollback(record_id, reason)


def _get_default_historical_metrics() -> Dict:
    """Return neutral default metrics when DB unavailable"""
    return {
        "total": 0,
        "successes": 0,
        "failures": 0,
        "rollbacks": 0,
        "success_rate": 0.0,
        "rollback_rate": 0.0,
        "similar_resource_type_success_rate": 0.0,
        "last_failure_days_ago": None,
        "avg_time_to_completion_seconds": None,
    }


# =============================================================================
# USAGE EXAMPLE
# =============================================================================

if __name__ == "__main__":
    """
    Example usage:

    $ python historical_tracker.py
    """
    import time

    print("Testing Historical Tracker...")

    # Create tracker
    tracker = HistoricalTracker(storage_backend="sqlite", db_path=":memory:")

    # Simulate some remediations
    for i in range(10):
        record_id = tracker.record_start(
            finding_id=f"finding-{i}",
            resource_type="IAMRole",
            resource_id=f"role-{i}",
            action="AUTO_REMEDIATE",
            confidence=0.95,
            safety=0.92,
        )

        # 80% success rate
        if i < 8:
            tracker.record_success(record_id)
        elif i == 8:
            tracker.record_failure(record_id, "Permission denied")
        else:
            tracker.record_rollback(record_id, "Health check failed")

    # Get metrics
    metrics = tracker.get_metrics(resource_type="IAMRole")
    print(f"\nHistorical Metrics for IAMRole:")
    print(f"  Total: {metrics.total}")
    print(f"  Success Rate: {metrics.success_rate:.1%}")
    print(f"  Rollback Rate: {metrics.rollback_rate:.1%}")
    print(f"  Last Failure: {metrics.last_failure_days_ago} days ago")

    # For decision engine
    print(f"\nDict for decision engine:")
    import json
    print(json.dumps(metrics.to_dict(), indent=2))
