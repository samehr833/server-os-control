const express = require('express');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ================ APIs (بدون حماية) ================

// 1. إحصائيات النظام
app.get('/api/stats', (req, res) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    cpus.forEach(cpu => {
        for (let type in cpu.times) {
            total += cpu.times[type];
        }
        idle += cpu.times.idle;
    });
    
    const stats = {
        cpu: {
            usage: ((1 - idle / total) * 100).toFixed(1),
            cores: cpus.length,
            model: cpus[0]?.model || 'Unknown',
            loadAvg: os.loadavg()
        },
        ram: {
            total: (totalMem / 1024 / 1024 / 1024).toFixed(2),
            used: (usedMem / 1024 / 1024 / 1024).toFixed(2),
            free: (freeMem / 1024 / 1024 / 1024).toFixed(2),
            percent: ((usedMem / totalMem) * 100).toFixed(1)
        },
        uptime: os.uptime(),
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch()
    };
    
    exec('df -h /', (error, stdout) => {
        if (!error && stdout) {
            const lines = stdout.trim().split('\n');
            if (lines[1]) {
                const parts = lines[1].split(/\s+/);
                stats.disk = {
                    total: parts[1],
                    used: parts[2],
                    free: parts[3],
                    percent: parts[4]
                };
            }
        }
        res.json(stats);
    });
});

// 2. قائمة العمليات
app.get('/api/processes', (req, res) => {
    exec('ps aux --sort=-%cpu | head -20', (error, stdout) => {
        if (error) {
            res.json({ error: error.message });
        } else {
            const lines = stdout.trim().split('\n');
            const processes = lines.slice(1).map(line => {
                const parts = line.trim().split(/\s+/);
                return {
                    user: parts[0],
                    pid: parts[1],
                    cpu: parts[2],
                    mem: parts[3],
                    command: parts.slice(10).join(' ')
                };
            });
            res.json({ processes });
        }
    });
});

// 3. قتل عملية
app.post('/api/kill/:pid', (req, res) => {
    const pid = req.params.pid;
    exec(`kill -9 ${pid}`, (error) => {
        res.json({ success: !error, error: error?.message });
    });
});

// 4. مستكشف الملفات
app.get('/api/listdir', (req, res) => {
    let dirPath = req.query.path || process.env.HOME || '/home';
    
    if (dirPath.includes('..') || dirPath.includes('/etc/passwd')) {
        return res.status(403).json({ error: 'ممنوع' });
    }
    
    fs.readdir(dirPath, { withFileTypes: true }, (err, files) => {
        if (err) {
            res.json({ error: err.message });
        } else {
            const items = files.map(file => ({
                name: file.name,
                isDirectory: file.isDirectory(),
                path: path.join(dirPath, file.name)
            }));
            res.json({ currentPath: dirPath, items });
        }
    });
});

// 5. قراءة ملف
app.get('/api/readfile', (req, res) => {
    const filePath = req.query.path;
    if (!filePath || filePath.includes('..')) {
        return res.status(403).json({ error: 'ممنوع' });
    }
    
    fs.readFile(filePath, 'utf8', (err, content) => {
        if (err) {
            res.json({ error: err.message });
        } else {
            res.json({ content, path: filePath });
        }
    });
});

// 6. كتابة ملف
app.post('/api/writefile', (req, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath || filePath.includes('..')) {
        return res.status(403).json({ error: 'ممنوع' });
    }
    
    fs.writeFile(filePath, content, 'utf8', (err) => {
        res.json({ success: !err, error: err?.message });
    });
});

// 7. إنشاء مجلد
app.post('/api/mkdir', (req, res) => {
    const { path: dirPath } = req.body;
    if (!dirPath || dirPath.includes('..')) {
        return res.status(403).json({ error: 'ممنوع' });
    }
    
    fs.mkdir(dirPath, { recursive: true }, (err) => {
        res.json({ success: !err, error: err?.message });
    });
});

// 8. حذف ملف أو مجلد
app.post('/api/delete', (req, res) => {
    const { path: targetPath } = req.body;
    if (!targetPath || targetPath.includes('..')) {
        return res.status(403).json({ error: 'ممنوع' });
    }
    
    fs.rm(targetPath, { recursive: true, force: true }, (err) => {
        res.json({ success: !err, error: err?.message });
    });
});

// 9. رفع ملف
app.post('/api/upload', express.raw({ type: '*/*', limit: '100mb' }), (req, res) => {
    const filePath = req.query.path;
    if (!filePath || filePath.includes('..')) {
        return res.status(403).json({ error: 'ممنوع' });
    }
    
    fs.writeFile(filePath, req.body, (err) => {
        if (err) {
            res.json({ success: false, error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// 10. تشغيل أوامر
app.post('/api/exec', (req, res) => {
    const { command } = req.body;
    if (!command) {
        return res.status(400).json({ error: 'لا يوجد أمر' });
    }
    
    exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        res.json({
            success: !error,
            output: stdout || stderr || error?.message || ''
        });
    });
});

// 11. سجل الأوامر
app.get('/api/logs', (req, res) => {
    const logsPath = path.join(__dirname, 'logs.txt');
    try {
        if (fs.existsSync(logsPath)) {
            const logs = fs.readFileSync(logsPath, 'utf8');
            const lines = logs.trim().split('\n').reverse().slice(0, 100);
            res.json({ logs: lines });
        } else {
            res.json({ logs: [] });
        }
    } catch {
        res.json({ logs: [] });
    }
});

// 12. الخدمات
app.get('/api/services', (req, res) => {
    exec('systemctl list-units --type=service --all --no-pager 2>/dev/null | head -30', (error, stdout) => {
        if (error || !stdout) {
            res.json({ services: [] });
        } else {
            const lines = stdout.trim().split('\n');
            const services = [];
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].trim().split(/\s+/);
                if (parts.length >= 4) {
                    services.push({
                        name: parts[0],
                        active: parts[2] === 'active' ? 'active' : 'inactive',
                        sub: parts[3]
                    });
                }
            }
            res.json({ services: services.slice(0, 30) });
        }
    });
});

app.post('/api/service/:action/:name', (req, res) => {
    const { action, name } = req.params;
    exec(`systemctl ${action} ${name} 2>/dev/null`, (error) => {
        res.json({ success: !error });
    });
});

// 13. معلومات الشبكة
app.get('/api/network', (req, res) => {
    const interfaces = os.networkInterfaces();
    res.json({ interfaces });
});

// 14. إعادة تشغيل
app.post('/api/restart', (req, res) => {
    res.json({ message: 'جاري إعادة التشغيل...' });
    setTimeout(() => process.exit(0), 1000);
});

// ================ الصفحة الرئيسية (مباشرة بدون تسجيل) ================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'desktop.html'));
});

app.listen(PORT, () => {
    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║   🖥️  Server OS - Remote Control      ║`);
    console.log(`║   يعمل على: http://localhost:${PORT}     ║`);
    console.log(`║   فتح على طول بدون تسجيل دخول        ║`);
    console.log(`╚════════════════════════════════════════╝\n`);
});