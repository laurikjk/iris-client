import {
  Invite,
  Session,
  serializeSessionState,
  deserializeSessionState,
  CHAT_MESSAGE_KIND,
} from "nostr-double-ratchet/src"
import {createJSONStorage, persist} from "zustand/middleware"
import {MessageType} from "@/pages/chats/message/Message"
import {NDKEventFromRawEvent} from "@/utils/nostr"
import {Filter, VerifiedEvent} from "nostr-tools"
import {hexToBytes} from "@noble/hashes/utils"
import {useEventsStore} from "./events"
import {useUserStore} from "./user"
import {ndk} from "@/utils/ndk"
import {create} from "zustand"

interface SessionStoreState {
  invites: Map<string, Invite>
  sessions: Map<string, Session>
  // sessionId -> messageId -> message
  // events: Map<string, Map<string, MessageType>>
}

const inviteListeners = new Map<string, () => void>()
const sessionListeners = new Map<string, () => void>()

interface SessionStoreActions {
  createInvite: (label: string) => void
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
      invites: new Map(),
      sessions: new Map(),
      //events: new Map(),
      createInvite: (label: string) => {
        const myPubKey = useUserStore.getState().publicKey
        if (!myPubKey) {
          throw new Error("No public key")
        }
        const invite = Invite.createNew(myPubKey, label)
        const id = crypto.randomUUID()
        const currentInvites = get().invites

        const newInvites = new Map(currentInvites)
        newInvites.set(id, invite)
        set({invites: newInvites})
      },
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
        // const newEvents = new Map(get().events)
        // const newMessages = new Map(newEvents.get(sessionId) || new Map())
        const message: MessageType = {
          ...innerEvent,
          sender: "user",
          reactions: {},
        }
        // newMessages.set(innerEvent.id, message)
        // newEvents.set(sessionId, newMessages)
        // set({events: newEvents})
        useEventsStore.getState().upsert(sessionId, innerEvent.id, message)
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
        if (sessionListeners.has(sessionId)) {
          return
        }
        const newSessions = new Map(get().sessions)
        newSessions.set(sessionId, session)
        const sessionUnsubscribe = session.onEvent((event) => {
          // const newEvents = new Map(get().events)
          // const newMessages = new Map(newEvents.get(sessionId) || new Map())
          // newMessages.set(event.id, event)
          // newEvents.set(sessionId, newMessages)
          // set({events: newEvents})
          useEventsStore.getState().upsert(sessionId, event.id, event)
          // make sure we persist session state
          set({sessions: new Map(get().sessions)})
        })
        sessionListeners.set(sessionId, sessionUnsubscribe)
        set({sessions: newSessions})
      },
    }),
    {
      name: "sessions",
      onRehydrateStorage: (state) => {
        return (state) => {
          const privateKey = useUserStore.getState().privateKey
          if (!privateKey) {
            throw new Error("No private key")
          }
          const decrypt = privateKey
            ? hexToBytes(privateKey)
            : async (cipherText: string, pubkey: string) => {
                if (window.nostr?.nip44) {
                  return window.nostr.nip44.decrypt(cipherText, pubkey)
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
                console.log("HYDRATION SET ON EVENT", event)
                const sessionId = `${identity}:${session.name}`
                if (sessionListeners.has(sessionId)) {
                  return
                }
                const newSessions = new Map(store.getState().sessions)
                newSessions.set(sessionId, session)
                store.setState({sessions: newSessions})
                const sessionUnsubscribe = session.onEvent((event) => {
                  console.log("HYDRATION SET ON EVENT", event)
                  // const newEvents = new Map(store.getState().events)
                  // const newMessages = new Map(newEvents.get(sessionId) || new Map())
                  // newMessages.set(event.id, event)
                  // newEvents.set(sessionId, newMessages)
                  // store.setState({events: newEvents})
                  useEventsStore.getState().upsert(sessionId, event.id, event)
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
              console.log("HYDRATION SET ON EVENT", event)
              // const newEvents = new Map(store.getState().events)
              // const newMessages = new Map(newEvents.get(sessionId) || new Map())
              // newMessages.set(event.id, event)
              // newEvents.set(sessionId, newMessages)
              // store.setState({events: newEvents})
              useEventsStore.getState().upsert(sessionId, event.id, event)
              store.setState({sessions: new Map(store.getState().sessions)})
            })
            sessionListeners.set(sessionId, sessionUnsubscribe)
          })
        }
      },
      //storage: storage,
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
          // events: Array.from(state.events.entries()).map((entry) => {
          //   const [sessionId, messages] = entry as [string, Map<string, MessageType>]
          //   return [
          //     sessionId,
          //     Array.from(messages.entries()).map(([messageId, message]) => [
          //       messageId,
          //       message,
          //     ]),
          //   ]
          // }),
        }
      },
      merge: (persistedState: any, currentState: SessionStore) => {
        const newSessions = persistedState.sessions.map(
          ([id, sessionState]: [string, string]) => {
            const session = new Session(subscribe, deserializeSessionState(sessionState))
            return [id, session]
          }
        )
        const newInvites = persistedState.invites.map((entry: [string, string]) => {
          const [id, invite] = entry as [string, string]
          return [id, Invite.deserialize(invite)]
        })
        return {
          ...currentState,
          invites: new Map(newInvites),
          sessions: new Map(newSessions),
          // events: new Map(
          //   persistedState.events.map((entry: [string, [string, MessageType][]]) => {
          //     const [sessionId, messages] = entry
          //     return [
          //       sessionId,
          //       new Map(messages.map(([messageId, message]) => [messageId, message])),
          //     ]
          //   })
          // ),
        }
      },
    }
  )
)

export const useSessionsStore = store
