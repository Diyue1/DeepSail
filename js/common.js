/**
 * DeepSail - Shared Utilities
 * Common functions used across all pages
 */

// ─── Performance Monitoring ───────────────────────────────────────────────────
const DeepSailPerf = {
    marks: {},

    mark(name) {
        this.marks[name] = performance.now();
    },

    measure(name, start) {
        const duration = performance.now() - (this.marks[start] || 0);
        console.debug(`[Perf] ${name}: ${duration.toFixed(1)}ms`);
        return duration;
    },

    // Observe Web Vitals
    observeWebVitals() {
        if (!('PerformanceObserver' in window)) return;

        // Largest Contentful Paint
        try {
            new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lcp = entries[entries.length - 1];
                console.debug(`[Vitals] LCP: ${lcp.startTime.toFixed(0)}ms`);
            }).observe({ type: 'largest-contentful-paint', buffered: true });
        } catch {}

        // First Input Delay
        try {
            new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    console.debug(`[Vitals] FID: ${entry.processingStart - entry.startTime}ms`);
                }
            }).observe({ type: 'first-input', buffered: true });
        } catch {}

        // Cumulative Layout Shift
        try {
            let clsValue = 0;
            new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (!entry.hadRecentInput) clsValue += entry.value;
                }
                console.debug(`[Vitals] CLS: ${clsValue.toFixed(4)}`);
            }).observe({ type: 'layout-shift', buffered: true });
        } catch {}
    }
};

// ─── Cache Utilities ──────────────────────────────────────────────────────────
const DeepSailCache = {
    PREFIX: 'deepsail_',
    DEFAULT_TTL: 3600 * 1000, // 1 hour

    set(key, value, ttl = this.DEFAULT_TTL) {
        try {
            const item = {
                value,
                expiry: Date.now() + ttl
            };
            localStorage.setItem(this.PREFIX + key, JSON.stringify(item));
        } catch (e) {
            // localStorage might be full or unavailable
            console.warn('[Cache] Set failed:', e.message);
        }
    },

    get(key) {
        try {
            const raw = localStorage.getItem(this.PREFIX + key);
            if (!raw) return null;
            const item = JSON.parse(raw);
            if (Date.now() > item.expiry) {
                localStorage.removeItem(this.PREFIX + key);
                return null;
            }
            return item.value;
        } catch {
            return null;
        }
    },

    delete(key) {
        localStorage.removeItem(this.PREFIX + key);
    },

    clear() {
        Object.keys(localStorage)
            .filter(k => k.startsWith(this.PREFIX))
            .forEach(k => localStorage.removeItem(k));
    }
};

// ─── Error Handling & Display ─────────────────────────────────────────────────
const DeepSailError = {
    show(container, message, type = 'error') {
        const colors = {
            error: { bg: 'rgba(231, 76, 60, 0.15)', border: '#e74c3c', icon: '⚠️' },
            warning: { bg: 'rgba(243, 156, 18, 0.15)', border: '#f39c12', icon: '⚡' },
            info: { bg: 'rgba(0, 180, 252, 0.15)', border: '#00b4fc', icon: 'ℹ️' }
        };
        const style = colors[type] || colors.error;
        const el = typeof container === 'string'
            ? document.getElementById(container)
            : container;
        if (!el) return;

        el.innerHTML = `
            <div role="alert" aria-live="assertive" style="
                background: ${style.bg};
                border: 1px solid ${style.border};
                border-radius: 8px;
                padding: 12px 16px;
                color: #fff;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 8px 0;
            ">
                <span aria-hidden="true">${style.icon}</span>
                <span>${message}</span>
            </div>
        `;
    },

    clear(container) {
        const el = typeof container === 'string'
            ? document.getElementById(container)
            : container;
        if (el) el.innerHTML = '';
    }
};

// ─── Skeleton Loader ──────────────────────────────────────────────────────────
const DeepSailSkeleton = {
    show(containerId, type = 'map') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const skeletons = {
            map: `
                <div class="skeleton-wrapper" aria-busy="true" aria-label="地图加载中">
                    <div class="skeleton skeleton-map"></div>
                    <div class="skeleton-overlay-text">
                        <div class="skeleton skeleton-line" style="width:60%"></div>
                        <div class="skeleton skeleton-line" style="width:40%; margin-top:8px"></div>
                    </div>
                </div>
            `,
            card: `
                <div class="skeleton-wrapper" aria-busy="true" aria-label="内容加载中">
                    <div class="skeleton skeleton-line" style="width:70%"></div>
                    <div class="skeleton skeleton-line" style="width:50%; margin-top:8px"></div>
                    <div class="skeleton skeleton-line" style="width:85%; margin-top:8px"></div>
                </div>
            `,
            full: `
                <div class="skeleton-wrapper" aria-busy="true" aria-label="加载中">
                    <div class="skeleton" style="width:100%;height:100%;min-height:300px;border-radius:8px;"></div>
                </div>
            `
        };
        container.innerHTML = skeletons[type] || skeletons.full;
    },

    hide(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const skeleton = container.querySelector('.skeleton-wrapper');
        if (skeleton) skeleton.remove();
    }
};

