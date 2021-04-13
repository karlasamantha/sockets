const http = require('http')
const path = require('path')
const express = require('express')
const socketIO = require('socket.io')
const needle = require('needle')
const config = require('dotenv').config

const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN
const PORT = process.env.PORT || 3000

// We use express to redirect our application quickly to our client file
const app = express()
const server = http.createServer(app)
const io = socketIO(server)

// Redirect
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../', 'client', 'index.html'))
})

// Base URLS for application
const rulesURL = 'https://api.twitter.com/2/tweets/search/stream/rules'
const streamURL = 'https://api.twitter.com/2/tweets/search/stream?tweets.fields=public_metric&expansions=author_id'

// Set of twitter rules
const rules = [{ values: 'flamengo' }]

// Get stream rules
async function getRules() {
  const response = await needle('get', rulesURL, {
    headers: {
      Authorization: `Bearer ${BEARER_TOKEN}`,
    }
  })
  console.log(response.body)
  return response.body
}

// Set stream based on rules array
async function setRules() {
  const data = {
    add: rules,
  }

  const response = await needle('post', rulesURL, data, {
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${BEARER_TOKEN}`,
    }
  })

  return response.body
}

// Delete stream rules
async function deleteRules(rules) {
  if (!Array.isArray(rules.data)) {
    return null
  }

  // We create a new array of ids, this way we can identify which rule to delete
  const ids = rules.data.map((rule) => rule.id)

  const data = {
    delete: {
      ids,
    }
  }

  const response = await needle('post', rulesURL, data, {
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${BEARER_TOKEN}`,
    }
  })

  return response.body
}

// Start stream of tweet data
function streamTweets(socket) {
  const stream = needle.get(streamURL, {
    headers: {
      Authorization: `Bearer ${BEARER_TOKEN}`,
    }
  })

  stream.on('data', (data) => {
    try {
      const json = JSON.parse(data)
      socket.emit('tweet', json)
    } catch (error) {
      console.error(error)
    }
  })

  return stream
}

// Start connection with client
io.on('connection', async () => {
  console.info('Client connected!')

  let currentRules

  try {
    currentRules = await getRules()
    // Remove all rules
    await deleteRules(currentRules)
    // Set rules based on current rules
    await setRules()
  } catch (error) {
    console.error(error)
    process.exit(1)
  }

  const filteredStream = streamTweets(io)

  let timeout = 0
  filteredStream.on('timeout', () => {
    // Reconnect if error
    console.warn('A connection error occurred. Trying to reconnect')
    setTimeout(() => {
      timeout++
      streamTweets(io)
    }, 2 ** timeout)
    streamTweets(io)  
  })
})

server.listen(PORT, () => console.info(`Listening on port ${PORT}`))