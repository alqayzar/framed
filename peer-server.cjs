const { PeerServer } = require('peer')

const PORT = Number(process.env.PEER_SERVER_PORT) || 9000
const PATH = '/framed'

const peerServer = PeerServer({ port: PORT, path: PATH })

peerServer.on('connection', (client) => {
  console.log(`[peer-server] connected: ${client.getId()}`)
})

peerServer.on('disconnect', (client) => {
  console.log(`[peer-server] disconnected: ${client.getId()}`)
})
