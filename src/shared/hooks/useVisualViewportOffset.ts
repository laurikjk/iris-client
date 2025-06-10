import {useEffect, useState} from "react"

export function useVisualViewportOffset() {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const updateOffset = () => {
      const bottom = window.innerHeight - viewport.height - viewport.offsetTop
      setOffset(bottom > 0 ? bottom : 0)
    }

    updateOffset()
    viewport.addEventListener("resize", updateOffset)
    viewport.addEventListener("scroll", updateOffset)
    return () => {
      viewport.removeEventListener("resize", updateOffset)
      viewport.removeEventListener("scroll", updateOffset)
    }
  }, [])

  return offset
}
