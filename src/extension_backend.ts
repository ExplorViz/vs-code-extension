import express from 'express';
import {Server} from 'socket.io';
import http from 'http';

const backend = express();
const server = http.createServer(backend);

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:4200',
    methods: ['GET', 'POST'],
  },
});

// const io = new Server(server)
const port = 3000;

io.on('connection', (socket) => {
  console.log('Backend Sockets established.');

  socket.on('test', (data) => {
    // console.log("Test Socket Emit received: ", data)
    // socket.emit("testResponse", "Hello Client")
  });

  socket.on('vizDo', (data) => {
    socket.broadcast.emit('vizDo', data);
  });
  socket.on('ideDo', (data) => {
    console.log("ideDo")
    socket.broadcast.emit('ideDo', data);
  });

  socket.on('vizDoubleClickOnMesh', (data) => {
    console.log('vizDoubleClickOnMesh: ', data);
    // socket.emit("vizDoubleClickOnMesh_Response", "Hello Client")
  });
  // Add any additional socket event listeners here
});

backend.get('/', (req, res) => {
  console.log('/');
  res.send('Hello World!');
});

backend.get('/testOne', (req, res) => {
  console.log('/ testOne');
  res.send('testOne');
});

server.listen(port, () => {
  console.log(`Example backend listening on port ${port}`);
});

export { backend, port, io };