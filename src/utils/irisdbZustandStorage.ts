import {localState} from "irisdb"

export const irisStorage = {
  async getItem(key: string) {
    return new Promise((resolve) => {
      localState.get(key).on((value) => {
        resolve(value)
      })
    })
  },
  async setItem(key: string, value: string) {
    return new Promise((resolve) => {
      localState
        .get(key)
        .put(JSON.parse(value))
        .then(() => {
          resolve(true)
        })
    })
  },
  async removeItem(key: string) {
    return new Promise((resolve) => {
      localState
        .get(key)
        .put(null)
        .then(() => {
          resolve(true)
        })
    })
  },
}
