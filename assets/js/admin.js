import { app, db } from './firebase-client.js';
import { getAuth, setPersistence, browserSessionPersistence, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';
import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';
import { createNewsRepository } from './noticias-repository.js';
import { mountAdmin } from './admin-controller.js';

const auth = getAuth(app);
await setPersistence(auth, browserSessionPersistence);
mountAdmin({
  session: {
    listen: callback => onAuthStateChanged(auth, callback),
    login: (email, password) => signInWithEmailAndPassword(auth, email, password),
    logout: () => signOut(auth),
    reset: email => sendPasswordResetEmail(auth, email)
  },
  repositoryForUser: uid => createNewsRepository(db, uid),
  observeProfile: (uid, next, error) => onSnapshot(doc(db, 'users', uid), snapshot => next(snapshot.exists() ? snapshot.data() : null), error)
});
