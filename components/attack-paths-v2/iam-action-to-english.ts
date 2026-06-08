// IAM action → plain-English sentence lookup.
//
// Translates IAM action ARNs (e.g. "s3:DeleteObject") into operator-
// readable damage sentences (e.g. "Delete files in S3 buckets").
// Bucketed by capability class so the UI can color/group them:
//
//   destructive — irreversible data loss (delete, schedule-deletion)
//   exfil       — data leaves the perimeter (read, make public, copy)
//   manipulate  — change data, encryption, or who can access
//
// Coverage: the actions that matter for the demo + the production
// CJ types. Easy to extend — add a new entry to ACTION_DICT.
//
// When an action isn't in the dictionary we fall back to a generic
// templated sentence so the UI never renders a raw "iam:DoThing"
// string to operators per `feedback_demo_safe_source_labels`.

export type DamageCategory = "destructive" | "exfil" | "manipulate" | "control_plane"

export interface DamageEntry {
  category: DamageCategory
  /** Operator-readable sentence — first word capitalised, no period. */
  sentence: string
}

// The dictionary. Keyed by lowercased "service:action" so lookup is
// case-insensitive. Patterns ending with "*" match wildcard actions.
const ACTION_DICT: Record<string, DamageEntry> = {
  // ─── S3 ─────────────────────────────────────────────────────
  "s3:deleteobject": { category: "destructive", sentence: "Delete files in the bucket" },
  "s3:deleteobjectversion": { category: "destructive", sentence: "Delete specific versions of files (bypassing versioning)" },
  "s3:deletebucket": { category: "destructive", sentence: "Delete the entire bucket and every file in it" },
  "s3:deletebucketpolicy": { category: "manipulate", sentence: "Remove the bucket access policy (opens the door to other attackers)" },
  "s3:deletebucketwebsite": { category: "destructive", sentence: "Take down the bucket website" },
  "s3:abortmultipartupload": { category: "manipulate", sentence: "Interrupt large file uploads in progress" },
  "s3:putobject": { category: "manipulate", sentence: "Upload arbitrary files (data poisoning, ransomware drop)" },
  "s3:putobjectacl": { category: "exfil", sentence: "Change who can read individual files (publish them publicly)" },
  "s3:putbucketacl": { category: "exfil", sentence: "Change who can read the bucket (publish it publicly)" },
  "s3:putbucketpolicy": { category: "manipulate", sentence: "Replace the bucket policy with their own" },
  "s3:putbucketpublicaccessblock": { category: "manipulate", sentence: "Turn off the bucket's public-access protection" },
  "s3:deletebucketpublicaccessblock": { category: "manipulate", sentence: "Turn off the bucket's public-access protection" },
  "s3:getobject": { category: "exfil", sentence: "Read every file in the bucket" },
  "s3:getobjectversion": { category: "exfil", sentence: "Read past versions of every file" },
  "s3:listbucket": { category: "exfil", sentence: "List every file in the bucket" },
  "s3:replicateobject": { category: "exfil", sentence: "Copy the bucket's data to another S3 location" },

  // ─── DynamoDB ───────────────────────────────────────────────
  "dynamodb:deletetable": { category: "destructive", sentence: "Delete the entire table" },
  "dynamodb:deleteitem": { category: "destructive", sentence: "Delete rows from the table" },
  "dynamodb:batchwriteitem": { category: "manipulate", sentence: "Bulk-modify or delete rows" },
  "dynamodb:updateitem": { category: "manipulate", sentence: "Modify rows in the table" },
  "dynamodb:putitem": { category: "manipulate", sentence: "Insert arbitrary rows" },
  "dynamodb:getitem": { category: "exfil", sentence: "Read specific rows" },
  "dynamodb:scan": { category: "exfil", sentence: "Read every row in the table" },
  "dynamodb:query": { category: "exfil", sentence: "Run targeted queries against the table" },
  "dynamodb:exporttabletopointintime": { category: "exfil", sentence: "Export the whole table to S3" },

  // ─── RDS ────────────────────────────────────────────────────
  "rds:deletedbinstance": { category: "destructive", sentence: "Delete the entire database" },
  "rds:deletedbcluster": { category: "destructive", sentence: "Delete the entire database cluster" },
  "rds:rebootdbinstance": { category: "manipulate", sentence: "Force-restart the database (disruption)" },
  "rds:modifydbinstance": { category: "manipulate", sentence: "Change database configuration (publicly accessible, master password, etc.)" },
  "rds:createdbsnapshot": { category: "exfil", sentence: "Snapshot the database — and possibly share the snapshot externally" },
  "rds:copydbsnapshot": { category: "exfil", sentence: "Copy the database to another AWS region or account" },
  "rds:modifydbsnapshotattribute": { category: "exfil", sentence: "Share a database snapshot with another AWS account or the public" },
  "rds:restoredbinstancefromdbsnapshot": { category: "manipulate", sentence: "Restore the database to an attacker-controlled instance" },

  // ─── KMS ────────────────────────────────────────────────────
  "kms:schedulekeydeletion": { category: "destructive", sentence: "Permanently destroy the encryption key (every file using it becomes unrecoverable)" },
  "kms:disablekey": { category: "destructive", sentence: "Disable the encryption key (every file using it becomes unreadable)" },
  "kms:putkeypolicy": { category: "manipulate", sentence: "Rewrite the key access policy (lock the owner out)" },
  "kms:decrypt": { category: "exfil", sentence: "Decrypt data protected by this key" },
  "kms:encrypt": { category: "manipulate", sentence: "Re-encrypt data with a key the attacker controls" },
  "kms:reencrypt*": { category: "manipulate", sentence: "Replace the encryption key on encrypted data" },
  "kms:generatedatakey": { category: "manipulate", sentence: "Generate new data keys (lay groundwork for re-encryption attacks)" },
  "kms:scheduledeletion": { category: "destructive", sentence: "Schedule the encryption key for deletion" },

  // ─── Secrets Manager / SSM Parameter Store ─────────────────
  "secretsmanager:getsecretvalue": { category: "exfil", sentence: "Read secrets (API keys, passwords, tokens)" },
  "secretsmanager:deletesecret": { category: "destructive", sentence: "Delete secrets (downstream services break)" },
  "secretsmanager:updatesecret": { category: "manipulate", sentence: "Replace secrets with attacker-controlled values" },
  "ssm:getparameter": { category: "exfil", sentence: "Read SecureString parameters (secrets)" },
  "ssm:putparameter": { category: "manipulate", sentence: "Overwrite SecureString parameters" },
  "ssm:deleteparameter": { category: "destructive", sentence: "Delete configuration parameters" },

  // ─── IAM (the meta-escalation actions) ─────────────────────
  "iam:passrole": { category: "manipulate", sentence: "Hand over this role to other services (privilege escalation primitive)" },
  "iam:attachuserpolicy": { category: "manipulate", sentence: "Attach policies to any user (privilege escalation)" },
  "iam:attachrolepolicy": { category: "manipulate", sentence: "Attach policies to any role (privilege escalation)" },
  "iam:createaccesskey": { category: "exfil", sentence: "Mint long-lived access keys for any user" },
  "iam:updateassumerolepolicy": { category: "manipulate", sentence: "Make a role assumable from an external account" },
  "iam:createrole": { category: "manipulate", sentence: "Create new roles to persist access" },
  "iam:createuser": { category: "manipulate", sentence: "Create new IAM users to persist access" },
  "iam:deleterole": { category: "destructive", sentence: "Delete IAM roles (lock legitimate services out)" },
  "sts:assumerole": { category: "manipulate", sentence: "Assume other roles in the account" },

  // ─── EC2 / SSM (lateral movement primitives) ───────────────
  "ec2:terminateinstances": { category: "destructive", sentence: "Terminate EC2 instances" },
  "ec2:rebootinstances": { category: "manipulate", sentence: "Force-reboot EC2 instances (disruption)" },
  "ec2:modifyinstanceattribute": { category: "manipulate", sentence: "Replace the user-data or IAM role on EC2 instances" },
  "ec2:createsnapshot": { category: "exfil", sentence: "Snapshot EBS volumes (can be shared publicly to exfiltrate)" },
  "ec2:modifysnapshotattribute": { category: "exfil", sentence: "Share an EBS snapshot publicly or with another account" },
  "ssm:startsession": { category: "manipulate", sentence: "Open an interactive shell on EC2 instances (no SSH key needed)" },
  "ssm:sendcommand": { category: "manipulate", sentence: "Run arbitrary commands on EC2 instances" },

  // ─── Lambda ────────────────────────────────────────────────
  "lambda:updatefunctioncode": { category: "manipulate", sentence: "Replace Lambda function code with attacker-controlled code" },
  "lambda:updatefunctionconfiguration": { category: "manipulate", sentence: "Change Lambda environment variables or IAM role" },
  "lambda:invokefunction": { category: "manipulate", sentence: "Invoke Lambda functions" },
  "lambda:deletefunction": { category: "destructive", sentence: "Delete Lambda functions" },
}

