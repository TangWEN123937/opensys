import { PillNav } from "@/components/landing/pill-nav";
import { BannerPill } from "@/components/landing/banner-pill";
import { Hero } from "@/components/landing/hero";
import { DashboardMockup } from "@/components/landing/dashboard-mockup";
import { BentoFeatures } from "@/components/landing/bento-features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Pricing } from "@/components/landing/pricing";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <>
      <PillNav />
      <main className="relative">
        <BannerPill />
        <Hero />
        <DashboardMockup />
        <BentoFeatures />
        <HowItWorks />
        <Pricing />
      </main>
      <Footer />
    </>
  );
}
