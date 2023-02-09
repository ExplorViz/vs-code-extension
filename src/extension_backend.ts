import express from 'express';
import {Server} from 'socket.io';
import http from 'http';
import { IDEApiCall, IDEApiDest } from './types';

const backend = express();
const server = http.createServer(backend);
const maxHttpBufferSize = 1e8;

const port = 3000;
const corsExplorVizHttp = 'http://localhost:4200'


const io = new Server(server, {
  maxHttpBufferSize: maxHttpBufferSize,
  cors: {
    origin: corsExplorVizHttp,
    methods: ['GET', 'POST'],
  },
});

// const io = new Server(server)

console.log("Max http buffer size for Socket data: " + (maxHttpBufferSize / 1e6) + "mb")
io.on('connection', (socket) => {
  console.log('Backend Sockets established.');

  socket.on('test', (data) => {
    // console.log("Test Socket Emit received: ", data)
    // socket.emit("testResponse", "Hello Client")
  });

  socket.on(IDEApiDest.VizDo, (data: IDEApiCall) => {
    // console.log("vizDo")
    // console.log(data)
    socket.broadcast.emit(IDEApiDest.VizDo, data);
  });
  socket.on(IDEApiDest.IDEDo, (data: IDEApiCall) => {
    // console.log("ideDo")
    // console.log(data)
    socket.broadcast.emit(IDEApiDest.IDEDo, data);
  });

  socket.on('vizDoubleClickOnMesh', (data) => {
    console.log('vizDoubleClickOnMesh: ', data);
    // socket.emit("vizDoubleClickOnMesh_Response", "Hello Client")
  });


  socket.on('disconnect', (reason) => {

    console.error(`Socket disconnected, reason: ${reason}`);
    console.error(`Possible solution: Increase current maxHttpBufferSize of ` + (maxHttpBufferSize / 1e6) + "mb");
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