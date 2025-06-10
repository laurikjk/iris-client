import {
  Invite,
  Session,
  serializeSessionState,
  deserializeSessionState,
  CHAT_MESSAGE_KIND,
} from "nostr-double-ratchet/src"
import {createJSONStorage, persist} from "zustand/middleware"
import {NDKEventFromRawEvent, RawEvent} from "@/utils/nostr"
import {MessageType} from "@/pages/chats/message/Message"
import {Filter, VerifiedEvent} from "nostr-tools"
import {hexToBytes} from "@noble/hashes/utils"
import {useEventsStore} from "./events"
import {useUserStore} from "./user"
import {ndk} from "@/utils/ndk"
import {create} from "zustand"

interface SessionStoreState {
  invites: Map<string, Invite>
  sessions: Map<string, Session>
  lastSeen: Map<string, number>
}

const inviteListeners = new Map<string, () => void>()
const sessionListeners = new Map<string, () => void>()

interface SessionStoreActions {
  createInvite: (label: string, inviteId?: string) => void
  createDefaultInvites: () => void
  acceptInvite: (url: string) => Promise<string>
  sendMessage: (
    id: string,
    content: string,
    replyingToId?: string,
    isReaction?: boolean
  ) => Promise<void>
  updateLastSeen: (sessionId: string) => void
  deleteInvite: (id: string) => void
  deleteSession: (id: string) => void
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
      invites: new Map(),
      sessions: new Map(),
      lastSeen: new Map(),
      createDefaultInvites: async () => {
        const myPubKey = useUserStore.getState().publicKey
        if (!myPubKey) {
          throw new Error("No public key")
        }
        if (!get().invites.has("public")) {
          get().createInvite("Public Invite", "public")
          const invite = get().invites.get("public")
          if (!invite) {
            return
          }
          const event = invite.getEvent() as RawEvent
          await NDKEventFromRawEvent(event)
            .publish()
            .then((res) => console.log("published public invite", res))
            .catch((e) => console.warn("Error publishing public invite:", e))
        }
        if (!get().invites.has("private")) {
          get().createInvite("Private Invite", "private")
        }
      },
      deleteInvite: (id: string) => {
        const currentInvites = get().invites
        const newInvites = new Map(currentInvites)
        newInvites.delete(id)
        set({invites: newInvites})
        const unsubscribe = inviteListeners.get(id)
        if (unsubscribe) {
          unsubscribe()
          inviteListeners.delete(id)
        }
      },
      createInvite: (label: string, inviteId?: string) => {
        const myPubKey = useUserStore.getState().publicKey
        const myPrivKey = useUserStore.getState().privateKey
        if (!myPubKey) {
          throw new Error("No public key")
        }
        const invite = Invite.createNew(myPubKey, label)
        const id = inviteId || crypto.randomUUID()
        const currentInvites = get().invites

        const newInvites = new Map(currentInvites)
        newInvites.set(id, invite)
        const decrypt = myPrivKey
          ? hexToBytes(myPrivKey)
          : async (cipherText: string, pubkey: string) => {
              if (window.nostr?.nip44) {
                return window.nostr.nip44.decrypt(pubkey, cipherText)
              }
              throw new Error("No nostr extension or private key")
            }
        const unsubscribe = invite.listen(decrypt, subscribe, (session, identity) => {
          const sessionId = `${identity}:${session.name}`
          if (sessionListeners.has(sessionId)) {
            return
          }
          const newSessions = new Map(store.getState().sessions)
          newSessions.set(sessionId, session)
          store.setState({sessions: newSessions})
          const sessionUnsubscribe = session.onEvent((event) => {
            console.log("ON EVENT", event)
            useEventsStore.getState().upsert(sessionId, event)
            store.setState({sessions: new Map(store.getState().sessions)})
          })
          sessionListeners.set(sessionId, sessionUnsubscribe)
        })
        inviteListeners.set(id, unsubscribe)
        set({invites: newInvites})
      },
      sendMessage: async (
        sessionId: string,
        content: string,
        replyingToId?: string,
        isReaction?: boolean
      ) => {
        const session = get().sessions.get(sessionId)
        if (!session) {
          throw new Error("Session not found")
        }
        if (isReaction && !replyingToId) {
          throw new Error("Cannot send a reaction without a replyingToId")
        }

        const {event, innerEvent} = session.sendEvent({
          content,
          kind: isReaction ? 6 : CHAT_MESSAGE_KIND,
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
        useEventsStore.getState().upsert(sessionId, message)
        // make sure we persist session state
        set({sessions: new Map(get().sessions)})
      },
      acceptInvite: async (url: string): Promise<string> => {
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
                return window.nostr.nip44.encrypt(pubkey, plaintext)
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
        if (sessionListeners.has(sessionId)) {
          return sessionId
        }
        const newSessions = new Map(get().sessions)
        newSessions.set(sessionId, session)
        const sessionUnsubscribe = session.onEvent((event) => {
          useEventsStore.getState().upsert(sessionId, event)
          // make sure we persist session state
          set({sessions: new Map(get().sessions)})
        })
        sessionListeners.set(sessionId, sessionUnsubscribe)
        set({sessions: newSessions})
        return sessionId
      },
      updateLastSeen: (sessionId: string) => {
        const newLastSeen = new Map(get().lastSeen)
        newLastSeen.set(sessionId, Date.now())
        set({lastSeen: newLastSeen})
      },
      deleteSession: (sessionId: string) => {
        const newSessions = new Map(get().sessions)
        newSessions.delete(sessionId)
        set({sessions: newSessions})
        const unsubscribe = sessionListeners.get(sessionId)
        if (unsubscribe) {
          unsubscribe()
          sessionListeners.delete(sessionId)
        }
        useEventsStore.getState().removeSession(sessionId)
      },
    }),
    {
      name: "sessions",
      onRehydrateStorage: () => (state) => {
        const privateKey = useUserStore.getState().privateKey
        const decrypt = privateKey
          ? hexToBytes(privateKey)
          : async (cipherText: string, pubkey: string) => {
              if (window.nostr?.nip44) {
                return window.nostr.nip44.decrypt(pubkey, cipherText)
              }
              throw new Error("No nostr extension or private key")
            }
        Array.from(state?.invites || []).forEach(([id, invite]) => {
          if (inviteListeners.has(id)) {
            return
          }
          const inviteUnsubscribe = invite.listen(
            decrypt,
            subscribe,
            (session, identity) => {
              const sessionId = `${identity}:${session.name}`
              if (sessionListeners.has(sessionId)) {
                return
              }
              const newSessions = new Map(store.getState().sessions)
              newSessions.set(sessionId, session)
              store.setState({sessions: newSessions})
              const sessionUnsubscribe = session.onEvent((event) => {
                useEventsStore.getState().upsert(sessionId, event)
                store.setState({sessions: new Map(store.getState().sessions)})
              })
              sessionListeners.set(sessionId, sessionUnsubscribe)
            }
          )
          inviteListeners.set(id, inviteUnsubscribe)
        })
        Array.from(state?.sessions || []).forEach(([sessionId, session]) => {
          if (sessionListeners.has(sessionId)) {
            return
          }
          const sessionUnsubscribe = session.onEvent((event) => {
            useEventsStore.getState().upsert(sessionId, event)
            store.setState({sessions: new Map(store.getState().sessions)})
          })
          sessionListeners.set(sessionId, sessionUnsubscribe)
        })
        state?.createDefaultInvites()
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        return {
          invites: Array.from(state.invites.entries()).map((entry) => {
            const [id, invite] = entry as [string, Invite]
            return [id, invite.serialize()]
          }),
          sessions: Array.from(state.sessions.entries()).map((entry) => {
            const [id, session] = entry as [string, Session]
            return [id, serializeSessionState(session.state)]
          }),
          lastSeen: Array.from(state.lastSeen.entries()),
        }
      },
      merge: (persistedState: unknown, currentState: SessionStore) => {
        const state = persistedState as {
          invites: [string, string][]
          sessions: [string, string][]
          lastSeen: [string, number][]
        }
        const newSessions: [string, Session][] = state.sessions.map(
          ([id, sessionState]: [string, string]) => {
            const session = new Session(subscribe, deserializeSessionState(sessionState))
            return [id, session] as [string, Session]
          }
        )
        const newInvites: [string, Invite][] = state.invites.map(
          (entry: [string, string]) => {
            const [id, invite] = entry
            return [id, Invite.deserialize(invite)] as [string, Invite]
          }
        )
        return {
          ...currentState,
          invites: new Map<string, Invite>(newInvites),
          sessions: new Map<string, Session>(newSessions),
          lastSeen: new Map<string, number>(state.lastSeen || []),
        }
      },
    }
  )
)

export const useSessionsStore = store