// Wildcard / prefix matches. Lower-prio than exact matches — checked
// only when an exact key isn't found. Patterns end with "*" and match
// against the action's lower-cased form.
const WILDCARD_PATTERNS: Array<{ prefix: string; entry: DamageEntry }> = [
  { prefix: "s3:get", entry: { category: "exfil", sentence: "Read S3 bucket data" } },
  { prefix: "s3:put", entry: { category: "manipulate", sentence: "Write to S3 buckets" } },
  { prefix: "s3:delete", entry: { category: "destructive", sentence: "Delete S3 bucket data" } },
  { prefix: "dynamodb:delete", entry: { category: "destructive", sentence: "Delete DynamoDB data" } },
  { prefix: "dynamodb:put", entry: { category: "manipulate", sentence: "Write to DynamoDB tables" } },
  { prefix: "dynamodb:update", entry: { category: "manipulate", sentence: "Modify DynamoDB rows" } },
  { prefix: "kms:", entry: { category: "manipulate", sentence: "Manipulate KMS keys" } },
  { prefix: "iam:create", entry: { category: "manipulate", sentence: "Create IAM resources (persistence)" } },
  { prefix: "iam:delete", entry: { category: "destructive", sentence: "Delete IAM resources" } },
  { prefix: "iam:update", entry: { category: "manipulate", sentence: "Modify IAM resources" } },
  { prefix: "ec2:terminate", entry: { category: "destructive", sentence: "Terminate EC2 instances" } },
]

