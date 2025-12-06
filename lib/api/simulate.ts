export async function simulateFix(findingId: string) {
  // Use proxy route to avoid CORS issues
  const url = "/api/proxy/simulate"

  const res = await fetch(url, {
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
