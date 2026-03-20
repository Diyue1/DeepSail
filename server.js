/**
 * DeepSail - Backend Server
 * Handles API key management and proxying to external APIs
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security & Performance Middleware ───────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://webapi.amap.com",
                "https://cdn.jsdelivr.net",
                "https://unpkg.com",
                "https://api.mapbox.com",
                "https://api.dicebear.com"
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
                "https://api.mapbox.com"
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
            frameSrc: [
                "https://embed.windy.com",
                "https://www.hws945.com",
                "http://www.nmc.cn",
                "http://www.oceanguide.org.cn"
            ],
            connectSrc: [
                "'self'",
                "https://webapi.amap.com",
                "https://restapi.amap.com",
                "https://api.shipxy.com",
                "https://unpkg.com"
            ]
        }
    },
    // Allow iframes from external sources
    frameguard: false
}));

app.use(compression());
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? ['http://localhost:3000']
        : true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// ─── Static File Serving with Cache Headers ──────────────────────────────────
app.use(express.static(path.join(__dirname), {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        // Cache HTML files for shorter duration
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
        }
        // Cache JS/CSS/images longer
        if (filePath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
        }
    }
}));

// ─── API Routes ──────────────────────────────────────────────────────────────

/**
 * GET /api/config
 * Returns non-sensitive client configuration including map API key.
 * Key is kept server-side to avoid hardcoding in client HTML files.
 */
app.get('/api/config', (req, res) => {
    res.json({
        amapKey: process.env.AMAP_KEY,
        version: '1.0.0'
    });
});

/**
 * GET /api/route?start=CNSHG&end=CNGZG
 * Proxies route planning requests to ShipXY API (keeps API key server-side).
 */
app.get('/api/route', async (req, res) => {
    const { start, end } = req.query;

    if (!start || !end) {
        return res.status(400).json({ error: '缺少起点或终点参数' });
    }

    // Basic input validation
    if (!/^[A-Z]{2}[A-Z0-9]{3,5}$/.test(start) || !/^[A-Z]{2}[A-Z0-9]{3,5}$/.test(end)) {
        return res.status(400).json({ error: '无效的港口代码格式' });
    }

    const cacheKey = `route_${start}_${end}`;

    try {
        const url = `https://api.shipxy.com/apicall/v3/PlanRouteByPort?key=${process.env.SHIPXY_KEY}&start_port_code=${start}&end_port_code=${end}`;
        const response = await fetch(url, { timeout: 10000 });
        const data = await response.json();

        if (data.status !== 0) {
            return res.status(502).json({
                error: `API错误: ${data.msg || '未知错误'}`,
                status: data.status
            });
        }

        // Add cache headers for route data
        res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
        res.json(data);
    } catch (err) {
        console.error('ShipXY proxy error:', err.message);
        res.status(503).json({ error: '航线服务暂时不可用，请稍后重试' });
    }
});

/**
 * GET /api/weather?city=上海
 * Proxies Amap weather requests (keeps API key server-side).
 */
app.get('/api/weather', async (req, res) => {
    const { city, adcode } = req.query;

    if (!city && !adcode) {
        return res.status(400).json({ error: '缺少城市或区域代码参数' });
    }

    try {
        const param = adcode ? `adcode=${adcode}` : `city=${encodeURIComponent(city)}`;
        const url = `https://restapi.amap.com/v3/weather/weatherInfo?key=${process.env.AMAP_KEY}&${param}&extensions=all&output=json`;
        const response = await fetch(url, { timeout: 8000 });
        const data = await response.json();

        res.setHeader('Cache-Control', 'public, max-age=600'); // 10 minutes
        res.json(data);
    } catch (err) {
        console.error('Amap weather proxy error:', err.message);
        res.status(503).json({ error: '气象服务暂时不可用' });
    }
});

// ─── Health Check ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV
    });
});

// ─── 404 & Error Handling ────────────────────────────────────────────────────
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: '接口不存在' });
    }
    next();
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: '服务器内部错误' });
});

// ─── Start Server ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════╗
║  DeepSail 远洋导航系统 - 服务已启动   ║
╠═══════════════════════════════════════╣
║  地址: http://localhost:${PORT}           ║
║  环境: ${(process.env.NODE_ENV || 'development').padEnd(29)}  ║
╚═══════════════════════════════════════╝
    `.trim());
});

module.exports = app;
