import {
  Invite,
  Session,
  serializeSessionState,
  deserializeSessionState,
  SessionState,
  CHAT_MESSAGE_KIND,
} from "nostr-double-ratchet/src"
import {persist, PersistStorage, StorageValue} from "zustand/middleware"
import {MessageType} from "@/pages/chats/message/Message"
import {NDKEventFromRawEvent} from "@/utils/nostr"
import {Filter, VerifiedEvent} from "nostr-tools"
import {hexToBytes} from "@noble/hashes/utils"
import {useInvitesStore} from "./invites"
import {useUserStore} from "./user"
import {ndk} from "@/utils/ndk"
import {create} from "zustand"

interface SessionStoreState {
  sessions: Map<string, Session>
  events: Map<string, Map<string, MessageType>>
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

const storage: PersistStorage<SessionStoreState> = {
  getItem: (name: string): StorageValue<SessionStoreState> | null => {
    const value = localStorage.getItem(name)
    if (!value) return null
    const parsed = JSON.parse(value)
    const sessions = new Map<string, Session>(
      parsed.sessions.map(([id, serializedState]: [string, any]) => [
        id,
        new Session(subscribe, deserializeSessionState(serializedState)),
      ])
    )
    return {
      state: {
        sessions,
        events: new Map(),
      },
    }
  },
  setItem: (name: string, value: StorageValue<SessionStoreState>): void => {
    console.log("setting item in storage", value)
    const serializedSessions = Array.from(value.state.sessions.entries()).map(
      ([id, session]) => [id, serializeSessionState(session.state)]
    )
    localStorage.setItem(
      name,
      JSON.stringify({
        sessions: serializedSessions,
        events: [],
      })
    )
  },
  removeItem: (name: string): void => {
    localStorage.removeItem(name)
  },
}

const store = create<SessionStore>()(
  persist(
    (set, get) => ({
      sessions: new Map(),
      events: new Map(),
      sendMessage: async (sessionId: string, content: string, replyingToId?: string) => {
        const session = get().sessions.get(sessionId)
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
        const newEvents = new Map(get().events)
        const newMessages = new Map(newEvents.get(sessionId) || new Map())
        const message: MessageType = {
          ...innerEvent,
          sender: "user",
          reactions: {},
        }
        newMessages.set(innerEvent.id, message)
        newEvents.set(sessionId, newMessages)
        set({events: newEvents})
        // make sure we persist session state
        set({sessions: new Map(get().sessions)})
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
        const sessionId = `${invite.inviter}:${session.name}`
        const newSessions = new Map(get().sessions)
        newSessions.set(sessionId, session)
        set({sessions: newSessions})
      },
    }),
    {
      name: "sessions",
      onRehydrateStorage: (state) => {
        console.log("onRehydrateStorage1", state)
        return (state) => {
          console.log("onRehydrateStorage2", state)
        }
      },
      storage: storage,
    }
  )
)

useInvitesStore.subscribe((state) => {
  const privateKey = useUserStore.getState().privateKey
  if (!privateKey) {
    console.warn("No private key, skipping invite listening")
    return
  }
  state.invites.forEach((invite) => {
    const decrypt = privateKey
      ? hexToBytes(privateKey)
      : async (cipherText: string, pubkey: string) => {
          if (window.nostr?.nip44) {
            try {
              const result = await window.nostr.nip44.decrypt(pubkey, cipherText)
              if (!result || typeof result !== "string") {
                throw new Error("Failed to decrypt")
              }
              return result
            } catch (error) {
              console.error("NIP-44 decryption failed:", error)
              throw new Error("Failed to decrypt message")
            }
          }
          throw new Error("No nostr extension or private key")
        }
    invite.listen(decrypt, subscribe, (session, identity) => {
      console.log("listened a session from invite", session)
      const sessionId = `${identity}:${session.name}`
      const newSessions = new Map(store.getState().sessions)
      newSessions.set(sessionId, session)
      store.setState({sessions: newSessions})
    })
  })
})

export const useSessionsStore = store
