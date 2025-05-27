import {
  Session,
  serializeSessionState,
  deserializeSessionState,
} from "nostr-double-ratchet/src"
import {Filter, VerifiedEvent} from "nostr-tools"
import {ndk} from "@/utils/ndk"

const sessions = new Map<string, Session>()
const subscriptions = new Map<string, () => void>()

const nostrSubscribe = (filter: Filter, onEvent: (e: VerifiedEvent) => void) => {
  const sub = ndk().subscribe(filter)
  sub.on("event", (event) => {
    onEvent(event as unknown as VerifiedEvent)
  })
  return () => sub.stop()
}

const listen = () => {
  Array.from(sessions).forEach(([id, session]) => {
    if (subscriptions.has(id)) return
    const unsubscribe = session.onEvent((event) => {
      console.log("session event", event)
    })
    subscriptions.set(id, unsubscribe)
  })
}

export const getSessions = () => {
  return sessions
}

export const addSession = (session: Session, identity?: string) => {
  const sessionId = `${identity}:${session.name}`
  sessions.set(sessionId, session)
  listen()
}

const serializeSessions = () => {
  return Array.from(sessions.entries()).map(([id, session]) => [
    id,
    serializeSessionState(session.state),
  ])
}

const deserializeSessions = (serializedSessions: [string, any][]) => {
  const newSessions = new Map<string, Session>()
  serializedSessions.forEach(([id, serializedSession]) => {
    newSessions.set(
      id,
      new Session(nostrSubscribe, deserializeSessionState(serializedSession))
    )
  })
  return newSessions
}

export const storeSessions = () => {
  localStorage.setItem("sessions", JSON.stringify(serializeSessions()))
}

export const loadSessions = () => {
  const serializedSessions = JSON.parse(localStorage.getItem("sessions") || "[]")
  const newSessions = deserializeSessions(serializedSessions)
  newSessions.forEach((session, id) => {
    sessions.set(id, session)
  })
  listen()
}
