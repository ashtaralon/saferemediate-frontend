"use client"

import React from "react"

// ============================================================================
// OFFICIAL AWS ARCHITECTURE ICONS
// Based on AWS Architecture Icons (2024 Release)
// https://aws.amazon.com/architecture/icons/
// ============================================================================

interface IconProps {
  size?: number
  className?: string
}

// AWS Color Palette (Official)
export const AWS_COLORS = {
  // Compute - Orange
  compute: "#ED7100",
  computeLight: "#F9A966",

  // Database - Blue
  database: "#527FFF",
  databaseLight: "#9DBDFF",

  // Storage - Green
  storage: "#7AA116",
  storageLight: "#A9D45A",

  // Networking - Purple
  networking: "#8C4FFF",
  networkingLight: "#C19EFF",

  // Security - Red
  security: "#DD344C",
  securityLight: "#FF6B6B",

  // Integration - Pink/Magenta
  integration: "#E7157B",
  integrationLight: "#FF5CA1",

  // Management - Pink
  management: "#E7157B",

  // Analytics - Blue
  analytics: "#8C4FFF",

  // General AWS
  awsOrange: "#FF9900",
  awsSquidInk: "#232F3E",
  awsSmile: "#FF9900",
}

// ============================================================================
// COMPUTE ICONS
// ============================================================================

export const EC2Icon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.compute}/>
    <path d="M24 8L38 16V32L24 40L10 32V16L24 8Z" fill="white" fillOpacity="0.2"/>
    <rect x="14" y="14" width="8" height="8" rx="1" fill="white"/>
    <rect x="26" y="14" width="8" height="8" rx="1" fill="white"/>
    <rect x="14" y="26" width="8" height="8" rx="1" fill="white"/>
    <rect x="26" y="26" width="8" height="8" rx="1" fill="white"/>
  </svg>
)

export const LambdaIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.compute}/>
    <path d="M14 34L22 14H26L21 26L28 26L34 14H38L28 34H14Z" fill="white"/>
  </svg>
)

export const ECSIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.compute}/>
    <rect x="12" y="12" width="24" height="24" rx="4" stroke="white" strokeWidth="2" fill="none"/>
    <circle cx="18" cy="18" r="3" fill="white"/>
    <circle cx="30" cy="18" r="3" fill="white"/>
    <circle cx="18" cy="30" r="3" fill="white"/>
    <circle cx="30" cy="30" r="3" fill="white"/>
    <path d="M21 18H27M18 21V27M30 21V27M21 30H27" stroke="white" strokeWidth="1.5"/>
  </svg>
)

export const EKSIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.compute}/>
    <path d="M24 10L36 17V31L24 38L12 31V17L24 10Z" stroke="white" strokeWidth="2" fill="none"/>
    <circle cx="24" cy="24" r="6" fill="white"/>
    <path d="M24 14V18M24 30V34M14 19L18 21M30 27L34 29M34 19L30 21M18 27L14 29" stroke="white" strokeWidth="2"/>
  </svg>
)

// ============================================================================
// DATABASE ICONS
// ============================================================================

export const RDSIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.database}/>
    <ellipse cx="24" cy="14" rx="12" ry="4" fill="white"/>
    <path d="M12 14V34C12 36.2 17.4 38 24 38C30.6 38 36 36.2 36 34V14" stroke="white" strokeWidth="2" fill="none"/>
    <ellipse cx="24" cy="22" rx="12" ry="4" stroke="white" strokeWidth="2" fill="none"/>
    <ellipse cx="24" cy="30" rx="12" ry="4" stroke="white" strokeWidth="2" fill="none"/>
  </svg>
)

export const DynamoDBIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.database}/>
    <path d="M24 10C17.4 10 12 12.2 12 15V33C12 35.8 17.4 38 24 38C30.6 38 36 35.8 36 33V15C36 12.2 30.6 10 24 10Z" fill="white" fillOpacity="0.2"/>
    <ellipse cx="24" cy="15" rx="12" ry="4" fill="white"/>
    <path d="M12 15V33C12 35.8 17.4 38 24 38C30.6 38 36 35.8 36 33V15" stroke="white" strokeWidth="2"/>
    <path d="M36 22C36 24.8 30.6 27 24 27C17.4 27 12 24.8 12 22" stroke="white" strokeWidth="2"/>
    <path d="M36 29C36 31.8 30.6 34 24 34C17.4 34 12 31.8 12 29" stroke="white" strokeWidth="2"/>
  </svg>
)

