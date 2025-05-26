import {Invite, serializeSessionState, Session} from "nostr-double-ratchet/src"
import {subscribeToDMNotifications} from "@/utils/notifications"
import {persist, PersistStorage} from "zustand/middleware"
import {NDKEventFromRawEvent} from "@/utils/nostr"
import {hexToBytes} from "@noble/hashes/utils"
import {VerifiedEvent} from "nostr-tools"
import debounce from "lodash/debounce"
import {useUserStore} from "./user"
import {Filter} from "nostr-tools"
import {localState} from "irisdb"
import {ndk} from "@/utils/ndk"
import {create} from "zustand"

interface InvitesState {
  invites: Map<string, Invite>
}

const initialState: InvitesState = {
  invites: new Map(),
}

interface InvitesActions {
  setInvites: (invites: Map<string, Invite>) => void
}

const nostrSubscribe = (filter: Filter, onEvent: (e: VerifiedEvent) => void) => {
  const sub = ndk().subscribe(filter)
  sub.on("event", (event) => {
    onEvent(event as unknown as VerifiedEvent)
  })
  return () => sub.stop()
}

const storage: PersistStorage<InvitesState> = {
  getItem: (key: string) => {
    const value = localStorage.getItem(key)
    console.log("getItem raw value:", value)
    if (!value) return {state: initialState}
    const parsed = JSON.parse(value)
    console.log("getItem parsed:", parsed)

    const invites = parsed.invites
      .map(([id, invite]: [string, string]) => {
        try {
          console.log(`Deserializing invite ${id}:`, invite)
          const deserialized = Invite.deserialize(invite)
          console.log(`Successfully deserialized invite ${id}`)
          return [id, deserialized]
        } catch (error) {
          console.error(`Failed to deserialize invite ${id}:`, error)
          return null
        }
      })
      .filter(Boolean) // Remove any failed deserializations

    console.log("getItem final invites:", invites)
    return {state: {invites: new Map(invites)}}
  },
  setItem: (key, value) => {
    console.log("setItem", key, value)
    const invitesSerialized = Array.from(value.state.invites.entries()).map(
      ([id, invite]) => [id, invite.serialize()]
    )
    localStorage.setItem(key, JSON.stringify({invites: invitesSerialized}))
    console.log("setItem set items", JSON.parse(localStorage.getItem(key) || "{}"))
  },
  removeItem: (key) => {
    localStorage.removeItem(key)
  },
}

export const useInvitesStore = create<InvitesState & InvitesActions>()(
  persist(
    (set) => ({
      ...initialState,
      setInvites: (invites: Map<string, Invite>) => {
        set({invites})
        const privateKey = useUserStore.getState().privateKey
        const decryptor = hexToBytes(privateKey)
        const onSession = async (session: Session, identity?: string) => {
          const sessionId = `${identity}:${session.name}`
          const existing = await localState
            .get("sessions")
            .get(sessionId)
            .once(undefined, true)
          if (existing) return
          localState
            .get("sessions")
            .get(sessionId)
            .get("state")
            .put(serializeSessionState(session.state))
          subscribeToDMNotifications()
        }
        for (const invite of invites.values()) {
          invite.listen(decryptor, nostrSubscribe, onSession)
        }
      },
    }),
    {
      name: "invites-storage",
      storage,
    }
  )
)
