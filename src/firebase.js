// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCiVqLEWkC7W02nyfHyRaNDeMSHUjWwFMY",
  authDomain: "gcdocportal.firebaseapp.com",
  projectId: "gcdocportal",
  storageBucket: "gcdocportal.firebasestorage.app",
  messagingSenderId: "376970920620",
  appId: "1:376970920620:web:b4d7727fa5631025531509"
};


const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);