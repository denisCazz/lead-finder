"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CampaignsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/logs"); }, [router]);
  return null;
}
