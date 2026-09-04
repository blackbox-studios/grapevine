"use client"

import { AnimatePresence } from "motion/react"

import Transition from "@/components/Transition"
import Feed from "@/components/Feed"
import MobileHeader from "@/components/MobileHeader"
import PullToRefresh from "@/components/PullToRefresh"
import { FeedSkeleton } from "@/components/Skeleton"
import { useFeed } from "@/lib/store/feed/hook"

const HomePage = () => {
    const { posts, skeleton, hasMore, loadingMore, refresh, loadMore } = useFeed()

    return (
        <div className="mx-auto w-full max-w-[470px] pb-10">
            {/* Outside <PullToRefresh/> deliberately. Only the posts should follow the finger
                — the header is a fixture of the surface being refreshed rather than one of the
                things being refreshed, and dragging it down with them reads as the whole page
                coming loose. Leaving it here also means the pull opens its gap directly beneath
                it, which is where the spinner belongs. */}
            <MobileHeader className="pb-6" />

            <PullToRefresh onRefresh={refresh}>
                <AnimatePresence mode="wait" initial={false}>
                    {skeleton ? (
                        <Transition fast key="skeleton">
                            <FeedSkeleton />
                        </Transition>
                    ) : (
                        <Transition fast key="content">
                            {/* Writing a post is reached from the nav (<Compose/>), not from
                                here: a composer that lived on the feed could only ever write
                                to the group being read, and it sat in the way of the reading
                                this surface is for. */}
                            <Feed
                                posts={posts}
                                hasMore={hasMore}
                                loadingMore={loadingMore}
                                onLoadMore={loadMore}
                            />
                        </Transition>
                    )}
                </AnimatePresence>
            </PullToRefresh>
        </div>
    )
}

export default HomePage
