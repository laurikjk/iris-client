import {useEffect, useState} from "react"

export function useIOSKeyboardOffset() {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv || !/iPhone|iPad|iPod/i.test(navigator.userAgent)) return

    const update = () =>
      setOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))

    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    update()

    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
    }
  }, [])

  return offset
}
