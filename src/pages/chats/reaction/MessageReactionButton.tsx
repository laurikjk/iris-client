import {FloatingEmojiPicker} from "@/shared/components/emoji/FloatingEmojiPicker"
import {RiHeartAddLine, RiReplyLine} from "@remixicon/react"
import {NDKEventFromRawEvent} from "@/utils/nostr"
import {Session} from "nostr-double-ratchet/src"
import {usePublicKey} from "@/stores/user"
import {MouseEvent, useState} from "react"
import {localState} from "irisdb/src"
import classNames from "classnames"

type MessageReactionButtonProps = {
  messageId: string
  session: Session
  sessionId: string
  isUser: boolean
  onReply?: () => void
  onSendReaction?: (messageId: string, emoji: string) => Promise<void>
}

type EmojiData = {
  native: string
  [key: string]: unknown
}

const MessageReactionButton = ({
  messageId,
  session,
  sessionId,
  isUser,
  onReply,
  onSendReaction,
}: MessageReactionButtonProps) => {
  const myPubKey = usePublicKey()
  const [showReactionsPicker, setShowReactionsPicker] = useState(false)
  const [pickerPosition, setPickerPosition] = useState<{clientY?: number}>({})

  const handleReactionClick = (e: MouseEvent) => {
    const buttonRect = e.currentTarget.getBoundingClientRect()
    setPickerPosition({clientY: buttonRect.top})
    setShowReactionsPicker(!showReactionsPicker)
  }

  const handleEmojiClick = (emoji: EmojiData) => {
    setShowReactionsPicker(false)
    if (onSendReaction) {
      // Use the provided onSendReaction function if available
      onSendReaction(messageId, emoji.native)
    } else {
      // Fall back to the original implementation for private chats
      const {event} = session.sendEvent({
        kind: 6,
        content: emoji.native,
        tags: [["e", messageId]],
      })
      NDKEventFromRawEvent(event)
        .publish()
        .then(() => {
          console.log("success")
        })
        .catch((e) => console.warn(e))
    }
  }

  return (
    <div className="relative -mb-1">
      <div
        className={classNames("flex items-center", {
          "flex-row-reverse": !isUser,
        })}
      >
        {onReply && (
          <div
            className="p-2 text-base-content/50 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity flex-shrink-0"
            onClick={onReply}
          >
            <RiReplyLine className="w-6 h-6" />
          </div>
        )}
        <div
          className="p-2 text-base-content/50 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity flex-shrink-0"
          onClick={handleReactionClick}
        >
          <RiHeartAddLine className="w-6 h-6" />
        </div>
      </div>

      <FloatingEmojiPicker
        isOpen={showReactionsPicker}
        onClose={() => setShowReactionsPicker(false)}
        onEmojiSelect={handleEmojiClick}
        position={{clientY: pickerPosition.clientY, openRight: isUser}}
      />
    </div>
  )
}

export default MessageReactionButton
