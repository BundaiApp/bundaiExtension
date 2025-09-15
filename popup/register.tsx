import React, { useState } from 'react'
import { useMutation } from "@apollo/client"
import SIGN_UP from "../graphql/mutations/signUp.mutation"
import { storage, storageReady } from "../utils/secure-storage"

function validateEmail(email: string) {
  return String(email)
    .toLowerCase()
    .match(
      /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
    );
}

function Register({ onRegister, onShowLogin }: { onRegister?: (data?: any) => void, onShowLogin?: () => void }) {
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
    if (!username) {
      setError("Please set username")
      return
    }
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
      const { data } = await signUp({ variables: { email, password, username } })
      if (data?.signUp?.errorMessage === null) {
        // Don't set loggedIn=true immediately, pass data for verification
        if (onRegister) onRegister(data.signUp)
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
    <form onSubmit={handleSubmit} className="w-72 p-4 bg-yellow-400 text-black flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-black border-b-2 pb-1">
        <h1 className="text-xl font-extrabold text-black">Bundai Signup</h1>
      </div>
      <input
        id='username'
        type="text"
        placeholder="Username"
        value={username}
        onChange={e => setUsername(e.target.value)}
        className="p-2 rounded border border-black"
        required
        disabled={!secureReady}
      />
      <input
        id='email'
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="p-2 rounded border border-black"
        required
        disabled={!secureReady}
      />
      <div className="relative flex items-center">
        <input
          id='password'
          type={showPassword ? "text" : "password"}
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="p-2 rounded border border-black w-full pr-10"
          required
          disabled={!secureReady}
        />
        <button
          type="button"
          tabIndex={-1}
          className="absolute right-2 bg-transparent border-none cursor-pointer text-black opacity-70 hover:opacity-100"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-5.523 0-10-4.477-10-10 0-1.657.403-3.221 1.125-4.575m1.664-2.664A9.956 9.956 0 0112 3c5.523 0 10 4.477 10 10 0 1.657-.403 3.221 1.125-4.575m-1.664 2.664A9.956 9.956 0 0112 21c-5.523 0-10-4.477-10-10 0-1.657.403-3.221 1.125-4.575m1.664-2.664L21 21" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm-9.197 4.197A9.956 9.956 0 0112 3c5.523 0 10 4.477 10 10 0-1.657-.403 3.221-1.125 4.575m-1.664 2.664A9.956 9.956 0 0112 21c-5.523 0-10-4.477-10-10 0-1.657.403-3.221 1.125-4.575m1.664-2.664L21 21" /></svg>
          )}
        </button>
      </div>
      {error && <div className="text-red-700 text-xs">{error}</div>}
      <button type="submit" className="bg-black text-yellow-400 p-2 rounded font-bold" disabled={loading || !secureReady}>
        {loading ? "Signing up..." : !secureReady ? "Secure storage..." : "Sign Up"}
      </button>
      {onShowLogin && (
        <div className="text-xs text-center mt-2">
          Already have an account?{' '}
          <button type="button" className="underline text-black hover:text-yellow-700" onClick={onShowLogin}>
            Login
          </button>
        </div>
      )}
    </form>
  )
}

export default Register