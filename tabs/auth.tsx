// New tabs/auth.tsx - Authentication page for tabs
import React, { useState, useEffect } from 'react'
import { ApolloProvider } from "@apollo/client"
import { SecureStorage } from "@plasmohq/storage/secure"
import client from "~graphql"
import PageLayout from '~components/PageLayout'
import Login from '../popup/login'
import Register from '../popup/register'
import Verification from '../popup/verification'

function AuthPage() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [secureReady, setSecureReady] = useState(false)
  const [secureStorage] = useState(() => new SecureStorage())
  const [showRegister, setShowRegister] = useState(false)
  const [showVerification, setShowVerification] = useState(false)
  const [verificationData, setVerificationData] = useState({ userId: '', email: '' })
  const [userInfo, setUserInfo] = useState({ username: '', email: '' })

  useEffect(() => {
    secureStorage
      .setPassword("bundai-secure-key")
      .then(() => setSecureReady(true))
  }, [secureStorage])

  useEffect(() => {
    if (!secureReady) return
    
    const checkAuth = async () => {
      const isLoggedIn = await secureStorage.get("loggedIn")
      if (typeof isLoggedIn === "boolean" && isLoggedIn) {
        // Load user info
        const username = await secureStorage.get("username") || ''
        const email = await secureStorage.get("email") || ''
        setUserInfo({ username, email })
        setLoggedIn(true)
      } else {
        setLoggedIn(false)
      }
    }
    
    checkAuth()
  }, [secureReady, secureStorage])

  const handleLogin = async () => {
    // Reload user info after login
    const username = await secureStorage.get("username") || ''
    const email = await secureStorage.get("email") || ''
    setUserInfo({ username, email })
    setLoggedIn(true)
    setShowRegister(false)
  }

  const handleLogout = async () => {
    await secureStorage.set("loggedIn", false)
    await secureStorage.remove("token")
    await secureStorage.remove("userId")
    await secureStorage.remove("email")
    await secureStorage.remove("username")
    await secureStorage.remove("isVerified")
    setLoggedIn(false)
    setUserInfo({ username: '', email: '' })
  }

  const handleShowRegister = () => setShowRegister(true)
  const handleShowLogin = () => setShowRegister(false)

  const handleRegisterSuccess = (data) => {
    setVerificationData({
      userId: data.user._id,
      email: data.user.email
    })
    setShowVerification(true)
  }

  const handleVerificationSuccess = async () => {
    // Reload user info after verification
    const username = await secureStorage.get("username") || ''
    const email = await secureStorage.get("email") || ''
    setUserInfo({ username, email })
    setLoggedIn(true)
    setShowVerification(false)
    setShowRegister(false)
  }

  const handleBackFromVerification = () => {
    setShowVerification(false)
    setShowRegister(true)
  }

  if (!secureReady || loggedIn === null) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-screen bg-yellow-400">
          <div className="w-72 p-4 bg-white rounded-lg shadow-lg">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto"></div>
            <p className="text-center mt-4 text-black font-medium">Loading...</p>
          </div>
        </div>
      </PageLayout>
    )
  }

  if (loggedIn) {
    return (
      <PageLayout>
        <div className="min-h-screen bg-yellow-400 p-8">
          <div className="max-w-2xl mx-auto">
            {/* Header */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h1 className="text-3xl font-extrabold text-black mb-2">Bundai Account</h1>
              <p className="text-black opacity-80">Manage your Japanese learning extension</p>
            </div>

            {/* User Profile Card */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-black mb-4">Profile Information</h2>
              
              <div className="space-y-3">
                <div className="flex items-center p-3 bg-yellow-50 rounded border">
                  <div className="flex-shrink-0 w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold text-black">
                      {userInfo.username ? userInfo.username.charAt(0).toUpperCase() : 'U'}
                    </span>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm text-gray-600">Username</p>
                    <p className="font-semibold text-black">{userInfo.username || 'Not available'}</p>
                  </div>
                </div>

                <div className="flex items-center p-3 bg-yellow-50 rounded border">
                  <div className="flex-shrink-0 w-12 h-12 bg-gray-400 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="font-semibold text-black">{userInfo.email || 'Not available'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Extension Status */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-black mb-4">Extension Status</h2>
              <div className="flex items-center p-4 bg-green-50 rounded border border-green-200">
                <div className="flex-shrink-0">
                  <svg className="w-8 h-8 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="font-semibold text-green-800">Logged In Successfully</p>
                  <p className="text-sm text-green-600">Your extension is ready to use on YouTube videos</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold text-black mb-4">Actions</h2>
              <div className="space-y-3">
                <button
                  onClick={() => window.close()}
                  className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-bold py-3 px-6 rounded transition-colors">
                  Close Tab
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded transition-colors">
                  Logout
                </button>
              </div>
            </div>

            {/* Usage Instructions */}
            <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
              <h2 className="text-xl font-bold text-black mb-4">How to Use</h2>
              <div className="space-y-3 text-sm text-gray-700">
                <div className="flex items-start">
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-yellow-400 text-black rounded-full text-xs font-bold mr-3 mt-0.5">1</span>
                  <p>Navigate to any YouTube video</p>
                </div>
                <div className="flex items-start">
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-yellow-400 text-black rounded-full text-xs font-bold mr-3 mt-0.5">2</span>
                  <p>Click the Bundai extension icon in your browser toolbar</p>
                </div>
                <div className="flex items-start">
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-yellow-400 text-black rounded-full text-xs font-bold mr-3 mt-0.5">3</span>
                  <p>Make sure the extension is enabled and fetch subtitles for Japanese learning</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </PageLayout>
    )
  }

  if (showVerification) {
    return (
      <PageLayout>
        <div className="min-h-screen bg-yellow-400 flex items-center justify-center p-8">
          <Verification
            onVerified={handleVerificationSuccess}
            onBack={handleBackFromVerification}
            userEmail={verificationData.email}
            userId={verificationData.userId}
          />
        </div>
      </PageLayout>
    )
  }

  if (showRegister) {
    return (
      <PageLayout>
        <div className="min-h-screen bg-yellow-400 flex items-center justify-center p-8">
          <Register 
            onRegister={handleRegisterSuccess}
            onShowLogin={handleShowLogin} 
          />
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <div className="min-h-screen bg-yellow-400 flex items-center justify-center p-8">
        <Login 
          onLogin={handleLogin} 
          onShowRegister={handleShowRegister} 
        />
      </div>
    </PageLayout>
  )
}

const AuthApp = () => (
  <ApolloProvider client={client}>
    <AuthPage />
  </ApolloProvider>
)

export default AuthApp