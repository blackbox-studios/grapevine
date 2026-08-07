import {
    Pagination as UIPagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination"
import { Field, FieldLabel } from "@/components/ui/field"
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

const PAGE_SIZES = [5, 10, 20, 50]

const Pagination = ({
    page,
    pageSize,
    total,
    setPage,
    setPageSize,
}) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const currentPage = Math.min(page, totalPages)
    const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
    const rangeEnd = Math.min(total, currentPage * pageSize)

    const goToPrevious = (e) => {
        e.preventDefault()
        setPage(Math.max(1, currentPage - 1))
    }

    const goToNext = (e) => {
        e.preventDefault()
        setPage(Math.min(totalPages, currentPage + 1))
    }

    return (
        <div className="flex flex-wrap items-center justify-end gap-2 px-1 pt-2 text-muted-foreground mt-8">
            <Field orientation="horizontal" className="w-fit">
                <FieldLabel htmlFor="select-rows-per-page">
                    Show rows
                </FieldLabel>
                <Select
                    value={String(pageSize)}
                    onValueChange={(value) => {
                        setPageSize(Number(value))
                        setPage(1)
                    }}
                >
                    <SelectTrigger className="w-20" id="select-rows-per-page" size="sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start">
                        <SelectGroup>
                            {PAGE_SIZES.map((n) => (
                                <SelectItem key={n} value={String(n)}>
                                    {n}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </Field>

            <span className="text-foreground w-28 text-center whitespace-nowrap tabular-nums select-none pl-2">
                {rangeStart} - {rangeEnd} of {total}
            </span>

            <UIPagination className="mx-0 w-auto">
                <PaginationContent>
                    <PaginationItem>
                        <PaginationPrevious
                            href="#"
                            text=""
                            onClick={goToPrevious}
                            aria-disabled={currentPage <= 1}
                        />
                    </PaginationItem>
                    <PaginationItem>
                        <PaginationNext
                            href="#"
                            text=""
                            onClick={goToNext}
                            aria-disabled={currentPage >= totalPages}
                        />
                    </PaginationItem>
                </PaginationContent>
            </UIPagination>
        </div>
    )
}

export default Pagination
