import {installCustomerBackendAuthFetch} from "@/lib/server/customer-backend-auth"

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    installCustomerBackendAuthFetch()
  }
}
