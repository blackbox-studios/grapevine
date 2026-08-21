"use client"

import { AnimatePresence } from "motion/react"

import Transition from "@/components/Transition"
import Composer from "@/components/Composer"
import Feed from "@/components/Feed"
import { OrgNavTrigger } from "@/components/OrgNav"
import PullToRefresh from "@/components/PullToRefresh"
import { FeedSkeleton } from "@/components/Skeleton"
import { useFeed } from "@/lib/store/feed/hook"

const HomePage = () => {
    const { posts, skeleton, hasMore, loadingMore, refresh, loadMore } = useFeed()

    return (
        <div className="mx-auto w-full max-w-[470px] pb-10">
            {/* The mobile group switcher's trigger. It lives on this page rather than in the
                shell because it belongs to the feed: it sits in the feed's own column, so it
                lines up with the post cards, and it scrolls away with them.

                It sits *outside* <PullToRefresh/> deliberately. Only the posts should follow
                the finger — the trigger is a fixture of the surface being refreshed, not one
                of the things being refreshed, and dragging it down with them reads as the
                whole page coming loose. Leaving it here also means the pull opens its gap
                directly beneath it, which is where the spinner belongs. */}
            <OrgNavTrigger />

            <PullToRefresh onRefresh={refresh}>
                <AnimatePresence mode="wait" initial={false}>
                    {skeleton ? (
                        <Transition fast key="skeleton">
                            <FeedSkeleton />
                        </Transition>
                    ) : (
                        <Transition fast key="content">
                            {/* Admin-only; renders nothing for a member. */}
                            <Composer />
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
