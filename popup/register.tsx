import React, { useState } from "react"
import { useMutation } from "@apollo/client"

import SIGN_UP from "../graphql/mutations/signUp.mutation"
import { storage, storageReady } from "../utils/secure-storage"

function validateEmail(email: string) {
  return String(email)
    .toLowerCase()
    .match(
      /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    )
}

function Register({
  onRegister,
  onShowLogin
}: {
  onRegister?: () => void
  onShowLogin?: () => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [error, setError] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [secureReady, setSecureReady] = useState(false)
  const [signUp, { loading }] = useMutation(SIGN_UP)

  React.useEffect(() => {
    storageReady.then(() => setSecureReady(true))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!email) {
      setError("Please set email")
      return
    }
    if (!validateEmail(email)) {
      setError("Invalid Email")
      return
    }
    if (!password) {
      setError("Please set password")
      return
    }
    if (!secureReady) {
      setError("Secure storage not ready. Please wait.")
      return
    }

    try {
      const trimmedUsername = username.trim()
      const variables = trimmedUsername
        ? { email, password, username: trimmedUsername }
        : { email, password }
      const { data } = await signUp({ variables })
      if (data?.signUp?.errorMessage === null && data?.signUp?.token && data?.signUp?.user) {
        const user = data.signUp.user
        await storage.set("loggedIn", true)
        await storage.set("token", data.signUp.token)
        await storage.set("userId", user._id)
        await storage.set("email", user.email)
        await storage.set("username", user.name)
        if (onRegister) onRegister()
      } else if (data?.signUp?.errorMessage) {
        setError(data.signUp.errorMessage)
      } else {
        setError("Signup failed. Please try again.")
      }
    } catch (err: any) {
      setError(err.message || "Signup failed. Please try again.")
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full p-6 bg-yellow-400 text-black flex flex-col gap-4"
      style={{ maxWidth: "32rem" }}>
      <div className="flex flex-col gap-1 border-black border-b-2 pb-1">
        <h1 className="text-3xl font-extrabold text-black">Bundai Signup</h1>
      </div>
      <input
        id="username"
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="p-3 text-lg rounded-md border-2 border-black w-full"
        style={{ width: "100%", boxSizing: "border-box" }}
        disabled={!secureReady}
      />
      <input
        id="email"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="p-3 text-lg rounded-md border-2 border-black w-full"
        style={{ width: "100%", boxSizing: "border-box" }}
        required
        disabled={!secureReady}
      />
      <div className="relative flex items-center w-full" style={{ width: "100%" }}>
        <input
          id="password"
          type={showPassword ? "text" : "password"}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="p-3 text-lg rounded-md border-2 border-black w-full pr-10"
          style={{ width: "100%", boxSizing: "border-box" }}
          required
          disabled={!secureReady}
        />
        <button
          type="button"
          className="absolute cursor-pointer text-black opacity-70"
          style={{
            background: "transparent",
            border: "none",
            right: "0.75rem",
            top: "50%",
            transform: "translateY(-50%)",
            width: "2rem",
            height: "2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            lineHeight: 0
          }}
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? "Hide password" : "Show password"}>
          {showPassword ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.477 10.477a3 3 0 004.243 4.243" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.88 4.24A9.953 9.953 0 0112 4c4.478 0 8.268 2.943 9.542 7a9.969 9.969 0 01-4.043 5.135M6.228 6.228A9.956 9.956 0 002.458 12a9.968 9.968 0 005.142 6.131"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7S3.732 16.057 2.458 12z"
              />
            </svg>
          )}
        </button>
      </div>
      {error && <div className="text-red-700 text-sm font-semibold">{error}</div>}
      <button
        type="submit"
        className="bg-black text-white p-3 rounded-md font-bold text-lg"
        style={{ color: "#fef08a", width: "100%", boxSizing: "border-box" }}
        disabled={loading || !secureReady}>
        {loading ? "Signing up..." : !secureReady ? "Secure storage..." : "Sign Up"}
      </button>
      {onShowLogin && (
        <div className="text-lg text-center mt-2">
          Already have an account?{" "}
          <button type="button" className="auth-link-btn" onClick={onShowLogin}>
            Login
          </button>
        </div>
      )}
    </form>
  )
}

export default Register
