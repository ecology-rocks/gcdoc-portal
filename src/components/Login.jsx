import React, { useState } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  sendPasswordResetEmail // <--- New Import
} from "firebase/auth";
import { auth } from '../firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isResetting, setIsResetting] = useState(false); // <--- New State
  const [error, setError] = useState('');
  const [message, setMessage] = useState(''); // Success messages

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      if (isResetting) {
        // --- RESET PASSWORD LOGIC ---
        await sendPasswordResetEmail(auth, email);
        setMessage("Check your email! We sent you a password reset link.");
        setIsResetting(false); // Go back to login view
      } else if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      // Firebase error codes are ugly (auth/user-not-found), let's clean them up
      let msg = err.message;
      if (msg.includes("user-not-found")) msg = "No account found with this email.";
      if (msg.includes("wrong-password")) msg = "Incorrect password.";
      if (msg.includes("email-already-in-use")) msg = "That email is already registered.";
      setError(msg);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded shadow-md w-full max-w-md">
        <h2 className="text-2xl mb-6 font-bold text-gray-800 text-center">
          {isResetting ? "Reset Password" : (isRegistering ? "Register Member" : "Member Login")}
        </h2>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>}
        {message && <div className="bg-green-50 text-green-600 p-3 rounded mb-4 text-sm">{message}</div>}

        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-600 mb-1">Email Address</label>
          <input
            type="email"
            required
            className="w-full p-2 border rounded focus:border-blue-500 outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {/* Hide Password field if resetting */}
        {!isResetting && (
          <div className="mb-6">
            <div className="flex justify-between">
              <label className="block text-xs font-bold text-gray-600 mb-1">Password</label>
            </div>
            <input
              type="password"
              required
              className="w-full p-2 border rounded focus:border-blue-500 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}

        <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 font-bold transition-colors">
          {isResetting ? "Send Reset Link" : (isRegistering ? "Sign Up" : "Log In")}
        </button>
        
        {/* Navigation Links */}
        <div className="mt-4 text-center space-y-2">
          {!isResetting && (
            <button 
              type="button" 
              onClick={() => setIsResetting(true)}
              className="text-sm text-blue-600 hover:underline block w-full"
            >
              Forgot Password?
            </button>
          )}
          
          <button 
            type="button" 
            onClick={() => {
              setIsRegistering(!isRegistering);
              setIsResetting(false);
              setError('');
              setMessage('');
            }}
            className="text-sm text-gray-500 hover:text-gray-800 hover:underline"
          >
            {isResetting ? "Back to Login" : (isRegistering ? "Already have an account? Log In" : "Need an account? Register")}
          </button>
        </div>
      </form>
    </div>
  );
}