export const ElastiCacheIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.database}/>
    <circle cx="24" cy="24" r="12" stroke="white" strokeWidth="2" fill="none"/>
    <circle cx="24" cy="24" r="6" fill="white"/>
    <path d="M24 12V18M24 30V36M12 24H18M30 24H36" stroke="white" strokeWidth="2"/>
  </svg>
)

export const AuroraIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.database}/>
    <circle cx="24" cy="24" r="10" stroke="white" strokeWidth="2" fill="none"/>
    <circle cx="24" cy="24" r="5" fill="white"/>
    <path d="M24 10V14M24 34V38M10 24H14M34 24H38M14.5 14.5L17.5 17.5M30.5 30.5L33.5 33.5M33.5 14.5L30.5 17.5M17.5 30.5L14.5 33.5" stroke="white" strokeWidth="2"/>
  </svg>
)

// ============================================================================
// STORAGE ICONS
// ============================================================================

export const S3Icon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.storage}/>
    <path d="M24 8L38 14V34L24 40L10 34V14L24 8Z" fill="white" fillOpacity="0.3"/>
    <path d="M24 8L38 14V34L24 40L10 34V14L24 8Z" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M10 14L24 20L38 14" stroke="white" strokeWidth="2"/>
    <path d="M24 20V40" stroke="white" strokeWidth="2"/>
    <ellipse cx="24" cy="27" rx="6" ry="2" fill="white"/>
  </svg>
)

export const EBSIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.storage}/>
    <rect x="14" y="10" width="20" height="28" rx="2" stroke="white" strokeWidth="2" fill="none"/>
    <rect x="18" y="14" width="12" height="4" fill="white"/>
    <path d="M18 22H30M18 28H30M18 34H26" stroke="white" strokeWidth="2"/>
  </svg>
)

export const EFSIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.storage}/>
    <rect x="10" y="16" width="28" height="16" rx="2" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M10 24H38" stroke="white" strokeWidth="2"/>
    <path d="M16 16V12M24 16V10M32 16V12M16 32V36M24 32V38M32 32V36" stroke="white" strokeWidth="2"/>
  </svg>
)

// ============================================================================
// NETWORKING ICONS
// ============================================================================

export const VPCIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.networking}/>
    <rect x="10" y="10" width="28" height="28" rx="4" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M10 20H38M10 28H38M20 10V38M28 10V38" stroke="white" strokeWidth="1" strokeOpacity="0.5"/>
    <circle cx="16" cy="16" r="3" fill="white"/>
    <circle cx="32" cy="16" r="3" fill="white"/>
    <circle cx="16" cy="32" r="3" fill="white"/>
    <circle cx="32" cy="32" r="3" fill="white"/>
  </svg>
)

export const ALBIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.networking}/>
    <circle cx="24" cy="16" r="6" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M24 22V28" stroke="white" strokeWidth="2"/>
    <path d="M14 34H34" stroke="white" strokeWidth="2"/>
    <path d="M18 34V28L24 28L30 28V34" stroke="white" strokeWidth="2" fill="none"/>
    <circle cx="18" cy="38" r="2" fill="white"/>
    <circle cx="24" cy="38" r="2" fill="white"/>
    <circle cx="30" cy="38" r="2" fill="white"/>
  </svg>
)

export const NLBIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.networking}/>
    <rect x="18" y="10" width="12" height="8" rx="2" fill="white"/>
    <path d="M24 18V24" stroke="white" strokeWidth="2"/>
    <path d="M12 28H36" stroke="white" strokeWidth="2"/>
    <path d="M16 28V24H32V28" stroke="white" strokeWidth="2"/>
    <rect x="12" y="32" width="8" height="6" rx="1" fill="white"/>
    <rect x="28" y="32" width="8" height="6" rx="1" fill="white"/>
  </svg>
)

export const CloudFrontIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.networking}/>
    <circle cx="24" cy="24" r="12" stroke="white" strokeWidth="2" fill="none"/>
    <ellipse cx="24" cy="24" rx="12" ry="5" stroke="white" strokeWidth="2" fill="none"/>
    <ellipse cx="24" cy="24" rx="5" ry="12" stroke="white" strokeWidth="2" fill="none"/>
    <circle cx="24" cy="24" r="3" fill="white"/>
  </svg>
)

export const Route53Icon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.networking}/>
    <circle cx="24" cy="24" r="12" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M24 12C18 12 14 17 14 24C14 31 18 36 24 36" stroke="white" strokeWidth="2"/>
    <path d="M24 12C30 12 34 17 34 24C34 31 30 36 24 36" stroke="white" strokeWidth="2"/>
    <path d="M14 20H34M14 28H34" stroke="white" strokeWidth="1.5"/>
    <text x="24" y="28" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">53</text>
  </svg>
)

