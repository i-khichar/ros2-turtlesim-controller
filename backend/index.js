const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const ROSLIB = require('roslib');
const { MongoClient } = require('mongodb');
require('dotenv').config()

const app = express();
app.use(bodyParser.json());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 8080;
const WS_PORT = 9091; // frontend connects here

const MONGO_URI = process.env.MONGO_URI
const DATABASE_NAME = process.env.DATABASE_NAME
const COLLECTION_NAME = process.env.COLLECTION_NAME

let mongoClient;

async function connectToMongo() {
  mongoClient = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
  try {
    await mongoClient.connect();
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}

connectToMongo();


const ros = new ROSLIB.Ros({
  url: 'ws://localhost:9090' // rosbridge websocket
});

ros.on('connection', () => {
  console.log('Connected to ROS bridge');
});

ros.on('error', (err) => {
  console.error('Error connecting to ROS bridge:', err);
});

ros.on('close', () => {
  console.log('Connection to ROS bridge closed.');
});

const poseListener = new ROSLIB.Topic({
  ros: ros,
  name: '/turtle1/pose',
  messageType: 'turtlesim/Pose'
});
poseListener.subscribe((pose) => {
  //console.log('Turtle pose:', pose);
  // Here you can send the pose data to the frontend if needed
  const message = JSON.stringify({
    type: 'pose',
    x: pose.x,
    y: pose.y
  });

  // Broadcast the pose to all connected frontend clients
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
});

// Save path to mongo
app.post('/api/savePath', async (req, res) => {
  try {
    const { pathName, trail, startStation, endStation } = req.body;

    const coordinates = trail.map(p => [p.distance, p.rotation]);
    const db = mongoClient.db(DATABASE_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const pathDoc = {
      name: pathName,
      path: {
        type: "LineString",
        coordinates: coordinates
      },
      startStation: startStation,
      endStation: endStation,
      createdAt: new Date()
    };

    const result = await collection.insertOne(pathDoc);

    console.log('Saved path with ID:', result.insertedId);

    res.json({ message: 'Path saved!', id: result.insertedId });
  } catch (err) {
    console.error('Error saving path:', err);
    res.status(500).json({ error: 'Failed to save path' });
  }
});


// Publisher to teleport turtle
const teleportPublisher = new ROSLIB.Service({
  ros: ros,
  name: '/turtle1/teleport_absolute',
  serviceType: 'turtlesim/srv/TeleportAbsolute'
});

//Publisher to move turtle
const velocityPublisher = new ROSLIB.Topic({
  ros: ros,
  name: '/turtle1/cmd_vel',
  messageType: 'geometry_msgs/Twist'
});


wss.on('connection', (ws) => {
  console.log('Frontend connected to backend websocket.');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Expect data: { x, y, theta }
      if (data.type === 'teleport') {
        console.log('Received from frontend:', data);
        const request = new ROSLIB.ServiceRequest({
          x: data.x,
          y: data.y,
          theta: data.theta || 0
        });

        teleportPublisher.callService(request, (result) => {
          console.log('Turtle teleported:', result);
        });

      }

      if(data.type === 'move') {
        console.log('Received from frontend:', data);

        const twist = new ROSLIB.Message({
          linear: { x: data.linearX, y: 0, z: 0 },
          angular: { x: 0, y: 0, z: data.angularZ }
        });
        velocityPublisher.publish(twist);
        console.log('Turtle moved:', result);
      }

    } catch (err) {
      console.error('Invalid message received:', err);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
