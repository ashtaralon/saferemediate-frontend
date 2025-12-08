export async function simulateFix(findingId: string) {
<<<<<<< HEAD
  // Use Next.js proxy to avoid CORS issues
=======
  // Use Next.js proxy for proper error handling and fallback responses
>>>>>>> 970696b35a6ba7efadbcd63e551b3b19cbd51d65
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
