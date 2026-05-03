import { useMutation } from "@apollo/client"
import React, { useState } from "react"

import LOG_IN from "../graphql/mutations/logIn.mutation"
import { storage, storageReady } from "../utils/secure-storage"

function validateEmail(email: string) {
  return String(email)
    .toLowerCase()
    .match(
      /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    )
}

function Login({
  onLogin,
  onShowRegister,
  onShowForgotPassword
}: {
  onLogin?: () => void
  onShowRegister?: () => void
  onShowForgotPassword?: () => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [secureReady, setSecureReady] = useState(false)
  const [logIn, { loading }] = useMutation(LOG_IN)

  React.useEffect(() => {
    storageReady.then(() => setSecureReady(true))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    if (!email) {
      setError("Please set email")
      return
    }
    if (!password) {
      setError("Please set password")
      return
    }
    if (!validateEmail(email)) {
      setError("Invalid Email")
      return
    }
    if (!secureReady) {
      setError("Secure storage not ready. Please wait.")
      return
    }
    try {
      const { data } = await logIn({ variables: { email, password } })
      if (data?.logIn?.errorMessage === null) {
        const user = data.logIn.user
        await storage.set("loggedIn", true)
        await storage.set("token", data.logIn.token)
        await storage.set("userId", user._id)
        await storage.set("email", user.email)
        await storage.set("username", user.name)
        if (onLogin) onLogin()
      } else if (data?.logIn?.errorMessage) {
        setError(data.logIn.errorMessage)
      } else {
        setError("Login failed. Please try again.")
      }
    } catch (err) {
      setError(err.message || "Login failed. Please try again.")
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full p-6 bg-yellow-400 text-black flex flex-col gap-4"
      style={{ maxWidth: "32rem" }}>
      <div className="flex flex-col gap-1 border-black border-b-2 pb-1">
        <h1 className="text-3xl font-extrabold text-black">Bundai Login</h1>
      </div>
      <p className="text-sm font-medium text-black opacity-80">
        Bundai is free for now while we focus on retention and core learning UX.
      </p>
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
      <div className="relative flex items-center">
        <input
          id="password"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="p-3 text-lg rounded-md border-2 border-black w-full"
          style={{ width: "100%", boxSizing: "border-box" }}
          required
          disabled={!secureReady}
        />
      </div>
      {error && <div className="text-red-700 text-sm font-semibold">{error}</div>}
      <button
        type="submit"
        className="bg-black text-white p-3 rounded-md font-bold text-lg"
        style={{ width: "100%", boxSizing: "border-box", color: "#fef08a" }}
        disabled={loading || !secureReady}>
        {loading
          ? "Logging in..."
          : !secureReady
            ? "Secure storage..."
            : "Login"}
      </button>
      <div className="text-lg text-center mt-2">
        <button
          type="button"
          className="auth-link-btn"
          onClick={onShowForgotPassword}>
          Forgot password?
        </button>
      </div>
      <div className="text-lg text-center mt-2">
        Don't have an account?{" "}
        <button
          type="button"
          className="auth-link-btn"
          onClick={onShowRegister}>
          Register
        </button>
      </div>
    </form>
  )
}

export default Login
