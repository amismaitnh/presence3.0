// firebase-integration.js - SIMPLIFIED
class FirebaseIntegration {
    constructor() {
        this.ready = false;
        this.init();
    }
    
    async init() {
        console.log("🔧 Initializing Firebase integration...");
        
        // Wait for Firebase
        await this.waitForFirebase();
        
        // Setup event listeners
        this.setupListeners();
        
        // Setup UI
        this.setupUI();
        
        this.ready = true;
        console.log("✅ Firebase integration ready");
    }
    
    async waitForFirebase() {
        return new Promise((resolve) => {
            const check = () => {
                if (window.firebaseServices && window.dbManager) {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }
    
    setupListeners() {
        // Listen for sync updates
        window.addEventListener('syncDataUpdate', (event) => {
            this.handleUpdate(event.detail);
        });
    }
    
    handleUpdate(detail) {
        console.log('📡 Update received:', detail.type);
        
        // Update localStorage
        localStorage.setItem(detail.type, JSON.stringify(detail.data));
        
        // Dispatch specific event
        switch (detail.type) {
            case 'attendanceNames':
                window.dispatchEvent(new CustomEvent('namesUpdated', { detail }));
                break;
            case 'reportTitles':
                window.dispatchEvent(new CustomEvent('titlesUpdated', { detail }));
                break;
            case 'attendanceInfo':
                window.dispatchEvent(new CustomEvent('infoUpdated', { detail }));
                break;
            case 'signatures':
                window.dispatchEvent(new CustomEvent('signaturesUpdated', { detail }));
                break;
        }
    }
    
    setupUI() {
        // Add sync button
        this.addSyncButton();
    }
    
    addSyncButton() {
        if (document.getElementById('sync-btn')) return;
        
        const btn = document.createElement('button');
        btn.id = 'sync-btn';
        btn.innerHTML = '<span class="material-symbols-outlined">sync</span>';
        btn.title = 'Sync with Cloud';
        btn.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 20px;
            background: var(--secondary);
            color: white;
            border: none;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            cursor: pointer;
            z-index: 999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        btn.addEventListener('click', () => {
            if (window.dbManager) {
                window.dbManager.syncAllLocalData();
            }
        });
        
        document.body.appendChild(btn);
    }
    
    // Save data helper
    async saveData(type, data) {
        if (window.dbManager) {
            return await window.dbManager.saveData(type, data);
        }
        return { success: false, error: 'No DB manager' };
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.firebaseIntegration = new FirebaseIntegration();
});
