# Reference Prototyper

A one-page tool for trying looks for reference images. Pick keywords in up to eight style categories (all optional),
add your own description, and generate with OpenAI's image API.

- **Your key stays in your browser.** Each person pastes their own OpenAI API key under Settings. It's kept in that
  browser's local storage and sent only to `api.openai.com`; it's never in this repo.
  Use a separate project key with a monthly spending limit (platform.openai.com > Settings > Limits).
- **The page remembers you.** Your last keywords, text and options come back when you reopen it (localStorage).
- **Results stay in your browser too** (IndexedDB, which has room for the images; localStorage holds about 5 MB). Use **Download** on an image, or **Copy link**: the link carries
  the keywords and text, so the other person opens the same settings and can generate them.
- The image model defaults to `gpt-image-2.5-flare` and can be changed under Settings.

## Run locally

```
npm run serve      # then open http://localhost:8765
npm test           # unit tests (Node 20+)
```

## Publish on GitHub Pages

1. Create a repository on GitHub and push this folder to it.
2. In the repository: Settings > Pages > Build and deployment > Source: **Deploy from a branch**, branch `main`,
   folder `/ (root)`.
3. The site appears at `https://<user>.github.io/<repo>/` a minute later.

The keywords come from the "3D Style Elements Reference" sheet (ice tower examples).
