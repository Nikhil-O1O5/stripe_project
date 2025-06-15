 "use client"
import { Id } from "../../convex/_generated/dataModel"
import { useUser } from "@clerk/nextjs"
import { useAction, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { Button } from "./ui/button"
import { useState } from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
 
const PurchaseButton = ({courseId} : {courseId : Id<"courses">}) => {
    const { user }  = useUser()
    const userData = useQuery(api.users.getUserByClerkId, user ? {clerkId : user?.id} : "skip");
    const [isLoading, setIsLoading] = useState(false);
    const createCheckoutSession = useAction(api.stripe.createCheckoutSession);
    const userAccess = useQuery(
        api.users.getUserAccess,
        userData ? {
            userId: userData._id,
            courseId,
        } : "skip"
    ) || {hasAccess : false}
    const handlePurchase = async() => {
        if(!user)return toast.error("please log in to purchase",{id : "login-error"});
        setIsLoading(true);
        try {
            const {checkoutUrl} = await createCheckoutSession({courseId})
            if(checkoutUrl){
                window.location.href = checkoutUrl
            }else{
                throw new Error("failed to create an checkout session");
            }
        } catch (error : any) {
            if(error.message.includes("Rate limit exceeded")){
                toast.error("You have tried to many times. Please try again later")
            }else{
                toast.error( error.nessage || "Something went wrong. Please try again later.")
            }
        }finally{
            setIsLoading(false)
        }
    }
    if(!userAccess.hasAccess){
        return <Button variant={"outline"} onClick={handlePurchase} disabled={isLoading}>Enroll now</Button>
    }
    if(userAccess.hasAccess){
        return <Button variant={"outline"}>Enrolled</Button>
    }
    if(isLoading){
        return(
            <Button>
                <Loader2Icon className="mr-2 size-4 animate-spin"/>
                Processing...
            </Button>
        )
    }
 }
 
 export default PurchaseButton
