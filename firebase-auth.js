// firebase-auth.js - COMPLETE FIXED VERSION
class FirebaseAuthSystem {
    constructor() {
        this.auth = window.firebaseServices?.auth;
        this.db = window.firebaseServices?.db;
        this.currentUser = null;
        this.userProfile = null;
        this.autoLoginAttempted = false;
        
        if (!this.auth) {
            console.error("❌ Firebase auth not initialized!");
            return;
        }
        
        console.log("🔐 Firebase Auth System initialized");
        
        // Listen for auth state changes
        this.auth.onAuthStateChanged(async (user) => {
            this.currentUser = user;
            
            if (user) {
                console.log("👤 User logged in:", user.email || user.uid);
                this.userProfile = {
                    email: user.email,
                    displayName: user.displayName || user.email?.split('@')[0] || 'User',
                    uid: user.uid,
                    isAnonymous: user.isAnonymous
                };
                
                // Save user info to localStorage
                localStorage.setItem('firebaseUser', JSON.stringify(this.userProfile));
                
                // Initialize user data in Firestore
                await this.initializeUserData(user);
                
                // Show organization modal if no organization selected
                const selectedOrg = localStorage.getItem('selectedOrganization');
                if (!selectedOrg) {
                    setTimeout(() => {
                        const orgModal = document.getElementById('orgModal');
                        if (orgModal) {
                            orgModal.classList.add('show');
                            document.body.classList.add('modal-open');
                        }
                    }, 500);
                }
                
                // Start auto-sync
                this.startAutoSync();
                
                // Show login success notification
                this.showNotification(`Welcome ${this.userProfile.displayName}!`, 'success');
                
            } else {
                console.log("👤 User logged out");
                this.userProfile = null;
                localStorage.removeItem('firebaseUser');
                
                // Try auto-login as anonymous if not already attempted
                if (!this.autoLoginAttempted) {
                    this.autoLoginAttempted = true;
                    
                    // Try anonymous login after 2 seconds
                    setTimeout(() => {
                        this.tryAnonymousLogin();
                    }, 2000);
                } else {
                    // Show login suggestion
                    this.showLoginSuggestion();
                }
            }
            
            // Dispatch auth state change event
            window.dispatchEvent(new CustomEvent('authStateChanged', {
                detail: { 
                    user: user, 
                    isLoggedIn: !!user,
                    profile: this.userProfile 
                }
            }));
        });
        
        // Check for saved user on startup
        this.checkSavedUser();
    }
    
    // Check for saved user in localStorage
    checkSavedUser() {
        try {
            const savedUser = localStorage.getItem('firebaseUser');
            if (savedUser) {
                const userData = JSON.parse(savedUser);
                console.log("📱 Found saved user:", userData.email || userData.uid);
            }
        } catch (e) {
            console.log("📱 No valid saved user found");
        }
    }
    
    // Try anonymous login
    async tryAnonymousLogin() {
        try {
            // Check if anonymous auth is enabled
            const userCredential = await this.auth.signInAnonymously();
            console.log("✅ Anonymous login successful");
            
            // Update user profile
            const user = userCredential.user;
            this.userProfile = {
                uid: user.uid,
                displayName: 'Guest User',
                isAnonymous: true
            };
            
            localStorage.setItem('firebaseUser', JSON.stringify(this.userProfile));
            
            // Show notification
            this.showNotification("Logged in as guest. Some features may be limited.", 'info');
            
            return { success: true, user: user };
            
        } catch (error) {
            console.error("❌ Anonymous login error:", error.message);
            
            // If anonymous auth is disabled, show login suggestion
            if (error.code === 'auth/admin-restricted-operation') {
                console.log("ℹ️ Anonymous auth is disabled. Using local storage only.");
                this.showLoginSuggestion();
            }
            
            return { success: false, error: this.getErrorMessage(error) };
        }
    }
    
