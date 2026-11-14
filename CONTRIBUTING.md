# Contributing

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Before you start

- **Small fix?** Open a pull request straight away.
- **New feature or a bigger change?** Open an issue first so we can agree on
  the shape before you spend time on it.
- **Security problem?** Do not open a public issue. See [SECURITY.md](SECURITY.md).

## Set up

No build step: the extension is plain JavaScript, HTML and CSS.

1. Fork and clone the repository.
2. Open `chrome://extensions`, turn on **Developer mode**, press
   **Load unpacked** and pick the `extension` folder.
3. After a change, press the reload icon on the extension's card, then reload
   the page you are testing on.

## Run the tests

```sh
npm install
npx playwright install chromium
npm test
```

The test drives the real extension in Chromium against the demo site in
`test/site/`. Screenshots land in `test/out/` (ignored by git). Every pull
request runs it on GitHub as well.

## What we look for in a pull request

- **One change per pull request**, with a short description of what it does
  and how you checked it. Add screenshots for anything you can see.
- **The tests pass**, and a new behaviour gets a check in `test/e2e.js`.
- **Privacy holds.** Guides never read what is typed into fields, never keep
  a query string, fragment or share code, and keep password and card fields
  painted out of pictures and clips. Nothing is sent anywhere unless the user
  added that service or place. A trimmed note sends only its kept part. A
  change that weakens any of these will not be merged.
- **Keys stay with their service.** A key typed in Settings is sent only to
  the service it belongs to, never logged and never put in a note.
- **No new permissions** unless there is no other way, explained in the pull
  request. Prefer optional permissions asked at the moment they are needed.
- **Talking to other systems has one home each.** Places to send to live in
  `extension/src/destinations.js`, transcript and write-up services in
  `extension/src/providers.js`. Add one there rather than a `fetch` elsewhere.
- **The formats are a contract.** A change to `orbit-note/1` or
  `step-guide/1` (see [docs/FORMAT.md](docs/FORMAT.md)) must stay backwards
  compatible, or bump the number and say so in [CHANGELOG.md](CHANGELOG.md).
- **Write-up prompts and templates** live in `extension/src/templates.js`. A new
  template needs a name, the kinds it is for, and its sections.

## Code style

- Plain ES5-style JavaScript, no dependencies, no build step. Keep it that way
  so anyone can read and load the source as is.
- Two-space indent, single quotes, semicolons (see `.editorconfig`).
- Comments explain *why*, not *what*.
- Words on screen are plain and in sentence case: "Write it up again", not
  "REGENERATE SUMMARY" or "Re-run AI pipeline".

## Releases

1. Update `version` in `extension/manifest.json` and `package.json`.
2. Add a section to [CHANGELOG.md](CHANGELOG.md).
3. Tag the commit `vX.Y.Z` and create a GitHub release with a zip of the
   extension (`cd extension && zip -r ../orbit-recorder.zip .`).

By contributing you agree that your contribution is licensed under the
[MIT License](LICENSE), and to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
