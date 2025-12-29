// firebase-db.js - COMPLETE REAL-TIME SYNC FIX
class FirebaseDBManager {
    constructor() {
        this.db = window.firebaseServices?.db;
        this.auth = window.firebaseServices?.auth;
        this.currentOrg = localStorage.getItem('selectedOrganization') || 'AMI';
        this.syncListeners = {};
        this.isOnline = navigator.onLine;
        this.syncQueue = [];
        this.isSyncing = false;
        this.realtimeEnabled = true;
        
        console.log("🗄️ Firebase DB Manager initialized. Org:", this.currentOrg);
        
        // Setup network detection
        this.setupNetworkDetection();
        
        // Initial setup
        this.initialize();
    }
    
    // Initialize manager
    async initialize() {
        // Load queue from localStorage
        this.loadSyncQueue();
        
        // Setup sync queue processor
        this.setupSyncQueue();
        
        // Add network status indicator
        this.addNetworkStatusIndicator();
        
        // Check initial data
        await this.checkInitialData();
        
        // Setup real-time listeners if online
        if (this.isOnline) {
            setTimeout(() => {
                this.setupRealtimeListeners();
            }, 2000);
        }
    }
    
    // Check initial data
    async checkInitialData() {
        console.log("📋 Checking initial data...");
        
        // Check if we have organization data
        if (!this.currentOrg) {
            console.warn("⚠️ No organization selected");
            return;
        }
        
        // Check Firebase connection
        await this.testFirebaseConnection();
        
        // Load data from Firebase if online and logged in
        if (this.isOnline && this.auth?.currentUser) {
            await this.loadDataFromFirebase();
        } else {
            console.log("📱 Using local data only");
        }
    }
    
    // Test Firebase connection
    async testFirebaseConnection() {
        try {
            if (!this.db) return false;
            
            const testRef = this.db.collection('test').doc('connection');
            await testRef.set({
                connected: true,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                org: this.currentOrg,
                user: this.auth?.currentUser?.uid || 'anonymous'
            }, { merge: true });
            
            console.log("✅ Firebase connection test successful");
            return true;
            
        } catch (error) {
            console.error("❌ Firebase connection test failed:", error);
            return false;
        }
    }
    
    // Load data from Firebase
    async loadDataFromFirebase() {
        console.log("🔄 Loading data from Firebase...");
        
        try {
            // Load attendance names
            await this.loadCollectionData('attendanceNames');
            
            // Load report titles
            await this.loadCollectionData('reportTitles');
            
            // Load attendance info
            await this.loadCollectionData('attendanceInfo');
            
            // Load signatures
            await this.loadSignatures();
            
            console.log("✅ Data loaded from Firebase");
            
            // Dispatch event
            window.dispatchEvent(new CustomEvent('firebaseDataLoaded'));
            
        } catch (error) {
            console.error("❌ Error loading data from Firebase:", error);
        }
    }
    
    // Load data from Firestore collection
    async loadCollectionData(dataType) {
        try {
            const docRef = this.db.collection('organizations')
                .doc(this.currentOrg)
                .collection('data')
                .doc(dataType);
            
            const doc = await docRef.get();
            
            if (doc.exists) {
                const cloudData = doc.data();
                const data = cloudData.data;
                const timestamp = cloudData.updatedAt?.toMillis() || 0;
                
                // Save to localStorage
                localStorage.setItem(dataType, JSON.stringify(data));
                localStorage.setItem(`${dataType}_timestamp`, timestamp.toString());
                
                console.log(`✅ ${dataType} loaded from cloud`);
                
                // Trigger UI update
                this.triggerDataUpdate(dataType, data, timestamp);
                
                return data;
            }
            
        } catch (error) {
            console.log(`📱 Could not load ${dataType}:`, error.message);
        }
        
        return null;
    }
    
    // Trigger data update event
    triggerDataUpdate(dataType, data, timestamp) {
        window.dispatchEvent(new CustomEvent('syncDataUpdate', {
            detail: {
                type: dataType,
                data: data,
                source: 'cloud',
                timestamp: timestamp,
                org: this.currentOrg
            }
        }));
    }
    
    // Setup network detection
    setupNetworkDetection() {
        // Initial check
        this.checkNetworkStatus();
        
        // Listen for network events with debouncing
        let onlineTimer, offlineTimer;
        
        window.addEventListener('online', () => {
            console.log("🌐 Browser reported online");
            clearTimeout(offlineTimer);
            clearTimeout(onlineTimer);
            
            onlineTimer = setTimeout(() => {
                this.handleOnline();
            }, 1000);
        });
        
        window.addEventListener('offline', () => {
            console.log("📴 Browser reported offline");
            clearTimeout(onlineTimer);
            clearTimeout(offlineTimer);
            
            offlineTimer = setTimeout(() => {
                this.handleOffline();
            }, 500);
        });
        
        // Periodic check
        setInterval(() => {
            this.checkNetworkStatus();
        }, 10000);
    }
    
