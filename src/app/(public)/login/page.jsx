"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import Crest from "@/components/Crest"
import TypeLogoLight from "@/assets/svg/type-logo-light.svg"
import TypeLogoDark from "@/assets/svg/type-logo-dark.svg"
import Ripple from "@/assets/svg/ripple.svg"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Hyperlink from "@/components/Hyperlink"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { useLogin } from "@/lib/store/auth/hook"

const schema = z.object({
    email: z.email("Enter a valid email"),
})

const LoginPage = () => {
    const { login, loading } = useLogin()

    /* Identifier-first: collect the email, hand off to Auth0 as `login_hint`. */
    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: { email: "" },
    })

    const { handleSubmit } = form

    return (
        <div className="w-full min-h-screen flex lg:items-center justify-center bg-sidebar lg:px-8">
            <div className="lg:panel bg-background  relative max-w-350 w-full min-h-screen lg:min-h-0 lg:h-190 lg:rounded-5xl flex flex-col-reverse lg:grid lg:grid-cols-[1fr_1fr] lg:mb-[5dvh] overflow-hidden">
                <div className="relative w-full flex-1 lg:h-full flex justify-center items-center px-8 py-10">
                    <div className="flex flex-col w-full max-w-sm lg:mr-[12%] pb-4 ">
                        <div className="flex flex-col gap-5 items-center pb-16">
                            <div className="hidden lg:block">
                                <Crest className="w-10 h-auto text-primary" />
                            </div>
                            <h1 className="font-serif text-3xl">
                                Welcome Back
                            </h1>
                        </div>

                        <Form {...form}>
                            <form
                                className="flex flex-col gap-6"
                                onSubmit={handleSubmit(async (data) => { await login(data.email) })}
                            >
                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Email</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="email"
                                                    placeholder="joe.davis@example.com"
                                                    autoComplete="email"
                                                    autoFocus
                                                    disabled={loading}
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <Button type="submit" size="lg" className="mt-4" disabled={loading}>
                                    {loading ? (
                                        <Ripple
                                            aria-label="Continuing to sign in"
                                            className="size-8 [&_circle]:stroke-current"
                                        />
                                    ) : (
                                        "Continue"
                                    )}
                                </Button>
                            </form>
                        </Form>

                        <div className=" text-muted-foreground leading-relaxed text-button text-center pt-8">
                            I have read and consent to the&nbsp;&nbsp;
                            <Hyperlink>
                                System User Agreement
                            </Hyperlink>
                            &nbsp;.
                        </div>
                    </div>

                    <div className="hidden dark:block absolute -bottom-75 -left-75 w-150 h-150 bg-[#ffffff0d] rounded-full blur-3xl" />
                    <div className="hidden dark:block absolute -top-75 -right-75 w-150 h-150 bg-[#ffffff0d] rounded-full blur-3xl" />
                </div>
                <div className="relative bg-background dark:bg-transparent h-48 lg:h-full w-full lg:rounded-5xl overflow-hidden">
                    <div className="absolute inset-0 bg-[url(/gradient-light.jpg)] dark:bg-[url(/granite.png)] bg-cover bg-center opacity-50 dark:opacity-100" />
                    <div className="absolute inset-0 bg-[url(/grain.png)] bg-repeat opacity-40 mix-blend-overlay" />
                    <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(225deg,rgb(4_12_45/67%)_0%,rgb(2_6_25/75%)_100%)]" />
                    <div className="absolute z-1 h-full w-full flex items-center justify-center p-[15%] ">
                        <TypeLogoLight className="w-full h-auto max-w-50 dark:hidden" />
                        <TypeLogoDark className="w-full h-auto max-w-50 hidden dark:block" />
                    </div>
                </div>

            </div>
        </div>
    )
}

export default LoginPage
