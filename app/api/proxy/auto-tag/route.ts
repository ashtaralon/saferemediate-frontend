export const dynamic = "force-dynamic"

/**
 * Detect AWS resource type from resource ID or ARN
 * Supports all resource types from the graph typeMapping
 */
function detectResourceType(id: string): string {
  // Simple ID prefix patterns (non-ARN resources)
  // Compute
  if (id.startsWith("i-")) return "EC2Instance"
  if (id.startsWith("lt-")) return "LaunchTemplate"
  if (id.startsWith("asg-")) return "AutoScalingGroup"
  if (id.startsWith("ami-")) return "AMI"
  if (id.startsWith("key-")) return "KeyPair"

  // VPC & Networking
  if (id.startsWith("vpc-")) return "VPC"
  if (id.startsWith("subnet-")) return "Subnet"
  if (id.startsWith("sg-")) return "SecurityGroup"
  if (id.startsWith("rtb-")) return "RouteTable"
  if (id.startsWith("igw-")) return "InternetGateway"
  if (id.startsWith("nat-")) return "NATGateway"
  if (id.startsWith("acl-")) return "NetworkACL"
  if (id.startsWith("eni-")) return "NetworkInterface"
  if (id.startsWith("eipalloc-")) return "ElasticIP"
  if (id.startsWith("tgw-")) return "TransitGateway"
  if (id.startsWith("tgw-attach-")) return "TransitGatewayAttachment"
  if (id.startsWith("vpce-")) return "VPCEndpoint"
  if (id.startsWith("pcx-")) return "VPCPeering"
  if (id.startsWith("dxcon-")) return "DirectConnect"
  if (id.startsWith("vgw-")) return "VPNGateway"
  if (id.startsWith("cgw-")) return "CustomerGateway"
  if (id.startsWith("vpn-")) return "VPNConnection"

  // Storage
  if (id.startsWith("vol-")) return "EBSVolume"
  if (id.startsWith("snap-")) return "EBSSnapshot"
  if (id.startsWith("fs-")) return "EFS"
  if (id.startsWith("fsx-")) return "FSx"
  if (id.startsWith("sgw-")) return "StorageGateway"

  // Database
  if (id.startsWith("cluster-")) return "RDSCluster"
  if (id.startsWith("db-")) return "RDSInstance"

  // Other ID prefixes
  if (id.startsWith("mesh-")) return "AppMesh"
  if (id.startsWith("vn-")) return "AppMeshVirtualNode"
  if (id.startsWith("vs-")) return "AppMeshVirtualService"

  // ARN-based resources (arn:aws:service:region:account:resource)
  if (id.startsWith("arn:aws:")) {
    const arnParts = id.split(":")
    const service = arnParts[2] // The service name is the 3rd part

    switch (service) {
      // Compute
      case "lambda":
        return "LambdaFunction"
      case "ecs":
        if (id.includes(":service/")) return "ECSService"
        if (id.includes(":cluster/")) return "ECSCluster"
        if (id.includes(":task-definition/")) return "ECSTaskDefinition"
        if (id.includes(":task/")) return "ECSTask"
        return "ECS"
      case "ec2":
        return "EC2Instance"

      // Database
      case "rds":
        if (id.includes(":cluster:")) return "RDSCluster"
        return "RDSInstance"
      case "dynamodb":
        return "DynamoDBTable"
      case "elasticache":
        return "ElastiCache"
      case "redshift":
        return "Redshift"
      case "neptune":
        return "Neptune"
      case "docdb":
        return "DocumentDB"
      case "timestream":
        return "Timestream"
      case "qldb":
        return "QLDB"
      case "memorydb":
        return "MemoryDB"
      case "dax":
        return "DAX"

      // Storage
      case "s3":
        return "S3Bucket"
      case "elasticfilesystem":
        return "EFS"
      case "fsx":
        return "FSx"
      case "storagegateway":
        return "StorageGateway"
      case "backup":
        return "Backup"
      case "glacier":
        return "Glacier"

      // Messaging & Integration
      case "sqs":
        return "SQSQueue"
      case "sns":
        return "SNSTopic"
      case "events":
        return "EventBridgeRule"
      case "states":
        return "StepFunction"
      case "kinesis":
        return "KinesisStream"
      case "firehose":
        return "KinesisFirehose"
      case "mq":
        return "AmazonMQ"
      case "kafka":
        return "MSK"
      case "scheduler":
        return "EventBridgeScheduler"

      // API & Networking
      case "apigateway":
        return "APIGateway"
      case "execute-api":
        return "APIGateway"
      case "elasticloadbalancing":
        if (id.includes("/net/")) return "NLB"
        if (id.includes("/app/")) return "ALB"
        return "ELB"
      case "cloudfront":
        return "CloudFront"
      case "route53":
        return "Route53"
      case "appsync":
        return "AppSync"
      case "globalaccelerator":
        return "GlobalAccelerator"
      case "appmesh":
        return "AppMesh"
      case "servicediscovery":
        return "CloudMap"

      // Security & Identity
      case "iam":
        if (id.includes(":role/")) return "IAMRole"
        if (id.includes(":policy/")) return "IAMPolicy"
        if (id.includes(":user/")) return "IAMUser"
        if (id.includes(":group/")) return "IAMGroup"
        if (id.includes(":instance-profile/")) return "IAMInstanceProfile"
        if (id.includes(":oidc-provider/")) return "IAMOIDCProvider"
        if (id.includes(":saml-provider/")) return "IAMSAMLProvider"
        return "IAM"
      case "sts":
        return "STS"
      case "kms":
        return "KMSKey"
      case "secretsmanager":
        return "SecretsManager"
      case "ssm":
        if (id.includes(":parameter/")) return "SSMParameter"
        if (id.includes(":document/")) return "SSMDocument"
        return "SSM"
      case "acm":
        return "ACMCertificate"
      case "acm-pca":
        return "ACMPCA"
      case "waf":
      case "wafv2":
        return "WAF"
      case "waf-regional":
        return "WAFRegional"
      case "guardduty":
        return "GuardDuty"
      case "inspector":
      case "inspector2":
        return "Inspector"
      case "securityhub":
        return "SecurityHub"
      case "macie2":
        return "Macie"
      case "detective":
        return "Detective"
      case "fms":
        return "FirewallManager"
      case "shield":
        return "Shield"
      case "network-firewall":
        return "NetworkFirewall"
      case "access-analyzer":
        return "IAMAccessAnalyzer"

      // Monitoring & Logging
      case "logs":
        return "CloudWatchLogs"
      case "cloudwatch":
        return "CloudWatch"
      case "cloudtrail":
        return "CloudTrail"
      case "xray":
        return "XRay"
      case "config":
        return "Config"
      case "health":
        return "AWSHealth"
      case "application-insights":
        return "ApplicationInsights"

      // Analytics
      case "athena":
        return "Athena"
      case "glue":
        return "Glue"
      case "emr":
        return "EMR"
      case "opensearch":
      case "es":
        return "OpenSearch"
      case "quicksight":
        return "QuickSight"
      case "datapipeline":
        return "DataPipeline"
      case "lakeformation":
        return "LakeFormation"
      case "databrew":
        return "DataBrew"

      // Containers & Serverless
      case "ecr":
        return "ECR"
      case "eks":
        return "EKS"
      case "batch":
        return "Batch"
      case "apprunner":
        return "AppRunner"
      case "lightsail":
        return "Lightsail"

      // AI/ML
      case "sagemaker":
        return "SageMaker"
      case "bedrock":
        return "Bedrock"
      case "rekognition":
        return "Rekognition"
      case "comprehend":
        return "Comprehend"
      case "textract":
        return "Textract"
      case "polly":
        return "Polly"
      case "transcribe":
        return "Transcribe"
      case "translate":
        return "Translate"
      case "lex":
        return "Lex"
      case "kendra":
        return "Kendra"
      case "personalize":
        return "Personalize"
      case "forecast":
        return "Forecast"

      // IoT
      case "iot":
        return "IoTCore"
      case "greengrass":
        return "Greengrass"
      case "iotanalytics":
        return "IoTAnalytics"
      case "iotevents":
        return "IoTEvents"
      case "iotsitewise":
        return "IoTSiteWise"

      // Developer Tools
      case "cognito-idp":
      case "cognito-identity":
        return "Cognito"
      case "ses":
        return "SES"
      case "sesv2":
        return "SESv2"
      case "pinpoint":
        return "Pinpoint"
      case "codepipeline":
        return "CodePipeline"
      case "codebuild":
        return "CodeBuild"
      case "codecommit":
        return "CodeCommit"
      case "codedeploy":
        return "CodeDeploy"
      case "codeartifact":
        return "CodeArtifact"
      case "codeguru-reviewer":
        return "CodeGuruReviewer"
      case "codeguru-profiler":
        return "CodeGuruProfiler"
      case "codestar":
        return "CodeStar"
      case "amplify":
        return "Amplify"
      case "appconfig":
        return "AppConfig"
      case "servicecatalog":
        return "ServiceCatalog"
      case "proton":
        return "Proton"

      // Management & Governance
      case "organizations":
        return "Organizations"
      case "ram":
        return "ResourceAccessManager"
      case "controltower":
        return "ControlTower"
      case "sso":
        return "IAMIdentityCenter"
      case "license-manager":
        return "LicenseManager"
      case "compute-optimizer":
        return "ComputeOptimizer"
      case "wellarchitected":
        return "WellArchitected"
      case "trustedadvisor":
        return "TrustedAdvisor"

      // Cost Management
      case "ce":
        return "CostExplorer"
      case "budgets":
        return "Budgets"
      case "cur":
        return "CostUsageReport"

      default:
        console.log(`[auto-tag] Unknown ARN service: ${service} from ${id}`)
        return service.charAt(0).toUpperCase() + service.slice(1) // Capitalize service name
    }
  }

  // S3 bucket names (not ARNs, just bucket names)
  if (id.match(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/) && !id.includes(":")) {
    // Likely an S3 bucket name
    return "S3Bucket"
  }

  console.log(`[auto-tag] Could not detect type for: ${id}`)
  return "Unknown"
}

