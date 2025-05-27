import {addEvent, getEvents, loadEvents} from "@/utils/chat/EventTracker"
import {getSessions, loadSessions} from "@/utils/chat/SessionTracker"
import {Invite, CHAT_MESSAGE_KIND} from "nostr-double-ratchet/src"
import {createJSONStorage, persist} from "zustand/middleware"
import {MessageType} from "@/pages/chats/message/Message"
import {addSession} from "@/utils/chat/SessionTracker"
import {NDKEventFromRawEvent} from "@/utils/nostr"
import {Filter, VerifiedEvent} from "nostr-tools"
import {hexToBytes} from "@noble/hashes/utils"
import {useInvitesStore} from "./invites"
import {useUserStore} from "./user"
import {ndk} from "@/utils/ndk"
import {create} from "zustand"

interface SessionStoreState {
  sessions: string[]
  events: Record<string, MessageType[]>
}

interface SessionStoreActions {
  acceptInvite: (url: string) => Promise<void>
  sendMessage: (id: string, content: string, replyingToId?: string) => Promise<void>
}

type SessionStore = SessionStoreState & SessionStoreActions
const subscribe = (filter: Filter, onEvent: (event: VerifiedEvent) => void) => {
  const sub = ndk().subscribe(filter)
  sub.on("event", (e) => onEvent(e as unknown as VerifiedEvent))
  return () => sub.stop()
}

const store = create<SessionStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      events: {},
      sendMessage: async (sessionId: string, content: string, replyingToId?: string) => {
        const session = getSessions().get(sessionId)
        if (!session) {
          throw new Error("Session not found")
        }
        const {event, innerEvent} = session.sendEvent({
          content,
          kind: CHAT_MESSAGE_KIND,
          tags: [
            ...(replyingToId ? [["e", replyingToId]] : []),
            ["ms", Date.now().toString()],
          ],
        })
        const e = NDKEventFromRawEvent(event)
        await e
          .publish()
          .then((res) => console.log("published", res))
          .catch((e) => console.warn("Error publishing event:", e))
        const message: MessageType = {
          ...innerEvent,
          sender: "user",
          reactions: {},
        }
        addEvent(sessionId, message)
        const events = getEvents()
        const sessionEvents = events.get(sessionId)
        const newEvents = Array.from(sessionEvents?.values() || [])
        set({
          events: {
            ...get().events,
            [sessionId]: newEvents,
          },
        })
      },
      acceptInvite: async (url: string) => {
        const invite = Invite.fromUrl(url)
        const myPubKey = useUserStore.getState().publicKey
        if (!myPubKey) {
          throw new Error("No public key")
        }
        const myPrivKey = useUserStore.getState().privateKey
        const encrypt = myPrivKey
          ? hexToBytes(myPrivKey)
          : async (plaintext: string, pubkey: string) => {
              if (window.nostr?.nip44) {
                return window.nostr.nip44.encrypt(plaintext, pubkey)
              }
              throw new Error("No nostr extension or private key")
            }
        const {session, event} = await invite.accept(
          (filter, onEvent) => subscribe(filter, onEvent),
          myPubKey,
          encrypt
        )
        const e = NDKEventFromRawEvent(event)
        await e
          .publish()
          .then((res) => console.log("published", res))
          .catch((e) => console.warn("Error publishing event:", e))
        addSession(session, invite.inviter)
      },
    }),
    {
      name: "sessions",
      onRehydrateStorage: (state) => {
        console.log("onRehydrateStorage1", state)
        return (state) => {
          loadSessions()
          loadEvents()
        }
      },
      storage: createJSONStorage(() => localStorage),
    }
  )
)

useInvitesStore.subscribe((state) => {
  const privateKey = useUserStore.getState().privateKey
  if (!privateKey) {
    console.warn("No private key, skipping invite listening")
    return
  }
  //state.invites.forEach((invite) => {
  //const decrypt = privateKey
  //  ? hexToBytes(privateKey)
  //  : async (cipherText: string, pubkey: string) => {
  //      if (window.nostr?.nip44) {
  //        try {
  //          const result = await window.nostr.nip44.decrypt(pubkey, cipherText)
  //          if (!result || typeof result !== "string") {
  //            throw new Error("Failed to decrypt")
  //          }
  //          return result
  //        } catch (error) {
  //          console.error("NIP-44 decryption failed:", error)
  //          throw new Error("Failed to decrypt message")
  //        }
  //      }
  //      throw new Error("No nostr extension or private key")
  //    }
  //invite.listen(decrypt, subscribe, (session, identity) => {
  //  console.log("listened a session from invite", session)
  //  const sessionId = `${identity}:${session.name}`
  //  const newSessions = new Map(store.getState().sessions)
  //  newSessions.set(sessionId, session)
  //  session.onEvent((event) => {
  //    const newEvents = new Map(store.getState().events)
  //    const newMessages = new Map(newEvents.get(sessionId) || new Map())
  //    newMessages.set(event.id, event)
  //    newEvents.set(sessionId, newMessages)
  //    store.setState({events: newEvents})
  //  })
  //  store.setState({sessions: newSessions})
  //})
})

export const useSessionsStore = store
