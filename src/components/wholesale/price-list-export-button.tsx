"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWholesaleCatalogue } from "@/components/shared/catalogue-provider";

export function PriceListExportButton() {
  // The catalogue the server last read, so an exported price list matches what
  // the portal is quoting rather than what the bundle was built with.
  const catalogue = useWholesaleCatalogue();

  function handleExport() {
    const header = "sku,name,category,moq,pack_size,lead_time_days,tier_min_qty,price_per_unit_minor,currency";
    const rows = catalogue.flatMap((p) =>
      p.priceTiers.map(
        (tier) =>
          `${p.sku},"${p.name}",${p.category},${p.moq},${p.packSize},${p.leadTimeDays},${tier.minQty},${tier.pricePerUnit},${p.currency}`
      )
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "garmentvibes-wholesale-price-list.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="mr-1.5 h-4 w-4" /> Export Price List
    </Button>
  );
}
