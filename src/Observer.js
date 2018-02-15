import Emitter from './Emitter'

export default class {
  constructor (connectionUrl, Vue, opts = {}) {
    this.format = opts.format && opts.format.toLowerCase()
    this.connectionUrl = connectionUrl
    this.opts = opts

    this.reconnection = this.opts.reconnection || false
    this.reconnectionAttempts = this.opts.reconnectionAttempts || Infinity
    this.reconnectionDelay = this.opts.reconnectionDelay || 1000
    this.reconnectTimeoutId = 0
    this.reconnectionCount = 0

    if (opts.store) { this.store = opts.store }

    this.autoConnect = this.opts.autoConnect === undefined ? true : opts.autoConnect
    if (this.autoConnect) {
      this.connect()
    }

    Vue.prototype.$socket = this
  }

  connect () {
    this.autoConnect = true
    let opts = this.opts
    let protocol = opts.protocol || ''
    let connectionUrl = this.connectionUrl
    this.WebSocket = opts.WebSocket || (protocol === '' ? new WebSocket(connectionUrl) : new WebSocket(connectionUrl, protocol))
    this.onEvent()
    return this.WebSocket
  }

  reconnect () {
    if (!this.autoConnect) {
      return
    }

    if (this.reconnectionCount <= this.reconnectionAttempts) {
      this.reconnectionCount++
      clearTimeout(this.reconnectTimeoutId)

      this.reconnectTimeoutId = setTimeout(() => {
        if (this.store) { this.passToStore('SOCKET_RECONNECT', this.reconnectionCount) }
        this.connect()
      }, this.reconnectionDelay)
    } else {
      if (this.store) { this.passToStore('SOCKET_RECONNECT_ERROR', true) }
    }
  }

  send (msg) {
    if (this.WebSocket) {
      this.WebSocket.send(msg)
    }
  }

  sendObj (obj) {
    if (this.WebSocket) {
      this.WebSocket.send(JSON.stringify(obj))
    }
  }

  close () {
    if (this.WebSocket) {
      this.WebSocket.close()
    }
    this.autoConnect = false
  }

  onEvent () {
    ['onmessage', 'onclose', 'onerror', 'onopen'].forEach((eventType) => {
      this.WebSocket[eventType] = (event) => {
        Emitter.emit(eventType, event)

        if (this.store) { this.passToStore('SOCKET_' + eventType, event) }

        if (this.reconnection && eventType === 'onopen') { this.reconnectionCount = 0 }

        if (this.reconnection && eventType === 'onclose') { this.reconnect() }
      }
    })
  }

  passToStore (eventName, event) {
    if (!eventName.startsWith('SOCKET_')) { return }
    let method = 'commit'
    let target = eventName.toUpperCase()
    let msg = event
    if (this.format === 'json' && event.data) {
      msg = JSON.parse(event.data)
      if (msg.mutation) {
        target = [msg.namespace || '', msg.mutation].filter((e) => !!e).join('/')
      } else if (msg.action) {
        method = 'dispatch'
        target = [msg.namespace || '', msg.action].filter((e) => !!e).join('/')
      }
    }
    this.store[method](target, msg)
  }
}
