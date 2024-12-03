const express = require('express');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const cron = require('node-cron');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());

// Event Storage (in-memory)
let events = [];

// WebSocket Server
const wss = new WebSocket.Server({ port: 8080 });

// Utility Function: Save completed events to file
const logEventToFile = (event) => {
    const logData = JSON.stringify(event) + '\n';
    fs.appendFile('event-log.json', logData, (err) => {
        if (err) console.error('Failed to log event:', err);
    });
};

// Endpoints

// Add Event
app.post('/events', (req, res) => {
    const { title, description, scheduledTime } = req.body;
    const parsedTime = new Date(scheduledTime);

    if (isNaN(parsedTime.getTime()) || parsedTime <= new Date()) {
        return res.status(400).json({ error: 'Invalid or past scheduled time.' });
    }

    const event = {
        id: Date.now(),
        title,
        description,
        scheduledTime: parsedTime,
        status: 'upcoming',
    };

    events.push(event);
    events.sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));
    res.status(201).json(event);
});

// Get Events
app.get('/events', (req, res) => {
    res.status(200).json(events.filter((e) => e.status === 'upcoming'));
});

// WebSocket Notification
wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket.');
    ws.on('close', () => {
        console.log('Client disconnected from WebSocket.');
    });
});

// Scheduler: Check for events to notify or log
cron.schedule('* * * * *', () => {
    const now = new Date();

    events.forEach((event) => {
        const eventTime = new Date(event.scheduledTime);

        // Notify users 5 minutes before an event starts
        if (eventTime - now <= 5 * 60 * 1000 && eventTime - now > 0 && event.status === 'upcoming') {
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ message: `Upcoming event: ${event.title}` }));
                }
            });
        }

        // Log and mark events that have completed
        if (eventTime <= now && event.status === 'upcoming') {
            event.status = 'completed';
            logEventToFile(event);
        }
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
});