    // Handle online
    handleOnline() {
        this.isOnline = true;
        console.log("🌐 Now online - enabling real-time sync");
        
        // Update UI
        this.updateNetworkStatusUI(true);
        
        // Setup real-time listeners
        this.setupRealtimeListeners();
        
        // Process sync queue
        this.processSyncQueue();
        
        // Sync local data
        setTimeout(() => {
            this.syncAllLocalData();
        }, 2000);
    }
    
    // Handle offline
    handleOffline() {
        this.isOnline = false;
        console.log("📴 Now offline - disabling real-time sync");
        
        // Stop listeners
        this.removeRealtimeListeners();
        
        // Update UI
        this.updateNetworkStatusUI(false);
    }
    
    // Check network status
    checkNetworkStatus() {
        const wasOnline = this.isOnline;
        this.isOnline = navigator.onLine;
        
        if (wasOnline !== this.isOnline) {
            if (this.isOnline) {
                this.handleOnline();
            } else {
                this.handleOffline();
            }
        }
    }
    
    // Setup real-time listeners - FIXED VERSION
    setupRealtimeListeners() {
        if (!this.isOnline || !this.db || !this.realtimeEnabled) {
            console.log("⏸️ Skipping real-time listeners setup");
            return;
        }
        
        console.log("👂 Setting up REAL-TIME listeners...");
        
        // Remove existing listeners
        this.removeRealtimeListeners();
        
        // Check if organization exists in Firestore
        this.ensureOrganizationExists().then(() => {
            // Setup listeners for each data type
            const dataTypes = ['attendanceNames', 'reportTitles', 'attendanceInfo', 'tanggalPresensi'];
            
            dataTypes.forEach(dataType => {
                this.setupDocumentListener(dataType);
            });
            
            // Setup signatures listener
            this.setupSignaturesListener();
            
            console.log("✅ Real-time listeners setup complete");
            
        }).catch(error => {
            console.error("❌ Failed to setup real-time listeners:", error);
        });
    }
    
    // Ensure organization exists in Firestore
    async ensureOrganizationExists() {
        try {
            const orgRef = this.db.collection('organizations').doc(this.currentOrg);
            const orgDoc = await orgRef.get();
            
            if (!orgDoc.exists) {
                console.log(`🏢 Creating organization: ${this.currentOrg}`);
                await orgRef.set({
                    name: this.currentOrg,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: this.auth?.currentUser?.uid || 'system'
                });
            }
            
            return true;
            
        } catch (error) {
            console.error("❌ Error ensuring organization exists:", error);
            throw error;
        }
    }
    
    // Setup document listener
    setupDocumentListener(dataType) {
        try {
            const docRef = this.db.collection('organizations')
                .doc(this.currentOrg)
                .collection('data')
                .doc(dataType);
            
            console.log(`🎯 Setting up listener for: ${dataType}`);
            
            this.syncListeners[dataType] = docRef.onSnapshot(
                (doc) => {
                    this.handleDocumentUpdate(doc, dataType);
                },
                (error) => {
                    console.error(`❌ ${dataType} listener error:`, error);
                    
                    // Retry after delay
                    setTimeout(() => {
                        this.setupDocumentListener(dataType);
                    }, 5000);
                }
            );
            
        } catch (error) {
            console.error(`❌ Failed to setup ${dataType} listener:`, error);
        }
    }
    
    // Setup signatures listener
    setupSignaturesListener() {
        try {
            const signaturesRef = this.db.collection('organizations')
                .doc(this.currentOrg)
                .collection('signatures');
            
            console.log("🎯 Setting up signatures listener");
            
            this.syncListeners.signatures = signaturesRef.onSnapshot(
                (snapshot) => {
                    this.handleSignaturesUpdate(snapshot);
                },
                (error) => {
                    console.error("❌ Signatures listener error:", error);
                    
                    // Retry after delay
                    setTimeout(() => {
                        this.setupSignaturesListener();
                    }, 5000);
                }
            );
            
        } catch (error) {
            console.error("❌ Failed to setup signatures listener:", error);
        }
    }
    
