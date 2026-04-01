"use client"

import { useParams } from "next/navigation"
import { NHIProfilePage } from "@/components/nhi-profile/nhi-profile-page"

export default function NHIProfileRoute() {
  const params = useParams()
  const name = decodeURIComponent(params.name as string)

  return <NHIProfilePage identityName={name} />
}
