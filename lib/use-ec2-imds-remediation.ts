/** AC-1 shadow remediation — enforce IMDSv2 (HttpTokens=required) on EC2. */

export type Ec2ImdsShadowRequest = {
  instance_id: string
  region?: string
  requested_by?: string
  annotation?: string
}

export type Ec2ImdsShadowResult = {
  success?: boolean
  mode?: string
  shadow_record_id?: string
  instance_id?: string
  would_set_http_tokens?: string
  blocked_reasons?: string[]
  error?: string
  detail?: string
}

export async function postEc2ImdsShadowRemediation(
  req: Ec2ImdsShadowRequest,
): Promise<Ec2ImdsShadowResult> {
  const res = await fetch("/api/proxy/ec2-imds-remediation/shadow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instance_id: req.instance_id,
      region: req.region ?? "eu-west-1",
      requested_by: req.requested_by ?? "operator",
      annotation: req.annotation,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Ec2ImdsShadowResult & {
    detail?: string
  }
  if (!res.ok) {
    throw new Error(data.detail || data.error || `Shadow IMDS remediation failed (${res.status})`)
  }
  return data
}
