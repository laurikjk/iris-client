import ChatContainer from "../components/ChatContainer"
import {SortedMap} from "@/utils/SortedMap/SortedMap"
import {comparator} from "../utils/messageGrouping"
import PrivateChatHeader from "./PrivateChatHeader"
import {useSessionsStore} from "@/stores/sessions"
import MessageForm from "../message/MessageForm"
import {MessageType} from "../message/Message"
import {useEffect, useState} from "react"

const Chat = ({id}: {id: string}) => {
  const [messages, setMessages] = useState(
    new SortedMap<string, MessageType>([], comparator)
  )
  const {sessions, events} = useSessionsStore()
  const [haveReply, setHaveReply] = useState(false)
  const [haveSent, setHaveSent] = useState(false)
  const [replyingTo, setReplyingTo] = useState<MessageType | undefined>(undefined)
  const session = sessions.get(id)!

  useEffect(() => {
    if (!(id && session)) {
      return
    }

    const sessionEvents = events.get(id)
    if (!sessionEvents) return

    const newMessages = new SortedMap<string, MessageType>([], comparator)

    sessionEvents.forEach((message, messageId) => {
      if (!haveReply && message.sender !== "user") {
        setHaveReply(true)
      }
      if (!haveSent && message.sender === "user") {
        setHaveSent(true)
      }
      newMessages.set(messageId, message)
    })

    setMessages(newMessages)
  }, [id, session, events])

  useEffect(() => {
    if (!id) return
    // localState.get("sessions").get(id).get("lastSeen").put(Date.now())

    // const handleVisibilityChange = () => {
    //   if (document.visibilityState === "visible") {
    //     localState.get("sessions").get(id).get("lastSeen").put(Date.now())
    //   }
    // }

    // const handleFocus = () => {
    //   localState.get("sessions").get(id).get("lastSeen").put(Date.now())
    // }

    // document.addEventListener("visibilitychange", handleVisibilityChange)
    // window.addEventListener("focus", handleFocus)

    // return () => {
    //   document.removeEventListener("visibilitychange", handleVisibilityChange)
    //   window.removeEventListener("focus", handleFocus)
    // }
  }, [id])

  if (!id || !session) {
    return null
  }

  return (
    <>
      <PrivateChatHeader id={id} messages={messages} />
      <ChatContainer
        messages={messages}
        session={session}
        sessionId={id}
        onReply={setReplyingTo}
      />
      <MessageForm
        session={session}
        id={id}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
      />
    </>
  )
}

export default Chat