export async function POST(request: Request) {
  const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

  try {
    const body = await request.json()
    const { systemName, resourceIds } = body

    console.log("[API Proxy] Auto-tagging system:", systemName, "with", resourceIds?.length || 0, "resources")

    const resources = (resourceIds || []).map((id: string) => ({
      id: id,
      type: detectResourceType(id),
    }))

    // Log detected types for debugging
    const typeCounts: Record<string, number> = {}
    resources.forEach((r: { id: string; type: string }) => {
      typeCounts[r.type] = (typeCounts[r.type] || 0) + 1
    })
    console.log("[API Proxy] Detected resource types:", typeCounts)

    const response = await fetch(`${backendUrl}/api/auto-tag`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        system_name: systemName,
        resources: resources,
      }),
      signal: AbortSignal.timeout(30000),
    })

    console.log("[API Proxy] Auto-tag response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[API Proxy] Auto-tag error:", response.status, errorText)
      return Response.json({ error: `Auto-tagging failed: ${response.status}` }, { status: response.status })
    }

    const data = await response.json()
    console.log("[API Proxy] Auto-tag success, tagged count:", data.tagged_count)

    const results = resources.map((r: { id: string; type: string }) => ({
      resourceId: r.id,
      resourceType: r.type,
      success: true,
    }))

    return Response.json({
      success: true,
      taggedCount: data.tagged_count || resources.length,
      results: results,
      detectedTypes: typeCounts,
    })
  } catch (error: any) {
    console.error("[API Proxy] Auto-tag failed:", error.name, error.message)

    return Response.json(
      {
        error: error.message || "Failed to auto-tag system",
        hint: "Verify backend /api/auto-tag endpoint is implemented",
      },
      { status: 500 },
    )
  }
}
