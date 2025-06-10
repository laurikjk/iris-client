import {FloatingEmojiPicker} from "@/shared/components/emoji/FloatingEmojiPicker"
import {RiHeartAddLine, RiReplyLine} from "@remixicon/react"
import {MouseEvent, useState} from "react"
import classNames from "classnames"

type MessageReactionButtonProps = {
  messageId: string
  isUser: boolean
  onReply?: () => void
  onSendReaction: (messageId: string, emoji: string) => Promise<void>
}

type EmojiData = {
  native: string
  [key: string]: unknown
}

const MessageReactionButton = ({
  messageId,
  isUser,
  onReply,
  onSendReaction,
}: MessageReactionButtonProps) => {
  const [showReactionsPicker, setShowReactionsPicker] = useState(false)
  const [pickerPosition, setPickerPosition] = useState<{clientY?: number}>({})

  const handleReactionClick = (e: MouseEvent) => {
    const buttonRect = e.currentTarget.getBoundingClientRect()
    setPickerPosition({clientY: buttonRect.top})
    setShowReactionsPicker(!showReactionsPicker)
  }

  const handleEmojiClick = (emoji: EmojiData) => {
    setShowReactionsPicker(false)
    onSendReaction(messageId, emoji.native)
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
