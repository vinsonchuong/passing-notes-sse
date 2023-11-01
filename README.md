# passing-notes-sse
[![npm](https://img.shields.io/npm/v/passing-notes-sse.svg)](https://www.npmjs.com/package/passing-notes-sse)
[![CI Status](https://github.com/vinsonchuong/passing-notes-sse/workflows/CI/badge.svg)](https://github.com/vinsonchuong/passing-notes-sse/actions?query=workflow%3ACI)

A middleware for sending and receiving
[server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events).

## Usage
Install [passing-notes-sse](https://www.npmjs.com/package/passing-notes-sse)
by running:

```sh
yarn add passing-notes-sse
```

This library provides a middleware that takes requests and responses with
header:

```text
Content-Type: text/event-stream
```

It serializes/deserializes between raw text event streams and
[async iterators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncIterator)
(or [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)s)
of event objects like so:

```javascript
import {setTimeout} from 'node:timers/promises'
import {compose} from 'passing-notes'
import * as sse from 'passing-notes-sse'

export default compose(
  sse.serialize,
  () => (request) => ({
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream'
    },
    body: new ReadableStream({
      async pull(controller) {
        await setTimeout(1000)
        controller.enqueue({ data: 'Hello World!' })
      }
    })
  })
)
```

```javascript
import {compose, sendRequest as sendRequestBase} from 'passing-notes'
import deserializeSse from 'passing-notes-sse'

const sendRequest = compose(
  sse.deserialize,
  () => sendRequest
)

const response = await sendRequest({
  method: 'GET',
  url: 'http://localhost:8080'
})

for await (const event of stream) {
  console.log(event)
  // { data: 'Hello World!' }
}
```
