export async function simulateFix(findingId: string) {
  // Use Next.js proxy to avoid CORS issues
  const res = await fetch("/api/proxy/simulate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ finding_id: findingId }),
  })

  if (!res.ok) {
    throw new Error(`Simulation failed: ${res.status}`)
  }

  return res.json()
}
