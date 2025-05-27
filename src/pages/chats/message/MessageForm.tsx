import {
  FormEvent,
  useState,
  useEffect,
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react"
import {CHAT_MESSAGE_KIND, serializeSessionState, Session} from "nostr-double-ratchet/src"
import {useAutosizeTextarea} from "@/shared/hooks/useAutosizeTextarea"
import UploadButton from "@/shared/components/button/UploadButton"
import EmojiButton from "@/shared/components/emoji/EmojiButton"
import MessageFormReplyPreview from "./MessageFormReplyPreview"
import {isTouchDevice} from "@/shared/utils/isTouchDevice"
import {useSessionsStore} from "@/stores/sessions"
import {NDKEventFromRawEvent} from "@/utils/nostr"
import Icon from "@/shared/components/Icons/Icon"
import {RiAttachment2} from "@remixicon/react"
import EmojiType from "@/types/emoji"
import {localState} from "irisdb/src"
import {MessageType} from "./Message"

interface MessageFormProps {
  session: Session
  id: string
  replyingTo?: MessageType
  setReplyingTo: (message?: MessageType) => void
  onSendMessage?: (content: string) => Promise<void>
  isPublicChat?: boolean
}

const MessageForm = ({
  session,
  id,
  replyingTo,
  setReplyingTo,
  onSendMessage,
  isPublicChat = false,
}: MessageFormProps) => {
  const {sendMessage} = useSessionsStore()
  const [newMessage, setNewMessage] = useState("")
  const textareaRef = useAutosizeTextarea(newMessage)
  const theirPublicKey = id.split(":")[0]

  useEffect(() => {
    if (!isTouchDevice && textareaRef.current) {
      textareaRef.current.focus()
    }

    if (replyingTo && textareaRef.current) {
      textareaRef.current.focus()
    }

    const handleEscKey = (event: Event) => {
      const keyboardEvent = event as unknown as ReactKeyboardEvent
      if (keyboardEvent.key === "Escape" && replyingTo) {
        setReplyingTo(undefined)
      }
    }

    document.addEventListener("keydown", handleEscKey)
    return () => document.removeEventListener("keydown", handleEscKey)
  }, [id, isTouchDevice, replyingTo, setReplyingTo])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const text = newMessage.trim()
    if (!text) return

    // Clear form immediately
    setNewMessage("")
    if (replyingTo) {
      setReplyingTo(undefined)
    }
    //
    if (onSendMessage) {
      onSendMessage(text).catch((error) => {
        console.error("Failed to send message:", error)
      })
      return
    }
    //
    const time = Date.now()
    const tags = [["ms", time.toString()]]
    if (replyingTo) {
      tags.push(["e", replyingTo.id])
    }

    try {
      // const sessionState = localState.get("sessions").get(id)
      // sessionState.get("state").put(serializeSessionState(session.state))
      // sessionState.get("events").get(innerEvent.id).put(message)
      // sessionState.get("latest").put(message)
      // sessionState.get("lastSeen").put(time)
      await sendMessage(id, text, replyingTo?.id)
    } catch (error) {
      console.error("Failed to send message:", error)
    }
  }

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value)
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (isTouchDevice) return

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
    }
  }

  const handleEmojiClick = (emoji: EmojiType) => {
    setNewMessage((prev) => prev + emoji.native)
    textareaRef.current?.focus()
  }

  const handleUpload = (url: string) => {
    setNewMessage((prev) => prev + " " + url)
    textareaRef.current?.focus()
  }

  return (
    <footer className="border-t border-custom fixed md:sticky bottom-0 w-full pb-[env(safe-area-inset-bottom)] bg-base-200">
      {replyingTo && (
        <MessageFormReplyPreview
          replyingTo={replyingTo}
          setReplyingTo={setReplyingTo}
          theirPublicKey={theirPublicKey}
        />
      )}

      <div className="flex gap-2 p-4 relative">
        {isPublicChat && (
          <UploadButton
            onUpload={handleUpload}
            className="btn btn-ghost btn-circle btn-sm md:btn-md"
            text={<RiAttachment2 size={20} />}
          />
        )}
        <form onSubmit={handleSubmit} className="flex-1 flex gap-2 items-center">
          <div className="relative flex-1 flex gap-2 items-center">
            {!isTouchDevice && <EmojiButton onEmojiSelect={handleEmojiClick} />}
            <textarea
              ref={textareaRef}
              value={newMessage}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message"
              className={`flex-1 textarea leading-tight resize-none py-2.5 min-h-[2.5rem] ${
                newMessage.includes("\n") ? "rounded-lg" : "rounded-full"
              }`}
              aria-label="Message input"
              rows={1}
            />
          </div>
          <button
            type="submit"
            className={`btn btn-primary btn-circle btn-sm md:btn-md ${
              isTouchDevice ? "" : "hidden"
            }`}
            aria-label="Send message"
            disabled={!newMessage.trim()}
          >
            <Icon name="arrow-right" className="-rotate-90" />
          </button>
        </form>
      </div>
    </footer>
  )
}

export default MessageForm
