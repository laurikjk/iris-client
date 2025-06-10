import {useChatSettingsStore} from "@/stores/chatSettings"
import Modal from "@/shared/components/ui/Modal"
import {useState} from "react"

const options = [
  {label: "Never", value: ""},
  {label: "1 hour", value: "3600"},
  {label: "1 day", value: "86400"},
  {label: "1 week", value: "604800"},
]

const ChatSettingsModal = ({
  sessionId,
  onClose,
}: {
  sessionId: string
  onClose: () => void
}) => {
  const current = useChatSettingsStore((s) => s.expiry[sessionId])
  const setExpiry = useChatSettingsStore((s) => s.setExpiry)
  const [value, setValue] = useState(current ? String(current) : "")

  const handleSave = () => {
    setExpiry(sessionId, value ? parseInt(value) : null)
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-4 flex flex-col gap-4 w-64">
        <h3 className="font-bold text-lg">Chat settings</h3>
        <label className="form-control w-full max-w-xs">
          <span className="label-text">Message expiry</span>
          <select
            className="select select-bordered w-full max-w-xs"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            {options.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2 justify-end">
          <button className="btn btn-neutral" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default ChatSettingsModal
