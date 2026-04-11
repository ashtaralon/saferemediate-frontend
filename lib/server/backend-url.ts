export function getBackendBaseUrl() {
  return (
    process.env.BACKEND_API_URL ||
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "https://saferemediate-backend-f.onrender.com"
  )
}
