import {ReadableStream} from 'node:stream/web'
import {Readable} from 'node:stream'
import test from 'ava'
import {
  startServer,
  stopServer,
  sendRequest as sendRequestBase,
  compose,
  Logger,
} from 'passing-notes'
import serveUi from 'passing-notes-ui'
import {openChrome} from 'puppet-strings-chrome'
import {closeBrowser, findElement, openTab} from 'puppet-strings'
import * as sse from './index.js'

test('sending and receiving server-sent events', async (t) => {
  const server = await startServer(
    {port: 10_000},
    compose(sse.serialize, () => () => ({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
      },
      body: new ReadableStream({
        async start(controller) {
          controller.enqueue({data: 'One!'})
          controller.enqueue({data: 'Two!'})
          controller.enqueue({data: 'Multiple\nLines'})
          controller.close()
        },
      }),
    })),
  )
  t.teardown(() => {
    stopServer(server)
  })

  const sendRequest = compose(sse.deserialize, () => sendRequestBase)

  const response = await sendRequest({
    method: 'GET',
    url: 'http://localhost:10000',
  })

  const events = []
  for await (const event of response.body) {
    events.push(event)
  }

  t.deepEqual(events, [
    {data: 'One!'},
    {data: 'Two!'},
    {data: 'Multiple\nLines'},
  ])
})

test('sending and receiving server-sent events in the browser', async (t) => {
  const logger = new Logger()
  logger.on('log', (log) => {
    t.log(log)
  })

  const server = await startServer(
    {port: 10_004},
    compose(
      sse.serialize,
      (next) => (request) => {
        if (request.url !== '/events') {
          return next(request)
        }

        return {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
          },
          body: new ReadableStream({
            async start(controller) {
              controller.enqueue({data: 'One!'})
              controller.enqueue({data: 'Two!'})
              controller.close()
            },
          }),
        }
      },
      serveUi({
        path: './',
        files: {
          'index.html': `
            <!doctype html>
            <meta charset="utf-8">
            <script type="module">
              import {
                sendRequest as sendRequestBase,
                compose
              } from '/npm/passing-notes'
              import * as sse from '/index.js'

              const sendRequest = compose(
                sse.deserialize,
                () => sendRequestBase
              )

              const response = await sendRequest({ method: 'GET', url: '/events' })
              const reader = response.body.getReader()
              while (true) {
                const {done, value} = await reader.read()
                if (done) {
                  break
                }

                const element = document.createElement('div')
                element.textContent = value.data
                document.body.append(element)
              }

              reader.releaseLock()
            </script>
          `,
        },
        logger,
      }),
      () => () => ({status: 404}),
    ),
  )
  t.teardown(() => {
    stopServer(server)
  })

  const browser = await openChrome()
  t.teardown(() => {
    closeBrowser(browser)
  })

  const tab = await openTab(browser, 'http://localhost:10004')
  await findElement(tab, 'div', 'One!', {timeout: 5000})
  await findElement(tab, 'div', 'Two!', {timeout: 5000})

  t.pass()
})

test('tolerating multiple instances of the middleware', async (t) => {
  const server = await startServer(
    {port: 10_001},
    compose(sse.serialize, sse.serialize, () => () => ({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
      },
      body: new ReadableStream({
        async start(controller) {
          controller.enqueue({data: 'One!'})
          controller.enqueue({data: 'Two!'})
          controller.enqueue({data: 'Multiple\nLines'})
          controller.close()
        },
      }),
    })),
  )
  t.teardown(() => {
    stopServer(server)
  })

  const sendRequest = compose(sse.deserialize, () => sendRequestBase)

  const response = await sendRequest({
    method: 'GET',
    url: 'http://localhost:10001',
  })

  const events = []
  for await (const event of response.body) {
    events.push(event)
  }

  t.deepEqual(events, [
    {data: 'One!'},
    {data: 'Two!'},
    {data: 'Multiple\nLines'},
  ])
})

test('only processing objects, ignoring strings', async (t) => {
  const server = await startServer(
    {port: 10_002},
    compose(sse.serialize, () => () => ({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
      },
      body: new ReadableStream({
        async start(controller) {
          controller.enqueue('data: One!\n\n')
          controller.enqueue('data: Two!\n\n')
          controller.close()
        },
      }),
    })),
  )
  t.teardown(() => {
    stopServer(server)
  })

  const sendRequest = compose(sse.deserialize, () => sendRequestBase)

  const response = await sendRequest({
    method: 'GET',
    url: 'http://localhost:10002',
  })

  const events = []
  for await (const event of response.body) {
    events.push(event)
  }

  t.deepEqual(events, [{data: 'One!'}, {data: 'Two!'}])
})

test('also supporting Node.js streams', async (t) => {
  const server = await startServer(
    {port: 10_003},
    compose(sse.serialize, () => () => ({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
      },
      body: Readable.from([{data: 'One!'}, {data: 'Two!'}]),
    })),
  )
  t.teardown(() => {
    stopServer(server)
  })

  const sendRequest = compose(sse.deserialize, () => sendRequestBase)

  const response = await sendRequest({
    method: 'GET',
    url: 'http://localhost:10003',
  })

  const events = []
  for await (const event of response.body) {
    events.push(event)
  }

  t.deepEqual(events, [{data: 'One!'}, {data: 'Two!'}])
})
