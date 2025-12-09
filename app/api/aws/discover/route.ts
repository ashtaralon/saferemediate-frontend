// AWS Discovery API - Fetches AWS resources directly without Neo4j
// Returns nodes and relationships for Cloud Graph visualization

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

interface GraphNode {
  id: string
  name: string
  type: string
  labels: string[]
  arn?: string
  region?: string
}

interface GraphRelationship {
  source: string
  target: string
  type: string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const systemName = searchParams.get("systemName")

  const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

  const nodes: GraphNode[] = []
  const relationships: GraphRelationship[] = []
  const errors: string[] = []

  console.log("[AWS Discovery] Starting resource discovery...")

  // Helper to fetch with timeout
  const fetchWithTimeout = async (url: string, timeout = 10000) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      return response
    } catch (e) {
      clearTimeout(timeoutId)
      throw e
    }
  }

  // Try backend endpoints first (they have AWS credentials)
  try {
    // Fetch security groups
    console.log("[AWS Discovery] Fetching security groups from backend...")
    const sgResponse = await fetchWithTimeout(`${backendUrl}/api/security-groups`)
    if (sgResponse.ok) {
      const sgData = await sgResponse.json()
      const securityGroups = sgData.securityGroups || sgData.data || sgData || []

      if (Array.isArray(securityGroups)) {
        securityGroups.forEach((sg: any) => {
          const id = sg.GroupId || sg.id || sg.groupId
          const name = sg.GroupName || sg.name || sg.groupName || id
          if (id) {
            nodes.push({
              id,
              name,
              type: "SecurityGroup",
              labels: ["SecurityGroup"],
              region: sg.region || "eu-west-1",
            })
          }
        })
        console.log("[AWS Discovery] Found", securityGroups.length, "security groups")
      }
    }
  } catch (e: any) {
    errors.push(`Security groups: ${e.message}`)
  }

  // Fetch EC2 instances
  try {
    console.log("[AWS Discovery] Fetching EC2 instances from backend...")
    const ec2Response = await fetchWithTimeout(`${backendUrl}/api/ec2/instances`)
    if (ec2Response.ok) {
      const ec2Data = await ec2Response.json()
      const instances = ec2Data.instances || ec2Data.data || ec2Data || []

      if (Array.isArray(instances)) {
        instances.forEach((instance: any) => {
          const id = instance.InstanceId || instance.id || instance.instanceId
          const name = instance.Tags?.find((t: any) => t.Key === "Name")?.Value || instance.name || id
          if (id) {
            nodes.push({
              id,
              name,
              type: "EC2",
              labels: ["EC2Instance", "EC2"],
              region: instance.region || "eu-west-1",
            })

            // Link EC2 to security groups
            const sgIds = instance.SecurityGroups || instance.securityGroups || []
            sgIds.forEach((sg: any) => {
              const sgId = sg.GroupId || sg.id || sg
              if (sgId) {
                relationships.push({
                  source: sgId,
                  target: id,
                  type: "PROTECTS",
                })
              }
            })
          }
        })
        console.log("[AWS Discovery] Found", instances.length, "EC2 instances")
      }
    }
  } catch (e: any) {
    errors.push(`EC2 instances: ${e.message}`)
  }

  // Fetch IAM roles
  try {
    console.log("[AWS Discovery] Fetching IAM roles from backend...")
    const iamResponse = await fetchWithTimeout(`${backendUrl}/api/iam/roles`)
    if (iamResponse.ok) {
      const iamData = await iamResponse.json()
      const roles = iamData.roles || iamData.data || iamData || []

      if (Array.isArray(roles)) {
        roles.forEach((role: any) => {
          const id = role.Arn || role.arn || role.RoleName || role.roleName || role.name
          const name = role.RoleName || role.roleName || role.name || id
          if (id) {
            nodes.push({
              id,
              name,
              type: "IAM",
              labels: ["IAMRole", "IAM"],
              arn: role.Arn || role.arn,
            })
          }
        })
        console.log("[AWS Discovery] Found", roles.length, "IAM roles")
      }
    }
  } catch (e: any) {
    errors.push(`IAM roles: ${e.message}`)
  }

  // Fetch Lambda functions
  try {
    console.log("[AWS Discovery] Fetching Lambda functions from backend...")
    const lambdaResponse = await fetchWithTimeout(`${backendUrl}/api/lambda/functions`)
    if (lambdaResponse.ok) {
      const lambdaData = await lambdaResponse.json()
      const functions = lambdaData.functions || lambdaData.data || lambdaData || []

      if (Array.isArray(functions)) {
        functions.forEach((fn: any) => {
          const id = fn.FunctionArn || fn.arn || fn.FunctionName || fn.name
          const name = fn.FunctionName || fn.name || id
          if (id) {
            nodes.push({
              id,
              name,
              type: "Lambda",
              labels: ["LambdaFunction", "Lambda"],
              arn: fn.FunctionArn || fn.arn,
              region: fn.region || "eu-west-1",
            })

            // Link Lambda to IAM role
            if (fn.Role || fn.role) {
              relationships.push({
                source: fn.Role || fn.role,
                target: id,
                type: "ASSUMED_BY",
              })
            }
          }
        })
        console.log("[AWS Discovery] Found", functions.length, "Lambda functions")
      }
    }
  } catch (e: any) {
    errors.push(`Lambda functions: ${e.message}`)
  }

  // Fetch S3 buckets
  try {
    console.log("[AWS Discovery] Fetching S3 buckets from backend...")
    const s3Response = await fetchWithTimeout(`${backendUrl}/api/s3/buckets`)
    if (s3Response.ok) {
      const s3Data = await s3Response.json()
      const buckets = s3Data.buckets || s3Data.data || s3Data || []

      if (Array.isArray(buckets)) {
        buckets.forEach((bucket: any) => {
          const name = bucket.Name || bucket.name || bucket.bucketName
          if (name) {
            nodes.push({
              id: `arn:aws:s3:::${name}`,
              name,
              type: "S3",
              labels: ["S3Bucket", "S3"],
            })
          }
        })
        console.log("[AWS Discovery] Found", buckets.length, "S3 buckets")
      }
    }
  } catch (e: any) {
    errors.push(`S3 buckets: ${e.message}`)
  }

  // Fetch RDS instances
  try {
    console.log("[AWS Discovery] Fetching RDS instances from backend...")
    const rdsResponse = await fetchWithTimeout(`${backendUrl}/api/rds/instances`)
    if (rdsResponse.ok) {
      const rdsData = await rdsResponse.json()
      const instances = rdsData.instances || rdsData.data || rdsData || []

      if (Array.isArray(instances)) {
        instances.forEach((db: any) => {
          const id = db.DBInstanceArn || db.arn || db.DBInstanceIdentifier || db.identifier
          const name = db.DBInstanceIdentifier || db.identifier || db.name || id
          if (id) {
            nodes.push({
              id,
              name,
              type: "RDS",
              labels: ["RDSInstance", "RDS"],
              arn: db.DBInstanceArn || db.arn,
              region: db.region || "eu-west-1",
            })
          }
        })
        console.log("[AWS Discovery] Found", instances.length, "RDS instances")
      }
    }
  } catch (e: any) {
    errors.push(`RDS instances: ${e.message}`)
  }

  // Try system-specific expand endpoint if systemName provided
  if (systemName && nodes.length === 0) {
    try {
      console.log("[AWS Discovery] Trying system expand for:", systemName)
      const expandResponse = await fetchWithTimeout(`${backendUrl}/api/system/${encodeURIComponent(systemName)}/expand`)
      if (expandResponse.ok) {
        const expandData = await expandResponse.json()
        const resources = expandData.resources || expandData.data || []

        if (Array.isArray(resources)) {
          resources.forEach((r: any) => {
            nodes.push({
              id: r.id,
              name: r.name || r.id,
              type: r.type,
              labels: [r.type],
              arn: r.arn,
              region: r.region,
            })
          })
          console.log("[AWS Discovery] Found", resources.length, "resources from system expand")
        }
      }
    } catch (e: any) {
      errors.push(`System expand: ${e.message}`)
    }
  }

  // Calculate stats
  const stats = {
    total: nodes.length,
    byType: nodes.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1
      return acc
    }, {} as Record<string, number>),
    relationshipCount: relationships.length,
  }

  console.log("[AWS Discovery] Complete -", nodes.length, "nodes,", relationships.length, "relationships")

  return NextResponse.json({
    success: nodes.length > 0,
    source: nodes.length > 0 ? "aws" : "none",
    nodes,
    relationships,
    stats,
    errors: errors.length > 0 ? errors : undefined,
    message: nodes.length === 0 ? "No AWS resources discovered. Ensure backend has AWS credentials configured." : undefined,
  })
}
