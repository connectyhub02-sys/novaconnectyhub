import { NextResponse } from "next/server";
import { loadPublicPricingPlans } from "@/lib/billing/public-pricing-server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const plans = await loadPublicPricingPlans(createServiceClient());

    return NextResponse.json(
      { plans },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel carregar planos." },
      { status: 500 },
    );
  }
}
