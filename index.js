import {getHeader} from 'passing-notes'

export const serialize = (next) => async (request) => {
  const response = await next(request)

  return getHeader(response, 'Content-Type') === 'text/event-stream'
    ? {
        ...response,
        body: new ReadableStream({
          async start(controller) {
            for await (const event of response.body) {
              controller.enqueue(
                typeof event === 'string'
                  ? event
                  : Object.entries(event)
                      .flatMap(([field, value]) =>
                        field === 'data'
                          ? value.split('\n').map((line) => [field, line])
                          : [[field, value]],
                      )
                      .map(([field, value]) => `${field}: ${value}`)
                      .join('\n') + '\n\n',
              )
            }

            controller.close()
          },
        }),
      }
    : response
}

export const deserialize = (next) => async (request) => {
  const response = await next(request)

  return getHeader(response, 'Content-Type') === 'text/event-stream'
    ? {
        ...response,
        body: new ReadableStream({
          async start(controller) {
            let buffer = ''
            for await (const chunk of response.body) {
              buffer += chunk

              const matches = buffer.split('\n\n')
              if (matches.length === 1) {
                return
              }

              ;[buffer] = matches.splice(-1)

              for (const match of matches) {
                if (match.startsWith(':')) {
                  continue
                }

                const event = {}
                const fields = match.split('\n')
                for (const field of fields) {
                  const [name, value] = field.split(': ')
                  if (name === 'data' && event.data) {
                    event.data += `\n${value}`
                  } else {
                    event[name] = value ?? ''
                  }
                }

                controller.enqueue(event)
              }
            }

            controller.close()
          },
        }),
      }
    : response
}
