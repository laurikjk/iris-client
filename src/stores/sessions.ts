// import {irisStorage} from "@/utils/irisdbZustandStorage"
import {Invite, Session, Rumor} from "nostr-double-ratchet/src"
import {NDKEventFromRawEvent} from "@/utils/nostr"
import {hexToBytes} from "@noble/hashes/utils"
import {persist} from "zustand/middleware"
import {VerifiedEvent} from "nostr-tools"
import {ndk} from "@/utils/ndk"
import {create} from "zustand"

interface SessionsState {
  sessions: Record<string, Session>
  messages: Record<string, Rumor[]>
}

interface SessionsActions {
  acceptInvite: (
    url: string,
    pubKey: string,
    privKey?: string
  ) => Promise<{sessionId: string; session: Session}>
  subscribeToSession: (sessionId: string, session: Session) => void
}

type SessionsStore = SessionsState & SessionsActions

const makeSessionId = (inviter: string, name: string) => {
  return `${inviter}:${name}`
}

const inviteToSession = async (
  url: string,
  pubKey: string,
  privKey?: string
): Promise<{sessionId: string; session: Session}> => {
  const invite = Invite.fromUrl(url)
  const encrypt = privKey
    ? hexToBytes(privKey)
    : async (plaintext: string, pubkey: string) => {
        if (window.nostr?.nip44) {
          return window.nostr.nip44.encrypt(plaintext, pubkey)
        }
        throw new Error("No nostr extension or private key")
      }
  const {session, event} = await invite.accept(
    (filter, onEvent) => {
      const sub = ndk().subscribe(filter)
      sub.on("event", (e) => onEvent(e as unknown as VerifiedEvent))
      return () => sub.stop()
    },
    pubKey,
    encrypt
  )
  const e = NDKEventFromRawEvent(event)
  await e
    .publish()
    .then((res) => console.log("published", res))
    .catch((e) => console.warn("Error publishing event:", e))

  const sessionId = makeSessionId(invite.inviter, session.name)

  return {
    sessionId,
    session,
  }
}

export const useSessionsStore = create<SessionsStore>()(
  persist(
    (set, get) => ({
      sessions: {},
      messages: {},
      acceptInvite: async (url: string, pubKey: string, privKey?: string) => {
        const {sessionId, session} = await inviteToSession(url, pubKey, privKey)
        set((state) => ({
          sessions: {...state.sessions, [sessionId]: session},
        }))
        get().subscribeToSession(sessionId, session)
        return {sessionId, session}
      },
      subscribeToSession: (sessionId: string, session: Session) => {
        session.onEvent((event: Rumor) => {
          set((state) => ({
            messages: {
              ...state.messages,
              [sessionId]: [...(state.messages[sessionId] || []), event],
            },
          }))
        })
      },
    }),
    {
      name: "sessions",
      version: 1,
      migrate: (persistedState: any) => {
        if (persistedState) {
          return {
            ...persistedState,
            messages: persistedState.messages || {},
          }
        }
        return {sessions: {}, messages: {}}
      },
    }
  )
)

// Set up automatic subscription for all sessions
const subscribedSessions = new Set<string>()
useSessionsStore.subscribe((state) => {
  Object.entries(state.sessions).forEach(([sessionId, session]) => {
    if (!subscribedSessions.has(sessionId)) {
      subscribedSessions.add(sessionId)
      useSessionsStore.getState().subscribeToSession(sessionId, session)
    }
  })
})
