const express = require('express');
const app = express();
// const cors = require('cors');
// app.use(cors({origin: 'http://localhost:4200'}));
const server = require('http').Server(app);
const io = require('socket.io')(server, {
  cors: {
    origin: "http://localhost:4200",
    methods: ["GET", "POST"]
  }
});
// app.use(cors());
const port = 3000;


io.on('connection', (socket) => {
  console.log('Backend Sockets established.');

  socket.on("test", (data) => {
    // console.log("Test Socket Emit received: ", data)
    // socket.emit("testResponse", "Hello Client")
  })

  socket.on("vizDo", (data) => {
    socket.broadcast.emit("vizDo", data)
  })
  socket.on("ideDo", (data) => {
    socket.broadcast.emit("ideDo", data)
  })


  

  socket.on("vizDoubleClickOnMesh", (data) => {
    console.log("vizDoubleClickOnMesh: ", data)
    // socket.emit("vizDoubleClickOnMesh_Response", "Hello Client")
  })
  // Add any additional socket event listeners here
});

app.get('/', (req, res) => {
  console.log("/");
  res.send('Hello World!');
});

app.get('/testOne', (req, res) => {
  console.log("/ testOne");
  res.send('testOne');
});

server.listen(port, () => {
  console.log(`Examplee app listening on port ${port}`);
});

module.exports = {
  backend: app,
  port,
  io
}