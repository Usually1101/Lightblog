const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const PORT = 1101;

// 数据文件
const DATA_FILE = path.join(__dirname, 'posts.json');
const PASSWORD_FILE = path.join(__dirname, 'public', '9191.txt');
const SALT = 'myblog_salt_2024';

// ===== 密码初始化 =====
function initPasswordFile() {
    const password = 'usually1101';
    const hash = crypto.createHash('sha256').update(password + SALT).digest('hex');
    if (!fs.existsSync(PASSWORD_FILE)) {
        const publicDir = path.dirname(PASSWORD_FILE);
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }
        fs.writeFileSync(PASSWORD_FILE, hash, 'utf8');
        console.log('🔑 密码文件已创建，默认密码: usually1101');
    }
}
initPasswordFile();

// ===== 配置 multer（图片上传） =====
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'public/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('只允许上传图片 (JPEG, PNG, GIF, WEBP)'), false);
        }
    }
});

// ===== 配置 multer（文件上传 - 云盘） =====
const fileStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'public/files');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // 保留原始文件名，如果重名则加时间戳
        const originalName = file.originalname;
        const filePath = path.join(__dirname, 'public/files', originalName);
        if (fs.existsSync(filePath)) {
            const ext = path.extname(originalName);
            const name = path.basename(originalName, ext);
            const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
            cb(null, name + '-' + unique + ext);
        } else {
            cb(null, originalName);
        }
    }
});

const fileUpload = multer({
    storage: fileStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// 中间件
app.use(express.json());
app.use(express.static('public'));

// 禁止直接访问密码文件
app.use('/9191.txt', (req, res) => {
    res.status(403).send('Forbidden');
});

// ===== Token 管理 =====
let validTokens = new Set();

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function verifyToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return false;
    const token = authHeader.split(' ')[1];
    return validTokens.has(token);
}

function authMiddleware(req, res, next) {
    if (req.method === 'GET') {
        return next();
    }
    if (!verifyToken(req)) {
        return res.status(401).json({ message: '请先登录' });
    }
    next();
}

// ===== 辅助函数 =====
function readPosts() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

function writePosts(posts) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2), 'utf8');
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ===== API 路由 =====

// --- 登录 ---
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ message: '请输入密码' });
    }
    const storedHash = fs.readFileSync(PASSWORD_FILE, 'utf8').trim();
    const inputHash = crypto.createHash('sha256').update(password + SALT).digest('hex');
    if (inputHash === storedHash) {
        const token = generateToken();
        validTokens.add(token);
        setTimeout(() => {
            validTokens.delete(token);
        }, 30 * 60 * 1000);
        return res.json({ token, message: '登录成功' });
    } else {
        return res.status(401).json({ message: '密码错误' });
    }
});

app.post('/api/logout', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
        validTokens.delete(token);
    }
    res.json({ message: '已登出' });
});

// --- 文章 API ---
app.get('/api/posts', (req, res) => {
    const posts = readPosts();
    res.json(posts);
});

app.get('/api/posts/:id', (req, res) => {
    const posts = readPosts();
    const post = posts.find(p => p.id === req.params.id);
    if (!post) {
        return res.status(404).json({ message: '文章不存在' });
    }
    res.json(post);
});

app.post('/api/posts', authMiddleware, (req, res) => {
    const { title, summary, tags, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ message: '标题和内容不能为空' });
    }
    const posts = readPosts();
    const newPost = {
        id: generateId(),
        title,
        summary: summary || '',
        tags: tags || [],
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        views: 0,
    };
    posts.push(newPost);
    writePosts(posts);
    res.status(201).json(newPost);
});

app.put('/api/posts/:id', authMiddleware, (req, res) => {
    const { title, summary, tags, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ message: '标题和内容不能为空' });
    }
    const posts = readPosts();
    const index = posts.findIndex(p => p.id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ message: '文章不存在' });
    }
    const updated = {
        ...posts[index],
        title,
        summary: summary || '',
        tags: tags || [],
        content,
        updatedAt: new Date().toISOString(),
    };
    posts[index] = updated;
    writePosts(posts);
    res.json(updated);
});

app.delete('/api/posts/:id', authMiddleware, (req, res) => {
    const posts = readPosts();
    const filtered = posts.filter(p => p.id !== req.params.id);
    if (filtered.length === posts.length) {
        return res.status(404).json({ message: '文章不存在' });
    }
    writePosts(filtered);
    res.status(204).send();
});

// --- 阅读数 API ---
app.get('/api/posts/:id/views', (req, res) => {
    const posts = readPosts();
    const post = posts.find(p => p.id === req.params.id);
    if (!post) {
        return res.status(404).json({ message: '文章不存在' });
    }
    res.json({ views: post.views || 0 });
});

app.post('/api/posts/:id/views', (req, res) => {
    const posts = readPosts();
    const index = posts.findIndex(p => p.id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ message: '文章不存在' });
    }
    posts[index].views = (posts[index].views || 0) + 1;
    writePosts(posts);
    res.json({ views: posts[index].views });
});

// --- 图片上传 ---
app.post('/api/upload', authMiddleware, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: '请选择一张图片' });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ url: imageUrl });
}, (error, req, res, next) => {
    res.status(400).json({ message: error.message });
});

// ============================================================
//  🆕 文件云盘 API
// ============================================================

// --- 获取文件列表 ---
app.get('/api/files', (req, res) => {
    const filesDir = path.join(__dirname, 'public/files');
    if (!fs.existsSync(filesDir)) {
        fs.mkdirSync(filesDir, { recursive: true });
        return res.json([]);
    }
    try {
        const files = fs.readdirSync(filesDir);
        const fileList = files.map(filename => {
            const filePath = path.join(filesDir, filename);
            const stats = fs.statSync(filePath);
            return {
                name: filename,
                size: stats.size,
                sizeFormatted: formatFileSize(stats.size),
                mtime: stats.mtime,
                uploadedAt: stats.birthtime || stats.mtime,
            };
        });
        // 按上传时间倒序排列
        fileList.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        res.json(fileList);
    } catch (err) {
        res.status(500).json({ message: '读取文件列表失败' });
    }
});

// --- 上传文件 ---
app.post('/api/files/upload', authMiddleware, fileUpload.array('files', 20), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: '请选择至少一个文件' });
    }
    const fileInfos = req.files.map(file => ({
        name: file.filename,
        originalName: file.originalname,
        size: file.size,
        sizeFormatted: formatFileSize(file.size),
    }));
    res.json({ message: `成功上传 ${fileInfos.length} 个文件`, files: fileInfos });
}, (error, req, res, next) => {
    res.status(400).json({ message: error.message || '上传失败' });
});

// --- 下载文件 ---
app.get('/api/files/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'public/files', filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: '文件不存在' });
    }
    res.download(filePath, filename);
});

// --- 删除文件 ---
app.delete('/api/files/:filename', authMiddleware, (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'public/files', filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: '文件不存在' });
    }
    try {
        fs.unlinkSync(filePath);
        res.json({ message: '文件已删除' });
    } catch (err) {
        res.status(500).json({ message: '删除失败' });
    }
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`✅ 博客后端已启动：http://localhost:${PORT}`);
    console.log(`📂 数据文件：${DATA_FILE}`);
    console.log(`🔑 密码文件：${PASSWORD_FILE}`);
    console.log(`🖼️ 图片上传目录：public/uploads/`);
    console.log(`📁 文件云盘目录：public/files/`);
    console.log(`🔐 管理密码：usually1101 (已加密存储)`);
});