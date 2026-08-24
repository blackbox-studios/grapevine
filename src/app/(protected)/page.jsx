"use client"

import { AnimatePresence } from "motion/react"

import Transition from "@/components/Transition"
import Feed from "@/components/Feed"
import { NotificationsTrigger } from "@/components/Notifications"
import { OrgNavTrigger } from "@/components/OrgNav"
import PullToRefresh from "@/components/PullToRefresh"
import { FeedSkeleton } from "@/components/Skeleton"
import { useFeed } from "@/lib/store/feed/hook"

const HomePage = () => {
    const { posts, skeleton, hasMore, loadingMore, refresh, loadMore } = useFeed()

    return (
        <div className="mx-auto w-full max-w-[470px] pb-10">
            {/* The feed's own mobile header: the group switcher on the left, notifications on
                the right. Both live on this page rather than in the shell because they belong
                to the feed — they sit in its column, so they line up with the post cards, and
                they scroll away with them.

                The bell is here rather than in the mobile rail below because the rail is for
                destinations and this is not one: it opens a surface over wherever the reader
                already is. Putting it at the top right of the one screen everybody starts on
                is where a phone user reaches for it.

                This row sits *outside* <PullToRefresh/> deliberately. Only the posts should
                follow the finger — the header is a fixture of the surface being refreshed, not
                one of the things being refreshed, and dragging it down with them reads as the
                whole page coming loose. Leaving it here also means the pull opens its gap
                directly beneath it, which is where the spinner belongs. */}
            <div className="md:hidden flex items-center justify-between pb-6">
                <OrgNavTrigger />
                <NotificationsTrigger className="-mr-1" />
            </div>

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
