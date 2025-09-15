import React, { useState, useEffect } from 'react'
import { useMutation } from "@apollo/client"
import VERIFY from "../graphql/mutations/verification.mutation"
import RESEND_VERIFICATION from "../graphql/mutations/resendVerification.mutation"
import { storage, storageReady } from "../utils/secure-storage"

function Verification({ 
  onVerified, 
  onBack, 
  userEmail, 
  userId 
}: { 
  onVerified?: () => void, 
  onBack?: () => void,
  userEmail?: string,
  userId?: string
}) {
  const [passCode, setPassCode] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [secureReady, setSecureReady] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [verify, { loading: verifyLoading }] = useMutation(VERIFY)
  const [resendVerification, { loading: resendLoading }] = useMutation(RESEND_VERIFICATION)

  React.useEffect(() => {
    storageReady.then(() => setSecureReady(true))
  }, [])

  // Countdown for resend button
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (!passCode) {
      setError("Please enter the verification code")
      return
    }

    if (passCode.length !== 6) {
      setError("Verification code must be 6 digits")
      return
    }

    if (!secureReady) {
      setError("Secure storage not ready. Please wait.")
      return
    }

    if (!userId) {
      setError("User ID not found. Please try signing up again.")
      return
    }

    try {
      const { data,errors } = await verify({ 
        variables: { 
          passCode: passCode, 
          userId 
        } 
      })
console.log({errors})
      if (data?.verify?.errorMessage === null) {
        const user = data.verify.user
        // Update user data in storage with verified status
        await storage.set("loggedIn", true)
        await storage.set("token", data.verify.token)
        await storage.set("userId", user._id)
        await storage.set("email", user.email)
        await storage.set("username", user.name)
        await storage.set("isVerified", true)
        
        setSuccess("Email verified successfully!")
        
        // Call onVerified after a brief delay to show success message
        setTimeout(() => {
          if (onVerified) onVerified()
        }, 1500)
        
      } else if (data?.verify?.errorMessage) {
        setError(data.verify.errorMessage)
      } else {
        setError("Verification failed. Please try again.")
      }
    } catch (err: any) {
      setError(err.message || "Verification failed. Please try again.")
    }
  }

  const handleResend = async () => {
    if (!userId || resendCooldown > 0) return

    setError("")
    setSuccess("")

    try {
      const { data } = await resendVerification({ 
        variables: { userId } 
      })

      if (data?.resendVerification?.errorMessage === null) {
        setSuccess("Verification code sent to your email!")
        setResendCooldown(60) // 60 second cooldown
      } else if (data?.resendVerification?.errorMessage) {
        setError(data.resendVerification.errorMessage)
      } else {
        setError("Failed to resend verification code.")
      }
    } catch (err: any) {
      setError(err.message || "Failed to resend verification code.")
    }
  }

  const handlePassCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '') // Only allow digits
    if (value.length <= 6) {
      setPassCode(value)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-72 p-4 bg-yellow-400 text-black flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-1 border-black border-b-2 pb-1">
        <h1 className="text-xl font-extrabold text-black">Verify Email</h1>
        <p className="text-xs text-black opacity-80">
          Check your inbox for the verification code
        </p>
      </div>

      {/* Email Info */}
      <div className="bg-white bg-opacity-30 p-3 rounded border border-black border-opacity-20">
        <p className="text-xs text-black opacity-80 mb-1">Verification code sent to:</p>
        <p className="text-sm font-semibold text-black break-all">
          {userEmail || "your email"}
        </p>
      </div>

      {/* Verification Code Input */}
      <div className="flex flex-col gap-2">
        <label htmlFor="passCode" className="text-sm font-semibold text-black">
          Enter 6-digit verification code:
        </label>
        <input
          id="passCode"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="123456"
          value={passCode}
          onChange={handlePassCodeChange}
          className="p-3 text-center text-2xl font-mono font-bold rounded border border-black tracking-widest"
          maxLength={6}
          required
          disabled={!secureReady || verifyLoading}
          autoComplete="one-time-code"
        />
        <p className="text-xs text-black opacity-60 text-center">
          Enter the 6-digit code from your email
        </p>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-100 border border-red-400 p-2 rounded">
          <p className="text-red-700 text-xs">{error}</p>
        </div>
      )}
      
      {success && (
        <div className="bg-green-100 border border-green-400 p-2 rounded">
          <p className="text-green-700 text-xs">{success}</p>
        </div>
      )}

      {/* Verify Button */}
      <button 
        type="submit" 
        className="bg-black text-yellow-400 p-3 rounded font-bold text-lg disabled:bg-gray-600 disabled:cursor-not-allowed" 
        disabled={verifyLoading || !secureReady || passCode.length !== 6}
      >
        {verifyLoading ? "Verifying..." : !secureReady ? "Loading..." : "Verify Email"}
      </button>

      {/* Resend Section */}
      <div className="text-center">
        <p className="text-xs text-black opacity-80 mb-2">
          Didn't receive the code?
        </p>
        <button
          type="button"
          onClick={handleResend}
          className="text-sm font-semibold text-black underline hover:text-yellow-800 disabled:text-gray-500 disabled:no-underline disabled:cursor-not-allowed"
          disabled={resendLoading || resendCooldown > 0 || !userId}
        >
          {resendLoading 
            ? "Sending..." 
            : resendCooldown > 0 
              ? `Resend in ${resendCooldown}s`
              : "Resend Code"
          }
        </button>
      </div>

      {/* Back Button */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-black opacity-70 hover:opacity-100 underline text-center mt-2"
        >
          ← Back to Registration
        </button>
      )}

      {/* Help Text */}
      <div className="bg-white bg-opacity-20 p-3 rounded text-xs text-black opacity-80">
        <p className="font-semibold mb-1">Tips:</p>
        <ul className="space-y-1">
          <li>• Check your spam/junk folder</li>
          <li>• Code expires in 10 minutes</li>
          <li>• Make sure you entered the correct email</li>
        </ul>
      </div>
    </form>
  )
}

export default Verification