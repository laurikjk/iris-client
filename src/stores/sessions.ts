import {Invite, Session} from "nostr-double-ratchet/src"
import {NDKEventFromRawEvent} from "@/utils/nostr"
import {hexToBytes} from "@noble/hashes/utils"
import {persist} from "zustand/middleware"
import {VerifiedEvent} from "nostr-tools"
import {ndk} from "@/utils/ndk"
import {create} from "zustand"

interface SessionsState {
  sessions: Record<string, Session>
}

interface SessionsActions {
  acceptInvite: (url: string, privKey: string, pubKey: string) => void
}

type SessionsStore = SessionsState & SessionsActions

const makeSessionId = (inviter: string, name: string) => {
  return `${inviter}:${name}`
}

const inviteToSession = async (
  url: string,
  privKey: string,
  pubKey: string
): Promise<{sessionId: string; session: Session}> => {
  const invite = Invite.fromUrl(url)
  const encrypt = hexToBytes(privKey)
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
      acceptInvite: async (url: string, privKey: string, pubKey: string) => {
        const {sessionId, session} = await inviteToSession(url, privKey, pubKey)
        set((state) => ({
          sessions: {...state.sessions, [sessionId]: session},
        }))
      },
    }),
    {
      name: "sessions",
    }
  )
)