    // Show login suggestion
    showLoginSuggestion() {
        // Check if suggestion already exists
        if (document.getElementById('login-suggestion')) return;
        
        // Only show suggestion on index.html
        if (!window.location.pathname.includes('index.html')) return;
        
        setTimeout(() => {
            const suggestion = document.createElement('div');
            suggestion.id = 'login-suggestion';
            suggestion.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="material-symbols-outlined" style="font-size: 16px;">
                        cloud_off
                    </span>
                    <span style="font-size: 12px;">Login for cloud sync</span>
                    <button id="login-btn" style="margin-left: 10px; padding: 4px 12px; background: var(--secondary); color: white; border: none; border-radius: 4px; font-size: 11px; cursor: pointer;">
                        Login
                    </button>
                    <button id="close-suggestion" style="background: none; border: none; color: #999; cursor: pointer; margin-left: 5px;">
                        ×
                    </button>
                </div>
            `;
            
            suggestion.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: white;
                color: #333;
                padding: 10px 15px;
                border-radius: 8px;
                font-size: 14px;
                cursor: default;
                z-index: 9998;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                font-family: 'Poppins', sans-serif;
                display: flex;
                align-items: center;
                border: 1px solid #e0e0e0;
                animation: slideUp 0.3s ease;
            `;
            
            // Add CSS animation
            if (!document.querySelector('#login-suggestion-anim')) {
                const style = document.createElement('style');
                style.id = 'login-suggestion-anim';
                style.textContent = `
                    @keyframes slideUp {
                        from {
                            transform: translateY(100%);
                            opacity: 0;
                        }
                        to {
                            transform: translateY(0);
                            opacity: 1;
                        }
                    }
                `;
                document.head.appendChild(style);
            }
            
            document.body.appendChild(suggestion);
            
            // Login button click
            document.getElementById('login-btn').addEventListener('click', () => {
                this.showLoginModal();
                suggestion.remove();
            });
            
            // Close button click
            document.getElementById('close-suggestion').addEventListener('click', () => {
                suggestion.remove();
            });
            
            // Auto remove after 30 seconds
            setTimeout(() => {
                if (suggestion.parentNode) {
                    suggestion.style.opacity = '0';
                    setTimeout(() => {
                        if (suggestion.parentNode) suggestion.remove();
                    }, 300);
                }
            }, 30000);
            
        }, 5000); // Show after 5 seconds
    }
    
