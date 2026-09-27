import { createServer } from 'node:http';
import { Aedes } from 'aedes';
import { WebSocketServer, createWebSocketStream } from 'ws';

const broker = await Aedes.createBroker();
const server = createServer((req, res) => {
  res.writeHead(req.url === '/health' ? 200 : 404);
  res.end();
});
const sockets = new WebSocketServer({ server, path: '/mqtt' });
sockets.on('connection', (socket, request) => {
  broker.handle(createWebSocketStream(socket), request);
});

server.listen(18888, '127.0.0.1', () => {
  console.log('Test MQTT broker listening on 127.0.0.1:18888');
});

function shutdown() {
  sockets.close();
  server.close();
  broker.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
