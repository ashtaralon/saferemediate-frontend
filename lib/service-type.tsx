/**
 * Canonical AWS service / resource-type visual language.
 * ---------------------------------------------------------------------------
 * ONE source of truth for how an AWS resource type is rendered anywhere in the
 * platform — icon, color, label. Before this, ~18 independent maps existed
 * (crown-jewel-list-panel `getJewelTypeMeta`, attack-path-card-light
 * `awsNodeMeta`, all-services-tab `SERVICE_ICONS`/`SERVICE_COLORS`,
 * traffic-flow-map `NODE_CONFIG`, per-resource-analysis, FindingCard labels …),
 * keyed five incompatible ways (`S3` / `S3Bucket` / `AWS::S3::Bucket` /
 * `s3_bucket` / `s3`). That is why the same jewel looked different on every
 * surface. This module unifies them:
 *
 *   getServiceMeta(anySpelling) -> { label, short, Icon, accent, chip, tile… }
 *   <ServiceTypeBadge type={...} variant="tile|chip|inline" onDark? />
 *
 * `resolveServiceType` normalizes ALL known spellings (PascalCase, short,
 * snake_case, CloudFormation, lowercase service-id, plus a substring fallback
 * for fuzzy callers) to a single CanonicalServiceType, so callers can keep
 * passing whatever their payload gives them.
 *
 * Rollout: adopt this everywhere a service type is rendered and delete the
 * local map. Triple-coded (color + icon + label) so type never rides on color
 * alone — legible under colorblindness and on the dark map island.
 */
import type { LucideIcon } from "lucide-react";
import {
  Package,
  Folders,
  Key,
  Lock,
  Database,
  Server,
  Zap,
  UserCog,
  User,
  ScrollText,
  Shield,
  ShieldHalf,
  Waypoints,
  Network,
  Box,
} from "lucide-react";

export type CanonicalServiceType =
  | "S3"
  | "KMS"
  | "EFS"
  | "DynamoDB"
  | "RDS"
  | "SecretsManager"
  | "EC2"
  | "Lambda"
  | "IAMRole"
  | "IAMUser"
  | "IAMPolicy"
  | "SecurityGroup"
  | "NACL"
  | "VPCEndpoint"
  | "LoadBalancer"
  | "Resource"; // fallback

export type ServiceCategory =
  | "storage"
  | "database"
  | "security"
  | "compute"
  | "identity"
  | "network"
  | "other";

export interface ServiceMeta {
  key: CanonicalServiceType;
  /** Human label, e.g. "Secrets Manager". */
  label: string;
  /** Compact label for chips/rails, e.g. "KMS", "DDB". */
  short: string;
  category: ServiceCategory;
  Icon: LucideIcon;
  /** Main hex — icon + text color on a LIGHT surface. */
  accent: string;
  /** Tile / chip background on a LIGHT surface. */
  bgLight: string;
  /** Tile / chip border on a LIGHT surface. */
  bdLight: string;
  /** Tile / chip background on the DARK map island. */
  bgDark: string;
  /** Icon + text color on the DARK map island. */
  iconDark: string;
}

/**
 * The canonical palette. Colors follow AWS category conventions but are pulled
 * apart enough (green storage, red keys, blue/indigo databases, pink secrets)
 * that a fatigued analyst can tell them apart at a glance in the rail.
 */