    // Show login modal
    showLoginModal() {
        // Check if modal already exists
        if (document.getElementById('firebase-login-modal')) return;
        
        const modalHTML = `
            <div id="firebase-login-modal" class="modal" style="display: flex; z-index: 10000;">
                <div class="modal-content" style="max-width: 400px; padding: 30px;">
                    <div style="text-align: center; margin-bottom: 25px;">
                        <h3 style="margin: 0 0 10px 0; color: var(--text);">Cloud Sync Login</h3>
                        <p style="color: #666; font-size: 14px; margin: 0;">
                            Login to sync your data with Firebase Cloud
                        </p>
                    </div>
                    
                    <div style="margin-bottom: 25px;">
                        <div style="margin-bottom: 15px;">
                            <input type="email" id="modal-login-email" placeholder="Email" 
                                   style="width: 100%; padding: 12px 15px; margin-bottom: 12px; 
                                          border: 2px solid #e0e0e0; border-radius: 8px;
                                          font-family: 'Poppins', sans-serif; font-size: 14px;
                                          transition: border-color 0.3s;">
                        </div>
                        
                        <div style="margin-bottom: 20px;">
                            <input type="password" id="modal-login-password" placeholder="Password" 
                                   style="width: 100%; padding: 12px 15px; 
                                          border: 2px solid #e0e0e0; border-radius: 8px;
                                          font-family: 'Poppins', sans-serif; font-size: 14px;">
                        </div>
                        
                        <div id="modal-login-error" style="color: #e53e3e; font-size: 13px; 
                             margin-bottom: 15px; min-height: 18px; text-align: center;"></div>
                        
                        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                            <button id="modal-btn-login" 
                                    style="flex: 1; padding: 12px; background: var(--secondary); 
                                           color: white; border: none; border-radius: 8px;
                                           font-family: 'Poppins', sans-serif; font-weight: 600;
                                           cursor: pointer; transition: all 0.3s;">
                                Login
                            </button>
                            <button id="modal-btn-register" 
                                    style="flex: 1; padding: 12px; background: #f0f0f0; 
                                           color: #333; border: none; border-radius: 8px;
                                           font-family: 'Poppins', sans-serif; font-weight: 600;
                                           cursor: pointer; transition: all 0.3s;">
                                Register
                            </button>
                        </div>
                        
                        <div style="text-align: center; margin-top: 20px; padding-top: 20px; 
                             border-top: 1px solid #eee;">
                            <button id="modal-btn-continue-offline" 
                                    style="background: none; border: none; color: #666; 
                                           cursor: pointer; font-size: 13px; 
                                           text-decoration: underline;">
                                Continue without login
                            </button>
                        </div>
                    </div>
                    
                    <div style="text-align: center;">
                        <button id="modal-btn-close" 
                                style="padding: 10px 20px; background: #f0f0f0; 
                                       color: #333; border: none; border-radius: 6px;
                                       font-family: 'Poppins', sans-serif; cursor: pointer;">
                            Close
                        </button>
                    </div>
                </div>
            </div>
            
            <style>
                #firebase-login-modal .modal-content {
                    animation: modalPop 0.3s ease;
                }
                
                #modal-login-email:focus, #modal-login-password:focus {
                    outline: none;
                    border-color: var(--secondary) !important;
                }
                
                #modal-btn-login:hover {
                    background: var(--primary) !important;
                }
                
                #modal-btn-register:hover {
                    background: #e0e0e0 !important;
                }
                
                @keyframes modalPop {
                    from {
                        transform: scale(0.9);
                        opacity: 0;
                    }
                    to {
                        transform: scale(1);
                        opacity: 1;
                    }
                }
            </style>
        `;
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        document.body.classList.add('modal-open');
        
        // Add event listeners
        const modal = document.getElementById('firebase-login-modal');
        const emailInput = document.getElementById('modal-login-email');
        const passwordInput = document.getElementById('modal-login-password');
        const errorDiv = document.getElementById('modal-login-error');
        
        // Focus on email input
        setTimeout(() => emailInput.focus(), 100);
        
        // Login button
        document.getElementById('modal-btn-login').addEventListener('click', async () => {
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();
            
            errorDiv.textContent = '';
            
            if (!email || !password) {
                errorDiv.textContent = 'Please enter email and password';
                return;
            }
            
            const result = await this.login(email, password);
            
            if (result.success) {
                modal.remove();
                document.body.classList.remove('modal-open');
                this.showNotification('Login successful! ✅', 'success');
            } else {
                errorDiv.textContent = result.error;
                passwordInput.value = '';
                passwordInput.focus();
            }
        });
        
        // Register button
        document.getElementById('modal-btn-register').addEventListener('click', async () => {
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();
            
            errorDiv.textContent = '';
            
            if (!email || !password) {
                errorDiv.textContent = 'Please enter email and password';
                return;
            }
            
            if (password.length < 6) {
                errorDiv.textContent = 'Password must be at least 6 characters';
                return;
            }
            
            const displayName = email.split('@')[0];
            const result = await this.register(email, password, displayName);
            
            if (result.success) {
                errorDiv.textContent = 'Registration successful! Please login.';
                passwordInput.value = '';
                
                // Auto-fill email for login
                setTimeout(() => {
                    passwordInput.focus();
                }, 100);
            } else {
                errorDiv.textContent = result.error;
            }
        });
        
        // Continue offline button
        document.getElementById('modal-btn-continue-offline').addEventListener('click', () => {
            modal.remove();
            document.body.classList.remove('modal-open');
            this.showNotification('Continuing in offline mode 📱', 'info');
        });
        
        // Close button
        document.getElementById('modal-btn-close').addEventListener('click', () => {
            modal.remove();
            document.body.classList.remove('modal-open');
        });
        
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                document.body.classList.remove('modal-open');
            }
        });
        
        // Close on Escape key
        const closeOnEscape = (e) => {
            if (e.key === 'Escape' && modal.parentNode) {
                modal.remove();
                document.body.classList.remove('modal-open');
                document.removeEventListener('keydown', closeOnEscape);
            }
        };
        document.addEventListener('keydown', closeOnEscape);
    }
    
    // Initialize user data in Firestore
    async initializeUserData(user) {
        try {
            if (!this.db || user.isAnonymous) return;
            
            const userRef = this.db.collection('users').doc(user.uid);
            const userDoc = await userRef.get();
            
            if (!userDoc.exists) {
                // Create new user document
                await userRef.set({
                    email: user.email,
                    displayName: user.displayName || user.email.split('@')[0],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                    organizations: []
                });
                console.log("✅ New user created in Firestore");
            } else {
                // Update last login
                await userRef.update({
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (error) {
            console.error("❌ Error initializing user data:", error);
        }
    }
    
    // Start auto-sync of local data to Firebase
    startAutoSync() {
        if (!this.isLoggedIn() || this.currentUser?.isAnonymous) {
            console.log("⏸️ Auto-sync disabled for anonymous users");
            return;
        }
        
        // Sync local data every 60 seconds
        this.syncInterval = setInterval(() => {
            this.syncLocalDataToFirebase();
        }, 60000);
        
        // Also sync when page becomes visible
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                setTimeout(() => {
                    this.syncLocalDataToFirebase();
                }, 1000);
            }
        });
        
        // Sync on page load
        setTimeout(() => {
            this.syncLocalDataToFirebase();
        }, 3000);
        
        console.log("🔄 Auto-sync started");
    }
    
    // Sync local data to Firebase
    async syncLocalDataToFirebase() {
        if (!this.isLoggedIn() || this.currentUser?.isAnonymous) return;
        
        const selectedOrg = localStorage.getItem('selectedOrganization');
        if (!selectedOrg || !window.dbManager) return;
        
        try {
            await window.dbManager.syncAllLocalData();
        } catch (error) {
            console.error("❌ Auto-sync error:", error);
        }
    }
    
    // Register new user
    async register(email, password, displayName) {
        try {
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Update display name
            await user.updateProfile({
                displayName: displayName
            });
            
            console.log("✅ Registration successful:", user.email);
            return { success: true, user: user };
            
        } catch (error) {
            console.error("❌ Registration error:", error.message);
            return { success: false, error: this.getErrorMessage(error) };
        }
    }
    
    // Login existing user
    async login(email, password) {
        try {
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            console.log("✅ Login successful:", userCredential.user.email);
            return { success: true, user: userCredential.user };
            
        } catch (error) {
            console.error("❌ Login error:", error.message);
            return { success: false, error: this.getErrorMessage(error) };
        }
    }
    
    // Logout
    async logout() {
        try {
            await this.auth.signOut();
            console.log("✅ Logout successful");
            
            // Clear sync interval
            if (this.syncInterval) {
                clearInterval(this.syncInterval);
                this.syncInterval = null;
            }
            
            return { success: true };
            
        } catch (error) {
            console.error("❌ Logout error:", error.message);
            return { success: false, error: error.message };
        }
    }
    
    // Get user-friendly error messages
    getErrorMessage(error) {
        switch(error.code) {
            case 'auth/email-already-in-use':
                return 'Email already in use';
            case 'auth/invalid-email':
                return 'Invalid email format';
            case 'auth/weak-password':
                return 'Password too weak (min 6 characters)';
            case 'auth/user-not-found':
                return 'User not found';
            case 'auth/wrong-password':
                return 'Wrong password';
            case 'auth/too-many-requests':
                return 'Too many attempts. Try again later';
            case 'auth/admin-restricted-operation':
                return 'Anonymous login is disabled';
            case 'auth/network-request-failed':
                return 'Network error. Check your connection';
            default:
                return error.message.replace('Firebase: ', '');
        }
    }
    
    // Show notification
    showNotification(message, type = 'info') {
        // Remove existing notifications
        document.querySelectorAll('.firebase-notification').forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = `firebase-notification ${type}`;
        notification.innerHTML = `
            <span class="material-symbols-outlined" style="margin-right: 8px; vertical-align: middle;">
                ${type === 'success' ? 'check_circle' : 
                  type === 'error' ? 'error' : 
                  type === 'warning' ? 'warning' : 'info'}
            </span>
            <span>${message}</span>
        `;
        
        const iconColor = type === 'success' ? '#4CAF50' :
                         type === 'error' ? '#f44336' :
                         type === 'warning' ? '#FF9800' : '#2196F3';
        
        notification.style.cssText = `
            position: fixed;
            top: 70px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            background: white;
            color: #333;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: 'Poppins', sans-serif;
            font-size: 14px;
            display: flex;
            align-items: center;
            border-left: 4px solid ${iconColor};
            animation: slideInRight 0.3s ease, fadeOut 0.3s ease 2.7s;
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }
    
    // Get current user
    getCurrentUser() {
        return this.currentUser;
    }
    
    // Check if user is logged in
    isLoggedIn() {
        return this.currentUser !== null;
    }
    
    // Get user profile
    getUserProfile() {
        return this.userProfile;
    }
    
    // Check if user is anonymous
    isAnonymous() {
        return this.currentUser?.isAnonymous || false;
    }
}

// Initialize auth system when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait for Firebase to be ready
    const checkFirebase = setInterval(() => {
        if (window.firebaseServices?.auth) {
            clearInterval(checkFirebase);
            window.firebaseAuth = new FirebaseAuthSystem();
            console.log("✅ Firebase Auth initialized");
        }
    }, 100);
});
