"""
nayantra/agent/history.py

Mission history persistence layer.

Stores every MissionResult in a local SQLite database so that:
  - Users can review past commands and their outcomes
  - The system can detect repeated failures on the same command
  - Analytics / dashboards can query mission success rates over time

Schema:
  missions (id TEXT PK, command TEXT, summary TEXT, success INT,
            step_count INT, created_at REAL)
  steps    (mission_id TEXT FK, step_index INT, tool TEXT,
            status TEXT, duration_ms REAL, error TEXT, result_json TEXT)

Usage:
    store = MissionStore()          # uses default DB path
    await store.save(mission)
    recent = await store.recent(limit=20)
    stats  = await store.stats()
"""

from __future__ import annotations

import asyncio
import json
import logging
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any

from nayantra.agent.models import MissionResult

logger = logging.getLogger("rmf.history")

DEFAULT_DB_PATH = Path(__file__).resolve().parents[2] / "data" / "missions.db"
ARCHIVE_PURPOSES = {
    "general",
    "status_review",
    "task_dispatch",
    "traffic",
    "safety",
    "maintenance",
}


class MissionStore:
    """Async-friendly SQLite store for mission history."""

    def __init__(self, db_path: Path | None = None) -> None:
        self._db_path = db_path or DEFAULT_DB_PATH
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    # ------------------------------------------------------------------
    # Schema initialisation
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS missions (
                    id          TEXT PRIMARY KEY,
                    command     TEXT NOT NULL,
                    summary     TEXT,
                    success     INTEGER NOT NULL DEFAULT 0,
                    step_count  INTEGER NOT NULL DEFAULT 0,
                    title       TEXT,
                    archive_id  TEXT,
                    pinned      INTEGER NOT NULL DEFAULT 0,
                    created_at  REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS archives (
                    id          TEXT PRIMARY KEY,
                    name        TEXT NOT NULL,
                    purpose     TEXT NOT NULL DEFAULT 'general',
                    created_at  REAL NOT NULL,
                    updated_at  REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS steps (
                    mission_id  TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
                    step_index  INTEGER NOT NULL,
                    tool        TEXT NOT NULL,
                    status      TEXT NOT NULL,
                    duration_ms REAL,
                    error       TEXT,
                    result_json TEXT,
                    PRIMARY KEY (mission_id, step_index)
                );

                CREATE INDEX IF NOT EXISTS idx_missions_created ON missions(created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_missions_success  ON missions(success);
            """)
            # Existing installations predate conversation organisation. SQLite
            # only supports additive migrations, which is sufficient here.
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(missions)")}
            if "title" not in columns:
                conn.execute("ALTER TABLE missions ADD COLUMN title TEXT")
            if "archive_id" not in columns:
                conn.execute("ALTER TABLE missions ADD COLUMN archive_id TEXT")
            if "pinned" not in columns:
                conn.execute("ALTER TABLE missions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_missions_archive ON missions(archive_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_missions_pinned ON missions(pinned DESC)")
        logger.debug(f"Mission DB initialised at {self._db_path}")

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    async def save(self, mission: MissionResult) -> None:
        """
        Persist a completed mission and all its steps.

        Concurrent saves are safe: each call runs in its own thread and
        SQLite WAL mode serialises writes at the DB level. The `with conn`
        block makes each save atomic (commit on success, rollback on error).
        """
        await asyncio.to_thread(self._save_sync, mission)

    def _save_sync(self, mission: MissionResult) -> None:
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO missions
                   (id, command, summary, success, step_count, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                       command=excluded.command,
                       summary=excluded.summary,
                       success=excluded.success,
                       step_count=excluded.step_count,
                       created_at=excluded.created_at""",
                (
                    mission.mission_id,
                    mission.command,
                    mission.summary,
                    int(mission.success),
                    len(mission.steps),
                    time.time(),
                ),
            )
            conn.execute("DELETE FROM steps WHERE mission_id = ?", (mission.mission_id,))
            for step in mission.steps:
                conn.execute(
                    """INSERT OR REPLACE INTO steps
                       (mission_id, step_index, tool, status, duration_ms, error, result_json)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        mission.mission_id,
                        step.step_index,
                        step.tool,
                        step.status.value,
                        step.duration_ms,
                        step.error,
                        json.dumps(step.result) if step.result else None,
                    ),
                )
        logger.debug(f"Saved mission {mission.mission_id[:8]}… ({len(mission.steps)} steps)")

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def recent(self, limit: int = 50) -> list[dict[str, Any]]:
        """Return the most recent missions (lightweight, no steps)."""
        return await asyncio.to_thread(self._recent_sync, limit)

    def _recent_sync(self, limit: int) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT m.*, a.name AS archive_name, a.purpose AS archive_purpose
                   FROM missions AS m LEFT JOIN archives AS a ON a.id = m.archive_id
                   ORDER BY m.pinned DESC, m.created_at DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    async def get(self, mission_id: str) -> dict[str, Any] | None:
        """Return a full mission record including all steps."""
        return await asyncio.to_thread(self._get_sync, mission_id)

    def _get_sync(self, mission_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """SELECT m.*, a.name AS archive_name, a.purpose AS archive_purpose
                   FROM missions AS m LEFT JOIN archives AS a ON a.id = m.archive_id
                   WHERE m.id = ?""",
                (mission_id,),
            ).fetchone()
            if not row:
                return None
            mission = dict(row)
            steps = conn.execute(
                "SELECT * FROM steps WHERE mission_id = ? ORDER BY step_index",
                (mission_id,),
            ).fetchall()
            mission["steps"] = [dict(s) for s in steps]
        return mission

    async def search(self, query: str, limit: int = 20) -> list[dict[str, Any]]:
        """Full-text search over mission commands."""
        return await asyncio.to_thread(self._search_sync, query, limit)

    def _search_sync(self, query: str, limit: int) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT m.*, a.name AS archive_name, a.purpose AS archive_purpose
                   FROM missions AS m LEFT JOIN archives AS a ON a.id = m.archive_id
                   WHERE m.command LIKE ? OR m.title LIKE ?
                   ORDER BY m.pinned DESC, m.created_at DESC LIMIT ?""",
                (f"%{query}%", f"%{query}%", limit),
            ).fetchall()
        return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Analytics
    # ------------------------------------------------------------------

    async def stats(self) -> dict[str, Any]:
        """Return aggregate statistics for the dashboard."""
        return await asyncio.to_thread(self._stats_sync)

    def _stats_sync(self) -> dict[str, Any]:
        with self._connect() as conn:
            total = conn.execute("SELECT COUNT(*) FROM missions").fetchone()[0]
            success = conn.execute("SELECT COUNT(*) FROM missions WHERE success=1").fetchone()[0]
            failed = total - success

            # Most-used tools
            top_tools = conn.execute("""
                SELECT tool, COUNT(*) as cnt
                FROM steps GROUP BY tool ORDER BY cnt DESC LIMIT 5
            """).fetchall()

            # Average mission duration (sum of step durations)
            avg_ms = conn.execute("""
                SELECT AVG(total_ms) FROM (
                    SELECT mission_id, SUM(duration_ms) as total_ms
                    FROM steps GROUP BY mission_id
                )
            """).fetchone()[0]

            # Recent failure rate (last 24h)
            cutoff = time.time() - 86400
            recent_total = conn.execute(
                "SELECT COUNT(*) FROM missions WHERE created_at > ?", (cutoff,)
            ).fetchone()[0]
            recent_failed = conn.execute(
                "SELECT COUNT(*) FROM missions WHERE created_at > ? AND success=0",
                (cutoff,),
            ).fetchone()[0]

        return {
            "total_missions": total,
            "successful": success,
            "failed": failed,
            "success_rate_pct": round(success / total * 100, 1) if total > 0 else 0.0,
            "avg_duration_ms": round(avg_ms or 0, 1),
            "top_tools": [{"tool": r[0], "count": r[1]} for r in top_tools],
            "last_24h_total": recent_total,
            "last_24h_failed": recent_failed,
        }

    # ------------------------------------------------------------------
    # Conversation organisation
    # ------------------------------------------------------------------

    @staticmethod
    def _clean_name(value: str, label: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(f"{label} cannot be empty")
        if len(cleaned) > 120:
            raise ValueError(f"{label} must be 120 characters or less")
        return cleaned

    @staticmethod
    def _clean_purpose(value: str) -> str:
        if value not in ARCHIVE_PURPOSES:
            raise ValueError("Unsupported archive purpose")
        return value

    async def archives(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._archives_sync)

    def _archives_sync(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT a.*, COUNT(m.id) AS mission_count
                   FROM archives AS a LEFT JOIN missions AS m ON m.archive_id = a.id
                   GROUP BY a.id ORDER BY a.updated_at DESC, a.created_at DESC"""
            ).fetchall()
        return [dict(row) for row in rows]

    async def create_archive(self, name: str, purpose: str = "general") -> dict[str, Any]:
        return await asyncio.to_thread(self._create_archive_sync, name, purpose)

    def _create_archive_sync(self, name: str, purpose: str) -> dict[str, Any]:
        name = self._clean_name(name, "Archive name")
        purpose = self._clean_purpose(purpose)
        archive = {"id": str(uuid.uuid4()), "name": name, "purpose": purpose}
        now = time.time()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO archives (id, name, purpose, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (archive["id"], name, purpose, now, now),
            )
        return {**archive, "created_at": now, "updated_at": now, "mission_count": 0}

    async def update_archive(
        self, archive_id: str, *, name: str | None = None, purpose: str | None = None
    ) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._update_archive_sync, archive_id, name, purpose)

    def _update_archive_sync(self, archive_id: str, name: str | None, purpose: str | None) -> dict[str, Any] | None:
        if name is not None:
            name = self._clean_name(name, "Archive name")
        if purpose is not None:
            purpose = self._clean_purpose(purpose)
        with self._connect() as conn:
            existing = conn.execute("SELECT * FROM archives WHERE id = ?", (archive_id,)).fetchone()
            if not existing:
                return None
            new_name = name if name is not None else existing["name"]
            new_purpose = purpose if purpose is not None else existing["purpose"]
            now = time.time()
            conn.execute(
                "UPDATE archives SET name = ?, purpose = ?, updated_at = ? WHERE id = ?",
                (new_name, new_purpose, now, archive_id),
            )
        return self._get_archive_sync(archive_id)

    def _get_archive_sync(self, archive_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """SELECT a.*, COUNT(m.id) AS mission_count
                   FROM archives AS a LEFT JOIN missions AS m ON m.archive_id = a.id
                   WHERE a.id = ? GROUP BY a.id""",
                (archive_id,),
            ).fetchone()
        return dict(row) if row else None

    async def delete_archive(self, archive_id: str) -> bool:
        return await asyncio.to_thread(self._delete_archive_sync, archive_id)

    def _delete_archive_sync(self, archive_id: str) -> bool:
        with self._connect() as conn:
            conn.execute("UPDATE missions SET archive_id = NULL WHERE archive_id = ?", (archive_id,))
            deleted = conn.execute("DELETE FROM archives WHERE id = ?", (archive_id,))
        return deleted.rowcount > 0

    async def update_mission(
        self, mission_id: str, *, title: str | None = None, archive_id: str | None = None,
        pinned: bool | None = None, set_title: bool = False, set_archive: bool = False, set_pinned: bool = False,
    ) -> dict[str, Any] | None:
        return await asyncio.to_thread(
            self._update_mission_sync, mission_id, title, archive_id, pinned, set_title, set_archive, set_pinned
        )

    def _update_mission_sync(
        self, mission_id: str, title: str | None, archive_id: str | None, pinned: bool | None,
        set_title: bool, set_archive: bool, set_pinned: bool,
    ) -> dict[str, Any] | None:
        if set_title and title is not None:
            title = self._clean_name(title, "Conversation title")
        with self._connect() as conn:
            existing = conn.execute("SELECT id FROM missions WHERE id = ?", (mission_id,)).fetchone()
            if not existing:
                return None
            if set_archive and archive_id is not None:
                archive = conn.execute("SELECT id FROM archives WHERE id = ?", (archive_id,)).fetchone()
                if not archive:
                    raise ValueError("Archive not found")
            if set_title:
                conn.execute("UPDATE missions SET title = ? WHERE id = ?", (title, mission_id))
            if set_archive:
                conn.execute("UPDATE missions SET archive_id = ? WHERE id = ?", (archive_id, mission_id))
            if set_pinned:
                conn.execute("UPDATE missions SET pinned = ? WHERE id = ?", (int(bool(pinned)), mission_id))
        return self._get_sync(mission_id)

    async def delete(self, mission_id: str) -> bool:
        """Delete a mission record and its steps."""
        return await asyncio.to_thread(self._delete_sync, mission_id)

    def _delete_sync(self, mission_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM missions WHERE id = ?", (mission_id,))
        return cur.rowcount > 0

    async def clear(self) -> None:
        """Delete all stored missions. Irreversible."""
        await asyncio.to_thread(self._clear_sync)

    def _clear_sync(self) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM steps")
            conn.execute("DELETE FROM missions")
        logger.warning("Mission history cleared")
