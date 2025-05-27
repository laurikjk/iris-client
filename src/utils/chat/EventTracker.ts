import {MessageType} from "@/pages/chats/message/Message"

// sessionId -> messageId -> message
const events = new Map<string, Map<string, MessageType>>()

export const addEvent = (sessionId: string, event: MessageType) => {
  console.log("addEvent", sessionId, event)
  const sessionEvents = events.get(sessionId) || new Map<string, MessageType>()
  sessionEvents.set(event.id, event)
  events.set(sessionId, sessionEvents)
  storeEvents()
}

export const getEvents = () => events

const storeEvents = () => {
  const serializedEvents = Array.from(events.entries()).map(([sessionId, messages]) => [
    sessionId,
    Array.from(messages.entries()),
  ])
  localStorage.setItem("events", JSON.stringify(serializedEvents))
}

export const loadEvents = () => {
  const serializedEvents = localStorage.getItem("events")
  if (!serializedEvents) return
  const parsedEvents = JSON.parse(serializedEvents)
  parsedEvents.forEach(([sessionId, messages]: [string, [string, MessageType][]]) => {
    const sessionEvents = new Map<string, MessageType>()
    messages.forEach(([messageId, message]) => {
      sessionEvents.set(messageId, message)
    })
    events.set(sessionId, sessionEvents)
    console.log("loaded event", sessionId, sessionEvents)
  })
}
