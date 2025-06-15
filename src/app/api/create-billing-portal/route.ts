// app/api/create-billing-portal/route.ts  (or pages/api/create-billing-portal.ts)

import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";
import stripe from "@/lib/stripe";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 1) Fetch your user from Convex
  const userQuery = await convex.query(api.users.getUserByClerkId, {
    clerkId: userId,
  });
  // userQuery is the user record directly
  const userRecord = userQuery;
  if (!userRecord) {
    return NextResponse.json(
      { error: "User record not found" },
      { status: 404 }
    );
  }
  if (!userRecord.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer ID on user" },
      { status: 404 }
    );
  }

  try {
    // 2) Create the portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: userRecord.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Error creating billing portal session:", err);
    // If it’s the “no configuration” error, give a helpful hint:
    if (
      err instanceof Error &&
      err.message.includes("No configuration provided")
    ) {
      return NextResponse.json(
        {
          error:
            "You must configure your Customer Portal in the Stripe Dashboard (test mode).",
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
