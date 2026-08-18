"use client"

import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import DatePicker from "@/components/DatePicker"
import GatewayShell, { GatewayButton } from "@/components/GatewayShell"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormMessage,
} from "@/components/ui/form"
import { useOnboarding } from "@/lib/store/auth/hook"

/* First-run orientation.
 *
 * Deliberately one question. Everything the parish needs to *place* someone — their rank,
 * their role, which group they belong to — was set by the priest when they were admitted,
 * so by the time anyone reaches this screen the only thing missing is what they alone can
 * supply. Asking for a name or a parish here would be asking them to re-enter what an
 * admin already decided.
 *
 * It wears the same shell as sign-in on purpose: the viewer has just come through that
 * screen, and this should read as the next beat of it rather than a new place. */

/* Validated as a calendar date, not a timestamp. Bounds rather than a bare date check,
 * because the failures worth catching are a typo'd year and a future date, and "1837" or
 * "next Tuesday" both pass an is-this-a-date test. */
const schema = z.object({
    birthday: z
        .string()
        .trim()
        .min(1, "Enter your date of birth")
        .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), "Enter your date of birth")
        .refine((value) => {
            const date = new Date(`${value}T00:00:00.000Z`)
            return !Number.isNaN(date.getTime()) && date <= new Date()
        }, "That date is in the future")
        .refine(
            (value) => Number(value.slice(0, 4)) >= 1900,
            "Check the year",
        ),
})

const WelcomePage = () => {
    const { user, submit, loading, clearError } = useOnboarding()

    /* Seeded with a concrete date rather than "".
     *
     * The drum always displays *something*, so an empty form value would mean the screen
     * shows a date the form does not hold — and Continue would submit nothing until the
     * user happened to scroll a column. Thirty years ago is the drum's own default; this
     * just agrees with it, and it gives the desktop calendar a month to open on. */
    const initial = useMemo(() => {
        if (user?.birthday) return user.birthday
        const now = new Date()
        return `${now.getFullYear() - 30}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    }, [user?.birthday])

    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: { birthday: initial },
    })

    /* Both surfaces stop at this year, so the picker agrees with the validation rather than
     * offering dates it will then reject. */
    const thisYear = useMemo(() => new Date().getFullYear(), [])

    const onSubmit = async ({ birthday }) => {
        clearError()
        await submit({ birthday })
    }

    /* Greeted by the name the priest entered when admitting them — the first confirmation
     * the viewer gets that they were expected here.
     *
     * The *whole* name, not a first name. Splitting on whitespace is the obvious thing and
     * it is wrong in this domain: names here routinely lead with a title, so it greets
     * "Priest Alexander" as "Priest", "Dn. Paul" as "Dn." and "Mat. Carly" as "Mat.".
     * There is no reliable way to strip a title, and no need to — the full name reads
     * correctly in every case. */
    const name = user?.fullName?.trim()

    return (
        <GatewayShell
            heading={name ? `Welcome, ${name}` : "Welcome"}
            subheading="One thing before you go in — when is your birthday?"
        >
            <Form {...form}>
                <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="flex w-full max-w-88 flex-col items-center gap-5"
                >
                    <FormField
                        control={form.control}
                        name="birthday"
                        render={({ field }) => (
                            <FormItem className="w-full">
                                <FormControl>
                                    {/* Inline: this screen asks one question, so the
                                      * surface is the screen rather than something behind a
                                      * button. Which surface it is follows the pointer —
                                      * the drum on a phone, a calendar on a desktop. */}
                                    <DatePicker
                                        variant="inline"
                                        value={field.value}
                                        onChange={field.onChange}
                                        maxYear={thisYear}
                                        disabled={loading}
                                        label="Date of birth"
                                    />
                                </FormControl>
                                <FormMessage className="px-5 text-center" />
                            </FormItem>
                        )}
                    />

                    <GatewayButton
                        type="submit"
                        disabled={loading}
                        loading={loading}
                        busyLabel="Saving your details"
                    >
                        Enter the parish
                    </GatewayButton>

                    <p className="max-w-72 text-center text-xs leading-relaxed text-muted-foreground">
                        Your parish uses this to remember name days and birthdays. It is not
                        shown publicly.
                    </p>
                </form>
            </Form>
        </GatewayShell>
    )
}

export default WelcomePage
