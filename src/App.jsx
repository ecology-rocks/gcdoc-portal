// src/App.jsx
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from "firebase/auth";
import { auth } from './firebase';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) return <div className="p-10 text-center">Loading application...</div>;

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {user ? <Dashboard user={user} /> : <Login />}
    </div>
  );
}

export default App;