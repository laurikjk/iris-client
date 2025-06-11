import type {EmojiMartData} from "@emoji-mart/data"
import {NDKEvent} from "@nostr-dev-kit/ndk"
import {useEffect, useState} from "react"
import ProxyImg from "../../ProxyImg"

// cache emoji data to avoid repeated imports
let emojiData: EmojiMartData | null = null

const getNativeEmoji = (shortcode: string): string | undefined => {
  if (!emojiData) return undefined
  const base = (emojiData.aliases as Record<string, string>)[shortcode] || shortcode
  const emoji = (emojiData.emojis as Record<string, {skins: {native: string}[]}>)[base]
  return emoji?.skins?.[0]?.native
}

interface CustomEmojiProps {
  match: string
  event?: NDKEvent
}

export const CustomEmojiComponent = ({match, event}: CustomEmojiProps) => {
  const [imgFailed, setImgFailed] = useState(false)
  const [nativeEmoji, setNativeEmoji] = useState<string>()

  useEffect(() => {
    if (emojiData) {
      setNativeEmoji(getNativeEmoji(match))
      return
    }
    import("@emoji-mart/data")
      .then((m) => {
        emojiData = m.default as EmojiMartData
        setNativeEmoji(getNativeEmoji(match))
      })
      .catch(() => {})
  }, [match])

  // The match is already the shortcode from the capture group
  const shortcode = match

  // Limit shortcode length to prevent abuse
  if (shortcode.length > 50) {
    return <>{`:${shortcode}:`}</>
  }

  // Check if the event provides a custom emoji for this shortcode
  const emojiTag = event?.tags.find((tag) => tag[0] === "emoji" && tag[1] === shortcode)

  if (emojiTag && emojiTag[2] && !imgFailed) {
    return (
      <ProxyImg
        width={24}
        src={emojiTag[2]}
        alt={`:${shortcode}:`}
        className="inline-block align-middle h-[1.2em] w-[1.2em] object-contain"
        onError={() => setImgFailed(true)}
      />
    )
  }

  // Fallback to built-in emoji by shortcode
  if (nativeEmoji) {
    return <>{nativeEmoji}</>
  }

  return <>{`:${shortcode}:`}</>
}
