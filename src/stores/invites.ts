import {Invite, serializeSessionState, Session} from "nostr-double-ratchet/src"
import {subscribeToDMNotifications} from "@/utils/notifications"
import {persist, PersistStorage} from "zustand/middleware"
import {hexToBytes} from "@noble/hashes/utils"
import {VerifiedEvent} from "nostr-tools"
import {useUserStore} from "./user"
import {Filter} from "nostr-tools"
import {localState} from "irisdb"
import {ndk} from "@/utils/ndk"
import {create} from "zustand"

interface InvitesState {
  invites: Map<string, Invite>
  unsubscribes: Map<string, () => void>
}

const initialState: InvitesState = {
  invites: new Map(),
  unsubscribes: new Map(),
}
interface InvitesActions {
  setInvites: (invites: Map<string, Invite>) => void
}

const getPrivateKey = () => useUserStore.getState().privateKey
const getDecryptor = () => hexToBytes(getPrivateKey())
const getOnSession = () => async (session: Session, identity?: string) => {
  const sessionId = `${identity}:${session.name}`
  const existing = await localState.get("sessions").get(sessionId).once(undefined, true)
  if (existing) return
  localState
    .get("sessions")
    .get(sessionId)
    .get("state")
    .put(serializeSessionState(session.state))
  subscribeToDMNotifications()
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
    if (!value) return {state: initialState}
    const parsed = JSON.parse(value)
    const invites = parsed.invites.map(([id, invite]: [string, string]) => [
      id,
      Invite.deserialize(invite),
    ])
    const unsubscribes = new Map<string, () => void>()
    for (const [, invite] of invites) {
      const unsubscribe = invite.listen(getDecryptor(), nostrSubscribe, getOnSession())
      unsubscribes.set(invite.id, unsubscribe)
    }
    return {state: {invites: new Map(invites), unsubscribes}}
  },
  setItem: (key, value) => {
    const invitesSerialized = Array.from(value.state.invites.entries()).map(
      ([id, invite]) => [id, invite.serialize()]
    )
    localStorage.setItem(key, JSON.stringify({invites: invitesSerialized}))
  },
  removeItem: (key) => {
    localStorage.removeItem(key)
  },
}

export const useInvitesStore = create<InvitesState & InvitesActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      setInvites: (invites: Map<string, Invite>) => {
        const currentUnsubscribes = get().unsubscribes

        const newInvites = new Map<string, Invite>()
        const newUnsubscribes = new Map<string, () => void>()

        for (const [id, invite] of invites) {
          newInvites.set(id, invite)
          newUnsubscribes.set(
            id,
            invite.listen(getDecryptor(), nostrSubscribe, getOnSession())
          )
        }

        for (const [id, unsubscribe] of currentUnsubscribes) {
          unsubscribe()
        }

        set({invites: newInvites, unsubscribes: newUnsubscribes})
      },
    }),
    {
      name: "invites-storage",
      storage,
    }
  )
)
