import { SecureStorage } from "@plasmohq/storage/secure"

export const storage = new SecureStorage()
export const storageReady = storage.setPassword("bundai-secure-key")