import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // Firestore'u içeri aktar

const firebaseConfig = {
  apiKey: "AIzaSyA4oiPNY-MHaE8fSQ998xbEo1dia7s6ZDE",
  authDomain: "goeu-876f2.firebaseapp.com",
  projectId: "goeu-876f2",
  storageBucket: "goeu-876f2.firebasestorage.app",
  messagingSenderId: "51228696083",
  appId: "1:51228696083:web:c6457c2a75122eb1fa29e6",
  measurementId: "G-9DZVRPSQT9"
};

// Firebase'i başlat
const app = initializeApp(firebaseConfig);

// Veritabanını (db) başlat ve dışarıya aktar
export const db = getFirestore(app);