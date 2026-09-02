"use client"

import { useRouter } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import Ripple from "@/assets/svg/ripple.svg"
import { AvatarPicker } from "@/components/AvatarPicker"
import { BackHeader } from "@/components/BackHeader"
import DatePicker from "@/components/DatePicker"
import { HandleField, useHandleCheck } from "@/components/HandleField"
import Icon from "@/components/Icon"
import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
    HANDLE_MAX,
    HANDLE_MIN,
    HANDLE_PATTERN,
    MAX_BAPTISM_NAME_LENGTH,
    ROUTES,
} from "@/lib/constants"
import { useProfileEditor } from "@/lib/store/auth/hook"

/* Everything the viewer may change about themselves, on one page.
 *
 * **One form, because it is one write.** The picture, the name, the @handle, the birthday and
 * the parish facts all land in a single `PATCH /api/me` and all come back as one viewer;
 * splitting them across surfaces gave the app two places that disagreed about where you change
 * who you are.
 *
 * **Everything except `vocation`.** That is what the admin check and the roster's sort order
 * derive from, so it is an admin's to set and nobody promotes themselves to Priest —
 * `updateProfile` refuses it too, so this form and the server agree. `email` is read-only for a
 * different reason: it is the credential Supabase owns, and changing it is an account operation
 * with a verification step rather than a profile edit.
 *
 * **A page rather than a mode on the card.** The card is a thing you peek at from a byline;
 * this is eight fields and a save, which is a place you go — and being a page in the account
 * tree is what gives it the same back arrow, the same cross-fade and the same frame as General
 * beside it.
 *
 * Which fields exist follows the vocation, exactly as orientation's steps do: a catechumen has
 * no baptism name yet, a layman no ordination. `submit` drops the ones that were never drawn,
 * so a form that does not ask cannot answer. */

const schema = z.object({
    firstName: z.string().trim().min(1, "Enter your first name").max(80, "That is too long"),
    lastName: z.string().trim().min(1, "Enter your last name").max(80, "That is too long"),
    handle: z
        .string()
        .trim()
        .min(HANDLE_MIN, `At least ${HANDLE_MIN} characters`)
        .max(HANDLE_MAX, `At most ${HANDLE_MAX} characters`)
        .regex(
            HANDLE_PATTERN,
            "Letters, numbers, dots, underscores and hyphens — starting and ending with a letter or number",
        ),
    birthday: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth")
        .refine(
            (value) => new Date(`${value}T00:00:00.000Z`) <= new Date(),
            "That date is in the future",
        )
        .refine((value) => Number(value.slice(0, 4)) >= 1900, "Check the year"),
    baptismName: z.string().trim().max(MAX_BAPTISM_NAME_LENGTH, "That is too long"),
    /* `MM-DD`, or empty — a name day is a month and a day with no year. See the Precision note
     * in <DatePicker/>. */
    nameDay: z.union([z.literal(""), z.string().regex(/^\d{2}-\d{2}$/, "Choose a day")]),
    ordinationDate: z.union([
        z.literal(""),
        z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date")
            .refine(
                (value) => new Date(`${value}T00:00:00.000Z`) <= new Date(),
                "That date is in the future",
            )
            .refine((value) => Number(value.slice(0, 4)) >= 1900, "Check the year"),
    ]),
})

/* A label with a padlock beside it, for the two fields that are collected and never published.
 *
 * **The lock is the notice.** A line of prose under every private field said the same sentence
 * three times down one page; a glyph says it once per field, in the place the eye is already
 * looking, and the sentence is a hover away for anyone who wants it. The tooltip is the label's
 * — not the input's — so the thing being explained is the *field*, which is what "private"
 * describes. */
const PrivateLabel = ({ children }) => (
    <FormLabel className="gap-1.5">
        {children}
        <Tooltip>
            <TooltipTrigger asChild>
                <span tabIndex={0} className="cursor-help text-muted-foreground">
                    <Icon size="xs">lock</Icon>
                    <span className="sr-only">Private</span>
                </span>
            </TooltipTrigger>
            <TooltipContent>Only you can see this.</TooltipContent>
        </Tooltip>
    </FormLabel>
)

