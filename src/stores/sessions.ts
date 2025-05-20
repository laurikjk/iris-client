// import {irisStorage} from "@/utils/irisdbZustandStorage"
import {
  Invite,
  Session,
  serializeSessionState,
  deserializeSessionState,
} from "nostr-double-ratchet/src"
import {persist, PersistStorage} from "zustand/middleware"
import {NDKEventFromRawEvent} from "@/utils/nostr"
import {hexToBytes} from "@noble/hashes/utils"
import {VerifiedEvent} from "nostr-tools"
import {localState} from "irisdb/src"
import {ndk} from "@/utils/ndk"
import {create} from "zustand"

interface SessionsState {
  sessions: Record<string, Session>
}

interface SessionsActions {
  acceptInvite: (
    url: string,
    pubKey: string,
    privKey?: string
  ) => Promise<{sessionId: string; session: Session}>
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
      acceptInvite: async (url: string, pubKey: string, privKey?: string) => {
        const {sessionId, session} = await inviteToSession(url, pubKey, privKey)
        set((state) => ({
          sessions: {...state.sessions, [sessionId]: session},
        }))
        return {sessionId, session}
      },
    }),
    {
      name: "sessions",
      version: 1,
      migrate: (persistedState: any) => {
        if (persistedState) {
          return persistedState
        }
        localState.get("sessions").on((sessions) => {})
      },
    }
  )
)