export const APIGatewayIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.integration}/>
    <rect x="14" y="14" width="20" height="20" rx="4" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M10 18H14M10 24H14M10 30H14M34 18H38M34 24H38M34 30H38" stroke="white" strokeWidth="2"/>
    <path d="M20 20V28M24 18V30M28 20V28" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
)

export const NATGatewayIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.networking}/>
    <rect x="14" y="14" width="20" height="20" rx="4" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M24 18V30M20 22L24 18L28 22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M20 26L24 30L28 26" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export const InternetGatewayIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.networking}/>
    <circle cx="24" cy="24" r="10" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M24 14V34M14 24H34" stroke="white" strokeWidth="2"/>
    <path d="M17 17L31 31M31 17L17 31" stroke="white" strokeWidth="1" strokeOpacity="0.5"/>
  </svg>
)

// ============================================================================
// SECURITY ICONS
// ============================================================================

export const IAMIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.security}/>
    <circle cx="24" cy="16" r="6" fill="white"/>
    <path d="M14 38C14 31.4 18.5 26 24 26C29.5 26 34 31.4 34 38" fill="white"/>
    <path d="M30 20L34 24L30 28" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M18 20L14 24L18 28" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
)

export const SecurityGroupIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.security}/>
    <path d="M24 8L38 14V26C38 32 32 38 24 40C16 38 10 32 10 26V14L24 8Z" fill="white" fillOpacity="0.2"/>
    <path d="M24 8L38 14V26C38 32 32 38 24 40C16 38 10 32 10 26V14L24 8Z" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M18 24L22 28L30 20" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export const KMSIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.security}/>
    <circle cx="20" cy="20" r="8" stroke="white" strokeWidth="2" fill="none"/>
    <circle cx="20" cy="20" r="3" fill="white"/>
    <path d="M26 26L38 38" stroke="white" strokeWidth="3" strokeLinecap="round"/>
    <path d="M32 38H38V32" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export const WAFIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.security}/>
    <rect x="10" y="12" width="28" height="24" rx="2" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M10 20H38M10 28H38" stroke="white" strokeWidth="2"/>
    <circle cx="16" cy="16" r="2" fill="white"/>
    <circle cx="16" cy="24" r="2" fill="white"/>
    <circle cx="16" cy="32" r="2" fill="white"/>
  </svg>
)

export const SecretsManagerIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.security}/>
    <rect x="14" y="20" width="20" height="18" rx="2" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M18 20V16C18 12.7 20.7 10 24 10C27.3 10 30 12.7 30 16V20" stroke="white" strokeWidth="2" fill="none"/>
    <circle cx="24" cy="29" r="3" fill="white"/>
    <path d="M24 32V35" stroke="white" strokeWidth="2"/>
  </svg>
)

// ============================================================================
// INTEGRATION & MESSAGING ICONS
// ============================================================================

export const SQSIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.integration}/>
    <rect x="8" y="16" width="14" height="16" rx="2" fill="white"/>
    <rect x="26" y="16" width="14" height="16" rx="2" fill="white" fillOpacity="0.6"/>
    <path d="M22 24H26" stroke="white" strokeWidth="2"/>
    <path d="M40 24H44" stroke="white" strokeWidth="2" strokeOpacity="0.6"/>
  </svg>
)

export const SNSIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.integration}/>
    <circle cx="24" cy="16" r="6" fill="white"/>
    <path d="M14 34L20 26M34 34L28 26M24 24V34" stroke="white" strokeWidth="2"/>
    <circle cx="14" cy="36" r="4" fill="white" fillOpacity="0.8"/>
    <circle cx="34" cy="36" r="4" fill="white" fillOpacity="0.8"/>
    <circle cx="24" cy="38" r="4" fill="white" fillOpacity="0.8"/>
  </svg>
)

export const EventBridgeIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.integration}/>
    <circle cx="24" cy="24" r="10" stroke="white" strokeWidth="2" fill="none"/>
    <circle cx="24" cy="24" r="4" fill="white"/>
    <path d="M24 10V14M24 34V38M10 24H14M34 24H38" stroke="white" strokeWidth="2"/>
    <circle cx="14" cy="14" r="3" fill="white" fillOpacity="0.6"/>
    <circle cx="34" cy="14" r="3" fill="white" fillOpacity="0.6"/>
    <circle cx="14" cy="34" r="3" fill="white" fillOpacity="0.6"/>
    <circle cx="34" cy="34" r="3" fill="white" fillOpacity="0.6"/>
  </svg>
)