export const SERVICE_TYPE_CONFIG: Record<CanonicalServiceType, ServiceMeta> = {
  S3: { key: "S3", label: "S3", short: "S3", category: "storage", Icon: Package, accent: "#1E8A4C", bgLight: "#E7F6EF", bdLight: "#B7E4CC", bgDark: "#12332A", iconDark: "#5DCAA5" },
  EFS: { key: "EFS", label: "EFS", short: "EFS", category: "storage", Icon: Folders, accent: "#0D8577", bgLight: "#E1F5F0", bdLight: "#A9E5D8", bgDark: "#0E3A34", iconDark: "#5DD3BE" },
  KMS: { key: "KMS", label: "KMS", short: "KMS", category: "security", Icon: Key, accent: "#C7131F", bgLight: "#FCEBEB", bdLight: "#F4C9C9", bgDark: "#3A1516", iconDark: "#F4A0A0" },
  SecretsManager: { key: "SecretsManager", label: "Secrets Manager", short: "Secret", category: "security", Icon: Lock, accent: "#BE185D", bgLight: "#FBEAF0", bdLight: "#F2C6DA", bgDark: "#3A1524", iconDark: "#EE93B6" },
  DynamoDB: { key: "DynamoDB", label: "DynamoDB", short: "DDB", category: "database", Icon: Database, accent: "#185FA5", bgLight: "#E6F1FB", bdLight: "#BBD8F3", bgDark: "#12283A", iconDark: "#7FB6E8" },
  RDS: { key: "RDS", label: "RDS", short: "RDS", category: "database", Icon: Database, accent: "#4338CA", bgLight: "#EEF0FE", bdLight: "#C9CEF7", bgDark: "#1E1F45", iconDark: "#A9AEF2" },
  EC2: { key: "EC2", label: "EC2", short: "EC2", category: "compute", Icon: Server, accent: "#C4460A", bgLight: "#FEF0E6", bdLight: "#F9D9C4", bgDark: "#3A2113", iconDark: "#F0A272" },
  Lambda: { key: "Lambda", label: "Lambda", short: "Lambda", category: "compute", Icon: Zap, accent: "#B45309", bgLight: "#FEF3E0", bdLight: "#F5DDB0", bgDark: "#3A2A0F", iconDark: "#E8B45E" },
  IAMRole: { key: "IAMRole", label: "IAM role", short: "Role", category: "identity", Icon: UserCog, accent: "#6D28D9", bgLight: "#F1EDFE", bdLight: "#D9CCF7", bgDark: "#241340", iconDark: "#B79AF0" },
  IAMUser: { key: "IAMUser", label: "IAM user", short: "User", category: "identity", Icon: User, accent: "#6D28D9", bgLight: "#F1EDFE", bdLight: "#D9CCF7", bgDark: "#241340", iconDark: "#B79AF0" },
  IAMPolicy: { key: "IAMPolicy", label: "IAM policy", short: "Policy", category: "identity", Icon: ScrollText, accent: "#6D28D9", bgLight: "#F1EDFE", bdLight: "#D9CCF7", bgDark: "#241340", iconDark: "#B79AF0" },
  SecurityGroup: { key: "SecurityGroup", label: "Security group", short: "SG", category: "network", Icon: Shield, accent: "#475569", bgLight: "#EEF2F6", bdLight: "#CBD5E1", bgDark: "#1E293B", iconDark: "#94A3B8" },
  NACL: { key: "NACL", label: "Network ACL", short: "NACL", category: "network", Icon: ShieldHalf, accent: "#475569", bgLight: "#EEF2F6", bdLight: "#CBD5E1", bgDark: "#1E293B", iconDark: "#94A3B8" },
  VPCEndpoint: { key: "VPCEndpoint", label: "VPC endpoint", short: "VPCE", category: "network", Icon: Waypoints, accent: "#0891B2", bgLight: "#E4F5FA", bdLight: "#B4E2EF", bgDark: "#0E3038", iconDark: "#5FD0E5" },
  LoadBalancer: { key: "LoadBalancer", label: "Load balancer", short: "ELB", category: "network", Icon: Network, accent: "#7C3AED", bgLight: "#F2EDFE", bdLight: "#D6C6F8", bgDark: "#271444", iconDark: "#BFA0F2" },
  Resource: { key: "Resource", label: "Resource", short: "Resource", category: "other", Icon: Box, accent: "#5E5E5E", bgLight: "#F4F4F5", bdLight: "#E5E5E7", bgDark: "#1B2A3A", iconDark: "#8BA0B4" },
};

/** Exact-spelling alias table → canonical key. Covers the five families the
 *  Explore audit found across payloads. Keys are normalized (see `normalize`). */
const ALIAS: Record<string, CanonicalServiceType> = {
  s3: "S3", s3bucket: "S3", awss3bucket: "S3",
  efs: "EFS", efsfilesystem: "EFS", elasticfilesystem: "EFS", awsefsfilesystem: "EFS",
  kms: "KMS", kmskey: "KMS", awskmskey: "KMS",
  secret: "SecretsManager", secretsmanager: "SecretsManager", secretsmanagersecret: "SecretsManager",
  dynamodb: "DynamoDB", dynamodbtable: "DynamoDB", ddb: "DynamoDB", awsdynamodbtable: "DynamoDB",
  rds: "RDS", rdsinstance: "RDS", rdsdbinstance: "RDS", awsrdsdbinstance: "RDS", aurora: "RDS",
  ec2: "EC2", ec2instance: "EC2", awsec2instance: "EC2", instance: "EC2",
  lambda: "Lambda", lambdafunction: "Lambda", awslambdafunction: "Lambda",
  iamrole: "IAMRole", role: "IAMRole", iam: "IAMRole", awsiamrole: "IAMRole",
  iamuser: "IAMUser",
  iampolicy: "IAMPolicy",
  securitygroup: "SecurityGroup", awsec2securitygroup: "SecurityGroup",
  nacl: "NACL", networkacl: "NACL", awsec2networkacl: "NACL",
  vpcendpoint: "VPCEndpoint", vpce: "VPCEndpoint",
  loadbalancer: "LoadBalancer", elb: "LoadBalancer", alb: "LoadBalancer", nlb: "LoadBalancer",
};

