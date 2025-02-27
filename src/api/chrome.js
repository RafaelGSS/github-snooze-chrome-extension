import {
  ACTION_UPDATE_BADGE_COUNTER,
  SK_BADGE_COUNTER,
  COLOR_SECONDARY,
  ACTION_GET_CURRENT_TAB_URL,
  URL_MATCH
} from '../constants'
import { isValidUrl } from '../url'

/**
 * Sends a message to the background service worker
 * @param {string} action to send to the background service worker
 * @param {object} message an object with the message to send
 * @returns void
 */
export const sendMessage = async (action, message) => {
  return await chrome.runtime.sendMessage({
    action,
    msg: message
  })
}

/**
 * Stores an item to the local storage
 * @param {object} item an object with keys and values to store
 */
export const writeToLocalStorage = async item => {
  await chrome.storage.local.set(item)
}

/**
 * Fetches from the local storage the values related to the keys used as input
 * @param {string[]} keys an array of strings containing the keys to extract from the local storage
 * @returns the required keys from the local storage with the values
 */
export const readFromLocalStorage = async keys => {
  const storage = await chrome.storage.local.get(keys)
  return storage
}

/**
 * Reads everything from the local storage
 * @returns the entire local storage
 */
export const readAllFromLocalStorage = async () => {
  return await chrome.storage.local.get()
}

/**
 * Clears the local storage removing every data present in it.
 */
export const clearLocalStorage = async () => {
  await chrome.storage.local.clear()
}

/**
 * Clears the sync storage removing every data present in it.
 */
export const clearSyncStorage = async () => {
  await chrome.storage.sync.clear()
}

/**
 * Fetches from the sync storage the values related to the keys used as input
 * @param {string[]} keys an array of strings containing the keys to extract from the sync storage
 * @returns the required keys from the lsync storage with the values
 */
export const readFromSyncStorage = async keys => {
  return await chrome.storage.sync.get(keys)
}

/**
 * Stores an item to the sync storage
 * @param {object} obj an object with keys and values to store
 */
export const writeToSyncStorage = async obj => {
  await chrome.storage.sync.set(obj)
}

/**
 * Returns the list of snoozes for that particular user
 * @param {string} userId user id
 * @returns the list of snoozes
 */
export const getSnoozeList = async userId => {
  const storage = await chrome.storage.sync.get()
  if (storage[userId]) {
    return storage[userId].sort((x, y) => x.notifyAt - y.notifyAt)
  }
  return []
}

/**
 * Stores the provided list of snoozes for the specified user
 * @param {string} userId user id
 * @param {object[]} snoozeList list of snooze objects
 * @returns void
 */
export const setSnoozeList = async (userId, snoozeList) => {
  return await chrome.storage.sync.set({ [userId]: snoozeList })
}

/**
 * Adds a snooze to the list and returns the list of snoozes
 * @param {string} userId user id
 * @param {object} snooze object
 * @returns the list of snooze after the insert
 */
export const addSnooze = async (userId, snooze) => {
  let snoozeList = await getSnoozeList(userId)
  if (!snoozeList) {
    snoozeList = []
  }
  snoozeList.push(snooze)

  await setSnoozeList(userId, snoozeList)
  return snoozeList.sort((x, y) => x.notifyAt - y.notifyAt)
}

/**
 * Removes a snooze object and returns the list of snoozes after the removal
 * @param {string} userId user id
 * @param {object} snooze object
 * @returns the list of snoozes after the removal
 */
export const removeSnooze = async (userId, snooze) => {
  const snoozeList = await getSnoozeList(userId)
  const updatedList = snoozeList.filter(s => s.id !== snooze.id)

  await setSnoozeList(userId, updatedList)

  if (snooze.badgeCount) {
    const badgeCounter = await incrementBadgeCounter(-1)
    await sendMessage(ACTION_UPDATE_BADGE_COUNTER, badgeCounter)
  }

  return await getSnoozeList(userId)
}

/**
 * Updates a snooze object and returns the list of snoozes after the update
 * @param {string} userId user id
 * @param {object} snooze object
 * @returns the list of snoozes after the update
 */
 export const updateSnooze = async (userId, wantedSnooze) => {
  const snoozeList = await getSnoozeList(userId)
  const updatedList = snoozeList.map(currentSnooze => {
    return currentSnooze.id === wantedSnooze.id ? wantedSnooze : currentSnooze
  })

  await setSnoozeList(userId, updatedList)

  return await getSnoozeList(userId)
}

/**
 * Checks if the provided URL is already present in the Snooze list.
 * @param {string} userId user id
 * @param {string} url url to snooze
 * @returns true if the url is already present, false otherwise
 */
export const checkUrlAlreadySnoozed = async (userId, url) => {
  const snoozeList = await getSnoozeList(userId)
  const snoozeFound = snoozeList.find(snooze => {
    const snoozeUrl = snooze.url
    if (snoozeUrl.length > url) {
      return snoozeUrl.startsWith(url)
    }
    return url.startsWith(snoozeUrl)
  })

  return snoozeFound !== undefined
}

/**
 * Increments the badge counter value by the specified increment value, default is 1.
 * @param {number} increment default is 1
 * @returns the badge counter incremented value
 */
export const incrementBadgeCounter = async (increment = 1) => {
  let badgeCounter = await getBadgeCounter()
  badgeCounter += increment
  await writeToSyncStorage({ badgeCounter })
  return badgeCounter
}

/**
 * It updates the badge counter UI with the badge counter value retrieved from the sync storage.
 */
export const updateBadgeCounterUI = async () => {
  const badgeCounter = await getBadgeCounter()
  const text = badgeCounter > 0 ? badgeCounter.toString() : ''

  chrome.action.setBadgeBackgroundColor({ color: COLOR_SECONDARY })
  chrome.action.setBadgeText({ text })
}

/**
 * Sends a new browser notification with the specified title and message.
 * @param {string} title notification title
 * @param {string} message notification message
 */
export const sendBrowserNotification = (id, title, message) => {
  chrome.notifications.create(
    id,
    {
      type: 'basic',
      iconUrl: 'images/48.png',
      title,
      message,
      priority: 2,
      buttons: [
        {
          title: 'OK'
        }
      ]
    },
    notificationId => {
      console.log('notification sent successfully: ' + notificationId)
    }
  )
}

/**
 * Retrieves the badge counter value, if does not exist will be created with the specified initial value, otherwise 0
 * @param {number} initialValue default is 0
 * @returns the badge counter value
 */
const getBadgeCounter = async (initialValue = 0) => {
  let { badgeCounter } = await readFromSyncStorage([SK_BADGE_COUNTER])
  if (!badgeCounter) {
    await writeToSyncStorage({ badgeCounter: initialValue })
    return 0
  }
  return badgeCounter
}

export const getCurrentTabUrlBackground = async () => {
  const currWindow = await chrome.windows.getCurrent()
  // `tab` will either be a `tabs.Tab` instance or `undefined`.
  const [tab] = await chrome.tabs.query({
    active: true,
    windowId: currWindow.id
  })

  if (isValidUrl(tab.url, URL_MATCH)) {
    return tab.url
  }

  return undefined
}

export const getCurrentTabUrl = async () => {
  return sendMessage(ACTION_GET_CURRENT_TAB_URL)
}
