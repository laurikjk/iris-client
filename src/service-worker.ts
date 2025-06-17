/// <reference lib="webworker" />
import {
  INVITE_EVENT_KIND,
  INVITE_RESPONSE_KIND,
  MESSAGE_EVENT_KIND,
  deserializeSessionState,
  serializeSessionState,
  Session,
} from "nostr-double-ratchet/src"
import {PROFILE_AVATAR_WIDTH, EVENT_AVATAR_WIDTH} from "./shared/components/user/const"
import {CacheFirst, StaleWhileRevalidate} from "workbox-strategies"
import {CacheableResponsePlugin} from "workbox-cacheable-response"
import {precacheAndRoute, PrecacheEntry} from "workbox-precaching"
import {generateProxyUrl} from "./shared/utils/imgproxy"
import {ExpirationPlugin} from "workbox-expiration"
import {registerRoute} from "workbox-routing"
import {clientsClaim} from "workbox-core"
import localforage from "localforage"

// eslint-disable-next-line no-undef
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | PrecacheEntry)[]
}

precacheAndRoute(self.__WB_MANIFEST)
clientsClaim()

registerRoute(
  ({url}) => url.pathname.endsWith("/.well-known/nostr.json"),
  new StaleWhileRevalidate({
    cacheName: "nostr-json-cache",
    plugins: [new ExpirationPlugin({maxAgeSeconds: 4 * 60 * 60})],
  })
)

// Avatars
registerRoute(
  ({request, url}) => {
    return (
      request.destination === "image" &&
      url.href.startsWith("https://imgproxy.iris.to/") &&
      (url.pathname.includes(
        `rs:fill:${PROFILE_AVATAR_WIDTH * 2}:${PROFILE_AVATAR_WIDTH * 2}`
      ) ||
        url.pathname.includes(
          `rs:fill:${EVENT_AVATAR_WIDTH * 2}:${EVENT_AVATAR_WIDTH * 2}`
        ))
    )
  },
  new CacheFirst({
    cacheName: "avatar-cache",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100, // gif avatars can still be large
        matchOptions: {
          ignoreVary: true,
        },
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
)

// Cache images from any domain with size limit
registerRoute(
  // match images except gif
  ({request, url}) => request.destination === "image" && !url.pathname.endsWith(".gif"),
  new CacheFirst({
    cacheName: "image-cache",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        matchOptions: {
          ignoreVary: true,
        },
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
)

registerRoute(
  ({url}) =>
    url.origin === "https://nostr.api.v0l.io" &&
    url.pathname.startsWith("/api/v1/preview"),
  new CacheFirst({
    cacheName: "preview-cache",
    plugins: [
      new ExpirationPlugin({maxAgeSeconds: 24 * 60 * 60}),
      new CacheableResponsePlugin({statuses: [0, 200]}),
    ],
  })
)

registerRoute(
  ({url}) =>
    url.origin === "https://api.snort.social" &&
    url.pathname.startsWith("/api/v1/translate"),
  new CacheFirst({
    cacheName: "translate-cache",
    plugins: [
      new ExpirationPlugin({maxEntries: 1000}),
      new CacheableResponsePlugin({
        statuses: [0, 200, 204],
      }),
    ],
  })
)

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting()
  }
})
self.addEventListener("install", (event) => {
  // delete all cache on install
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.debug("Deleting cache: ", cacheName)
          return caches.delete(cacheName)
        })
      )
    })
  )
})

interface PushData {
  event: {
    id: string
    pubkey: string
    created_at: number
    kind: number
    tags: string[][]
    content: string
    sig: string
  }
  title: string
  body: string
  icon: string
  url: string
}