/** Ordered substring fallback for fuzzy callers (per-resource-analysis et al).
 *  Specific fragments first so "securitygroup" wins before "security". */
const SUBSTR: [string, CanonicalServiceType][] = [
  ["securitygroup", "SecurityGroup"],
  ["networkacl", "NACL"], ["nacl", "NACL"],
  ["s3", "S3"], ["bucket", "S3"],
  ["efs", "EFS"], ["mounttarget", "EFS"],
  ["dynamo", "DynamoDB"],
  ["aurora", "RDS"], ["rds", "RDS"],
  ["secret", "SecretsManager"],
  ["kms", "KMS"],
  ["lambda", "Lambda"],
  ["vpce", "VPCEndpoint"], ["vpcendpoint", "VPCEndpoint"],
  ["loadbalancer", "LoadBalancer"], ["elb", "LoadBalancer"],
  ["ec2", "EC2"], ["instance", "EC2"],
  ["iampolicy", "IAMPolicy"], ["policy", "IAMPolicy"],
  ["iamuser", "IAMUser"],
  ["iamrole", "IAMRole"], ["role", "IAMRole"],
  ["key", "KMS"],
];

function normalize(raw?: string | null): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/^aws::/, "")
    .replace(/::/g, "")
    .replace(/[_\-\s.]/g, "");
}

/** Normalize any known spelling of an AWS type to a CanonicalServiceType. */
export function resolveServiceType(raw?: string | null): CanonicalServiceType {
  const n = normalize(raw);
  if (!n) return "Resource";
  if (ALIAS[n]) return ALIAS[n];
  for (const [frag, t] of SUBSTR) if (n.includes(frag)) return t;
  return "Resource";
}

/** The full visual descriptor for any spelling of a type. Never throws. */
export function getServiceMeta(raw?: string | null): ServiceMeta {
  return SERVICE_TYPE_CONFIG[resolveServiceType(raw)];
}

export type ServiceBadgeVariant = "tile" | "chip" | "inline";

export interface ServiceTypeBadgeProps {
  /** Any spelling of the type — resolved through `resolveServiceType`. */
  type?: string | null;
  /** tile = colored icon square (rails, cards); chip = pill w/ icon+label;
   *  inline = bare icon (+optional label). Default "tile". */
  variant?: ServiceBadgeVariant;
  /** Render for the dark map island instead of a light surface. */
  onDark?: boolean;
  /** Show the text label. Defaults: tile→false, chip/inline→true. */
  showLabel?: boolean;
  /** Tile edge / icon size in px. Default 34 (tile), scales the glyph. */
  size?: number;
  className?: string;
}

/**
 * The one badge to render an AWS service/resource type anywhere.
 * Triple-coded: color + icon + (optional) label.
 */
export function ServiceTypeBadge({
  type,
  variant = "tile",
  onDark = false,
  showLabel,
  size = 34,
  className,
}: ServiceTypeBadgeProps) {
  const m = getServiceMeta(type);
  const Icon = m.Icon;
  const color = onDark ? m.iconDark : m.accent;
  const withLabel = showLabel ?? variant !== "tile";

  if (variant === "inline") {
    return (
      <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon size={16} color={color} aria-hidden={withLabel} aria-label={withLabel ? undefined : m.label} />
        {withLabel && <span style={{ color, fontWeight: 600, fontSize: 12 }}>{m.short}</span>}
      </span>
    );
  }

  if (variant === "chip") {
    return (
      <span
        className={className}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "2px 8px", borderRadius: 6,
          background: onDark ? m.bgDark : m.bgLight,
          border: `1px solid ${onDark ? "rgba(255,255,255,0.08)" : m.bdLight}`,
          color, fontWeight: 600, fontSize: 11, lineHeight: 1.4,
        }}
      >
        <Icon size={13} aria-hidden />
        {withLabel && m.short}
      </span>
    );
  }

  // tile
  return (
    <span
      className={className}
      role="img"
      aria-label={m.label}
      title={m.label}
      style={{
        flexShrink: 0, width: size, height: size, borderRadius: 8,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: onDark ? m.bgDark : m.bgLight,
        border: `1px solid ${onDark ? "rgba(255,255,255,0.08)" : m.bdLight}`,
      }}
    >
      <Icon size={Math.round(size * 0.56)} color={color} aria-hidden />
    </span>
  );
}
