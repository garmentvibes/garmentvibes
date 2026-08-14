import { ContentPage } from "@/components/shared/content-page";

export const metadata = { title: "About Us" };

export default function AboutPage() {
  return (
    <ContentPage title="About GarmentVibes" accent="text-rose-700">
      <p>
        GarmentVibes is a fashion destination built for how people actually shop today — quick
        browsing, honest pricing, and a catalog that keeps up with what&apos;s trending.
      </p>
      <p>
        We curate collections across women&apos;s, men&apos;s and kids&apos; fashion, working with
        brands and manufacturers who care about fabric quality as much as style. Whether you&apos;re
        shopping for a festive outfit or restocking your everyday wardrobe, GarmentVibes aims to make
        that fast and enjoyable.
      </p>
      <h2>Our Story</h2>
      <p>
        GarmentVibes started as a single idea: fashion e-commerce in India didn&apos;t need to choose
        between retail shoppers and wholesale buyers — both deserve a platform built specifically for
        how they buy. That&apos;s why GarmentVibes runs both a retail storefront and a dedicated
        wholesale portal under one roof.
      </p>
      <h2>What We Stand For</h2>
      <ul>
        <li>Transparent pricing with no hidden charges</li>
        <li>Fast, reliable delivery across India</li>
        <li>Quality fabrics sourced from trusted manufacturers</li>
        <li>A shopping experience that respects your time</li>
      </ul>
    </ContentPage>
  );
}