self.addEventListener("notificationclick", (event) => {
  const notificationData = event.notification.data
  event.notification.close()
  console.debug("Notification clicked:", notificationData)

  event.waitUntil(
    (async function () {
      // Handle both direct URL and nested event data structure
      const path = notificationData?.url || notificationData?.event?.url
      if (!path) {
        console.debug("No URL in notification data")
        return
      }

      // If it's already a full URL, use URL constructor, otherwise just use the path
      const pathname = path.startsWith("http") ? new URL(path).pathname : path
      const fullUrl = `${self.location.origin}${pathname}`
      console.debug("Navigating to:", fullUrl)

      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      console.debug("Found clients:", allClients.length)

      if (allClients.length > 0) {
        const client = allClients[0]
        await client.focus()
        console.debug("Sending navigation message to client")
        await client.postMessage({
          type: "NAVIGATE_REACT_ROUTER",
          url: fullUrl,
        })
        return
      }

      console.debug("No clients found, opening new window")
      if (self.clients.openWindow) {
        return self.clients.openWindow(fullUrl)
      }
    })()
  )
})

const NOTIFICATION_CONFIGS: Record<
  number,
  {
    title: string
    url: string
    icon: string
  }
> = {
  [MESSAGE_EVENT_KIND]: {
    title: "New private message",
    url: "/chats",
    icon: "/favicon.png",
  },
  [INVITE_EVENT_KIND]: {
    title: "New message request",
    url: "/chats",
    icon: "/favicon.png",
  },
  [INVITE_RESPONSE_KIND]: {
    title: "New chat via invite", // TODO get invite label public or private
    url: "/chats",
    icon: "/favicon.png",
  },
} as const
self.addEventListener("push", (event) => {
  console.log("(new version) Push event received:", event)
  event.waitUntil(
    (async () => {
      const data = event.data?.json() as PushData | undefined
      console.log("(new version) data:", data)
      if (!data?.event) return

      // ----- 1. Try to decrypt a private DM ---------------------------------
      if (data.event.kind === MESSAGE_EVENT_KIND) {
        try {
          const wrapper = await localforage.getItem("sessions")
          console.log("(new version) trying")
          if (wrapper) {
            const parsed = typeof wrapper === "string" ? JSON.parse(wrapper) : wrapper
            const sessionEntries: [string, string][] =
              parsed?.state?.sessions ?? parsed?.sessions ?? []

            for (const [sessionId, serState] of sessionEntries) {
              // Quick peer match
              const state = deserializeSessionState(serState)
              if (
                state.theirCurrentNostrPublicKey !== data.event.pubkey &&
                state.theirNextNostrPublicKey !== data.event.pubkey
              ) {
                continue
              }
              console.log("new version) found session for", sessionId)

              // Re-hydrate session with a no-op subscribe
              const dummySubscribe = () => () => {}
              const session = new Session(dummySubscribe, state)

              // Decrypt exactly one event
              let innerEvent: any = null
              const off = session.onEvent((ev) => {
                console.log("got ev", ev)
                innerEvent = ev
              })
              ;(session as any).handleNostrEvent(data.event)
              off()

              if (innerEvent) {
                // Persist the advanced ratchet state
                // const newSer = serializeSessionState(session.state)
                // const target = sessionEntries.find((e) => e[0] === sessionId)!
                // target[1] = newSer
                // await localforage.setItem(
                //   "sessions",
                //   JSON.stringify({
                //     ...parsed,
                //     state: {...parsed.state, sessions: sessionEntries},
                //   })
                // )

                // Show decrypted notification
                await self.registration.showNotification(
                  `New message from ${sessionId.split(":")[1]}`,
                  {
                    body: innerEvent.content,
                    icon: NOTIFICATION_CONFIGS[MESSAGE_EVENT_KIND].icon,
                    data: {
                      url: `/chats/${encodeURIComponent(sessionId)}`,
                      event: data.event,
                    },
                  }
                )
                return // done!
              }
            }
          }
        } catch (err) {
          console.error("DM decryption failed:", err)
        }
      }

      // ----- 2. Fallback to predefined or generic notifications --------------
      if (NOTIFICATION_CONFIGS[data.event.kind]) {
        const cfg = NOTIFICATION_CONFIGS[data.event.kind]
        await self.registration.showNotification(cfg.title, {
          icon: cfg.icon,
          data: {url: cfg.url, event: data.event},
        })
        return
      }

      const icon = data.icon?.startsWith("http")
        ? generateProxyUrl(data.icon, {width: 128, square: true})
        : data.icon || "/favicon.png"

      await self.registration.showNotification(data.title || "New notification", {
        body: data.body,
        icon,
        data,
      })
    })()
  )
})