    // Handle document update
    handleDocumentUpdate(doc, dataType) {
        if (!doc.exists) {
            // Document doesn't exist yet, that's OK
            return;
        }
        
        const data = doc.data();
        const newData = data.data;
        const timestamp = data.updatedAt?.toMillis() || 0;
        const updatedBy = data.updatedBy;
        
        // Skip if updated by current user
        if (updatedBy === this.auth?.currentUser?.uid) {
            return;
        }
        
        console.log(`🔄 ${dataType} updated from cloud:`, {
            timestamp: new Date(timestamp).toLocaleTimeString(),
            updatedBy: updatedBy?.substring(0, 8),
            dataSize: Array.isArray(newData) ? newData.length : 'object'
        });
        
        // Update localStorage
        localStorage.setItem(dataType, JSON.stringify(newData));
        localStorage.setItem(`${dataType}_timestamp`, timestamp.toString());
        
        // Trigger UI update
        this.triggerDataUpdate(dataType, newData, timestamp);
        
        // Show notification
        this.showRealtimeNotification(dataType, newData);
    }
    
    // Handle signatures update
    handleSignaturesUpdate(snapshot) {
        if (snapshot.empty) {
            return;
        }
        
        const cloudSignatures = {};
        
        snapshot.forEach(doc => {
            const data = doc.data();
            cloudSignatures[data.name] = {
                image: data.imageUrl,
                keterangan: data.keterangan || '',
                updatedAt: data.updatedAt?.toMillis() || 0
            };
        });
        
        console.log(`🔄 Signatures updated: ${Object.keys(cloudSignatures).length} signatures`);
        
        // Merge with local
        const localSignatures = JSON.parse(localStorage.getItem('spreadsheetData') || '{}');
        const merged = { ...localSignatures, ...cloudSignatures };
        
        localStorage.setItem('spreadsheetData', JSON.stringify(merged));
        
        // Trigger update
        this.triggerDataUpdate('signatures', merged, Date.now());
    }
    
    // Show real-time notification
    showRealtimeNotification(dataType, data) {
        const messages = {
            'attendanceNames': `${data.filter(d => d).length} names updated`,
            'reportTitles': 'Titles updated',
            'attendanceInfo': 'Info updated',
            'signatures': `${Object.keys(data).length} signatures updated`,
            'tanggalPresensi': 'Date updated'
        };
        
        const message = messages[dataType] || 'Data updated';
        
        this.showNotification(`🔄 ${message} from another device`, 'info');
    }
    