// Wildcard "*:*" or "service:*" pattern matchers — most operator-
// scary because they grant the whole action class.
function classifyWildcard(action: string): DamageEntry | null {
  const a = action.toLowerCase()
  if (a === "*" || a === "*:*") {
    return { category: "destructive", sentence: "Do anything in this AWS account (admin)" }
  }
  if (a === "s3:*") return { category: "destructive", sentence: "Do anything to any S3 bucket in the account (read, write, delete)" }
  if (a === "dynamodb:*") return { category: "destructive", sentence: "Do anything to any DynamoDB table" }
  if (a === "rds:*") return { category: "destructive", sentence: "Do anything to any database (delete, snapshot, modify)" }
  if (a === "kms:*") return { category: "destructive", sentence: "Manage every encryption key (lock the owner out)" }
  if (a === "iam:*") return { category: "destructive", sentence: "Manage every IAM principal (full account takeover)" }
  if (a === "ec2:*") return { category: "destructive", sentence: "Do anything to any EC2 instance" }
  return null
}

/**
 * Translate one IAM action ARN to plain English. Falls back to a
 * generic templated sentence when the action isn't catalogued so
 * the UI never leaks a raw ARN.
 */
export function actionToEnglish(action: string): DamageEntry {
  if (!action) return { category: "control_plane", sentence: "Take an unspecified action" }

  // 1. Wildcard sweep first — `*:*` overrides any specific match.
  const wc = classifyWildcard(action)
  if (wc) return wc

  // 2. Exact match.
  const lower = action.toLowerCase()
  if (ACTION_DICT[lower]) return ACTION_DICT[lower]

  // 3. Prefix patterns.
  for (const { prefix, entry } of WILDCARD_PATTERNS) {
    if (lower.startsWith(prefix)) return entry
  }

  // 4. Final fallback — generic template.
  const [service, verb] = action.split(":")
  if (!verb) return { category: "control_plane", sentence: `Call ${service}` }
  const verbReadable = verb
    .replace(/([A-Z])/g, " $1")
    .toLowerCase()
    .trim()
  return {
    category: "control_plane",
    sentence: `${verbReadable.charAt(0).toUpperCase()}${verbReadable.slice(1)} (${service})`,
  }
}

/**
 * Translate a list of actions and group by category for UI rendering.
 * De-duplicates sentences so the same capability doesn't appear twice
 * (e.g. when s3:GetObject and s3:GetObjectVersion both render as "Read every file").
 */
export function classifyActions(actions: string[]): Record<DamageCategory, string[]> {
  const buckets: Record<DamageCategory, Set<string>> = {
    destructive: new Set(),
    exfil: new Set(),
    manipulate: new Set(),
    control_plane: new Set(),
  }
  for (const a of actions) {
    const e = actionToEnglish(a)
    buckets[e.category].add(e.sentence)
  }
  return {
    destructive: Array.from(buckets.destructive),
    exfil: Array.from(buckets.exfil),
    manipulate: Array.from(buckets.manipulate),
    control_plane: Array.from(buckets.control_plane),
  }
}
