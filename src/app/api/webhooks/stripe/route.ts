import Stripe from "stripe";
import stripe from "@/lib/stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api"
import { Id } from "../../../../../convex/_generated/dataModel";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("Stripe-Signature") as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (error) {
    if (error instanceof Error) {
      console.log(`Webhook signature verification failed`, error.message);
    } else {
      console.log(`Webhook signature verification failed`, error);
    }
    return new Response("Webhook signature verification failed.", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription, event.type);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
      default:
        console.log(`Unhandled Event Type ${event.type}`);
        break;
    }
  } catch (error) {
    console.error(`Error processing webhook (${event.type})`, error);
    return new Response("Error processing webhook", { status: 400 });
  }

  return new Response(null, { status: 200 });
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const courseId = session.metadata?.courseId;
  const stripeCustomerId = session.customer as string;

  if (!courseId || !stripeCustomerId) {
    throw new Error("Missing courseId or stripeCustomerId");
  }

  const userResult = await convex.query(api.users.getUserByStripeId, { stripeCustomerId });
  const user = userResult;

  if (!user || !user._id) {
    throw new Error("User not found");
  }

  await convex.mutation(api.purchases.recordPurchase, {
    userId: user._id,
    courseId: courseId as Id<"courses">,
    amount: session.amount_total as number,
    stripePurchaseId: session.id
  });
}

async function handleSubscriptionUpsert(subscription: Stripe.Subscription, eventType: string) {
    if(subscription.status !== "active" || !subscription.latest_invoice){
        return
    }
  const stripeCustomerId = subscription.customer as string;
  const userResult = await convex.query(api.users.getUserByStripeId, { stripeCustomerId });
  const user = userResult;

  if (!user || !user._id) {
    throw new Error("User not found");
  }

  try {
    // Type assertion to access the properties that exist but aren't in the type definition
    const sub = subscription as any;
    
    // Add debugging to see what properties are available
    console.log("Subscription object keys:", Object.keys(subscription));
    console.log("current_period_start:", sub.current_period_start);
    console.log("current_period_end:", sub.current_period_end);
    
    await convex.mutation(api.subscriptions.upsertSubscription, {
      userId: user._id,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      planType: subscription.items.data[0]?.price?.recurring?.interval as "month" | "year",
      currentPeriodStart: sub.current_period_start || 0,
      currentPeriodEnd: sub.current_period_end || 0,
      cancelPeriodEnd: subscription.cancel_at_period_end
    });
  } catch (error) {
    console.error(`Error in processing ${eventType} for subscription ${subscription.id}:`, error);
  }
}

async function handleSubscriptionDeleted(subscription : Stripe.Subscription) {
  try {
    const response = await convex.mutation(api.subscriptions.cancelSubscription,{stripeSubscriptionId: subscription.id});
    
  } catch (error) {
    console.error(`Error in deleting subscription ${subscription.id}`, error)
  }
}
