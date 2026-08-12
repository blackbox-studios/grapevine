"use client"

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

import React, { useMemo } from "react"
import { cn } from "@/lib/utils";

export default function Breadcrumbs({ className }) {
    const pathname = usePathname()

    const paths = useMemo(() => ["home", ...pathname.split("/").filter(path => path)], [pathname])


    return (
        <Breadcrumb className={cn("", className)}>
            <BreadcrumbList>
                {
                    paths.map((path, idx, arr) => {
                        const to = idx === 0 ? "/" : `/${arr.slice(1, idx + 1).join("/")}`
                        const name = path.replace(/-/g, " ")

                        return (
                            <React.Fragment key={idx}>
                                {arr.length - 1 !== idx ?
                                    <>
                                        <BreadcrumbItem>
                                            <BreadcrumbLink asChild>
                                                <Link href={to} scroll={false} className="capitalize">
                                                    {name}
                                                </Link>
                                            </BreadcrumbLink>
                                        </BreadcrumbItem>
                                        <BreadcrumbSeparator />
                                    </>
                                    :
                                    <BreadcrumbItem>
                                        <BreadcrumbPage className="capitalize">

                                            {name}

                                        </BreadcrumbPage>
                                    </BreadcrumbItem>
                                }
                            </React.Fragment>
                        )
                    })
                }
            </BreadcrumbList>
        </Breadcrumb>
    )
}