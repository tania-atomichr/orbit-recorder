# Example receiver

A small backend that receives notes and guides from Orbit Recorder, checks
the token and the signature, keeps them as files, and shows them with the
embed. No dependencies; Node 18 or newer.

```sh
ORBIT_TOKEN=pick-a-token ORBIT_SECRET=pick-a-secret node server.js
```

In the extension, open **Settings → Where things go**, add **Webhook or your
own backend**, and fill in:

| Field | Value |
|---|---|
| Address | `http://localhost:8787/hooks/orbit` |
| Bearer token | the `ORBIT_TOKEN` you chose |
| Signing secret | the `ORBIT_SECRET` you chose |

Turn on **Send the recording file too** to receive the recording as well.
Then open <http://localhost:8787>.

What it shows you, to copy into your own app:

- **Two shapes of request.** JSON alone (`Content-Type: application/json`),
  or `multipart/form-data` with an `item` part (the same JSON) and a `media`
  part (the recording).
- **Checking the signature.** `X-Orbit-Signature: sha256=<hex>` is the
  HMAC-SHA256 of the JSON with your secret. Compare it in constant time.
- **Answering.** Any 2xx is success. A JSON answer with a `url` makes the
  note's page link to it ("Open it there"). Anything else is retried by the
  extension after 1, 2, 4 ... minutes; a 4xx other than 408 and 429 is not.
- **Showing it.** `<orbit-note src=".json" media=".webm">` and
  `<orbit-guide src=".json">` from `embed/orbit-embed.js`.

It is an example: it has no accounts, keeps files on disk, and listens on
localhost. Do not put it on the internet as it is.
