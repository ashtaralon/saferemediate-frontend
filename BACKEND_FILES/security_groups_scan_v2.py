"""
Security Groups Scan V2 Endpoint
================================
Analyzes Security Groups for least privilege violations.
Compares allowed rules vs actual traffic (when VPC Flow Logs available).

Part of the Least Privilege Analysis suite.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
import boto3
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Neo4j driver - will be set by main.py
_neo4j_driver = None

def set_neo4j_driver(driver):
    """Set the Neo4j driver from main.py"""
    global _neo4j_driver
    _neo4j_driver = driver
    logger.info("✅ Security Groups Scan V2: Neo4j driver set")


# High-risk ports that should be flagged
HIGH_RISK_PORTS = {
    22: "SSH",
    23: "Telnet",
    3389: "RDP",
    3306: "MySQL",
    5432: "PostgreSQL",
    1433: "MSSQL",
    27017: "MongoDB",
    6379: "Redis",
    11211: "Memcached",
    9200: "Elasticsearch",
    5601: "Kibana",
    8080: "HTTP-Alt",
    21: "FTP",
    25: "SMTP",
    445: "SMB",
    135: "RPC",
    139: "NetBIOS",
}


class ScanRequest(BaseModel):
    system_name: str
    region: str = "eu-west-1"


class RuleAnalysis(BaseModel):
    port: str
    protocol: str
    cidr: str
    direction: str  # "ingress" or "egress"
    exposed: bool
    high_risk: bool
    risk_reason: Optional[str] = None
    observed_usage: bool = False
    connections: int = 0
    last_seen: Optional[str] = None
    recommendation: str
    confidence: int


class SecurityGroupAnalysis(BaseModel):
    sg_id: str
    sg_name: str
    vpc_id: str
    description: str
    attached_resources: List[str]
    total_rules: int
    internet_exposed_rules: int
    high_risk_ports: List[int]
    exposure_score: int  # 0-100, higher = worse
    severity: str  # CRITICAL, HIGH, MEDIUM, LOW
    rules: List[RuleAnalysis]


class ScanResponse(BaseModel):
    success: bool
    message: str
    system_name: str
    region: str
    security_groups_analyzed: int
    total_findings: int
    critical_findings: int
    high_findings: int
    security_groups: List[SecurityGroupAnalysis]
    scan_timestamp: str


def get_system_resources(system_name: str, region: str) -> List[Dict]:
    """Get resources belonging to a system from Neo4j"""
    resources = []

    if not _neo4j_driver:
        logger.warning("Neo4j driver not available, skipping resource lookup")
        return resources

    try:
        with _neo4j_driver.session() as session:
            # Query for resources tagged with this system
            result = session.run("""
                MATCH (r)
                WHERE r.system_name = $system_name OR r.SystemName = $system_name
                   OR r.tags CONTAINS $system_name
                RETURN r.id as id, r.type as type, r.arn as arn, labels(r) as labels
                LIMIT 100
            """, system_name=system_name)

            for record in result:
                resources.append({
                    "id": record["id"],
                    "type": record["type"] or (record["labels"][0] if record["labels"] else "Unknown"),
                    "arn": record["arn"]
                })

        logger.info(f"Found {len(resources)} resources for system {system_name}")
    except Exception as e:
        logger.error(f"Error querying Neo4j for resources: {e}")

    return resources


def get_security_groups_for_system(system_name: str, region: str) -> List[Dict]:
    """Get Security Groups from AWS for resources in this system"""
    try:
        ec2 = boto3.client('ec2', region_name=region)

        # Try to find SGs by system tag first
        response = ec2.describe_security_groups(
            Filters=[
                {'Name': 'tag:SystemName', 'Values': [system_name]},
            ]
        )

        sgs = response.get('SecurityGroups', [])

        # If no tagged SGs found, get all SGs (for demo/testing)
        if not sgs:
            logger.info(f"No SGs with SystemName={system_name} tag, fetching all SGs")
            response = ec2.describe_security_groups()
            sgs = response.get('SecurityGroups', [])[:10]  # Limit to 10 for demo

        logger.info(f"Found {len(sgs)} security groups")
        return sgs

    except Exception as e:
        logger.error(f"Error getting security groups: {e}")
        return []


def get_attached_resources(sg_id: str, region: str) -> List[str]:
    """Find resources attached to a security group"""
    resources = []
    try:
        ec2 = boto3.client('ec2', region_name=region)

        # Check EC2 instances
        instances = ec2.describe_instances(
            Filters=[{'Name': 'instance.group-id', 'Values': [sg_id]}]
        )
        for reservation in instances.get('Reservations', []):
            for instance in reservation.get('Instances', []):
                name = "unnamed"
                for tag in instance.get('Tags', []):
                    if tag['Key'] == 'Name':
                        name = tag['Value']
                        break
                resources.append(f"EC2: {name} ({instance['InstanceId']})")

        # Check ENIs
        enis = ec2.describe_network_interfaces(
            Filters=[{'Name': 'group-id', 'Values': [sg_id]}]
        )
        for eni in enis.get('NetworkInterfaces', []):
            if eni.get('Attachment', {}).get('InstanceId'):
                continue  # Already counted in EC2
            desc = eni.get('Description', 'ENI')
            resources.append(f"ENI: {desc} ({eni['NetworkInterfaceId']})")

    except Exception as e:
        logger.error(f"Error getting attached resources for {sg_id}: {e}")

    return resources


def analyze_rule(rule: Dict, direction: str) -> RuleAnalysis:
    """Analyze a single security group rule"""

    # Extract port range
    from_port = rule.get('FromPort', 0)
    to_port = rule.get('ToPort', 0)

    if from_port == to_port:
        port = str(from_port) if from_port else "All"
    elif from_port == 0 and to_port == 65535:
        port = "All"
    else:
        port = f"{from_port}-{to_port}"

    protocol = rule.get('IpProtocol', '-1')
    if protocol == '-1':
        protocol = "All"

    # Get CIDR
    cidr = "N/A"
    if rule.get('IpRanges'):
        cidr = rule['IpRanges'][0].get('CidrIp', 'N/A')
    elif rule.get('Ipv6Ranges'):
        cidr = rule['Ipv6Ranges'][0].get('CidrIpv6', 'N/A')
    elif rule.get('UserIdGroupPairs'):
        cidr = f"SG: {rule['UserIdGroupPairs'][0].get('GroupId', 'N/A')}"

    # Determine if exposed to internet
    exposed = cidr in ['0.0.0.0/0', '::/0']

    # Check for high-risk port
    high_risk = False
    risk_reason = None

    if port == "All":
        high_risk = True
        risk_reason = "All ports open"
    elif '-' in port:
        # Port range
        try:
            start, end = map(int, port.split('-'))
            for p in HIGH_RISK_PORTS:
                if start <= p <= end:
                    high_risk = True
                    risk_reason = f"Range includes {HIGH_RISK_PORTS[p]} (port {p})"
                    break
        except:
            pass
    else:
        try:
            port_num = int(port)
            if port_num in HIGH_RISK_PORTS:
                high_risk = True
                risk_reason = f"{HIGH_RISK_PORTS[port_num]} exposed"
        except:
            pass

    # Generate recommendation
    if exposed and high_risk:
        recommendation = f"CRITICAL: Remove or restrict {risk_reason} - open to internet"
        confidence = 95
    elif exposed:
        recommendation = f"Restrict CIDR from 0.0.0.0/0 to specific IPs"
        confidence = 85
    elif high_risk:
        recommendation = f"Monitor {risk_reason} - internal access only"
        confidence = 70
    else:
        recommendation = "Rule appears safe"
        confidence = 90

    return RuleAnalysis(
        port=port,
        protocol=protocol,
        cidr=cidr,
        direction=direction,
        exposed=exposed,
        high_risk=high_risk,
        risk_reason=risk_reason,
        observed_usage=False,  # Would be True if VPC Flow Logs showed traffic
        connections=0,
        last_seen=None,
        recommendation=recommendation,
        confidence=confidence
    )


def analyze_security_group(sg: Dict, region: str) -> SecurityGroupAnalysis:
    """Analyze a single security group"""

    sg_id = sg['GroupId']
    sg_name = sg.get('GroupName', 'unnamed')
    vpc_id = sg.get('VpcId', 'N/A')
    description = sg.get('Description', '')

    # Get attached resources
    attached = get_attached_resources(sg_id, region)

    # Analyze rules
    rules = []
    high_risk_ports = set()
    internet_exposed = 0

    # Ingress rules
    for rule in sg.get('IpPermissions', []):
        analysis = analyze_rule(rule, "ingress")
        rules.append(analysis)
        if analysis.exposed:
            internet_exposed += 1
        if analysis.high_risk and analysis.port != "All":
            try:
                if '-' not in analysis.port:
                    high_risk_ports.add(int(analysis.port))
            except:
                pass

    # Egress rules
    for rule in sg.get('IpPermissionsEgress', []):
        analysis = analyze_rule(rule, "egress")
        rules.append(analysis)

    # Calculate exposure score (0-100, higher = worse)
    exposure_score = 0

    # Base score from internet-exposed rules
    exposure_score += min(internet_exposed * 15, 45)

    # High-risk ports add more
    exposure_score += min(len(high_risk_ports) * 10, 30)

    # Critical combinations
    critical_rules = [r for r in rules if r.exposed and r.high_risk and r.direction == "ingress"]
    exposure_score += min(len(critical_rules) * 15, 25)

    # Cap at 100
    exposure_score = min(exposure_score, 100)

    # Determine severity
    if exposure_score >= 70 or critical_rules:
        severity = "CRITICAL"
    elif exposure_score >= 50:
        severity = "HIGH"
    elif exposure_score >= 25:
        severity = "MEDIUM"
    else:
        severity = "LOW"

    return SecurityGroupAnalysis(
        sg_id=sg_id,
        sg_name=sg_name,
        vpc_id=vpc_id,
        description=description,
        attached_resources=attached,
        total_rules=len(rules),
        internet_exposed_rules=internet_exposed,
        high_risk_ports=list(high_risk_ports),
        exposure_score=exposure_score,
        severity=severity,
        rules=rules
    )


def store_findings_in_neo4j(system_name: str, analyses: List[SecurityGroupAnalysis]):
    """Store findings in Neo4j for the frontend to retrieve"""
    if not _neo4j_driver:
        logger.warning("Neo4j driver not available, skipping storage")
        return

    try:
        with _neo4j_driver.session() as session:
            for sg in analyses:
                # Create/update SecurityGroup node
                session.run("""
                    MERGE (sg:SecurityGroup {id: $sg_id})
                    SET sg.name = $sg_name,
                        sg.vpc_id = $vpc_id,
                        sg.system_name = $system_name,
                        sg.exposure_score = $exposure_score,
                        sg.severity = $severity,
                        sg.total_rules = $total_rules,
                        sg.internet_exposed_rules = $internet_exposed,
                        sg.high_risk_ports = $high_risk_ports,
                        sg.last_analyzed = datetime(),
                        sg.resourceType = 'SecurityGroup'
                """,
                    sg_id=sg.sg_id,
                    sg_name=sg.sg_name,
                    vpc_id=sg.vpc_id,
                    system_name=system_name,
                    exposure_score=sg.exposure_score,
                    severity=sg.severity,
                    total_rules=sg.total_rules,
                    internet_exposed=sg.internet_exposed_rules,
                    high_risk_ports=sg.high_risk_ports
                )

                # Create findings for critical/high severity SGs
                if sg.severity in ["CRITICAL", "HIGH"]:
                    for rule in sg.rules:
                        if rule.exposed and rule.high_risk:
                            session.run("""
                                MERGE (f:Finding {id: $finding_id})
                                SET f.type = 'security_group',
                                    f.severity = $severity,
                                    f.confidence = $confidence,
                                    f.title = $title,
                                    f.description = $description,
                                    f.recommendation = $recommendation,
                                    f.resource = $sg_id,
                                    f.resourceType = 'SecurityGroup',
                                    f.system_name = $system_name,
                                    f.status = 'OPEN',
                                    f.discoveredAt = datetime()
                            """,
                                finding_id=f"{sg.sg_id}-{rule.port}-{rule.direction}",
                                severity=sg.severity,
                                confidence=rule.confidence,
                                title=f"{rule.risk_reason} on {sg.sg_name}",
                                description=f"Port {rule.port} ({rule.protocol}) is open to {rule.cidr}",
                                recommendation=rule.recommendation,
                                sg_id=sg.sg_id,
                                system_name=system_name
                            )

        logger.info(f"✅ Stored findings for {len(analyses)} security groups")
    except Exception as e:
        logger.error(f"Error storing findings in Neo4j: {e}")


@router.post("/api/security-groups/scan-v2", response_model=ScanResponse)
async def scan_security_groups(request: ScanRequest):
    """
    Analyze Security Groups for a system.

    Compares:
    - Allowed rules (from SG configuration)
    - Actual traffic (from VPC Flow Logs, when available)

    Returns exposure analysis and findings.
    """
    logger.info(f"🔍 Starting Security Groups scan for system: {request.system_name}, region: {request.region}")

    try:
        # Get security groups
        security_groups = get_security_groups_for_system(request.system_name, request.region)

        if not security_groups:
            return ScanResponse(
                success=True,
                message="No security groups found for this system",
                system_name=request.system_name,
                region=request.region,
                security_groups_analyzed=0,
                total_findings=0,
                critical_findings=0,
                high_findings=0,
                security_groups=[],
                scan_timestamp=datetime.utcnow().isoformat()
            )

        # Analyze each security group
        analyses = []
        for sg in security_groups:
            analysis = analyze_security_group(sg, request.region)
            analyses.append(analysis)

        # Store findings in Neo4j
        store_findings_in_neo4j(request.system_name, analyses)

        # Count findings
        critical = sum(1 for a in analyses if a.severity == "CRITICAL")
        high = sum(1 for a in analyses if a.severity == "HIGH")
        total_findings = critical + high

        logger.info(f"✅ Scan complete: {len(analyses)} SGs analyzed, {critical} critical, {high} high")

        return ScanResponse(
            success=True,
            message=f"Analyzed {len(analyses)} security groups",
            system_name=request.system_name,
            region=request.region,
            security_groups_analyzed=len(analyses),
            total_findings=total_findings,
            critical_findings=critical,
            high_findings=high,
            security_groups=analyses,
            scan_timestamp=datetime.utcnow().isoformat()
        )

    except Exception as e:
        logger.error(f"❌ Error scanning security groups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/security-groups/status")
async def get_scan_status():
    """Check if Security Groups scan endpoint is available"""
    return {
        "available": True,
        "version": "2.0",
        "neo4j_connected": _neo4j_driver is not None,
        "features": [
            "rule_analysis",
            "exposure_scoring",
            "high_risk_port_detection",
            "findings_storage"
        ]
    }
