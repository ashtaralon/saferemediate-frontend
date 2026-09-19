import {installCustomerBackendAuthFetch} from "@/lib/server/customer-backend-auth"
import {assertDeploymentConfig} from "@/lib/server/deployment-config"

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Refuse to serve with a required secret missing, naming every missing name at once,
    // rather than starting and failing each sign-in or backend call later.
    assertDeploymentConfig()
    installCustomerBackendAuthFetch()
  }
}
