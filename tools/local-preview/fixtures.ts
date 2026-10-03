import { PUBLISHED } from "./published-fixture";
// Synthetic contracts from committed component tests. No credentials, AWS calls or live forwarding.
export const CUSTOMER = "preview-fixture";
const platform = { customer_id: CUSTOMER, account_id: "000000000000", display_name: "Preview control plane", environment: "SHARED_SERVICES", regions: ["eu-west-1"], onboarding_status: "REGISTERED", collection_mode: "LOCAL_CUSTOMER_PLANE", read_enabled: false, verification_enabled: false, mutation_enabled: false, sources: {}, pending_request: null, is_platform_account: true, data_account: false };
const member = { ...platform, account_id: "111122223333", display_name: "Example workload (fixture)", environment: "TEST", onboarding_status: "CONNECTED", collection_mode: "MEMBER_READ_ROLE", read_enabled: true, is_platform_account: false, data_account: true, validation_message: "Synthetic connected account for UI testing", sources: {regions:["eu-west-1"], trails:[],flow_log_groups:[],eks_clusters:[],discovery_errors:[],evidence_role:true} };
export function fixture(path: string, scenario: string, query = new URLSearchParams()): {status:number,body:unknown} {
  const ok = (body:unknown) => ({status:200,body});
  const dataAccounts = scenario === "connected" ? [member] : [];
  if (path === "build-version") return ok({version:"development"});
  if (path === "proxy/admin/customers") return ok([{customer_id:CUSTOMER,display_name:"Local preview (test data)"}]);
  if (path === "proxy/admin/accounts/scope/options/all") return ok({customer_id:CUSTOMER,accounts:dataAccounts.map(a=>({...a,status:a.onboarding_status,group_ids:[]})),groups:[]});
  if (path === "proxy/admin/accounts/groups/all") return ok([]);
  if (path === "proxy/admin/accounts" || path === "proxy/coverage/sources") {
    if (scenario === "forbidden") return {status:403,body:{detail:{code:"CLAIM_OUTSIDE_SERVER_SCOPE",message:"Synthetic permission refusal"}}};
    if (scenario === "unavailable") return {status:503,body:{detail:{code:path.includes("coverage")?"SOURCE_COVERAGE_PUBLICATION_UNAVAILABLE":"ACCOUNT_REGISTRY_UNAVAILABLE",message:"Synthetic service unavailable"}}};
  }
  if (path === "proxy/admin/accounts") return ok({customer_id:CUSTOMER,mode:"MEMBER_ACCOUNTS",registry_available:true,member_trust:{platform_account_id:platform.account_id,ready:false},total:1+dataAccounts.length,accounts:[platform,...dataAccounts],summary:{connected:dataAccounts.length,needs_attention:0,discovered:0,mutation_enabled:0},failed_requests:[]});
  if (path === "proxy/coverage/sources") {
    if (scenario === "malformed") return ok({unexpected:"Synthetic unrecognized contract"});
    if (scenario === "connected") return ok({...PUBLISHED,tenant_id:CUSTOMER,accounts:PUBLISHED.accounts.filter(a=>a.account_id===member.account_id && (!query.get("account_id") || query.get("account_id")===a.account_id))});
    // Exact no-workload gate response reproduced by BE test_control_plane_serving, with no customer evidence.
    return ok({coverage:null,graph_version:null,hold_reason:"NO_DATA_ACCOUNTS",semantic_status:"not_recorded",source_generation:null});
  }
  if (path === "proxy/systems") return ok({success:true,systems:[]});
  // Fail visibly for routes outside this preview slice. Never invent a successful empty record.
  return {status:503,body:{detail:{code:"PREVIEW_ROUTE_NOT_FIXTURED",message:`No local fixture for ${path}; no live request was made.`}}};
}