    // Remove real-time listeners
    removeRealtimeListeners() {
        console.log("👋 Removing real-time listeners");
        
        Object.values(this.syncListeners).forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                try {
                    unsubscribe();
                } catch (e) {
                    console.warn("⚠️ Error removing listener:", e);
                }
            }
        });
        
        this.syncListeners = {};
    }
    
    // Save data to Firebase - FIXED VERSION
    async saveData(dataType, data, options = {}) {
        const userId = this.auth?.currentUser?.uid;
        const timestamp = Date.now();
        
        console.log(`💾 Saving ${dataType} to Firebase...`);
        
        // Always save to localStorage first
        localStorage.setItem(dataType, JSON.stringify(data));
        localStorage.setItem(`${dataType}_timestamp`, timestamp.toString());
        
        // Trigger local update immediately
        this.triggerDataUpdate(dataType, data, timestamp);
        
        // Check if we can save to Firebase
        if (!userId || !this.isOnline || !this.db) {
            console.log(`📱 ${dataType} saved locally only`);
            
            if (!this.isOnline) {
                this.addToSyncQueue(dataType, data);
            }
            
            return { 
                success: true, 
                synced: false, 
                reason: !userId ? 'no-user' : !this.isOnline ? 'offline' : 'no-db' 
            };
        }
        
        try {
            // Prepare document data
            const docData = {
                data: data,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: userId,
                clientTimestamp: timestamp,
                device: navigator.platform
            };
            
            const docRef = this.db.collection('organizations')
                .doc(this.currentOrg)
                .collection('data')
                .doc(dataType);
            
            // Save to Firestore
            await docRef.set(docData, { merge: true });
            
            console.log(`✅ ${dataType} saved to Firebase successfully`);
            
            return { success: true, synced: true };
            
        } catch (error) {
            console.error(`❌ Error saving ${dataType}:`, error);
            
            // Add to sync queue for retry
            this.addToSyncQueue(dataType, data);
            
            return { 
                success: false, 
                error: error.message, 
                queued: true 
            };
        }
    }
    
    // Add to sync queue
    addToSyncQueue(dataType, data) {
        const queueItem = {
            dataType,
            data,
            timestamp: Date.now(),
            org: this.currentOrg,
            attempts: 0
        };
        
        this.syncQueue.push(queueItem);
        
        // Keep queue manageable
        if (this.syncQueue.length > 100) {
            this.syncQueue = this.syncQueue.slice(-100);
        }
        
        // Save to localStorage
        this.saveSyncQueue();
        
        console.log(`📝 Added to sync queue: ${dataType} (${this.syncQueue.length} items)`);
        
        // Update UI
        this.updateQueueStatus();
    }
    
    // Setup sync queue processor
    setupSyncQueue() {
        // Process queue every 10 seconds
        setInterval(() => {
            this.processSyncQueue();
        }, 10000);
        
        // Process on online event
        window.addEventListener('online', () => {
            setTimeout(() => {
                this.processSyncQueue();
            }, 2000);
        });
    }
    
    // Process sync queue
    async processSyncQueue() {
        if (!this.isOnline || this.isSyncing || this.syncQueue.length === 0) {
            return;
        }
        
        this.isSyncing = true;
        console.log(`🔄 Processing sync queue (${this.syncQueue.length} items)`);
        
        const userId = this.auth?.currentUser?.uid;
        if (!userId) {
            this.isSyncing = false;
            return;
        }
        
        const successes = [];
        const failures = [];
        
        // Process first 5 items
        const itemsToProcess = this.syncQueue.slice(0, 5);
        
        for (const item of itemsToProcess) {
            try {
                // Skip if not for current org
                if (item.org !== this.currentOrg) {
                    successes.push(item);
                    continue;
                }
                
                // Prepare data
                const docData = {
                    data: item.data,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: userId,
                    syncedFromQueue: true,
                    originalTimestamp: item.timestamp
                };
                
                // Save to Firestore
                const docRef = this.db.collection('organizations')
                    .doc(item.org)
                    .collection('data')
                    .doc(item.dataType);
                
                await docRef.set(docData, { merge: true });
                
                successes.push(item);
                console.log(`✅ Queued item synced: ${item.dataType}`);
                
                // Small delay between operations
                await new Promise(resolve => setTimeout(resolve, 200));
                
            } catch (error) {
                console.error(`❌ Failed to sync queued item:`, error);
                item.attempts = (item.attempts || 0) + 1;
                
                // Remove if too many attempts
                if (item.attempts > 5) {
                    successes.push(item);
                } else {
                    failures.push(item);
                }
            }
        }
        
        // Remove successful items
        if (successes.length > 0) {
            this.syncQueue = this.syncQueue.filter(item => 
                !successes.some(success => 
                    success.dataType === item.dataType && 
                    success.timestamp === item.timestamp
                )
            );
            
            this.saveSyncQueue();
        }
        
        this.isSyncing = false;
        
        // Update UI
        this.updateQueueStatus();
        
        console.log(`✅ Queue processed. Success: ${successes.length}, Failed: ${failures.length}, Remaining: ${this.syncQueue.length}`);
    }
    
    // Save sync queue to localStorage
    saveSyncQueue() {
        try {
            localStorage.setItem('firebaseSyncQueue', JSON.stringify(this.syncQueue));
        } catch (e) {
            console.error("❌ Error saving sync queue:", e);
        }
    }
    
    // Load sync queue from localStorage
    loadSyncQueue() {
        try {
            const saved = localStorage.getItem('firebaseSyncQueue');
            if (saved) {
                this.syncQueue = JSON.parse(saved);
                console.log(`📥 Loaded sync queue: ${this.syncQueue.length} items`);
            }
        } catch (e) {
            console.error("❌ Error loading sync queue:", e);
            this.syncQueue = [];
        }
    }
    
    // Update queue status UI
    updateQueueStatus() {
        const indicator = document.getElementById('sync-status-indicator');
        if (!indicator) return;
        
        if (this.syncQueue.length > 0) {
            indicator.style.background = '#ffd93d';
            indicator.title = `${this.syncQueue.length} pending sync`;
            
            // Add pulsing animation
            indicator.style.animation = 'pulse 1s infinite';
        } else {
            indicator.style.animation = '';
            this.updateNetworkStatusUI(this.isOnline);
        }
    }
    
    // Add network status indicator
    addNetworkStatusIndicator() {
        if (document.getElementById('sync-status-indicator')) return;
        
        const indicator = document.createElement('div');
        indicator.id = 'sync-status-indicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            z-index: 9999;
            cursor: pointer;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
        `;
        
        indicator.addEventListener('click', () => {
            if (this.isOnline) {
                this.syncAllLocalData();
            } else {
                this.showNotification('Cannot sync - offline', 'error');
            }
        });
        
        document.body.appendChild(indicator);
        
        // Initial update
        this.updateNetworkStatusUI(this.isOnline);
    }
    
    // Update network status UI
    updateNetworkStatusUI(isOnline) {
        const indicator = document.getElementById('sync-status-indicator');
        if (!indicator) return;
        
        indicator.style.background = isOnline ? '#6bcf7f' : '#ff6b6b';
        indicator.title = isOnline ? 'Online - Synced' : 'Offline - Local only';
    }
    
    // Sync all local data to Firebase
    async syncAllLocalData() {
        if (!this.isOnline || !this.auth?.currentUser) {
            this.showNotification('Cannot sync - check connection and login', 'error');
            return;
        }
        
        console.log("🔄 Syncing all local data to Firebase...");
        
        try {
            // Show syncing indicator
            const indicator = document.getElementById('sync-status-indicator');
            if (indicator) {
                indicator.style.animation = 'spin 1s linear infinite';
            }
            
            // Sync names
            const names = JSON.parse(localStorage.getItem('attendanceNames') || '[]');
            if (names.length > 0) {
                await this.saveData('attendanceNames', names);
            }
            
            // Sync titles
            const titles = JSON.parse(localStorage.getItem('reportTitles') || '[]');
            if (titles.length > 0) {
                await this.saveData('reportTitles', titles);
            }
            
            // Sync info
            const info = JSON.parse(localStorage.getItem('attendanceInfo') || '{}');
            if (Object.keys(info).length > 0) {
                await this.saveData('attendanceInfo', info);
            }
            
            // Sync date
            const date = localStorage.getItem('tanggalPresensi');
            if (date) {
                await this.saveData('tanggalPresensi', date);
            }
            
            // Process queue
            await this.processSyncQueue();
            
            // Stop animation
            if (indicator) {
                indicator.style.animation = '';
            }
            
            this.showNotification('All data synced to cloud ✅', 'success');
            
        } catch (error) {
            console.error("❌ Error syncing all data:", error);
            this.showNotification('Sync failed: ' + error.message, 'error');
        }
    }
    
    // Show notification
    showNotification(message, type = 'info') {
        // Remove existing
        document.querySelectorAll('.sync-notification').forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = `sync-notification ${type}`;
        notification.innerHTML = `
            <span class="material-symbols-outlined" style="margin-right: 8px; vertical-align: middle;">
                ${type === 'success' ? 'check_circle' : 
                  type === 'error' ? 'error' : 'info'}
            </span>
            <span>${message}</span>
        `;
        
        const bgColor = type === 'success' ? '#6bcf7f' :
                       type === 'error' ? '#ff6b6b' : '#2196F3';
        
        notification.style.cssText = `
            position: fixed;
            top: 70px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            background: ${bgColor};
            color: white;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            font-family: 'Poppins', sans-serif;
            font-size: 14px;
            display: flex;
            align-items: center;
            animation: slideInRight 0.3s ease, fadeOut 0.3s ease 2.7s;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) notification.remove();
        }, 3000);
    }
    
    // Change organization
    setOrganization(orgId) {
        console.log(`🏢 Changing organization from ${this.currentOrg} to ${orgId}`);
        
        // Remove old listeners
        this.removeRealtimeListeners();
        
        // Update current org
        this.currentOrg = orgId;
        localStorage.setItem('selectedOrganization', orgId);
        
        // Setup new listeners
        if (this.isOnline) {
            setTimeout(() => {
                this.setupRealtimeListeners();
            }, 1000);
        }
        
        // Load data for new org
        setTimeout(() => {
            this.loadDataFromFirebase();
        }, 500);
        
        // Dispatch event
        window.dispatchEvent(new CustomEvent('organizationChanged', {
            detail: { orgId: orgId }
        }));
    }
    
    // Get sync status
    getSyncStatus() {
        return {
            online: this.isOnline,
            org: this.currentOrg,
            listeners: Object.keys(this.syncListeners),
            queueSize: this.syncQueue.length,
            user: this.auth?.currentUser?.uid,
            realtimeEnabled: this.realtimeEnabled
        };
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.firebaseServices?.db) {
            window.dbManager = new FirebaseDBManager();
            console.log("✅ Firebase DB Manager initialized");
            
            // Add debug functions
            window.debugSync = {
                status: () => console.log('Sync Status:', window.dbManager.getSyncStatus()),
                forceSync: () => window.dbManager.syncAllLocalData(),
                clearQueue: () => {
                    window.dbManager.syncQueue = [];
                    window.dbManager.saveSyncQueue();
                    console.log('Queue cleared');
                },
                test: () => window.dbManager.testFirebaseConnection()
            };
        }
    }, 2000);
});