const SettingsInfoPage = () => {
    const { values, person, email, catechumen, clergy, checkHandle, save, saving } =
        useProfileEditor()

    const form = useForm({ resolver: zodResolver(schema), defaultValues: values })
    const router = useRouter()

    /* `useWatch`, not `form.watch()`: the latter returns a fresh function on every render, which
     * React Compiler cannot memoize and therefore refuses to compile this component around. */
    const handle = useWatch({ control: form.control, name: "handle" })
    /* `own` short-circuits the viewer's current handle to available — otherwise somebody editing
     * only their name is told the handle they already wear is taken, and cannot save. */
    const status = useHandleCheck(handle, checkHandle, { own: values.handle })

    const submit = async (next) => {
        const changes = { ...next }
        if (catechumen) {
            delete changes.baptismName
            delete changes.nameDay
        }
        if (!clergy) delete changes.ordinationDate

        const result = await save(changes)
        if (!result?.ok) {
            /* The one failure a person can act on is a handle taken between this form loading
             * and being saved. The toast says what happened; this marks the input that caused
             * it, so they have somewhere to look. */
            if (result?.fields?.handle) {
                form.setError("handle", { message: "That handle is already taken." })
            }
            return
        }
        /* Settle onto what was stored, so the form stops reporting an unsaved change it no
         * longer has and Save goes dark again. */
        form.reset(next)
    }

    /* Enabled only once the handle is well-formed **and confirmed free**, so a check still in
     * flight leaves Save dark rather than letting somebody through to be bounced by the server.
     * A failed check resolves as available (see `checkHandle` in the auth store), so a network
     * blip cannot strand anyone on a permanently disabled button. */
    const blocked = status.state === "checking" || status.state === "taken"

    return (
        <>
            {/* `bleed` for the reason General passes it: a back arrow is a phone's affordance,
                and on a desktop the nav rail never leaves. */}
            <BackHeader title="Account" back={ROUTES.SETTINGS} bleed />

            <Form {...form}>
                <form
                    onSubmit={form.handleSubmit(submit)}
                    className="mx-auto flex w-full max-w-[470px] flex-col gap-5 pb-10 md:pt-0"
                >
                    {/* The picture saves on pick rather than on Save: it is a file upload
                        followed by its own PATCH, so there is nothing for a form submit to batch
                        it with, and a photo sitting unsaved behind a button nobody pressed would
                        be worse than one that lands immediately. */}
                    <div className="flex flex-col items-center gap-2 pb-2">
                        <AvatarPicker person={person} className="size-24" />
                        <p className="text-xs text-muted-foreground">
                            Edit picture
                        </p>
                    </div>

                    <div className="flex gap-3">
                        <FormField
                            control={form.control}
                            name="firstName"
                            render={({ field }) => (
                                <FormItem className="flex-1">
                                    <FormLabel>First name</FormLabel>
                                    <FormControl>
                                        <Input
                                            autoComplete="given-name"
                                            autoCapitalize="words"
                                            disabled={saving}
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="lastName"
                            render={({ field }) => (
                                <FormItem className="flex-1">
                                    <FormLabel>Last name</FormLabel>
                                    <FormControl>
                                        <Input
                                            autoComplete="family-name"
                                            autoCapitalize="words"
                                            disabled={saving}
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <HandleField
                        form={form}
                        status={status}
                        label="Handle"
                        disabled={saving}
                        description={
                            <FormDescription>
                                This is what appears next to everything you write.
                            </FormDescription>
                        }
                    />

                    {!catechumen && (
                        <>
                            <FormField
                                control={form.control}
                                name="baptismName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Baptism name</FormLabel>
                                        <FormControl>
                                            <Input
                                                autoComplete="off"
                                                autoCapitalize="words"
                                                placeholder="The saint whose name you bear"
                                                disabled={saving}
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="nameDay"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Name day</FormLabel>
                                        <FormControl>
                                            {/* The same control every other date uses, in the
                                                mode that drops the year — a feast recurs, so
                                                there is none to pick. */}
                                            <DatePicker
                                                precision="month-day"
                                                value={field.value}
                                                onChange={field.onChange}
                                                disabled={saving}
                                                label="Name day"
                                                placeholder="Pick a day"
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Your parish uses this to remember your name day.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </>
                    )}

                    {clergy && (
                        <FormField
                            control={form.control}
                            name="ordinationDate"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Ordination date</FormLabel>
                                    <FormControl>
                                        <DatePicker
                                            value={field.value}
                                            onChange={field.onChange}
                                            disabled={saving}
                                            label="Ordination date"
                                            placeholder="Pick a date"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}

                    <FormField
                        control={form.control}
                        name="birthday"
                        render={({ field }) => (
                            <FormItem>
                                <PrivateLabel>Birthday</PrivateLabel>
                                <FormControl>
                                    <DatePicker
                                        value={field.value}
                                        onChange={field.onChange}
                                        disabled={saving}
                                        label="Birthday"
                                        placeholder="Pick a date"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* Shown because a person should be able to see which address they signed in
                        with without leaving the app; not a field, because it is not theirs to
                        change here. */}
                    <div className="flex flex-col gap-2">
                        <PrivateLabel>Email</PrivateLabel>
                        <p className="pl-2 text-sm text-muted-foreground">{email}</p>
                    </div>

                    {/* Cancel beside Save rather than only on the back arrow: that arrow is a
                        phone's affordance and is hidden from md up, so without this a desktop
                        reader has no way out of the form but the nav rail. `router.back()`
                        because a form is reached from wherever the reader was — the settings
                        list, usually, but the card's Edit button too. */}
                    <div className="mt-1 flex gap-3">
                        <Button
                            type="button"
                            size="lg"
                            variant="outline"
                            onClick={() => router.back()}
                            disabled={saving}
                            className="px-8"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            size="lg"
                            /* Nothing to save is the disabled state rather than a no-op
                               request — `isDirty` is exactly "has anything changed since this
                               form loaded". */
                            disabled={saving || blocked || !form.formState.isDirty}
                            className="flex-1"
                        >
                            {saving ? (
                                <Ripple
                                    aria-label="Saving your profile"
                                    className="size-8 [&_circle]:stroke-current"
                                />
                            ) : (
                                "Save"
                            )}
                        </Button>
                    </div>
                </form>
            </Form>
        </>
    )
}

export default SettingsInfoPage
