"use client"

import { AnimatePresence } from "motion/react"

import Transition from "@/components/Transition"
import Feed from "@/components/Feed"
import PullToRefresh from "@/components/PullToRefresh"
import { FeedSkeleton } from "@/components/Skeleton"
import { useFeed } from "@/lib/store/feed/hook"

const HomePage = () => {
    const { posts, skeleton, hasMore, loadingMore, refresh, loadMore } = useFeed()

    return (
        <PullToRefresh onRefresh={refresh}>
            <div className="mx-auto w-full max-w-[470px] pb-10">
                <AnimatePresence mode="wait" initial={false}>
                    {skeleton ? (
                        <Transition fast key="skeleton">
                            <FeedSkeleton />
                        </Transition>
                    ) : (
                        <Transition fast key="content">
                            <Feed
                                posts={posts}
                                hasMore={hasMore}
                                loadingMore={loadingMore}
                                onLoadMore={loadMore}
                            />
                        </Transition>
                    )}
                </AnimatePresence>
            </div>
        </PullToRefresh>
    )
}

export default HomePage
