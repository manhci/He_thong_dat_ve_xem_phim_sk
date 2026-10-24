const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5001;
const LOG_FILE = path.join(__dirname, 'alerts.log');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Healthcheck endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'alert-sink', timestamp: new Date().toISOString() });
});

// Webhook endpoint for Grafana Alerting
app.post(['/', '/webhook'], (req, res) => {
  const timestamp = new Date().toISOString();
  const alertData = req.body;
  const status = alertData.status || 'unknown';
  const alerts = alertData.alerts || [];

  console.log(`================================================================================`);
  console.log(`[ALERT RECEIVED AT ${timestamp}] Status: ${status.toUpperCase()} | Count: ${alerts.length}`);
  
  alerts.forEach((alt, idx) => {
    const alertName = alt.labels ? alt.labels.alertname : 'UnknownAlert';
    const severity = alt.labels ? alt.labels.severity : 'unknown';
    const summary = alt.annotations ? alt.annotations.summary : '';
    const desc = alt.annotations ? alt.annotations.description : '';
    console.log(`  Alert #${idx + 1}: [${severity.toUpperCase()}] ${alertName}`);
    console.log(`  Summary: ${summary}`);
    console.log(`  Description: ${desc}`);
  });
  console.log(`================================================================================`);

  // Append to log file
  const logEntry = JSON.stringify({ timestamp, alertData }) + '\n';
  fs.appendFile(LOG_FILE, logEntry, (err) => {
    if (err) console.error('[ALERT-SINK] Error writing to alerts.log:', err);
  });

  res.status(200).json({ status: 'received', alerts_count: alerts.length });
});

// Start Express Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ALERT-SINK] Server listening on port ${PORT} (non-root unprivileged)`);
});
