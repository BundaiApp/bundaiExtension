import React, { useState } from 'react'
import { useMutation } from "@apollo/client"
import FORGET_PASSWORD from "../graphql/mutations/forgetPassword.mutation"
import { storageReady } from "../utils/secure-storage"

function validateEmail(email: string) {
  return String(email)
    .toLowerCase()
    .match(
      /^(([^<>()[\]\\.,;:\s@"]+(.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
    );
}

function ForgotPassword({ onBack, onSuccess }: { onBack?: () => void, onSuccess?: () => void }) {
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [secureReady, setSecureReady] = useState(false)
  const [forgetPassword, { loading }] = useMutation(FORGET_PASSWORD)

  React.useEffect(() => {
    storageReady.then(() => setSecureReady(true))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess(false)

    const trimmedEmail = email.trim()

    if (!trimmedEmail) {
      setError("Please enter your email address")
      return
    }

    if (!validateEmail(trimmedEmail)) {
      setError("Invalid email address")
      return
    }

    if (!secureReady) {
      setError("Secure storage not ready. Please wait.")
      return
    }

    try {
      const { data } = await forgetPassword({ variables: { email: trimmedEmail } })
      
      if (data?.forgetPassword?.errorMessage) {
        setError(data.forgetPassword.errorMessage)
      } else {
        setSuccess(true)
        // Call success callback after a short delay
        setTimeout(() => {
          if (onSuccess) onSuccess()
        }, 3000)
      }
    } catch (err: any) {
      setError(err.message || "Failed to send reset link. Please try again.")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-72 p-4 bg-yellow-400 text-black flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-black border-b-2 pb-1">
        <h1 className="text-xl font-extrabold text-black">Forgot Password?</h1>
      </div>

      {success ? (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          <p className="font-semibold mb-1">Reset link sent!</p>
          <p className="text-sm">
            Check your inbox for instructions on how to reset your password.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-black opacity-80">
            Enter the email you used to sign up and we will send you reset instructions.
          </p>

          <input
            id='email'
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="p-2 rounded border border-black"
            required
            disabled={!secureReady || loading}
          />

          {error && <div className="text-red-700 text-xs">{error}</div>}

          <button 
            type="submit" 
            className="bg-black text-yellow-400 p-2 rounded font-bold disabled:opacity-50" 
            disabled={loading || !secureReady}
          >
            {loading ? "Sending..." : !secureReady ? "Secure storage..." : "Send reset link"}
          </button>
        </>
      )}

      <div className="text-xs text-center mt-2">
        <button 
          type="button" 
          className="underline text-black hover:text-yellow-700" 
          onClick={onBack}
        >
          Back to login
        </button>
      </div>
    </form>
  )
}

export default ForgotPassword
