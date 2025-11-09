// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
// import { getAnalytics } from "firebase/analytics";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBR-P2BenFDiJpc_0IjniY-bszEpcNzYPY",
  authDomain: "dnd-master-club.firebaseapp.com",
  projectId: "dnd-master-club",
  storageBucket: "dnd-master-club.firebasestorage.app",
  messagingSenderId: "558692497481",
  appId: "1:558692497481:web:d505c5b7b57754a55f2798",
  measurementId: "G-ZQRS2MDF0W"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firestore 인스턴스를 초기화하고 export합니다.
export const db = getFirestore(app);

// Auth Export
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Firebase Analytics
// const analytics = getAnalytics(app);
