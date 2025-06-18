import {NDKUserProfile} from "@nostr-dev-kit/ndk"
import {profileCache} from "./memcache"
import debounce from "lodash/debounce"
import localforage from "localforage"
import Fuse from "fuse.js"

export type SearchResult = {
  name: string
  pubKey: string
  nip05?: string
}

const latestProfileEvents = new Map<string, number>()

let searchIndex: Fuse<SearchResult> = new Fuse<SearchResult>([], {
  keys: ["name", "nip05"],
  includeScore: true,
})

const saveProfileCache = debounce(async () => {
  await localforage.setItem<[string, {username: string}][]>(
    "PROFILE_SEARCH_DATA",
    Array.from(profileCache.entries())
  )
}, 5000)

async function initializeSearchIndex() {
  console.time("fuse init")
  // TODO load from localForage?
  const {default: profileJson} = await import("nostr-social-graph/data/profileData.json")
  const processedData = [] as SearchResult[]
  profileJson.forEach((v) => {
    if (v[0] && v[1]) {
      processedData.push({
        pubKey: v[0],
        name: v[1],
        nip05: v[2] || undefined,
      })

      let pictureUrl = v[3]
      if (pictureUrl && !pictureUrl.startsWith("http://")) {
        pictureUrl = `https://${pictureUrl}`
      }
      profileCache.set(v[0], {username: v[1], picture: pictureUrl || undefined})
    }
  })

  searchIndex = new Fuse<SearchResult>(processedData, {
    keys: ["name", "nip05"],
    includeScore: true,
  })
  console.timeEnd("fuse init")
  saveProfileCache()
}

initializeSearchIndex().catch(console.error)

export {searchIndex}

export function handleProfile(pubKey: string, profile: NDKUserProfile) {
  queueMicrotask(() => {
    const lastSeen = latestProfileEvents.get(pubKey) || 0
    if (profile.created_at && profile.created_at > lastSeen) {
      latestProfileEvents.set(pubKey, profile.created_at)
      const name = String(profile.name || profile.username)
      const nip05 = profile.nip05
      if (name) {
        // not sure if this remove is efficient?
        // should we have our internal map and reconstruct the searchIndex from it with debounce?
        searchIndex.remove((profile) => profile.pubKey === pubKey)
        searchIndex.add({name, pubKey, nip05})
        saveProfileCache()
      }
    }
  })
}
