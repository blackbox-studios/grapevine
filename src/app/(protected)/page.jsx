"use client"

import { AnimatePresence } from "motion/react"

import Transition from "@/components/Transition"
import Feed from "@/components/Feed"
import { FeedSkeleton } from "@/components/Skeleton"
import { useFeed } from "@/lib/store/feed/hook"

const HomePage = () => {
    const { posts, skeleton } = useFeed()

    return (
        <div className="mx-auto w-full max-w-[470px] pb-10">
            <AnimatePresence mode="wait" initial={false}>
                {skeleton ? (
                    <Transition fast key="skeleton">
                        <FeedSkeleton />
                    </Transition>
                ) : (
                    <Transition fast key="content">
                        <Feed posts={posts} />
                    </Transition>
                )}
            </AnimatePresence>
        </div>
    )
}

export default HomePage
