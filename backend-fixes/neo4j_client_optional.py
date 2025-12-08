"""
Neo4j Client with Optional Dependency

This is a drop-in replacement for neo4j_client.py that makes Neo4j optional.
Copy this file to your backend repository and rename it to neo4j_client.py.

According to the architecture, Neo4j is only used for finding relationships
between components - it's not critical for the platform to function.
"""

import logging
from typing import Optional, List, Dict, Any

# Configure logging
logger = logging.getLogger(__name__)

# Try to import neo4j - make it optional
NEO4J_AVAILABLE = False
GraphDatabase = None

try:
    from neo4j import GraphDatabase
    from neo4j.exceptions import ServiceUnavailable
    NEO4J_AVAILABLE = True
    logger.info("[Neo4j] Successfully imported neo4j package")
except ImportError as e:
    logger.warning(f"[Neo4j] Package not available: {e}")
    logger.warning("[Neo4j] Graph relationship features will be disabled")
except Exception as e:
    logger.warning(f"[Neo4j] Import error: {e}")
    logger.warning("[Neo4j] Graph relationship features will be disabled")


class Neo4jClient:
    """
    Neo4j client with optional dependency.

    If Neo4j is not available or connection fails, all methods return
    empty results instead of raising exceptions.
    """

    def __init__(
        self,
        uri: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None
    ):
        self.driver = None
        self.available = False

        if not NEO4J_AVAILABLE:
            logger.warning("[Neo4j] Package not installed - operating in offline mode")
            return

        if not uri or not user or not password:
            logger.warning("[Neo4j] Missing credentials - operating in offline mode")
            return

        try:
            self.driver = GraphDatabase.driver(uri, auth=(user, password))
            # Test connection
            with self.driver.session() as session:
                session.run("RETURN 1")
            self.available = True
            logger.info("[Neo4j] Successfully connected to database")
        except Exception as e:
            logger.warning(f"[Neo4j] Connection failed: {e}")
            logger.warning("[Neo4j] Operating in offline mode - graph features disabled")
            self.driver = None
            self.available = False

    def close(self):
        """Close the Neo4j driver connection."""
        if self.driver:
            try:
                self.driver.close()
            except Exception as e:
                logger.warning(f"[Neo4j] Error closing connection: {e}")

    def is_available(self) -> bool:
        """Check if Neo4j is available and connected."""
        return self.available and self.driver is not None

    def get_all_nodes(self) -> List[Dict[str, Any]]:
        """
        Get all nodes from the graph database.
        Returns empty list if Neo4j is unavailable.
        """
        if not self.is_available():
            logger.debug("[Neo4j] Unavailable - returning empty nodes list")
            return []

        try:
            with self.driver.session() as session:
                result = session.run(
                    """
                    MATCH (n)
                    RETURN n, labels(n) as labels, id(n) as nodeId
                    LIMIT 1000
                    """
                )
                nodes = []
                for record in result:
                    node = dict(record["n"])
                    node["labels"] = record["labels"]
                    node["nodeId"] = record["nodeId"]
                    nodes.append(node)
                return nodes
        except Exception as e:
            logger.warning(f"[Neo4j] Error fetching nodes: {e}")
            return []

    def get_all_relationships(self) -> List[Dict[str, Any]]:
        """
        Get all relationships from the graph database.
        Returns empty list if Neo4j is unavailable.
        """
        if not self.is_available():
            logger.debug("[Neo4j] Unavailable - returning empty relationships list")
            return []

        try:
            with self.driver.session() as session:
                result = session.run(
                    """
                    MATCH (a)-[r]->(b)
                    RETURN
                        id(r) as relId,
                        type(r) as relType,
                        id(a) as sourceId,
                        labels(a) as sourceLabels,
                        id(b) as targetId,
                        labels(b) as targetLabels,
                        properties(r) as properties
                    LIMIT 5000
                    """
                )
                relationships = []
                for record in result:
                    relationships.append({
                        "id": record["relId"],
                        "type": record["relType"],
                        "sourceId": record["sourceId"],
                        "sourceLabels": record["sourceLabels"],
                        "targetId": record["targetId"],
                        "targetLabels": record["targetLabels"],
                        "properties": record["properties"],
                    })
                return relationships
        except Exception as e:
            logger.warning(f"[Neo4j] Error fetching relationships: {e}")
            return []

    def get_node_by_id(self, node_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific node by its ID.
        Returns None if Neo4j is unavailable or node not found.
        """
        if not self.is_available():
            return None

        try:
            with self.driver.session() as session:
                result = session.run(
                    """
                    MATCH (n)
                    WHERE id(n) = $node_id OR n.id = $node_id OR n.resourceId = $node_id
                    RETURN n, labels(n) as labels, id(n) as nodeId
                    LIMIT 1
                    """,
                    node_id=node_id
                )
                record = result.single()
                if record:
                    node = dict(record["n"])
                    node["labels"] = record["labels"]
                    node["nodeId"] = record["nodeId"]
                    return node
                return None
        except Exception as e:
            logger.warning(f"[Neo4j] Error fetching node {node_id}: {e}")
            return None

    def get_node_relationships(self, node_id: str) -> List[Dict[str, Any]]:
        """
        Get all relationships for a specific node.
        Returns empty list if Neo4j is unavailable.
        """
        if not self.is_available():
            return []

        try:
            with self.driver.session() as session:
                result = session.run(
                    """
                    MATCH (a)-[r]-(b)
                    WHERE id(a) = $node_id OR a.id = $node_id OR a.resourceId = $node_id
                    RETURN
                        type(r) as relType,
                        id(b) as relatedNodeId,
                        labels(b) as relatedLabels,
                        b.name as relatedName,
                        CASE WHEN startNode(r) = a THEN 'outgoing' ELSE 'incoming' END as direction
                    LIMIT 100
                    """,
                    node_id=node_id
                )
                return [dict(record) for record in result]
        except Exception as e:
            logger.warning(f"[Neo4j] Error fetching relationships for {node_id}: {e}")
            return []

    def create_node(self, labels: List[str], properties: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Create a new node in the graph database.
        Returns None if Neo4j is unavailable.
        """
        if not self.is_available():
            logger.warning("[Neo4j] Cannot create node - database unavailable")
            return None

        try:
            label_str = ":".join(labels) if labels else "Node"
            with self.driver.session() as session:
                result = session.run(
                    f"""
                    CREATE (n:{label_str} $props)
                    RETURN n, labels(n) as labels, id(n) as nodeId
                    """,
                    props=properties
                )
                record = result.single()
                if record:
                    node = dict(record["n"])
                    node["labels"] = record["labels"]
                    node["nodeId"] = record["nodeId"]
                    return node
                return None
        except Exception as e:
            logger.warning(f"[Neo4j] Error creating node: {e}")
            return None

    def create_relationship(
        self,
        source_id: str,
        target_id: str,
        rel_type: str,
        properties: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Create a relationship between two nodes.
        Returns False if Neo4j is unavailable.
        """
        if not self.is_available():
            logger.warning("[Neo4j] Cannot create relationship - database unavailable")
            return False

        try:
            with self.driver.session() as session:
                session.run(
                    f"""
                    MATCH (a), (b)
                    WHERE (id(a) = $source_id OR a.id = $source_id)
                      AND (id(b) = $target_id OR b.id = $target_id)
                    CREATE (a)-[r:{rel_type} $props]->(b)
                    RETURN r
                    """,
                    source_id=source_id,
                    target_id=target_id,
                    props=properties or {}
                )
                return True
        except Exception as e:
            logger.warning(f"[Neo4j] Error creating relationship: {e}")
            return False

    def run_query(self, query: str, parameters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Run a custom Cypher query.
        Returns empty list if Neo4j is unavailable.
        """
        if not self.is_available():
            logger.warning("[Neo4j] Cannot run query - database unavailable")
            return []

        try:
            with self.driver.session() as session:
                result = session.run(query, parameters or {})
                return [dict(record) for record in result]
        except Exception as e:
            logger.warning(f"[Neo4j] Error running query: {e}")
            return []

    def clear_database(self) -> bool:
        """
        Clear all nodes and relationships from the database.
        Returns False if Neo4j is unavailable.
        """
        if not self.is_available():
            logger.warning("[Neo4j] Cannot clear database - database unavailable")
            return False

        try:
            with self.driver.session() as session:
                session.run("MATCH (n) DETACH DELETE n")
                logger.info("[Neo4j] Database cleared successfully")
                return True
        except Exception as e:
            logger.warning(f"[Neo4j] Error clearing database: {e}")
            return False


# Singleton instance
_client: Optional[Neo4jClient] = None


def get_neo4j_client(
    uri: Optional[str] = None,
    user: Optional[str] = None,
    password: Optional[str] = None
) -> Neo4jClient:
    """
    Get the Neo4j client singleton instance.

    If credentials are not provided, will try to use environment variables:
    - NEO4J_URI
    - NEO4J_USER
    - NEO4J_PASSWORD
    """
    global _client

    if _client is None:
        import os
        _client = Neo4jClient(
            uri=uri or os.environ.get("NEO4J_URI"),
            user=user or os.environ.get("NEO4J_USER"),
            password=password or os.environ.get("NEO4J_PASSWORD"),
        )

    return _client


def is_neo4j_available() -> bool:
    """Quick check if Neo4j is available."""
    client = get_neo4j_client()
    return client.is_available()
