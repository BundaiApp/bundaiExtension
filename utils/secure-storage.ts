import { SecureStorage } from "@plasmohq/storage/secure"

export const storage = new SecureStorage()
export const storageReady = storage.setPassword(process.env.PLASMO_SECURE_STORAGE_PASSWORD)