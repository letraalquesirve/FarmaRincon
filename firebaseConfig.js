import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDVI2gA-Q_leXM74lbCErJneV3h-Xs_V5k",
  authDomain: "farmacia-iglesia.firebaseapp.com",
  projectId: "farmacia-iglesia",
  storageBucket: "farmacia-iglesia.firebasestorage.app",
  messagingSenderId: "892807551500",
  appId: "1:892807551500:web:935b4cc0bcf1dc97d1ec29"
};

const app = initializeApp(firebaseConfig);

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
  })
});

export { db };