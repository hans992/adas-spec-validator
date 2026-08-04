import type { Metadata } from "next";
import { MarketingLanding } from "@/components/MarketingLanding";

export const metadata: Metadata = {
  title: "ADAS — Specification validation for building projects",
  description:
    "Turn architectural and construction specifications into checkable requirements, validate BIM packages, review findings, and preserve an audit-ready decision trail."
};

export default function Home() {
  return <MarketingLanding />;
}
