import { connect, constants as http2constants } from 'node:http2'
import { Http2WebTransportSession } from '../session.js'
import { Http2CapsuleParser } from './capsuleparser.js'
import { logger } from '../../utils.js'

const log = logger(`webtransport:http2:node:client(${process?.pid})`)

export class Http2WebTransportClient {
  /**
   * @param {import('../../types.js').NativeClientOptions} args
   */
  constructor(args) {
    let port = args?.port
    if (typeof port === 'undefined') port = 443
    this.port = Number(port)
    this.hostname = args?.host || 'localhost'
    this.serverCertificateHashes = args?.serverCertificateHashes || undefined
    this.localPort = Number(args?.localPort) || undefined
    this.allowPooling = args?.allowPooling || false
    this.forceIpv6 = args?.forceIpv6 || false
    /** @type {import('../../session.js').HttpClient} */
    // @ts-ignore
    this.jsobj = undefined // the transport will set this
  }

  createTransport() {
    /**
     * @param {import('node:tls').PeerCertificate} cert
     * */
    const webTransportVerifier = (cert) => {
      if (
        this.serverCertificateHashes &&
        this.serverCertificateHashes.some((el) => {
          if (el.algorithm !== 'sha-256') return false
          const cbytes = cert.fingerprint256
            .split(':')
            .map((el) => parseInt(el, 16))
          const val = Buffer.isBuffer(el.value)
            ? el.value
            : new Uint8Array(
                ArrayBuffer.isView(el.value) ? el.value.buffer : el.value
              )
          if (cbytes.length !== val.byteLength) return false
          for (let i = 0; i < val.byteLength; i++) {
            if (val[i] !== cbytes[i]) return false
          }
          const curdate = new Date()

          if (
            new Date(cert.valid_from) > curdate ||
            new Date(cert.valid_to) < curdate
          )
            return false

          const difference =
            new Date(cert.valid_to).getTime() -
            new Date(cert.valid_from).getTime()
          if (difference > 1000 * 60 * 60 * 24 * 14) return false // no more than 14 days spec says.
          return true
        })
      )
        return true
      else return false
    }
    const http2Options = {
      settings: {
        enableConnectProtocol: true,
        customSettings: {
          0x2b60: 1 // SETTINGS_WEBTRANSPORT_MAX_SESSIONS, TODO fix number
        }
      },
      localPort: this.localPort,
      // TODO: REMOVE BEFORE RELEASE; UNSAFE SETTING
      rejectUnauthorized: !this.serverCertificateHashes
    }
    if (this.serverCertificateHashes)
      // @ts-ignore
      http2Options.checkServerIdentity = webTransportVerifier

    // @ts-ignore
    this.clientInt = connect(
      'https://' + this.hostname + ':' + this.port,
      http2Options
    )
    let authfail = false
    this.clientInt.socket.on('secureConnect', () => {
      /** @type {import('node:tls').TLSSocket} */
      // @ts-ignore
      const oursocket = this.clientInt?.socket
      if (!oursocket) throw new Error('Can not get http2 TLSSocket')
      // @ts-ignore
      if (!oursocket.authorized) {
        // ok last hope we have hashes
        if (this.serverCertificateHashes) {
          if (!webTransportVerifier(oursocket.getPeerCertificate())) {
            this.clientInt?.destroy(
              undefined,
              http2constants.NGHTTP2_REFUSED_STREAM
            )
            log('Certificate hash does not match')
            authfail = true
            this.jsobj.onClientConnected({
              success: false
            })
          } else {
            oursocket.authorized = true
          }
        } else {
          this.clientInt?.destroy(
            new Error('Certificate not authorized'),
            http2constants.NGHTTP2_REFUSED_STREAM
          )
          authfail = true
          log('Certificate not authorized')
          this.jsobj.onClientConnected({
            success: false
          })
        }
      }
    })
    let connected = false
    this.clientInt.on('connect', (session, socket) => {
      if (!authfail) {
        connected = true
        this.jsobj.onClientConnected({
          success: true
        })
      }
    })
    this.clientInt.on('error', (error) => {
      log('http2 client error:', error)
      if (!connected && !authfail) {
        this.jsobj.onClientConnected({
          success: false
        })
      }
    })
    this.clientInt.on('remoteSettings', (settings) => {
      if (settings.enableConnectProtocol && this.clientInt) {
        // if (settings.webtansportmaxsessions)
        // eslint-disable-next-line no-lone-blocks
        {
          const retObj = {}
          this.jsobj.onClientWebTransportSupport(retObj)
        }
      }
    })
  }

  /**
   * @param {string} path
   */
  openWTSession(path) {
    if (!this.clientInt) throw new Error('clientInt not present')

    const stream = this.clientInt.request({
      ':method': 'CONNECT',
      ':protocol': 'webtransport',
      ':scheme': 'https',
      ':path': path,
      authority: this.hostname,
      origin: this.hostname
    })

    const retObj = {
      header: stream.sentHeaders,
      session: new Http2WebTransportSession({
        stream,
        isclient: true,
        createParser: (/** @type {Http2WebTransportSession} */ nativesession) =>
          new Http2CapsuleParser({
            stream,
            nativesession,
            isclient: true
          })
      }),
      reliable: true
    }
    this.jsobj.onHttpWTSessionVisitor(retObj)
  }

  closeClient() {
    if (this.clientInt) this.clientInt.close()
  }
}