export const StepFunctionsIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.integration}/>
    <circle cx="16" cy="12" r="4" fill="white"/>
    <circle cx="32" cy="24" r="4" fill="white"/>
    <circle cx="16" cy="36" r="4" fill="white"/>
    <path d="M20 12H28L32 20M32 28L28 36H20" stroke="white" strokeWidth="2"/>
  </svg>
)

// ============================================================================
// MANAGEMENT & MONITORING ICONS
// ============================================================================

export const CloudWatchIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.management}/>
    <circle cx="24" cy="24" r="12" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M24 14V24L30 30" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export const CloudTrailIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.management}/>
    <path d="M12 36C16 28 18 14 24 14C30 14 32 28 36 36" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <circle cx="12" cy="36" r="3" fill="white"/>
    <circle cx="24" cy="14" r="3" fill="white"/>
    <circle cx="36" cy="36" r="3" fill="white"/>
    <path d="M18 28C20 24 22 20 24 20C26 20 28 24 30 28" stroke="white" strokeWidth="1.5" strokeOpacity="0.6"/>
  </svg>
)

export const ConfigIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.management}/>
    <circle cx="24" cy="24" r="10" stroke="white" strokeWidth="2" fill="none"/>
    <circle cx="24" cy="24" r="4" fill="white"/>
    <path d="M24 10V14M24 34V38M10 24H14M34 24H38" stroke="white" strokeWidth="3"/>
  </svg>
)

// ============================================================================
// CONTAINER & SERVERLESS ICONS
// ============================================================================

export const FargateIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill={AWS_COLORS.compute}/>
    <rect x="12" y="12" width="24" height="24" rx="4" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M18 20H30M18 28H30" stroke="white" strokeWidth="2"/>
    <circle cx="20" cy="24" r="2" fill="white"/>
    <circle cx="28" cy="24" r="2" fill="white"/>
  </svg>
)

// ============================================================================
// DEFAULT / GENERIC ICON
// ============================================================================

export const DefaultIcon: React.FC<IconProps> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill="#6B7280"/>
    <rect x="12" y="12" width="24" height="24" rx="4" stroke="white" strokeWidth="2" fill="none"/>
    <circle cx="24" cy="24" r="6" fill="white"/>
  </svg>
)

// ============================================================================
// ICON MAPPING
// ============================================================================

export const AWSIconMap: Record<string, React.FC<IconProps>> = {
  // Compute
  EC2: EC2Icon,
  EC2Instance: EC2Icon,
  Lambda: LambdaIcon,
  LambdaFunction: LambdaIcon,
  ECS: ECSIcon,
  ECSService: ECSIcon,
  EKS: EKSIcon,
  Fargate: FargateIcon,

  // Database
  RDS: RDSIcon,
  RDSInstance: RDSIcon,
  DynamoDB: DynamoDBIcon,
  DynamoDBTable: DynamoDBIcon,
  ElastiCache: ElastiCacheIcon,
  Redis: ElastiCacheIcon,
  Aurora: AuroraIcon,

  // Storage
  S3: S3Icon,
  S3Bucket: S3Icon,
  EBS: EBSIcon,
  EFS: EFSIcon,

  // Networking
  VPC: VPCIcon,
  ALB: ALBIcon,
  LoadBalancer: ALBIcon,
  NLB: NLBIcon,
  ELB: ALBIcon,
  CloudFront: CloudFrontIcon,
  Route53: Route53Icon,
  APIGateway: APIGatewayIcon,
  ApiGateway: APIGatewayIcon,
  NAT: NATGatewayIcon,
  NATGateway: NATGatewayIcon,
  IGW: InternetGatewayIcon,
  InternetGateway: InternetGatewayIcon,

  // Security
  IAM: IAMIcon,
  IAMRole: IAMIcon,
  IAMPolicy: IAMIcon,
  SecurityGroup: SecurityGroupIcon,
  SG: SecurityGroupIcon,
  KMS: KMSIcon,
  WAF: WAFIcon,
  SecretsManager: SecretsManagerIcon,

  // Integration
  SQS: SQSIcon,
  SQSQueue: SQSIcon,
  SNS: SNSIcon,
  SNSTopic: SNSIcon,
  EventBridge: EventBridgeIcon,
  EventBridgeRule: EventBridgeIcon,
  StepFunctions: StepFunctionsIcon,
  StepFunction: StepFunctionsIcon,

  // Management
  CloudWatch: CloudWatchIcon,
  CloudTrail: CloudTrailIcon,
  Config: ConfigIcon,

  // Default
  Default: DefaultIcon,
}

export const getAWSIcon = (type: string, size?: number): React.ReactNode => {
  const Icon = AWSIconMap[type] || AWSIconMap.Default
  return <Icon size={size} />
}
