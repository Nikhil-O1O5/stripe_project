import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { Webhook } from "svix"
import { WebhookEvent } from "@clerk/nextjs/server"
import { api } from "./_generated/api"
import  stripe  from "../src/lib/stripe"

const http = httpRouter();

const clerkWebhook = httpAction(async(ctx,request)=>{
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET
    if(!webhookSecret){
        throw new Error("Missing CLERK_WEBHOOK_SECRET environment variable")
    }
    const svix_id = request.headers.get("svix-id");
    const svix_signature = request.headers.get("svix-signature");
    const svix_timestamp = request.headers.get("svix-timestamp");
    if(!svix_id || !svix_signature || !svix_timestamp){
        return new Response("Error occured no svix headers",{
            status:400,
        })
    }
    const payload = await request.json()
    const body = JSON.stringify(payload)
    const wh = new Webhook(webhookSecret)
    let evt: WebhookEvent;
    try {
        evt = wh.verify(body,{
            "svix-id" : svix_id,
            "svix-signature" : svix_signature,
            "svix-timestamp" : svix_timestamp,
        }) as WebhookEvent
    } catch (err) {
        console.error("Error verifying the webhook",err); 
        return new Response("Error Occured",{
            status:400
        })
    }
    const eventType = evt.type;
    if(eventType === "user.created"){
        const {id, email_addresses, first_name, last_name} = evt.data;
        const name = `${first_name || ""} ${last_name || ""}`.trim()
        const email = email_addresses[0]?.email_address;

        try {
            const customer = await stripe.customers.create({
                email,
                name,
                metadata: {clerkId : id}
            })
            await ctx.runMutation(api.users.createUser,{
                email,
                name,
                clerkId:id,
                stripeCustomerId: customer.id
            })
        } catch (error) {
            console.error("Error creating the user using convex",error);
            return new Response("Error creating user",{status:500})
        }
    }
    return new Response("Webhook processed successfully",{status:200});
})

http.route({
    path:"/clerk-webhook",
    method:"POST",
    handler: clerkWebhook
})

export default http