// ─── Theme Management ─────────────────────────────────────────────────────────
const DeepSailTheme = {
    STORAGE_KEY: 'deepsail_theme',

    init() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved === 'light') this.applyLight();

        const btn = document.getElementById('themeBtn');
        if (btn) {
            btn.addEventListener('click', () => this.toggle());
            btn.setAttribute('aria-label', '切换深色/浅色主题');
        }
    },

    toggle() {
        const isLight = document.body.classList.contains('theme-light');
        if (isLight) {
            this.applyDark();
            localStorage.setItem(this.STORAGE_KEY, 'dark');
        } else {
            this.applyLight();
            localStorage.setItem(this.STORAGE_KEY, 'light');
        }
    },

    applyLight() {
        document.body.classList.add('theme-light');
        document.documentElement.style.setProperty('--theme-dark-bg', 'var(--theme-light-bg)');
        document.body.style.color = '#222';
        const navbar = document.querySelector('.navbar');
        if (navbar) navbar.style.background = 'rgba(230,240,255,0.94)';
        const btn = document.getElementById('themeBtn');
        if (btn) btn.textContent = '🌚';
    },

    applyDark() {
        document.body.classList.remove('theme-light');
        document.documentElement.style.setProperty(
            '--theme-dark-bg',
            'linear-gradient(135deg, #0e1336 0%, #202748 80%, #1d2548 100%)'
        );
        document.body.style.color = '#fff';
        const navbar = document.querySelector('.navbar');
        if (navbar) navbar.style.background = 'rgba(24,32,61,0.92)';
        const btn = document.getElementById('themeBtn');
        if (btn) btn.textContent = '🌓';
    }
};

// ─── Sidebar Management ───────────────────────────────────────────────────────
const DeepSailSidebar = {
    init() {
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('sidebarToggleBtn');
        const mainContent = document.getElementById('mainContent');
        if (!sidebar || !toggleBtn) return;

        // Restore state
        const collapsed = localStorage.getItem('deepsail_sidebar') === 'collapsed';
        if (collapsed) {
            sidebar.classList.add('collapsed');
            mainContent?.classList.add('expanded');
            toggleBtn.textContent = '▶';
            toggleBtn.setAttribute('aria-label', '展开侧边栏');
            toggleBtn.setAttribute('aria-expanded', 'false');
        } else {
            toggleBtn.setAttribute('aria-label', '收起侧边栏');
            toggleBtn.setAttribute('aria-expanded', 'true');
        }

        toggleBtn.onclick = () => {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            mainContent?.classList.toggle('expanded', isCollapsed);
            toggleBtn.textContent = isCollapsed ? '▶' : '◀';
            toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
            toggleBtn.setAttribute('aria-label', isCollapsed ? '展开侧边栏' : '收起侧边栏');
            localStorage.setItem('deepsail_sidebar', isCollapsed ? 'collapsed' : 'expanded');
        };

        // Mobile: collapse on small screens initially
        if (window.innerWidth < 600) {
            sidebar.classList.add('collapsed');
            mainContent?.classList.add('expanded');
            toggleBtn.textContent = '▶';
            toggleBtn.setAttribute('aria-expanded', 'false');
        }
    }
};

// ─── Navbar Management ────────────────────────────────────────────────────────
const DeepSailNavbar = {
    init() {
        const navbar = document.getElementById('navbar');
        const toggle = document.getElementById('navbarToggle');
        if (!navbar || !toggle) return;

        let visible = false;

        const hide = () => {
            navbar.classList.add('hidden');
            navbar.setAttribute('aria-hidden', 'true');
            toggle.textContent = '▼';
            toggle.setAttribute('aria-label', '显示导航栏');
            toggle.setAttribute('aria-expanded', 'false');
            visible = false;
        };

        const show = () => {
            navbar.classList.remove('hidden');
            navbar.setAttribute('aria-hidden', 'false');
            toggle.textContent = '▲';
            toggle.setAttribute('aria-label', '隐藏导航栏');
            toggle.setAttribute('aria-expanded', 'true');
            visible = true;
        };

        toggle.addEventListener('click', () => visible ? hide() : show());
        toggle.setAttribute('aria-controls', 'navbar');

        // Hide on load
        hide();
    }
};

