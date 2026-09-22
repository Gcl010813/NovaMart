const cluster = require('cluster');
const os = require('os');

// ==================== 主进程：负责调度 ====================
if (cluster.isMaster) {
    const numCPUs = os.cpus().length;
    console.log(`Master ${process.pid} is running, forking ${numCPUs} workers...`);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died. Restarting...`);
        cluster.fork();
    });
} else {
    // ==================== 子进程：核心业务逻辑 ====================
    const express = require('express');
    const mysql = require('mysql2/promise');
    const { createClient } = require('redis');
    const amqp = require('amqplib');
    const client = require('prom-client');

    const app = express();
    app.use(express.json());

    // 1. 基础连接
    const pool = mysql.createPool({
        host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME, waitForConnections: true, connectionLimit: 10, // 每个 Worker 限制 10 个连接
    });

    const redisClient = createClient({ url: `redis://${process.env.REDIS_HOST}:6379` });
    redisClient.on('error', (err) => console.error('Redis Error', err));
    redisClient.connect().then(() => console.log(`Worker ${process.pid} Redis connected`));

    // 2. Prometheus 监控埋点
    client.collectDefaultMetrics({ timeout: 5000 });
    const httpRequestDuration = new client.Histogram({
        name: 'http_request_duration_ms', help: 'Duration of HTTP requests in ms',
        labelNames: ['method', 'route', 'status_code'],
        buckets: [10, 50, 100, 200, 500, 1000, 2000]
    });
    app.use((req, res, next) => {
        const end = httpRequestDuration.startTimer();
        res.on('finish', () => end({ method: req.method, route: req.route ? req.route.path : req.path, status_code: res.statusCode }));
        next();
    });
    app.get('/metrics', async (req, res) => {
        res.set('Content-Type', client.register.contentType);
        res.end(await client.register.metrics());
    });

    // 3. RabbitMQ 消费者（每个 Worker 独立消费，分摊压力）
    let channel;
    const QUEUE_NAME = 'order_queue';
    const BATCH_SIZE = 100;
    let messageBuffer = [];
    let batchTimer = null;

    const flushBatch = async () => {
        if (messageBuffer.length === 0) return;
        const currentBatch = [...messageBuffer];
        messageBuffer = [];
        if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }

        const values = currentBatch.map(msg => [msg.userId, msg.totalAmount, msg.productId, msg.quantity, msg.price]);
        try {
            await pool.query('INSERT INTO orders (user_id, total_amount, status) VALUES ?', [currentBatch.map(m => [m.userId, m.totalAmount, 0])]);
            // 简化处理，实际需关联 order_id，这里为了演示批量插入
            currentBatch.forEach(msg => channel.ack(msg.originalMsg));
            console.log(`[Worker ${process.pid}] Inserted ${currentBatch.length} orders`);
        } catch (err) {
            console.error('Batch insert failed:', err);
            currentBatch.forEach(msg => channel.nack(msg.originalMsg, false, false));
        }
    };

    async function connectRabbitMQ() {
        try {
            const connection = await amqp.connect(`amqp://${process.env.RABBITMQ_HOST}:5672`);
            channel = await connection.createChannel();
            await channel.assertQueue(QUEUE_NAME, { durable: true });
            await channel.prefetch(BATCH_SIZE);

            channel.consume(QUEUE_NAME, async (msg) => {
                if (msg !== null) {
                    const data = JSON.parse(msg.content.toString());
                    messageBuffer.push({ ...data, originalMsg: msg });
                    if (messageBuffer.length >= BATCH_SIZE) await flushBatch();
                    else if (!batchTimer) batchTimer = setTimeout(flushBatch, 500);
                }
            });
            console.log(`Worker ${process.pid} RabbitMQ consumer ready`);
        } catch (err) {
            console.error('RabbitMQ connection failed, retrying...', err.message);
            setTimeout(connectRabbitMQ, 5000);
        }
    }
    connectRabbitMQ();

    // 4. 核心业务接口（完全保留之前的逻辑）
    app.get('/api/users/:id', async (req, res) => {
        const userId = req.params.id;
        const cacheKey = `user:${userId}`;
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached) return res.json({ source: 'redis', data: JSON.parse(cached) });
            const [rows] = await pool.query('SELECT id, username, email, phone FROM users WHERE id = ?', [userId]);
            if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
            await redisClient.setEx(cacheKey, 60, JSON.stringify(rows[0]));
            res.json({ source: 'mysql', data: rows[0] });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.get('/api/products/:id', async (req, res) => {
        const productId = req.params.id;
        const cacheKey = `product:${productId}`;
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached) return res.json({ source: 'redis', data: JSON.parse(cached) });
            const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [productId]);
            if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
            await redisClient.setEx(cacheKey, 60, JSON.stringify(rows[0]));
            res.json({ source: 'mysql', data: rows[0] });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/api/order/sync', async (req, res) => {
        const { userId, productId, quantity } = req.body;
        try {
            const [product] = await pool.query('SELECT price, stock FROM products WHERE id = ?', [productId]);
            if (product.length === 0 || product[0].stock < quantity) return res.status(400).json({ error: 'Out of stock' });
            const totalAmount = product[0].price * quantity;
            const [orderResult] = await pool.query('INSERT INTO orders (user_id, total_amount, status) VALUES (?, ?, 0)', [userId, totalAmount]);
            await pool.query('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)', [orderResult.insertId, productId, quantity, product[0].price]);
            await pool.query('UPDATE products SET stock = stock - ? WHERE id = ?', [quantity, productId]);
            res.json({ code: 200, message: 'sync order success', orderId: orderResult.insertId });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/api/order/async', async (req, res) => {
        if (!channel) return res.status(503).json({ error: 'MQ not ready' });
        const { userId, productId, quantity } = req.body;
        try {
            const msg = JSON.stringify({ userId, productId, quantity, totalAmount: 100, price: 100 });
            channel.sendToQueue(QUEUE_NAME, Buffer.from(msg), { persistent: true });
            res.json({ code: 200, message: 'async order accepted' });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.listen(3000, '0.0.0.0', () => {
        console.log(`Worker ${process.pid} listening on port 3000`);
    });
}