// ─── Dynamic Script Loader ────────────────────────────────────────────────────
const DeepSailLoader = {
    _loaded: new Set(),

    /**
     * Dynamically load a script with optional callback.
     * Uses a promise-based approach for better error handling.
     */
    loadScript(src, id) {
        if (this._loaded.has(src)) return Promise.resolve();
        if (id && document.getElementById(id)) return Promise.resolve();

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            if (id) script.id = id;
            script.onload = () => {
                this._loaded.add(src);
                resolve();
            };
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });
    },

    /**
     * Load Amap SDK dynamically using key from backend.
     * Returns a promise that resolves when AMap is ready.
     */
    async loadAmap(plugins = '') {
        if (window.AMap) return Promise.resolve(window.AMap);

        let key;
        // Try cache first
        const cached = DeepSailCache.get('amap_config');
        if (cached) {
            key = cached.amapKey;
        } else {
            try {
                const res = await fetch('/api/config');
                const config = await res.json();
                key = config.amapKey;
                DeepSailCache.set('amap_config', config, 30 * 60 * 1000); // 30 min
            } catch {
                // Fallback: read from meta tag if set
                const meta = document.querySelector('meta[name="amap-key"]');
                if (meta) key = meta.content;
            }
        }

        if (!key) throw new Error('Amap API key not available');

        const pluginParam = plugins ? `&plugin=${plugins}` : '';
        const src = `https://webapi.amap.com/maps?v=2.0&key=${key}${pluginParam}`;
        return this.loadScript(src, 'amap-sdk').then(() => window.AMap);
    }
};

// ─── Throttle / Debounce ──────────────────────────────────────────────────────
function throttle(fn, delay) {
    let last = 0;
    return (...args) => {
        const now = Date.now();
        if (now - last >= delay) {
            last = now;
            fn(...args);
        }
    };
}

function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// ─── PWA Service Worker Registration ─────────────────────────────────────────
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => {
                    console.debug('[SW] Registered, scope:', reg.scope);
                    // Check for updates
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        newWorker?.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                showUpdateNotification();
                            }
                        });
                    });
                })
                .catch(err => console.warn('[SW] Registration failed:', err));
        });
    }
}

function showUpdateNotification() {
    const banner = document.createElement('div');
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.style.cssText = `
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        background: #202748; color: #fff; padding: 12px 24px; border-radius: 24px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3); z-index: 9999; font-size: 14px;
        display: flex; align-items: center; gap: 12px;
    `;
    banner.innerHTML = `
        <span>🔄 新版本已就绪</span>
        <button onclick="window.location.reload()" style="
            background: #00b4fc; border: none; color: #fff; border-radius: 12px;
            padding: 4px 12px; cursor: pointer; font-size: 13px;
        ">立即更新</button>
        <button onclick="this.parentElement.remove()" style="
            background: none; border: none; color: #aaa; cursor: pointer; font-size: 18px;
        " aria-label="关闭">×</button>
    `;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 10000);
}

// ─── Accessibility: Skip Navigation ──────────────────────────────────────────
function addSkipNavigation() {
    const skip = document.createElement('a');
    skip.href = '#main-content-area';
    skip.textContent = '跳转到主要内容';
    skip.className = 'skip-nav';
    skip.style.cssText = `
        position: absolute; top: -40px; left: 16px;
        background: #00b4fc; color: #fff; padding: 8px 16px;
        border-radius: 4px; text-decoration: none; font-size: 14px;
        z-index: 9999; transition: top 0.2s;
    `;
    skip.addEventListener('focus', () => { skip.style.top = '8px'; });
    skip.addEventListener('blur', () => { skip.style.top = '-40px'; });
    document.body.insertBefore(skip, document.body.firstChild);
}

// ─── Initialize Everything ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    DeepSailPerf.mark('domReady');
    DeepSailPerf.observeWebVitals();
    DeepSailTheme.init();
    DeepSailSidebar.init();
    DeepSailNavbar.init();
    addSkipNavigation();
    registerServiceWorker();
    DeepSailPerf.measure('init complete', 'domReady');
});

// Export for module use
if (typeof module !== 'undefined') {
    module.exports = { DeepSailPerf, DeepSailCache, DeepSailError, DeepSailSkeleton,
                       DeepSailTheme, DeepSailSidebar, DeepSailNavbar, DeepSailLoader,
                       throttle, debounce };
}
